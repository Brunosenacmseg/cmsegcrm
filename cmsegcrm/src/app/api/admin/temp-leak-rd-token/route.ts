// TEMP: endpoint pra recuperar tokens de env vars sem precisar abrir o painel
// da Vercel. Restrito a admin via Bearer JWT do Supabase. **REMOVER APÓS USO.**

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function mascarar(v: string | undefined | null): string {
  if (!v) return '(não definido)'
  if (v.length <= 8) return '***'
  return `${v.slice(0, 4)}…${v.slice(-4)} (len=${v.length})`
}

let _sa: ReturnType<typeof createClient> | null = null
function admin() {
  if (!_sa) _sa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  return _sa
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') || ''
  const token = auth.replace(/^Bearer\s+/i, '').trim()
  if (!token) return NextResponse.json({ error: 'Header Authorization: Bearer <jwt> obrigatório (use a página /dashboard/temp-leak-token)' }, { status: 401 })

  const { data: u } = await admin().auth.getUser(token)
  if (!u?.user) return NextResponse.json({ error: 'JWT inválido' }, { status: 401 })

  const { data: prof } = await admin().from('users').select('role').eq('id', u.user.id).single()
  if ((prof as any)?.role !== 'admin') return NextResponse.json({ error: 'Apenas admin' }, { status: 403 })

  return NextResponse.json({
    aviso: 'ENDPOINT TEMPORÁRIO — será removido após uso.',
    user: u.user.email,
    tokens: {
      RDSTATION_CRM_TOKEN: process.env.RDSTATION_CRM_TOKEN || null,
      RDSTATION_WEBHOOK_SECRET: mascarar(process.env.RDSTATION_WEBHOOK_SECRET),
    },
  })
}
