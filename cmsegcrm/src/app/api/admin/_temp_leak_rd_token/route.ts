// TEMP: endpoint pra recuperar tokens de env vars sem precisar abrir o painel
// da Vercel. Restrito a admin via session SSR. **REMOVER APÓS USO.**

import { NextResponse } from 'next/server'
import { createClient as createSSRClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function mascarar(v: string | undefined | null): string {
  if (!v) return '(não definido)'
  if (v.length <= 8) return '***'
  return `${v.slice(0, 4)}…${v.slice(-4)} (len=${v.length})`
}

export async function GET() {
  const ssr = createSSRClient()
  const { data: userData } = await ssr.auth.getUser()
  if (!userData?.user) {
    return NextResponse.json({ error: 'Faça login no dashboard antes de abrir esta URL' }, { status: 401 })
  }

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data: u } = await admin.from('users').select('role').eq('id', userData.user.id).single()
  if ((u as any)?.role !== 'admin') {
    return NextResponse.json({ error: 'Apenas admin' }, { status: 403 })
  }

  return NextResponse.json({
    aviso: 'ENDPOINT TEMPORÁRIO. Será removido após uso.',
    user: userData.user.email,
    tokens: {
      RDSTATION_CRM_TOKEN: process.env.RDSTATION_CRM_TOKEN || null,
      RDSTATION_WEBHOOK_SECRET: mascarar(process.env.RDSTATION_WEBHOOK_SECRET),
    },
  })
}
