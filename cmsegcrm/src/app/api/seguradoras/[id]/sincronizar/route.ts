// Sincroniza registros pendentes do staging com os módulos do CRM:
//  - Apólices: upsert em public.apolices, vincula cliente
//  - Sinistros: cria/atualiza negócio no funil "SINISTRO"
//  - Inadimplência: cria/atualiza negócio no funil "FUNIL COBRANÇA" e
//    registra histórico de inadimplência no cliente
//  - Comissões: insere em comissoes_recebidas + histórico na apólice/cliente
//
// Body: { tipo: 'apolices'|'sinistros'|'inadimplencia'|'comissoes' }

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const maxDuration = 300
export const dynamic = 'force-dynamic'

let _sa: ReturnType<typeof createClient> | null = null
function admin() {
  if (!_sa) _sa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  return _sa
}

type Tipo = 'apolices' | 'sinistros' | 'inadimplencia' | 'comissoes' | 'propostas'

async function checarAdmin(req: NextRequest) {
  const auth = req.headers.get('authorization') || ''
  const token = auth.replace(/^Bearer\s+/i, '').trim()
  if (!token) return { ok: false as const, erro: 'Não autenticado' }
  const { data: ud } = await admin().auth.getUser(token)
  if (!ud?.user) return { ok: false as const, erro: 'Sessão inválida' }
  const { data: u } = await admin().from('users').select('role').eq('id', ud.user.id).single()
  if ((u as any)?.role !== 'admin') return { ok: false as const, erro: 'Apenas admin' }
  return { ok: true as const, userId: ud.user.id }
}

// Localiza cliente_id por CPF/CNPJ ou pela apólice
async function localizarCliente(cpf?: string | null, numeroApolice?: string | null): Promise<string | null> {
  if (cpf) {
    const { data } = await admin().from('clientes').select('id').eq('cpf_cnpj', cpf).limit(1)
    if (data && data.length) return (data[0] as any).id
  }
  if (numeroApolice) {
    const { data } = await admin().from('apolices').select('cliente_id').eq('numero', numeroApolice).limit(1)
    if (data && data.length) return (data[0] as any).cliente_id
  }
  return null
}

async function localizarApolice(numero?: string | null): Promise<{ id: string; cliente_id: string } | null> {
  if (!numero) return null
  const { data } = await admin().from('apolices').select('id, cliente_id').eq('numero', numero).limit(1)
  if (data && data.length) return data[0] as any
  return null
}

async function getFunilId(filtro: { tipo?: string; nomeLike?: string }): Promise<{ id: string; etapas: string[] } | null> {
  let q = admin().from('funis').select('id, nome, etapas, ordem')
  if (filtro.tipo) q = q.eq('tipo', filtro.tipo)
  const { data } = await q
  if (!data || !data.length) return null
  let row: any = null
  if (filtro.nomeLike) {
    const re = new RegExp(filtro.nomeLike, 'i')
    row = data.find((f: any) => re.test(f.nome))
  }
  if (!row) row = (data as any[]).sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0))[0]
  return { id: row.id, etapas: row.etapas || [] }
}

// ─────────────────── handlers por tipo ───────────────────

async function syncApolices(seguradoraId: string, seguradoraNome: string) {
  const { data: rows } = await admin().from('seg_stage_apolices')
    .select('*').eq('seguradora_id', seguradoraId).eq('status', 'pendente').limit(2000)
  let ok = 0, erro = 0
  for (const r of (rows || []) as any[]) {
    try {
      let cliente_id = await localizarCliente(r.cpf_cnpj, r.numero)
      let clienteCriadoAuto = false
      if (!cliente_id && r.cliente_nome) {
        const { data: novo, error: errCli } = await admin().from('clientes').insert({
          nome: r.cliente_nome, cpf_cnpj: r.cpf_cnpj || null,
          tipo: r.cpf_cnpj && r.cpf_cnpj.length > 11 ? 'PJ' : 'PF',
          fonte: `import:${seguradoraNome}`,
        }).select('id').single()
        if (errCli) throw errCli
        cliente_id = (novo as any).id
        clienteCriadoAuto = true
      }
      if (!cliente_id) throw new Error('cliente não localizado e sem nome para criar')

      let apolice_id: string | null = null
      if (r.numero) {
        const exist = await localizarApolice(r.numero)
        if (exist) {
          apolice_id = exist.id
          await admin().from('apolices').update({
            cliente_id,
            produto: r.produto || undefined,
            seguradora: seguradoraNome,
            premio: r.premio ?? undefined,
            comissao_pct: r.comissao_pct ?? undefined,
            vigencia_ini: r.vigencia_ini || undefined,
            vigencia_fim: r.vigencia_fim || undefined,
            placa: r.placa || undefined,
          }).eq('id', apolice_id)
        } else {
          const { data: nova, error: errApo } = await admin().from('apolices').insert({
            cliente_id,
            numero: r.numero,
            produto: r.produto,
            seguradora: seguradoraNome,
            premio: r.premio,
            comissao_pct: r.comissao_pct,
            vigencia_ini: r.vigencia_ini,
            vigencia_fim: r.vigencia_fim,
            placa: r.placa,
            status: 'ativo',
          }).select('id').single()
          if (errApo) throw errApo
          apolice_id = (nova as any).id
        }
      }

      await admin().from('seg_stage_apolices').update({
        status: 'sincronizado', sincronizado_em: new Date().toISOString(),
        cliente_id, apolice_id, erro_msg: null,
        cliente_criado_auto: clienteCriadoAuto,
      }).eq('id', r.id)
      ok++
    } catch (e: any) {
      await admin().from('seg_stage_apolices').update({
        status: 'erro', erro_msg: String(e?.message || e),
      }).eq('id', r.id)
      erro++
    }
  }
  return { ok, erro }
}

async function syncSinistros(seguradoraId: string, seguradoraNome: string) {
  const { data: rows } = await admin().from('seg_stage_sinistros')
    .select('*').eq('seguradora_id', seguradoraId).eq('status', 'pendente').limit(2000)
  const funil = await getFunilId({ tipo: 'posVenda', nomeLike: 'sinistro' })
  if (!funil) throw new Error('Funil de Sinistro não encontrado')
  const etapaInicial = funil.etapas[0] || 'Novo Sinistro'

  let ok = 0, erro = 0
  for (const r of (rows || []) as any[]) {
    try {
      const cliente_id = await localizarCliente(r.cpf_cnpj, r.numero_apolice)
      if (!cliente_id) throw new Error('cliente não localizado')
      const apo = await localizarApolice(r.numero_apolice)
      const apolice_id = apo?.id || null

      // Procura negócio aberto para essa apólice
      let negocio_id: string | null = null
      if (apolice_id) {
        const { data: ja } = await admin().from('negocios')
          .select('id, etapa').eq('cliente_id', cliente_id).eq('funil_id', funil.id)
          .ilike('obs', `%apolice:${r.numero_apolice}%`).limit(1)
        if (ja && ja.length) negocio_id = (ja[0] as any).id
      }

      if (negocio_id) {
        await admin().from('negocios').update({
          obs: `apolice:${r.numero_apolice} | sinistro:${r.numero_sinistro || '-'} | ${r.causa || ''}`,
          seguradora: seguradoraNome,
          updated_at: new Date().toISOString(),
        }).eq('id', negocio_id)
        await admin().from('historico').insert({
          cliente_id, negocio_id, tipo: 'blue',
          titulo: `Sinistro atualizado (${seguradoraNome})`,
          descricao: `Apólice ${r.numero_apolice || '-'} • Sinistro ${r.numero_sinistro || '-'} • ${r.situacao || r.causa || ''}`,
        })
      } else {
        const { data: novo, error: errNeg } = await admin().from('negocios').insert({
          cliente_id, funil_id: funil.id, etapa: etapaInicial,
          titulo: `Sinistro ${r.numero_sinistro || ''} — ${seguradoraNome}`.trim(),
          seguradora: seguradoraNome,
          cpf_cnpj: r.cpf_cnpj,
          obs: `apolice:${r.numero_apolice || '-'} | sinistro:${r.numero_sinistro || '-'} | ${r.causa || ''}`,
          fonte: `seguradora:${seguradoraNome}`,
        }).select('id').single()
        if (errNeg) throw errNeg
        negocio_id = (novo as any).id
        await admin().from('historico').insert({
          cliente_id, negocio_id, tipo: 'blue',
          titulo: `Novo sinistro (${seguradoraNome})`,
          descricao: `Apólice ${r.numero_apolice || '-'} • Sinistro ${r.numero_sinistro || '-'} • ${r.causa || ''}`,
        })
      }

      await admin().from('seg_stage_sinistros').update({
        status: 'sincronizado', sincronizado_em: new Date().toISOString(),
        cliente_id, apolice_id, negocio_id, erro_msg: null,
      }).eq('id', r.id)
      ok++
    } catch (e: any) {
      await admin().from('seg_stage_sinistros').update({
        status: 'erro', erro_msg: String(e?.message || e),
      }).eq('id', r.id)
      erro++
    }
  }
  return { ok, erro }
}

async function syncInadimplencia(seguradoraId: string, seguradoraNome: string) {
  const { data: rows } = await admin().from('seg_stage_inadimplencia')
    .select('*').eq('seguradora_id', seguradoraId).eq('status', 'pendente').limit(2000)
  const funil = await getFunilId({ tipo: 'cobranca', nomeLike: 'cobran' })
  if (!funil) throw new Error('Funil de Cobrança não encontrado')
  const etapaInicial = funil.etapas[0] || 'Em Atraso'

  let ok = 0, erro = 0
  for (const r of (rows || []) as any[]) {
    try {
      const cliente_id = await localizarCliente(r.cpf_cnpj, r.numero_apolice)
      if (!cliente_id) throw new Error('cliente não localizado')
      const apo = await localizarApolice(r.numero_apolice)
      const apolice_id = apo?.id || null

      let negocio_id: string | null = null
      if (r.numero_apolice) {
        const { data: ja } = await admin().from('negocios')
          .select('id').eq('cliente_id', cliente_id).eq('funil_id', funil.id)
          .ilike('obs', `%apolice:${r.numero_apolice}%`).limit(1)
        if (ja && ja.length) negocio_id = (ja[0] as any).id
      }

      const obs = `apolice:${r.numero_apolice || '-'} | parcela:${r.parcela ?? '-'} | venc:${r.vencimento || '-'} | atraso:${r.dias_atraso ?? '-'}d`

      if (negocio_id) {
        await admin().from('negocios').update({
          obs, seguradora: seguradoraNome, premio: r.valor ?? undefined,
          updated_at: new Date().toISOString(),
        }).eq('id', negocio_id)
      } else {
        const { data: novo, error: errNeg } = await admin().from('negocios').insert({
          cliente_id, funil_id: funil.id, etapa: etapaInicial,
          titulo: `Inadimplência ${r.numero_apolice || ''} — ${seguradoraNome}`.trim(),
          seguradora: seguradoraNome,
          cpf_cnpj: r.cpf_cnpj,
          premio: r.valor,
          vencimento: r.vencimento,
          obs,
          fonte: `seguradora:${seguradoraNome}`,
        }).select('id').single()
        if (errNeg) throw errNeg
        negocio_id = (novo as any).id
      }

      await admin().from('historico').insert({
        cliente_id, negocio_id, tipo: 'red',
        titulo: `Inadimplência (${seguradoraNome})`,
        descricao: `Apólice ${r.numero_apolice || '-'} • Parcela ${r.parcela ?? '-'} • R$ ${r.valor ?? '-'} • ${r.dias_atraso ?? '-'} dias em atraso`,
      })

      await admin().from('seg_stage_inadimplencia').update({
        status: 'sincronizado', sincronizado_em: new Date().toISOString(),
        cliente_id, apolice_id, negocio_id, erro_msg: null,
      }).eq('id', r.id)
      ok++
    } catch (e: any) {
      await admin().from('seg_stage_inadimplencia').update({
        status: 'erro', erro_msg: String(e?.message || e),
      }).eq('id', r.id)
      erro++
    }
  }
  return { ok, erro }
}

async function syncComissoes(seguradoraId: string, seguradoraNome: string, userId: string) {
  const { data: rows } = await admin().from('seg_stage_comissoes')
    .select('*').eq('seguradora_id', seguradoraId).eq('status', 'pendente').limit(2000)
  let ok = 0, erro = 0
  for (const r of (rows || []) as any[]) {
    try {
      const cliente_id = await localizarCliente(r.cpf_cnpj, r.numero_apolice)
      const apo = await localizarApolice(r.numero_apolice)
      const apolice_id = apo?.id || null
      const valor = Number(r.comissao_valor || 0)
      // Permite negativos (estorno por cancelamento). So rejeita NaN/Infinity.
      if (!isFinite(valor)) throw new Error('valor de comissão inválido')

      // vendedor: do registered_por (admin que importou) — pode ajustar depois
      // tenta usar vendedor da apólice/negócio se houver
      let vendedor_id: string | null = null
      if (apolice_id) {
        const { data: neg } = await admin().from('negocios')
          .select('vendedor_id').not('vendedor_id', 'is', null)
          .eq('cliente_id', cliente_id || '').limit(1)
        if (neg && neg.length) vendedor_id = (neg[0] as any).vendedor_id
      }
      if (!vendedor_id) vendedor_id = userId

      const { data: nova, error: errCom } = await admin().from('comissoes_recebidas').insert({
        cliente_id, apolice_id, vendedor_id,
        valor,
        competencia: r.competencia,
        data_recebimento: r.data_pagamento,
        parcela: r.parcela ?? 1,
        total_parcelas: r.total_parcelas ?? 1,
        seguradora: seguradoraNome,
        produto: r.produto,
        status: 'recebido',
        origem: 'importacao',
        registrado_por: userId,
        obs: [
          `Apólice ${r.numero_apolice || '-'}`,
          `Cliente ${r.cliente_nome || '-'}`,
          `Seguradora ${seguradoraNome}`,
          `Valor R$ ${valor.toFixed(2)}`,
          r.competencia ? `Competência ${r.competencia}` : null,
          r.parcela ? `Parcela ${r.parcela}/${r.total_parcelas ?? '-'}` : null,
        ].filter(Boolean).join(' • '),
      }).select('id').single()
      if (errCom) throw errCom
      const comissao_id = (nova as any).id

      if (cliente_id) {
        await admin().from('historico').insert({
          cliente_id, tipo: 'teal',
          titulo: `Comissão recebida (${seguradoraNome})`,
          descricao: `Apólice ${r.numero_apolice || '-'} • Parcela ${r.parcela ?? '-'} • R$ ${valor.toFixed(2)} • Competência ${r.competencia || '-'}`,
        })
      }

      await admin().from('seg_stage_comissoes').update({
        status: 'sincronizado', sincronizado_em: new Date().toISOString(),
        cliente_id, apolice_id, comissao_id, erro_msg: null,
      }).eq('id', r.id)
      ok++
    } catch (e: any) {
      await admin().from('seg_stage_comissoes').update({
        status: 'erro', erro_msg: String(e?.message || e),
      }).eq('id', r.id)
      erro++
    }
  }
  return { ok, erro }
}

// Sincroniza propostas: localiza/cria cliente e vincula apolice (se ja emitida).
// Nao cria registros em outras tabelas — proposta e um documento intermediario.
// O usuario pode usar a aba de Propostas para acompanhar o pipeline.
async function syncPropostas(seguradoraId: string, seguradoraNome: string) {
  const { data: rows } = await admin().from('seg_stage_propostas')
    .select('*').eq('seguradora_id', seguradoraId).eq('status', 'pendente').limit(2000)
  let ok = 0, erro = 0
  for (const r of (rows || []) as any[]) {
    try {
      let cliente_id = await localizarCliente(r.cpf_cnpj, r.numero_apolice)
      let clienteCriadoAuto = false
      if (!cliente_id && r.cliente_nome) {
        const { data: novo, error: errCli } = await admin().from('clientes').insert({
          nome: r.cliente_nome,
          cpf_cnpj: r.cpf_cnpj || null,
          tipo: r.cpf_cnpj && r.cpf_cnpj.length > 11 ? 'PJ' : 'PF',
          fonte: `import:${seguradoraNome}`,
        }).select('id').single()
        if (errCli) throw errCli
        cliente_id = (novo as any).id
        clienteCriadoAuto = true
      }
      if (!cliente_id) throw new Error('cliente nao localizado e sem nome para criar')

      const apo = await localizarApolice(r.numero_apolice)
      const apolice_id = apo?.id || null

      if (cliente_id) {
        await admin().from('historico').insert({
          cliente_id, tipo: 'gold',
          titulo: `Proposta importada (${seguradoraNome})`,
          descricao: [
            r.numero_proposta ? `Proposta ${r.numero_proposta}` : null,
            r.numero_apolice  ? `Apolice ${r.numero_apolice}`   : null,
            r.produto         ? `Produto ${r.produto}`          : null,
            r.premio != null  ? `Premio R$ ${Number(r.premio).toFixed(2)}` : null,
            r.situacao        ? `Situacao ${r.situacao}`        : null,
          ].filter(Boolean).join(' • '),
        })
      }

      await admin().from('seg_stage_propostas').update({
        status: 'sincronizado', sincronizado_em: new Date().toISOString(),
        cliente_id, apolice_id, erro_msg: null,
        cliente_criado_auto: clienteCriadoAuto,
      }).eq('id', r.id)
      ok++
    } catch (e: any) {
      await admin().from('seg_stage_propostas').update({
        status: 'erro', erro_msg: String(e?.message || e),
      }).eq('id', r.id)
      erro++
    }
  }
  return { ok, erro }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ck = await checarAdmin(req)
  if (!ck.ok) return NextResponse.json({ erro: ck.erro }, { status: 401 })

  const body = await req.json().catch(() => null) as any
  const tipo = body?.tipo as Tipo
  if (!['apolices','sinistros','inadimplencia','comissoes','propostas'].includes(tipo))
    return NextResponse.json({ erro: 'tipo inválido' }, { status: 400 })

  const { data: seg } = await admin().from('seguradoras').select('id, nome').eq('id', params.id).single()
  if (!seg) return NextResponse.json({ erro: 'seguradora não encontrada' }, { status: 404 })
  const segNome = (seg as any).nome as string

  try {
    let r: { ok: number; erro: number }
    if (tipo === 'apolices')           r = await syncApolices(params.id, segNome)
    else if (tipo === 'sinistros')     r = await syncSinistros(params.id, segNome)
    else if (tipo === 'inadimplencia') r = await syncInadimplencia(params.id, segNome)
    else if (tipo === 'propostas')     r = await syncPropostas(params.id, segNome)
    else                                r = await syncComissoes(params.id, segNome, ck.userId)
    return NextResponse.json({ ok: true, sincronizados: r.ok, erros: r.erro })
  } catch (e: any) {
    return NextResponse.json({ erro: String(e?.message || e) }, { status: 500 })
  }
}
