'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Avatar from '@/components/Avatar'

const ROLES = [
  { key:'admin',    label:'Admin',    cor:'var(--red)',  desc:'Acesso total' },
  { key:'lider',    label:'Líder',    cor:'var(--gold)', desc:'Vê próprio + equipe' },
  { key:'corretor', label:'Corretor', cor:'var(--teal)', desc:'Vê só o próprio' },
]

const EXTENSOES_GOTO = [
  { numero:'1001', nome:'Bruno Sena' },
  { numero:'1002', nome:'Giovanna Picasso' },
  { numero:'1003', nome:'Gabriel Silverio' },
  { numero:'1004', nome:'Maria Luisa Durães' },
  { numero:'1005', nome:'Gustavo Piloto' },
  { numero:'1006', nome:'Maryellen Rosa' },
  { numero:'1007', nome:'Gustavo Araujo' },
  { numero:'1008', nome:'Amanda Sgarbi' },
  { numero:'1009', nome:'Gean Araujo' },
  { numero:'1010', nome:'Gregori Schilling' },
  { numero:'1011', nome:'Lilian Cruz' },
  { numero:'1012', nome:'Giovanna Silvério' },
  { numero:'1013', nome:'Bruno Bons Olhos' },
  { numero:'1014', nome:'Higor Rosa' },
  { numero:'1015', nome:'Felipe Sousa' },
  { numero:'1017', nome:'CLIFERSON DA SILVA' },
  { numero:'2001', nome:'Heloisa Sena' },
  { numero:'2002', nome:'Natasha Bortolotto' },
  { numero:'2003', nome:'Karen Mariano' },
  { numero:'2004', nome:'Thaina Neves' },
  { numero:'2005', nome:'Alice Sampaio' },
  { numero:'2006', nome:'Larissa Araujo' },
  { numero:'2007', nome:'Guilherme Franca' },
  { numero:'2008', nome:'Adrielli Pires' },
  { numero:'2009', nome:'Daniele Leal' },
  { numero:'2010', nome:'Lívia Santos' },
  { numero:'2011', nome:'Patricia Souza' },
  { numero:'3001', nome:'William Bonifácio' },
  { numero:'3002', nome:'Raphael Silva' },
  { numero:'3003', nome:'Rosangela Dominguez' },
  { numero:'3004', nome:'Bernardo Cabral' },
  { numero:'3006', nome:'Diego Assis' },
]

export default function UsuariosPage() {
  const supabase = createClient()
  const [usuarios, setUsuarios]       = useState<any[]>([])
  const [equipes, setEquipes]         = useState<any[]>([])
  const [profile, setProfile]         = useState<any>(null)
  const [loading, setLoading]         = useState(true)
  const [novoEmail, setNovoEmail]     = useState('')
  const [novoNome, setNovoNome]       = useState('')
  const [novaSenha, setNovaSenha]     = useState('')
  const [novoRole, setNovoRole]       = useState('corretor')
  const [msg, setMsg]                 = useState('')
  const [msgType, setMsgType]         = useState<'ok'|'err'>('ok')
  const [aba, setAba]                 = useState<'usuarios'|'equipes'>('usuarios')
  const [novaEquipe, setNovaEquipe]   = useState({ nome:'', lider_id:'' })
  const [modalEquipe, setModalEquipe] = useState(false)
  const [salvandoRole, setSalvandoRole]   = useState<string|null>(null)
  const [editandoRamal, setEditandoRamal] = useState<string|null>(null)
  const [ramalTemp, setRamalTemp]         = useState('')
  const [salvandoRamal, setSalvandoRamal] = useState<string|null>(null)
  const [msgRamal, setMsgRamal]           = useState<Record<string,string>>({})

  useEffect(() => { carregar() }, [])

  async function carregar() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    const [{ data: prof }, { data: usr }, { data: eq }] = await Promise.all([
      supabase.from('users').select('*').eq('id', user?.id||'').single(),
      supabase.from('users').select('id,nome,email,role,avatar_url,ramal_goto').order('nome'),
      supabase.from('equipes').select('*, users!equipes_lider_id_fkey(nome), equipe_membros(user_id, users(id,nome,avatar_url,role))').order('nome'),
    ])
    setProfile(prof); setUsuarios(usr||[]); setEquipes(eq||[])
    setLoading(false)
  }

  async function adicionarUsuario(e: React.FormEvent) {
    e.preventDefault(); setMsg('')
    if (profile?.role !== 'admin') { setMsg('Apenas Admin pode criar usuários.'); setMsgType('err'); return }
    const { error } = await supabase.auth.signUp({ email: novoEmail, password: novaSenha, options: { data: { nome: novoNome } } })
    if (error) { setMsg('Erro: '+error.message); setMsgType('err'); return }
    if (novoRole !== 'corretor') {
      setTimeout(async () => {
        const { data: nu } = await supabase.from('users').select('id').eq('email', novoEmail).single()
        if (nu) await fetch('/api/admin/set-role', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ userId: nu.id, role: novoRole }) })
      }, 2000)
    }
    setMsg(`✅ ${novoNome} cadastrado!`); setMsgType('ok')
    setNovoEmail(''); setNovoNome(''); setNovaSenha(''); setNovoRole('corretor')
    setTimeout(carregar, 2500)
  }

  async function alterarRole(userId: string, role: string) {
    if (profile?.role !== 'admin') return
    setSalvandoRole(userId)
    const res = await fetch('/api/admin/set-role', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ userId, role }) })
    const data = await res.json()
    if (data.ok) await carregar()
    else alert('Erro ao alterar role: ' + data.error)
    setSalvandoRole(null)
  }

  async function salvarRamal(userId: string) {
    setSalvandoRamal(userId)
    setMsgRamal(m => ({...m, [userId]: ''}))
    try {
      const res = await fetch('/api/admin/set-role', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ userId, ramal: ramalTemp }) })
      const data = await res.json()
      if (data.ok) {
        setMsgRamal(m => ({...m, [userId]: '✅ Ramal salvo!'}))
        setEditandoRamal(null)
        await carregar()
      } else {
        setMsgRamal(m => ({...m, [userId]: '❌ ' + data.error}))
      }
    } catch (err: any) {
      setMsgRamal(m => ({...m, [userId]: '❌ ' + err.message}))
    }
    setSalvandoRamal(null)
    setTimeout(() => setMsgRamal(m => ({...m, [userId]: ''})), 3000)
  }

  async function criarEquipe() {
    if (!novaEquipe.nome) return
    await supabase.from('equipes').insert({ nome: novaEquipe.nome, lider_id: novaEquipe.lider_id||null })
    setModalEquipe(false); setNovaEquipe({ nome:'', lider_id:'' }); carregar()
  }

  async function adicionarMembro(equipeId: string, userId: string) {
    await supabase.from('equipe_membros').upsert({ equipe_id: equipeId, user_id: userId }); carregar()
  }

  async function removerMembro(equipeId: string, userId: string) {
    if (profile?.role !== 'admin') return
    await supabase.from('equipe_membros').delete().eq('equipe_id', equipeId).eq('user_id', userId); carregar()
  }

  async function renomearEquipe(equipeId: string, nomeAtual: string) {
    if (profile?.role !== 'admin') return
    const novo = prompt('Novo nome da equipe:', nomeAtual)
    if (!novo || novo.trim() === nomeAtual) return
    await supabase.from('equipes').update({ nome: novo.trim() }).eq('id', equipeId)
    carregar()
  }

  async function trocarLider(equipeId: string, liderId: string) {
    if (profile?.role !== 'admin') return
    await supabase.from('equipes').update({ lider_id: liderId || null }).eq('id', equipeId)
    carregar()
  }

  async function excluirEquipe(equipeId: string, nome: string) {
    if (profile?.role !== 'admin') return
    if (!confirm(`Excluir a equipe "${nome}"? Membros perdem o vínculo, mas usuários e negociações são preservados.`)) return
    await supabase.from('equipe_membros').delete().eq('equipe_id', equipeId)
    const { error } = await supabase.from('equipes').delete().eq('id', equipeId)
    if (error) { alert('Erro ao excluir: '+error.message); return }
    carregar()
  }

  const isAdmin = profile?.role === 'admin'
  const ri = (r: string) => ROLES.find(x => x.key === r) || ROLES[2]
  const inp: React.CSSProperties = { width:'100%', background:'rgba(255,255,255,0.05)', border:'1px solid var(--border)', borderRadius:8, padding:'9px 14px', color:'var(--text)', fontSize:13, fontFamily:'DM Sans,sans-serif', outline:'none' }

  return (
    <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
      <div style={{height:56,borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',padding:'0 28px',gap:16,background:'var(--bg-soft)',backdropFilter:'blur(8px)',flexShrink:0}}>
        <div style={{fontFamily:'DM Serif Display,serif',fontSize:18,flex:1}}>Usuários & Equipes</div>
        <div style={{display:'flex',gap:4}}>
          {(['usuarios','equipes'] as const).map(a=>(
            <button key={a} onClick={()=>setAba(a)} style={{padding:'7px 16px',borderRadius:8,fontSize:12,cursor:'pointer',border:'1px solid var(--border)',fontFamily:'DM Sans,sans-serif',background:aba===a?'rgba(201,168,76,0.12)':'rgba(255,255,255,0.04)',color:aba===a?'var(--gold)':'var(--text-muted)',borderColor:aba===a?'var(--gold)':'var(--border)'}}>
              {a==='usuarios'?'👤 Usuários':'👥 Equipes'}
            </button>
          ))}
        </div>
      </div>

      <div style={{flex:1,overflow:'auto',padding:'28px'}}>
        {aba==='usuarios' && (
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20,alignItems:'start'}}>
            <div className="card">
              <div style={{fontFamily:'DM Serif Display,serif',fontSize:15,marginBottom:16}}>Equipe ({usuarios.length})</div>
              {loading ? <div style={{color:'var(--text-muted)'}}>Carregando...</div> : usuarios.map(u => {
                const r = ri(u.role)
                const salvando = salvandoRole === u.id
                const editandoEste = editandoRamal === u.id
                const extInfo = EXTENSOES_GOTO.find(e => e.numero === u.ramal_goto)
                return (
                  <div key={u.id} style={{padding:'14px 0',borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
                    <div style={{display:'flex',alignItems:'center',gap:12}}>
                      <Avatar nome={u.nome||u.email} avatarUrl={u.avatar_url} role={u.role} size={38} />
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:13,fontWeight:500,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{u.nome}</div>
                        <div style={{fontSize:11,color:'var(--text-muted)'}}>{u.email}</div>
                      </div>
                      {isAdmin ? (
                        <div style={{display:'flex',alignItems:'center',gap:6}}>
                          {salvando && <span style={{fontSize:11,color:'var(--text-muted)'}}>...</span>}
                          <select value={u.role||'corretor'} onChange={e=>alterarRole(u.id,e.target.value)} disabled={salvando}
                            style={{background:'#ffffff',border:`1px solid ${r.cor}50`,borderRadius:6,padding:'4px 10px',color:r.cor,fontFamily:'DM Sans,sans-serif',fontSize:11,cursor:'pointer'}}>
                            {ROLES.map(x=><option key={x.key} value={x.key} style={{background:'#ffffff'}}>{x.label}</option>)}
                          </select>
                        </div>
                      ) : (
                        <span style={{fontSize:11,fontWeight:600,borderRadius:10,padding:'2px 10px',background:`${r.cor}18`,color:r.cor}}>{r.label}</span>
                      )}
                    </div>

                    {/* Ramal */}
                    <div style={{marginTop:10,paddingLeft:50}}>
                      {isAdmin ? (
                        editandoEste ? (
                          <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
                            <span style={{fontSize:11,color:'var(--text-muted)',flexShrink:0}}>📞 Ramal:</span>
                            <select value={ramalTemp} onChange={e=>setRamalTemp(e.target.value)}
                              style={{flex:1,minWidth:160,background:'#ffffff',border:'1px solid var(--gold)',borderRadius:6,padding:'5px 10px',color:'var(--text)',fontFamily:'DM Sans,sans-serif',fontSize:12,outline:'none'}}>
                              <option value="">— Sem ramal —</option>
                              {EXTENSOES_GOTO.map(e=>(
                                <option key={e.numero} value={e.numero} style={{background:'#ffffff'}}>{e.numero} — {e.nome}</option>
                              ))}
                            </select>
                            <button onClick={()=>salvarRamal(u.id)} disabled={salvandoRamal===u.id}
                              style={{padding:'5px 14px',borderRadius:6,fontSize:12,cursor:'pointer',border:'none',background:'var(--teal)',color:'#fff',fontFamily:'DM Sans,sans-serif',fontWeight:600}}>
                              {salvandoRamal===u.id?'...':'✓'}
                            </button>
                            <button onClick={()=>{setEditandoRamal(null);setRamalTemp('')}}
                              style={{padding:'5px 10px',borderRadius:6,fontSize:12,cursor:'pointer',border:'1px solid var(--border)',background:'transparent',color:'var(--text-muted)',fontFamily:'DM Sans,sans-serif'}}>
                              ✕
                            </button>
                          </div>
                        ) : (
                          <div style={{display:'flex',alignItems:'center',gap:10}}>
                            <span style={{fontSize:11,color:'var(--text-muted)'}}>📞 Ramal:</span>
                            <span style={{fontSize:12,color:u.ramal_goto?'var(--gold)':'var(--text-muted)',fontWeight:u.ramal_goto?600:400}}>
                              {u.ramal_goto ? `${u.ramal_goto} — ${extInfo?.nome||''}` : 'Não configurado'}
                            </span>
                            <button onClick={()=>{setEditandoRamal(u.id);setRamalTemp(u.ramal_goto||'')}}
                              style={{padding:'3px 10px',borderRadius:6,fontSize:11,cursor:'pointer',border:'1px solid var(--border)',background:'rgba(255,255,255,0.05)',color:'var(--text-muted)',fontFamily:'DM Sans,sans-serif'}}>
                              ✏️
                            </button>
                          </div>
                        )
                      ) : (
                        u.ramal_goto && <div style={{fontSize:11,color:'var(--gold)'}}>📞 Ramal: {u.ramal_goto}</div>
                      )}
                      {msgRamal[u.id] && <div style={{fontSize:11,marginTop:4,color:msgRamal[u.id].includes('✅')?'var(--teal)':'var(--red)'}}>{msgRamal[u.id]}</div>}
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="card">
              <div style={{fontFamily:'DM Serif Display,serif',fontSize:15,marginBottom:16}}>{isAdmin?'Adicionar corretor':'Meu perfil'}</div>
              {isAdmin ? (
                <form onSubmit={adicionarUsuario}>
                  <div style={{marginBottom:14}}><label style={{fontSize:12,color:'var(--text-muted)',display:'block',marginBottom:4}}>Nome</label><input style={inp} type="text" value={novoNome} onChange={e=>setNovoNome(e.target.value)} required placeholder="Nome completo"/></div>
                  <div style={{marginBottom:14}}><label style={{fontSize:12,color:'var(--text-muted)',display:'block',marginBottom:4}}>E-mail</label><input style={inp} type="email" value={novoEmail} onChange={e=>setNovoEmail(e.target.value)} required placeholder="email@empresa.com"/></div>
                  <div style={{marginBottom:14}}><label style={{fontSize:12,color:'var(--text-muted)',display:'block',marginBottom:4}}>Senha</label><input style={inp} type="password" value={novaSenha} onChange={e=>setNovaSenha(e.target.value)} required minLength={6} placeholder="Mínimo 6 caracteres"/></div>
                  <div style={{marginBottom:20}}>
                    <label style={{fontSize:12,color:'var(--text-muted)',display:'block',marginBottom:4}}>Nível</label>
                    <select style={{...inp,background:'#ffffff'}} value={novoRole} onChange={e=>setNovoRole(e.target.value)}>
                      {ROLES.map(r=><option key={r.key} value={r.key} style={{background:'#ffffff'}}>{r.label} — {r.desc}</option>)}
                    </select>
                  </div>
                  {msg&&<div style={{background:msgType==='ok'?'rgba(28,181,160,0.1)':'rgba(224,82,82,0.1)',border:`1px solid ${msgType==='ok'?'rgba(28,181,160,0.3)':'rgba(224,82,82,0.3)'}`,borderRadius:8,padding:'10px 14px',marginBottom:16,fontSize:13,color:msgType==='ok'?'var(--teal)':'var(--red)'}}>{msg}</div>}
                  <button className="btn-primary" type="submit" style={{width:'100%',padding:11}}>+ Adicionar</button>
                </form>
              ) : (
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
                  {[['Nome',profile?.nome],['E-mail',profile?.email],['Nível',ri(profile?.role).label],['Ramal',profile?.ramal_goto||'—']].map(([l,v])=>(
                    <div key={l as string}><div style={{fontSize:10,fontWeight:600,letterSpacing:'1.2px',textTransform:'uppercase',color:'var(--text-muted)',marginBottom:4}}>{l}</div><div style={{fontSize:13}}>{v||'—'}</div></div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {aba==='equipes' && (
          <div>
            <div style={{display:'flex',justifyContent:'flex-end',marginBottom:16}}>
              {isAdmin&&<button className="btn-primary" onClick={()=>setModalEquipe(true)}>+ Nova Equipe</button>}
            </div>
            {equipes.length===0?(
              <div className="card" style={{textAlign:'center',padding:'40px 20px',color:'var(--text-muted)'}}>
                <div style={{fontSize:40,marginBottom:12}}>👥</div>
                <div style={{marginBottom:8}}>Nenhuma equipe criada.</div>
                {isAdmin&&<button className="btn-primary" onClick={()=>setModalEquipe(true)}>Criar equipe</button>}
              </div>
            ):equipes.map(eq=>(
              <div key={eq.id} className="card" style={{marginBottom:16}}>
                <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:14,gap:10}}>
                  <div style={{flex:1}}>
                    <div style={{fontFamily:'DM Serif Display,serif',fontSize:16}}>{eq.nome}</div>
                    <div style={{fontSize:12,color:'var(--text-muted)',marginTop:2}}>Líder: <span style={{color:'var(--gold)'}}>{eq.users?.nome||'Sem líder'}</span> · {eq.equipe_membros?.length||0} membros</div>
                  </div>
                  {isAdmin && (
                    <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                      <select defaultValue={eq.lider_id||''} onChange={e=>trocarLider(eq.id,e.target.value)}
                        style={{padding:'5px 10px',borderRadius:6,fontSize:11,border:'1px solid var(--border)',background:'rgba(255,255,255,0.04)',color:'var(--text)',cursor:'pointer'}}
                        title="Mudar líder">
                        <option value="" style={{background:'#ffffff'}}>— Sem líder —</option>
                        {usuarios.filter(u=>u.role==='lider'||u.role==='admin').map(u=>(
                          <option key={u.id} value={u.id} style={{background:'#ffffff'}}>{u.nome}</option>
                        ))}
                      </select>
                      <button onClick={()=>renomearEquipe(eq.id,eq.nome)}
                        style={{padding:'5px 10px',borderRadius:6,fontSize:11,border:'1px solid var(--border)',background:'rgba(255,255,255,0.04)',color:'var(--gold)',cursor:'pointer'}}>✎ Renomear</button>
                      <button onClick={()=>excluirEquipe(eq.id,eq.nome)}
                        style={{padding:'5px 10px',borderRadius:6,fontSize:11,border:'1px solid rgba(224,82,82,0.3)',background:'rgba(224,82,82,0.06)',color:'var(--red)',cursor:'pointer'}}>🗑 Excluir</button>
                    </div>
                  )}
                </div>
                <div style={{display:'flex',flexWrap:'wrap',gap:8,marginBottom:isAdmin?12:0}}>
                  {(eq.equipe_membros||[]).map((m:any)=>(
                    <div key={m.user_id} style={{display:'flex',alignItems:'center',gap:6,background:'rgba(255,255,255,0.04)',border:'1px solid var(--border)',borderRadius:20,padding:'4px 12px'}}>
                      <Avatar nome={m.users?.nome} avatarUrl={m.users?.avatar_url} role={m.users?.role} size={22} />
                      <span style={{fontSize:12}}>{m.users?.nome}</span>
                      {isAdmin&&<span style={{fontSize:10,color:'var(--red)',cursor:'pointer'}} onClick={()=>removerMembro(eq.id,m.user_id)}>✕</span>}
                    </div>
                  ))}
                  {!(eq.equipe_membros?.length)&&<span style={{fontSize:12,color:'var(--text-muted)'}}>Nenhum membro</span>}
                </div>
                {isAdmin&&(
                  <select style={{background:'#ffffff',border:'1px solid var(--border)',borderRadius:8,padding:'7px 12px',color:'var(--text)',fontSize:12,fontFamily:'DM Sans,sans-serif',cursor:'pointer',outline:'none'}} defaultValue=""
                    onChange={e=>{if(e.target.value){adicionarMembro(eq.id,e.target.value);(e.target as HTMLSelectElement).value=''}}}>
                    <option value="">+ Adicionar membro...</option>
                    {usuarios.filter(u=>!(eq.equipe_membros||[]).some((m:any)=>m.user_id===u.id)).map(u=><option key={u.id} value={u.id} style={{background:'#ffffff'}}>{u.nome}</option>)}
                  </select>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {modalEquipe&&(
        <div style={{position:'fixed',inset:0,background:'rgba(15,23,42,0.40)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',backdropFilter:'blur(4px)'}} onClick={e=>e.target===e.currentTarget&&setModalEquipe(false)}>
          <div style={{background:'#ffffff',border:'1px solid var(--border)',borderRadius:18,padding:'30px 32px',width:420,maxWidth:'95vw'}}>
            <div style={{fontFamily:'DM Serif Display,serif',fontSize:20,color:'var(--gold)',marginBottom:20}}>Nova Equipe</div>
            <div style={{marginBottom:14}}><label style={{fontSize:12,color:'var(--text-muted)',display:'block',marginBottom:4}}>Nome</label><input style={inp} placeholder="Ex: Equipe SP" value={novaEquipe.nome} onChange={e=>setNovaEquipe(n=>({...n,nome:e.target.value}))}/></div>
            <div style={{marginBottom:20}}>
              <label style={{fontSize:12,color:'var(--text-muted)',display:'block',marginBottom:4}}>Líder</label>
              <select style={{...inp,background:'#ffffff'}} value={novaEquipe.lider_id} onChange={e=>setNovaEquipe(n=>({...n,lider_id:e.target.value}))}>
                <option value="">Selecione...</option>
                {usuarios.filter(u=>u.role==='lider'||u.role==='admin').map(u=><option key={u.id} value={u.id} style={{background:'#ffffff'}}>{u.nome}</option>)}
              </select>
            </div>
            <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
              <button className="btn-secondary" onClick={()=>setModalEquipe(false)}>Cancelar</button>
              <button className="btn-primary" onClick={criarEquipe} disabled={!novaEquipe.nome}>🔗 Criar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
