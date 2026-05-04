// Helpers compartilhados pelos parsers de PDF de apólice de cada seguradora.
// Mantém o código de parsing por seguradora limpo (norm, datas, valores BR, etc.).

export const norm = (s: string) =>
  s.toLowerCase()
   .normalize('NFD')
   .replace(/[̀-ͯ]/g, '')
   .replace(/\s+/g, ' ')
   .trim()

export function toIso(d: string | null | undefined): string | null {
  if (!d) return null
  const m = d.match(/(\d{2})\/(\d{2})\/(\d{4})/)
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null
}

// Aceita "1.234,56" (BR) ou "1234.56" (US) ou só dígitos.
export function brNum(s: string | null | undefined): number | null {
  if (s == null) return null
  let t = String(s).replace(/[R$\s%]/g, '')
  if (!t) return null
  if (t.includes(',')) {
    t = t.replace(/\./g, '').replace(',', '.')
  } else if ((t.match(/\./g) || []).length > 1) {
    // 1.003.110 → 1003110
    t = t.replace(/\./g, '')
  } else if (/\.\d{3,}$/.test(t)) {
    t = t.replace(/\./g, '')
  }
  const n = Number(t)
  return isFinite(n) ? n : null
}

export function clean(s: string | null | undefined): string | null {
  if (s == null) return null
  const t = s.replace(/\s+/g, ' ').trim()
  return t === '' ? null : t
}

export function simNao(s: string | null | undefined): string | null {
  if (!s) return null
  if (/n[aã]o/i.test(s)) return 'Não'
  if (/sim/i.test(s)) return 'Sim'
  return clean(s)
}

// Captura todos os números BR do texto na ordem em que aparecem.
export function listBrNumbers(s: string): number[] {
  return [...s.matchAll(/(\d{1,3}(?:\.\d{3})*,\d{2})/g)]
    .map(m => brNum(m[1]))
    .filter((n): n is number => n != null)
}

// Quebra o texto em seções pelos cabeçalhos fornecidos. Cada item tem `key`
// e a regex que identifica o cabeçalho. Retorna { key: textoDaSecao }.
export function splitSections(
  text: string,
  headers: { key: string; re: RegExp }[],
): Record<string, string> {
  const positions: { key: string; pos: number }[] = []
  for (const h of headers) {
    const m = h.re.exec(text)
    if (m) positions.push({ key: h.key, pos: m.index })
  }
  positions.sort((a, b) => a.pos - b.pos)
  const out: Record<string, string> = {}
  for (let i = 0; i < positions.length; i++) {
    const start = positions[i].pos
    const end = i + 1 < positions.length ? positions[i + 1].pos : text.length
    out[positions[i].key] = text.slice(start, end)
  }
  return out
}

// Pega o primeiro grupo capturado de uma regex (ou null).
export function reFirst(re: RegExp, src: string): string | null {
  return re.exec(src)?.[1]?.trim() ?? null
}

// Captura primeiro CPF (ou CNPJ se for PJ) do bloco. Devolve só dígitos.
export function pickDocFromBlock(block: string): string | null {
  const cnpjFmt = block.match(/\b(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})\b/)?.[1]
  if (cnpjFmt) return cnpjFmt.replace(/\D/g, '')
  const cpfFmt = block.match(/\b(\d{3}\.\d{3}\.\d{3}-\d{2})\b/)?.[1]
  if (cpfFmt) return cpfFmt.replace(/\D/g, '')
  const cnpj = block.match(/(?<!\d)(\d{14})(?!\d)/)?.[1]
  if (cnpj) return cnpj
  const cpf = block.match(/(?<!\d)(\d{11})(?!\d)/)?.[1]
  if (cpf) return cpf
  return null
}

// Captura primeiro e-mail do bloco.
export function pickEmail(block: string): string | null {
  return block.match(/([\w.\-+]+@[\w.\-]+\.[A-Za-z]{2,})/)?.[1] ?? null
}

// Captura telefone BR (com ou sem DDD/parênteses). Devolve formatado.
export function pickTelefone(block: string): string | null {
  const m = block.match(/\(?\s*(\d{2})\s*\)?\s*9?\s*(\d{4,5}-?\d{4})/)
  if (!m) return null
  return `(${m[1]}) ${m[2]}`
}

// Captura primeiro CEP (com ou sem hífen). Devolve com hífen.
export function pickCep(block: string): string | null {
  const m = block.match(/\b(\d{5})-?(\d{3})\b/)
  return m ? `${m[1]}-${m[2]}` : null
}

// Captura placa BR. Aceita padrão antigo (ABC1234) e Mercosul (ABC1D23).
export function pickPlaca(block: string): string | null {
  const m = block.match(/\b([A-Z]{3}\s?-?\s?\d[A-Z0-9]\d{2})\b/)
  if (m) return m[1].replace(/[\s-]/g, '').toUpperCase()
  return null
}

// Captura chassi (17 caracteres alfanuméricos sem I, O ou Q).
export function pickChassi(block: string): string | null {
  const m = block.match(/\b([A-HJ-NPR-Z0-9]{17})\b/)
  return m ? m[1].toUpperCase() : null
}

// Captura intervalo "DD/MM/AAAA até DD/MM/AAAA" (vigência). Retorna {ini, fim} ISO.
// IMPORTANTE: usa `[^/\n]` em vez de `[^\d]` entre as datas para tolerar números
// no meio do texto (ex.: "11/03/2026 às 24H de 11/03/2027" — "24" é dígito).
export function pickVigencia(text: string): { ini: string | null; fim: string | null } {
  const re = /(\d{2}\/\d{2}\/\d{4})[^/\n]{1,80}?(\d{2}\/\d{2}\/\d{4})/
  const m = re.exec(text)
  return { ini: toIso(m?.[1]), fim: toIso(m?.[2]) }
}

// Procura uma data isolada (DD/MM/AAAA).
export function pickDate(text: string): string | null {
  const m = text.match(/(\d{2}\/\d{2}\/\d{4})/)
  return toIso(m?.[1])
}

// Trunca o texto bruto pra cair na coluna pdf_texto_bruto (~6KB).
export function truncateText(s: string, max = 6000): string {
  return s.length > max ? s.slice(0, max) + '\n…[truncado]' : s
}

// Captura o nº de processo SUSEP (formato XXXXX.XXXXXX/AAAA-XX).
export function pickProcessoSusep(text: string): string | null {
  return text.match(/\b(\d{5}\.\d{6}\/\d{4}-\d{2})\b/)?.[1] ?? null
}

// Tipo padrão devolvido pelos parsers individuais.
export type ApoliceRow = Record<string, any>
