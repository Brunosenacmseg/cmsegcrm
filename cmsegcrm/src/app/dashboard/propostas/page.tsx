'use client'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

type StatusProposta = 'em_analise' | 'aceita' | 'recusada' | 'expirada' | 'convertida' | 'cancelada'
const STATUS_LABEL: Record<StatusProposta, { label: string; cor: string }> = {
  em_analise:  { label: 'Em análise',  cor: 'bg-blue-100 text-blue-700' },
  aceita:      { label: 'Aceita',      cor: 'bg-emerald-100 text-emerald-700' },
  recusada:    { label: 'Recusada',    cor: 'bg-red-100 text-red-700' },
  expirada:    { label: 'Expirada',    cor: 'bg-amber-100 text-amber-700' },
  convertida:  { label: 'Convertida',  cor: 'bg-purple-100 text-purple-700' },
  cancelada:   { label: 'Cancelada',   cor: 'bg-gray-100 text-gray-700' },
}

function fmtMoeda(v: number | null | undefined) {
  if (v == null) return '—'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}
function fmtData(s: string | null | undefined) {
  if (!s) return '—'
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s
}
function diasAteValidade(dataIso: string | null | undefined): number | null {
  if (!dataIso) return null
  const d = new Date(dataIso)
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  return Math.round((d.getTime() - hoje.getTime()) / 86400000)
}

export default function PropostasPage() {
  const supabase = createClient()
  const [propostas, setPropostas] = useState<any[]>([])
  const [stagingPendente, setStagingPendente] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [buscaDebounced, setBuscaDebounced] = useState('')
  const [filtroStatus, setFiltroStatus] = useState<StatusProposta | 'todas'>('em_analise')
  const [filtroSeg, setFiltroSeg] = useState<string>('todas')
  const [salvando, setSalvando] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'err'; texto: string } | null>(null)

  // Debounce 350ms na busca
  useEffect(() => {
    const t = setTimeout(() => setBuscaDebounced(busca), 350)
    return () => clearTimeout(t)
  }, [busca])

  useEffect(() => { carregar() }, [filtroStatus, filtroSeg, buscaDebounced])

  async function carregar() {
    setLoading(true)
    try {
      let q: any = supabase.from('propostas').select('*, clientes(id, nome, telefone, email)').order('created_at', { ascending: false }).limit(200)
      if (filtroStatus !== 'todas') q = q.eq('status', filtroStatus)
      if (filtroSeg !== 'todas') q = q.eq('seguradora', filtroSeg)
      if (buscaDebounced) {
        const t = `%${buscaDebounced}%`
        q = q.or(`numero.ilike.${t},nome_segurado.ilike.${t},placa.ilike.${t},cpf_cnpj_segurado.ilike.${t}`)
      }
      const { data } = await q
      setPropostas(data || [])

      // Staging pendente — propostas importadas via PDF que ainda não viraram registro de produção
      const { data: stg } = await supabase
        .from('seg_stage_propostas')
        .select('id, numero, cliente_nome, cpf_cnpj, produto, premio_total, vigencia_ini, vigencia_fim, data_validade, seguradora_origem, status, created_at')
        .eq('status', 'pendente')
        .order('created_at', { ascending: false })
        .limit(50)
      setStagingPendente(stg || [])
    } finally {
      setLoading(false)
    }
  }

  async function mudarStatus(id: string, novoStatus: StatusProposta) {
    setSalvando(id)
    setMsg(null)
    try {
      const { error } = await supabase.from('propostas').update({ status: novoStatus, updated_at: new Date().toISOString() }).eq('id', id)
      if (error) throw error
      setMsg({ tipo: 'ok', texto: `Proposta marcada como "${STATUS_LABEL[novoStatus].label}".` })
      carregar()
    } catch (e: any) {
      setMsg({ tipo: 'err', texto: e?.message || 'Falha ao atualizar status' })
    } finally {
      setSalvando(null)
    }
  }

  const seguradorasDisponiveis = useMemo(() => {
    const set = new Set<string>()
    for (const p of propostas) if (p.seguradora) set.add(p.seguradora)
    return Array.from(set).sort()
  }, [propostas])

  const totais = useMemo(() => {
    let totalPremio = 0
    let qtdEmAnalise = 0
    let qtdAceitas = 0
    let qtdExpirando = 0
    for (const p of propostas) {
      if (p.premio_total) totalPremio += Number(p.premio_total)
      if (p.status === 'em_analise') qtdEmAnalise++
      if (p.status === 'aceita') qtdAceitas++
      const dias = diasAteValidade(p.data_validade)
      if (dias !== null && dias >= 0 && dias <= 7) qtdExpirando++
    }
    return { totalPremio, qtdEmAnalise, qtdAceitas, qtdExpirando }
  }, [propostas])

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">📝 Propostas</h1>
          <p className="text-sm text-gray-500 mt-1">
            Propostas emitidas pelas seguradoras antes da apólice ser fechada. Importe via PDF na aba Seguradoras.
          </p>
        </div>
        <Link
          href="/dashboard/seguradoras"
          className="text-sm text-blue-600 hover:text-blue-700 underline-offset-2 hover:underline"
        >
          → Importar PDF de proposta
        </Link>
      </div>

      {msg && (
        <div className={`mb-4 px-4 py-3 rounded-lg text-sm ${msg.tipo === 'ok' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
          {msg.texto}
        </div>
      )}

      {/* Cards de resumo */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-white border rounded-lg p-4">
          <div className="text-xs text-gray-500">Em análise</div>
          <div className="text-2xl font-semibold text-blue-700">{totais.qtdEmAnalise}</div>
        </div>
        <div className="bg-white border rounded-lg p-4">
          <div className="text-xs text-gray-500">Aceitas</div>
          <div className="text-2xl font-semibold text-emerald-700">{totais.qtdAceitas}</div>
        </div>
        <div className="bg-white border rounded-lg p-4">
          <div className="text-xs text-gray-500">Expirando em 7 dias</div>
          <div className="text-2xl font-semibold text-amber-700">{totais.qtdExpirando}</div>
        </div>
        <div className="bg-white border rounded-lg p-4">
          <div className="text-xs text-gray-500">Prêmio total (filtrado)</div>
          <div className="text-2xl font-semibold text-gray-900">{fmtMoeda(totais.totalPremio)}</div>
        </div>
      </div>

      {/* Staging pendente (sem vínculo) */}
      {stagingPendente.length > 0 && (
        <div className="mb-6 bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="font-medium text-amber-900">⚠️ {stagingPendente.length} proposta(s) importada(s) aguardando vínculo</div>
            <Link href="/dashboard/seguradoras" className="text-xs text-amber-800 underline">Ir para Seguradoras</Link>
          </div>
          <p className="text-xs text-amber-800">
            Essas propostas foram extraídas de PDFs mas ainda não foram sincronizadas para o módulo de produção. Clique em "Sincronizar" na tela da seguradora correspondente.
          </p>
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 mb-4 items-end">
        <input
          value={busca}
          onChange={e => setBusca(e.target.value)}
          placeholder="Buscar por nº, segurado, CPF, placa…"
          className="flex-1 min-w-[260px] px-3 py-2 border rounded-lg text-sm"
        />
        <select
          value={filtroStatus}
          onChange={e => setFiltroStatus(e.target.value as any)}
          className="px-3 py-2 border rounded-lg text-sm bg-white"
        >
          <option value="todas">Todas</option>
          <option value="em_analise">Em análise</option>
          <option value="aceita">Aceitas</option>
          <option value="recusada">Recusadas</option>
          <option value="expirada">Expiradas</option>
          <option value="convertida">Convertidas</option>
          <option value="cancelada">Canceladas</option>
        </select>
        <select
          value={filtroSeg}
          onChange={e => setFiltroSeg(e.target.value)}
          className="px-3 py-2 border rounded-lg text-sm bg-white"
        >
          <option value="todas">Todas seguradoras</option>
          {seguradorasDisponiveis.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {/* Tabela */}
      <div className="bg-white border rounded-lg overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Carregando…</div>
        ) : propostas.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            Nenhuma proposta encontrada com os filtros selecionados.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Nº</th>
                <th className="px-3 py-2 text-left font-medium">Segurado</th>
                <th className="px-3 py-2 text-left font-medium">Veículo</th>
                <th className="px-3 py-2 text-left font-medium">Seguradora</th>
                <th className="px-3 py-2 text-right font-medium">Prêmio total</th>
                <th className="px-3 py-2 text-left font-medium">Validade</th>
                <th className="px-3 py-2 text-left font-medium">Status</th>
                <th className="px-3 py-2 text-right font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {propostas.map(p => {
                const dias = diasAteValidade(p.data_validade)
                const expirando = dias !== null && dias >= 0 && dias <= 7
                return (
                  <tr key={p.id} className="border-t hover:bg-gray-50">
                    <td className="px-3 py-2 font-mono text-xs">{p.numero || '—'}</td>
                    <td className="px-3 py-2">
                      <div>{p.nome_segurado || p.clientes?.nome || '—'}</div>
                      <div className="text-xs text-gray-500">{p.cpf_cnpj_segurado || ''}</div>
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-600">{p.placa || '—'}</td>
                    <td className="px-3 py-2 text-xs">{p.seguradora || '—'}</td>
                    <td className="px-3 py-2 text-right">{fmtMoeda(p.premio_total)}</td>
                    <td className="px-3 py-2 text-xs">
                      {fmtData(p.data_validade)}
                      {expirando && (
                        <div className="text-amber-700 font-medium">{dias === 0 ? 'expira hoje' : `${dias}d`}</div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${STATUS_LABEL[p.status as StatusProposta]?.cor || 'bg-gray-100 text-gray-700'}`}>
                        {STATUS_LABEL[p.status as StatusProposta]?.label || p.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      {p.status === 'em_analise' && (
                        <div className="flex gap-1 justify-end">
                          <button
                            disabled={salvando === p.id}
                            onClick={() => mudarStatus(p.id, 'aceita')}
                            className="px-2 py-1 text-xs bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-50"
                          >Aceitar</button>
                          <button
                            disabled={salvando === p.id}
                            onClick={() => mudarStatus(p.id, 'recusada')}
                            className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
                          >Recusar</button>
                        </div>
                      )}
                      {p.status === 'aceita' && (
                        <button
                          disabled={salvando === p.id}
                          onClick={() => mudarStatus(p.id, 'convertida')}
                          className="px-2 py-1 text-xs bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50"
                        >Marcar convertida</button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="mt-4 text-xs text-gray-500">
        Mostrando até 200 propostas mais recentes. Refine os filtros para ver outras.
      </div>
    </div>
  )
}
