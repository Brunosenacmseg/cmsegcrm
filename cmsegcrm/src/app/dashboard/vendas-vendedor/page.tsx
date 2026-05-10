'use client'
import { Suspense, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'
import Avatar from '@/components/Avatar'
import { getFunilIdsSemValor } from '@/lib/funis-excluidos'

export default function VendasVendedorWrapper() {
  return (
    <Suspense fallback={<div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',color:'var(--text-muted)'}}>Carregando...</div>}>
      <VendasVendedorPage />
    </Suspense>
  )
}

type Linha = {
  id: string
  premio: number
  comissao_pct: number
  data_fechamento: string
  produto: string | null
  seguradora: string | null
  funil_id: string | null
  funis?: { nome?: string; emoji?: string } | null
  clientes?: { nome?: string } | null
}

async function fetchAllPaged<T = any>(builder: any, pageSize = 1000): Promise<T[]> {
  const acc: T[] = []
  for (let off = 0; ; off += pageSize) {
    const { data, error } = await builder.range(off, off + pageSize - 1)
    if (error || !data || !data.length) break
    acc.push(...(data as T[]))
    if (data.length < pageSize) break
    if (acc.length >= 50000) break
  }
  return acc
}

function VendasVendedorPage() {
  const supabase = createClient()
  const router = useRouter()
  const sp = useSearchParams()

  const vendedorId = sp?.get('vendedor') || ''
  const nomeUrl    = sp?.get('nome') || ''
  const inicio     = sp?.get('inicio') || ''
  const fim        = sp?.get('fim') || ''
  const rotulo     = sp?.get('rotulo') || ''

  const [vendedor, setVendedor] = useState<{ id: string; nome: string; avatar_url?: string; role?: string } | null>(null)
  const [linhas, setLinhas]     = useState<Linha[]>([])
  const [loading, setLoading]   = useState(true)
  const [erro, setErro]         = useState<string | null>(null)

  useEffect(() => { carregar() }, [vendedorId, inicio, fim])

  async function carregar() {
    if (!vendedorId || !inicio || !fim) {
      setErro('Parâmetros incompletos. Volte ao Dashboard e clique no nome do vendedor.')
      setLoading(false)
      return
    }
    setLoading(true)
    setErro(null)

    const { data: u } = await supabase.from('users')
      .select('id, nome, avatar_url, role')
      .eq('id', vendedorId).maybeSingle()
    setVendedor(u || (nomeUrl ? { id: vendedorId, nome: nomeUrl } : null))

    // Negócios "ganho" desse vendedor no período. Exclui o funil
    // EMISSÃO E IMPLANTAÇÃO (não soma no ranking nem na produção).
    const funisExcluidos = await getFunilIdsSemValor()
    let q: any = supabase.from('negocios')
      .select('id, premio, comissao_pct, data_fechamento, produto, seguradora, funil_id, funis(nome,emoji), clientes(nome)')
      .eq('status', 'ganho')
      .eq('vendedor_id', vendedorId)
      .gte('data_fechamento', inicio)
      .lte('data_fechamento', fim)
      .order('data_fechamento', { ascending: false })
    if (funisExcluidos.length) q = q.not('funil_id', 'in', `(${funisExcluidos.join(',')})`)
    const dados = await fetchAllPaged<Linha>(q)
    setLinhas(dados)
    setLoading(false)
  }

  const totalPremio   = linhas.reduce((s, l) => s + Number(l.premio || 0), 0)
  const totalComissao = linhas.reduce((s, l) => s + Number(l.premio || 0) * Number(l.comissao_pct || 0) / 100, 0)
  const fmtMoeda = (n: number) => 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  // Agrupar por funil para um resumo
  const porFunil: Record<string, { nome: string; emoji?: string; qtd: number; premio: number }> = {}
  for (const l of linhas) {
    const key = l.funil_id || 'sem'
    const nome = l.funis?.nome || 'Sem funil'
    if (!porFunil[key]) porFunil[key] = { nome, emoji: l.funis?.emoji, qtd: 0, premio: 0 }
    porFunil[key].qtd += 1
    porFunil[key].premio += Number(l.premio || 0)
  }
  const resumoFunis = Object.values(porFunil).sort((a, b) => b.premio - a.premio)

  return (
    <div style={{flex:1, overflow:'auto'}}>
      <div style={{height:56,borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',padding:'0 28px',gap:14,background:'var(--bg-soft)',backdropFilter:'blur(8px)',position:'sticky',top:0,zIndex:5}}>
        <button onClick={() => router.push('/dashboard')}
          style={{padding:'6px 12px',borderRadius:8,fontSize:12,fontWeight:600,cursor:'pointer',border:'1px solid var(--border)',background:'rgba(255,255,255,0.04)',color:'var(--text-muted)'}}>
          ← Dashboard
        </button>
        <div style={{fontFamily:'DM Serif Display,serif',fontSize:18,flex:1}}>Vendas do vendedor</div>
      </div>

      <div style={{padding:'28px 28px 40px'}}>
        {loading ? (
          <div style={{padding:40,color:'var(--text-muted)'}}>Carregando vendas...</div>
        ) : erro ? (
          <div className="card" style={{padding:24, color:'var(--red)'}}>{erro}</div>
        ) : (
          <>
            {/* Cabeçalho */}
            <div className="card" style={{padding:20, marginBottom:18, display:'flex', alignItems:'center', gap:18}}>
              <Avatar nome={vendedor?.nome} avatarUrl={vendedor?.avatar_url} role={vendedor?.role} size={56} />
              <div style={{flex:1, minWidth:0}}>
                <div style={{fontFamily:'DM Serif Display,serif', fontSize:22}}>{vendedor?.nome || nomeUrl || '—'}</div>
                <div style={{fontSize:12, color:'var(--text-muted)', marginTop:2}}>
                  Período: <strong style={{color:'var(--gold)'}}>{rotulo || `${new Date(inicio).toLocaleDateString('pt-BR')} – ${new Date(fim).toLocaleDateString('pt-BR')}`}</strong> · Exclui funil EMISSÃO E IMPLANTAÇÃO
                </div>
              </div>
              <div style={{display:'flex', gap:24, alignItems:'center'}}>
                <div style={{textAlign:'right'}}>
                  <div style={{fontSize:10, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:1}}>Apólices</div>
                  <div style={{fontSize:22, fontWeight:700, color:'var(--teal)'}}>{linhas.length}</div>
                </div>
                <div style={{textAlign:'right'}}>
                  <div style={{fontSize:10, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:1}}>Prêmio total</div>
                  <div style={{fontSize:22, fontWeight:700, color:'var(--gold)'}}>{fmtMoeda(totalPremio)}</div>
                </div>
                <div style={{textAlign:'right'}}>
                  <div style={{fontSize:10, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:1}}>Comissão</div>
                  <div style={{fontSize:18, fontWeight:700, color:'var(--text)'}}>{fmtMoeda(totalComissao)}</div>
                </div>
              </div>
            </div>

            {/* Resumo por funil */}
            {resumoFunis.length > 0 && (
              <div className="card" style={{padding:18, marginBottom:18}}>
                <div style={{fontFamily:'DM Serif Display,serif', fontSize:14, marginBottom:12}}>Distribuição por funil</div>
                <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(180px, 1fr))', gap:12}}>
                  {resumoFunis.map((f, i) => (
                    <div key={i} style={{padding:'10px 14px', background:'rgba(255,255,255,0.03)', border:'1px solid var(--border)', borderRadius:10}}>
                      <div style={{fontSize:12, color:'var(--text-muted)', marginBottom:4}}>{f.emoji || ''} {f.nome}</div>
                      <div style={{fontSize:16, fontWeight:700, color:'var(--gold)'}}>{fmtMoeda(f.premio)}</div>
                      <div style={{fontSize:11, color:'var(--text-muted)', marginTop:2}}>{f.qtd} apólice{f.qtd !== 1 ? 's' : ''}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Lista de negócios */}
            <div className="card" style={{padding:0, overflow:'hidden'}}>
              <div style={{padding:'14px 18px', borderBottom:'1px solid var(--border)', fontFamily:'DM Serif Display,serif', fontSize:14}}>
                Negócios ganhos no período ({linhas.length})
              </div>
              {linhas.length === 0 ? (
                <div style={{padding:30, textAlign:'center', color:'var(--text-muted)', fontSize:13}}>
                  Nenhuma venda fechada por este vendedor no período selecionado.
                </div>
              ) : (
                <div style={{overflowX:'auto'}}>
                  <table style={{width:'100%', borderCollapse:'collapse', fontSize:13}}>
                    <thead>
                      <tr style={{background:'rgba(255,255,255,0.03)', textAlign:'left'}}>
                        <th style={{padding:'10px 14px', fontSize:11, textTransform:'uppercase', color:'var(--text-muted)', fontWeight:600, letterSpacing:0.5}}>Data</th>
                        <th style={{padding:'10px 14px', fontSize:11, textTransform:'uppercase', color:'var(--text-muted)', fontWeight:600, letterSpacing:0.5}}>Cliente</th>
                        <th style={{padding:'10px 14px', fontSize:11, textTransform:'uppercase', color:'var(--text-muted)', fontWeight:600, letterSpacing:0.5}}>Funil</th>
                        <th style={{padding:'10px 14px', fontSize:11, textTransform:'uppercase', color:'var(--text-muted)', fontWeight:600, letterSpacing:0.5}}>Produto</th>
                        <th style={{padding:'10px 14px', fontSize:11, textTransform:'uppercase', color:'var(--text-muted)', fontWeight:600, letterSpacing:0.5}}>Seguradora</th>
                        <th style={{padding:'10px 14px', fontSize:11, textTransform:'uppercase', color:'var(--text-muted)', fontWeight:600, letterSpacing:0.5, textAlign:'right'}}>Prêmio</th>
                        <th style={{padding:'10px 14px', fontSize:11, textTransform:'uppercase', color:'var(--text-muted)', fontWeight:600, letterSpacing:0.5, textAlign:'right'}}>Comissão</th>
                      </tr>
                    </thead>
                    <tbody>
                      {linhas.map((l) => {
                        const com = Number(l.premio || 0) * Number(l.comissao_pct || 0) / 100
                        return (
                          <tr key={l.id}
                            onClick={() => router.push(`/dashboard/funis?card=${l.id}`)}
                            style={{cursor:'pointer', borderTop:'1px solid var(--border)', transition:'background 0.12s'}}
                            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                          >
                            <td style={{padding:'10px 14px', whiteSpace:'nowrap'}}>{l.data_fechamento ? new Date(l.data_fechamento).toLocaleDateString('pt-BR') : '—'}</td>
                            <td style={{padding:'10px 14px'}}>{l.clientes?.nome || '—'}</td>
                            <td style={{padding:'10px 14px', whiteSpace:'nowrap'}}>{l.funis?.emoji || ''} {l.funis?.nome || '—'}</td>
                            <td style={{padding:'10px 14px'}}>{l.produto || '—'}</td>
                            <td style={{padding:'10px 14px'}}>{l.seguradora || '—'}</td>
                            <td style={{padding:'10px 14px', textAlign:'right', fontWeight:600, color:'var(--gold)'}}>{fmtMoeda(Number(l.premio || 0))}</td>
                            <td style={{padding:'10px 14px', textAlign:'right', color:'var(--text-muted)'}}>{fmtMoeda(com)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr style={{borderTop:'2px solid var(--border)', background:'rgba(201,168,76,0.04)'}}>
                        <td colSpan={5} style={{padding:'12px 14px', fontWeight:600, color:'var(--text-muted)', textTransform:'uppercase', fontSize:11, letterSpacing:0.5}}>Totais</td>
                        <td style={{padding:'12px 14px', textAlign:'right', fontWeight:700, color:'var(--gold)', fontSize:14}}>{fmtMoeda(totalPremio)}</td>
                        <td style={{padding:'12px 14px', textAlign:'right', fontWeight:700, color:'var(--text)'}}>{fmtMoeda(totalComissao)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
