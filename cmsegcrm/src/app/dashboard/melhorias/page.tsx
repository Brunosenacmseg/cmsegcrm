'use client'
import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Avatar from '@/components/Avatar'

type Status = 'aberta' | 'concluida' | 'nao_pode_ser_feita' | 'sera_feita_depois'

const STATUS_INFO: Record<Status, { label: string; cor: string; bg: string; icone: string }> = {
  aberta:             { label: 'Aberta',                  cor: 'var(--gold)',       bg: 'rgba(201,168,76,0.12)', icone: '🟡' },
  concluida:          { label: 'Concluída',               cor: 'var(--teal)',       bg: 'rgba(16,185,129,0.12)', icone: '✅' },
  nao_pode_ser_feita: { label: 'Não pode ser feita',      cor: 'var(--red)',        bg: 'rgba(220,38,38,0.10)',  icone: '🚫' },
  sera_feita_depois:  { label: 'Será feita em outro momento', cor: 'var(--text-muted)', bg: 'rgba(107,114,128,0.12)', icone: '⏭️' },
}

interface Anexo {
  id: string
  path: string
  nome_arquivo: string
  tipo_mime: string | null
  tamanho_kb: number | null
  created_at: string
}

interface Melhoria {
  id: string
  user_id: string
  titulo: string
  descricao: string | null
  status: Status
  resposta: string | null
  respondido_por: string | null
  respondido_em: string | null
  criado_em: string
  atualizado_em: string
  users?: { id: string; nome: string; role?: string; avatar_url?: string }
  respondedor?: { id: string; nome: string; role?: string; avatar_url?: string } | null
  melhorias_crm_anexos?: Anexo[]
}

const FILTROS: Array<{ value: 'todas' | Status; label: string }> = [
  { value: 'todas', label: 'Todas' },
  { value: 'aberta', label: '🟡 Abertas' },
  { value: 'concluida', label: '✅ Concluídas' },
  { value: 'sera_feita_depois', label: '⏭️ Para depois' },
  { value: 'nao_pode_ser_feita', label: '🚫 Não pode ser feita' },
]

export default function MelhoriasPage() {
  const supabase = createClient()
  const fileRef = useRef<HTMLInputElement>(null)

  const [profile, setProfile]       = useState<any>(null)
  const [loading, setLoading]       = useState(true)
  const [melhorias, setMelhorias]   = useState<Melhoria[]>([])
  const [filtro, setFiltro]         = useState<'todas' | Status>('todas')
  const [criando, setCriando]       = useState(false)

  const [form, setForm]             = useState({ titulo: '', descricao: '' })
  const [arquivos, setArquivos]     = useState<File[]>([])
  const [enviando, setEnviando]     = useState(false)

  const [editandoResposta, setEditandoResposta] = useState<string | null>(null)
  const [respostaTemp, setRespostaTemp]         = useState('')
  const [statusTemp, setStatusTemp]             = useState<Status>('aberta')
  const [salvando, setSalvando]                 = useState(false)
  const [enviandoAnexoId, setEnviandoAnexoId]   = useState<string | null>(null)

  const isAdmin = profile?.role === 'admin' || profile?.role === 'financeiro'

  useEffect(() => { init() }, [])

  async function init() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: prof } = await supabase
      .from('users')
      .select('id,nome,role,avatar_url')
      .eq('id', user.id)
      .single()
    setProfile(prof)
    await carregar()
    setLoading(false)
  }

  async function carregar() {
    const { data } = await supabase
      .from('melhorias_crm')
      .select(`
        *,
        users:users!melhorias_crm_user_id_fkey(id,nome,role,avatar_url),
        respondedor:users!melhorias_crm_respondido_por_fkey(id,nome,role,avatar_url),
        melhorias_crm_anexos(id,path,nome_arquivo,tipo_mime,tamanho_kb,created_at)
      `)
      .order('criado_em', { ascending: false })
    setMelhorias((data as any) || [])
  }

  function selecionarArquivos(files: FileList | null) {
    if (!files) return
    const novos = Array.from(files)
    setArquivos(prev => [...prev, ...novos])
    if (fileRef.current) fileRef.current.value = ''
  }

  function removerArquivo(idx: number) {
    setArquivos(prev => prev.filter((_, i) => i !== idx))
  }

  async function publicar() {
    if (!form.titulo.trim() || !profile?.id) return
    setEnviando(true)
    try {
      const { data: nova, error } = await supabase
        .from('melhorias_crm')
        .insert({
          user_id: profile.id,
          titulo: form.titulo.trim(),
          descricao: form.descricao.trim() || null,
          status: 'aberta',
        })
        .select()
        .single()

      if (error) throw error
      if (nova) {
        for (const file of arquivos) {
          await uploadAnexo(nova.id, file)
        }
        // Notificar admins da nova sugestão
        const { data: admins } = await supabase
          .from('users')
          .select('id')
          .in('role', ['admin', 'financeiro'])
        for (const a of admins || []) {
          if (a.id === profile.id) continue
          await supabase.from('notificacoes').insert({
            user_id: a.id,
            tipo: 'sistema',
            titulo: `Nova sugestão de melhoria de ${profile.nome}`,
            descricao: form.titulo.slice(0, 100),
            link: '/dashboard/melhorias',
          })
        }
      }
      setForm({ titulo: '', descricao: '' })
      setArquivos([])
      setCriando(false)
      await carregar()
    } catch (e: any) {
      alert('Erro ao enviar: ' + (e.message || 'tente novamente'))
    } finally {
      setEnviando(false)
    }
  }

  async function uploadAnexo(melhoriaId: string, file: File) {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `melhorias/${melhoriaId}/${Date.now()}_${safeName}`
    const { error: upErr } = await supabase
      .storage.from('cmsegcrm')
      .upload(path, file, { contentType: file.type, upsert: false })
    if (upErr) throw upErr
    const { error: dbErr } = await supabase.from('melhorias_crm_anexos').insert({
      melhoria_id: melhoriaId,
      bucket: 'cmsegcrm',
      path,
      nome_arquivo: file.name,
      tipo_mime: file.type || null,
      tamanho_kb: Math.round(file.size / 1024),
      user_id: profile?.id,
    })
    if (dbErr) throw dbErr
  }

  async function abrirAnexo(path: string, nome: string) {
    const { data } = await supabase.storage.from('cmsegcrm').createSignedUrl(path, 60)
    if (data?.signedUrl) {
      const a = document.createElement('a')
      a.href = data.signedUrl
      a.target = '_blank'
      a.download = nome
      a.click()
    }
  }

  async function deletarAnexo(anexo: Anexo) {
    if (!confirm(`Remover o anexo "${anexo.nome_arquivo}"?`)) return
    await supabase.storage.from('cmsegcrm').remove([anexo.path])
    await supabase.from('melhorias_crm_anexos').delete().eq('id', anexo.id)
    await carregar()
  }

  async function anexarEmExistente(melhoriaId: string, files: FileList | null) {
    if (!files || files.length === 0) return
    setEnviandoAnexoId(melhoriaId)
    try {
      for (const file of Array.from(files)) {
        await uploadAnexo(melhoriaId, file)
      }
      await carregar()
    } catch (e: any) {
      alert('Erro ao anexar: ' + (e.message || 'tente novamente'))
    } finally {
      setEnviandoAnexoId(null)
    }
  }

  function iniciarResposta(m: Melhoria) {
    setEditandoResposta(m.id)
    setRespostaTemp(m.resposta || '')
    setStatusTemp(m.status === 'aberta' ? 'concluida' : m.status)
  }

  async function salvarResposta(m: Melhoria) {
    setSalvando(true)
    try {
      const { error } = await supabase
        .from('melhorias_crm')
        .update({
          resposta: respostaTemp.trim() || null,
          status: statusTemp,
          respondido_por: profile?.id,
          respondido_em: new Date().toISOString(),
        })
        .eq('id', m.id)
      if (error) throw error

      if (m.user_id !== profile?.id) {
        await supabase.from('notificacoes').insert({
          user_id: m.user_id,
          tipo: 'sistema',
          titulo: `Sua sugestão "${m.titulo}" foi atualizada`,
          descricao: STATUS_INFO[statusTemp].label + (respostaTemp.trim() ? ' — ' + respostaTemp.slice(0, 80) : ''),
          link: '/dashboard/melhorias',
        })
      }

      setEditandoResposta(null)
      setRespostaTemp('')
      await carregar()
    } catch (e: any) {
      alert('Erro ao salvar: ' + (e.message || 'tente novamente'))
    } finally {
      setSalvando(false)
    }
  }

  async function reabrir(m: Melhoria) {
    if (!confirm('Reabrir esta sugestão? Status voltará para "Aberta".')) return
    await supabase
      .from('melhorias_crm')
      .update({
        status: 'aberta',
        resposta: null,
        respondido_por: null,
        respondido_em: null,
      })
      .eq('id', m.id)
    await carregar()
  }

  async function excluir(m: Melhoria) {
    if (!confirm(`Excluir a sugestão "${m.titulo}"? Esta ação não pode ser desfeita.`)) return
    // Remove anexos do storage primeiro
    const paths = (m.melhorias_crm_anexos || []).map(a => a.path)
    if (paths.length > 0) {
      await supabase.storage.from('cmsegcrm').remove(paths)
    }
    await supabase.from('melhorias_crm').delete().eq('id', m.id)
    await carregar()
  }

  function tempoAtras(data: string) {
    const diff = Date.now() - new Date(data).getTime()
    const min = Math.floor(diff / 60000)
    if (min < 1) return 'agora'
    if (min < 60) return `${min}min`
    const h = Math.floor(min / 60)
    if (h < 24) return `${h}h`
    const d = Math.floor(h / 24)
    if (d < 30) return `${d}d`
    return new Date(data).toLocaleDateString('pt-BR')
  }

  function iconeArquivo(mime: string | null) {
    if (!mime) return '📎'
    if (mime.includes('pdf')) return '📄'
    if (mime.includes('image')) return '🖼️'
    if (mime.includes('sheet') || mime.includes('excel')) return '📊'
    if (mime.includes('word')) return '📝'
    if (mime.includes('video')) return '🎬'
    return '📎'
  }

  const visiveis = melhorias.filter(m => filtro === 'todas' ? true : m.status === filtro)
  const contagem: Record<string, number> = { todas: melhorias.length }
  for (const m of melhorias) contagem[m.status] = (contagem[m.status] || 0) + 1

  if (loading) return <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',color:'var(--text-muted)'}}>Carregando...</div>

  return (
    <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
      <div style={{height:56,borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',padding:'0 28px',background:'var(--bg-soft)',position:'sticky',top:0,zIndex:5,flexShrink:0,gap:12}}>
        <div style={{fontFamily:'DM Serif Display,serif',fontSize:18,flex:1}}>💡 Melhorias CRM</div>
        {!criando && (
          <button onClick={()=>setCriando(true)} className="btn-primary" style={{padding:'7px 18px',fontSize:13}}>
            + Nova sugestão
          </button>
        )}
      </div>

      <div style={{flex:1,overflow:'auto',padding:'24px 28px'}}>
        <div style={{maxWidth:760,margin:'0 auto'}}>

          {/* Filtros */}
          <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:16}}>
            {FILTROS.map(f => {
              const ativo = filtro === f.value
              const n = contagem[f.value] || 0
              return (
                <button key={f.value} onClick={()=>setFiltro(f.value)}
                  style={{
                    padding:'6px 12px',borderRadius:20,fontSize:12,cursor:'pointer',
                    border:`1px solid ${ativo?'var(--gold)':'var(--border)'}`,
                    background:ativo?'var(--gold-soft)':'#fff',
                    color:ativo?'var(--gold)':'var(--text-muted)',
                    fontFamily:'DM Sans,sans-serif',fontWeight:ativo?600:500,
                  }}>
                  {f.label} {n > 0 && <span style={{opacity:0.7}}>· {n}</span>}
                </button>
              )
            })}
          </div>

          {/* Card de criação */}
          {criando && (
            <div className="card" style={{marginBottom:20,padding:'18px 20px'}}>
              <div style={{fontFamily:'DM Serif Display,serif',fontSize:15,marginBottom:12}}>💡 Nova sugestão de melhoria</div>
              <input
                value={form.titulo}
                onChange={e=>setForm({...form,titulo:e.target.value})}
                placeholder="Título da sugestão"
                maxLength={200}
                style={{width:'100%',background:'#fff',border:'1px solid var(--border)',borderRadius:8,padding:'9px 12px',color:'var(--text)',fontSize:13,fontFamily:'DM Sans,sans-serif',outline:'none',marginBottom:10,boxSizing:'border-box'}}
              />
              <textarea
                value={form.descricao}
                onChange={e=>setForm({...form,descricao:e.target.value})}
                placeholder="Descreva sua sugestão de melhoria..."
                rows={4}
                style={{width:'100%',background:'#fff',border:'1px solid var(--border)',borderRadius:8,padding:'10px 12px',color:'var(--text)',fontSize:13,fontFamily:'DM Sans,sans-serif',outline:'none',resize:'vertical',marginBottom:10,boxSizing:'border-box'}}
              />

              {arquivos.length > 0 && (
                <div style={{display:'flex',flexDirection:'column',gap:6,marginBottom:10}}>
                  {arquivos.map((f, i) => (
                    <div key={i} style={{display:'flex',alignItems:'center',gap:10,background:'rgba(0,0,0,0.02)',border:'1px solid var(--border)',borderRadius:8,padding:'6px 10px'}}>
                      <span style={{fontSize:16}}>{iconeArquivo(f.type)}</span>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:12,fontWeight:500,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{f.name}</div>
                        <div style={{fontSize:10,color:'var(--text-muted)'}}>{(f.size/1024).toFixed(0)} KB</div>
                      </div>
                      <button onClick={()=>removerArquivo(i)} style={{background:'none',border:'none',cursor:'pointer',color:'var(--red)',fontSize:14}}>✕</button>
                    </div>
                  ))}
                </div>
              )}

              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:10}}>
                <button onClick={()=>fileRef.current?.click()}
                  style={{padding:'7px 14px',borderRadius:8,fontSize:12,cursor:'pointer',border:'1px solid var(--border)',background:'#fff',color:'var(--text-muted)',fontFamily:'DM Sans,sans-serif',display:'flex',alignItems:'center',gap:6}}>
                  📎 Anexar arquivo
                </button>
                <input ref={fileRef} type="file" multiple style={{display:'none'}} onChange={e=>selecionarArquivos(e.target.files)} />
                <div style={{display:'flex',gap:8}}>
                  <button onClick={()=>{setCriando(false);setForm({titulo:'',descricao:''});setArquivos([])}}
                    style={{padding:'7px 16px',fontSize:13,cursor:'pointer',border:'1px solid var(--border)',background:'#fff',borderRadius:8,color:'var(--text-muted)',fontFamily:'DM Sans,sans-serif'}}>
                    Cancelar
                  </button>
                  <button onClick={publicar} disabled={enviando||!form.titulo.trim()} className="btn-primary" style={{padding:'7px 20px',fontSize:13}}>
                    {enviando?'Enviando...':'Enviar sugestão'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Lista de cards */}
          {visiveis.length === 0 && (
            <div style={{textAlign:'center',color:'var(--text-muted)',padding:40}}>
              <div style={{fontSize:48,marginBottom:12}}>💡</div>
              <div>{melhorias.length === 0 ? 'Nenhuma sugestão ainda. Compartilhe ideias para melhorar o sistema!' : 'Nenhuma sugestão neste filtro.'}</div>
            </div>
          )}

          {visiveis.map(m => {
            const info = STATUS_INFO[m.status]
            const editando = editandoResposta === m.id
            const ehMeu = m.user_id === profile?.id
            const podeResponder = isAdmin
            const anexos = m.melhorias_crm_anexos || []

            return (
              <div key={m.id} className="card" style={{marginBottom:14,padding:'16px 20px'}}>
                {/* Cabeçalho */}
                <div style={{display:'flex',alignItems:'flex-start',gap:12,marginBottom:10}}>
                  <Avatar nome={m.users?.nome} avatarUrl={m.users?.avatar_url} role={m.users?.role} size={36} />
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
                      <div style={{fontSize:13,fontWeight:600}}>{m.users?.nome || 'Usuário'}</div>
                      <div style={{fontSize:11,color:'var(--text-muted)'}}>{tempoAtras(m.criado_em)}</div>
                      {ehMeu && (
                        <span style={{fontSize:10,color:'var(--gold)',background:'var(--gold-soft)',padding:'2px 6px',borderRadius:6}}>você</span>
                      )}
                    </div>
                    <div style={{fontFamily:'DM Serif Display,serif',fontSize:16,marginTop:4,color:'var(--text)'}}>{m.titulo}</div>
                  </div>
                  <span style={{
                    fontSize:11,fontWeight:600,padding:'4px 10px',borderRadius:12,
                    color:info.cor,background:info.bg,whiteSpace:'nowrap',
                  }}>
                    {info.icone} {info.label}
                  </span>
                </div>

                {/* Descrição */}
                {m.descricao && (
                  <div style={{fontSize:13,lineHeight:1.55,color:'var(--text)',whiteSpace:'pre-wrap',marginBottom:12,paddingLeft:48}}>
                    {m.descricao}
                  </div>
                )}

                {/* Anexos */}
                {anexos.length > 0 && (
                  <div style={{paddingLeft:48,marginBottom:12,display:'flex',flexDirection:'column',gap:6}}>
                    {anexos.map(a => (
                      <div key={a.id} style={{display:'flex',alignItems:'center',gap:10,background:'rgba(0,0,0,0.02)',border:'1px solid var(--border)',borderRadius:8,padding:'7px 12px'}}>
                        <span style={{fontSize:18}}>{iconeArquivo(a.tipo_mime)}</span>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:12,fontWeight:500,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{a.nome_arquivo}</div>
                          <div style={{fontSize:10,color:'var(--text-muted)'}}>
                            {a.tamanho_kb ? (a.tamanho_kb < 1000 ? a.tamanho_kb + ' KB' : (a.tamanho_kb/1024).toFixed(1) + ' MB') : ''}
                          </div>
                        </div>
                        <button onClick={()=>abrirAnexo(a.path, a.nome_arquivo)}
                          style={{fontSize:11,background:'rgba(74,128,240,0.1)',border:'1px solid rgba(74,128,240,0.3)',color:'#4a80f0',borderRadius:6,padding:'4px 10px',cursor:'pointer',fontFamily:'DM Sans,sans-serif'}}>
                          ⬇ Baixar
                        </button>
                        {(ehMeu || isAdmin) && (
                          <button onClick={()=>deletarAnexo(a)}
                            style={{fontSize:11,background:'rgba(220,38,38,0.08)',border:'1px solid rgba(220,38,38,0.2)',color:'var(--red)',borderRadius:6,padding:'4px 8px',cursor:'pointer',fontFamily:'DM Sans,sans-serif'}}>
                            ✕
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Adicionar mais anexos (autor enquanto aberta, ou admin sempre) */}
                {((ehMeu && m.status === 'aberta') || isAdmin) && (
                  <div style={{paddingLeft:48,marginBottom:12}}>
                    <label style={{display:'inline-flex',alignItems:'center',gap:6,fontSize:11,color:'var(--text-muted)',cursor:'pointer'}}>
                      📎 Anexar arquivo
                      <input type="file" multiple style={{display:'none'}}
                        onChange={e=>{anexarEmExistente(m.id, e.target.files); e.target.value=''}}
                        disabled={enviandoAnexoId === m.id} />
                      {enviandoAnexoId === m.id && <span>Enviando...</span>}
                    </label>
                  </div>
                )}

                {/* Resposta existente */}
                {m.resposta && !editando && (
                  <div style={{paddingLeft:48,marginBottom:10}}>
                    <div style={{background:'rgba(201,168,76,0.06)',borderLeft:'3px solid var(--gold)',borderRadius:6,padding:'10px 14px'}}>
                      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
                        <span style={{fontSize:11,color:'var(--gold)',fontWeight:600}}>💬 Resposta</span>
                        {m.respondedor && (
                          <span style={{fontSize:11,color:'var(--text-muted)'}}>
                            por {m.respondedor.nome}{m.respondido_em ? ' · ' + tempoAtras(m.respondido_em) : ''}
                          </span>
                        )}
                      </div>
                      <div style={{fontSize:13,lineHeight:1.5,whiteSpace:'pre-wrap'}}>{m.resposta}</div>
                    </div>
                  </div>
                )}

                {/* Editor de resposta (admin) */}
                {editando && (
                  <div style={{paddingLeft:48,marginBottom:10}}>
                    <div style={{fontSize:12,color:'var(--text-muted)',marginBottom:6}}>Status</div>
                    <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:10}}>
                      {(['concluida','nao_pode_ser_feita','sera_feita_depois'] as Status[]).map(s => {
                        const ativo = statusTemp === s
                        const inf = STATUS_INFO[s]
                        return (
                          <button key={s} onClick={()=>setStatusTemp(s)}
                            style={{
                              padding:'5px 10px',borderRadius:14,fontSize:11,cursor:'pointer',
                              border:`1px solid ${ativo?inf.cor:'var(--border)'}`,
                              background:ativo?inf.bg:'#fff',
                              color:ativo?inf.cor:'var(--text-muted)',
                              fontFamily:'DM Sans,sans-serif',fontWeight:ativo?600:500,
                            }}>
                            {inf.icone} {inf.label}
                          </button>
                        )
                      })}
                    </div>
                    <textarea
                      value={respostaTemp}
                      onChange={e=>setRespostaTemp(e.target.value)}
                      placeholder="Resposta para o solicitante (opcional)"
                      rows={3}
                      style={{width:'100%',background:'#fff',border:'1px solid var(--border)',borderRadius:8,padding:'9px 12px',color:'var(--text)',fontSize:13,fontFamily:'DM Sans,sans-serif',outline:'none',resize:'vertical',marginBottom:8,boxSizing:'border-box'}}
                    />
                    <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
                      <button onClick={()=>{setEditandoResposta(null);setRespostaTemp('')}}
                        style={{padding:'6px 14px',fontSize:12,cursor:'pointer',border:'1px solid var(--border)',background:'#fff',borderRadius:8,color:'var(--text-muted)',fontFamily:'DM Sans,sans-serif'}}>
                        Cancelar
                      </button>
                      <button onClick={()=>salvarResposta(m)} disabled={salvando} className="btn-primary" style={{padding:'6px 16px',fontSize:12}}>
                        {salvando?'Salvando...':'Salvar'}
                      </button>
                    </div>
                  </div>
                )}

                {/* Ações */}
                <div style={{paddingLeft:48,display:'flex',gap:8,flexWrap:'wrap',borderTop:'1px solid rgba(0,0,0,0.05)',paddingTop:10,marginTop:4}}>
                  {podeResponder && !editando && m.status === 'aberta' && (
                    <button onClick={()=>iniciarResposta(m)}
                      style={{fontSize:12,padding:'5px 12px',borderRadius:6,border:'1px solid var(--gold)',background:'var(--gold-soft)',color:'var(--gold)',cursor:'pointer',fontFamily:'DM Sans,sans-serif',fontWeight:600}}>
                      💬 Responder / Marcar status
                    </button>
                  )}
                  {podeResponder && !editando && m.status !== 'aberta' && (
                    <>
                      <button onClick={()=>iniciarResposta(m)}
                        style={{fontSize:12,padding:'5px 12px',borderRadius:6,border:'1px solid var(--border)',background:'#fff',color:'var(--text-muted)',cursor:'pointer',fontFamily:'DM Sans,sans-serif'}}>
                        ✏️ Editar resposta
                      </button>
                      <button onClick={()=>reabrir(m)}
                        style={{fontSize:12,padding:'5px 12px',borderRadius:6,border:'1px solid var(--border)',background:'#fff',color:'var(--text-muted)',cursor:'pointer',fontFamily:'DM Sans,sans-serif'}}>
                        🔄 Reabrir
                      </button>
                    </>
                  )}
                  {(ehMeu || isAdmin) && (
                    <button onClick={()=>excluir(m)}
                      style={{fontSize:12,padding:'5px 12px',borderRadius:6,border:'1px solid var(--border)',background:'#fff',color:'var(--red)',cursor:'pointer',fontFamily:'DM Sans,sans-serif',marginLeft:'auto'}}>
                      🗑 Excluir
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
