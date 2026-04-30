'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Stats {
  qtd_lidos: number
  qtd_criados: number
  qtd_atualizados: number
  qtd_erros: number
  erros?: string[]
}

interface Sync {
  id: string
  recurso: string
  status: string
  qtd_lidos: number
  qtd_criados: number
  qtd_atualizados: number
  qtd_erros: number
  erros?: string[]
  iniciado_em: string
  concluido_em?: string | null
}

const RECURSOS: { key: string; label: string; emoji: string; descricao: string }[] = [
  { key: 'usuarios',   label: 'Usuários',   emoji: '👥', descricao: 'Vincula usuários do RD por e-mail aos corretores existentes' },
  { key: 'funis',      label: 'Funis',      emoji: '📊', descricao: 'Cria funis "RD: <Nome>" com as etapas do RD Station' },
  { key: 'contatos',   label: 'Contatos',   emoji: '👤', descricao: 'Importa contatos como clientes (PF/PJ por CPF/CNPJ)' },
  { key: 'negocios',   label: 'Negócios',   emoji: '💼', descricao: 'Importa deals nos funis correspondentes' },
  { key: 'atividades', label: 'Atividades', emoji: '✅', descricao: 'Importa tarefas, ligações, e-mails e notas' },
]

export default function RDStationPage() {
  const supabase = createClient()
  const [token, setToken]       = useState('')
  const [usaEnv, setUsaEnv]     = useState(true)
  const [rodando, setRodando]   = useState<string | null>(null)
  const [resultados, setResultados] = useState<Record<string, Stats>>({})
  const [historico, setHistorico]   = useState<Sync[]>([])
  const [erro, setErro]         = useState<string | null>(null)

  async function authHeaders(): Promise<Record<string, string>> {
    const { data: { session } } = await supabase.auth.getSession()
    const h: Record<string, string> = { 'Content-Type': 'application/json' }
    if (session?.access_token) h['Authorization'] = `Bearer ${session.access_token}`
    return h
  }

  async function carregarHistorico() {
    try {
      const r = await fetch('/api/rdstation/sync', { headers: await authHeaders() })
      const j = await r.json()
      if (j.syncs) setHistorico(j.syncs)
    } catch {}
  }

  useEffect(() => { carregarHistorico() }, [])

  async function executar(action: string) {
    setRodando(action); setErro(null)
    try {
      const headers = await authHeaders()
      if (!usaEnv && token.trim()) headers['x-rd-token'] = token.trim()

      const r = await fetch('/api/rdstation/sync', {
        method: 'POST', headers, body: JSON.stringify({ action }),
      })
      const j = await r.json()

      if (!r.ok) { setErro(j.error || 'Erro desconhecido'); return }
      if (action === 'test') {
        if (j.ok) setErro(`✅ Conexão OK — ${j.total ?? '?'} contatos disponíveis`)
        else setErro(`❌ ${j.erro || 'Falhou'}`)
        return
      }
      if (j.resultados) setResultados(prev => ({ ...prev, ...j.resultados }))
      await carregarHistorico()
    } catch (e: any) {
      setErro(e?.message || 'Erro de rede')
    } finally {
      setRodando(null)
    }
  }

  function tempoAtras(d: string) {
    const diff = Date.now() - new Date(d).getTime()
    const min = Math.floor(diff / 60000)
    if (min < 1) return 'agora'
    if (min < 60) return `${min}min`
    const h = Math.floor(min / 60)
    if (h < 24) return `${h}h`
    return `${Math.floor(h / 24)}d`
  }

  const inp: React.CSSProperties = { background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontSize: 13, fontFamily: 'DM Sans,sans-serif', outline: 'none', width: '100%' }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ height: 56, borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', padding: '0 28px', background: 'rgba(10,22,40,0.7)', backdropFilter: 'blur(8px)', flexShrink: 0 }}>
        <div style={{ fontFamily: 'DM Serif Display,serif', fontSize: 18 }}>🔁 RD Station CRM — Importação</div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '28px' }}>
        <div style={{ maxWidth: 980, margin: '0 auto' }}>

          {/* Webhook — sincronização em tempo real */}
          <div className="card" style={{ marginBottom: 20, background: 'linear-gradient(135deg, rgba(28,181,160,0.08), rgba(74,128,240,0.06))' }}>
            <div style={{ fontFamily: 'DM Serif Display,serif', fontSize: 16, marginBottom: 8 }}>⚡ Sincronização em tempo real (Webhook)</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.6 }}>
              Configure no RD Station para que mudanças em negócios e contatos sejam refletidas aqui automaticamente, sem precisar rodar "Importar tudo" toda hora.
            </div>
            <div style={{ fontSize: 12, marginBottom: 6, color: 'var(--gold)' }}>URL do webhook (cole no RD Station):</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <input readOnly id="webhook-url" value={typeof window !== 'undefined' ? `${window.location.origin}/api/rdstation/webhook?secret=SEU_SECRET` : ''}
                style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontSize: 12, fontFamily: 'monospace', outline: 'none' }} />
              <button onClick={() => { const i = document.getElementById('webhook-url') as HTMLInputElement; if (i) { i.select(); document.execCommand('copy') } }}
                style={{ background: 'rgba(28,181,160,0.15)', border: '1px solid rgba(28,181,160,0.4)', borderRadius: 8, padding: '8px 14px', color: 'var(--teal)', cursor: 'pointer', fontFamily: 'DM Sans,sans-serif', fontSize: 12 }}>
                📋 Copiar
              </button>
            </div>
            <details style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              <summary style={{ cursor: 'pointer', color: 'var(--teal)' }}>Como configurar passo-a-passo</summary>
              <div style={{ marginTop: 10, lineHeight: 1.7 }}>
                <strong style={{ color: 'var(--text)' }}>1.</strong> Defina a env var <code style={{ background: 'rgba(255,255,255,0.06)', padding: '2px 6px', borderRadius: 4 }}>RDSTATION_WEBHOOK_SECRET</code> com um valor aleatório (ex: senha forte de 32+ caracteres) na Vercel e faça redeploy.<br/>
                <strong style={{ color: 'var(--text)' }}>2.</strong> Substitua <code>SEU_SECRET</code> na URL acima pelo valor da env var.<br/>
                <strong style={{ color: 'var(--text)' }}>3.</strong> No RD Station CRM, vá em <strong>Configurações → Integrações → Webhooks</strong> (ou "API" se for a versão antiga).<br/>
                <strong style={{ color: 'var(--text)' }}>4.</strong> Crie um novo webhook colando a URL e selecione os eventos: <em>deal_updated, deal_won, deal_lost, deal_created, deal_deleted, contact_updated, contact_created</em>.<br/>
                <strong style={{ color: 'var(--text)' }}>5.</strong> Salve e teste movendo um negócio no RD — ele deve aparecer atualizado aqui em segundos.<br/>
                <strong style={{ color: 'var(--text)' }}>6.</strong> Acompanhe o histórico abaixo: cada chamada do RD vira uma linha "webhook:&lt;evento&gt;".
              </div>
            </details>
          </div>

          {/* Token */}
          <div className="card" style={{ marginBottom: 20 }}>
            <div style={{ fontFamily: 'DM Serif Display,serif', fontSize: 16, marginBottom: 12 }}>🔑 Token de acesso</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10, lineHeight: 1.6 }}>
              Encontre seu token em <strong>RD Station CRM → Configurações → Integrações → Token de API</strong>.
              Para uso permanente, configure a variável de ambiente <code style={{ background: 'rgba(255,255,255,0.06)', padding: '2px 6px', borderRadius: 4 }}>RDSTATION_CRM_TOKEN</code> no servidor.
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer' }}>
                <input type="checkbox" checked={usaEnv} onChange={e => setUsaEnv(e.target.checked)} />
                Usar token do servidor (RDSTATION_CRM_TOKEN)
              </label>
            </div>
            {!usaEnv && (
              <input type="password" placeholder="Cole o token aqui (não será salvo)" value={token} onChange={e => setToken(e.target.value)} style={inp} />
            )}
            <div style={{ marginTop: 12 }}>
              <button onClick={() => executar('test')} disabled={!!rodando}
                style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 16px', color: 'var(--text)', cursor: rodando ? 'wait' : 'pointer', fontFamily: 'DM Sans,sans-serif', fontSize: 12 }}>
                {rodando === 'test' ? '⏳ Testando...' : '🔍 Testar conexão'}
              </button>
            </div>
          </div>

          {erro && (
            <div className="card" style={{ marginBottom: 20, borderColor: erro.startsWith('✅') ? 'rgba(28,181,160,0.4)' : 'rgba(224,82,82,0.4)', color: erro.startsWith('✅') ? 'var(--teal)' : 'var(--red)', fontSize: 13 }}>
              {erro}
            </div>
          )}

          {/* Importar tudo */}
          <div className="card" style={{ marginBottom: 20, background: 'linear-gradient(135deg, rgba(201,168,76,0.08), rgba(28,181,160,0.06))' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
              <div>
                <div style={{ fontFamily: 'DM Serif Display,serif', fontSize: 18, marginBottom: 4 }}>🚀 Importar tudo</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                  Sincroniza usuários → funis → contatos → negócios → atividades, na ordem correta.
                  Pode levar vários minutos. Re-execuções fazem upsert (não duplicam).
                </div>
              </div>
              <button className="btn-primary" onClick={() => executar('all')} disabled={!!rodando}
                style={{ padding: '12px 24px', fontSize: 14, whiteSpace: 'nowrap' }}>
                {rodando === 'all' ? '⏳ Sincronizando...' : '🚀 Importar tudo'}
              </button>
            </div>
          </div>

          {/* Recursos individuais */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px,1fr))', gap: 14, marginBottom: 28 }}>
            {RECURSOS.map(r => {
              const stats = resultados[r.key]
              const ativo = rodando === r.key || rodando === 'all'
              return (
                <div key={r.key} className="card">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <span style={{ fontSize: 22 }}>{r.emoji}</span>
                    <div style={{ fontFamily: 'DM Serif Display,serif', fontSize: 16 }}>{r.label}</div>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.5, minHeight: 32 }}>{r.descricao}</div>

                  {stats ? (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6, marginBottom: 12, fontSize: 11 }}>
                      <div style={{ textAlign: 'center' }}><div style={{ color: 'var(--text-muted)' }}>Lidos</div><div style={{ fontWeight: 700, fontSize: 14 }}>{stats.qtd_lidos}</div></div>
                      <div style={{ textAlign: 'center' }}><div style={{ color: 'var(--text-muted)' }}>Novos</div><div style={{ fontWeight: 700, fontSize: 14, color: 'var(--teal)' }}>{stats.qtd_criados}</div></div>
                      <div style={{ textAlign: 'center' }}><div style={{ color: 'var(--text-muted)' }}>Atualiz.</div><div style={{ fontWeight: 700, fontSize: 14, color: 'var(--gold)' }}>{stats.qtd_atualizados}</div></div>
                      <div style={{ textAlign: 'center' }}><div style={{ color: 'var(--text-muted)' }}>Erros</div><div style={{ fontWeight: 700, fontSize: 14, color: stats.qtd_erros > 0 ? 'var(--red)' : 'var(--text)' }}>{stats.qtd_erros}</div></div>
                    </div>
                  ) : null}

                  <button onClick={() => executar(r.key)} disabled={!!rodando}
                    style={{ width: '100%', background: 'rgba(28,181,160,0.1)', border: '1px solid rgba(28,181,160,0.3)', borderRadius: 8, padding: '8px', color: 'var(--teal)', cursor: rodando ? 'wait' : 'pointer', fontFamily: 'DM Sans,sans-serif', fontSize: 12, fontWeight: 500 }}>
                    {ativo ? '⏳ Importando...' : `Importar ${r.label.toLowerCase()}`}
                  </button>

                  {stats?.erros && stats.erros.length > 0 && (
                    <details style={{ marginTop: 10 }}>
                      <summary style={{ fontSize: 11, color: 'var(--red)', cursor: 'pointer' }}>{stats.erros.length} erro(s)</summary>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6, maxHeight: 120, overflow: 'auto' }}>
                        {stats.erros.map((e, i) => <div key={i}>• {e}</div>)}
                      </div>
                    </details>
                  )}
                </div>
              )
            })}
          </div>

          {/* Histórico */}
          <div className="card">
            <div style={{ fontFamily: 'DM Serif Display,serif', fontSize: 16, marginBottom: 14 }}>📜 Histórico de sincronizações</div>
            {historico.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Nenhuma sincronização realizada ainda.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {historico.map(h => (
                  <div key={h.id} style={{ display: 'grid', gridTemplateColumns: '120px 90px 1fr 80px', gap: 10, padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: 12, alignItems: 'center' }}>
                    <div style={{ fontWeight: 500 }}>{h.recurso}</div>
                    <div style={{ color: h.status === 'concluido' ? 'var(--teal)' : h.status === 'erro' ? 'var(--red)' : 'var(--gold)' }}>
                      {h.status}
                    </div>
                    <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                      {h.qtd_lidos} lidos · {h.qtd_criados} novos · {h.qtd_atualizados} atualiz. · {h.qtd_erros} erros
                    </div>
                    <div style={{ color: 'var(--text-muted)', fontSize: 11, textAlign: 'right' }}>{tempoAtras(h.iniciado_em)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}
