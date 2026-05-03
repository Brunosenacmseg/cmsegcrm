'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Conta = {
  id?: string
  from_email: string
  from_nome?: string
  assinatura?: string
  smtp_host: string
  smtp_port: number
  smtp_secure: boolean
  smtp_user: string
  imap_host?: string
  imap_port?: number
  imap_secure?: boolean
  imap_user?: string
  ativo?: boolean
  ultimo_teste_em?: string
  ultimo_teste_ok?: boolean
  ultimo_teste_msg?: string
}

const VAZIO: Conta = {
  from_email: '', from_nome: '', assinatura: '',
  smtp_host: '', smtp_port: 587, smtp_secure: false, smtp_user: '',
  imap_host: '', imap_port: 993, imap_secure: true, imap_user: '',
  ativo: true,
}

const PRESETS: Array<{ nome: string; smtp_host: string; smtp_port: number; smtp_secure: boolean; imap_host: string }> = [
  { nome: 'Gmail / Google Workspace', smtp_host: 'smtp.gmail.com',     smtp_port: 587, smtp_secure: false, imap_host: 'imap.gmail.com' },
  { nome: 'Outlook / Microsoft 365',  smtp_host: 'smtp.office365.com', smtp_port: 587, smtp_secure: false, imap_host: 'outlook.office365.com' },
  { nome: 'Locaweb',                  smtp_host: 'email-ssl.com.br',   smtp_port: 465, smtp_secure: true,  imap_host: 'imap.email-ssl.com.br' },
  { nome: 'UOL Host',                 smtp_host: 'smtps.uhserver.com', smtp_port: 465, smtp_secure: true,  imap_host: 'imap.uhserver.com' },
]

export default function EmailPage() {
  const supabase = createClient()
  const [aba, setAba] = useState<'config'|'enviar'|'historico'>('config')
  const [conta, setConta] = useState<Conta>(VAZIO)
  const [novaSenha, setNovaSenha] = useState('')
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [testando, setTestando] = useState(false)
  const [msg, setMsg] = useState<{ tipo: 'ok'|'err'; texto: string } | null>(null)
  const temConta = !!conta.id

  // Enviar
  const [envio, setEnvio] = useState({ para: '', cc: '', bcc: '', assunto: '', corpo: '' })
  const [enviando, setEnviando] = useState(false)

  const [historico, setHistorico] = useState<any[]>([])

  useEffect(() => { carregarConta() }, [])
  useEffect(() => { if (aba === 'historico') carregarHistorico() }, [aba])

  async function authHeaders(): Promise<Record<string, string>> {
    const { data } = await supabase.auth.getSession()
    return {
      'content-type': 'application/json',
      authorization: `Bearer ${data.session?.access_token || ''}`,
    }
  }

  async function carregarConta() {
    setCarregando(true)
    try {
      const r = await fetch('/api/email/conta', { headers: await authHeaders() })
      const j = await r.json()
      if (j.conta) setConta({ ...VAZIO, ...j.conta })
    } finally { setCarregando(false) }
  }

  async function carregarHistorico() {
    const { data } = await supabase
      .from('emails_enviados')
      .select('id,para,assunto,status,erro,enviado_em,criado_em')
      .order('criado_em', { ascending: false })
      .limit(50)
    setHistorico(data || [])
  }

  function aplicarPreset(p: typeof PRESETS[number]) {
    setConta(c => ({ ...c, smtp_host: p.smtp_host, smtp_port: p.smtp_port, smtp_secure: p.smtp_secure, imap_host: p.imap_host }))
  }

  async function salvar() {
    setSalvando(true); setMsg(null)
    try {
      const body: any = { ...conta }
      if (novaSenha) body.smtp_pass = novaSenha
      const r = await fetch('/api/email/conta', {
        method: 'POST', headers: await authHeaders(), body: JSON.stringify(body),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.erro || 'falha ao salvar')
      setConta({ ...VAZIO, ...j.conta })
      setNovaSenha('')
      setMsg({ tipo: 'ok', texto: 'Conta salva com sucesso.' })
    } catch (e: any) {
      setMsg({ tipo: 'err', texto: e?.message || String(e) })
    } finally { setSalvando(false) }
  }

  async function testar() {
    setTestando(true); setMsg(null)
    try {
      const body: any = {}
      if (novaSenha) body.smtp_pass = novaSenha
      const r = await fetch('/api/email/testar', {
        method: 'POST', headers: await authHeaders(), body: JSON.stringify(body),
      })
      const j = await r.json()
      if (!r.ok || !j.ok) throw new Error(j.erro || 'falha no teste')
      setMsg({ tipo: 'ok', texto: 'Conexão SMTP validada com sucesso.' })
      carregarConta()
    } catch (e: any) {
      setMsg({ tipo: 'err', texto: 'Teste falhou: ' + (e?.message || String(e)) })
    } finally { setTestando(false) }
  }

  async function excluir() {
    if (!confirm('Remover sua conta de email do CRM?')) return
    const r = await fetch('/api/email/conta', { method: 'DELETE', headers: await authHeaders() })
    if (r.ok) { setConta(VAZIO); setMsg({ tipo: 'ok', texto: 'Conta removida.' }) }
  }

  async function enviar() {
    setEnviando(true); setMsg(null)
    try {
      const r = await fetch('/api/email/enviar', {
        method: 'POST', headers: await authHeaders(),
        body: JSON.stringify({
          para: envio.para, cc: envio.cc || undefined, bcc: envio.bcc || undefined,
          assunto: envio.assunto,
          html: envio.corpo.replace(/\n/g, '<br>') + (conta.assinatura ? '<br><br>' + conta.assinatura.replace(/\n/g, '<br>') : ''),
          texto: envio.corpo + (conta.assinatura ? '\n\n' + conta.assinatura : ''),
        }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.erro || 'falha ao enviar')
      setMsg({ tipo: 'ok', texto: 'Email enviado!' })
      setEnvio({ para: '', cc: '', bcc: '', assunto: '', corpo: '' })
    } catch (e: any) {
      setMsg({ tipo: 'err', texto: e?.message || String(e) })
    } finally { setEnviando(false) }
  }

  if (carregando) return <div style={{ padding: 28 }}>Carregando…</div>

  return (
    <div style={{ padding: 28, maxWidth: 920 }}>
      <h1 style={{ fontFamily: 'DM Serif Display,serif', fontSize: 28, marginBottom: 4 }}>Email</h1>
      <div style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 18 }}>
        Conecte seu email comercial ao CRM para envios manuais e automações.
      </div>

      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: 18 }}>
        {[
          { k: 'config', l: '⚙️ Configuração' },
          { k: 'enviar', l: '✉️ Enviar' },
          { k: 'historico', l: '📜 Histórico' },
        ].map(t => (
          <button key={t.k} onClick={() => setAba(t.k as any)}
            style={{
              padding: '10px 14px', cursor: 'pointer', background: 'transparent',
              border: 'none', borderBottom: aba === t.k ? '2px solid var(--gold)' : '2px solid transparent',
              color: aba === t.k ? 'var(--gold)' : 'var(--text-muted)', fontWeight: aba === t.k ? 600 : 400,
            }}>{t.l}</button>
        ))}
      </div>

      {msg && (
        <div style={{
          padding: 10, borderRadius: 8, marginBottom: 14, fontSize: 13,
          background: msg.tipo === 'ok' ? 'rgba(28,181,160,0.1)' : 'rgba(220,80,80,0.1)',
          color: msg.tipo === 'ok' ? '#1cb5a0' : '#dc5050',
        }}>{msg.texto}</div>
      )}

      {aba === 'config' && (
        <div>
          {temConta && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
              Status do último teste: {conta.ultimo_teste_ok === true ? '✅ OK' : conta.ultimo_teste_ok === false ? '❌ ' + (conta.ultimo_teste_msg || '') : '— nunca testado'}
              {conta.ultimo_teste_em ? ` (${new Date(conta.ultimo_teste_em).toLocaleString('pt-BR')})` : ''}
            </div>
          )}

          <div style={{ marginBottom: 12, fontSize: 12, color: 'var(--text-muted)' }}>
            Provedor:&nbsp;
            <select onChange={e => { const p = PRESETS[Number(e.target.value)]; if (p) aplicarPreset(p) }}
              defaultValue=""
              style={{ padding: 6, borderRadius: 6, border: '1px solid var(--border)' }}>
              <option value="">— escolher preset —</option>
              {PRESETS.map((p, i) => <option key={p.nome} value={i}>{p.nome}</option>)}
            </select>
          </div>

          <Grid>
            <Field label="Email do remetente *">
              <input value={conta.from_email} onChange={e => setConta({ ...conta, from_email: e.target.value })} placeholder="voce@empresa.com.br" />
            </Field>
            <Field label="Nome exibido">
              <input value={conta.from_nome || ''} onChange={e => setConta({ ...conta, from_nome: e.target.value })} placeholder="Bruno — CM Seguros" />
            </Field>
          </Grid>

          <h3 style={{ marginTop: 22, marginBottom: 8, fontSize: 14 }}>Envio (SMTP)</h3>
          <Grid>
            <Field label="Servidor SMTP *"><input value={conta.smtp_host} onChange={e => setConta({ ...conta, smtp_host: e.target.value })} placeholder="smtp.gmail.com" /></Field>
            <Field label="Porta *"><input type="number" value={conta.smtp_port} onChange={e => setConta({ ...conta, smtp_port: Number(e.target.value) })} /></Field>
            <Field label="Usuário *"><input value={conta.smtp_user} onChange={e => setConta({ ...conta, smtp_user: e.target.value })} placeholder="voce@empresa.com.br" /></Field>
            <Field label={temConta ? 'Senha (deixe em branco para manter)' : 'Senha *'}>
              <input type="password" value={novaSenha} onChange={e => setNovaSenha(e.target.value)} placeholder="senha do email ou app password" />
            </Field>
            <Field label="Conexão segura (SSL)">
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                <input type="checkbox" checked={conta.smtp_secure} onChange={e => setConta({ ...conta, smtp_secure: e.target.checked })} />
                Usar SSL direto (porta 465). Desmarcado = STARTTLS (587).
              </label>
            </Field>
          </Grid>

          <h3 style={{ marginTop: 22, marginBottom: 8, fontSize: 14 }}>Recebimento (IMAP — opcional)</h3>
          <Grid>
            <Field label="Servidor IMAP"><input value={conta.imap_host || ''} onChange={e => setConta({ ...conta, imap_host: e.target.value })} placeholder="imap.gmail.com" /></Field>
            <Field label="Porta"><input type="number" value={conta.imap_port || 993} onChange={e => setConta({ ...conta, imap_port: Number(e.target.value) })} /></Field>
            <Field label="Usuário IMAP"><input value={conta.imap_user || ''} onChange={e => setConta({ ...conta, imap_user: e.target.value })} placeholder="(igual ao SMTP por padrão)" /></Field>
            <Field label="SSL">
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                <input type="checkbox" checked={!!conta.imap_secure} onChange={e => setConta({ ...conta, imap_secure: e.target.checked })} />
                Usar SSL (porta 993)
              </label>
            </Field>
          </Grid>

          <h3 style={{ marginTop: 22, marginBottom: 8, fontSize: 14 }}>Assinatura padrão</h3>
          <textarea value={conta.assinatura || ''} onChange={e => setConta({ ...conta, assinatura: e.target.value })}
            rows={4} style={{ width: '100%', padding: 10, border: '1px solid var(--border)', borderRadius: 8, fontFamily: 'inherit' }}
            placeholder="Atenciosamente,&#10;Seu Nome — CM Seguros" />

          <div style={{ marginTop: 20, display: 'flex', gap: 10 }}>
            <button onClick={salvar} disabled={salvando}
              style={btnPrimary}>{salvando ? 'Salvando…' : 'Salvar'}</button>
            <button onClick={testar} disabled={testando || !temConta}
              style={btn}>{testando ? 'Testando…' : 'Testar conexão'}</button>
            {temConta && (
              <button onClick={excluir} style={{ ...btn, color: '#dc5050', borderColor: '#dc5050' }}>
                Remover conta
              </button>
            )}
          </div>

          <div style={{ marginTop: 18, fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            🔒 A senha é criptografada (AES-256-GCM) com a chave <code>EMAIL_ENC_KEY</code> antes de ser gravada e nunca é retornada para o navegador.
            Para Gmail/Google Workspace use uma <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer" style={{ color: 'var(--gold)' }}>App Password</a>.
          </div>
        </div>
      )}

      {aba === 'enviar' && (
        <div>
          {!temConta && <div style={{ color: '#dc5050', marginBottom: 12 }}>Configure sua conta de email primeiro.</div>}
          <Grid>
            <Field label="Para *"><input value={envio.para} onChange={e => setEnvio({ ...envio, para: e.target.value })} placeholder="cliente@exemplo.com" /></Field>
            <Field label="Assunto *"><input value={envio.assunto} onChange={e => setEnvio({ ...envio, assunto: e.target.value })} /></Field>
            <Field label="CC"><input value={envio.cc} onChange={e => setEnvio({ ...envio, cc: e.target.value })} /></Field>
            <Field label="BCC"><input value={envio.bcc} onChange={e => setEnvio({ ...envio, bcc: e.target.value })} /></Field>
          </Grid>
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>Mensagem *</div>
            <textarea value={envio.corpo} onChange={e => setEnvio({ ...envio, corpo: e.target.value })}
              rows={10} style={{ width: '100%', padding: 10, border: '1px solid var(--border)', borderRadius: 8, fontFamily: 'inherit' }} />
          </div>
          <button onClick={enviar} disabled={enviando || !temConta || !envio.para || !envio.assunto || !envio.corpo}
            style={{ ...btnPrimary, marginTop: 14 }}>{enviando ? 'Enviando…' : 'Enviar email'}</button>
        </div>
      )}

      {aba === 'historico' && (
        <div>
          {historico.length === 0
            ? <div style={{ color: 'var(--text-muted)' }}>Nenhum email enviado ainda.</div>
            : (
              <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                <thead><tr style={{ textAlign: 'left', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>
                  <th style={{ padding: 8 }}>Quando</th><th>Para</th><th>Assunto</th><th>Status</th>
                </tr></thead>
                <tbody>
                  {historico.map(h => (
                    <tr key={h.id} style={{ borderBottom: '1px solid var(--border-soft)' }}>
                      <td style={{ padding: 8 }}>{new Date(h.criado_em).toLocaleString('pt-BR')}</td>
                      <td>{h.para}</td>
                      <td>{h.assunto}</td>
                      <td style={{ color: h.status === 'enviado' ? '#1cb5a0' : h.status === 'erro' ? '#dc5050' : 'var(--text-muted)' }}>
                        {h.status}{h.erro ? ` — ${h.erro}` : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </div>
      )}
    </div>
  )
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>{children}</div>
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block' }}>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
      <div className="email-field">{children}</div>
      <style jsx>{`
        .email-field :global(input) {
          width: 100%;
          padding: 9px 10px;
          border: 1px solid var(--border);
          border-radius: 8px;
          font-family: inherit;
          font-size: 13px;
        }
      `}</style>
    </label>
  )
}

const btn: React.CSSProperties = {
  padding: '9px 16px', borderRadius: 8, border: '1px solid var(--border-strong)',
  background: '#fff', cursor: 'pointer', fontSize: 13,
}
const btnPrimary: React.CSSProperties = {
  ...btn, background: 'var(--gold)', color: '#fff', border: '1px solid var(--gold)', fontWeight: 600,
}
