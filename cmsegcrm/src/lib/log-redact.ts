// Helpers para escrever logs sem vazar dados pessoais (LGPD).
// Use redactEmail, redactPhone, redactCpf, redactObj antes de console.log.

export function redactEmail(v?: string | null): string {
  if (!v) return ''
  const s = String(v)
  const m = s.match(/^([^@]{1,3})[^@]*@(.+)$/)
  return m ? `${m[1]}***@${m[2]}` : '***'
}

export function redactPhone(v?: string | null): string {
  if (!v) return ''
  const d = String(v).replace(/\D/g, '')
  if (d.length < 6) return '***'
  return `${d.slice(0, 2)}*****${d.slice(-2)}`
}

export function redactDoc(v?: string | null): string {
  if (!v) return ''
  const d = String(v).replace(/\D/g, '')
  if (d.length < 4) return '***'
  return `${d.slice(0, 2)}***${d.slice(-2)}`
}

const SENSIBLES = new Set([
  'email','e_mail','emails',
  'telefone','phone','phones','celular','whatsapp','numero',
  'cpf','cnpj','cpf_cnpj','documento','rg',
  'pass','password','senha','token','access_token','refresh_token','apikey','api_key','authorization',
  'pix','conta','agencia','iban','cartao','cvv',
])

function redactValue(key: string, v: any): any {
  const k = key.toLowerCase()
  if (SENSIBLES.has(k)) {
    if (k.includes('email')) return redactEmail(v)
    if (k.includes('phone') || k.includes('telefone') || k.includes('celular') || k.includes('numero') || k.includes('whatsapp')) return redactPhone(v)
    if (k.includes('cpf') || k.includes('cnpj') || k.includes('documento') || k.includes('rg')) return redactDoc(v)
    return '***'
  }
  return v
}

// Redator recursivo: substitui valores em chaves sensíveis (até 4 níveis).
export function redactObj(v: any, depth = 0): any {
  if (depth > 4) return '[depth>4]'
  if (v == null) return v
  if (Array.isArray(v)) return v.map(x => redactObj(x, depth + 1))
  if (typeof v !== 'object') return v
  const out: Record<string, any> = {}
  for (const [k, val] of Object.entries(v)) {
    out[k] = typeof val === 'object' && val !== null ? redactObj(redactValue(k, val), depth + 1) : redactValue(k, val)
  }
  return out
}
