'use client'
import { Suspense, useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'
import { getVisibleUserIds } from '@/lib/auth'

export default function FunisPageWrapper() {
  return (
    <Suspense fallback={<div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',color:'var(--text-muted)'}}>Carregando...</div>}>
      <FunisPage />
    </Suspense>
  )
}

function FunisPage() {
  const supabase = createClient()
  const router   = useRouter()
  const searchParams = useSearchParams()

  const [profile, setProfile]     = useState<any>(null)
  const [funis, setFunis]         = useState<any[]>([])
  const [negocios, setNegocios]   = useState<any[]>([])
  const [contagemPorFunil, setContagemPorFunil] = useState<Record<string, number>>({})
  const [usuarios, setUsuarios]   = useState<any[]>([])
  const [loading, setLoading]     = useState(true)
  const [funilAtivo, setFunilAtivo] = useState<string|null>(null)
  const [seletorAberto, setSeletorAberto] = useState(false)
  const kanbanRef = useRef<HTMLDivElement>(null)
  const topScrollRef = useRef<HTMLDivElement>(null)
  const [kanbanWidth, setKanbanWidth] = useState(0)

  // Motivos de perda (admin cadastra em /dashboard/configuracoes)
  const [motivosPerda, setMotivosPerda] = useState<any[]>([])
  // Drag & drop kanban
  const [arrastando, setArrastando] = useState<string | null>(null)
  const [etapaHover, setEtapaHover] = useState<string | null>(null)
  // Filtro por status do negócio (ganho/perdido/em_andamento/todos)
  const [filtroStatus, setFiltroStatus] = useState<'todos'|'em_andamento'|'ganho'|'perdido'>('todos')
  // Filtro por data (criação ou fechamento) com período opcional
  const [filtroData, setFiltroData] = useState<{ campo: 'sem'|'criacao'|'fechamento'; de: string; ate: string }>({ campo: 'sem', de: '', ate: '' })
  const [filtroUsuario, setFiltroUsuario] = useState<string>('')
  const [visibleIds, setVisibleIds] = useState<string[] | null>(null)

  // Campos personalizados (definição do admin)
  const [camposPers, setCamposPers] = useState<any[]>([])

  // Anexos do card
  const [anexosCard, setAnexosCard] = useState<any[]>([])
  const [uploadando, setUploadando] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Modal de assinatura eletrônica (a partir de um anexo PDF)
  const [modalAssinatura, setModalAssinatura] = useState(false)
  const [templates, setTemplates] = useState<any[]>([])
  const [formAssinatura, setFormAssinatura] = useState({
    anexo_id:'', template_id:'', signatarios:[{ nome:'', email:'' }], mensagem:'', assunto:'',
  })
  const [enviandoAssin, setEnviandoAssin] = useState(false)

  // Detalhes ricos do card aberto (tags / produtos / notas / origem)
  const [tagsCard, setTagsCard]         = useState<any[]>([])
  const [produtosCard, setProdutosCard] = useState<any[]>([])
  const [notasCard, setNotasCard]       = useState<any[]>([])
  const [origemCard, setOrigemCard]     = useState<any | null>(null)
  const [origens, setOrigens]           = useState<any[]>([])
  const [tagsAll, setTagsAll]           = useState<any[]>([])
  const [produtosAll, setProdutosAll]   = useState<any[]>([])
  const [novaNota, setNovaNota]         = useState('')
  const [novoProdNeg, setNovoProdNeg]   = useState({ produto_id: '', quantidade: '1', valor_unit: '' })
  // Modal de marcar perdido
  const [modalPerdido, setModalPerdido] = useState<any>(null)
  const [motivoSelecionado, setMotivoSelecionado] = useState<string>('')
  const [motivoCustom, setMotivoCustom] = useState<string>('')

  // Modal novo negócio
  const [modalNovo, setModalNovo] = useState(false)
  const [funilModal, setFunilModal] = useState<any>(null)
  const [salvando, setSalvando]   = useState(false)
  const [formNovo, setFormNovo]   = useState({ titulo:'', produto:'', premio:'', etapa:'', obs:'', vendedor_id:'' })
  const [clienteBusca, setClienteBusca] = useState('')
  const [clientesRes, setClientesRes]   = useState<any[]>([])
  const [clienteSel, setClienteSel]     = useState<any>(null)

  // Modal vincular cliente
  const [modalVincular, setModalVincular] = useState(false)
  const [negocioVincular, setNegocioVincular] = useState<any>(null)
  const [vincularBusca, setVincularBusca] = useState('')
  const [vincularRes, setVincularRes]     = useState<any[]>([])
  const [vincularTab, setVincularTab]     = useState<'buscar'|'criar'>('buscar')
  const [novoClienteForm, setNovoClienteForm] = useState({ nome:'', cpf_cnpj:'', telefone:'', email:'' })
  const [vinculando, setVinculando]       = useState(false)

  // Modal detalhes do card
  const [modalCard, setModalCard] = useState(false)
  const [cardAtivo, setCardAtivo] = useState<any>(null)

  useEffect(() => { init() }, [])
  useEffect(() => { if (funilAtivo) carregarNegocios() }, [funilAtivo, filtroUsuario, visibleIds])

  // Sincroniza a barra de rolagem horizontal de cima com o kanban
  useEffect(() => {
    const k = kanbanRef.current
    const t = topScrollRef.current
    if (!k || !t) return
    let lock = false
    const onK = () => { if (lock) return; lock = true; t.scrollLeft = k.scrollLeft; lock = false }
    const onT = () => { if (lock) return; lock = true; k.scrollLeft = t.scrollLeft; lock = false }
    k.addEventListener('scroll', onK)
    t.addEventListener('scroll', onT)
    const update = () => setKanbanWidth(k.scrollWidth)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(k)
    return () => { k.removeEventListener('scroll', onK); t.removeEventListener('scroll', onT); ro.disconnect() }
  }, [funilAtivo, negocios.length])

  // Abre o card automaticamente quando navegado via ?card=<negocio_id>
  useEffect(() => {
    const cardId = searchParams?.get('card')
    if (!cardId || !negocios.length) return
    const neg = negocios.find(n => n.id === cardId)
    if (!neg) return
    if (neg.funil_id) setFunilAtivo(neg.funil_id)
    setCardAtivo(neg)
    setModalCard(true)
  }, [searchParams, negocios])
  useEffect(() => {
    supabase.from('motivos_perda').select('*').eq('ativo', true).order('ordem').order('nome').then(({ data }) => setMotivosPerda(data || []))
    supabase.from('origens').select('*').eq('ativo', true).order('nome').then(({ data }) => setOrigens(data || []))
    supabase.from('tags').select('*').order('nome').then(({ data }) => setTagsAll(data || []))
    supabase.from('produtos').select('*').eq('ativo', true).order('nome').then(({ data }) => setProdutosAll(data || []))
    supabase.from('campos_personalizados').select('*').eq('entidade','negocio').eq('ativo', true).order('ordem').order('nome').then(({ data }) => setCamposPers(data || []))
    supabase.from('email_templates').select('*').eq('ativo', true)
      .in('categoria', ['assinatura','renovacao','cobranca','geral'])
      .order('categoria').order('is_default', { ascending: false }).order('nome')
      .then(({ data }) => setTemplates(data || []))
  }, [])

  async function setCustomField(chave: string, valor: any) {
    if (!cardAtivo) return
    const cf = { ...(cardAtivo.custom_fields || {}), [chave]: valor }
    await supabase.from('negocios').update({ custom_fields: cf }).eq('id', cardAtivo.id)
    setCardAtivo({ ...cardAtivo, custom_fields: cf })
  }

  // Quando abrir um card, carrega detalhes ricos
  useEffect(() => {
    if (!cardAtivo) { setTagsCard([]); setProdutosCard([]); setNotasCard([]); setOrigemCard(null); setAnexosCard([]); return }
    Promise.all([
      supabase.from('negocio_tags').select('tag_id, tags(*)').eq('negocio_id', cardAtivo.id),
      supabase.from('negocio_produtos').select('*').eq('negocio_id', cardAtivo.id).order('criado_em'),
      supabase.from('negocio_notas').select('*, users(nome,avatar_url)').eq('negocio_id', cardAtivo.id).order('criado_em', { ascending: false }),
      cardAtivo.origem_id ? supabase.from('origens').select('*').eq('id', cardAtivo.origem_id).maybeSingle() : Promise.resolve({ data: null }),
      supabase.from('anexos').select('*, users(nome)').eq('negocio_id', cardAtivo.id).order('created_at', { ascending: false }),
    ]).then(([t, p, n, o, a]) => {
      setTagsCard((t.data || []).map((x: any) => x.tags).filter(Boolean))
      setProdutosCard(p.data || [])
      setNotasCard(n.data || [])
      setOrigemCard((o as any).data || null)
      setAnexosCard((a as any).data || [])
    })
  }, [cardAtivo?.id])

  async function uploadAnexos(files: FileList | null) {
    if (!files || !cardAtivo || !profile?.id) return
    setUploadando(true)
    const novos: any[] = []
    for (const file of Array.from(files)) {
      const ts = Date.now()
      const safe = file.name.replace(/[^\w.\-]/g, '_')
      const path = `negocios/${cardAtivo.id}/${ts}_${safe}`
      const { error: upErr } = await supabase.storage.from('cmsegcrm').upload(path, file, { upsert: false })
      if (upErr) { alert('Erro upload '+file.name+': '+upErr.message); continue }
      const { data: anx, error } = await supabase.from('anexos').insert({
        bucket:       'cmsegcrm',
        path,
        nome_arquivo: file.name,
        tipo_mime:    file.type,
        tamanho_kb:   Math.round(file.size / 1024),
        categoria:    'negocio',
        negocio_id:   cardAtivo.id,
        cliente_id:   cardAtivo.cliente_id || null,
        user_id:      profile.id,
      }).select('*, users(nome)').single()
      if (error) { alert('Erro registrar '+file.name+': '+error.message); continue }
      if (anx) novos.push(anx)
    }
    setAnexosCard(prev => [...novos, ...prev])
    setUploadando(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function urlAnexo(anexo: any): Promise<string | null> {
    const { data } = await supabase.storage.from(anexo.bucket || 'cmsegcrm').createSignedUrl(anexo.path, 60 * 60)
    return data?.signedUrl || null
  }

  async function baixarAnexo(anexo: any) {
    const url = await urlAnexo(anexo)
    if (url) window.open(url, '_blank')
  }

  async function excluirAnexo(anexo: any) {
    if (profile?.role !== 'admin' && anexo.user_id !== profile?.id) { alert('Apenas o autor ou admin pode excluir.'); return }
    if (!confirm(`Excluir "${anexo.nome_arquivo}"?`)) return
    await supabase.storage.from(anexo.bucket || 'cmsegcrm').remove([anexo.path])
    await supabase.from('anexos').delete().eq('id', anexo.id)
    setAnexosCard(prev => prev.filter(a => a.id !== anexo.id))
  }

  function substituirVars(texto: string, anexoNome?: string) {
    const cliente = cardAtivo?.clientes?.nome || 'cliente'
    const negocio = cardAtivo?.titulo || ''
    const documento = (anexoNome || '').replace(/\.pdf$/i, '')
    return (texto || '')
      .replace(/\{\{cliente\}\}/g,   cliente)
      .replace(/\{\{negocio\}\}/g,   negocio)
      .replace(/\{\{documento\}\}/g, documento)
  }

  function aplicarTemplateNoForm(templateId: string, anexoNome?: string) {
    const t = templates.find(x => x.id === templateId)
    if (!t) return
    setFormAssinatura(f => ({
      ...f,
      template_id: templateId,
      assunto:  substituirVars(t.assunto || '',  anexoNome),
      mensagem: substituirVars(t.mensagem || '', anexoNome),
    }))
  }

  function abrirModalAssinatura() {
    if (!cardAtivo) return
    const pdfs = anexosCard.filter(a => /\.pdf$/i.test(a.nome_arquivo))
    if (pdfs.length === 0) { alert('Anexe pelo menos um PDF na seção "Anexos" antes de enviar para assinatura.'); return }
    const primeiroAnexo = pdfs[0]
    const sigDefault = cardAtivo.clientes?.email
      ? [{ nome: cardAtivo.clientes.nome || '', email: cardAtivo.clientes.email }]
      : [{ nome: '', email: '' }]
    // Pré-seleciona o template default (preferência: categoria assinatura)
    const tDefault = templates.find(t => t.is_default && t.categoria === 'assinatura')
                  || templates.find(t => t.is_default)
                  || templates[0]
    setFormAssinatura({
      anexo_id: primeiroAnexo.id,
      template_id: tDefault?.id || '',
      signatarios: sigDefault,
      mensagem:  tDefault ? substituirVars(tDefault.mensagem || '', primeiroAnexo.nome_arquivo) : '',
      assunto:   tDefault ? substituirVars(tDefault.assunto || '',  primeiroAnexo.nome_arquivo) : '',
    })
    setModalAssinatura(true)
  }

  async function enviarParaAssinatura() {
    if (!formAssinatura.anexo_id) return
    const sigs = formAssinatura.signatarios.filter(s => s.email.trim())
    if (sigs.length === 0) { alert('Adicione pelo menos 1 signatário com email'); return }
    setEnviandoAssin(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const r = await fetch('/api/autentique/criar-de-anexo', {
        method: 'POST',
        headers: { 'Content-Type':'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({
          anexo_id:    formAssinatura.anexo_id,
          signatarios: sigs.map(s => ({ email: s.email.trim(), name: s.nome.trim() || undefined })),
          mensagem:    formAssinatura.mensagem || undefined,
          negocio_id:  cardAtivo.id,
          cliente_id:  cardAtivo.cliente_id || null,
        }),
      })
      const j = await r.json()
      if (!r.ok) { alert('Erro: '+(j.error||'desconhecido')); return }
      alert('✅ Documento enviado para assinatura. Acompanhe em /dashboard/autentique.')
      setModalAssinatura(false)
    } finally { setEnviandoAssin(false) }
  }

  async function adicionarTag(nome: string, cor = '#c9a84c') {
    if (!cardAtivo || !nome.trim()) return
    let tag = tagsAll.find(t => t.nome.toLowerCase() === nome.trim().toLowerCase())
    if (!tag) {
      const { data } = await supabase.from('tags').insert({ nome: nome.trim(), cor }).select('*').single()
      if (!data) return
      tag = data
      setTagsAll(prev => [...prev, data])
    }
    await supabase.from('negocio_tags').upsert({ negocio_id: cardAtivo.id, tag_id: tag.id })
    setTagsCard(prev => prev.find(x => x.id === tag!.id) ? prev : [...prev, tag!])
  }

  async function removerTag(tagId: string) {
    if (!cardAtivo) return
    await supabase.from('negocio_tags').delete().eq('negocio_id', cardAtivo.id).eq('tag_id', tagId)
    setTagsCard(prev => prev.filter(t => t.id !== tagId))
  }

  async function adicionarProduto() {
    if (!cardAtivo) return
    const prod = produtosAll.find(p => p.id === novoProdNeg.produto_id)
    if (!prod) return
    const qtd = parseInt(novoProdNeg.quantidade) || 1
    const valor = parseFloat(novoProdNeg.valor_unit.replace(',', '.')) || prod.preco_base || 0
    const { data } = await supabase.from('negocio_produtos').insert({
      negocio_id: cardAtivo.id, produto_id: prod.id, nome_snapshot: prod.nome,
      quantidade: qtd, valor_unit: valor,
    }).select('*').single()
    if (data) setProdutosCard(prev => [...prev, data])
    setNovoProdNeg({ produto_id: '', quantidade: '1', valor_unit: '' })
  }

  async function removerProduto(id: string) {
    await supabase.from('negocio_produtos').delete().eq('id', id)
    setProdutosCard(prev => prev.filter(p => p.id !== id))
  }

  async function adicionarNota() {
    if (!cardAtivo || !novaNota.trim() || !profile?.id) return
    const { data } = await supabase.from('negocio_notas').insert({
      negocio_id: cardAtivo.id, user_id: profile.id, conteudo: novaNota.trim(),
    }).select('*, users(nome,avatar_url)').single()
    if (data) setNotasCard(prev => [data, ...prev])
    setNovaNota('')
  }

  async function excluirNota(id: string) {
    if (profile?.role !== 'admin') { alert('Apenas administradores podem excluir notas'); return }
    if (!confirm('Excluir essa anotação?')) return
    await supabase.from('negocio_notas').delete().eq('id', id)
    setNotasCard(prev => prev.filter(n => n.id !== id))
  }

  const [editandoNota, setEditandoNota] = useState<{ id: string; conteudo: string } | null>(null)
  async function salvarEdicaoNota() {
    if (!editandoNota) return
    if (profile?.role !== 'admin') { alert('Apenas administradores podem editar notas'); return }
    await supabase.from('negocio_notas').update({ conteudo: editandoNota.conteudo }).eq('id', editandoNota.id)
    setNotasCard(prev => prev.map(n => n.id === editandoNota.id ? { ...n, conteudo: editandoNota.conteudo } : n))
    setEditandoNota(null)
  }

  async function setOrigemDoCard(id: string) {
    if (!cardAtivo) return
    const v = id || null
    await supabase.from('negocios').update({ origem_id: v }).eq('id', cardAtivo.id)
    setCardAtivo({ ...cardAtivo, origem_id: v })
    setOrigemCard(v ? origens.find(o => o.id === v) : null)
  }

  async function init() {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: prof } = await supabase.from('users').select('*').eq('id', user?.id||'').single()
    setProfile(prof)
    const ids = await getVisibleUserIds()
    setVisibleIds(ids)
    let usrQ = supabase.from('users').select('id,nome,role').order('nome')
    if (ids) usrQ = usrQ.in('id', ids)
    const { data: usr } = await usrQ
    setUsuarios(usr||[])
    await carregarFunis()
    setLoading(false)
  }

  async function carregarFunis() {
    const { data: fs } = await supabase.from('funis').select('*').order('ordem')
    setFunis(fs||[])
    if (fs?.length && !funilAtivo) setFunilAtivo(fs[0].id)
    await carregarContagens(fs || [])
  }

  // Conta cards por funil sem trazer linhas (HEAD request).
  async function carregarContagens(fs: any[]) {
    const out: Record<string, number> = {}
    await Promise.all((fs || []).map(async (f) => {
      let q = supabase.from('negocios')
        .select('id', { count: 'exact', head: true })
        .eq('funil_id', f.id)
      if (filtroUsuario) q = q.eq('vendedor_id', filtroUsuario)
      else if (visibleIds) q = q.in('vendedor_id', visibleIds)
      const { count } = await q
      out[f.id] = count || 0
    }))
    setContagemPorFunil(out)
  }

  // Carrega negocios do funil ativo de forma progressiva: cada lote já
  // popula o kanban (não precisa esperar o fim para ver os primeiros cards).
  async function carregarNegocios() {
    if (!funilAtivo) { setNegocios([]); return }
    setNegocios([])
    const PRIMEIRA = 200
    const PAGE = 1000
    let offset = 0
    while (true) {
      const tamanho = offset === 0 ? PRIMEIRA : PAGE
      let q = supabase.from('negocios').select(`
        id, titulo, etapa, status, qualificacao, premio, vencimento,
        funil_id, cliente_id, vendedor_id, equipe_id, origem_id,
        produto, seguradora, cpf_cnpj, motivo_perda, obs,
        custom_fields, created_at, data_fechamento,
        clientes(id,nome,cpf_cnpj,telefone),
        users!negocios_vendedor_id_fkey(nome)
      `).eq('funil_id', funilAtivo)
      if (filtroUsuario) q = q.eq('vendedor_id', filtroUsuario)
      else if (visibleIds) q = q.in('vendedor_id', visibleIds)
      const { data, error } = await q
        .order('created_at', { ascending: false })
        .range(offset, offset + tamanho - 1)
      if (error || !data || data.length === 0) break
      setNegocios(prev => [...prev, ...data])
      if (data.length < tamanho) break
      offset += tamanho
      if (offset >= 50_000) break
    }
  }

  async function buscarClientes(q: string, setter: (v:any[])=>void) {
    if (q.length < 2) { setter([]); return }
    const { data } = await supabase.from('clientes').select('id,nome,cpf_cnpj,telefone').or(`nome.ilike.%${q}%,cpf_cnpj.ilike.%${q}%`).limit(6)
    setter(data||[])
  }

  async function salvarNegocio() {
    if (!formNovo.titulo) return
    setSalvando(true)
    const funil = funilModal
    const etapa = formNovo.etapa || funil?.etapas?.[0] || ''
    await supabase.from('negocios').insert({
      titulo:      formNovo.titulo,
      produto:     formNovo.produto || null,
      premio:      formNovo.premio ? parseFloat(formNovo.premio) : null,
      obs:         formNovo.obs || null,
      etapa,
      funil_id:    funil.id,
      cliente_id:  clienteSel?.id || null,
      vendedor_id: formNovo.vendedor_id || profile?.id,
    })
    setModalNovo(false)
    setFormNovo({ titulo:'', produto:'', premio:'', etapa:'', obs:'', vendedor_id:'' })
    setClienteSel(null); setClienteBusca('')
    setSalvando(false)
    await carregarNegocios()
  }

  async function moverEtapa(negocioId: string, novaEtapa: string) {
    await supabase.from('negocios').update({ etapa: novaEtapa }).eq('id', negocioId)
    await carregarNegocios()
  }

  async function disparaAutomacao(trigger: string, negocioId: string) {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) return
      await fetch('/api/automacoes/executar', {
        method: 'POST',
        headers: { 'Content-Type':'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ trigger, negocio_id: negocioId }),
      })
    } catch (e) { /* silencioso — automação falhou não bloqueia o usuário */ }
  }

  async function setQualificacao(negocioId: string, estrelas: number) {
    setNegocios(prev => prev.map(n => n.id === negocioId ? { ...n, qualificacao: estrelas } : n))
    await supabase.from('negocios').update({ qualificacao: estrelas }).eq('id', negocioId)
    if (cardAtivo?.id === negocioId) setCardAtivo({ ...cardAtivo, qualificacao: estrelas })
  }

  async function moverCardParaEtapa(negocioId: string, novaEtapa: string) {
    // Otimistic update + persist
    setNegocios(prev => prev.map(n => n.id === negocioId ? { ...n, etapa: novaEtapa } : n))
    const { error } = await supabase.from('negocios').update({ etapa: novaEtapa }).eq('id', negocioId)
    if (error) {
      alert('Erro ao mover: ' + error.message)
      await carregarNegocios()
    } else {
      disparaAutomacao('etapa_alterada', negocioId)
    }
  }

  async function marcarStatus(negocioId: string, status: 'ganho'|'perdido'|'em_andamento', motivo?: string, motivoId?: string|null) {
    const patch: any = { status }
    if (status === 'em_andamento') {
      patch.data_fechamento = null
      patch.fechado_por     = null
      patch.motivo_perda    = null
      patch.motivo_perda_id = null
    } else {
      patch.data_fechamento = new Date().toISOString()
      patch.fechado_por     = profile?.id || null
      if (status === 'perdido') {
        patch.motivo_perda    = motivo || null
        patch.motivo_perda_id = motivoId || null
      }
    }
    await supabase.from('negocios').update(patch).eq('id', negocioId)

    // Dispara automações vinculadas ao trigger
    if (status === 'ganho')   disparaAutomacao('status_ganho',   negocioId)
    if (status === 'perdido') disparaAutomacao('status_perdido', negocioId)

    // Pendência Autentique: ganho em VENDA/RENOVAÇÕES/META cria
    // placeholder pra lembrar de enviar contrato pra assinatura
    // (ou atualiza pra 'enviado' se já tinha sido mandado).
    if (status === 'ganho') {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.access_token) {
          await fetch('/api/autentique/pendencia', {
            method: 'POST',
            headers: { 'Content-Type':'application/json', Authorization: `Bearer ${session.access_token}` },
            body: JSON.stringify({ negocio_id: negocioId }),
          })
        }
      } catch (e) { /* não-bloqueante */ }
    }

    // Meta Pixel: dispara Purchase quando marcar Ganho. Se tiver
    // meta_campaign_id, ajuda a otimizar campanhas.
    if (status === 'ganho') {
      const neg = negocios.find(n => n.id === negocioId)
      if (neg && typeof window !== 'undefined' && (window as any).fbq) {
        try {
          ;(window as any).fbq('track', 'Purchase', {
            value: Number(neg.premio || 0),
            currency: 'BRL',
            content_name: neg.titulo || neg.produto || '',
            content_category: neg.produto || '',
          })
        } catch {}
      }
    }

    setModalCard(false)
    await carregarNegocios()
  }

  async function vincularCliente(clienteId: string) {
    if (!negocioVincular) return
    setVinculando(true)
    await supabase.from('negocios').update({ cliente_id: clienteId }).eq('id', negocioVincular.id)
    setModalVincular(false)
    setNegocioVincular(null)
    setVincularBusca(''); setVincularRes([])
    setVinculando(false)
    await carregarNegocios()
  }

  async function criarEVincularCliente() {
    if (!novoClienteForm.nome && !novoClienteForm.cpf_cnpj) return
    setVinculando(true)
    const { data: novo } = await supabase.from('clientes').insert({
      nome:     novoClienteForm.nome,
      cpf_cnpj: novoClienteForm.cpf_cnpj || null,
      telefone: novoClienteForm.telefone || null,
      email:    novoClienteForm.email    || null,
      tipo:     'PF',
    }).select('id').single()
    if (novo?.id) await vincularCliente(novo.id)
    setNovoClienteForm({ nome:'', cpf_cnpj:'', telefone:'', email:'' })
    setVinculando(false)
  }

  async function excluirNegocio(id: string) {
    if (!confirm('Excluir este card?')) return
    await supabase.from('negocios').delete().eq('id', id)
    setModalCard(false)
    await carregarNegocios()
  }

  async function renomearFunil(f: any) {
    const novoNome = prompt('Novo nome do funil:', f.nome || '')
    if (novoNome === null) return
    const nome = novoNome.trim()
    if (!nome || nome === f.nome) return
    // Usa endpoint server-side (bypassa RLS, dá erro claro)
    const { data: { session } } = await supabase.auth.getSession()
    const r = await fetch('/api/funis', {
      method: 'PATCH',
      headers: { 'Content-Type':'application/json', Authorization: `Bearer ${session?.access_token||''}` },
      body: JSON.stringify({ id: f.id, nome })
    })
    const j = await r.json()
    if (!r.ok) { alert('Erro ao renomear: ' + (j.error || 'falha')); return }
    await carregarFunis()
  }

  async function excluirFunil(f: any) {
    const cards = contagemPorFunil[f.id] ?? 0
    const msg = cards > 0
      ? `O funil "${f.nome}" tem ${cards} card(s).\n\nIsto irá excluir o funil E todos os ${cards} card(s) dentro dele.\nEsta ação NÃO pode ser desfeita.\n\nConfirmar?`
      : `Excluir o funil "${f.nome}"?\n\nEsta ação não pode ser desfeita.`
    if (!confirm(msg)) return

    // Usa endpoint server-side (bypassa RLS) — faz cascade dos cards.
    const { data: { session } } = await supabase.auth.getSession()
    const r = await fetch(`/api/funis?id=${f.id}&cascade=1`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${session?.access_token||''}` },
    })
    const j = await r.json()
    if (!r.ok) {
      alert('Erro ao excluir o funil: ' + (j.error || 'falha desconhecida'))
      return
    }

    if (funilAtivo === f.id) setFunilAtivo(null)
    await carregarFunis()
    await carregarNegocios()
  }

  const funiAtual = funis.find(f => f.id === funilAtivo)

  // Filtro por data (de/ate) sobre criacao ou fechamento.
  // Ate inclui o dia inteiro (23:59:59).
  function passaFiltroData(n: any): boolean {
    if (filtroData.campo === 'sem') return true
    const fonte = filtroData.campo === 'criacao' ? n.created_at : n.data_fechamento
    if (!fonte) return false
    const ts = new Date(fonte).getTime()
    if (filtroData.de) {
      if (ts < new Date(filtroData.de + 'T00:00:00').getTime()) return false
    }
    if (filtroData.ate) {
      if (ts > new Date(filtroData.ate + 'T23:59:59').getTime()) return false
    }
    return true
  }

  const negociosFunil = negocios.filter(n =>
    n.funil_id === funilAtivo &&
    (filtroStatus === 'todos' || (n.status || 'em_andamento') === filtroStatus) &&
    passaFiltroData(n)
  )
  const inp: React.CSSProperties = { width:'100%', background:'rgba(255,255,255,0.05)', border:'1px solid var(--border)', borderRadius:8, padding:'8px 12px', color:'var(--text)', fontSize:13, fontFamily:'DM Sans,sans-serif', outline:'none', boxSizing:'border-box' as const }

  if (loading) return <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',color:'var(--text-muted)'}}>Carregando...</div>

  return (
    <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
      {/* Header */}
      <div style={{height:56,borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',padding:'0 20px',gap:10,background:'var(--bg-soft)',backdropFilter:'blur(8px)',position:'sticky',top:0,zIndex:5,flexShrink:0}}>
        {/* Dropdown de funis (filtrado por equipe via RLS — funis já chegam só os permitidos) */}
        <div style={{position:'relative',minWidth:280}}>
          <button onClick={()=>setSeletorAberto(s=>!s)}
            style={{width:'100%',padding:'9px 14px',borderRadius:10,fontSize:13,cursor:'pointer',border:'1px solid var(--border)',background:'rgba(255,255,255,0.04)',color:'var(--text)',fontFamily:'DM Sans,sans-serif',display:'flex',alignItems:'center',gap:10,justifyContent:'space-between'}}>
            <span style={{display:'flex',alignItems:'center',gap:8,minWidth:0}}>
              <span style={{fontSize:16}}>{funiAtual?.emoji || '🏗'}</span>
              <span style={{fontWeight:500,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
                {funiAtual?.nome || 'Selecione um funil'}
              </span>
              {funiAtual && (
                <span style={{fontSize:11,color:'var(--text-muted)',background:'rgba(255,255,255,0.06)',padding:'1px 7px',borderRadius:10,marginLeft:6}}>
                  {contagemPorFunil[funiAtual.id] ?? 0}
                </span>
              )}
            </span>
            <span style={{fontSize:11,color:'var(--text-muted)',transition:'transform 0.18s',transform:seletorAberto?'rotate(180deg)':'none'}}>▾</span>
          </button>

          {seletorAberto && (
            <>
              <div onClick={()=>setSeletorAberto(false)} style={{position:'fixed',inset:0,zIndex:40}}/>
              <div style={{position:'absolute',top:'calc(100% + 4px)',left:0,right:0,zIndex:50,background:'#ffffff',border:'1px solid var(--border)',borderRadius:10,boxShadow:'var(--shadow-lg)',maxHeight:'70vh',overflow:'auto',padding:6}}>
                {funis.length === 0 && (
                  <div style={{padding:20,textAlign:'center',color:'var(--text-muted)',fontSize:12}}>
                    Nenhum funil disponível pra você. {profile?.role==='admin' ? 'Crie em ⚙ Configurar funis.' : 'Peça ao admin pra liberar.'}
                  </div>
                )}
                {funis.map(f => {
                  const ativo = funilAtivo === f.id
                  const cardCount = contagemPorFunil[f.id] ?? 0
                  return (
                    <div key={f.id}
                      onClick={()=>{ setFunilAtivo(f.id); setSeletorAberto(false) }}
                      style={{display:'flex',alignItems:'center',gap:10,padding:'9px 12px',borderRadius:7,cursor:'pointer',background:ativo?'rgba(201,168,76,0.10)':'transparent',color:ativo?'var(--gold)':'var(--text)',transition:'background 0.12s'}}
                      onMouseEnter={e=>{if(!ativo)(e.currentTarget as HTMLDivElement).style.background='rgba(255,255,255,0.04)'}}
                      onMouseLeave={e=>{if(!ativo)(e.currentTarget as HTMLDivElement).style.background='transparent'}}>
                      <span style={{fontSize:16,width:22,textAlign:'center'}}>{f.emoji||'📁'}</span>
                      <span style={{flex:1,fontSize:13,fontWeight:ativo?500:400}}>{f.nome}</span>
                      <span style={{fontSize:10,color:'var(--text-muted)',background:'rgba(255,255,255,0.06)',padding:'1px 7px',borderRadius:10}}>{cardCount}</span>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>

        {/* Ações sobre o funil ativo (admin) */}
        {funiAtual && profile?.role === 'admin' && (
          <>
            <button onClick={()=>renomearFunil(funiAtual)} title="Renomear funil"
              style={{padding:'9px 12px',borderRadius:8,fontSize:12,cursor:'pointer',border:'1px solid var(--border)',background:'rgba(255,255,255,0.04)',color:'var(--gold)',fontFamily:'DM Sans,sans-serif'}}>
              ✎ Renomear
            </button>
            <button onClick={()=>excluirFunil(funiAtual)} title="Excluir funil"
              style={{padding:'9px 12px',borderRadius:8,fontSize:12,cursor:'pointer',border:'1px solid rgba(224,82,82,0.3)',background:'rgba(224,82,82,0.06)',color:'var(--red)',fontFamily:'DM Sans,sans-serif'}}>
              🗑 Excluir
            </button>
          </>
        )}
        <div style={{flex:1}}/>
        {/* Filtro por status */}
        <div style={{display:'flex',background:'rgba(255,255,255,0.04)',border:'1px solid var(--border)',borderRadius:8,padding:2}}>
          {([
            ['todos',        'Todos',      'var(--text)'],
            ['em_andamento', 'Andamento',  '#7aa3f8'],
            ['ganho',        '✓ Ganho',    'var(--teal)'],
            ['perdido',      '✕ Perdido',  'var(--red)'],
          ] as const).map(([v,l,cor]) => (
            <button key={v} onClick={()=>setFiltroStatus(v as any)}
              style={{padding:'5px 12px',fontSize:11,fontWeight:600,cursor:'pointer',border:'none',borderRadius:6,
                background: filtroStatus===v ? `color-mix(in srgb, ${cor} 18%, transparent)` : 'transparent',
                color: filtroStatus===v ? cor : 'var(--text-muted)',
                fontFamily:'DM Sans,sans-serif',whiteSpace:'nowrap'}}>
              {l}
            </button>
          ))}
        </div>

        {/* Filtro por usuário */}
        {profile && profile.role !== 'corretor' && (
          <select value={filtroUsuario} onChange={e=>setFiltroUsuario(e.target.value)}
            title="Filtrar por usuário"
            style={{border:'1px solid var(--border)',background:'rgba(255,255,255,0.04)',color:filtroUsuario?'var(--gold)':'var(--text-muted)',borderRadius:8,padding:'6px 10px',fontSize:11,fontWeight:600,cursor:'pointer',outline:'none'}}>
            <option value="">👥 {profile.role==='admin'?'Todos':'Toda equipe'}</option>
            {usuarios.map(u=><option key={u.id} value={u.id}>{u.nome}</option>)}
          </select>
        )}

        {/* Filtro por data — campo + período */}
        <div style={{display:'flex',gap:6,alignItems:'center',background:'rgba(255,255,255,0.04)',border:'1px solid var(--border)',borderRadius:8,padding:'2px 4px'}}>
          <select value={filtroData.campo} onChange={e=>setFiltroData(f=>({...f,campo:e.target.value as any}))}
            style={{border:'none',background:'transparent',color:filtroData.campo==='sem'?'var(--text-muted)':'var(--gold)',fontSize:11,fontWeight:600,padding:'4px 6px',cursor:'pointer',outline:'none'}}>
            <option value="sem">📅 Sem filtro de data</option>
            <option value="criacao">🆕 Por criação</option>
            <option value="fechamento">🏁 Por fechamento</option>
          </select>
          {filtroData.campo !== 'sem' && (
            <>
              <input type="date" value={filtroData.de} onChange={e=>setFiltroData(f=>({...f,de:e.target.value}))}
                title="De" style={{border:'1px solid var(--border)',background:'#fff',borderRadius:5,padding:'3px 6px',fontSize:11,color:'var(--text)',outline:'none'}} />
              <span style={{fontSize:10,color:'var(--text-muted)'}}>até</span>
              <input type="date" value={filtroData.ate} onChange={e=>setFiltroData(f=>({...f,ate:e.target.value}))}
                title="Até" style={{border:'1px solid var(--border)',background:'#fff',borderRadius:5,padding:'3px 6px',fontSize:11,color:'var(--text)',outline:'none'}} />
              {(filtroData.de || filtroData.ate) && (
                <button onClick={()=>setFiltroData({campo:'sem',de:'',ate:''})}
                  title="Limpar filtro" style={{border:'none',background:'transparent',color:'var(--red)',cursor:'pointer',fontSize:14,padding:'0 4px'}}>×</button>
              )}
            </>
          )}
        </div>

        {profile?.role === 'admin' && (
          <button onClick={()=>router.push('/dashboard/funis/configurar')}
            style={{padding:'6px 12px',borderRadius:8,fontSize:12,cursor:'pointer',border:'1px solid var(--border)',background:'rgba(255,255,255,0.04)',color:'var(--text-muted)',fontFamily:'DM Sans,sans-serif',whiteSpace:'nowrap'}}
            title="Criar, renomear e organizar funis (admin)">
            ⚙ Configurar funis
          </button>
        )}
        <button className="btn-primary" onClick={()=>{setFunilModal(funiAtual);setModalNovo(true);setFormNovo({titulo:'',produto:'',premio:'',etapa:funiAtual?.etapas?.[0]||'',obs:'',vendedor_id:profile?.id||''})}}>
          + Novo Card
        </button>
      </div>

      {/* Kanban */}
      {funiAtual && (
        <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden',position:'relative'}}>
          {/* Barra de rolagem horizontal sincronizada no topo */}
          <div className="kanban-scroll kanban-scroll-top" ref={topScrollRef}
            style={{overflowX:'auto',overflowY:'hidden',height:18,flexShrink:0,margin:'0 20px'}}>
            <div style={{width:kanbanWidth,height:1}} />
          </div>
          <div className="kanban-scroll" ref={kanbanRef}
            style={{flex:1,overflowX:'auto',overflowY:'hidden',display:'flex',padding:'20px 60px 20px 20px',scrollBehavior:'smooth'}}>
            <div style={{display:'flex',gap:14,alignItems:'flex-start',minWidth:'max-content'}}>
              {(funiAtual.etapas||[]).map((etapa: string) => {
                const cards = negociosFunil.filter(n => n.etapa === etapa)
                const ehHover = etapaHover === etapa && arrastando
                return (
                  <div key={etapa}
                    onDragOver={e=>{e.preventDefault();setEtapaHover(etapa)}}
                    onDragLeave={()=>setEtapaHover(prev => prev===etapa?null:prev)}
                    onDrop={e=>{
                      e.preventDefault()
                      const id = e.dataTransfer.getData('text/plain')
                      if (id) moverCardParaEtapa(id, etapa)
                      setArrastando(null); setEtapaHover(null)
                    }}
                    style={{width:270,flexShrink:0,display:'flex',flexDirection:'column',gap:8,padding:'10px 8px',borderRadius:12,background:ehHover?'rgba(201,168,76,0.12)':'#f1f3f8',border:'1px solid #e2e6ee',outline:ehHover?'2px dashed rgba(201,168,76,0.5)':'none',outlineOffset:-2,transition:'background 0.15s'}}>
                  {/* Header coluna */}
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'8px 12px',background:'rgba(255,255,255,0.04)',borderRadius:10,border:'1px solid var(--border)'}}>
                    <span style={{fontSize:12,fontWeight:600}}>{etapa}</span>
                    <span style={{fontSize:11,color:'var(--text-muted)',background:'rgba(255,255,255,0.08)',padding:'1px 7px',borderRadius:10}}>{cards.length}</span>
                  </div>

                  {/* Cards */}
                  {cards.map(neg => {
                    const isGanho   = neg.status === 'ganho'
                    const isPerdido = neg.status === 'perdido'
                    const corBorda  = isGanho ? 'rgba(28,181,160,0.55)' : isPerdido ? 'rgba(224,82,82,0.55)' : 'var(--border)'
                    const bgCard    = isGanho ? 'rgba(28,181,160,0.06)' : isPerdido ? 'rgba(224,82,82,0.06)'  : 'rgba(255,255,255,0.04)'
                    return (
                    <div key={neg.id} onClick={()=>{setCardAtivo(neg);setModalCard(true)}}
                      draggable
                      onDragStart={e=>{e.dataTransfer.setData('text/plain', neg.id);e.dataTransfer.effectAllowed='move';setArrastando(neg.id)}}
                      onDragEnd={()=>{setArrastando(null);setEtapaHover(null)}}
                      style={{background:bgCard,border:'1px solid '+corBorda,borderRadius:12,padding:'12px',cursor:arrastando===neg.id?'grabbing':'grab',transition:'all 0.15s',position:'relative',opacity:arrastando===neg.id?0.5:1}}
                      onMouseEnter={e=>(e.currentTarget.style.borderColor='var(--gold)')}
                      onMouseLeave={e=>(e.currentTarget.style.borderColor=corBorda)}>

                      {(isGanho || isPerdido) && (
                        <span style={{position:'absolute',top:8,right:8,fontSize:9,fontWeight:700,letterSpacing:'1px',padding:'2px 6px',borderRadius:5,textTransform:'uppercase',background:isGanho?'rgba(28,181,160,0.18)':'rgba(224,82,82,0.18)',color:isGanho?'var(--teal)':'var(--red)',border:'1px solid '+(isGanho?'rgba(28,181,160,0.4)':'rgba(224,82,82,0.4)')}}>
                          {isGanho?'✓ Ganho':'✕ Perdido'}
                        </span>
                      )}

                      <div style={{fontSize:13,fontWeight:500,marginBottom:6,lineHeight:1.3,paddingRight:isGanho||isPerdido?60:0,textDecoration:isPerdido?'line-through':'none',opacity:isPerdido?0.75:1}}>{neg.titulo}</div>

                      {/* Estrelas no card */}
                      <div onClick={e=>e.stopPropagation()} style={{display:'flex',gap:1,marginBottom:6}}>
                        {[1,2,3,4,5].map(n => (
                          <button key={n} onClick={()=>setQualificacao(neg.id, neg.qualificacao===n ? 0 : n)}
                            title={`${n} estrela${n>1?'s':''}`}
                            style={{background:'none',border:'none',padding:0,cursor:'pointer',fontSize:13,lineHeight:1,color:n<=(neg.qualificacao||0)?'var(--star)':'var(--star-empty)'}}>
                            ★
                          </button>
                        ))}
                      </div>

                      {/* Cliente ou botão vincular */}
                      {neg.clientes ? (
                        <div style={{fontSize:11,color:'var(--teal)',marginBottom:4,display:'flex',alignItems:'center',gap:4}}>
                          <span>👤</span> {neg.clientes.nome}
                        </div>
                      ) : (
                        <button onClick={e=>{e.stopPropagation();setNegocioVincular(neg);setVincularTab('buscar');setVincularBusca('');setVincularRes([]);setNovoClienteForm({nome:'',cpf_cnpj:neg.cpf_cnpj||'',telefone:'',email:''}); setModalVincular(true)}}
                          style={{fontSize:11,padding:'3px 8px',borderRadius:6,border:'1px dashed rgba(201,168,76,0.4)',background:'rgba(201,168,76,0.06)',color:'var(--gold)',cursor:'pointer',fontFamily:'DM Sans,sans-serif',marginBottom:4,display:'block'}}>
                          + Vincular cliente
                        </button>
                      )}

                      {neg.cpf_cnpj && !neg.clientes && (
                        <div style={{fontSize:10,color:'var(--text-muted)',marginBottom:4}}>CPF: {neg.cpf_cnpj}</div>
                      )}

                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:4}}>
                        {neg.premio ? <span style={{fontSize:12,fontWeight:600,color:'var(--teal)'}}>R$ {Number(neg.premio).toLocaleString('pt-BR',{minimumFractionDigits:2})}</span> : <span/>}
                        {neg.produto && <span style={{fontSize:10,color:'var(--text-muted)',background:'rgba(255,255,255,0.06)',padding:'1px 6px',borderRadius:8}}>{neg.produto}</span>}
                      </div>

                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:6,gap:6,fontSize:9,color:'var(--text-muted)',borderTop:'1px solid rgba(0,0,0,0.05)',paddingTop:5}}>
                        {neg.created_at && (
                          <span title="Data de criação">🆕 {new Date(neg.created_at).toLocaleDateString('pt-BR')}</span>
                        )}
                        {neg.data_fechamento && (
                          <span title="Data de fechamento" style={{color:isGanho?'var(--teal)':isPerdido?'var(--red)':'var(--text-muted)'}}>🏁 {new Date(neg.data_fechamento).toLocaleDateString('pt-BR')}</span>
                        )}
                      </div>
                    </div>
                    )
                  })}

                    {cards.length === 0 && (
                      <div style={{padding:'20px 12px',textAlign:'center',color:'var(--text-muted)',fontSize:11,border:'1px dashed var(--border)',borderRadius:12}}>
                        Sem cards
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Gradientes nas bordas — sinalizam que tem conteúdo escondido */}
          <div style={{position:'absolute',left:0,top:0,bottom:18,width:30,background:'linear-gradient(to right, rgba(0,0,0,0.06), transparent)',pointerEvents:'none',zIndex:5}} />
          <div style={{position:'absolute',right:0,top:0,bottom:18,width:30,background:'linear-gradient(to left, rgba(0,0,0,0.06), transparent)',pointerEvents:'none',zIndex:5}} />

          {/* Setas SEMPRE visíveis (rolar mesmo se cabe na tela é inofensivo) */}
          <button onClick={()=>kanbanRef.current?.scrollBy({left:-340,behavior:'smooth'})}
            aria-label="Rolar para a esquerda"
            style={{position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',zIndex:10,width:42,height:42,borderRadius:'50%',border:'1px solid var(--gold)',background:'#ffffff',color:'var(--gold)',cursor:'pointer',fontSize:22,fontWeight:700,boxShadow:'0 6px 18px rgba(0,0,0,0.55)',display:'flex',alignItems:'center',justifyContent:'center',transition:'all 0.15s'}}
            onMouseEnter={e=>(e.currentTarget.style.background='rgba(201,168,76,0.20)')}
            onMouseLeave={e=>(e.currentTarget.style.background='#ffffff')}>
            ‹
          </button>
          <button onClick={()=>kanbanRef.current?.scrollBy({left:340,behavior:'smooth'})}
            aria-label="Rolar para a direita"
            style={{position:'absolute',right:10,top:'50%',transform:'translateY(-50%)',zIndex:10,width:42,height:42,borderRadius:'50%',border:'1px solid var(--gold)',background:'#ffffff',color:'var(--gold)',cursor:'pointer',fontSize:22,fontWeight:700,boxShadow:'0 6px 18px rgba(0,0,0,0.55)',display:'flex',alignItems:'center',justifyContent:'center',transition:'all 0.15s'}}
            onMouseEnter={e=>(e.currentTarget.style.background='rgba(201,168,76,0.20)')}
            onMouseLeave={e=>(e.currentTarget.style.background='#ffffff')}>
            ›
          </button>
        </div>
      )}

      {/* Modal Novo Negócio */}
      {modalNovo && (
        <div style={{position:'fixed',inset:0,background:'rgba(15,23,42,0.45)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',backdropFilter:'blur(6px)'}}
          onClick={e=>e.target===e.currentTarget&&setModalNovo(false)}>
          <div style={{background:'#ffffff',border:'1px solid var(--border)',borderRadius:20,padding:'28px 32px',width:480,maxWidth:'95vw',maxHeight:'90vh',overflow:'auto'}}>
            <div style={{fontFamily:'DM Serif Display,serif',fontSize:18,marginBottom:20}}>+ Novo Card — {funilModal?.nome}</div>

            <div style={{marginBottom:12}}><label style={{fontSize:12,color:'var(--text-muted)',display:'block',marginBottom:4}}>Título *</label>
              <input value={formNovo.titulo} onChange={e=>setFormNovo(f=>({...f,titulo:e.target.value}))} placeholder="Ex: Cobrança João Silva" style={inp} autoFocus />
            </div>

            {/* Busca de cliente — opcional */}
            <div style={{marginBottom:12,position:'relative'}}>
              <label style={{fontSize:12,color:'var(--text-muted)',display:'block',marginBottom:4}}>Cliente <span style={{color:'var(--text-muted)',fontWeight:400}}>(opcional — pode vincular depois)</span></label>
              {clienteSel ? (
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'8px 12px',background:'rgba(28,181,160,0.08)',border:'1px solid rgba(28,181,160,0.3)',borderRadius:8}}>
                  <span style={{fontSize:13}}>{clienteSel.nome}</span>
                  <button onClick={()=>{setClienteSel(null);setClienteBusca('')}} style={{background:'none',border:'none',color:'var(--text-muted)',cursor:'pointer'}}>✕</button>
                </div>
              ) : (
                <>
                  <input value={clienteBusca} onChange={e=>{setClienteBusca(e.target.value);buscarClientes(e.target.value,setClientesRes)}} placeholder="🔍 Buscar cliente..." style={inp} />
                  {clientesRes.length > 0 && (
                    <div style={{position:'absolute',top:'100%',left:0,right:0,background:'#ffffff',border:'1px solid var(--border)',borderRadius:8,zIndex:10,maxHeight:160,overflow:'auto'}}>
                      {clientesRes.map(c=>(
                        <div key={c.id} onClick={()=>{setClienteSel(c);setClienteBusca(c.nome);setClientesRes([])}}
                          style={{padding:'8px 14px',cursor:'pointer',fontSize:13}}
                          onMouseEnter={e=>(e.currentTarget.style.background='rgba(201,168,76,0.08)')}
                          onMouseLeave={e=>(e.currentTarget.style.background='')}>
                          {c.nome} <span style={{color:'var(--text-muted)',fontSize:11}}>{c.cpf_cnpj}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12}}>
              <div><label style={{fontSize:12,color:'var(--text-muted)',display:'block',marginBottom:4}}>Produto</label>
                <input value={formNovo.produto} onChange={e=>setFormNovo(f=>({...f,produto:e.target.value}))} placeholder="Ex: Auto" style={inp}/></div>
              <div><label style={{fontSize:12,color:'var(--text-muted)',display:'block',marginBottom:4}}>Prêmio (R$)</label>
                <input value={formNovo.premio} onChange={e=>setFormNovo(f=>({...f,premio:e.target.value}))} placeholder="0,00" style={inp}/></div>
            </div>

            <div style={{marginBottom:12}}><label style={{fontSize:12,color:'var(--text-muted)',display:'block',marginBottom:4}}>Etapa</label>
              <select value={formNovo.etapa} onChange={e=>setFormNovo(f=>({...f,etapa:e.target.value}))} style={{...inp,background:'#ffffff'}}>
                {(funilModal?.etapas||[]).map((e:string)=><option key={e} value={e} style={{background:'#ffffff'}}>{e}</option>)}
              </select>
            </div>

            <div style={{marginBottom:12}}><label style={{fontSize:12,color:'var(--text-muted)',display:'block',marginBottom:4}}>Responsável</label>
              <select value={formNovo.vendedor_id} onChange={e=>setFormNovo(f=>({...f,vendedor_id:e.target.value}))} style={{...inp,background:'#ffffff'}}>
                {usuarios.map(u=><option key={u.id} value={u.id} style={{background:'#ffffff'}}>{u.nome}</option>)}
              </select>
            </div>

            <div style={{marginBottom:20}}><label style={{fontSize:12,color:'var(--text-muted)',display:'block',marginBottom:4}}>Observações</label>
              <textarea value={formNovo.obs} onChange={e=>setFormNovo(f=>({...f,obs:e.target.value}))} rows={2} style={{...inp,resize:'none'}} placeholder="Detalhes..."/></div>

            <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
              <button className="btn-secondary" onClick={()=>setModalNovo(false)}>Cancelar</button>
              <button className="btn-primary" onClick={salvarNegocio} disabled={salvando||!formNovo.titulo}>
                {salvando?'Salvando...':'✓ Criar Card'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Vincular Cliente */}
      {modalVincular && negocioVincular && (
        <div style={{position:'fixed',inset:0,background:'rgba(15,23,42,0.45)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',backdropFilter:'blur(6px)'}}
          onClick={e=>e.target===e.currentTarget&&setModalVincular(false)}>
          <div style={{background:'#ffffff',border:'1px solid var(--border)',borderRadius:20,padding:'28px 32px',width:460,maxWidth:'95vw'}}>
            <div style={{fontFamily:'DM Serif Display,serif',fontSize:18,marginBottom:6}}>👤 Vincular Cliente</div>
            <div style={{fontSize:12,color:'var(--text-muted)',marginBottom:20}}>Card: {negocioVincular.titulo}</div>

            {/* Abas */}
            <div style={{display:'flex',gap:0,borderBottom:'1px solid var(--border)',marginBottom:16}}>
              {[['buscar','🔍 Buscar existente'],['criar','➕ Criar novo']].map(([k,l])=>(
                <button key={k} onClick={()=>setVincularTab(k as any)}
                  style={{padding:'8px 16px',fontSize:12,cursor:'pointer',border:'none',borderBottom:vincularTab===k?'2px solid var(--gold)':'2px solid transparent',background:'transparent',color:vincularTab===k?'var(--gold)':'var(--text-muted)',fontFamily:'DM Sans,sans-serif',marginBottom:-1}}>
                  {l}
                </button>
              ))}
            </div>

            {vincularTab === 'buscar' && (
              <div>
                <input value={vincularBusca} onChange={e=>{setVincularBusca(e.target.value);buscarClientes(e.target.value,setVincularRes)}}
                  placeholder="Buscar por nome ou CPF..." style={inp} autoFocus />
                <div style={{marginTop:8,maxHeight:200,overflow:'auto'}}>
                  {vincularRes.map(c=>(
                    <div key={c.id} onClick={()=>vincularCliente(c.id)}
                      style={{padding:'10px 14px',cursor:'pointer',borderRadius:8,border:'1px solid var(--border)',marginBottom:6,display:'flex',justifyContent:'space-between',alignItems:'center'}}
                      onMouseEnter={e=>(e.currentTarget.style.borderColor='var(--gold)')}
                      onMouseLeave={e=>(e.currentTarget.style.borderColor='var(--border)')}>
                      <div>
                        <div style={{fontSize:13,fontWeight:500}}>{c.nome}</div>
                        <div style={{fontSize:11,color:'var(--text-muted)'}}>{c.cpf_cnpj} {c.telefone&&`· ${c.telefone}`}</div>
                      </div>
                      <span style={{fontSize:12,color:'var(--teal)'}}>Vincular →</span>
                    </div>
                  ))}
                  {vincularBusca.length >= 2 && vincularRes.length === 0 && (
                    <div style={{padding:20,textAlign:'center',color:'var(--text-muted)',fontSize:13}}>Nenhum cliente encontrado</div>
                  )}
                </div>
              </div>
            )}

            {vincularTab === 'criar' && (
              <div style={{display:'flex',flexDirection:'column',gap:12}}>
                <div><label style={{fontSize:12,color:'var(--text-muted)',display:'block',marginBottom:4}}>Nome *</label>
                  <input value={novoClienteForm.nome} onChange={e=>setNovoClienteForm(f=>({...f,nome:e.target.value}))} placeholder="Nome completo" style={inp} autoFocus /></div>
                <div><label style={{fontSize:12,color:'var(--text-muted)',display:'block',marginBottom:4}}>CPF/CNPJ</label>
                  <input value={novoClienteForm.cpf_cnpj} onChange={e=>setNovoClienteForm(f=>({...f,cpf_cnpj:e.target.value}))} placeholder="000.000.000-00" style={inp} /></div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                  <div><label style={{fontSize:12,color:'var(--text-muted)',display:'block',marginBottom:4}}>Telefone</label>
                    <input value={novoClienteForm.telefone} onChange={e=>setNovoClienteForm(f=>({...f,telefone:e.target.value}))} placeholder="(00) 00000-0000" style={inp} /></div>
                  <div><label style={{fontSize:12,color:'var(--text-muted)',display:'block',marginBottom:4}}>Email</label>
                    <input type="email" value={novoClienteForm.email} onChange={e=>setNovoClienteForm(f=>({...f,email:e.target.value}))} placeholder="email@email.com" style={inp} /></div>
                </div>
                <button className="btn-primary" onClick={criarEVincularCliente} disabled={vinculando||!novoClienteForm.nome} style={{marginTop:4}}>
                  {vinculando?'Criando...':'✓ Criar e vincular'}
                </button>
              </div>
            )}

            <div style={{marginTop:16,display:'flex',justifyContent:'flex-end'}}>
              <button className="btn-secondary" onClick={()=>setModalVincular(false)}>Fechar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Detalhes do Card */}
      {modalCard && cardAtivo && (
        <div style={{position:'fixed',inset:0,background:'rgba(15,23,42,0.45)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',backdropFilter:'blur(6px)'}}
          onClick={e=>e.target===e.currentTarget&&setModalCard(false)}>
          <div style={{background:'#ffffff',border:'1px solid var(--border)',borderRadius:20,padding:'28px 32px',width:480,maxWidth:'95vw',maxHeight:'90vh',overflow:'auto'}}>
            <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:8}}>
              <div style={{fontFamily:'DM Serif Display,serif',fontSize:18,flex:1}}>{cardAtivo.titulo}</div>
              <button onClick={()=>setModalCard(false)} style={{background:'none',border:'none',color:'var(--text-muted)',cursor:'pointer',fontSize:20,marginLeft:12}}>✕</button>
            </div>

            {/* Qualificação por estrelas */}
            <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:16}}>
              <span style={{fontSize:10,fontWeight:600,letterSpacing:'1.2px',textTransform:'uppercase',color:'var(--text-muted)'}}>Qualificação</span>
              <div style={{display:'flex',gap:3}}>
                {[1,2,3,4,5].map(n => (
                  <button key={n} onClick={()=>setQualificacao(cardAtivo.id, cardAtivo.qualificacao===n ? 0 : n)}
                    title={n===cardAtivo.qualificacao?'Clique pra remover':`${n} estrela${n>1?'s':''}`}
                    style={{background:'none',border:'none',padding:0,cursor:'pointer',fontSize:22,lineHeight:1,color:n<=(cardAtivo.qualificacao||0)?'var(--star)':'var(--star-empty)',transition:'color 0.1s,transform 0.1s'}}
                    onMouseEnter={e=>(e.currentTarget.style.transform='scale(1.15)')}
                    onMouseLeave={e=>(e.currentTarget.style.transform='scale(1)')}>
                    ★
                  </button>
                ))}
              </div>
              {cardAtivo.qualificacao > 0 && (
                <span style={{fontSize:11,color:'var(--star)',fontWeight:600}}>{cardAtivo.qualificacao}/5</span>
              )}
            </div>

            {/* Info */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:16}}>
              {[
                ['Etapa', cardAtivo.etapa],
                ['Produto', cardAtivo.produto||'—'],
                ['Prêmio', cardAtivo.premio ? `R$ ${Number(cardAtivo.premio).toLocaleString('pt-BR',{minimumFractionDigits:2})}` : '—'],
                ['Responsável', cardAtivo.users?.nome||'—'],
                ['🆕 Criado em', cardAtivo.created_at ? new Date(cardAtivo.created_at).toLocaleString('pt-BR') : '—'],
                ['🏁 Fechado em', cardAtivo.data_fechamento ? new Date(cardAtivo.data_fechamento).toLocaleString('pt-BR') : '— (em andamento)'],
              ].map(([l,v])=>(
                <div key={l}><div style={{fontSize:10,fontWeight:600,letterSpacing:'1.2px',textTransform:'uppercase',color:'var(--text-muted)',marginBottom:4}}>{l}</div>
                  <div style={{fontSize:13}}>{v}</div></div>
              ))}
            </div>

            {/* Cliente */}
            <div style={{marginBottom:16,padding:'12px 16px',background:'rgba(255,255,255,0.04)',borderRadius:10,border:'1px solid var(--border)'}}>
              <div style={{fontSize:10,fontWeight:600,letterSpacing:'1.2px',textTransform:'uppercase',color:'var(--text-muted)',marginBottom:8}}>Cliente</div>
              {cardAtivo.clientes ? (
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                  <div>
                    <div style={{fontSize:13,fontWeight:500}}>{cardAtivo.clientes.nome}</div>
                    <div style={{fontSize:11,color:'var(--text-muted)'}}>{cardAtivo.clientes.cpf_cnpj} {cardAtivo.clientes.telefone&&`· ${cardAtivo.clientes.telefone}`}</div>
                  </div>
                  <button onClick={()=>router.push(`/dashboard/clientes/${cardAtivo.cliente_id}`)} style={{fontSize:12,padding:'4px 10px',borderRadius:6,border:'1px solid var(--border)',background:'transparent',color:'var(--teal)',cursor:'pointer',fontFamily:'DM Sans,sans-serif'}}>
                    Ver perfil →
                  </button>
                </div>
              ) : (
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                  <div style={{fontSize:12,color:'var(--text-muted)'}}>
                    {cardAtivo.cpf_cnpj ? `CPF: ${cardAtivo.cpf_cnpj}` : 'Sem cliente vinculado'}
                  </div>
                  <button onClick={()=>{setModalCard(false);setNegocioVincular(cardAtivo);setVincularTab('buscar');setVincularBusca('');setVincularRes([]);setNovoClienteForm({nome:'',cpf_cnpj:cardAtivo.cpf_cnpj||'',telefone:'',email:''});setModalVincular(true)}}
                    style={{fontSize:12,padding:'5px 12px',borderRadius:6,border:'1px solid rgba(201,168,76,0.4)',background:'rgba(201,168,76,0.08)',color:'var(--gold)',cursor:'pointer',fontFamily:'DM Sans,sans-serif'}}>
                    + Vincular cliente
                  </button>
                </div>
              )}
            </div>

            {/* Obs */}
            {cardAtivo.obs && (
              <div style={{marginBottom:16,padding:'12px 16px',background:'rgba(255,255,255,0.03)',borderRadius:10,border:'1px solid var(--border)',fontSize:12,color:'var(--text-muted)',lineHeight:1.6}}>
                {cardAtivo.obs}
              </div>
            )}

            {/* Mover etapa */}
            {funiAtual && (
              <div style={{marginBottom:16}}>
                <div style={{fontSize:12,color:'var(--text-muted)',marginBottom:8}}>Mover para etapa:</div>
                <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                  {(funiAtual.etapas||[]).filter((e:string)=>e!==cardAtivo.etapa).map((e:string)=>(
                    <button key={e} onClick={()=>{moverEtapa(cardAtivo.id,e);setModalCard(false)}}
                      style={{padding:'5px 12px',borderRadius:8,fontSize:12,cursor:'pointer',border:'1px solid var(--border)',background:'rgba(255,255,255,0.04)',color:'var(--text-muted)',fontFamily:'DM Sans,sans-serif'}}>
                      → {e}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Campos personalizados — sempre visível pra admin saber onde criar */}
            <div style={{marginBottom:14,padding:'10px 14px',background:'rgba(255,255,255,0.03)',border:'1px solid var(--border)',borderRadius:10}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
                <div style={{fontSize:10,fontWeight:600,letterSpacing:'1.2px',textTransform:'uppercase',color:'var(--text-muted)'}}>🧩 Campos personalizados {camposPers.length > 0 ? `(${camposPers.length})` : ''}</div>
                {profile?.role === 'admin' && (
                  <a href="/dashboard/configuracoes" target="_blank" rel="noreferrer" style={{fontSize:10,color:'var(--gold)',textDecoration:'none'}}>
                    ⚙ {camposPers.length > 0 ? 'Gerenciar' : 'Criar campos'} →
                  </a>
                )}
              </div>
              {camposPers.length === 0 ? (
                <div style={{fontSize:11,color:'var(--text-muted)',padding:'4px 0'}}>
                  {profile?.role === 'admin'
                    ? <>Nenhum campo personalizado criado ainda. <a href="/dashboard/configuracoes" target="_blank" rel="noreferrer" style={{color:'var(--gold)'}}>Criar em Configurações → aba "🧩 Campos personalizados"</a>.</>
                    : 'Nenhum campo personalizado configurado. Peça ao administrador.'}
                </div>
              ) : (
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                  {camposPers.map(c => {
                    const valor = (cardAtivo.custom_fields || {})[c.chave] ?? ''
                    const cmnInp: React.CSSProperties = { width:'100%', background:'rgba(255,255,255,0.05)', border:'1px solid var(--border)', borderRadius:6, padding:'5px 9px', color:'var(--text)', fontSize:12, outline:'none', boxSizing:'border-box' }
                    return (
                      <div key={c.id}>
                        <label style={{fontSize:10,color:'var(--text-muted)',display:'block',marginBottom:3}}>{c.nome}{c.obrigatorio && <span style={{color:'var(--red)'}}> *</span>}</label>
                        {c.tipo === 'texto'    && <input value={valor} onChange={e=>setCustomField(c.chave, e.target.value)} style={cmnInp} />}
                        {c.tipo === 'textarea' && <textarea value={valor} onChange={e=>setCustomField(c.chave, e.target.value)} rows={2} style={{...cmnInp,resize:'none'}} />}
                        {c.tipo === 'numero'   && <input type="number" value={valor} onChange={e=>setCustomField(c.chave, e.target.value)} style={cmnInp} />}
                        {c.tipo === 'data'     && <input type="date"   value={valor} onChange={e=>setCustomField(c.chave, e.target.value)} style={cmnInp} />}
                        {c.tipo === 'select'   && (
                          <select value={valor} onChange={e=>setCustomField(c.chave, e.target.value)} style={{...cmnInp,background:'#ffffff'}}>
                            <option value="">—</option>
                            {(c.opcoes || []).map((op:string) => <option key={op} value={op}>{op}</option>)}
                          </select>
                        )}
                        {c.tipo === 'boolean'  && (
                          <label style={{display:'flex',alignItems:'center',gap:6,fontSize:12,cursor:'pointer'}}>
                            <input type="checkbox" checked={!!valor} onChange={e=>setCustomField(c.chave, e.target.checked)} />
                            {valor ? 'Sim' : 'Não'}
                          </label>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Origem */}
            <div style={{marginBottom:14,padding:'10px 14px',background:'rgba(255,255,255,0.03)',border:'1px solid var(--border)',borderRadius:10}}>
              <div style={{fontSize:10,fontWeight:600,letterSpacing:'1.2px',textTransform:'uppercase',color:'var(--text-muted)',marginBottom:6}}>📍 Origem do lead</div>
              <select value={cardAtivo.origem_id || ''} onChange={e=>setOrigemDoCard(e.target.value)}
                style={{width:'100%',background:'#ffffff',border:'1px solid var(--border)',borderRadius:8,padding:'7px 10px',color:'var(--text)',fontSize:12,cursor:'pointer'}}>
                <option value="">— sem origem —</option>
                {origens.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
              </select>
            </div>

            {/* Tags */}
            <div style={{marginBottom:14,padding:'10px 14px',background:'rgba(255,255,255,0.03)',border:'1px solid var(--border)',borderRadius:10}}>
              <div style={{fontSize:10,fontWeight:600,letterSpacing:'1.2px',textTransform:'uppercase',color:'var(--text-muted)',marginBottom:8}}>🏷 Tags</div>
              <div style={{display:'flex',flexWrap:'wrap',gap:6,marginBottom:8}}>
                {tagsCard.map(t => (
                  <span key={t.id} style={{display:'inline-flex',alignItems:'center',gap:4,fontSize:11,padding:'3px 8px',borderRadius:12,background:(t.cor||'#c9a84c')+'22',border:'1px solid '+(t.cor||'#c9a84c')+'66',color:t.cor||'#c9a84c'}}>
                    {t.nome}
                    <button onClick={()=>removerTag(t.id)} style={{background:'none',border:'none',color:'inherit',cursor:'pointer',fontSize:13,lineHeight:1,padding:0}}>×</button>
                  </span>
                ))}
                {tagsCard.length === 0 && <span style={{fontSize:11,color:'var(--text-muted)'}}>Nenhuma tag</span>}
              </div>
              <select value="" onChange={e=>{if(e.target.value){adicionarTag(tagsAll.find(t=>t.id===e.target.value)?.nome||'');(e.target as HTMLSelectElement).value=''}}}
                style={{width:'100%',background:'#ffffff',border:'1px solid var(--border)',borderRadius:8,padding:'6px 10px',color:'var(--text)',fontSize:11,cursor:'pointer',marginBottom:6}}>
                <option value="">+ Adicionar tag existente...</option>
                {tagsAll.filter(t => !tagsCard.find(tc => tc.id === t.id)).map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
              </select>
              <input placeholder="Ou digite uma nova tag e tecle Enter" onKeyDown={e=>{
                if (e.key === 'Enter') {
                  const v = (e.target as HTMLInputElement).value.trim()
                  if (v) { adicionarTag(v); (e.target as HTMLInputElement).value = '' }
                }
              }} style={{width:'100%',background:'rgba(255,255,255,0.05)',border:'1px solid var(--border)',borderRadius:8,padding:'6px 10px',color:'var(--text)',fontSize:11,outline:'none',boxSizing:'border-box'}} />
            </div>

            {/* Produtos do negócio */}
            <div style={{marginBottom:14,padding:'10px 14px',background:'rgba(255,255,255,0.03)',border:'1px solid var(--border)',borderRadius:10}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
                <div style={{fontSize:10,fontWeight:600,letterSpacing:'1.2px',textTransform:'uppercase',color:'var(--text-muted)'}}>📦 Produtos</div>
                <div style={{fontSize:11,color:'var(--teal)',fontWeight:600}}>
                  Total: R$ {produtosCard.reduce((s,p)=>s + (Number(p.quantidade||1)*Number(p.valor_unit||0) - Number(p.desconto||0)), 0).toLocaleString('pt-BR',{minimumFractionDigits:2})}
                </div>
              </div>
              {produtosCard.length === 0 ? (
                <div style={{fontSize:11,color:'var(--text-muted)',marginBottom:8}}>Nenhum produto adicionado</div>
              ) : (
                <div style={{marginBottom:8}}>
                  {produtosCard.map(p => (
                    <div key={p.id} style={{display:'flex',alignItems:'center',gap:8,padding:'6px 0',borderBottom:'1px solid rgba(255,255,255,0.04)',fontSize:12}}>
                      <div style={{flex:1}}>{p.nome_snapshot}</div>
                      <div style={{color:'var(--text-muted)'}}>{p.quantidade}× R$ {Number(p.valor_unit).toLocaleString('pt-BR',{minimumFractionDigits:2})}</div>
                      <button onClick={()=>removerProduto(p.id)} style={{background:'none',border:'none',color:'var(--red)',cursor:'pointer',fontSize:13}}>×</button>
                    </div>
                  ))}
                </div>
              )}
              <div style={{display:'grid',gridTemplateColumns:'2fr 0.8fr 1fr auto',gap:6}}>
                <select value={novoProdNeg.produto_id} onChange={e=>{
                  const p = produtosAll.find(x => x.id === e.target.value)
                  setNovoProdNeg(s => ({ ...s, produto_id: e.target.value, valor_unit: p?.preco_base ? String(p.preco_base) : s.valor_unit }))
                }} style={{background:'#ffffff',border:'1px solid var(--border)',borderRadius:6,padding:'6px 8px',color:'var(--text)',fontSize:11}}>
                  <option value="">Produto…</option>
                  {produtosAll.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                </select>
                <input value={novoProdNeg.quantidade} onChange={e=>setNovoProdNeg(s=>({...s,quantidade:e.target.value}))} placeholder="Qtd" style={{background:'rgba(255,255,255,0.05)',border:'1px solid var(--border)',borderRadius:6,padding:'6px 8px',color:'var(--text)',fontSize:11,outline:'none'}} />
                <input value={novoProdNeg.valor_unit} onChange={e=>setNovoProdNeg(s=>({...s,valor_unit:e.target.value}))} placeholder="Valor unit." style={{background:'rgba(255,255,255,0.05)',border:'1px solid var(--border)',borderRadius:6,padding:'6px 8px',color:'var(--text)',fontSize:11,outline:'none'}} />
                <button onClick={adicionarProduto} disabled={!novoProdNeg.produto_id} style={{padding:'6px 12px',borderRadius:6,fontSize:11,border:'1px solid rgba(28,181,160,0.4)',background:'rgba(28,181,160,0.10)',color:'var(--teal)',cursor:'pointer'}}>+</button>
              </div>
            </div>

            {/* Anexos */}
            <div style={{marginBottom:14,padding:'10px 14px',background:'rgba(255,255,255,0.03)',border:'1px solid var(--border)',borderRadius:10}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8,flexWrap:'wrap',gap:8}}>
                <div style={{fontSize:10,fontWeight:600,letterSpacing:'1.2px',textTransform:'uppercase',color:'var(--text-muted)'}}>📎 Anexos ({anexosCard.length})</div>
                <div style={{display:'flex',gap:6}}>
                  <button onClick={()=>fileInputRef.current?.click()} disabled={uploadando}
                    style={{padding:'5px 12px',borderRadius:6,fontSize:11,border:'1px solid var(--border)',background:'rgba(255,255,255,0.04)',color:'var(--gold)',cursor:'pointer',fontFamily:'DM Sans,sans-serif',fontWeight:600}}>
                    {uploadando ? '⏳ Enviando...' : '+ Anexar arquivo'}
                  </button>
                  <button onClick={abrirModalAssinatura}
                    style={{padding:'5px 12px',borderRadius:6,fontSize:11,border:'1px solid rgba(28,181,160,0.4)',background:'rgba(28,181,160,0.10)',color:'var(--teal)',cursor:'pointer',fontFamily:'DM Sans,sans-serif',fontWeight:600}}>
                    ✍ Assinatura eletrônica
                  </button>
                </div>
              </div>
              <input ref={fileInputRef} type="file" multiple onChange={e=>uploadAnexos(e.target.files)} style={{display:'none'}} />
              {anexosCard.length === 0 ? (
                <div style={{fontSize:11,color:'var(--text-muted)',padding:'8px 0'}}>Nenhum arquivo anexado. Anexe contratos, propostas e documentos relacionados.</div>
              ) : (
                <div>
                  {anexosCard.map(a => {
                    const isPdf = /\.pdf$/i.test(a.nome_arquivo)
                    return (
                      <div key={a.id} style={{display:'flex',alignItems:'center',gap:8,padding:'6px 0',borderBottom:'1px solid rgba(255,255,255,0.04)',fontSize:12}}>
                        <span style={{fontSize:14}}>{isPdf?'📄':'📎'}</span>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{a.nome_arquivo}</div>
                          <div style={{fontSize:10,color:'var(--text-muted)'}}>
                            {a.users?.nome || '—'} · {a.tamanho_kb ? `${a.tamanho_kb} KB` : ''} · {new Date(a.created_at).toLocaleString('pt-BR')}
                          </div>
                        </div>
                        <button onClick={()=>baixarAnexo(a)} style={{padding:'3px 8px',fontSize:10,borderRadius:5,border:'1px solid var(--border)',background:'rgba(255,255,255,0.04)',color:'var(--gold)',cursor:'pointer'}} title="Baixar">⬇</button>
                        {(profile?.role === 'admin' || a.user_id === profile?.id) && (
                          <button onClick={()=>excluirAnexo(a)} style={{padding:'3px 8px',fontSize:10,borderRadius:5,border:'1px solid rgba(224,82,82,0.3)',background:'transparent',color:'var(--red)',cursor:'pointer'}} title="Excluir">×</button>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Notas */}
            <div style={{marginBottom:14,padding:'10px 14px',background:'rgba(255,255,255,0.03)',border:'1px solid var(--border)',borderRadius:10}}>
              <div style={{fontSize:10,fontWeight:600,letterSpacing:'1.2px',textTransform:'uppercase',color:'var(--text-muted)',marginBottom:8}}>
                📝 Notas / Anotações
                {profile?.role !== 'admin' && <span style={{fontWeight:400,marginLeft:8,textTransform:'none',letterSpacing:0,fontSize:9,color:'var(--text-muted)'}}>· apenas admin pode editar/excluir</span>}
              </div>
              <div style={{display:'flex',gap:6,marginBottom:8}}>
                <input value={novaNota} onChange={e=>setNovaNota(e.target.value)}
                  onKeyDown={e=>{if(e.key==='Enter')adicionarNota()}}
                  placeholder="Adicionar uma nota..."
                  style={{flex:1,background:'rgba(255,255,255,0.05)',border:'1px solid var(--border)',borderRadius:6,padding:'6px 10px',color:'var(--text)',fontSize:12,outline:'none'}} />
                <button onClick={adicionarNota} disabled={!novaNota.trim()} style={{padding:'6px 12px',borderRadius:6,fontSize:11,border:'1px solid rgba(28,181,160,0.4)',background:'rgba(28,181,160,0.10)',color:'var(--teal)',cursor:'pointer'}}>+</button>
              </div>
              <div style={{maxHeight:240,overflow:'auto'}}>
                {notasCard.length === 0 ? (
                  <div style={{fontSize:11,color:'var(--text-muted)'}}>Sem notas</div>
                ) : notasCard.map(n => {
                  const editing = editandoNota?.id === n.id
                  return (
                    <div key={n.id} style={{padding:'6px 0',borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
                      {editing ? (
                        <div style={{display:'flex',gap:6,marginBottom:4}}>
                          <textarea value={editandoNota!.conteudo} onChange={e=>setEditandoNota(p=>p?{...p,conteudo:e.target.value}:p)}
                            rows={2} style={{flex:1,background:'rgba(255,255,255,0.05)',border:'1px solid var(--border)',borderRadius:6,padding:'5px 8px',color:'var(--text)',fontSize:12,outline:'none',resize:'none',fontFamily:'DM Sans,sans-serif'}} />
                          <div style={{display:'flex',flexDirection:'column',gap:4}}>
                            <button onClick={salvarEdicaoNota} style={{padding:'3px 8px',fontSize:10,borderRadius:5,border:'1px solid rgba(28,181,160,0.4)',background:'rgba(28,181,160,0.10)',color:'var(--teal)',cursor:'pointer'}}>✓</button>
                            <button onClick={()=>setEditandoNota(null)} style={{padding:'3px 8px',fontSize:10,borderRadius:5,border:'1px solid var(--border)',background:'transparent',color:'var(--text-muted)',cursor:'pointer'}}>✕</button>
                          </div>
                        </div>
                      ) : (
                        <div style={{fontSize:12,marginBottom:2,whiteSpace:'pre-wrap'}}>{n.conteudo}</div>
                      )}
                      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8}}>
                        <div style={{fontSize:10,color:'var(--text-muted)'}}>
                          {n.users?.nome || '—'} · {new Date(n.criado_em).toLocaleString('pt-BR')}
                        </div>
                        {profile?.role === 'admin' && !editing && (
                          <div style={{display:'flex',gap:4}}>
                            <button onClick={()=>setEditandoNota({id:n.id,conteudo:n.conteudo})}
                              style={{padding:'2px 6px',fontSize:10,borderRadius:5,border:'1px solid var(--border)',background:'transparent',color:'var(--gold)',cursor:'pointer'}}>✎</button>
                            <button onClick={()=>excluirNota(n.id)}
                              style={{padding:'2px 6px',fontSize:10,borderRadius:5,border:'1px solid rgba(224,82,82,0.3)',background:'transparent',color:'var(--red)',cursor:'pointer'}}>🗑</button>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Ganho / Perdido */}
            <div style={{marginBottom:16,padding:'12px 14px',background:'rgba(255,255,255,0.03)',border:'1px solid var(--border)',borderRadius:10}}>
              <div style={{fontSize:10,fontWeight:600,letterSpacing:'1.2px',textTransform:'uppercase',color:'var(--text-muted)',marginBottom:8}}>
                Status do negócio · {cardAtivo.status === 'ganho' ? '✓ Ganho' : cardAtivo.status === 'perdido' ? '✕ Perdido' : 'Em andamento'}
              </div>
              <div style={{display:'flex',flexWrap:'wrap',gap:8}}>
                <button onClick={()=>marcarStatus(cardAtivo.id,'ganho')}
                  disabled={cardAtivo.status==='ganho'}
                  style={{flex:1,minWidth:120,padding:'8px 14px',borderRadius:8,fontSize:13,fontWeight:600,cursor:cardAtivo.status==='ganho'?'default':'pointer',border:'1px solid rgba(28,181,160,0.4)',background:cardAtivo.status==='ganho'?'rgba(28,181,160,0.25)':'rgba(28,181,160,0.1)',color:'var(--teal)',fontFamily:'DM Sans,sans-serif',opacity:cardAtivo.status==='ganho'?0.7:1}}>
                  ✓ Marcar Ganho
                </button>
                <button onClick={()=>{setModalPerdido(cardAtivo);setMotivoSelecionado('');setMotivoCustom('')}}
                  disabled={cardAtivo.status==='perdido'}
                  style={{flex:1,minWidth:120,padding:'8px 14px',borderRadius:8,fontSize:13,fontWeight:600,cursor:cardAtivo.status==='perdido'?'default':'pointer',border:'1px solid rgba(224,82,82,0.4)',background:cardAtivo.status==='perdido'?'rgba(224,82,82,0.25)':'rgba(224,82,82,0.1)',color:'var(--red)',fontFamily:'DM Sans,sans-serif',opacity:cardAtivo.status==='perdido'?0.7:1}}>
                  ✕ Marcar Perdido
                </button>
                {cardAtivo.status && cardAtivo.status !== 'em_andamento' && (
                  <button onClick={()=>marcarStatus(cardAtivo.id,'em_andamento')}
                    style={{padding:'8px 12px',borderRadius:8,fontSize:12,cursor:'pointer',border:'1px solid var(--border)',background:'rgba(255,255,255,0.04)',color:'var(--text-muted)',fontFamily:'DM Sans,sans-serif'}}>
                    ↺ Reabrir
                  </button>
                )}
              </div>
              {cardAtivo.status === 'perdido' && cardAtivo.motivo_perda && (
                <div style={{marginTop:8,fontSize:11,color:'var(--text-muted)'}}>Motivo: {cardAtivo.motivo_perda}</div>
              )}
            </div>

            <div style={{display:'flex',justifyContent:'space-between'}}>
              <button onClick={()=>excluirNegocio(cardAtivo.id)} style={{fontSize:12,padding:'6px 14px',borderRadius:8,border:'1px solid rgba(224,82,82,0.3)',background:'rgba(224,82,82,0.08)',color:'var(--red)',cursor:'pointer',fontFamily:'DM Sans,sans-serif'}}>
                🗑 Excluir
              </button>
              <button className="btn-secondary" onClick={()=>setModalCard(false)}>Fechar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Marcar negociação como Perdida */}
      {modalPerdido && (
        <div style={{position:'fixed',inset:0,background:'rgba(15,23,42,0.45)',zIndex:300,display:'flex',alignItems:'center',justifyContent:'center',backdropFilter:'blur(6px)'}}
          onClick={e=>e.target===e.currentTarget&&setModalPerdido(null)}>
          <div style={{background:'#ffffff',border:'1px solid var(--border)',borderRadius:20,padding:'28px 32px',width:480,maxWidth:'95vw'}}>
            <div style={{fontFamily:'DM Serif Display,serif',fontSize:18,marginBottom:6,color:'var(--red)'}}>
              ✕ Marcar como Perdido
            </div>
            <div style={{fontSize:12,color:'var(--text-muted)',marginBottom:18}}>
              {modalPerdido.titulo}
            </div>

            <div style={{marginBottom:14}}>
              <label style={{fontSize:11,fontWeight:600,letterSpacing:'1px',textTransform:'uppercase',color:'var(--text-muted)',display:'block',marginBottom:6}}>
                Motivo da perda
              </label>
              {motivosPerda.length > 0 ? (
                <select value={motivoSelecionado} onChange={e=>setMotivoSelecionado(e.target.value)}
                  style={{width:'100%',background:'#ffffff',border:'1px solid var(--border)',borderRadius:8,padding:'10px 13px',color:'var(--text)',fontSize:13,outline:'none'}}>
                  <option value="">— selecione um motivo —</option>
                  {motivosPerda.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
                  <option value="__custom__">— Outro motivo (digitar) —</option>
                </select>
              ) : (
                <div style={{fontSize:11,color:'var(--warning)',background:'rgba(201,168,76,0.08)',border:'1px solid rgba(201,168,76,0.3)',padding:'8px 12px',borderRadius:8}}>
                  Nenhum motivo cadastrado. {profile?.role==='admin' ? <>Cadastre em <a href="/dashboard/configuracoes" style={{color:'var(--gold)'}}>Configurações</a> ou peça pra rodar o sync RD.</> : 'Peça ao administrador pra cadastrar.'}
                </div>
              )}
            </div>

            {(motivoSelecionado === '__custom__' || motivosPerda.length === 0) && (
              <div style={{marginBottom:14}}>
                <label style={{fontSize:11,fontWeight:600,letterSpacing:'1px',textTransform:'uppercase',color:'var(--text-muted)',display:'block',marginBottom:6}}>
                  Descreva o motivo
                </label>
                <input value={motivoCustom} onChange={e=>setMotivoCustom(e.target.value)}
                  placeholder="Ex: Cliente desistiu" style={{width:'100%',background:'rgba(255,255,255,0.05)',border:'1px solid var(--border)',borderRadius:8,padding:'9px 13px',color:'var(--text)',fontSize:13,outline:'none',boxSizing:'border-box'}} />
              </div>
            )}

            <div style={{display:'flex',gap:10,justifyContent:'flex-end',marginTop:18}}>
              <button onClick={()=>setModalPerdido(null)} className="btn-secondary">Cancelar</button>
              <button onClick={()=>{
                const motivoObj = motivoSelecionado && motivoSelecionado !== '__custom__'
                  ? motivosPerda.find(m => m.id === motivoSelecionado) : null
                const motivoTexto = motivoObj?.nome || motivoCustom || null
                marcarStatus(modalPerdido.id, 'perdido', motivoTexto || undefined, motivoObj?.id || null)
                setModalPerdido(null); setMotivoSelecionado(''); setMotivoCustom('')
              }} style={{padding:'9px 18px',borderRadius:8,fontSize:13,fontWeight:600,cursor:'pointer',border:'1px solid rgba(224,82,82,0.4)',background:'rgba(224,82,82,0.15)',color:'var(--red)',fontFamily:'DM Sans,sans-serif'}}>
                ✕ Confirmar perda
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Enviar para assinatura eletrônica (Autentique) */}
      {modalAssinatura && cardAtivo && (
        <div style={{position:'fixed',inset:0,background:'rgba(15,23,42,0.45)',zIndex:300,display:'flex',alignItems:'center',justifyContent:'center',backdropFilter:'blur(6px)'}}
          onClick={e=>e.target===e.currentTarget&&setModalAssinatura(false)}>
          <div style={{background:'#ffffff',border:'1px solid var(--border)',borderRadius:20,padding:'28px 32px',width:640,maxWidth:'95vw',maxHeight:'90vh',overflow:'auto'}}>
            <div style={{fontFamily:'DM Serif Display,serif',fontSize:18,marginBottom:6}}>✍ Enviar para assinatura eletrônica</div>
            <div style={{fontSize:12,color:'var(--text-muted)',marginBottom:18}}>{cardAtivo.titulo}</div>

            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:14}}>
              <div>
                <label style={{fontSize:11,fontWeight:600,letterSpacing:'1px',textTransform:'uppercase',color:'var(--text-muted)',display:'block',marginBottom:5}}>Documento *</label>
                <select value={formAssinatura.anexo_id} onChange={e=>{
                  const a = anexosCard.find(x => x.id === e.target.value)
                  // Reaplica template ao trocar de doc (atualiza variáveis)
                  const t = templates.find(x => x.id === formAssinatura.template_id)
                  setFormAssinatura(f => ({
                    ...f,
                    anexo_id: e.target.value,
                    mensagem: t ? substituirVars(t.mensagem || '', a?.nome_arquivo) : f.mensagem,
                    assunto:  t ? substituirVars(t.assunto || '',  a?.nome_arquivo) : f.assunto,
                  }))
                }} style={{width:'100%',background:'#ffffff',border:'1px solid var(--border)',borderRadius:8,padding:'9px 13px',color:'var(--text)',fontSize:13,outline:'none'}}>
                  {anexosCard.filter(a => /\.pdf$/i.test(a.nome_arquivo)).map(a => (
                    <option key={a.id} value={a.id}>{a.nome_arquivo}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{fontSize:11,fontWeight:600,letterSpacing:'1px',textTransform:'uppercase',color:'var(--text-muted)',display:'block',marginBottom:5}}>
                  Template
                  {profile?.role === 'admin' && <a href="/dashboard/configuracoes" target="_blank" rel="noreferrer" style={{marginLeft:6,fontSize:9,color:'var(--gold)',textTransform:'none',letterSpacing:0,fontWeight:400}}>gerenciar →</a>}
                </label>
                <select value={formAssinatura.template_id} onChange={e=>{
                  const a = anexosCard.find(x => x.id === formAssinatura.anexo_id)
                  aplicarTemplateNoForm(e.target.value, a?.nome_arquivo)
                }} style={{width:'100%',background:'#ffffff',border:'1px solid var(--border)',borderRadius:8,padding:'9px 13px',color:'var(--text)',fontSize:13,outline:'none'}}>
                  <option value="">— escolha um template —</option>
                  {Array.from(new Set(templates.map(t => t.categoria))).map(cat => (
                    <optgroup key={cat} label={cat.toUpperCase()}>
                      {templates.filter(t => t.categoria === cat).map(t => (
                        <option key={t.id} value={t.id}>{t.is_default ? '★ ' : ''}{t.nome}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
            </div>

            <div style={{marginBottom:14}}>
              <label style={{fontSize:11,fontWeight:600,letterSpacing:'1px',textTransform:'uppercase',color:'var(--text-muted)',display:'block',marginBottom:5}}>Signatários *</label>
              {formAssinatura.signatarios.map((s, i) => (
                <div key={i} style={{display:'grid',gridTemplateColumns:'1fr 1fr auto',gap:8,marginBottom:6}}>
                  <input value={s.nome} onChange={e=>setFormAssinatura(f=>{const a=[...f.signatarios];a[i]={...a[i],nome:e.target.value};return {...f,signatarios:a}})} placeholder="Nome" style={{background:'rgba(255,255,255,0.05)',border:'1px solid var(--border)',borderRadius:8,padding:'8px 12px',color:'var(--text)',fontSize:13,outline:'none'}} />
                  <input value={s.email} onChange={e=>setFormAssinatura(f=>{const a=[...f.signatarios];a[i]={...a[i],email:e.target.value};return {...f,signatarios:a}})} placeholder="email@exemplo.com" type="email" style={{background:'rgba(255,255,255,0.05)',border:'1px solid var(--border)',borderRadius:8,padding:'8px 12px',color:'var(--text)',fontSize:13,outline:'none'}} />
                  <button onClick={()=>setFormAssinatura(f=>({...f,signatarios:f.signatarios.filter((_,j)=>j!==i)}))}
                    disabled={formAssinatura.signatarios.length===1}
                    style={{padding:'6px 10px',borderRadius:6,fontSize:11,border:'1px solid rgba(224,82,82,0.3)',background:'rgba(224,82,82,0.06)',color:'var(--red)',cursor:formAssinatura.signatarios.length===1?'not-allowed':'pointer',opacity:formAssinatura.signatarios.length===1?0.4:1}}>×</button>
                </div>
              ))}
              <button onClick={()=>setFormAssinatura(f=>({...f,signatarios:[...f.signatarios,{nome:'',email:''}]}))}
                style={{padding:'5px 12px',borderRadius:6,fontSize:11,border:'1px solid var(--border)',background:'rgba(255,255,255,0.04)',color:'var(--gold)',cursor:'pointer',fontFamily:'DM Sans,sans-serif'}}>+ Adicionar signatário</button>
            </div>

            {formAssinatura.assunto && (
              <div style={{marginBottom:14}}>
                <label style={{fontSize:11,fontWeight:600,letterSpacing:'1px',textTransform:'uppercase',color:'var(--text-muted)',display:'block',marginBottom:5}}>Assunto</label>
                <input value={formAssinatura.assunto} onChange={e=>setFormAssinatura(f=>({...f,assunto:e.target.value}))}
                  style={{width:'100%',background:'rgba(255,255,255,0.05)',border:'1px solid var(--border)',borderRadius:8,padding:'9px 13px',color:'var(--text)',fontSize:13,outline:'none',boxSizing:'border-box'}} />
              </div>
            )}

            <div style={{marginBottom:18}}>
              <label style={{fontSize:11,fontWeight:600,letterSpacing:'1px',textTransform:'uppercase',color:'var(--text-muted)',display:'block',marginBottom:5}}>
                Mensagem <span style={{textTransform:'none',letterSpacing:0,fontWeight:400}}>· variáveis: <code>{'{{cliente}}'}</code> <code>{'{{negocio}}'}</code> <code>{'{{documento}}'}</code></span>
              </label>
              <textarea value={formAssinatura.mensagem} onChange={e=>setFormAssinatura(f=>({...f,mensagem:e.target.value}))} rows={6}
                style={{width:'100%',background:'rgba(255,255,255,0.05)',border:'1px solid var(--border)',borderRadius:8,padding:'9px 13px',color:'var(--text)',fontSize:13,outline:'none',resize:'vertical',fontFamily:'DM Sans,sans-serif',lineHeight:1.5,boxSizing:'border-box'}} />
            </div>

            <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
              <button className="btn-secondary" onClick={()=>setModalAssinatura(false)}>Cancelar</button>
              <button className="btn-primary" onClick={enviarParaAssinatura} disabled={enviandoAssin||!formAssinatura.anexo_id}>
                {enviandoAssin ? 'Enviando...' : '✍ Enviar para assinatura'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
