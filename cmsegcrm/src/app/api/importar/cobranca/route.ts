// Importação especializada de COBRANÇA:
// - cada linha vira um card no funil "COBRANÇA"
// - responsável = primeiro membro disponível da equipe "COBRANÇA" (round-robin
//   simples baseado no índice da linha)
// - cliente vinculado por nome (exato ou cliente_id já resolvido no client)
// - cria uma anotação em negocio_notas com Apolice + Seguradora
//
// Body: { linhas: Array<{ nomeCliente, apolice, vencimento, seguradora, cliente_id? }> }

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const maxDuration = 300
export const dynamic = 'force-dynamic'

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

async function checarAcesso(req: NextRequest) {
  const auth = req.headers.get('authorization') || ''
  const token = auth.replace(/^Bearer\s+/i, '').trim()
  if (!token) return { ok: false as const, erro: 'Não autenticado' }
  const sa = admin()
  const { data: userData } = await sa.auth.getUser(token)
  if (!userData?.user) return { ok: false as const, erro: 'Sessão inválida' }
  const uid = userData.user.id
  const { data: u } = await sa.from('users').select('role').eq('id', uid).single()
  if (u?.role === 'admin') return { ok: true as const, userId: uid, role: 'admin' as const }
  // Equipe GESTÃO
  const { data: em } = await sa.from('equipe_membros').select('equipes!inner(nome)').eq('user_id', uid)
  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
  const ok = (em || []).some((r: any) => {
    const n = norm(String(r.equipes?.nome || ''))
    return n === 'gestao' || n === 'equipe gestao'
  })
  if (!ok) return { ok: false as const, erro: 'Acesso negado: apenas admin ou equipe GESTÃO' }
  return { ok: true as const, userId: uid, role: 'gestao' as const }
}

// "DD/MM/YYYY" → "YYYY-MM-DD" para colunas date do Postgres
function isoDate(s: string): string | null {
  if (!s) return null
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`
  const m2 = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m2) return `${m2[1]}-${m2[2].padStart(2,'0')}-${m2[3].padStart(2,'0')}`
  return null
}

export async function POST(req: NextRequest) {
  const acesso = await checarAcesso(req)
  if (!acesso.ok) return NextResponse.json({ error: acesso.erro }, { status: 403 })

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }
  const linhas: any[] = Array.isArray(body?.linhas) ? body.linhas : []
  if (linhas.length === 0) return NextResponse.json({ error: 'Sem linhas para importar' }, { status: 400 })

  const sa = admin()

  // Busca funil COBRANÇA (case-insensitive, aceita "COBRANÇA" ou "FUNIL COBRANÇA")
  const { data: funis } = await sa.from('funis').select('id,nome,etapas').order('ordem')
  const norm = (s: string) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
  const funil = (funis || []).find((f: any) => {
    const n = norm(f.nome)
    return n === 'cobranca' || n === 'funil cobranca'
  })
  if (!funil) return NextResponse.json({ error: 'Funil "COBRANÇA" não encontrado. Crie em Configurar funis.' }, { status: 400 })
  const etapaInicial = (Array.isArray(funil.etapas) && funil.etapas.length > 0) ? funil.etapas[0] : null
  if (!etapaInicial) return NextResponse.json({ error: 'Funil COBRANÇA sem etapas cadastradas.' }, { status: 400 })

  // Busca equipe COBRANÇA
  const { data: equipes } = await sa.from('equipes').select('id,nome,lider_id')
  const equipe = (equipes || []).find((e: any) => norm(e.nome) === 'cobranca' || norm(e.nome) === 'equipe cobranca')

  let membros: string[] = []
  let equipeId: string | null = null
  if (equipe) {
    equipeId = equipe.id
    const { data: ms } = await sa.from('equipe_membros').select('user_id').eq('equipe_id', equipe.id)
    membros = (ms || []).map((r: any) => r.user_id).filter(Boolean)
    if (membros.length === 0 && equipe.lider_id) membros = [equipe.lider_id]
  }

  // Match por nome — exato pelos clientes_id já enviados (resolvidos no client),
  // ou fallback de busca por nome aqui.
  const nomesParaBuscar = Array.from(new Set(linhas.filter(l => !l.cliente_id).map(l => String(l.nomeCliente || '').trim()).filter(Boolean)))
  const { data: clientes } = nomesParaBuscar.length
    ? await sa.from('clientes').select('id,nome').in('nome', nomesParaBuscar)
    : { data: [] as any[] }
  const mapaNome = new Map<string,string>()
  ;(clientes || []).forEach((c: any) => mapaNome.set(String(c.nome || '').toLowerCase(), c.id))

  const mensagens: string[] = []
  let criados = 0, ignorados = 0, erros = 0

  for (let i = 0; i < linhas.length; i++) {
    const l = linhas[i]
    try {
      const nome = String(l.nomeCliente || '').trim()
      if (!nome) { erros++; mensagens.push(`Linha ${i+1}: sem NOME CLIENTE`); continue }
      const venc = String(l.vencimento || '').trim()
      const titulo = `${nome} ${venc ? '— VENC ' + venc : ''}`.trim()

      // Idempotência: não duplica se já existir um card com mesmo titulo + funil
      const { data: existente } = await sa.from('negocios').select('id').eq('funil_id', funil.id).eq('titulo', titulo).limit(1)
      if (existente && existente.length > 0) { ignorados++; continue }

      const cliente_id = l.cliente_id || mapaNome.get(nome.toLowerCase()) || null
      const vendedor_id = membros.length > 0 ? membros[i % membros.length] : null
      const vencISO = isoDate(venc)

      const { data: neg, error: errNeg } = await sa.from('negocios').insert({
        titulo,
        cliente_id,
        funil_id: funil.id,
        etapa: etapaInicial,
        vendedor_id,
        equipe_id: equipeId,
        status: 'em_andamento',
        vencimento: vencISO,
        seguradora: l.seguradora || null,
        fonte_origem: 'Cobrança · Import XLSX',
      }).select('id').single()
      if (errNeg) { erros++; mensagens.push(`Linha ${i+1}: ${errNeg.message}`); continue }

      // Anotação fixada com Apolice + Seguradora
      if (neg?.id) {
        const conteudo = `APOLICE: ${l.apolice || '—'}\nSEGURADORA: ${l.seguradora || '—'}${venc ? '\nVENCIMENTO: ' + venc : ''}`
        await sa.from('negocio_notas').insert({
          negocio_id: neg.id,
          user_id: acesso.userId,
          conteudo,
          pinned: true,
        })
      }
      criados++
    } catch (e: any) {
      erros++
      mensagens.push(`Linha ${i+1}: ${e?.message || e}`)
    }
  }

  return NextResponse.json({ criados, ignorados, erros, mensagens })
}
