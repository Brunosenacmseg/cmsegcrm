// Helper genérico pra exportar uma lista de objetos como planilha XLSX.
// Carrega o xlsx do CDN sob demanda (evita bundle pesado).

declare global { interface Window { XLSX: any } }

async function ensureXLSX() {
  if (typeof window === 'undefined') return
  if (window.XLSX) return
  await new Promise<void>((res, rej) => {
    const s = document.createElement('script')
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
    s.onload = () => res(); s.onerror = rej
    document.head.appendChild(s)
  })
}

type Coluna<T> = { campo: keyof T | string; titulo: string; fmt?: (v: any, row: T) => any }

export async function exportarXLSX<T extends Record<string, any>>(
  linhas: T[],
  colunas: Coluna<T>[],
  nomeArquivo = 'export'
) {
  await ensureXLSX()
  const dados = linhas.map(r => {
    const out: Record<string, any> = {}
    for (const c of colunas) {
      const raw = (r as any)[c.campo]
      out[c.titulo] = c.fmt ? c.fmt(raw, r) : raw ?? ''
    }
    return out
  })
  const ws = window.XLSX.utils.json_to_sheet(dados)
  const wb = window.XLSX.utils.book_new()
  window.XLSX.utils.book_append_sheet(wb, ws, 'Dados')
  const stamp = new Date().toISOString().slice(0, 10)
  window.XLSX.writeFile(wb, `${nomeArquivo}_${stamp}.xlsx`)
}

export const fmt = {
  data: (v: any) => v ? new Date(v).toLocaleDateString('pt-BR') : '',
  dataHora: (v: any) => v ? new Date(v).toLocaleString('pt-BR') : '',
  brl: (v: any) => {
    const n = Number(v); if (!isFinite(n)) return ''
    return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  },
}
