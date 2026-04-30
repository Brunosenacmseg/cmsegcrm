'use client'
import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import Avatar from '@/components/Avatar'

export default function MensagensPage() {
  const supabase = createClient()

  const [profile, setProfile]         = useState<any>(null)
  const [usuarios, setUsuarios]       = useState<any[]>([])
  const [conversa, setConversa]       = useState<any>(null)
  const [mensagens, setMensagens]     = useState<any[]>([])
  const [texto, setTexto]             = useState('')
  const [loading, setLoading]         = useState(true)
  const [enviando, setEnviando]       = useState(false)
  const [naoLidas, setNaoLidas]       = useState<Record<string,number>>({})
  const msgFimRef = useRef<HTMLDivElement>(null)

  useEffect(() => { init() }, [])
  useEffect(() => { msgFimRef.current?.scrollIntoView({ behavior:'smooth' }) }, [mensagens])

  useEffect(() => {
    if (!profile) return
    const interval = setInterval(() => {
      carregarNaoLidas(profile.id)
      if (conversa) carregarMensagens(conversa.id)
    }, 3000)
    return () => clearInterval(interval)
  }, [profile, conversa])

  async function init() {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: prof } = await supabase.from('users').select('id,nome,email,role,avatar_url').eq('id', user?.id||'').single()
    setProfile(prof)
    const { data: usr } = await supabase.from('users').select('id,nome,email,role,avatar_url').order('nome')
    setUsuarios((usr||[]).filter(u => u.id !== user?.id))
    await carregarNaoLidas(user?.id||'')
    setLoading(false)
  }

  async function carregarNaoLidas(userId: string) {
    const { data } = await supabase.from('mensagens_internas').select('de_user_id').eq('para_user_id', userId).eq('lida', false)
    const map: Record<string,number> = {}
    ;(data||[]).forEach(m => { map[m.de_user_id] = (map[m.de_user_id]||0)+1 })
    setNaoLidas(map)
  }

  async function carregarMensagens(userId: string) {
    if (!profile) return
    const { data } = await supabase.from('mensagens_internas').select('*')
      .or(`and(de_user_id.eq.${profile.id},para_user_id.eq.${userId}),and(de_user_id.eq.${userId},para_user_id.eq.${profile.id})`)
      .order('criado_em', { ascending: true })
    setMensagens(data||[])
    await supabase.from('mensagens_internas').update({ lida: true }).eq('para_user_id', profile.id).eq('de_user_id', userId).eq('lida', false)
    setNaoLidas(prev => { const n = {...prev}; delete n[userId]; return n })
  }

  async function selecionarConversa(usuario: any) {
    setConversa(usuario)
    await carregarMensagens(usuario.id)
  }

  async function enviarMensagem() {
    if (!texto.trim() || !conversa || !profile) return
    setEnviando(true)
    await supabase.from('mensagens_internas').insert({ de_user_id: profile.id, para_user_id: conversa.id, conteudo: texto })
    setTexto('')
    await carregarMensagens(conversa.id)
    setEnviando(false)
  }

  const totalNaoLidas = Object.values(naoLidas).reduce((a,b)=>a+b,0)
  const roleLabel: Record<string,string> = { admin:'Admin', lider:'Líder', corretor:'Corretor' }

  if (loading) return <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',color:'var(--text-muted)'}}>Carregando...</div>

  return (
    <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
      <div style={{height:56,borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',padding:'0 28px',gap:12,background:'rgba(10,22,40,0.7)',backdropFilter:'blur(8px)',position:'sticky',top:0,zIndex:5,flexShrink:0}}>
        <div style={{fontFamily:'DM Serif Display,serif',fontSize:18,flex:1}}>
          💬 Mensagens Internas
          {totalNaoLidas>0&&<span style={{marginLeft:8,background:'var(--red)',color:'#fff',fontSize:11,fontWeight:700,borderRadius:10,padding:'1px 7px'}}>{totalNaoLidas}</span>}
        </div>
      </div>

      <div style={{flex:1,display:'flex',overflow:'hidden'}}>
        {/* Lista usuários */}
        <div style={{width:280,flexShrink:0,borderRight:'1px solid var(--border)',display:'flex',flexDirection:'column'}}>
          <div style={{padding:'14px 16px',borderBottom:'1px solid var(--border)',fontSize:12,color:'var(--text-muted)',fontWeight:600,textTransform:'uppercase',letterSpacing:'1px'}}>
            Equipe ({usuarios.length})
          </div>
          <div style={{flex:1,overflowY:'auto'}}>
            {usuarios.map(u=>{
              const nl = naoLidas[u.id]||0
              const ativo = conversa?.id===u.id
              return (
                <div key={u.id} onClick={()=>selecionarConversa(u)}
                  style={{padding:'12px 16px',cursor:'pointer',borderBottom:'1px solid rgba(255,255,255,0.04)',background:ativo?'rgba(201,168,76,0.08)':'transparent'}}>
                  <div style={{display:'flex',alignItems:'center',gap:10}}>
                    <Avatar nome={u.nome} avatarUrl={u.avatar_url} role={u.role} size={36} />
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:13,fontWeight:500,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{u.nome}</div>
                      <div style={{fontSize:10,color:'var(--text-muted)',fontWeight:600}}>{roleLabel[u.role]||u.role}</div>
                    </div>
                    {nl>0&&<span style={{background:'var(--red)',color:'#fff',fontSize:10,fontWeight:700,borderRadius:10,padding:'1px 6px'}}>{nl}</span>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Chat */}
        <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
          {!conversa ? (
            <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',color:'var(--text-muted)'}}>
              <div style={{textAlign:'center'}}>
                <div style={{fontSize:48,marginBottom:12}}>💬</div>
                <div>Selecione um colega para conversar</div>
              </div>
            </div>
          ) : (
            <>
              <div style={{padding:'12px 20px',borderBottom:'1px solid var(--border)',background:'rgba(255,255,255,0.02)',display:'flex',alignItems:'center',gap:12}}>
                <Avatar nome={conversa.nome} avatarUrl={conversa.avatar_url} role={conversa.role} size={36} />
                <div>
                  <div style={{fontWeight:600,fontSize:14}}>{conversa.nome}</div>
                  <div style={{fontSize:11,color:'var(--text-muted)'}}>{roleLabel[conversa.role]||conversa.role}</div>
                </div>
              </div>

              <div style={{flex:1,overflowY:'auto',padding:'16px 20px',display:'flex',flexDirection:'column',gap:8}}>
                {mensagens.length===0&&<div style={{textAlign:'center',color:'var(--text-muted)',fontSize:13,marginTop:40}}>Nenhuma mensagem ainda. Diga olá! 👋</div>}
                {mensagens.map(m=>{
                  const minha = m.de_user_id===profile?.id
                  return (
                    <div key={m.id} style={{display:'flex',justifyContent:minha?'flex-end':'flex-start',alignItems:'flex-end',gap:8}}>
                      {!minha && <Avatar nome={conversa.nome} avatarUrl={conversa.avatar_url} role={conversa.role} size={28} />}
                      <div style={{maxWidth:'70%',padding:'8px 12px',borderRadius:minha?'12px 12px 4px 12px':'12px 12px 12px 4px',background:minha?'rgba(201,168,76,0.15)':'rgba(255,255,255,0.06)',border:`1px solid ${minha?'rgba(201,168,76,0.25)':'rgba(255,255,255,0.08)'}`}}>
                        <div style={{fontSize:13,lineHeight:1.5}}>{m.conteudo}</div>
                        <div style={{fontSize:10,color:'var(--text-muted)',marginTop:4,textAlign:'right'}}>
                          {new Date(m.criado_em).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}
                          {minha&&(m.lida?' ✓✓':' ✓')}
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
                  placeholder={`Mensagem para ${conversa.nome}...`}
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
    </div>
  )
}
