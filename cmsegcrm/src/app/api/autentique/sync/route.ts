import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { buscarDocumento, statusAgregado } from '@/lib/autentique'

export const dynamic = 'force-dynamic'

export const maxDuration = 60

let _sa: ReturnType<typeof createClient> | null = null
function supabaseAdmin() {
  if (!_sa) _sa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  return _sa
}

async function autenticar(request: NextRequest) {
  const auth = request.headers.get('authorization') || ''
  const token = auth.replace(/^Bearer\s+/i, '').trim()
  if (!token) return null
  const { data } = await supabaseAdmin().auth.getUser(token)
  return data?.user || null
}

// POST { id } — atualiza UM documento. Sem id, atualiza todos os
// que estão em status pendente/enviado.
export async function POST(request: NextRequest) {
  const user = await autenticar(request)
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const filtroId = body?.id

  let assinaturas: any[] = []
  if (filtroId) {
    const { data } = await supabaseAdmin().from('assinaturas').select('*').eq('id', filtroId).maybeSingle()
    if (data) assinaturas = [data]
  } else {
    const { data } = await supabaseAdmin().from('assinaturas').select('*')
      .in('status', ['pendente','enviado']).limit(50)
    assinaturas = data || []
  }

  let atualizadas = 0, erros: string[] = []
  for (const a of assinaturas) {
    if (!a.autentique_id) continue
    try {
      const data = await buscarDocumento(a.autentique_id) as any
      const doc = data?.document
      if (!doc) continue
      const agg = statusAgregado(doc.signatures || [])
      const urlPdfFinal = doc.files?.signed || null
      const concluidoEm = agg.status === 'assinado' ? new Date().toISOString() : a.concluido_em
      await supabaseAdmin().from('assinaturas').update({
        status: agg.status,
        total_signatarios: agg.total,
        total_assinados:   agg.assinados,
        url_pdf_final:     urlPdfFinal,
        concluido_em:      concluidoEm,
        payload_resposta:  doc,
      }).eq('id', a.id)

      // Atualiza signatários individuais
      for (const s of (doc.signatures || [])) {
        let st = 'pendente'
        if (s?.signed?.created_at)   st = 'assinado'
        if (s?.rejected?.created_at) st = 'recusado'
        if (s?.expired)              st = 'expirado'
        await supabaseAdmin().from('assinaturas_signatarios').update({
          status: st,
          assinado_em: s?.signed?.created_at || null,
          link_assinatura: s?.link?.short_link || null,
        }).eq('assinatura_id', a.id).eq('autentique_id', s.public_id)
      }
      atualizadas++
    } catch (e: any) {
      erros.push(`${a.nome_documento}: ${e?.message?.slice(0,80)}`)
    }
  }

  return NextResponse.json({ ok: true, atualizadas, erros })
}
