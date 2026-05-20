'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const STORAGE_KEY = 'cm_alerta_metas_lider_dia'

type Abaixo = {
  user_id: string
  nome: string
  meta: number
  esperado: number
  atual: number
}

function calcEsperado(periodoIni: string, periodoFim: string, valorMeta: number): number {
  const ini = new Date(periodoIni + 'T00:00:00')
  const fim = new Date(periodoFim + 'T23:59:59')
  const hoje = new Date()
  const msDia = 1000 * 60 * 60 * 24
  const totalDias = Math.max(1, Math.round((fim.getTime() - ini.getTime()) / msDia) + 1)
  const refDia = hoje < ini ? ini : hoje > fim ? fim : hoje
  const diasPassados = Math.max(0, Math.round((refDia.getTime() - ini.getTime()) / msDia) + 1)
  return (valorMeta / totalDias) * Math.min(diasPassados, totalDias)
}

export default function AlertaMetasLider({ visivel }: { visivel: boolean }) {
  const supabase = createClient()
  const [aberto, setAberto] = useState(false)
  const [abaixo, setAbaixo] = useState<Abaixo[]>([])

  useEffect(() => {
    if (!visivel) return
    const hoje = new Date().toISOString().slice(0, 10)
    try { if (localStorage.getItem(STORAGE_KEY) === hoje) return } catch {}
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: prof } = await supabase.from('users').select('id,role').eq('id', user.id).single()
      if (!prof || (prof.role !== 'lider' && prof.role !== 'admin')) return

      // Membros visíveis: admin vê todos vendedores; líder vê membros das equipes que lidera
      let memberIds: string[] = []
      if (prof.role === 'admin') {
        const { data: us } = await supabase.from('users').select('id').neq('role', 'admin')
        memberIds = (us || []).map((u: any) => u.id)
      } else {
        const { data: eqs } = await supabase.from('equipes').select('id').eq('lider_id', user.id)
        const eqIds = (eqs || []).map((e: any) => e.id)
        if (eqIds.length) {
          const { data: mems } = await supabase.from('equipe_membros').select('user_id').in('equipe_id', eqIds)
          memberIds = (mems || []).map((m: any) => m.user_id)
        }
      }
      if (!memberIds.length) return

      const { data: metas } = await supabase
        .from('metas')
        .select('user_id, valor_meta, valor_atual, periodo_inicio, periodo_fim, tipo, users!metas_user_id_fkey(nome)')
        .eq('status', 'ativa')
        .eq('tipo', 'premio')
        .in('user_id', memberIds)

      const lista: Abaixo[] = []
      for (const m of (metas || []) as any[]) {
        const esperado = calcEsperado(m.periodo_inicio, m.periodo_fim, Number(m.valor_meta || 0))
        const atual = Number(m.valor_atual || 0)
        if (atual < esperado) {
          lista.push({
            user_id: m.user_id,
            nome: m['users!metas_user_id_fkey']?.nome || 'Sem nome',
            meta: Number(m.valor_meta || 0),
            esperado,
            atual,
          })
        }
      }
      if (lista.length) {
        lista.sort((a, b) => (a.atual / Math.max(a.esperado, 1)) - (b.atual / Math.max(b.esperado, 1)))
        setAbaixo(lista)
        setAberto(true)
      }
    })().catch(e => console.error('[AlertaMetasLider]', e))
  }, [visivel])

  function fechar() {
    try { localStorage.setItem(STORAGE_KEY, new Date().toISOString().slice(0, 10)) } catch {}
    setAberto(false)
  }

  if (!aberto) return null

  const fmt = (n: number) => 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  return (
    <div onClick={fechar} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)',
      zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--bg)', border: '1px solid var(--red)', borderRadius: 14,
        width: 'min(640px, 100%)', maxHeight: '90vh', overflow: 'auto', padding: 28,
        fontFamily: 'Open Sans, sans-serif', position: 'relative', boxShadow: 'var(--shadow-lg)',
      }}>
        <button onClick={fechar} aria-label="Fechar" style={{
          position: 'absolute', top: 14, right: 14, background: 'none', border: 'none',
          color: 'var(--text-muted)', fontSize: 18, cursor: 'pointer', lineHeight: 1,
        }}>✕</button>

        <div style={{ fontSize: 34, marginBottom: 6 }}>⚠️</div>
        <div style={{ fontFamily: 'DM Serif Display, serif', fontSize: 22, marginBottom: 4, color: 'var(--red)', fontWeight: 700 }}>
          VENDEDORES ABAIXO DA META
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 18 }}>
          Valor esperado calculado proporcionalmente aos dias decorridos do período da meta.
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {abaixo.map(v => {
            const falta = v.esperado - v.atual
            return (
              <div key={v.user_id} style={{
                border: '1px solid rgba(224,82,82,0.35)', borderRadius: 10,
                padding: '12px 14px', background: 'rgba(224,82,82,0.06)',
              }}>
                <div style={{ color: 'var(--red)', fontWeight: 700, fontSize: 15, marginBottom: 6 }}>
                  {v.nome}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, fontSize: 12 }}>
                  <div>
                    <div style={{ color: 'var(--text-muted)' }}>Esperado</div>
                    <div style={{ fontWeight: 600 }}>{fmt(v.esperado)}</div>
                  </div>
                  <div>
                    <div style={{ color: 'var(--text-muted)' }}>Realizado</div>
                    <div style={{ fontWeight: 600, color: 'var(--red)' }}>{fmt(v.atual)}</div>
                  </div>
                  <div>
                    <div style={{ color: 'var(--text-muted)' }}>Diferença</div>
                    <div style={{ fontWeight: 600, color: 'var(--red)' }}>−{fmt(falta)}</div>
                  </div>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                  Meta total do período: {fmt(v.meta)}
                </div>
              </div>
            )
          })}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
          <button onClick={fechar} style={{
            padding: '10px 18px', borderRadius: 8, border: '1px solid var(--border)',
            background: 'var(--gold)', color: 'var(--navy)', fontSize: 13, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'Open Sans, sans-serif',
          }}>Entendi</button>
        </div>
      </div>
    </div>
  )
}
