// Cron do SDR SUHAI: roda a cada minuto via Vercel Cron.
//
// Faz duas coisas em sequência:
//   1) INIT: pra cada negócio em META + MULTICANAL ainda sem
//      negocios_suhai_state, ativa o agente "Marcelo Cunha SDR" no
//      WhatsApp do vendedor responsável, gera 1ª mensagem via LLM,
//      envia, move pra TENTATIVA 1 e agenda próxima ação em +4h úteis.
//   2) FOLLOWUP: pra cada state com proxima_acao_em <= now() ainda
//      ativo (sem resposta), avança Tentativa 1→2→3 ou marca PERDIDO
//      se já estava em 3.
//
// Detecção de resposta NÃO é responsabilidade desse cron — quando o
// cliente responde via WhatsApp, o webhook /api/whatsapp/webhook
// detecta, move pra INTERAÇÃO e marca o state como "interagiu".
//
// Auth: header Authorization: Bearer <CRON_SECRET>. No Vercel Cron,
// o header é injetado automaticamente quando se define a env CRON_SECRET.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import type { Database } from '@/lib/supabase/database.types'
import { chamarChatGPT } from '@/lib/openai'
import { enviarTextoEvo, numeroParaJid } from '@/lib/whatsapp-evo'
import { horarioUtilAdd } from '@/lib/horario-util'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const FUNIL_ALVO_LIKE = '%meta%multicanal%'
const ETAPAS = {
  TENTATIVA_1: 'TENTATIVA 1',
  TENTATIVA_2: 'TENTATIVA 2',
  TENTATIVA_3: 'TENTATIVA 3',
  INTERACAO:   'INTERAÇÃO',
  PERDIDO:     'PERDIDO',
} as const
const HORAS_FOLLOWUP = 4
const LOTE_INIT     = 20
const LOTE_FOLLOWUP = 20

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

interface EvoConfigCompleta {
  evo_url: string
  api_key: string
  instance: string
}

interface ContextoSDR {
  nomeCliente: string
  primeiroNome: string
}

function primeiroNomeDe(nome: string | null | undefined): string {
  if (!nome) return ''
  return String(nome).trim().split(/\s+/)[0] || ''
}

// Compõe a "user message" que vamos passar pro LLM dependendo da etapa
// atual do SDR. O system_prompt do agente já carrega a personalidade.
function promptDoTurno(etapaAlvo: 'tentativa_1'|'tentativa_2'|'tentativa_3', ctx: ContextoSDR): string {
  const nome = ctx.primeiroNome || ctx.nomeCliente || 'lead'
  if (etapaAlvo === 'tentativa_1') {
    return `Inicie o contato com o lead "${nome}". Apresente-se brevemente como Marcelo Cunha da CM Seguros e pergunte sobre o veículo (modelo + ano) que ele quer cotar no SUHAI.`
  }
  if (etapaAlvo === 'tentativa_2') {
    return `O lead "${nome}" não respondeu sua primeira mensagem. Mande um followup gentil, sem pressão, lembrando que está disponível pra ajudar.`
  }
  return `O lead "${nome}" segue sem responder. Mande uma mensagem curta, dizendo que vai aguardar contato dele quando puder, sem cobrança.`
}

async function carregarAgente() {
  const { data } = await sa().from('ai_agentes').select('*').eq('nome', 'Marcelo Cunha SDR').eq('ativo', true).maybeSingle()
  return data
}

async function carregarInstanciaDoVendedor(vendedorId: string | null | undefined) {
  if (!vendedorId) return null
  const { data } = await sa().from('whatsapp_instancias')
    .select('*').eq('user_id', vendedorId).maybeSingle()
  if (!data) return null
  // status 'connected' ou pelo menos com nome+credenciais; senão, sem WhatsApp.
  if (data.status !== 'connected' || !data.nome) return null
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
  // Nome: cliente.nome > negocio.titulo
  // Telefone: telefone_negocio > cliente.telefone
  let nome = ''
  let telefone = (negocio.telefone_negocio as string | null) || ''
  if (negocio.cliente_id) {
    const { data: cli } = await sa().from('clientes').select('nome, telefone').eq('id', negocio.cliente_id).maybeSingle()
    if (cli?.nome) nome = cli.nome
    if (!telefone && cli?.telefone) telefone = cli.telefone
  }
  if (!nome) nome = (negocio.titulo as string) || ''
  const jid = numeroParaJid(telefone)
  return { nome, jid }
}

async function criarTarefaSemWhatsApp(negocioId: string, vendedorId: string | null, nomeCliente: string) {
  await sa().from('tarefas').insert({
    titulo: 'Conectar WhatsApp para SDR SUHAI',
    descricao: `O lead ${nomeCliente || ''} entrou no funil META + MULTICANAL mas seu WhatsApp não está conectado. Conecte em /dashboard/whatsapp ou faça o primeiro contato manualmente.`,
    tipo: 'tarefa',
    status: 'pendente',
    negocio_id: negocioId,
    responsavel_id: vendedorId,
    prazo: new Date(Date.now() + 24*60*60*1000).toISOString(),
  })
}

// ── INIT: leads novos no funil ────────────────────────────────────
async function processarInits(): Promise<{ processados: number; falhas: number }> {
  const supabase = sa()
  // Pega negocios em META+MULTICANAL que ainda não têm linha em
  // negocios_suhai_state. LEFT JOIN não é trivial via PostgREST, então
  // pegamos as duas listas e diff em memória — basta por hora.
  const { data: funis } = await supabase.from('funis').select('id, nome').ilike('nome', FUNIL_ALVO_LIKE)
  if (!funis?.length) return { processados: 0, falhas: 0 }
  const funilIds = funis.map(f => f.id)

  // Negócios candidatos: ativos no funil alvo, sem state ainda. Como o
  // backfill da migration insere row pra todo histórico, só caem aqui
  // os criados depois do deploy.
  const { data: candidatos } = await supabase
    .from('negocios')
    .select('id, titulo, etapa, funil_id, vendedor_id, cliente_id, telefone_negocio, status')
    .in('funil_id', funilIds)
    .or('status.is.null,status.eq.aberto')
    .order('created_at', { ascending: true })
    .limit(LOTE_INIT * 3) // sobre-amostra; filtra os que já têm state abaixo

  if (!candidatos?.length) return { processados: 0, falhas: 0 }

  const { data: comState } = await supabase.from('negocios_suhai_state')
    .select('negocio_id').in('negocio_id', candidatos.map(c => c.id))
  const idsComState = new Set((comState || []).map(s => s.negocio_id))
  const novos = candidatos.filter(n => !idsComState.has(n.id)).slice(0, LOTE_INIT)

  if (!novos.length) return { processados: 0, falhas: 0 }

  const agente = await carregarAgente()
  let processados = 0
  let falhas = 0

  for (const negocio of novos) {
    try {
      // Reserva otimista — insere row pendente. Se outro cron já reservou,
      // o conflito de PK aborta esse loop iterativo.
      const { error: reservaErr } = await supabase.from('negocios_suhai_state').insert({
        negocio_id: negocio.id,
        etapa_sdr: 'pendente',
      })
      if (reservaErr) { continue } // já reservado por outro processo

      const ctxCard = await carregarContextoCard(negocio)
      const inst    = await carregarInstanciaDoVendedor(negocio.vendedor_id)

      // Sem telefone → finaliza com motivo
      if (!ctxCard.jid) {
        await supabase.from('negocios_suhai_state').update({
          etapa_sdr: 'sem_telefone', finalizado_em: new Date().toISOString(),
          motivo: 'Card sem telefone para contato',
        }).eq('negocio_id', negocio.id)
        continue
      }

      // Sem WhatsApp do vendedor → cria tarefa avisando e finaliza
      if (!inst) {
        await criarTarefaSemWhatsApp(negocio.id, negocio.vendedor_id, ctxCard.nome)
        await supabase.from('negocios_suhai_state').update({
          etapa_sdr: 'sem_whatsapp', finalizado_em: new Date().toISOString(),
          motivo: 'Vendedor responsável sem WhatsApp conectado (tarefa criada)',
        }).eq('negocio_id', negocio.id)
        continue
      }

      // Sem agente cadastrado → erro persistente, marca e segue
      if (!agente) {
        await supabase.from('negocios_suhai_state').update({
          etapa_sdr: 'erro', finalizado_em: new Date().toISOString(),
          motivo: 'Agente "Marcelo Cunha SDR" não encontrado em ai_agentes',
        }).eq('negocio_id', negocio.id)
        falhas++
        continue
      }

      const cfgEvo = evoConfig(inst)
      if (!cfgEvo) {
        await supabase.from('negocios_suhai_state').update({
          etapa_sdr: 'erro', finalizado_em: new Date().toISOString(),
          motivo: 'Instância sem evolution_url/api_key',
        }).eq('negocio_id', negocio.id)
        falhas++
        continue
      }

      // Override do agente nessa conversa específica
      await supabase.from('whatsapp_conversa_agentes').upsert({
        instancia_id: inst.id,
        remoto_jid:   ctxCard.jid,
        agente_id:    agente.id,
        agente_ativo: true,
      }, { onConflict: 'instancia_id,remoto_jid' })

      // Gera primeira mensagem via LLM
      const ctx: ContextoSDR = { nomeCliente: ctxCard.nome, primeiroNome: primeiroNomeDe(ctxCard.nome) }
      let mensagem = ''
      try {
        mensagem = await chamarChatGPT({
          modelo: agente.modelo,
          systemPrompt: agente.system_prompt,
          mensagem: promptDoTurno('tentativa_1', ctx),
          maxTokens: agente.max_tokens || 500,
          temperatura: Number(agente.temperatura) || 0.7,
        })
      } catch (e: any) {
        // LLM down: deixa pendente pra próxima rodada (não finaliza)
        await supabase.from('negocios_suhai_state').update({
          motivo: `LLM falhou: ${e?.message?.slice(0,140) || 'erro'}`,
        }).eq('negocio_id', negocio.id)
        falhas++
        continue
      }

      const enviado = await enviarTextoEvo(cfgEvo, ctxCard.jid, mensagem)
      if (!enviado) {
        await supabase.from('negocios_suhai_state').update({
          motivo: 'Falha ao enviar primeira mensagem (Evolution API)',
        }).eq('negocio_id', negocio.id)
        falhas++
        continue
      }

      // Salva mensagem no histórico
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

      // Atualiza estado + move negocio pra TENTATIVA 1
      const agora = new Date()
      const proximaAcao = horarioUtilAdd(agora, HORAS_FOLLOWUP)
      await supabase.from('negocios_suhai_state').update({
        etapa_sdr: 'tentativa_1',
        ultima_msg_em: agora.toISOString(),
        proxima_acao_em: proximaAcao.toISOString(),
        instancia_id: inst.id,
        remoto_jid: ctxCard.jid,
        motivo: null,
      }).eq('negocio_id', negocio.id)

      await supabase.from('negocios').update({ etapa: ETAPAS.TENTATIVA_1 }).eq('id', negocio.id)
      processados++
    } catch (e) {
      console.error('[SUHAI cron] init falhou', negocio.id, e)
      falhas++
    }
  }

  return { processados, falhas }
}

// ── FOLLOWUP: avança tentativas / marca perdido ────────────────────
async function processarFollowups(): Promise<{ processados: number; falhas: number }> {
  const supabase = sa()
  const agora = new Date()

  const { data: pendentes } = await supabase.from('negocios_suhai_state')
    .select('*')
    .is('finalizado_em', null)
    .lte('proxima_acao_em', agora.toISOString())
    .in('etapa_sdr', ['tentativa_1', 'tentativa_2', 'tentativa_3'])
    .order('proxima_acao_em', { ascending: true })
    .limit(LOTE_FOLLOWUP)

  if (!pendentes?.length) return { processados: 0, falhas: 0 }

  const agente = await carregarAgente()
  let processados = 0
  let falhas = 0

  for (const state of pendentes) {
    try {
      // Carrega negócio (pode ter sido movido manualmente)
      const { data: negocio } = await supabase.from('negocios')
        .select('id, etapa, funil_id, vendedor_id, cliente_id, telefone_negocio, titulo, status')
        .eq('id', state.negocio_id).maybeSingle()
      if (!negocio) {
        await supabase.from('negocios_suhai_state').update({
          finalizado_em: agora.toISOString(), motivo: 'Negócio removido',
        }).eq('negocio_id', state.negocio_id)
        continue
      }

      // Se humano moveu o card pra fora do fluxo SDR, encerra silencioso.
      const etapasSdr: string[] = [ETAPAS.TENTATIVA_1, ETAPAS.TENTATIVA_2, ETAPAS.TENTATIVA_3]
      if (!etapasSdr.includes((negocio.etapa as string) || '')) {
        await supabase.from('negocios_suhai_state').update({
          etapa_sdr: 'interagiu',
          finalizado_em: agora.toISOString(),
          motivo: `Etapa alterada manualmente para ${negocio.etapa}`,
        }).eq('negocio_id', state.negocio_id)
        continue
      }

      // Verifica se cliente respondeu desde a última msg. Se sim, encerra
      // (o webhook deveria ter detectado, mas servimos como rede de proteção).
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
          await supabase.from('negocios').update({ etapa: ETAPAS.INTERACAO }).eq('id', negocio.id)
          continue
        }
      }

      // Se já estava em Tentativa 3 sem resposta → PERDIDO
      if (state.etapa_sdr === 'tentativa_3') {
        await supabase.from('negocios_suhai_state').update({
          etapa_sdr: 'perdido', finalizado_em: agora.toISOString(),
          motivo: 'Sem resposta após 3 tentativas',
        }).eq('negocio_id', state.negocio_id)
        await supabase.from('negocios').update({
          etapa: ETAPAS.PERDIDO, status: 'perdido',
        }).eq('id', negocio.id)
        processados++
        continue
      }

      // Caso contrário, avança Tentativa N → N+1
      const proximaEtapa = state.etapa_sdr === 'tentativa_1' ? 'tentativa_2' : 'tentativa_3'
      const promptStage = proximaEtapa
      const proximaEtapaLabel = proximaEtapa === 'tentativa_2' ? ETAPAS.TENTATIVA_2 : ETAPAS.TENTATIVA_3

      // Recarrega instância (pode ter desconectado)
      const inst = await carregarInstanciaDoVendedor(negocio.vendedor_id)
      const cfgEvo = inst ? evoConfig(inst) : null
      if (!inst || !cfgEvo) {
        // Vendedor desconectou — encerra com tarefa
        await criarTarefaSemWhatsApp(negocio.id, negocio.vendedor_id, '')
        await supabase.from('negocios_suhai_state').update({
          etapa_sdr: 'sem_whatsapp', finalizado_em: agora.toISOString(),
          motivo: 'WhatsApp do vendedor ficou indisponível durante o fluxo',
        }).eq('negocio_id', state.negocio_id)
        continue
      }

      if (!agente) {
        falhas++
        continue
      }

      // Reabastece contexto
      const ctxCard = await carregarContextoCard(negocio)
      const ctx: ContextoSDR = { nomeCliente: ctxCard.nome, primeiroNome: primeiroNomeDe(ctxCard.nome) }

      let mensagem = ''
      try {
        mensagem = await chamarChatGPT({
          modelo: agente.modelo,
          systemPrompt: agente.system_prompt,
          mensagem: promptDoTurno(promptStage, ctx),
          maxTokens: agente.max_tokens || 500,
          temperatura: Number(agente.temperatura) || 0.7,
        })
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

      const proximaAcao = horarioUtilAdd(agora, HORAS_FOLLOWUP)
      await supabase.from('negocios_suhai_state').update({
        etapa_sdr: proximaEtapa,
        ultima_msg_em: agora.toISOString(),
        proxima_acao_em: proximaAcao.toISOString(),
        instancia_id: inst.id,
        remoto_jid: jidAlvo,
        motivo: null,
      }).eq('negocio_id', state.negocio_id)

      await supabase.from('negocios').update({ etapa: proximaEtapaLabel }).eq('id', negocio.id)
      processados++
    } catch (e) {
      console.error('[SUHAI cron] followup falhou', state.negocio_id, e)
      falhas++
    }
  }

  return { processados, falhas }
}

async function autorizado(req: NextRequest): Promise<boolean> {
  const secret = process.env.CRON_SECRET || process.env.INTEGRADOR_CRON_SECRET
  if (!secret) {
    // Sem segredo configurado: aceita só em dev (sem deploy seguro).
    return process.env.NODE_ENV !== 'production'
  }
  const auth = req.headers.get('authorization') || ''
  const provided = auth.replace(/^Bearer\s+/i, '').trim()
  if (!provided) return false
  return timingSafeEqualStr(provided, secret)
}

async function handler(req: NextRequest) {
  if (!(await autorizado(req))) {
    return NextResponse.json({ ok: false, erro: 'não autorizado' }, { status: 401 })
  }
  const inits     = await processarInits()
  const followups = await processarFollowups()
  return NextResponse.json({
    ok: true,
    inits,
    followups,
    rodou_em: new Date().toISOString(),
  })
}

export async function GET(req: NextRequest) { return handler(req) }
export async function POST(req: NextRequest) { return handler(req) }
