// Helper genérico pra exportar uma lista de objetos como planilha XLSX.
// Carrega o xlsx do CDN sob demanda (evita bundle pesado).

declare global { interface Window { XLSX: any } }

import { createClient } from '@/lib/supabase/client'

// Garante que apenas admin consiga exportar. Usar antes de chamar
// exportarXLSX em telas que mostram dados sensíveis. Faz verificação
// no banco (não confia em cache local de role).
export async function podeExportar(): Promise<{ ok: boolean; motivo?: string }> {
  if (typeof window === 'undefined') return { ok: false, motivo: 'SSR' }
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { ok: false, motivo: 'Não autenticado' }
    const { data } = await supabase.from('users').select('role').eq('id', user.id).single() as any
    if (data?.role !== 'admin') return { ok: false, motivo: 'Apenas administradores podem exportar dados' }
    return { ok: true }
  } catch (e: any) {
    return { ok: false, motivo: e?.message || 'Erro ao verificar permissão' }
  }
}

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
  // Bloqueia não-admins. O endpoint server-side ainda confia em RLS, mas
  // este check é ux-first: evita o usuário gastar tempo gerando arquivo
  // que não vai ser usado.
  const guard = await podeExportar()
  if (!guard.ok) {
    if (typeof window !== 'undefined') window.alert(guard.motivo || 'Sem permissão para exportar')
    return
  }
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
