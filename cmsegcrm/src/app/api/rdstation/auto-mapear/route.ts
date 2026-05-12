// Lista os pipelines do RD CRM e auto-mapeia funis.rd_id por nome.
// Pra rodar: POST /api/rdstation/auto-mapear (Authorization: Bearer <supabase session>)

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

function norm(s: string): string {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g,' ').trim()
}

export async function POST(req: NextRequest) {
  // Permitir tanto chamada autenticada do front quanto chamada via Bearer do cron
  const sa = admin()
  const { data: cfg } = await sa.from('rd_crm_config').select('api_token').eq('id', 1).maybeSingle()
  if (!cfg?.api_token) return NextResponse.json({ error: 'Token RD CRM não configurado' }, { status: 503 })

  // Busca pipelines do RD
  const r = await fetch(`https://crm.rdstation.com/api/v1/deal_pipelines?token=${encodeURIComponent(cfg.api_token)}`, {
    headers: { 'accept': 'application/json' },
  })
  if (!r.ok) {
    const txt = await r.text().catch(()=>'')
    return NextResponse.json({ error: `HTTP ${r.status}: ${txt.slice(0,200)}` }, { status: 502 })
  }
  const j: any = await r.json()
  const pipelines: any[] = Array.isArray(j) ? j : (j?.deal_pipelines || j?.data || [])

  // Mapeia por nome (case/acento-insensitive)
  const { data: funis } = await sa.from('funis').select('id, nome, rd_id').order('ordem')
  const updates: { funil_id: string; funil_nome: string; rd_id: string; rd_nome: string }[] = []
  for (const f of (funis || [])) {
    const match = pipelines.find(p => norm(p.name || p.nome) === norm(f.nome))
    if (match && match._id || match?.id) {
      const rdId = String(match._id || match.id)
      if (f.rd_id !== rdId) {
        await sa.from('funis').update({ rd_id: rdId }).eq('id', f.id)
        updates.push({ funil_id: f.id, funil_nome: f.nome, rd_id: rdId, rd_nome: match.name || match.nome })
      }
    }
  }

  return NextResponse.json({
    ok: true,
    pipelines_rd: pipelines.map(p => ({ id: p._id || p.id, nome: p.name || p.nome })),
    funis_cm: (funis || []).map(f => ({ id: f.id, nome: f.nome, rd_id: f.rd_id })),
    atualizados: updates,
  })
}

export async function GET(req: NextRequest) {
  return POST(req)
}
