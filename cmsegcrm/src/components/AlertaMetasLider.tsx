'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const STORAGE_KEY = 'cm_alerta_metas_sessao'

type Abaixo = {
  user_id: string
  nome: string
  meta: number
  esperado: number
  atual: number
}

type EquipeBloco = {
  equipe_id: string
  equipe_nome: string
  esperado: number
  atual: number
  abaixo: Abaixo[]
}

type Dados = {
  role: string
  nomeUsuario: string
  esperadoUser: number
  atualUser: number
  equipes: EquipeBloco[]
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

const fmt = (n: number) => 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function AlertaMetasLider() {
  const supabase = createClient()
  const [aberto, setAberto] = useState(false)
  const [dados, setDados] = useState<Dados | null>(null)

  useEffect(() => {
    try { if (sessionStorage.getItem(STORAGE_KEY) === '1') return } catch {}
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: prof } = await supabase.from('users').select('id,nome,role,email').eq('id', user.id).single()
      if (!prof) return

      const ehLider = prof.role === 'lider' || prof.role === 'admin'

      const hoje = new Date()
      const mesIni = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().slice(0, 10)
      const mesFim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).toISOString().slice(0, 10) + 'T23:59:59'

      // Próprias
      const { data: metasProprias } = await supabase
        .from('metas')
        .select('valor_meta, valor_atual, periodo_inicio, periodo_fim')
        .eq('status', 'ativa').eq('tipo', 'premio').eq('user_id', prof.id)
      const esperadoUser = (metasProprias || []).reduce(
        (s: number, m: any) => s + calcEsperado(m.periodo_inicio, m.periodo_fim, Number(m.valor_meta || 0)), 0)
      const { data: vendasProprias } = await supabase
        .from('negocios').select('premio')
        .eq('vendedor_id', prof.id).eq('status', 'ganho')
        .gte('data_fechamento', mesIni).lte('data_fechamento', mesFim)
      const atualUser = (vendasProprias || []).reduce((s: number, n: any) => s + Number(n.premio || 0), 0)

      const base: Dados = {
        role: prof.role,
        nomeUsuario: prof.nome || prof.email || 'Usuário',
        esperadoUser,
        atualUser,
        equipes: [],
      }

      if (ehLider) {
        // Equipes lideradas (admin vê todas as equipes)
        let qEqs: any = supabase.from('equipes').select('id, nome').order('nome')
        if (prof.role !== 'admin') qEqs = qEqs.eq('lider_id', user.id)
        const { data: equipes } = await qEqs
        const equipesList = (equipes || []) as any[]
        const allEqIds = equipesList.map(e => e.id)

        // Membros por equipe
        let mems: any[] = []
        if (allEqIds.length) {
          const { data: m } = await supabase.from('equipe_membros').select('equipe_id, user_id').in('equipe_id', allEqIds)
          mems = m || []
        }

        // Membros únicos
        const allMemberIds = Array.from(new Set(mems.map(m => m.user_id)))

        // Nomes
        const nomePorUser: Record<string, string> = {}
        if (allMemberIds.length) {
          const { data: usersEq } = await supabase.from('users').select('id, nome, email').in('id', allMemberIds)
          for (const u of (usersEq || []) as any[]) {
            nomePorUser[u.id] = u.nome || u.email || `Usuário ${u.id.slice(0, 6)}`
          }
        }

        // Metas + vendas dos membros
        const { data: metasEq } = allMemberIds.length
          ? await supabase.from('metas')
              .select('user_id, valor_meta, valor_atual, periodo_inicio, periodo_fim')
              .eq('status', 'ativa').eq('tipo', 'premio').in('user_id', allMemberIds)
          : { data: [] as any[] }
        const { data: vendasEq } = allMemberIds.length
          ? await supabase.from('negocios').select('vendedor_id, premio')
              .in('vendedor_id', allMemberIds).eq('status', 'ganho')
              .gte('data_fechamento', mesIni).lte('data_fechamento', mesFim)
          : { data: [] as any[] }

        const realizadoPorUser: Record<string, number> = {}
        for (const v of (vendasEq || []) as any[]) {
          if (!v.vendedor_id) continue
          realizadoPorUser[v.vendedor_id] = (realizadoPorUser[v.vendedor_id] || 0) + Number(v.premio || 0)
        }
        const esperadoPorUser: Record<string, { esperado: number; meta: number }> = {}
        for (const m of (metasEq || []) as any[]) {
          const e = calcEsperado(m.periodo_inicio, m.periodo_fim, Number(m.valor_meta || 0))
          const entry = esperadoPorUser[m.user_id] || { esperado: 0, meta: 0 }
          entry.esperado += e
          entry.meta += Number(m.valor_meta || 0)
          esperadoPorUser[m.user_id] = entry
        }

        // Bloco por equipe
        for (const eq of equipesList) {
          const membros = mems.filter(m => m.equipe_id === eq.id).map(m => m.user_id)
          let esperadoTot = 0, atualTot = 0
          const abaixo: Abaixo[] = []
          for (const uid of membros) {
            const e = esperadoPorUser[uid]?.esperado || 0
            const meta = esperadoPorUser[uid]?.meta || 0
            const atual = realizadoPorUser[uid] || 0
            esperadoTot += e
            atualTot += atual
            if (e > 0 && atual < e) {
              abaixo.push({ user_id: uid, nome: nomePorUser[uid] || 'Sem nome', meta, esperado: e, atual })
            }
          }
          abaixo.sort((a, b) => (b.esperado - b.atual) - (a.esperado - a.atual))
          base.equipes.push({
            equipe_id: eq.id, equipe_nome: eq.nome,
            esperado: esperadoTot, atual: atualTot, abaixo,
          })
        }
      }

      setDados(base)
      setAberto(true)
    })().catch(e => console.error('[AlertaMetas]', e))
  }, [])

  function fechar() {
    try { sessionStorage.setItem(STORAGE_KEY, '1') } catch {}
    setAberto(false)
  }

  if (!aberto || !dados) return null

  const diffUser = dados.esperadoUser - dados.atualUser
  const userAbaixo = diffUser > 0 && dados.esperadoUser > 0
  const ehLider = dados.role === 'lider' || dados.role === 'admin'

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(4px)',
      zIndex: 1500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div style={{
        background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 14,
        width: 'min(680px, 100%)', maxHeight: '90vh', overflow: 'auto', padding: 28,
        fontFamily: 'Open Sans, sans-serif', boxShadow: 'var(--shadow-lg)',
      }}>
        <div style={{ fontSize: 30, marginBottom: 6 }}>🎯</div>
        <div style={{ fontFamily: 'DM Serif Display, serif', fontSize: 22, marginBottom: 4 }}>
          Olá, {dados.nomeUsuario.split(' ')[0]}!
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 18 }}>
          Acompanhamento do seu progresso no mês.
        </div>

        <div style={{
          border: `1px solid ${userAbaixo ? 'rgba(224,82,82,0.35)' : 'var(--border)'}`,
          borderRadius: 10, padding: '14px 16px', marginBottom: 14,
          background: userAbaixo ? 'rgba(224,82,82,0.06)' : 'var(--bg-soft)',
        }}>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 4 }}>Sua meta esperada até o dia de hoje é:</div>
          <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 10 }}>{fmt(dados.esperadoUser)}</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 4 }}>Sua produção até hoje é:</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: userAbaixo ? 'var(--red)' : 'var(--teal)' }}>{fmt(dados.atualUser)}</div>
          {userAbaixo && (
            <div style={{ marginTop: 8, fontSize: 13, color: 'var(--red)', fontWeight: 600 }}>
              ⚠️ Você está {fmt(diffUser)} abaixo do esperado.
            </div>
          )}
        </div>

        {ehLider && dados.equipes.map(eq => {
          const diffEq = eq.esperado - eq.atual
          const eqAbaixo = diffEq > 0 && eq.esperado > 0
          return (
            <div key={eq.equipe_id} style={{
              border: `1px solid ${eqAbaixo ? 'rgba(224,82,82,0.35)' : 'var(--border)'}`,
              borderRadius: 10, padding: '14px 16px', marginBottom: 14,
              background: eqAbaixo ? 'rgba(224,82,82,0.06)' : 'var(--bg-soft)',
            }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10, color: 'var(--gold)' }}>
                👥 {eq.equipe_nome}
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 4 }}>Meta esperada da equipe até hoje:</div>
              <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 10 }}>{fmt(eq.esperado)}</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 4 }}>Produção da equipe até hoje:</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: eqAbaixo ? 'var(--red)' : 'var(--teal)' }}>{fmt(eq.atual)}</div>
              {eqAbaixo && (
                <div style={{ marginTop: 8, fontSize: 13, color: 'var(--red)', fontWeight: 600 }}>
                  ⚠️ Equipe está {fmt(diffEq)} abaixo do esperado.
                </div>
              )}
              {eq.abaixo.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--red)', marginBottom: 8 }}>
                    VENDEDORES ABAIXO DA META:
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {eq.abaixo.map(v => (
                      <div key={v.user_id} style={{
                        border: '1px solid rgba(224,82,82,0.35)', borderRadius: 8,
                        padding: '8px 10px', background: 'rgba(224,82,82,0.06)',
                      }}>
                        <div style={{ color: 'var(--red)', fontWeight: 700, fontSize: 13, marginBottom: 2 }}>
                          {v.nome}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          Esperado: <strong>{fmt(v.esperado)}</strong> · Realizado:{' '}
                          <strong style={{ color: 'var(--red)' }}>{fmt(v.atual)}</strong> ·{' '}
                          <span style={{ color: 'var(--red)', fontWeight: 700 }}>
                            Abaixo em {fmt(v.esperado - v.atual)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })}

        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 10 }}>
          <button onClick={fechar} style={{
            padding: '12px 40px', borderRadius: 10, border: '1px solid var(--gold)',
            background: 'var(--gold)', color: 'var(--navy)', fontSize: 14, fontWeight: 700,
            cursor: 'pointer', fontFamily: 'Open Sans, sans-serif', letterSpacing: 1,
          }}>OK</button>
        </div>
      </div>
    </div>
  )
}
