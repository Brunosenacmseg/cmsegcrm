// Lista falhas recentes da sincronização CRM ↔ RD Station, enriquecidas
// com nome/etapa do negócio quando o log carrega o ID no campo `recurso`
// (formato `push:<acao>:<negocio_id>` ou `webhook:<evento>`).

import { NextRequest, NextResponse } from 'next/server'
import { createClient, SupabaseClient } from '@supabase/supabase-js'

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

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

function parseRecurso(recurso: string): { tipo: 'push'|'webhook'|'sync'; acao: string; negocio_id: string | null } {
  // push:mover:<uuid>  | push:ganho:<uuid> | webhook:deal_updated | <action>
  const partes = recurso.split(':')
  if (partes[0] === 'push') {
    return { tipo: 'push', acao: partes[1] || 'desconhecida', negocio_id: partes[2] || null }
  }
  if (partes[0] === 'webhook') {
    return { tipo: 'webhook', acao: partes[1] || 'evento', negocio_id: null }
  }
  // sync direto (ex: 'negocios 2024-01-01→2024-01-31')
  return { tipo: 'sync', acao: recurso, negocio_id: null }
}

export async function GET(request: NextRequest) {
  const limit = Number(request.nextUrl.searchParams.get('limit') || 30)

  // Pega só status erro/parcial das últimas 200 (recentes primeiro)
  const { data: rows } = await supabaseAdmin()
    .from('rdstation_syncs')
    .select('id, recurso, status, qtd_erros, erros, iniciado_em, concluido_em')
    .in('status', ['erro', 'parcial'])
    .order('iniciado_em', { ascending: false })
    .limit(Math.max(1, Math.min(limit, 100)))

  const list = rows || []
  const negocioIds = Array.from(new Set(list.map(r => parseRecurso(r.recurso).negocio_id).filter(Boolean) as string[]))

  // Enriquece com negocio + funil quando der pra extrair o id
  let negocios: Record<string, any> = {}
  if (negocioIds.length) {
    const { data } = await supabaseAdmin()
      .from('negocios')
      .select('id, titulo, etapa, status, rd_id, funis(nome, rd_id)')
      .in('id', negocioIds)
    for (const n of data || []) negocios[n.id] = n
  }

  const falhas = list.map(r => {
    const meta = parseRecurso(r.recurso)
    const neg = meta.negocio_id ? negocios[meta.negocio_id] : null
    return {
      id: r.id,
      iniciado_em: r.iniciado_em,
      concluido_em: r.concluido_em,
      tipo: meta.tipo,                  // 'push' (CRM→RD) ou 'webhook' (RD→CRM) ou 'sync'
      acao: meta.acao,                  // criar/mover/ganho/perdido/reabrir/deal_updated/...
      status: r.status,
      mensagem: (r.erros && r.erros[0]) || 'Sem detalhe',
      negocio_id: meta.negocio_id,
      negocio: neg ? {
        titulo: neg.titulo,
        etapa: neg.etapa,
        status: neg.status,
        rd_id: neg.rd_id,
        funil_nome: neg.funis?.nome || null,
        funil_rd_id: neg.funis?.rd_id || null,
      } : null,
    }
  })

  return NextResponse.json({ falhas })
}
