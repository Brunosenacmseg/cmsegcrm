'use client'
import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import ContatoAcoes from '@/components/ContatoAcoes'
import UploadAnexo, { Anexo } from '@/components/UploadAnexo'

type Tab = 'historico' | 'email' | 'tarefas' | 'questionarios' | 'produtos' | 'arquivos' | 'propostas'

export default function NegocioDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const supabase = createClient()

  const [loading, setLoading]   = useState(true)
  const [negocio, setNegocio]   = useState<any>(null)
  const [funil, setFunil]       = useState<any>(null)
  const [funisAll, setFunisAll] = useState<any[]>([])
  const [trocandoFunil, setTrocandoFunil] = useState(false)
  const [seguradorasAll, setSeguradorasAll] = useState<any[]>([])
  const [cliente, setCliente]   = useState<any>(null)
  const [responsavel, setResp]  = useState<any>(null)
  const [me, setMe]             = useState<any>(null)
  const [tarefas, setTarefas]   = useState<any[]>([])
  const [eventos, setEventos]   = useState<any[]>([])
  const [notas, setNotas]       = useState<any[]>([])
  const [editandoNotaId, setEditandoNotaId]       = useState<string|null>(null)
  const [editandoNotaTexto, setEditandoNotaTexto] = useState('')
  const [produtos, setProdutos] = useState<any[]>([])
  const [produtosAll, setProdutosAll] = useState<any[]>([])
  const [modalProduto, setModalProduto] = useState(false)
  const [formProduto, setFormProduto] = useState<{produto_id:string; quantidade:string; valor_unit:string; recorrencia:string; desconto:string; addDesconto:boolean; obs:string}>({produto_id:'',quantidade:'1',valor_unit:'',recorrencia:'unica',desconto:'',addDesconto:false,obs:''})
  const [salvandoProduto, setSalvandoProduto] = useState(false)
  const [usuariosAll, setUsuariosAll] = useState<any[]>([])
  const [modalTarefa, setModalTarefa] = useState(false)
  const [formTarefa, setFormTarefa] = useState({ assunto:'', descricao:'', tipo:'tarefa', responsavel_id:'', data:'', hora:'09:00', concluida:false })
  const [salvandoTarefa, setSalvandoTarefa] = useState(false)
  const [modalPerda, setModalPerda] = useState(false)
  const [motivosPerda, setMotivosPerda] = useState<any[]>([])
  const [motivoSelecionado, setMotivoSelecionado] = useState('')
  const [motivoCustom, setMotivoCustom] = useState('')
  const [anotacaoPerda, setAnotacaoPerda] = useState('')
  const [salvandoPerda, setSalvandoPerda] = useState(false)
  const [anexos, setAnexos] = useState<Anexo[]>([])
  const [editarCliente, setEditarCliente] = useState(false)
  const [buscaCliente, setBuscaCliente]   = useState('')
  const [clientesRes, setClientesRes]     = useState<any[]>([])
  const [editarResp, setEditarResp]       = useState(false)
  const [tab, setTab]           = useState<Tab>('historico')
  const [devMode, setDevMode]   = useState(false)
  const [filtroEventoOrigem, setFiltroEventoOrigem] = useState<'todos'|'crm'|'rd'>('todos')
  const [filtroEventoTipo,   setFiltroEventoTipo]   = useState<'todos'|'anotacao'|'etapa'|'tarefa'|'log'>('todos')
  const [novaAnotacao, setNovaAnotacao] = useState('')
  const [criandoNota, setCriandoNota] = useState(false)
  const [openSections, setOpenSections] = useState<Record<string,boolean>>({
    negociacao:true, contatos:true, info:false, empresa:true, responsavel:true,
  })

  useEffect(()=>{ try { setDevMode(localStorage.getItem('cm_dev_mode')==='1') } catch{} }, [])

  useEffect(() => {
    if (!id) return
    ;(async () => {
      setLoading(true)
      const { data: neg } = await supabase.from('negocios').select('*').eq('id', id).single()
      if (!neg) { setLoading(false); return }
      setNegocio(neg)
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: profile } = await supabase.from('users').select('id,nome,avatar_url,role').eq('id', user.id).single()
        setMe(profile)
      }
      const [{ data: fn }, { data: cl }, { data: rp }, { data: tr }, { data: nt }, { data: pr }, { data: pAll }] = await Promise.all([
        neg.funil_id ? supabase.from('funis').select('*').eq('id', neg.funil_id).single() : Promise.resolve({ data: null } as any),
        neg.cliente_id ? supabase.from('clientes').select('id,nome,telefone,email,cpf_cnpj').eq('id', neg.cliente_id).single() : Promise.resolve({ data: null } as any),
        neg.vendedor_id ? supabase.from('users').select('id,nome,email,avatar_url,role').eq('id', neg.vendedor_id).single() : Promise.resolve({ data: null } as any),
        supabase.from('tarefas').select('*').eq('negocio_id', id).order('prazo', { ascending: true }),
        supabase.from('negocio_notas').select('*, users(id,nome,avatar_url,role)').eq('negocio_id', id).order('pinned',{ascending:false}).order('criado_em',{ascending:false}),
        supabase.from('negocio_produtos').select('*').eq('negocio_id', id).order('criado_em',{ascending:true}),
        supabase.from('produtos').select('id,nome,preco_base').eq('ativo',true).order('nome'),
      ])
      const { data: usr } = await supabase.from('users').select('id,nome,email,role,avatar_url').order('nome')
      setUsuariosAll(usr || [])
      setFunil(fn)
      supabase.from('funis').select('id, nome, etapas').order('ordem').then(({ data }: any) => setFunisAll(data || []))
      supabase.from('seguradoras').select('id, nome').order('nome').then(({ data }: any) => setSeguradorasAll(data || []))
      setCliente(cl)
      setResp(rp)
      setTarefas(tr || [])
      if (nt && nt.length > 0) {
        setNotas(nt)
      } else {
        // Fallback sem JOIN — não trava a tela quando a relação embedada falha silenciosamente
        const { data: simples } = await supabase
          .from('negocio_notas').select('*').eq('negocio_id', id)
          .order('pinned',{ascending:false}).order('criado_em',{ascending:false})
        setNotas(simples || [])
      }
      setProdutos(pr || [])
      setProdutosAll(pAll || [])
      const { data: anx } = await supabase.from('anexos').select('*').eq('negocio_id', id).eq('categoria','negocio').order('created_at',{ascending:false})
      setAnexos((anx || []) as any)
      const { data: mp } = await supabase.from('motivos_perda').select('id,nome').eq('ativo', true).order('ordem',{nullsFirst:false}).order('nome')
      setMotivosPerda(mp || [])
      const { data: ev } = await supabase.from('logs').select('*').or(`recurso.ilike.%${id}%,pathname.ilike.%${id}%`).order('criado_em', { ascending: false }).limit(50)
      setEventos(ev || [])
      setLoading(false)
    })()
  }, [id])

  async function recarregarNotas() {
    const { data, error } = await supabase
      .from('negocio_notas')
      .select('*, users(id,nome,avatar_url,role)')
      .eq('negocio_id', id)
      .order('pinned', { ascending: false })
      .order('criado_em', { ascending: false })
    if (error) {
      console.error('[notas] erro ao carregar (com JOIN):', error)
      // Fallback sem JOIN — não trava a tela
      const { data: simples } = await supabase
        .from('negocio_notas').select('*').eq('negocio_id', id)
        .order('pinned', { ascending: false }).order('criado_em', { ascending: false })
      setNotas(simples || [])
      return
    }
    setNotas(data || [])
  }

  async function criarAnotacao() {
    if (!novaAnotacao.trim()) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.id) { alert('Sessão expirada. Faça login novamente.'); return }
    setCriandoNota(true)
    const { error } = await supabase.from('negocio_notas').insert({
      negocio_id: id, user_id: user.id, conteudo: novaAnotacao.trim(), pinned: false,
    })
    setCriandoNota(false)
    if (error) { alert('Erro ao salvar anotação: ' + error.message); return }
    setNovaAnotacao('')
    recarregarNotas()
  }

  async function togglePin(nota: any) {
    await supabase.from('negocio_notas').update({ pinned: !nota.pinned }).eq('id', nota.id)
    recarregarNotas()
  }

  async function excluirNota(notaId: string) {
    if (!confirm('Excluir esta anotação?')) return
    const { error } = await supabase.from('negocio_notas').delete().eq('id', notaId)
    if (error) { alert('Erro ao excluir: ' + error.message); return }
    recarregarNotas()
  }

  async function salvarEdicaoNota(notaId: string, novoConteudo: string) {
    const txt = (novoConteudo || '').trim()
    if (!txt) return
    const { error } = await supabase.from('negocio_notas').update({ conteudo: txt }).eq('id', notaId)
    if (error) { alert('Erro ao salvar: ' + error.message); return }
    setEditandoNotaId(null)
    setEditandoNotaTexto('')
    recarregarNotas()
  }

  async function recarregarProdutos() {
    const { data } = await supabase.from('negocio_produtos').select('*').eq('negocio_id', id).order('criado_em',{ascending:true})
    setProdutos(data || [])
  }

  async function salvarProduto() {
    if (!formProduto.produto_id) { alert('Selecione um produto'); return }
    const p = produtosAll.find(x => x.id === formProduto.produto_id)
    setSalvandoProduto(true)
    const num = (s:string) => s ? Number(String(s).replace(/\./g,'').replace(',','.')) : 0
    await supabase.from('negocio_produtos').insert({
      negocio_id: id,
      produto_id: formProduto.produto_id,
      nome_snapshot: p?.nome || null,
      quantidade: Number(formProduto.quantidade) || 1,
      valor_unit: formProduto.valor_unit ? num(formProduto.valor_unit) : (p?.preco_base || 0),
      desconto: formProduto.addDesconto ? num(formProduto.desconto) : 0,
      recorrencia: formProduto.recorrencia || 'unica',
      observacao: formProduto.obs || null,
    })
    setSalvandoProduto(false)
    setModalProduto(false)
    setFormProduto({produto_id:'',quantidade:'1',valor_unit:'',recorrencia:'unica',desconto:'',addDesconto:false,obs:''})
    recarregarProdutos()
  }

  async function removerProduto(npId: string) {
    if (!confirm('Remover este produto?')) return
    await supabase.from('negocio_produtos').delete().eq('id', npId)
    recarregarProdutos()
  }

  async function recarregarTarefas() {
    const { data } = await supabase.from('tarefas').select('*').eq('negocio_id', id).order('prazo', { ascending: true })
    setTarefas(data || [])
  }

  async function salvarNovaTarefa() {
    if (!formTarefa.assunto.trim()) { alert('Informe o assunto da tarefa'); return }
    if (!formTarefa.data) { alert('Informe a data do agendamento'); return }
    setSalvandoTarefa(true)
    const prazo = `${formTarefa.data}T${formTarefa.hora || '09:00'}:00`
    const responsavel_id = formTarefa.responsavel_id || me?.id
    const { error } = await supabase.from('tarefas').insert({
      titulo: formTarefa.assunto,
      descricao: formTarefa.descricao || null,
      tipo: formTarefa.tipo,
      responsavel_id,
      negocio_id: id,
      cliente_id: cliente?.id || null,
      criado_por: me?.id,
      atribuido_por: responsavel_id !== me?.id ? me?.id : null,
      prazo,
      status: formTarefa.concluida ? 'concluida' : 'pendente',
    })
    setSalvandoTarefa(false)
    if (error) { alert('Erro ao criar tarefa: ' + error.message); return }
    setModalTarefa(false)
    setFormTarefa({ assunto:'', descricao:'', tipo:'tarefa', responsavel_id:'', data:'', hora:'09:00', concluida:false })
    recarregarTarefas()
  }

  const etapas: string[] = funil?.etapas || []
  const etapaAtualIdx = useMemo(() => etapas.findIndex(e => e === negocio?.etapa), [etapas, negocio?.etapa])
  const status = negocio?.status || 'em_andamento'
  const isGanho = status === 'ganho'
  const isPerdido = status === 'perdido'

  const diasSemMov = negocio?.updated_at ? Math.floor((Date.now() - new Date(negocio.updated_at).getTime())/86400000) : null
  const cfgEtapa = (funil?.meta_etapas as any)?.[negocio?.etapa]
  const limiteEsfri = cfgEtapa?.esfriando ? Number(cfgEtapa?.dias)||3 : null
  const esfriando = limiteEsfri !== null && diasSemMov !== null && diasSemMov >= limiteEsfri

  async function buscarClientes(q: string) {
    setBuscaCliente(q)
    if (q.length < 2) { setClientesRes([]); return }
    const { data } = await supabase.from('clientes').select('id,nome,telefone,email,cpf_cnpj').or(`nome.ilike.%${q}%,cpf_cnpj.ilike.%${q}%,email.ilike.%${q}%`).limit(10)
    setClientesRes(data || [])
  }

  async function vincularCliente(c: any | null) {
    await supabase.from('negocios').update({ cliente_id: c?.id || null, updated_at: new Date().toISOString() }).eq('id', id)
    setNegocio((n:any)=>({ ...n, cliente_id: c?.id || null }))
    setCliente(c)
    setEditarCliente(false)
    setBuscaCliente(''); setClientesRes([])
  }

  async function mudarResponsavel(userId: string | null) {
    await supabase.from('negocios').update({ vendedor_id: userId, updated_at: new Date().toISOString() }).eq('id', id)
    setNegocio((n:any)=>({ ...n, vendedor_id: userId }))
    if (userId) {
      const u = usuariosAll.find(x => x.id === userId)
      if (u) setResp({ id: u.id, nome: u.nome, email: u.email, avatar_url: u.avatar_url, role: u.role })
    } else {
      setResp(null)
    }
    setEditarResp(false)
  }

  async function salvarCampo(campo: string, valor: any) {
    await supabase.from('negocios').update({ [campo]: valor, updated_at: new Date().toISOString() }).eq('id', id)
    setNegocio((n:any)=>({ ...n, [campo]: valor }))
  }

  async function confirmarPerda() {
    if (!motivoSelecionado) { alert('Selecione um motivo de perda'); return }
    let motivoId: string | null = motivoSelecionado === '__novo__' ? null : motivoSelecionado
    let motivoTexto: string | null = motivoSelecionado === '__novo__' ? motivoCustom.trim() : null
    if (motivoSelecionado === '__novo__') {
      if (!motivoTexto) { alert('Informe o motivo'); return }
      const { data: novo, error } = await supabase.from('motivos_perda').insert({ nome: motivoTexto, ativo: true }).select('id,nome').single()
      if (error) { alert('Erro ao criar motivo: ' + error.message); return }
      motivoId = novo?.id || null
      setMotivosPerda(prev => [...prev, novo].sort((a:any,b:any)=>String(a.nome).localeCompare(String(b.nome))))
    } else {
      motivoTexto = motivosPerda.find(m => m.id === motivoSelecionado)?.nome || null
    }
    setSalvandoPerda(true)
    const { error } = await supabase.from('negocios').update({
      status: 'perdido',
      motivo_perda_id: motivoId,
      motivo_perda: motivoTexto,
      anotacao_motivo_perda: anotacaoPerda || null,
      data_fechamento: new Date().toISOString(),
    }).eq('id', id)
    setSalvandoPerda(false)
    if (error) { alert('Erro: ' + error.message); return }
    setNegocio((n:any)=>({...n, status:'perdido', motivo_perda_id: motivoId, motivo_perda: motivoTexto, anotacao_motivo_perda: anotacaoPerda || null}))
    setModalPerda(false)
    setMotivoSelecionado(''); setMotivoCustom(''); setAnotacaoPerda('')
  }

  async function mudarEtapa(nova: string) {
    await supabase.from('negocios').update({ etapa: nova, updated_at: new Date().toISOString() }).eq('id', id)
    setNegocio((n:any)=>({...n, etapa: nova}))
  }

  if (loading) return <div style={{padding:40,textAlign:'center',color:'var(--text-muted)'}}>Carregando negociação...</div>
  if (!negocio) return <div style={{padding:40,textAlign:'center',color:'var(--text-muted)'}}>Negociação não encontrada</div>

  const proximasTarefas = tarefas.filter(t => t.status !== 'concluida')
  const tarefasConcluidas = tarefas.filter(t => t.status === 'concluida')

  return (
    <div style={{padding:'18px 24px',maxWidth:1400,margin:'0 auto'}}>
      {/* Header */}
      <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:8}}>
        <button onClick={()=>{
          // Volta ao funil de origem do card, em vez do funil padrão.
          if (negocio?.funil_id) {
            router.push(`/dashboard/funis?funil=${negocio.funil_id}`)
          } else {
            router.back()
          }
        }}
          style={{background:'transparent',border:'1px solid var(--border-soft)',borderRadius:8,padding:'6px 10px',cursor:'pointer',fontSize:13}}>←</button>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:11,color:'var(--text-muted)',marginBottom:2}}>
            <Link href="/dashboard/funis" style={{color:'inherit',textDecoration:'none'}}>Negociações</Link>
            {funil?.nome && <span> › {funil.nome}</span>}
          </div>
          <div style={{fontSize:18,fontWeight:600,color:'var(--text)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{negocio.titulo}</div>
        </div>
        <div style={{display:'flex',gap:8}}>
          <Link href={`/dashboard/autentique?novo=1&negocio_id=${id}&titulo=${encodeURIComponent(negocio.titulo || '')}`}
            style={{background:'var(--gold-soft)',color:'var(--gold)',border:'1px solid var(--gold)',borderRadius:8,padding:'8px 14px',fontSize:13,fontWeight:600,textDecoration:'none'}}>
            ✍ Enviar para assinatura
          </Link>
          {!isPerdido && (
            <button onClick={()=>{
              const exigeCli = ['RCO','VENDA','VENDAS','RENOVAÇÕES','RENOVACOES','META + MULTICANAL','META MULTICANAL'].some(n => (funil?.nome||'').toUpperCase().includes(n.toUpperCase()))
              if (exigeCli && !negocio?.cliente_id) { alert('Negócio só pode ser finalizado com cliente vinculado. Vincule e finalize a negociação.'); return }
              setModalPerda(true)
            }}
              style={{background:'#fee2e2',color:'var(--red)',border:'1px solid #fecaca',borderRadius:8,padding:'8px 14px',cursor:'pointer',fontSize:13,fontWeight:600}}>👎 Marcar perda</button>
          )}
          {!isGanho && (
            <button onClick={async ()=>{
              const exigeCli = ['RCO','VENDA','VENDAS','RENOVAÇÕES','RENOVACOES','META + MULTICANAL','META MULTICANAL'].some(n => (funil?.nome||'').toUpperCase().includes(n.toUpperCase()))
              if (exigeCli && !negocio?.cliente_id) { alert('Negócio só pode ser finalizado com cliente vinculado. Vincule e finalize a negociação.'); return }
              if(confirm('Marcar como venda?')){ await supabase.from('negocios').update({status:'ganho',data_fechamento:new Date().toISOString()}).eq('id',id); setNegocio((n:any)=>({...n,status:'ganho'})) }
            }}
              style={{background:'var(--teal)',color:'#fff',border:'none',borderRadius:8,padding:'8px 14px',cursor:'pointer',fontSize:13,fontWeight:600}}>👍 Marcar venda</button>
          )}
        </div>
      </div>

      {/* Badges */}
      <div style={{display:'flex',gap:6,marginBottom:14,flexWrap:'wrap'}}>
        {isGanho && <span style={{fontSize:11,fontWeight:700,padding:'3px 9px',borderRadius:5,background:'rgba(28,181,160,0.18)',color:'var(--teal)',textTransform:'uppercase',letterSpacing:1}}>✓ Ganho</span>}
        {isPerdido && <span style={{fontSize:11,fontWeight:700,padding:'3px 9px',borderRadius:5,background:'rgba(224,82,82,0.18)',color:'var(--red)',textTransform:'uppercase',letterSpacing:1}}>✕ Perdido</span>}
        {!isGanho && !isPerdido && (
          <>
            <span style={{fontSize:11,fontWeight:700,padding:'3px 9px',borderRadius:5,background:'rgba(74,128,240,0.14)',color:'#1d4ed8',textTransform:'uppercase',letterSpacing:0.8}}>Em andamento</span>
            {esfriando && <span style={{fontSize:11,fontWeight:700,padding:'3px 9px',borderRadius:5,background:'rgba(217,119,6,0.16)',color:'#a16207',textTransform:'uppercase',letterSpacing:0.8}}>Esfriando há {diasSemMov} dia{diasSemMov!==1?'s':''}</span>}
          </>
        )}
        {funil && <span style={{fontSize:11,fontWeight:600,padding:'3px 9px',borderRadius:5,background:'var(--bg-subtle)',color:'var(--text-muted)'}}>{funil.nome}</span>}
      </div>

      {/* Stepper de etapas (chevron arrows) */}
      {etapas.length > 0 && (
        <div style={{display:'flex',marginBottom:18,overflowX:'auto',gap:0}}>
          {etapas.map((et, i) => {
            const ativo   = et === negocio.etapa
            const passada = etapaAtualIdx !== -1 && i < etapaAtualIdx
            const futura  = etapaAtualIdx !== -1 && i > etapaAtualIdx
            const isFirst = i === 0
            const isLast  = i === etapas.length - 1
            const bg = ativo ? '#1cb5a0' : passada ? 'rgba(28,181,160,0.18)' : '#eef2f6'
            const fg = ativo ? '#fff'    : passada ? '#0f766e'                : 'var(--text-muted)'
            const cfg = (funil?.meta_etapas as any)?.[et]
            const limite = cfg?.esfriando ? Number(cfg?.dias)||3 : null
            const dias = ativo && diasSemMov !== null ? diasSemMov : null
            return (
              <button key={et} onClick={()=>mudarEtapa(et)}
                style={{position:'relative',flex:'1 0 auto',minWidth:130,padding:'10px 16px 10px '+(isFirst?'16px':'26px'),border:'none',background:bg,color:fg,fontSize:10,fontWeight:700,letterSpacing:0.5,textTransform:'uppercase',cursor:'pointer',whiteSpace:'nowrap',clipPath:isLast?'none':'polygon(0 0, calc(100% - 12px) 0, 100% 50%, calc(100% - 12px) 100%, 0 100%, 12px 50%)',marginLeft:isFirst?0:-12,textAlign:'left'}}>
                <span>{et}</span>
                {ativo && dias!==null && <div style={{fontSize:9,fontWeight:600,opacity:0.9,marginTop:2,textTransform:'none',letterSpacing:0}}>({dias} dia{dias!==1?'s':''})</div>}
              </button>
            )
          })}
        </div>
      )}

      {/* Layout 2 colunas */}
      <div style={{display:'grid',gridTemplateColumns:'320px 1fr',gap:18}}>
        {/* Painel esquerdo */}
        <div style={{display:'flex',flexDirection:'column',gap:12}}>
          <PainelSection title="Negociação" open={openSections.negociacao} onToggle={()=>setOpenSections(s=>({...s,negociacao:!s.negociacao}))}>
            <EditableField label="Nome"                   value={negocio.titulo}              onSave={(v)=>salvarCampo('titulo', v)} />
            <EditableField label="Qualificação"           value={negocio.qualificacao}        type="qualificacao" onSave={(v)=>salvarCampo('qualificacao', v)} />
            <EditableField label="Criada em"              value={negocio.created_at ? new Date(negocio.created_at).toLocaleString('pt-BR') : ''} readOnly />
            {/* Valor total: nao e edicao livre — clique abre drawer de Produtos e mostra a soma */}
            {(() => {
              const totalProdutos = produtos.reduce((s,p)=>s + Number(p.valor_unit||0)*Number(p.quantidade||1) - Number(p.desconto||0), 0)
              const valor = totalProdutos > 0 ? totalProdutos : Number(negocio.premio || 0)
              return (
                <div onClick={()=>{ setTab('produtos'); setModalProduto(true) }} title="Adicionar produto/servico para calcular o valor"
                  style={{display:'grid',gridTemplateColumns:'110px 1fr',gap:8,padding:'5px 6px',fontSize:12,alignItems:'center',cursor:'pointer',borderRadius:6}}
                  onMouseEnter={e=>(e.currentTarget.style.background='var(--bg-subtle)')}
                  onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
                  <span style={{color:'var(--text-muted)',fontSize:11,textTransform:'uppercase',letterSpacing:0.5}}>Valor total</span>
                  <span style={{color:valor?'var(--teal)':'var(--blue)',fontWeight:valor?600:400}}>
                    {valor ? `R$ ${valor.toLocaleString('pt-BR',{minimumFractionDigits:2})}` : '+ Adicionar produto ou serviço'}
                  </span>
                </div>
              )
            })()}
            <EditableField label="Previsão de fechamento" value={negocio.previsao_fechamento} type="date"  onSave={(v)=>salvarCampo('previsao_fechamento', v)} />
            <EditableField label="Fonte"                  value={negocio.fonte_origem || negocio.fonte} onSave={(v)=>salvarCampo('fonte_origem', v)} />
            <EditableField label="Campanha"               value={negocio.campanha}            onSave={(v)=>salvarCampo('campanha', v)} />
            <EditableField label="Placa"                  value={negocio.placa_veiculo || negocio.placa} onSave={(v)=>salvarCampo('placa_veiculo', v)} />
            <EditableField label="Modelo do veículo"      value={negocio.modelo_veiculo}      onSave={(v)=>salvarCampo('modelo_veiculo', v)} />
            <EditableField label="CPF"                    value={negocio.cpf_cnpj}            onSave={(v)=>salvarCampo('cpf_cnpj', v)} />
            <EditableField label="CPF 2"                  value={negocio.cpf_2}               onSave={(v)=>salvarCampo('cpf_2', v)} />
            <EditableField label="CEP"                    value={negocio.cep_negocio || negocio.cep} onSave={(v)=>salvarCampo('cep_negocio', v)} />
            <EditableField label="Tipo do seguro"         value={negocio.tipo_seguro}         onSave={(v)=>salvarCampo('tipo_seguro', v)} />
            <EditableField label="Seguradora"             value={negocio.seguradora}          onSave={(v)=>salvarCampo('seguradora', v)}
              options={seguradorasAll.map(s => ({ value: s.nome, label: s.nome }))} />
            <EditableField label="Comissão (%)"           value={negocio.comissao_pct}        type="percentual" onSave={(v)=>salvarCampo('comissao_pct', v)}
              options={Array.from({length:51}, (_,i) => ({ value: i, label: `${i}%` }))} />
            <EditableField label="Rastreador"             value={negocio.rastreador}          onSave={(v)=>salvarCampo('rastreador', v)} options={[{value:'SIM',label:'SIM'},{value:'NAO',label:'NÃO'}]} />
            <EditableField label="Vigência início"        value={negocio.vigencia_seguro_ini} type="date"  onSave={(v)=>salvarCampo('vigencia_seguro_ini', v)} />
            <EditableField label="Vigência fim"           value={negocio.vigencia_seguro_fim} type="date"  onSave={(v)=>salvarCampo('vigencia_seguro_fim', v)} />
            <EditableField label="E-mail"                 value={negocio.email_negocio}       type="email" onSave={(v)=>salvarCampo('email_negocio', v)} />
            <div style={{display:'grid',gridTemplateColumns:'110px 1fr auto',gap:8,padding:'5px 6px',fontSize:12,alignItems:'center'}}>
              <span style={{color:'var(--text-muted)',fontSize:11,textTransform:'uppercase',letterSpacing:0.5}}>Funil</span>
              <select
                value={negocio.funil_id || ''}
                onChange={async (e) => {
                  const novoFunilId = e.target.value
                  if (!novoFunilId || novoFunilId === negocio.funil_id) return
                  const novoFunil = funisAll.find(f => f.id === novoFunilId)
                  const novaEtapa = novoFunil?.etapas?.[0] || negocio.etapa
                  if (!confirm(`Mover este card para o funil "${novoFunil?.nome}" (etapa "${novaEtapa}")?`)) return
                  setTrocandoFunil(true)
                  const { error } = await supabase.from('negocios').update({ funil_id: novoFunilId, etapa: novaEtapa }).eq('id', id)
                  setTrocandoFunil(false)
                  if (error) { alert('Erro: ' + error.message); return }
                  setNegocio((n:any) => ({ ...n, funil_id: novoFunilId, etapa: novaEtapa }))
                  setFunil(novoFunil)
                }}
                disabled={trocandoFunil}
                style={{width:'100%',padding:'4px 8px',border:'1px solid var(--border-strong)',borderRadius:6,fontSize:12,background:'#fff'}}>
                {funisAll.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
              </select>
              <span />
            </div>
            {devMode && <KV label="ID" value={negocio.id} mono />}
          </PainelSection>

          <PainelSection title="Cliente" open={openSections.empresa} onToggle={()=>setOpenSections(s=>({...s,empresa:!s.empresa}))}
            action={!editarCliente ? (
              <button onClick={(e)=>{ e.stopPropagation(); setEditarCliente(true) }} title="Alterar cliente"
                style={{background:'transparent',border:'none',cursor:'pointer',color:'var(--text-muted)',fontSize:14,padding:'2px 6px'}}>✏️</button>
            ) : null}>
            {editarCliente ? (
              <div>
                <input autoFocus value={buscaCliente} onChange={e=>buscarClientes(e.target.value)}
                  placeholder="Buscar cliente por nome, CPF/CNPJ ou e-mail..."
                  style={{width:'100%',padding:'8px 10px',border:'1px solid var(--border-soft)',borderRadius:6,fontSize:12,outline:'none',boxSizing:'border-box'}}/>
                {clientesRes.length > 0 && (
                  <div style={{marginTop:6,maxHeight:200,overflow:'auto',border:'1px solid var(--border-soft)',borderRadius:6}}>
                    {clientesRes.map(c => (
                      <button key={c.id} onClick={()=>vincularCliente(c)}
                        style={{display:'block',width:'100%',textAlign:'left',padding:'8px 10px',border:'none',background:'transparent',cursor:'pointer',fontSize:12,borderBottom:'1px solid var(--border-soft)'}}>
                        <div style={{fontWeight:600,color:'var(--text)'}}>{c.nome}</div>
                        {c.cpf_cnpj && <div style={{color:'var(--text-muted)',fontSize:11}}>{c.cpf_cnpj}</div>}
                      </button>
                    ))}
                  </div>
                )}
                <div style={{display:'flex',gap:6,marginTop:8}}>
                  <button onClick={()=>{ setEditarCliente(false); setBuscaCliente(''); setClientesRes([]) }}
                    style={{fontSize:11,padding:'4px 8px',border:'1px solid var(--border-soft)',borderRadius:6,background:'#fff',cursor:'pointer'}}>Cancelar</button>
                  {cliente && (
                    <button onClick={()=>vincularCliente(null)}
                      style={{fontSize:11,padding:'4px 8px',border:'1px solid var(--border-soft)',borderRadius:6,background:'#fff',color:'var(--red)',cursor:'pointer'}}>Desvincular</button>
                  )}
                </div>
              </div>
            ) : (
              <div style={{padding:'4px 0'}}>
                {cliente ? (
                  <div style={{display:'flex',flexDirection:'column',gap:8}}>
                    <div style={{fontSize:13,fontWeight:600,color:'var(--text)'}}>{cliente.nome}</div>
                    {cliente.telefone && (
                      <div style={{display:'flex',alignItems:'center',gap:8}}>
                        <span style={{fontSize:12,color:'var(--text-muted)'}}>📞 {cliente.telefone}</span>
                      </div>
                    )}
                    {cliente.email && (
                      <div style={{display:'flex',alignItems:'center',gap:8}}>
                        <span style={{fontSize:12,color:'var(--text-muted)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>✉️ {cliente.email}</span>
                      </div>
                    )}
                    {(cliente.telefone || cliente.email) && (
                      <ContatoAcoes telefone={cliente.telefone} email={cliente.email} clienteId={cliente.id} size="sm" />
                    )}
                    <Link href={`/dashboard/clientes/${cliente.id}`}
                      style={{marginTop:4,fontSize:12,color:'var(--blue)',textDecoration:'none'}}>
                      Abrir página do Cliente →
                    </Link>
                  </div>
                ) : (
                  <div onClick={()=>setEditarCliente(true)} style={{fontSize:12,color:'var(--blue)',fontWeight:600,cursor:'pointer'}}>+ Vincular cliente</div>
                )}
              </div>
            )}
          </PainelSection>

          <PainelSection title="Responsável" open={openSections.responsavel} onToggle={()=>setOpenSections(s=>({...s,responsavel:!s.responsavel}))}
            action={!editarResp ? (
              <button onClick={(e)=>{ e.stopPropagation(); setEditarResp(true) }} title="Alterar responsável"
                style={{background:'transparent',border:'none',cursor:'pointer',color:'var(--text-muted)',fontSize:14,padding:'2px 6px'}}>✏️</button>
            ) : null}>
            {editarResp ? (
              <div>
                <select autoFocus value={negocio.vendedor_id || ''} onChange={e=>mudarResponsavel(e.target.value || null)}
                  style={{width:'100%',padding:'8px 10px',border:'1px solid var(--border-soft)',borderRadius:6,fontSize:12,outline:'none',background:'#fff'}}>
                  <option value="">— sem responsável —</option>
                  {usuariosAll.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
                </select>
                <button onClick={()=>setEditarResp(false)}
                  style={{marginTop:8,fontSize:11,padding:'4px 8px',border:'1px solid var(--border-soft)',borderRadius:6,background:'#fff',cursor:'pointer'}}>Cancelar</button>
              </div>
            ) : (
              <div style={{padding:'4px 0'}}>
                {responsavel ? (
                  <div>
                    <div style={{fontSize:13,fontWeight:600,color:'var(--text)'}}>{responsavel.nome}</div>
                    <div style={{fontSize:11,color:'var(--text-muted)'}}>{responsavel.email}</div>
                  </div>
                ) : (
                  <div onClick={()=>setEditarResp(true)} style={{fontSize:12,color:'var(--blue)',fontWeight:600,cursor:'pointer'}}>+ Atribuir responsável</div>
                )}
              </div>
            )}
          </PainelSection>
        </div>

        {/* Coluna central */}
        <div style={{display:'flex',flexDirection:'column',gap:14}}>
          {/* Próximas tarefas */}
          <div style={{background:'#fff',border:'1px solid var(--border-soft)',borderRadius:12,padding:18}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
              <div style={{fontSize:14,fontWeight:700,color:'var(--text)'}}>Próximas tarefas</div>
              <button onClick={()=>setModalTarefa(true)}
                style={{background:'var(--blue)',color:'#fff',padding:'7px 13px',borderRadius:8,fontSize:12,fontWeight:600,border:'none',cursor:'pointer'}}>+ Criar tarefa</button>
            </div>
            {proximasTarefas.length === 0 ? (
              <div style={{padding:'18px 12px',textAlign:'center',color:'var(--text-muted)',fontSize:13}}>
                Não existem tarefas pendentes para essa negociação
              </div>
            ) : (
              <div style={{display:'flex',flexDirection:'column',gap:8}}>
                {proximasTarefas.map(t => {
                  const atrasada = t.prazo && new Date(t.prazo).getTime() < Date.now()
                  return (
                    <div key={t.id} style={{display:'flex',gap:10,alignItems:'center',padding:'10px 12px',border:'1px solid var(--border-soft)',borderRadius:8}}>
                      <span style={{fontSize:14}}>{atrasada?'⚠️':'📋'}</span>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:13,color:'var(--text)',fontWeight:500}}>{t.titulo}</div>
                        {t.prazo && <div style={{fontSize:11,color:atrasada?'var(--red)':'var(--text-muted)'}}>{new Date(t.prazo).toLocaleString('pt-BR')}</div>}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Tabs */}
          <div style={{background:'#fff',border:'1px solid var(--border-soft)',borderRadius:12,overflow:'hidden'}}>
            <div style={{display:'flex',borderBottom:'1px solid var(--border-soft)',overflowX:'auto'}}>
              {([
                ['historico','Histórico'],
                ['email','E-mail'],
                ['tarefas','Tarefas'],
                ['questionarios','Questionários'],
                ['produtos','Produtos'],
                ['arquivos','Arquivos'],
                ['propostas','Propostas'],
              ] as Array<[Tab,string]>).map(([k,l]) => (
                <button key={k} onClick={()=>setTab(k)}
                  style={{padding:'12px 18px',background:'transparent',border:'none',cursor:'pointer',fontSize:13,color:tab===k?'var(--teal)':'var(--text-muted)',fontWeight:tab===k?600:400,borderBottom:'2px solid '+(tab===k?'var(--teal)':'transparent'),whiteSpace:'nowrap'}}>
                  {l}
                </button>
              ))}
            </div>
            <div style={{padding:18,minHeight:220}}>
              {tab==='historico' && (() => {
                // Monta timeline unificada: anotacoes (com pin) + tarefas + eventos (logs)
                type Item = { kind:'nota'|'tarefa'|'log'; pinned:boolean; ts:number; raw:any }
                const items: Item[] = []
                notas.forEach(n => items.push({ kind:'nota', pinned: !!n.pinned, ts: new Date(n.criado_em).getTime(), raw: n }))
                // Inclui o campo obs do negócio (geralmente preenchido por importações antigas)
                // como item de histórico, exceto quando é um marcador interno do sistema.
                const obsTxt = String(negocio?.obs || '').trim()
                const obsInterno = /^movido_de_funil:|^Negócio:/.test(obsTxt)
                if (obsTxt && !obsInterno) {
                  items.push({
                    kind:'nota', pinned:false,
                    ts: new Date(negocio?.created_at || 0).getTime(),
                    raw: { id:'obs-'+id, conteudo: obsTxt, criado_em: negocio?.created_at, user_id: null, users: null, pinned: false, _origemObs: true },
                  })
                }
                tarefas.forEach(t => items.push({ kind:'tarefa', pinned:false, ts: new Date(t.created_at||t.prazo||0).getTime(), raw: t }))
                eventos.forEach(e => items.push({ kind:'log', pinned:false, ts: new Date(e.criado_em).getTime(), raw: e }))
                let filt = items
                if (filtroEventoTipo !== 'todos') {
                  const map: any = { anotacao:'nota', tarefa:'tarefa', log:'log', etapa:'log' }
                  filt = filt.filter(i => i.kind === map[filtroEventoTipo])
                  if (filtroEventoTipo === 'etapa') filt = filt.filter(i => /etapa|moveu|mudou/i.test(i.raw.acao || ''))
                }
                filt.sort((a,b) => (Number(b.pinned)-Number(a.pinned)) || (b.ts - a.ts))
                return (
                  <div>
                    {/* Criar anotação */}
                    <div style={{marginBottom:14,padding:12,border:'1px solid var(--border-soft)',borderRadius:8,background:'var(--bg-subtle)'}}>
                      <textarea value={novaAnotacao} onChange={e=>setNovaAnotacao(e.target.value)}
                        placeholder="Escreva uma anotação..." rows={2}
                        style={{width:'100%',border:'1px solid var(--border-soft)',borderRadius:6,padding:'8px 10px',fontSize:13,outline:'none',resize:'vertical',fontFamily:'inherit',background:'#fff',boxSizing:'border-box'}}/>
                      <div style={{display:'flex',justifyContent:'flex-end',marginTop:8}}>
                        <button onClick={criarAnotacao} disabled={criandoNota||!novaAnotacao.trim()}
                          style={{background:'var(--blue)',color:'#fff',border:'none',padding:'7px 14px',borderRadius:6,fontSize:12,fontWeight:600,cursor:'pointer',opacity:criandoNota||!novaAnotacao.trim()?0.5:1}}>
                          {criandoNota?'Salvando...':'+ Criar anotação'}
                        </button>
                      </div>
                    </div>

                    {/* Filtros Do / Exibir */}
                    <div style={{display:'flex',gap:10,marginBottom:14,alignItems:'center'}}>
                      <span style={{fontSize:11,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:0.5,fontWeight:600}}>Do</span>
                      <select value={filtroEventoOrigem} onChange={e=>setFiltroEventoOrigem(e.target.value as any)}
                        style={{padding:'6px 10px',border:'1px solid var(--border-soft)',borderRadius:6,fontSize:12,background:'#fff',outline:'none'}}>
                        <option value="todos">Todas as origens</option>
                        <option value="crm">CM CRM</option>
                        <option value="rd">RD Station CRM</option>
                      </select>
                      <span style={{fontSize:11,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:0.5,fontWeight:600}}>Exibir</span>
                      <select value={filtroEventoTipo} onChange={e=>setFiltroEventoTipo(e.target.value as any)}
                        style={{padding:'6px 10px',border:'1px solid var(--border-soft)',borderRadius:6,fontSize:12,background:'#fff',outline:'none'}}>
                        <option value="todos">Todos os eventos</option>
                        <option value="anotacao">Anotações</option>
                        <option value="etapa">Mudanças de etapa</option>
                        <option value="tarefa">Tarefas</option>
                        <option value="log">Outros eventos</option>
                      </select>
                    </div>

                    {filt.length === 0 && <div style={{textAlign:'center',color:'var(--text-muted)',fontSize:13,padding:24}}>Sem histórico registrado</div>}

                    <div style={{display:'flex',flexDirection:'column',gap:0,position:'relative'}}>
                      {filt.map((item, idx) => {
                        if (item.kind === 'nota') {
                          const n = item.raw
                          const ehObsImportada = !!n._origemObs
                          const podeEditar = !ehObsImportada && (me?.id === n.user_id || me?.role === 'admin')
                          const editando   = editandoNotaId === n.id
                          return (
                            <div key={'n'+n.id} style={{display:'flex',gap:10,paddingBottom:14,marginBottom:4,position:'relative',background:n.pinned?'rgba(201,168,76,0.06)':'transparent',borderRadius:n.pinned?8:0,padding:n.pinned?'10px 12px':'0 0 14px 0',border:n.pinned?'1px solid rgba(201,168,76,0.30)':'none'}}>
                              <div style={{width:8,height:8,borderRadius:'50%',background:n.pinned?'var(--gold)':'var(--blue)',marginTop:7,flexShrink:0}}/>
                              <div style={{flex:1,minWidth:0}}>
                                {editando ? (
                                  <div>
                                    <textarea value={editandoNotaTexto} onChange={e=>setEditandoNotaTexto(e.target.value)} rows={3}
                                      style={{width:'100%',border:'1px solid var(--border-soft)',borderRadius:6,padding:'8px 10px',fontSize:13,outline:'none',resize:'vertical',fontFamily:'inherit',background:'#fff',boxSizing:'border-box'}}/>
                                    <div style={{display:'flex',gap:6,justifyContent:'flex-end',marginTop:6}}>
                                      <button onClick={()=>{setEditandoNotaId(null);setEditandoNotaTexto('')}}
                                        style={{background:'transparent',border:'1px solid var(--border-soft)',borderRadius:6,padding:'5px 10px',fontSize:12,cursor:'pointer',color:'var(--text-muted)'}}>Cancelar</button>
                                      <button onClick={()=>salvarEdicaoNota(n.id, editandoNotaTexto)} disabled={!editandoNotaTexto.trim()}
                                        style={{background:'var(--blue)',color:'#fff',border:'none',borderRadius:6,padding:'5px 12px',fontSize:12,fontWeight:600,cursor:'pointer',opacity:editandoNotaTexto.trim()?1:0.5}}>Salvar</button>
                                    </div>
                                  </div>
                                ) : (
                                  <>
                                    <div style={{fontSize:13,color:'var(--text)',marginBottom:3,whiteSpace:'pre-wrap'}}>
                                      {n.pinned && <span style={{fontSize:10,fontWeight:700,padding:'1px 6px',borderRadius:4,background:'var(--gold-soft)',color:'var(--gold)',textTransform:'uppercase',letterSpacing:0.5,marginRight:6}}>📌 Fixada</span>}
                                      {ehObsImportada && <span style={{fontSize:10,fontWeight:700,padding:'1px 6px',borderRadius:4,background:'rgba(148,163,184,0.18)',color:'#64748b',textTransform:'uppercase',letterSpacing:0.5,marginRight:6}}>importada</span>}
                                      {n.conteudo}
                                    </div>
                                    <div style={{fontSize:11,color:'var(--text-muted)'}}>
                                      {ehObsImportada ? 'Importada da planilha' : (n.users?.nome || '—')}{n.criado_em ? ' · ' + new Date(n.criado_em).toLocaleString('pt-BR') : ''}
                                    </div>
                                  </>
                                )}
                              </div>
                              {!editando && !ehObsImportada && (
                                <div style={{display:'flex',gap:4,alignSelf:'flex-start'}}>
                                  <button onClick={()=>togglePin(n)} title={n.pinned?'Desfixar':'Fixar no topo'}
                                    style={{background:'transparent',border:'1px solid var(--border-soft)',borderRadius:6,padding:'4px 7px',cursor:'pointer',fontSize:12,color:n.pinned?'var(--gold)':'var(--text-muted)'}}>
                                    {n.pinned?'📌':'📍'}
                                  </button>
                                  {podeEditar && (
                                    <button onClick={()=>{setEditandoNotaId(n.id);setEditandoNotaTexto(n.conteudo||'')}} title="Editar"
                                      style={{background:'transparent',border:'1px solid var(--border-soft)',borderRadius:6,padding:'4px 7px',cursor:'pointer',fontSize:12,color:'var(--text-muted)'}}>✎</button>
                                  )}
                                  {podeEditar && (
                                    <button onClick={()=>excluirNota(n.id)} title="Excluir"
                                      style={{background:'transparent',border:'1px solid var(--border-soft)',borderRadius:6,padding:'4px 7px',cursor:'pointer',fontSize:12,color:'var(--text-muted)'}}>🗑</button>
                                  )}
                                </div>
                              )}
                            </div>
                          )
                        }
                        if (item.kind === 'tarefa') {
                          const t = item.raw
                          return (
                            <div key={'t'+t.id} style={{display:'flex',gap:10,paddingBottom:10,borderBottom:'1px solid var(--border-soft)',marginBottom:10}}>
                              <div style={{width:8,height:8,borderRadius:'50%',background:t.status==='concluida'?'var(--teal)':'var(--gold)',marginTop:7,flexShrink:0}}/>
                              <div style={{flex:1}}>
                                <div style={{fontSize:13,color:'var(--text)'}}>{t.status==='concluida'?'✅':'📋'} {t.titulo}</div>
                                <div style={{fontSize:11,color:'var(--text-muted)'}}>Tarefa · {t.prazo ? new Date(t.prazo).toLocaleString('pt-BR') : 'sem prazo'}</div>
                              </div>
                            </div>
                          )
                        }
                        const e = item.raw
                        return (
                          <div key={'e'+e.id} style={{display:'flex',gap:10,paddingBottom:10,borderBottom:'1px solid var(--border-soft)',marginBottom:10}}>
                            <div style={{width:8,height:8,borderRadius:'50%',background:'var(--teal)',marginTop:7,flexShrink:0}}/>
                            <div style={{flex:1}}>
                              <div style={{fontSize:13,color:'var(--text)'}}>{e.acao || 'evento'} {e.recurso ? <span style={{color:'var(--text-muted)'}}>· {e.recurso}</span> : null}</div>
                              <div style={{fontSize:11,color:'var(--text-muted)'}}>{new Date(e.criado_em).toLocaleString('pt-BR')}</div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })()}
              {tab==='tarefas' && (
                <div>
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
                    <div style={{display:'flex',alignItems:'center',gap:8}}>
                      <span style={{fontSize:12,color:'var(--text-muted)'}}>Em</span>
                      <select disabled value="pendentes"
                        style={{padding:'6px 10px',border:'1px solid var(--border-soft)',borderRadius:6,fontSize:12,background:'#fff',outline:'none'}}>
                        <option value="pendentes">Tarefas pendentes</option>
                        <option value="todas">Todas as tarefas</option>
                        <option value="concluidas">Tarefas concluídas</option>
                      </select>
                    </div>
                    <button onClick={()=>setModalTarefa(true)}
                      style={{background:'var(--blue-soft)',color:'var(--blue-dark)',border:'1px solid #bfdbfe',padding:'8px 14px',borderRadius:8,fontSize:13,fontWeight:600,cursor:'pointer'}}>
                      + Criar tarefa
                    </button>
                  </div>
                  {tarefas.length === 0 ? (
                    <div style={{display:'flex',alignItems:'center',gap:18,padding:'28px 24px',border:'1px solid var(--border-soft)',borderRadius:12,background:'var(--bg)'}}>
                      <div style={{fontSize:48}}>📋</div>
                      <div style={{color:'var(--blue-dark)',fontSize:14}}>Crie tarefas e faça sua própria gestão sem precisar sair do CRM</div>
                    </div>
                  ) : (
                    <div style={{display:'flex',flexDirection:'column',gap:8}}>
                      {tarefas.map(t=>(
                        <div key={t.id} style={{display:'flex',gap:10,padding:'12px 14px',border:'1px solid var(--border-soft)',borderRadius:10,background:'#fff'}}>
                          <span style={{fontSize:14}}>{t.status==='concluida'?'✅':'📋'}</span>
                          <div style={{flex:1}}>
                            <div style={{fontSize:13,fontWeight:600,color:'var(--text)'}}>{t.titulo}</div>
                            {t.descricao && <div style={{fontSize:11,color:'var(--text-muted)',marginTop:2}}>{t.descricao}</div>}
                            {t.prazo && <div style={{fontSize:11,color:'var(--text-muted)',marginTop:2}}>📅 {new Date(t.prazo).toLocaleString('pt-BR')}</div>}
                          </div>
                          <span style={{fontSize:10,fontWeight:700,padding:'3px 8px',borderRadius:4,background:t.status==='concluida'?'rgba(28,181,160,0.15)':'rgba(217,119,6,0.15)',color:t.status==='concluida'?'var(--teal)':'#a16207',textTransform:'uppercase',letterSpacing:0.5,alignSelf:'flex-start'}}>
                            {t.status === 'concluida' ? 'Concluída' : t.status === 'em_andamento' ? 'Em andamento' : 'Pendente'}
                          </span>
                          <div style={{display:'flex',gap:4,alignSelf:'flex-start'}}>
                            {t.status !== 'concluida' && (
                              <button title="Marcar como realizada" onClick={async ()=>{ const { error } = await supabase.from('tarefas').update({ status:'concluida', concluida_em: new Date().toISOString() }).eq('id', t.id); if (error) alert(error.message); else setTarefas(prev => prev.map(x => x.id===t.id ? { ...x, status:'concluida' } : x)) }}
                                style={{padding:'4px 8px',border:'1px solid var(--teal)',background:'transparent',color:'var(--teal)',borderRadius:6,cursor:'pointer',fontSize:11,fontWeight:600}}>✓ Realizada</button>
                            )}
                            {t.status === 'concluida' && (
                              <button title="Reabrir" onClick={async ()=>{ const { error } = await supabase.from('tarefas').update({ status:'pendente', concluida_em: null }).eq('id', t.id); if (error) alert(error.message); else setTarefas(prev => prev.map(x => x.id===t.id ? { ...x, status:'pendente' } : x)) }}
                                style={{padding:'4px 8px',border:'1px solid var(--border-strong)',background:'transparent',color:'var(--text-muted)',borderRadius:6,cursor:'pointer',fontSize:11}}>↺</button>
                            )}
                            <button title="Excluir" onClick={async ()=>{ if(!confirm('Excluir esta tarefa?')) return; const { error } = await supabase.from('tarefas').delete().eq('id', t.id); if (error) alert(error.message); else setTarefas(prev => prev.filter(x => x.id !== t.id)) }}
                              style={{padding:'4px 8px',border:'1px solid var(--red)',background:'transparent',color:'var(--red)',borderRadius:6,cursor:'pointer',fontSize:11}}>×</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {tab==='email' && (
                <div>
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
                    <div style={{display:'flex',alignItems:'center',gap:8}}>
                      <span style={{fontSize:12,color:'var(--text-muted)'}}>Exibir</span>
                      <select disabled value="tudo"
                        style={{padding:'6px 10px',border:'1px solid var(--border-soft)',borderRadius:6,fontSize:12,background:'#fff',outline:'none'}}>
                        <option value="tudo">Tudo</option>
                      </select>
                    </div>
                    <button onClick={()=>{ const email = cliente?.email || negocio.email_negocio; if (email) router.push(`/dashboard/email?para=${encodeURIComponent(email)}`); else alert('Cadastre um e-mail no contato/negociação para enviar.') }}
                      style={{background:'var(--blue-soft)',color:'var(--blue-dark)',border:'1px solid #bfdbfe',padding:'8px 14px',borderRadius:8,fontSize:13,fontWeight:600,cursor:'pointer'}}>
                      + Criar e-mail
                    </button>
                  </div>
                  <div style={{display:'flex',alignItems:'center',gap:18,padding:'28px 24px',border:'1px solid var(--border-soft)',borderRadius:12,background:'var(--bg)'}}>
                    <div style={{fontSize:48}}>📧</div>
                    <div style={{color:'var(--blue-dark)',fontSize:14}}>Não há e-mails com este filtro, tente outra opção</div>
                  </div>
                </div>
              )}
              {tab==='questionarios' && <div style={{textAlign:'center',color:'var(--text-muted)',fontSize:13,padding:24}}>Sem questionários cadastrados.</div>}
              {tab==='produtos' && (
                <div>
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
                    <div style={{display:'flex',alignItems:'center',gap:8}}>
                      <span style={{fontSize:12,color:'var(--text-muted)'}}>Exibir</span>
                      <select disabled value="atual"
                        style={{padding:'6px 10px',border:'1px solid var(--border-soft)',borderRadius:6,fontSize:12,background:'#fff',outline:'none'}}>
                        <option value="atual">Proposta atual</option>
                      </select>
                    </div>
                    <button onClick={()=>setModalProduto(true)}
                      style={{background:'var(--blue-soft)',color:'var(--blue-dark)',border:'1px solid #bfdbfe',padding:'8px 14px',borderRadius:8,fontSize:13,fontWeight:600,cursor:'pointer'}}>
                      + Adicionar produto ou serviço
                    </button>
                  </div>
                  {produtos.length === 0 ? (
                    <div style={{display:'flex',alignItems:'center',gap:18,padding:'28px 24px',border:'1px solid var(--border-soft)',borderRadius:12,background:'var(--bg)'}}>
                      <div style={{fontSize:48}}>📦</div>
                      <div style={{color:'var(--blue-dark)',fontSize:14}}>Não há nenhum produto ou serviço na proposta atual</div>
                    </div>
                  ) : (
                    <div style={{display:'flex',flexDirection:'column',gap:8}}>
                      {produtos.map(p => (
                        <div key={p.id} style={{display:'grid',gridTemplateColumns:'1fr auto auto auto 30px',gap:14,alignItems:'center',padding:'12px 14px',border:'1px solid var(--border-soft)',borderRadius:10,background:'#fff'}}>
                          <div>
                            <div style={{fontSize:13,fontWeight:600,color:'var(--text)'}}>{p.nome_snapshot || 'Produto'}</div>
                            {p.observacao && <div style={{fontSize:11,color:'var(--text-muted)',marginTop:2}}>{p.observacao}</div>}
                          </div>
                          <div style={{fontSize:12,color:'var(--text-muted)'}}>Qtd: <strong style={{color:'var(--text)'}}>{p.quantidade||1}</strong></div>
                          <div style={{fontSize:12,color:'var(--text-muted)'}}>Unit.: <strong style={{color:'var(--text)'}}>R$ {Number(p.valor_unit||0).toLocaleString('pt-BR',{minimumFractionDigits:2})}</strong></div>
                          <div style={{fontSize:13,color:'var(--teal)',fontWeight:600}}>R$ {(Number(p.valor_unit||0) * Number(p.quantidade||1)).toLocaleString('pt-BR',{minimumFractionDigits:2})}</div>
                          <button onClick={()=>removerProduto(p.id)} title="Remover"
                            style={{background:'transparent',border:'none',cursor:'pointer',color:'var(--text-muted)',fontSize:14}}>🗑</button>
                        </div>
                      ))}
                      {(() => {
                        const total = produtos.reduce((s,p)=>s + Number(p.valor_unit||0)*Number(p.quantidade||1), 0)
                        return (
                          <div style={{display:'flex',justifyContent:'flex-end',gap:14,padding:'10px 14px',fontSize:13}}>
                            <span style={{color:'var(--text-muted)'}}>Total</span>
                            <strong style={{color:'var(--teal)'}}>R$ {total.toLocaleString('pt-BR',{minimumFractionDigits:2})}</strong>
                          </div>
                        )
                      })()}
                    </div>
                  )}
                </div>
              )}
              {tab==='arquivos' && (
                <div>
                  <UploadAnexo
                    categoria="negocio"
                    negocioId={id}
                    label="Anexar arquivo (PDF, imagens, planilhas...)"
                    anexosExistentes={anexos}
                    onUpload={(a)=> setAnexos(prev => [a, ...prev])}
                  />
                </div>
              )}
              {tab==='propostas' && <div style={{textAlign:'center',color:'var(--text-muted)',fontSize:13,padding:24}}>Propostas vinculadas serão exibidas aqui.</div>}
            </div>
          </div>
        </div>
      </div>

      {modalTarefa && (() => {
        const labelStyle: React.CSSProperties = { display:'block', fontSize:12, fontWeight:600, marginBottom:6, color:'var(--text)' }
        const inputStyle: React.CSSProperties = { width:'100%', padding:'10px 12px', border:'1px solid var(--border-soft)', borderRadius:8, fontSize:13, outline:'none', boxSizing:'border-box', background:'#fff', fontFamily:'inherit' }
        return (
        <>
          <div onClick={()=>setModalTarefa(false)} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',zIndex:1000}}/>
          <div style={{position:'fixed',top:0,right:0,bottom:0,width:'min(420px,100vw)',background:'#fff',zIndex:1001,boxShadow:'-8px 0 32px rgba(0,0,0,0.18)',display:'flex',flexDirection:'column'}}>
            <div style={{padding:'18px 22px',borderBottom:'1px solid var(--border-soft)',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              <div style={{fontSize:16,fontWeight:700,color:'var(--text)'}}>Criar Tarefa</div>
              <button onClick={()=>setModalTarefa(false)} style={{background:'none',border:'none',cursor:'pointer',fontSize:18,color:'var(--text-muted)'}}>✕</button>
            </div>
            <div style={{flex:1,overflow:'auto',padding:'18px 22px'}}>
              <label style={{...labelStyle,marginTop:0}}>Empresa / Cliente</label>
              <input readOnly value={cliente?.nome || negocio.empresa || '—'} style={{...inputStyle,background:'var(--bg-subtle)'}} />

              <label style={{...labelStyle,marginTop:14}}>Negociação *</label>
              <input readOnly value={negocio.titulo || ''} style={{...inputStyle,background:'var(--bg-subtle)'}} />

              <label style={{...labelStyle,marginTop:14}}>Assunto da tarefa *</label>
              <input autoFocus value={formTarefa.assunto} onChange={e=>setFormTarefa(f=>({...f,assunto:e.target.value}))}
                placeholder="Assunto da tarefa" style={inputStyle} />

              <label style={{...labelStyle,marginTop:14}}>Descrição</label>
              <textarea rows={3} value={formTarefa.descricao} onChange={e=>setFormTarefa(f=>({...f,descricao:e.target.value}))}
                style={{...inputStyle,resize:'vertical'}} />

              <label style={{...labelStyle,marginTop:14}}>Responsável *</label>
              <select value={formTarefa.responsavel_id} onChange={e=>setFormTarefa(f=>({...f,responsavel_id:e.target.value}))} style={inputStyle}>
                <option value="">— Eu mesmo —</option>
                {usuariosAll.map(u=> <option key={u.id} value={u.id}>{u.nome}</option>)}
              </select>

              <label style={{...labelStyle,marginTop:14}}>Tipo de tarefa *</label>
              <select value={formTarefa.tipo} onChange={e=>setFormTarefa(f=>({...f,tipo:e.target.value}))} style={inputStyle}>
                <option value="tarefa">Tarefa</option>
                <option value="ligacao">Ligação</option>
                <option value="reuniao">Reunião</option>
                <option value="visita">Visita</option>
                <option value="email">E-mail</option>
                <option value="whatsapp">WhatsApp</option>
              </select>

              <div style={{display:'grid',gridTemplateColumns:'1fr 120px',gap:10,marginTop:14}}>
                <div>
                  <label style={labelStyle}>Data *</label>
                  <input type="date" value={formTarefa.data} onChange={e=>setFormTarefa(f=>({...f,data:e.target.value}))} style={inputStyle}/>
                </div>
                <div>
                  <label style={labelStyle}>Horário *</label>
                  <input type="time" value={formTarefa.hora} onChange={e=>setFormTarefa(f=>({...f,hora:e.target.value}))} style={inputStyle}/>
                </div>
              </div>

              <label style={{display:'flex',alignItems:'center',gap:8,marginTop:16,fontSize:13,color:'var(--text)',cursor:'pointer'}}>
                <input type="checkbox" checked={formTarefa.concluida} onChange={e=>setFormTarefa(f=>({...f,concluida:e.target.checked}))}/>
                Marcar como concluída ao criar
              </label>
            </div>
            <div style={{padding:'14px 22px',borderTop:'1px solid var(--border-soft)',display:'flex',gap:10,justifyContent:'flex-end'}}>
              <button onClick={()=>setModalTarefa(false)}
                style={{padding:'9px 16px',borderRadius:8,border:'1px solid var(--blue)',background:'#fff',color:'var(--blue)',cursor:'pointer',fontSize:13,fontWeight:600}}>Cancelar</button>
              <button onClick={salvarNovaTarefa} disabled={salvandoTarefa}
                style={{padding:'9px 18px',borderRadius:8,border:'none',background:'var(--text)',color:'#fff',cursor:'pointer',fontSize:13,fontWeight:600,opacity:salvandoTarefa?0.5:1}}>
                {salvandoTarefa?'Salvando...':'Salvar'}
              </button>
            </div>
          </div>
        </>
        )
      })()}

      {modalPerda && (
        <>
          <div onClick={()=>setModalPerda(false)} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',zIndex:1000}}/>
          <div style={{position:'fixed',top:'50%',left:'50%',transform:'translate(-50%,-50%)',width:'min(440px,94vw)',background:'#fff',zIndex:1001,borderRadius:12,boxShadow:'var(--shadow-lg)'}}>
            <div style={{padding:'18px 22px',borderBottom:'1px solid var(--border-soft)',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              <div style={{fontSize:16,fontWeight:700,color:'var(--text)'}}>👎 Marcar negociação como perdida</div>
              <button onClick={()=>setModalPerda(false)} style={{background:'none',border:'none',cursor:'pointer',fontSize:18,color:'var(--text-muted)'}}>✕</button>
            </div>
            <div style={{padding:'18px 22px',display:'flex',flexDirection:'column',gap:12}}>
              <div>
                <label style={{display:'block',fontSize:12,fontWeight:600,marginBottom:6,color:'var(--text)'}}>Motivo da perda *</label>
                <select autoFocus value={motivoSelecionado} onChange={e=>setMotivoSelecionado(e.target.value)}
                  style={{width:'100%',padding:'9px 12px',border:'1px solid var(--border-soft)',borderRadius:8,fontSize:13,outline:'none',background:'#fff'}}>
                  <option value="">— selecione um motivo —</option>
                  {motivosPerda.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
                  <option value="__novo__">＋ Cadastrar novo motivo…</option>
                </select>
              </div>
              {motivoSelecionado === '__novo__' && (
                <div>
                  <label style={{display:'block',fontSize:12,fontWeight:600,marginBottom:6,color:'var(--text)'}}>Nome do novo motivo *</label>
                  <input value={motivoCustom} onChange={e=>setMotivoCustom(e.target.value)} placeholder="Ex: Cliente postergou compra"
                    style={{width:'100%',padding:'9px 12px',border:'1px solid var(--border-soft)',borderRadius:8,fontSize:13,outline:'none',boxSizing:'border-box'}}/>
                </div>
              )}
              <div>
                <label style={{display:'block',fontSize:12,fontWeight:600,marginBottom:6,color:'var(--text)'}}>Anotação (opcional)</label>
                <textarea value={anotacaoPerda} onChange={e=>setAnotacaoPerda(e.target.value)} rows={3}
                  placeholder="Detalhes da perda, próximos passos, etc."
                  style={{width:'100%',padding:'9px 12px',border:'1px solid var(--border-soft)',borderRadius:8,fontSize:13,outline:'none',boxSizing:'border-box',resize:'vertical',fontFamily:'inherit'}}/>
              </div>
            </div>
            <div style={{padding:'14px 22px',borderTop:'1px solid var(--border-soft)',display:'flex',gap:10,justifyContent:'flex-end'}}>
              <button onClick={()=>setModalPerda(false)} disabled={salvandoPerda}
                style={{padding:'9px 16px',borderRadius:8,border:'1px solid var(--border-soft)',background:'#fff',color:'var(--text)',cursor:'pointer',fontSize:13,fontWeight:600}}>Cancelar</button>
              <button onClick={confirmarPerda} disabled={salvandoPerda || !motivoSelecionado || (motivoSelecionado==='__novo__' && !motivoCustom.trim())}
                style={{padding:'9px 18px',borderRadius:8,border:'none',background:'var(--red)',color:'#fff',cursor:'pointer',fontSize:13,fontWeight:600,opacity:(salvandoPerda || !motivoSelecionado || (motivoSelecionado==='__novo__' && !motivoCustom.trim()))?0.5:1}}>
                {salvandoPerda?'Salvando...':'Confirmar perda'}
              </button>
            </div>
          </div>
        </>
      )}

      {modalProduto && (() => {
        const labelStyle: React.CSSProperties = { display:'block', fontSize:12, fontWeight:600, marginBottom:6, color:'var(--text)' }
        const inputStyle: React.CSSProperties = { width:'100%', padding:'10px 12px', border:'1px solid var(--border-soft)', borderRadius:8, fontSize:13, outline:'none', boxSizing:'border-box', background:'#fff' }
        return (
        <>
          <div onClick={()=>setModalProduto(false)} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',zIndex:1000}}/>
          <div style={{position:'fixed',top:0,right:0,bottom:0,width:'min(420px,100vw)',background:'#fff',zIndex:1001,boxShadow:'-8px 0 32px rgba(0,0,0,0.18)',display:'flex',flexDirection:'column'}}>
            <div style={{padding:'18px 22px',borderBottom:'1px solid var(--border-soft)',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              <div style={{fontSize:16,fontWeight:700,color:'var(--text)'}}>Adicionar produto ou serviço</div>
              <button onClick={()=>setModalProduto(false)} style={{background:'none',border:'none',cursor:'pointer',fontSize:18,color:'var(--text-muted)'}}>✕</button>
            </div>
            <div style={{flex:1,overflow:'auto',padding:'18px 22px'}}>
              <div style={{marginBottom:14}}>
                <label style={labelStyle}>Produto ou serviço</label>
                <select value={formProduto.produto_id} onChange={e=>{
                  const p = produtosAll.find(x => x.id === e.target.value)
                  setFormProduto(f=>({...f, produto_id:e.target.value, valor_unit: p?.preco_base ? String(p.preco_base).replace('.',',') : f.valor_unit}))
                }} style={inputStyle}>
                  <option value="">Selecione</option>
                  {produtosAll.map(p=> <option key={p.id} value={p.id}>{p.nome}</option>)}
                </select>
                <Link href="/dashboard/configuracoes?aba=produtos" target="_blank"
                  style={{display:'inline-block',marginTop:8,fontSize:13,color:'var(--blue)',textDecoration:'none',fontWeight:600}}>
                  + Criar novo produto ou serviço
                </Link>
              </div>

              <div style={{marginBottom:14}}>
                <label style={labelStyle}>Quantidade</label>
                <input type="number" min={1} value={formProduto.quantidade} onChange={e=>setFormProduto(f=>({...f,quantidade:e.target.value}))}
                  style={inputStyle}/>
              </div>

              <div style={{marginBottom:14}}>
                <label style={labelStyle}>Valor</label>
                <input value={formProduto.valor_unit} onChange={e=>setFormProduto(f=>({...f,valor_unit:e.target.value}))} placeholder="0"
                  style={inputStyle}/>
              </div>

              <div style={{marginBottom:14}}>
                <label style={labelStyle}>Recorrência</label>
                <select value={formProduto.recorrencia} onChange={e=>setFormProduto(f=>({...f,recorrencia:e.target.value}))}
                  style={inputStyle}>
                  <option value="unica">Única</option>
                  <option value="mensal">Mensal</option>
                  <option value="trimestral">Trimestral</option>
                  <option value="semestral">Semestral</option>
                  <option value="anual">Anual</option>
                </select>
              </div>

              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 0',borderTop:'1px solid var(--border-soft)'}}>
                <div style={{fontSize:13,fontWeight:600,color:'var(--text)'}}>Acrescentar desconto</div>
                <button type="button" onClick={()=>setFormProduto(f=>({...f,addDesconto:!f.addDesconto}))}
                  style={{width:38,height:22,borderRadius:999,border:'none',cursor:'pointer',background:formProduto.addDesconto?'#22d3ee':'var(--border-strong)',position:'relative'}}>
                  <span style={{position:'absolute',top:3,left:formProduto.addDesconto?19:3,width:16,height:16,borderRadius:'50%',background:'#fff',transition:'left 0.2s'}}/>
                </button>
              </div>
              {formProduto.addDesconto && (
                <div style={{marginBottom:14}}>
                  <label style={labelStyle}>Desconto (R$)</label>
                  <input value={formProduto.desconto} onChange={e=>setFormProduto(f=>({...f,desconto:e.target.value}))} placeholder="0,00"
                    style={inputStyle}/>
                </div>
              )}

              <div style={{marginTop:14}}>
                <label style={labelStyle}>Observação</label>
                <textarea value={formProduto.obs} onChange={e=>setFormProduto(f=>({...f,obs:e.target.value}))} rows={2}
                  style={{...inputStyle, fontFamily:'inherit', resize:'vertical'}}/>
              </div>
            </div>
            <div style={{padding:'14px 22px',borderTop:'1px solid var(--border-soft)',display:'flex',gap:10,justifyContent:'flex-end'}}>
              <button onClick={()=>setModalProduto(false)}
                style={{padding:'9px 16px',borderRadius:8,border:'1px solid var(--blue)',background:'#fff',color:'var(--blue)',cursor:'pointer',fontSize:13,fontWeight:600}}>Cancelar</button>
              <button onClick={salvarProduto} disabled={salvandoProduto||!formProduto.produto_id}
                style={{padding:'9px 18px',borderRadius:8,border:'none',background:'var(--text)',color:'#fff',cursor:'pointer',fontSize:13,fontWeight:600,opacity:(salvandoProduto||!formProduto.produto_id)?0.5:1}}>
                {salvandoProduto?'Salvando...':'Salvar'}
              </button>
            </div>
          </div>
        </>
        )
      })()}
    </div>
  )
}

function PainelSection({ title, open, onToggle, children, action }: { title:string; open:boolean; onToggle:()=>void; children:React.ReactNode; action?: React.ReactNode }) {
  return (
    <div style={{background:'#fff',border:'1px solid var(--border-soft)',borderRadius:12,overflow:'hidden'}}>
      <div style={{display:'flex',alignItems:'center',padding:'10px 12px 10px 16px',gap:8}}>
        <button onClick={onToggle}
          style={{flex:1,textAlign:'left',background:'transparent',border:'none',cursor:'pointer',fontSize:13,fontWeight:700,color:'var(--text)',padding:0}}>
          {title}
        </button>
        {action}
        <button onClick={onToggle}
          style={{background:'transparent',border:'none',cursor:'pointer',fontSize:11,color:'var(--text-muted)',padding:'2px 4px',transform:open?'rotate(180deg)':'none',transition:'transform 0.18s'}}>▾</button>
      </div>
      {open && <div style={{padding:'0 16px 14px'}}>{children}</div>}
    </div>
  )
}

function KV({ label, value, mono }: { label:string; value:any; mono?:boolean }) {
  return (
    <div style={{display:'grid',gridTemplateColumns:'110px 1fr',gap:8,padding:'5px 0',fontSize:12,alignItems:'baseline'}}>
      <span style={{color:'var(--text-muted)',fontSize:11,textTransform:'uppercase',letterSpacing:0.5}}>{label}</span>
      <span style={{color:'var(--text)',fontFamily:mono?'monospace':'inherit',overflowWrap:'anywhere'}}>{value || '—'}</span>
    </div>
  )
}

type EditableType = 'text' | 'email' | 'date' | 'moeda' | 'percentual' | 'qualificacao'
function EditableField({ label, value, onSave, type='text', readOnly, options }: {
  label: string; value: any; onSave?: (v:any)=>void|Promise<void>; type?: EditableType; readOnly?: boolean; options?: { value: string|number; label: string }[]
}) {
  const [editing, setEditing] = useState(false)
  const [hover, setHover]     = useState(false)
  const [draft, setDraft]     = useState<any>(value ?? '')
  const [copied, setCopied]   = useState(false)
  const [saving, setSaving]   = useState(false)
  useEffect(()=>{ setDraft(value ?? '') }, [value])

  function startEdit(e?: React.MouseEvent) {
    if (readOnly) return
    e?.stopPropagation()
    setEditing(true)
  }
  async function commit() {
    if (readOnly || !onSave) { setEditing(false); return }
    setSaving(true)
    let v: any = draft
    if (type === 'moeda' || type === 'percentual') v = draft === '' ? null : Number(String(draft).replace(/\./g,'').replace(',','.'))
    if (type === 'qualificacao') v = Number(draft) || 0
    try { await onSave(v) } catch (e:any) { alert('Erro ao salvar: ' + (e?.message || e)) }
    setSaving(false)
    setEditing(false)
  }
  function copy(e: React.MouseEvent) {
    e.stopPropagation()
    const txt = String(value ?? '').trim()
    if (!txt) return
    try {
      navigator.clipboard.writeText(txt)
      setCopied(true); setTimeout(()=>setCopied(false), 1200)
    } catch {}
  }

  // Renderização do valor formatado
  let display: React.ReactNode = '—'
  if (value !== null && value !== undefined && value !== '') {
    if (type === 'moeda')        display = `R$ ${Number(value).toLocaleString('pt-BR',{minimumFractionDigits:2})}`
    else if (type === 'percentual') display = `${Number(value).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}%`
    else if (type === 'qualificacao') display = value ? '★'.repeat(Number(value)) + '☆'.repeat(Math.max(0,5-Number(value))) : '—'
    else if (type === 'date') {
      const s = String(value).slice(0, 10)
      const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
      display = m ? `${m[3]}/${m[2]}/${m[1]}` : s
    }
    else                          display = String(value)
  }

  const rowStyle: React.CSSProperties = {
    display:'grid', gridTemplateColumns:'110px 1fr auto', gap:8, padding:'5px 6px',
    fontSize:12, alignItems:'center', borderRadius:6,
    background: hover && !editing && !readOnly ? 'var(--bg-subtle)' : 'transparent',
    cursor: editing || readOnly ? 'default' : 'pointer',
  }
  const labelStyle: React.CSSProperties = { color:'var(--text-muted)', fontSize:11, textTransform:'uppercase', letterSpacing:0.5 }
  const inputStyle: React.CSSProperties = { width:'100%', padding:'4px 8px', border:'1px solid var(--border-strong)', borderRadius:6, fontSize:12, outline:'none', boxSizing:'border-box' }

  return (
    <div style={rowStyle}
      onClick={startEdit}
      onMouseEnter={()=>setHover(true)}
      onMouseLeave={()=>setHover(false)}>
      <span style={labelStyle}>{label}</span>
      {editing ? (
        options ? (
          <select autoFocus value={String(draft ?? '')}
            onClick={e=>e.stopPropagation()}
            onChange={async (e)=>{ const v=e.target.value; setDraft(v); if (onSave){ setSaving(true); try{ await onSave(type==='percentual'||type==='moeda'? (v===''?null:Number(v)) : v) } finally { setSaving(false); setEditing(false) } } }}
            onBlur={()=>setEditing(false)}
            style={{...inputStyle, background:'#fff'}}>
            <option value="">— Selecione —</option>
            {options.map(o => <option key={String(o.value)} value={String(o.value)}>{o.label}</option>)}
          </select>
        ) : type === 'qualificacao' ? (
          <div onClick={e=>e.stopPropagation()} style={{display:'flex',gap:2}}>
            {[1,2,3,4,5].map(n => (
              <button key={n} type="button" onClick={()=>setDraft(n===Number(draft)?0:n)}
                style={{background:'none',border:'none',padding:0,cursor:'pointer',fontSize:16,color:n<=Number(draft)?'var(--gold)':'var(--text-faint)'}}>★</button>
            ))}
            <button onClick={commit} disabled={saving}
              style={{marginLeft:8,fontSize:11,padding:'2px 8px',borderRadius:6,border:'1px solid var(--blue)',background:'var(--blue)',color:'#fff',cursor:'pointer'}}>OK</button>
          </div>
        ) : type === 'date' ? (
          /* Input mascarado dd/mm/aaaa — permite apagar 1 dígito por vez
             (o native <input type=date> apaga blocos inteiros). */
          (() => {
            const toBR = (v: any) => {
              const s = String(v ?? '')
              const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
              if (m) return `${m[3]}/${m[2]}/${m[1]}`
              return s
            }
            const draftBR = typeof draft === 'string' && /^\d{4}-\d{2}-\d{2}/.test(draft) ? toBR(draft) : (draft || '')
            const mask = (raw: string) => {
              const d = raw.replace(/\D/g,'').slice(0,8)
              if (d.length <= 2) return d
              if (d.length <= 4) return d.slice(0,2)+'/'+d.slice(2)
              return d.slice(0,2)+'/'+d.slice(2,4)+'/'+d.slice(4)
            }
            const toISO = (br: string) => {
              const m = br.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
              if (!m) return ''
              return `${m[3]}-${m[2]}-${m[1]}`
            }
            return (
              <input autoFocus value={draftBR}
                inputMode="numeric"
                placeholder="dd/mm/aaaa"
                maxLength={10}
                onClick={e=>e.stopPropagation()}
                onChange={e=>setDraft(mask(e.target.value))}
                onBlur={async () => {
                  if (readOnly || !onSave) { setEditing(false); return }
                  const cur = String(draft || '')
                  const iso = cur ? toISO(cur) : ''
                  if (cur && !iso) { alert('Data inválida. Use dd/mm/aaaa.'); return }
                  setSaving(true)
                  try { await onSave(iso || null) } catch(e:any) { alert('Erro ao salvar: '+(e?.message||e)) }
                  setSaving(false)
                  setEditing(false)
                }}
                onKeyDown={e=>{ if (e.key==='Enter') (e.target as HTMLInputElement).blur(); if (e.key==='Escape') { setDraft(value??''); setEditing(false) } }}
                disabled={saving}
                style={inputStyle} />
            )
          })()
        ) : (
          <input autoFocus value={draft}
            type={type==='email'?'email':'text'}
            onClick={e=>e.stopPropagation()}
            onChange={e=>setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={e=>{ if (e.key==='Enter') { (e.target as HTMLInputElement).blur() } if (e.key==='Escape') { setDraft(value??''); setEditing(false) } }}
            disabled={saving}
            style={inputStyle} />
        )
      ) : (
        <span style={{color:'var(--text)',overflowWrap:'anywhere'}}>{display}</span>
      )}
      <div style={{display:'flex',gap:2,visibility: hover && !editing ? 'visible' : 'hidden'}} onClick={e=>e.stopPropagation()}>
        {!readOnly && (
          <button onClick={startEdit} title="Editar"
            style={{background:'transparent',border:'none',padding:'2px 5px',cursor:'pointer',color:'var(--text-muted)',fontSize:12}}>✏️</button>
        )}
        {value !== null && value !== undefined && value !== '' && (
          <button onClick={copy} title={copied?'Copiado!':'Copiar valor'}
            style={{background:'transparent',border:'none',padding:'2px 5px',cursor:'pointer',color:copied?'var(--teal)':'var(--text-muted)',fontSize:12}}>
            {copied?'✓':'📋'}
          </button>
        )}
      </div>
    </div>
  )
}
