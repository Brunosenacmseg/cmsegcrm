import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Endpoint admin: dispara o webhook de RD localmente com um deal fictício,
// usando o RDSTATION_WEBHOOK_SECRET configurado no servidor — assim o admin
// confirma que o pipeline RD → CMSEGCRM está funcionando sem precisar colar
// o secret manualmente.
export async function POST(request: NextRequest) {
  // Auth: só admin
  const auth = request.headers.get('authorization') || ''
  const token = auth.replace(/^Bearer\s+/i, '').trim()
  if (!token) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const supabaseAdmin = getAdmin()
  const { data: userData } = await supabaseAdmin.auth.getUser(token)
  if (!userData?.user) return NextResponse.json({ error: 'Sessão inválida' }, { status: 401 })
  const { data: u } = await supabaseAdmin.from('users').select('role').eq('id', userData.user.id).single()
  if (u?.role !== 'admin') return NextResponse.json({ error: 'Apenas admin' }, { status: 403 })

  const secret = process.env.RDSTATION_WEBHOOK_SECRET
  if (!secret) {
    return NextResponse.json({
      ok: false,
      error: 'RDSTATION_WEBHOOK_SECRET não configurado no servidor',
    }, { status: 500 })
  }

  // Monta payload fictício de um deal_updated
  const rdId = `teste-webhook-${Date.now()}`
  const payload = {
    event_name: 'deal_updated',
    deal: {
      _id: rdId,
      name: 'Teste de webhook (CMSEGCRM)',
      deal_stage: { name: 'Em contato' },
      amount_total: 1234.56,
      contacts: [{
        _id: `contato-teste-${Date.now()}`,
        name: 'Contato Teste Webhook',
      }],
    },
  }

  // Chama o próprio webhook via HTTP interno
  const origin = request.nextUrl.origin
  const r = await fetch(`${origin}/api/rdstation/webhook?secret=${encodeURIComponent(secret)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  const txt = await r.text()
  let respWebhook: any
  try { respWebhook = JSON.parse(txt) } catch { respWebhook = { raw: txt.slice(0, 200) } }

  // Aguarda um pouquinho pro processamento assíncrono terminar
  await new Promise(res => setTimeout(res, 1500))

  // Confere se o negócio caiu no banco
  const { data: neg } = await supabaseAdmin
    .from('negocios')
    .select('id, titulo, etapa, premio, rd_id, created_at')
    .eq('rd_id', rdId)
    .maybeSingle()

  // Pega o último log do webhook
  const { data: log } = await supabaseAdmin
    .from('rdstation_syncs')
    .select('recurso, status, qtd_criados, qtd_atualizados, qtd_erros, erros, iniciado_em, concluido_em')
    .like('recurso', 'webhook:%')
    .order('iniciado_em', { ascending: false })
    .limit(1)
    .maybeSingle()

  // Limpa o teste
  if (neg?.id) {
    await supabaseAdmin.from('negocios').delete().eq('id', neg.id)
    await supabaseAdmin.from('clientes').delete().eq('rd_id', payload.deal.contacts[0]._id)
  }

  const sucesso = r.ok && respWebhook?.ok && !!neg
  return NextResponse.json({
    ok: sucesso,
    httpStatus: r.status,
    webhookResponse: respWebhook,
    negocioCriado: !!neg,
    negocio: neg ? { titulo: neg.titulo, etapa: neg.etapa, rd_id: neg.rd_id } : null,
    ultimoLog: log,
    diagnostico: sucesso
      ? '✅ Webhook funcionando: payload aceito, deal aplicado, negocio gravado e removido (era de teste).'
      : !r.ok
        ? `❌ Webhook respondeu HTTP ${r.status}: ${respWebhook?.error || 'erro'}`
        : !neg
          ? '⚠ Webhook aceitou mas o negocio não chegou no banco. Veja "ultimoLog" pra detalhes.'
          : '⚠ Status indeterminado.',
  })
}
