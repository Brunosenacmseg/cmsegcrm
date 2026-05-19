'use client'

import { useEffect, useMemo, useState } from 'react'
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

type Tipo = 'text' | 'number' | 'date'
type Field = { key: string; label: string; tipo: Tipo; obrigatorio?: boolean; hints: string[] }

const FIELDS: Field[] = [
  { key: 'titulo',              label: 'Título / Cliente',    tipo: 'text',   obrigatorio: true, hints: ['titulo','título','negócio','negocio','cliente','nome','segurado'] },
  { key: 'cpf_cnpj',            label: 'CPF / CNPJ',          tipo: 'text',   hints: ['cpf','cnpj','cpf/cnpj','documento'] },
  { key: 'telefone_negocio',    label: 'Telefone',            tipo: 'text',   hints: ['telefone','celular','whatsapp','fone'] },
  { key: 'email_negocio',       label: 'E-mail',              tipo: 'text',   hints: ['email','e-mail'] },
  { key: 'placa',               label: 'Placa',               tipo: 'text',   hints: ['placa','placa do veículo'] },
  { key: 'modelo_veiculo',      label: 'Modelo do veículo',   tipo: 'text',   hints: ['modelo','modelo do veículo','veiculo','veículo'] },
  { key: 'produto',             label: 'Produto / Ramo',      tipo: 'text',   hints: ['produto','ramo','tipo de seguro'] },
  { key: 'seguradora',          label: 'Seguradora',          tipo: 'text',   hints: ['seguradora'] },
  { key: 'seguradora_atual',    label: 'Seguradora atual',    tipo: 'text',   hints: ['seguradora atual'] },
  { key: 'premio',              label: 'Prêmio',              tipo: 'number', hints: ['premio','prêmio','valor','valor total','valor anual'] },
  { key: 'comissao_pct',        label: 'Comissão %',          tipo: 'number', hints: ['comissao','comissão','comissao %'] },
  { key: 'vencimento',          label: 'Vencimento',          tipo: 'date',   hints: ['vencimento','data vencimento','vigencia fim','vigência fim'] },
  { key: 'vigencia_seguro_ini', label: 'Vigência início',     tipo: 'date',   hints: ['vigencia inicio','vigência início','inicio vigencia'] },
  { key: 'vigencia_seguro_fim', label: 'Vigência fim',        tipo: 'date',   hints: ['vigencia fim','vigência fim','fim vigencia'] },
  { key: 'previsao_fechamento', label: 'Previsão fechamento', tipo: 'date',   hints: ['previsao fechamento','previsão fechamento','vencimento'] },
  { key: 'obs',                 label: 'Observação',          tipo: 'text',   hints: ['obs','observacao','observação','anotacoes','anotações','observacoes'] },
]

function detectarPadrao(headers: string[]): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  const usadas = new Set<string>()
  for (const f of FIELDS) {
    for (const h of f.hints) {
      const exact = headers.find(hd => !usadas.has(hd) && norm(hd) === norm(h))
      if (exact) { out[f.key] = [exact]; usadas.add(exact); break }
    }
    if (out[f.key]) continue
    for (const h of f.hints) {
      const cont = headers.find(hd => !usadas.has(hd) && norm(hd).includes(norm(h)))
      if (cont) { out[f.key] = [cont]; usadas.add(cont); break }
    }
    if (!out[f.key]) out[f.key] = []
  }
  return out
}

export default function ImportarVidaPage() {
  const supabase = createClient()
  const router = useRouter()
  const [verificando, setVerificando] = useState(true)
  const [autorizado, setAutorizado] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<Record<string, any>[]>([])
  const [headers, setHeaders] = useState<string[]>([])
  const [allRows, setAllRows] = useState<Record<string, any>[]>([])
  const [mapeamento, setMapeamento] = useState<Record<string, string[]>>({})
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
    setFile(f); setResultado(null); setPreview([]); setHeaders([]); setAllRows([]); setMapeamento({})
    if (!f) return
    try {
      const { headers, rows } = await lerArquivo(f)
      setHeaders(headers)
      setAllRows(rows)
      setPreview(rows.slice(0, 20))
      setMapeamento(detectarPadrao(headers))
    } catch (e: any) {
      alert('Erro ao ler arquivo: ' + (e?.message || e))
    }
  }

  function adicionarColuna(fieldKey: string, coluna: string) {
    if (!coluna) return
    setMapeamento(m => {
      const atual = m[fieldKey] || []
      if (atual.includes(coluna)) return m
      return { ...m, [fieldKey]: [...atual, coluna] }
    })
  }
  function removerColuna(fieldKey: string, coluna: string) {
    setMapeamento(m => ({ ...m, [fieldKey]: (m[fieldKey] || []).filter(c => c !== coluna) }))
  }

  const tituloOk = (mapeamento['titulo']?.length || 0) > 0

  async function enviar() {
    if (!file) return
    if (!tituloOk) { alert('Selecione pelo menos uma coluna para "Título / Cliente".'); return }
    setEnviando(true); setResultado(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const r = await fetch('/api/importar/vida', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ rows: allRows, mapeamento }),
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

  const colunasDisponiveis = useMemo(() => headers, [headers])

  if (verificando) return <div style={{ padding: 40, color: 'var(--text-muted)' }}>Verificando permissão…</div>
  if (!autorizado) return null

  return (
    <div style={{ padding: 28, maxWidth: 1100 }}>
      <h1 style={{ fontFamily: 'DM Serif Display,serif', fontSize: 24, marginBottom: 6 }}>❤️ Importação VIDA</h1>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>
        Os cards serão criados no funil <strong>RENOVAÇÕES</strong>, etapa <strong>RENOVAÇÕES AUTOMÁTICAS</strong>,
        com responsável <strong>Bruno Sena</strong>. Faça o upload e mapeie as colunas para cada campo.
      </p>

      <div style={{ padding: 18, border: '1px solid var(--border)', borderRadius: 10, background: 'var(--bg-soft)' }}>
        <input type="file" accept=".csv,.xlsx,.xls" onChange={e => escolherArquivo(e.target.files?.[0] || null)} />
        {file && (
          <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-muted)' }}>
            {file.name} — {allRows.length} linha(s) detectada(s)
          </div>
        )}
      </div>

      {headers.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1 }}>
            Mapeamento de colunas → campos
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 14 }}>
            Selecione uma ou mais colunas para cada campo. Quando houver mais de uma para campos de texto,
            os valores são concatenados com <code>" | "</code>. Para números/datas, vale o primeiro valor válido.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10 }}>
            {FIELDS.map(f => {
              const selecionadas = mapeamento[f.key] || []
              const disponiveis = colunasDisponiveis.filter(c => !selecionadas.includes(c))
              return (
                <div key={f.key} style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 14, alignItems: 'center', padding: '10px 12px', border: '1px solid var(--border-soft)', borderRadius: 8, background: '#fff' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>
                      {f.label}{f.obrigatorio && <span style={{ color: 'var(--red,#e05252)' }}> *</span>}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.6 }}>
                      {f.tipo === 'text' ? 'Texto' : f.tipo === 'number' ? 'Número' : 'Data'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                    {selecionadas.map(col => (
                      <span key={col} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(20,184,166,0.10)', color: '#0f766e', padding: '4px 8px', borderRadius: 14, fontSize: 12, border: '1px solid rgba(20,184,166,0.30)' }}>
                        {col}
                        <button type="button" onClick={() => removerColuna(f.key, col)}
                          style={{ background: 'transparent', border: 'none', color: '#0f766e', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0 }} title="Remover">×</button>
                      </span>
                    ))}
                    <select value="" onChange={e => { adicionarColuna(f.key, e.target.value); e.currentTarget.value = '' }}
                      style={{ padding: '5px 8px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, background: '#fff', minWidth: 180 }}>
                      <option value="">{selecionadas.length ? '+ adicionar outra coluna' : 'Selecionar coluna...'}</option>
                      {disponiveis.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>
              )
            })}
          </div>

          <div style={{ marginTop: 18, display: 'flex', gap: 10, alignItems: 'center' }}>
            <button onClick={enviar} disabled={enviando || !tituloOk} className="btn-primary">
              {enviando ? 'Importando…' : `Importar ${allRows.length} linha(s)`}
            </button>
            {!tituloOk && <span style={{ fontSize: 12, color: 'var(--red,#e05252)' }}>Mapeie pelo menos a coluna de Título/Cliente.</span>}
          </div>
        </div>
      )}

      {preview.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1 }}>
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
