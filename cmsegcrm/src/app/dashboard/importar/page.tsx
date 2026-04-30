'use client'
import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import * as XLSX from 'xlsx'

const CAMPOS_CLIENTE = [
  { key:'nome',         label:'Nome',         obrigatorio:true },
  { key:'cpf_cnpj',     label:'CPF/CNPJ',     obrigatorio:false },
  { key:'nascimento',   label:'Nascimento',   obrigatorio:false },
  { key:'rg',           label:'RG',           obrigatorio:false },
  { key:'sexo',         label:'Sexo',         obrigatorio:false },
  { key:'estado_civil', label:'Estado Civil', obrigatorio:false },
  { key:'telefone',     label:'Telefone 1',   obrigatorio:false },
  { key:'telefone2',    label:'Telefone 2',   obrigatorio:false },
  { key:'telefone3',    label:'Telefone 3',   obrigatorio:false },
  { key:'email',        label:'Email 1',      obrigatorio:false },
  { key:'email2',       label:'Email 2',      obrigatorio:false },
  { key:'email3',       label:'Email 3',      obrigatorio:false },
  { key:'cep',          label:'CEP',          obrigatorio:false },
  { key:'endereco',     label:'Endereço',     obrigatorio:false },
  { key:'numero',       label:'Número',       obrigatorio:false },
  { key:'complemento',  label:'Complemento',  obrigatorio:false },
  { key:'bairro',       label:'Bairro',       obrigatorio:false },
  { key:'cidade',       label:'Cidade',       obrigatorio:false },
  { key:'estado',       label:'UF',           obrigatorio:false },
  { key:'observacao',   label:'Observação',   obrigatorio:false },
]

const BATCH_SIZE = 200

export default function ImportarPage() {
  const supabase = createClient()
  const inputRef = useRef<HTMLInputElement>(null)

  // Guardar colunas e linhas em ref para evitar closure stale
  const colunasRef = useRef<string[]>([])
  const linhasRef  = useRef<any[][]>([])
  const mapRef     = useRef<Record<string,string>>({})

  const [colunas, setColunas]       = useState<string[]>([])
  const [linhas, setLinhas]         = useState<any[][]>([])
  const [mapeamento, setMapeamento] = useState<Record<string,string>>({})
  const [preview, setPreview]       = useState<any[]>([])
  const [arquivo, setArquivo]       = useState<string>('')
  const [importando, setImportando] = useState(false)
  const [progresso, setProgresso]   = useState(0)
  const [total, setTotal]           = useState(0)
  const [resultado, setResultado]   = useState<any>(null)
  const [step, setStep]             = useState<'upload'|'mapear'|'done'>('upload')

  function reset() {
    colunasRef.current = []; linhasRef.current = []; mapRef.current = {}
    setColunas([]); setLinhas([]); setMapeamento({}); setPreview([])
    setArquivo(''); setResultado(null); setStep('upload'); setProgresso(0)
    if (inputRef.current) inputRef.current.value = ''
  }

  async function processarArquivo(file: File) {
    setArquivo(file.name)
    const ext = file.name.split('.').pop()?.toLowerCase()
    try {
      let headers: string[] = []
      let rows: any[][] = []

      if (ext === 'csv') {
        const texto = await file.text()
        const primeira = texto.split('\n')[0]
        const sep = primeira.includes(';') ? ';' : ','
        const all = texto.split('\n').filter(l => l.trim())
        headers = all[0].split(sep).map(h => h.trim().replace(/^"|"$/g,''))
        rows = all.slice(1).map(l => l.split(sep).map(v => v.trim().replace(/^"|"$/g,'')))
      } else if (ext === 'xlsx' || ext === 'xls') {
        const buf = await file.arrayBuffer()
        const wb  = XLSX.read(buf, { type:'array', cellDates:true })
        const ws  = wb.Sheets[wb.SheetNames[0]]
        const raw = XLSX.utils.sheet_to_json(ws, { header:1, defval:'' }) as any[][]
        if (!raw.length) return
        headers = (raw[0] as any[]).map(h => String(h||'').trim())
        rows = raw.slice(1).filter(r => r.some(c => c !== '' && c !== null && c !== undefined))
      } else {
        alert('Use CSV ou XLSX'); return
      }

      // Salvar em refs para acesso estável
      colunasRef.current = headers
      linhasRef.current  = rows

      setColunas(headers)
      setLinhas(rows)

      // Automapeamento
      const autoMap: Record<string,string> = {}
      for (const campo of CAMPOS_CLIENTE) {
        const match = headers.find(h => {
          const hn = h.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu,'')
          const cn = campo.label.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu,'')
          const ck = campo.key.toLowerCase()
          // Também tenta correspondência com "CLIENTE" → nome
          if (campo.key === 'nome' && (hn === 'cliente' || hn === 'nome cliente' || hn === 'razao social' || hn === 'razão social')) return true
          if (campo.key === 'email' && (hn === 'e-mail' || hn === 'e mail')) return true
          if (campo.key === 'numero' && (hn === 'numero' || hn === 'num' || hn === 'nro')) return true
          return hn.includes(cn) || hn.includes(ck) || cn.includes(hn)
        })
        if (match) autoMap[campo.key] = match
      }

      mapRef.current = autoMap
      setMapeamento(autoMap)
      gerarPreview(headers, rows, autoMap)
      setStep('mapear')
    } catch (err: any) {
      alert('Erro ao ler arquivo: ' + err.message)
    }
  }

  function gerarPreview(hdrs: string[], rows: any[][], map: Record<string,string>) {
    const prev = rows.slice(0,5).map(row => {
      const obj: any = {}
      for (const campo of CAMPOS_CLIENTE) {
        const col = map[campo.key]
        if (!col) continue
        const idx = hdrs.indexOf(col)
        if (idx >= 0) obj[campo.key] = row[idx] ?? ''
      }
      return obj
    })
    setPreview(prev)
  }

  function atualizarMapa(campo: string, coluna: string) {
    const novo = { ...mapRef.current, [campo]: coluna }
    if (!coluna) delete novo[campo]
    mapRef.current = novo
    setMapeamento({ ...novo })
    gerarPreview(colunasRef.current, linhasRef.current, novo)
  }

  // Converte linha → objeto cliente usando refs (sem closure stale)
  function linhaParaCliente(row: any[]): any | null {
    const hdrs = colunasRef.current
    const map  = mapRef.current
    const obj: any = { tipo: 'PF' }

    for (const campo of CAMPOS_CLIENTE) {
      const col = map[campo.key]
      if (!col) continue
      const idx = hdrs.indexOf(col)
      if (idx < 0) continue
      let val = row[idx]

      if (val instanceof Date) {
        val = val.toISOString().split('T')[0]
      } else if (typeof val === 'number' && campo.key === 'nascimento') {
        try {
          const d = XLSX.SSF.parse_date_code(val)
          if (d) val = `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`
          else val = String(val)
        } catch { val = String(val) }
      } else {
        val = String(val ?? '').trim() || null
      }

      if (campo.key === 'cpf_cnpj' && val) {
        val = val.replace(/\D/g,'') || null
      }
      obj[campo.key] = val
    }

    if (!obj.nome) return null
    return obj
  }

  async function importar() {
    const map = mapRef.current
    if (!map['nome']) { alert('Selecione a coluna de Nome'); return }

    const rows = linhasRef.current
    setImportando(true); setResultado(null); setProgresso(0); setTotal(rows.length)

    let importados = 0, atualizados = 0, erros = 0
    const msgs: string[] = []

    // Buscar CPFs existentes
    const cpfsExistentes: Record<string,string> = {}
    try {
      let offset = 0
      while (true) {
        const { data } = await supabase.from('clientes').select('id,cpf_cnpj').not('cpf_cnpj','is',null).range(offset, offset+999)
        if (!data?.length) break
        for (const c of data) if (c.cpf_cnpj) cpfsExistentes[c.cpf_cnpj] = c.id
        if (data.length < 1000) break
        offset += 1000
      }
    } catch {}

    // Separar novos e updates
    const novos: any[] = []
    const updates: { id:string, data:any }[] = []

    for (const row of rows) {
      const obj = linhaParaCliente(row)
      if (!obj) continue
      const cpf = obj.cpf_cnpj
      if (cpf && cpfsExistentes[cpf]) {
        updates.push({ id: cpfsExistentes[cpf], data: obj })
      } else {
        novos.push(obj)
      }
    }

    // INSERT em lotes
    for (let i = 0; i < novos.length; i += BATCH_SIZE) {
      const lote = novos.slice(i, i + BATCH_SIZE)
      try {
        const { error } = await supabase.from('clientes').insert(lote)
        if (error) {
          // Fallback individual
          for (const item of lote) {
            try { await supabase.from('clientes').insert(item); importados++ }
            catch (e: any) { erros++; if (msgs.length<5) msgs.push(`${item.nome}: ${e.message?.slice(0,60)}`) }
          }
        } else { importados += lote.length }
      } catch (err: any) {
        erros += lote.length
        if (msgs.length<5) msgs.push(`Lote ${Math.floor(i/BATCH_SIZE)+1}: ${err.message?.slice(0,60)}`)
      }
      setProgresso(i + Math.min(BATCH_SIZE, novos.length - i))
    }

    // UPDATE em lotes
    for (let i = 0; i < updates.length; i += BATCH_SIZE) {
      const lote = updates.slice(i, i + BATCH_SIZE)
      for (const { id, data } of lote) {
        try { await supabase.from('clientes').update(data).eq('id', id); atualizados++ }
        catch {}
      }
      setProgresso(novos.length + i + lote.length)
    }

    setResultado({ importados, atualizados, erros, msgs })
    setImportando(false)
    setStep('done')
  }

  const pct = total > 0 ? Math.round((progresso / total) * 100) : 0
  const inp: React.CSSProperties = { background:'rgba(255,255,255,0.05)', border:'1px solid var(--border)', borderRadius:8, padding:'6px 10px', color:'var(--text)', fontSize:12, fontFamily:'DM Sans,sans-serif', outline:'none' }

  return (
    <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
      <div style={{height:56,borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',padding:'0 28px',background:'rgba(10,22,40,0.7)',backdropFilter:'blur(8px)',flexShrink:0}}>
        <div style={{fontFamily:'DM Serif Display,serif',fontSize:18}}>📥 Importar Clientes</div>
      </div>

      <div style={{flex:1,overflow:'auto',padding:'28px'}}>
        <div style={{maxWidth:860,margin:'0 auto'}}>

          {/* Upload */}
          {step==='upload' && (
            <div className="card" style={{textAlign:'center',padding:'48px 32px'}}>
              <div style={{fontSize:56,marginBottom:16}}>📊</div>
              <div style={{fontFamily:'DM Serif Display,serif',fontSize:22,marginBottom:8}}>Importar Clientes</div>
              <div style={{fontSize:13,color:'var(--text-muted)',marginBottom:28,lineHeight:1.7}}>
                Aceita <strong style={{color:'var(--teal)'}}>CSV</strong> e <strong style={{color:'var(--teal)'}}>XLSX</strong> (Excel).<br/>
                A primeira linha deve conter os nomes das colunas.
              </div>
              <input ref={inputRef} type="file" accept=".csv,.xlsx,.xls" style={{display:'none'}} onChange={e=>e.target.files?.[0]&&processarArquivo(e.target.files[0])} />
              <button className="btn-primary" onClick={()=>inputRef.current?.click()} style={{padding:'12px 36px',fontSize:15}}>
                📂 Selecionar arquivo
              </button>
            </div>
          )}

          {/* Mapear */}
          {step==='mapear' && (
            <div>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
                <div>
                  <div style={{fontFamily:'DM Serif Display,serif',fontSize:18}}>Mapear colunas</div>
                  <div style={{fontSize:12,color:'var(--text-muted)',marginTop:2}}>📄 {arquivo} · <strong style={{color:'var(--teal)'}}>{linhas.length.toLocaleString('pt-BR')} registros</strong></div>
                </div>
                <button onClick={reset} style={{fontSize:12,padding:'6px 14px',borderRadius:8,border:'1px solid var(--border)',background:'transparent',color:'var(--text-muted)',cursor:'pointer',fontFamily:'DM Sans,sans-serif'}}>← Trocar arquivo</button>
              </div>

              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20,alignItems:'start'}}>
                <div className="card" style={{maxHeight:'70vh',overflowY:'auto'}}>
                  <div style={{fontFamily:'DM Serif Display,serif',fontSize:14,marginBottom:14}}>Mapeamento de colunas</div>
                  {CAMPOS_CLIENTE.map(campo => (
                    <div key={campo.key} style={{display:'flex',alignItems:'center',gap:10,marginBottom:8}}>
                      <div style={{width:110,fontSize:12,color:campo.obrigatorio?'var(--gold)':'var(--text-muted)',flexShrink:0}}>
                        {campo.label}{campo.obrigatorio&&' *'}
                      </div>
                      <select
                        value={mapeamento[campo.key]||''}
                        onChange={e=>atualizarMapa(campo.key,e.target.value)}
                        style={{...inp,flex:1,background:mapeamento[campo.key]?'rgba(28,181,160,0.08)':'#0e2040',borderColor:mapeamento[campo.key]?'rgba(28,181,160,0.4)':'var(--border)'}}>
                        <option value="">— Ignorar —</option>
                        {colunas.map(c=><option key={c} value={c} style={{background:'#0e2040'}}>{c}</option>)}
                      </select>
                    </div>
                  ))}
                </div>

                <div>
                  <div className="card" style={{marginBottom:16}}>
                    <div style={{fontFamily:'DM Serif Display,serif',fontSize:14,marginBottom:14}}>Preview (5 registros)</div>
                    {preview.map((p,i)=>(
                      <div key={i} style={{padding:'10px 0',borderBottom:'1px solid rgba(255,255,255,0.06)',fontSize:12}}>
                        <div style={{fontWeight:600,marginBottom:4}}>{p.nome||'—'}</div>
                        <div style={{color:'var(--text-muted)',display:'flex',gap:10,flexWrap:'wrap',fontSize:11}}>
                          {p.cpf_cnpj&&<span>📄 {p.cpf_cnpj}</span>}
                          {p.telefone&&<span>📞 {p.telefone}</span>}
                          {p.email&&<span>✉️ {p.email}</span>}
                          {p.cidade&&<span>📍 {p.cidade}</span>}
                        </div>
                      </div>
                    ))}
                    {preview.length===0&&<div style={{color:'var(--text-muted)',fontSize:12}}>Selecione a coluna Nome para ver o preview</div>}
                  </div>

                  {importando ? (
                    <div className="card" style={{padding:'20px'}}>
                      <div style={{display:'flex',justifyContent:'space-between',marginBottom:10}}>
                        <span style={{fontSize:13}}>⏳ Importando...</span>
                        <span style={{fontSize:13,color:'var(--teal)',fontWeight:600}}>{progresso.toLocaleString('pt-BR')} / {total.toLocaleString('pt-BR')} ({pct}%)</span>
                      </div>
                      <div style={{height:8,background:'rgba(255,255,255,0.08)',borderRadius:8,overflow:'hidden'}}>
                        <div style={{height:'100%',width:`${pct}%`,background:'linear-gradient(90deg,var(--teal),var(--gold))',borderRadius:8,transition:'width 0.3s'}}/>
                      </div>
                      <div style={{fontSize:11,color:'var(--text-muted)',marginTop:8}}>Não feche esta janela...</div>
                    </div>
                  ) : (
                    <button className="btn-primary" onClick={importar} disabled={!mapeamento['nome']} style={{width:'100%',padding:13,fontSize:14}}>
                      🚀 Importar {linhas.length.toLocaleString('pt-BR')} clientes
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Resultado */}
          {step==='done' && resultado && (
            <div className="card" style={{textAlign:'center',padding:'40px 32px'}}>
              <div style={{fontSize:56,marginBottom:16}}>✅</div>
              <div style={{fontFamily:'DM Serif Display,serif',fontSize:24,marginBottom:24}}>Importação concluída!</div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:16,maxWidth:400,margin:'0 auto 24px'}}>
                {[{l:'Novos',v:resultado.importados,c:'var(--teal)',i:'✅'},{l:'Atualizados',v:resultado.atualizados,c:'var(--gold)',i:'🔄'},{l:'Erros',v:resultado.erros,c:'var(--red)',i:'❌'}].map(s=>(
                  <div key={s.l} className="card" style={{padding:'20px 16px'}}>
                    <div style={{fontSize:22,marginBottom:6}}>{s.i}</div>
                    <div style={{fontSize:30,fontWeight:700,color:s.c}}>{s.v.toLocaleString('pt-BR')}</div>
                    <div style={{fontSize:11,color:'var(--text-muted)',marginTop:4}}>{s.l}</div>
                  </div>
                ))}
              </div>
              {resultado.msgs?.length>0&&<div style={{fontSize:11,color:'var(--red)',marginBottom:20,textAlign:'left',background:'rgba(224,82,82,0.08)',padding:'12px 16px',borderRadius:8}}>{resultado.msgs.map((m:string,i:number)=><div key={i}>• {m}</div>)}</div>}
              <div style={{display:'flex',gap:12,justifyContent:'center'}}>
                <button className="btn-secondary" onClick={reset}>📂 Importar outro</button>
                <button className="btn-primary" onClick={()=>window.location.href='/dashboard/clientes'}>👥 Ver clientes →</button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
