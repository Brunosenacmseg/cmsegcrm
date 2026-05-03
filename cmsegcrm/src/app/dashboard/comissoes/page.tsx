'use client'
import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { exportarXLSX, fmt } from '@/lib/export-xlsx'

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
declare global { interface Window { XLSX: any } }

async function carregarSheetJS(): Promise<void> {
  if (typeof window==='undefined'||window.XLSX) return
  return new Promise((res,rej)=>{ const s=document.createElement('script'); s.src='https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'; s.onload=()=>res(); s.onerror=rej; document.head.appendChild(s) })
}

async function lerExcel(file: File): Promise<{headers:string[];rows:Record<string,any>[]}> {
  await carregarSheetJS()
  return new Promise((resolve,reject)=>{
    const reader=new FileReader()
    reader.onload=(e)=>{ try {
      const wb=window.XLSX.read(e.target?.result,{type:'array'})
      const ws=wb.Sheets[wb.SheetNames[0]]
      const json=window.XLSX.utils.sheet_to_json(ws,{header:1,defval:''}) as any[][]
      if(!json.length){resolve({headers:[],rows:[]});return}
      const headers=(json[0] as any[]).map(h=>String(h||'').trim())
      const rows=json.slice(1).filter(r=>r.some((c:any)=>c!=='')).map(r=>Object.fromEntries(headers.map((h,i)=>[h,r[i]])))
      resolve({headers,rows})
    }catch(err){reject(err)} }
    reader.onerror=reject; reader.readAsArrayBuffer(file)
  })
}

const CAMPO_MAP=[
  {campo:'cliente',    label:'Cliente / Segurado',   hints:['nome','cliente','segurado','name','contratante']},
  {campo:'produto',    label:'Produto / Ramo',        hints:['produto','ramo','tipo','product','cobertura','modalidade']},
  {campo:'seguradora', label:'Seguradora',            hints:['seguradora','cia','companhia','insurer','empresa']},
  {campo:'premio',     label:'Prêmio (R$)',           hints:['premio','prêmio','valor','value','amount','total','bruto']},
  {campo:'comissao',   label:'Comissão (R$)',         hints:['comissao','comissão','commission','com','repasse']},
  {campo:'pct',        label:'% Comissão',            hints:['%','perc','pct','porcentagem','percentual','taxa']},
  {campo:'vencimento', label:'Vencimento / Vigência', hints:['vencimento','vigencia','vigência','data','date','validade']},
  {campo:'apolice',    label:'Nº Apólice',            hints:['apolice','apólice','numero','nº','policy','certificado']},
]

function autoMapear(headers:string[]){
  const norm=(s:string)=>s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  return CAMPO_MAP.map(c=>({...c,coluna:headers.find(h=>c.hints.some(hint=>norm(h).includes(hint)))||''}))
}

export default function ComissoesPage(){
  const supabase=createClient(); const router=useRouter()
  const anoAtual=new Date().getFullYear(); const mesAtual=new Date().getMonth()
  const inputRef=useRef<HTMLInputElement>(null)
  const [profile,setProfile]         =useState<any>(null)
  const [usuarios,setUsuarios]       =useState<any[]>([])
  const [negocios,setNegocios]       =useState<any[]>([])
  const [recebidas,setRecebidas]     =useState<any[]>([])
  const [importacoes,setImportacoes] =useState<any[]>([])
  const [loading,setLoading]         =useState(true)
  const [mesSel,setMesSel]           =useState(mesAtual)
  const [anoSel,setAnoSel]           =useState(anoAtual)
  const [vistaAno,setVistaAno]       =useState(false)
  const [abaAtiva,setAbaAtiva]       =useState<'recebidas'|'extrato'|'importar'>('recebidas')
  const [filtroVendedor,setFiltroVendedor]=useState<string>('todos')
  const [importStep,setImportStep]   =useState<'upload'|'mapear'|'preview'|'sucesso'>('upload')
  const [excelData,setExcelData]     =useState<{headers:string[];rows:Record<string,any>[]}>(({headers:[],rows:[]}))
  const [mapeamento,setMapeamento]   =useState<any[]>([])
  const [competencia,setCompetencia] =useState(`${anoAtual}-${String(mesAtual+1).padStart(2,'0')}`)
  const [importing,setImporting]     =useState(false)
  const [drag,setDrag]               =useState(false)
  const [nomeArquivo,setNomeArquivo] =useState('')

  useEffect(()=>{carregar()},[])

  async function carregar(){
    setLoading(true)
    const {data:{user}}=await supabase.auth.getUser()
    const {data:prof}=await supabase.from('users').select('*').eq('id',user?.id||'').single()
    setProfile(prof)

    // Filtrar por hierarquia
    let visibleIds: string[]|null = null
    if(prof?.role==='corretor'){
      visibleIds=[user?.id||'']
    }else if(prof?.role==='lider'){
      const {data:eq}=await supabase.from('equipes').select('id').eq('lider_id',user?.id||'')
      if(eq?.length){
        const {data:mb}=await supabase.from('equipe_membros').select('user_id').in('equipe_id',eq.map((e:any)=>e.id))
        visibleIds=[user?.id||'',...(mb?.map((m:any)=>m.user_id)||[])]
      }else visibleIds=[user?.id||'']
    }

    let negQuery=supabase.from('negocios').select('*,clientes(id,nome,tipo),funis(tipo,nome,emoji),users!negocios_vendedor_id_fkey(nome)').gt('premio',0).gt('comissao_pct',0).order('created_at',{ascending:false})
    if(visibleIds) negQuery=(negQuery as any).in('vendedor_id',visibleIds)

    let recQuery=supabase.from('comissoes_recebidas').select('*,clientes(id,nome,tipo),apolices(id,numero),users!comissoes_recebidas_vendedor_id_fkey(id,nome)').order('data_recebimento',{ascending:false})
    if(visibleIds) recQuery=(recQuery as any).in('vendedor_id',visibleIds)

    const [{data:negs},{data:recs},{data:imps},{data:usrs}]=await Promise.all([
      negQuery,
      recQuery,
      supabase.from('importacoes_comissao').select('*').order('created_at',{ascending:false}).limit(10),
      prof?.role==='admin'||prof?.role==='lider' ? supabase.from('users').select('id,nome').order('nome') : Promise.resolve({data:[]}),
    ])
    setNegocios(negs||[]); setRecebidas(recs||[]); setImportacoes(imps||[]); setUsuarios(usrs||[])
    setLoading(false)
  }

  const isAdminOrLider = profile?.role==='admin' || profile?.role==='lider'
  const aplicarFiltro = (arr:any[], campo:string='vendedor_id') => filtroVendedor==='todos' ? arr : arr.filter((x:any)=> (x[campo]||x.users?.id) === filtroVendedor)
  const negociosFiltrados = aplicarFiltro(negocios)
  const recebidasFiltradas = aplicarFiltro(recebidas)

  const doMes=negociosFiltrados.filter((n:any)=>{const d=new Date(n.created_at);return d.getFullYear()===anoSel&&d.getMonth()===mesSel})
  const doAno=negociosFiltrados.filter((n:any)=>new Date(n.created_at).getFullYear()===anoSel)
  const lista=vistaAno?doAno:doMes

  // Comissões efetivamente recebidas — período
  const recRefData = (r:any) => r.data_recebimento ? new Date(r.data_recebimento) : new Date(r.created_at)
  const recDoMes = recebidasFiltradas.filter((r:any)=>{const d=recRefData(r);return d.getFullYear()===anoSel&&d.getMonth()===mesSel})
  const recDoAno = recebidasFiltradas.filter((r:any)=>recRefData(r).getFullYear()===anoSel)
  const recLista = vistaAno?recDoAno:recDoMes
  const recTotal = recLista.reduce((s:number,r:any)=>s+Number(r.valor||0), 0)
  const recPorMes = Array(12).fill(0).map((_,i)=>({mes:i, total:recebidasFiltradas.filter((r:any)=>{const d=recRefData(r);return d.getFullYear()===anoSel&&d.getMonth()===i}).reduce((s:number,r:any)=>s+Number(r.valor||0),0)}))
  const recMaxMes = Math.max(...recPorMes.map(m=>m.total),1)
  const recPorVendedor: Record<string,{nome:string;total:number;qtd:number}> = {}
  recLista.forEach((r:any)=>{const k=r.vendedor_id||'sem'; const nome=r.users?.nome||'(sem vendedor)'; if(!recPorVendedor[k]) recPorVendedor[k]={nome,total:0,qtd:0}; recPorVendedor[k].total+=Number(r.valor||0); recPorVendedor[k].qtd++})
  const recRankVendedores = Object.values(recPorVendedor).sort((a,b)=>b.total-a.total)
  const premioLista  =lista.reduce((s:number,n:any)=>s+(n.premio||0),0)
  const comissaoLista=lista.reduce((s:number,n:any)=>s+n.premio*n.comissao_pct/100,0)
  const mediaComissao=lista.length?lista.reduce((s:number,n:any)=>s+n.comissao_pct,0)/lista.length:0
  const porMes=Array(12).fill(0).map((_,i)=>({mes:i,com:negociosFiltrados.filter((n:any)=>{const d=new Date(n.created_at);return d.getFullYear()===anoSel&&d.getMonth()===i}).reduce((s:number,n:any)=>s+n.premio*n.comissao_pct/100,0)}))
  const maxComMes=Math.max(...porMes.map(m=>m.com),1)
  const porSeg:Record<string,{com:number;qtd:number}>= {}
  lista.forEach((n:any)=>{const s=n.seguradora||'Outros';if(!porSeg[s])porSeg[s]={com:0,qtd:0};porSeg[s].com+=n.premio*n.comissao_pct/100;porSeg[s].qtd++})
  const topSeg=Object.entries(porSeg).sort((a:any,b:any)=>b[1].com-a[1].com)

  async function handleExcelFile(file:File){
    setNomeArquivo(file.name)
    try{const data=await lerExcel(file);setExcelData(data);setMapeamento(autoMapear(data.headers));setImportStep('mapear')}
    catch{alert('Erro ao ler o arquivo. Use .xlsx ou .xls válido.')}
  }

  function parseMoeda(s:any):number{if(!s)return 0;return parseFloat(s.toString().replace(/[R$\s.]/g,'').replace(',','.'))||0}

  async function confirmarImportacao(){
    setImporting(true)
    const map=Object.fromEntries(mapeamento.map(m=>[m.campo,m.coluna]))
    const {data:{user}}=await supabase.auth.getUser()
    let totalCom=0,qtd=0,anexoId:string|null=null
    if(inputRef.current?.files?.[0]){
      const file=inputRef.current.files[0]
      const path=`comissoes/${user?.id}/${Date.now()}_${file.name}`
      await supabase.storage.from('cmsegcrm').upload(path,file)
      const {data:anx}=await supabase.from('anexos').insert({bucket:'cmsegcrm',path,nome_arquivo:file.name,tipo_mime:file.type,tamanho_kb:Math.round(file.size/1024),categoria:'comissao',user_id:user?.id}).select().single()
      anexoId=anx?.id||null
    }
    for(const row of excelData.rows){
      const premio=parseMoeda(map.premio?row[map.premio]:'')
      const com=parseMoeda(map.comissao?row[map.comissao]:'')
      const pct=parseMoeda(map.pct?row[map.pct]:'')
      const comFinal=com>0?com:(premio*pct/100)
      totalCom+=comFinal; qtd++
      const nomeCliente=map.cliente?(row[map.cliente]||'').toString():''
      if(nomeCliente&&comFinal>0){
        const neg=negocios.find(n=>n.clientes?.nome?.toLowerCase().includes(nomeCliente.toLowerCase().slice(0,6))&&Math.abs((n.premio||0)-premio)<200)
        if(neg)await supabase.from('historico').insert({cliente_id:neg.cliente_id,negocio_id:neg.id,tipo:'teal',titulo:'Comissão importada',descricao:`Comissão de R$ ${comFinal.toLocaleString('pt-BR',{minimumFractionDigits:2})} importada via planilha (${nomeArquivo})`})
      }
    }
    await supabase.from('importacoes_comissao').insert({nome_arquivo:nomeArquivo,competencia,total_importado:totalCom,qtd_registros:qtd,status:'processado',anexo_id:anexoId,user_id:user?.id})
    setImporting(false); setImportStep('sucesso'); carregar()
  }

  const sel:React.CSSProperties={background:'rgba(255,255,255,0.05)',border:'1px solid var(--border)',borderRadius:8,padding:'7px 12px',color:'var(--text)',fontSize:12,fontFamily:'DM Sans,sans-serif',cursor:'pointer',outline:'none',width:'100%'}
  const th:React.CSSProperties={fontSize:10,fontWeight:600,letterSpacing:'1px',textTransform:'uppercase' as const,color:'var(--text-muted)',textAlign:'left' as const,padding:'0 0 10px',borderBottom:'1px solid var(--border)'}
  const td0:React.CSSProperties={padding:'10px 0',borderBottom:'1px solid rgba(255,255,255,0.04)'}

  return (
    <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
      <div style={{height:56,borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',padding:'0 28px',gap:16,background:'var(--bg-soft)',backdropFilter:'blur(8px)',position:'sticky',top:0,zIndex:5,flexShrink:0}}>
        <div style={{fontFamily:'DM Serif Display,serif',fontSize:18,flex:1}}>
          Comissões
          {profile && profile.role!=='admin' && (
            <span style={{marginLeft:10,fontSize:11,color:'var(--text-muted)',fontFamily:'DM Sans,sans-serif',fontWeight:400}}>
              · {profile.role==='lider'?'minha equipe':'minhas comissões'}
            </span>
          )}
        </div>

        {isAdminOrLider && (
          <select value={filtroVendedor} onChange={e=>setFiltroVendedor(e.target.value)}
            title={profile?.role==='admin'?'Filtrar por vendedor':'Filtrar por membro da equipe'}
            style={{...sel,width:'auto',padding:'7px 12px'}}>
            <option value="todos">{profile?.role==='admin'?'👥 Todos os vendedores':'👥 Toda a equipe'}</option>
            {usuarios.map((u:any)=><option key={u.id} value={u.id}>{u.nome}</option>)}
          </select>
        )}

        <div style={{display:'flex',gap:4}}>
          {([['recebidas','💵 Recebidas'],['extrato','📊 Previstas'],['importar','📥 Importar Excel']] as [string,string][]).map(([k,l])=>(
            <button key={k} onClick={()=>setAbaAtiva(k as any)} style={{padding:'7px 16px',borderRadius:8,fontSize:12,cursor:'pointer',border:'1px solid var(--border)',fontFamily:'DM Sans,sans-serif',background:abaAtiva===k?'rgba(201,168,76,0.12)':'rgba(255,255,255,0.04)',color:abaAtiva===k?'var(--gold)':'var(--text-muted)',borderColor:abaAtiva===k?'var(--gold)':'var(--border)'}}>{l}</button>
          ))}
        </div>
      </div>

      <div style={{flex:1,overflow:'auto',padding:'28px 28px 40px'}}>

        {/* ═══ RECEBIDAS (real) ═══ */}
        {abaAtiva==='recebidas'&&<>
          <div style={{display:'flex',gap:10,marginBottom:24,alignItems:'center',flexWrap:'wrap'}}>
            <select style={{...sel,width:'auto'}} value={anoSel} onChange={e=>setAnoSel(Number(e.target.value))}>{[anoAtual-1,anoAtual,anoAtual+1].map(a=><option key={a}>{a}</option>)}</select>
            {!vistaAno&&<select style={{...sel,width:'auto'}} value={mesSel} onChange={e=>setMesSel(Number(e.target.value))}>{MESES.map((m,i)=><option key={i} value={i}>{m}</option>)}</select>}
            <button onClick={()=>setVistaAno(!vistaAno)} style={{padding:'7px 16px',borderRadius:8,fontSize:12,cursor:'pointer',border:'1px solid var(--border)',fontFamily:'DM Sans,sans-serif',background:vistaAno?'rgba(201,168,76,0.12)':'rgba(255,255,255,0.04)',color:vistaAno?'var(--gold)':'var(--text-muted)',borderColor:vistaAno?'var(--gold)':'var(--border)'}}>{vistaAno?'📅 Ver por mês':'📆 Ver ano'}</button>
            <span style={{marginLeft:'auto',fontSize:12,color:'var(--text-muted)'}}>{recLista.length} lançamento{recLista.length!==1?'s':''}</span>
          </div>

          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:20,marginBottom:24}}>
            {[
              {label:'Total Recebido '+(vistaAno?anoSel:MESES[mesSel]), val:'R$ '+fmtFull(recTotal), tone:'success' as const},
              {label:'Lançamentos',       val:recLista.length,                                       tone:'warning' as const},
              {label:'Vendedores ativos', val:recRankVendedores.length,                              tone:'info'    as const},
            ].map(({label,val,tone})=>(
              <div key={label} className={`kpi kpi-${tone}`}>
                <div className="kpi-label">{label}</div>
                <div className={`kpi-value ${tone === 'success' ? 'kpi-value-success' : tone === 'warning' ? 'kpi-value-warning' : ''}`}>{val}</div>
              </div>
            ))}
          </div>

          <div style={{display:'grid',gridTemplateColumns:'2fr 1fr',gap:16,marginBottom:16}}>
            <div className="card">
              <div style={{fontFamily:'DM Serif Display,serif',fontSize:15,marginBottom:20}}>Recebimentos por mês — {anoSel}</div>
              <div style={{display:'flex',alignItems:'flex-end',gap:5,height:100}}>
                {recPorMes.map(({mes,total})=>(
                  <div key={mes} onClick={()=>{setVistaAno(false);setMesSel(mes)}} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:4,cursor:'pointer'}}>
                    <div style={{fontSize:9,color:total>0?'var(--teal)':'transparent',fontWeight:600}}>{total>0?'R$'+Math.round(total/1000)+'k':''}</div>
                    <div style={{width:'100%',borderRadius:'4px 4px 0 0',transition:'height 0.6s ease',background:mes===mesSel&&!vistaAno?'var(--teal)':'rgba(28,181,160,0.3)',height:total>0?Math.max(6,total/recMaxMes*80)+'px':'4px'}}/>
                    <div style={{fontSize:9,color:mes===mesSel&&!vistaAno?'var(--teal)':'var(--text-muted)',fontWeight:mes===mesSel?600:400}}>{'JFMAMJJASOND'[mes]}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="card">
              <div style={{fontFamily:'DM Serif Display,serif',fontSize:15,marginBottom:14}}>{profile?.role==='admin'?'Por vendedor':'Equipe'}</div>
              {recRankVendedores.length===0 && <div style={{color:'var(--text-muted)',fontSize:13}}>Sem dados</div>}
              {recRankVendedores.slice(0,8).map(v=>(
                <div key={v.nome} style={{marginBottom:10}}>
                  <div style={{display:'flex',justifyContent:'space-between',marginBottom:3}}>
                    <span style={{fontSize:12,color:'var(--text-muted)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:'60%'}}>{v.nome} <span style={{color:'var(--text-muted)',fontSize:10}}>· {v.qtd}</span></span>
                    <span style={{fontSize:12,fontWeight:600,color:'var(--teal)'}}>R$ {Math.round(v.total).toLocaleString('pt-BR')}</span>
                  </div>
                  <div style={{background:'rgba(255,255,255,0.05)',borderRadius:4,height:6,overflow:'hidden'}}>
                    <div style={{height:'100%',borderRadius:4,background:'var(--teal)',width:(v.total/recRankVendedores[0].total*100)+'%'}}/>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16,gap:10,flexWrap:'wrap'}}>
              <div style={{fontFamily:'DM Serif Display,serif',fontSize:15}}>Detalhamento — {vistaAno?anoSel:`${MESES[mesSel]} ${anoSel}`}</div>
              <div style={{display:'flex',gap:8,alignItems:'center'}}>
                {profile?.role==='admin' && <span style={{fontSize:11,color:'var(--text-muted)'}}>Lançamentos vinculados a apólices/negócios</span>}
                <button
                  onClick={()=>{
                    const vendedorNome = filtroVendedor==='todos'
                      ? 'todos_vendedores'
                      : (usuarios.find((u:any)=>u.id===filtroVendedor)?.nome || 'vendedor').toLowerCase().replace(/\s+/g,'_')
                    const periodo = vistaAno ? String(anoSel) : `${anoSel}-${String(mesSel+1).padStart(2,'0')}`
                    exportarXLSX(recLista, [
                      { campo:'clientes',     titulo:'Cliente',      fmt:(v:any)=>v?.nome || '' },
                      { campo:'apolices',     titulo:'Apólice',      fmt:(v:any)=>v?.numero || '' },
                      { campo:'users',        titulo:'Vendedor',     fmt:(v:any)=>v?.nome || '' },
                      { campo:'produto',      titulo:'Produto' },
                      { campo:'seguradora',   titulo:'Seguradora' },
                      { campo:'competencia',  titulo:'Competência' },
                      { campo:'data_recebimento', titulo:'Recebido em', fmt:fmt.data },
                      { campo:'parcela',      titulo:'Parcela' },
                      { campo:'total_parcelas', titulo:'Total parcelas' },
                      { campo:'valor',        titulo:'Valor (R$)',   fmt:fmt.brl },
                      { campo:'status',       titulo:'Status' },
                      { campo:'obs',          titulo:'Descrição' },
                    ], `comissoes_${vendedorNome}_${periodo}`)
                  }}
                  disabled={!recLista.length}
                  style={{padding:'5px 10px',borderRadius:6,fontSize:11,border:'1px solid var(--border)',background:'rgba(255,255,255,0.04)',color:'var(--gold)',cursor:recLista.length?'pointer':'not-allowed',opacity:recLista.length?1:0.4,fontWeight:600}}
                  title="Exportar relatório de comissões (respeita filtro de vendedor e período)">
                  📥 Exportar relatório ({recLista.length})
                </button>
              </div>
            </div>
            {loading?<div style={{color:'var(--text-muted)'}}>Carregando...</div>:(
            <table style={{width:'100%',borderCollapse:'collapse'}}>
              <thead><tr>{['Cliente','Apólice','Vendedor','Produto','Seguradora','Competência','Recebido em','Parcela','Valor'].map(h=><th key={h} style={th}>{h}</th>)}</tr></thead>
              <tbody>
                {recLista.map((r:any)=>(
                  <tr key={r.id} onClick={()=>r.cliente_id && router.push(`/dashboard/clientes/${r.cliente_id}`)} style={{cursor:r.cliente_id?'pointer':'default'}} onMouseEnter={e=>e.currentTarget.style.background='rgba(201,168,76,0.03)'} onMouseLeave={e=>e.currentTarget.style.background=''}>
                    <td style={td0}>
                      <div style={{fontWeight:500}}>{r.clientes?.nome||'—'}</div>
                      {r.obs && <div style={{fontSize:11,color:'var(--text-muted)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:280}}>{r.obs}</div>}
                    </td>
                    <td style={{...td0,fontSize:12,fontFamily:'monospace'}}>{r.apolices?.numero||'—'}</td>
                    <td style={{...td0,fontSize:12}}>{r.users?.nome||'—'}</td>
                    <td style={{...td0,fontSize:12}}>{r.produto||'—'}</td>
                    <td style={{...td0,fontSize:12,color:'var(--text-muted)'}}>{r.seguradora||'—'}</td>
                    <td style={{...td0,fontSize:12}}>{r.competencia||'—'}</td>
                    <td style={{...td0,fontSize:12,color:'var(--text-muted)'}}>{r.data_recebimento?new Date(r.data_recebimento).toLocaleDateString('pt-BR'):'—'}</td>
                    <td style={{...td0,fontSize:12,textAlign:'center'}}>{r.parcela||1}/{r.total_parcelas||1}</td>
                    <td style={td0}><div style={{color:'var(--teal)',fontWeight:700,fontSize:14}}>R$ {Number(r.valor||0).toLocaleString('pt-BR',{minimumFractionDigits:2})}</div></td>
                  </tr>
                ))}
              </tbody>
              {recLista.length>0 && <tfoot><tr style={{background:'rgba(255,255,255,0.03)'}}>
                <td colSpan={8} style={{padding:'12px 0',fontWeight:700,fontSize:13}}>TOTAL</td>
                <td style={{padding:'12px 0',color:'var(--teal)',fontWeight:700,fontSize:15,fontFamily:'DM Serif Display,serif'}}>R$ {fmtFull(recTotal)}</td>
              </tr></tfoot>}
            </table>)}
            {recLista.length===0&&!loading&&(
              <div style={{padding:30,textAlign:'center',color:'var(--text-muted)'}}>
                Nenhuma comissão recebida neste período.
                {profile?.role==='admin' && <div style={{marginTop:8,fontSize:12}}>Lance pela tela de <b>Apólices</b> → botão <b>💵 Comissão</b>.</div>}
              </div>
            )}
          </div>
        </>}

        {/* ═══ EXTRATO (previsto) ═══ */}
        {abaAtiva==='extrato'&&<>
          <div style={{display:'flex',gap:10,marginBottom:24,alignItems:'center',flexWrap:'wrap'}}>
            <select style={{...sel,width:'auto'}} value={anoSel} onChange={e=>setAnoSel(Number(e.target.value))}>{[anoAtual-1,anoAtual,anoAtual+1].map(a=><option key={a}>{a}</option>)}</select>
            {!vistaAno&&<select style={{...sel,width:'auto'}} value={mesSel} onChange={e=>setMesSel(Number(e.target.value))}>{MESES.map((m,i)=><option key={i} value={i}>{m}</option>)}</select>}
            <button onClick={()=>setVistaAno(!vistaAno)} style={{padding:'7px 16px',borderRadius:8,fontSize:12,cursor:'pointer',border:'1px solid var(--border)',fontFamily:'DM Sans,sans-serif',background:vistaAno?'rgba(201,168,76,0.12)':'rgba(255,255,255,0.04)',color:vistaAno?'var(--gold)':'var(--text-muted)',borderColor:vistaAno?'var(--gold)':'var(--border)'}}>{vistaAno?'📅 Ver por mês':'📆 Ver ano'}</button>
          </div>

          <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:20,marginBottom:24}}>
            {[
              {label:'Comissão '+(vistaAno?anoSel:MESES[mesSel]), val:'R$ '+fmtFull(comissaoLista), tone:'success' as const},
              {label:'Prêmio Base',     val:'R$ '+fmtFull(premioLista),         tone:'warning' as const},
              {label:'Média Comissão',  val:mediaComissao.toFixed(1)+'%',       tone:'info'    as const},
              {label:'Negócios',        val:lista.length,                       tone:'danger'  as const},
            ].map(({label,val,tone})=>(
              <div key={label} className={`kpi kpi-${tone} fade-up`}>
                <div className="kpi-label">{label}</div>
                <div className={`kpi-value ${tone === 'success' ? 'kpi-value-success' : tone === 'warning' ? 'kpi-value-warning' : tone === 'danger' ? 'kpi-value-danger' : ''}`}>{val}</div>
              </div>
            ))}
          </div>

          <div style={{display:'grid',gridTemplateColumns:'2fr 1fr',gap:16,marginBottom:16}}>
            <div className="card">
              <div style={{fontFamily:'DM Serif Display,serif',fontSize:15,marginBottom:20}}>Comissão Mensal — {anoSel}</div>
              <div style={{display:'flex',alignItems:'flex-end',gap:5,height:100}}>
                {porMes.map(({mes,com})=>(
                  <div key={mes} onClick={()=>{setVistaAno(false);setMesSel(mes)}} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:4,cursor:'pointer'}}>
                    <div style={{fontSize:9,color:com>0?'var(--teal)':'transparent',fontWeight:600}}>{com>0?'R$'+Math.round(com/1000)+'k':''}</div>
                    <div style={{width:'100%',borderRadius:'4px 4px 0 0',transition:'height 0.6s ease',background:mes===mesSel&&!vistaAno?'var(--teal)':'rgba(28,181,160,0.3)',height:com>0?Math.max(6,com/maxComMes*80)+'px':'4px'}}/>
                    <div style={{fontSize:9,color:mes===mesSel&&!vistaAno?'var(--teal)':'var(--text-muted)',fontWeight:mes===mesSel?600:400}}>{'JFMAMJJASOND'[mes]}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="card">
              <div style={{fontFamily:'DM Serif Display,serif',fontSize:15,marginBottom:14}}>Por Seguradora</div>
              {topSeg.slice(0,6).map(([seg,info]:any)=>(
                <div key={seg} style={{marginBottom:10}}>
                  <div style={{display:'flex',justifyContent:'space-between',marginBottom:3}}>
                    <span style={{fontSize:12,color:'var(--text-muted)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:'60%'}}>{seg}</span>
                    <span style={{fontSize:12,fontWeight:600,color:'var(--teal)'}}>R$ {Math.round(info.com).toLocaleString('pt-BR')}</span>
                  </div>
                  <div style={{background:'rgba(255,255,255,0.05)',borderRadius:4,height:6,overflow:'hidden'}}>
                    <div style={{height:'100%',borderRadius:4,background:'var(--teal)',width:(info.com/(topSeg[0][1] as any).com*100)+'%'}}/>
                  </div>
                </div>
              ))}
              {topSeg.length===0&&<div style={{color:'var(--text-muted)',fontSize:13}}>Sem dados</div>}
            </div>
          </div>

          <div className="card">
            <div style={{fontFamily:'DM Serif Display,serif',fontSize:15,marginBottom:16}}>Detalhamento — {vistaAno?anoSel:`${MESES[mesSel]} ${anoSel}`}</div>
            {loading?<div style={{color:'var(--text-muted)'}}>Carregando...</div>:(
            <table style={{width:'100%',borderCollapse:'collapse'}}>
              <thead><tr>{['Cliente','Funil','Produto','Seguradora','Prêmio/ano','% Com.','Comissão','Data',''].map(h=><th key={h} style={th}>{h}</th>)}</tr></thead>
              <tbody>
                {lista.map((n:any)=>{const com=n.premio*n.comissao_pct/100;return(
                  <tr key={n.id} onClick={()=>router.push(`/dashboard/clientes/${n.clientes?.id}`)} style={{cursor:'pointer'}} onMouseEnter={e=>e.currentTarget.style.background='rgba(201,168,76,0.03)'} onMouseLeave={e=>e.currentTarget.style.background=''}>
                    <td style={td0}><div style={{fontWeight:500}}>{n.clientes?.nome}</div><div style={{fontSize:11,color:'var(--text-muted)'}}>{n.clientes?.tipo}</div></td>
                    <td style={td0}><span style={{fontSize:10,fontWeight:600,borderRadius:10,padding:'2px 8px',background:'rgba(28,181,160,0.1)',color:'var(--teal)'}}>{n.funis?.emoji} {n.funis?.nome}</span></td>
                    <td style={{...td0,fontSize:12}}>{n.produto}</td>
                    <td style={{...td0,fontSize:12,color:'var(--text-muted)'}}>{n.seguradora}</td>
                    <td style={{...td0,color:'var(--gold)',fontWeight:600}}>R$ {(n.premio||0).toLocaleString('pt-BR')}</td>
                    <td style={{...td0,fontSize:13,textAlign:'center'}}>{n.comissao_pct}%</td>
                    <td style={td0}><div style={{color:'var(--teal)',fontWeight:700,fontSize:14}}>R$ {Math.round(com).toLocaleString('pt-BR')}</div></td>
                    <td style={{...td0,fontSize:12,color:'var(--text-muted)'}}>{new Date(n.created_at).toLocaleDateString('pt-BR')}</td>
                    <td style={{...td0,fontSize:12,color:'var(--gold)'}}>→</td>
                  </tr>
                )})}
              </tbody>
              {lista.length>0&&<tfoot><tr style={{background:'rgba(255,255,255,0.03)'}}>
                <td colSpan={4} style={{padding:'12px 0',fontWeight:700,fontSize:13}}>TOTAL</td>
                <td style={{padding:'12px 0',color:'var(--gold)',fontWeight:700}}>R$ {premioLista.toLocaleString('pt-BR')}</td>
                <td style={{padding:'12px 0',fontSize:13}}>{mediaComissao.toFixed(1)}%</td>
                <td style={{padding:'12px 0',color:'var(--teal)',fontWeight:700,fontSize:15,fontFamily:'DM Serif Display,serif'}}>R$ {Math.round(comissaoLista).toLocaleString('pt-BR')}</td>
                <td colSpan={2}/>
              </tr></tfoot>}
            </table>)}
            {lista.length===0&&!loading&&<div style={{padding:30,textAlign:'center',color:'var(--text-muted)'}}>Nenhuma comissão neste período.</div>}
          </div>
        </>}

        {/* ═══ IMPORTAR EXCEL ═══ */}
        {abaAtiva==='importar'&&<div style={{maxWidth:760,margin:'0 auto'}}>

          {/* Upload */}
          {importStep==='upload'&&<div className="card">
            <div style={{fontFamily:'DM Serif Display,serif',fontSize:18,color:'var(--gold)',marginBottom:6}}>Importar relatório de comissões</div>
            <div style={{fontSize:13,color:'var(--text-muted)',marginBottom:24}}>Compatível com Porto Seguro, Allianz, Bradesco, Amil, Qualicorp e outros. Formatos: <strong style={{color:'var(--text)'}}>.xlsx · .xls</strong></div>

            <div style={{marginBottom:20}}>
              <label style={{display:'block',fontSize:11,fontWeight:600,letterSpacing:'1px',textTransform:'uppercase',color:'var(--text-muted)',marginBottom:6}}>Competência</label>
              <input type="month" value={competencia} onChange={e=>setCompetencia(e.target.value)} style={{background:'rgba(255,255,255,0.05)',border:'1px solid var(--border)',borderRadius:8,padding:'9px 14px',color:'var(--text)',fontSize:13,fontFamily:'DM Sans,sans-serif',outline:'none'}}/>
            </div>

            <div onDragOver={e=>{e.preventDefault();setDrag(true)}} onDragLeave={()=>setDrag(false)}
              onDrop={e=>{e.preventDefault();setDrag(false);const f=e.dataTransfer.files[0];if(f)handleExcelFile(f)}}
              onClick={()=>inputRef.current?.click()}
              style={{border:`2px dashed ${drag?'var(--gold)':'rgba(201,168,76,0.3)'}`,borderRadius:14,padding:'48px 24px',textAlign:'center',cursor:'pointer',background:drag?'rgba(201,168,76,0.06)':'rgba(255,255,255,0.02)',transition:'all 0.2s'}}>
              <input ref={inputRef} type="file" accept=".xlsx,.xls" style={{display:'none'}} onChange={e=>{const f=e.target.files?.[0];if(f)handleExcelFile(f)}}/>
              <div style={{fontSize:48,marginBottom:12}}>📊</div>
              <div style={{fontSize:15,fontWeight:500,color:'var(--text)',marginBottom:6}}>Clique ou arraste o arquivo Excel</div>
              <div style={{fontSize:12,color:'var(--text-muted)'}}>.xlsx ou .xls · sem limite de linhas</div>
            </div>

            <div style={{marginTop:20,background:'rgba(74,128,240,0.07)',border:'1px solid rgba(74,128,240,0.2)',borderRadius:10,padding:'14px 18px'}}>
              <div style={{fontSize:12,fontWeight:600,color:'#7aa3f8',marginBottom:8}}>💡 Como exportar da sua seguradora</div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,fontSize:12,color:'var(--text-muted)'}}>
                <span>📌 <strong style={{color:'var(--text)'}}>Porto Seguro:</strong> Portal → Comissões → Exportar</span>
                <span>📌 <strong style={{color:'var(--text)'}}>Allianz:</strong> Extranet → Relatório de comissões</span>
                <span>📌 <strong style={{color:'var(--text)'}}>Bradesco:</strong> BradescoSeguros.com → Demonstrativo</span>
                <span>📌 <strong style={{color:'var(--text)'}}>Qualquer seguradora:</strong> aceita qualquer .xlsx</span>
              </div>
            </div>

            {importacoes.length>0&&<div style={{marginTop:24}}>
              <div style={{fontSize:11,fontWeight:600,color:'var(--text-muted)',marginBottom:10,textTransform:'uppercase',letterSpacing:'1px'}}>Importações anteriores</div>
              {importacoes.map(imp=>(
                <div key={imp.id} style={{display:'flex',alignItems:'center',gap:12,padding:'10px 14px',background:'rgba(255,255,255,0.03)',border:'1px solid var(--border)',borderRadius:8,marginBottom:6}}>
                  <span style={{fontSize:20}}>📊</span>
                  <div style={{flex:1}}>
                    <div style={{fontSize:13,fontWeight:500}}>{imp.nome_arquivo}</div>
                    <div style={{fontSize:11,color:'var(--text-muted)'}}>{imp.qtd_registros} registros · R$ {(imp.total_importado||0).toLocaleString('pt-BR',{minimumFractionDigits:2})} · {imp.competencia}</div>
                  </div>
                  <span style={{fontSize:11,color:'var(--text-muted)'}}>{new Date(imp.created_at).toLocaleDateString('pt-BR')}</span>
                </div>
              ))}
            </div>}
          </div>}

          {/* Mapear colunas */}
          {importStep==='mapear'&&<div className="card">
            <div style={{fontFamily:'DM Serif Display,serif',fontSize:16,marginBottom:4}}>Mapeamento de colunas</div>
            <div style={{fontSize:12,color:'var(--text-muted)',marginBottom:18}}>Arquivo: <strong style={{color:'var(--text)'}}>{nomeArquivo}</strong> · {excelData.rows.length} linhas</div>
            <table style={{width:'100%',borderCollapse:'collapse'}}>
              <thead><tr>{['Campo do CM Seguros','Coluna do arquivo','Amostra'].map(h=><th key={h} style={th}>{h}</th>)}</tr></thead>
              <tbody>
                {mapeamento.map((m,i)=>{
                  const amostra=m.coluna?excelData.rows.slice(0,2).map((r:any)=>r[m.coluna]).filter(Boolean).join(' / ')||'—':'—'
                  return(<tr key={m.campo}>
                    <td style={{...td0,fontWeight:500,fontSize:13}}>{m.label}</td>
                    <td style={{...td0,paddingRight:16}}>
                      <select style={sel} value={m.coluna} onChange={e=>{const up=[...mapeamento];up[i]={...up[i],coluna:e.target.value};setMapeamento(up)}}>
                        <option value="">— ignorar —</option>
                        {excelData.headers.map(h=><option key={h} value={h}>{h}</option>)}
                      </select>
                    </td>
                    <td style={{...td0,fontSize:11,color:'var(--text-muted)',maxWidth:160,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{amostra}</td>
                  </tr>)
                })}
              </tbody>
            </table>
            <div style={{display:'flex',gap:10,justifyContent:'flex-end',marginTop:20}}>
              <button className="btn-secondary" onClick={()=>setImportStep('upload')}>← Voltar</button>
              <button className="btn-primary" onClick={()=>setImportStep('preview')}>Ver Preview →</button>
            </div>
          </div>}

          {/* Preview */}
          {importStep==='preview'&&<div className="card">
            <div style={{fontFamily:'DM Serif Display,serif',fontSize:16,marginBottom:4}}>Preview dos dados</div>
            <div style={{fontSize:12,color:'var(--text-muted)',marginBottom:18}}>{excelData.rows.length} registros · Competência: <strong style={{color:'var(--text)'}}>{competencia}</strong></div>
            <div style={{overflowX:'auto',maxHeight:320,overflowY:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse',minWidth:600}}>
                <thead><tr>{mapeamento.filter(m=>m.coluna).map(m=><th key={m.campo} style={{...th,whiteSpace:'nowrap',paddingRight:12}}>{m.label}</th>)}</tr></thead>
                <tbody>
                  {excelData.rows.slice(0,8).map((row,ri)=>(
                    <tr key={ri}>{mapeamento.filter(m=>m.coluna).map(m=>(
                      <td key={m.campo} style={{...td0,fontSize:12,maxWidth:160,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',paddingRight:12,color:m.campo==='comissao'||m.campo==='pct'?'var(--teal)':m.campo==='premio'?'var(--gold)':'var(--text)'}}>
                        {String(row[m.coluna]??'—')}
                      </td>
                    ))}</tr>
                  ))}
                </tbody>
              </table>
            </div>
            {excelData.rows.length>8&&<div style={{fontSize:12,color:'var(--text-muted)',marginTop:8}}>...e mais {excelData.rows.length-8} linhas</div>}
            <div style={{display:'flex',gap:10,justifyContent:'flex-end',marginTop:20}}>
              <button className="btn-secondary" onClick={()=>setImportStep('mapear')}>← Voltar</button>
              <button className="btn-primary" onClick={confirmarImportacao} disabled={importing}>{importing?'⏳ Importando...':'✅ Confirmar Importação'}</button>
            </div>
          </div>}

          {/* Sucesso */}
          {importStep==='sucesso'&&<div className="card" style={{textAlign:'center',padding:'60px 40px'}}>
            <div style={{fontSize:56,marginBottom:16}}>🎉</div>
            <div style={{fontFamily:'DM Serif Display,serif',fontSize:24,color:'var(--teal)',marginBottom:8}}>Importação concluída!</div>
            <div style={{fontSize:14,color:'var(--text-muted)',marginBottom:28}}>{excelData.rows.length} registros · Competência: {competencia}</div>
            <div style={{display:'flex',gap:12,justifyContent:'center'}}>
              <button className="btn-secondary" onClick={()=>{setImportStep('upload');setExcelData({headers:[],rows:[]});setMapeamento([])}}>Importar outro arquivo</button>
              <button className="btn-primary" onClick={()=>setAbaAtiva('extrato')}>Ver extrato →</button>
            </div>
          </div>}

        </div>}
      </div>
    </div>
  )
}

function fmtFull(n:number){return n.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}
