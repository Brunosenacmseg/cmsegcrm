'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { exportarXLSX, fmt } from '@/lib/export-xlsx'

export default function ApolicesPage() {
  const supabase = createClient()
  const router   = useRouter()
  const [negocios, setNegocios]   = useState<any[]>([])
  const [usuarios, setUsuarios]   = useState<any[]>([])
  const [vendedoresLegado, setVendedoresLegado] = useState<any[]>([])
  const [seguradorasCad, setSeguradorasCad] = useState<string[]>([])
  const [profile, setProfile]     = useState<any>(null)
  const [loading, setLoading]     = useState(true)
  const [busca, setBusca]         = useState('')
  const [filtroRamo, setFiltroRamo] = useState('todos')
  const [filtroSeg, setFiltroSeg]   = useState('todos')
  const [filtroVendedor, setFiltroVendedor] = useState('todos')
  const [editandoVendedor, setEditandoVendedor] = useState<string|null>(null)

  // Modal "editar detalhes" (todos os campos da apólice)
  const [detModal, setDetModal] = useState<any|null>(null)
  const [detForm,  setDetForm]  = useState<any>({})
  const [detSalvando, setDetSalvando] = useState(false)
  const [novoMode, setNovoMode] = useState(false)
  const [novoClienteBusca, setNovoClienteBusca] = useState('')
  const [novoClienteRes, setNovoClienteRes] = useState<any[]>([])
  const [novoClienteSel, setNovoClienteSel] = useState<any>(null)

  // Importação/Exportação HDI
  const pdfInputRef = (typeof window !== 'undefined') ? (globalThis as any).__hdiPdfRef ||= { current: null as HTMLInputElement | null } : { current: null }
  const [hdiPdfTarget, setHdiPdfTarget] = useState<any|null>(null)   // negócio alvo do upload de PDF
  const [hdiBusy, setHdiBusy] = useState<string|null>(null)          // id do negócio em operação

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

    // Fonte da verdade: tabela apolices. Trazemos junto cliente, vendedor
    // do user e dados do negócio espelho (etapa/vendedor legado quando
    // existir) para preservar a UI atual.
    // Fonte da verdade: tabela apolices. Sem joins aninhados pra evitar
    // conflitos de FK no PostgREST — vendedor_legado é resolvido em JS
    // via lookup no array `vleg`.
    // Carrega apólices em páginas de 1000 (limite default do PostgREST)
    // — evita perder linhas quando a base passa de 1k registros.
    async function carregarTodas(): Promise<any[]> {
      const PAGE = 1000
      let offset = 0
      const acc: any[] = []
      while (true) {
        let q = supabase
          .from('apolices')
          .select('*, clientes(id,nome,tipo), users(id,nome)')
          .order('vigencia_fim', { ascending: true, nullsFirst: false })
          .range(offset, offset + PAGE - 1)
        if (visibleIds) q = (q as any).in('vendedor_id', visibleIds)
        const { data, error } = await q
        if (error) {
          console.error('Erro ao carregar apólices:', error)
          alert('Erro ao carregar apólices: ' + error.message)
          break
        }
        if (!data || data.length === 0) break
        acc.push(...data)
        if (data.length < PAGE) break
        offset += PAGE
        if (offset >= 100_000) break
      }
      return acc
    }

    const [apoList, { data: usr }, { data: vleg }, { data: segs }] = await Promise.all([
      carregarTodas(),
      supabase.from('users').select('id, nome').order('nome'),
      supabase.from('vendedores_legado').select('id, nome').eq('ativo', true).order('nome'),
      supabase.from('seguradoras').select('nome').eq('ativo', true).order('nome'),
    ])
    console.log(`[apolices] carregadas ${apoList.length} apólices (role=${prof?.role})`)
    const items = apoList.map((a:any) => ({
      ...a,
      vencimento: a.vigencia_fim,
      etapa:      a.status || 'ativo',
    }))
    setNegocios(items)
    setUsuarios(usr || [])
    setVendedoresLegado(vleg || [])
    setSeguradorasCad((segs || []).map((s:any)=>s.nome))
    setLoading(false)
  }

  async function salvarVendedor(apoliceId: string, valor: string) {
    // valor pode ser '', 'user:<uuid>' ou 'legado:<uuid>'
    // apolices só tem vendedor_id (FK→users). vendedor_legado mora no
    // negócio espelho — atualiza ambos quando existir.
    const apo = negocios.find((x:any) => x.id === apoliceId)
    const userId  = valor.startsWith('user:')   ? valor.slice(5)  : null
    const legadoId = valor.startsWith('legado:') ? valor.slice(7) : null
    await supabase.from('apolices').update({ vendedor_id: userId }).eq('id', apoliceId)
    if (apo?.negocio_id) {
      await supabase.from('negocios').update({ vendedor_id: userId, vendedor_legado_id: legadoId }).eq('id', apo.negocio_id)
    }
    setEditandoVendedor(null)
    carregar()
  }

  function abrirNovaApolice() {
    setNovoMode(true)
    setNovoClienteSel(null)
    setNovoClienteBusca('')
    setNovoClienteRes([])
    setDetForm({
      numero:'', produto:'', seguradora:'', premio:'', comissao_pct:'',
      vigencia_ini:'', vigencia_fim:'', status:'ativo',
    })
    setDetModal({ id:'novo', clientes:null, produto:'', seguradora:'' })
  }

  async function buscarClienteNovo(q: string) {
    setNovoClienteBusca(q)
    if (q.length < 2) { setNovoClienteRes([]); return }
    const { data } = await supabase.from('clientes')
      .select('id, nome, cpf_cnpj, telefone, tipo')
      .or(`nome.ilike.%${q}%,cpf_cnpj.ilike.%${q}%`)
      .limit(8)
    setNovoClienteRes(data || [])
  }

  async function abrirDetalhes(apo: any) {
    // Já temos o registro completo da apólice (a query principal traz *)
    // — abrimos direto sem novo round-trip.
    setDetForm({ ...apo })
    setDetModal(apo)
  }

  async function salvarDetalhes() {
    if (!detModal) return
    if (novoMode && !novoClienteSel) { alert('Selecione um cliente para a nova apólice.'); return }
    setDetSalvando(true)

    let negocioId = detModal.id as string | null
    let clienteId: string | null = detModal.clientes?.id || null

    if (novoMode) {
      clienteId = novoClienteSel.id
      const { data:{ user } } = await supabase.auth.getUser()
      const premioNum = detForm.premio === '' || detForm.premio == null ? null
        : Number(String(detForm.premio).replace(',','.'))
      const comPctNum = detForm.comissao_pct === '' || detForm.comissao_pct == null ? null
        : Number(String(detForm.comissao_pct).replace(',','.'))
      const tituloNeg = `${novoClienteSel.nome}${detForm.produto?` — ${detForm.produto}`:''}`
      const { data: negIns, error: errNeg } = await supabase.from('negocios').insert({
        titulo:       tituloNeg,
        cliente_id:   clienteId,
        vendedor_id:  user?.id || null,
        produto:      detForm.produto || null,
        seguradora:   detForm.seguradora || null,
        numero:       detForm.numero || null,
        premio:       premioNum,
        comissao_pct: comPctNum,
        vencimento:   detForm.vigencia_fim || null,
        cpf_cnpj:     novoClienteSel.cpf_cnpj || null,
        etapa:        'ativo',
        status:       'em_andamento',
      }).select('id').single()
      if (errNeg || !negIns) { setDetSalvando(false); alert('Erro ao criar negócio: ' + (errNeg?.message||'')); return }
      negocioId = negIns.id
    }

    const payload: any = { ...detForm, negocio_id: negocioId, cliente_id: clienteId }
    ;['vigencia_ini','vigencia_fim','emissao','data_controle'].forEach(k => { if (payload[k] === '') payload[k] = null })
    ;['premio','premio_liquido','comissao_pct','repasse_vendedor_pct','qtd_parcelas','valor_iof'].forEach(k => {
      if (payload[k] === '' || payload[k] === undefined) payload[k] = null
      else if (payload[k] !== null) payload[k] = Number(String(payload[k]).replace(',','.'))
    })
    const { error } = payload.id
      ? await supabase.from('apolices').update(payload).eq('id', payload.id)
      : await supabase.from('apolices').insert(payload)
    setDetSalvando(false)
    if (error) { alert('Erro ao salvar: ' + error.message); return }
    setDetModal(null)
    setNovoMode(false)
    setNovoClienteSel(null)
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
      negocio_id:       comModal.negocio_id || null,
      apolice_id:       comModal.id,
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

  async function exportarHDI(neg: any) {
    // A linha já é a apólice (id = apolice.id)
    setHdiBusy(neg.id)
    try {
      const susep = neg.susep_corretor || prompt('Informe o código SUSEP do corretor (9 dígitos):') || ''
      if (!susep) return
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`/api/integracoes/hdi/export?ids=${neg.id}&susep=${encodeURIComponent(susep)}`, {
        headers: { Authorization: `Bearer ${session?.access_token}` }
      })
      if (!res.ok) { alert('Erro: '+(await res.text())); return }
      const blob = await res.blob()
      const cd = res.headers.get('Content-Disposition') || ''
      const m = cd.match(/filename="([^"]+)"/)
      const filename = m?.[1] || `C${susep.replace(/\D/g,'').padStart(9,'0').slice(-9)}.txt`
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = filename; a.click()
      URL.revokeObjectURL(url)
    } finally { setHdiBusy(null) }
  }

  async function importarPDF(neg: any, file: File) {
    // A linha já é a apólice — anexa direto ao apolice_id
    setHdiBusy(neg.id)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('apolice_id', neg.id)
      if (neg.numero) fd.append('numero', neg.numero)
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/integracoes/hdi/import-pdf', {
        method: 'POST', body: fd,
        headers: { Authorization: `Bearer ${session?.access_token}` }
      })
      const j = await res.json()
      if (!res.ok) { alert('Erro: '+(j.erro||res.statusText)); return }
      alert('PDF anexado à apólice com sucesso.')
      carregar()
    } finally { setHdiBusy(null); setHdiPdfTarget(null) }
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
        <button onClick={()=>exportarXLSX(filtrados, [
          { campo:'numero_apolice', titulo:'Apólice' },
          { campo:'clientes',       titulo:'Cliente',     fmt:(v:any)=>v?.nome || '' },
          { campo:'cpf_cnpj',       titulo:'CPF/CNPJ' },
          { campo:'produto',        titulo:'Produto' },
          { campo:'seguradora',     titulo:'Seguradora' },
          { campo:'placa',          titulo:'Placa' },
          { campo:'premio',         titulo:'Prêmio (R$)', fmt:fmt.brl },
          { campo:'comissao_pct',   titulo:'Comissão %' },
          { campo:'vigencia_ini',   titulo:'Vigência ini', fmt:fmt.data },
          { campo:'vencimento',     titulo:'Vencimento',   fmt:fmt.data },
          { campo:'status',         titulo:'Status' },
          { campo:'users',          titulo:'Vendedor',    fmt:(v:any)=>v?.nome || '' },
        ], 'apolices')}
          style={{padding:'7px 12px',borderRadius:8,fontSize:13,border:'1px solid var(--border)',background:'rgba(255,255,255,0.04)',color:'var(--text-muted)',cursor:'pointer',whiteSpace:'nowrap'}}
          title="Exportar lista atual em Excel">
          📥 Exportar ({filtrados.length})
        </button>
        <button className="btn-primary" onClick={abrirNovaApolice} style={{padding:'7px 14px',fontSize:13}}>
          + Nova apólice
        </button>
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
                      <td style={{padding:'10px 0',borderBottom:'1px solid rgba(255,255,255,0.04)',display:'flex',gap:6}}>
                        <button onClick={()=>abrirDetalhes(n)}
                          title="Editar todos os campos da apólice"
                          style={{fontSize:11,fontWeight:600,padding:'4px 10px',borderRadius:6,border:'1px solid rgba(201,168,76,0.4)',background:'rgba(201,168,76,0.10)',color:'var(--gold)',cursor:'pointer',fontFamily:'DM Sans,sans-serif',whiteSpace:'nowrap'}}>
                          📝 Detalhes
                        </button>
                        <button onClick={()=>{ setHdiPdfTarget(n); setTimeout(()=>pdfInputRef.current?.click(),0) }}
                          title="Anexar PDF da apólice (sincroniza com o registro)"
                          disabled={hdiBusy===n.id}
                          style={{fontSize:11,fontWeight:600,padding:'4px 10px',borderRadius:6,border:'1px solid rgba(120,140,200,0.4)',background:'rgba(120,140,200,0.10)',color:'#5b6cb0',cursor:hdiBusy===n.id?'wait':'pointer',fontFamily:'DM Sans,sans-serif',whiteSpace:'nowrap'}}>
                          📎 PDF
                        </button>
                        <button onClick={()=>exportarHDI(n)}
                          title="Exportar arquivo HDI (.txt)"
                          disabled={hdiBusy===n.id}
                          style={{fontSize:11,fontWeight:600,padding:'4px 10px',borderRadius:6,border:'1px solid rgba(180,120,60,0.4)',background:'rgba(180,120,60,0.10)',color:'#a86a2a',cursor:hdiBusy===n.id?'wait':'pointer',fontFamily:'DM Sans,sans-serif',whiteSpace:'nowrap'}}>
                          📤 HDI
                        </button>
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

      {/* Input oculto para upload de PDF (HDI) */}
      <input ref={(el)=>{pdfInputRef.current=el}} type="file" accept=".pdf,application/pdf" style={{display:'none'}}
        onChange={e=>{ const f=e.target.files?.[0]; if(f && hdiPdfTarget) importarPDF(hdiPdfTarget,f); e.currentTarget.value='' }} />

      {/* Modal Editar Detalhes da Apólice */}
      {detModal && (
        <div style={{position:'fixed',inset:0,background:'rgba(15,23,42,0.55)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',backdropFilter:'blur(6px)'}}
          onClick={e=>e.target===e.currentTarget&&(setDetModal(null),setNovoMode(false))}>
          <div style={{background:'#ffffff',border:'1px solid var(--border)',borderRadius:20,padding:'24px 28px',width:920,maxWidth:'96vw',maxHeight:'92vh',overflow:'auto'}}>
            <div style={{fontFamily:'DM Serif Display,serif',fontSize:18,marginBottom:4}}>
              {novoMode ? '➕ Nova apólice' : '📝 Detalhes da apólice'}
            </div>
            <div style={{fontSize:12,color:'var(--text-muted)',marginBottom:16}}>
              {novoMode
                ? (novoClienteSel ? `${novoClienteSel.nome}${novoClienteSel.cpf_cnpj?` · ${novoClienteSel.cpf_cnpj}`:''}` : 'Selecione o cliente abaixo')
                : `${detModal.clientes?.nome||''} · ${detModal.produto||'—'} · ${detModal.seguradora||'—'}`}
            </div>

            {novoMode && (
              <div style={{marginBottom:16,padding:'12px 14px',background:'rgba(201,168,76,0.06)',border:'1px solid rgba(201,168,76,0.25)',borderRadius:10}}>
                <label style={{fontSize:10,color:'var(--text-muted)',display:'block',marginBottom:6,textTransform:'uppercase',letterSpacing:'1px',fontWeight:600}}>Cliente *</label>
                {novoClienteSel ? (
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                    <div>
                      <div style={{fontSize:14,fontWeight:500}}>{novoClienteSel.nome}</div>
                      <div style={{fontSize:11,color:'var(--text-muted)'}}>{novoClienteSel.cpf_cnpj} {novoClienteSel.telefone&&`· ${novoClienteSel.telefone}`}</div>
                    </div>
                    <button onClick={()=>{setNovoClienteSel(null);setNovoClienteBusca('')}} style={{fontSize:11,padding:'4px 10px',borderRadius:6,border:'1px solid var(--border)',background:'transparent',color:'var(--text-muted)',cursor:'pointer'}}>Trocar</button>
                  </div>
                ) : (
                  <>
                    <input value={novoClienteBusca} onChange={e=>buscarClienteNovo(e.target.value)} placeholder="Buscar por nome ou CPF/CNPJ..."
                      style={inputStyle} autoFocus />
                    {novoClienteRes.length>0 && (
                      <div style={{marginTop:8,maxHeight:180,overflow:'auto',border:'1px solid var(--border)',borderRadius:8}}>
                        {novoClienteRes.map((c:any)=>(
                          <div key={c.id} onClick={()=>{setNovoClienteSel(c);setNovoClienteRes([])}}
                            style={{padding:'8px 12px',fontSize:13,cursor:'pointer',borderBottom:'1px solid rgba(0,0,0,0.05)'}}
                            onMouseEnter={e=>e.currentTarget.style.background='rgba(201,168,76,0.08)'}
                            onMouseLeave={e=>e.currentTarget.style.background=''}>
                            <div style={{fontWeight:500}}>{c.nome}</div>
                            <div style={{fontSize:11,color:'var(--text-muted)'}}>{c.cpf_cnpj||'sem documento'} {c.telefone&&`· ${c.telefone}`}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {(() => {
              const F = (label:string, key:string, type:string='text', opts?:{options?:string[],span?:number}) => (
                <div style={{gridColumn:`span ${opts?.span||1}`}}>
                  <label style={{fontSize:10,color:'var(--text-muted)',display:'block',marginBottom:3,textTransform:'uppercase',letterSpacing:'1px',fontWeight:600}}>{label}</label>
                  {type==='select' ? (
                    <select value={detForm[key]??''} onChange={e=>setDetForm((f:any)=>({...f,[key]:e.target.value||null}))}
                      style={inputStyle}>
                      <option value="">—</option>
                      {opts?.options?.map(o=><option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : type==='checkbox' ? (
                    <label style={{display:'flex',alignItems:'center',gap:8,fontSize:13,color:'var(--text)',padding:'8px 0'}}>
                      <input type="checkbox" checked={!!detForm[key]} onChange={e=>setDetForm((f:any)=>({...f,[key]:e.target.checked}))} />
                      {detForm[key]?'Sim':'Não'}
                    </label>
                  ) : type==='textarea' ? (
                    <textarea value={detForm[key]??''} onChange={e=>setDetForm((f:any)=>({...f,[key]:e.target.value}))}
                      rows={2} style={{...inputStyle,resize:'none',fontFamily:'DM Sans,sans-serif'}} />
                  ) : (
                    <input type={type} value={detForm[key]??''} onChange={e=>setDetForm((f:any)=>({...f,[key]:e.target.value}))}
                      style={inputStyle} />
                  )}
                </div>
              )
              return (
                <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12}}>
                  {F('Apólice (nº)','numero')}
                  {F('Proposta','proposta')}
                  {F('Endosso','endosso')}
                  {F('Proposta endosso','proposta_endosso')}

                  {F('Tipo documento','tipo_documento','select',{options:['CPF','CNPJ','RG','Outro']})}
                  {F('Documento do cliente','cpf_cnpj_segurado')}
                  {F('Tipo pessoa','tipo_documento','select',{options:['PF','PJ']})}
                  {F('Estipulante','estipulante')}

                  {F('Ramo','ramo')}
                  {F('Produto','produto')}
                  {F('Seguradora','seguradora','select',{options:seguradorasCad})}
                  {F('Item','item')}

                  {F('Vigência inicial','vigencia_ini','date')}
                  {F('Vigência final','vigencia_fim','date')}
                  {F('Emissão','emissao','date')}
                  {F('Data controle','data_controle','date')}

                  {F('Prêmio total (R$)','premio','number')}
                  {F('Prêmio líquido (R$)','premio_liquido','number')}
                  {F('Comissão (%)','comissao_pct','number')}
                  {F('Repasse vendedor (%)','repasse_vendedor_pct','number')}

                  {F('Qtd. parcelas','qtd_parcelas','number')}
                  {F('Tipo pagamento','tipo_pagamento','select',{options:['Boleto','Débito automático','Cartão de crédito','PIX','Carnê','Outro']})}
                  {F('Banco','banco')}
                  {F('Agência','agencia')}

                  {F('Conta','conta')}
                  {F('Filial','filial')}
                  {F('Pasta','pasta')}
                  {F('Pasta cliente','pasta_cliente')}

                  {F('Negócio corretora','negocio_corretora')}
                  {F('Tipo vendedores','tipo_vendedores','select',{options:['Produção','Renovação','Particular','Outro']})}
                  {F('Status','status','select',{options:['ativo','cancelado','renovar','vencido']})}
                  {F('Status assinatura','status_assinatura','select',{options:['pendente','enviada','assinada','recusada']})}

                  {F('Transmissão','transmissao')}
                  {F('Apólice conferida','apolice_conferida','checkbox')}
                  {F('Proposta assinada','proposta_assinada','checkbox')}
                  <div />

                  {F('Observações (Porto / extras)','dados_porto','textarea',{span:4})}
                </div>
              )
            })()}

            <div style={{display:'flex',gap:10,justifyContent:'flex-end',marginTop:20,paddingTop:16,borderTop:'1px solid var(--border)'}}>
              <button className="btn-secondary" onClick={()=>{setDetModal(null);setNovoMode(false)}} disabled={detSalvando}>Cancelar</button>
              <button className="btn-primary" onClick={salvarDetalhes} disabled={detSalvando||(novoMode&&!novoClienteSel)}>
                {detSalvando?'Salvando...':(novoMode?'✓ Criar apólice':'✓ Salvar detalhes')}
              </button>
            </div>
          </div>
        </div>
      )}

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

const inputStyle: React.CSSProperties = {
  width:'100%', background:'rgba(0,0,0,0.04)', border:'1px solid var(--border)',
  borderRadius:6, padding:'7px 10px', color:'var(--text)', fontSize:12, outline:'none', boxSizing:'border-box'
}
