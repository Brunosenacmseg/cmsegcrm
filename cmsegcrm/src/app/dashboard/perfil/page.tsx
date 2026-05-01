'use client'
import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function PerfilPage() {
  const supabase = createClient()
  const fotoRef  = useRef<HTMLInputElement>(null)

  const [profile, setProfile]     = useState<any>(null)
  const [loading, setLoading]     = useState(true)
  const [salvando, setSalvando]   = useState(false)
  const [uploadingFoto, setUploadingFoto] = useState(false)
  const [msg, setMsg]             = useState('')
  const [msgType, setMsgType]     = useState<'ok'|'err'>('ok')
  const [senhaAtual, setSenhaAtual]   = useState('')
  const [novaSenha, setNovaSenha]     = useState('')
  const [confSenha, setConfSenha]     = useState('')
  const [salvandoSenha, setSalvandoSenha] = useState(false)
  const [msgSenha, setMsgSenha]   = useState('')

  const [form, setForm] = useState({
    nome: '', telefone: '', email: '',
  })

  useEffect(() => { init() }, [])

  async function init() {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: prof } = await supabase.from('users').select('*').eq('id', user?.id||'').single()
    setProfile(prof)
    setForm({
      nome:     prof?.nome     || user?.user_metadata?.nome || '',
      telefone: prof?.telefone || '',
      email:    user?.email    || '',
    })
    setLoading(false)
  }

  async function salvarPerfil() {
    setSalvando(true)
    setMsg('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      // Atualizar tabela users
      const { error } = await supabase.from('users').update({
        nome:     form.nome,
        telefone: form.telefone,
      }).eq('id', user?.id||'')

      if (error) throw error

      // Atualizar metadata do auth
      await supabase.auth.updateUser({ data: { nome: form.nome } })

      setMsg('✅ Perfil atualizado com sucesso!')
      setMsgType('ok')
      await init()
    } catch (err: any) {
      setMsg('❌ Erro: ' + err.message)
      setMsgType('err')
    }
    setSalvando(false)
    setTimeout(() => setMsg(''), 4000)
  }

  async function uploadFoto(file: File) {
    setUploadingFoto(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const ext  = file.name.split('.').pop()
      const path = `avatars/${user?.id}.${ext}`

      const { error: upErr } = await supabase.storage.from('cmsegcrm').upload(path, file, { contentType: file.type, upsert: true })
      if (upErr) throw upErr

      const { data: url } = supabase.storage.from('cmsegcrm').getPublicUrl(path)
      const publicUrl = url.publicUrl + '?t=' + Date.now()

      await supabase.from('users').update({ avatar_url: publicUrl }).eq('id', user?.id||'')
      await init()
      setMsg('✅ Foto atualizada!')
      setMsgType('ok')
    } catch (err: any) {
      setMsg('❌ Erro ao enviar foto: ' + err.message)
      setMsgType('err')
    }
    setUploadingFoto(false)
    setTimeout(() => setMsg(''), 4000)
  }

  async function alterarSenha() {
    if (!novaSenha || novaSenha !== confSenha) { setMsgSenha('❌ As senhas não coincidem'); return }
    if (novaSenha.length < 6) { setMsgSenha('❌ Mínimo 6 caracteres'); return }
    setSalvandoSenha(true)
    setMsgSenha('')
    const { error } = await supabase.auth.updateUser({ password: novaSenha })
    if (error) { setMsgSenha('❌ ' + error.message) }
    else { setMsgSenha('✅ Senha alterada com sucesso!'); setSenhaAtual(''); setNovaSenha(''); setConfSenha('') }
    setSalvandoSenha(false)
    setTimeout(() => setMsgSenha(''), 4000)
  }

  const roleCor: Record<string,string> = { admin:'var(--red)', lider:'var(--gold)', corretor:'var(--teal)' }
  const roleLabel: Record<string,string> = { admin:'Administrador', lider:'Líder', corretor:'Corretor' }
  const inp: React.CSSProperties = { width:'100%', background:'rgba(255,255,255,0.05)', border:'1px solid var(--border)', borderRadius:8, padding:'9px 14px', color:'var(--text)', fontSize:13, fontFamily:'DM Sans,sans-serif', outline:'none', boxSizing:'border-box' as const }

  if (loading) return <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',color:'var(--text-muted)'}}>Carregando...</div>

  const initials = (form.nome||profile?.email||'?').split(' ').map((w:string)=>w[0]).join('').slice(0,2).toUpperCase()

  return (
    <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
      <div style={{height:56,borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',padding:'0 28px',background:'var(--bg-soft)',backdropFilter:'blur(8px)',flexShrink:0}}>
        <div style={{fontFamily:'DM Serif Display,serif',fontSize:18}}>👤 Meu Perfil</div>
      </div>

      <div style={{flex:1,overflow:'auto',padding:'28px'}}>
        <div style={{maxWidth:640,margin:'0 auto',display:'flex',flexDirection:'column',gap:20}}>

          {/* Card foto + info */}
          <div className="card" style={{padding:'24px 28px'}}>
            <div style={{display:'flex',alignItems:'center',gap:24,marginBottom:24}}>
              {/* Avatar */}
              <div style={{position:'relative',flexShrink:0}}>
                <div style={{width:88,height:88,borderRadius:'50%',overflow:'hidden',border:'3px solid var(--gold)',display:'flex',alignItems:'center',justifyContent:'center',background:`linear-gradient(135deg,${roleCor[profile?.role]||'var(--teal)'},var(--navy))`}}>
                  {profile?.avatar_url ? (
                    <img src={profile.avatar_url} alt="foto" style={{width:'100%',height:'100%',objectFit:'cover'}} />
                  ) : (
                    <span style={{fontSize:28,fontWeight:700,color:'#fff'}}>{initials}</span>
                  )}
                </div>
                <button onClick={()=>fotoRef.current?.click()} disabled={uploadingFoto}
                  style={{position:'absolute',bottom:0,right:0,width:28,height:28,borderRadius:'50%',background:'var(--gold)',border:'2px solid #0a1628',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',fontSize:13}}>
                  {uploadingFoto ? '⏳' : '📷'}
                </button>
                <input ref={fotoRef} type="file" accept="image/*" style={{display:'none'}} onChange={e=>e.target.files?.[0]&&uploadFoto(e.target.files[0])} />
              </div>

              <div>
                <div style={{fontFamily:'DM Serif Display,serif',fontSize:20,marginBottom:4}}>{form.nome||'—'}</div>
                <div style={{fontSize:12,padding:'3px 12px',borderRadius:12,background:`${roleCor[profile?.role]||'var(--teal)'}20`,color:roleCor[profile?.role]||'var(--teal)',display:'inline-block',fontWeight:600,marginBottom:6}}>
                  {roleLabel[profile?.role]||profile?.role||'—'}
                </div>
                <div style={{fontSize:12,color:'var(--text-muted)'}}>{profile?.email}</div>
                {profile?.ramal_goto && <div style={{fontSize:12,color:'var(--gold)',marginTop:4}}>📞 Ramal {profile.ramal_goto}</div>}
              </div>
            </div>

            {msg && (
              <div style={{marginBottom:16,padding:'10px 14px',background:msgType==='ok'?'rgba(28,181,160,0.1)':'rgba(224,82,82,0.1)',border:`1px solid ${msgType==='ok'?'rgba(28,181,160,0.3)':'rgba(224,82,82,0.3)'}`,borderRadius:8,fontSize:13,color:msgType==='ok'?'var(--teal)':'var(--red)'}}>
                {msg}
              </div>
            )}

            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
              <div style={{gridColumn:'1/-1'}}>
                <label style={{fontSize:12,color:'var(--text-muted)',display:'block',marginBottom:4}}>Nome completo</label>
                <input value={form.nome} onChange={e=>setForm(f=>({...f,nome:e.target.value}))} placeholder="Seu nome completo" style={inp} />
              </div>
              <div>
                <label style={{fontSize:12,color:'var(--text-muted)',display:'block',marginBottom:4}}>Telefone</label>
                <input value={form.telefone} onChange={e=>setForm(f=>({...f,telefone:e.target.value}))} placeholder="(00) 00000-0000" style={inp} />
              </div>
              <div>
                <label style={{fontSize:12,color:'var(--text-muted)',display:'block',marginBottom:4}}>E-mail</label>
                <input value={form.email} disabled style={{...inp,opacity:0.5,cursor:'not-allowed'}} />
              </div>
            </div>

            <div style={{display:'flex',justifyContent:'flex-end',marginTop:16}}>
              <button className="btn-primary" onClick={salvarPerfil} disabled={salvando} style={{minWidth:140}}>
                {salvando?'Salvando...':'✓ Salvar perfil'}
              </button>
            </div>
          </div>

          {/* Card alterar senha */}
          <div className="card" style={{padding:'24px 28px'}}>
            <div style={{fontFamily:'DM Serif Display,serif',fontSize:16,marginBottom:16}}>🔒 Alterar senha</div>

            {msgSenha && (
              <div style={{marginBottom:14,padding:'10px 14px',background:msgSenha.includes('✅')?'rgba(28,181,160,0.1)':'rgba(224,82,82,0.1)',border:`1px solid ${msgSenha.includes('✅')?'rgba(28,181,160,0.3)':'rgba(224,82,82,0.3)'}`,borderRadius:8,fontSize:13,color:msgSenha.includes('✅')?'var(--teal)':'var(--red)'}}>
                {msgSenha}
              </div>
            )}

            <div style={{display:'flex',flexDirection:'column',gap:12}}>
              <div>
                <label style={{fontSize:12,color:'var(--text-muted)',display:'block',marginBottom:4}}>Nova senha</label>
                <input type="password" value={novaSenha} onChange={e=>setNovaSenha(e.target.value)} placeholder="Mínimo 6 caracteres" style={inp} />
              </div>
              <div>
                <label style={{fontSize:12,color:'var(--text-muted)',display:'block',marginBottom:4}}>Confirmar nova senha</label>
                <input type="password" value={confSenha} onChange={e=>setConfSenha(e.target.value)} placeholder="Repita a senha" style={inp} />
              </div>
            </div>

            <div style={{display:'flex',justifyContent:'flex-end',marginTop:16}}>
              <button className="btn-primary" onClick={alterarSenha} disabled={salvandoSenha||!novaSenha||!confSenha} style={{minWidth:140}}>
                {salvandoSenha?'Alterando...':'🔒 Alterar senha'}
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
