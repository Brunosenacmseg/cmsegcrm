'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

type Campanha = {
  id: string
  meta_id: string
  nome: string
  status: string | null
  objetivo: string | null
  daily_budget: number | null
}
type Insight = {
  entidade_id: string
  entidade_tipo: string
  data: string
  impressoes: number
  cliques: number
  gasto: number
  leads: number
}
type Vendas = {
  campanha_meta_id: string
  vendas: number
  perdas: number
  em_andamento: number
  receita_total: number
  ticket_medio: number
}

export default function CampanhasPage() {
  const supabase = createClient()
  const router = useRouter()
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [campanhas, setCampanhas] = useState<Campanha[]>([])
  const [insights, setInsights] = useState<Insight[]>([])
  const [vendas, setVendas] = useState<Record<string, Vendas>>({})
  const [periodo, setPeriodo] = useState<7 | 30 | 90>(30)
  const [statusFiltro, setStatusFiltro] = useState<'todas'|'ACTIVE'|'PAUSED'>('ACTIVE')
  const [sincronizando, setSincronizando] = useState(false)
  const [msg, setMsg] = useState<string|null>(null)

  useEffect(() => { init() }, [periodo])

  async function init() {
    setLoading(true)
    const { data:{ user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    const { data: prof } = await supabase.from('users').select('*').eq('id', user.id).single()
    setProfile(prof)

    const desde = new Date(Date.now() - periodo * 86400 * 1000).toISOString().slice(0,10)
    const [{ data: cps }, { data: ins }, { data: vds }] = await Promise.all([
      supabase.from('meta_campanhas').select('*').order('atualizada_em', { ascending: false }),
      supabase.from('meta_insights').select('*').eq('entidade_tipo', 'campanha').gte('data', desde),
      supabase.from('meta_vendas_por_campanha').select('*'),
    ])
    setCampanhas((cps || []) as any)
    setInsights((ins || []) as any)
    const mp: Record<string, Vendas> = {}
    for (const v of vds || []) mp[(v as any).campanha_meta_id] = v as any
    setVendas(mp)
    setLoading(false)
  }

  async function authHeaders() {
    const { data: { session } } = await supabase.auth.getSession()
    const h: Record<string, string> = { 'Content-Type': 'application/json' }
    if (session?.access_token) h['Authorization'] = `Bearer ${session.access_token}`
    return h
  }

  async function sincronizar() {
    setSincronizando(true); setMsg(null)
    try {
      const r = await fetch('/api/meta/sync', { method:'POST', headers: await authHeaders(), body: JSON.stringify({ recurso:'all' }) })
      const j = await r.json()
      if (!r.ok) { setMsg('❌ ' + (j.error || 'erro')); return }
      setMsg('✅ Sincronizado: ' + JSON.stringify(j.resultados))
      await init()
    } finally { setSincronizando(false) }
  }

  // Agrega insights por campanha
  const totaisPorCampanha: Record<string, { gasto: number; impressoes: number; cliques: number; leads: number }> = {}
  for (const i of insights) {
    if (!totaisPorCampanha[i.entidade_id]) totaisPorCampanha[i.entidade_id] = { gasto:0, impressoes:0, cliques:0, leads:0 }
    totaisPorCampanha[i.entidade_id].gasto += Number(i.gasto || 0)
    totaisPorCampanha[i.entidade_id].impressoes += Number(i.impressoes || 0)
    totaisPorCampanha[i.entidade_id].cliques += Number(i.cliques || 0)
    totaisPorCampanha[i.entidade_id].leads += Number(i.leads || 0)
  }

  const filtradas = campanhas.filter(c => statusFiltro === 'todas' || c.status === statusFiltro)

  // Totais agregados
  const tGasto = filtradas.reduce((s,c)=> s + (totaisPorCampanha[c.meta_id]?.gasto || 0), 0)
  const tImpressoes = filtradas.reduce((s,c)=> s + (totaisPorCampanha[c.meta_id]?.impressoes || 0), 0)
  const tCliques = filtradas.reduce((s,c)=> s + (totaisPorCampanha[c.meta_id]?.cliques || 0), 0)
  const tLeads = filtradas.reduce((s,c)=> s + (totaisPorCampanha[c.meta_id]?.leads || 0), 0)
  const tVendas = filtradas.reduce((s,c)=> s + (vendas[c.meta_id]?.vendas || 0), 0)
  const tReceita = filtradas.reduce((s,c)=> s + Number(vendas[c.meta_id]?.receita_total || 0), 0)
  const roas = tGasto > 0 ? tReceita / tGasto : 0
  const cpl = tLeads > 0 ? tGasto / tLeads : 0
  const ctr = tImpressoes > 0 ? (tCliques / tImpressoes) * 100 : 0

  if (loading) return <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',color:'var(--text-muted)'}}>Carregando...</div>

  const isAdmin = profile?.role === 'admin'
  const fmt   = (n: number) => Number(n||0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const fmtN  = (n: number) => Number(n||0).toLocaleString('pt-BR')

  return (
    <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
      <div style={{height:56,borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',padding:'0 28px',gap:12,background:'rgba(10,22,40,0.7)',position:'sticky',top:0,zIndex:5}}>
        <div style={{fontFamily:'DM Serif Display,serif',fontSize:18,flex:1}}>📣 Campanhas Meta</div>
        <select value={periodo} onChange={e=>setPeriodo(Number(e.target.value) as any)}
          style={{padding:'7px 12px',borderRadius:8,border:'1px solid var(--border)',background:'rgba(255,255,255,0.04)',color:'var(--text)',fontSize:12,fontFamily:'DM Sans,sans-serif'}}>
          <option value={7}>Últimos 7 dias</option>
          <option value={30}>Últimos 30 dias</option>
          <option value={90}>Últimos 90 dias</option>
        </select>
        <select value={statusFiltro} onChange={e=>setStatusFiltro(e.target.value as any)}
          style={{padding:'7px 12px',borderRadius:8,border:'1px solid var(--border)',background:'rgba(255,255,255,0.04)',color:'var(--text)',fontSize:12,fontFamily:'DM Sans,sans-serif'}}>
          <option value="ACTIVE">Ativas</option>
          <option value="PAUSED">Pausadas</option>
          <option value="todas">Todas</option>
        </select>
        {isAdmin && (
          <>
            <button onClick={()=>router.push('/dashboard/integracoes/meta')}
              style={{padding:'7px 14px',borderRadius:8,fontSize:12,cursor:'pointer',border:'1px solid var(--border)',background:'rgba(255,255,255,0.04)',color:'var(--text-muted)',fontFamily:'DM Sans,sans-serif'}}>
              ⚙ Conectar Meta
            </button>
            <button onClick={sincronizar} disabled={sincronizando} className="btn-primary"
              style={{padding:'7px 14px',fontSize:12}}>
              {sincronizando?'⏳ Sincronizando...':'🔄 Sincronizar'}
            </button>
          </>
        )}
      </div>

      <div style={{flex:1,overflow:'auto',padding:'24px 28px'}}>
        {msg && (
          <div style={{padding:'10px 14px',marginBottom:16,borderRadius:8,fontSize:12,background:msg.startsWith('✅')?'rgba(28,181,160,0.1)':'rgba(224,82,82,0.1)',color:msg.startsWith('✅')?'var(--teal)':'var(--red)',border:'1px solid '+(msg.startsWith('✅')?'rgba(28,181,160,0.3)':'rgba(224,82,82,0.3)')}}>
            {msg}
          </div>
        )}

        {campanhas.length === 0 ? (
          <div style={{padding:40,textAlign:'center',color:'var(--text-muted)',border:'1px dashed var(--border)',borderRadius:12}}>
            <div style={{fontSize:36,marginBottom:10}}>📣</div>
            <div style={{fontSize:14,marginBottom:6}}>Nenhuma campanha sincronizada ainda</div>
            <div style={{fontSize:12}}>{isAdmin ? 'Configure a integração em ⚙ Conectar Meta e clique em 🔄 Sincronizar' : 'Peça pra um admin configurar a integração Meta Ads'}</div>
          </div>
        ) : (
          <>
            {/* Cards de totais */}
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(160px, 1fr))',gap:14,marginBottom:24}}>
              {[
                { label:'Gasto', val:`R$ ${fmt(tGasto)}`, cor:'var(--red)' },
                { label:'Receita', val:`R$ ${fmt(tReceita)}`, cor:'var(--teal)' },
                { label:'ROAS', val:roas.toFixed(2)+'x', cor:roas>=1?'var(--teal)':'var(--red)' },
                { label:'Leads', val:fmtN(tLeads), cor:'var(--gold)' },
                { label:'Vendas', val:fmtN(tVendas), cor:'var(--gold)' },
                { label:'CPL', val:`R$ ${fmt(cpl)}`, cor:'var(--text)' },
                { label:'CTR', val:ctr.toFixed(2)+'%', cor:'var(--text)' },
                { label:'Impressões', val:fmtN(tImpressoes), cor:'var(--text-muted)' },
              ].map(card => (
                <div key={card.label} className="card" style={{padding:'14px 16px'}}>
                  <div style={{fontSize:10,fontWeight:600,letterSpacing:'1.2px',textTransform:'uppercase',color:'var(--text-muted)',marginBottom:6}}>{card.label}</div>
                  <div style={{fontSize:20,fontWeight:600,color:card.cor,fontFamily:'DM Serif Display,serif'}}>{card.val}</div>
                </div>
              ))}
            </div>

            {/* Tabela */}
            <div className="card">
              <div style={{fontFamily:'DM Serif Display,serif',fontSize:15,marginBottom:14}}>Campanhas ({filtradas.length})</div>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                <thead>
                  <tr style={{textAlign:'left',color:'var(--text-muted)',fontSize:10,letterSpacing:'1px',textTransform:'uppercase'}}>
                    <th style={{padding:'8px 4px',borderBottom:'1px solid var(--border)'}}>Campanha</th>
                    <th style={{padding:'8px 4px',borderBottom:'1px solid var(--border)',textAlign:'center'}}>Status</th>
                    <th style={{padding:'8px 4px',borderBottom:'1px solid var(--border)',textAlign:'right'}}>Gasto</th>
                    <th style={{padding:'8px 4px',borderBottom:'1px solid var(--border)',textAlign:'right'}}>Impr.</th>
                    <th style={{padding:'8px 4px',borderBottom:'1px solid var(--border)',textAlign:'right'}}>CTR</th>
                    <th style={{padding:'8px 4px',borderBottom:'1px solid var(--border)',textAlign:'right'}}>Leads</th>
                    <th style={{padding:'8px 4px',borderBottom:'1px solid var(--border)',textAlign:'right'}}>CPL</th>
                    <th style={{padding:'8px 4px',borderBottom:'1px solid var(--border)',textAlign:'right'}}>Vendas</th>
                    <th style={{padding:'8px 4px',borderBottom:'1px solid var(--border)',textAlign:'right'}}>Receita</th>
                    <th style={{padding:'8px 4px',borderBottom:'1px solid var(--border)',textAlign:'right'}}>ROAS</th>
                  </tr>
                </thead>
                <tbody>
                  {filtradas.map(c => {
                    const t = totaisPorCampanha[c.meta_id] || { gasto:0,impressoes:0,cliques:0,leads:0 }
                    const v = vendas[c.meta_id] || { vendas:0, receita_total:0 } as any
                    const ctrC = t.impressoes > 0 ? (t.cliques / t.impressoes) * 100 : 0
                    const cplC = t.leads > 0 ? t.gasto / t.leads : 0
                    const roasC = t.gasto > 0 ? Number(v.receita_total || 0) / t.gasto : 0
                    const corStatus = c.status === 'ACTIVE' ? 'var(--teal)' : c.status === 'PAUSED' ? 'var(--gold)' : 'var(--text-muted)'
                    return (
                      <tr key={c.id} style={{borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
                        <td style={{padding:'10px 4px'}}>
                          <div style={{fontWeight:500}}>{c.nome}</div>
                          <div style={{fontSize:10,color:'var(--text-muted)'}}>{c.objetivo || '—'}</div>
                        </td>
                        <td style={{padding:'10px 4px',textAlign:'center'}}>
                          <span style={{fontSize:9,fontWeight:700,letterSpacing:'1px',padding:'2px 8px',borderRadius:5,textTransform:'uppercase',color:corStatus,border:'1px solid '+corStatus+'66'}}>{c.status||'—'}</span>
                        </td>
                        <td style={{padding:'10px 4px',textAlign:'right',color:'var(--red)'}}>R$ {fmt(t.gasto)}</td>
                        <td style={{padding:'10px 4px',textAlign:'right'}}>{fmtN(t.impressoes)}</td>
                        <td style={{padding:'10px 4px',textAlign:'right'}}>{ctrC.toFixed(2)}%</td>
                        <td style={{padding:'10px 4px',textAlign:'right',color:'var(--gold)'}}>{fmtN(t.leads)}</td>
                        <td style={{padding:'10px 4px',textAlign:'right'}}>R$ {fmt(cplC)}</td>
                        <td style={{padding:'10px 4px',textAlign:'right',color:'var(--teal)',fontWeight:600}}>{fmtN(v.vendas || 0)}</td>
                        <td style={{padding:'10px 4px',textAlign:'right',color:'var(--teal)'}}>R$ {fmt(Number(v.receita_total||0))}</td>
                        <td style={{padding:'10px 4px',textAlign:'right',fontWeight:600,color:roasC>=1?'var(--teal)':'var(--red)'}}>{roasC.toFixed(2)}x</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
