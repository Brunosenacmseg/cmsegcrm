'use client'
// Importador de planilha (xlsx) para o módulo financeiro/DRE.
//
// Aceita dois formatos:
//
// DESPESAS — colunas (na ordem): Descrição (com código no início, ex "2.1.01 PAGAMENTO X"),
//   Tipo despesa (FIXA/VARIÁVEL), Forma pgto, Condição, Data Venc (dd/mm/aa),
//   Data pgto (dd/mm/aa ou dd/mm), Programado, Real, Situação
//
// FATURAMENTO — colunas: Código seguradora (ex "3.1.20"), Bruto, IR retido, Líquido
//   (Líquido é opcional; se vazio, IR retido = 0). Competência inferida do nome da aba
//   (ex "2026-04") ou do campo no formulário.

import { useState } from 'react'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase/client'

function parseDate(v: any, fallbackYear?: string, fallbackMonth?: string): string | null {
  if (!v) return null
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  const t = String(v).trim()
  if (!t) return null
  let m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3]
    return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  }
  m = t.match(/^(\d{1,2})\/(\d{1,2})$/)
  if (m && fallbackYear) return `${fallbackYear}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10)
  return null
}

function parseBRL(v: any): number {
  if (v == null || v === '') return 0
  if (typeof v === 'number') return v
  let s = String(v).replace(/R\$/g, '').replace(/\s/g, '').trim()
  if (!s || s === '-') return 0
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.')
  const n = parseFloat(s)
  return isNaN(n) ? 0 : n
}

function splitCode(desc: string) {
  const t = String(desc || '').trim().replace(/\bMPRESA\b/g, 'EMPRESA')
  let m = t.match(/^(\d+\.\d+\.\d+)\s+(.+)$/)
  if (m) return { codigo: m[1], descricao: m[2].trim() }
  m = t.match(/^(\d+\.\d+)\s+(.+)$/)
  if (m) {
    const codigo = m[1] === '5.4' ? '5.4.01' : `${m[1]}.01`
    return { codigo, descricao: m[2].trim() }
  }
  return { codigo: null as string | null, descricao: t }
}

function inferCompetencia(sheetName: string): string | null {
  const m = sheetName.match(/(\d{4})[-_/](\d{1,2})/) || sheetName.match(/(\d{1,2})[-_/](\d{4})/)
  if (!m) return null
  const a = m[1].length === 4 ? m[1] : m[2]
  const b = m[1].length === 4 ? m[2] : m[1]
  return `${a}-${b.padStart(2, '0')}`
}

function ultimoDiaDoMes(competencia: string): string {
  const [y, m] = competencia.split('-').map(Number)
  const d = new Date(y, m, 0).getDate()
  return `${competencia}-${String(d).padStart(2, '0')}`
}

export default function ImportarPlanilhaButton({ onSuccess }: { onSuccess?: () => void }) {
  const supabase = createClient()
  const [open, setOpen] = useState(false)
  const [arquivoDespesas, setArquivoDespesas] = useState<File | null>(null)
  const [arquivoFaturamento, setArquivoFaturamento] = useState<File | null>(null)
  const [competenciaDefault, setCompetenciaDefault] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [resultado, setResultado] = useState<any>(null)

  async function lerDespesas(file: File): Promise<any[]> {
    const buf = await file.arrayBuffer()
    const wb = XLSX.read(buf, { type: 'array', cellDates: true })
    const todas: any[] = []
    for (const sheetName of wb.SheetNames) {
      const sheet = wb.Sheets[sheetName]
      const rows = XLSX.utils.sheet_to_json<any>(sheet, { header: 1, defval: '' }) as any[][]
      const compSheet = inferCompetencia(sheetName) || competenciaDefault
      // skip header row se primeira coluna parecer "Descrição"
      const start = rows[0] && /descri[cç]/i.test(String(rows[0][0])) ? 1 : 0
      for (let i = start; i < rows.length; i++) {
        const r = rows[i]
        if (!r || !r[0]) continue
        const valor = parseBRL(r[7])
        if (valor <= 0) continue
        const venc = parseDate(r[4])
        const fyYear = venc?.slice(0, 4) || compSheet?.slice(0, 4)
        const fyMonth = venc?.slice(5, 7) || compSheet?.slice(5, 7)
        const pgto = parseDate(r[5], fyYear, fyMonth)
        const { codigo, descricao } = splitCode(String(r[0]))
        todas.push({
          codigo, descricao,
          tipo_despesa: String(r[1] || '').toUpperCase().startsWith('FIX') ? 'FIXA' : 'VARIÁVEL',
          forma_pagto: String(r[2] || '').trim() || null,
          condicao: String(r[3] || '').trim() || null,
          data_vencimento: venc, data_pgto: pgto,
          valor_previsto: parseBRL(r[6]) || null,
          valor,
          competencia: compSheet || (venc ? venc.slice(0, 7) : null),
        })
      }
    }
    return todas
  }

  async function lerFaturamento(file: File): Promise<any[]> {
    const buf = await file.arrayBuffer()
    const wb = XLSX.read(buf, { type: 'array', cellDates: true })
    const todas: any[] = []
    for (const sheetName of wb.SheetNames) {
      const sheet = wb.Sheets[sheetName]
      const rows = XLSX.utils.sheet_to_json<any>(sheet, { header: 1, defval: '' }) as any[][]
      const comp = inferCompetencia(sheetName) || competenciaDefault
      if (!comp) continue
      const dataReceb = ultimoDiaDoMes(comp)
      const start = rows[0] && /c[oó]digo|seguradora/i.test(String(rows[0][0])) ? 1 : 0
      for (let i = start; i < rows.length; i++) {
        const r = rows[i]
        if (!r || !r[0]) continue
        const codigo = String(r[0]).trim().match(/^\d+\.\d+\.\d+/)?.[0]
        if (!codigo) continue
        const bruto = parseBRL(r[1])
        if (bruto <= 0) continue
        const ir = parseBRL(r[2])
        const liquido = parseBRL(r[3])
        const outros = liquido > 0 ? Math.max(0, bruto - ir - liquido) : 0
        todas.push({
          seguradora_codigo: codigo,
          bruto, ir_retido: ir, outros_descontos: outros,
          competencia: comp, data_recebimento: dataReceb,
        })
      }
    }
    return todas
  }

  async function enviar() {
    setEnviando(true)
    setResultado(null)
    try {
      const despesas = arquivoDespesas ? await lerDespesas(arquivoDespesas) : []
      const faturamento = arquivoFaturamento ? await lerFaturamento(arquivoFaturamento) : []
      if (!despesas.length && !faturamento.length) {
        setResultado({ erro: 'Nenhuma linha válida encontrada.' })
        return
      }
      const { data: session } = await supabase.auth.getSession()
      const token = session.session?.access_token
      const tag = `planilha_${new Date().toISOString().slice(0, 10)}_${Date.now()}`
      const res = await fetch('/api/financeiro/importar', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ despesas, faturamento, tag }),
      })
      const json = await res.json()
      setResultado(json)
      if (json.ok) onSuccess?.()
    } catch (e: any) {
      setResultado({ erro: e.message })
    } finally {
      setEnviando(false)
    }
  }

  return (
    <>
      <button onClick={() => { setOpen(true); setResultado(null) }} className="btn-secondary"
        style={{ padding: '7px 14px', fontSize: 12 }}>📥 Importar planilha</button>

      {open && (
        <div onClick={() => !enviando && setOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: 'var(--bg-elev)', border: '1px solid var(--border)', borderRadius: 12, padding: 24, width: 520, maxWidth: '92vw' }}>
            <div style={{ fontFamily: 'DM Serif Display,serif', fontSize: 22, color: 'var(--text)', marginBottom: 6 }}>
              Importar planilha
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
              Formato esperado: <b>Descrição</b> (com código no início) | Tipo | Forma | Condição | Data Venc | Data Pgto | Programado | Real | Situação. Para faturamento: <b>Código seguradora</b> | Bruto | IR retido | Líquido. Use uma aba por mês (nome ex: "2026-04").
            </div>

            <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>Despesas (xlsx)</label>
            <input type="file" accept=".xlsx,.xls" onChange={e => setArquivoDespesas(e.target.files?.[0] || null)}
              style={{ display: 'block', width: '100%', marginTop: 4, marginBottom: 12, fontSize: 12, color: 'var(--text)' }} />

            <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>Faturamento por seguradora (xlsx)</label>
            <input type="file" accept=".xlsx,.xls" onChange={e => setArquivoFaturamento(e.target.files?.[0] || null)}
              style={{ display: 'block', width: '100%', marginTop: 4, marginBottom: 12, fontSize: 12, color: 'var(--text)' }} />

            <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>Competência padrão (caso a aba não tenha "AAAA-MM")</label>
            <input type="month" value={competenciaDefault} onChange={e => setCompetenciaDefault(e.target.value)}
              style={{ display: 'block', width: '100%', padding: '6px 10px', marginTop: 4, marginBottom: 16, fontSize: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)' }} />

            {resultado && (
              <div style={{ marginBottom: 14, padding: 12, borderRadius: 8, fontSize: 12,
                background: resultado.ok ? 'rgba(28,181,160,0.10)' : 'rgba(224,82,82,0.10)',
                color: resultado.ok ? 'var(--teal)' : 'var(--red)' }}>
                {resultado.erro ? `Erro: ${resultado.erro}` : (
                  <>
                    ✓ {resultado.despesas_inseridas} despesas, {resultado.faturamento_inserido} linhas de faturamento, {resultado.categorias_criadas} categorias criadas.
                    {resultado.despesas_skipped ? ` ${resultado.despesas_skipped} linhas puladas (sem valor real).` : ''}
                    {resultado.erros?.length ? <div style={{ marginTop: 6, color: 'var(--red)' }}>{resultado.erros.join(' · ')}</div> : null}
                  </>
                )}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn-secondary" onClick={() => setOpen(false)} disabled={enviando}>Fechar</button>
              <button className="btn-primary" onClick={enviar}
                disabled={enviando || (!arquivoDespesas && !arquivoFaturamento)}>
                {enviando ? 'Enviando…' : '↑ Enviar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
