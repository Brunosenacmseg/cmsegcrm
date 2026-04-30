'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function ApolicesPage() {
  const supabase = createClient()
  const router   = useRouter()
  const [negocios, setNegocios]   = useState<any[]>([])
  const [usuarios, setUsuarios]   = useState<any[]>([])
  const [profile, setProfile]     = useState<any>(null)
  const [loading, setLoading]     = useState(true)
  const [busca, setBusca]         = useState('')
  const [filtroRamo, setFiltroRamo] = useState('todos')
  const [filtroSeg, setFiltroSeg]   = useState('todos')
  const [filtroVendedor, setFiltroVendedor] = useState('todos')
  const [editandoVendedor, setEditandoVendedor] = useState<string|null>(null)

  useEffect(() => { carregar() }, [])

  async function carregar() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { data: prof } = await supabase.from('users').select('*').eq('id', user?.id||'').single()
    setProfile(prof)

    // Determinar IDs visíveis
    let visibleIds: string[] | null = null
    if (prof?.role === 'corretor') {
      visibleIds = [user?.id||'']
    } else if (prof?.role === 'lider') {
      const { data: eq } = await supabase.from('equipes').select('id').eq('lider_id', user?.id||'')
      if (eq?.length) {
        const { data: mb } = await supabase.from('equipe_membros').select('user_id').in('equipe_id', eq.map(e=>e.id))
        visibleIds = [user?.id||'', ...(mb?.map(m=>m.user_id)||[])]
      } else visibleIds = [user?.id||'']
    }

    let query = supabase
      .from('negocios')
      .select('*, clientes(id,nome,tipo), users!negocios_vendedor_id_fkey(id,nome)')
      .gt('premio', 0)
      .order('vencimento', { ascending: true })

    if (visibleIds) query = (query as any).in('vendedor_id', visibleIds)

    const [{ data }, { data: usr }] = await Promise.all([
      query,
      supabase.from('users').select('id, nome').order('nome'),
    ])
    setNegocios(data || [])
    setUsuarios(usr || [])
    setLoading(false)
  }

  async function salvarVendedor(negocioId: string, vendedorId: string) {
    await supabase.from('negocios').update({ vendedor_id: vendedorId||null }).eq('id', negocioId)
    setEditandoVendedor(null)
    carregar()
  }

  const ramos       = [...new Set(negocios.map((n:any)=>(n.produto||'').split(' — ')[0]).filter(Boolean))]
  const seguradoras = [...new Set(negocios.map((n:any)=>n.seguradora).filter(Boolean))]
  const isAdmin     = profile?.role === 'admin'
  const isLider     = profile?.role === 'lider'

  const filtrados = negocios.filter((n:any) => {
    const mb = !busca||(n.clientes?.nome||'').toLowerCase().includes(busca.toLowerCase())||(n.produto||'').toLowerCase().includes(busca.toLowerCase())||(n.seguradora||'').toLowerCase().includes(busca.toLowerCase())
    const mr = filtroRamo==='todos'||(n.produto||'').startsWith(filtroRamo)
    const ms = filtroSeg==='todos'||n.seguradora===filtroSeg
    const mv = filtroVendedor==='todos'||(n.users?.id===filtroVendedor)||(filtroVendedor==='sem'&&!n.vendedor_id)
    return mb&&mr&&ms&&mv
  })

  const premioTotal   = filtrados.reduce((s:number,n:any)=>s+(n.premio||0),0)
  const comissaoTotal = filtrados.reduce((s:number,n:any)=>s+(n.premio&&n.comissao_pct?n.premio*n.comissao_pct/100:0),0)
  const vencendo30d   = filtrados.filter((n:any)=>{if(!n.vencimento)return false;const d=diasAte(n.vencimento);return d>=0&&d<=30}).length

  function statusApolice(n: any) {
    if (!n.vencimento) return { label: n.etapa||'Ativo', cor: 'var(--teal)' }
    const dias = diasAte(n.vencimento)
    if (dias < 0)   return { label:'Vencido',           cor:'var(--red)' }
    if (dias <= 7)  return { label:'Renovar',            cor:'var(--gold)' }
    if (dias <= 30) return { label:'Renovar em breve',   cor:'#e6c97a' }
    return { label:'Ativo', cor:'var(--teal)' }
  }

  return (
    <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
      <div style={{height:56,borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',padding:'0 28px',gap:16,background:'rgba(10,22,40,0.7)',backdropFilter:'blur(8px)',position:'sticky',top:0,zIndex:5,flexShrink:0}}>
        <div style={{fontFamily:'DM Serif Display,serif',fontSize:18,flex:1}}>Apólices</div>
        <input style={{background:'rgba(255,255,255,0.05)',border:'1px solid var(--border)',borderRadius:8,padding:'7px 14px',color:'var(--text)',fontSize:13,width:220,outline:'none',fontFamily:'DM Sans,sans-serif'}}
          placeholder="🔍  Buscar..." value={busca} onChange={e=>setBusca(e.target.value)} />
      </div>

      <div style={{flex:1,overflow:'auto',padding:'28px 28px 40px'}}>
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:16,marginBottom:24}}>
          {[
            {label:'Total de Apólices',val:filtrados.length,cor:'linear-gradient(90deg,#4a80f0,#7aa3f8)'},
            {label:'Prêmio Total',val:'R$ '+fmt(premioTotal),cor:'linear-gradient(90deg,var(--gold),var(--gold-light))'},
            {label:'Comissão Total',val:'R$ '+fmt(comissaoTotal),cor:'linear-gradient(90deg,var(--teal),#4dd9c7)'},
            {label:'Vencendo (30d)',val:vencendo30d,cor:'linear-gradient(90deg,var(--red),#f08080)'},
          ].map(({label,val,cor})=>(
            <div key={label} className="card" style={{position:'relative',overflow:'hidden'}}>
              <div style={{position:'absolute',top:0,left:0,right:0,height:3,background:cor,borderRadius:'14px 14px 0 0'}}/>
              <div style={{fontSize:11,fontWeight:500,letterSpacing:1,textTransform:'uppercase',color:'var(--text-muted)',marginBottom:10}}>{label}</div>
              <div style={{fontFamily:'DM Serif Display,serif',fontSize:26,lineHeight:1}}>{val}</div>
            </div>
          ))}
        </div>

        <div style={{display:'flex',gap:8,marginBottom:18,flexWrap:'wrap',alignItems:'center'}}>
          <span style={{fontSize:12,color:'var(--text-muted)'}}>Ramo:</span>
          <select style={{background:'rgba(255,255,255,0.05)',border:'1px solid var(--border)',borderRadius:8,padding:'6px 12px',color:'var(--text)',fontSize:12,fontFamily:'DM Sans,sans-serif',cursor:'pointer'}} value={filtroRamo} onChange={e=>setFiltroRamo(e.target.value)}>
            <option value="todos">Todos</option>
            {ramos.map(r=><option key={r}>{r}</option>)}
          </select>
          <span style={{fontSize:12,color:'var(--text-muted)'}}>Seguradora:</span>
          <select style={{background:'rgba(255,255,255,0.05)',border:'1px solid var(--border)',borderRadius:8,padding:'6px 12px',color:'var(--text)',fontSize:12,fontFamily:'DM Sans,sans-serif',cursor:'pointer'}} value={filtroSeg} onChange={e=>setFiltroSeg(e.target.value)}>
            <option value="todos">Todas</option>
            {seguradoras.map(s=><option key={s}>{s}</option>)}
          </select>
          {(isAdmin||isLider)&&(<>
            <span style={{fontSize:12,color:'var(--text-muted)'}}>Vendedor:</span>
            <select style={{background:'rgba(255,255,255,0.05)',border:'1px solid var(--border)',borderRadius:8,padding:'6px 12px',color:'var(--text)',fontSize:12,fontFamily:'DM Sans,sans-serif',cursor:'pointer'}} value={filtroVendedor} onChange={e=>setFiltroVendedor(e.target.value)}>
              <option value="todos">Todos</option>
              <option value="sem">Sem vendedor</option>
              {usuarios.map(u=><option key={u.id} value={u.id}>{u.nome}</option>)}
            </select>
          </>)}
          <span style={{marginLeft:'auto',fontSize:13,color:'var(--text-muted)'}}>{filtrados.length} apólice{filtrados.length!==1?'s':''}</span>
        </div>

        <div className="card">
          {loading?<div style={{color:'var(--text-muted)',padding:20}}>Carregando...</div>:(
          <table style={{width:'100%',borderCollapse:'collapse'}}>
            <thead>
              <tr>{['Segurado','Produto','Seguradora','Vendedor','Prêmio/ano','Comissão','Vencimento','Status'].map(h=>(
                <th key={h} style={{fontSize:10,fontWeight:600,letterSpacing:'1px',textTransform:'uppercase',color:'var(--text-muted)',textAlign:'left',padding:'0 0 10px',borderBottom:'1px solid var(--border)'}}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {filtrados.map((n:any)=>{
                const st=statusApolice(n)
                const com=n.premio&&n.comissao_pct?n.premio*n.comissao_pct/100:0
                const dias=n.vencimento?diasAte(n.vencimento):null
                return(
                  <tr key={n.id} style={{cursor:'pointer'}}
                    onMouseEnter={e=>e.currentTarget.style.background='rgba(201,168,76,0.03)'}
                    onMouseLeave={e=>e.currentTarget.style.background=''}>
                    <td style={{padding:'10px 0',borderBottom:'1px solid rgba(255,255,255,0.04)'}} onClick={()=>router.push(`/dashboard/clientes/${n.clientes?.id}`)}>
                      <div style={{fontWeight:500}}>{n.clientes?.nome}</div>
                      <div style={{fontSize:11,color:'var(--text-muted)'}}>{n.clientes?.tipo}</div>
                    </td>
                    <td style={{padding:'10px 0',borderBottom:'1px solid rgba(255,255,255,0.04)',fontSize:13}} onClick={()=>router.push(`/dashboard/clientes/${n.clientes?.id}`)}>
                      {n.produto}
                      {n.placa&&<div style={{fontSize:11,color:'var(--text-muted)'}}>🚗 {n.placa}</div>}
                    </td>
                    <td style={{padding:'10px 0',borderBottom:'1px solid rgba(255,255,255,0.04)',fontSize:12,color:'var(--text-muted)'}} onClick={()=>router.push(`/dashboard/clientes/${n.clientes?.id}`)}>{n.seguradora||'—'}</td>
                    <td style={{padding:'10px 0',borderBottom:'1px solid rgba(255,255,255,0.04)',fontSize:12}}>
                      {editandoVendedor===n.id?(
                        <select autoFocus defaultValue={n.vendedor_id||''} onBlur={e=>salvarVendedor(n.id,e.target.value)}
                          onChange={e=>salvarVendedor(n.id,e.target.value)}
                          style={{background:'rgba(255,255,255,0.08)',border:'1px solid var(--gold)',borderRadius:6,padding:'4px 8px',color:'var(--text)',fontSize:11,fontFamily:'DM Sans,sans-serif'}}>
                          <option value="">Sem vendedor</option>
                          {usuarios.map(u=><option key={u.id} value={u.id}>{u.nome}</option>)}
                        </select>
                      ):(
                        <span style={{color:n.users?.nome?'var(--text)':'var(--text-muted)',cursor:isAdmin||isLider?'pointer':'default',borderRadius:6,padding:'2px 6px',border:isAdmin||isLider?'1px dashed var(--border)':'none'}}
                          onClick={()=>(isAdmin||isLider)&&setEditandoVendedor(n.id)}>
                          {n.users?.nome||'—'}
                        </span>
                      )}
                    </td>
                    <td style={{padding:'10px 0',borderBottom:'1px solid rgba(255,255,255,0.04)',color:'var(--gold)',fontWeight:600}} onClick={()=>router.push(`/dashboard/clientes/${n.clientes?.id}`)}>R$ {(n.premio||0).toLocaleString('pt-BR')}</td>
                    <td style={{padding:'10px 0',borderBottom:'1px solid rgba(255,255,255,0.04)',fontSize:13}} onClick={()=>router.push(`/dashboard/clientes/${n.clientes?.id}`)}>
                      {com>0?<><div style={{color:'var(--teal)',fontWeight:600}}>R$ {Math.round(com).toLocaleString('pt-BR')}</div><div style={{fontSize:11,color:'var(--text-muted)'}}>{n.comissao_pct}%</div></>:'—'}
                    </td>
                    <td style={{padding:'10px 0',borderBottom:'1px solid rgba(255,255,255,0.04)',fontSize:12}} onClick={()=>router.push(`/dashboard/clientes/${n.clientes?.id}`)}>
                      {n.vencimento?<>
                        <div>{new Date(n.vencimento).toLocaleDateString('pt-BR')}</div>
                        {dias!==null&&<div style={{fontSize:11,color:dias<0?'var(--red)':dias<=7?'var(--gold)':'var(--text-muted)'}}>{dias<0?`Vencido há ${Math.abs(dias)}d`:dias===0?'Hoje':`Em ${dias}d`}</div>}
                      </>:'—'}
                    </td>
                    <td style={{padding:'10px 0',borderBottom:'1px solid rgba(255,255,255,0.04)'}} onClick={()=>router.push(`/dashboard/clientes/${n.clientes?.id}`)}>
                      <span style={{fontSize:11,fontWeight:600,borderRadius:20,padding:'3px 10px',background:'rgba(0,0,0,0.2)',color:st.cor,border:`1px solid ${st.cor}33`}}>{st.label}</span>
                    </td>
                  </tr>
                )
              })}
              {filtrados.length===0&&!loading&&(
                <tr><td colSpan={8} style={{padding:30,textAlign:'center',color:'var(--text-muted)'}}>Nenhuma apólice encontrada.</td></tr>
              )}
            </tbody>
          </table>
          )}
        </div>
      </div>
    </div>
  )
}

function diasAte(v:string){const h=new Date();h.setHours(0,0,0,0);const d=new Date(v);d.setHours(0,0,0,0);return Math.ceil((d.getTime()-h.getTime())/(1000*60*60*24))}
function fmt(n:number){return n>=1000?(n/1000).toFixed(1)+'k':n.toLocaleString('pt-BR')}
