'use client'
import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

declare global { interface Window { XLSX: any } }

async function carregarSheetJS(): Promise<void> {
  if (typeof window==='undefined' || window.XLSX) return
  return new Promise((res,rej)=>{
    const s=document.createElement('script')
    s.src='https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
    s.onload=()=>res(); s.onerror=rej
    document.head.appendChild(s)
  })
}

async function lerArquivo(file: File): Promise<{ headers: string[]; rows: Record<string,any>[] }> {
  const ext = file.name.toLowerCase().split('.').pop() || ''
  if (ext === 'csv') {
    const txt = await file.text()
    const linhas = txt.split(/\r?\n/).filter(Boolean)
    if (linhas.length === 0) return { headers: [], rows: [] }
    const sep = linhas[0].includes(';') ? ';' : ','
    const headers = linhas[0].split(sep).map(h => h.trim().replace(/^["']|["']$/g,''))
    const rows = linhas.slice(1).map(l => {
      const cols = l.split(sep).map(c => c.trim().replace(/^["']|["']$/g,''))
      return Object.fromEntries(headers.map((h,i) => [h, cols[i] || '']))
    })
    return { headers, rows }
  }
  // xlsx/xls
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

type Entidade = 'clientes' | 'negocios' | 'apolices' | 'propostas' | 'tarefas'

const CAMPOS_POR_ENTIDADE: Record<Entidade, { campo: string; label: string; hints: string[]; obrigatorio?: boolean }[]> = {
  clientes: [
    { campo: 'nome',     label: 'Nome',     hints: ['nome','name','razao'], obrigatorio: true },
    { campo: 'cpf_cnpj', label: 'CPF/CNPJ', hints: ['cpf','cnpj','documento'] },
    { campo: 'email',    label: 'E-mail',   hints: ['email','e-mail'] },
    { campo: 'telefone', label: 'Telefone', hints: ['telefone','fone','celular','whatsapp'] },
    { campo: 'cep',      label: 'CEP',      hints: ['cep','codigo postal'] },
    { campo: 'cidade',   label: 'Cidade',   hints: ['cidade','city'] },
    { campo: 'estado',   label: 'Estado',   hints: ['estado','uf'] },
    { campo: 'fonte',    label: 'Fonte',    hints: ['fonte','origem'] },
  ],
  negocios: [
    { campo: 'titulo',     label: 'Título',           hints: ['titulo','title'], obrigatorio: true },
    { campo: 'cpf_cnpj',   label: 'CPF/CNPJ Cliente', hints: ['cpf','cnpj'] },
    { campo: 'funil',      label: 'Funil (nome)',     hints: ['funil','pipeline'] },
    { campo: 'etapa',      label: 'Etapa',            hints: ['etapa','stage'] },
    { campo: 'produto',    label: 'Produto',          hints: ['produto','ramo'] },
    { campo: 'seguradora', label: 'Seguradora',       hints: ['seguradora','cia'] },
    { campo: 'premio',     label: 'Prêmio',           hints: ['premio','prêmio','valor'] },
    { campo: 'comissao_pct', label: '% Comissão',     hints: ['%','perc','pct','comissao'] },
    { campo: 'vencimento', label: 'Vencimento',       hints: ['vencimento','fim','vigencia'] },
    { campo: 'fonte',      label: 'Fonte',            hints: ['fonte','origem'] },
    { campo: 'obs',        label: 'Observações',      hints: ['obs','observ','notas'] },
  ],
  apolices: [
    { campo: 'numero',       label: 'Número',          hints: ['numero','apolice','policy'], obrigatorio: true },
    { campo: 'cpf_cnpj',     label: 'CPF/CNPJ',        hints: ['cpf','cnpj'] },
    { campo: 'nome',         label: 'Nome Segurado',   hints: ['nome','segurado'] },
    { campo: 'produto',      label: 'Produto',         hints: ['produto','ramo'] },
    { campo: 'seguradora',   label: 'Seguradora',      hints: ['seguradora','cia'] },
    { campo: 'premio',       label: 'Prêmio',          hints: ['premio','valor'] },
    { campo: 'comissao_pct', label: '% Comissão',      hints: ['comiss','%','pct'] },
    { campo: 'vigencia_ini', label: 'Início Vigência', hints: ['inicio','ini'] },
    { campo: 'vigencia_fim', label: 'Fim Vigência',    hints: ['fim','vencimento'] },
    { campo: 'placa',        label: 'Placa',           hints: ['placa'] },
  ],
  propostas: [
    { campo: 'titulo',     label: 'Título',     hints: ['titulo','proposta'], obrigatorio: true },
    { campo: 'cpf_cnpj',   label: 'CPF/CNPJ',   hints: ['cpf','cnpj'] },
    { campo: 'produto',    label: 'Produto',    hints: ['produto','ramo'] },
    { campo: 'seguradora', label: 'Seguradora', hints: ['seguradora'] },
    { campo: 'premio',     label: 'Prêmio',     hints: ['premio','valor'] },
    { campo: 'vencimento', label: 'Vencimento', hints: ['vencimento'] },
  ],
  tarefas: [
    { campo: 'titulo',     label: 'Título',     hints: ['titulo','tarefa'], obrigatorio: true },
    { campo: 'descricao',  label: 'Descrição',  hints: ['descricao','obs'] },
    { campo: 'tipo',       label: 'Tipo',       hints: ['tipo'] },
    { campo: 'status',     label: 'Status',     hints: ['status'] },
    { campo: 'prazo',      label: 'Prazo',      hints: ['prazo','data'] },
  ],
}

const ENTIDADES_INFO: { key: Entidade; emoji: string; label: string; descricao: string }[] = [
  { key:'clientes',  emoji:'👥', label:'Clientes',     descricao:'Pessoas físicas/jurídicas (PF/PJ)' },
  { key:'negocios',  emoji:'💼', label:'Negociações',  descricao:'Cards nos funis de venda' },
  { key:'apolices',  emoji:'📋', label:'Apólices',     descricao:'Apólices emitidas' },
  { key:'propostas', emoji:'📄', label:'Propostas',    descricao:'Propostas em andamento' },
  { key:'tarefas',   emoji:'✅', label:'Tarefas',      descricao:'Tarefas e lembretes' },
]

function autoMapear(headers: string[], entidade: Entidade) {
  const norm = (s:string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'')
  return CAMPOS_POR_ENTIDADE[entidade].map(c => ({
    ...c,
    coluna: headers.find(h => c.hints.some(hint => norm(h).includes(hint))) || ''
  }))
}

export default function ImportarPage() {
  const supabase = createClient()
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [entidade, setEntidade] = useState<Entidade>('clientes')
  const [step, setStep] = useState<'upload'|'mapear'|'preview'|'sucesso'>('upload')
  const [nomeArquivo, setNomeArquivo] = useState('')
  const [formato, setFormato] = useState<'csv'|'xlsx'|'pdf'>('csv')
  const [excelData, setExcelData] = useState<{headers:string[];rows:Record<string,any>[]}>({headers:[],rows:[]})
  const [mapeamento, setMapeamento] = useState<any[]>([])
  const [drag, setDrag] = useState(false)
  const [importando, setImportando] = useState(false)
  const [resultado, setResultado] = useState<any>(null)
  const [historico, setHistorico] = useState<any[]>([])

  useEffect(() => { init() }, [])

  async function authHeaders() {
    const { data: { session } } = await supabase.auth.getSession()
    const h: Record<string, string> = { 'Content-Type': 'application/json' }
    if (session?.access_token) h['Authorization'] = `Bearer ${session.access_token}`
    return h
  }

  async function init() {
    const { data:{ user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    const { data: prof } = await supabase.from('users').select('*').eq('id', user.id).single()
    setProfile(prof)
    if (prof?.role === 'admin') {
      const { data: h } = await supabase.from('importacoes_dados').select('*').order('iniciado_em', { ascending: false }).limit(15)
      setHistorico(h || [])
    }
    setLoading(false)
  }

  async function handleFile(file: File) {
    setNomeArquivo(file.name)
    const ext = file.name.toLowerCase().split('.').pop() || ''
    if (ext === 'pdf') {
      alert('Importação de PDF ainda não suportada. Use CSV ou XLSX por enquanto.')
      return
    }
    setFormato(ext === 'csv' ? 'csv' : 'xlsx')
    try {
      const dados = await lerArquivo(file)
      setExcelData(dados)
      setMapeamento(autoMapear(dados.headers, entidade))
      setStep('mapear')
    } catch (e: any) {
      alert('Erro ao ler o arquivo: ' + (e?.message || ''))
    }
  }

  async function confirmarImportacao() {
    setImportando(true)
    const map = Object.fromEntries(mapeamento.filter(m => m.coluna).map(m => [m.campo, m.coluna]))
    const linhas = excelData.rows.map(row => {
      const novo: any = {}
      for (const [campo, coluna] of Object.entries(map)) {
        novo[campo] = row[coluna as string]
      }
      return novo
    })

    try {
      const r = await fetch('/api/importar', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ entidade, linhas, nome_arquivo: nomeArquivo, formato }),
      })
      const j = await r.json()
      if (!r.ok) {
        alert('Erro: ' + (j.error || 'falha'))
        setImportando(false)
        return
      }
      setResultado(j.stats)
      setStep('sucesso')
      const { data: h } = await supabase.from('importacoes_dados').select('*').order('iniciado_em', { ascending: false }).limit(15)
      setHistorico(h || [])
    } catch (e: any) {
      alert('Erro: ' + e.message)
    } finally {
      setImportando(false)
    }
  }

  function novoImport() {
    setStep('upload'); setExcelData({headers:[],rows:[]}); setMapeamento([]); setNomeArquivo(''); setResultado(null)
  }

  if (loading) return <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',color:'var(--text-muted)'}}>Carregando...</div>

  if (profile?.role !== 'admin') return (
    <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:10,color:'var(--text-muted)'}}>
      <div style={{fontSize:40}}>🔒</div>
      <div>Apenas administradores podem importar dados.</div>
    </div>
  )

  const camposObrigatorios = CAMPOS_POR_ENTIDADE[entidade].filter(c => c.obrigatorio)
  const obrigatoriosOk = camposObrigatorios.every(co => mapeamento.find(m => m.campo === co.campo)?.coluna)
  const sel: React.CSSProperties={background:'rgba(255,255,255,0.05)',border:'1px solid var(--border)',borderRadius:8,padding:'7px 12px',color:'var(--text)',fontSize:12,fontFamily:'DM Sans,sans-serif',cursor:'pointer',outline:'none',width:'100%'}

  return (
    <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
      <div style={{height:56,borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',padding:'0 28px',background:'var(--bg-soft)',position:'sticky',top:0,zIndex:5}}>
        <div style={{fontFamily:'DM Serif Display,serif',fontSize:18,flex:1}}>📥 Importar Dados</div>
        {step !== 'upload' && (
          <button className="btn-secondary" onClick={novoImport}>← Voltar</button>
        )}
      </div>

      <div style={{flex:1,overflow:'auto',padding:'24px 28px'}}>
        <div style={{maxWidth:980,margin:'0 auto'}}>

          {step === 'upload' && (
            <>
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(170px, 1fr))',gap:12,marginBottom:20}}>
                {ENTIDADES_INFO.map(e => {
                  const ativo = entidade === e.key
                  return (
                    <button key={e.key} onClick={()=>setEntidade(e.key)}
                      style={{padding:'14px 16px',borderRadius:10,fontSize:13,cursor:'pointer',border:'1px solid '+(ativo?'var(--gold)':'var(--border)'),background:ativo?'rgba(201,168,76,0.10)':'rgba(255,255,255,0.04)',color:ativo?'var(--gold)':'var(--text)',fontFamily:'DM Sans,sans-serif',display:'flex',flexDirection:'column',gap:4,alignItems:'flex-start',textAlign:'left'}}>
                      <span style={{fontSize:22}}>{e.emoji}</span>
                      <span style={{fontWeight:600,fontSize:13}}>{e.label}</span>
                      <span style={{fontSize:11,color:'var(--text-muted)',fontWeight:400}}>{e.descricao}</span>
                    </button>
                  )
                })}
              </div>

              <div className="card">
                <div style={{fontFamily:'DM Serif Display,serif',fontSize:16,marginBottom:6,color:'var(--gold)'}}>
                  Importar {ENTIDADES_INFO.find(e=>e.key===entidade)?.label}
                </div>
                <div style={{fontSize:12,color:'var(--text-muted)',marginBottom:18}}>
                  Aceita arquivos <strong style={{color:'var(--text)'}}>.csv</strong> e <strong style={{color:'var(--text)'}}>.xlsx</strong>.
                  Cabeçalho na primeira linha. Você poderá mapear as colunas no próximo passo.
                </div>

                <div onDragOver={e=>{e.preventDefault();setDrag(true)}} onDragLeave={()=>setDrag(false)}
                  onDrop={e=>{e.preventDefault();setDrag(false);const f=e.dataTransfer.files[0];if(f)handleFile(f)}}
                  onClick={()=>inputRef.current?.click()}
                  style={{border:`2px dashed ${drag?'var(--gold)':'rgba(201,168,76,0.3)'}`,borderRadius:14,padding:'48px 24px',textAlign:'center',cursor:'pointer',background:drag?'rgba(201,168,76,0.06)':'rgba(255,255,255,0.02)',transition:'all 0.2s'}}>
                  <input ref={inputRef} type="file" accept=".csv,.xlsx,.xls" style={{display:'none'}}
                    onChange={e=>{const f=e.target.files?.[0];if(f)handleFile(f)}} />
                  <div style={{fontSize:48,marginBottom:12}}>📄</div>
                  <div style={{fontSize:14,fontWeight:500}}>Clique ou arraste o arquivo aqui</div>
                  <div style={{fontSize:11,color:'var(--text-muted)',marginTop:4}}>.csv · .xlsx · .xls</div>
                </div>
              </div>

              {historico.length > 0 && (
                <div className="card" style={{marginTop:20}}>
                  <div style={{fontFamily:'DM Serif Display,serif',fontSize:15,marginBottom:14}}>📜 Histórico</div>
                  {historico.map(h => (
                    <div key={h.id} style={{display:'grid',gridTemplateColumns:'100px 1fr 80px 60px 60px 80px',gap:10,padding:'8px 0',fontSize:12,borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
                      <span style={{fontWeight:600}}>{h.entidade}</span>
                      <span style={{color:'var(--text-muted)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{h.nome_arquivo || '—'}</span>
                      <span style={{color:'var(--text-muted)'}}>{h.qtd_lidos} lidos</span>
                      <span style={{color:'var(--success)'}}>{h.qtd_criados}+</span>
                      <span style={{color:h.qtd_erros>0?'var(--danger)':'var(--text-muted)'}}>{h.qtd_erros}!</span>
                      <span style={{color:'var(--text-muted)',textAlign:'right'}}>{new Date(h.iniciado_em).toLocaleDateString('pt-BR')}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {step === 'mapear' && (
            <div className="card">
              <div style={{fontFamily:'DM Serif Display,serif',fontSize:16,marginBottom:4}}>Mapeamento de colunas</div>
              <div style={{fontSize:12,color:'var(--text-muted)',marginBottom:18}}>
                Arquivo: <strong style={{color:'var(--text)'}}>{nomeArquivo}</strong> · {excelData.rows.length} linhas
              </div>
              <table style={{width:'100%',borderCollapse:'collapse'}}>
                <thead>
                  <tr style={{textAlign:'left'}}>
                    {['Campo do CRM','Coluna do arquivo','Amostra'].map(h => (
                      <th key={h} style={{fontSize:10,fontWeight:600,letterSpacing:'1px',textTransform:'uppercase',color:'var(--text-muted)',padding:'0 0 10px',borderBottom:'1px solid var(--border)'}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {mapeamento.map((m, i) => {
                    const amostra = m.coluna ? excelData.rows.slice(0,2).map((r:any)=>r[m.coluna]).filter(Boolean).join(' / ') || '—' : '—'
                    return (
                      <tr key={m.campo}>
                        <td style={{padding:'10px 0',fontSize:13,fontWeight:500,borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
                          {m.label}{m.obrigatorio && <span style={{color:'var(--danger)',marginLeft:4}}>*</span>}
                        </td>
                        <td style={{padding:'10px 16px 10px 0',borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
                          <select style={sel} value={m.coluna} onChange={e=>{const up=[...mapeamento]; up[i]={...up[i], coluna: e.target.value}; setMapeamento(up)}}>
                            <option value="">— ignorar —</option>
                            {excelData.headers.map(h => <option key={h} value={h}>{h}</option>)}
                          </select>
                        </td>
                        <td style={{padding:'10px 0',fontSize:11,color:'var(--text-muted)',maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',borderBottom:'1px solid rgba(255,255,255,0.04)'}}>{amostra}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <div style={{display:'flex',gap:10,justifyContent:'flex-end',marginTop:20}}>
                <button className="btn-secondary" onClick={()=>setStep('upload')}>← Voltar</button>
                <button className="btn-primary" onClick={()=>setStep('preview')} disabled={!obrigatoriosOk}>
                  Ver Preview →
                </button>
              </div>
              {!obrigatoriosOk && (
                <div style={{fontSize:11,color:'var(--danger)',marginTop:8,textAlign:'right'}}>
                  Mapeie os campos obrigatórios (*)
                </div>
              )}
            </div>
          )}

          {step === 'preview' && (
            <div className="card">
              <div style={{fontFamily:'DM Serif Display,serif',fontSize:16,marginBottom:4}}>Preview</div>
              <div style={{fontSize:12,color:'var(--text-muted)',marginBottom:18}}>
                {excelData.rows.length} registros serão importados como <strong style={{color:'var(--gold)'}}>{ENTIDADES_INFO.find(e=>e.key===entidade)?.label}</strong>
              </div>
              <div style={{overflowX:'auto',maxHeight:340,border:'1px solid var(--border)',borderRadius:8}}>
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                  <thead style={{background:'rgba(255,255,255,0.04)'}}>
                    <tr>
                      {mapeamento.filter(m=>m.coluna).map(m => (
                        <th key={m.campo} style={{padding:'8px 12px',textAlign:'left',fontSize:10,fontWeight:600,letterSpacing:'1px',textTransform:'uppercase',color:'var(--text-muted)',whiteSpace:'nowrap'}}>{m.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {excelData.rows.slice(0,10).map((row,ri)=>(
                      <tr key={ri} style={{borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
                        {mapeamento.filter(m=>m.coluna).map(m => (
                          <td key={m.campo} style={{padding:'8px 12px',whiteSpace:'nowrap',maxWidth:200,overflow:'hidden',textOverflow:'ellipsis'}}>{String(row[m.coluna]??'—')}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {excelData.rows.length > 10 && <div style={{fontSize:11,color:'var(--text-muted)',marginTop:8}}>... e mais {excelData.rows.length-10} linhas</div>}
              <div style={{display:'flex',gap:10,justifyContent:'flex-end',marginTop:20}}>
                <button className="btn-secondary" onClick={()=>setStep('mapear')}>← Voltar</button>
                <button className="btn-primary" onClick={confirmarImportacao} disabled={importando}>
                  {importando?'⏳ Importando...':'✅ Confirmar Importação'}
                </button>
              </div>
            </div>
          )}

          {step === 'sucesso' && (
            <div className="card" style={{textAlign:'center',padding:'48px 32px'}}>
              <div style={{fontSize:48,marginBottom:14}}>{resultado?.qtd_erros === 0 ? '🎉' : '⚠'}</div>
              <div style={{fontFamily:'DM Serif Display,serif',fontSize:22,color:'var(--success)',marginBottom:8}}>
                Importação concluída
              </div>
              <div style={{fontSize:13,color:'var(--text-muted)',marginBottom:24}}>
                {resultado?.qtd_lidos} linhas lidas · <span style={{color:'var(--success)'}}>{resultado?.qtd_criados} criados</span>{resultado?.qtd_atualizados > 0 && <> · <span style={{color:'var(--warning)'}}>{resultado?.qtd_atualizados} atualizados</span></>}{resultado?.qtd_erros > 0 && <> · <span style={{color:'var(--danger)'}}>{resultado?.qtd_erros} erros</span></>}
              </div>
              {resultado?.erros && resultado.erros.length > 0 && (
                <div style={{marginBottom:24,padding:'12px 16px',background:'rgba(224,82,82,0.06)',border:'1px solid rgba(224,82,82,0.2)',borderRadius:8,textAlign:'left',maxHeight:160,overflow:'auto'}}>
                  <div style={{fontSize:11,fontWeight:700,color:'var(--danger)',marginBottom:6}}>Erros:</div>
                  {resultado.erros.map((e: string, i: number) => <div key={i} style={{fontSize:11,color:'var(--text-muted)'}}>• {e}</div>)}
                </div>
              )}
              <div style={{display:'flex',gap:10,justifyContent:'center'}}>
                <button className="btn-secondary" onClick={novoImport}>Importar outro</button>
                <button className="btn-primary" onClick={()=>router.push('/dashboard')}>Voltar pro Dashboard</button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
