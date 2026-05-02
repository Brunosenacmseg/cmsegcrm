'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { getVisibleUserIds } from '@/lib/auth'

export default function RenovacoesPage() {
  const supabase = createClient()
  const router   = useRouter()
  const [renovacoes, setRenovacoes] = useState<any[]>([])
  const [loading, setLoading]       = useState(true)
  const [filtro, setFiltro]         = useState('todos') // todos | hoje | 7d | 30d | vencidos
  const [profile, setProfile]       = useState<any>(null)
  const [usuarios, setUsuarios]     = useState<any[]>([])
  const [filtroUsuario, setFiltroUsuario] = useState<string>('')

  useEffect(() => { init() }, [])

  async function init() {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: prof } = await supabase.from('users').select('id,nome,role').eq('id', user?.id || '').single()
    setProfile(prof)
    const ids = await getVisibleUserIds()
    if (prof?.role !== 'corretor') {
      let q = supabase.from('users').select('id,nome,role').order('nome')
      if (ids) q = q.in('id', ids)
      const { data: usrs } = await q
      setUsuarios(usrs || [])
    }
    await carregar(prof, ids)
  }

  async function carregar(prof = profile, ids: string[] | null = null) {
    setLoading(true)
    let q = supabase
      .from('negocios')
      .select('*, clientes(id, nome, email, telefone), funis(tipo,nome,emoji), users!negocios_vendedor_id_fkey(id,nome)')
      .not('vencimento', 'is', null)
      .order('vencimento', { ascending: true })
    if (prof?.role === 'corretor') {
      q = q.eq('vendedor_id', prof.id)
    } else if (ids) {
      q = q.in('vendedor_id', ids)
    }
    const { data } = await q
    setRenovacoes(data || [])
    setLoading(false)
  }

  // Admin / líder: atribui (distribui) uma renovação a um usuário.
  async function atribuirRenovacao(negId: string, userId: string) {
    if (!userId) return
    await supabase.from('negocios').update({ vendedor_id: userId }).eq('id', negId)
    // Notifica o vendedor escolhido
    const neg = renovacoes.find(r => r.id === negId)
    if (neg && userId !== profile?.id) {
      await supabase.from('notificacoes').insert({
        user_id: userId, tipo: 'renovacao',
        titulo: `${profile?.nome} atribuiu uma renovação para você`,
        descricao: `${neg.clientes?.nome || ''} — vence ${new Date(neg.vencimento).toLocaleDateString('pt-BR')}`,
        link: '/dashboard/renovacoes',
      })
    }
    await carregar()
  }

  async function marcarRenovado(negId: string, clienteId: string) {
    await supabase.from('negocios').update({ etapa: 'Renovado' }).eq('id', negId)
    await supabase.from('historico').insert({
      cliente_id: clienteId, negocio_id: negId, tipo: 'teal',
      titulo: 'Renovação concluída', descricao: 'Marcado como Renovado'
    })
    carregar()
  }

  async function registrarContato(negId: string, clienteId: string) {
    await supabase.from('historico').insert({
      cliente_id: clienteId, negocio_id: negId, tipo: 'gold',
      titulo: 'Contato realizado', descricao: 'Contato de renovação registrado'
    })
    await supabase.from('tarefas').insert({
      cliente_id: clienteId, negocio_id: negId,
      titulo: 'Acompanhar renovação', tipo: 'ligacao', status: 'pendente',
      prazo: new Date(Date.now() + 3*24*60*60*1000).toISOString()
    })
    alert('Contato registrado! Tarefa de acompanhamento criada.')
  }

  const hoje    = new Date(); hoje.setHours(0,0,0,0)
  const em7d    = new Date(hoje.getTime() + 7*24*60*60*1000)
  const em30d   = new Date(hoje.getTime() + 30*24*60*60*1000)

  const filtradas = renovacoes.filter((n:any) => {
    if (filtroUsuario === '__sem') {
      if (n.vendedor_id) return false
    } else if (filtroUsuario && n.vendedor_id !== filtroUsuario) {
      return false
    }
    const venc = new Date(n.vencimento)
    venc.setHours(0,0,0,0)
    const diffDias = Math.ceil((venc.getTime()-hoje.getTime())/(1000*60*60*24))
    if (filtro === 'vencidos') return diffDias < 0
    if (filtro === 'hoje')     return diffDias === 0
    if (filtro === '7d')       return diffDias >= 0 && diffDias <= 7
    if (filtro === '30d')      return diffDias >= 0 && diffDias <= 30
    return true
  })

  const stats = {
    vencidos: renovacoes.filter((n:any)=>diasAte(n.vencimento)<0).length,
    hoje:     renovacoes.filter((n:any)=>diasAte(n.vencimento)===0).length,
    em7d:     renovacoes.filter((n:any)=>{const d=diasAte(n.vencimento);return d>=0&&d<=7}).length,
    em30d:    renovacoes.filter((n:any)=>{const d=diasAte(n.vencimento);return d>=0&&d<=30}).length,
    premioEm30d: renovacoes.filter((n:any)=>{const d=diasAte(n.vencimento);return d>=0&&d<=30}).reduce((s:number,n:any)=>s+(n.premio||0),0),
  }

  return (
    <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
      <div style={{height:56,borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',gap:12,
        padding:'0 28px',background:'var(--bg-soft)',backdropFilter:'blur(8px)',
        position:'sticky',top:0,zIndex:5,flexShrink:0}}>
        <div style={{fontFamily:'DM Serif Display,serif',fontSize:18,flex:1}}>Renovações</div>
        {profile && profile.role !== 'corretor' && usuarios.length > 0 && (
          <select value={filtroUsuario} onChange={e=>setFiltroUsuario(e.target.value)}
            title="Filtrar por responsável"
            style={{border:'1px solid var(--border)',background:filtroUsuario?'rgba(201,168,76,0.10)':'rgba(255,255,255,0.04)',color:filtroUsuario?'var(--gold)':'var(--text-muted)',borderRadius:8,padding:'6px 10px',fontSize:12,fontWeight:600,cursor:'pointer',outline:'none'}}>
            <option value="">👥 {profile.role === 'admin' ? 'Todos' : 'Toda equipe'}</option>
            <option value="__sem">— Sem responsável —</option>
            {usuarios.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
          </select>
        )}
      </div>

      <div style={{flex:1,overflow:'auto',padding:'28px 28px 40px'}}>
        {/* KPIs */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:16,marginBottom:24}}>
          {[
            {label:'Vencidos',       val:stats.vencidos, cor:'linear-gradient(90deg,var(--red),#f08080)',     clk:'vencidos'},
            {label:'Vencem Hoje',    val:stats.hoje,     cor:'linear-gradient(90deg,#e05252,var(--gold))',    clk:'hoje'},
            {label:'Próximos 7 dias',val:stats.em7d,     cor:'linear-gradient(90deg,var(--gold),#e6c97a)',    clk:'7d'},
            {label:'Próximos 30d',   val:'R$ '+fmt(stats.premioEm30d), cor:'linear-gradient(90deg,var(--teal),#4dd9c7)', clk:'30d'},
          ].map(({label,val,cor,clk})=>(
            <div key={label} className="card fade-up" onClick={()=>setFiltro(clk)}
              style={{position:'relative',overflow:'hidden',cursor:'pointer',
                boxShadow:filtro===clk?'0 0 0 2px var(--gold)':'none'}}>
              <div style={{position:'absolute',top:0,left:0,right:0,height:3,background:cor,borderRadius:'14px 14px 0 0'}}/>
              <div style={{fontSize:11,fontWeight:500,letterSpacing:1,textTransform:'uppercase',color:'var(--text-muted)',marginBottom:10}}>{label}</div>
              <div style={{fontFamily:'DM Serif Display,serif',fontSize:26,lineHeight:1}}>{val}</div>
            </div>
          ))}
        </div>

        {/* Filtros */}
        <div style={{display:'flex',gap:6,marginBottom:18,flexWrap:'wrap'}}>
          {[['todos','Todos'],['vencidos','🔴 Vencidos'],['hoje','🟠 Hoje'],['7d','🟡 7 dias'],['30d','🟢 30 dias']].map(([k,l])=>(
            <button key={k} onClick={()=>setFiltro(k)} style={{
              padding:'6px 14px',borderRadius:20,fontSize:12,cursor:'pointer',
              border:'1px solid var(--border)',fontFamily:'DM Sans,sans-serif',
              background:filtro===k?'rgba(201,168,76,0.12)':'rgba(255,255,255,0.04)',
              color:filtro===k?'var(--gold)':'var(--text-muted)',
              borderColor:filtro===k?'var(--gold)':'var(--border)'
            }}>{l}</button>
          ))}
          <span style={{marginLeft:'auto',fontSize:13,color:'var(--text-muted)',alignSelf:'center'}}>
            {filtradas.length} renovação{filtradas.length!==1?'es':''}
          </span>
        </div>

        {/* Tabela */}
        <div className="card">
          {loading ? <div style={{color:'var(--text-muted)',padding:20}}>Carregando...</div> : (
          <table style={{width:'100%',borderCollapse:'collapse'}}>
            <thead>
              <tr>{['Cliente','Produto','Seguradora','Prêmio','Vencimento','Funil','Responsável','Ações'].map(h=>(
                <th key={h} style={{fontSize:10,fontWeight:600,letterSpacing:'1px',textTransform:'uppercase',
                  color:'var(--text-muted)',textAlign:'left',padding:'0 0 10px',borderBottom:'1px solid var(--border)'}}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {filtradas.map((n:any)=>{
                const dias  = diasAte(n.vencimento)
                const urgente = dias < 0
                const aviso   = dias >= 0 && dias <= 7
                return (
                  <tr key={n.id}>
                    <td style={{padding:'10px 0',borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
                      <div style={{fontWeight:500,cursor:'pointer',color:'var(--gold)'}}
                        onClick={()=>router.push(`/dashboard/clientes/${n.clientes?.id}`)}>
                        {n.clientes?.nome}
                      </div>
                      <div style={{fontSize:11,color:'var(--text-muted)'}}>{n.clientes?.telefone}</div>
                    </td>
                    <td style={{padding:'10px 0',borderBottom:'1px solid rgba(255,255,255,0.04)',fontSize:13}}>
                      {n.produto}{n.placa&&<span style={{color:'var(--text-muted)',fontSize:11}}><br/>🚗 {n.placa}</span>}
                    </td>
                    <td style={{padding:'10px 0',borderBottom:'1px solid rgba(255,255,255,0.04)',fontSize:12,color:'var(--text-muted)'}}>{n.seguradora}</td>
                    <td style={{padding:'10px 0',borderBottom:'1px solid rgba(255,255,255,0.04)',color:'var(--gold)',fontWeight:600}}>
                      {n.premio?'R$ '+n.premio.toLocaleString('pt-BR'):'—'}
                    </td>
                    <td style={{padding:'10px 0',borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
                      <div style={{fontWeight:600,color:urgente?'var(--red)':aviso?'var(--gold)':'var(--text)'}}>
                        {urgente ? `Vencido há ${Math.abs(dias)}d` : dias===0 ? 'HOJE' : `Em ${dias} dias`}
                      </div>
                      <div style={{fontSize:11,color:'var(--text-muted)'}}>{new Date(n.vencimento).toLocaleDateString('pt-BR')}</div>
                    </td>
                    <td style={{padding:'10px 0',borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
                      <span style={{fontSize:10,fontWeight:600,borderRadius:10,padding:'2px 9px',
                        background:'rgba(28,181,160,0.1)',color:'var(--teal)'}}>
                        {n.funis?.emoji} {n.funis?.nome}
                      </span>
                    </td>
                    <td style={{padding:'10px 0',borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
                      {profile && profile.role !== 'corretor' ? (
                        <select value={n.vendedor_id || ''} onChange={e => atribuirRenovacao(n.id, e.target.value)}
                          style={{fontSize:11,padding:'4px 8px',borderRadius:6,border:'1px solid var(--border)',background:'#fff',color:n.vendedor_id?'var(--gold)':'var(--text-muted)',outline:'none',cursor:'pointer',maxWidth:140}}>
                          <option value="">— Atribuir —</option>
                          {usuarios.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
                        </select>
                      ) : (
                        <span style={{fontSize:11,color:'var(--gold)'}}>{n.users?.nome?.split(' ')[0] || '—'}</span>
                      )}
                    </td>
                    <td style={{padding:'10px 0',borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
                      <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                        <button onClick={()=>registrarContato(n.id,n.clientes?.id)} style={{
                          fontSize:11,background:'rgba(74,128,240,0.1)',border:'1px solid rgba(74,128,240,0.3)',
                          color:'#7aa3f8',borderRadius:6,padding:'4px 10px',cursor:'pointer',fontFamily:'DM Sans,sans-serif'}}>
                          📞 Contato
                        </button>
                        <button onClick={()=>marcarRenovado(n.id,n.clientes?.id)} style={{
                          fontSize:11,background:'rgba(28,181,160,0.1)',border:'1px solid rgba(28,181,160,0.3)',
                          color:'var(--teal)',borderRadius:6,padding:'4px 10px',cursor:'pointer',fontFamily:'DM Sans,sans-serif'}}>
                          ✅ Renovado
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {filtradas.length===0 && (
                <tr><td colSpan={8} style={{padding:30,textAlign:'center',color:'var(--text-muted)'}}>
                  Nenhuma renovação neste período. ✅
                </td></tr>
              )}
            </tbody>
          </table>
          )}
        </div>
      </div>
    </div>
  )
}

function diasAte(vencimento: string) {
  const hoje = new Date(); hoje.setHours(0,0,0,0)
  const venc = new Date(vencimento); venc.setHours(0,0,0,0)
  return Math.ceil((venc.getTime()-hoje.getTime())/(1000*60*60*24))
}
function fmt(n: number) { return n>=1000?(n/1000).toFixed(0)+'k':n.toLocaleString('pt-BR') }
