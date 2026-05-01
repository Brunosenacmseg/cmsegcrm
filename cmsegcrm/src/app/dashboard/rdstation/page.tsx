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
  { key: 'funis',      label: 'Funis',      emoji: '📊', descricao: 'Replica os funis e etapas do RD Station (nomes idênticos)' },
  { key: 'contatos',   label: 'Contatos',   emoji: '👤', descricao: 'Importa contatos como clientes (PF/PJ por CPF/CNPJ)' },
  { key: 'negocios',   label: 'Negócios',   emoji: '💼', descricao: 'Importa deals nos funis correspondentes' },
  { key: 'atividades', label: 'Atividades', emoji: '✅', descricao: 'Importa tarefas, ligações, e-mails e notas' },
]

// Recursos que precisam de fatiamento por janela de tempo (>10k limit da RD)
const RECURSOS_JANELA = new Set(['contatos', 'negocios', 'atividades', 'all'])

function dataDefaultInicio(): string {
  const d = new Date()
  d.setFullYear(d.getFullYear() - 5)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`
}

function dataHoje(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

// Gera lista de janelas mensais entre duas datas (YYYY-MM-DD)
function gerarJanelasMensais(inicio: string, fim: string): { from: string, to: string }[] {
  const janelas: { from: string, to: string }[] = []
  const [yi, mi] = inicio.split('-').map(Number)
  const [yf, mf] = fim.split('-').map(Number)
  let y = yi, m = mi
  while (y < yf || (y === yf && m <= mf)) {
    const ultimoDia = new Date(y, m, 0).getDate()
    const from = `${y}-${String(m).padStart(2,'0')}-01T00:00:00`
    const to   = `${y}-${String(m).padStart(2,'0')}-${String(ultimoDia).padStart(2,'0')}T23:59:59`
    janelas.push({ from, to })
    m++; if (m > 12) { m = 1; y++ }
    if (janelas.length > 600) break // segurança: 50 anos
  }
  return janelas
}

export default function RDStationPage() {
  const supabase = createClient()
  const [token, setToken]       = useState('')
  const [usaEnv, setUsaEnv]     = useState(true)
  const [rodando, setRodando]   = useState<string | null>(null)
  const [resultados, setResultados] = useState<Record<string, Stats>>({})
  const [historico, setHistorico]   = useState<Sync[]>([])
  const [erro, setErro]         = useState<string | null>(null)
  const [dataInicio, setDataInicio] = useState(dataDefaultInicio())
  const [dataFim, setDataFim]       = useState(dataHoje())
  const [progresso, setProgresso]   = useState<{ atual: number, total: number, mes: string } | null>(null)
  const [incluirDetalhes, setIncluirDetalhes] = useState(false)
  const [oauth, setOauth] = useState<{ conectado: boolean; expiraEm?: string; clientIdConfigurado: boolean } | null>(null)

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

  async function carregarOAuth() {
    try {
      const r = await fetch('/api/rdstation/oauth/status', { headers: await authHeaders() })
      const j = await r.json()
      if (!j.error) setOauth(j)
    } catch {}
  }

  async function desconectarOAuth() {
    if (!confirm('Desconectar a conta RD Station? Os webhooks no RD continuarão ativos, mas você precisará reconectar para criar novos.')) return
    try {
      await fetch('/api/rdstation/oauth/status', { method: 'DELETE', headers: await authHeaders() })
      await carregarOAuth()
    } catch {}
  }

  useEffect(() => {
    carregarHistorico(); carregarOAuth()
    // Mensagens vindas do callback OAuth
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      if (params.get('oauth_ok')) {
        setErro('✅ Conta RD Station conectada com sucesso!')
        window.history.replaceState({}, '', window.location.pathname)
      } else if (params.get('oauth_erro')) {
        setErro('❌ Erro OAuth: ' + params.get('oauth_erro'))
        window.history.replaceState({}, '', window.location.pathname)
      }
    }
  }, [])

  async function chamarSync(action: string, from?: string, to?: string): Promise<any> {
    const headers = await authHeaders()
    if (!usaEnv && token.trim()) headers['x-rd-token'] = token.trim()
    const r = await fetch('/api/rdstation/sync', {
      method: 'POST', headers, body: JSON.stringify({ action, from, to, detalhes: incluirDetalhes }),
    })
    // Vercel devolve HTML genérico ("An error occurred...") em timeouts/500.
    // Não jogamos JSON.parse direto pra não quebrar com SyntaxError.
    const txt = await r.text()
    let json: any
    try { json = JSON.parse(txt) }
    catch {
      // Heurística: detecta timeout do Vercel / página de erro
      const ehTimeout = /timeout|504|gateway|an error o/i.test(txt)
      json = {
        error: ehTimeout
          ? 'Timeout no servidor (Vercel mata em ~60s no plano free / 300s no pro). Use janela mensal menor ou desmarque "incluir detalhes".'
          : 'Resposta inválida do servidor: ' + txt.slice(0, 120)
      }
    }
    return { ok: r.ok, json }
  }

  function acumular(prev: Stats | undefined, novo: Stats): Stats {
    return {
      qtd_lidos: (prev?.qtd_lidos || 0) + (novo.qtd_lidos || 0),
      qtd_criados: (prev?.qtd_criados || 0) + (novo.qtd_criados || 0),
      qtd_atualizados: (prev?.qtd_atualizados || 0) + (novo.qtd_atualizados || 0),
      qtd_erros: (prev?.qtd_erros || 0) + (novo.qtd_erros || 0),
      erros: [...(prev?.erros || []), ...(novo.erros || [])].slice(0, 50),
    }
  }

  async function executar(action: string) {
    setRodando(action); setErro(null); setProgresso(null)
    try {
      // Test: chamada simples
      if (action === 'test') {
        const { ok, json } = await chamarSync(action)
        if (!ok) { setErro(json.error || 'Erro desconhecido'); return }
        if (json.ok) setErro(`✅ Conexão OK — ${json.total ?? '?'} contatos disponíveis`)
        else setErro(`❌ ${json.erro || 'Falhou'}`)
        return
      }

      // Recursos pequenos (sem janela): chamada única
      if (!RECURSOS_JANELA.has(action)) {
        const { ok, json } = await chamarSync(action)
        if (!ok) { setErro(json.error || 'Erro desconhecido'); return }
        if (json.resultados) setResultados(prev => ({ ...prev, ...json.resultados }))
        await carregarHistorico()
        return
      }

      // Recursos grandes: fatia por mês
      const janelas = gerarJanelasMensais(dataInicio, dataFim)
      setProgresso({ atual: 0, total: janelas.length, mes: '' })

      // Para "all": primeiro processa usuarios e funis (sem janela)
      if (action === 'all') {
        await chamarSync('usuarios')
        await chamarSync('funis')
        await carregarHistorico()
      }

      // Quais recursos iterar mês a mês
      const recursosIterar = action === 'all'
        ? ['contatos', 'negocios', 'atividades']
        : [action]

      // Itera de trás pra frente (mais recente primeiro)
      for (let i = janelas.length - 1; i >= 0; i--) {
        const j = janelas[i]
        const mes = j.from.slice(0, 7)
        setProgresso({ atual: janelas.length - i, total: janelas.length, mes })

        for (const rec of recursosIterar) {
          const { ok, json } = await chamarSync(rec, j.from, j.to)
          if (!ok) {
            setErro(`Erro em ${rec} ${mes}: ${json.error || 'desconhecido'}`)
            continue
          }
          const stats = json?.resultados?.[rec]
          if (stats) {
            setResultados(prev => ({ ...prev, [rec]: acumular(prev[rec], stats) }))
          }
        }
      }

      await carregarHistorico()
      setProgresso(null)
    } catch (e: any) {
      setErro(e?.message || 'Erro de rede')
    } finally {
      setRodando(null)
    }
  }

  async function criarWebhooksAutomatico() {
    setRodando('setup-webhooks'); setErro(null)
    try {
      const headers = await authHeaders()
      if (!usaEnv && token.trim()) headers['x-rd-token'] = token.trim()
      const r = await fetch('/api/rdstation/webhook/setup', { method: 'POST', headers })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setErro(j?.error || `Erro HTTP ${r.status}`); return }

      try {
        const lista = Array.isArray(j?.resultados) ? j.resultados : []
        const sucessos = lista.filter((x: any) => x?.ok).length
        const total = lista.length

        if (total === 0) {
          setErro(`⚠️ Resposta sem resultados. Resposta crua: ${JSON.stringify(j).slice(0, 400)}`)
          return
        }

        if (sucessos === total) {
          setErro(`✅ ${sucessos}/${total} webhooks criados! URL: ${j?.webhookUrl || '?'}`)
        } else {
          // Pega só o primeiro erro completo (todos costumam ser iguais quando schema está errado)
          const primeiroErro = lista.find((x: any) => !x?.ok)
          if (primeiroErro) {
            const v1 = primeiroErro.v1_status ? `v1 HTTP ${primeiroErro.v1_status}: ${typeof primeiroErro.v1_resposta === 'string' ? primeiroErro.v1_resposta : JSON.stringify(primeiroErro.v1_resposta)}` : ''
            const v2 = primeiroErro.v2_status ? `v2 HTTP ${primeiroErro.v2_status}: ${typeof primeiroErro.v2_resposta === 'string' ? primeiroErro.v2_resposta : JSON.stringify(primeiroErro.v2_resposta)}` : ''
            const det = [v1, v2].filter(Boolean).join('\n\n') || JSON.stringify(primeiroErro)
            const prefixo = sucessos > 0 ? `⚠️ ${sucessos}/${total} criados.` : `❌ Nenhum criado.`
            setErro(`${prefixo}\nErro completo (todos foram iguais):\n${det}`)
          }
        }
      } catch (parseErr: any) {
        setErro(`Resposta recebida mas erro ao formatar: ${parseErr?.message}. Resposta: ${JSON.stringify(j).substring(0, 400)}`)
      }
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

          {/* OAuth — Conexão com RD Station v2 */}
          <div className="card" style={{ marginBottom: 20, background: oauth?.conectado ? 'linear-gradient(135deg, rgba(28,181,160,0.10), rgba(28,181,160,0.04))' : 'linear-gradient(135deg, rgba(224,82,82,0.06), rgba(201,168,76,0.04))' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 280 }}>
                <div style={{ fontFamily: 'DM Serif Display,serif', fontSize: 16, marginBottom: 4 }}>
                  🔐 Conexão OAuth (API v2 do RD)
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                  {oauth?.conectado ? (
                    <>✅ Conta conectada · access_token válido até <strong>{oauth.expiraEm ? new Date(oauth.expiraEm).toLocaleString('pt-BR') : '?'}</strong> (renova sozinho)</>
                  ) : !oauth?.clientIdConfigurado ? (
                    <>⚠️ Configure as env vars <code style={{ background: 'rgba(255,255,255,0.06)', padding: '1px 5px', borderRadius: 3 }}>RDSTATION_OAUTH_CLIENT_ID</code> e <code style={{ background: 'rgba(255,255,255,0.06)', padding: '1px 5px', borderRadius: 3 }}>RDSTATION_OAUTH_CLIENT_SECRET</code> na Vercel (instruções abaixo)</>
                  ) : (
                    <>Necessário para criar/gerenciar webhooks da v2 e para acessar endpoints v2 da API.</>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {oauth?.conectado && (
                  <button onClick={desconectarOAuth}
                    style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 14px', color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'DM Sans,sans-serif', fontSize: 12 }}>
                    Desconectar
                  </button>
                )}
                {oauth?.clientIdConfigurado && (
                  <a href="/api/rdstation/oauth/start"
                    style={{ background: oauth?.conectado ? 'rgba(28,181,160,0.12)' : 'linear-gradient(135deg, var(--gold), var(--teal))', border: oauth?.conectado ? '1px solid rgba(28,181,160,0.4)' : 'none', borderRadius: 8, padding: '10px 18px', color: oauth?.conectado ? 'var(--teal)' : '#0a1628', cursor: 'pointer', fontFamily: 'DM Sans,sans-serif', fontSize: 13, fontWeight: 600, textDecoration: 'none', display: 'inline-block' }}>
                    {oauth?.conectado ? '🔄 Reconectar' : '🔗 Conectar conta RD Station'}
                  </a>
                )}
              </div>
            </div>

            <details style={{ marginTop: 14, fontSize: 12, color: 'var(--text-muted)' }}>
              <summary style={{ cursor: 'pointer', color: 'var(--gold)' }}>Como configurar as credenciais OAuth (passo-a-passo)</summary>
              <div style={{ marginTop: 12, lineHeight: 1.7 }}>
                <strong style={{ color: 'var(--text)' }}>1.</strong> Acesse o portal de desenvolvedores: <a href="https://appstore.rdstation.com/pt-BR/publisher" target="_blank" rel="noopener" style={{ color: 'var(--teal)' }}>appstore.rdstation.com/pt-BR/publisher</a><br/>
                <strong style={{ color: 'var(--text)' }}>2.</strong> Crie um novo aplicativo (tipo: Privado/Interno se for só pra você). Selecione <strong>RD Station CRM</strong> como produto.<br/>
                <strong style={{ color: 'var(--text)' }}>3.</strong> Em <strong>Redirect URI</strong>, cole:
                <div style={{ marginTop: 4, padding: '6px 10px', background: 'rgba(255,255,255,0.05)', borderRadius: 6, fontFamily: 'monospace', fontSize: 11, color: 'var(--text)' }}>
                  {typeof window !== 'undefined' ? `${window.location.origin}/api/rdstation/oauth/callback` : ''}
                </div>
                <strong style={{ color: 'var(--text)' }}>4.</strong> Salve e copie o <code>Client ID</code> e <code>Client Secret</code>.<br/>
                <strong style={{ color: 'var(--text)' }}>5.</strong> Na Vercel (Settings → Environment Variables), adicione:
                <div style={{ marginLeft: 16, marginTop: 4 }}>
                  • <code>RDSTATION_OAUTH_CLIENT_ID</code> = (Client ID)<br/>
                  • <code>RDSTATION_OAUTH_CLIENT_SECRET</code> = (Client Secret)
                </div>
                <strong style={{ color: 'var(--text)' }}>6.</strong> Faça <strong>Redeploy</strong> na Vercel para aplicar.<br/>
                <strong style={{ color: 'var(--text)' }}>7.</strong> Volte aqui e clique em <strong>Conectar conta RD Station</strong> — vai abrir o RD Station pra autorizar.<br/>
                <strong style={{ color: 'var(--text)' }}>8.</strong> Após autorizar, você volta automaticamente. Aí clique em <strong>✨ Criar 6 webhooks no RD automaticamente</strong> abaixo.
              </div>
            </details>
          </div>

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

            <div style={{ marginTop: 14, padding: 12, background: 'rgba(201,168,76,0.06)', border: '1px solid rgba(201,168,76,0.2)', borderRadius: 8 }}>
              <div style={{ fontSize: 12, color: 'var(--gold)', marginBottom: 8, fontWeight: 600 }}>🤖 Criar webhooks automaticamente (API v2)</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10, lineHeight: 1.5 }}>
                Tenta criar os 6 webhooks (deal_*, contact_*) na sua conta RD via API. Requer <code>RDSTATION_CRM_TOKEN</code> e <code>RDSTATION_WEBHOOK_SECRET</code> configurados na Vercel.
                Se seu token for da v1 e a API v2 rejeitar, você precisará de um token OAuth (te aviso).
              </div>
              <button onClick={criarWebhooksAutomatico} disabled={!!rodando}
                style={{ background: 'rgba(201,168,76,0.15)', border: '1px solid rgba(201,168,76,0.4)', borderRadius: 8, padding: '8px 16px', color: 'var(--gold)', cursor: rodando ? 'wait' : 'pointer', fontFamily: 'DM Sans,sans-serif', fontSize: 12, fontWeight: 500 }}>
                {rodando === 'setup-webhooks' ? '⏳ Criando webhooks...' : '✨ Criar 6 webhooks no RD automaticamente'}
              </button>
            </div>
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

          {/* Janela de datas */}
          <div className="card" style={{ marginBottom: 20 }}>
            <div style={{ fontFamily: 'DM Serif Display,serif', fontSize: 16, marginBottom: 10 }}>📅 Janela de importação</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.6 }}>
              A API do RD limita 10.000 registros por consulta — fatiamos por mês para pegar tudo. Defina a janela de datas (recomendado: do início da sua conta no RD até hoje).
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>De:
                <input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)}
                  style={{ marginLeft: 6, background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 10px', color: 'var(--text)', fontSize: 12, outline: 'none' }} />
              </label>
              <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>Até:
                <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)}
                  style={{ marginLeft: 6, background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 10px', color: 'var(--text)', fontSize: 12, outline: 'none' }} />
              </label>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {gerarJanelasMensais(dataInicio, dataFim).length} meses serão processados
              </span>
            </div>
            <div style={{ marginTop: 12 }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer' }}>
                <input type="checkbox" checked={incluirDetalhes} onChange={e => setIncluirDetalhes(e.target.checked)} />
                Incluir notas e campos adicionais (mais lento — 1 request extra por deal, pode estourar timeout do Vercel)
              </label>
            </div>
          </div>

          {/* Importar tudo */}
          <div className="card" style={{ marginBottom: 20, background: 'linear-gradient(135deg, rgba(201,168,76,0.08), rgba(28,181,160,0.06))' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
              <div>
                <div style={{ fontFamily: 'DM Serif Display,serif', fontSize: 18, marginBottom: 4 }}>🚀 Importar tudo</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                  Sincroniza usuários → funis → contatos → negócios → atividades, na ordem correta, mês a mês.
                  Pode levar vários minutos. Re-execuções fazem upsert (não duplicam).
                </div>
              </div>
              <button className="btn-primary" onClick={() => executar('all')} disabled={!!rodando}
                style={{ padding: '12px 24px', fontSize: 14, whiteSpace: 'nowrap' }}>
                {rodando === 'all' ? '⏳ Sincronizando...' : '🚀 Importar tudo'}
              </button>
            </div>

            {progresso && (
              <div style={{ marginTop: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 12 }}>
                  <span>Mês atual: <strong style={{ color: 'var(--gold)' }}>{progresso.mes || '-'}</strong></span>
                  <span style={{ color: 'var(--teal)', fontWeight: 600 }}>{progresso.atual} / {progresso.total} ({Math.round((progresso.atual / progresso.total) * 100)}%)</span>
                </div>
                <div style={{ height: 8, background: 'rgba(255,255,255,0.08)', borderRadius: 8, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${(progresso.atual / progresso.total) * 100}%`, background: 'linear-gradient(90deg,var(--teal),var(--gold))', borderRadius: 8, transition: 'width 0.3s' }} />
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>Não feche esta aba. A importação continua em segundo plano para cada mês.</div>
              </div>
            )}
          </div>

          {/* Resetar negócios — destrutivo */}
          <div className="card" style={{ marginBottom: 20, borderColor: 'rgba(224,82,82,0.3)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
              <div>
                <div style={{ fontFamily: 'DM Serif Display,serif', fontSize: 16, marginBottom: 4, color: 'var(--red)' }}>🗑 Resetar negócios</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                  Apaga TODOS os negócios cadastrados (cards dos funis). Tarefas e histórico vinculados serão removidos por cascata. Apólices têm o vínculo desfeito (mas não são apagadas).
                  Use antes de uma re-importação completa para evitar duplicidade ou estado inconsistente.
                </div>
              </div>
              <button onClick={async () => {
                  const txt = prompt('Tem certeza? Esta ação NÃO PODE ser desfeita.\n\nDigite "RESETAR NEGOCIOS" para confirmar:')
                  if (txt !== 'RESETAR NEGOCIOS') return
                  setRodando('purge'); setErro(null)
                  try {
                    const r = await fetch('/api/rdstation/purge', { method:'POST', headers: await authHeaders(), body: JSON.stringify({ confirm:'RESETAR NEGOCIOS' }) })
                    const j = await r.json()
                    if (!r.ok) { setErro(j.error || 'Erro ao resetar'); return }
                    setErro(`✅ ${j.apagados} negócio(s) apagado(s). Agora rode "Importar negócios".`)
                  } catch (e: any) { setErro(e?.message || 'Erro de rede') }
                  finally { setRodando(null) }
                }}
                disabled={!!rodando}
                style={{ padding: '10px 18px', fontSize: 13, whiteSpace: 'nowrap', borderRadius: 8, border: '1px solid rgba(224,82,82,0.5)', background: 'rgba(224,82,82,0.1)', color: 'var(--red)', cursor: rodando ? 'wait' : 'pointer', fontFamily: 'DM Sans,sans-serif', fontWeight: 600 }}>
                {rodando === 'purge' ? '⏳ Apagando...' : '🗑 Resetar negócios'}
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
