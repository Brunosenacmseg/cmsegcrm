// Cron do motor de FLUXOS SDR. Roda a cada minuto via Vercel Cron.
//
// Itera todos os fluxos ATIVOS em sdr_fluxos. Para cada fluxo:
//   1) INIT — pra cada negócio no funil do fluxo ainda sem state,
//      ativa o agente do fluxo no WhatsApp do vendedor responsável,
//      gera 1ª mensagem via LLM, envia, move pra primeira etapa do
//      fluxo e agenda próxima ação em +N horas úteis.
//   2) FOLLOWUP — pra cada state desse fluxo com proxima_acao_em
//      <= now() ainda ativo, avança Tentativa N → N+1 ou marca como
//      "perdido" se já estava na última tentativa do fluxo.
//
// Detecção de resposta do cliente continua no webhook
// /api/whatsapp/webhook (encerra o fluxo e move pra etapa_interacao).
//
// Path mantido (/api/cron/suhai-followup) pra não precisar reconfigurar
// o vercel.json — apesar de o motor agora ser genérico.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import type { Database } from '@/lib/supabase/database.types'
import { chamarChatGPT } from '@/lib/openai'
import { enviarTextoEvo, enviarTextoEvoDetalhado, numeroParaJid } from '@/lib/whatsapp-evo'
import { horarioUtilAdd, dentroDaJanelaUtil } from '@/lib/horario-util'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const LOTE_INIT_POR_FLUXO     = 1
const LOTE_FOLLOWUP_POR_FLUXO = 1

let _sa: ReturnType<typeof createClient<Database>> | null = null
function sa() {
  if (!_sa) _sa = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  return _sa
}

function timingSafeEqualStr(a: string, b: string): boolean {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ba.length !== bb.length) return false
  return crypto.timingSafeEqual(ba, bb)
}

interface EvoConfigCompleta { evo_url: string; api_key: string; instance: string }

interface Fluxo {
  id: string
  nome: string
  funil_id: string
  agente_id: string
  etapas_tentativas: string[]
  etapa_interacao: string
  etapa_perdido: string
  horas_entre_tentativas: number
  horario_util_inicio: string
  horario_util_fim: string
  prompt_template: string
  ativo: boolean
}

interface ContextoLead {
  nomeCliente: string
  primeiroNome: string
}

// Converte "ALICE BONACCORSI DE SENA" → "Alice Bonaccorsi de Sena".
// Mantém preposições/artigos curtos em minúsculo (de, da, do, dos, e).
function tituloCase(s: string): string {
  const minusculas = new Set(['de','da','do','das','dos','e','di','du','del','la'])
  return s.toLowerCase().split(/(\s+)/).map((w, i) => {
    if (/^\s+$/.test(w)) return w
    if (i > 0 && minusculas.has(w)) return w
    return w.charAt(0).toUpperCase() + w.slice(1)
  }).join('')
}

function primeiroNomeDe(nome: string | null | undefined): string {
  if (!nome) return ''
  const primeiro = String(nome).trim().split(/\s+/)[0] || ''
  return tituloCase(primeiro)
}

// Substitui placeholders {{nome}}, {{tentativa_n}}, {{total_tentativas}}, {{tipo_tentativa}}.
function renderizarPrompt(template: string, ctx: { nome: string; n: number; total: number; tipo: string }): string {
  return template
    .replace(/\{\{\s*nome\s*\}\}/g, ctx.nome)
    .replace(/\{\{\s*tentativa_n\s*\}\}/g, String(ctx.n))
    .replace(/\{\{\s*total_tentativas\s*\}\}/g, String(ctx.total))
    .replace(/\{\{\s*tipo_tentativa\s*\}\}/g, ctx.tipo)
}

function tipoDaTentativa(n: number, total: number): 'abertura'|'followup'|'ultima_tentativa' {
  if (n <= 1) return 'abertura'
  if (n >= total) return 'ultima_tentativa'
  return 'followup'
}

async function carregarFluxosAtivos(): Promise<Fluxo[]> {
  const { data } = await sa().from('sdr_fluxos').select('*').eq('ativo', true)
  return (data || []) as unknown as Fluxo[]
}

async function carregarAgente(agenteId: string) {
  const { data } = await sa().from('ai_agentes').select('*').eq('id', agenteId).maybeSingle()
  if (!data || data.ativo === false) return null
  return data
}

async function carregarInstanciaDoVendedor(vendedorId: string | null | undefined) {
  if (!vendedorId) return null
  const { data } = await sa().from('whatsapp_instancias').select('*').eq('user_id', vendedorId).maybeSingle()
  if (!data || data.status !== 'connected' || !data.nome) return null
  return data
}

function evoConfig(inst: any): EvoConfigCompleta | null {
  if (!inst?.nome) return null
  const evo_url = inst.evolution_url || process.env.EVOLUTION_API_URL || ''
  const api_key = inst.api_key       || process.env.EVOLUTION_API_KEY || ''
  if (!evo_url || !api_key) return null
  return { evo_url, api_key, instance: inst.nome }
}

async function carregarContextoCard(negocio: any): Promise<{ nome: string; jid: string | null }> {
  let nome = ''
  let telefone = (negocio.telefone_negocio as string | null) || ''
  if (negocio.cliente_id) {
    const { data: cli } = await sa().from('clientes').select('nome, telefone').eq('id', negocio.cliente_id).maybeSingle()
    if (cli?.nome) nome = cli.nome
    if (!telefone && cli?.telefone) telefone = cli.telefone
  }
  if (!nome) nome = (negocio.titulo as string) || ''
  return { nome: tituloCase(nome), jid: numeroParaJid(telefone) }
}

async function criarTarefaSemWhatsApp(negocioId: string, vendedorId: string | null, nomeCliente: string, nomeFluxo: string) {
  await sa().from('tarefas').insert({
    titulo: `Conectar WhatsApp para fluxo SDR (${nomeFluxo})`,
    descricao: `O lead ${nomeCliente || ''} entrou em um fluxo SDR mas o WhatsApp do vendedor responsável não está conectado. Conecte em /dashboard/whatsapp ou faça o primeiro contato manualmente.`,
    tipo: 'tarefa',
    status: 'pendente',
    negocio_id: negocioId,
    responsavel_id: vendedorId,
    prazo: new Date(Date.now() + 24*60*60*1000).toISOString(),
  })
}

async function gerarMensagem(fluxo: Fluxo, agente: any, ctxLead: ContextoLead, n: number): Promise<string> {
  const total = fluxo.etapas_tentativas.length
  const tipo  = tipoDaTentativa(n, total)
  const promptUsuario = renderizarPrompt(fluxo.prompt_template, {
    nome: ctxLead.primeiroNome || ctxLead.nomeCliente || 'lead',
    n, total, tipo,
  })
  return await chamarChatGPT({
    modelo: agente.modelo,
    systemPrompt: agente.base_conhecimento
      ? `${agente.system_prompt}\n\n=== BASE DE CONHECIMENTO ===\n${agente.base_conhecimento}`
      : agente.system_prompt,
    mensagem: promptUsuario,
    maxTokens: agente.max_tokens || 500,
    temperatura: Number(agente.temperatura) || 0.7,
  })
}

// ── INIT ──────────────────────────────────────────────────────────
async function processarInitsDoFluxo(fluxo: Fluxo): Promise<{ processados: number; falhas: number }> {
  const supabase = sa()
  const { data: candidatos } = await supabase
    .from('negocios')
    .select('id, titulo, etapa, funil_id, vendedor_id, cliente_id, telefone_negocio, status')
    .eq('funil_id', fluxo.funil_id)
    .eq('status', 'em_andamento')
    .order('created_at', { ascending: false })
    .limit(LOTE_INIT_POR_FLUXO * 3)

  if (!candidatos?.length) return { processados: 0, falhas: 0 }

  const { data: comState } = await supabase.from('negocios_suhai_state')
    .select('negocio_id').in('negocio_id', candidatos.map(c => c.id))
  const idsComState = new Set((comState || []).map(s => s.negocio_id))
  const novos = candidatos.filter(n => !idsComState.has(n.id)).slice(0, LOTE_INIT_POR_FLUXO)
  if (!novos.length) return { processados: 0, falhas: 0 }

  const agente = await carregarAgente(fluxo.agente_id)
  let processados = 0
  let falhas = 0

  for (const negocio of novos) {
    try {
      // Lock otimista — insert reserva o slot. PK em negocio_id evita
      // dois crons processarem o mesmo lead.
      const { error: reservaErr } = await supabase.from('negocios_suhai_state').insert({
        negocio_id: negocio.id,
        etapa_sdr: 'pendente',
        fluxo_id: fluxo.id,
      })
      if (reservaErr) { continue }

      const ctxCard = await carregarContextoCard(negocio)
      const inst    = await carregarInstanciaDoVendedor(negocio.vendedor_id)

      if (!ctxCard.jid) {
        await supabase.from('negocios_suhai_state').update({
          etapa_sdr: 'sem_telefone',
          finalizado_em: new Date().toISOString(),
          motivo: 'Card sem telefone para contato',
        }).eq('negocio_id', negocio.id)
        continue
      }
      if (!inst) {
        await criarTarefaSemWhatsApp(negocio.id, negocio.vendedor_id, ctxCard.nome, fluxo.nome)
        await supabase.from('negocios_suhai_state').update({
          etapa_sdr: 'sem_whatsapp',
          finalizado_em: new Date().toISOString(),
          motivo: `Vendedor sem WhatsApp conectado (fluxo "${fluxo.nome}", tarefa criada)`,
        }).eq('negocio_id', negocio.id)
        continue
      }
      if (!agente) {
        await supabase.from('negocios_suhai_state').update({
          etapa_sdr: 'erro',
          finalizado_em: new Date().toISOString(),
          motivo: `Agente do fluxo "${fluxo.nome}" inativo ou inexistente`,
        }).eq('negocio_id', negocio.id)
        falhas++
        continue
      }
      const cfgEvo = evoConfig(inst)
      if (!cfgEvo) {
        await supabase.from('negocios_suhai_state').update({
          etapa_sdr: 'erro',
          finalizado_em: new Date().toISOString(),
          motivo: 'Instância sem evolution_url/api_key',
        }).eq('negocio_id', negocio.id)
        falhas++
        continue
      }

      // Override do agente nessa conversa (não muda o agente padrão da instância)
      await supabase.from('whatsapp_conversa_agentes').upsert({
        instancia_id: inst.id,
        remoto_jid:   ctxCard.jid,
        agente_id:    agente.id,
        agente_ativo: true,
      }, { onConflict: 'instancia_id,remoto_jid' })

      const ctxLead: ContextoLead = { nomeCliente: ctxCard.nome, primeiroNome: primeiroNomeDe(ctxCard.nome) }
      let mensagem = ''
      try {
        mensagem = await gerarMensagem(fluxo, agente, ctxLead, 1)
      } catch (e: any) {
        await supabase.from('negocios_suhai_state').update({
          motivo: `LLM falhou: ${e?.message?.slice(0,140) || 'erro'}`,
        }).eq('negocio_id', negocio.id)
        falhas++
        continue
      }

      const env = await enviarTextoEvoDetalhado(cfgEvo, ctxCard.jid, mensagem)
      if (!env.ok) {
        const detalhe = env.erro ? `erro=${env.erro}` : `HTTP ${env.status}: ${(env.body || '').slice(0,180)}`
        await supabase.from('negocios_suhai_state').update({
          motivo: `Falha 1ª mensagem (Evolution) → jid=${ctxCard.jid} ${detalhe}`,
        }).eq('negocio_id', negocio.id)
        falhas++
        continue
      }

      await supabase.from('whatsapp_mensagens').insert({
        instancia_id: inst.id,
        cliente_id:   negocio.cliente_id || null,
        remoto_jid:   ctxCard.jid,
        remoto_numero: ctxCard.jid.replace(/@.*$/, ''),
        remoto_nome:  ctxCard.nome || null,
        conteudo:     mensagem,
        tipo:         'text',
        direcao:      'enviada',
        lida:         true,
      })

      const agora = new Date()
      const proximaAcao = horarioUtilAdd(agora, fluxo.horas_entre_tentativas)
      await supabase.from('negocios_suhai_state').update({
        etapa_sdr: 'tentativa_1',
        ultima_msg_em: agora.toISOString(),
        proxima_acao_em: proximaAcao.toISOString(),
        instancia_id: inst.id,
        remoto_jid: ctxCard.jid,
        motivo: null,
      }).eq('negocio_id', negocio.id)

      await supabase.from('negocios').update({ etapa: fluxo.etapas_tentativas[0] }).eq('id', negocio.id)
      processados++
    } catch (e) {
      console.error(`[SDR cron] init falhou (fluxo=${fluxo.nome}, negocio=${negocio.id})`, e)
      falhas++
    }
  }
  return { processados, falhas }
}

// ── FOLLOWUP ───────────────────────────────────────────────────────
async function processarFollowupsDoFluxo(fluxo: Fluxo): Promise<{ processados: number; falhas: number }> {
  const supabase = sa()
  const agora = new Date()
  const { data: pendentes } = await supabase.from('negocios_suhai_state')
    .select('*')
    .eq('fluxo_id', fluxo.id)
    .is('finalizado_em', null)
    .lte('proxima_acao_em', agora.toISOString())
    .in('etapa_sdr', ['tentativa_1','tentativa_2','tentativa_3','tentativa_4','tentativa_5','tentativa_6','tentativa_7','tentativa_8','tentativa_9','tentativa_10'])
    .order('proxima_acao_em', { ascending: true })
    .limit(LOTE_FOLLOWUP_POR_FLUXO)

  if (!pendentes?.length) return { processados: 0, falhas: 0 }

  const agente = await carregarAgente(fluxo.agente_id)
  const totalTentativas = fluxo.etapas_tentativas.length
  let processados = 0
  let falhas = 0

  for (const state of pendentes) {
    try {
      const tentativaAtual = parseInt(String(state.etapa_sdr).replace('tentativa_', ''), 10)
      if (!Number.isFinite(tentativaAtual) || tentativaAtual < 1) continue

      const { data: negocio } = await supabase.from('negocios')
        .select('id, etapa, funil_id, vendedor_id, cliente_id, telefone_negocio, titulo, status')
        .eq('id', state.negocio_id).maybeSingle()
      if (!negocio) {
        await supabase.from('negocios_suhai_state').update({
          finalizado_em: agora.toISOString(), motivo: 'Negócio removido',
        }).eq('negocio_id', state.negocio_id)
        continue
      }

      // Card movido manualmente pra fora das etapas do fluxo → encerra
      if (!fluxo.etapas_tentativas.includes((negocio.etapa as string) || '')) {
        await supabase.from('negocios_suhai_state').update({
          etapa_sdr: 'interagiu', finalizado_em: agora.toISOString(),
          motivo: `Etapa alterada manualmente para ${negocio.etapa}`,
        }).eq('negocio_id', state.negocio_id)
        continue
      }

      // Status alterado manualmente (ganho/perdido) → encerra
      if (negocio.status && negocio.status !== 'em_andamento') {
        await supabase.from('negocios_suhai_state').update({
          etapa_sdr: 'interagiu', finalizado_em: agora.toISOString(),
          motivo: `Status alterado manualmente para ${negocio.status}`,
        }).eq('negocio_id', state.negocio_id)
        continue
      }

      // Cliente respondeu desde a última msg (rede de proteção do webhook)
      if (state.instancia_id && state.remoto_jid && state.ultima_msg_em) {
        const { count } = await supabase.from('whatsapp_mensagens')
          .select('id', { count: 'exact', head: true })
          .eq('instancia_id', state.instancia_id)
          .eq('remoto_jid', state.remoto_jid)
          .eq('direcao', 'recebida')
          .gt('created_at', state.ultima_msg_em as string)
        if ((count || 0) > 0) {
          await supabase.from('negocios_suhai_state').update({
            etapa_sdr: 'interagiu', finalizado_em: agora.toISOString(),
            motivo: 'Cliente respondeu (detectado no cron)',
          }).eq('negocio_id', state.negocio_id)
          await supabase.from('negocios').update({ etapa: fluxo.etapa_interacao }).eq('id', negocio.id)
          continue
        }
      }

      // Esgotou as tentativas → marca PERDIDO
      if (tentativaAtual >= totalTentativas) {
        await supabase.from('negocios_suhai_state').update({
          etapa_sdr: 'perdido', finalizado_em: agora.toISOString(),
          motivo: `Sem resposta após ${totalTentativas} tentativas`,
        }).eq('negocio_id', state.negocio_id)
        await supabase.from('negocios').update({
          etapa: fluxo.etapa_perdido, status: 'perdido',
        }).eq('id', negocio.id)
        processados++
        continue
      }

      const proximaN = tentativaAtual + 1
      const proximaEtapaLabel = fluxo.etapas_tentativas[proximaN - 1]

      const inst = await carregarInstanciaDoVendedor(negocio.vendedor_id)
      const cfgEvo = inst ? evoConfig(inst) : null
      if (!inst || !cfgEvo) {
        await criarTarefaSemWhatsApp(negocio.id, negocio.vendedor_id, '', fluxo.nome)
        await supabase.from('negocios_suhai_state').update({
          etapa_sdr: 'sem_whatsapp', finalizado_em: agora.toISOString(),
          motivo: 'WhatsApp do vendedor ficou indisponível durante o fluxo',
        }).eq('negocio_id', state.negocio_id)
        continue
      }
      if (!agente) { falhas++; continue }

      const ctxCard = await carregarContextoCard(negocio)
      const ctxLead: ContextoLead = { nomeCliente: ctxCard.nome, primeiroNome: primeiroNomeDe(ctxCard.nome) }
      let mensagem = ''
      try {
        mensagem = await gerarMensagem(fluxo, agente, ctxLead, proximaN)
      } catch (e: any) {
        await supabase.from('negocios_suhai_state').update({
          motivo: `LLM falhou: ${e?.message?.slice(0,140) || 'erro'}`,
        }).eq('negocio_id', state.negocio_id)
        falhas++
        continue
      }

      const jidAlvo = (state.remoto_jid as string) || ctxCard.jid
      if (!jidAlvo) {
        await supabase.from('negocios_suhai_state').update({
          etapa_sdr: 'sem_telefone', finalizado_em: agora.toISOString(),
          motivo: 'Telefone do card foi removido durante o fluxo',
        }).eq('negocio_id', state.negocio_id)
        continue
      }

      const enviado = await enviarTextoEvo(cfgEvo, jidAlvo, mensagem)
      if (!enviado) {
        await supabase.from('negocios_suhai_state').update({
          motivo: 'Falha ao enviar followup (Evolution API)',
        }).eq('negocio_id', state.negocio_id)
        falhas++
        continue
      }

      await supabase.from('whatsapp_mensagens').insert({
        instancia_id: inst.id,
        cliente_id:   negocio.cliente_id || null,
        remoto_jid:   jidAlvo,
        remoto_numero: jidAlvo.replace(/@.*$/, ''),
        remoto_nome:  ctxCard.nome || null,
        conteudo:     mensagem,
        tipo:         'text',
        direcao:      'enviada',
        lida:         true,
      })

      const proximaAcao = horarioUtilAdd(agora, fluxo.horas_entre_tentativas)
      await supabase.from('negocios_suhai_state').update({
        etapa_sdr: `tentativa_${proximaN}`,
        ultima_msg_em: agora.toISOString(),
        proxima_acao_em: proximaAcao.toISOString(),
        instancia_id: inst.id,
        remoto_jid: jidAlvo,
        motivo: null,
      }).eq('negocio_id', state.negocio_id)

      await supabase.from('negocios').update({ etapa: proximaEtapaLabel }).eq('id', negocio.id)
      processados++
    } catch (e) {
      console.error(`[SDR cron] followup falhou (fluxo=${fluxo.nome}, negocio=${state.negocio_id})`, e)
      falhas++
    }
  }
  return { processados, falhas }
}

async function autorizado(req: NextRequest): Promise<boolean> {
  const secret = process.env.CRON_SECRET || process.env.INTEGRADOR_CRON_SECRET
  if (!secret) return process.env.NODE_ENV !== 'production'
  const auth = req.headers.get('authorization') || ''
  const provided = auth.replace(/^Bearer\s+/i, '').trim()
  if (!provided) return false
  return timingSafeEqualStr(provided, secret)
}

async function handler(req: NextRequest) {
  if (!(await autorizado(req))) {
    return NextResponse.json({ ok: false, erro: 'não autorizado' }, { status: 401 })
  }

  const fluxos = await carregarFluxosAtivos()
  const detalhes: any[] = []
  let totalInits = 0
  let totalFollowups = 0
  let totalFalhas = 0

  const agora = new Date()
  for (const fluxo of fluxos) {
    if (!dentroDaJanelaUtil(agora, fluxo.horario_util_inicio, fluxo.horario_util_fim)) {
      detalhes.push({ fluxo: fluxo.nome, fora_horario: true })
      continue
    }
    const inits     = await processarInitsDoFluxo(fluxo)
    const followups = await processarFollowupsDoFluxo(fluxo)
    totalInits     += inits.processados
    totalFollowups += followups.processados
    totalFalhas    += inits.falhas + followups.falhas
    detalhes.push({ fluxo: fluxo.nome, inits, followups })
  }

  const resumo = {
    ok: true,
    fluxos_ativos: fluxos.length,
    inits: totalInits,
    followups: totalFollowups,
    falhas: totalFalhas,
    detalhes,
    rodou_em: new Date().toISOString(),
  }
  console.log('[SDR cron]', JSON.stringify(resumo))
  return NextResponse.json(resumo)
}

export async function GET(req: NextRequest) { return handler(req) }
export async function POST(req: NextRequest) { return handler(req) }
