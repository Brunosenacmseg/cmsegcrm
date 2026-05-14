// Auditoria automatica das conversas WhatsApp.
// Roda via Vercel cron a cada 2 dias e cria notificacoes pros admins/gestao.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { decryptSecret } from '@/lib/email-crypto'
import { enviarEmail } from '@/lib/email-smtp'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function admin(): any {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function GET(_req: NextRequest) {
  const sa = admin()

  // 1) Volume + taxa de resposta por corretor (14d)
  const { data: stats } = await sa.rpc('exec_sql' as any, { sql: '' }).then(() => ({ data: null })).catch(() => ({ data: null }))
  // Como nao temos RPC, fazemos queries diretas
  const desde14 = new Date(Date.now() - 14*24*60*60*1000).toISOString()

  const { data: instancias } = await sa.from('whatsapp_instancias').select('id, nome, user_id, status')

  const stats_corretor: any[] = []
  const aguardando: any[] = []
  const inadequados: any[] = []

  for (const i of (instancias || []) as any[]) {
    // recebidas e enviadas
    const { count: recebidas } = await sa.from('whatsapp_mensagens')
      .select('id', { count: 'exact', head: true })
      .eq('instancia_id', i.id).eq('direcao', 'recebida')
      .gte('created_at', desde14)
    const { count: enviadas } = await sa.from('whatsapp_mensagens')
      .select('id', { count: 'exact', head: true })
      .eq('instancia_id', i.id).eq('direcao', 'enviada')
      .gte('created_at', desde14)
    if ((recebidas || 0) === 0 && (enviadas || 0) === 0) continue
    stats_corretor.push({ nome: i.nome, recebidas: recebidas || 0, enviadas: enviadas || 0, status: i.status })
  }

  // 2) Conversas aguardando (ultima msg recebida ha mais de 24h)
  const { data: ultimasMsgs } = await sa.from('whatsapp_mensagens')
    .select('instancia_id, remoto_jid, remoto_nome, conteudo, direcao, created_at')
    .gte('created_at', desde14)
    .order('created_at', { ascending: false })
    .limit(5000)
  const ultimaPorConv = new Map<string, any>()
  for (const m of (ultimasMsgs || []) as any[]) {
    const k = `${m.instancia_id}::${m.remoto_jid}`
    if (!ultimaPorConv.has(k)) ultimaPorConv.set(k, m)
  }
  for (const m of ultimaPorConv.values()) {
    if (m.direcao !== 'recebida') continue
    const ageMin = (Date.now() - new Date(m.created_at).getTime()) / 60000
    if (ageMin >= 24 * 60) {
      const inst = (instancias || []).find((x: any) => x.id === m.instancia_id)
      aguardando.push({
        corretor: inst?.nome,
        cliente: m.remoto_nome || '(sem nome)',
        conteudo: String(m.conteudo || '').slice(0, 140),
        aguardando_horas: Math.round(ageMin / 60),
      })
    }
  }
  aguardando.sort((a, b) => b.aguardando_horas - a.aguardando_horas)

  // 3) Conteudo inadequado
  const { data: badMsgs } = await sa.from('whatsapp_mensagens')
    .select('instancia_id, direcao, remoto_nome, conteudo, created_at')
    .gte('created_at', desde14)
    .or('conteudo.ilike.%porra%,conteudo.ilike.%merda%,conteudo.ilike.%caralho%,conteudo.ilike.%foda%,conteudo.ilike.%idiota%,conteudo.ilike.%escroto%,conteudo.ilike.%fdp%,conteudo.ilike.%vagabundo%,conteudo.ilike.%pqp%')
    .order('created_at', { ascending: false })
    .limit(30)
  for (const m of (badMsgs || []) as any[]) {
    const inst = (instancias || []).find((x: any) => x.id === m.instancia_id)
    inadequados.push({
      corretor: inst?.nome,
      direcao: m.direcao,
      contato: m.remoto_nome,
      conteudo: String(m.conteudo || '').slice(0, 200),
      created_at: m.created_at,
    })
  }

  // 4) Monta texto do relatorio
  const linhas: string[] = []
  linhas.push('📊 RELATÓRIO WHATSAPP (últimos 14 dias)')
  linhas.push('')
  linhas.push('📈 Por corretor:')
  for (const s of stats_corretor.sort((a, b) => b.recebidas - a.recebidas)) {
    const taxa = s.recebidas ? Math.round((s.enviadas / s.recebidas) * 100) : 0
    linhas.push(`• ${s.nome}: ${s.recebidas} recebidas, ${s.enviadas} enviadas (${taxa}% resposta) — ${s.status}`)
  }
  linhas.push('')
  linhas.push(`⏰ Conversas aguardando >24h: ${aguardando.length}`)
  for (const a of aguardando.slice(0, 10)) {
    linhas.push(`• ${a.corretor} · ${a.cliente} (${a.aguardando_horas}h): "${a.conteudo}"`)
  }
  if (inadequados.length) {
    linhas.push('')
    linhas.push(`🚨 Conteúdo inadequado detectado: ${inadequados.length}`)
    for (const i of inadequados.slice(0, 10)) {
      linhas.push(`• ${i.corretor} [${i.direcao}] ${i.contato}: "${i.conteudo}"`)
    }
  }
  const texto = linhas.join('\n')

  // 5) Cria notificacao APENAS para admins
  const { data: admins } = await sa.from('users')
    .select('id, email, nome').eq('role', 'admin').is('deleted_at', null)
  const adminIds = (admins || []).map((u: any) => u.id)

  if (adminIds.length) {
    await sa.from('notificacoes').insert(
      adminIds.map((uid: string) => ({
        user_id: uid,
        tipo: 'sistema',
        titulo: '📊 Auditoria WhatsApp · ' + new Date().toLocaleDateString('pt-BR'),
        descricao: texto,
        link: '/dashboard/whatsapp',
      }))
    )
  }

  // 6) Envia email para cada admin que tenha uma conta SMTP ativa.
  // Usa a propria SMTP do destinatario quando disponivel; senao, pula.
  const html = `<pre style="font-family:Consolas,monospace;font-size:12px;line-height:1.5;background:#f8fafc;padding:16px;border:1px solid #e5e7eb;border-radius:8px;white-space:pre-wrap;">${
    texto.replace(/[&<>]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;' } as any)[c])
  }</pre>`
  let emailsEnviados = 0
  const emailErros: string[] = []
  for (const adm of (admins || []) as any[]) {
    if (!adm.email) continue
    const { data: ec } = await sa.from('email_contas')
      .select('*').eq('user_id', adm.id).eq('ativo', true).maybeSingle()
    if (!ec) continue
    try {
      const pass = (ec as any).smtp_pass_enc ? decryptSecret((ec as any).smtp_pass_enc) : ''
      const res = await enviarEmail({
        smtp: { host: (ec as any).smtp_host, port: (ec as any).smtp_port, secure: !!(ec as any).smtp_secure, user: (ec as any).smtp_user, pass },
        from: { email: (ec as any).from_email, nome: (ec as any).from_nome || 'CM CRM' },
        para: adm.email,
        assunto: '📊 Auditoria WhatsApp · ' + new Date().toLocaleDateString('pt-BR'),
        html,
        texto,
      })
      if ((res as any).ok) emailsEnviados++
      else emailErros.push(`${adm.email}: ${(res as any).erro}`)
    } catch (e: any) {
      emailErros.push(`${adm.email}: ${e?.message || e}`)
    }
  }

  return NextResponse.json({
    ok: true,
    notificados: adminIds.length,
    emails_enviados: emailsEnviados,
    email_erros: emailErros,
    stats_corretor,
    aguardando: aguardando.slice(0, 20),
    inadequados: inadequados.slice(0, 20),
  })
}
