'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function ApolicesPage() {
  const supabase = createClient()
  const router   = useRouter()
  const [negocios, setNegocios]   = useState<any[]>([])
  const [usuarios, setUsuarios]   = useState<any[]>([])
  const [vendedoresLegado, setVendedoresLegado] = useState<any[]>([])
  const [profile, setProfile]     = useState<any>(null)
  const [loading, setLoading]     = useState(true)
  const [busca, setBusca]         = useState('')
  const [filtroRamo, setFiltroRamo] = useState('todos')
  const [filtroSeg, setFiltroSeg]   = useState('todos')
  const [filtroVendedor, setFiltroVendedor] = useState('todos')
  const [editandoVendedor, setEditandoVendedor] = useState<string|null>(null)

  // Lançamento de comissão recebida (admin)
  const [comModal, setComModal] = useState<any|null>(null)
  const hojeIso = new Date().toISOString().slice(0,10)
  const [comForm, setComForm] = useState({ valor:'', competencia: hojeIso.slice(0,7), data_recebimento: hojeIso, parcela:'1', total_parcelas:'1', obs:'' })
  const [comSalvando, setComSalvando] = useState(false)

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
      .select('*, clientes(id,nome,tipo), users!negocios_vendedor_id_fkey(id,nome), vendedores_legado(id,nome)')
      .gt('premio', 0)
      .order('vencimento', { ascending: true })

    if (visibleIds) query = (query as any).in('vendedor_id', visibleIds)

    const [{ data }, { data: usr }, { data: vleg }] = await Promise.all([
      query,
      supabase.from('users').select('id, nome').order('nome'),
      supabase.from('vendedores_legado').select('id, nome').eq('ativo', true).order('nome'),
    ])
    setNegocios(data || [])
    setUsuarios(usr || [])
    setVendedoresLegado(vleg || [])
    setLoading(false)
  }

  async function salvarVendedor(negocioId: string, valor: string) {
    // valor pode ser '', 'user:<uuid>' ou 'legado:<uuid>'
    const patch: any = { vendedor_id: null, vendedor_legado_id: null }
    if (valor.startsWith('user:'))   patch.vendedor_id        = valor.slice(5)
    if (valor.startsWith('legado:')) patch.vendedor_legado_id = valor.slice(7)
    await supabase.from('negocios').update(patch).eq('id', negocioId)
    setEditandoVendedor(null)
    carregar()
  }

  function abrirComissao(neg: any) {
    const valorBase = neg.premio && neg.comissao_pct ? (Number(neg.premio) * Number(neg.comissao_pct) / 100) : 0
    setComForm({
      valor: valorBase ? valorBase.toFixed(2) : '',
      competencia: hojeIso.slice(0,7),
      data_recebimento: hojeIso,
      parcela: '1',
      total_parcelas: '1',
      obs: '',
    })
    setComModal(neg)
  }

  async function lancarComissao() {
    if (!comModal) return
    const valorNum = parseFloat(String(comForm.valor).replace(/\./g,'').replace(',','.')) || 0
    if (valorNum <= 0) { alert('Informe um valor válido.'); return }
    if (!comModal.vendedor_id) { alert('Esta apólice não tem vendedor atribuído. Atribua um vendedor antes de lançar a comissão.'); return }
    setComSalvando(true)
    const { data:{ user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('comissoes_recebidas').insert({
      negocio_id:       comModal.id,
      cliente_id:       comModal.clientes?.id || null,
      vendedor_id:      comModal.vendedor_id,
      valor:            valorNum,
      competencia:      comForm.competencia || null,
      data_recebimento: comForm.data_recebimento || null,
      parcela:          parseInt(comForm.parcela)||1,
      total_parcelas:   parseInt(comForm.total_parcelas)||1,
      seguradora:       comModal.seguradora || null,
      produto:          comModal.produto || null,
      status:           'recebido',
      origem:           'manual',
      obs:              comForm.obs || null,
      registrado_por:   user?.id || null,
    })
    setComSalvando(false)
    if (error) { alert('Erro ao lançar: '+error.message); return }
    setComModal(null)
    alert('Comissão lançada com sucesso. Aparecerá no extrato de '+(comModal.users?.nome||'do vendedor')+'.')
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
      <div style={{height:56,borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',padding:'0 28px',gap:16,background:'var(--bg-soft)',backdropFilter:'blur(8px)',position:'sticky',top:0,zIndex:5,flexShrink:0}}>
        <div style={{fontFamily:'DM Serif Display,serif',fontSize:18,flex:1}}>Apólices</div>
        <input style={{background:'rgba(255,255,255,0.05)',border:'1px solid var(--border)',borderRadius:8,padding:'7px 14px',color:'var(--text)',fontSize:13,width:220,outline:'none',fontFamily:'DM Sans,sans-serif'}}
          placeholder="🔍  Buscar..." value={busca} onChange={e=>setBusca(e.target.value)} />
      </div>

      <div style={{flex:1,overflow:'auto',padding:'28px 28px 40px'}}>
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:20,marginBottom:24}}>
          {[
            {label:'Total de Apólices', val:filtrados.length,           tone:'info'    as const},
            {label:'Prêmio Total',      val:'R$ '+fmt(premioTotal),     tone:'warning' as const},
            {label:'Comissão Total',    val:'R$ '+fmt(comissaoTotal),   tone:'success' as const},
            {label:'Vencendo (30d)',    val:vencendo30d,                tone:'danger'  as const},
          ].map(({label,val,tone})=>(
            <div key={label} className={`kpi kpi-${tone}`}>
              <div className="kpi-label">{label}</div>
              <div className={`kpi-value ${tone === 'success' ? 'kpi-value-success' : tone === 'warning' ? 'kpi-value-warning' : tone === 'danger' ? 'kpi-value-danger' : ''}`}>{val}</div>
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
              <tr>{['Segurado','Produto','Seguradora','Vendedor','Prêmio/ano','Comissão','Vencimento','Status', isAdmin?'Ações':''].filter(h=>h!=='').map(h=>(
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
                        <select autoFocus
                          defaultValue={n.vendedor_id?`user:${n.vendedor_id}`:n.vendedor_legado_id?`legado:${n.vendedor_legado_id}`:''}
                          onBlur={e=>salvarVendedor(n.id,e.target.value)}
                          onChange={e=>salvarVendedor(n.id,e.target.value)}
                          style={{background:'rgba(255,255,255,0.08)',border:'1px solid var(--gold)',borderRadius:6,padding:'4px 8px',color:'var(--text)',fontSize:11,fontFamily:'DM Sans,sans-serif'}}>
                          <option value="">Sem vendedor</option>
                          <optgroup label="Vendedores ativos">
                            {usuarios.map(u=><option key={u.id} value={`user:${u.id}`}>{u.nome}</option>)}
                          </optgroup>
                          <optgroup label="Vendedores antigos (histórico)">
                            {vendedoresLegado.map(v=><option key={v.id} value={`legado:${v.id}`}>{v.nome}</option>)}
                          </optgroup>
                        </select>
                      ):(
                        <span style={{color:(n.users?.nome||n.vendedores_legado?.nome)?'var(--text)':'var(--text-muted)',cursor:isAdmin||isLider?'pointer':'default',borderRadius:6,padding:'2px 6px',border:isAdmin||isLider?'1px dashed var(--border)':'none'}}
                          onClick={()=>(isAdmin||isLider)&&setEditandoVendedor(n.id)}>
                          {n.users?.nome || (n.vendedores_legado?.nome ? `${n.vendedores_legado.nome} (legado)` : '—')}
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
                    {isAdmin&&(
                      <td style={{padding:'10px 0',borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
                        <button onClick={()=>abrirComissao(n)}
                          title={n.vendedor_id?'Lançar comissão recebida':'Atribua um vendedor antes'}
                          disabled={!n.vendedor_id}
                          style={{fontSize:11,fontWeight:600,padding:'4px 10px',borderRadius:6,border:'1px solid rgba(28,181,160,0.4)',background:n.vendedor_id?'rgba(28,181,160,0.10)':'rgba(255,255,255,0.04)',color:n.vendedor_id?'var(--teal)':'var(--text-muted)',cursor:n.vendedor_id?'pointer':'not-allowed',fontFamily:'DM Sans,sans-serif',whiteSpace:'nowrap'}}>
                          💵 Comissão
                        </button>
                      </td>
                    )}
                  </tr>
                )
              })}
              {filtrados.length===0&&!loading&&(
                <tr><td colSpan={isAdmin?9:8} style={{padding:30,textAlign:'center',color:'var(--text-muted)'}}>Nenhuma apólice encontrada.</td></tr>
              )}
            </tbody>
          </table>
          )}
        </div>
      </div>

      {/* Modal Lançar Comissão Recebida */}
      {comModal && (
        <div style={{position:'fixed',inset:0,background:'rgba(15,23,42,0.45)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',backdropFilter:'blur(6px)'}}
          onClick={e=>e.target===e.currentTarget&&setComModal(null)}>
          <div style={{background:'#ffffff',border:'1px solid var(--border)',borderRadius:20,padding:'28px 32px',width:480,maxWidth:'95vw'}}>
            <div style={{fontFamily:'DM Serif Display,serif',fontSize:18,marginBottom:6}}>💵 Lançar comissão recebida</div>
            <div style={{fontSize:12,color:'var(--text-muted)',marginBottom:16}}>
              Apólice de <b style={{color:'var(--text)'}}>{comModal.clientes?.nome}</b> · {comModal.produto||'—'} · {comModal.seguradora||'—'}<br/>
              Vendedor: <b style={{color:'var(--gold)'}}>{comModal.users?.nome||'(sem vendedor)'}</b>
            </div>

            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12}}>
              <div>
                <label style={{fontSize:11,color:'var(--text-muted)',display:'block',marginBottom:4,textTransform:'uppercase',letterSpacing:'1px',fontWeight:600}}>Valor recebido (R$) *</label>
                <input value={comForm.valor} onChange={e=>setComForm(f=>({...f,valor:e.target.value}))} placeholder="0,00"
                  style={{width:'100%',background:'rgba(255,255,255,0.05)',border:'1px solid var(--border)',borderRadius:8,padding:'8px 12px',color:'var(--text)',fontSize:14,fontWeight:600,outline:'none',boxSizing:'border-box'}} autoFocus />
              </div>
              <div>
                <label style={{fontSize:11,color:'var(--text-muted)',display:'block',marginBottom:4,textTransform:'uppercase',letterSpacing:'1px',fontWeight:600}}>Competência</label>
                <input type="month" value={comForm.competencia} onChange={e=>setComForm(f=>({...f,competencia:e.target.value}))}
                  style={{width:'100%',background:'rgba(255,255,255,0.05)',border:'1px solid var(--border)',borderRadius:8,padding:'8px 12px',color:'var(--text)',fontSize:13,outline:'none',boxSizing:'border-box'}} />
              </div>
            </div>

            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12,marginBottom:12}}>
              <div>
                <label style={{fontSize:11,color:'var(--text-muted)',display:'block',marginBottom:4,textTransform:'uppercase',letterSpacing:'1px',fontWeight:600}}>Data recebimento</label>
                <input type="date" value={comForm.data_recebimento} onChange={e=>setComForm(f=>({...f,data_recebimento:e.target.value}))}
                  style={{width:'100%',background:'rgba(255,255,255,0.05)',border:'1px solid var(--border)',borderRadius:8,padding:'8px 12px',color:'var(--text)',fontSize:13,outline:'none',boxSizing:'border-box'}} />
              </div>
              <div>
                <label style={{fontSize:11,color:'var(--text-muted)',display:'block',marginBottom:4,textTransform:'uppercase',letterSpacing:'1px',fontWeight:600}}>Parcela</label>
                <input type="number" min="1" value={comForm.parcela} onChange={e=>setComForm(f=>({...f,parcela:e.target.value}))}
                  style={{width:'100%',background:'rgba(255,255,255,0.05)',border:'1px solid var(--border)',borderRadius:8,padding:'8px 12px',color:'var(--text)',fontSize:13,outline:'none',boxSizing:'border-box'}} />
              </div>
              <div>
                <label style={{fontSize:11,color:'var(--text-muted)',display:'block',marginBottom:4,textTransform:'uppercase',letterSpacing:'1px',fontWeight:600}}>de</label>
                <input type="number" min="1" value={comForm.total_parcelas} onChange={e=>setComForm(f=>({...f,total_parcelas:e.target.value}))}
                  style={{width:'100%',background:'rgba(255,255,255,0.05)',border:'1px solid var(--border)',borderRadius:8,padding:'8px 12px',color:'var(--text)',fontSize:13,outline:'none',boxSizing:'border-box'}} />
              </div>
            </div>

            <div style={{marginBottom:18}}>
              <label style={{fontSize:11,color:'var(--text-muted)',display:'block',marginBottom:4,textTransform:'uppercase',letterSpacing:'1px',fontWeight:600}}>Observações</label>
              <textarea value={comForm.obs} onChange={e=>setComForm(f=>({...f,obs:e.target.value}))} rows={2} placeholder="Ex: 1ª parcela referente à apólice 12345..."
                style={{width:'100%',background:'rgba(255,255,255,0.05)',border:'1px solid var(--border)',borderRadius:8,padding:'8px 12px',color:'var(--text)',fontSize:13,outline:'none',boxSizing:'border-box',resize:'none',fontFamily:'DM Sans,sans-serif'}} />
            </div>

            <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
              <button className="btn-secondary" onClick={()=>setComModal(null)} disabled={comSalvando}>Cancelar</button>
              <button className="btn-primary" onClick={lancarComissao} disabled={comSalvando||!comForm.valor}>
                {comSalvando?'Salvando...':'✓ Lançar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function diasAte(v:string){const h=new Date();h.setHours(0,0,0,0);const d=new Date(v);d.setHours(0,0,0,0);return Math.ceil((d.getTime()-h.getTime())/(1000*60*60*24))}
function fmt(n:number){return n>=1000?(n/1000).toFixed(1)+'k':n.toLocaleString('pt-BR')}
