'use client'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function SheetsCobrancaPage() {
  const supabase = createClient()
  const router = useRouter()
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [showToken, setShowToken] = useState(false)

  const [config, setConfig] = useState<any>(null)
  const [funis, setFunis] = useState<any[]>([])
  const [logs, setLogs] = useState<any[]>([])
  const [usuarios, setUsuarios] = useState<any[]>([])

  const [form, setForm] = useState({
    ativo: false,
    funil_id: '',
    etapa_padrao: '',
    vendedor_padrao_id: '',
    spreadsheet_url: '',
  })

  useEffect(() => { init() }, [])

  async function authHeaders() {
    const { data: { session } } = await supabase.auth.getSession()
    const h: Record<string, string> = { 'Content-Type': 'application/json' }
    if (session?.access_token) h['Authorization'] = `Bearer ${session.access_token}`
    return h
  }

  async function init() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    const { data: prof } = await supabase.from('users').select('*').eq('id', user.id).single()
    setProfile(prof)
    if ((prof as any)?.role !== 'admin') { setLoading(false); return }

    const { data: us } = await supabase.from('users').select('id, nome, email').order('nome')
    setUsuarios(us || [])

    await recarregar()
    setLoading(false)
  }

  async function recarregar() {
    const r = await fetch('/api/integracoes/sheets-cobranca/config', { headers: await authHeaders() })
    const j = await r.json()
    if (j.config) {
      setConfig(j.config)
      setForm({
        ativo:                !!j.config.ativo,
        funil_id:             j.config.funil_id || '',
        etapa_padrao:         j.config.etapa_padrao || '',
        vendedor_padrao_id:   j.config.vendedor_padrao_id || '',
        spreadsheet_url:      j.config.spreadsheet_url || '',
      })
    }
    setFunis(j.funis || [])
    setLogs(j.logs || [])
  }

  async function salvar(extra: any = {}) {
    setSalvando(true); setMsg(null)
    try {
      const body = { ...form, ...extra }
      const r = await fetch('/api/integracoes/sheets-cobranca/config', {
        method: 'POST', headers: await authHeaders(), body: JSON.stringify(body),
      })
      const j = await r.json()
      if (!r.ok) { setMsg('❌ ' + (j.error || 'erro')); return }
      setMsg('✅ Configuração salva')
      await recarregar()
    } finally { setSalvando(false) }
  }

  async function gerarToken() {
    if (config?.webhook_token && !confirm('Já existe um token. Gerar um novo invalida o atual e o Apps Script vai parar de funcionar até você atualizar o token lá. Continuar?')) return
    await salvar({ regenerar_token: true })
  }

  async function desativar() {
    if (!confirm('Desativar a integração e apagar o token?')) return
    setSalvando(true)
    const r = await fetch('/api/integracoes/sheets-cobranca/config', { method: 'DELETE', headers: await authHeaders() })
    if (r.ok) { setMsg('Integração desativada'); await recarregar() }
    setSalvando(false)
  }

  function copiar(txt: string) {
    try { navigator.clipboard.writeText(txt); setMsg('📋 Copiado'); setTimeout(()=> setMsg(null), 1500) } catch {}
  }

  // ─── derivados ─────────────────────────────────────────────────
  const webhookUrl = useMemo(() => {
    if (typeof window === 'undefined') return ''
    return `${window.location.protocol}//${window.location.host}/api/integracoes/sheets-cobranca/webhook`
  }, [])

  const funilSel  = funis.find(f => f.id === form.funil_id) || null
  const etapas    = (funilSel?.etapas || []) as string[]

  const appsScript = useMemo(() => {
    return `// Apps Script para Google Sheets → Funil Cobrança
// 1) Cole esse código em Extensões → Apps Script da sua planilha
// 2) Defina as constantes WEBHOOK_URL e TOKEN abaixo
// 3) Em Acionadores (gatilho), adicione: De planilha → Ao alterar (onChange)
//    OU: Ao enviar formulário (onFormSubmit) se a planilha vem de um Form

const WEBHOOK_URL = ${JSON.stringify(webhookUrl)};
const TOKEN       = ${JSON.stringify(config?.webhook_token || 'COLE_O_TOKEN_AQUI')};

function enviarLinha(linha, headers, rowIndex) {
  const obj = {};
  headers.forEach((h, i) => { if (h) obj[String(h).toLowerCase().trim().replace(/\\s+/g,'_')] = linha[i]; });
  const sheetId = SpreadsheetApp.getActiveSpreadsheet().getId();
  obj.row_id = sheetId + ':' + (rowIndex || '');
  const resp = UrlFetchApp.fetch(WEBHOOK_URL, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'X-Sheet-Token': TOKEN },
    payload: JSON.stringify(obj),
    muteHttpExceptions: true,
  });
  console.log(resp.getResponseCode(), resp.getContentText());
}

// onChange — dispara quando linhas são inseridas/editadas
function onChange(e) {
  const sh = SpreadsheetApp.getActiveSheet();
  const dados = sh.getDataRange().getValues();
  if (dados.length < 2) return;
  const headers = dados[0];
  // Envia apenas a última linha não vazia (assume novas linhas no final)
  for (let i = dados.length - 1; i >= 1; i--) {
    if (dados[i].some(c => c !== '' && c !== null)) {
      enviarLinha(dados[i], headers, i + 1);
      break;
    }
  }
}

// onFormSubmit — quando a planilha é alimentada por um Google Form
function onFormSubmit(e) {
  const sh = e.range.getSheet();
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  enviarLinha(e.values, headers, e.range.getRow());
}

// reenviarTudo — utilitário manual: reenvia todas as linhas (usa row_id pra deduplicar)
function reenviarTudo() {
  const sh = SpreadsheetApp.getActiveSheet();
  const dados = sh.getDataRange().getValues();
  if (dados.length < 2) return;
  const headers = dados[0];
  for (let i = 1; i < dados.length; i++) {
    if (dados[i].some(c => c !== '' && c !== null)) enviarLinha(dados[i], headers, i + 1);
  }
}`
  }, [webhookUrl, config?.webhook_token])

  // ─── UI ────────────────────────────────────────────────────────
  const inp: React.CSSProperties = { width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 13px', color: 'var(--text)', fontSize: 13, fontFamily: 'DM Sans,sans-serif', outline: 'none', boxSizing: 'border-box' }
  const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 600, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--text-muted)', display: 'block', marginBottom: 5 }
  const card: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }
  const btn: React.CSSProperties = { padding: '9px 16px', border: '1px solid var(--border)', borderRadius: 8, background: 'transparent', color: 'var(--text)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans,sans-serif' }
  const btnPrim: React.CSSProperties = { ...btn, background: 'var(--accent)', borderColor: 'var(--accent)', color: '#000' }

  if (loading) return <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>Carregando…</div>
  if (profile?.role !== 'admin') return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 10, color: 'var(--text-muted)' }}>
      <div style={{ fontSize: 40 }}>🔒</div>
      <div>Apenas administradores podem configurar integrações.</div>
    </div>
  )

  return (
    <div style={{ padding: 24, maxWidth: 980, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>📥 Cobrança · Google Sheets</h1>
        <p style={{ margin: '6px 0 0', color: 'var(--text-muted)', fontSize: 13 }}>
          Cada linha nova na planilha vira uma negociação no funil de cobrança.
          O Apps Script da sua planilha envia os dados pra um webhook protegido por token.
        </p>
      </div>

      {msg && <div style={{ padding: '10px 14px', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13 }}>{msg}</div>}

      {/* ── Status / token ── */}
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: 15 }}>Status da integração</h3>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={form.ativo}
              onChange={e => { const ativo = e.target.checked; setForm(f => ({ ...f, ativo })); salvar({ ativo }) }}
            />
            <span style={{ color: form.ativo ? '#48d597' : 'var(--text-muted)', fontWeight: 600 }}>
              {form.ativo ? '✓ Ativa' : 'Desativada'}
            </span>
          </label>
        </div>

        <div style={{ display: 'grid', gap: 12 }}>
          <div>
            <label style={lbl}>Webhook URL</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input style={inp} readOnly value={webhookUrl} />
              <button style={btn} onClick={()=>copiar(webhookUrl)}>Copiar</button>
            </div>
          </div>

          <div>
            <label style={lbl}>Token (segredo) · enviar como header X-Sheet-Token</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                style={inp}
                type={showToken ? 'text' : 'password'}
                readOnly
                value={config?.webhook_token || ''}
                placeholder="(nenhum token gerado ainda)"
              />
              <button style={btn} onClick={()=> setShowToken(s=>!s)}>{showToken ? 'Ocultar' : 'Mostrar'}</button>
              <button style={btn} onClick={()=> copiar(config?.webhook_token || '')} disabled={!config?.webhook_token}>Copiar</button>
              <button style={btnPrim} onClick={gerarToken} disabled={salvando}>
                {config?.webhook_token ? 'Regenerar' : 'Gerar token'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Configuração ── */}
      <div style={card}>
        <h3 style={{ margin: '0 0 14px', fontSize: 15 }}>Onde criar as negociações</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={lbl}>Funil (cobrança)</label>
            <select style={inp} value={form.funil_id} onChange={e=> setForm(f => ({ ...f, funil_id: e.target.value, etapa_padrao: '' }))}>
              <option value="">— escolher —</option>
              {funis.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Etapa padrão</label>
            <select style={inp} value={form.etapa_padrao} onChange={e=> setForm(f => ({ ...f, etapa_padrao: e.target.value }))}>
              <option value="">— primeira etapa —</option>
              {etapas.map(et => <option key={et} value={et}>{et}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Corretor / vendedor padrão (opcional)</label>
            <select style={inp} value={form.vendedor_padrao_id} onChange={e=> setForm(f => ({ ...f, vendedor_padrao_id: e.target.value }))}>
              <option value="">— sem dono —</option>
              {usuarios.map(u => <option key={u.id} value={u.id}>{u.nome || u.email}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Link da planilha (referência)</label>
            <input style={inp} value={form.spreadsheet_url} onChange={e=> setForm(f => ({ ...f, spreadsheet_url: e.target.value }))} placeholder="https://docs.google.com/spreadsheets/…" />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'flex-end' }}>
          <button style={btn} onClick={desativar} disabled={salvando}>Desativar</button>
          <button style={btnPrim} onClick={()=>salvar()} disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar'}</button>
        </div>
      </div>

      {/* ── Apps Script ── */}
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 10 }}>
          <h3 style={{ margin: 0, fontSize: 15 }}>Apps Script (cole na sua planilha)</h3>
          <button style={btn} onClick={()=> copiar(appsScript)}>Copiar código</button>
        </div>
        <p style={{ margin: '0 0 10px', color: 'var(--text-muted)', fontSize: 12 }}>
          Vá em <b>Extensões → Apps Script</b> da sua planilha, cole o código abaixo e salve.
          Em <b>Acionadores</b> adicione: <i>De planilha → Ao alterar</i> (ou <i>Ao enviar formulário</i>, se vier de um Google Form).
          Cabeçalhos esperados (case-insensitive): <code>nome, cpf_cnpj, telefone, email, valor, vencimento, produto, seguradora, obs</code>.
        </p>
        <pre style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border)', borderRadius: 8, padding: 12, fontSize: 11.5, lineHeight: 1.45, overflow: 'auto', maxHeight: 360, margin: 0 }}>
{appsScript}
        </pre>
      </div>

      {/* ── Estatísticas ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
        <div style={card}>
          <div style={{ color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>Recebidos</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{config?.total_recebidos ?? 0}</div>
        </div>
        <div style={card}>
          <div style={{ color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>Negociações criadas</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{config?.total_criados ?? 0}</div>
        </div>
        <div style={card}>
          <div style={{ color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>Última execução</div>
          <div style={{ fontSize: 13 }}>{config?.ultima_execucao ? new Date(config.ultima_execucao).toLocaleString('pt-BR') : '—'}</div>
        </div>
      </div>

      {/* ── Logs ── */}
      <div style={card}>
        <h3 style={{ margin: '0 0 10px', fontSize: 15 }}>Últimas linhas recebidas</h3>
        {logs.length === 0
          ? <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Nenhuma linha recebida ainda.</div>
          : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: 'var(--text-muted)' }}>
                    <th style={{ padding: 6 }}>Quando</th>
                    <th style={{ padding: 6 }}>Status</th>
                    <th style={{ padding: 6 }}>Linha (ID)</th>
                    <th style={{ padding: 6 }}>Resumo</th>
                    <th style={{ padding: 6 }}>Erro</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map(l => {
                    const p = l.payload || {}
                    const resumo = [p.nome, p.cpf_cnpj, p.valor].filter(Boolean).join(' · ')
                    const cor = l.status === 'ok' ? '#48d597' : l.status === 'duplicado' ? '#c9a84c' : '#e05252'
                    return (
                      <tr key={l.id} style={{ borderTop: '1px solid var(--border)' }}>
                        <td style={{ padding: 6, whiteSpace: 'nowrap' }}>{new Date(l.created_at).toLocaleString('pt-BR')}</td>
                        <td style={{ padding: 6, color: cor, fontWeight: 600 }}>{l.status}</td>
                        <td style={{ padding: 6, fontFamily: 'monospace', fontSize: 11 }}>{l.external_id || '—'}</td>
                        <td style={{ padding: 6 }}>{resumo || '—'}</td>
                        <td style={{ padding: 6, color: '#e05252' }}>{l.erro || ''}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )
        }
      </div>
    </div>
  )
}
