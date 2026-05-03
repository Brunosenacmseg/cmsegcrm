'use client'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Avatar from '@/components/Avatar'

const ETAPAS_FECHADAS_GANHAS = ['Fechado Ganho','Renovado','Pago','Concluído']

type Periodo = 'mes_atual' | 'mes_anterior' | 'semana' | 'custom'

function intervaloDoPeriodo(p: Periodo, inicioCustom?: string, fimCustom?: string): { inicio: string; fim: string; rotulo: string } {
  const hoje = new Date()
  const fimDia = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999)
  if (p === 'mes_atual') {
    const i = new Date(hoje.getFullYear(), hoje.getMonth(), 1)
    return { inicio: i.toISOString(), fim: hoje.toISOString(), rotulo: i.toLocaleDateString('pt-BR',{month:'long',year:'numeric'}) }
  }
  if (p === 'mes_anterior') {
    const i = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1)
    const f = new Date(hoje.getFullYear(), hoje.getMonth(), 0, 23, 59, 59, 999)
    return { inicio: i.toISOString(), fim: f.toISOString(), rotulo: i.toLocaleDateString('pt-BR',{month:'long',year:'numeric'}) }
  }
  if (p === 'semana') {
    const dia = hoje.getDay() // 0=dom
    const offsetParaSegunda = (dia + 6) % 7 // dias desde segunda
    const i = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - offsetParaSegunda)
    return { inicio: i.toISOString(), fim: hoje.toISOString(), rotulo: 'Esta semana' }
  }
  // custom
  const i = inicioCustom ? new Date(inicioCustom + 'T00:00:00') : new Date(hoje.getFullYear(), hoje.getMonth(), 1)
  const f = fimCustom    ? fimDia(new Date(fimCustom + 'T00:00:00')) : hoje
  return { inicio: i.toISOString(), fim: f.toISOString(), rotulo: `${i.toLocaleDateString('pt-BR')} – ${f.toLocaleDateString('pt-BR')}` }
}

export default function DashboardPage() {
  const supabase = createClient()
  const router   = useRouter()
  const [profile, setProfile]   = useState<any>(null)
  const [loading, setLoading]   = useState(true)
  const [periodo, setPeriodo]   = useState<Periodo>('mes_atual')
  const [ini, setIni] = useState('')
  const [fim, setFim] = useState('')
  const [usuarios, setUsuarios] = useState<any[]>([])

  const [ranking, setRanking]       = useState<any[]>([])
  const [rankingLig, setRankingLig] = useState<any[]>([])
  const [tarefasPend, setTarefasPend] = useState<any[]>([])

  const [dados, setDados] = useState<any>({
    premioMes:0, premioMesAnterior:0,
    novosClientes:0, novosClientesAnterior:0,
    apolicesAtivas:0, renovacoes30d:0,
    mediaComissao:0, alertas:[],
    tendencia:[] as { mes:string; valor:number }[],
  })

  const intervalo = useMemo(() => intervaloDoPeriodo(periodo, ini, fim), [periodo, ini, fim])

  useEffect(() => { carregarKPIs() }, [])
  useEffect(() => { if (!loading) carregarRankings() }, [periodo, ini, fim, loading])

  async function carregarKPIs() {
    const hoje = new Date()
    const inicioMes      = new Date(hoje.getFullYear(), hoje.getMonth(),   1).toISOString()
    const inicioMesAnt   = new Date(hoje.getFullYear(), hoje.getMonth()-1, 1).toISOString()
    const em30dias       = new Date(hoje.getTime() + 30*24*60*60*1000).toISOString().slice(0,10)
    const inicioSemestre = new Date(hoje.getFullYear(), hoje.getMonth()-5, 1).toISOString()

    const { data: { user } } = await supabase.auth.getUser()
    const { data: prof } = await supabase.from('users').select('*').eq('id', user?.id||'').single()
    setProfile(prof)
    const onlyMine = prof?.role === 'corretor'
    const meId = user?.id || ''
    const scoped = (q: any, col: string = 'vendedor_id') => onlyMine ? q.eq(col, meId) : q

    const [
      { data: negs },
      { count: novosCount },
      { count: novosCountAnterior },
      { data: renovs },
      { data: usr },
      { data: negsSemestre },
    ] = await Promise.all([
      scoped(supabase.from('negocios').select('premio, comissao_pct, etapa, funil_id, vendedor_id, created_at')),
      scoped(supabase.from('clientes').select('id', { count: 'exact', head: true }).gte('created_at', inicioMes)),
      scoped(supabase.from('clientes').select('id', { count: 'exact', head: true }).gte('created_at', inicioMesAnt).lt('created_at', inicioMes)),
      scoped(supabase.from('negocios').select('id, vencimento, produto, clientes(nome)').lte('vencimento', em30dias).gt('vencimento', hoje.toISOString().slice(0,10)).order('vencimento')),
      supabase.from('users').select('id, nome, avatar_url, role').order('nome'),
      scoped(supabase.from('negocios').select('premio, etapa, created_at').gte('created_at', inicioSemestre)),
    ])

    setUsuarios(usr || [])

    const fechadasNoMes = (negs||[]).filter((n:any) => ETAPAS_FECHADAS_GANHAS.includes(n.etapa) && n.created_at >= inicioMes)
    const fechadasNoMesAnt = (negs||[]).filter((n:any) => ETAPAS_FECHADAS_GANHAS.includes(n.etapa) && n.created_at >= inicioMesAnt && n.created_at < inicioMes)
    const premioMes = fechadasNoMes.reduce((s:number,n:any)=>s+(n.premio||0),0)
    const premioMesAnterior = fechadasNoMesAnt.reduce((s:number,n:any)=>s+(n.premio||0),0)
    const ativos = (negs||[]).filter((n:any) => !ETAPAS_FECHADAS_GANHAS.includes(n.etapa))
    const comissoes = ativos.filter((n:any)=>n.comissao_pct>0).map((n:any)=>n.comissao_pct)
    const mediaComissao = comissoes.length ? comissoes.reduce((a:number,b:number)=>a+b,0)/comissoes.length : 0

    const tendencia: { mes: string; valor: number }[] = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(hoje.getFullYear(), hoje.getMonth()-i, 1)
      const iniM = d.toISOString()
      const fimM = new Date(d.getFullYear(), d.getMonth()+1, 1).toISOString()
      const valor = (negsSemestre||[])
        .filter((n:any) => ETAPAS_FECHADAS_GANHAS.includes(n.etapa) && n.created_at >= iniM && n.created_at < fimM)
        .reduce((s:number,n:any) => s+(n.premio||0), 0)
      tendencia.push({ mes: d.toLocaleDateString('pt-BR', { month: 'short' }), valor })
    }

    setDados({
      premioMes, premioMesAnterior,
      novosClientes: novosCount||0, novosClientesAnterior: novosCountAnterior||0,
      apolicesAtivas: ativos.length,
      renovacoes30d: (renovs||[]).length,
      mediaComissao,
      alertas: (renovs||[]).slice(0,3),
      tendencia,
    })
    setLoading(false)
  }

  async function carregarRankings() {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: prof } = await supabase.from('users').select('role').eq('id', user?.id||'').single()
    const onlyMine = (prof as any)?.role === 'corretor'
    const meId = user?.id || ''

    // — Ranking de Vendas (negócios fechados ganhos no período) —
    let qNegs = supabase.from('negocios')
      .select('premio, comissao_pct, vendedor_id, etapa')
      .in('etapa', ETAPAS_FECHADAS_GANHAS)
      .gte('created_at', intervalo.inicio).lte('created_at', intervalo.fim)
    if (onlyMine) qNegs = qNegs.eq('vendedor_id', meId)
    const { data: negs } = await qNegs

    // — Ranking de Ligações (sainte+encerrada) —
    let qLig = supabase.from('ligacoes')
      .select('user_id, duracao_seg, status')
      .gte('criado_em', intervalo.inicio).lte('criado_em', intervalo.fim)
    if (onlyMine) qLig = qLig.eq('user_id', meId)
    const { data: ligs } = await qLig

    // — Tarefas pendentes (não fecha por período; mostra atual) —
    let qTar = supabase.from('tarefas')
      .select('id, titulo, descricao, prazo, status, responsavel_id, cliente_id, clientes(nome)')
      .eq('status', 'pendente')
      .order('prazo', { ascending: true, nullsFirst: false })
      .limit(50)
    if (onlyMine) qTar = qTar.eq('responsavel_id', meId)
    const { data: tar } = await qTar
    setTarefasPend(tar || [])

    // Mapear vendas
    const mapV: Record<string,{user_id:string,nome:string,avatar_url?:string,role?:string,premio:number,apolices:number,comissao:number}> = {}
    ;(usuarios||[]).forEach((u:any) => { mapV[u.id] = { user_id:u.id, nome:u.nome, avatar_url:u.avatar_url, role:u.role, premio:0, apolices:0, comissao:0 } })
    ;(negs||[]).forEach((n:any) => {
      if (!n.vendedor_id || !mapV[n.vendedor_id]) return
      mapV[n.vendedor_id].premio   += n.premio||0
      mapV[n.vendedor_id].apolices += 1
      mapV[n.vendedor_id].comissao += (n.premio||0)*(n.comissao_pct||0)/100
    })
    const arrV = Object.values(mapV).filter(v => v.premio > 0 || v.apolices > 0).sort((a,b)=>b.premio - a.premio)
    setRanking(arrV)

    // Mapear ligações
    const mapL: Record<string,{user_id:string,nome:string,avatar_url?:string,role?:string,total:number,duracao:number}> = {}
    ;(usuarios||[]).forEach((u:any) => { mapL[u.id] = { user_id:u.id, nome:u.nome, avatar_url:u.avatar_url, role:u.role, total:0, duracao:0 } })
    ;(ligs||[]).forEach((l:any) => {
      if (!l.user_id || !mapL[l.user_id]) return
      mapL[l.user_id].total += 1
      mapL[l.user_id].duracao += l.duracao_seg || 0
    })
    const arrL = Object.values(mapL).filter(v => v.total > 0).sort((a,b)=>b.total-a.total)
    setRankingLig(arrL)
  }

  const fmt = (n: number) => n >= 1000 ? `R$ ${(n/1000).toFixed(0)}k` : `R$ ${n.toLocaleString('pt-BR')}`
  const isAdmin = profile?.role === 'admin'
  const isLider = profile?.role === 'lider'

  function delta(atual: number, anterior: number): { texto: string; cor: string } {
    if (anterior === 0 && atual === 0) return { texto: '—', cor: 'var(--text-muted)' }
    if (anterior === 0)                return { texto: '+ novo', cor: 'var(--teal)' }
    const pct = Math.round(((atual - anterior) / anterior) * 100)
    if (pct === 0) return { texto: '= mês ant.', cor: 'var(--text-muted)' }
    const sinal = pct > 0 ? '↑' : '↓'
    return { texto: `${sinal} ${Math.abs(pct)}% vs mês ant.`, cor: pct > 0 ? 'var(--teal)' : 'var(--red)' }
  }
  const dPremio   = delta(dados.premioMes, dados.premioMesAnterior)
  const dClientes = delta(dados.novosClientes, dados.novosClientesAnterior)

  if (loading) return <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',color:'var(--text-muted)'}}>Carregando...</div>

  const maxPremio = Math.max(1, ...ranking.map(r => r.premio))
  const maxLig    = Math.max(1, ...rankingLig.map(r => r.total))
  const podeVerTimes = isAdmin || isLider

  return (
    <div style={{flex:1, overflow:'auto'}}>
      <div style={{height:56,borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',padding:'0 28px',gap:16,background:'var(--bg-soft)',backdropFilter:'blur(8px)',position:'sticky',top:0,zIndex:5}}>
        <div style={{fontFamily:'DM Serif Display,serif',fontSize:18,flex:1}}>Dashboard</div>
        <button className="btn-primary" onClick={()=>router.push('/dashboard/clientes/novo')}>+ Novo Lead</button>
      </div>

      <div style={{padding:'28px 28px 40px'}}>
        {/* ═════════ FILTRO DE PERÍODO ═════════ */}
        {podeVerTimes && (
          <div className="card" style={{marginBottom:18, padding:'14px 18px', display:'flex', alignItems:'center', gap:10, flexWrap:'wrap'}}>
            <span style={{fontSize:11, color:'var(--text-muted)', textTransform:'uppercase', fontWeight:600, letterSpacing:1, marginRight:6}}>Período do ranking:</span>
            {(['mes_atual','mes_anterior','semana','custom'] as Periodo[]).map(p => (
              <button key={p} onClick={()=>setPeriodo(p)} style={{
                padding:'6px 14px', borderRadius:20, fontSize:12, cursor:'pointer',
                border:'1px solid', fontFamily:'DM Sans,sans-serif', fontWeight:600,
                background: periodo===p ? 'rgba(201,168,76,0.12)' : 'rgba(255,255,255,0.04)',
                color: periodo===p ? 'var(--gold)' : 'var(--text-muted)',
                borderColor: periodo===p ? 'var(--gold)' : 'var(--border)',
              }}>
                {p==='mes_atual'?'📅 Mês atual':p==='mes_anterior'?'⬅ Mês anterior':p==='semana'?'📆 Esta semana':'🎯 Personalizado'}
              </button>
            ))}
            {periodo==='custom' && (
              <>
                <input type="date" value={ini} onChange={e=>setIni(e.target.value)}
                  style={{padding:'6px 10px',borderRadius:6,border:'1px solid var(--border)',background:'rgba(255,255,255,0.05)',color:'var(--text)',fontSize:12}} />
                <span style={{fontSize:12,color:'var(--text-muted)'}}>até</span>
                <input type="date" value={fim} onChange={e=>setFim(e.target.value)}
                  style={{padding:'6px 10px',borderRadius:6,border:'1px solid var(--border)',background:'rgba(255,255,255,0.05)',color:'var(--text)',fontSize:12}} />
              </>
            )}
            <span style={{marginLeft:'auto', fontSize:11, color:'var(--text-muted)'}}>
              Exibindo <strong style={{color:'var(--gold)'}}>{intervalo.rotulo}</strong>
            </span>
          </div>
        )}

        {/* ═════════ RANKING DE VENDAS — TOPO, GRANDE, "CORRIDA" ═════════ */}
        {podeVerTimes && (
          <div className="card" style={{marginBottom:18, padding:'24px 28px', background:'linear-gradient(180deg, rgba(201,168,76,0.04), transparent)'}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:18}}>
              <div>
                <div style={{fontFamily:'DM Serif Display,serif', fontSize:24, lineHeight:1.1}}>🏆 Ranking de Vendas</div>
                <div style={{fontSize:12, color:'var(--text-muted)', marginTop:4}}>
                  Os atletas estão na pista. Quem chega primeiro?
                </div>
              </div>
              {ranking[0] && (
                <div style={{textAlign:'right'}}>
                  <div style={{fontSize:10, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:1}}>Líder</div>
                  <div style={{fontFamily:'DM Serif Display,serif', fontSize:18, color:'var(--gold)'}}>{ranking[0].nome}</div>
                  <div style={{fontSize:11, color:'var(--text-muted)'}}>R$ {ranking[0].premio.toLocaleString('pt-BR')} prêmio</div>
                </div>
              )}
            </div>

            {ranking.length === 0 ? (
              <div style={{padding:30, textAlign:'center', color:'var(--text-muted)', fontSize:13}}>
                Nenhuma venda fechada no período — corrida começa quando o primeiro fecha! 🏁
              </div>
            ) : (
              <div style={{display:'flex',flexDirection:'column',gap:14}}>
                {ranking.slice(0,10).map((r:any, i:number) => {
                  const pct = (r.premio / maxPremio) * 100
                  const medalha = i===0?'🥇':i===1?'🥈':i===2?'🥉':`${i+1}º`
                  const corMed = i===0?'var(--gold)':i===1?'#9ba3b0':i===2?'#c07830':'var(--text-muted)'
                  return (
                    <div key={r.user_id} style={{display:'flex',alignItems:'center',gap:14}}>
                      <div style={{width:36,fontSize:i<3?22:14,fontWeight:700,color:corMed,textAlign:'center',flexShrink:0}}>{medalha}</div>
                      <div style={{minWidth:150, display:'flex', alignItems:'center', gap:10, flexShrink:0}}>
                        <Avatar nome={r.nome} avatarUrl={r.avatar_url} role={r.role} size={40} />
                        <div style={{minWidth:0}}>
                          <div style={{fontSize:13,fontWeight:600,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',maxWidth:140}}>{r.nome}</div>
                          <div style={{fontSize:10,color:'var(--text-muted)'}}>{r.apolices} apólice{r.apolices!==1?'s':''}</div>
                        </div>
                      </div>
                      {/* PISTA */}
                      <div style={{flex:1, position:'relative', height:32, background:'rgba(255,255,255,0.04)', borderRadius:16, border:'1px dashed rgba(255,255,255,0.06)', overflow:'hidden'}}>
                        {/* linha de meta */}
                        <div style={{position:'absolute',right:0,top:0,bottom:0,width:6,background:'repeating-linear-gradient(45deg,rgba(201,168,76,0.7) 0 4px,transparent 4px 8px)'}}/>
                        {/* barra preenchida */}
                        <div style={{position:'absolute',left:0,top:0,bottom:0, width:`${pct}%`,
                          background: i===0
                            ? 'linear-gradient(90deg, rgba(201,168,76,0.35), rgba(201,168,76,0.7))'
                            : 'linear-gradient(90deg, rgba(28,181,160,0.20), rgba(28,181,160,0.45))',
                          borderRadius:16, transition:'width 0.8s ease'}}/>
                        {/* "corredor" — avatar posicionado pelo progresso */}
                        <div style={{position:'absolute', left:`calc(${pct}% - 14px)`, top:'50%', transform:'translateY(-50%)', transition:'left 0.8s ease'}}>
                          <div style={{
                            background: i===0?'rgba(201,168,76,0.2)':'rgba(28,181,160,0.18)',
                            border: `2px solid ${i===0?'var(--gold)':'var(--teal)'}`,
                            borderRadius:'50%', padding:2,
                            boxShadow: i===0 ? '0 0 12px rgba(201,168,76,0.6)' : '0 0 8px rgba(28,181,160,0.35)',
                          }}>
                            <Avatar nome={r.nome} avatarUrl={r.avatar_url} role={r.role} size={24} />
                          </div>
                        </div>
                      </div>
                      <div style={{minWidth:100, textAlign:'right', flexShrink:0}}>
                        <div style={{fontSize:14, fontWeight:700, color:i===0?'var(--gold)':'var(--teal)'}}>
                          R$ {r.premio>=1000 ? (r.premio/1000).toFixed(1)+'k' : r.premio.toFixed(0)}
                        </div>
                        <div style={{fontSize:10, color:'var(--text-muted)'}}>R$ {Math.round(r.comissao).toLocaleString('pt-BR')} com.</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ═════════ KPIs PRINCIPAIS ═════════ */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:20,marginBottom:20}}>
          {[
            {label:'Prêmio Fechado (mês)', value:fmt(dados.premioMes),    tone:'warning' as const, sub: dPremio.texto, subCor: dPremio.cor},
            {label:'Novos Clientes (mês)', value:dados.novosClientes,     tone:'success' as const, sub: dClientes.texto, subCor: dClientes.cor},
            {label:'Negócios Ativos',      value:dados.apolicesAtivas,    tone:'info'    as const, sub:'Em pipeline'},
            {label:'Renovações (30d)',     value:dados.renovacoes30d,     tone:'danger'  as const, sub:dados.renovacoes30d>0?`⚠ ${dados.renovacoes30d} a vencer`:'Nenhuma urgente', subCor: dados.renovacoes30d>0?'var(--danger)':'var(--text-muted)'},
          ].map(({label,value,tone,sub,subCor})=>(
            <div key={label} className={`kpi kpi-${tone} fade-up`}>
              <div className="kpi-label">{label}</div>
              <div className={`kpi-value ${tone === 'success' ? 'kpi-value-success' : tone === 'warning' ? 'kpi-value-warning' : tone === 'danger' ? 'kpi-value-danger' : ''}`}>{value}</div>
              {sub && <div style={{fontSize:12,color:subCor||'var(--text-muted)',marginTop:8}}>{sub}</div>}
            </div>
          ))}
        </div>

        {/* ═════════ RANKING DE LIGAÇÕES + TAREFAS PENDENTES ═════════ */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:18}}>
          {/* RANKING DE LIGAÇÕES */}
          {podeVerTimes && (
            <div className="card">
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
                <div>
                  <div style={{fontFamily:'DM Serif Display,serif',fontSize:15}}>📞 Ranking de Ligações</div>
                  <div style={{fontSize:11,color:'var(--text-muted)',marginTop:2}}>{intervalo.rotulo}</div>
                </div>
                <span style={{fontSize:11,color:'var(--gold)',cursor:'pointer'}} onClick={()=>router.push('/dashboard/telefone')}>Ver telefone →</span>
              </div>
              {rankingLig.length === 0 ? (
                <div style={{color:'var(--text-muted)',fontSize:13, padding:20, textAlign:'center'}}>Nenhuma ligação no período.</div>
              ) : (
                rankingLig.slice(0,8).map((r:any, i:number) => {
                  const pct = (r.total / maxLig) * 100
                  const medalha = i===0?'🥇':i===1?'🥈':i===2?'🥉':`${i+1}º`
                  return (
                    <div key={r.user_id} style={{display:'flex',alignItems:'center',gap:10,marginBottom:10}}>
                      <div style={{width:24,fontSize:i<3?16:11,fontWeight:700,color:i===0?'var(--gold)':'var(--text-muted)',textAlign:'center'}}>{medalha}</div>
                      <Avatar nome={r.nome} avatarUrl={r.avatar_url} role={r.role} size={28} />
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:3}}>
                          <span style={{fontSize:12,fontWeight:600,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',maxWidth:160}}>{r.nome}</span>
                          <span style={{fontSize:12,fontWeight:700,color:'var(--teal)'}}>{r.total} 📞</span>
                        </div>
                        <div style={{height:6,background:'rgba(255,255,255,0.06)',borderRadius:3,overflow:'hidden'}}>
                          <div style={{height:'100%', width:`${pct}%`, background:'linear-gradient(90deg, var(--teal), var(--gold))', borderRadius:3, transition:'width 0.6s ease'}}/>
                        </div>
                      </div>
                      <div style={{fontSize:10,color:'var(--text-muted)',minWidth:46,textAlign:'right'}}>
                        {Math.round(r.duracao/60)}min
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          )}

          {/* TAREFAS PENDENTES */}
          <div className="card">
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
              <div style={{fontFamily:'DM Serif Display,serif',fontSize:15}}>📋 Tarefas Pendentes</div>
              <span style={{fontSize:12,color:'var(--gold)',cursor:'pointer'}} onClick={()=>router.push('/dashboard/tarefas')}>Ver todas →</span>
            </div>
            {tarefasPend.length === 0 ? (
              <div style={{padding:20, textAlign:'center', color:'var(--text-muted)', fontSize:13}}>Nenhuma tarefa pendente. 🎉</div>
            ) : (
              <div style={{maxHeight:380, overflow:'auto'}}>
                {tarefasPend.slice(0,12).map((t:any) => {
                  const resp = usuarios.find(u => u.id === t.responsavel_id)
                  const prazo = t.prazo ? new Date(t.prazo) : null
                  const hoje = new Date()
                  const atrasada = prazo && prazo < hoje
                  const hoje0 = new Date(hoje.getFullYear(),hoje.getMonth(),hoje.getDate())
                  const ehHoje = prazo && new Date(prazo.getFullYear(),prazo.getMonth(),prazo.getDate()).getTime() === hoje0.getTime()
                  return (
                    <div key={t.id} style={{display:'flex',gap:10,alignItems:'flex-start',padding:'10px 12px',background:'rgba(255,255,255,0.03)',borderRadius:10,borderLeft:`3px solid ${atrasada?'var(--red)':ehHoje?'var(--gold)':'var(--teal)'}`,marginBottom:6}}>
                      <Avatar nome={resp?.nome} avatarUrl={resp?.avatar_url} role={resp?.role} size={32} />
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:13,fontWeight:500,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{t.titulo}</div>
                        <div style={{fontSize:11,color:'var(--text-muted)',marginTop:2,display:'flex',gap:6,flexWrap:'wrap'}}>
                          <span>{resp?.nome || '— sem responsável'}</span>
                          {t.clientes?.nome && <><span>·</span><span>{t.clientes.nome}</span></>}
                        </div>
                      </div>
                      <div style={{fontSize:11,fontWeight:600,color:atrasada?'var(--red)':ehHoje?'var(--gold)':'var(--text-muted)',flexShrink:0,textAlign:'right'}}>
                        {prazo ? (
                          <>
                            <div>{prazo.toLocaleDateString('pt-BR')}</div>
                            {atrasada && <div style={{fontSize:9}}>ATRASADA</div>}
                            {ehHoje && !atrasada && <div style={{fontSize:9}}>HOJE</div>}
                          </>
                        ) : <span style={{fontSize:10}}>sem prazo</span>}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* TENDÊNCIA — últimos 6 meses */}
        {dados.tendencia && dados.tendencia.length > 0 && (() => {
          const max = Math.max(1, ...dados.tendencia.map((p:any) => p.valor))
          return (
            <div className="card" style={{marginBottom:16}}>
              <div style={{fontFamily:'DM Serif Display,serif',fontSize:15,marginBottom:14}}>📈 Prêmio fechado — últimos 6 meses</div>
              <div style={{display:'grid',gridTemplateColumns:`repeat(${dados.tendencia.length},1fr)`,gap:10,alignItems:'end',height:120}}>
                {dados.tendencia.map((p:any, i:number) => {
                  const altura = max > 0 ? Math.max(4, (p.valor / max) * 100) : 4
                  return (
                    <div key={i} style={{display:'flex',flexDirection:'column',alignItems:'center',gap:6}}>
                      <div style={{fontSize:10,color:'var(--text-muted)',height:14}}>{p.valor > 0 ? `R$ ${(p.valor/1000).toFixed(0)}k` : ''}</div>
                      <div style={{width:'100%',height:`${altura}%`,background:'linear-gradient(180deg,var(--gold),rgba(201,168,76,0.2))',borderRadius:'6px 6px 2px 2px',transition:'height 0.6s'}}/>
                      <div style={{fontSize:11,color:'var(--text-muted)',textTransform:'capitalize'}}>{p.mes}</div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })()}

        {/* RENOVAÇÕES URGENTES */}
        {dados.alertas.length>0 && (
          <div className="card">
            <div style={{fontFamily:'DM Serif Display,serif',fontSize:15,marginBottom:16}}>⚠ Renovações Urgentes</div>
            {dados.alertas.map((r:any,i:number)=>(
              <div key={i} style={{display:'flex',alignItems:'center',gap:12,padding:'10px 0',borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
                <div style={{width:8,height:8,borderRadius:'50%',background:'var(--red)',flexShrink:0}}/>
                <div style={{flex:1}}>
                  <div onClick={()=>router.push(`/dashboard/funis?card=${r.id}`)}
                    style={{fontSize:13,fontWeight:500,cursor:'pointer',color:'var(--gold)',textDecoration:'underline',textUnderlineOffset:2}}
                    title="Abrir card da negociação">
                    {r.clientes?.nome}
                  </div>
                  <div style={{fontSize:11,color:'var(--text-muted)'}}>{r.produto}</div>
                </div>
                <div style={{fontSize:12,color:'var(--gold)',fontWeight:600}}>
                  {new Date(r.vencimento).toLocaleDateString('pt-BR')}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
