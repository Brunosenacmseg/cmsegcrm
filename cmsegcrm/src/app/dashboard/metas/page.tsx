'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const TIPOS_META = [
  { key:'premio',   label:'Prêmio (R$)',    icon:'💰', desc:'Total em prêmios fechados' },
  { key:'negocios', label:'Nº de Negócios', icon:'🏗', desc:'Quantidade de negócios ganhos' },
  { key:'clientes', label:'Novos Clientes', icon:'👥', desc:'Quantidade de novos clientes' },
  { key:'comissao', label:'Comissão (R$)',  icon:'💵', desc:'Total em comissões recebidas' },
]

function ProgressBar({ valor, meta, cor }: { valor: number, meta: number, cor: string }) {
  const pct = meta > 0 ? Math.min((valor / meta) * 100, 100) : 0
  return (
    <div>
      <div style={{ height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.08)', overflow: 'hidden', marginBottom: 6 }}>
        <div style={{ height: '100%', borderRadius: 4, background: pct >= 100 ? 'var(--teal)' : pct >= 70 ? cor : 'rgba(201,168,76,0.6)', width: `${pct}%`, transition: 'width 0.5s ease' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)' }}>
        <span style={{ color: pct >= 100 ? 'var(--teal)' : cor, fontWeight: 600 }}>{pct.toFixed(0)}% concluído</span>
        {pct < 100 && <span>Faltam: {Math.max(meta - valor, 0).toLocaleString('pt-BR', { minimumFractionDigits: 0 })}</span>}
        {pct >= 100 && <span style={{ color: 'var(--teal)', fontWeight: 600 }}>✅ Meta atingida!</span>}
      </div>
    </div>
  )
}

export default function MetasPage() {
  const supabase = createClient()

  const [profile, setProfile]         = useState<any>(null)
  const [usuarios, setUsuarios]       = useState<any[]>([])
  const [metas, setMetas]             = useState<any[]>([])
  const [loading, setLoading]         = useState(true)
  const [modalAberto, setModalAberto] = useState(false)
  const [salvando, setSalvando]       = useState(false)
  const [filtroUser, setFiltroUser]   = useState('todos')
  const [editando, setEditando]       = useState<any>(null)

  const hoje = new Date()
  const mesIni = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-01`
  const mesFim = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate()}`

  const [form, setForm] = useState({
    user_id: '', titulo: '', descricao: '', tipo: 'premio',
    valor_meta: '', periodo_inicio: mesIni, periodo_fim: mesFim,
  })

  useEffect(() => { init() }, [])

  async function init() {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: prof } = await supabase.from('users').select('*').eq('id', user?.id || '').single()
    setProfile(prof)
    const { data: usr } = await supabase.from('users').select('id,nome,role').order('nome')
    setUsuarios(usr || [])
    await carregarMetas()
    setLoading(false)
  }

  async function carregarMetas() {
    const { data } = await supabase
      .from('metas')
      .select('*, users!metas_user_id_fkey(id,nome,role), users!metas_criado_por_fkey(id,nome)')
      .eq('status', 'ativa')
      .order('periodo_fim', { ascending: true })
    setMetas(data || [])
  }

  async function recalcularTodas() {
    for (const meta of metas) {
      let novoValor = 0
      if (meta.tipo === 'premio') {
        const { data } = await supabase.from('negocios').select('premio').eq('vendedor_id', meta.user_id).in('etapa', ['Fechado Ganho', 'Renovado', 'Pago', 'Concluído']).gte('updated_at', meta.periodo_inicio).lte('updated_at', meta.periodo_fim + 'T23:59:59')
        novoValor = (data || []).reduce((s: number, n: any) => s + (n.premio || 0), 0)
      }
      if (meta.tipo === 'negocios') {
        const { count } = await supabase.from('negocios').select('*', { count: 'exact', head: true }).eq('vendedor_id', meta.user_id).in('etapa', ['Fechado Ganho', 'Renovado', 'Pago', 'Concluído']).gte('updated_at', meta.periodo_inicio).lte('updated_at', meta.periodo_fim + 'T23:59:59')
        novoValor = count || 0
      }
      if (meta.tipo === 'clientes') {
        const { count } = await supabase.from('clientes').select('*', { count: 'exact', head: true }).eq('vendedor_id', meta.user_id).gte('created_at', meta.periodo_inicio).lte('created_at', meta.periodo_fim + 'T23:59:59')
        novoValor = count || 0
      }
      await supabase.from('metas').update({ valor_atual: novoValor }).eq('id', meta.id)
    }
    await carregarMetas()
  }

  async function salvarMeta() {
    if (!form.user_id || !form.titulo || !form.valor_meta) { alert('Preencha usuário, título e valor'); return }
    setSalvando(true)
    const payload = {
      user_id: form.user_id, criado_por: profile?.id, titulo: form.titulo,
      descricao: form.descricao || null, tipo: form.tipo,
      valor_meta: parseFloat(form.valor_meta), valor_atual: 0,
      periodo_inicio: form.periodo_inicio, periodo_fim: form.periodo_fim, status: 'ativa',
    }
    if (editando) {
      await supabase.from('metas').update(payload).eq('id', editando.id)
    } else {
      await supabase.from('metas').insert(payload)
      if (form.user_id !== profile?.id) {
        await supabase.from('notificacoes').insert({
          user_id: form.user_id, tipo: 'sistema',
          titulo: `${profile?.nome} definiu uma meta para você`,
          descricao: `${form.titulo} — ${parseFloat(form.valor_meta).toLocaleString('pt-BR')}`,
          link: '/dashboard/metas',
        })
      }
    }
    setModalAberto(false); setEditando(null); resetForm(); setSalvando(false)
    await carregarMetas()
  }

  async function excluirMeta(id: string) {
    if (!confirm('Excluir esta meta?')) return
    await supabase.from('metas').update({ status: 'inativa' }).eq('id', id)
    await carregarMetas()
  }

  function resetForm() {
    const h = new Date()
    const ini = `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}-01`
    const fim = `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}-${new Date(h.getFullYear(), h.getMonth() + 1, 0).getDate()}`
    setForm({ user_id: '', titulo: '', descricao: '', tipo: 'premio', valor_meta: '', periodo_inicio: ini, periodo_fim: fim })
  }

  function abrirEditar(meta: any) {
    setEditando(meta)
    setForm({ user_id: meta.user_id, titulo: meta.titulo, descricao: meta.descricao || '', tipo: meta.tipo, valor_meta: String(meta.valor_meta), periodo_inicio: meta.periodo_inicio, periodo_fim: meta.periodo_fim })
    setModalAberto(true)
  }

  const isAdminOrLider = profile?.role === 'admin' || profile?.role === 'lider'
  const metasFiltradas = metas.filter(m => filtroUser === 'todos' || m.user_id === filtroUser)
  const roleCor: Record<string, string> = { admin: 'var(--red)', lider: 'var(--gold)', corretor: 'var(--teal)' }

  const ranking = usuarios.map(u => {
    const mu = metas.filter(m => m.user_id === u.id && m.tipo === 'premio')
    const totalMeta = mu.reduce((s, m) => s + m.valor_meta, 0)
    const totalAtual = mu.reduce((s, m) => s + m.valor_atual, 0)
    const pct = totalMeta > 0 ? (totalAtual / totalMeta) * 100 : 0
    return { ...u, totalMeta, totalAtual, pct, qtdMetas: mu.length }
  }).filter(u => u.qtdMetas > 0).sort((a, b) => b.pct - a.pct)

  const inp: React.CSSProperties = { width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontSize: 13, fontFamily: 'DM Sans,sans-serif', outline: 'none', boxSizing: 'border-box' as const }

  if (loading) return <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>Carregando...</div>

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ height: 56, borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', padding: '0 28px', gap: 12, background: 'var(--bg-soft)', backdropFilter: 'blur(8px)', position: 'sticky', top: 0, zIndex: 5, flexShrink: 0 }}>
        <div style={{ fontFamily: 'DM Serif Display,serif', fontSize: 18, flex: 1 }}>🎯 Metas</div>
        <button onClick={recalcularTodas} style={{ padding: '6px 14px', borderRadius: 8, fontSize: 12, cursor: 'pointer', border: '1px solid var(--border)', background: 'rgba(255,255,255,0.04)', color: 'var(--text-muted)', fontFamily: 'DM Sans,sans-serif' }}>🔄 Recalcular</button>
        {isAdminOrLider && <button className="btn-primary" onClick={() => { setModalAberto(true); setEditando(null); resetForm() }}>+ Nova Meta</button>}
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '24px 28px' }}>
        {isAdminOrLider && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
            <button onClick={() => setFiltroUser('todos')} style={{ padding: '6px 14px', borderRadius: 20, fontSize: 12, cursor: 'pointer', border: '1px solid var(--border)', fontFamily: 'DM Sans,sans-serif', background: filtroUser === 'todos' ? 'rgba(201,168,76,0.12)' : 'rgba(255,255,255,0.04)', color: filtroUser === 'todos' ? 'var(--gold)' : 'var(--text-muted)', borderColor: filtroUser === 'todos' ? 'var(--gold)' : 'var(--border)' }}>Toda equipe</button>
            {usuarios.map(u => (
              <button key={u.id} onClick={() => setFiltroUser(u.id)} style={{ padding: '6px 14px', borderRadius: 20, fontSize: 12, cursor: 'pointer', border: '1px solid var(--border)', fontFamily: 'DM Sans,sans-serif', background: filtroUser === u.id ? 'rgba(201,168,76,0.12)' : 'rgba(255,255,255,0.04)', color: filtroUser === u.id ? 'var(--gold)' : 'var(--text-muted)', borderColor: filtroUser === u.id ? 'var(--gold)' : 'var(--border)' }}>{u.nome.split(' ')[0]}</button>
            ))}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: ranking.length > 0 ? '1fr 320px' : '1fr', gap: 20, alignItems: 'start' }}>
          <div>
            {metasFiltradas.length === 0 ? (
              <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>🎯</div>
                <div style={{ fontSize: 15, marginBottom: 6 }}>Nenhuma meta definida</div>
                {isAdminOrLider && <div style={{ fontSize: 13 }}>Clique em "+ Nova Meta" para começar</div>}
              </div>
            ) : metasFiltradas.map(meta => {
              const tipoConfig = TIPOS_META.find(t => t.key === meta.tipo)
              const pct = meta.valor_meta > 0 ? Math.min((meta.valor_atual / meta.valor_meta) * 100, 100) : 0
              const diasRestantes = Math.ceil((new Date(meta.periodo_fim).getTime() - Date.now()) / (1000 * 3600 * 24))
              const corMeta = roleCor[meta['users!metas_user_id_fkey']?.role] || 'var(--teal)'
              return (
                <div key={meta.id} className="card" style={{ marginBottom: 16, padding: '18px 20px', borderLeft: `3px solid ${pct >= 100 ? 'var(--teal)' : corMeta}` }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
                    <div style={{ fontSize: 28, flexShrink: 0 }}>{tipoConfig?.icon || '🎯'}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2, flexWrap: 'wrap' }}>
                        <div style={{ fontSize: 15, fontWeight: 600 }}>{meta.titulo}</div>
                        {pct >= 100 && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: 'rgba(28,181,160,0.2)', color: 'var(--teal)', fontWeight: 700 }}>✅ ATINGIDA</span>}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
                        {tipoConfig?.label} · {meta['users!metas_user_id_fkey']?.nome}
                        {meta['users!metas_criado_por_fkey']?.id !== meta.user_id && <span> · por {meta['users!metas_criado_por_fkey']?.nome}</span>}
                      </div>
                      {meta.descricao && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>{meta.descricao}</div>}
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        📅 {new Date(meta.periodo_inicio).toLocaleDateString('pt-BR')} até {new Date(meta.periodo_fim).toLocaleDateString('pt-BR')}
                        {diasRestantes > 0 && <span style={{ marginLeft: 8, color: diasRestantes <= 7 ? 'var(--red)' : 'var(--text-muted)' }}> · {diasRestantes} dia{diasRestantes !== 1 ? 's' : ''} restante{diasRestantes !== 1 ? 's' : ''}</span>}
                        {diasRestantes <= 0 && <span style={{ marginLeft: 8, color: 'var(--text-muted)' }}> · Encerrada</span>}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 20, fontWeight: 700, color: pct >= 100 ? 'var(--teal)' : 'var(--gold)' }}>
                        {meta.tipo === 'premio' || meta.tipo === 'comissao' ? 'R$ ' : ''}{meta.valor_atual.toLocaleString('pt-BR', { minimumFractionDigits: meta.tipo === 'premio' ? 2 : 0 })}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        de {meta.tipo === 'premio' || meta.tipo === 'comissao' ? 'R$ ' : ''}{meta.valor_meta.toLocaleString('pt-BR', { minimumFractionDigits: meta.tipo === 'premio' ? 2 : 0 })}
                      </div>
                    </div>
                  </div>
                  <ProgressBar valor={meta.valor_atual} meta={meta.valor_meta} cor={corMeta} />
                  {isAdminOrLider && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
                      <button onClick={() => abrirEditar(meta)} style={{ padding: '5px 12px', borderRadius: 6, fontSize: 11, cursor: 'pointer', border: '1px solid var(--border)', background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)', fontFamily: 'DM Sans,sans-serif' }}>✏️ Editar</button>
                      <button onClick={() => excluirMeta(meta.id)} style={{ padding: '5px 12px', borderRadius: 6, fontSize: 11, cursor: 'pointer', border: '1px solid rgba(224,82,82,0.3)', background: 'rgba(224,82,82,0.08)', color: 'var(--red)', fontFamily: 'DM Sans,sans-serif' }}>🗑 Excluir</button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {ranking.length > 0 && (
            <div className="card" style={{ padding: '18px 20px', position: 'sticky', top: 24 }}>
              <div style={{ fontFamily: 'DM Serif Display,serif', fontSize: 16, marginBottom: 16 }}>🏆 Ranking da Equipe</div>
              {ranking.map((u, i) => (
                <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, padding: '10px 12px', borderRadius: 10, background: i === 0 ? 'rgba(201,168,76,0.08)' : 'transparent', border: i === 0 ? '1px solid rgba(201,168,76,0.2)' : '1px solid transparent' }}>
                  <div style={{ fontSize: 18, width: 28, textAlign: 'center', flexShrink: 0 }}>{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`}</div>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: `linear-gradient(135deg,${roleCor[u.role] || 'var(--teal)'},var(--navy))`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#fff', flexShrink: 0 }}>{u.nome.slice(0, 2).toUpperCase()}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.nome.split(' ')[0]}</div>
                    <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.08)', marginTop: 4, overflow: 'hidden' }}>
                      <div style={{ height: '100%', borderRadius: 2, background: u.pct >= 100 ? 'var(--teal)' : 'var(--gold)', width: `${Math.min(u.pct, 100)}%`, transition: 'width 0.5s' }} />
                    </div>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: u.pct >= 100 ? 'var(--teal)' : 'var(--gold)', flexShrink: 0 }}>{u.pct.toFixed(0)}%</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {modalAberto && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(6px)' }} onClick={e => e.target === e.currentTarget && setModalAberto(false)}>
          <div style={{ background: '#ffffff', border: '1px solid var(--border)', borderRadius: 20, padding: '28px 32px', width: 500, maxWidth: '95vw', maxHeight: '90vh', overflow: 'auto' }}>
            <div style={{ fontFamily: 'DM Serif Display,serif', fontSize: 20, marginBottom: 20 }}>{editando ? '✏️ Editar Meta' : '🎯 Nova Meta'}</div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Colaborador *</label>
              <select value={form.user_id} onChange={e => setForm(f => ({ ...f, user_id: e.target.value }))} style={inp}>
                <option value="">— Selecione —</option>
                {usuarios.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Título *</label>
              <input value={form.titulo} onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))} placeholder="Ex: Meta de prêmio mensal" style={inp} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 8 }}>Tipo de meta</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {TIPOS_META.map(t => (
                  <button key={t.key} onClick={() => setForm(f => ({ ...f, tipo: t.key }))} style={{ padding: '10px', borderRadius: 10, cursor: 'pointer', border: `1px solid ${form.tipo === t.key ? 'var(--gold)' : 'var(--border)'}`, background: form.tipo === t.key ? 'rgba(201,168,76,0.1)' : 'rgba(255,255,255,0.02)', textAlign: 'left', transition: 'all 0.15s' }}>
                    <div style={{ fontSize: 16, marginBottom: 4 }}>{t.icon}</div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: form.tipo === t.key ? 'var(--gold)' : 'var(--text)' }}>{t.label}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{t.desc}</div>
                  </button>
                ))}
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 14 }}>
              <div>
                <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Valor da meta *</label>
                <input type="number" value={form.valor_meta} onChange={e => setForm(f => ({ ...f, valor_meta: e.target.value }))} placeholder="0" style={inp} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Início</label>
                <input type="date" value={form.periodo_inicio} onChange={e => setForm(f => ({ ...f, periodo_inicio: e.target.value }))} style={inp} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Fim</label>
                <input type="date" value={form.periodo_fim} onChange={e => setForm(f => ({ ...f, periodo_fim: e.target.value }))} style={inp} />
              </div>
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Descrição (opcional)</label>
              <input value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} placeholder="Observações..." style={inp} />
            </div>
            {form.user_id && form.user_id !== profile?.id && !editando && (
              <div style={{ marginBottom: 16, padding: '10px 14px', background: 'rgba(28,181,160,0.08)', border: '1px solid rgba(28,181,160,0.2)', borderRadius: 8, fontSize: 12, color: 'var(--teal)' }}>
                ✓ {usuarios.find(u => u.id === form.user_id)?.nome} será notificado sobre esta meta
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn-secondary" onClick={() => { setModalAberto(false); setEditando(null) }}>Cancelar</button>
              <button className="btn-primary" onClick={salvarMeta} disabled={salvando}>{salvando ? 'Salvando...' : editando ? '✓ Salvar' : '🎯 Criar Meta'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
