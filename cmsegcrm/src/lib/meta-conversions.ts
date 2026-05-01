// Meta Conversions API — eventos de CRM (mudança de status do lead).
// Documentação: https://developers.facebook.com/docs/marketing-api/conversions-api/crm-events
//
// Os campos sensíveis (email, telefone) são hasheados em SHA-256
// ANTES de mandar pra Meta. Lead ID, action_source e custom_data
// ficam em texto puro.

import { createHash } from 'crypto'

export const META_API_VERSION = 'v25.0'

function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex')
}

function normEmail(e?: string | null): string | null {
  if (!e) return null
  return String(e).trim().toLowerCase()
}

function normPhone(p?: string | null): string | null {
  if (!p) return null
  // E.164 sem +: só dígitos. Se tiver 10-11 (BR sem 55), prefixa 55.
  const d = String(p).replace(/\D/g, '')
  if (!d) return null
  if (d.length >= 12) return d
  if (d.length === 10 || d.length === 11) return '55' + d
  return d
}

function normName(n?: string | null): string | null {
  if (!n) return null
  return String(n).trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

function normZip(z?: string | null): string | null {
  if (!z) return null
  const d = String(z).replace(/\D/g, '')
  return d || null
}

interface ClienteParaCAPI {
  email?: string | null
  telefone?: string | null
  nome?: string | null
  cpf_cnpj?: string | null
  cidade?: string | null
  estado?: string | null
  cep?: string | null
  meta_lead_id?: string | null
}

export function montarUserData(c: ClienteParaCAPI) {
  const email = normEmail(c.email)
  const phone = normPhone(c.telefone)
  const partes = (c.nome || '').trim().split(/\s+/)
  const fn = normName(partes[0])
  const ln = normName(partes.length > 1 ? partes[partes.length - 1] : null)
  const ct = normName(c.cidade)
  const st = normName(c.estado)
  const zp = normZip(c.cep)

  const ud: any = {}
  if (email) ud.em = [sha256(email)]
  if (phone) ud.ph = [sha256(phone)]
  if (fn)    ud.fn = [sha256(fn)]
  if (ln)    ud.ln = [sha256(ln)]
  if (ct)    ud.ct = [sha256(ct)]
  if (st)    ud.st = [sha256(st)]
  if (zp)    ud.zp = [sha256(zp)]
  if (c.meta_lead_id) ud.lead_id = c.meta_lead_id
  return ud
}

export interface CrmEventOpts {
  datasetId: string
  accessToken: string
  eventName: string                 // 'Lead', 'MQL', 'SQL', 'Customer', ...
  eventTime?: number                // unix timestamp; default = agora
  cliente?: ClienteParaCAPI | null
  leadEventSource?: string          // nome do nosso CRM
  testEventCode?: string            // se setado, vai pra aba "Test Events"
  customData?: Record<string, any>  // opcional - extras
}

export async function enviarEventoCRM(opts: CrmEventOpts) {
  if (!opts.datasetId)   throw new Error('dataset_id não configurado')
  if (!opts.accessToken) throw new Error('access_token da Meta não configurado')

  const userData = opts.cliente ? montarUserData(opts.cliente) : {}
  const customData = {
    event_source: 'crm',
    lead_event_source: opts.leadEventSource || 'CM Seguros',
    ...(opts.customData || {}),
  }

  const payload: any = {
    data: [
      {
        action_source: 'system_generated',
        event_name:    opts.eventName,
        event_time:    opts.eventTime || Math.floor(Date.now() / 1000),
        custom_data:   customData,
        user_data:     userData,
      },
    ],
  }
  if (opts.testEventCode) payload.test_event_code = opts.testEventCode

  const url = `https://graph.facebook.com/${META_API_VERSION}/${opts.datasetId}/events?access_token=${encodeURIComponent(opts.accessToken)}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(json?.error?.message || `Meta CAPI ${res.status}`)
  }
  return { resposta: json, payload }
}
