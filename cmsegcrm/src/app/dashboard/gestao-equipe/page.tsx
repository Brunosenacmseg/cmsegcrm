'use client'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Avatar from '@/components/Avatar'

type Tab = 'hoje' | 'historico' | 'relatorio' | 'perguntas'

type Pergunta = {
  id: string
  ordem: number
  chave: string
  pergunta: string
  descricao: string | null
  tipo: 'escala' | 'sim_nao' | 'texto'
  min_escala: number
  max_escala: number
  ativa: boolean
}

type Colaborador = {
  id: string
  nome: string
  email: string
  role: string | null
  avatar_url: string | null
  equipe_id: string | null
  equipe_nome: string | null
}

type Avaliacao = {
  id: string
  data: string
  colaborador_id: string
  lider_id: string
  equipe_id: string | null
  nota_geral: number | null
  humor: string | null
  destaque: string | null
  dificuldade: string | null
  acao_proxima: string | null
  comentario: string | null
  criado_em: string
  atualizado_em: string
}

type Resposta = {
  id?: string
  avaliacao_id?: string
  pergunta_id: string
  nota: number | null
  resposta_texto: string | null
}

const HUMORES = [
  { v: 'otimo',   label: 'Ótimo',   icon: '😄' },
  { v: 'bom',     label: 'Bom',     icon: '🙂' },
  { v: 'neutro',  label: 'Neutro',  icon: '😐' },
  { v: 'baixo',   label: 'Baixo',   icon: '😟' },
  { v: 'ruim',    label: 'Ruim',    icon: '😣' },
]

function isoHoje() {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 10)
}

const card: React.CSSProperties = {
  background: 'var(--bg-soft)',
  border: '1px solid var(--border)',
  borderRadius: 12,
  padding: 16,
}
const inputStyle: React.CSSProperties = {
  width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)',
  borderRadius: 6, padding: '7px 10px', color: 'var(--text)', fontSize: 13, outline: 'none', boxSizing: 'border-box',
}
const btn: React.CSSProperties = {
  padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)',
  background: 'var(--bg)', color: 'var(--text)', cursor: 'pointer', fontSize: 13,
  fontFamily: 'DM Sans,sans-serif',
}
const btnGold: React.CSSProperties = {
  ...btn, background: 'var(--gold)', borderColor: 'var(--gold)', color: '#1a1a1a', fontWeight: 600,
}

export default function GestaoEquipePage() {
  const supabase = createClient()
  const [loading, setLoading]       = useState(true)
  const [profile, setProfile]       = useState<any>(null)
  const [isLider, setIsLider]       = useState(false)
  const [isAdmin, setIsAdmin]       = useState(false)
  const [colaboradores, setCols]    = useState<Colaborador[]>([])
  const [perguntas, setPerguntas]   = useState<Pergunta[]>([])
  const [avalHoje, setAvalHoje]     = useState<Avaliacao[]>([])
  const [tab, setTab]               = useState<Tab>('hoje')
  const [colSel, setColSel]         = useState<Colaborador | null>(null)

  useEffect(() => { (async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data: p } = await supabase.from('users').select('id,nome,email,role,avatar_url').eq('id', user.id).single()
    setProfile(p)
    const admin = p?.role === 'admin'
    setIsAdmin(admin)

    // É líder? role='lider' ou lider_id em alguma equipe
    let lider = admin || p?.role === 'lider'
    let equipesLider: { id: string; nome: string }[] = []
    if (!admin) {
      const { data: eqs } = await supabase
        .from('equipes')
        .select('id,nome')
        .eq('lider_id', user.id)
      equipesLider = eqs || []
      if ((eqs || []).length > 0) lider = true
    }
    setIsLider(lider)

    if (lider) {
      // Carrega colaboradores: admin vê todos os usuários ativos;
      // líder vê os membros das suas equipes (e ele próprio).
      let cols: Colaborador[] = []
      if (admin) {
        const { data: us } = await supabase
          .from('users')
          .select('id,nome,email,role,avatar_url')
          .order('nome')
        // anexa equipe principal (1ª equipe encontrada)
        const ids = (us || []).map((u: any) => u.id)
        const { data: ems } = ids.length ? await supabase
          .from('equipe_membros')
          .select('user_id, equipes!inner(id,nome)')
          .in('user_id', ids) : { data: [] as any[] }
        const mapEq: Record<string, { id: string; nome: string }> = {}
        for (const m of (ems || [])) {
          const eq: any = (m as any).equipes
          if (eq && !mapEq[(m as any).user_id]) mapEq[(m as any).user_id] = { id: eq.id, nome: eq.nome }
        }
        cols = (us || []).map((u: any) => ({
          ...u,
          equipe_id:   mapEq[u.id]?.id   || null,
          equipe_nome: mapEq[u.id]?.nome || null,
        }))
      } else {
        const equipeIds = equipesLider.map(e => e.id)
        if (equipeIds.length) {
          const { data: ems } = await supabase
            .from('equipe_membros')
            .select('user_id, equipe_id, users!inner(id,nome,email,role,avatar_url)')
            .in('equipe_id', equipeIds)
          const mapEq: Record<string, string> = Object.fromEntries(equipesLider.map(e => [e.id, e.nome]))
          cols = (ems || []).map((m: any) => ({
            id: m.users.id,
            nome: m.users.nome,
            email: m.users.email,
            role: m.users.role,
            avatar_url: m.users.avatar_url,
            equipe_id: m.equipe_id,
            equipe_nome: mapEq[m.equipe_id] || null,
          }))
          // dedupe
          const seen = new Set<string>()
          cols = cols.filter(c => seen.has(c.id) ? false : (seen.add(c.id), true))
          cols.sort((a, b) => a.nome.localeCompare(b.nome))
        }
      }
      setCols(cols)

      const { data: perg } = await supabase
        .from('gestao_equipe_perguntas')
        .select('*')
        .eq('ativa', true)
        .order('ordem')
      setPerguntas((perg || []) as Pergunta[])

      // Avaliações de hoje feitas pelo líder logado
      const { data: hoje } = await supabase
        .from('gestao_equipe_avaliacoes')
        .select('*')
        .eq('lider_id', user.id)
        .eq('data', isoHoje())
      setAvalHoje((hoje || []) as Avaliacao[])
    }

    setLoading(false)
  })() }, [])

  const semAcesso = !loading && !isAdmin && !isLider

  if (loading) return (
    <div style={{ padding: 32, color: 'var(--text-muted)' }}>Carregando…</div>
  )

  if (semAcesso) return (
    <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
      <div style={{ fontSize: 48, marginBottom: 12 }}>🔒</div>
      <div style={{ fontSize: 16 }}>Apenas líderes de equipe e administradores têm acesso a este módulo.</div>
    </div>
  )

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ height: 56, borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', padding: '0 28px', background: 'var(--bg-soft)', position: 'sticky', top: 0, zIndex: 5 }}>
        <div style={{ fontFamily: 'DM Serif Display,serif', fontSize: 18, flex: 1 }}>🧭 Gestão de Equipe</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {isAdmin ? 'Administrador' : 'Líder'} · {isoHoje()}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 4, padding: '12px 28px 0', borderBottom: '1px solid var(--border)', overflowX: 'auto' }}>
        {([
          { k: 'hoje',       l: '⭐ Avaliação de Hoje' },
          { k: 'historico',  l: '📜 Histórico'         },
          { k: 'relatorio',  l: '📊 Relatório'         },
          ...(isAdmin ? [{ k: 'perguntas', l: '⚙️ Perguntas' }] : []),
        ] as { k: Tab; l: string }[]).map(t => (
          <button key={t.k} onClick={() => setTab(t.k)} style={{
            padding: '8px 14px', fontSize: 12, fontWeight: 600, border: 'none',
            background: tab === t.k ? 'var(--gold-soft)' : 'transparent',
            color: tab === t.k ? 'var(--gold)' : 'var(--text-muted)',
            borderBottom: tab === t.k ? '2px solid var(--gold)' : '2px solid transparent',
            cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'DM Sans,sans-serif',
          }}>
            {t.l}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '24px 28px 40px' }}>
        {tab === 'hoje' && (
          <HojeTab
            colaboradores={colaboradores}
            avalHoje={avalHoje}
            onAvaliar={c => setColSel(c)}
            onRefresh={async () => {
              const { data: { user } } = await supabase.auth.getUser()
              if (!user) return
              const { data: hoje } = await supabase
                .from('gestao_equipe_avaliacoes')
                .select('*')
                .eq('lider_id', user.id)
                .eq('data', isoHoje())
              setAvalHoje((hoje || []) as Avaliacao[])
            }}
          />
        )}
        {tab === 'historico' && (
          <HistoricoTab colaboradores={colaboradores} isAdmin={isAdmin} />
        )}
        {tab === 'relatorio' && (
          <RelatorioTab colaboradores={colaboradores} />
        )}
        {tab === 'perguntas' && isAdmin && (
          <PerguntasTab onChange={async () => {
            const { data: perg } = await supabase
              .from('gestao_equipe_perguntas')
              .select('*')
              .order('ordem')
            setPerguntas((perg || []) as Pergunta[])
          }} />
        )}
      </div>

      {colSel && (
        <AvaliarModal
          colaborador={colSel}
          perguntas={perguntas}
          avaliacaoExistente={avalHoje.find(a => a.colaborador_id === colSel.id) || null}
          liderId={profile?.id}
          onClose={() => setColSel(null)}
          onSaved={async () => {
            setColSel(null)
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return
            const { data: hoje } = await supabase
              .from('gestao_equipe_avaliacoes')
              .select('*')
              .eq('lider_id', user.id)
              .eq('data', isoHoje())
            setAvalHoje((hoje || []) as Avaliacao[])
          }}
        />
      )}
    </div>
  )
}

// ─── Aba: Avaliação de Hoje ─────────────────────────────────────────
function HojeTab({ colaboradores, avalHoje, onAvaliar, onRefresh }: {
  colaboradores: Colaborador[]
  avalHoje: Avaliacao[]
  onAvaliar: (c: Colaborador) => void
  onRefresh: () => void
}) {
  const avalMap = useMemo(() => {
    const m: Record<string, Avaliacao> = {}
    for (const a of avalHoje) m[a.colaborador_id] = a
    return m
  }, [avalHoje])

  const total      = colaboradores.length
  const avaliados  = colaboradores.filter(c => avalMap[c.id]).length
  const pendentes  = total - avaliados
  const progresso  = total ? Math.round((avaliados / total) * 100) : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 24 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 4 }}>
            Rotina diária — {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
          </div>
          <div style={{ fontSize: 18, fontWeight: 600 }}>
            {avaliados} de {total} colaboradores avaliados hoje
          </div>
          <div style={{ marginTop: 8, height: 8, background: 'rgba(255,255,255,0.08)', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{
              height: '100%', width: `${progresso}%`,
              background: progresso === 100 ? 'var(--teal)' : 'var(--gold)',
              transition: 'width 0.3s',
            }} />
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Pendentes</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: pendentes ? 'var(--gold)' : 'var(--teal)' }}>
            {pendentes}
          </div>
        </div>
        <button style={btn} onClick={onRefresh}>🔄 Atualizar</button>
      </div>

      {total === 0 && (
        <div style={{ ...card, textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>
          Você ainda não tem colaboradores vinculados a uma equipe sob sua liderança.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 14 }}>
        {colaboradores.map(c => {
          const a = avalMap[c.id]
          return (
            <div key={c.id} style={{
              ...card, padding: 14, display: 'flex', flexDirection: 'column', gap: 10,
              borderColor: a ? 'rgba(28,181,160,0.4)' : 'var(--border)',
            }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <Avatar nome={c.nome} avatarUrl={c.avatar_url || undefined} role={c.role || undefined} size={40} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.nome}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {c.equipe_nome || '—'}
                  </div>
                </div>
              </div>
              {a ? (
                <div style={{
                  fontSize: 11, color: 'var(--teal)', background: 'rgba(28,181,160,0.1)',
                  padding: '4px 8px', borderRadius: 6, display: 'inline-block', alignSelf: 'flex-start',
                }}>
                  ✅ Avaliado · nota {a.nota_geral?.toFixed(1) ?? '—'}
                </div>
              ) : (
                <div style={{
                  fontSize: 11, color: 'var(--gold)', background: 'rgba(201,168,76,0.1)',
                  padding: '4px 8px', borderRadius: 6, display: 'inline-block', alignSelf: 'flex-start',
                }}>
                  ⏳ Pendente
                </div>
              )}
              <button
                style={a ? btn : btnGold}
                onClick={() => onAvaliar(c)}
              >
                {a ? 'Editar avaliação' : 'Avaliar agora'}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Modal de Avaliação ─────────────────────────────────────────────
function AvaliarModal({ colaborador, perguntas, avaliacaoExistente, liderId, onClose, onSaved }: {
  colaborador: Colaborador
  perguntas: Pergunta[]
  avaliacaoExistente: Avaliacao | null
  liderId: string
  onClose: () => void
  onSaved: () => void
}) {
  const supabase = createClient()
  const [respostas, setRespostas] = useState<Record<string, Resposta>>({})
  const [humor, setHumor]         = useState<string>(avaliacaoExistente?.humor || '')
  const [destaque, setDestaque]   = useState<string>(avaliacaoExistente?.destaque || '')
  const [dificuldade, setDif]     = useState<string>(avaliacaoExistente?.dificuldade || '')
  const [acao, setAcao]           = useState<string>(avaliacaoExistente?.acao_proxima || '')
  const [comentario, setCom]      = useState<string>(avaliacaoExistente?.comentario || '')
  const [salvando, setSalvando]   = useState(false)
  const [erro, setErro]           = useState<string | null>(null)

  useEffect(() => { (async () => {
    if (!avaliacaoExistente) {
      const init: Record<string, Resposta> = {}
      for (const p of perguntas) init[p.id] = { pergunta_id: p.id, nota: null, resposta_texto: null }
      setRespostas(init)
      return
    }
    const { data } = await supabase
      .from('gestao_equipe_respostas')
      .select('*')
      .eq('avaliacao_id', avaliacaoExistente.id)
    const m: Record<string, Resposta> = {}
    for (const p of perguntas) m[p.id] = { pergunta_id: p.id, nota: null, resposta_texto: null }
    for (const r of (data || [])) m[r.pergunta_id] = r as Resposta
    setRespostas(m)
  })() }, [avaliacaoExistente?.id])

  const escala = perguntas.filter(p => p.tipo === 'escala')
  const notas  = escala.map(p => respostas[p.id]?.nota).filter((n): n is number => typeof n === 'number')
  const media  = notas.length ? Number((notas.reduce((s, n) => s + n, 0) / notas.length).toFixed(1)) : null

  function setNota(pid: string, n: number) {
    setRespostas(r => ({ ...r, [pid]: { ...(r[pid] || { pergunta_id: pid, nota: null, resposta_texto: null }), nota: n } }))
  }
  function setTexto(pid: string, v: string) {
    setRespostas(r => ({ ...r, [pid]: { ...(r[pid] || { pergunta_id: pid, nota: null, resposta_texto: null }), resposta_texto: v } }))
  }

  async function salvar() {
    setSalvando(true); setErro(null)
    try {
      let avalId = avaliacaoExistente?.id || ''
      const payload: any = {
        data: isoHoje(),
        colaborador_id: colaborador.id,
        lider_id: liderId,
        equipe_id: colaborador.equipe_id,
        nota_geral: media,
        humor: humor || null,
        destaque: destaque || null,
        dificuldade: dificuldade || null,
        acao_proxima: acao || null,
        comentario: comentario || null,
      }
      if (avalId) {
        const { error } = await supabase
          .from('gestao_equipe_avaliacoes')
          .update(payload)
          .eq('id', avalId)
        if (error) throw error
      } else {
        const { data, error } = await supabase
          .from('gestao_equipe_avaliacoes')
          .insert(payload)
          .select('id')
          .single()
        if (error) throw error
        avalId = data!.id
      }
      // Upsert respostas
      const rows = Object.values(respostas)
        .filter(r => (r.nota !== null && r.nota !== undefined) || (r.resposta_texto && r.resposta_texto.trim() !== ''))
        .map(r => ({
          avaliacao_id: avalId,
          pergunta_id: r.pergunta_id,
          nota: r.nota,
          resposta_texto: r.resposta_texto,
        }))
      if (rows.length) {
        const { error } = await supabase
          .from('gestao_equipe_respostas')
          .upsert(rows, { onConflict: 'avaliacao_id,pergunta_id' })
        if (error) throw error
      }
      onSaved()
    } catch (e: any) {
      setErro(e?.message || 'Falha ao salvar')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 14,
        width: 'min(720px, 100%)', maxHeight: '90vh', display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ padding: 18, borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <Avatar nome={colaborador.nome} avatarUrl={colaborador.avatar_url || undefined} role={colaborador.role || undefined} size={40} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Avaliação diária · {new Date().toLocaleDateString('pt-BR')}</div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>{colaborador.nome}</div>
          </div>
          <button style={btn} onClick={onClose}>✕</button>
        </div>

        <div style={{ padding: 18, overflow: 'auto', flex: 1 }}>
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>Como ele(a) parece estar hoje?</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {HUMORES.map(h => (
                <button key={h.v} onClick={() => setHumor(humor === h.v ? '' : h.v)} style={{
                  ...btn, padding: '6px 12px',
                  background: humor === h.v ? 'var(--gold-soft)' : 'var(--bg)',
                  borderColor: humor === h.v ? 'var(--gold)' : 'var(--border)',
                  color: humor === h.v ? 'var(--gold)' : 'var(--text)',
                }}>
                  {h.icon} {h.label}
                </button>
              ))}
            </div>
          </div>

          {perguntas.map(p => (
            <div key={p.id} style={{ marginBottom: 16, paddingBottom: 14, borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{p.pergunta}</div>
              {p.descricao && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>{p.descricao}</div>
              )}
              {p.tipo === 'escala' && (
                <Escala
                  min={p.min_escala} max={p.max_escala}
                  value={respostas[p.id]?.nota ?? null}
                  onChange={n => setNota(p.id, n)}
                />
              )}
              {p.tipo === 'sim_nao' && (
                <div style={{ display: 'flex', gap: 8 }}>
                  {[{ v: 1, l: 'Sim' }, { v: 0, l: 'Não' }].map(o => (
                    <button key={o.v} onClick={() => setNota(p.id, o.v)} style={{
                      ...btn, padding: '6px 14px',
                      background: respostas[p.id]?.nota === o.v ? 'var(--gold-soft)' : 'var(--bg)',
                      borderColor: respostas[p.id]?.nota === o.v ? 'var(--gold)' : 'var(--border)',
                      color: respostas[p.id]?.nota === o.v ? 'var(--gold)' : 'var(--text)',
                    }}>
                      {o.l}
                    </button>
                  ))}
                </div>
              )}
              {p.tipo === 'texto' && (
                <textarea
                  value={respostas[p.id]?.resposta_texto || ''}
                  onChange={e => setTexto(p.id, e.target.value)}
                  rows={2}
                  style={{ ...inputStyle, resize: 'vertical' }}
                  placeholder="Anote algo memorável…"
                />
              )}
            </div>
          ))}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
            <Field label="🌟 Destaque do dia">
              <textarea value={destaque} onChange={e => setDestaque(e.target.value)} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
            </Field>
            <Field label="⚠️ Dificuldade observada">
              <textarea value={dificuldade} onChange={e => setDif(e.target.value)} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
            </Field>
            <Field label="🎯 Ação para amanhã">
              <textarea value={acao} onChange={e => setAcao(e.target.value)} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
            </Field>
            <Field label="💬 Comentário geral">
              <textarea value={comentario} onChange={e => setCom(e.target.value)} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
            </Field>
          </div>
        </div>

        <div style={{ padding: 14, borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1, fontSize: 12, color: 'var(--text-muted)' }}>
            {erro ? <span style={{ color: 'var(--red,#e57373)' }}>⚠️ {erro}</span> : (
              <>Nota média: <strong style={{ color: 'var(--gold)' }}>{media ?? '—'}</strong></>
            )}
          </div>
          <button style={btn} onClick={onClose}>Cancelar</button>
          <button style={btnGold} onClick={salvar} disabled={salvando}>
            {salvando ? 'Salvando…' : (avaliacaoExistente ? 'Atualizar' : 'Salvar avaliação')}
          </button>
        </div>
      </div>
    </div>
  )
}

function Escala({ min, max, value, onChange }: {
  min: number; max: number; value: number | null; onChange: (n: number) => void
}) {
  const items: number[] = []
  for (let i = min; i <= max; i++) items.push(i)
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {items.map(n => (
        <button key={n} onClick={() => onChange(n)} style={{
          width: 38, height: 38, borderRadius: 8, fontSize: 14, fontWeight: 600,
          border: '1px solid ' + (value === n ? 'var(--gold)' : 'var(--border)'),
          background: value === n ? 'var(--gold)' : 'var(--bg)',
          color: value === n ? '#1a1a1a' : 'var(--text)',
          cursor: 'pointer',
        }}>{n}</button>
      ))}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  )
}

// ─── Aba: Histórico ─────────────────────────────────────────────────
function HistoricoTab({ colaboradores, isAdmin }: { colaboradores: Colaborador[]; isAdmin: boolean }) {
  const supabase = createClient()
  const [filtroCol, setFiltroCol]     = useState<string>('')
  const [dataDe, setDataDe]           = useState<string>(() => {
    const d = new Date(); d.setDate(d.getDate() - 14); return d.toISOString().slice(0, 10)
  })
  const [dataAte, setDataAte]         = useState<string>(isoHoje())
  const [linhas, setLinhas]           = useState<any[]>([])
  const [carregando, setCarregando]   = useState(false)

  const colMap = useMemo(() => Object.fromEntries(colaboradores.map(c => [c.id, c])), [colaboradores])

  useEffect(() => { (async () => {
    setCarregando(true)
    let q = supabase
      .from('gestao_equipe_avaliacoes')
      .select('*')
      .gte('data', dataDe)
      .lte('data', dataAte)
      .order('data', { ascending: false })
      .limit(500)
    if (filtroCol) q = q.eq('colaborador_id', filtroCol)
    if (!isAdmin) {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) q = q.eq('lider_id', user.id)
    }
    const { data } = await q
    setLinhas(data || [])
    setCarregando(false)
  })() }, [filtroCol, dataDe, dataAte])

  return (
    <div>
      <div style={{ ...card, display: 'flex', gap: 12, alignItems: 'flex-end', marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 200 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Colaborador</div>
          <select value={filtroCol} onChange={e => setFiltroCol(e.target.value)} style={inputStyle}>
            <option value="">Todos</option>
            {colaboradores.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>De</div>
          <input type="date" value={dataDe} onChange={e => setDataDe(e.target.value)} style={inputStyle} />
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Até</div>
          <input type="date" value={dataAte} onChange={e => setDataAte(e.target.value)} style={inputStyle} />
        </div>
      </div>

      {carregando && <div style={{ color: 'var(--text-muted)' }}>Carregando…</div>}

      {!carregando && linhas.length === 0 && (
        <div style={{ ...card, textAlign: 'center', color: 'var(--text-muted)', padding: 30 }}>
          Nenhuma avaliação no período.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {linhas.map(l => {
          const c = colMap[l.colaborador_id]
          return (
            <div key={l.id} style={{ ...card, padding: 12, display: 'flex', gap: 14, alignItems: 'center' }}>
              <Avatar nome={c?.nome || '—'} avatarUrl={c?.avatar_url || undefined} role={c?.role || undefined} size={34} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{c?.nome || l.colaborador_id}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {new Date(l.data).toLocaleDateString('pt-BR')} · {l.comentario || l.destaque || '—'}
                </div>
              </div>
              <div style={{
                fontSize: 16, fontWeight: 700,
                color: (l.nota_geral ?? 0) >= 4 ? 'var(--teal)' : (l.nota_geral ?? 0) >= 3 ? 'var(--gold)' : 'var(--red,#e57373)',
                minWidth: 40, textAlign: 'right',
              }}>
                {l.nota_geral?.toFixed(1) ?? '—'}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Aba: Relatório (média por colaborador) ─────────────────────────
function RelatorioTab({ colaboradores }: { colaboradores: Colaborador[] }) {
  const supabase = createClient()
  const [janela, setJanela] = useState<7 | 30>(7)
  const [dados, setDados]   = useState<{ colab: Colaborador; media: number | null; total: number }[]>([])
  const [carregando, setCarregando] = useState(false)

  useEffect(() => { (async () => {
    if (!colaboradores.length) { setDados([]); return }
    setCarregando(true)
    const desde = new Date(); desde.setDate(desde.getDate() - janela)
    const ids = colaboradores.map(c => c.id)
    const { data } = await supabase
      .from('gestao_equipe_avaliacoes')
      .select('colaborador_id,nota_geral')
      .gte('data', desde.toISOString().slice(0, 10))
      .in('colaborador_id', ids)
    const acum: Record<string, { soma: number; n: number }> = {}
    for (const r of (data || [])) {
      if (r.nota_geral === null) continue
      const k = r.colaborador_id
      acum[k] = acum[k] || { soma: 0, n: 0 }
      acum[k].soma += Number(r.nota_geral); acum[k].n += 1
    }
    const out = colaboradores.map(c => {
      const a = acum[c.id]
      return { colab: c, media: a ? Number((a.soma / a.n).toFixed(2)) : null, total: a?.n || 0 }
    }).sort((a, b) => (b.media ?? -1) - (a.media ?? -1))
    setDados(out)
    setCarregando(false)
  })() }, [janela, colaboradores.length])

  return (
    <div>
      <div style={{ marginBottom: 14, display: 'flex', gap: 8 }}>
        {[7, 30].map(d => (
          <button key={d} style={{
            ...btn,
            background: janela === d ? 'var(--gold-soft)' : 'var(--bg)',
            borderColor: janela === d ? 'var(--gold)' : 'var(--border)',
            color: janela === d ? 'var(--gold)' : 'var(--text)',
          }} onClick={() => setJanela(d as 7 | 30)}>
            Últimos {d} dias
          </button>
        ))}
      </div>
      {carregando && <div style={{ color: 'var(--text-muted)' }}>Carregando…</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {dados.map(({ colab, media, total }) => (
          <div key={colab.id} style={{ ...card, padding: 12, display: 'flex', alignItems: 'center', gap: 14 }}>
            <Avatar nome={colab.nome} avatarUrl={colab.avatar_url || undefined} role={colab.role || undefined} size={34} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{colab.nome}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{total} avaliação(ões) no período</div>
            </div>
            <div style={{ width: 200, height: 8, background: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${((media ?? 0) / 5) * 100}%`,
                background: (media ?? 0) >= 4 ? 'var(--teal)' : (media ?? 0) >= 3 ? 'var(--gold)' : 'var(--red,#e57373)',
              }} />
            </div>
            <div style={{ width: 50, textAlign: 'right', fontWeight: 700, fontSize: 14 }}>
              {media?.toFixed(2) ?? '—'}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Aba: Perguntas (admin) ─────────────────────────────────────────
function PerguntasTab({ onChange }: { onChange: () => void }) {
  const supabase = createClient()
  const [perg, setPerg] = useState<Pergunta[]>([])
  const [novo, setNovo] = useState({ pergunta: '', descricao: '', tipo: 'escala' as Pergunta['tipo'] })
  const [salvando, setSalvando] = useState(false)

  async function recarrega() {
    const { data } = await supabase.from('gestao_equipe_perguntas').select('*').order('ordem')
    setPerg((data || []) as Pergunta[])
  }
  useEffect(() => { recarrega() }, [])

  async function adicionar() {
    if (!novo.pergunta.trim()) return
    setSalvando(true)
    const ordem = (perg.at(-1)?.ordem ?? 0) + 10
    const chave = novo.pergunta.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').slice(0, 60)
    await supabase.from('gestao_equipe_perguntas').insert({
      ordem, chave, pergunta: novo.pergunta, descricao: novo.descricao || null,
      tipo: novo.tipo,
      min_escala: novo.tipo === 'escala' ? 1 : 0,
      max_escala: novo.tipo === 'escala' ? 5 : (novo.tipo === 'sim_nao' ? 1 : 0),
    })
    setNovo({ pergunta: '', descricao: '', tipo: 'escala' })
    await recarrega(); onChange()
    setSalvando(false)
  }

  async function toggleAtiva(p: Pergunta) {
    await supabase.from('gestao_equipe_perguntas').update({ ativa: !p.ativa }).eq('id', p.id)
    await recarrega(); onChange()
  }

  return (
    <div>
      <div style={{ ...card, marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Nova pergunta</div>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr auto', gap: 10, alignItems: 'flex-end' }}>
          <Field label="Pergunta">
            <input value={novo.pergunta} onChange={e => setNovo(s => ({ ...s, pergunta: e.target.value }))} style={inputStyle} />
          </Field>
          <Field label="Descrição (opcional)">
            <input value={novo.descricao} onChange={e => setNovo(s => ({ ...s, descricao: e.target.value }))} style={inputStyle} />
          </Field>
          <Field label="Tipo">
            <select value={novo.tipo} onChange={e => setNovo(s => ({ ...s, tipo: e.target.value as Pergunta['tipo'] }))} style={inputStyle}>
              <option value="escala">Escala 1–5</option>
              <option value="sim_nao">Sim / Não</option>
              <option value="texto">Texto livre</option>
            </select>
          </Field>
          <button style={btnGold} onClick={adicionar} disabled={salvando}>Adicionar</button>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {perg.map(p => (
          <div key={p.id} style={{ ...card, padding: 12, display: 'flex', alignItems: 'center', gap: 12, opacity: p.ativa ? 1 : 0.55 }}>
            <div style={{ width: 28, fontSize: 11, color: 'var(--text-muted)' }}>{p.ordem}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{p.pergunta}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {p.tipo === 'escala' && `Escala ${p.min_escala}–${p.max_escala}`}
                {p.tipo === 'sim_nao' && 'Sim / Não'}
                {p.tipo === 'texto' && 'Texto livre'}
                {p.descricao ? ' · ' + p.descricao : ''}
              </div>
            </div>
            <button style={btn} onClick={() => toggleAtiva(p)}>{p.ativa ? 'Desativar' : 'Ativar'}</button>
          </div>
        ))}
      </div>
    </div>
  )
}
