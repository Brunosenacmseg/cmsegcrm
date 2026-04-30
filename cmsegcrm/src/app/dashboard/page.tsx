'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

const ETAPAS_ATIVAS = ['Em contato','Proposta Enviada','Aguardando Assinatura','Em análise','Aguardando pagamento','Negociação']
const ETAPAS_FECHADAS = ['Fechado Perdido','Não Renovado','Pago','Inadimplente','Negado','Fechado Ganho','Renovado','Concluído']

const MEDALHAS = ['🥇','🥈','🥉','4️⃣','5️⃣']

export default function DashboardPage() {
  const supabase = createClient()
  const router   = useRouter()
  const [profile, setProfile]   = useState<any>(null)
  const [dados, setDados]       = useState<any>({ premioMes:0, novosClientes:0, apolicesAtivas:0, renovacoes30d:0, mediaComissao:0, atividades:[], alertas:[] })
  const [ranking, setRanking]   = useState<any[]>([])
  const [atendimentos, setAtendimentos] = useState<any[]>([])
  const [loading, setLoading]   = useState(true)
  const [periodoRanking, setPeriodoRanking] = useState<'mes'|'ano'>('mes')

  useEffect(() => { carregarDados() }, [])
  useEffect(() => { if (!loading) carregarRanking() }, [periodoRanking, loading])

  async function carregarDados() {
    const hoje = new Date()
    const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString()
    const em30dias  = new Date(hoje.getTime() + 30*24*60*60*1000).toISOString().slice(0,10)
    const { data: { user } } = await supabase.auth.getUser()
    const { data: prof } = await supabase.from('users').select('*').eq('id', user?.id||'').single()
    setProfile(prof)

    const [{ data: negs }, { count: novosCount }, { data: renovs }, { data: hist }, { data: usr }] = await Promise.all([
      supabase.from('negocios').select('premio, comissao_pct, etapa, funil_id, funis(tipo), vendedor_id'),
      supabase.from('clientes').select('id', {count:'exact',head:true}).gte('created_at', inicioMes),
      supabase.from('negocios').select('id, vencimento, produto, clientes(nome)').lte('vencimento', em30dias).gt('vencimento', hoje.toISOString().slice(0,10)).order('vencimento'),
      supabase.from('historico').select('*, clientes(nome), negocios(produto)').order('created_at', {ascending:false}).limit(8),
      supabase.from('users').select('id, nome').order('nome'),
    ])

    const negAtivos  = (negs||[]).filter((n:any) => !ETAPAS_FECHADAS.includes(n.etapa))
    const premioMes  = negAtivos.reduce((s:number,n:any)=>s+(n.premio||0),0)
    const comissoes  = negAtivos.filter((n:any)=>n.comissao_pct>0).map((n:any)=>n.comissao_pct)
    const mediaComissao = comissoes.length?(comissoes.reduce((a:number,b:number)=>a+b,0)/comissoes.length):0

    // Atendimentos por usuário
    const atendMap: Record<string,{nome:string,qtd:number}> = {}
    ;(usr||[]).forEach((u:any) => { atendMap[u.id] = { nome: u.nome, qtd: 0 } })
    negAtivos.forEach((n:any) => { if(n.vendedor_id && atendMap[n.vendedor_id]) atendMap[n.vendedor_id].qtd++ })
    const atendArr = Object.values(atendMap).filter((a:any)=>a.qtd>0).sort((a:any,b:any)=>b.qtd-a.qtd)
    setAtendimentos(atendArr)

    setDados({ premioMes, novosClientes: novosCount||0, apolicesAtivas: negAtivos.length, renovacoes30d: (renovs||[]).length, mediaComissao, atividades: hist||[], alertas: (renovs||[]).slice(0,3) })
    setLoading(false)
  }

  async function carregarRanking() {
    const hoje = new Date()
    const inicio = periodoRanking === 'mes'
      ? new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString()
      : new Date(hoje.getFullYear(), 0, 1).toISOString()

    const { data: usr } = await supabase.from('users').select('id, nome').order('nome')
    const { data: negs } = await supabase.from('negocios')
      .select('premio, comissao_pct, vendedor_id, etapa')
      .in('etapa', ['Fechado Ganho','Renovado','Pago','Concluído'])
      .gte('created_at', inicio)

    const map: Record<string,{nome:string,premio:number,apolices:number,comissao:number,pontos:number}> = {}
    ;(usr||[]).forEach((u:any) => { map[u.id] = { nome:u.nome, premio:0, apolices:0, comissao:0, pontos:0 } })
    ;(negs||[]).forEach((n:any) => {
      if(!n.vendedor_id || !map[n.vendedor_id]) return
      map[n.vendedor_id].premio   += n.premio||0
      map[n.vendedor_id].apolices += 1
      map[n.vendedor_id].comissao += (n.premio||0)*(n.comissao_pct||0)/100
    })

    // Calcular pontos: normaliza cada métrica 0-100 e soma
    const arr = Object.values(map).filter((v:any)=>v.apolices>0||v.premio>0)
    const maxPremio   = Math.max(...arr.map((v:any)=>v.premio),1)
    const maxApolices = Math.max(...arr.map((v:any)=>v.apolices),1)
    const maxComissao = Math.max(...arr.map((v:any)=>v.comissao),1)
    arr.forEach((v:any) => {
      v.pontos = Math.round((v.premio/maxPremio)*100 + (v.apolices/maxApolices)*100 + (v.comissao/maxComissao)*100)
    })
    arr.sort((a:any,b:any)=>b.pontos-a.pontos)
    setRanking(arr)
  }

  const fmt = (n: number) => n >= 1000 ? `R$ ${(n/1000).toFixed(0)}k` : `R$ ${n.toLocaleString('pt-BR')}`
  const isAdmin = profile?.role === 'admin'
  const isLider = profile?.role === 'lider'

  if (loading) return <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',color:'var(--text-muted)'}}>Carregando...</div>

  return (
    <div style={{flex:1, overflow:'auto'}}>
      <div style={{height:56,borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',padding:'0 28px',gap:16,background:'rgba(10,22,40,0.7)',backdropFilter:'blur(8px)',position:'sticky',top:0,zIndex:5}}>
        <div style={{fontFamily:'DM Serif Display,serif',fontSize:18,flex:1}}>Dashboard</div>
        <button className="btn-primary" onClick={()=>router.push('/dashboard/clientes/novo')}>+ Novo Lead</button>
      </div>

      <div style={{padding:'28px 28px 40px'}}>
        {/* KPIs */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:16,marginBottom:24}}>
          {[
            {label:'Prêmio Total (mês)',  value:fmt(dados.premioMes),         color:'linear-gradient(90deg,var(--gold),var(--gold-light))'},
            {label:'Novos Clientes',      value:dados.novosClientes,           color:'linear-gradient(90deg,var(--teal),#4dd9c7)'},
            {label:'Negócios Ativos',     value:dados.apolicesAtivas,          color:'linear-gradient(90deg,#4a80f0,#7aa3f8)'},
            {label:'Renovações (30d)',    value:dados.renovacoes30d,           color:'linear-gradient(90deg,var(--red),#f08080)', sub:dados.renovacoes30d>0?`⚠ ${dados.renovacoes30d} a vencer`:'Nenhuma urgente'},
            {label:'Média Comissão',      value:`${dados.mediaComissao.toFixed(1)}%`, color:'linear-gradient(90deg,var(--teal),var(--gold))', sub:'Sobre negócios ativos'},
          ].map(({label,value,color,sub})=>(
            <div key={label} className="card fade-up" style={{position:'relative',overflow:'hidden'}}>
              <div style={{position:'absolute',top:0,left:0,right:0,height:3,background:color,borderRadius:'14px 14px 0 0'}}/>
              <div style={{fontSize:11,fontWeight:500,letterSpacing:1,textTransform:'uppercase',color:'var(--text-muted)',marginBottom:10}}>{label}</div>
              <div style={{fontFamily:'DM Serif Display,serif',fontSize:28,lineHeight:1}}>{value}</div>
              {sub&&<div style={{fontSize:12,color:'var(--text-muted)',marginTop:6}}>{sub}</div>}
            </div>
          ))}
        </div>

        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:16}}>

          {/* Atendimentos ativos por usuário */}
          {(isAdmin||isLider)&&(
            <div className="card">
              <div style={{fontFamily:'DM Serif Display,serif',fontSize:15,marginBottom:16}}>📊 Atendimentos Ativos</div>
              {atendimentos.length===0?(
                <div style={{color:'var(--text-muted)',fontSize:13}}>Nenhum negócio ativo com vendedor atribuído.</div>
              ):atendimentos.map((a:any,i:number)=>{
                const maxQtd = atendimentos[0]?.qtd||1
                const pct = Math.round((a.qtd/maxQtd)*100)
                return(
                  <div key={i} style={{marginBottom:12}}>
                    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:4}}>
                      <span style={{fontSize:13,fontWeight:500}}>{a.nome}</span>
                      <span style={{fontSize:12,color:'var(--gold)',fontWeight:700}}>{a.qtd} negócio{a.qtd!==1?'s':''}</span>
                    </div>
                    <div style={{height:6,background:'rgba(255,255,255,0.06)',borderRadius:3,overflow:'hidden'}}>
                      <div style={{height:'100%',width:`${pct}%`,background:'linear-gradient(90deg,var(--gold),var(--teal))',borderRadius:3,transition:'width 0.6s ease'}}/>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Atividades recentes */}
          <div className="card">
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
              <div style={{fontFamily:'DM Serif Display,serif',fontSize:15}}>Atividades Recentes</div>
              <span style={{fontSize:12,color:'var(--gold)',cursor:'pointer'}} onClick={()=>router.push('/dashboard/tarefas')}>Ver todas →</span>
            </div>
            {dados.atividades.length===0&&<div style={{color:'var(--text-muted)',fontSize:13}}>Nenhuma atividade ainda.</div>}
            {dados.atividades.map((h:any,i:number)=>(
              <div key={i} style={{display:'flex',gap:12,alignItems:'flex-start',padding:'10px 12px',background:'rgba(255,255,255,0.03)',borderRadius:10,borderLeft:`3px solid ${h.tipo==='gold'?'var(--gold)':h.tipo==='red'?'var(--red)':'var(--teal)'}`,marginBottom:8}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:500,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{h.titulo}</div>
                  <div style={{fontSize:11,color:'var(--text-muted)',marginTop:2}}>{h.clientes?.nome}{h.negocios?.produto?` · ${h.negocios.produto}`:''}</div>
                </div>
                <div style={{fontSize:10,color:'var(--text-muted)',flexShrink:0}}>{new Date(h.created_at).toLocaleDateString('pt-BR')}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Ranking de gamificação */}
        {(isAdmin||isLider)&&(
          <div className="card" style={{marginBottom:16}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:20}}>
              <div>
                <div style={{fontFamily:'DM Serif Display,serif',fontSize:15}}>🏆 Ranking de Vendas</div>
                <div style={{fontSize:12,color:'var(--text-muted)',marginTop:2}}>Pontuação: prêmio + apólices + comissão</div>
              </div>
              <div style={{display:'flex',gap:4}}>
                {(['mes','ano'] as const).map(p=>(
                  <button key={p} onClick={()=>setPeriodoRanking(p)} style={{padding:'5px 14px',borderRadius:20,fontSize:11,cursor:'pointer',border:'1px solid var(--border)',fontFamily:'DM Sans,sans-serif',background:periodoRanking===p?'rgba(201,168,76,0.12)':'rgba(255,255,255,0.04)',color:periodoRanking===p?'var(--gold)':'var(--text-muted)',borderColor:periodoRanking===p?'var(--gold)':'var(--border)'}}>
                    {p==='mes'?'Este mês':'Este ano'}
                  </button>
                ))}
              </div>
            </div>

            {ranking.length===0?(
              <div style={{textAlign:'center',padding:'20px',color:'var(--text-muted)',fontSize:13}}>
                Nenhum negócio fechado no período.
              </div>
            ):(
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))',gap:12}}>
                {ranking.slice(0,5).map((r:any,i:number)=>{
                  const isFirst = i===0
                  const cores = ['linear-gradient(135deg,#c9a84c,#f0d060)','linear-gradient(135deg,#9ba3b0,#d0d8e0)','linear-gradient(135deg,#c07830,#e0a050)']
                  const cor = cores[i]||'linear-gradient(135deg,rgba(255,255,255,0.1),rgba(255,255,255,0.05))'
                  return(
                    <div key={i} style={{background: isFirst?'rgba(201,168,76,0.08)':'rgba(255,255,255,0.02)',border:`1px solid ${isFirst?'rgba(201,168,76,0.3)':'rgba(255,255,255,0.06)'}`,borderRadius:14,padding:'16px',textAlign:'center',position:'relative',overflow:'hidden'}}>
                      {isFirst&&<div style={{position:'absolute',top:0,left:0,right:0,height:2,background:'linear-gradient(90deg,var(--gold),var(--teal))'}}/>}
                      <div style={{fontSize:28,marginBottom:6}}>{MEDALHAS[i]}</div>
                      <div style={{fontWeight:600,fontSize:13,marginBottom:8,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.nome}</div>
                      <div style={{display:'flex',flexDirection:'column',gap:3}}>
                        <div style={{fontSize:11,color:'var(--gold)',fontWeight:600}}>R$ {Math.round(r.premio/1000)}k prêmio</div>
                        <div style={{fontSize:11,color:'var(--teal)'}}>{r.apolices} apólice{r.apolices!==1?'s':''}</div>
                        <div style={{fontSize:11,color:'var(--text-muted)'}}>R$ {Math.round(r.comissao).toLocaleString('pt-BR')} comissão</div>
                      </div>
                      <div style={{marginTop:10,padding:'4px 10px',borderRadius:20,display:'inline-block',background:isFirst?'rgba(201,168,76,0.15)':'rgba(255,255,255,0.05)',fontSize:11,fontWeight:700,color:isFirst?'var(--gold)':'var(--text-muted)'}}>
                        {r.pontos} pts
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Alertas de renovação */}
        {dados.alertas.length>0&&(
          <div className="card">
            <div style={{fontFamily:'DM Serif Display,serif',fontSize:15,marginBottom:16}}>⚠ Renovações Urgentes</div>
            {dados.alertas.map((r:any,i:number)=>(
              <div key={i} style={{display:'flex',alignItems:'center',gap:12,padding:'10px 0',borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
                <div style={{width:8,height:8,borderRadius:'50%',background:'var(--red)',flexShrink:0}}/>
                <div style={{flex:1}}>
                  <div style={{fontSize:13,fontWeight:500}}>{r.clientes?.nome}</div>
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
