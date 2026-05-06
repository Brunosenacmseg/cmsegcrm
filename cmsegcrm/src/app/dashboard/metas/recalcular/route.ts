import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(request: NextRequest) {
  const supabaseAdmin = getAdmin()
  try {
    const { vendedor_id, negocio_id } = await request.json()
    if (!vendedor_id) return NextResponse.json({ ok: true })

    const { data: negocio } = await supabaseAdmin.from('negocios').select('premio, updated_at').eq('id', negocio_id).single()
    if (!negocio) return NextResponse.json({ ok: true })

    const dataGanho = new Date(negocio.updated_at || new Date())

    const { data: metas } = await supabaseAdmin
      .from('metas')
      .select('*')
      .eq('user_id', vendedor_id)
      .eq('status', 'ativa')
      .lte('periodo_inicio', dataGanho.toISOString().split('T')[0])
      .gte('periodo_fim', dataGanho.toISOString().split('T')[0])

    for (const meta of (metas || [])) {
      let novoValor = meta.valor_atual

      if (meta.tipo === 'premio') {
        const { data } = await supabaseAdmin.from('negocios').select('premio').eq('vendedor_id', vendedor_id).eq('status', 'ganho').gte('data_fechamento', meta.periodo_inicio).lte('data_fechamento', meta.periodo_fim + 'T23:59:59')
        novoValor = (data || []).reduce((s: number, n: any) => s + (n.premio || 0), 0)
      }

      if (meta.tipo === 'negocios') {
        const { count } = await supabaseAdmin.from('negocios').select('*', { count: 'exact', head: true }).eq('vendedor_id', vendedor_id).eq('status', 'ganho').gte('data_fechamento', meta.periodo_inicio).lte('data_fechamento', meta.periodo_fim + 'T23:59:59')
        novoValor = count || 0
      }

      await supabaseAdmin.from('metas').update({ valor_atual: novoValor }).eq('id', meta.id)

      // Notificar ao atingir a meta
      if (novoValor >= meta.valor_meta && meta.valor_atual < meta.valor_meta) {
        await supabaseAdmin.from('notificacoes').insert({
          user_id: vendedor_id, tipo: 'sistema',
          titulo: '🎯 Meta atingida! Parabéns!',
          descricao: meta.titulo, link: '/dashboard/metas',
        })
        if (meta.criado_por && meta.criado_por !== vendedor_id) {
          const { data: vendedor } = await supabaseAdmin.from('users').select('nome').eq('id', vendedor_id).single()
          await supabaseAdmin.from('notificacoes').insert({
            user_id: meta.criado_por, tipo: 'sistema',
            titulo: `🎯 ${vendedor?.nome} atingiu a meta!`,
            descricao: meta.titulo, link: '/dashboard/metas',
          })
        }
      }
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('[Metas] Erro:', err)
    return NextResponse.json({ ok: true })
  }
}
