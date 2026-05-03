'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { exportarXLSX, fmt as xfmt } from '@/lib/export-xlsx'

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
  const [filtroStatus, setFiltroStatus] = useState<'todos'|'ativo'|'cancelado'|'renovar'|'vencido'>('ativo')
  const [editandoVendedor, setEditandoVendedor] = useState<string|null>(null)

  // Modal "editar detalhes" (todos os campos da apólice)
  const [detModal, setDetModal] = useState<any|null>(null)
  const [detForm,  setDetForm]  = useState<any>({})
  const [detSalvando, setDetSalvando] = useState(false)
  const [novoMode, setNovoMode] = useState(false)
  const [novoClienteBusca, setNovoClienteBusca] = useState('')
  const [novoClienteRes, setNovoClienteRes] = useState<any[]>([])
  const [novoClienteSel, setNovoClienteSel] = useState<any>(null)


  // Sincronizar clientes em apolices sem vinculo
  const [syncBusy, setSyncBusy] = useState(false)
  // Normalizar duplicatas
  const [dupBusy, setDupBusy] = useState(false)

  // Server-side pagination + stats agregadas
  const [pagina, setPagina] = useState(0)
  const PAGE_SIZE = 50
  const [total, setTotal] = useState(0)
  const [stats, setStats] = useState({ premio_total: 0, comissao_total: 0, vencendo_30d: 0 })
  const [ramosLista, setRamosLista] = useState<string[]>([])
  const [seguradorasLista, setSeguradorasLista] = useState<string[]>([])
  const [buscaDebounced, setBuscaDebounced] = useState('')

  // Lançamento de comissão recebida (admin)
  const [comModal, setComModal] = useState<any|null>(null)
  const hojeIso = new Date().toISOString().slice(0,10)
  const [comForm, setComForm] = useState({ valor:'', competencia: hojeIso.slice(0,7), data_recebimento: hojeIso, parcela:'1', total_parcelas:'1', obs:'' })
  const [comSalvando, setComSalvando] = useState(false)

  // Carga inicial: profile + listas auxiliares (uma vez)
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: prof } = await supabase.from('users').select('*').eq('id', user?.id||'').single()
      setProfile(prof)
      const [{ data: usr }, { data: vleg }, { data: segs }, { data: filtros }] = await Promise.all([
        supabase.from('users').select('id, nome').order('nome'),
        supabase.from('vendedores_legado').select('id, nome').eq('ativo', true).order('nome'),
        supabase.from('seguradoras').select('nome').eq('ativo', true).order('nome'),
        supabase.from('apolices_filtros').select('seguradoras, ramos').maybeSingle(),
      ])
      setUsuarios(usr || [])
      setVendedoresLegado(vleg || [])
      setSeguradorasCad((segs || []).map((s:any)=>s.nome))
      setRamosLista((filtros as any)?.ramos || [])
      setSeguradorasLista((filtros as any)?.seguradoras || [])
    })()
  }, [])

  // Debounce do campo de busca (350ms) pra evitar query a cada tecla
  useEffect(() => {
    const t = setTimeout(() => setBuscaDebounced(busca), 350)
    return () => clearTimeout(t)
  }, [busca])

  // Re-carrega lista + stats quando filtros ou pagina mudam
  useEffect(() => { carregar() }, [pagina, filtroStatus, filtroSeg, filtroRamo, filtroVendedor, buscaDebounced, profile?.id])

  // Reset pagina quando filtro muda
  useEffect(() => { setPagina(0) }, [filtroStatus, filtroSeg, filtroRamo, filtroVendedor, buscaDebounced])

  async function carregar() {
    if (!profile) return
    setLoading(true)

    // Determinar filtro de vendedor (RLS ja restringe, mas filtramos
    // pra acelerar o index seek)
    let visibleIds: string[] | null = null
    if (profile.role === 'corretor') {
      visibleIds = [profile.id]
    } else if (profile.role === 'lider') {
      const { data: eq } = await supabase.from('equipes').select('id').eq('lider_id', profile.id)
      if (eq?.length) {
        const { data: mb } = await supabase.from('equipe_membros').select('user_id').in('equipe_id', eq.map((e:any)=>e.id))
        visibleIds = [profile.id, ...(mb?.map((m:any)=>m.user_id)||[])]
      } else visibleIds = [profile.id]
    }

    // Args dos filtros (null = sem filtro)
    const argStatus    = filtroStatus    === 'todos' ? null : filtroStatus
    const argSeg       = filtroSeg       === 'todos' ? null : filtroSeg
    const argRamo      = filtroRamo      === 'todos' ? null : filtroRamo
    const argBusca     = buscaDebounced.trim() || null
    let argVendedorId: string | null = null
    if (filtroVendedor !== 'todos') {
      argVendedorId = filtroVendedor === 'sem' ? '00000000-0000-0000-0000-000000000000' : filtroVendedor
    }

    // 1) Stats agregadas via RPC (1 query, retorna 4 numeros)
    const statsP = supabase.rpc('apolices_stats', {
      p_status: argStatus,
      p_seguradora: argSeg,
      p_ramo: argRamo,
      p_vendedor_id: argVendedorId,
      p_busca: argBusca,
    } as any)

    // 2) Pagina atual da tabela (so 50 linhas, slim columns)
    let qList = supabase
      .from('apolices')
      .select('id, numero, produto, seguradora, premio, comissao_pct, vigencia_ini, vigencia_fim, status, vendedor_id, cliente_id, negocio_id, clientes(id,nome,tipo), users(id,nome)', { count: 'exact' })
      .order('vigencia_fim', { ascending: true, nullsFirst: false })
      .range(pagina * PAGE_SIZE, pagina * PAGE_SIZE + PAGE_SIZE - 1)
    if (argStatus)      qList = qList.eq('status', argStatus)
    if (argSeg)         qList = qList.eq('seguradora', argSeg)
    if (argRamo)        qList = qList.ilike('produto', `${argRamo}%`)
    if (argVendedorId === '00000000-0000-0000-0000-000000000000') qList = qList.is('vendedor_id', null)
    else if (argVendedorId) qList = qList.eq('vendedor_id', argVendedorId)
    if (visibleIds)     qList = qList.in('vendedor_id', visibleIds)
    if (argBusca) {
      const b = argBusca.replace(/[%]/g, '')
      qList = qList.or(`produto.ilike.%${b}%,seguradora.ilike.%${b}%,numero.ilike.%${b}%,nome_segurado.ilike.%${b}%`)
    }

    const [statsRes, listRes] = await Promise.all([statsP, qList])
    const sRow = (statsRes.data as any)?.[0] || (statsRes.data as any)
    if (sRow) {
      setStats({
        premio_total:   Number(sRow.premio_total)   || 0,
        comissao_total: Number(sRow.comissao_total) || 0,
        vencendo_30d:   Number(sRow.vencendo_30d)   || 0,
      })
      setTotal(Number(sRow.total) || 0)
    }
    if (listRes.error) {
      console.error('Erro ao carregar apólices:', listRes.error)
      alert('Erro ao carregar apólices: ' + listRes.error.message)
    } else {
      const items = (listRes.data || []).map((a:any) => ({
        ...a,
        vencimento: a.vigencia_fim,
        etapa:      a.status || 'ativo',
      }))
      setNegocios(items)
    }
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

  // Le response com fallback pra texto: evita "Unexpected end of JSON input"
  // quando o servidor retorna 504/HTML/timeout.
  async function lerResposta(r: Response): Promise<any> {
    const txt = await r.text()
    if (!txt) return { error: `Resposta vazia (HTTP ${r.status})` }
    try { return JSON.parse(txt) }
    catch {
      const ehTimeout = /timeout|504|gateway|an error o/i.test(txt)
      return { error: ehTimeout
        ? `Timeout do servidor (HTTP ${r.status}). Tente novamente.`
        : `Resposta inválida (HTTP ${r.status}): ${txt.slice(0, 120)}` }
    }
  }

  async function normalizarDuplicatas() {
    if (dupBusy) return
    setDupBusy(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const headers: Record<string,string> = { 'Content-Type': 'application/json' }
      if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`
      const r1 = await fetch('/api/apolices/normalizar-duplicatas', {
        method: 'POST', headers, body: JSON.stringify({ dry_run: true }),
      })
      const j1 = await lerResposta(r1)
      if (j1.error) { alert('Erro: ' + j1.error); return }
      const s = j1.stats
      if (!s.apolices_a_remover) { alert(`✓ Nenhuma duplicata encontrada (${s.total_apolices} apólices).`); return }
      const ok = confirm(
        `Remover ${s.apolices_a_remover} apólice(s) duplicada(s)?\n\n` +
        `Total no banco: ${s.total_apolices}\n` +
        `Grupos com duplicatas: ${s.grupos_com_duplicatas}\n` +
        `Critério: mesmo nome + número + seguradora.\n` +
        `Mantém a apólice mais antiga; remove o restante.`
      )
      if (!ok) return
      const r2 = await fetch('/api/apolices/normalizar-duplicatas', {
        method: 'POST', headers, body: JSON.stringify({ dry_run: false }),
      })
      const j2 = await lerResposta(r2)
      if (j2.error) { alert('Erro ao aplicar: ' + j2.error); return }
      alert(`✓ ${j2.removidas} apólices duplicadas removidas (${j2.erros} erros).`)
      await carregar()
    } catch (e: any) {
      alert('Erro: ' + (e?.message || e))
    } finally {
      setDupBusy(false)
    }
  }

  async function sincronizarClientes() {
    if (syncBusy) return
    setSyncBusy(true)
    try {
      // Pre-visualiza
      const { data: { session } } = await supabase.auth.getSession()
      const headers: Record<string,string> = { 'Content-Type': 'application/json' }
      if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`
      const r1 = await fetch('/api/apolices/sincronizar-clientes', {
        method: 'POST', headers, body: JSON.stringify({ dry_run: true }),
      })
      const j1 = await lerResposta(r1)
      if (j1.error) { alert('Erro: ' + j1.error); return }
      const s = j1.stats
      const ok = confirm(
        `Sincronizar ${s.a_vincular} apólice(s)?\n\n` +
        `Sem cliente: ${s.total_apolices_sem_cliente}\n` +
        `→ Casará por CPF: ${s.casadas_por_cpf}\n` +
        `→ Casará por nome: ${s.casadas_por_nome}\n` +
        `→ Sem match (continuarão sem cliente): ${s.sem_match}`
      )
      if (!ok) return
      const r2 = await fetch('/api/apolices/sincronizar-clientes', {
        method: 'POST', headers, body: JSON.stringify({ dry_run: false }),
      })
      const j2 = await lerResposta(r2)
      if (j2.error) { alert('Erro ao aplicar: ' + j2.error); return }
      alert(`✓ ${j2.aplicados} apólices vinculadas (${j2.erros} erros).`)
      await carregar()
    } catch (e: any) {
      alert('Erro: ' + (e?.message || e))
    } finally {
      setSyncBusy(false)
    }
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

  // Listas vêm de view apolices_filtros (pré-carregada)
  const ramos       = ramosLista
  const seguradoras = seguradorasLista
  const isAdmin     = profile?.role === 'admin'
  const isLider     = profile?.role === 'lider'

  // negocios ja vem filtrado e paginado do servidor
  const filtrados = negocios
  const totalPaginas = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const premioTotal   = stats.premio_total
  const comissaoTotal = stats.comissao_total
  const vencendo30d   = stats.vencendo_30d

  function statusApolice(n: any) {
    // Status do banco tem prioridade absoluta — antes ele era ignorado em
    // favor do calculo por vencimento, dando a impressao de "varios
    // status" mesmo quando o filtro estava ativo.
    const st = (n.status || 'ativo').toLowerCase()
    if (st === 'cancelado') return { label:'Cancelado', cor:'var(--red)' }
    if (st === 'vencido')   return { label:'Vencido',   cor:'var(--red)' }
    if (st === 'renovar')   return { label:'Renovar',   cor:'var(--gold)' }
    // status === 'ativo' (ou desconhecido): mostra "Renovar em breve" como
    // SUB-rotulo se a vigencia estiver chegando, mas mantem como Ativo.
    if (n.vencimento) {
      const dias = diasAte(n.vencimento)
      if (dias < 0)   return { label:'Ativo (vencido)',         cor:'var(--gold)' }
      if (dias <= 30) return { label:`Ativo (vence em ${dias}d)`, cor:'#e6c97a' }
    }
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
          { campo:'premio',         titulo:'Prêmio (R$)', fmt:xfmt.brl },
          { campo:'comissao_pct',   titulo:'Comissão %' },
          { campo:'vigencia_ini',   titulo:'Vigência ini', fmt:xfmt.data },
          { campo:'vencimento',     titulo:'Vencimento',   fmt:xfmt.data },
          { campo:'status',         titulo:'Status' },
          { campo:'users',          titulo:'Vendedor',    fmt:(v:any)=>v?.nome || '' },
        ], 'apolices')}
          style={{padding:'7px 12px',borderRadius:8,fontSize:13,border:'1px solid var(--border)',background:'rgba(255,255,255,0.04)',color:'var(--text-muted)',cursor:'pointer',whiteSpace:'nowrap'}}
          title="Exportar lista atual em Excel">
          📥 Exportar ({filtrados.length})
        </button>
        {profile?.role === 'admin' && (
          <>
            <button onClick={sincronizarClientes} disabled={syncBusy}
              title="Vincula apólices não associadas a clientes (por CPF/CNPJ ou nome)"
              style={{padding:'7px 12px',borderRadius:8,fontSize:13,border:'1px solid var(--gold)',background:'rgba(201,168,76,0.08)',color:'var(--gold)',cursor:syncBusy?'wait':'pointer',whiteSpace:'nowrap',fontWeight:500}}>
              {syncBusy ? '⏳ Sincronizando...' : '🔗 Sincronizar clientes'}
            </button>
            <button onClick={normalizarDuplicatas} disabled={dupBusy}
              title="Remove apólices duplicadas (mesmo nome + número + seguradora)"
              style={{padding:'7px 12px',borderRadius:8,fontSize:13,border:'1px solid rgba(224,82,82,0.5)',background:'rgba(224,82,82,0.08)',color:'var(--red)',cursor:dupBusy?'wait':'pointer',whiteSpace:'nowrap',fontWeight:500}}>
              {dupBusy ? '⏳ Normalizando...' : '🧹 Normalizar duplicatas'}
            </button>
          </>
        )}
        <button className="btn-primary" onClick={abrirNovaApolice} style={{padding:'7px 14px',fontSize:13}}>
          + Nova apólice
        </button>
      </div>

      <div style={{flex:1,overflow:'auto',padding:'28px 28px 40px'}}>
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:20,marginBottom:24}}>
          {[
            {label:'Total de Apólices', val:total,                      tone:'info'    as const},
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
          <span style={{fontSize:12,color:'var(--text-muted)'}}>Status:</span>
          <select style={{background:'rgba(255,255,255,0.05)',border:'1px solid var(--border)',borderRadius:8,padding:'6px 12px',color:'var(--text)',fontSize:12,fontFamily:'DM Sans,sans-serif',cursor:'pointer'}} value={filtroStatus} onChange={e=>setFiltroStatus(e.target.value as any)}>
            <option value="ativo">Ativo</option>
            <option value="todos">Todos</option>
            <option value="renovar">Renovar</option>
            <option value="vencido">Vencido</option>
            <option value="cancelado">Cancelado</option>
          </select>
          <span style={{marginLeft:'auto',fontSize:13,color:'var(--text-muted)'}}>{total} apólice{total!==1?'s':''}</span>
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
        {/* Paginação */}
        {total > PAGE_SIZE && (
          <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:10,marginTop:14,fontSize:13,color:'var(--text-muted)'}}>
            <button onClick={()=>setPagina(p => Math.max(0, p-1))} disabled={pagina===0||loading}
              style={{padding:'6px 12px',border:'1px solid var(--border)',borderRadius:6,background:'rgba(255,255,255,0.04)',color:'var(--text)',cursor:pagina===0?'not-allowed':'pointer',opacity:pagina===0?0.5:1}}>
              ← Anterior
            </button>
            <span>Página <b>{pagina+1}</b> de <b>{totalPaginas}</b> ({total.toLocaleString('pt-BR')} apólices)</span>
            <button onClick={()=>setPagina(p => Math.min(totalPaginas-1, p+1))} disabled={pagina>=totalPaginas-1||loading}
              style={{padding:'6px 12px',border:'1px solid var(--border)',borderRadius:6,background:'rgba(255,255,255,0.04)',color:'var(--text)',cursor:pagina>=totalPaginas-1?'not-allowed':'pointer',opacity:pagina>=totalPaginas-1?0.5:1}}>
              Próxima →
            </button>
          </div>
        )}
      </div>

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
