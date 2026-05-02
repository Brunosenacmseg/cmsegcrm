// ═════════════════════════════════════════════════════════════
// Push CRM → RD Station: empurra mudanças locais (criar/mover/
// ganho/perdido/reabrir) para o RD Station CRM. Sempre loga em
// rdstation_syncs com status=erro+contexto quando algo falha,
// pra aparecer no painel de "Falhas RD" do dashboard.
//
// Fire-and-forget do front: chamar DEPOIS do update local. Falha
// não reverte estado local — só vira alerta pra correção manual.
// ═════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import {
  criarDealRD, moverDealEtapaRD, marcarDealGanhoRD,
  marcarDealPerdidoRD, reabrirDealRD, buscarStageIdPorNome,
  rdId,
} from '@/lib/rdstation'

export const dynamic = 'force-dynamic'

let _supabaseAdmin: SupabaseClient | null = null
function supabaseAdmin() {
  if (!_supabaseAdmin) {
    _supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
  }
  return _supabaseAdmin
}

type Acao = 'criar' | 'mover' | 'ganho' | 'perdido' | 'reabrir'

async function logErro(recurso: string, msg: string) {
  try {
    await supabaseAdmin().from('rdstation_syncs').insert({
      recurso,
      status: 'erro',
      qtd_lidos: 1,
      qtd_erros: 1,
      erros: [msg.slice(0, 240)],
      concluido_em: new Date().toISOString(),
    })
  } catch { /* não-fatal */ }
}

async function logSucesso(recurso: string, action: 'created'|'updated') {
  try {
    await supabaseAdmin().from('rdstation_syncs').insert({
      recurso,
      status: 'concluido',
      qtd_lidos: 1,
      qtd_criados: action === 'created' ? 1 : 0,
      qtd_atualizados: action === 'updated' ? 1 : 0,
      concluido_em: new Date().toISOString(),
    })
  } catch {}
}

export async function POST(request: NextRequest) {
  let body: any = {}
  try { body = await request.json() } catch {}
  const acao: Acao | undefined = body?.acao
  const negocioId: string | undefined = body?.negocio_id

  if (!acao || !negocioId) {
    return NextResponse.json({ error: 'acao e negocio_id obrigatórios' }, { status: 400 })
  }

  const token = process.env.RDSTATION_CRM_TOKEN
  if (!token) {
    await logErro(`push:${acao}:${negocioId}`, 'RDSTATION_CRM_TOKEN não configurado no servidor')
    return NextResponse.json({ error: 'RDSTATION_CRM_TOKEN não configurado' }, { status: 500 })
  }

  // Carrega negocio + funil pra ter contexto
  const { data: neg } = await supabaseAdmin()
    .from('negocios')
    .select('id, rd_id, titulo, etapa, premio, vencimento, motivo_perda_id, cliente_id, vendedor_id, funil_id, funis(rd_id, nome, etapas)')
    .eq('id', negocioId)
    .maybeSingle()

  if (!neg) {
    await logErro(`push:${acao}:${negocioId}`, 'Negócio não encontrado no banco local')
    return NextResponse.json({ error: 'Negócio não encontrado' }, { status: 404 })
  }

  const funil: any = neg.funis as any
  const titulo = neg.titulo || `Negócio ${negocioId.slice(0, 8)}`
  const recurso = `push:${acao}:${negocioId}`

  // Se o funil local não está mapeado pra RD, não dá pra criar/mover lá.
  // Mas ganho/perdido/reabrir só precisam do rd_id do deal (PUT direto).
  if ((acao === 'criar' || acao === 'mover') && !funil?.rd_id) {
    const msg = `Funil "${funil?.nome || neg.funil_id}" não está mapeado para um pipeline da RD (rd_id ausente). Rode Sync de Funis primeiro.`
    await logErro(recurso, `${titulo}: ${msg}`)
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  try {
    // ─── CRIAR ─────────────────────────────────────────────────
    if (acao === 'criar') {
      if (neg.rd_id) {
        // Já existe na RD — não duplica. Trata como noop.
        return NextResponse.json({ ok: true, action: 'noop', motivo: 'já tem rd_id' })
      }

      // Resolver stage_id da etapa atual no pipeline da RD
      const etapaAtual = neg.etapa || funil?.etapas?.[0] || ''
      const { stageId, etapasRd } = await buscarStageIdPorNome(funil.rd_id, etapaAtual, token)
      if (!stageId) {
        const msg = `Etapa "${etapaAtual}" não existe no pipeline RD "${funil.nome}". Etapas RD: [${etapasRd.join(', ')}]. Renomeie no RD ou no CRM pra baterem.`
        await logErro(recurso, `${titulo}: ${msg}`)
        return NextResponse.json({ error: msg }, { status: 400 })
      }

      // Carrega cliente pra mandar como contact (se tiver rd_id)
      let contacts: any[] | undefined
      if (neg.cliente_id) {
        const { data: cli } = await supabaseAdmin()
          .from('clientes').select('rd_id, nome, email, telefone').eq('id', neg.cliente_id).maybeSingle()
        if (cli?.rd_id) contacts = [{ id: cli.rd_id }]
        else if (cli?.nome) contacts = [{ name: cli.nome }]
      }

      // Vendedor (user_id na RD)
      let userIdRd: string | undefined
      if (neg.vendedor_id) {
        const { data: u } = await supabaseAdmin().from('users').select('rd_id').eq('id', neg.vendedor_id).maybeSingle()
        if (u?.rd_id) userIdRd = u.rd_id
      }

      const criado = await criarDealRD({
        name: titulo,
        deal_stage_id: stageId,
        deal_pipeline_id: funil.rd_id,
        user_id: userIdRd,
        contacts,
        amount_total: neg.premio ? Number(neg.premio) : undefined,
        prediction_date: neg.vencimento || undefined,
      }, token)

      const novoRdId = rdId(criado)
      if (novoRdId) {
        await supabaseAdmin().from('negocios').update({ rd_id: novoRdId }).eq('id', negocioId)
      }
      await logSucesso(recurso, 'created')
      return NextResponse.json({ ok: true, action: 'created', rd_id: novoRdId })
    }

    // Para mover/ganho/perdido/reabrir precisamos do rd_id do deal
    if (!neg.rd_id) {
      const msg = 'Negócio sem rd_id — não foi criado/sincronizado com RD ainda. Crie no RD primeiro ou rode Sync de Negócios.'
      await logErro(recurso, `${titulo}: ${msg}`)
      return NextResponse.json({ error: msg }, { status: 400 })
    }

    // ─── MOVER ─────────────────────────────────────────────────
    if (acao === 'mover') {
      const { stageId, etapasRd } = await buscarStageIdPorNome(funil.rd_id, neg.etapa || '', token)
      if (!stageId) {
        const msg = `Etapa "${neg.etapa}" não existe no pipeline RD "${funil.nome}". Etapas RD: [${etapasRd.join(', ')}].`
        await logErro(recurso, `${titulo}: ${msg}`)
        return NextResponse.json({ error: msg }, { status: 400 })
      }
      await moverDealEtapaRD(neg.rd_id, stageId, token)
      await logSucesso(recurso, 'updated')
      return NextResponse.json({ ok: true, action: 'updated' })
    }

    // ─── GANHO ─────────────────────────────────────────────────
    if (acao === 'ganho') {
      await marcarDealGanhoRD(neg.rd_id, token)
      await logSucesso(recurso, 'updated')
      return NextResponse.json({ ok: true, action: 'updated' })
    }

    // ─── PERDIDO ───────────────────────────────────────────────
    if (acao === 'perdido') {
      let motivoRdId: string | undefined
      if (neg.motivo_perda_id) {
        const { data: m } = await supabaseAdmin().from('motivos_perda').select('rd_id').eq('id', neg.motivo_perda_id).maybeSingle()
        if (m?.rd_id) motivoRdId = m.rd_id
      }
      await marcarDealPerdidoRD(neg.rd_id, motivoRdId, token)
      await logSucesso(recurso, 'updated')
      return NextResponse.json({ ok: true, action: 'updated' })
    }

    // ─── REABRIR (volta pra em_andamento) ──────────────────────
    if (acao === 'reabrir') {
      await reabrirDealRD(neg.rd_id, token)
      await logSucesso(recurso, 'updated')
      return NextResponse.json({ ok: true, action: 'updated' })
    }

    await logErro(recurso, `${titulo}: ação inválida "${acao}"`)
    return NextResponse.json({ error: 'ação inválida' }, { status: 400 })
  } catch (err: any) {
    const msg = err?.message?.slice(0, 240) || 'erro desconhecido'
    await logErro(recurso, `${titulo}: ${msg}`)
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
