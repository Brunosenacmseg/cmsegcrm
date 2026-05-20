'use client'
import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

/**
 * Toda quinta-feira, bloqueia o acesso ao sistema para líderes enquanto
 * não houver avaliação semanal registrada para TODOS os colaboradores
 * das equipes que ele lidera. A avaliação considera o registro em
 * gestao_equipe_avaliacoes com data >= início da semana atual (segunda).
 */
export default function AvaliacaoSemanalGate({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const router = useRouter()
  const pathname = usePathname()
  const [estado, setEstado] = useState<'carregando' | 'ok' | 'bloqueado'>('carregando')
  const [pendentes, setPendentes] = useState<{ id: string; nome: string }[]>([])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { if (!cancelled) setEstado('ok'); return }
        const { data: prof } = await supabase.from('users').select('id, role').eq('id', user.id).single()
        if (!prof || prof.role !== 'lider') { if (!cancelled) setEstado('ok'); return }

        const hoje = new Date()
        // Só ativa nas quintas-feiras (0=domingo, 4=quinta)
        if (hoje.getDay() !== 4) { if (!cancelled) setEstado('ok'); return }

        // Início da semana (segunda-feira 00:00)
        const dia = hoje.getDay()
        const offsetSegunda = (dia + 6) % 7
        const segunda = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - offsetSegunda)
        const segundaStr = segunda.toISOString().slice(0, 10)

        // Equipes lideradas
        const { data: eqs } = await supabase.from('equipes').select('id').eq('lider_id', user.id)
        const eqIds = (eqs || []).map((e: any) => e.id)
        if (!eqIds.length) { if (!cancelled) setEstado('ok'); return }

        // Membros únicos
        const { data: mems } = await supabase.from('equipe_membros').select('user_id').in('equipe_id', eqIds)
        const memberIds = Array.from(new Set((mems || []).map((m: any) => m.user_id)))
        if (!memberIds.length) { if (!cancelled) setEstado('ok'); return }

        // Avaliações da semana feitas pelo líder
        const { data: avs } = await supabase.from('gestao_equipe_avaliacoes')
          .select('colaborador_id')
          .eq('lider_id', user.id)
          .gte('data', segundaStr)
        const avaliados = new Set((avs || []).map((a: any) => a.colaborador_id))

        const faltam = memberIds.filter(id => !avaliados.has(id))
        if (!faltam.length) { if (!cancelled) setEstado('ok'); return }

        // Nomes dos pendentes
        const { data: usrs } = await supabase.from('users').select('id, nome, email').in('id', faltam)
        const lista = (usrs || []).map((u: any) => ({ id: u.id, nome: u.nome || u.email || 'Colaborador' }))
        if (!cancelled) { setPendentes(lista); setEstado('bloqueado') }
      } catch (e) {
        console.error('[AvaliacaoSemanalGate]', e)
        if (!cancelled) setEstado('ok')
      }
    })()
    return () => { cancelled = true }
  }, [pathname])

  useEffect(() => {
    if (estado === 'bloqueado' && pathname && !pathname.startsWith('/dashboard/gestao-equipe')) {
      router.replace('/dashboard/gestao-equipe')
    }
  }, [estado, pathname, router])

  if (estado === 'carregando') return <>{children}</>
  if (estado === 'ok') return <>{children}</>

  // bloqueado: mostra overlay sobre o módulo de gestão-equipe (ou outras telas)
  return (
    <>
      {pathname?.startsWith('/dashboard/gestao-equipe') ? children : null}
      <div style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(4px)',
        zIndex: 1400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        pointerEvents: pathname?.startsWith('/dashboard/gestao-equipe') ? 'none' : 'auto',
      }}>
        <div style={{
          background: 'var(--bg)', border: '1px solid var(--red)', borderRadius: 14,
          width: 'min(560px, 100%)', padding: 28, fontFamily: 'Open Sans, sans-serif',
          boxShadow: 'var(--shadow-lg)', pointerEvents: 'auto',
        }}>
          <div style={{ fontSize: 32, marginBottom: 6 }}>⏰</div>
          <div style={{ fontFamily: 'DM Serif Display, serif', fontSize: 22, marginBottom: 6, color: 'var(--red)', fontWeight: 700 }}>
            AVALIAÇÃO SEMANAL PENDENTE
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.55 }}>
            Toda quinta-feira você precisa registrar a avaliação semanal de todos os colaboradores
            das suas equipes para liberar o acesso ao sistema.
          </div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--red)', marginBottom: 8 }}>
            COLABORADORES PENDENTES ({pendentes.length}):
          </div>
          <div style={{
            background: 'rgba(224,82,82,0.06)', border: '1px solid rgba(224,82,82,0.35)',
            borderRadius: 8, padding: '10px 12px', maxHeight: 240, overflow: 'auto', marginBottom: 18,
          }}>
            {pendentes.map(p => (
              <div key={p.id} style={{ color: 'var(--red)', fontWeight: 700, fontSize: 13, padding: '3px 0' }}>
                • {p.nome}
              </div>
            ))}
          </div>
          <button onClick={() => router.replace('/dashboard/gestao-equipe')} style={{
            width: '100%', padding: '12px 18px', borderRadius: 10, border: '1px solid var(--gold)',
            background: 'var(--gold)', color: 'var(--navy)', fontSize: 14, fontWeight: 700,
            cursor: 'pointer', fontFamily: 'Open Sans, sans-serif',
          }}>
            Ir para Gestão de Equipe →
          </button>
        </div>
      </div>
    </>
  )
}
