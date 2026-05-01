'use client'
import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import Avatar from '@/components/Avatar'

type Conversa = {
  tipo: 'usuario' | 'grupo'
  id: string
  nome: string
  avatar_url?: string | null
  role?: string | null
  membros?: string[] // pra grupos: ids dos membros
}

export default function MensagensPage() {
  const supabase = createClient()

  const [profile, setProfile]         = useState<any>(null)
  const [usuarios, setUsuarios]       = useState<any[]>([])
  const [grupos, setGrupos]           = useState<any[]>([])
  const [conversa, setConversa]       = useState<Conversa | null>(null)
  const [mensagens, setMensagens]     = useState<any[]>([])
  const [texto, setTexto]             = useState('')
  const [loading, setLoading]         = useState(true)
  const [enviando, setEnviando]       = useState(false)
  const [naoLidas, setNaoLidas]       = useState<Record<string,number>>({})
  const [aba, setAba]                 = useState<'pessoas'|'grupos'>('pessoas')

  // Modal criar grupo
  const [modalGrupo, setModalGrupo] = useState(false)
  const [novoGrupoNome, setNovoGrupoNome] = useState('')
  const [novoGrupoMembros, setNovoGrupoMembros] = useState<string[]>([])
  const [salvandoGrupo, setSalvandoGrupo] = useState(false)

  const msgFimRef = useRef<HTMLDivElement>(null)

  useEffect(() => { init() }, [])
  useEffect(() => { msgFimRef.current?.scrollIntoView({ behavior:'smooth' }) }, [mensagens])

  useEffect(() => {
    if (!profile) return
    const interval = setInterval(() => {
      carregarNaoLidas(profile.id)
      if (conversa) carregarMensagens(conversa)
    }, 3000)
    return () => clearInterval(interval)
  }, [profile, conversa])

  async function init() {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: prof } = await supabase.from('users').select('id,nome,email,role,avatar_url').eq('id', user?.id||'').single()
    setProfile(prof)
    const { data: usr } = await supabase.from('users').select('id,nome,email,role,avatar_url').order('nome')
    setUsuarios((usr||[]).filter(u => u.id !== user?.id))
    await carregarGrupos()
    await carregarNaoLidas(user?.id||'')
    setLoading(false)
  }

  async function carregarGrupos() {
    const { data: g } = await supabase.from('mensagens_grupos')
      .select('id,nome,descricao,criado_em')
      .order('atualizado_em', { ascending: false })
    setGrupos(g || [])
  }

  async function carregarNaoLidas(userId: string) {
    // Mensagens diretas não lidas
    const { data: dir } = await supabase.from('mensagens_internas')
      .select('de_user_id,grupo_id')
      .eq('para_user_id', userId).eq('lida', false)
      .is('grupo_id', null)
    const map: Record<string,number> = {}
    ;(dir||[]).forEach(m => { map['u_'+m.de_user_id] = (map['u_'+m.de_user_id]||0)+1 })
    // Grupos: contar mensagens não lidas em cada grupo (cuja autor não é o user)
    // Simplificado: conta tudo desde a última visita (per-grupo cache no localStorage)
    setNaoLidas(map)
  }

  async function carregarMensagens(conv: Conversa) {
    if (!profile) return
    let q = supabase.from('mensagens_internas').select('*,users!mensagens_internas_de_user_id_fkey(nome,avatar_url,role)').order('criado_em', { ascending: true })
    if (conv.tipo === 'grupo') {
      q = q.eq('grupo_id', conv.id)
    } else {
      q = q.is('grupo_id', null).or(`and(de_user_id.eq.${profile.id},para_user_id.eq.${conv.id}),and(de_user_id.eq.${conv.id},para_user_id.eq.${profile.id})`)
    }
    const { data } = await q
    setMensagens(data||[])
    if (conv.tipo === 'usuario') {
      await supabase.from('mensagens_internas').update({ lida: true })
        .eq('para_user_id', profile.id).eq('de_user_id', conv.id).eq('lida', false).is('grupo_id', null)
      setNaoLidas(prev => { const n = {...prev}; delete n['u_'+conv.id]; return n })
    }
  }

  async function selecionarUsuario(u: any) {
    const c: Conversa = { tipo:'usuario', id: u.id, nome: u.nome, avatar_url: u.avatar_url, role: u.role }
    setConversa(c)
    await carregarMensagens(c)
  }

  async function selecionarGrupo(g: any) {
    const c: Conversa = { tipo:'grupo', id: g.id, nome: g.nome }
    setConversa(c)
    await carregarMensagens(c)
  }

  async function enviarMensagem() {
    if (!texto.trim() || !conversa || !profile) return
    setEnviando(true)
    const payload: any = { de_user_id: profile.id, conteudo: texto }
    if (conversa.tipo === 'grupo') {
      payload.grupo_id = conversa.id
    } else {
      payload.para_user_id = conversa.id
    }
    await supabase.from('mensagens_internas').insert(payload)
    if (conversa.tipo === 'grupo') {
      // Bumpa atualizado_em do grupo pra ordenar por última atividade
      await supabase.from('mensagens_grupos').update({ atualizado_em: new Date().toISOString() }).eq('id', conversa.id)
    }
    setTexto('')
    await carregarMensagens(conversa)
    setEnviando(false)
  }

  async function criarGrupo() {
    if (!novoGrupoNome.trim() || novoGrupoMembros.length === 0 || !profile) return
    setSalvandoGrupo(true)
    const { data: g, error } = await supabase.from('mensagens_grupos').insert({
      nome: novoGrupoNome.trim(),
      criado_por: profile.id,
    }).select('id').single()
    if (error || !g) { alert('Erro ao criar grupo: ' + (error?.message || '')); setSalvandoGrupo(false); return }
    // Adiciona criador como admin
    await supabase.from('mensagens_grupo_membros').insert({ grupo_id: g.id, user_id: profile.id, papel: 'admin' })
    // Adiciona membros
    const linhas = novoGrupoMembros.map(uid => ({ grupo_id: g.id, user_id: uid, papel: 'membro' }))
    if (linhas.length > 0) await supabase.from('mensagens_grupo_membros').insert(linhas)
    setSalvandoGrupo(false)
    setModalGrupo(false)
    setNovoGrupoNome(''); setNovoGrupoMembros([])
    await carregarGrupos()
    setAba('grupos')
  }

  const totalNaoLidas = Object.values(naoLidas).reduce((a,b)=>a+b,0)
  const roleLabel: Record<string,string> = { admin:'Admin', lider:'Líder', corretor:'Corretor' }

  if (loading) return <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',color:'var(--text-muted)'}}>Carregando...</div>

  return (
    <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
      <div style={{height:56,borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',padding:'0 28px',gap:12,background:'var(--bg-soft)',backdropFilter:'blur(8px)',position:'sticky',top:0,zIndex:5,flexShrink:0}}>
        <div style={{fontFamily:'DM Serif Display,serif',fontSize:18,flex:1}}>
          💬 Mensagens Internas
          {totalNaoLidas>0&&<span style={{marginLeft:8,background:'var(--danger)',color:'#fff',fontSize:11,fontWeight:700,borderRadius:10,padding:'1px 7px'}}>{totalNaoLidas}</span>}
        </div>
        <button onClick={()=>{setModalGrupo(true);setNovoGrupoNome('');setNovoGrupoMembros([])}} className="btn-secondary" style={{padding:'7px 14px',fontSize:12}}>
          ➕ Novo grupo
        </button>
      </div>

      <div style={{flex:1,display:'flex',overflow:'hidden'}}>
        {/* Sidebar — pessoas e grupos com tabs */}
        <div style={{width:280,flexShrink:0,borderRight:'1px solid var(--border)',display:'flex',flexDirection:'column'}}>
          <div style={{display:'flex',borderBottom:'1px solid var(--border)'}}>
            {[['pessoas','👥 Pessoas'],['grupos','💬 Grupos']].map(([k,l])=>(
              <button key={k} onClick={()=>setAba(k as any)}
                style={{flex:1,padding:'12px 8px',fontSize:12,cursor:'pointer',border:'none',background:'transparent',color:aba===k?'var(--gold)':'var(--text-muted)',fontWeight:aba===k?600:400,borderBottom:aba===k?'2px solid var(--gold)':'2px solid transparent',fontFamily:'DM Sans,sans-serif'}}>
                {l}
              </button>
            ))}
          </div>

          <div style={{flex:1,overflowY:'auto'}}>
            {aba === 'pessoas' && usuarios.map(u=>{
              const nl = naoLidas['u_'+u.id]||0
              const ativo = conversa?.tipo==='usuario' && conversa.id===u.id
              return (
                <div key={u.id} onClick={()=>selecionarUsuario(u)}
                  style={{padding:'12px 16px',cursor:'pointer',borderBottom:'1px solid rgba(255,255,255,0.04)',background:ativo?'rgba(201,168,76,0.08)':'transparent'}}>
                  <div style={{display:'flex',alignItems:'center',gap:10}}>
                    <Avatar nome={u.nome} avatarUrl={u.avatar_url} role={u.role} size={36} />
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:13,fontWeight:500,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{u.nome}</div>
                      <div style={{fontSize:10,color:'var(--text-muted)',fontWeight:600}}>{roleLabel[u.role]||u.role}</div>
                    </div>
                    {nl>0&&<span style={{background:'var(--danger)',color:'#fff',fontSize:10,fontWeight:700,borderRadius:10,padding:'1px 6px'}}>{nl}</span>}
                  </div>
                </div>
              )
            })}
            {aba === 'grupos' && (
              <>
                {grupos.length === 0 && (
                  <div style={{padding:'24px 16px',textAlign:'center',color:'var(--text-muted)',fontSize:12}}>
                    Nenhum grupo. Clique em <b>➕ Novo grupo</b> no topo.
                  </div>
                )}
                {grupos.map(g => {
                  const ativo = conversa?.tipo==='grupo' && conversa.id===g.id
                  return (
                    <div key={g.id} onClick={()=>selecionarGrupo(g)}
                      style={{padding:'12px 16px',cursor:'pointer',borderBottom:'1px solid rgba(255,255,255,0.04)',background:ativo?'rgba(201,168,76,0.08)':'transparent'}}>
                      <div style={{display:'flex',alignItems:'center',gap:10}}>
                        <div style={{width:36,height:36,borderRadius:18,background:'rgba(201,168,76,0.15)',color:'var(--gold)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18}}>👥</div>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:13,fontWeight:500,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{g.nome}</div>
                          <div style={{fontSize:10,color:'var(--text-muted)'}}>{g.descricao || 'Grupo'}</div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </>
            )}
          </div>
        </div>

        {/* Chat */}
        <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
          {!conversa ? (
            <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',color:'var(--text-muted)'}}>
              <div style={{textAlign:'center'}}>
                <div style={{fontSize:48,marginBottom:12}}>💬</div>
                <div>Selecione uma pessoa ou grupo</div>
              </div>
            </div>
          ) : (
            <>
              <div style={{padding:'12px 20px',borderBottom:'1px solid var(--border)',background:'rgba(255,255,255,0.02)',display:'flex',alignItems:'center',gap:12}}>
                {conversa.tipo === 'grupo' ? (
                  <div style={{width:36,height:36,borderRadius:18,background:'rgba(201,168,76,0.15)',color:'var(--gold)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18}}>👥</div>
                ) : (
                  <Avatar nome={conversa.nome} avatarUrl={conversa.avatar_url||undefined} role={conversa.role||undefined} size={36} />
                )}
                <div>
                  <div style={{fontWeight:600,fontSize:14}}>{conversa.nome}</div>
                  <div style={{fontSize:11,color:'var(--text-muted)'}}>
                    {conversa.tipo === 'grupo' ? 'Conversa em grupo' : (roleLabel[conversa.role||'']||conversa.role)}
                  </div>
                </div>
              </div>

              <div style={{flex:1,overflowY:'auto',padding:'16px 20px',display:'flex',flexDirection:'column',gap:8}}>
                {mensagens.length===0&&<div style={{textAlign:'center',color:'var(--text-muted)',fontSize:13,marginTop:40}}>Nenhuma mensagem ainda. Diga olá! 👋</div>}
                {mensagens.map(m=>{
                  const minha = m.de_user_id===profile?.id
                  const autor = m.users
                  return (
                    <div key={m.id} style={{display:'flex',justifyContent:minha?'flex-end':'flex-start',alignItems:'flex-end',gap:8}}>
                      {!minha && <Avatar nome={autor?.nome||conversa.nome} avatarUrl={autor?.avatar_url||conversa.avatar_url||undefined} role={autor?.role||conversa.role||undefined} size={28} />}
                      <div style={{maxWidth:'70%',padding:'8px 12px',borderRadius:minha?'12px 12px 4px 12px':'12px 12px 12px 4px',background:minha?'rgba(201,168,76,0.15)':'rgba(255,255,255,0.06)',border:`1px solid ${minha?'rgba(201,168,76,0.25)':'rgba(255,255,255,0.08)'}`}}>
                        {/* Em grupo, mostra nome do autor pra mensagens dos outros */}
                        {!minha && conversa.tipo === 'grupo' && autor?.nome && (
                          <div style={{fontSize:10,fontWeight:700,color:'var(--gold)',marginBottom:2}}>{autor.nome}</div>
                        )}
                        <div style={{fontSize:13,lineHeight:1.5,whiteSpace:'pre-wrap'}}>{m.conteudo}</div>
                        <div style={{fontSize:10,color:'var(--text-muted)',marginTop:4,textAlign:'right'}}>
                          {new Date(m.criado_em).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}
                          {minha && conversa.tipo !== 'grupo' && (m.lida?' ✓✓':' ✓')}
                        </div>
                      </div>
                      {minha && <Avatar nome={profile?.nome} avatarUrl={profile?.avatar_url} role={profile?.role} size={28} />}
                    </div>
                  )
                })}
                <div ref={msgFimRef}/>
              </div>

              <div style={{padding:'12px 20px',borderTop:'1px solid var(--border)',display:'flex',gap:10,alignItems:'center'}}>
                <textarea rows={1}
                  style={{flex:1,background:'rgba(255,255,255,0.05)',border:'1px solid var(--border)',borderRadius:20,padding:'10px 16px',color:'var(--text)',fontSize:13,fontFamily:'DM Sans,sans-serif',outline:'none',resize:'none'}}
                  placeholder={`Mensagem ${conversa.tipo === 'grupo' ? `para o grupo "${conversa.nome}"` : `para ${conversa.nome}`}...`}
                  value={texto}
                  onChange={e=>setTexto(e.target.value)}
                  onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();enviarMensagem()}}}
                />
                <button onClick={enviarMensagem} disabled={enviando||!texto.trim()}
                  style={{width:44,height:44,borderRadius:'50%',background:texto.trim()?'var(--gold)':'rgba(255,255,255,0.1)',border:'none',cursor:texto.trim()?'pointer':'default',fontSize:18,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                  {enviando?'⏳':'✈'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Modal: criar novo grupo */}
      {modalGrupo && (
        <div style={{position:'fixed',inset:0,background:'rgba(5,12,26,0.85)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',backdropFilter:'blur(6px)'}}
          onClick={e=>e.target===e.currentTarget&&setModalGrupo(false)}>
          <div style={{background:'#0a1628',border:'1px solid var(--border)',borderRadius:20,padding:'28px 32px',width:480,maxWidth:'95vw',maxHeight:'90vh',overflow:'auto'}}>
            <div style={{fontFamily:'DM Serif Display,serif',fontSize:18,marginBottom:18}}>➕ Novo grupo</div>

            <div style={{marginBottom:16}}>
              <label style={{fontSize:11,color:'var(--text-muted)',display:'block',marginBottom:5,textTransform:'uppercase',letterSpacing:'1px',fontWeight:600}}>Nome do grupo *</label>
              <input value={novoGrupoNome} onChange={e=>setNovoGrupoNome(e.target.value)} placeholder="Ex: Time de Vendas SP"
                autoFocus
                style={{width:'100%',background:'rgba(255,255,255,0.05)',border:'1px solid var(--border)',borderRadius:8,padding:'10px 13px',color:'var(--text)',fontSize:14,fontWeight:500,outline:'none',boxSizing:'border-box'}} />
            </div>

            <div style={{marginBottom:18}}>
              <label style={{fontSize:11,color:'var(--text-muted)',display:'block',marginBottom:8,textTransform:'uppercase',letterSpacing:'1px',fontWeight:600}}>
                Membros * ({novoGrupoMembros.length} selecionados)
              </label>
              <div style={{maxHeight:280,overflowY:'auto',border:'1px solid var(--border)',borderRadius:8,padding:6}}>
                {usuarios.map(u => {
                  const sel = novoGrupoMembros.includes(u.id)
                  return (
                    <div key={u.id}
                      onClick={()=>setNovoGrupoMembros(prev => sel ? prev.filter(x=>x!==u.id) : [...prev, u.id])}
                      style={{display:'flex',alignItems:'center',gap:10,padding:'8px 10px',borderRadius:6,cursor:'pointer',background:sel?'rgba(201,168,76,0.10)':'transparent'}}
                      onMouseEnter={e=>{if(!sel)(e.currentTarget as HTMLDivElement).style.background='rgba(255,255,255,0.04)'}}
                      onMouseLeave={e=>{if(!sel)(e.currentTarget as HTMLDivElement).style.background='transparent'}}>
                      <div style={{width:18,height:18,borderRadius:4,border:'1px solid '+(sel?'var(--gold)':'var(--border)'),background:sel?'var(--gold)':'transparent',display:'flex',alignItems:'center',justifyContent:'center',color:'var(--navy)',fontSize:12,fontWeight:700}}>
                        {sel ? '✓' : ''}
                      </div>
                      <Avatar nome={u.nome} avatarUrl={u.avatar_url} role={u.role} size={28} />
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:13,fontWeight:500}}>{u.nome}</div>
                        <div style={{fontSize:10,color:'var(--text-muted)'}}>{roleLabel[u.role]||u.role}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
              <button className="btn-secondary" onClick={()=>setModalGrupo(false)} disabled={salvandoGrupo}>Cancelar</button>
              <button className="btn-primary" onClick={criarGrupo} disabled={salvandoGrupo||!novoGrupoNome.trim()||novoGrupoMembros.length===0}>
                {salvandoGrupo?'Criando...':'✓ Criar grupo'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
