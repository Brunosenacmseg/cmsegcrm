'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getVisibleUserIds } from '@/lib/auth'
import { getFunilIdsSemValor } from '@/lib/funis-excluidos'

const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

export default function RelatoriosPage() {
  const supabase = createClient()
  const [dados, setDados]     = useState<any>(null)
  const [periodo, setPeriodo] = useState('mes')  // mes | trimestre | ano | custom
  const [dataDe, setDataDe]   = useState('')
  const [dataAte, setDataAte] = useState('')
  const [loading, setLoading] = useState(true)

  // Visibilidade
  const [profile, setProfile]             = useState<any>(null)
  const [usuarios, setUsuarios]           = useState<any[]>([])
  const [equipes, setEquipes]             = useState<any[]>([])
  const [equipeMembros, setEquipeMembros] = useState<Record<string, string[]>>({})
  const [visibleIds, setVisibleIds]       = useState<string[] | null>(null)
  const [filtroEquipe, setFiltroEquipe]   = useState<string>('todos')
  const [filtroUsuario, setFiltroUsuario] = useState<string>('todos')
  const [iniciado, setIniciado]           = useState(false)

  useEffect(() => { init() }, [])
  useEffect(() => { if (iniciado) carregar() }, [periodo, dataDe, dataAte, filtroEquipe, filtroUsuario, iniciado])

  async function init() {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: prof } = await supabase.from('users').select('id,nome,role').eq('id', user?.id || '').single()
    setProfile(prof)
    const ids = await getVisibleUserIds()
    setVisibleIds(ids)
    if (prof?.role !== 'corretor') {
      let q = supabase.from('users').select('id,nome,role').order('nome')
      if (ids) q = q.in('id', ids)
      const { data: usrs } = await q
      setUsuarios(usrs || [])
    }
    if (prof?.role === 'admin') {
      const { data: eq } = await supabase.from('equipes').select('id,nome').order('nome')
      setEquipes(eq || [])
      const { data: em } = await supabase.from('equipe_membros').select('equipe_id,user_id')
      const map: Record<string, string[]> = {}
      ;(em || []).forEach((r: any) => { (map[r.equipe_id] = map[r.equipe_id] || []).push(r.user_id) })
      setEquipeMembros(map)
    }
    setIniciado(true)
  }

  // Resolve a lista de user_ids a aplicar no filtro de negócios.
  // Se retornar null = sem filtro (admin com filtro 'todos').
  function userIdsParaFiltro(): string[] | null {
    if (profile?.role === 'corretor') return [profile.id]
    if (filtroUsuario !== 'todos') return [filtroUsuario]
    if (filtroEquipe !== 'todos') return equipeMembros[filtroEquipe] || []
    return visibleIds // null para admin = sem filtro; lista pra líder
  }

  async function carregar() {
    setLoading(true)
    const hoje = new Date()
    let dataInicio: string
    let dataFimISO: string | null = null
    if (periodo === 'custom' && (dataDe || dataAte)) {
      dataInicio = dataDe ? new Date(dataDe + 'T00:00:00').toISOString() : new Date(2000, 0, 1).toISOString()
      if (dataAte) dataFimISO = new Date(dataAte + 'T23:59:59.999').toISOString()
    }
    else if (periodo === 'mes')       dataInicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString()
    else if (periodo === 'trimestre') dataInicio = new Date(hoje.getFullYear(), hoje.getMonth()-2, 1).toISOString()
    else                              dataInicio = new Date(hoje.getFullYear(), 0, 1).toISOString()

    const ids = userIdsParaFiltro()
    const funisExcluidos = await getFunilIdsSemValor()

    // Query slim: so campos que o relatorio usa, filtrada por created_at
    // (relatorio mostra dados do periodo). Pagina ate 5000 por seguranca.
    async function carregarPaginado(): Promise<any[]> {
      const PAGE = 1000
      const acc: any[] = []
      for (let off = 0; ; off += PAGE) {
        let q = supabase.from('negocios')
          .select('id, etapa, status, premio, comissao_pct, produto, seguradora, funil_id, vendedor_id, created_at, data_fechamento, motivo_perda, motivo_perda_id, anotacao_motivo_perda, funis(tipo,nome,emoji), clientes(nome)')
          .gte('created_at', dataInicio)
          .order('created_at', { ascending: false })
          .range(off, off + PAGE - 1)
        if (dataFimISO) q = q.lte('created_at', dataFimISO)
        if (ids) {
          if (ids.length === 0) q = q.eq('vendedor_id', '00000000-0000-0000-0000-000000000000')
          else                  q = q.in('vendedor_id', ids)
        }
        if (funisExcluidos.length) q = q.not('funil_id', 'in', `(${funisExcluidos.join(',')})`)
        const { data } = await q
        if (!data || !data.length) break
        acc.push(...data)
        if (data.length < PAGE) break
        if (acc.length >= 5000) break
      }
      return acc
    }

    let qCli = supabase.from('clientes').select('id, created_at, vendedor_id').gte('created_at', dataInicio)
    if (dataFimISO) qCli = qCli.lte('created_at', dataFimISO)
    if (ids) {
      if (ids.length === 0) qCli = qCli.eq('vendedor_id', '00000000-0000-0000-0000-000000000000')
      else                  qCli = qCli.in('vendedor_id', ids)
    }

    const [negs, { data: clientes }, { data: hist }] = await Promise.all([
      carregarPaginado(),
      qCli,
      (dataFimISO
        ? supabase.from('historico').select('created_at, tipo').gte('created_at', dataInicio).lte('created_at', dataFimISO)
        : supabase.from('historico').select('created_at, tipo').gte('created_at', dataInicio)),
    ])

    const todos  = negs
    const ativos = todos.filter((n:any) => n.status !== 'ganho' && n.status !== 'perdido')
    const ganhos = todos.filter((n:any) => n.status === 'ganho')
    const perdidos = todos.filter((n:any) => n.status === 'perdido')

    // Prêmio por ramo — apenas negócios ganhos (receita realizada)
    const porRamo: Record<string,number> = {}
    ganhos.forEach((n:any) => {
      const ramo = (n.produto||'Outros').split(' — ')[0]
      porRamo[ramo] = (porRamo[ramo]||0) + (n.premio||0)
    })

    // Prêmio por seguradora — apenas ganhos
    const porSeg: Record<string,{premio:number,qtd:number}> = {}
    ganhos.forEach((n:any) => {
      const s = n.seguradora||'Outros'
      if (!porSeg[s]) porSeg[s] = {premio:0,qtd:0}
      porSeg[s].premio += n.premio||0
      porSeg[s].qtd++
    })

    // Prêmio por funil — apenas ganhos
    const porFunil: Record<string,number> = {}
    ganhos.forEach((n:any) => {
      const f = n.funis?.nome||'Sem funil'
      porFunil[f] = (porFunil[f]||0) + (n.premio||0)
    })

    // Prêmio por mês (ano atual) — apenas ganhos, usando data de fechamento
    const porMes = Array(12).fill(0)
    ganhos.forEach((n:any) => {
      const ref = n.data_fechamento || n.created_at || Date.now()
      const m = new Date(ref).getMonth()
      porMes[m] += n.premio||0
    })

    // Totais financeiros — somente negócios ganhos (receita/comissão realizada)
    const comissaoTotal = ganhos.reduce((s:number,n:any) => s+(n.premio&&n.comissao_pct?n.premio*n.comissao_pct/100:0),0)
    const premioTotal   = ganhos.reduce((s:number,n:any) => s+(n.premio||0),0)
    const mediaComissao = ganhos.filter((n:any)=>n.comissao_pct>0).length
      ? ganhos.filter((n:any)=>n.comissao_pct>0).reduce((s:number,n:any)=>s+n.comissao_pct,0) / ganhos.filter((n:any)=>n.comissao_pct>0).length
      : 0
    const taxaConversao = todos.length ? (ganhos.length/todos.length*100) : 0

    setDados({ premioTotal, comissaoTotal, mediaComissao, taxaConversao,
      totalNegocios: todos.length, apolicesAtivas: ativos.length,
      ganhos: ganhos.length, perdidos: perdidos.length,
      novosClientes: (clientes||[]).filter((c:any)=>c.created_at>=dataInicio).length,
      porRamo, porSeg, porFunil, porMes,
      perdidosList: perdidos,
    })
    setLoading(false)
  }

  if (loading || !dados) return <PageShell title="Relatórios"><div style={{padding:40,color:'var(--text-muted)'}}>Carregando...</div></PageShell>

  const maxRamo = Math.max(...Object.values(dados.porRamo) as number[], 1)
  const maxMes  = Math.max(...dados.porMes, 1)
  const topSegs = Object.entries(dados.porSeg).sort((a:any,b:any)=>b[1].premio-a[1].premio).slice(0,6)

  return (
    <PageShell title="Relatórios">
      {/* Filtro de período + escopo */}
      <div style={{display:'flex',gap:6,marginBottom:24,flexWrap:'wrap',alignItems:'center'}}>
        {[['mes','Este mês'],['trimestre','Trimestre'],['ano','Este ano'],['custom','Personalizado']].map(([k,l])=>(
          <button key={k} onClick={()=>setPeriodo(k)} style={{
            padding:'7px 18px',borderRadius:20,fontSize:12,fontWeight:periodo===k?700:400,
            cursor:'pointer',border:'1px solid var(--border)',fontFamily:'Open Sans,sans-serif',
            background:periodo===k?'var(--gold)':'rgba(255,255,255,0.04)',
            color:periodo===k?'var(--navy)':'var(--text-muted)',transition:'all 0.16s'
          }}>{l}</button>
        ))}
        {periodo==='custom' && (
          <>
            <input type="date" value={dataDe} onChange={e=>setDataDe(e.target.value)} title="De"
              style={{padding:'7px 10px',borderRadius:8,fontSize:12,border:'1px solid var(--border)',background:'rgba(255,255,255,0.04)',color:'var(--text)',outline:'none',fontFamily:'Open Sans,sans-serif'}}/>
            <span style={{fontSize:12,color:'var(--text-muted)'}}>até</span>
            <input type="date" value={dataAte} onChange={e=>setDataAte(e.target.value)} title="Até"
              style={{padding:'7px 10px',borderRadius:8,fontSize:12,border:'1px solid var(--border)',background:'rgba(255,255,255,0.04)',color:'var(--text)',outline:'none',fontFamily:'Open Sans,sans-serif'}}/>
          </>
        )}

        {profile && profile.role !== 'corretor' && (
          <>
            <div style={{width:1,height:24,background:'var(--border)',margin:'0 6px'}}/>
            {profile.role === 'admin' && equipes.length > 0 && (
              <select value={filtroEquipe} onChange={e => { setFiltroEquipe(e.target.value); setFiltroUsuario('todos') }}
                title="Filtrar por equipe"
                style={{padding:'7px 12px',borderRadius:20,fontSize:12,cursor:'pointer',border:'1px solid var(--border)',background:filtroEquipe!=='todos'?'rgba(201,168,76,0.12)':'rgba(255,255,255,0.04)',color:filtroEquipe!=='todos'?'var(--gold)':'var(--text-muted)',outline:'none',fontFamily:'Open Sans,sans-serif',fontWeight:600}}>
                <option value="todos">🏢 Todas as equipes</option>
                {equipes.map(eq => <option key={eq.id} value={eq.id}>{eq.nome}</option>)}
              </select>
            )}
            <select value={filtroUsuario} onChange={e => setFiltroUsuario(e.target.value)}
              title="Filtrar por usuário"
              style={{padding:'7px 12px',borderRadius:20,fontSize:12,cursor:'pointer',border:'1px solid var(--border)',background:filtroUsuario!=='todos'?'rgba(201,168,76,0.12)':'rgba(255,255,255,0.04)',color:filtroUsuario!=='todos'?'var(--gold)':'var(--text-muted)',outline:'none',fontFamily:'Open Sans,sans-serif',fontWeight:600}}>
              <option value="todos">👥 {profile.role === 'admin' ? 'Todos usuários' : 'Toda a equipe'}</option>
              {usuarios
                .filter(u => filtroEquipe === 'todos' || (equipeMembros[filtroEquipe] || []).includes(u.id))
                .map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
            </select>
          </>
        )}
      </div>

      {/* KPIs */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:16,marginBottom:24}}>
        {[
          {label:'Prêmio Total',    value:'R$ '+fmt(dados.premioTotal),  cor:'linear-gradient(90deg,var(--gold),var(--gold-light))'},
          {label:'Comissão Total',  value:'R$ '+fmt(dados.comissaoTotal),cor:'linear-gradient(90deg,var(--teal),#4dd9c7)'},
          {label:'Média Comissão',  value:dados.mediaComissao.toFixed(1)+'%', cor:'linear-gradient(90deg,#4a80f0,#7aa3f8)'},
          {label:'Taxa Conversão',  value:dados.taxaConversao.toFixed(0)+'%', cor:'linear-gradient(90deg,var(--red),#f08080)'},
        ].map(({label,value,cor})=>(
          <div key={label} className="card fade-up" style={{position:'relative',overflow:'hidden'}}>
            <div style={{position:'absolute',top:0,left:0,right:0,height:3,background:cor,borderRadius:'14px 14px 0 0'}}/>
            <div style={{fontSize:11,fontWeight:500,letterSpacing:1,textTransform:'uppercase',color:'var(--text-muted)',marginBottom:10}}>{label}</div>
            <div style={{fontFamily:'DM Serif Display,serif',fontSize:26,lineHeight:1}}>{value}</div>
          </div>
        ))}
      </div>

      <div style={{display:'grid',gridTemplateColumns:'2fr 1fr',gap:16,marginBottom:16}}>
        {/* Gráfico de barras por mês */}
        <div className="card">
          <div style={{fontFamily:'DM Serif Display,serif',fontSize:15,marginBottom:20}}>Prêmios por Mês — {new Date().getFullYear()}</div>
          <div style={{display:'flex',alignItems:'flex-end',gap:6,height:120}}>
            {dados.porMes.map((v:number,i:number)=>(
              <div key={i} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:4}}>
                <div style={{
                  width:'100%',borderRadius:'4px 4px 0 0',
                  background:i===new Date().getMonth()?'var(--gold)':'rgba(201,168,76,0.35)',
                  height:v>0?Math.max(8,v/maxMes*100)+'px':'4px',
                  transition:'height 0.6s ease'
                }} title={'R$ '+v.toLocaleString('pt-BR')}/>
                <div style={{fontSize:9,color:'var(--text-muted)'}}>{MESES[i]}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Negócios por funil */}
        <div className="card">
          <div style={{fontFamily:'DM Serif Display,serif',fontSize:15,marginBottom:16}}>Negócios</div>
          {[
            {label:'Total',   val:dados.totalNegocios, bg:'rgba(255,255,255,0.06)'},
            {label:'Ativos',  val:dados.apolicesAtivas,bg:'rgba(28,181,160,0.1)'},
            {label:'Ganhos',  val:dados.ganhos,        bg:'rgba(201,168,76,0.1)'},
            {label:'Perdidos',val:dados.perdidos,       bg:'rgba(224,82,82,0.1)'},
            {label:'Novos clientes', val:dados.novosClientes, bg:'rgba(74,128,240,0.1)'},
          ].map(({label,val,bg})=>(
            <div key={label} style={{display:'flex',justifyContent:'space-between',alignItems:'center',
              padding:'8px 12px',borderRadius:8,marginBottom:6,background:bg}}>
              <span style={{fontSize:13,color:'var(--text-muted)'}}>{label}</span>
              <span style={{fontSize:18,fontFamily:'DM Serif Display,serif'}}>{val}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
        {/* Prêmio por ramo */}
        <div className="card">
          <div style={{fontFamily:'DM Serif Display,serif',fontSize:15,marginBottom:16}}>Prêmio por Ramo</div>
          {Object.entries(dados.porRamo).sort((a:any,b:any)=>b[1]-a[1]).map(([ramo,val]:any)=>(
            <div key={ramo} style={{marginBottom:12}}>
              <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
                <span style={{fontSize:12,color:'var(--text-muted)'}}>{ramo}</span>
                <span style={{fontSize:12,fontWeight:600,color:'var(--gold)'}}>R$ {val.toLocaleString('pt-BR')}</span>
              </div>
              <div style={{background:'rgba(255,255,255,0.05)',borderRadius:6,height:8,overflow:'hidden'}}>
                <div style={{height:'100%',borderRadius:6,background:'linear-gradient(90deg,var(--gold),var(--teal))',width:(val/maxRamo*100)+'%',transition:'width 0.8s ease'}}/>
              </div>
            </div>
          ))}
          {Object.keys(dados.porRamo).length===0 && <div style={{color:'var(--text-muted)',fontSize:13}}>Sem dados</div>}
        </div>

        {/* Top seguradoras */}
        <div className="card">
          <div style={{fontFamily:'DM Serif Display,serif',fontSize:15,marginBottom:16}}>Top Seguradoras</div>
          <table style={{width:'100%',borderCollapse:'collapse'}}>
            <thead>
              <tr>{['Seguradora','Negócios','Prêmio'].map(h=>(
                <th key={h} style={{fontSize:10,fontWeight:600,letterSpacing:'1px',textTransform:'uppercase',
                  color:'var(--text-muted)',textAlign:'left',padding:'0 0 10px',borderBottom:'1px solid var(--border)'}}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {topSegs.map(([seg,info]:any)=>(
                <tr key={seg}>
                  <td style={{padding:'9px 0',borderBottom:'1px solid rgba(255,255,255,0.04)',fontSize:13}}>{seg}</td>
                  <td style={{padding:'9px 0',borderBottom:'1px solid rgba(255,255,255,0.04)',fontSize:13}}>{info.qtd}</td>
                  <td style={{padding:'9px 0',borderBottom:'1px solid rgba(255,255,255,0.04)',fontSize:13,color:'var(--gold)',fontWeight:600}}>R$ {info.premio.toLocaleString('pt-BR')}</td>
                </tr>
              ))}
              {topSegs.length===0 && <tr><td colSpan={3} style={{padding:16,color:'var(--text-muted)'}}>Sem dados</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Negociações Perdidas — por etapa e motivo */}
      <RelatorioPerdidos perdidos={dados.perdidosList || []} />
    </PageShell>
  )
}

function RelatorioPerdidos({ perdidos }: { perdidos: any[] }) {
  // Agrupa por etapa → motivo → { count, premio }
  const tree: Record<string, Record<string, { count: number; premio: number }>> = {}
  for (const n of perdidos) {
    const etapa  = n.etapa || '(sem etapa)'
    const motivo = (n.motivo_perda && String(n.motivo_perda).trim()) || '(sem motivo)'
    if (!tree[etapa]) tree[etapa] = {}
    if (!tree[etapa][motivo]) tree[etapa][motivo] = { count: 0, premio: 0 }
    tree[etapa][motivo].count++
    tree[etapa][motivo].premio += Number(n.premio || 0)
  }
  const etapas = Object.keys(tree).sort((a,b) => {
    const sa = Object.values(tree[a]).reduce((s,x)=>s+x.count,0)
    const sb = Object.values(tree[b]).reduce((s,x)=>s+x.count,0)
    return sb - sa
  })
  const totalGeral = perdidos.length
  const premioTotalPerdido = perdidos.reduce((s,n)=>s+Number(n.premio||0),0)

  function exportarCSV() {
    const linhas: string[][] = [['Etapa','Motivo','Quantidade','Prêmio R$']]
    for (const etapa of etapas) {
      for (const [motivo, v] of Object.entries(tree[etapa])) {
        linhas.push([etapa, motivo, String(v.count), v.premio.toFixed(2).replace('.', ',')])
      }
    }
    const csv = linhas.map(r => r.map(c => {
      const s = String(c ?? '')
      return s.includes(',') || s.includes('"') || s.includes('\n') ? '"' + s.replace(/"/g,'""') + '"' : s
    }).join(',')).join('\r\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url
    a.download = `negociacoes-perdidas-${new Date().toISOString().slice(0,10)}.csv`
    a.click()
    setTimeout(()=>URL.revokeObjectURL(url), 1000)
  }

  return (
    <div style={{marginTop:24,background:'#fff',border:'1px solid var(--border-soft)',borderRadius:12,overflow:'hidden'}}>
      <div style={{padding:'14px 18px',background:'var(--bg-soft)',display:'flex',justifyContent:'space-between',alignItems:'center',borderBottom:'1px solid var(--border-soft)'}}>
        <div>
          <div style={{fontWeight:700,fontSize:14,color:'#0f172a'}}>✕ Negociações Perdidas — por Etapa e Motivo</div>
          <div style={{fontSize:11,color:'var(--text-muted)',marginTop:2}}>
            Total: <strong>{totalGeral}</strong> {totalGeral === 1 ? 'negócio' : 'negócios'} ·
            Prêmio perdido: <strong>R$ {premioTotalPerdido.toLocaleString('pt-BR', {minimumFractionDigits:2,maximumFractionDigits:2})}</strong>
          </div>
        </div>
        {totalGeral > 0 && (
          <button onClick={exportarCSV} style={{padding:'7px 14px',borderRadius:6,border:'1px solid var(--teal)',background:'rgba(28,181,160,0.10)',color:'var(--teal)',cursor:'pointer',fontSize:12,fontWeight:600}}>⬇ Exportar CSV</button>
        )}
      </div>
      {totalGeral === 0 ? (
        <div style={{padding:24,textAlign:'center',color:'var(--text-muted)'}}>Sem negociações perdidas no período.</div>
      ) : (
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
          <thead>
            <tr style={{background:'var(--bg-subtle)',textAlign:'left'}}>
              <th style={{padding:'10px 14px',fontSize:11,fontWeight:600,color:'var(--text-muted)',textTransform:'uppercase'}}>Etapa</th>
              <th style={{padding:'10px 14px',fontSize:11,fontWeight:600,color:'var(--text-muted)',textTransform:'uppercase'}}>Motivo</th>
              <th style={{padding:'10px 14px',fontSize:11,fontWeight:600,color:'var(--text-muted)',textTransform:'uppercase',textAlign:'right'}}>Quantidade</th>
              <th style={{padding:'10px 14px',fontSize:11,fontWeight:600,color:'var(--text-muted)',textTransform:'uppercase',textAlign:'right'}}>Prêmio</th>
              <th style={{padding:'10px 14px',fontSize:11,fontWeight:600,color:'var(--text-muted)',textTransform:'uppercase',textAlign:'right'}}>% da etapa</th>
            </tr>
          </thead>
          <tbody>
            {etapas.flatMap(etapa => {
              const motivos = Object.entries(tree[etapa]).sort((a,b) => b[1].count - a[1].count)
              const totalEtapa = motivos.reduce((s,[,v])=>s+v.count,0)
              const premioEtapa = motivos.reduce((s,[,v])=>s+v.premio,0)
              return [
                <tr key={'etapa-'+etapa} style={{background:'rgba(224,82,82,0.06)',fontWeight:700,color:'#0f172a',borderTop:'1px solid var(--border-soft)'}}>
                  <td style={{padding:'8px 14px'}}>{etapa}</td>
                  <td style={{padding:'8px 14px',color:'var(--text-muted)',fontWeight:400}}>{motivos.length} motivo(s)</td>
                  <td style={{padding:'8px 14px',textAlign:'right'}}>{totalEtapa}</td>
                  <td style={{padding:'8px 14px',textAlign:'right'}}>R$ {premioEtapa.toLocaleString('pt-BR', {minimumFractionDigits:2,maximumFractionDigits:2})}</td>
                  <td style={{padding:'8px 14px',textAlign:'right',color:'var(--text-muted)',fontWeight:400}}>{((totalEtapa/totalGeral)*100).toFixed(1)}%</td>
                </tr>,
                ...motivos.map(([motivo, v]) => (
                  <tr key={etapa+'-'+motivo} style={{borderTop:'1px solid var(--border-soft)'}}>
                    <td style={{padding:'8px 14px',paddingLeft:32,color:'var(--text-muted)'}}>—</td>
                    <td style={{padding:'8px 14px'}}>{motivo}</td>
                    <td style={{padding:'8px 14px',textAlign:'right'}}>{v.count}</td>
                    <td style={{padding:'8px 14px',textAlign:'right'}}>R$ {v.premio.toLocaleString('pt-BR', {minimumFractionDigits:2,maximumFractionDigits:2})}</td>
                    <td style={{padding:'8px 14px',textAlign:'right',color:'var(--text-muted)'}}>{((v.count/totalEtapa)*100).toFixed(1)}%</td>
                  </tr>
                ))
              ]
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}

function fmt(n: number) { return Number(n||0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }

function PageShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
      <div style={{height:56,borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',
        padding:'0 28px',background:'var(--bg-soft)',backdropFilter:'blur(8px)',
        position:'sticky',top:0,zIndex:5,flexShrink:0}}>
        <div style={{fontFamily:'DM Serif Display,serif',fontSize:18}}>{title}</div>
      </div>
      <div style={{flex:1,overflow:'auto',padding:'28px 28px 40px'}}>{children}</div>
    </div>
  )
}
