'use client'
import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

declare global {
  interface Window { XLSX: any; JSZip: any }
}

async function loadScript(src: string) {
  return new Promise<void>((res, rej) => {
    const s = document.createElement('script')
    s.src = src; s.onload = () => res(); s.onerror = rej
    document.head.appendChild(s)
  })
}
async function ensureLibs() {
  if (typeof window === 'undefined') return
  if (!window.XLSX) await loadScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js')
  if (!window.JSZip) await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js')
}

type Tipo = 'comissoes_emitidas' | 'comissoes_pagas' | 'inadimplencia'

const TIPOS: { tipo: Tipo; label: string; emoji: string; matchers: RegExp[] }[] = [
  { tipo: 'comissoes_emitidas', label: 'Comissões Emitidas', emoji: '💸', matchers: [/comiss[oõã]es.*emitid/i, /emitid.*comiss/i, /com.*emit/i] },
  { tipo: 'comissoes_pagas',    label: 'Comissões Pagas',    emoji: '💰', matchers: [/comiss[oõã]es.*pag/i, /pag.*comiss/i, /repasse/i] },
  { tipo: 'inadimplencia',      label: 'Inadimplência',      emoji: '⏰', matchers: [/inadimpl/i, /atras/i, /vencid/i] },
]

function detectarTipo(nome: string): Tipo | null {
  for (const t of TIPOS) for (const m of t.matchers) if (m.test(nome)) return t.tipo
  return null
}

function lerXlsxBuffer(buf: ArrayBuffer): Record<string, any>[] {
  const wb = window.XLSX.read(buf, { type: 'array', cellDates: true })
  const out: Record<string, any>[] = []
  for (const sn of wb.SheetNames) {
    const ws = wb.Sheets[sn]
    const json = window.XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true }) as any[][]
    if (!json.length) continue
    let hi = 0
    for (let i = 0; i < Math.min(json.length, 10); i++) {
      const filled = json[i].filter((c: any) => String(c ?? '').trim() !== '').length
      if (filled >= 3) { hi = i; break }
    }
    const headers = (json[hi] as any[]).map((h: any) => String(h ?? '').trim())
    for (let i = hi + 1; i < json.length; i++) {
      const row = json[i]
      if (!row || !row.some((c: any) => String(c ?? '').trim() !== '')) continue
      const obj: Record<string, any> = {}
      for (let c = 0; c < headers.length; c++) {
        const h = headers[c]; if (!h) continue
        const v = row[c]
        obj[h] = v instanceof Date ? v.toISOString().slice(0, 10) : v
      }
      out.push(obj)
    }
  }
  return out
}

type ArquivoDetectado = {
  nome: string
  tipo: Tipo | null
  linhas: Record<string, any>[]
  resultado?: any
  enviando?: boolean
}

export default function HdiPage() {
  const supabase = createClient()
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const pdfInputRef = useRef<HTMLInputElement>(null)
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [drag, setDrag] = useState(false)
  const [arquivos, setArquivos] = useState<ArquivoDetectado[]>([])
  const [importandoTudo, setImportandoTudo] = useState(false)
  const [historico, setHistorico] = useState<any[]>([])
  const [pdfMsg, setPdfMsg] = useState('')

  useEffect(() => { init() }, [])

  async function init() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    const { data: prof } = await supabase.from('users').select('*').eq('id', user.id).single()
    setProfile(prof)
    if (prof?.role === 'admin') {
      const { data } = await supabase.from('hdi_importacoes')
        .select('*').order('iniciado_em', { ascending: false }).limit(20)
      setHistorico(data || [])
    }
    setLoading(false)
  }

  async function authHeaders() {
    const { data: { session } } = await supabase.auth.getSession()
    const h: Record<string, string> = { 'Content-Type': 'application/json' }
    if (session?.access_token) h['Authorization'] = `Bearer ${session.access_token}`
    return h
  }
  async function bearerOnly() {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}
  }

  async function lerEntrada(file: File) {
    await ensureLibs()
    const ext = file.name.toLowerCase().split('.').pop() || ''
    const novos: ArquivoDetectado[] = []
    if (ext === 'zip') {
      const buf = await file.arrayBuffer()
      const zip = await window.JSZip.loadAsync(buf)
      const entries = Object.values(zip.files) as any[]
      for (const entry of entries) {
        if (entry.dir) continue
        if (!/\.(xlsx?|csv)$/i.test(entry.name)) continue
        const ab = await entry.async('arraybuffer')
        try {
          const linhas = lerXlsxBuffer(ab)
          const baseName = entry.name.split('/').pop() || entry.name
          novos.push({ nome: baseName, tipo: detectarTipo(baseName), linhas })
        } catch (e: any) { alert(`Erro ao ler ${entry.name}: ${e.message}`) }
      }
    } else if (/^xlsx?$/.test(ext) || ext === 'csv') {
      const ab = await file.arrayBuffer()
      const linhas = lerXlsxBuffer(ab)
      novos.push({ nome: file.name, tipo: detectarTipo(file.name), linhas })
    } else {
      alert('Envie um arquivo .zip ou .xls/.xlsx/.csv')
      return
    }
    setArquivos(prev => [...prev, ...novos])
  }

  async function importarUm(idx: number) {
    const a = arquivos[idx]
    if (!a.tipo) return
    setArquivos(prev => prev.map((x, i) => i === idx ? { ...x, enviando: true, resultado: null } : x))
    const TAM = 200
    const acc = { qtd_lidos: 0, qtd_criados: 0, qtd_atualizados: 0, qtd_erros: 0, erros: [] as string[] }
    for (let i = 0; i < a.linhas.length; i += TAM) {
      const chunk = a.linhas.slice(i, i + TAM)
      try {
        const r = await fetch('/api/integracoes/hdi/import-planilha', {
          method: 'POST', headers: await authHeaders(),
          body: JSON.stringify({ tipo: a.tipo, linhas: chunk, nome_arquivo: a.nome }),
        })
        const j = await r.json()
        if (!r.ok) { acc.qtd_erros += chunk.length; acc.erros.push(j.error || 'erro') }
        else {
          const s = j.stats || {}
          acc.qtd_lidos += s.qtd_lidos || chunk.length
          acc.qtd_criados += s.qtd_criados || 0
          acc.qtd_atualizados += s.qtd_atualizados || 0
          acc.qtd_erros += s.qtd_erros || 0
          if (s.erros) acc.erros = [...acc.erros, ...s.erros].slice(0, 30)
        }
      } catch (e: any) { acc.qtd_erros += chunk.length; acc.erros.push(e.message) }
      setArquivos(prev => prev.map((x, i) => i === idx ? { ...x, resultado: { ...acc, _progresso: `${Math.min(i+TAM, a.linhas.length)}/${a.linhas.length}` } } : x))
    }
    setArquivos(prev => prev.map((x, i) => i === idx ? { ...x, enviando: false, resultado: acc } : x))
  }

  async function importarTudo() {
    setImportandoTudo(true)
    for (let i = 0; i < arquivos.length; i++) {
      if (!arquivos[i].tipo || arquivos[i].resultado) continue
      await importarUm(i)
    }
    const { data } = await supabase.from('hdi_importacoes').select('*').order('iniciado_em', { ascending: false }).limit(20)
    setHistorico(data || [])
    setImportandoTudo(false)
  }

  function alterarTipo(idx: number, tipo: Tipo) { setArquivos(prev => prev.map((a, i) => i === idx ? { ...a, tipo } : a)) }
  function remover(idx: number) { setArquivos(prev => prev.filter((_, i) => i !== idx)) }
  function limpar() { setArquivos([]) }

  // Upload de PDFs (apólices). Faz lookup por nome de arquivo se houver
  // um número, senão pede ao usuário em qual negócio anexar.
  async function uploadPdfs(files: File[]) {
    setPdfMsg('Enviando PDFs...')
    let ok = 0, err = 0
    for (const f of files) {
      const fd = new FormData()
      fd.append('file', f)
      // tenta extrair número da apólice do nome do arquivo
      const m = f.name.match(/(\d{6,})/)
      if (m) {
        // procura apolice por número
        const { data: apo } = await supabase.from('apolices').select('id').eq('numero', m[1]).maybeSingle()
        if (apo) fd.append('apolice_id', apo.id)
        else { err++; continue }
      } else { err++; continue }
      try {
        const r = await fetch('/api/integracoes/hdi/import-pdf', {
          method: 'POST', headers: await bearerOnly(), body: fd,
        })
        if (r.ok) ok++; else err++
      } catch { err++ }
    }
    setPdfMsg(`${ok} PDF(s) anexados, ${err} sem apólice correspondente.`)
  }

  if (loading) return <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',color:'var(--text-muted)'}}>Carregando...</div>
  if (profile?.role !== 'admin') return (
    <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:10,color:'var(--text-muted)'}}>
      <div style={{fontSize:40}}>🔒</div><div>Apenas administradores podem importar dados HDI.</div>
    </div>
  )

  const sel: React.CSSProperties = {background:'rgba(255,255,255,0.05)',border:'1px solid var(--border)',borderRadius:6,padding:'5px 8px',color:'var(--text)',fontSize:12,fontFamily:'DM Sans,sans-serif',cursor:'pointer',outline:'none'}
  const totalLinhas = arquivos.reduce((acc, a) => acc + a.linhas.length, 0)
  const detectados  = arquivos.filter(a => a.tipo).length

  return (
    <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
      <div style={{height:56,borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',padding:'0 28px',background:'var(--bg-soft)',position:'sticky',top:0,zIndex:5}}>
        <div style={{fontFamily:'DM Serif Display,serif',fontSize:18,flex:1}}>🏢 Integração HDI</div>
        {arquivos.length > 0 && (
          <button className="btn-secondary" onClick={limpar} disabled={importandoTudo}>Limpar tudo</button>
        )}
      </div>

      <div style={{flex:1,overflow:'auto',padding:'24px 28px'}}>
        <div style={{maxWidth:1080,margin:'0 auto'}}>

          {/* Bloco Apólices em PDF */}
          <div className="card" style={{marginBottom:20}}>
            <div style={{fontFamily:'DM Serif Display,serif',fontSize:16,marginBottom:6,color:'var(--gold)'}}>📄 Apólices em PDF</div>
            <div style={{fontSize:12,color:'var(--text-muted)',marginBottom:14,lineHeight:1.6}}>
              Suba os PDFs das apólices HDI. O sistema lê o número da apólice no nome do arquivo
              (qualquer sequência ≥ 6 dígitos) e anexa automaticamente ao registro correspondente
              no módulo Apólices, deixando o arquivo sincronizado com a apólice digitada.
            </div>
            <input ref={pdfInputRef} type="file" accept=".pdf,application/pdf" multiple style={{display:'none'}}
              onChange={async e => { const fs = Array.from(e.target.files || []); if (fs.length) await uploadPdfs(fs); if (pdfInputRef.current) pdfInputRef.current.value = '' }} />
            <div style={{display:'flex',gap:10,alignItems:'center'}}>
              <button className="btn-primary" onClick={()=>pdfInputRef.current?.click()}>📎 Selecionar PDFs</button>
              {pdfMsg && <span style={{fontSize:12,color:'var(--text-muted)'}}>{pdfMsg}</span>}
            </div>
          </div>

          {/* Bloco planilhas */}
          <div className="card" style={{marginBottom:20}}>
            <div style={{fontFamily:'DM Serif Display,serif',fontSize:16,marginBottom:6,color:'var(--gold)'}}>📊 Comissões e Inadimplência (XLSX/XLS/CSV)</div>
            <div style={{fontSize:12,color:'var(--text-muted)',marginBottom:18,lineHeight:1.6}}>
              Suba planilhas exportadas do portal HDI. O sistema detecta o tipo pelo nome do arquivo
              (Comissões Emitidas/Pagas, Inadimplência) — você pode trocar manualmente também.
            </div>
            <div onDragOver={e=>{e.preventDefault();setDrag(true)}} onDragLeave={()=>setDrag(false)}
              onDrop={async e=>{e.preventDefault();setDrag(false);for (const f of Array.from(e.dataTransfer.files)) await lerEntrada(f)}}
              onClick={()=>inputRef.current?.click()}
              style={{border:`2px dashed ${drag?'var(--gold)':'rgba(201,168,76,0.3)'}`,borderRadius:14,padding:'40px 24px',textAlign:'center',cursor:'pointer',background:drag?'rgba(201,168,76,0.06)':'rgba(255,255,255,0.02)',transition:'all 0.2s'}}>
              <input ref={inputRef} type="file" accept=".zip,.xlsx,.xls,.csv" multiple style={{display:'none'}}
                onChange={async e=>{ const fs = Array.from(e.target.files || []); for (const f of fs) await lerEntrada(f); if (inputRef.current) inputRef.current.value = '' }} />
              <div style={{fontSize:42,marginBottom:10}}>📦</div>
              <div style={{fontSize:14,fontWeight:500}}>Clique ou arraste planilhas aqui</div>
              <div style={{fontSize:11,color:'var(--text-muted)',marginTop:4}}>.zip · .xlsx · .xls · .csv</div>
            </div>
          </div>

          {arquivos.length > 0 && (
            <div className="card" style={{marginBottom:20}}>
              <div style={{display:'flex',alignItems:'center',marginBottom:14,gap:10}}>
                <div style={{fontFamily:'DM Serif Display,serif',fontSize:16,flex:1}}>
                  Arquivos detectados <span style={{color:'var(--text-muted)',fontSize:13}}>({detectados}/{arquivos.length} reconhecidos · {totalLinhas} linhas)</span>
                </div>
                <button className="btn-primary" onClick={importarTudo} disabled={importandoTudo || detectados===0}>
                  {importandoTudo ? '⏳ Importando...' : `🚀 Importar tudo (${detectados})`}
                </button>
              </div>

              <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                <thead><tr style={{textAlign:'left'}}>
                  {['Arquivo','Tipo detectado','Linhas','Resultado',''].map(h=>(
                    <th key={h} style={{fontSize:10,fontWeight:600,letterSpacing:'1px',textTransform:'uppercase',color:'var(--text-muted)',padding:'0 8px 10px',borderBottom:'1px solid var(--border)'}}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {arquivos.map((a, i) => (
                    <tr key={i} style={{borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
                      <td style={{padding:'10px 8px',maxWidth:280,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{a.nome}</td>
                      <td style={{padding:'10px 8px'}}>
                        <select style={sel} value={a.tipo || ''} onChange={e=>alterarTipo(i, e.target.value as Tipo)}>
                          <option value="">— escolha o tipo —</option>
                          {TIPOS.map(t => <option key={t.tipo} value={t.tipo}>{t.emoji} {t.label}</option>)}
                        </select>
                      </td>
                      <td style={{padding:'10px 8px',color:'var(--text-muted)'}}>{a.linhas.length}</td>
                      <td style={{padding:'10px 8px',fontSize:11}}>
                        {a.enviando && <span style={{color:'var(--text-muted)'}}>⏳ {a.resultado?._progresso || 'enviando...'}</span>}
                        {a.resultado && !a.enviando && (
                          <span>
                            <span style={{color:'var(--success)'}}>{a.resultado.qtd_criados} ok</span>
                            {a.resultado.qtd_atualizados>0 && <> · <span style={{color:'var(--warning)'}}>{a.resultado.qtd_atualizados} atual.</span></>}
                            {a.resultado.qtd_erros>0 && <> · <span style={{color:'var(--danger)'}}>{a.resultado.qtd_erros} erros</span></>}
                          </span>
                        )}
                      </td>
                      <td style={{padding:'10px 8px',textAlign:'right'}}>
                        <button className="btn-secondary" style={{padding:'4px 10px',fontSize:11}} disabled={!a.tipo || a.enviando} onClick={()=>importarUm(i)}>Importar</button>{' '}
                        <button className="btn-secondary" style={{padding:'4px 10px',fontSize:11}} onClick={()=>remover(i)} disabled={a.enviando}>×</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {historico.length > 0 && (
            <div className="card">
              <div style={{fontFamily:'DM Serif Display,serif',fontSize:15,marginBottom:14}}>📜 Histórico de importações HDI</div>
              {historico.map(h => (
                <div key={h.id} style={{display:'grid',gridTemplateColumns:'160px 1fr 80px 70px 70px 100px',gap:10,padding:'8px 0',fontSize:12,borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
                  <span style={{fontWeight:600}}>{h.tipo}</span>
                  <span style={{color:'var(--text-muted)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{h.nome_arquivo || '—'}</span>
                  <span style={{color:'var(--text-muted)'}}>{h.qtd_lidos} lidos</span>
                  <span style={{color:'var(--success)'}}>{h.qtd_criados}+</span>
                  <span style={{color:h.qtd_erros>0?'var(--danger)':'var(--text-muted)'}}>{h.qtd_erros}!</span>
                  <span style={{color:'var(--text-muted)',textAlign:'right'}}>{new Date(h.iniciado_em).toLocaleDateString('pt-BR')}</span>
                </div>
              ))}
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
