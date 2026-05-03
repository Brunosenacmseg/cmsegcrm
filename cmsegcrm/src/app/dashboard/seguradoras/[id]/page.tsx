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
      setMsg({ tipo: 'err', texto: 'Importação por PDF está em desenvolvimento. Use XLSX ou CSV por enquanto.' })
      e.target.value = ''
      return
    }
    setImportando(true)
    try {
      await loadXLSX()
      const buf = await file.arrayBuffer()
      const linhasArq = lerArquivo(buf)
      if (!linhasArq.length) throw new Error('Arquivo sem linhas')

      const r = await fetch(`/api/seguradoras/${params!.id}/import`, {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({
          tipo: aba,
          formato: lower.endsWith('.csv') ? 'csv' : 'xlsx',
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
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 12 }}>
        <Link href="/dashboard/seguradoras" style={{ color: '#888', fontSize: 13 }}>← Seguradoras</Link>
      </div>
      <h1 style={{ margin: '0 0 4px 0' }}>🛡️ {seguradora?.nome || '...'}</h1>
      <p style={{ margin: '0 0 16px 0', color: '#888', fontSize: 13 }}>
        Importação e sincronização com o CRM
      </p>

      {msg && (
        <div style={{
          padding: 10, borderRadius: 8, marginBottom: 12,
          background: msg.tipo === 'ok' ? '#0a3' : '#a00', color: '#fff', fontSize: 13,
        }}>{msg.texto}</div>
      )}

      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid #222', marginBottom: 16, flexWrap: 'wrap' }}>
        {ABAS.map(a => {
          const c = contagens[a.tipo] || { pend: 0, ok: 0, err: 0 }
          const ativa = aba === a.tipo
          return (
            <button key={a.tipo} onClick={() => setAba(a.tipo)} style={{
              padding: '10px 16px', border: 'none', cursor: 'pointer',
              background: ativa ? '#1a1a1a' : 'transparent',
              color: ativa ? '#fff' : '#888',
              borderBottom: ativa ? '2px solid #4a80f0' : '2px solid transparent',
              fontSize: 14,
            }}>
              {a.emoji} {a.label}
              {a.tipo !== 'relatorio_clientes' && (
                <span style={{ marginLeft: 8, fontSize: 11, color: '#777' }}>
                  {c.pend > 0 && <span style={{ color: '#f0a020' }}>● {c.pend} pend</span>}
                  {c.ok > 0 && <span style={{ marginLeft: 6, color: '#4caf50' }}>✓ {c.ok}</span>}
                  {c.err > 0 && <span style={{ marginLeft: 6, color: '#e05252' }}>✗ {c.err}</span>}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {isAdmin && aba !== 'relatorio_clientes' && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.csv,.pdf"
            onChange={onSelecionarArquivo}
            disabled={importando}
            style={{ flex: '1 1 240px', padding: 8, borderRadius: 6, border: '1px solid #333', background: '#111', color: '#eee' }}
          />
          <button
            onClick={sincronizar}
            disabled={sincronizando || cont.pend === 0}
            style={{
              padding: '8px 16px', borderRadius: 6, border: 'none',
              background: cont.pend > 0 ? '#4a80f0' : '#333', color: '#fff',
              cursor: cont.pend > 0 ? 'pointer' : 'not-allowed',
              opacity: sincronizando ? 0.6 : 1,
            }}
          >
            {sincronizando ? 'Sincronizando...' : `🔄 Sincronizar (${cont.pend} pendentes)`}
          </button>
          {cont.err > 0 && (
            <button
              onClick={reenfileirarErros}
              style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #555', background: 'transparent', color: '#ccc', cursor: 'pointer', fontSize: 12 }}
            >
              Reenfileirar {cont.err} erros
            </button>
          )}
        </div>
      )}

      {aba !== 'relatorio_clientes' && (
        <p style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>
          Aceitos: XLSX, CSV. (PDF em breve.) Após importar, clique em <strong>Sincronizar</strong> para vincular ao cliente/apólice e
          {aba === 'sinistros' ? ' criar negócio no funil Sinistro.' :
           aba === 'inadimplencia' ? ' criar negócio no funil Cobrança e registrar inadimplência no histórico.' :
           aba === 'comissoes' ? ' lançar em Comissões e registrar no histórico da apólice.' :
           ' criar/atualizar a apólice e vincular ao cliente.'}
        </p>
      )}
      {aba === 'relatorio_clientes' && (
        <p style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>
          Apólices importadas em que o <strong>cliente foi criado automaticamente</strong> porque não existia no CRM.
          Use esta lista para conferir os cadastros gerados.
        </p>
      )}

      {aba === 'relatorio_clientes' ? (
        <div style={{ border: '1px solid #222', borderRadius: 8, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#1a1a1a' }}>
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
                <tr key={l.id} style={{ borderTop: '1px solid #222' }}>
                  <td style={td}>{l.clientes?.nome || l.cliente_nome || '-'}</td>
                  <td style={td}>{l.clientes?.cpf_cnpj || l.cpf_cnpj || '-'}</td>
                  <td style={td}>{l.numero || '-'}</td>
                  <td style={td}>{l.produto || '-'}</td>
                  <td style={td}>{l.vigencia_ini || '-'} → {l.vigencia_fim || '-'}</td>
                  <td style={td}>{l.sincronizado_em ? new Date(l.sincronizado_em).toLocaleString('pt-BR') : '-'}</td>
                  <td style={td}>
                    {l.cliente_id && (
                      <Link href={`/dashboard/clientes/${l.cliente_id}`} style={{ color: '#4a80f0', fontSize: 12 }}>
                        Abrir cliente →
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
              {!criadosAuto.length && (
                <tr><td colSpan={7} style={{ padding: 24, textAlign: 'center', color: '#777' }}>
                  Nenhum cliente foi criado automaticamente nesta seguradora
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
      <div style={{ border: '1px solid #222', borderRadius: 8, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#1a1a1a' }}>
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
              <tr key={l.id} style={{ borderTop: '1px solid #222' }}>
                <td style={td}>{statusBadge(l.status)}</td>
                {aba === 'apolices' && <>
                  <td style={td}>{l.numero || '-'}</td>
                  <td style={td}>{l.cliente_nome || '-'}</td>
                  <td style={td}>{l.cpf_cnpj || '-'}</td>
                  <td style={td}>{l.vigencia_ini || '-'} → {l.vigencia_fim || '-'}</td>
                  <td style={td}>{fmt(l.premio)}</td>
                </>}
                {aba === 'sinistros' && <>
                  <td style={td}>{l.numero_sinistro || '-'}</td>
                  <td style={td}>{l.numero_apolice || '-'}</td>
                  <td style={td}>{l.cliente_nome || '-'}</td>
                  <td style={td}>{l.data_aviso || l.data_ocorrencia || '-'}</td>
                  <td style={td}>{fmt(l.valor_indenizacao)}</td>
                </>}
                {aba === 'inadimplencia' && <>
                  <td style={td}>{l.numero_apolice || '-'}</td>
                  <td style={td}>{l.cliente_nome || '-'}</td>
                  <td style={td}>{l.parcela ?? '-'}</td>
                  <td style={td}>{l.vencimento || '-'}</td>
                  <td style={td}>{fmt(l.valor)}</td>
                  <td style={td}>{l.dias_atraso ?? '-'}d</td>
                </>}
                {aba === 'comissoes' && <>
                  <td style={td}>{l.numero_apolice || '-'}</td>
                  <td style={td}>{l.cliente_nome || '-'}</td>
                  <td style={td}>{l.competencia || '-'}</td>
                  <td style={td}>{l.parcela ?? '-'}/{l.total_parcelas ?? '-'}</td>
                  <td style={td}>{fmt(l.comissao_valor)}</td>
                </>}
                <td style={{ ...td, color: '#e05252', fontSize: 11 }}>{l.erro_msg || ''}</td>
              </tr>
            ))}
            {!linhas.length && (
              <tr><td colSpan={8} style={{ padding: 24, textAlign: 'center', color: '#777' }}>
                Nenhum registro importado ainda
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
      )}
    </div>
  )
}

const th: React.CSSProperties = { textAlign: 'left', padding: 8, fontSize: 11, color: '#aaa', textTransform: 'uppercase' }
const td: React.CSSProperties = { padding: 8, color: '#ddd' }

function statusBadge(s: string) {
  const cfg = s === 'sincronizado' ? { bg: '#0a7', label: '✓' } : s === 'erro' ? { bg: '#a00', label: '✗' } : { bg: '#555', label: '●' }
  return <span style={{ display: 'inline-block', padding: '2px 6px', borderRadius: 10, background: cfg.bg, color: '#fff', fontSize: 11 }}>{cfg.label} {s}</span>
}
function fmt(v: any) {
  const n = Number(v); if (!isFinite(n)) return '-'
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
