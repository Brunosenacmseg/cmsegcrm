'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type Tab =
  | 'sinistros_avisados' | 'sinistros_encerrados'
  | 'inadimplencia'
  | 'comissoes_emitidas' | 'comissoes_pagas'
  | 'parcelas_emitidas'
  | 'propostas_pendentes'
  | 'apolices_emitidas' | 'apolices_renovadas'

type TabDef = {
  key: Tab; label: string; emoji: string;
  tabela: string; filtroExtra?: Record<string, any>;
  colunas: { campo: string; label: string; tipo?: 'data'|'valor'|'int'|'texto' }[];
}

const fmtData = (v: any) => v ? new Date(v).toLocaleDateString('pt-BR') : '—'
const fmtValor = (v: any) => v == null ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const TABS: TabDef[] = [
  {
    key: 'sinistros_avisados', label: 'Sinistros Avisados', emoji: '⚠️',
    tabela: 'allianz_sinistros', filtroExtra: { status: 'avisado' },
    colunas: [
      { campo: 'numero_sinistro', label: 'Sinistro' },
      { campo: 'numero_apolice', label: 'Apólice' },
      { campo: 'cliente_nome', label: 'Cliente' },
      { campo: 'cpf_cnpj', label: 'CPF/CNPJ' },
      { campo: 'data_aviso', label: 'Aviso', tipo: 'data' },
      { campo: 'data_ocorrencia', label: 'Ocorrência', tipo: 'data' },
      { campo: 'valor_reserva', label: 'Reserva', tipo: 'valor' },
      { campo: 'causa', label: 'Causa' },
      { campo: 'situacao', label: 'Situação' },
    ],
  },
  {
    key: 'sinistros_encerrados', label: 'Sinistros Encerrados', emoji: '✅',
    tabela: 'allianz_sinistros', filtroExtra: { status: 'encerrado' },
    colunas: [
      { campo: 'numero_sinistro', label: 'Sinistro' },
      { campo: 'numero_apolice', label: 'Apólice' },
      { campo: 'cliente_nome', label: 'Cliente' },
      { campo: 'data_ocorrencia', label: 'Ocorrência', tipo: 'data' },
      { campo: 'data_encerramento', label: 'Encerramento', tipo: 'data' },
      { campo: 'valor_indenizacao', label: 'Indenização', tipo: 'valor' },
      { campo: 'causa', label: 'Causa' },
    ],
  },
  {
    key: 'inadimplencia', label: 'Inadimplência', emoji: '⏰',
    tabela: 'allianz_inadimplencia',
    colunas: [
      { campo: 'numero_apolice', label: 'Apólice' },
      { campo: 'cliente_nome', label: 'Cliente' },
      { campo: 'cpf_cnpj', label: 'CPF/CNPJ' },
      { campo: 'parcela', label: 'Parc.' },
      { campo: 'vencimento', label: 'Vencimento', tipo: 'data' },
      { campo: 'valor', label: 'Valor', tipo: 'valor' },
      { campo: 'dias_atraso', label: 'Atraso (d)' },
      { campo: 'forma_pagamento', label: 'Forma' },
    ],
  },
  {
    key: 'comissoes_emitidas', label: 'Comissões Emitidas', emoji: '💸',
    tabela: 'allianz_comissoes', filtroExtra: { tipo: 'emitida' },
    colunas: [
      { campo: 'numero_apolice', label: 'Apólice' },
      { campo: 'cliente_nome', label: 'Cliente' },
      { campo: 'parcela', label: 'Parc.' },
      { campo: 'data_emissao', label: 'Emissão', tipo: 'data' },
      { campo: 'competencia', label: 'Competência' },
      { campo: 'premio', label: 'Prêmio', tipo: 'valor' },
      { campo: 'comissao_pct', label: '% Com.' },
      { campo: 'comissao_valor', label: 'Comissão', tipo: 'valor' },
    ],
  },
  {
    key: 'comissoes_pagas', label: 'Comissões Pagas', emoji: '💰',
    tabela: 'allianz_comissoes', filtroExtra: { tipo: 'paga' },
    colunas: [
      { campo: 'numero_apolice', label: 'Apólice' },
      { campo: 'cliente_nome', label: 'Cliente' },
      { campo: 'parcela', label: 'Parc.' },
      { campo: 'data_pagamento', label: 'Pagamento', tipo: 'data' },
      { campo: 'competencia', label: 'Competência' },
      { campo: 'comissao_valor', label: 'Comissão', tipo: 'valor' },
    ],
  },
  {
    key: 'parcelas_emitidas', label: 'Parcelas Emitidas', emoji: '📑',
    tabela: 'allianz_parcelas_emitidas',
    colunas: [
      { campo: 'numero_apolice', label: 'Apólice' },
      { campo: 'cliente_nome', label: 'Cliente' },
      { campo: 'parcela', label: 'Parc.' },
      { campo: 'total_parcelas', label: 'Total' },
      { campo: 'vencimento', label: 'Vencimento', tipo: 'data' },
      { campo: 'valor', label: 'Valor', tipo: 'valor' },
      { campo: 'forma_pagamento', label: 'Forma' },
      { campo: 'status', label: 'Status' },
    ],
  },
  {
    key: 'propostas_pendentes', label: 'Propostas Pendentes', emoji: '📝',
    tabela: 'allianz_propostas_pendentes',
    colunas: [
      { campo: 'numero_proposta', label: 'Proposta' },
      { campo: 'cliente_nome', label: 'Cliente' },
      { campo: 'cpf_cnpj', label: 'CPF/CNPJ' },
      { campo: 'produto', label: 'Produto' },
      { campo: 'data_proposta', label: 'Data', tipo: 'data' },
      { campo: 'premio', label: 'Prêmio', tipo: 'valor' },
      { campo: 'situacao', label: 'Situação' },
      { campo: 'pendencia', label: 'Pendência' },
    ],
  },
  {
    key: 'apolices_emitidas', label: 'Apólices Emitidas', emoji: '📋',
    tabela: 'allianz_apolices_relatorio', filtroExtra: { tipo: 'emitida' },
    colunas: [
      { campo: 'numero_apolice', label: 'Apólice' },
      { campo: 'cliente_nome', label: 'Cliente' },
      { campo: 'cpf_cnpj', label: 'CPF/CNPJ' },
      { campo: 'produto', label: 'Produto' },
      { campo: 'emissao', label: 'Emissão', tipo: 'data' },
      { campo: 'vigencia_fim', label: 'Vence', tipo: 'data' },
      { campo: 'premio_total', label: 'Prêmio', tipo: 'valor' },
      { campo: 'comissao_valor', label: 'Comissão', tipo: 'valor' },
    ],
  },
  {
    key: 'apolices_renovadas', label: 'Apólices Renovadas', emoji: '🔄',
    tabela: 'allianz_apolices_relatorio', filtroExtra: { tipo: 'renovada' },
    colunas: [
      { campo: 'numero_apolice', label: 'Apólice' },
      { campo: 'apolice_anterior', label: 'Anterior' },
      { campo: 'cliente_nome', label: 'Cliente' },
      { campo: 'produto', label: 'Produto' },
      { campo: 'emissao', label: 'Emissão', tipo: 'data' },
      { campo: 'vigencia_fim', label: 'Vence', tipo: 'data' },
      { campo: 'premio_total', label: 'Prêmio', tipo: 'valor' },
    ],
  },
]

const PAGE_SIZE = 50

export default function AllianzDadosPage() {
  const supabase = createClient()
  const router = useRouter()
  const [profile, setProfile] = useState<any>(null)
  const [loadingPerfil, setLoadingPerfil] = useState(true)
  const [tab, setTab] = useState<Tab>('sinistros_avisados')
  const [busca, setBusca] = useState('')
  const [page, setPage] = useState(0)
  const [linhas, setLinhas] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [carregando, setCarregando] = useState(false)
  const [contagens, setContagens] = useState<Record<Tab, number>>({} as any)

  const def = TABS.find(t => t.key === tab)!

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push('/login'); return }
      supabase.from('users').select('*').eq('id', user.id).single().then(({ data }) => {
        setProfile(data); setLoadingPerfil(false)
      })
    })
  }, [])

  useEffect(() => { setPage(0) }, [tab, busca])

  useEffect(() => { if (!loadingPerfil) carregar() }, [tab, page, busca, loadingPerfil])
  useEffect(() => { if (!loadingPerfil) carregarContagens() }, [loadingPerfil])

  async function carregarContagens() {
    const novas: Record<string, number> = {}
    for (const t of TABS) {
      let q = supabase.from(t.tabela).select('id', { count: 'exact', head: true })
      if (t.filtroExtra) for (const [k, v] of Object.entries(t.filtroExtra)) q = q.eq(k, v)
      const { count } = await q
      novas[t.key] = count || 0
    }
    setContagens(novas as any)
  }

  async function carregar() {
    setCarregando(true)
    let q = supabase.from(def.tabela).select('*', { count: 'exact' })
    if (def.filtroExtra) for (const [k, v] of Object.entries(def.filtroExtra)) q = q.eq(k, v)
    if (busca.trim()) {
      const b = busca.trim().replace(/\s+/g, '%')
      const cols = ['cliente_nome','cpf_cnpj','numero_apolice','numero_sinistro','numero_proposta']
        .filter(c => def.colunas.some(co => co.campo === c) || ['cliente_nome','cpf_cnpj','numero_apolice','numero_sinistro','numero_proposta'].includes(c))
      q = q.or(cols.map(c => `${c}.ilike.%${b}%`).join(','))
    }
    q = q.order('created_at', { ascending: false }).range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)
    const { data, count } = await q
    setLinhas(data || [])
    setTotal(count || 0)
    setCarregando(false)
  }

  function exportarCsv() {
    if (!linhas.length) return
    const cab = def.colunas.map(c => c.label).join(';')
    const corpo = linhas.map(l =>
      def.colunas.map(c => {
        const v = l[c.campo]
        if (v == null) return ''
        if (c.tipo === 'data') return fmtData(v)
        if (c.tipo === 'valor') return String(v).replace('.', ',')
        return String(v).replace(/[\n;]/g, ' ')
      }).join(';')
    ).join('\n')
    const blob = new Blob(['﻿' + cab + '\n' + corpo], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `allianz_${def.key}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  if (loadingPerfil) return <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',color:'var(--text-muted)'}}>Carregando...</div>

  const totalPaginas = Math.ceil(total / PAGE_SIZE)

  return (
    <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
      <div style={{height:56,borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',padding:'0 28px',background:'var(--bg-soft)',position:'sticky',top:0,zIndex:5,gap:12}}>
        <div style={{fontFamily:'DM Serif Display,serif',fontSize:18,flex:1}}>🛡️ Dados Allianz</div>
        <Link href="/dashboard/integracoes/allianz" className="btn-secondary" style={{textDecoration:'none'}}>📥 Importar relatórios</Link>
      </div>

      <div style={{display:'flex',gap:6,padding:'14px 28px 0',flexWrap:'wrap',borderBottom:'1px solid var(--border)',background:'var(--bg-soft)'}}>
        {TABS.map(t => {
          const ativo = tab === t.key
          const c = contagens[t.key]
          return (
            <button key={t.key} onClick={()=>setTab(t.key)}
              style={{padding:'8px 14px',borderRadius:'8px 8px 0 0',fontSize:12,cursor:'pointer',border:'1px solid '+(ativo?'var(--gold)':'transparent'),borderBottom:'none',background:ativo?'var(--bg)':'transparent',color:ativo?'var(--gold)':'var(--text-muted)',fontFamily:'DM Sans,sans-serif',display:'flex',alignItems:'center',gap:6}}>
              <span>{t.emoji}</span>
              <span style={{fontWeight:ativo?600:400}}>{t.label}</span>
              {c !== undefined && <span style={{fontSize:10,padding:'2px 6px',borderRadius:10,background:ativo?'rgba(201,168,76,0.18)':'rgba(255,255,255,0.06)'}}>{c}</span>}
            </button>
          )
        })}
      </div>

      <div style={{flex:1,overflow:'auto',padding:'20px 28px'}}>
        <div style={{display:'flex',gap:10,marginBottom:14,alignItems:'center',flexWrap:'wrap'}}>
          <input
            value={busca}
            onChange={e=>setBusca(e.target.value)}
            placeholder="Buscar por nome, CPF/CNPJ, apólice, proposta..."
            style={{flex:1,minWidth:260,padding:'9px 12px',borderRadius:8,border:'1px solid var(--border)',background:'rgba(255,255,255,0.04)',color:'var(--text)',fontSize:13,outline:'none'}}
          />
          <button className="btn-secondary" onClick={exportarCsv} disabled={!linhas.length}>📤 Exportar CSV</button>
          <span style={{fontSize:12,color:'var(--text-muted)'}}>{total} registros</span>
        </div>

        <div className="card" style={{padding:0,overflow:'hidden'}}>
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
              <thead style={{background:'rgba(255,255,255,0.04)',position:'sticky',top:0}}>
                <tr>
                  {def.colunas.map(c => (
                    <th key={c.campo} style={{padding:'10px 12px',textAlign:'left',fontSize:10,fontWeight:600,letterSpacing:'1px',textTransform:'uppercase',color:'var(--text-muted)',whiteSpace:'nowrap'}}>{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {carregando ? (
                  <tr><td colSpan={def.colunas.length} style={{padding:30,textAlign:'center',color:'var(--text-muted)'}}>Carregando...</td></tr>
                ) : linhas.length === 0 ? (
                  <tr><td colSpan={def.colunas.length} style={{padding:30,textAlign:'center',color:'var(--text-muted)'}}>
                    Nenhum registro. {total === 0 && contagens[tab] === 0 && <Link href="/dashboard/integracoes/allianz" style={{color:'var(--gold)'}}>Importe um relatório →</Link>}
                  </td></tr>
                ) : linhas.map(l => (
                  <tr key={l.id} style={{borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
                    {def.colunas.map(c => {
                      const v = l[c.campo]
                      let txt: any = '—'
                      if (v != null && v !== '') {
                        if (c.tipo === 'data') txt = fmtData(v)
                        else if (c.tipo === 'valor') txt = fmtValor(v)
                        else txt = String(v)
                      }
                      return (
                        <td key={c.campo} style={{padding:'9px 12px',whiteSpace:'nowrap',maxWidth:240,overflow:'hidden',textOverflow:'ellipsis'}} title={String(v ?? '')}>
                          {txt}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {totalPaginas > 1 && (
          <div style={{display:'flex',justifyContent:'center',gap:10,marginTop:16,alignItems:'center',fontSize:12}}>
            <button className="btn-secondary" disabled={page===0} onClick={()=>setPage(p=>Math.max(0,p-1))}>← Anterior</button>
            <span style={{color:'var(--text-muted)'}}>Página {page+1} de {totalPaginas}</span>
            <button className="btn-secondary" disabled={page>=totalPaginas-1} onClick={()=>setPage(p=>p+1)}>Próxima →</button>
          </div>
        )}
      </div>
    </div>
  )
}
