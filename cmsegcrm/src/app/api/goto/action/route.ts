import { NextRequest, NextResponse } from 'next/server'
import { createClient, SupabaseClient } from '@supabase/supabase-js'

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

const ACCOUNT_KEY = '1137037296556608637'
const ORG_ID = '570e7213-a520-4573-8aa4-d41dd46a8477'

// Extensão do Bruno (1001)
const EXTENSAO_BRUNO = '745ad02d-5bef-4f5a-97c4-4430db995a00'

// Mapa de extensões por nome (do diagnóstico)
const EXTENSOES: Record<string, string> = {
  'Bruno Sena': '745ad02d-5bef-4f5a-97c4-4430db995a00',
  'Bruno': '745ad02d-5bef-4f5a-97c4-4430db995a00',
  'Giovanna Picasso': '625a6ae2-8cde-4b15-8baa-d791ed44b0cf',
  'Gabriel Silverio': '3c5bdc6a-eaa0-41fe-925f-244e98728334',
  'Maria Luisa': '2033939f-9daf-424b-822b-19819dc03b2a',
}

async function getValidToken(userId: string) {
  const { data } = await supabaseAdmin().from('goto_tokens').select('*').eq('user_id', userId).single()
  if (!data) return null
  const now = new Date()
  const expiresAt = new Date(data.expires_at)
  if (now >= expiresAt && data.refresh_token) {
    try {
      const credentials = Buffer.from(`${process.env.GOTO_CLIENT_ID}:${process.env.GOTO_CLIENT_SECRET}`).toString('base64')
      const res = await fetch('https://authentication.logmeininc.com/oauth/token', {
        method: 'POST',
        headers: { 'Authorization': `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: data.refresh_token }).toString(),
      })
      const newToken = await res.json()
      if (newToken.access_token) {
        const newExpires = new Date(Date.now() + (newToken.expires_in || 3600) * 1000)
        await supabaseAdmin().from('goto_tokens').update({ access_token: newToken.access_token, refresh_token: newToken.refresh_token || data.refresh_token, expires_at: newExpires.toISOString() }).eq('user_id', userId)
        return { ...data, access_token: newToken.access_token }
      }
    } catch (e) { console.error('Refresh error:', e) }
  }
  return data
}

async function safeJson(res: Response) {
  const text = await res.text()
  try { return { data: JSON.parse(text), status: res.status } }
  catch { return { data: { raw: text }, status: res.status } }
}

async function getExtensoes(at: string) {
  const res = await fetch(`https://api.goto.com/voice-admin/v1/extensions?accountKey=${ACCOUNT_KEY}&pageSize=50`, {
    headers: { Authorization: `Bearer ${at}` }
  })
  const { data } = await safeJson(res)
  return data?.items || []
}

export async function POST(request: NextRequest) {
  try {
    const { action, user_id, ...params } = await request.json()

    // Ações sem token
    if (action === 'status') {
      const { data } = await supabaseAdmin().from('goto_tokens').select('account_key,expires_at').eq('user_id', user_id).single()
      return NextResponse.json({ conectado: !!data, ...data })
    }
    if (action === 'listar_ligacoes') {
      // Permissões: admin vê tudo (com filtro opcional por usuário);
      // líder vê histórico do time todo; corretor só o próprio.
      const { data: prof } = await supabaseAdmin().from('users').select('id,role').eq('id', user_id).single()
      const role = prof?.role || 'corretor'
      let q = supabaseAdmin().from('ligacoes').select('*, clientes(nome), users(nome)')
      if (params.filtro_user_id) {
        q = q.eq('user_id', params.filtro_user_id)
      } else if (role === 'corretor') {
        q = q.eq('user_id', user_id)
      } else if (role === 'lider') {
        const { data: equipes } = await supabaseAdmin().from('equipes').select('id').eq('lider_id', user_id)
        const equipeIds = (equipes || []).map(e => e.id)
        let ids = [user_id]
        if (equipeIds.length) {
          const { data: membros } = await supabaseAdmin().from('equipe_membros').select('user_id').in('equipe_id', equipeIds)
          ids = [...new Set([user_id, ...((membros||[]).map(m => m.user_id))])]
        }
        q = q.in('user_id', ids)
      }
      const { data } = await q.order('criado_em', { ascending: false }).limit(50)
      return NextResponse.json({ ligacoes: data || [] })
    }
    if (action === 'ligacoes_em_andamento') {
      // Em andamento: admin vê tudo; líder vê do time; corretor só o próprio.
      const { data: prof } = await supabaseAdmin().from('users').select('id,role').eq('id', user_id).single()
      const role = prof?.role || 'corretor'
      let q = supabaseAdmin().from('ligacoes').select('*, clientes(nome)').in('status', ['iniciada', 'em_andamento'])
      if (role === 'corretor') {
        q = q.eq('user_id', user_id)
      } else if (role === 'lider') {
        const { data: equipes } = await supabaseAdmin().from('equipes').select('id').eq('lider_id', user_id)
        const equipeIds = (equipes || []).map(e => e.id)
        let ids = [user_id]
        if (equipeIds.length) {
          const { data: membros } = await supabaseAdmin().from('equipe_membros').select('user_id').in('equipe_id', equipeIds)
          ids = [...new Set([user_id, ...((membros||[]).map(m => m.user_id))])]
        }
        q = q.in('user_id', ids)
      }
      const { data } = await q.order('inicio', { ascending: false })
      return NextResponse.json({ ligacoes: data || [] })
    }
    if (action === 'encerrar_ligacao') {
      await supabaseAdmin().from('ligacoes').update({ status: 'encerrada', fim: new Date().toISOString(), duracao_seg: params.duracao_seg || 0 }).eq('id', params.ligacao_id)
      return NextResponse.json({ ok: true })
    }
    if (action === 'stats_ligacoes') {
      const hoje = new Date(); hoje.setHours(0,0,0,0)
      const { data } = await supabaseAdmin().from('ligacoes').select('user_id, direcao, status, users(nome)').gte('criado_em', hoje.toISOString())
      return NextResponse.json({ stats: data || [] })
    }
    if (action === 'listar_extensoes') {
      const token = await getValidToken(user_id)
      if (!token) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
      const extensoes = await getExtensoes(token.access_token)
      return NextResponse.json({ extensoes: extensoes.filter((e: any) => e.type === 'DIRECT_EXTENSION') })
    }

    // Ações com token
    const token = await getValidToken(user_id)
    if (!token) return NextResponse.json({ error: 'Não autenticado no GoTo Connect' }, { status: 401 })
    const at = token.access_token

    if (action === 'ligar') {
      const { numero, extensao_id } = params
      const numeroLimpo = numero.replace(/\D/g, '')
      const numeroFormatado = numeroLimpo.startsWith('55') ? `+${numeroLimpo}` : `+55${numeroLimpo}`

      // Descobrir extensão do usuário
      let extId = extensao_id
      if (!extId) {
        const { data: userData } = await supabaseAdmin().from('users').select('nome').eq('id', user_id).single()
        const nomeUser = userData?.nome || ''
        // Verificar no mapa fixo
        for (const [nome, id] of Object.entries(EXTENSOES)) {
          if (nomeUser.toLowerCase().includes(nome.toLowerCase().split(' ')[0].toLowerCase())) {
            extId = id; break
          }
        }
        // Se não achou, buscar dinamicamente
        if (!extId) {
          const extensoes = await getExtensoes(at)
          const ext = extensoes.find((e: any) =>
            e.type === 'DIRECT_EXTENSION' &&
            e.name?.toLowerCase().includes(nomeUser.toLowerCase().split(' ')[0].toLowerCase())
          ) || extensoes.find((e: any) => e.type === 'DIRECT_EXTENSION')
          extId = ext?.id
          console.log('[GoTo] Ext dinamica:', ext?.name, extId)
        }
      }

      console.log('[GoTo] Usando extensão:', extId, '→', numeroFormatado)

      if (!extId) return NextResponse.json({ error: 'Extensão não encontrada.' })

      // Endpoint correto: calls/v2/calls com from.lineId = extensionId
      const tentativas = [
        // Endpoint migrado (docs GTC_Host_Migration)
        {
          url: `https://api.goto.com/calls/v2/calls`,
          body: { dialString: numeroFormatado, from: { lineId: extId } }
        },
        // Variante com extensionId
        {
          url: `https://api.goto.com/calls/v2/calls`,
          body: { dialString: numeroFormatado, from: { extensionId: extId } }
        },
        // Variante v1
        {
          url: `https://api.goto.com/calls/v1/calls`,
          body: { dialString: numeroFormatado, from: { lineId: extId } }
        },
        // call-control v1 com extensionId no path
        {
          url: `https://api.goto.com/call-control/v1/extensions/${extId}/outbound`,
          body: { to: numeroFormatado }
        },
        // Jive legado
        {
          url: `https://api.jive.com/calls/v2/calls`,
          body: { dialString: numeroFormatado, from: { lineId: extId } }
        },
      ]

      for (const t of tentativas) {
        const res = await fetch(t.url, {
          method: 'POST',
          headers: { Authorization: `Bearer ${at}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(t.body),
        })
        const { data, status } = await safeJson(res)
        console.log(`[GoTo] ${t.url} → ${status}:`, JSON.stringify(data).slice(0, 200))
        if (status < 400) {
          return NextResponse.json({ ok: true, callId: data?.id || data?.callId, extId, ...data })
        }
      }

      return NextResponse.json({
        error: 'Não foi possível iniciar a chamada. Verifique os logs do Vercel para detalhes.',
        extensao: extId,
        numero: numeroFormatado,
      })
    }

    return NextResponse.json({ error: 'Ação inválida' }, { status: 400 })

  } catch (err: any) {
    console.error('[GoTo Error]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
