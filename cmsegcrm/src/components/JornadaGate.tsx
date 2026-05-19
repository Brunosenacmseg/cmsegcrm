'use client'
import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

/**
 * Bloqueia o acesso a qualquer rota /dashboard/* (exceto /dashboard/mural)
 * enquanto o usuário não clicar em "Iniciar trabalho" no dia.
 *
 * Comportamento:
 * - Verifica se há jornada do dia (iniciada_em >= 00:00 hoje, encerrada_em null)
 * - Se não tem e está fora do mural -> router.replace('/dashboard/mural')
 * - Renderiza banner com botão "Iniciar trabalho" enquanto jornada não iniciada
 * - Agenda signOut automático à meia-noite local
 */
export default function JornadaGate({ children, userId }: { children: React.ReactNode; userId: string | null }) {
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()
  const [iniciada, setIniciada] = useState<boolean | null>(null)
  const [iniciando, setIniciando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  // Verifica jornada do dia
  useEffect(() => {
    if (!userId) { setIniciada(null); return }
    let cancelled = false
    // Fallback: se a query não responder em 4s, assume jornada não iniciada
    // para o usuário não ficar preso em "Carregando…" indefinidamente.
    const fallback = setTimeout(() => {
      if (!cancelled) setIniciada(prev => prev === null ? false : prev)
    }, 4000)
    ;(async () => {
      try {
        const hoje = new Date(); hoje.setHours(0,0,0,0)
        const { data, error } = await supabase
          .from('jornadas')
          .select('id')
          .eq('user_id', userId)
          .gte('iniciada_em', hoje.toISOString())
          .is('encerrada_em', null)
          .limit(1)
        if (cancelled) return
        if (error) { setIniciada(false); return }
        setIniciada(!!(data && data.length > 0))
      } catch {
        if (!cancelled) setIniciada(false)
      }
    })()
    return () => { cancelled = true; clearTimeout(fallback) }
  }, [userId])

  // Redireciona quem não iniciou jornada e tenta ir para outras rotas
  useEffect(() => {
    if (iniciada === null) return
    if (!iniciada && pathname && !pathname.startsWith('/dashboard/mural') && pathname.startsWith('/dashboard')) {
      router.replace('/dashboard/mural')
    }
  }, [iniciada, pathname, router])

  // Logoff automático à meia-noite local
  useEffect(() => {
    if (!userId) return
    const agora = new Date()
    const meiaNoite = new Date(agora)
    meiaNoite.setHours(24, 0, 5, 0) // 00:00:05 do próximo dia
    const ms = meiaNoite.getTime() - agora.getTime()
    if (ms <= 0) return
    const t = setTimeout(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        await fetch('/api/jornadas/encerrar-todas', {
          method: 'POST',
          headers: { 'Content-Type':'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
        })
      } catch {}
      await supabase.auth.signOut()
      window.location.replace('/login')
    }, ms)
    return () => clearTimeout(t)
  }, [userId])

  async function iniciar() {
    setIniciando(true); setErro(null)
    try {
      let coords: { lat?: number; lng?: number; accuracy_m?: number } = {}
      if (typeof navigator !== 'undefined' && navigator.geolocation) {
        try {
          const pos = await new Promise<GeolocationPosition>((res, rej) => {
            navigator.geolocation.getCurrentPosition(res, rej, { timeout: 8000, maximumAge: 60000 })
          })
          coords = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy_m: pos.coords.accuracy }
        } catch {/* sem geolocation — segue sem coords */}
      }
      const { data: { session } } = await supabase.auth.getSession()
      const r = await fetch('/api/jornadas/iniciar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
        body: JSON.stringify(coords),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Falha ao iniciar jornada')
      setIniciada(true)
    } catch (e: any) {
      setErro(String(e?.message || e))
    } finally {
      setIniciando(false)
    }
  }

  if (iniciada === null) {
    return <div style={{padding:40,textAlign:'center',color:'var(--text-muted)'}}>Carregando…</div>
  }

  // Banner em cima do mural quando jornada não iniciada
  if (!iniciada && pathname?.startsWith('/dashboard/mural')) {
    return (
      <>
        <div style={{padding:'32px 24px',maxWidth:720,margin:'24px auto 0',background:'#fff',border:'1px solid var(--border-soft)',borderRadius:14,boxShadow:'var(--shadow-md)',textAlign:'center'}}>
          <div style={{fontSize:42,marginBottom:10}}>⏱️</div>
          <h2 style={{fontFamily:'DM Serif Display,serif',fontSize:22,color:'var(--text)',marginBottom:18}}>Bom dia! Vamos começar?</h2>
          <button onClick={iniciar} disabled={iniciando}
            style={{background:'var(--teal)',color:'#fff',border:'none',padding:'12px 28px',borderRadius:10,fontSize:14,fontWeight:700,cursor:'pointer',opacity:iniciando?0.6:1}}>
            {iniciando ? 'Registrando…' : '▶ Iniciar trabalho'}
          </button>
          {erro && <div style={{marginTop:10,color:'var(--red)',fontSize:12}}>{erro}</div>}
        </div>
        <div style={{opacity:0.35,pointerEvents:'none',marginTop:24}}>
          {children}
        </div>
      </>
    )
  }

  // Caso fora do mural sem jornada, o effect já redireciona
  if (!iniciada) {
    return <div style={{padding:40,textAlign:'center',color:'var(--text-muted)'}}>Redirecionando para iniciar a jornada…</div>
  }

  return <>{children}</>
}
