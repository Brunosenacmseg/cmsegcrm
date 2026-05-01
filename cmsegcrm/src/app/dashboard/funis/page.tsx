'use client'
import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function FunisPage() {
  const supabase = createClient()
  const router   = useRouter()

  const [profile, setProfile]     = useState<any>(null)
  const [funis, setFunis]         = useState<any[]>([])
  const [negocios, setNegocios]   = useState<any[]>([])
  const [usuarios, setUsuarios]   = useState<any[]>([])
  const [loading, setLoading]     = useState(true)
  const [funilAtivo, setFunilAtivo] = useState<string|null>(null)
  const [seletorAberto, setSeletorAberto] = useState(false)

  // Modal novo negócio
  const [modalNovo, setModalNovo] = useState(false)
  const [funilModal, setFunilModal] = useState<any>(null)
  const [salvando, setSalvando]   = useState(false)
  const [formNovo, setFormNovo]   = useState({ titulo:'', produto:'', premio:'', etapa:'', obs:'', vendedor_id:'' })
  const [clienteBusca, setClienteBusca] = useState('')
  const [clientesRes, setClientesRes]   = useState<any[]>([])
  const [clienteSel, setClienteSel]     = useState<any>(null)

  // Modal vincular cliente
  const [modalVincular, setModalVincular] = useState(false)
  const [negocioVincular, setNegocioVincular] = useState<any>(null)
  const [vincularBusca, setVincularBusca] = useState('')
  const [vincularRes, setVincularRes]     = useState<any[]>([])
  const [vincularTab, setVincularTab]     = useState<'buscar'|'criar'>('buscar')
  const [novoClienteForm, setNovoClienteForm] = useState({ nome:'', cpf_cnpj:'', telefone:'', email:'' })
  const [vinculando, setVinculando]       = useState(false)

  // Modal detalhes do card
  const [modalCard, setModalCard] = useState(false)
  const [cardAtivo, setCardAtivo] = useState<any>(null)

  useEffect(() => { init() }, [])

  async function init() {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: prof } = await supabase.from('users').select('*').eq('id', user?.id||'').single()
    setProfile(prof)
    const { data: usr } = await supabase.from('users').select('id,nome,role').order('nome')
    setUsuarios(usr||[])
    await carregarFunis()
    setLoading(false)
  }

  async function carregarFunis() {
    const { data: fs } = await supabase.from('funis').select('*').order('ordem')
    setFunis(fs||[])
    if (fs?.length && !funilAtivo) setFunilAtivo(fs[0].id)
    await carregarNegocios()
  }

  async function carregarNegocios() {
    const { data } = await supabase.from('negocios').select(`
      *,
      clientes(id,nome,cpf_cnpj,telefone),
      users!negocios_vendedor_id_fkey(nome)
    `).order('created_at', { ascending: false })
    setNegocios(data||[])
  }

  async function buscarClientes(q: string, setter: (v:any[])=>void) {
    if (q.length < 2) { setter([]); return }
    const { data } = await supabase.from('clientes').select('id,nome,cpf_cnpj,telefone').or(`nome.ilike.%${q}%,cpf_cnpj.ilike.%${q}%`).limit(6)
    setter(data||[])
  }

  async function salvarNegocio() {
    if (!formNovo.titulo) return
    setSalvando(true)
    const funil = funilModal
    const etapa = formNovo.etapa || funil?.etapas?.[0] || ''
    await supabase.from('negocios').insert({
      titulo:      formNovo.titulo,
      produto:     formNovo.produto || null,
      premio:      formNovo.premio ? parseFloat(formNovo.premio) : null,
      obs:         formNovo.obs || null,
      etapa,
      funil_id:    funil.id,
      cliente_id:  clienteSel?.id || null,
      vendedor_id: formNovo.vendedor_id || profile?.id,
    })
    setModalNovo(false)
    setFormNovo({ titulo:'', produto:'', premio:'', etapa:'', obs:'', vendedor_id:'' })
    setClienteSel(null); setClienteBusca('')
    setSalvando(false)
    await carregarNegocios()
  }

  async function moverEtapa(negocioId: string, novaEtapa: string) {
    await supabase.from('negocios').update({ etapa: novaEtapa }).eq('id', negocioId)
    await carregarNegocios()
  }

  async function marcarStatus(negocioId: string, status: 'ganho'|'perdido'|'em_andamento', motivo?: string) {
    const patch: any = { status }
    if (status === 'em_andamento') {
      patch.data_fechamento = null
      patch.fechado_por     = null
      patch.motivo_perda    = null
    } else {
      patch.data_fechamento = new Date().toISOString()
      patch.fechado_por     = profile?.id || null
      if (status === 'perdido') patch.motivo_perda = motivo || null
    }
    await supabase.from('negocios').update(patch).eq('id', negocioId)

    // Meta Pixel: dispara Purchase quando marcar Ganho. Se tiver
    // meta_campaign_id, ajuda a otimizar campanhas.
    if (status === 'ganho') {
      const neg = negocios.find(n => n.id === negocioId)
      if (neg && typeof window !== 'undefined' && (window as any).fbq) {
        try {
          ;(window as any).fbq('track', 'Purchase', {
            value: Number(neg.premio || 0),
            currency: 'BRL',
            content_name: neg.titulo || neg.produto || '',
            content_category: neg.produto || '',
          })
        } catch {}
      }
    }

    setModalCard(false)
    await carregarNegocios()
  }

  async function vincularCliente(clienteId: string) {
    if (!negocioVincular) return
    setVinculando(true)
    await supabase.from('negocios').update({ cliente_id: clienteId }).eq('id', negocioVincular.id)
    setModalVincular(false)
    setNegocioVincular(null)
    setVincularBusca(''); setVincularRes([])
    setVinculando(false)
    await carregarNegocios()
  }

  async function criarEVincularCliente() {
    if (!novoClienteForm.nome && !novoClienteForm.cpf_cnpj) return
    setVinculando(true)
    const { data: novo } = await supabase.from('clientes').insert({
      nome:     novoClienteForm.nome,
      cpf_cnpj: novoClienteForm.cpf_cnpj || null,
      telefone: novoClienteForm.telefone || null,
      email:    novoClienteForm.email    || null,
      tipo:     'PF',
    }).select('id').single()
    if (novo?.id) await vincularCliente(novo.id)
    setNovoClienteForm({ nome:'', cpf_cnpj:'', telefone:'', email:'' })
    setVinculando(false)
  }

  async function excluirNegocio(id: string) {
    if (!confirm('Excluir este card?')) return
    await supabase.from('negocios').delete().eq('id', id)
    setModalCard(false)
    await carregarNegocios()
  }

  async function renomearFunil(f: any) {
    const novoNome = prompt('Novo nome do funil:', f.nome || '')
    if (novoNome === null) return
    const nome = novoNome.trim()
    if (!nome || nome === f.nome) return
    // Usa endpoint server-side (bypassa RLS, dá erro claro)
    const { data: { session } } = await supabase.auth.getSession()
    const r = await fetch('/api/funis', {
      method: 'PATCH',
      headers: { 'Content-Type':'application/json', Authorization: `Bearer ${session?.access_token||''}` },
      body: JSON.stringify({ id: f.id, nome })
    })
    const j = await r.json()
    if (!r.ok) { alert('Erro ao renomear: ' + (j.error || 'falha')); return }
    await carregarFunis()
  }

  async function excluirFunil(f: any) {
    const cards = negocios.filter(n => n.funil_id === f.id).length
    const msg = cards > 0
      ? `O funil "${f.nome}" tem ${cards} card(s).\n\nIsto irá excluir o funil E todos os ${cards} card(s) dentro dele.\nEsta ação NÃO pode ser desfeita.\n\nConfirmar?`
      : `Excluir o funil "${f.nome}"?\n\nEsta ação não pode ser desfeita.`
    if (!confirm(msg)) return

    // Usa endpoint server-side (bypassa RLS) — faz cascade dos cards.
    const { data: { session } } = await supabase.auth.getSession()
    const r = await fetch(`/api/funis?id=${f.id}&cascade=1`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${session?.access_token||''}` },
    })
    const j = await r.json()
    if (!r.ok) {
      alert('Erro ao excluir o funil: ' + (j.error || 'falha desconhecida'))
      return
    }

    if (funilAtivo === f.id) setFunilAtivo(null)
    await carregarFunis()
    await carregarNegocios()
  }

  const funiAtual = funis.find(f => f.id === funilAtivo)
  const negociosFunil = negocios.filter(n => n.funil_id === funilAtivo)
  const inp: React.CSSProperties = { width:'100%', background:'rgba(255,255,255,0.05)', border:'1px solid var(--border)', borderRadius:8, padding:'8px 12px', color:'var(--text)', fontSize:13, fontFamily:'DM Sans,sans-serif', outline:'none', boxSizing:'border-box' as const }

  if (loading) return <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',color:'var(--text-muted)'}}>Carregando...</div>

  return (
    <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
      {/* Header */}
      <div style={{height:56,borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',padding:'0 20px',gap:10,background:'rgba(10,22,40,0.7)',backdropFilter:'blur(8px)',position:'sticky',top:0,zIndex:5,flexShrink:0}}>
        {/* Dropdown de funis (filtrado por equipe via RLS — funis já chegam só os permitidos) */}
        <div style={{position:'relative',minWidth:280}}>
          <button onClick={()=>setSeletorAberto(s=>!s)}
            style={{width:'100%',padding:'9px 14px',borderRadius:10,fontSize:13,cursor:'pointer',border:'1px solid var(--border)',background:'rgba(255,255,255,0.04)',color:'var(--text)',fontFamily:'DM Sans,sans-serif',display:'flex',alignItems:'center',gap:10,justifyContent:'space-between'}}>
            <span style={{display:'flex',alignItems:'center',gap:8,minWidth:0}}>
              <span style={{fontSize:16}}>{funiAtual?.emoji || '🏗'}</span>
              <span style={{fontWeight:500,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
                {funiAtual?.nome || 'Selecione um funil'}
              </span>
              {funiAtual && (
                <span style={{fontSize:11,color:'var(--text-muted)',background:'rgba(255,255,255,0.06)',padding:'1px 7px',borderRadius:10,marginLeft:6}}>
                  {negocios.filter(n=>n.funil_id===funiAtual.id).length}
                </span>
              )}
            </span>
            <span style={{fontSize:11,color:'var(--text-muted)',transition:'transform 0.18s',transform:seletorAberto?'rotate(180deg)':'none'}}>▾</span>
          </button>

          {seletorAberto && (
            <>
              <div onClick={()=>setSeletorAberto(false)} style={{position:'fixed',inset:0,zIndex:40}}/>
              <div style={{position:'absolute',top:'calc(100% + 4px)',left:0,right:0,zIndex:50,background:'#0e2040',border:'1px solid var(--border)',borderRadius:10,boxShadow:'var(--shadow-lg)',maxHeight:'70vh',overflow:'auto',padding:6}}>
                {funis.length === 0 && (
                  <div style={{padding:20,textAlign:'center',color:'var(--text-muted)',fontSize:12}}>
                    Nenhum funil disponível pra você. {profile?.role==='admin' ? 'Crie em ⚙ Configurar funis.' : 'Peça ao admin pra liberar.'}
                  </div>
                )}
                {funis.map(f => {
                  const ativo = funilAtivo === f.id
                  const cardCount = negocios.filter(n=>n.funil_id===f.id).length
                  return (
                    <div key={f.id}
                      onClick={()=>{ setFunilAtivo(f.id); setSeletorAberto(false) }}
                      style={{display:'flex',alignItems:'center',gap:10,padding:'9px 12px',borderRadius:7,cursor:'pointer',background:ativo?'rgba(201,168,76,0.10)':'transparent',color:ativo?'var(--gold)':'var(--text)',transition:'background 0.12s'}}
                      onMouseEnter={e=>{if(!ativo)(e.currentTarget as HTMLDivElement).style.background='rgba(255,255,255,0.04)'}}
                      onMouseLeave={e=>{if(!ativo)(e.currentTarget as HTMLDivElement).style.background='transparent'}}>
                      <span style={{fontSize:16,width:22,textAlign:'center'}}>{f.emoji||'📁'}</span>
                      <span style={{flex:1,fontSize:13,fontWeight:ativo?500:400}}>{f.nome}</span>
                      <span style={{fontSize:10,color:'var(--text-muted)',background:'rgba(255,255,255,0.06)',padding:'1px 7px',borderRadius:10}}>{cardCount}</span>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>

        {/* Ações sobre o funil ativo (admin) */}
        {funiAtual && profile?.role === 'admin' && (
          <>
            <button onClick={()=>renomearFunil(funiAtual)} title="Renomear funil"
              style={{padding:'9px 12px',borderRadius:8,fontSize:12,cursor:'pointer',border:'1px solid var(--border)',background:'rgba(255,255,255,0.04)',color:'var(--gold)',fontFamily:'DM Sans,sans-serif'}}>
              ✎ Renomear
            </button>
            <button onClick={()=>excluirFunil(funiAtual)} title="Excluir funil"
              style={{padding:'9px 12px',borderRadius:8,fontSize:12,cursor:'pointer',border:'1px solid rgba(224,82,82,0.3)',background:'rgba(224,82,82,0.06)',color:'var(--red)',fontFamily:'DM Sans,sans-serif'}}>
              🗑 Excluir
            </button>
          </>
        )}
        <div style={{flex:1}}/>
        {profile?.role === 'admin' && (
          <button onClick={()=>router.push('/dashboard/funis/configurar')}
            style={{padding:'6px 12px',borderRadius:8,fontSize:12,cursor:'pointer',border:'1px solid var(--border)',background:'rgba(255,255,255,0.04)',color:'var(--text-muted)',fontFamily:'DM Sans,sans-serif',whiteSpace:'nowrap'}}
            title="Criar, renomear e organizar funis (admin)">
            ⚙ Configurar funis
          </button>
        )}
        <button className="btn-primary" onClick={()=>{setFunilModal(funiAtual);setModalNovo(true);setFormNovo({titulo:'',produto:'',premio:'',etapa:funiAtual?.etapas?.[0]||'',obs:'',vendedor_id:profile?.id||''})}}>
          + Novo Card
        </button>
      </div>

      {/* Kanban */}
      {funiAtual && (
        <div style={{flex:1,overflowX:'auto',overflowY:'hidden',display:'flex',padding:'20px'}}>
          <div style={{display:'flex',gap:14,alignItems:'flex-start',minWidth:'max-content'}}>
            {(funiAtual.etapas||[]).map((etapa: string) => {
              const cards = negociosFunil.filter(n => n.etapa === etapa)
              return (
                <div key={etapa} style={{width:270,flexShrink:0,display:'flex',flexDirection:'column',gap:8}}>
                  {/* Header coluna */}
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'8px 12px',background:'rgba(255,255,255,0.04)',borderRadius:10,border:'1px solid var(--border)'}}>
                    <span style={{fontSize:12,fontWeight:600}}>{etapa}</span>
                    <span style={{fontSize:11,color:'var(--text-muted)',background:'rgba(255,255,255,0.08)',padding:'1px 7px',borderRadius:10}}>{cards.length}</span>
                  </div>

                  {/* Cards */}
                  {cards.map(neg => {
                    const isGanho   = neg.status === 'ganho'
                    const isPerdido = neg.status === 'perdido'
                    const corBorda  = isGanho ? 'rgba(28,181,160,0.55)' : isPerdido ? 'rgba(224,82,82,0.55)' : 'var(--border)'
                    const bgCard    = isGanho ? 'rgba(28,181,160,0.06)' : isPerdido ? 'rgba(224,82,82,0.06)'  : 'rgba(255,255,255,0.04)'
                    return (
                    <div key={neg.id} onClick={()=>{setCardAtivo(neg);setModalCard(true)}}
                      style={{background:bgCard,border:'1px solid '+corBorda,borderRadius:12,padding:'12px',cursor:'pointer',transition:'all 0.15s',position:'relative'}}
                      onMouseEnter={e=>(e.currentTarget.style.borderColor='var(--gold)')}
                      onMouseLeave={e=>(e.currentTarget.style.borderColor=corBorda)}>

                      {(isGanho || isPerdido) && (
                        <span style={{position:'absolute',top:8,right:8,fontSize:9,fontWeight:700,letterSpacing:'1px',padding:'2px 6px',borderRadius:5,textTransform:'uppercase',background:isGanho?'rgba(28,181,160,0.18)':'rgba(224,82,82,0.18)',color:isGanho?'var(--teal)':'var(--red)',border:'1px solid '+(isGanho?'rgba(28,181,160,0.4)':'rgba(224,82,82,0.4)')}}>
                          {isGanho?'✓ Ganho':'✕ Perdido'}
                        </span>
                      )}

                      <div style={{fontSize:13,fontWeight:500,marginBottom:6,lineHeight:1.3,paddingRight:isGanho||isPerdido?60:0,textDecoration:isPerdido?'line-through':'none',opacity:isPerdido?0.75:1}}>{neg.titulo}</div>

                      {/* Cliente ou botão vincular */}
                      {neg.clientes ? (
                        <div style={{fontSize:11,color:'var(--teal)',marginBottom:4,display:'flex',alignItems:'center',gap:4}}>
                          <span>👤</span> {neg.clientes.nome}
                        </div>
                      ) : (
                        <button onClick={e=>{e.stopPropagation();setNegocioVincular(neg);setVincularTab('buscar');setVincularBusca('');setVincularRes([]);setNovoClienteForm({nome:'',cpf_cnpj:neg.cpf_cnpj||'',telefone:'',email:''}); setModalVincular(true)}}
                          style={{fontSize:11,padding:'3px 8px',borderRadius:6,border:'1px dashed rgba(201,168,76,0.4)',background:'rgba(201,168,76,0.06)',color:'var(--gold)',cursor:'pointer',fontFamily:'DM Sans,sans-serif',marginBottom:4,display:'block'}}>
                          + Vincular cliente
                        </button>
                      )}

                      {neg.cpf_cnpj && !neg.clientes && (
                        <div style={{fontSize:10,color:'var(--text-muted)',marginBottom:4}}>CPF: {neg.cpf_cnpj}</div>
                      )}

                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:4}}>
                        {neg.premio ? <span style={{fontSize:12,fontWeight:600,color:'var(--teal)'}}>R$ {Number(neg.premio).toLocaleString('pt-BR',{minimumFractionDigits:2})}</span> : <span/>}
                        {neg.produto && <span style={{fontSize:10,color:'var(--text-muted)',background:'rgba(255,255,255,0.06)',padding:'1px 6px',borderRadius:8}}>{neg.produto}</span>}
                      </div>
                    </div>
                    )
                  })}

                  {cards.length === 0 && (
                    <div style={{padding:'20px 12px',textAlign:'center',color:'var(--text-muted)',fontSize:11,border:'1px dashed var(--border)',borderRadius:12}}>
                      Sem cards
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Modal Novo Negócio */}
      {modalNovo && (
        <div style={{position:'fixed',inset:0,background:'rgba(5,12,26,0.85)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',backdropFilter:'blur(6px)'}}
          onClick={e=>e.target===e.currentTarget&&setModalNovo(false)}>
          <div style={{background:'#0a1628',border:'1px solid var(--border)',borderRadius:20,padding:'28px 32px',width:480,maxWidth:'95vw',maxHeight:'90vh',overflow:'auto'}}>
            <div style={{fontFamily:'DM Serif Display,serif',fontSize:18,marginBottom:20}}>+ Novo Card — {funilModal?.nome}</div>

            <div style={{marginBottom:12}}><label style={{fontSize:12,color:'var(--text-muted)',display:'block',marginBottom:4}}>Título *</label>
              <input value={formNovo.titulo} onChange={e=>setFormNovo(f=>({...f,titulo:e.target.value}))} placeholder="Ex: Cobrança João Silva" style={inp} autoFocus />
            </div>

            {/* Busca de cliente — opcional */}
            <div style={{marginBottom:12,position:'relative'}}>
              <label style={{fontSize:12,color:'var(--text-muted)',display:'block',marginBottom:4}}>Cliente <span style={{color:'var(--text-muted)',fontWeight:400}}>(opcional — pode vincular depois)</span></label>
              {clienteSel ? (
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'8px 12px',background:'rgba(28,181,160,0.08)',border:'1px solid rgba(28,181,160,0.3)',borderRadius:8}}>
                  <span style={{fontSize:13}}>{clienteSel.nome}</span>
                  <button onClick={()=>{setClienteSel(null);setClienteBusca('')}} style={{background:'none',border:'none',color:'var(--text-muted)',cursor:'pointer'}}>✕</button>
                </div>
              ) : (
                <>
                  <input value={clienteBusca} onChange={e=>{setClienteBusca(e.target.value);buscarClientes(e.target.value,setClientesRes)}} placeholder="🔍 Buscar cliente..." style={inp} />
                  {clientesRes.length > 0 && (
                    <div style={{position:'absolute',top:'100%',left:0,right:0,background:'#0e2040',border:'1px solid var(--border)',borderRadius:8,zIndex:10,maxHeight:160,overflow:'auto'}}>
                      {clientesRes.map(c=>(
                        <div key={c.id} onClick={()=>{setClienteSel(c);setClienteBusca(c.nome);setClientesRes([])}}
                          style={{padding:'8px 14px',cursor:'pointer',fontSize:13}}
                          onMouseEnter={e=>(e.currentTarget.style.background='rgba(201,168,76,0.08)')}
                          onMouseLeave={e=>(e.currentTarget.style.background='')}>
                          {c.nome} <span style={{color:'var(--text-muted)',fontSize:11}}>{c.cpf_cnpj}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12}}>
              <div><label style={{fontSize:12,color:'var(--text-muted)',display:'block',marginBottom:4}}>Produto</label>
                <input value={formNovo.produto} onChange={e=>setFormNovo(f=>({...f,produto:e.target.value}))} placeholder="Ex: Auto" style={inp}/></div>
              <div><label style={{fontSize:12,color:'var(--text-muted)',display:'block',marginBottom:4}}>Prêmio (R$)</label>
                <input value={formNovo.premio} onChange={e=>setFormNovo(f=>({...f,premio:e.target.value}))} placeholder="0,00" style={inp}/></div>
            </div>

            <div style={{marginBottom:12}}><label style={{fontSize:12,color:'var(--text-muted)',display:'block',marginBottom:4}}>Etapa</label>
              <select value={formNovo.etapa} onChange={e=>setFormNovo(f=>({...f,etapa:e.target.value}))} style={{...inp,background:'#0e2040'}}>
                {(funilModal?.etapas||[]).map((e:string)=><option key={e} value={e} style={{background:'#0e2040'}}>{e}</option>)}
              </select>
            </div>

            <div style={{marginBottom:12}}><label style={{fontSize:12,color:'var(--text-muted)',display:'block',marginBottom:4}}>Responsável</label>
              <select value={formNovo.vendedor_id} onChange={e=>setFormNovo(f=>({...f,vendedor_id:e.target.value}))} style={{...inp,background:'#0e2040'}}>
                {usuarios.map(u=><option key={u.id} value={u.id} style={{background:'#0e2040'}}>{u.nome}</option>)}
              </select>
            </div>

            <div style={{marginBottom:20}}><label style={{fontSize:12,color:'var(--text-muted)',display:'block',marginBottom:4}}>Observações</label>
              <textarea value={formNovo.obs} onChange={e=>setFormNovo(f=>({...f,obs:e.target.value}))} rows={2} style={{...inp,resize:'none'}} placeholder="Detalhes..."/></div>

            <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
              <button className="btn-secondary" onClick={()=>setModalNovo(false)}>Cancelar</button>
              <button className="btn-primary" onClick={salvarNegocio} disabled={salvando||!formNovo.titulo}>
                {salvando?'Salvando...':'✓ Criar Card'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Vincular Cliente */}
      {modalVincular && negocioVincular && (
        <div style={{position:'fixed',inset:0,background:'rgba(5,12,26,0.85)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',backdropFilter:'blur(6px)'}}
          onClick={e=>e.target===e.currentTarget&&setModalVincular(false)}>
          <div style={{background:'#0a1628',border:'1px solid var(--border)',borderRadius:20,padding:'28px 32px',width:460,maxWidth:'95vw'}}>
            <div style={{fontFamily:'DM Serif Display,serif',fontSize:18,marginBottom:6}}>👤 Vincular Cliente</div>
            <div style={{fontSize:12,color:'var(--text-muted)',marginBottom:20}}>Card: {negocioVincular.titulo}</div>

            {/* Abas */}
            <div style={{display:'flex',gap:0,borderBottom:'1px solid var(--border)',marginBottom:16}}>
              {[['buscar','🔍 Buscar existente'],['criar','➕ Criar novo']].map(([k,l])=>(
                <button key={k} onClick={()=>setVincularTab(k as any)}
                  style={{padding:'8px 16px',fontSize:12,cursor:'pointer',border:'none',borderBottom:vincularTab===k?'2px solid var(--gold)':'2px solid transparent',background:'transparent',color:vincularTab===k?'var(--gold)':'var(--text-muted)',fontFamily:'DM Sans,sans-serif',marginBottom:-1}}>
                  {l}
                </button>
              ))}
            </div>

            {vincularTab === 'buscar' && (
              <div>
                <input value={vincularBusca} onChange={e=>{setVincularBusca(e.target.value);buscarClientes(e.target.value,setVincularRes)}}
                  placeholder="Buscar por nome ou CPF..." style={inp} autoFocus />
                <div style={{marginTop:8,maxHeight:200,overflow:'auto'}}>
                  {vincularRes.map(c=>(
                    <div key={c.id} onClick={()=>vincularCliente(c.id)}
                      style={{padding:'10px 14px',cursor:'pointer',borderRadius:8,border:'1px solid var(--border)',marginBottom:6,display:'flex',justifyContent:'space-between',alignItems:'center'}}
                      onMouseEnter={e=>(e.currentTarget.style.borderColor='var(--gold)')}
                      onMouseLeave={e=>(e.currentTarget.style.borderColor='var(--border)')}>
                      <div>
                        <div style={{fontSize:13,fontWeight:500}}>{c.nome}</div>
                        <div style={{fontSize:11,color:'var(--text-muted)'}}>{c.cpf_cnpj} {c.telefone&&`· ${c.telefone}`}</div>
                      </div>
                      <span style={{fontSize:12,color:'var(--teal)'}}>Vincular →</span>
                    </div>
                  ))}
                  {vincularBusca.length >= 2 && vincularRes.length === 0 && (
                    <div style={{padding:20,textAlign:'center',color:'var(--text-muted)',fontSize:13}}>Nenhum cliente encontrado</div>
                  )}
                </div>
              </div>
            )}

            {vincularTab === 'criar' && (
              <div style={{display:'flex',flexDirection:'column',gap:12}}>
                <div><label style={{fontSize:12,color:'var(--text-muted)',display:'block',marginBottom:4}}>Nome *</label>
                  <input value={novoClienteForm.nome} onChange={e=>setNovoClienteForm(f=>({...f,nome:e.target.value}))} placeholder="Nome completo" style={inp} autoFocus /></div>
                <div><label style={{fontSize:12,color:'var(--text-muted)',display:'block',marginBottom:4}}>CPF/CNPJ</label>
                  <input value={novoClienteForm.cpf_cnpj} onChange={e=>setNovoClienteForm(f=>({...f,cpf_cnpj:e.target.value}))} placeholder="000.000.000-00" style={inp} /></div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                  <div><label style={{fontSize:12,color:'var(--text-muted)',display:'block',marginBottom:4}}>Telefone</label>
                    <input value={novoClienteForm.telefone} onChange={e=>setNovoClienteForm(f=>({...f,telefone:e.target.value}))} placeholder="(00) 00000-0000" style={inp} /></div>
                  <div><label style={{fontSize:12,color:'var(--text-muted)',display:'block',marginBottom:4}}>Email</label>
                    <input type="email" value={novoClienteForm.email} onChange={e=>setNovoClienteForm(f=>({...f,email:e.target.value}))} placeholder="email@email.com" style={inp} /></div>
                </div>
                <button className="btn-primary" onClick={criarEVincularCliente} disabled={vinculando||!novoClienteForm.nome} style={{marginTop:4}}>
                  {vinculando?'Criando...':'✓ Criar e vincular'}
                </button>
              </div>
            )}

            <div style={{marginTop:16,display:'flex',justifyContent:'flex-end'}}>
              <button className="btn-secondary" onClick={()=>setModalVincular(false)}>Fechar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Detalhes do Card */}
      {modalCard && cardAtivo && (
        <div style={{position:'fixed',inset:0,background:'rgba(5,12,26,0.85)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',backdropFilter:'blur(6px)'}}
          onClick={e=>e.target===e.currentTarget&&setModalCard(false)}>
          <div style={{background:'#0a1628',border:'1px solid var(--border)',borderRadius:20,padding:'28px 32px',width:480,maxWidth:'95vw',maxHeight:'90vh',overflow:'auto'}}>
            <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:16}}>
              <div style={{fontFamily:'DM Serif Display,serif',fontSize:18,flex:1}}>{cardAtivo.titulo}</div>
              <button onClick={()=>setModalCard(false)} style={{background:'none',border:'none',color:'var(--text-muted)',cursor:'pointer',fontSize:20,marginLeft:12}}>✕</button>
            </div>

            {/* Info */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:16}}>
              {[
                ['Etapa', cardAtivo.etapa],
                ['Produto', cardAtivo.produto||'—'],
                ['Prêmio', cardAtivo.premio ? `R$ ${Number(cardAtivo.premio).toLocaleString('pt-BR',{minimumFractionDigits:2})}` : '—'],
                ['Responsável', cardAtivo.users?.nome||'—'],
              ].map(([l,v])=>(
                <div key={l}><div style={{fontSize:10,fontWeight:600,letterSpacing:'1.2px',textTransform:'uppercase',color:'var(--text-muted)',marginBottom:4}}>{l}</div>
                  <div style={{fontSize:13}}>{v}</div></div>
              ))}
            </div>

            {/* Cliente */}
            <div style={{marginBottom:16,padding:'12px 16px',background:'rgba(255,255,255,0.04)',borderRadius:10,border:'1px solid var(--border)'}}>
              <div style={{fontSize:10,fontWeight:600,letterSpacing:'1.2px',textTransform:'uppercase',color:'var(--text-muted)',marginBottom:8}}>Cliente</div>
              {cardAtivo.clientes ? (
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                  <div>
                    <div style={{fontSize:13,fontWeight:500}}>{cardAtivo.clientes.nome}</div>
                    <div style={{fontSize:11,color:'var(--text-muted)'}}>{cardAtivo.clientes.cpf_cnpj} {cardAtivo.clientes.telefone&&`· ${cardAtivo.clientes.telefone}`}</div>
                  </div>
                  <button onClick={()=>router.push(`/dashboard/clientes/${cardAtivo.cliente_id}`)} style={{fontSize:12,padding:'4px 10px',borderRadius:6,border:'1px solid var(--border)',background:'transparent',color:'var(--teal)',cursor:'pointer',fontFamily:'DM Sans,sans-serif'}}>
                    Ver perfil →
                  </button>
                </div>
              ) : (
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                  <div style={{fontSize:12,color:'var(--text-muted)'}}>
                    {cardAtivo.cpf_cnpj ? `CPF: ${cardAtivo.cpf_cnpj}` : 'Sem cliente vinculado'}
                  </div>
                  <button onClick={()=>{setModalCard(false);setNegocioVincular(cardAtivo);setVincularTab('buscar');setVincularBusca('');setVincularRes([]);setNovoClienteForm({nome:'',cpf_cnpj:cardAtivo.cpf_cnpj||'',telefone:'',email:''});setModalVincular(true)}}
                    style={{fontSize:12,padding:'5px 12px',borderRadius:6,border:'1px solid rgba(201,168,76,0.4)',background:'rgba(201,168,76,0.08)',color:'var(--gold)',cursor:'pointer',fontFamily:'DM Sans,sans-serif'}}>
                    + Vincular cliente
                  </button>
                </div>
              )}
            </div>

            {/* Obs */}
            {cardAtivo.obs && (
              <div style={{marginBottom:16,padding:'12px 16px',background:'rgba(255,255,255,0.03)',borderRadius:10,border:'1px solid var(--border)',fontSize:12,color:'var(--text-muted)',lineHeight:1.6}}>
                {cardAtivo.obs}
              </div>
            )}

            {/* Mover etapa */}
            {funiAtual && (
              <div style={{marginBottom:16}}>
                <div style={{fontSize:12,color:'var(--text-muted)',marginBottom:8}}>Mover para etapa:</div>
                <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                  {(funiAtual.etapas||[]).filter((e:string)=>e!==cardAtivo.etapa).map((e:string)=>(
                    <button key={e} onClick={()=>{moverEtapa(cardAtivo.id,e);setModalCard(false)}}
                      style={{padding:'5px 12px',borderRadius:8,fontSize:12,cursor:'pointer',border:'1px solid var(--border)',background:'rgba(255,255,255,0.04)',color:'var(--text-muted)',fontFamily:'DM Sans,sans-serif'}}>
                      → {e}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Ganho / Perdido */}
            <div style={{marginBottom:16,padding:'12px 14px',background:'rgba(255,255,255,0.03)',border:'1px solid var(--border)',borderRadius:10}}>
              <div style={{fontSize:10,fontWeight:600,letterSpacing:'1.2px',textTransform:'uppercase',color:'var(--text-muted)',marginBottom:8}}>
                Status do negócio · {cardAtivo.status === 'ganho' ? '✓ Ganho' : cardAtivo.status === 'perdido' ? '✕ Perdido' : 'Em andamento'}
              </div>
              <div style={{display:'flex',flexWrap:'wrap',gap:8}}>
                <button onClick={()=>marcarStatus(cardAtivo.id,'ganho')}
                  disabled={cardAtivo.status==='ganho'}
                  style={{flex:1,minWidth:120,padding:'8px 14px',borderRadius:8,fontSize:13,fontWeight:600,cursor:cardAtivo.status==='ganho'?'default':'pointer',border:'1px solid rgba(28,181,160,0.4)',background:cardAtivo.status==='ganho'?'rgba(28,181,160,0.25)':'rgba(28,181,160,0.1)',color:'var(--teal)',fontFamily:'DM Sans,sans-serif',opacity:cardAtivo.status==='ganho'?0.7:1}}>
                  ✓ Marcar Ganho
                </button>
                <button onClick={()=>{ const m = prompt('Motivo da perda (opcional):',''); if (m === null) return; marcarStatus(cardAtivo.id,'perdido', m||undefined) }}
                  disabled={cardAtivo.status==='perdido'}
                  style={{flex:1,minWidth:120,padding:'8px 14px',borderRadius:8,fontSize:13,fontWeight:600,cursor:cardAtivo.status==='perdido'?'default':'pointer',border:'1px solid rgba(224,82,82,0.4)',background:cardAtivo.status==='perdido'?'rgba(224,82,82,0.25)':'rgba(224,82,82,0.1)',color:'var(--red)',fontFamily:'DM Sans,sans-serif',opacity:cardAtivo.status==='perdido'?0.7:1}}>
                  ✕ Marcar Perdido
                </button>
                {cardAtivo.status && cardAtivo.status !== 'em_andamento' && (
                  <button onClick={()=>marcarStatus(cardAtivo.id,'em_andamento')}
                    style={{padding:'8px 12px',borderRadius:8,fontSize:12,cursor:'pointer',border:'1px solid var(--border)',background:'rgba(255,255,255,0.04)',color:'var(--text-muted)',fontFamily:'DM Sans,sans-serif'}}>
                    ↺ Reabrir
                  </button>
                )}
              </div>
              {cardAtivo.status === 'perdido' && cardAtivo.motivo_perda && (
                <div style={{marginTop:8,fontSize:11,color:'var(--text-muted)'}}>Motivo: {cardAtivo.motivo_perda}</div>
              )}
            </div>

            <div style={{display:'flex',justifyContent:'space-between'}}>
              <button onClick={()=>excluirNegocio(cardAtivo.id)} style={{fontSize:12,padding:'6px 14px',borderRadius:8,border:'1px solid rgba(224,82,82,0.3)',background:'rgba(224,82,82,0.08)',color:'var(--red)',cursor:'pointer',fontFamily:'DM Sans,sans-serif'}}>
                🗑 Excluir
              </button>
              <button className="btn-secondary" onClick={()=>setModalCard(false)}>Fechar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
