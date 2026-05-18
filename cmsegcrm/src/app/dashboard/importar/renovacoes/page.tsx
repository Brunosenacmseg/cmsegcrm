'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

declare global { interface Window { XLSX: any } }

async function carregarSheetJS(): Promise<void> {
  if (typeof window === 'undefined' || window.XLSX) return
  return new Promise((res, rej) => {
    const s = document.createElement('script')
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
    s.onload = () => res(); s.onerror = rej
    document.head.appendChild(s)
  })
}

async function lerArquivo(file: File): Promise<{ headers: string[]; rows: Record<string, any>[] }> {
  const ext = file.name.toLowerCase().split('.').pop() || ''
  if (ext === 'csv') {
    const txt = await file.text()
    const linhas = txt.split(/\r?\n/).filter(Boolean)
    if (!linhas.length) return { headers: [], rows: [] }
    const sep = linhas[0].includes(';') ? ';' : ','
    const headers = linhas[0].split(sep).map(h => h.trim().replace(/^["']|["']$/g, ''))
    const rows = linhas.slice(1).map(l => {
      const cols = l.split(sep).map(c => c.trim().replace(/^["']|["']$/g, ''))
      return Object.fromEntries(headers.map((h, i) => [h, cols[i] || '']))
    })
    return { headers, rows }
  }
  await carregarSheetJS()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const wb = window.XLSX.read(e.target?.result, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const json = window.XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as any[][]
        if (!json.length) { resolve({ headers: [], rows: [] }); return }
        const headers = (json[0] as any[]).map(h => String(h || '').trim())
        const rows = json.slice(1)
          .filter(r => r.some((c: any) => c !== ''))
          .map(r => Object.fromEntries(headers.map((h, i) => [h, r[i]])))
        resolve({ headers, rows })
      } catch (err) { reject(err) }
    }
    reader.onerror = reject
    reader.readAsArrayBuffer(file)
  })
}

const EQUIPE_ADM = 'equipe adm'
function norm(s: string) { return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim() }

export default function ImportarRenovacoesPage() {
  const supabase = createClient()
  const router = useRouter()
  const [verificando, setVerificando] = useState(true)
  const [autorizado, setAutorizado] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<Record<string, any>[]>([])
  const [headers, setHeaders] = useState<string[]>([])
  const [enviando, setEnviando] = useState(false)
  const [resultado, setResultado] = useState<{ criados: number; total: number; erros: string[] } | null>(null)

  useEffect(() => { (async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    const { data: prof } = await supabase.from('users').select('role').eq('id', user.id).maybeSingle()
    if (prof?.role === 'admin') { setAutorizado(true); setVerificando(false); return }
    const { data: eqs } = await supabase.from('equipes').select('nome,lider_id')
    const minhaLid = (eqs || []).find((e: any) => norm(e.nome) === EQUIPE_ADM && e.lider_id === user.id)
    if (minhaLid) setAutorizado(true)
    else router.push('/dashboard')
    setVerificando(false)
  })() }, [])

  async function escolherArquivo(f: File | null) {
    setFile(f); setResultado(null); setPreview([]); setHeaders([])
    if (!f) return
    try {
      const { headers, rows } = await lerArquivo(f)
      setHeaders(headers)
      setPreview(rows.slice(0, 20))
    } catch (e: any) {
      alert('Erro ao ler arquivo: ' + (e?.message || e))
    }
  }

  async function enviar() {
    if (!file) return
    setEnviando(true); setResultado(null)
    try {
      const { headers: hs, rows } = await lerArquivo(file)
      if (!rows.length) { alert('Arquivo vazio.'); setEnviando(false); return }
      const { data: { session } } = await supabase.auth.getSession()
      const r = await fetch('/api/importar/renovacoes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ rows }),
      })
      const j = await r.json()
      if (!r.ok) { alert('Erro: ' + (j?.error || r.statusText)); setEnviando(false); return }
      setResultado(j)
    } catch (e: any) {
      alert('Erro: ' + (e?.message || e))
    } finally {
      setEnviando(false)
    }
  }

  if (verificando) return <div style={{ padding: 40, color: 'var(--text-muted)' }}>Verificando permissão…</div>
  if (!autorizado) return null

  return (
    <div style={{ padding: 28, maxWidth: 980 }}>
      <h1 style={{ fontFamily: 'DM Serif Display,serif', fontSize: 24, marginBottom: 6 }}>📥 Importar Renovações</h1>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>
        Os cards serão criados no funil <strong>RENOVAÇÕES</strong>, etapa <strong>RENOVAÇÕES À VENCER</strong>,
        com responsável <strong>Bruno Sena (bruno@cmseguros.com.br)</strong>.
      </p>

      <div style={{ padding: 18, border: '1px solid var(--border)', borderRadius: 10, background: 'var(--bg-soft)' }}>
        <input type="file" accept=".csv,.xlsx,.xls" onChange={e => escolherArquivo(e.target.files?.[0] || null)} />
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
          Colunas reconhecidas: <em>titulo/cliente, cpf/cnpj, telefone, e-mail, placa, modelo, produto/ramo,
          seguradora atual, prêmio, vencimento, vigência início/fim, comissão %, observações</em>.
        </div>
        {file && (
          <div style={{ marginTop: 14, display: 'flex', gap: 10, alignItems: 'center' }}>
            <button onClick={enviar} disabled={enviando} className="btn-primary">
              {enviando ? 'Importando…' : `Importar (${preview.length > 0 ? preview.length : '?'} linha(s) na prévia)`}
            </button>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{file.name}</span>
          </div>
        )}
      </div>

      {preview.length > 0 && (
        <div style={{ marginTop: 22 }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1 }}>
            Prévia das primeiras 20 linhas
          </div>
          <div style={{ overflow: 'auto', border: '1px solid var(--border-soft)', borderRadius: 8 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead><tr>{headers.map(h => <th key={h} style={{ padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid var(--border-soft)', background: 'var(--bg-subtle)', whiteSpace: 'nowrap' }}>{h}</th>)}</tr></thead>
              <tbody>
                {preview.map((r, i) => (
                  <tr key={i}>{headers.map(h => <td key={h} style={{ padding: '6px 10px', borderBottom: '1px solid rgba(0,0,0,0.04)', whiteSpace: 'nowrap' }}>{String(r[h] ?? '')}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {resultado && (
        <div style={{ marginTop: 22, padding: 16, borderRadius: 10, background: '#ecfdf5', border: '1px solid #6ee7b7' }}>
          <div style={{ fontWeight: 700, color: '#065f46' }}>✓ Importação concluída</div>
          <div style={{ fontSize: 13, color: '#065f46', marginTop: 4 }}>
            {resultado.criados} de {resultado.total} negociações criadas.
          </div>
          {resultado.erros.length > 0 && (
            <details style={{ marginTop: 10 }}>
              <summary style={{ cursor: 'pointer', fontSize: 12, color: '#92400e' }}>Ver {resultado.erros.length} erro(s)</summary>
              <ul style={{ fontSize: 11, marginTop: 8, color: '#7f1d1d' }}>
                {resultado.erros.slice(0, 50).map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  )
}
