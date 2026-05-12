'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Entidade = 'negocio' | 'empresa' | 'contato' | 'produto'
type Campo = {
  id: string
  entidade: Entidade
  nome: string
  chave: string
  tipo: string
  opcoes: string[] | null
  obrigatorio: boolean
  obrigatorio_modo?: 'nao' | 'sempre' | 'por_etapa'
  visibilidade?: 'visivel' | 'por_funil'
  etapas_obrigatorias?: string[]
  funis_visiveis?: string[]
  permite_novas_opcoes?: boolean
  ordem: number
  ativo: boolean
  criado_em: string
}

const TIPO_LABEL: Record<string, { label: string; sub: string }> = {
  texto:          { label:'Texto',           sub:'Texto Livre' },
  numero:         { label:'Número',          sub:'Numérico' },
  data:           { label:'Data',            sub:'DD/MM/AAAA' },
  select:         { label:'Seleção única',   sub:'Só pode escolher um item' },
  multiselect:    { label:'Seleção múltipla',sub:'Pode escolher vários itens' },
  email:          { label:'E-mail',          sub:'Texto Livre' },
  telefone:       { label:'Telefone',        sub:'Texto Livre' },
  moeda:          { label:'Moeda',           sub:'R$' },
  bool:           { label:'Sim/Não',         sub:'Booleano' },
}

const ENTIDADES: Array<{ k: Entidade; l: string }> = [
  { k:'negocio', l:'Negociação' },
  { k:'empresa', l:'Empresa' },
  { k:'contato', l:'Contato' },
  { k:'produto', l:'Produto e Serviço' },
]

export default function CamposPage() {
  const supabase = createClient()
  const router = useRouter()
  const [tab, setTab] = useState<Entidade>('negocio')
  const [campos, setCampos] = useState<Campo[]>([])
  const [funisAll, setFunisAll] = useState<Array<{id:string;nome:string}>>([])
  const [loading, setLoading] = useState(true)
  const [devMode, setDevMode] = useState(false)
  const [menuAberto, setMenuAberto] = useState<string|null>(null)
  const [modal, setModal] = useState<null | { mode:'novo'|'editar'; data:Partial<Campo> }>(null)
  const [salvando, setSalvando] = useState(false)
  const [draggingId, setDraggingId] = useState<string|null>(null)
  const [dragOverId, setDragOverId] = useState<string|null>(null)

  useEffect(()=>{ try { setDevMode(localStorage.getItem('cm_dev_mode')==='1') } catch{} }, [])

  async function carregar() {
    setLoading(true)
    const [{ data }, { data: fns }] = await Promise.all([
      supabase.from('campos_personalizados').select('*').order('ordem',{ascending:true}),
      supabase.from('funis').select('id,nome').order('ordem'),
    ])
    setCampos((data || []) as any)
    setFunisAll((fns || []) as any)
    setLoading(false)
  }
  useEffect(()=>{ carregar() }, [])

  const camposTab = campos.filter(c => c.entidade === tab && c.ativo !== false)

  async function salvar() {
    if (!modal) return
    const d = modal.data
    if (!d.nome?.trim()) { alert('Informe o nome'); return }
    setSalvando(true)
    const payload: any = {
      entidade: (d.entidade as any) || tab,
      nome: d.nome.trim(),
      chave: (d.chave || d.nome.toLowerCase().replace(/[^a-z0-9]+/g,'_')).trim(),
      tipo: d.tipo || 'texto',
      opcoes: (d.tipo === 'select' || d.tipo === 'multiselect') ? (d.opcoes || []) : null,
      obrigatorio_modo: d.obrigatorio_modo || 'nao',
      obrigatorio: d.obrigatorio_modo !== 'nao',
      visibilidade: d.visibilidade || 'visivel',
      etapas_obrigatorias: d.etapas_obrigatorias || [],
      funis_visiveis: d.funis_visiveis || [],
      permite_novas_opcoes: !!d.permite_novas_opcoes,
      ativo: d.ativo !== false,
      ordem: d.ordem ?? (camposTab.length + 1),
    }
    if (modal.mode === 'novo') {
      const { error } = await supabase.from('campos_personalizados').insert(payload)
      if (error) { alert('Erro: ' + error.message); setSalvando(false); return }
    } else {
      const { error } = await supabase.from('campos_personalizados').update(payload).eq('id', d.id!)
      if (error) { alert('Erro: ' + error.message); setSalvando(false); return }
    }
    setSalvando(false)
    setModal(null)
    carregar()
  }

  async function arquivar(c: Campo) {
    if (!confirm(`Arquivar campo "${c.nome}"?`)) return
    await supabase.from('campos_personalizados').update({ ativo: false }).eq('id', c.id)
    carregar()
  }

  async function reordenar(dragId: string, dropId: string) {
    const lista = camposTab.slice()
    const fromIdx = lista.findIndex(c => c.id === dragId)
    const toIdx   = lista.findIndex(c => c.id === dropId)
    if (fromIdx === -1 || toIdx === -1) return
    const [moved] = lista.splice(fromIdx, 1)
    lista.splice(toIdx, 0, moved)
    // Atualiza ordem em batch
    await Promise.all(lista.map((c, i) => supabase.from('campos_personalizados').update({ ordem: i+1 }).eq('id', c.id)))
    carregar()
  }

  function labelObrig(c: Campo) {
    const m = c.obrigatorio_modo || (c.obrigatorio ? 'sempre' : 'nao')
    if (m === 'sempre')    return 'Sempre obrigatório'
    if (m === 'por_etapa') return 'Obrigatório por etapa'
    return 'Não obrigatório'
  }
  function labelVis(c: Campo) {
    return (c.visibilidade || 'visivel') === 'por_funil' ? 'Visível por funil' : 'Visível'
  }

  return (
    <div style={{padding:'24px 32px',maxWidth:1280,margin:'0 auto'}}>
      <div style={{display:'flex',alignItems:'center',gap:14,marginBottom:6}}>
        <Link href="/dashboard/configuracoes/hub" style={{color:'var(--blue)',fontSize:12,textDecoration:'none'}}>← Configurações</Link>
      </div>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:18}}>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <button onClick={()=>router.push('/dashboard/configuracoes/hub')}
            style={{background:'transparent',border:'none',cursor:'pointer',color:'var(--blue)',fontSize:18}}>←</button>
          <h1 style={{fontFamily:'DM Serif Display,serif',fontSize:24,color:'var(--text)'}}>Configurar campos de cadastro</h1>
        </div>
        <button onClick={()=>setModal({mode:'novo',data:{tipo:'texto',obrigatorio_modo:'nao',visibilidade:'visivel'}})}
          style={{background:'var(--text)',color:'#fff',border:'none',padding:'10px 18px',borderRadius:8,fontSize:13,fontWeight:600,cursor:'pointer'}}>
          + Criar campo
        </button>
      </div>

      <div style={{display:'flex',gap:24,borderBottom:'1px solid var(--border-soft)',marginBottom:18}}>
        {ENTIDADES.map(e => (
          <button key={e.k} onClick={()=>setTab(e.k)}
            style={{padding:'12px 0',background:'transparent',border:'none',cursor:'pointer',fontSize:13,color:tab===e.k?'var(--teal)':'var(--text-muted)',fontWeight:tab===e.k?700:500,borderBottom:'2px solid '+(tab===e.k?'var(--teal)':'transparent'),marginBottom:-1}}>
            {e.l}
          </button>
        ))}
      </div>

      <div style={{fontSize:11,fontWeight:700,letterSpacing:1,textTransform:'uppercase',color:'var(--text-muted)',padding:'10px 0',borderBottom:'1px solid var(--border-soft)',marginBottom:0}}>
        Campos personalizados
      </div>

      {loading ? (
        <div style={{padding:40,textAlign:'center',color:'var(--text-muted)'}}>Carregando...</div>
      ) : camposTab.length === 0 ? (
        <div style={{padding:40,textAlign:'center',color:'var(--text-muted)',fontSize:13}}>Nenhum campo personalizado para esta entidade. Use <strong>+ Criar campo</strong> no canto superior direito.</div>
      ) : (
        <table style={{width:'100%',borderCollapse:'collapse',marginTop:8}}>
          <thead>
            <tr>
              {['ORDEM','NOME DO CAMPO','TIPO','OBRIGATORIEDADE','PREFERÊNCIAS','CRIADO EM','AÇÕES'].map(h=>(
                <th key={h} style={{fontSize:10,fontWeight:700,letterSpacing:1.2,color:'var(--text-muted)',textAlign:'left',padding:'10px 14px',borderBottom:'1px solid var(--border-soft)'}}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {camposTab.map(c => {
              const t = TIPO_LABEL[c.tipo] || { label: c.tipo, sub: '' }
              return (
                <tr key={c.id}
                  draggable
                  onDragStart={()=>setDraggingId(c.id)}
                  onDragOver={(e)=>{ e.preventDefault(); if (dragOverId !== c.id) setDragOverId(c.id) }}
                  onDragLeave={()=>setDragOverId(prev => prev === c.id ? null : prev)}
                  onDrop={()=>{ if (draggingId && draggingId !== c.id) reordenar(draggingId, c.id); setDraggingId(null); setDragOverId(null) }}
                  onDragEnd={()=>{ setDraggingId(null); setDragOverId(null) }}
                  style={{borderBottom:'1px solid var(--border-soft)',background:dragOverId===c.id?'var(--bg-subtle)':'transparent',opacity:draggingId===c.id?0.4:1}}>
                  <td style={{padding:'12px 14px',width:50,cursor:'grab',color:'var(--text-muted)'}}>⋮⋮</td>
                  <td style={{padding:'12px 14px'}}>
                    <div style={{fontSize:13,fontWeight:600,color:'var(--text)'}}>{c.nome}</div>
                    {devMode && <div style={{fontSize:10,color:'var(--text-faint)',marginTop:2,fontFamily:'monospace'}}>ID: {c.id}</div>}
                  </td>
                  <td style={{padding:'12px 14px'}}>
                    <div style={{fontSize:13,color:'var(--text)'}}>{t.label}</div>
                    <div style={{fontSize:11,color:'var(--text-muted)'}}>{t.sub}</div>
                  </td>
                  <td style={{padding:'12px 14px',fontSize:12,color:'var(--text)'}}>{labelObrig(c)}</td>
                  <td style={{padding:'12px 14px',fontSize:12,color:'var(--text)'}}>{labelVis(c)}</td>
                  <td style={{padding:'12px 14px',fontSize:12,color:'var(--text-muted)'}}>{c.criado_em ? new Date(c.criado_em).toLocaleDateString('pt-BR') : '—'}</td>
                  <td style={{padding:'12px 14px',width:60,position:'relative'}}>
                    <button onClick={()=>setMenuAberto(menuAberto===c.id?null:c.id)}
                      style={{background:'transparent',border:'none',cursor:'pointer',padding:'4px 8px',color:'var(--text-muted)',fontSize:14}}>⋮</button>
                    {menuAberto === c.id && (
                      <>
                        <div onClick={()=>setMenuAberto(null)} style={{position:'fixed',inset:0,zIndex:40}}/>
                        <div style={{position:'absolute',top:'100%',right:8,background:'#fff',border:'1px solid var(--border-soft)',borderRadius:8,boxShadow:'var(--shadow-lg)',zIndex:50,padding:4,minWidth:160}}>
                          <button onClick={()=>{ setMenuAberto(null); setModal({mode:'editar',data:c}) }}
                            style={{display:'block',width:'100%',textAlign:'left',padding:'8px 12px',border:'none',background:'transparent',cursor:'pointer',fontSize:13,color:'var(--text)',borderRadius:6}}>✏️ Editar</button>
                          <button onClick={()=>{ setMenuAberto(null); arquivar(c) }}
                            style={{display:'block',width:'100%',textAlign:'left',padding:'8px 12px',border:'none',background:'transparent',cursor:'pointer',fontSize:13,color:'var(--red)',borderRadius:6}}>🗑 Arquivar</button>
                        </div>
                      </>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      {modal && (() => {
        const d = modal.data
        const setD = (patch: Partial<Campo>) => setModal(m => m && ({ ...m, data: { ...m.data, ...patch }}))
        const opcoes = d.opcoes || []
        const tipoPrecisaOpcoes = d.tipo === 'select' || d.tipo === 'multiselect'
        const funisSelecionados = d.funis_visiveis || []
        const labelStyle: React.CSSProperties = { display:'block', fontSize:12, fontWeight:600, marginBottom:6, color:'var(--text)' }
        const inputStyle: React.CSSProperties = { width:'100%', padding:'10px 12px', border:'1px solid var(--border-soft)', borderRadius:8, fontSize:13, outline:'none', boxSizing:'border-box', background:'#fff' }
        const Sw = ({ on, onChange, disabled }: { on: boolean; onChange: (v:boolean)=>void; disabled?:boolean }) => (
          <button type="button" disabled={disabled} onClick={()=>onChange(!on)}
            style={{width:38,height:22,borderRadius:999,border:'none',cursor:disabled?'default':'pointer',background:on?'#22d3ee':'var(--border-strong)',position:'relative',transition:'background 0.2s',flexShrink:0,opacity:disabled?0.5:1}}>
            <span style={{position:'absolute',top:3,left:on?19:3,width:16,height:16,borderRadius:'50%',background:'#fff',transition:'left 0.2s',boxShadow:'0 1px 2px rgba(0,0,0,0.3)'}}/>
          </button>
        )
        const Row = ({ title, sub, children }: { title:string; sub?:string; children:React.ReactNode }) => (
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'14px 0',borderTop:'1px solid var(--border-soft)',gap:14}}>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:13,fontWeight:600,color:'var(--text)'}}>{title}</div>
              {sub && <div style={{fontSize:11,color:'var(--text-muted)',marginTop:3}}>{sub}</div>}
            </div>
            {children}
          </div>
        )
        const obrig = (d.obrigatorio_modo || 'nao') !== 'nao'
        const visivel = d.ativo !== false
        const porFunil = (d.visibilidade || 'visivel') === 'por_funil'
        return (
        <>
          <div onClick={()=>setModal(null)} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',zIndex:1000}}/>
          <div style={{position:'fixed',top:0,right:0,bottom:0,width:'min(440px,100vw)',background:'#fff',zIndex:1001,boxShadow:'-8px 0 32px rgba(0,0,0,0.18)',display:'flex',flexDirection:'column'}}>
            <div style={{padding:'18px 22px',borderBottom:'1px solid var(--border-soft)',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              <div style={{fontSize:16,fontWeight:700,color:'var(--text)'}}>{modal.mode==='novo'?'Criar campo personalizado':'Editar campo personalizado'}</div>
              <button onClick={()=>setModal(null)} style={{background:'none',border:'none',cursor:'pointer',fontSize:18,color:'var(--text-muted)'}}>✕</button>
            </div>
            <div style={{flex:1,overflow:'auto',padding:'18px 22px'}}>
              <div style={{marginBottom:14}}>
                <label style={labelStyle}>Campo para cadastro *</label>
                <select value={(d.entidade as any) || tab} onChange={e=>setD({ entidade: e.target.value as any })}
                  style={inputStyle}>
                  {ENTIDADES.map(en => <option key={en.k} value={en.k}>{en.l}</option>)}
                </select>
              </div>
              <div style={{marginBottom:14}}>
                <label style={labelStyle}>Nome do campo *</label>
                <input value={d.nome || ''} onChange={e=>setD({ nome: e.target.value })}
                  style={inputStyle}/>
              </div>
              <div style={{marginBottom:14}}>
                <label style={labelStyle}>Tipo do campo *</label>
                <select value={d.tipo || 'texto'} onChange={e=>setD({ tipo: e.target.value })}
                  style={{...inputStyle, background:modal.mode==='editar'?'var(--bg-subtle)':'#fff'}}
                  disabled={modal.mode==='editar'}>
                  {Object.entries(TIPO_LABEL).map(([k,v])=> <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>

              {tipoPrecisaOpcoes && (
                <div style={{marginBottom:14}}>
                  <div style={{display:'flex',flexDirection:'column',gap:8,marginBottom:8}}>
                    {opcoes.map((opt, i) => (
                      <div key={i} style={{display:'flex',alignItems:'center',gap:8}}>
                        <input value={opt} onChange={e=>{
                          const novo = opcoes.slice(); novo[i] = e.target.value; setD({ opcoes: novo })
                        }} style={inputStyle}/>
                        <button onClick={()=>{
                          const novo = opcoes.slice(); novo.splice(i,1); setD({ opcoes: novo })
                        }} title="Remover" style={{background:'none',border:'none',cursor:'pointer',color:'var(--blue)',fontSize:18,padding:'0 4px'}}>✕</button>
                      </div>
                    ))}
                  </div>
                  <button onClick={()=>setD({ opcoes: [...opcoes, ''] })}
                    style={{background:'var(--blue-soft)',color:'var(--blue-dark)',border:'1px solid #bfdbfe',padding:'8px 14px',borderRadius:8,fontSize:13,fontWeight:600,cursor:'pointer'}}>
                    + Adicionar opções
                  </button>
                </div>
              )}

              {tipoPrecisaOpcoes && (
                <Row title="Permitir adicionar opções" sub="Permite criar e incluir opções durante o preenchimento.">
                  <Sw on={!!d.permite_novas_opcoes} onChange={v=>setD({ permite_novas_opcoes: v })}/>
                </Row>
              )}

              <Row title="Obrigatório" sub="Ative para deixar este campo com preenchimento obrigatório">
                <Sw on={obrig} onChange={v=>setD({ obrigatorio_modo: v ? 'sempre' : 'nao' })}/>
              </Row>

              <Row title="Visível no cadastro" sub="Ative para deixar o campo visível.">
                <Sw on={visivel} onChange={v=>setD({ ativo: v })}/>
              </Row>

              <div style={{padding:'14px 0',borderTop:'1px solid var(--border-soft)'}}>
                <label style={{display:'flex',alignItems:'flex-start',gap:10,cursor:'pointer',marginBottom:8}}>
                  <input type="radio" name="vis" checked={!porFunil} onChange={()=>setD({ visibilidade: 'visivel' })} style={{marginTop:3}}/>
                  <div>
                    <div style={{fontSize:13,fontWeight:600,color:'var(--text)'}}>Exibir em todos os funis</div>
                    <div style={{fontSize:11,color:'var(--text-muted)'}}>Este campo será exibido em todos os funis.</div>
                  </div>
                </label>
                <label style={{display:'flex',alignItems:'flex-start',gap:10,cursor:'pointer'}}>
                  <input type="radio" name="vis" checked={porFunil} onChange={()=>setD({ visibilidade: 'por_funil' })} style={{marginTop:3}}/>
                  <div>
                    <div style={{fontSize:13,fontWeight:600,color:'var(--text)',display:'flex',alignItems:'center',gap:6}}>
                      Escolher funis para exibir
                      <span style={{background:'#22d3ee',color:'#03323a',fontSize:9,fontWeight:700,padding:'2px 6px',borderRadius:4,textTransform:'uppercase',letterSpacing:0.5}}>NOVO</span>
                    </div>
                    <div style={{fontSize:11,color:'var(--text-muted)'}}>Este campo será exibido apenas nos funis selecionados.</div>
                  </div>
                </label>
                {porFunil && (
                  <div style={{marginTop:10,padding:'8px 10px',border:'1px solid var(--border-soft)',borderRadius:8,display:'flex',flexWrap:'wrap',gap:6,alignItems:'center'}}>
                    {funisSelecionados.map(fid => {
                      const f = funisAll.find(x => x.id === fid)
                      if (!f) return null
                      return (
                        <span key={fid} style={{display:'inline-flex',alignItems:'center',gap:4,background:'var(--bg-subtle)',border:'1px solid var(--border-soft)',borderRadius:6,padding:'4px 8px',fontSize:12,color:'var(--text)'}}>
                          {f.nome}
                          <button onClick={()=>setD({ funis_visiveis: funisSelecionados.filter(x => x !== fid) })}
                            style={{background:'none',border:'none',cursor:'pointer',color:'var(--text-muted)',fontSize:13,padding:0,marginLeft:4}}>×</button>
                        </span>
                      )
                    })}
                    <select value="" onChange={e=>{
                      if (!e.target.value) return
                      if (!funisSelecionados.includes(e.target.value)) {
                        setD({ funis_visiveis: [...funisSelecionados, e.target.value] })
                      }
                    }} style={{flex:'1 0 140px',minWidth:140,border:'none',background:'transparent',outline:'none',fontSize:13,color:'var(--text-muted)',cursor:'pointer'}}>
                      <option value="">+ Adicionar funil…</option>
                      {funisAll.filter(f => !funisSelecionados.includes(f.id)).map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
                    </select>
                  </div>
                )}
              </div>
            </div>
            <div style={{padding:'14px 22px',borderTop:'1px solid var(--border-soft)',display:'flex',gap:10,justifyContent:'flex-end'}}>
              <button onClick={()=>setModal(null)}
                style={{padding:'9px 16px',borderRadius:8,border:'1px solid var(--blue)',background:'#fff',color:'var(--blue)',cursor:'pointer',fontSize:13,fontWeight:600}}>Cancelar</button>
              <button onClick={salvar} disabled={salvando}
                style={{padding:'9px 18px',borderRadius:8,border:'none',background:'var(--text)',color:'#fff',cursor:'pointer',fontSize:13,fontWeight:600,opacity:salvando?0.5:1}}>
                {salvando?'Salvando...':'Salvar'}
              </button>
            </div>
          </div>
        </>
        )
      })()}
    </div>
  )
}
