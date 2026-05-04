'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Servico = 'APOLICES' | 'PARCELAS' | 'COMISSOES' | 'SINISTRO' | 'RENOVACAO' | 'PENDENCIA' | 'RECUSA'

const SERVICOS: { tipo: Servico; label: string; emoji: string; descricao: string; endpoint: string }[] = [
  { tipo: 'APOLICES',  label: 'Apólice',   emoji: '📋', descricao: 'Propostas, apólices e endossos do corretor', endpoint: 'getApolice' },
  { tipo: 'PARCELAS',  label: 'Parcela',   emoji: '💳', descricao: 'Parcelas pagas ao corretor',                 endpoint: 'getParcela' },
  { tipo: 'COMISSOES', label: 'Extrato',   emoji: '💰', descricao: 'Extrato de comissões do corretor',           endpoint: 'getExtratoComiss' },
  { tipo: 'SINISTRO',  label: 'Sinistro',  emoji: '🚨', descricao: 'Dados dos sinistros',                        endpoint: 'getSinistro' },
  { tipo: 'RENOVACAO', label: 'Renovação', emoji: '🔁', descricao: 'Dados de renovação',                         endpoint: 'getRenovacao' },
  { tipo: 'PENDENCIA', label: 'Pendência', emoji: '⚠️', descricao: 'Pendências do corretor',                     endpoint: 'getPendencia' },
  { tipo: 'RECUSA',    label: 'Recusa',    emoji: '🚫', descricao: 'Recusas, apólices e endossos',               endpoint: 'getRecusa' },
]

export default function TokioMarinePage() {
  const router = useRouter()
  const supabase = createClient()
  const inputRef = useRef<HTMLInputElement>(null)

  const [isAdmin, setIsAdmin] = useState(false)
  const [config, setConfig] = useState<any>(null)
  const [carregandoConfig, setCarregandoConfig] = useState(true)
  const [servicoAtivo, setServicoAtivo] = useState<Servico>('APOLICES')
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim] = useState('')
  const [numApolice, setNumApolice] = useState('')
  const [executando, setExecutando] = useState(false)
  const [importacoes, setImportacoes] = useState<any[]>([])
  const [resultado, setResultado] = useState<any>(null)
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'err' | 'info'; texto: string } | null>(null)

  useEffect(() => { init() }, [])

  async function init() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    const { data: prof } = await supabase.from('users').select('role').eq('id', user.id).single()
    setIsAdmin(prof?.role === 'admin' || prof?.role === 'lider')
    await Promise.all([carregarConfig(), carregarHistorico()])
  }

  async function carregarConfig() {
    setCarregandoConfig(true)
    try {
      const r = await fetch('/api/tokio/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'config' }),
      })
      const j = await r.json()
      setConfig(j)
    } catch {
      setConfig({ erro: 'Falha ao carregar configuração' })
    } finally {
      setCarregandoConfig(false)
    }
  }

  async function carregarHistorico() {
    const { data } = await supabase.from('importacoes_tokio')
      .select('*').order('criado_em', { ascending: false }).limit(30)
    setImportacoes(data || [])
  }

  async function testarLogin() {
    setMsg({ tipo: 'info', texto: 'Testando login no webservice…' })
    try {
      const r = await fetch('/api/tokio/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'testar_login' }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'falha')
      setMsg({ tipo: 'ok', texto: `✅ Login OK. Token: ${j.token_preview} (validade ${j.expira_em})` })
    } catch (err: any) {
      setMsg({ tipo: 'err', texto: `❌ ${err.message}` })
    }
  }

  async function executarServico(servico: Servico) {
    setExecutando(true)
    setResultado(null)
    setMsg({ tipo: 'info', texto: `Executando ${servico}…` })
    try {
      const body: any = { action: 'sincronizar', servico }
      if (dataInicio) body.dataInicio = dataInicio
      if (dataFim)    body.dataFim = dataFim
      if (numApolice) body.numApolice = numApolice
      const r = await fetch('/api/tokio/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'falha na sincronização')
      setResultado(j)
      setMsg({
        tipo: j.erros > 0 ? 'err' : 'ok',
        texto: `✅ ${servico}: ${j.importados ?? 0} importados, ${j.erros ?? 0} erros (${j.servico})`,
      })
      await carregarHistorico()
    } catch (err: any) {
      setMsg({ tipo: 'err', texto: `❌ ${err.message}` })
    } finally {
      setExecutando(false)
    }
  }

  async function uploadXml(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setExecutando(true)
    setMsg({ tipo: 'info', texto: `Enviando ${file.name}…` })
    try {
      const conteudo = await file.text()
      const r = await fetch('/api/tokio/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'processar_upload',
          conteudo,
          nome_arquivo: file.name,
          tipo_forcado: servicoAtivo,
        }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'falha no upload')
      setResultado(j)
      setMsg({
        tipo: j.erros > 0 ? 'err' : 'ok',
        texto: `✅ ${file.name}: ${j.importados ?? 0} importados, ${j.erros ?? 0} erros`,
      })
      await carregarHistorico()
    } catch (err: any) {
      setMsg({ tipo: 'err', texto: `❌ ${err.message}` })
    } finally {
      setExecutando(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
      <div style={{ height:56, borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', padding:'0 28px', gap:12, background:'var(--bg-soft)', position:'sticky', top:0, zIndex:5 }}>
        <Link href="/dashboard/seguradoras" style={{ color:'var(--text-muted)', fontSize:12, textDecoration:'none' }}>
          ← Seguradoras
        </Link>
        <div style={{ width:1, height:20, background:'var(--border)' }} />
        <div style={{ fontFamily:'DM Serif Display,serif', fontSize:18, flex:1 }}>
          🛡️ Tokio Marine — Importação via Webservice
        </div>
        <span style={{ fontSize:12, color:'var(--text-muted)' }}>
          7 serviços REST
        </span>
      </div>

      <div style={{ flex:1, overflow:'auto', padding:'24px 28px 40px' }}>
        {msg && (
          <div style={{
            padding:10, borderRadius:8, marginBottom:14, fontSize:13, fontWeight:500,
            background: msg.tipo === 'ok' ? 'rgba(28,181,160,0.12)' : msg.tipo === 'err' ? 'rgba(224,82,82,0.12)' : 'rgba(74,128,240,0.12)',
            color: msg.tipo === 'ok' ? 'var(--teal)' : msg.tipo === 'err' ? 'var(--red)' : '#7aa3f8',
            border:'1px solid ' + (msg.tipo === 'ok' ? 'rgba(28,181,160,0.3)' : msg.tipo === 'err' ? 'rgba(224,82,82,0.3)' : 'rgba(74,128,240,0.3)'),
          }}>{msg.texto}</div>
        )}

        {/* Configuração */}
        <div className="card" style={{ padding:18, marginBottom:18 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
            <h3 style={{ fontFamily:'DM Serif Display,serif', fontSize:16, margin:0 }}>
              Configuração do Webservice
            </h3>
            <button
              onClick={testarLogin}
              disabled={executando || carregandoConfig}
              style={{ padding:'6px 12px', borderRadius:8, border:'1px solid var(--border)', background:'rgba(74,128,240,0.15)', color:'#7aa3f8', cursor:'pointer', fontSize:12, fontWeight:600 }}
            >
              🔐 Testar Login
            </button>
          </div>
          {carregandoConfig ? (
            <p style={{ color:'var(--text-muted)', fontSize:13 }}>Carregando…</p>
          ) : (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))', gap:8, fontSize:12 }}>
              <KV k="Base URL"        v={config?.ws_base} />
              <KV k="Login Path"      v={config?.ws_login_path} />
              <KV k="Usuário (TOKIO_USER)"     v={config?.ws_user} />
              <KV k="Senha (TOKIO_PASSWORD)"   v={config?.ws_password} />
              <KV k="Service Key"     v={config?.ws_service_key} />
              <KV k="Supabase URL"    v={config?.supabase_url} />
              <KV k="Service Role"    v={config?.supabase_role} />
            </div>
          )}
          <p style={{ marginTop:10, fontSize:11, color:'var(--text-muted)' }}>
            Configure as variáveis <code>TOKIO_USER</code>, <code>TOKIO_PASSWORD</code> e
            {' '}<code>TOKIO_SERVICE_KEY</code> no Vercel (Settings → Environment Variables).
          </p>
        </div>

        {/* Serviços */}
        <h3 style={{ fontFamily:'DM Serif Display,serif', fontSize:16, marginBottom:12 }}>
          Serviços disponíveis
        </h3>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))', gap:12, marginBottom:18 }}>
          {SERVICOS.map(s => (
            <div
              key={s.tipo}
              onClick={() => setServicoAtivo(s.tipo)}
              className="card"
              style={{
                padding:14, cursor:'pointer',
                border: servicoAtivo === s.tipo ? '1px solid var(--gold)' : '1px solid var(--border)',
                background: servicoAtivo === s.tipo ? 'var(--gold-soft)' : undefined,
              }}
            >
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                <span style={{ fontSize:20 }}>{s.emoji}</span>
                <strong style={{ fontSize:14 }}>{s.label}</strong>
              </div>
              <div style={{ fontSize:12, color:'var(--text-muted)', marginBottom:6, minHeight:32 }}>
                {s.descricao}
              </div>
              <code style={{ fontSize:11, color:'var(--gold)' }}>/Corretor/{s.endpoint}</code>
            </div>
          ))}
        </div>

        {/* Filtros + execução */}
        {isAdmin && (
          <div className="card" style={{ padding:18, marginBottom:18 }}>
            <h3 style={{ fontFamily:'DM Serif Display,serif', fontSize:16, marginTop:0, marginBottom:12 }}>
              Importar via Webservice — {SERVICOS.find(s => s.tipo === servicoAtivo)?.label}
            </h3>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:10, marginBottom:14 }}>
              <Field label="Data Início (opcional)">
                <input type="date" value={dataInicio} onChange={e=>setDataInicio(e.target.value)} style={inputStyle} />
              </Field>
              <Field label="Data Fim (opcional)">
                <input type="date" value={dataFim} onChange={e=>setDataFim(e.target.value)} style={inputStyle} />
              </Field>
              <Field label="Nº Apólice (opcional)">
                <input type="text" value={numApolice} onChange={e=>setNumApolice(e.target.value)} placeholder="ex: 1234567890" style={inputStyle} />
              </Field>
            </div>
            <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
              <button
                onClick={() => executarServico(servicoAtivo)}
                disabled={executando}
                style={{
                  padding:'10px 18px', borderRadius:8, border:'1px solid var(--gold)',
                  background:'var(--gold-soft)', color:'var(--gold)', cursor:'pointer',
                  fontSize:13, fontWeight:600,
                  opacity: executando ? 0.6 : 1,
                }}
              >
                {executando ? 'Executando…' : `🌐 Buscar do Webservice`}
              </button>

              <button
                onClick={async () => {
                  setExecutando(true)
                  setResultado(null)
                  setMsg({ tipo: 'info', texto: `Diagnosticando ${servicoAtivo}...` })
                  try {
                    const r = await fetch('/api/tokio/sync', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ action: 'diagnose_servico', servico: servicoAtivo, dataInicio, dataFim }),
                    })
                    const j = await r.json()
                    setResultado(j)
                    setMsg({ tipo: 'ok', texto: `Diagnóstico concluído — veja o JSON abaixo` })
                  } catch (err: any) {
                    setMsg({ tipo: 'err', texto: err.message })
                  } finally { setExecutando(false) }
                }}
                disabled={executando}
                style={{
                  padding:'10px 18px', borderRadius:8, border:'1px solid var(--border)',
                  background:'rgba(255,255,255,0.05)', color:'var(--text-muted)', cursor:'pointer',
                  fontSize:13, fontWeight:600, opacity: executando ? 0.6 : 1,
                }}
              >
                🔬 Diagnosticar (testa 10 formatos)
              </button>

              <input
                ref={inputRef}
                type="file"
                accept=".xml"
                onChange={uploadXml}
                disabled={executando}
                style={{ display:'none' }}
                id="tokio-upload"
              />
              <label
                htmlFor="tokio-upload"
                style={{
                  padding:'10px 18px', borderRadius:8, border:'1px solid var(--border)',
                  background:'rgba(255,255,255,0.05)', color:'var(--text-muted)', cursor:'pointer',
                  fontSize:13, fontWeight:600,
                }}
              >
                📁 Enviar XML manualmente
              </label>
            </div>
          </div>
        )}

        {/* Resultado da última execução */}
        {resultado && (
          <div className="card" style={{ padding:18, marginBottom:18 }}>
            <h3 style={{ fontFamily:'DM Serif Display,serif', fontSize:14, marginTop:0, marginBottom:10 }}>
              Resultado da última execução
            </h3>
            <pre style={{
              fontSize:11, color:'var(--text-muted)', background:'rgba(0,0,0,0.2)',
              padding:10, borderRadius:6, overflow:'auto', maxHeight:240, margin:0,
            }}>{JSON.stringify(resultado, null, 2)}</pre>
          </div>
        )}

        {/* Histórico */}
        <h3 style={{ fontFamily:'DM Serif Display,serif', fontSize:16, marginBottom:10 }}>
          Histórico de importações
        </h3>
        <div className="card" style={{ padding:0, overflow:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
            <thead>
              <tr>
                <th style={th}>Data</th>
                <th style={th}>Tipo</th>
                <th style={th}>Arquivo</th>
                <th style={th}>Registros</th>
                <th style={th}>Importados</th>
                <th style={th}>Erros</th>
                <th style={th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {importacoes.map(i => (
                <tr key={i.id} style={{ borderBottom:'1px solid rgba(255,255,255,0.04)' }}>
                  <td style={tdMuted}>{new Date(i.criado_em).toLocaleString('pt-BR')}</td>
                  <td style={td}>{i.tipo_arquivo}</td>
                  <td style={tdMono}>{i.nome_arquivo}</td>
                  <td style={td}>{i.qtd_registros ?? '—'}</td>
                  <td style={{ ...td, color:'var(--teal)' }}>{i.qtd_importados ?? 0}</td>
                  <td style={{ ...td, color: (i.qtd_erros||0) > 0 ? 'var(--red)' : 'var(--text-muted)' }}>{i.qtd_erros ?? 0}</td>
                  <td style={td}>{statusBadge(i.status)}</td>
                </tr>
              ))}
              {!importacoes.length && (
                <tr><td colSpan={7} style={{ padding:30, textAlign:'center', color:'var(--text-muted)' }}>
                  Nenhuma importação realizada ainda
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function KV({ k, v }: { k: string; v: any }) {
  return (
    <div style={{ background:'rgba(255,255,255,0.04)', padding:'8px 10px', borderRadius:6 }}>
      <div style={{ color:'var(--text-muted)', fontSize:10, textTransform:'uppercase', letterSpacing:'1px', marginBottom:2 }}>{k}</div>
      <div style={{ color:'var(--text)', fontSize:12, fontFamily:'monospace', wordBreak:'break-all' }}>{String(v ?? '—')}</div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display:'flex', flexDirection:'column', gap:4 }}>
      <span style={{ fontSize:11, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.5px' }}>{label}</span>
      {children}
    </label>
  )
}

const inputStyle: React.CSSProperties = {
  padding:'7px 10px', background:'rgba(255,255,255,0.05)', border:'1px solid var(--border)',
  borderRadius:6, color:'var(--text)', fontSize:12, fontFamily:'DM Sans,sans-serif',
}
const th: React.CSSProperties = {
  textAlign:'left', padding:'12px 14px', fontSize:10, fontWeight:600,
  letterSpacing:'1.2px', textTransform:'uppercase',
  color:'var(--text-muted)', borderBottom:'1px solid var(--border)',
}
const td: React.CSSProperties = { padding:'10px 14px', color:'var(--text)' }
const tdMuted: React.CSSProperties = { padding:'10px 14px', color:'var(--text-muted)', fontSize:12 }
const tdMono: React.CSSProperties = { padding:'10px 14px', color:'var(--text)', fontFamily:'monospace', fontSize:12 }

function statusBadge(s: string) {
  const cfg =
    s === 'concluido'   ? { bg:'rgba(28,181,160,0.15)', color:'var(--teal)', border:'rgba(28,181,160,0.3)', label:'✓ concluido' } :
    s === 'parcial'     ? { bg:'rgba(240,160,32,0.15)', color:'#f0a020',     border:'rgba(240,160,32,0.3)', label:'⚠ parcial' } :
    s === 'processando' ? { bg:'rgba(74,128,240,0.15)', color:'#7aa3f8',     border:'rgba(74,128,240,0.3)', label:'⏳ processando' } :
                          { bg:'rgba(224,82,82,0.15)',  color:'var(--red)',  border:'rgba(224,82,82,0.3)',  label:s || '—' }
  return (
    <span style={{
      display:'inline-block', padding:'2px 8px', borderRadius:10,
      background:cfg.bg, color:cfg.color, fontSize:10, fontWeight:600,
      textTransform:'uppercase', letterSpacing:'0.5px',
      border:`1px solid ${cfg.border}`,
    }}>{cfg.label}</span>
  )
}
