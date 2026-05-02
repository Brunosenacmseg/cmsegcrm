// Endpoint público (autenticado) que retorna o pixel_id da config Meta.
// Usado pelo componente <MetaPixel/> pra inicializar o fbq client-side.

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
export async function GET(_req: NextRequest) {
  const { data } = await supabaseAdmin().from('meta_config').select('pixel_id').eq('id', 1).maybeSingle()
  return NextResponse.json({ pixel_id: data?.pixel_id || null })
}
