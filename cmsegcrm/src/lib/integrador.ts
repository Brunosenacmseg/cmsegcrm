// Helpers do módulo Integrador.
//
// - supabaseAdmin(): client com service role (usado nas rotas /api/integrador/*).
// - generateApiKey(): cria token "cmint_<random>" e retorna {token, hash, prefixo}.
// - hashToken(token): sha256 hex.
// - autenticarApiKey(req): valida header Authorization e devolve a conexão + key.
// - resolverPath(obj, "a.b.c"): dot-notation lookup pra mapeamento de payload.
// - aplicarMapa(payload, mapa): transforma payload externo no formato esperado.
// - dispararWebhooksSaida(evento, payload): envia POST p/ todos os webhooks
//   de saída inscritos no evento, com assinatura HMAC opcional.
// - registrarLog(...): insere em integracoes_logs.

import { createClient, SupabaseClient } from '@supabase/supabase-js'
import * as crypto from 'crypto'

let _admin: SupabaseClient | null = null
export function supabaseAdmin(): SupabaseClient {
  if (!_admin) {
    _admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    )
  }
  return _admin
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

export function generateApiKey() {
  const raw = crypto.randomBytes(24).toString('base64url')
  const token = `cmint_${raw}`
  return {
    token,
    hash: hashToken(token),
    prefixo: token.slice(0, 12),
  }
}

export function generateInboundToken() {
  return crypto.randomBytes(18).toString('base64url')
}

export function generateSecret() {
  return crypto.randomBytes(24).toString('base64url')
}

export type AuthResult =
  | { ok: true; conexaoId: string; keyId: string; escopos: string[] }
  | { ok: false; status: number; erro: string }

export async function autenticarApiKey(req: Request): Promise<AuthResult> {
  const auth = req.headers.get('authorization') || req.headers.get('Authorization') || ''
  const m = auth.match(/^Bearer\s+(.+)$/i)
  const token = m ? m[1].trim() : ''
  if (!token) return { ok: false, status: 401, erro: 'Falta header Authorization: Bearer <token>' }
  const hash = hashToken(token)
  const sa = supabaseAdmin()
  const { data, error } = await sa
    .from('integracoes_api_keys')
    .select('id, conexao_id, escopos, ativa, expira_em, integracoes_conexoes!inner(id, ativo)')
    .eq('token_hash', hash)
    .maybeSingle()
  if (error || !data) return { ok: false, status: 401, erro: 'Token inválido' }
  if (!data.ativa) return { ok: false, status: 401, erro: 'Token desativado' }
  const conexao: any = data.integracoes_conexoes
  if (!conexao?.ativo) return { ok: false, status: 403, erro: 'Conexão desativada' }
  if (data.expira_em && new Date(data.expira_em) < new Date()) {
    return { ok: false, status: 401, erro: 'Token expirado' }
  }
  // não bloqueia a resposta atualizando ultimo_uso
  sa.from('integracoes_api_keys').update({ ultimo_uso: new Date().toISOString() }).eq('id', data.id).then(() => {})
  return {
    ok: true,
    conexaoId: data.conexao_id as string,
    keyId: data.id as string,
    escopos: (data.escopos as string[]) || [],
  }
}

// Resolve "a.b.0.c" em obj.
export function resolverPath(obj: any, path: string): any {
  if (!path) return undefined
  const parts = path.split('.').map(p => p.trim()).filter(Boolean)
  let cur: any = obj
  for (const p of parts) {
    if (cur == null) return undefined
    if (Array.isArray(cur) && /^\d+$/.test(p)) cur = cur[Number(p)]
    else cur = cur[p]
  }
  return cur
}

// mapa: { campoDestino: "caminho.no.payload" | { path, default } }
// Se o valor do mapa começa com "=", trata como literal (ex: "=Lead").
export function aplicarMapa(payload: any, mapa: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {}
  for (const [destino, regra] of Object.entries(mapa || {})) {
    if (typeof regra === 'string') {
      if (regra.startsWith('=')) out[destino] = regra.slice(1)
      else {
        const v = resolverPath(payload, regra)
        if (v !== undefined) out[destino] = v
      }
    } else if (regra && typeof regra === 'object') {
      const v = resolverPath(payload, regra.path)
      out[destino] = v !== undefined ? v : regra.default
    }
  }
  return out
}

export async function registrarLog(args: {
  conexaoId?: string | null
  direcao: 'in' | 'out'
  recurso?: string
  evento?: string
  status?: 'ok' | 'erro'
  http_status?: number
  payload?: any
  resposta?: any
  erro?: string | null
}) {
  try {
    await supabaseAdmin().from('integracoes_logs').insert({
      conexao_id: args.conexaoId ?? null,
      direcao: args.direcao,
      recurso: args.recurso ?? null,
      evento: args.evento ?? null,
      status: args.status ?? 'ok',
      http_status: args.http_status ?? null,
      payload: args.payload ?? null,
      resposta: args.resposta ?? null,
      erro: args.erro ?? null,
    })
  } catch {
    // log de log não pode quebrar fluxo
  }
}

export const EVENTOS_DISPONIVEIS = [
  'negocio.criado',
  'negocio.atualizado',
  'negocio.etapa_alterada',
  'negocio.ganho',
  'negocio.perdido',
  'cliente.criado',
  'cliente.atualizado',
  'tarefa.criada',
  'tarefa.concluida',
  'nota.criada',
] as const
export type EventoIntegrador = (typeof EVENTOS_DISPONIVEIS)[number]

// Dispara POST pra todos os webhooks de saída inscritos no evento.
// Não bloqueia o caller — chame com `void dispararWebhooksSaida(...)`.
export async function dispararWebhooksSaida(evento: EventoIntegrador, payload: any) {
  try {
    const sa = supabaseAdmin()
    const { data: hooks } = await sa
      .from('integracoes_webhooks_out')
      .select('id, conexao_id, url, secret, eventos, ativo')
      .eq('ativo', true)
      .contains('eventos', [evento])
    if (!hooks?.length) return
    const body = JSON.stringify({ evento, dados: payload, criado_em: new Date().toISOString() })
    await Promise.all(hooks.map(async (h: any) => {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Cm-Event': evento,
        'X-Cm-Webhook-Id': h.id,
      }
      if (h.secret) {
        headers['X-Cm-Signature'] = crypto.createHmac('sha256', h.secret).update(body).digest('hex')
      }
      let httpStatus = 0
      let okStatus: 'ok' | 'erro' = 'ok'
      let respText = ''
      let errMsg: string | null = null
      try {
        const r = await fetch(h.url, {
          method: 'POST', headers, body,
          signal: AbortSignal.timeout(10_000),
        })
        httpStatus = r.status
        respText = (await r.text().catch(() => '')).slice(0, 4000)
        if (!r.ok) okStatus = 'erro'
      } catch (e: any) {
        okStatus = 'erro'
        errMsg = e?.message || String(e)
      }
      await sa.from('integracoes_webhooks_out').update({
        ultimo_envio: new Date().toISOString(),
        ultimo_status: httpStatus,
      }).eq('id', h.id)
      await registrarLog({
        conexaoId: h.conexao_id,
        direcao: 'out',
        recurso: `webhook_out:${h.id}`,
        evento,
        status: okStatus,
        http_status: httpStatus || undefined,
        payload,
        resposta: respText ? { body: respText } : undefined,
        erro: errMsg,
      })
    }))
  } catch {
    // engole — webhooks não devem quebrar o fluxo principal
  }
}
