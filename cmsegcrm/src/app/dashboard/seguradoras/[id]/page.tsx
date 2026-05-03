'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

declare global { interface Window { XLSX: any } }

type Tipo = 'apolices' | 'sinistros' | 'inadimplencia' | 'comissoes'
type Aba = Tipo | 'relatorio_clientes'
const ABAS: { tipo: Aba; label: string; emoji: string }[] = [
  { tipo: 'apolices',           label: 'Apólices',                emoji: '📋' },
  { tipo: 'sinistros',          label: 'Sinistros',               emoji: '🛡️' },
  { tipo: 'inadimplencia',      label: 'Inadimplência',           emoji: '⏰' },
  { tipo: 'comissoes',          label: 'Comissões',               emoji: '💰' },
  { tipo: 'relatorio_clientes', label: 'Relatório (criados)',     emoji: '🆕' },
]
const TABELAS: Record<Tipo, string> = {
  apolices:      'seg_stage_apolices',
  sinistros:     'seg_stage_sinistros',
  inadimplencia: 'seg_stage_inadimplencia',
  comissoes:     'seg_stage_comissoes',
}

async function loadXLSX() {
  if (typeof window === 'undefined') return
  if (window.XLSX) return
  await new Promise<void>((res, rej) => {
    const s = document.createElement('script')
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
    s.onload = () => res(); s.onerror = rej
    document.head.appendChild(s)
  })
}

function lerArquivo(buf: ArrayBuffer): Record<string, any>[] {
  const wb = window.XLSX.read(buf, { type: 'array', cellDates: true })
  const out: Record<string, any>[] = []
  for (const sn of wb.SheetNames) {
    const ws = wb.Sheets[sn]
    const json = window.XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true }) as any[][]
    if (!json.length) continue
    let hi = 0
    for (let i = 0; i < Math.min(json.length, 10); i++) {
      const filled = json[i].filter(c => String(c ?? '').trim() !== '').length
      if (filled >= 3) { hi = i; break }
    }
    const headers = (json[hi] as any[]).map(h => String(h ?? '').trim())
    for (let i = hi + 1; i < json.length; i++) {
      const row = json[i]
      if (!row || !row.some((c: any) => String(c ?? '').trim() !== '')) continue
      const obj: Record<string, any> = {}
      for (let c = 0; c < headers.length; c++) {
        const h = headers[c]; if (!h) continue
        const v = row[c]
        obj[h] = v instanceof Date ? v.toISOString().slice(0, 10) : v
      }
      out.push(obj)
    }
  }
  return out
}

// Decoder Latin1/Windows-1252 → string (para .RET da Porto).
function decodificarLatin(buf: ArrayBuffer): string {
  // TextDecoder com windows-1252 cobre o conjunto Latin1 + extras (€, etc.)
  return new TextDecoder('windows-1252').decode(new Uint8Array(buf))
}

// Lê Tokio XML (Comissoes). Extrai cada <DetalheComissao> como uma linha.
function lerTokioXML(buf: ArrayBuffer): Record<string, any>[] {
  // Tokio manda em ISO-8859-1; força decodificação correta.
  const txt = decodificarLatin(buf)
  // DOMParser cuida da árvore mesmo se a declaração disser ISO-8859-1.
  const xml = new DOMParser().parseFromString(txt, 'text/xml')
  const out: Record<string, any>[] = []
  // Procura todos os <DetalheComissao> (ou <Detalhe...> caso a tag varie).
  const detalhes = xml.querySelectorAll('DetalheComissao, DetalheApolice, DetalheSinistro')
  detalhes.forEach(node => {
    const row: Record<string, any> = {}
    Array.from(node.children).forEach(child => {
      const k = child.tagName
      const v = (child.textContent || '').trim()
      if (k && v) row[k] = v
    })
    if (Object.keys(row).length) out.push(row)
  })
  // Se não achou Detalhes mas tem <Extrato>, captura o cabeçalho como 1 linha
  if (out.length === 0) {
    const extrato = xml.querySelector('Extrato')
    if (extrato) {
      const row: Record<string, any> = {}
      Array.from(extrato.children).forEach(child => {
        if (child.children.length === 0) {
          const k = child.tagName
          const v = (child.textContent || '').trim()
          if (k && v) row[k] = v
        }
      })
      if (Object.keys(row).length) out.push(row)
    }
  }
  return out
}

export default function SeguradoraDetalhePage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const supabase = createClient()
  const inputRef = useRef<HTMLInputElement>(null)

  const [seguradora, setSeguradora] = useState<any>(null)
  const [aba, setAba] = useState<Aba>('apolices')
  const [linhas, setLinhas] = useState<any[]>([])
  const [criadosAuto, setCriadosAuto] = useState<any[]>([])
  const [contagens, setContagens] = useState<Record<string, { pend: number; ok: number; err: number }>>({})
  const [importando, setImportando] = useState(false)
  const [sincronizando, setSincronizando] = useState(false)
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'err'; texto: string } | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => { init() }, [params?.id])
  useEffect(() => { carregarLinhas() }, [params?.id, aba])

  async function init() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    const { data: prof } = await supabase.from('users').select('role').eq('id', user.id).single()
    setIsAdmin(prof?.role === 'admin')
    const { data } = await supabase.from('seguradoras').select('*').eq('id', params!.id).single()
    setSeguradora(data)
    carregarContagens()
  }

  async function carregarContagens() {
    const c: Record<string, { pend: number; ok: number; err: number }> = {}
    for (const a of ABAS) {
      const t = TABELAS[a.tipo]
      const [{ count: p }, { count: o }, { count: e }] = await Promise.all([
        supabase.from(t).select('id', { count: 'exact', head: true }).eq('seguradora_id', params!.id).eq('status', 'pendente'),
        supabase.from(t).select('id', { count: 'exact', head: true }).eq('seguradora_id', params!.id).eq('status', 'sincronizado'),
        supabase.from(t).select('id', { count: 'exact', head: true }).eq('seguradora_id', params!.id).eq('status', 'erro'),
      ])
      c[a.tipo] = { pend: p || 0, ok: o || 0, err: e || 0 }
    }
    setContagens(c)
  }

  async function carregarLinhas() {
    if (!params?.id) return
    if (aba === 'relatorio_clientes') {
      const { data } = await supabase.from('seg_stage_apolices')
        .select('*, clientes(id, nome, cpf_cnpj)')
        .eq('seguradora_id', params.id).eq('cliente_criado_auto', true)
        .order('sincronizado_em', { ascending: false }).limit(500)
      setCriadosAuto(data || [])
      setLinhas([])
      return
    }
    const t = TABELAS[aba as Tipo]
    const { data } = await supabase.from(t).select('*')
      .eq('seguradora_id', params.id).order('created_at', { ascending: false }).limit(200)
    setLinhas(data || [])
  }

  async function authHeaders() {
    const { data: { session } } = await supabase.auth.getSession()
    const h: Record<string, string> = { 'Content-Type': 'application/json' }
    if (session?.access_token) h.Authorization = `Bearer ${session.access_token}`
    return h
  }

  async function onSelecionarArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setMsg(null)
    const lower = file.name.toLowerCase()
    if (lower.endsWith('.pdf')) {
      setMsg({ tipo: 'err', texto: 'Importação por PDF está em desenvolvimento. Use XLSX, CSV ou XML por enquanto.' })
      e.target.value = ''
      return
    }
    if (lower.endsWith('.ret')) {
      setMsg({ tipo: 'err', texto: 'Arquivos .RET (Porto) precisam do layout fixo CNAB para serem parseados. Em breve — preciso do manual de layout da Porto pra mapear as colunas.' })
      e.target.value = ''
      return
    }
    setImportando(true)
    try {
      const buf = await file.arrayBuffer()
      let linhasArq: Record<string, any>[] = []
      let formato: 'xlsx' | 'csv' | 'xml' | 'pdf' = 'xlsx'

      if (lower.endsWith('.xml')) {
        formato = 'xml'
        linhasArq = lerTokioXML(buf)
      } else {
        formato = lower.endsWith('.csv') ? 'csv' : 'xlsx'
        await loadXLSX()
        linhasArq = lerArquivo(buf)
      }
      if (!linhasArq.length) throw new Error('Arquivo sem linhas (verifique se o arquivo está no formato esperado)')

      const r = await fetch(`/api/seguradoras/${params!.id}/import`, {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({
          tipo: aba,
          formato,
          nome_arquivo: file.name,
          linhas: linhasArq,
        }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j?.erro || 'falha na importação')
      setMsg({ tipo: 'ok', texto: `Importadas ${j.inseridos} linhas. Clique em "Sincronizar" para vincular ao CRM.` })
      await carregarContagens()
      await carregarLinhas()
    } catch (err: any) {
      setMsg({ tipo: 'err', texto: err?.message || String(err) })
    } finally {
      setImportando(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  async function sincronizar() {
    setSincronizando(true)
    setMsg(null)
    try {
      const r = await fetch(`/api/seguradoras/${params!.id}/sincronizar`, {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ tipo: aba }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j?.erro || 'falha na sincronização')
      setMsg({
        tipo: j.erros > 0 ? 'err' : 'ok',
        texto: `Sincronizados: ${j.sincronizados} • Erros: ${j.erros}`,
      })
      await carregarContagens()
      await carregarLinhas()
    } catch (err: any) {
      setMsg({ tipo: 'err', texto: err?.message || String(err) })
    } finally {
      setSincronizando(false)
    }
  }

  async function reenfileirarErros() {
    const t = TABELAS[aba]
    await supabase.from(t).update({ status: 'pendente', erro_msg: null })
      .eq('seguradora_id', params!.id).eq('status', 'erro')
    await carregarContagens()
    await carregarLinhas()
  }

  const cont = contagens[aba] || { pend: 0, ok: 0, err: 0 }

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
      <div style={{ height:56, borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', padding:'0 28px', gap:12, background:'var(--bg-soft)', position:'sticky', top:0, zIndex:5 }}>
        <Link href="/dashboard/seguradoras" style={{ color:'var(--text-muted)', fontSize:12, textDecoration:'none', display:'flex', alignItems:'center', gap:4 }}>
          ← Seguradoras
        </Link>
        <div style={{ width:1, height:20, background:'var(--border)' }} />
        <div style={{ fontFamily:'DM Serif Display,serif', fontSize:18, flex:1 }}>
          🛡️ {seguradora?.nome || '...'}
        </div>
        <span style={{ fontSize:12, color:'var(--text-muted)' }}>Importação e sincronização com o CRM</span>
      </div>

      <div style={{ flex:1, overflow:'auto', padding:'24px 28px 40px' }}>
        {msg && (
          <div style={{
            padding:10, borderRadius:8, marginBottom:14, fontSize:13, fontWeight:500,
            background: msg.tipo === 'ok' ? 'rgba(28,181,160,0.12)' : 'rgba(224,82,82,0.12)',
            color: msg.tipo === 'ok' ? 'var(--teal)' : 'var(--red)',
            border:'1px solid ' + (msg.tipo === 'ok' ? 'rgba(28,181,160,0.3)' : 'rgba(224,82,82,0.3)'),
          }}>{msg.texto}</div>
        )}

        <div style={{ display:'flex', gap:4, borderBottom:'1px solid var(--border)', marginBottom:18, flexWrap:'wrap' }}>
          {ABAS.map(a => {
            const c = contagens[a.tipo] || { pend:0, ok:0, err:0 }
            const ativa = aba === a.tipo
            return (
              <button key={a.tipo} onClick={() => setAba(a.tipo)} style={{
                padding:'10px 16px', border:'none', cursor:'pointer',
                background: ativa ? 'var(--gold-soft)' : 'transparent',
                color: ativa ? 'var(--gold)' : 'var(--text-muted)',
                borderBottom: ativa ? '2px solid var(--gold)' : '2px solid transparent',
                fontSize:13, fontWeight:600, fontFamily:'DM Sans,sans-serif',
                whiteSpace:'nowrap', transition:'all 0.15s',
              }}>
                {a.emoji} {a.label}
                {a.tipo !== 'relatorio_clientes' && (
                  <span style={{ marginLeft:8, fontSize:11, color:'var(--text-muted)' }}>
                    {c.pend > 0 && <span style={{ color:'#f0a020' }}>● {c.pend}</span>}
                    {c.ok > 0 && <span style={{ marginLeft:6, color:'var(--teal)' }}>✓ {c.ok}</span>}
                    {c.err > 0 && <span style={{ marginLeft:6, color:'var(--red)' }}>✗ {c.err}</span>}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {isAdmin && aba !== 'relatorio_clientes' && (
          <div style={{ display:'flex', gap:10, marginBottom:14, flexWrap:'wrap', alignItems:'center' }}>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls,.csv,.xml,.pdf"
              onChange={onSelecionarArquivo}
              disabled={importando}
              style={{
                flex:'1 1 280px', maxWidth:380, padding:'7px 10px',
                background:'rgba(255,255,255,0.05)', border:'1px solid var(--border)',
                borderRadius:8, color:'var(--text)', fontSize:12,
                fontFamily:'DM Sans,sans-serif',
              }}
            />
            <button
              onClick={sincronizar}
              disabled={sincronizando || cont.pend === 0}
              style={{
                padding:'8px 16px', borderRadius:8, border:'1px solid',
                fontSize:13, fontWeight:600, fontFamily:'DM Sans,sans-serif',
                background: cont.pend > 0 ? 'rgba(74,128,240,0.15)' : 'rgba(255,255,255,0.04)',
                color: cont.pend > 0 ? '#7aa3f8' : 'var(--text-muted)',
                borderColor: cont.pend > 0 ? 'rgba(74,128,240,0.4)' : 'var(--border)',
                cursor: cont.pend > 0 ? 'pointer' : 'not-allowed',
                opacity: sincronizando ? 0.6 : 1,
              }}
            >
              {sincronizando ? 'Sincronizando...' : `🔄 Sincronizar (${cont.pend} pendentes)`}
            </button>
            {cont.err > 0 && (
              <button
                onClick={reenfileirarErros}
                style={{ padding:'8px 12px', borderRadius:8, border:'1px solid var(--border)', background:'rgba(255,255,255,0.04)', color:'var(--text-muted)', cursor:'pointer', fontSize:12 }}
              >
                Reenfileirar {cont.err} erros
              </button>
            )}
          </div>
        )}

        {aba !== 'relatorio_clientes' && (
          <p style={{ fontSize:12, color:'var(--text-muted)', marginBottom:12 }}>
            Aceitos: XLSX, CSV. (PDF em breve.) Após importar, clique em <strong style={{ color:'var(--text)' }}>Sincronizar</strong> para vincular ao cliente/apólice e
            {aba === 'sinistros' ? ' criar negócio no funil Sinistro.' :
             aba === 'inadimplencia' ? ' criar negócio no funil Cobrança e registrar inadimplência no histórico.' :
             aba === 'comissoes' ? ' lançar em Comissões e registrar no histórico da apólice.' :
             ' criar/atualizar a apólice e vincular ao cliente.'}
          </p>
        )}
        {aba === 'relatorio_clientes' && (
          <p style={{ fontSize:12, color:'var(--text-muted)', marginBottom:12 }}>
            Apólices importadas em que o <strong style={{ color:'var(--text)' }}>cliente foi criado automaticamente</strong> porque não existia no CRM.
            Use esta lista para conferir os cadastros gerados.
          </p>
        )}

        {aba === 'relatorio_clientes' ? (
          <div className="card" style={{ padding:0, overflow:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
              <thead>
                <tr>
                  <th style={th}>Cliente criado</th>
                  <th style={th}>CPF/CNPJ</th>
                  <th style={th}>Apólice</th>
                  <th style={th}>Produto</th>
                  <th style={th}>Vigência</th>
                  <th style={th}>Sincronizado em</th>
                  <th style={th}>Conferir</th>
                </tr>
              </thead>
              <tbody>
                {criadosAuto.map(l => (
                  <tr key={l.id} style={{ borderBottom:'1px solid rgba(255,255,255,0.04)' }}>
                    <td style={td}>{l.clientes?.nome || l.cliente_nome || '—'}</td>
                    <td style={tdMuted}>{l.clientes?.cpf_cnpj || l.cpf_cnpj || '—'}</td>
                    <td style={tdMono}>{l.numero || '—'}</td>
                    <td style={td}>{l.produto || '—'}</td>
                    <td style={tdMuted}>{l.vigencia_ini || '—'} → {l.vigencia_fim || '—'}</td>
                    <td style={tdMuted}>{l.sincronizado_em ? new Date(l.sincronizado_em).toLocaleString('pt-BR') : '—'}</td>
                    <td style={td}>
                      {l.cliente_id && (
                        <Link href={`/dashboard/clientes/${l.cliente_id}`} style={{ color:'var(--gold)', fontSize:12, textDecoration:'none' }}>
                          Abrir cliente →
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
                {!criadosAuto.length && (
                  <tr><td colSpan={7} style={{ padding:30, textAlign:'center', color:'var(--text-muted)' }}>
                    Nenhum cliente foi criado automaticamente nesta seguradora
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="card" style={{ padding:0, overflow:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
              <thead>
                <tr>
                  <th style={th}>Status</th>
                  {aba === 'apolices' && <><th style={th}>Apólice</th><th style={th}>Cliente</th><th style={th}>CPF/CNPJ</th><th style={th}>Vigência</th><th style={th}>Prêmio</th></>}
                  {aba === 'sinistros' && <><th style={th}>Sinistro</th><th style={th}>Apólice</th><th style={th}>Cliente</th><th style={th}>Data</th><th style={th}>Valor</th></>}
                  {aba === 'inadimplencia' && <><th style={th}>Apólice</th><th style={th}>Cliente</th><th style={th}>Parcela</th><th style={th}>Vencimento</th><th style={th}>Valor</th><th style={th}>Atraso</th></>}
                  {aba === 'comissoes' && <><th style={th}>Apólice</th><th style={th}>Cliente</th><th style={th}>Competência</th><th style={th}>Parcela</th><th style={th}>Valor</th></>}
                  <th style={th}>Erro</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map(l => (
                  <tr key={l.id} style={{ borderBottom:'1px solid rgba(255,255,255,0.04)' }}>
                    <td style={td}>{statusBadge(l.status)}</td>
                    {aba === 'apolices' && <>
                      <td style={tdMono}>{l.numero || '—'}</td>
                      <td style={td}>{l.cliente_nome || '—'}</td>
                      <td style={tdMuted}>{l.cpf_cnpj || '—'}</td>
                      <td style={tdMuted}>{l.vigencia_ini || '—'} → {l.vigencia_fim || '—'}</td>
                      <td style={td}>{fmt(l.premio)}</td>
                    </>}
                    {aba === 'sinistros' && <>
                      <td style={tdMono}>{l.numero_sinistro || '—'}</td>
                      <td style={tdMono}>{l.numero_apolice || '—'}</td>
                      <td style={td}>{l.cliente_nome || '—'}</td>
                      <td style={tdMuted}>{l.data_aviso || l.data_ocorrencia || '—'}</td>
                      <td style={td}>{fmt(l.valor_indenizacao)}</td>
                    </>}
                    {aba === 'inadimplencia' && <>
                      <td style={tdMono}>{l.numero_apolice || '—'}</td>
                      <td style={td}>{l.cliente_nome || '—'}</td>
                      <td style={td}>{l.parcela ?? '—'}</td>
                      <td style={tdMuted}>{l.vencimento || '—'}</td>
                      <td style={td}>{fmt(l.valor)}</td>
                      <td style={tdMuted}>{l.dias_atraso ?? '—'}d</td>
                    </>}
                    {aba === 'comissoes' && <>
                      <td style={tdMono}>{l.numero_apolice || '—'}</td>
                      <td style={td}>{l.cliente_nome || '—'}</td>
                      <td style={tdMuted}>{l.competencia || '—'}</td>
                      <td style={td}>{l.parcela ?? '—'}/{l.total_parcelas ?? '—'}</td>
                      <td style={td}>{fmt(l.comissao_valor)}</td>
                    </>}
                    <td style={{ ...td, color:'var(--red)', fontSize:11 }}>{l.erro_msg || ''}</td>
                  </tr>
                ))}
                {!linhas.length && (
                  <tr><td colSpan={8} style={{ padding:30, textAlign:'center', color:'var(--text-muted)' }}>
                    Nenhum registro importado ainda
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
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
    s === 'sincronizado' ? { bg:'rgba(28,181,160,0.15)', color:'var(--teal)', border:'rgba(28,181,160,0.3)', label:'✓' } :
    s === 'erro'         ? { bg:'rgba(224,82,82,0.15)',  color:'var(--red)',  border:'rgba(224,82,82,0.3)',  label:'✗' } :
                            { bg:'rgba(240,160,32,0.15)', color:'#f0a020',     border:'rgba(240,160,32,0.3)', label:'●' }
  return (
    <span style={{
      display:'inline-block', padding:'2px 8px', borderRadius:10,
      background:cfg.bg, color:cfg.color, fontSize:10, fontWeight:600,
      textTransform:'uppercase', letterSpacing:'0.5px',
      border:`1px solid ${cfg.border}`,
    }}>{cfg.label} {s}</span>
  )
}
function fmt(v: any) {
  const n = Number(v); if (!isFinite(n)) return '-'
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
