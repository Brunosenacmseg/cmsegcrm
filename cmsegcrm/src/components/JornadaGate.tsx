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

  // Auto-inicia a jornada do dia silenciosamente quando ainda não existe.
  useEffect(() => {
    if (iniciada !== false || iniciando) return
    iniciar()
  }, [iniciada])

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

  // A jornada é iniciada automaticamente em background; não bloqueia mais a UI.
  return <>{children}</>
}
