// Relatorio semanal de produtividade.
// Cada lider recebe por email a produtividade dos membros da equipe dele.
// Admin recebe cópia (CC).
// Cron: segunda-feira 8h.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { decryptSecret } from '@/lib/email-crypto'
import { enviarEmail } from '@/lib/email-smtp'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function admin(): any {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

const fmtBRL = (n: number) => 'R$ ' + Number(n||0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

async function statsDoUser(sa: any, userId: string, desde: string) {
  const [
    { count: emAndamento },
    { count: ganhos },
    { count: perdidos },
    { data: premioGanhos },
  ] = await Promise.all([
    sa.from('negocios').select('id', { count: 'exact', head: true }).eq('vendedor_id', userId).eq('status', 'em_andamento'),
    sa.from('negocios').select('id', { count: 'exact', head: true }).eq('vendedor_id', userId).eq('status', 'ganho').gte('data_fechamento', desde),
    sa.from('negocios').select('id', { count: 'exact', head: true }).eq('vendedor_id', userId).eq('status', 'perdido').gte('data_fechamento', desde),
    sa.from('negocios').select('premio').eq('vendedor_id', userId).eq('status', 'ganho').gte('data_fechamento', desde),
  ])
  const premio = ((premioGanhos || []) as any[]).reduce((s, n) => s + Number(n.premio || 0), 0)
  const total = (ganhos || 0) + (perdidos || 0)
  const conversao = total ? ((ganhos || 0) / total * 100).toFixed(1) : '0'
  const ticket = (ganhos || 0) ? premio / (ganhos || 1) : 0
  return {
    emAndamento: emAndamento || 0,
    ganhos: ganhos || 0,
    perdidos: perdidos || 0,
    premio,
    conversao,
    ticket,
  }
}

export async function GET(_req: NextRequest) {
  const sa = admin()
  const desde = new Date(Date.now() - 7*24*60*60*1000).toISOString()
  const semana = new Date(Date.now() - 7*24*60*60*1000).toLocaleDateString('pt-BR') + ' → ' + new Date().toLocaleDateString('pt-BR')

  // Admin (destinatário CC)
  const { data: admins } = await sa.from('users').select('id, nome, email').eq('role', 'admin').is('deleted_at', null)
  const adminEmail = (admins || [])[0]?.email
  const adminUser = (admins || [])[0]

  // SMTP do admin (Bruno) — todos os emails saem por aqui
  let smtp: any = null
  let fromEmail = ''
  let fromNome = 'CM CRM'
  if (adminUser?.id) {
    const { data: ec } = await sa.from('email_contas').select('*').eq('user_id', adminUser.id).eq('ativo', true).maybeSingle()
    if (ec) {
      const pass = (ec as any).smtp_pass_enc ? decryptSecret((ec as any).smtp_pass_enc) : ''
      smtp = { host: (ec as any).smtp_host, port: (ec as any).smtp_port, secure: !!(ec as any).smtp_secure, user: (ec as any).smtp_user, pass }
      fromEmail = (ec as any).from_email
      fromNome = (ec as any).from_nome || fromNome
    }
  }
  if (!smtp) return NextResponse.json({ ok: false, erro: 'SMTP admin não configurado' }, { status: 500 })

  // Líderes ativos
  const { data: lideres } = await sa.from('users').select('id, nome, email').eq('role', 'lider').is('deleted_at', null)
  const enviados: Array<{ lider: string; membros: number; status: string }> = []

  // Função pra gerar tabela HTML
  function tabela(rows: Array<{ nome: string; s: any }>): string {
    const cellBase = 'padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:13px;'
    return `
<table style="width:100%;border-collapse:collapse;font-family:Arial,sans-serif;margin:14px 0;">
  <thead>
    <tr style="background:#f1f5f9;text-align:left;">
      <th style="${cellBase}font-weight:700;">Vendedor</th>
      <th style="${cellBase}font-weight:700;text-align:right;">Em andamento</th>
      <th style="${cellBase}font-weight:700;text-align:right;">Ganhos</th>
      <th style="${cellBase}font-weight:700;text-align:right;">Perdidos</th>
      <th style="${cellBase}font-weight:700;text-align:right;">Conversão</th>
      <th style="${cellBase}font-weight:700;text-align:right;">Prêmio</th>
      <th style="${cellBase}font-weight:700;text-align:right;">Ticket médio</th>
    </tr>
  </thead>
  <tbody>
    ${rows.length === 0 ? `<tr><td colspan="7" style="${cellBase}color:#64748b;text-align:center;">Sem dados</td></tr>` :
      rows.map(r => `
        <tr>
          <td style="${cellBase}">${r.nome}</td>
          <td style="${cellBase}text-align:right;">${r.s.emAndamento}</td>
          <td style="${cellBase}text-align:right;color:#0f9d58;">${r.s.ganhos}</td>
          <td style="${cellBase}text-align:right;color:#d23f31;">${r.s.perdidos}</td>
          <td style="${cellBase}text-align:right;">${r.s.conversao}%</td>
          <td style="${cellBase}text-align:right;font-weight:600;">${fmtBRL(r.s.premio)}</td>
          <td style="${cellBase}text-align:right;">${fmtBRL(r.s.ticket)}</td>
        </tr>`).join('')}
  </tbody>
</table>`
  }

  // Para cada líder, encontra os membros da equipe dele
  for (const lider of (lideres || []) as any[]) {
    if (!lider.email) { enviados.push({ lider: lider.nome, membros: 0, status: 'sem email' }); continue }
    const { data: equipes } = await sa.from('equipes').select('id').eq('lider_id', lider.id)
    const equipeIds = ((equipes || []) as any[]).map(e => e.id)
    let membros: any[] = []
    if (equipeIds.length) {
      const { data: ms } = await sa.from('equipe_membros').select('user_id, users!inner(id, nome, deleted_at)').in('equipe_id', equipeIds)
      membros = ((ms || []) as any[]).filter(m => !m.users?.deleted_at).map(m => m.users)
    }
    // Inclui o próprio líder
    if (!membros.some(m => m.id === lider.id)) membros.unshift({ id: lider.id, nome: lider.nome })

    const rows: any[] = []
    for (const m of membros) rows.push({ nome: m.nome, s: await statsDoUser(sa, m.id, desde) })
    rows.sort((a, b) => b.s.premio - a.s.premio)

    const totais = rows.reduce((acc, r) => ({
      em: acc.em + r.s.emAndamento,
      ganhos: acc.ganhos + r.s.ganhos,
      perdidos: acc.perdidos + r.s.perdidos,
      premio: acc.premio + r.s.premio,
    }), { em: 0, ganhos: 0, perdidos: 0, premio: 0 })
    const convTot = (totais.ganhos + totais.perdidos) ? ((totais.ganhos / (totais.ganhos + totais.perdidos)) * 100).toFixed(1) : '0'

    const html = `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;color:#0f172a;max-width:780px;margin:0 auto;padding:20px;">
<h2 style="margin-top:0;">📊 Relatório semanal de produtividade</h2>
<p>Olá ${lider.nome},</p>
<p>Resumo da sua equipe na última semana — <strong>${semana}</strong>:</p>
<div style="display:flex;gap:10px;flex-wrap:wrap;margin:14px 0;">
  <div style="background:#f8fafc;padding:10px 14px;border-radius:8px;border:1px solid #e5e7eb;flex:1;min-width:120px;">
    <div style="font-size:11px;color:#64748b;text-transform:uppercase;">Em andamento</div>
    <div style="font-size:20px;font-weight:700;">${totais.em}</div>
  </div>
  <div style="background:#f8fafc;padding:10px 14px;border-radius:8px;border:1px solid #e5e7eb;flex:1;min-width:120px;">
    <div style="font-size:11px;color:#64748b;text-transform:uppercase;">Ganhos</div>
    <div style="font-size:20px;font-weight:700;color:#0f9d58;">${totais.ganhos}</div>
  </div>
  <div style="background:#f8fafc;padding:10px 14px;border-radius:8px;border:1px solid #e5e7eb;flex:1;min-width:120px;">
    <div style="font-size:11px;color:#64748b;text-transform:uppercase;">Perdidos</div>
    <div style="font-size:20px;font-weight:700;color:#d23f31;">${totais.perdidos}</div>
  </div>
  <div style="background:#f8fafc;padding:10px 14px;border-radius:8px;border:1px solid #e5e7eb;flex:1;min-width:120px;">
    <div style="font-size:11px;color:#64748b;text-transform:uppercase;">Conversão</div>
    <div style="font-size:20px;font-weight:700;">${convTot}%</div>
  </div>
  <div style="background:#f8fafc;padding:10px 14px;border-radius:8px;border:1px solid #e5e7eb;flex:1;min-width:160px;">
    <div style="font-size:11px;color:#64748b;text-transform:uppercase;">Prêmio total</div>
    <div style="font-size:20px;font-weight:700;color:#c9a84c;">${fmtBRL(totais.premio)}</div>
  </div>
</div>
${tabela(rows)}
<p style="font-size:11px;color:#64748b;margin-top:24px;">CM Seguros · gerado automaticamente</p>
</body></html>`

    try {
      const res = await enviarEmail({
        smtp, from: { email: fromEmail, nome: fromNome },
        para: lider.email,
        cc: adminEmail && adminEmail !== lider.email ? adminEmail : undefined,
        assunto: `📊 Produtividade semanal · ${lider.nome} · ${semana}`,
        html,
        texto: `Relatório semanal de produtividade — ${semana}\n\nMembros: ${rows.length}\nGanhos: ${totais.ganhos} | Perdidos: ${totais.perdidos} | Prêmio: ${fmtBRL(totais.premio)}`,
      })
      enviados.push({ lider: lider.nome, membros: rows.length, status: (res as any).ok ? 'enviado' : `erro: ${(res as any).erro}` })
    } catch (e: any) {
      enviados.push({ lider: lider.nome, membros: rows.length, status: `erro: ${e?.message || e}` })
    }
  }

  return NextResponse.json({ ok: true, semana, enviados })
}
