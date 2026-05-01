'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const supabase = createClient()
  const [email, setEmail]     = useState('')
  const [senha, setSenha]     = useState('')
  const [erro, setErro]       = useState('')
  const [loading, setLoading] = useState(false)
  const [modo, setModo]       = useState<'login'|'cadastro'>('login')
  const [nome, setNome]       = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    setLoading(true)

    if (modo === 'cadastro') {
      const { error } = await supabase.auth.signUp({
        email, password: senha,
        options: { data: { nome } }
      })
      if (error) { setErro(error.message); setLoading(false); return }
      // Após cadastro, tenta login direto
      const { error: errLogin } = await supabase.auth.signInWithPassword({ email, password: senha })
      if (!errLogin) { window.location.replace('/dashboard'); return }
      setErro('Verifique seu e-mail para confirmar o cadastro.')
      setLoading(false)
      return
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email, password: senha })
    if (error || !data.session) {
      setErro('E-mail ou senha incorretos.')
      setLoading(false)
      return
    }
    window.location.replace('/dashboard')
  }

  return (
    <div style={{
      minHeight:'100vh', background:'var(--navy)', display:'flex',
      alignItems:'center', justifyContent:'center',
      backgroundImage:'radial-gradient(ellipse 60% 50% at 80% 10%, rgba(201,168,76,0.07) 0%, transparent 60%), radial-gradient(ellipse 50% 60% at 10% 80%, rgba(28,181,160,0.06) 0%, transparent 60%)'
    }}>
      <div className="fade-up" style={{width:'100%', maxWidth:420, padding:'0 20px'}}>
        <div style={{textAlign:'center', marginBottom:36}}>
          <div style={{fontFamily:'DM Serif Display, serif', fontSize:32, color:'var(--gold)', marginBottom:4}}>
            CM Seguros
          </div>
          <div style={{fontSize:12, color:'var(--text-muted)', letterSpacing:1, textTransform:'uppercase'}}>
            Transformando vidas através do seguro
          </div>
        </div>

        <div className="card" style={{padding:'32px 36px'}}>
          <div style={{fontFamily:'DM Serif Display, serif', fontSize:20, marginBottom:24, color:'var(--text)'}}>
            {modo === 'login' ? 'Entrar na conta' : 'Criar conta'}
          </div>

          <form onSubmit={handleSubmit}>
            {modo === 'cadastro' && (
              <div style={{marginBottom:16}}>
                <label className="label">Nome completo</label>
                <input className="input" type="text" placeholder="Seu nome"
                  value={nome} onChange={e => setNome(e.target.value)} required />
              </div>
            )}
            <div style={{marginBottom:16}}>
              <label className="label">E-mail</label>
              <input className="input" type="email" placeholder="seu@email.com"
                value={email} onChange={e => setEmail(e.target.value)} required />
            </div>
            <div style={{marginBottom:24}}>
              <label className="label">Senha</label>
              <input className="input" type="password" placeholder="••••••••"
                value={senha} onChange={e => setSenha(e.target.value)} required minLength={6} />
            </div>

            {erro && (
              <div style={{
                background:'rgba(224,82,82,0.1)', border:'1px solid rgba(224,82,82,0.3)',
                borderRadius:8, padding:'10px 14px', marginBottom:16,
                fontSize:13, color:'var(--red)'
              }}>{erro}</div>
            )}

            <button className="btn-primary" type="submit" disabled={loading}
              style={{width:'100%', padding:'12px', fontSize:14}}>
              {loading ? 'Aguarde...' : (modo === 'login' ? 'Entrar' : 'Criar conta')}
            </button>
          </form>

          <div style={{textAlign:'center', marginTop:20, fontSize:13, color:'var(--text-muted)'}}>
            {modo === 'login' ? 'Não tem conta?' : 'Já tem conta?'}{' '}
            <span style={{color:'var(--gold)', cursor:'pointer'}}
              onClick={() => { setModo(modo==='login'?'cadastro':'login'); setErro('') }}>
              {modo === 'login' ? 'Criar conta' : 'Entrar'}
            </span>
          </div>
        </div>

        <div style={{textAlign:'center', marginTop:20, fontSize:11, color:'var(--text-muted)'}}>
          Acesso restrito a corretores da equipe
        </div>
      </div>
    </div>
  )
}
