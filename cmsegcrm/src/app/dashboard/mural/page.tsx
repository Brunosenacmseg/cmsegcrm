'use client'
import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import Avatar from '@/components/Avatar'

const REACOES      = ['👍','❤️','😂','🎉','🔥','👏']
const HUMORES      = ['😄','😊','😐','😔','😤','🤩','😴','🥳']
const HUMOR_LABELS: Record<string,string> = {
  '😄':'Ótimo!','😊':'Bem','😐':'Normal','😔':'Triste',
  '😤':'Estressado','🤩':'Animado','😴':'Cansado','🥳':'Eufórico',
}

export default function MuralPage() {
  const supabase   = createClient()
  const textareaRef    = useRef<HTMLTextAreaElement>(null)
  const comentarioRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const fotoInputRef   = useRef<HTMLInputElement>(null)

  const [profile, setProfile]           = useState<any>(null)
  const [usuarios, setUsuarios]         = useState<any[]>([])
  const [posts, setPosts]               = useState<any[]>([])
  const [loading, setLoading]           = useState(true)
  const [novoPost, setNovoPost]         = useState('')
  const [fotoPreview, setFotoPreview]   = useState<string|null>(null)
  const [fotoFile, setFotoFile]         = useState<File|null>(null)
  const [postando, setPostando]         = useState(false)
  const [mencaoSearch, setMencaoSearch] = useState('')
  const [mencaoPos, setMencaoPos]       = useState<{top:number,left:number}|null>(null)
  const [mencaoTarget, setMencaoTarget] = useState('post')
  const [comentarios, setComentarios]   = useState<Record<string,string>>({})
  const [expandidos, setExpandidos]     = useState<Record<string,boolean>>({})
  const [enviandoCom, setEnviandoCom]   = useState<string|null>(null)
  const [reacaoAberta, setReacaoAberta] = useState<string|null>(null)
  const [humorHoje, setHumorHoje]       = useState<any[]>([])
  const [meuHumor, setMeuHumor]         = useState<string|null>(null)

  useEffect(() => { init() }, [])

  async function init() {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: prof } = await supabase.from('users').select('id,nome,role,avatar_url').eq('id', user?.id||'').single()
    setProfile(prof)
    const { data: usr } = await supabase.from('users').select('id,nome,role,avatar_url').order('nome')
    setUsuarios(usr||[])
    await carregarPosts()
    await carregarHumor()
    setLoading(false)
  }

  async function carregarPosts() {
    const { data } = await supabase
      .from('mural_posts')
      .select(`
        *,
        users(id,nome,role,avatar_url),
        mural_comentarios(id,conteudo,criado_em,users(id,nome,role,avatar_url)),
        mural_reacoes(id,tipo,user_id),
        mural_mencoes(user_mencionado_id,users!mural_mencoes_user_mencionado_id_fkey(nome))
      `)
      .order('criado_em', { ascending: false })
      .limit(50)
    setPosts(data||[])
  }

  async function carregarHumor() {
    const hoje = new Date().toISOString().split('T')[0]
    const { data } = await supabase
      .from('mural_humor')
      .select('emoji,user_id,users(id,nome,avatar_url,role)')
      .eq('dia', hoje)
    const lista = (data||[]).map((r:any) => ({ ...r, tipo: r.emoji }))
    setHumorHoje(lista)
    const { data: { user } } = await supabase.auth.getUser()
    const meu = lista.find((r:any) => r.user_id === user?.id)
    setMeuHumor(meu?.emoji || null)
  }

  async function registrarHumor(emoji: string) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.id) return
    const hoje = new Date().toISOString().split('T')[0]

    if (emoji === meuHumor) {
      await supabase.from('mural_humor').delete().eq('dia', hoje).eq('user_id', user.id)
      setMeuHumor(null)
    } else {
      await supabase.from('mural_humor').upsert(
        { user_id: user.id, dia: hoje, emoji },
        { onConflict: 'user_id,dia' }
      )
      setMeuHumor(emoji)
    }
    await carregarHumor()
  }

  async function selecionarFoto(file: File) {
    setFotoFile(file)
    const reader = new FileReader()
    reader.onload = e => setFotoPreview(e.target?.result as string)
    reader.readAsDataURL(file)
  }

  async function publicarPost() {
    if (!novoPost.trim() && !fotoFile) return
    setPostando(true)

    let fotoUrl: string|null = null

    if (fotoFile) {
      const ext  = fotoFile.name.split('.').pop()
      const path = `mural/${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage.from('cmsegcrm').upload(path, fotoFile, { contentType: fotoFile.type, upsert: true })
      if (!upErr) {
        const { data: url } = supabase.storage.from('cmsegcrm').getPublicUrl(path)
        fotoUrl = url.publicUrl
      }
    }

    const { data: post } = await supabase.from('mural_posts').insert({
      user_id:   profile?.id,
      conteudo:  novoPost,
      foto_url:  fotoUrl,
    }).select().single()

    // Processar menções
    const mencoes = novoPost.match(/@(\S+)/g)||[]
    for (const m of mencoes) {
      const nome = m.slice(1)
      const usr  = usuarios.find(u => u.nome.toLowerCase().startsWith(nome.toLowerCase()))
      if (usr && usr.id !== profile?.id) {
        await supabase.from('mural_mencoes').insert({ post_id: post?.id, user_mencionado_id: usr.id })
        await supabase.from('notificacoes').insert({
          user_id:   usr.id,
          tipo:      'mencao',
          titulo:    `${profile?.nome} te marcou no mural`,
          descricao: novoPost.slice(0, 100),
          link:      '/dashboard/mural',
        })
      }
    }

    setNovoPost('')
    setFotoFile(null)
    setFotoPreview(null)
    setPostando(false)
    await carregarPosts()
  }

  async function comentar(postId: string) {
    const texto = comentarios[postId]
    if (!texto?.trim()) return
    setEnviandoCom(postId)

    const { data: com } = await supabase.from('mural_comentarios').insert({
      post_id: postId, user_id: profile?.id, conteudo: texto,
    }).select().single()

    // Menções no comentário
    const mencoes = texto.match(/@(\S+)/g)||[]
    for (const m of mencoes) {
      const nome = m.slice(1)
      const usr  = usuarios.find(u => u.nome.toLowerCase().startsWith(nome.toLowerCase()))
      if (usr && usr.id !== profile?.id) {
        await supabase.from('mural_mencoes').insert({ post_id: postId, comentario_id: com?.id, user_mencionado_id: usr.id })
        await supabase.from('notificacoes').insert({
          user_id: usr.id, tipo: 'mencao',
          titulo:  `${profile?.nome} te marcou em um comentário`,
          descricao: texto.slice(0, 100), link: '/dashboard/mural',
        })
      }
    }

    const post = posts.find(p => p.id === postId)
    if (post?.user_id !== profile?.id) {
      await supabase.from('notificacoes').insert({
        user_id: post?.user_id, tipo: 'comentario',
        titulo: `${profile?.nome} comentou sua publicação`,
        descricao: texto.slice(0, 100), link: '/dashboard/mural',
      })
    }

    setComentarios(c => ({...c, [postId]: ''}))
    setEnviandoCom(null)
    await carregarPosts()
  }

  async function reagir(postId: string, tipo: string) {
    const post       = posts.find(p => p.id === postId)
    const jaReagiu   = post?.mural_reacoes?.find((r:any) => r.user_id === profile?.id)
    if (jaReagiu) {
      if (jaReagiu.tipo === tipo) await supabase.from('mural_reacoes').delete().eq('id', jaReagiu.id)
      else await supabase.from('mural_reacoes').update({ tipo }).eq('id', jaReagiu.id)
    } else {
      await supabase.from('mural_reacoes').insert({ post_id: postId, user_id: profile?.id, tipo })
      if (post?.user_id !== profile?.id) {
        await supabase.from('notificacoes').insert({
          user_id: post?.user_id, tipo: 'reacao',
          titulo: `${profile?.nome} reagiu à sua publicação ${tipo}`,
          link: '/dashboard/mural',
        })
      }
    }
    setReacaoAberta(null)
    await carregarPosts()
  }

  async function excluirPost(postId: string) {
    if (!confirm('Excluir esta publicação?')) return
    await supabase.from('mural_posts').delete().eq('id', postId)
    await carregarPosts()
  }

  function handleTextChange(val: string, target: string) {
    if (target === 'post') setNovoPost(val)
    else setComentarios(c => ({...c, [target]: val}))
    const el = target === 'post' ? textareaRef.current : comentarioRefs.current[target]
    const cursor = el?.selectionStart || 0
    const match = val.slice(0, cursor).match(/@(\w*)$/)
    if (match) {
      setMencaoSearch(match[1]); setMencaoTarget(target)
      if (el) { const r = el.getBoundingClientRect(); setMencaoPos({ top: r.bottom + window.scrollY, left: r.left }) }
    } else setMencaoPos(null)
  }

  function inserirMencao(usuario: any) {
    const tag = `@${usuario.nome.split(' ')[0]} `
    if (mencaoTarget === 'post') {
      const pos   = textareaRef.current?.selectionStart || novoPost.length
      const antes = novoPost.slice(0, pos).replace(/@\w*$/, '')
      setNovoPost(antes + tag + novoPost.slice(pos))
    } else {
      const atual = comentarios[mencaoTarget] || ''
      const pos   = comentarioRefs.current[mencaoTarget]?.selectionStart || atual.length
      const antes = atual.slice(0, pos).replace(/@\w*$/, '')
      setComentarios(c => ({...c, [mencaoTarget]: antes + tag + atual.slice(pos)}))
    }
    setMencaoPos(null)
  }

  function formatarConteudo(texto: string) {
    return texto.split(/(@\S+)/g).map((part, i) => {
      if (part.startsWith('@')) {
        const nome = part.slice(1)
        const usr  = usuarios.find(u => u.nome.toLowerCase().startsWith(nome.toLowerCase()))
        if (usr) return <span key={i} style={{color:'var(--gold)',fontWeight:600}}>{part}</span>
      }
      return <span key={i}>{part}</span>
    })
  }

  function tempoAtras(data: string) {
    const diff = Date.now() - new Date(data).getTime()
    const min  = Math.floor(diff/60000)
    if (min < 1) return 'agora'
    if (min < 60) return `${min}min`
    const h = Math.floor(min/60)
    if (h < 24) return `${h}h`
    return `${Math.floor(h/24)}d`
  }

  // Agrupar humores por emoji
  const humorAgrupado: Record<string,any[]> = {}
  humorHoje.forEach((r:any) => {
    if (!humorAgrupado[r.tipo]) humorAgrupado[r.tipo] = []
    humorAgrupado[r.tipo].push(r)
  })

  const usuariosFiltrados = usuarios.filter(u =>
    u.nome.toLowerCase().includes(mencaoSearch.toLowerCase()) && u.id !== profile?.id
  )

  if (loading) return <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',color:'var(--text-muted)'}}>Carregando...</div>

  return (
    <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
      <div style={{height:56,borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',padding:'0 28px',background:'var(--bg-soft)',backdropFilter:'blur(8px)',position:'sticky',top:0,zIndex:5,flexShrink:0}}>
        <div style={{fontFamily:'DM Serif Display,serif',fontSize:18,flex:1}}>📣 Mural da Empresa</div>
      </div>

      <div style={{flex:1,overflow:'auto',padding:'24px 28px'}} onClick={()=>{setMencaoPos(null);setReacaoAberta(null)}}>
        <div style={{maxWidth:680,margin:'0 auto'}}>

          {/* Card Humor do Dia */}
          <div className="card" style={{marginBottom:20,padding:'18px 20px',background:'linear-gradient(135deg,rgba(201,168,76,0.08),rgba(28,181,160,0.06))'}}>
            <div style={{fontFamily:'DM Serif Display,serif',fontSize:15,marginBottom:4}}>🌤️ Como está seu humor hoje?</div>
            <div style={{fontSize:12,color:'var(--text-muted)',marginBottom:14}}>Clique em um emoji para registrar como você está</div>
            <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:14}}>
              {HUMORES.map(h => (
                <button key={h} onClick={()=>registrarHumor(h)}
                  style={{
                    padding:'8px 14px', borderRadius:20, fontSize:18, cursor:'pointer',
                    border:`2px solid ${meuHumor===h?'var(--gold)':'var(--border)'}`,
                    background:meuHumor===h?'rgba(201,168,76,0.15)':'rgba(255,255,255,0.04)',
                    transition:'all 0.15s', display:'flex', alignItems:'center', gap:6,
                  }}
                  title={HUMOR_LABELS[h]}>
                  <span>{h}</span>
                  {humorAgrupado[h]?.length > 0 && (
                    <span style={{fontSize:11,color:'var(--text-muted)',fontFamily:'DM Sans,sans-serif'}}>{humorAgrupado[h].length}</span>
                  )}
                </button>
              ))}
            </div>
            {humorHoje.length > 0 && (
              <div style={{display:'flex',flexWrap:'wrap',gap:8}}>
                {Object.entries(humorAgrupado).map(([emoji, pessoas]) => (
                  <div key={emoji} style={{display:'flex',alignItems:'center',gap:4,background:'rgba(255,255,255,0.04)',borderRadius:20,padding:'4px 10px',fontSize:12}}>
                    <span style={{fontSize:16}}>{emoji}</span>
                    <div style={{display:'flex',gap:-4}}>
                      {(pessoas as any[]).slice(0,3).map((p:any,i:number) => (
                        <div key={p.user_id} style={{marginLeft:i>0?-8:0,zIndex:3-i}}>
                          <Avatar nome={p.users?.nome} avatarUrl={p.users?.avatar_url} role={p.users?.role} size={20} />
                        </div>
                      ))}
                    </div>
                    {(pessoas as any[]).length > 3 && <span style={{color:'var(--text-muted)'}}>+{(pessoas as any[]).length-3}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Nova publicação */}
          <div className="card" style={{marginBottom:20,padding:'16px 20px'}}>
            <div style={{display:'flex',gap:12,alignItems:'flex-start'}}>
              <Avatar nome={profile?.nome} avatarUrl={profile?.avatar_url} role={profile?.role} size={40} />
              <div style={{flex:1}}>
                <textarea
                  ref={textareaRef}
                  value={novoPost}
                  onChange={e=>handleTextChange(e.target.value,'post')}
                  placeholder={`O que está acontecendo, ${profile?.nome?.split(' ')[0]}? Use @ para marcar colegas`}
                  rows={3}
                  style={{width:'100%',background:'rgba(255,255,255,0.04)',border:'1px solid var(--border)',borderRadius:10,padding:'10px 14px',color:'var(--text)',fontSize:13,fontFamily:'DM Sans,sans-serif',outline:'none',resize:'none',boxSizing:'border-box'}}
                />
                {/* Preview da foto */}
                {fotoPreview && (
                  <div style={{position:'relative',marginTop:8,display:'inline-block'}}>
                    <img src={fotoPreview} alt="preview" style={{maxHeight:200,maxWidth:'100%',borderRadius:10,display:'block'}} />
                    <button onClick={()=>{setFotoPreview(null);setFotoFile(null)}}
                      style={{position:'absolute',top:6,right:6,background:'rgba(0,0,0,0.6)',border:'none',borderRadius:'50%',width:24,height:24,cursor:'pointer',color:'#fff',fontSize:14,display:'flex',alignItems:'center',justifyContent:'center'}}>
                      ✕
                    </button>
                  </div>
                )}
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:8}}>
                  <button onClick={()=>fotoInputRef.current?.click()}
                    style={{padding:'6px 12px',borderRadius:8,fontSize:12,cursor:'pointer',border:'1px solid var(--border)',background:'rgba(255,255,255,0.04)',color:'var(--text-muted)',fontFamily:'DM Sans,sans-serif',display:'flex',alignItems:'center',gap:6}}>
                    📷 Foto
                  </button>
                  <input ref={fotoInputRef} type="file" accept="image/*" style={{display:'none'}} onChange={e=>e.target.files?.[0]&&selecionarFoto(e.target.files[0])} />
                  <button onClick={publicarPost} disabled={postando||(!novoPost.trim()&&!fotoFile)} className="btn-primary" style={{padding:'7px 20px',fontSize:13}}>
                    {postando?'Publicando...':'📣 Publicar'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {posts.length === 0 && (
            <div style={{textAlign:'center',color:'var(--text-muted)',padding:40}}>
              <div style={{fontSize:48,marginBottom:12}}>📣</div>
              <div>Nenhuma publicação ainda. Seja o primeiro!</div>
            </div>
          )}

          {posts.map(post => {
            const reacoesPorTipo: Record<string,number> = {}
            ;(post.mural_reacoes||[]).forEach((r:any) => { reacoesPorTipo[r.tipo] = (reacoesPorTipo[r.tipo]||0)+1 })
            const minhaReacao  = (post.mural_reacoes||[]).find((r:any) => r.user_id === profile?.id)
            const totalReacoes = Object.values(reacoesPorTipo).reduce((a:any,b:any) => a+b, 0)
            const coms         = post.mural_comentarios || []
            const mostrarTodos = expandidos[post.id]
            const comsVisiveis = mostrarTodos ? coms : coms.slice(-2)
            const autor        = post.users

            return (
              <div key={post.id} className="card" style={{marginBottom:16,padding:'16px 20px'}}>
                <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:12}}>
                  <Avatar nome={autor?.nome} avatarUrl={autor?.avatar_url} role={autor?.role} size={40} />
                  <div style={{flex:1}}>
                    <div style={{fontSize:13,fontWeight:600}}>{autor?.nome}</div>
                    <div style={{fontSize:11,color:'var(--text-muted)'}}>{tempoAtras(post.criado_em)}</div>
                  </div>
                  {post.user_id === profile?.id && (
                    <button onClick={()=>excluirPost(post.id)} style={{background:'none',border:'none',color:'var(--text-muted)',cursor:'pointer',fontSize:14}}>🗑</button>
                  )}
                </div>

                {post.conteudo && (
                  <div style={{fontSize:14,lineHeight:1.6,marginBottom:post.foto_url?10:12,whiteSpace:'pre-wrap'}}>
                    {formatarConteudo(post.conteudo)}
                  </div>
                )}

                {/* Foto do post */}
                {post.foto_url && (
                  <div style={{marginBottom:12}}>
                    <img src={post.foto_url} alt="post" style={{width:'100%',maxHeight:400,objectFit:'cover',borderRadius:10,display:'block'}} />
                  </div>
                )}

                {/* Reações */}
                <div style={{display:'flex',alignItems:'center',gap:8,paddingBottom:12,borderBottom:'1px solid rgba(255,255,255,0.06)',marginBottom:12}}>
                  <div style={{position:'relative'}}>
                    <button onClick={e=>{e.stopPropagation();setReacaoAberta(reacaoAberta===post.id?null:post.id)}}
                      style={{padding:'5px 12px',borderRadius:20,fontSize:13,cursor:'pointer',border:`1px solid ${minhaReacao?'rgba(201,168,76,0.4)':'var(--border)'}`,background:minhaReacao?'rgba(201,168,76,0.1)':'rgba(255,255,255,0.04)',color:minhaReacao?'var(--gold)':'var(--text-muted)',fontFamily:'DM Sans,sans-serif',display:'flex',alignItems:'center',gap:6}}>
                      {minhaReacao ? minhaReacao.tipo : '👍'}
                      {totalReacoes > 0 && <span style={{fontSize:12}}>{totalReacoes}</span>}
                    </button>
                    {reacaoAberta === post.id && (
                      <div onClick={e=>e.stopPropagation()} style={{position:'absolute',bottom:'100%',left:0,marginBottom:8,background:'#0e2040',border:'1px solid var(--border)',borderRadius:30,padding:'8px 12px',display:'flex',gap:6,zIndex:10,boxShadow:'0 4px 20px rgba(0,0,0,0.4)'}}>
                        {REACOES.map(r=>(
                          <button key={r} onClick={()=>reagir(post.id,r)}
                            style={{background:'none',border:'none',fontSize:20,cursor:'pointer',padding:'4px',borderRadius:8}}
                            onMouseEnter={e=>(e.currentTarget.style.transform='scale(1.3)')}
                            onMouseLeave={e=>(e.currentTarget.style.transform='')}>
                            {r}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {Object.entries(reacoesPorTipo).map(([tipo,count])=>(
                    <span key={tipo} style={{fontSize:12,color:'var(--text-muted)'}}>{tipo} {count as number}</span>
                  ))}
                  <div style={{flex:1}}/>
                  <button onClick={()=>setExpandidos(e=>({...e,[post.id]:true}))} style={{background:'none',border:'none',color:'var(--text-muted)',cursor:'pointer',fontSize:12,fontFamily:'DM Sans,sans-serif'}}>
                    💬 {coms.length} comentário{coms.length!==1?'s':''}
                  </button>
                </div>

                {coms.length > 2 && !mostrarTodos && (
                  <button onClick={()=>setExpandidos(e=>({...e,[post.id]:true}))} style={{background:'none',border:'none',color:'var(--text-muted)',cursor:'pointer',fontSize:12,fontFamily:'DM Sans,sans-serif',marginBottom:8,display:'block'}}>
                    Ver todos os {coms.length} comentários
                  </button>
                )}

                {comsVisiveis.map((com:any) => (
                  <div key={com.id} style={{display:'flex',gap:8,marginBottom:10}}>
                    <Avatar nome={com.users?.nome} avatarUrl={com.users?.avatar_url} role={com.users?.role} size={30} />
                    <div style={{flex:1,background:'rgba(255,255,255,0.04)',borderRadius:10,padding:'8px 12px'}}>
                      <div style={{fontSize:12,fontWeight:600,marginBottom:2}}>
                        {com.users?.nome}
                        <span style={{fontWeight:400,color:'var(--text-muted)',fontSize:11,marginLeft:6}}>{tempoAtras(com.criado_em)}</span>
                      </div>
                      <div style={{fontSize:13,lineHeight:1.4}}>{formatarConteudo(com.conteudo)}</div>
                    </div>
                  </div>
                ))}

                <div style={{display:'flex',gap:8,alignItems:'center',marginTop:4}}>
                  <Avatar nome={profile?.nome} avatarUrl={profile?.avatar_url} role={profile?.role} size={30} />
                  <input
                    ref={el=>{comentarioRefs.current[post.id]=el}}
                    value={comentarios[post.id]||''}
                    onChange={e=>handleTextChange(e.target.value,post.id)}
                    onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();comentar(post.id)}}}
                    placeholder="Comentar... @ para marcar"
                    style={{flex:1,background:'rgba(255,255,255,0.04)',border:'1px solid var(--border)',borderRadius:20,padding:'7px 14px',color:'var(--text)',fontSize:12,fontFamily:'DM Sans,sans-serif',outline:'none'}}
                  />
                  <button onClick={()=>comentar(post.id)} disabled={enviandoCom===post.id||!comentarios[post.id]?.trim()}
                    style={{width:34,height:34,borderRadius:'50%',background:comentarios[post.id]?.trim()?'var(--gold)':'rgba(255,255,255,0.1)',border:'none',cursor:'pointer',fontSize:14,flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center'}}>
                    {enviandoCom===post.id?'⏳':'✈'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Dropdown menções */}
      {mencaoPos && usuariosFiltrados.length > 0 && (
        <div onClick={e=>e.stopPropagation()} style={{position:'fixed',top:mencaoPos.top,left:mencaoPos.left,background:'#0e2040',border:'1px solid var(--border)',borderRadius:10,zIndex:1000,minWidth:220,maxHeight:200,overflow:'auto',boxShadow:'0 4px 20px rgba(0,0,0,0.4)'}}>
          {usuariosFiltrados.slice(0,6).map(u=>(
            <div key={u.id} onClick={()=>inserirMencao(u)}
              style={{padding:'8px 14px',cursor:'pointer',display:'flex',alignItems:'center',gap:10}}
              onMouseEnter={e=>(e.currentTarget.style.background='rgba(201,168,76,0.1)')}
              onMouseLeave={e=>(e.currentTarget.style.background='')}>
              <Avatar nome={u.nome} avatarUrl={u.avatar_url} role={u.role} size={28} />
              <span style={{fontSize:13}}>{u.nome}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
