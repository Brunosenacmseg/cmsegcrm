// Importação especializada de RENOVAÇÕES:
// - cada linha vira um card no funil "RENOVAÇÕES"
// - etapa inicial = "RENOVAÇÕES À VENCER"
// - responsável = Bruno Sena (fixo)
//
// Body: { linhas: Array<{ nomeCliente, apolice, vencimento, seguradora, cliente_id? }> }

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const maxDuration = 300
export const dynamic = 'force-dynamic'

const BRUNO_ID = '8edadcff-e1ee-4131-8914-85c4aafce52d'

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
  if (u?.role === 'admin') return { ok: true as const, userId: uid }
  const { data: em } = await sa.from('equipe_membros').select('equipes!inner(nome)').eq('user_id', uid)
  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
  const ok = (em || []).some((r: any) => {
    const n = norm(String(r.equipes?.nome || ''))
    return n === 'gestao' || n === 'equipe gestao'
  })
  if (!ok) return { ok: false as const, erro: 'Acesso negado: apenas admin ou equipe GESTÃO' }
  return { ok: true as const, userId: uid }
}

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

  // Funil RENOVAÇÕES
  const { data: funis } = await sa.from('funis').select('id,nome,etapas')
  const norm = (s: string) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
  const funil = (funis || []).find((f: any) => norm(f.nome) === 'renovacoes' || norm(f.nome) === 'renovacao')
  if (!funil) return NextResponse.json({ error: 'Funil "RENOVAÇÕES" não encontrado.' }, { status: 400 })
  const etapas = Array.isArray((funil as any).etapas) ? (funil as any).etapas : []
  const etapaInicial = etapas.find((e: string) => norm(e) === 'renovacoes a vencer') || etapas[0]
  if (!etapaInicial) return NextResponse.json({ error: 'Funil RENOVAÇÕES sem etapas.' }, { status: 400 })

  // Match cliente por nome (igual ao cobranca)
  const nomesParaBuscar = Array.from(new Set(linhas.filter(l => !l.cliente_id).map(l => String(l.nomeCliente || '').trim()).filter(Boolean)))
  const { data: clientes } = nomesParaBuscar.length
    ? await sa.from('clientes').select('id,nome').in('nome', nomesParaBuscar)
    : { data: [] as any[] }
  const mapaNome = new Map<string, string>()
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

      const { data: existente } = await sa.from('negocios').select('id').eq('funil_id', funil.id).eq('titulo', titulo).limit(1)
      if (existente && existente.length > 0) { ignorados++; continue }

      const cliente_id = l.cliente_id || mapaNome.get(nome.toLowerCase()) || null
      const vencISO = isoDate(venc)

      const { data: neg, error: errNeg } = await sa.from('negocios').insert({
        titulo,
        cliente_id,
        funil_id: funil.id,
        etapa: etapaInicial,
        vendedor_id: BRUNO_ID,
        status: 'em_andamento',
        vencimento: vencISO,
        previsao_fechamento: vencISO,
        seguradora: l.seguradora || null,
        fonte_origem: 'Renovações · Import XLSX',
      }).select('id').single()
      if (errNeg) { erros++; mensagens.push(`Linha ${i+1}: ${errNeg.message}`); continue }

      if (neg?.id) {
        const conteudo = `APÓLICE ANTERIOR: ${l.apolice || '—'}\nSEGURADORA: ${l.seguradora || '—'}${venc ? '\nVENCIMENTO: ' + venc : ''}`
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
