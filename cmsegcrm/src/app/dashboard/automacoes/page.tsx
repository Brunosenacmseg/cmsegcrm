'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

const TRIGGERS = [
  { id: 'negocio_criado',   nome: 'Quando uma negociação for criada' },
  { id: 'etapa_alterada',   nome: 'Quando a etapa for alterada' },
  { id: 'status_ganho',     nome: 'Quando marcada como Ganho' },
  { id: 'status_perdido',   nome: 'Quando marcada como Perdido' },
]

const TIPOS_ACAO = [
  { id: 'criar_negocio_em_funil', nome: '🔄 Criar negociação em outro funil (funil reverso/reciclagem)' },
  { id: 'mover_etapa',            nome: '➡ Mover para etapa' },
  { id: 'criar_tarefa',           nome: '✅ Criar tarefa' },
  { id: 'notificar',              nome: '🔔 Notificar usuário' },
  { id: 'set_custom_field',       nome: '✏ Setar valor de campo personalizado' },
]

const empty = {
  nome: '', descricao: '', ativo: true,
  trigger: 'status_perdido',
  funil_id: '', etapa_filtro: '',
  acoes: [] as any[],
}

export default function AutomacoesPage() {
  const supabase = createClient()
  const router = useRouter()

  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [automacoes, setAutomacoes] = useState<any[]>([])
  const [funis, setFunis] = useState<any[]>([])
  const [usuarios, setUsuarios] = useState<any[]>([])
  const [logs, setLogs] = useState<any[]>([])
  const [aba, setAba] = useState<'lista'|'logs'>('lista')

  const [modal, setModal] = useState(false)
  const [editando, setEditando] = useState<any>(null)
  const [form, setForm] = useState<any>(empty)

  useEffect(() => { init() }, [])

  async function init() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    const { data: prof } = await supabase.from('users').select('*').eq('id', user.id).single()
    if (prof?.role !== 'admin') { router.push('/dashboard'); return }
    setProfile(prof)
    const [{ data: a }, { data: f }, { data: u }, { data: l }] = await Promise.all([
      supabase.from('automacoes').select('*, funis(nome)').order('criado_em', { ascending: false }),
      supabase.from('funis').select('id, nome, etapas').order('ordem'),
      supabase.from('users').select('id, nome').order('nome'),
      supabase.from('automacoes_logs').select('*, automacoes(nome), negocios(titulo)').order('executado_em', { ascending: false }).limit(50),
    ])
    setAutomacoes(a || []); setFunis(f || []); setUsuarios(u || []); setLogs(l || [])
    setLoading(false)
  }

  async function salvar() {
    if (!form.nome.trim()) return
    const payload: any = {
      nome: form.nome,
      descricao: form.descricao || null,
      ativo: !!form.ativo,
      trigger: form.trigger,
      funil_id: form.funil_id || null,
      etapa_filtro: form.etapa_filtro || null,
      acoes: form.acoes,
      criado_por: profile?.id,
    }
    if (editando) {
      await supabase.from('automacoes').update(payload).eq('id', editando.id)
    } else {
      await supabase.from('automacoes').insert(payload)
    }
    setModal(false); setEditando(null); setForm(empty)
    await init()
  }

  async function excluir(id: string, nome: string) {
    if (!confirm(`Excluir a automação "${nome}"?`)) return
    await supabase.from('automacoes').delete().eq('id', id)
    await init()
  }

  async function toggleAtivo(a: any) {
    await supabase.from('automacoes').update({ ativo: !a.ativo }).eq('id', a.id)
    await init()
  }

  function adicionarAcao() {
    setForm((f:any) => ({ ...f, acoes: [...f.acoes, { tipo: 'criar_negocio_em_funil', funil_id:'', copiar:['cliente','produto','vendedor','origem'] }] }))
  }
  function alterarAcao(idx: number, patch: any) {
    setForm((f:any) => ({ ...f, acoes: f.acoes.map((a:any,i:number) => i===idx ? { ...a, ...patch } : a) }))
  }
  function removerAcao(idx: number) {
    setForm((f:any) => ({ ...f, acoes: f.acoes.filter((_:any,i:number) => i !== idx) }))
  }

  if (loading) return <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',color:'var(--text-muted)'}}>Carregando...</div>

  const inp: React.CSSProperties = { width:'100%', background:'rgba(255,255,255,0.05)', border:'1px solid var(--border)', borderRadius:8, padding:'9px 13px', color:'var(--text)', fontSize:13, outline:'none', boxSizing:'border-box' as const, fontFamily:'DM Sans,sans-serif' }
  const lbl: React.CSSProperties = { fontSize:11, fontWeight:600, letterSpacing:'1px', textTransform:'uppercase', color:'var(--text-muted)', display:'block', marginBottom:5 }

  const funilSelecionado = funis.find(f => f.id === form.funil_id)

  return (
    <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
      <div style={{height:56,borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',padding:'0 28px',gap:12,background:'var(--bg-soft)'}}>
        <div style={{fontFamily:'DM Serif Display,serif',fontSize:18,flex:1}}>⚡ Automações</div>
        <button onClick={()=>{setEditando(null);setForm(empty);setModal(true)}} className="btn-primary" style={{padding:'7px 14px',fontSize:12}}>+ Nova automação</button>
      </div>

      <div style={{flex:1,overflow:'auto',padding:'24px 28px'}}>
        <div style={{fontSize:12,color:'var(--text-muted)',marginBottom:18,maxWidth:780}}>
          Automações disparam ações quando algo acontece em uma negociação.
          Tudo é opcional — se você não criar nenhuma, o CRM continua funcionando normal.
          Exemplo: <strong>Quando marcar como Perdido em VENDA → criar negociação em FUNIL RECICLADO - VIDA</strong>.
        </div>

        <div style={{display:'flex',gap:0,borderBottom:'1px solid var(--border)',marginBottom:18}}>
          {([['lista','📋 Automações'],['logs','📝 Histórico de execução']] as ['lista'|'logs', string][]).map(([k,l])=>(
            <button key={k} onClick={()=>setAba(k)}
              style={{padding:'10px 20px',fontSize:13,cursor:'pointer',border:'none',background:'transparent',color:aba===k?'var(--gold)':'var(--text-muted)',fontWeight:aba===k?600:400,borderBottom:aba===k?'2px solid var(--gold)':'2px solid transparent',marginBottom:-1}}>
              {l}
            </button>
          ))}
        </div>

        {aba === 'lista' && (
          <>
            {automacoes.length === 0 ? (
              <div className="card" style={{padding:'40px 20px',textAlign:'center',color:'var(--text-muted)'}}>
                <div style={{fontSize:40,marginBottom:12}}>⚡</div>
                <div style={{marginBottom:12}}>Nenhuma automação criada ainda.</div>
                <button onClick={()=>{setEditando(null);setForm(empty);setModal(true)}} className="btn-primary">+ Criar primeira</button>
              </div>
            ) : (
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill, minmax(360px, 1fr))',gap:18}}>
                {automacoes.map(a => (
                  <div key={a.id} className="card">
                    <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:8}}>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontFamily:'DM Serif Display,serif',fontSize:16}}>{a.nome}</div>
                        {a.descricao && <div style={{fontSize:11,color:'var(--text-muted)',marginTop:2}}>{a.descricao}</div>}
                      </div>
                      <button onClick={()=>toggleAtivo(a)} style={{fontSize:10,fontWeight:600,padding:'3px 9px',borderRadius:5,background:a.ativo?'var(--success-bg)':'rgba(255,255,255,0.04)',color:a.ativo?'var(--success)':'var(--text-muted)',border:'1px solid '+(a.ativo?'var(--success-border)':'var(--border)'),textTransform:'uppercase',cursor:'pointer'}}>
                        {a.ativo ? 'Ativa' : 'Inativa'}
                      </button>
                    </div>
                    <div style={{fontSize:12,marginBottom:10,padding:'8px 12px',background:'rgba(74,128,240,0.06)',border:'1px solid rgba(74,128,240,0.2)',borderRadius:8}}>
                      <strong style={{color:'#7aa3f8'}}>Quando:</strong> {TRIGGERS.find(t=>t.id===a.trigger)?.nome || a.trigger}
                      {a.funis?.nome && <div>📍 Funil: {a.funis.nome}</div>}
                      {a.etapa_filtro && <div>📌 Etapa: {a.etapa_filtro}</div>}
                    </div>
                    <div style={{fontSize:12,marginBottom:12}}>
                      <div style={{color:'var(--gold)',fontWeight:600,marginBottom:4}}>Então:</div>
                      {(Array.isArray(a.acoes)?a.acoes:[]).map((ac:any,i:number)=>(
                        <div key={i} style={{padding:'4px 8px',background:'rgba(255,255,255,0.03)',borderRadius:6,marginBottom:3,fontSize:11}}>
                          {TIPOS_ACAO.find(t=>t.id===ac.tipo)?.nome.replace(/^[^\s]+\s/,'') || ac.tipo}
                          {ac.tipo === 'criar_negocio_em_funil' && ac.funil_id && (() => {
                            const fn = funis.find(f=>f.id===ac.funil_id); return fn ? ` → ${fn.nome}` : ''
                          })()}
                        </div>
                      ))}
                    </div>
                    <div style={{display:'flex',gap:6,marginTop:'auto'}}>
                      <button onClick={()=>{
                        setEditando(a)
                        setForm({
                          nome: a.nome, descricao: a.descricao||'', ativo: a.ativo,
                          trigger: a.trigger, funil_id: a.funil_id||'', etapa_filtro: a.etapa_filtro||'',
                          acoes: Array.isArray(a.acoes)?a.acoes:[],
                        })
                        setModal(true)
                      }} style={{padding:'5px 10px',borderRadius:6,fontSize:11,border:'1px solid var(--border)',background:'rgba(255,255,255,0.04)',color:'var(--gold)',cursor:'pointer'}}>✎ Editar</button>
                      <button onClick={()=>excluir(a.id, a.nome)}
                        style={{padding:'5px 10px',borderRadius:6,fontSize:11,border:'1px solid rgba(224,82,82,0.3)',background:'rgba(224,82,82,0.06)',color:'var(--red)',cursor:'pointer'}}>🗑</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {aba === 'logs' && (
          <div className="card">
            <div style={{fontFamily:'DM Serif Display,serif',fontSize:15,marginBottom:12}}>Últimas 50 execuções</div>
            {logs.length === 0 ? (
              <div style={{padding:24,textAlign:'center',color:'var(--text-muted)',fontSize:13}}>Nenhuma execução ainda.</div>
            ) : (
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                <thead><tr style={{textAlign:'left',color:'var(--text-muted)',fontSize:10,letterSpacing:'1px',textTransform:'uppercase'}}>
                  <th style={{padding:'6px 4px',borderBottom:'1px solid var(--border)'}}>Quando</th>
                  <th style={{padding:'6px 4px',borderBottom:'1px solid var(--border)'}}>Automação</th>
                  <th style={{padding:'6px 4px',borderBottom:'1px solid var(--border)'}}>Trigger</th>
                  <th style={{padding:'6px 4px',borderBottom:'1px solid var(--border)'}}>Negócio</th>
                  <th style={{padding:'6px 4px',borderBottom:'1px solid var(--border)'}}>Resultado</th>
                </tr></thead>
                <tbody>
                  {logs.map(l => (
                    <tr key={l.id} style={{borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
                      <td style={{padding:'6px 4px',color:'var(--text-muted)'}}>{new Date(l.executado_em).toLocaleString('pt-BR')}</td>
                      <td style={{padding:'6px 4px'}}>{l.automacoes?.nome || '—'}</td>
                      <td style={{padding:'6px 4px',fontFamily:'monospace',fontSize:11,color:'var(--text-muted)'}}>{l.trigger}</td>
                      <td style={{padding:'6px 4px'}}>{l.negocios?.titulo || '—'}</td>
                      <td style={{padding:'6px 4px'}}>
                        <span style={{fontSize:10,fontWeight:600,padding:'2px 7px',borderRadius:5,background:l.sucesso?'var(--success-bg)':'var(--danger-bg)',color:l.sucesso?'var(--success)':'var(--danger)'}}>
                          {l.sucesso ? 'OK' : 'Falhou'}
                        </span>
                        {l.erro && <div style={{fontSize:10,color:'var(--red)'}}>{l.erro}</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {modal && (
        <div style={{position:'fixed',inset:0,background:'rgba(5,12,26,0.85)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',backdropFilter:'blur(6px)'}}
          onClick={e=>e.target===e.currentTarget&&setModal(false)}>
          <div style={{background:'#0a1628',border:'1px solid var(--border)',borderRadius:20,padding:'28px 32px',width:720,maxWidth:'95vw',maxHeight:'90vh',overflow:'auto'}}>
            <div style={{fontFamily:'DM Serif Display,serif',fontSize:18,marginBottom:18}}>
              {editando ? '✎ Editar automação' : '⚡ Nova automação'}
            </div>

            <div style={{marginBottom:14}}>
              <label style={lbl}>Nome *</label>
              <input value={form.nome} onChange={e=>setForm((f:any)=>({...f,nome:e.target.value}))} placeholder='Ex: "Reciclar perdidos de Vida"' style={inp} autoFocus />
            </div>

            <div style={{marginBottom:14}}>
              <label style={lbl}>Descrição</label>
              <input value={form.descricao} onChange={e=>setForm((f:any)=>({...f,descricao:e.target.value}))} placeholder="Para que serve" style={inp} />
            </div>

            <div style={{padding:14,marginBottom:14,background:'rgba(74,128,240,0.06)',border:'1px solid rgba(74,128,240,0.2)',borderRadius:10}}>
              <div style={{fontSize:11,fontWeight:600,color:'#7aa3f8',marginBottom:10,letterSpacing:'1px',textTransform:'uppercase'}}>Quando</div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10}}>
                <div>
                  <label style={lbl}>Evento</label>
                  <select value={form.trigger} onChange={e=>setForm((f:any)=>({...f,trigger:e.target.value}))} style={{...inp,background:'#0e2040'}}>
                    {TRIGGERS.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Funil (opcional)</label>
                  <select value={form.funil_id} onChange={e=>setForm((f:any)=>({...f,funil_id:e.target.value,etapa_filtro:''}))} style={{...inp,background:'#0e2040'}}>
                    <option value="">— qualquer funil —</option>
                    {funis.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
                  </select>
                </div>
                {form.trigger === 'etapa_alterada' && (
                  <div>
                    <label style={lbl}>Etapa (opcional)</label>
                    <select value={form.etapa_filtro} onChange={e=>setForm((f:any)=>({...f,etapa_filtro:e.target.value}))} style={{...inp,background:'#0e2040'}}>
                      <option value="">— qualquer etapa —</option>
                      {(funilSelecionado?.etapas || []).map((et:string) => <option key={et} value={et}>{et}</option>)}
                    </select>
                  </div>
                )}
              </div>
            </div>

            <div style={{padding:14,marginBottom:14,background:'rgba(201,168,76,0.06)',border:'1px solid rgba(201,168,76,0.2)',borderRadius:10}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
                <div style={{fontSize:11,fontWeight:600,color:'var(--gold)',letterSpacing:'1px',textTransform:'uppercase'}}>Então faça</div>
                <button onClick={adicionarAcao} style={{padding:'5px 12px',borderRadius:6,fontSize:11,border:'1px solid var(--border)',background:'rgba(255,255,255,0.04)',color:'var(--gold)',cursor:'pointer'}}>+ Adicionar ação</button>
              </div>
              {form.acoes.length === 0 ? (
                <div style={{fontSize:11,color:'var(--text-muted)',padding:'8px 0'}}>Nenhuma ação ainda. Adicione pelo menos uma.</div>
              ) : form.acoes.map((ac:any, idx:number) => (
                <div key={idx} style={{padding:10,background:'rgba(0,0,0,0.2)',borderRadius:8,marginBottom:8,border:'1px solid var(--border)'}}>
                  <div style={{display:'flex',gap:8,marginBottom:8}}>
                    <select value={ac.tipo} onChange={e=>alterarAcao(idx,{tipo:e.target.value})} style={{...inp,background:'#0e2040',flex:1}}>
                      {TIPOS_ACAO.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
                    </select>
                    <button onClick={()=>removerAcao(idx)} style={{padding:'6px 10px',borderRadius:6,fontSize:11,border:'1px solid rgba(224,82,82,0.3)',background:'rgba(224,82,82,0.06)',color:'var(--red)',cursor:'pointer'}}>×</button>
                  </div>

                  {ac.tipo === 'criar_negocio_em_funil' && (
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                      <select value={ac.funil_id||''} onChange={e=>alterarAcao(idx,{funil_id:e.target.value})} style={{...inp,background:'#0e2040'}}>
                        <option value="">Funil destino *</option>
                        {funis.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
                      </select>
                      <select value={ac.etapa||''} onChange={e=>alterarAcao(idx,{etapa:e.target.value})} style={{...inp,background:'#0e2040'}}>
                        <option value="">— primeira etapa —</option>
                        {(funis.find(f=>f.id===ac.funil_id)?.etapas || []).map((et:string)=>(
                          <option key={et} value={et}>{et}</option>
                        ))}
                      </select>
                      <div style={{gridColumn:'1/-1',fontSize:11,color:'var(--text-muted)',marginTop:4}}>
                        Copiar do negócio original:
                        <div style={{display:'flex',flexWrap:'wrap',gap:8,marginTop:4}}>
                          {['cliente','produto','vendedor','equipe','origem','cpf','premio'].map(c => (
                            <label key={c} style={{display:'flex',alignItems:'center',gap:4,fontSize:11,cursor:'pointer'}}>
                              <input type="checkbox" checked={(ac.copiar||[]).includes(c)} onChange={e=>{
                                const cur = new Set<string>(ac.copiar||[])
                                if (e.target.checked) cur.add(c); else cur.delete(c)
                                alterarAcao(idx, { copiar: Array.from(cur) })
                              }} /> {c}
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {ac.tipo === 'mover_etapa' && (
                    <input value={ac.etapa||''} onChange={e=>alterarAcao(idx,{etapa:e.target.value})} placeholder="Nome da etapa destino" style={inp} />
                  )}

                  {ac.tipo === 'criar_tarefa' && (
                    <div style={{display:'grid',gridTemplateColumns:'2fr 1fr 0.6fr',gap:8}}>
                      <input value={ac.titulo||''} onChange={e=>alterarAcao(idx,{titulo:e.target.value})} placeholder="Título da tarefa" style={inp} />
                      <select value={ac.responsavel_id||''} onChange={e=>alterarAcao(idx,{responsavel_id:e.target.value})} style={{...inp,background:'#0e2040'}}>
                        <option value="">— vendedor do negócio —</option>
                        {usuarios.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
                      </select>
                      <input type="number" value={ac.prazo_dias||''} onChange={e=>alterarAcao(idx,{prazo_dias:e.target.value})} placeholder="Prazo (dias)" style={inp} />
                    </div>
                  )}

                  {ac.tipo === 'notificar' && (
                    <div style={{display:'grid',gridTemplateColumns:'1fr 2fr',gap:8}}>
                      <select value={ac.user_id||''} onChange={e=>alterarAcao(idx,{user_id:e.target.value})} style={{...inp,background:'#0e2040'}}>
                        <option value="">— vendedor do negócio —</option>
                        {usuarios.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
                      </select>
                      <input value={ac.titulo||''} onChange={e=>alterarAcao(idx,{titulo:e.target.value})} placeholder="Título da notificação" style={inp} />
                    </div>
                  )}

                  {ac.tipo === 'set_custom_field' && (
                    <div style={{display:'grid',gridTemplateColumns:'1fr 2fr',gap:8}}>
                      <input value={ac.chave||''} onChange={e=>alterarAcao(idx,{chave:e.target.value})} placeholder="chave do campo" style={inp} />
                      <input value={ac.valor||''} onChange={e=>alterarAcao(idx,{valor:e.target.value})} placeholder="valor" style={inp} />
                    </div>
                  )}
                </div>
              ))}
            </div>

            <label style={{display:'flex',alignItems:'center',gap:8,marginBottom:18,cursor:'pointer',fontSize:13}}>
              <input type="checkbox" checked={!!form.ativo} onChange={e=>setForm((f:any)=>({...f,ativo:e.target.checked}))} style={{accentColor:'var(--teal)'}} />
              Ativa (vai disparar quando o evento acontecer)
            </label>

            <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
              <button className="btn-secondary" onClick={()=>setModal(false)}>Cancelar</button>
              <button className="btn-primary" onClick={salvar} disabled={!form.nome.trim()||form.acoes.length===0}>✓ Salvar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
