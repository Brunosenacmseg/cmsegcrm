'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Avatar from '@/components/Avatar'
import { getVisibleUserIds } from '@/lib/auth'

const STATUS_CORES: Record<string,string> = { pendente:'var(--gold)', em_andamento:'var(--teal)', concluida:'var(--text-muted)', cancelada:'var(--red)' }
const STATUS_LABELS: Record<string,string> = { pendente:'⏳ Pendente', em_andamento:'🔄 Em andamento', concluida:'✅ Concluída', cancelada:'❌ Cancelada' }
const TIPOS = ['tarefa','ligação','reunião','email','visita','outro']

export default function TarefasPage() {
  const supabase = createClient()
  const router   = useRouter()

  const [profile, setProfile]       = useState<any>(null)
  const [usuarios, setUsuarios]     = useState<any[]>([])
  const [tarefas, setTarefas]       = useState<any[]>([])
  const [loading, setLoading]       = useState(true)
  const [modalAberto, setModalAberto] = useState(false)
  const [filtroStatus, setFiltroStatus] = useState('pendente')
  const [filtroResponsavel, setFiltroResponsavel] = useState('meus')
  const [filtroEquipe, setFiltroEquipe]   = useState('todos')
  const [filtroUsuario, setFiltroUsuario] = useState('todos')
  const [equipes, setEquipes]             = useState<any[]>([])
  const [equipeMembros, setEquipeMembros] = useState<Record<string, string[]>>({})
  const [visibleIds, setVisibleIds]       = useState<string[] | null>(null)
  const [salvando, setSalvando]     = useState(false)
  const [buscaCliente, setBuscaCliente] = useState('')
  const [clientesBusca, setClientesBusca] = useState<any[]>([])
  const [clienteSel, setClienteSel] = useState<any>(null)

  const [form, setForm] = useState<{
    titulo: string; descricao: string; tipo: string; status: string;
    prazo: string; responsaveis_ids: string[];
  }>({
    titulo:'', descricao:'', tipo:'tarefa', status:'pendente',
    prazo:'', responsaveis_ids: [],
  })

  useEffect(() => { init() }, [])

  async function init() {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: prof } = await supabase.from('users').select('id,nome,role,avatar_url').eq('id', user?.id||'').single()
    setProfile(prof)
    const ids = await getVisibleUserIds()
    setVisibleIds(ids)
    // Lista para criar tarefa: todos os usuários (qualquer pessoa pode atribuir
    // pra qualquer outra). Filtro de visibilidade afeta só quem vejo no painel.
    const { data: usr } = await supabase.from('users').select('id,nome,role,avatar_url').order('nome')
    setUsuarios(usr||[])
    if (prof?.role === 'admin') {
      const { data: eq } = await supabase.from('equipes').select('id,nome').order('nome')
      setEquipes(eq || [])
      const { data: em } = await supabase.from('equipe_membros').select('equipe_id,user_id')
      const map: Record<string, string[]> = {}
      ;(em || []).forEach(r => { (map[r.equipe_id] = map[r.equipe_id] || []).push(r.user_id) })
      setEquipeMembros(map)
    }
    await carregarTarefas(prof, ids)
    setLoading(false)
  }

  async function carregarTarefas(prof = profile, ids: string[] | null = visibleIds) {
    let q = supabase
      .from('tarefas')
      .select(`
        *,
        clientes(nome),
        responsavel:users!tarefas_responsavel_id_fkey(id,nome,role,avatar_url),
        atribuidor:users!tarefas_atribuido_por_fkey(id,nome,role,avatar_url),
        tarefa_responsaveis(user_id, users(id,nome,role,avatar_url))
      `)
      .order('prazo', { ascending: true, nullsFirst: false })
    // Visibilidade: corretor vê só onde ele é responsável (ou criador);
    // líder vê apenas tarefas em que o responsável principal é do time.
    if (prof?.role === 'corretor') {
      q = q.or(`responsavel_id.eq.${prof.id},criado_por.eq.${prof.id}`)
    } else if (ids) {
      q = q.in('responsavel_id', ids)
    }
    const { data } = await q
    setTarefas(data || [])
  }

  async function buscarClientes(q: string) {
    setBuscaCliente(q)
    if (q.length < 2) { setClientesBusca([]); return }
    const { data } = await supabase.from('clientes').select('id,nome,cpf_cnpj').or(`nome.ilike.%${q}%,cpf_cnpj.ilike.%${q}%`).limit(6)
    setClientesBusca(data||[])
  }

  async function salvarTarefa() {
    if (!form.titulo.trim()) { alert('Informe o título'); return }
    setSalvando(true)
    const ids = form.responsaveis_ids.length > 0 ? form.responsaveis_ids : [profile?.id]
    const principalId = ids[0]
    const { data: nova } = await supabase.from('tarefas').insert({
      titulo:         form.titulo,
      descricao:      form.descricao || null,
      tipo:           form.tipo,
      status:         form.status,
      prazo:          form.prazo ? new Date(form.prazo).toISOString() : null,
      responsavel_id: principalId,
      cliente_id:     clienteSel?.id || null,
      criado_por:     profile?.id,
      atribuido_por:  principalId !== profile?.id ? profile?.id : null,
    }).select('id').single()
    if (nova?.id) {
      const linhas = ids.map(uid => ({ tarefa_id: nova.id, user_id: uid }))
      await supabase.from('tarefa_responsaveis').insert(linhas)
    }
    // Notifica todos os responsáveis (exceto o próprio criador)
    const notificar = ids.filter(uid => uid && uid !== profile?.id)
    if (notificar.length > 0) {
      await supabase.from('notificacoes').insert(notificar.map(uid => ({
        user_id: uid, tipo: 'tarefa',
        titulo: `${profile?.nome} atribuiu uma tarefa para você`,
        descricao: form.titulo, link: '/dashboard/tarefas',
      })))
    }
    setModalAberto(false)
    setForm({ titulo:'', descricao:'', tipo:'tarefa', status:'pendente', prazo:'', responsaveis_ids: [] })
    setClienteSel(null); setBuscaCliente('')
    setSalvando(false)
    await carregarTarefas()
  }

  async function alterarStatus(id: string, status: string) {
    await supabase.from('tarefas').update({ status }).eq('id', id)
    await carregarTarefas()
  }

  function responsaveisDeTarefa(t: any): string[] {
    const lista = Array.isArray(t.tarefa_responsaveis)
      ? t.tarefa_responsaveis.map((r: any) => r.user_id).filter(Boolean)
      : []
    if (t.responsavel_id && !lista.includes(t.responsavel_id)) lista.push(t.responsavel_id)
    return lista
  }

  const tarefasFiltradas = tarefas.filter(t => {
    const statusOk = filtroStatus === 'todos' || t.status === filtroStatus
    const responsaveis = responsaveisDeTarefa(t)
    const respOk = filtroResponsavel === 'todos'
      || (filtroResponsavel === 'meus' && responsaveis.includes(profile?.id))
      || (filtroResponsavel === 'atribuidas' && t.atribuido_por === profile?.id && !responsaveis.includes(profile?.id))
    if (!(statusOk && respOk)) return false
    // Filtros admin: equipe + usuário
    if (filtroEquipe !== 'todos') {
      const membros = equipeMembros[filtroEquipe] || []
      if (!responsaveis.some(r => membros.includes(r))) return false
    }
    if (filtroUsuario !== 'todos' && !responsaveis.includes(filtroUsuario)) return false
    return true
  })

  const vencendo = tarefas.filter(t => {
    if (!t.prazo || t.status === 'concluida' || t.status === 'cancelada') return false
    const diff = new Date(t.prazo).getTime() - Date.now()
    return diff > 0 && diff < 48*3600*1000 && responsaveisDeTarefa(t).includes(profile?.id)
  })

  const inp: React.CSSProperties = { width:'100%', background:'rgba(255,255,255,0.05)', border:'1px solid var(--border)', borderRadius:8, padding:'8px 12px', color:'var(--text)', fontSize:13, fontFamily:'DM Sans,sans-serif', outline:'none', boxSizing:'border-box' as const }

  if (loading) return <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',color:'var(--text-muted)'}}>Carregando...</div>

  return (
    <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
      <div style={{height:56,borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',padding:'0 28px',gap:12,background:'var(--bg-soft)',backdropFilter:'blur(8px)',position:'sticky',top:0,zIndex:5,flexShrink:0}}>
        <div style={{fontFamily:'DM Serif Display,serif',fontSize:18,flex:1}}>✅ Tarefas</div>
        <button className="btn-primary" onClick={()=>{setModalAberto(true);setForm({titulo:'',descricao:'',tipo:'tarefa',status:'pendente',prazo:'',responsaveis_ids:profile?.id?[profile.id]:[]})}}>
          + Nova Tarefa
        </button>
      </div>

      <div style={{flex:1,overflow:'auto',padding:'20px 28px'}}>
        {vencendo.length > 0 && (
          <div style={{marginBottom:16,padding:'12px 16px',background:'rgba(224,82,82,0.1)',border:'1px solid rgba(224,82,82,0.3)',borderRadius:10,fontSize:13,color:'var(--red)'}}>
            ⚠️ Você tem {vencendo.length} tarefa{vencendo.length>1?'s':''} vencendo nas próximas 48h!
          </div>
        )}

        {/* Filtros */}
        <div style={{display:'flex',gap:8,marginBottom:20,flexWrap:'wrap'}}>
          {['pendente','em_andamento','concluida','todos'].map(s=>(
            <button key={s} onClick={()=>setFiltroStatus(s)}
              style={{padding:'6px 14px',borderRadius:20,fontSize:12,cursor:'pointer',border:'1px solid var(--border)',fontFamily:'DM Sans,sans-serif',background:filtroStatus===s?'rgba(201,168,76,0.12)':'rgba(255,255,255,0.04)',color:filtroStatus===s?'var(--gold)':'var(--text-muted)',borderColor:filtroStatus===s?'var(--gold)':'var(--border)'}}>
              {s==='todos'?'Todas':STATUS_LABELS[s]}
            </button>
          ))}
          <div style={{width:1,background:'var(--border)',margin:'0 4px'}}/>
          {[{k:'meus',l:'Minhas'},{k:'atribuidas',l:'Atribuí'},{k:'todos',l:'Todas'}].map(({k,l})=>(
            <button key={k} onClick={()=>setFiltroResponsavel(k)}
              style={{padding:'6px 14px',borderRadius:20,fontSize:12,cursor:'pointer',border:'1px solid var(--border)',fontFamily:'DM Sans,sans-serif',background:filtroResponsavel===k?'rgba(28,181,160,0.12)':'rgba(255,255,255,0.04)',color:filtroResponsavel===k?'var(--teal)':'var(--text-muted)',borderColor:filtroResponsavel===k?'var(--teal)':'var(--border)'}}>
              {l}
            </button>
          ))}
          {profile?.role === 'admin' && (
            <>
              <div style={{width:1,background:'var(--border)',margin:'0 4px'}}/>
              {equipes.length > 0 && (
                <select value={filtroEquipe} onChange={e=>setFiltroEquipe(e.target.value)}
                  style={{padding:'6px 12px',borderRadius:20,fontSize:12,cursor:'pointer',border:'1px solid var(--border)',background:filtroEquipe!=='todos'?'rgba(201,168,76,0.12)':'rgba(255,255,255,0.04)',color:filtroEquipe!=='todos'?'var(--gold)':'var(--text-muted)',outline:'none',fontFamily:'DM Sans,sans-serif'}}>
                  <option value="todos">🏢 Todas as equipes</option>
                  {equipes.map(eq => <option key={eq.id} value={eq.id}>{eq.nome}</option>)}
                </select>
              )}
              <select value={filtroUsuario} onChange={e=>setFiltroUsuario(e.target.value)}
                style={{padding:'6px 12px',borderRadius:20,fontSize:12,cursor:'pointer',border:'1px solid var(--border)',background:filtroUsuario!=='todos'?'rgba(201,168,76,0.12)':'rgba(255,255,255,0.04)',color:filtroUsuario!=='todos'?'var(--gold)':'var(--text-muted)',outline:'none',fontFamily:'DM Sans,sans-serif'}}>
                <option value="todos">👤 Todos usuários</option>
                {usuarios.filter(u => filtroEquipe === 'todos' || (equipeMembros[filtroEquipe] || []).includes(u.id)).map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
              </select>
            </>
          )}
        </div>

        {tarefasFiltradas.length === 0 ? (
          <div className="card" style={{textAlign:'center',padding:40,color:'var(--text-muted)'}}>
            <div style={{fontSize:40,marginBottom:12}}>✅</div>
            <div>Nenhuma tarefa encontrada</div>
          </div>
        ) : (
          <div style={{display:'flex',flexDirection:'column',gap:10}}>
            {tarefasFiltradas.map(t => {
              const vence = t.prazo ? new Date(t.prazo) : null
              const atrasada = vence && vence < new Date() && t.status !== 'concluida'
              const vencendoEm48 = vence && !atrasada && (vence.getTime()-Date.now()) < 48*3600*1000
              const responsavel = t.responsavel
              const atribuidor  = t.atribuidor
              return (
                <div key={t.id} className="card" style={{padding:'14px 18px',borderLeft:`3px solid ${atrasada?'var(--red)':vencendoEm48?'var(--gold)':STATUS_CORES[t.status]||'var(--border)'}`}}>
                  <div style={{display:'flex',alignItems:'flex-start',gap:12}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4,flexWrap:'wrap'}}>
                        <span style={{fontSize:14,fontWeight:600}}>{t.titulo}</span>
                        <span style={{fontSize:10,padding:'2px 8px',borderRadius:10,background:`${STATUS_CORES[t.status]}20`,color:STATUS_CORES[t.status],fontWeight:600}}>{STATUS_LABELS[t.status]||t.status}</span>
                        {atrasada && <span style={{fontSize:10,padding:'2px 8px',borderRadius:10,background:'rgba(224,82,82,0.2)',color:'var(--red)',fontWeight:600}}>⚠️ Atrasada</span>}
                      </div>
                      {t.descricao && <div style={{fontSize:12,color:'var(--text-muted)',marginBottom:6}}>{t.descricao}</div>}
                      <div style={{display:'flex',gap:12,flexWrap:'wrap',fontSize:11,color:'var(--text-muted)',alignItems:'center'}}>
                        <span>📌 {t.tipo}</span>
                        {t.prazo && <span style={{color:atrasada?'var(--red)':vencendoEm48?'var(--gold)':'var(--text-muted)'}}>📅 {new Date(t.prazo).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit'})}</span>}
                        {t.clientes?.nome && <span style={{cursor:'pointer',color:'var(--gold)'}} onClick={()=>router.push(`/dashboard/clientes/${t.cliente_id}`)}>👤 {t.clientes.nome}</span>}
                        {(() => {
                          const detalhes = (Array.isArray(t.tarefa_responsaveis) ? t.tarefa_responsaveis : [])
                            .map((r: any) => r.users).filter(Boolean)
                          if (detalhes.length === 0 && responsavel) detalhes.push(responsavel)
                          return detalhes.length > 0 ? (
                            <div style={{display:'flex',alignItems:'center',gap:4}}>
                              {detalhes.slice(0, 4).map((u: any) => (
                                <Avatar key={u.id} nome={u.nome} avatarUrl={u.avatar_url} role={u.role} size={18} />
                              ))}
                              <span>
                                {detalhes.length === 1
                                  ? detalhes[0].nome?.split(' ')[0]
                                  : `${detalhes.length} responsáveis`}
                              </span>
                            </div>
                          ) : null
                        })()}
                        {atribuidor && t.responsavel_id !== t.atribuido_por && (
                          <span style={{color:'var(--teal)'}}>↑ {atribuidor.nome?.split(' ')[0]}</span>
                        )}
                      </div>
                    </div>
                    <div style={{display:'flex',gap:6,flexShrink:0}}>
                      {t.status === 'pendente' && (
                        <button onClick={()=>alterarStatus(t.id,'em_andamento')}
                          style={{padding:'5px 10px',borderRadius:6,fontSize:11,cursor:'pointer',border:'1px solid rgba(28,181,160,0.3)',background:'rgba(28,181,160,0.08)',color:'var(--teal)',fontFamily:'DM Sans,sans-serif'}}>
                          Iniciar
                        </button>
                      )}
                      {(t.status === 'pendente' || t.status === 'em_andamento') && (
                        <button onClick={()=>alterarStatus(t.id,'concluida')}
                          style={{padding:'5px 10px',borderRadius:6,fontSize:11,cursor:'pointer',border:'1px solid rgba(201,168,76,0.3)',background:'rgba(201,168,76,0.08)',color:'var(--gold)',fontFamily:'DM Sans,sans-serif'}}>
                          ✓ Concluir
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Modal nova tarefa */}
      {modalAberto && (
        <div style={{position:'fixed',inset:0,background:'rgba(15,23,42,0.45)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',backdropFilter:'blur(6px)'}}
          onClick={e=>e.target===e.currentTarget&&setModalAberto(false)}>
          <div style={{background:'#ffffff',border:'1px solid var(--border)',borderRadius:20,padding:'28px 32px',width:500,maxWidth:'95vw',maxHeight:'90vh',overflow:'auto'}}>
            <div style={{fontFamily:'DM Serif Display,serif',fontSize:20,marginBottom:20}}>+ Nova Tarefa</div>
            <div style={{marginBottom:14}}>
              <label style={{fontSize:12,color:'var(--text-muted)',display:'block',marginBottom:4}}>Título *</label>
              <input value={form.titulo} onChange={e=>setForm(f=>({...f,titulo:e.target.value}))} placeholder="Título da tarefa" style={inp} autoFocus />
            </div>
            <div style={{marginBottom:14}}>
              <label style={{fontSize:12,color:'var(--text-muted)',display:'block',marginBottom:4}}>Descrição</label>
              <textarea value={form.descricao} onChange={e=>setForm(f=>({...f,descricao:e.target.value}))} placeholder="Detalhes..." rows={2} style={{...inp,resize:'none'}} />
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:14}}>
              <div>
                <label style={{fontSize:12,color:'var(--text-muted)',display:'block',marginBottom:4}}>Tipo</label>
                <select value={form.tipo} onChange={e=>setForm(f=>({...f,tipo:e.target.value}))} style={{...inp,background:'#ffffff'}}>
                  {TIPOS.map(t=><option key={t} value={t} style={{background:'#ffffff'}}>{t.charAt(0).toUpperCase()+t.slice(1)}</option>)}
                </select>
              </div>
              <div>
                <label style={{fontSize:12,color:'var(--text-muted)',display:'block',marginBottom:4}}>Prazo</label>
                <input type="datetime-local" value={form.prazo} onChange={e=>setForm(f=>({...f,prazo:e.target.value}))} style={inp} />
              </div>
            </div>
            <div style={{marginBottom:14}}>
              <label style={{fontSize:12,color:'var(--gold)',display:'block',marginBottom:6}}>👥 Responsáveis (1 ou mais)</label>
              <div style={{maxHeight:180,overflowY:'auto',border:'1px solid var(--border)',borderRadius:8,padding:6,background:'#ffffff'}}>
                {[profile, ...usuarios.filter(u => u.id !== profile?.id)].filter(Boolean).map((u: any) => {
                  const sel = form.responsaveis_ids.includes(u.id)
                  return (
                    <div key={u.id}
                      onClick={() => setForm(f => ({
                        ...f,
                        responsaveis_ids: sel
                          ? f.responsaveis_ids.filter(x => x !== u.id)
                          : [...f.responsaveis_ids, u.id],
                      }))}
                      style={{display:'flex',alignItems:'center',gap:10,padding:'7px 10px',borderRadius:6,cursor:'pointer',background:sel?'rgba(201,168,76,0.10)':'transparent'}}>
                      <div style={{width:18,height:18,borderRadius:4,border:'1px solid '+(sel?'var(--gold)':'var(--border)'),background:sel?'var(--gold)':'transparent',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontSize:12,fontWeight:700}}>
                        {sel ? '✓' : ''}
                      </div>
                      <Avatar nome={u.nome} avatarUrl={u.avatar_url} role={u.role} size={26} />
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:13,fontWeight:500}}>{u.nome}{u.id===profile?.id?' (eu)':''}</div>
                        <div style={{fontSize:10,color:'var(--text-muted)'}}>{u.role}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
              {form.responsaveis_ids.length === 0 && (
                <div style={{fontSize:11,color:'var(--text-muted)',marginTop:4}}>Sem ninguém selecionado: você será o responsável.</div>
              )}
              {form.responsaveis_ids.filter(uid => uid !== profile?.id).length > 0 && (
                <div style={{fontSize:11,color:'var(--teal)',marginTop:4}}>
                  ✓ Notificação será enviada para {form.responsaveis_ids.filter(uid => uid !== profile?.id).length} pessoa(s)
                </div>
              )}
            </div>
            <div style={{marginBottom:20,position:'relative'}}>
              <label style={{fontSize:12,color:'var(--text-muted)',display:'block',marginBottom:4}}>Cliente (opcional)</label>
              {clienteSel ? (
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'8px 12px',background:'rgba(28,181,160,0.08)',border:'1px solid rgba(28,181,160,0.3)',borderRadius:8}}>
                  <span style={{fontSize:13}}>{clienteSel.nome}</span>
                  <button onClick={()=>{setClienteSel(null);setBuscaCliente('')}} style={{background:'none',border:'none',color:'var(--text-muted)',cursor:'pointer'}}>✕</button>
                </div>
              ) : (
                <>
                  <input value={buscaCliente} onChange={e=>buscarClientes(e.target.value)} placeholder="🔍 Buscar cliente..." style={inp} />
                  {clientesBusca.length > 0 && (
                    <div style={{position:'absolute',top:'100%',left:0,right:0,background:'#ffffff',border:'1px solid var(--border)',borderRadius:8,zIndex:10,marginTop:4,maxHeight:160,overflow:'auto'}}>
                      {clientesBusca.map(c=>(
                        <div key={c.id} onClick={()=>{setClienteSel(c);setBuscaCliente(c.nome);setClientesBusca([])}}
                          style={{padding:'8px 14px',cursor:'pointer',fontSize:13}}
                          onMouseEnter={e=>(e.currentTarget.style.background='rgba(201,168,76,0.08)')}
                          onMouseLeave={e=>(e.currentTarget.style.background='')}>
                          {c.nome}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
            <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
              <button className="btn-secondary" onClick={()=>setModalAberto(false)}>Cancelar</button>
              <button className="btn-primary" onClick={salvarTarefa} disabled={salvando}>
                {salvando?'Salvando...':'✓ Criar Tarefa'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
