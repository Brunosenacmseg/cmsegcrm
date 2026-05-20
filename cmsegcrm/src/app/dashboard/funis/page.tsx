'use client'
import { Suspense, useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'
import { getVisibleUserIds } from '@/lib/auth'
import { exportarXLSX, fmt } from '@/lib/export-xlsx'

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
  // Soma de (quantidade × valor_unit − desconto) dos itens em `negocio_produtos`,
  // indexada pelo negocio_id. É a mesma regra usada na página do negócio para
  // exibir o "Valor total" — sem isso o funil só soma `premio` e ignora cards
  // cujo valor foi montado via produtos.
  const [valorProdutosPorNegocio, setValorProdutosPorNegocio] = useState<Record<string, number>>({})
  const [contagemPorFunil, setContagemPorFunil] = useState<Record<string, number>>({})
  const [usuarios, setUsuarios]   = useState<any[]>([])
  const [loading, setLoading]     = useState(true)
  const [funilAtivo, setFunilAtivo] = useState<string|null>(null)
  const [seletorAberto, setSeletorAberto] = useState(false)
  const kanbanRef = useRef<HTMLDivElement>(null)
  const topScrollRef = useRef<HTMLDivElement>(null)
  const [kanbanWidth, setKanbanWidth] = useState(0)

  // Tick a cada 60s para atualizar cronômetros "tempo sem movimento" nos cards
  const [tickNow, setTickNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setTickNow(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [])

  // Motivos de perda (admin cadastra em /dashboard/configuracoes)
  const [motivosPerda, setMotivosPerda] = useState<any[]>([])
  // Drag & drop kanban
  const [arrastando, setArrastando] = useState<string | null>(null)
  const [etapaHover, setEtapaHover] = useState<string | null>(null)
  // Seleção em massa (admin)
  const [modoSelecao, setModoSelecao] = useState(false)
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [bulkLoading, setBulkLoading] = useState(false)
  // Filtro por status do negócio (ganho/perdido/em_andamento/todos)
  const [filtroStatus, setFiltroStatus] = useState<'todos'|'em_andamento'|'ganho'|'perdido'>('em_andamento')
  const [modoVisao, setModoVisao] = useState<'kanban'|'lista'>('kanban')
  const [ordenacao, setOrdenacao] = useState<'recentes'|'antigos'|'az'|'za'|'prox_tarefa'|'previsao_fech'|'contato_recente'|'contato_antigo'|'mais_qual'|'menos_qual'|'maior_valor'|'menor_valor'|'interacao_recente'|'interacao_antiga'>('az')
  const [filtrosOpen, setFiltrosOpen] = useState(false)
  const [visibilidadeOpen, setVisibilidadeOpen] = useState(false)
  const [visibilidadeBusca, setVisibilidadeBusca] = useState('')
  const [novaTarefaParaNegocio, setNovaTarefaParaNegocio] = useState<any|null>(null)
  const [novaTarefaForm, setNovaTarefaForm] = useState({ assunto:'', descricao:'', tipo:'tarefa', responsavel_id:'', data:'', hora:'09:00', concluida:false })
  const [salvandoNovaTarefa, setSalvandoNovaTarefa] = useState(false)

  async function salvarNovaTarefa() {
    if (!novaTarefaParaNegocio) return
    if (!novaTarefaForm.assunto.trim()) { alert('Informe o assunto da tarefa'); return }
    if (!novaTarefaForm.data) { alert('Informe a data do agendamento'); return }
    setSalvandoNovaTarefa(true)
    try {
      const prazo = `${novaTarefaForm.data}T${novaTarefaForm.hora || '09:00'}:00`
      const responsavel_id = novaTarefaForm.responsavel_id || (await supabase.auth.getUser()).data.user?.id
      const { error } = await supabase.from('tarefas').insert({
        titulo: novaTarefaForm.assunto,
        descricao: novaTarefaForm.descricao || null,
        tipo: novaTarefaForm.tipo,
        responsavel_id,
        negocio_id: novaTarefaParaNegocio.id,
        prazo,
        status: novaTarefaForm.concluida ? 'concluida' : 'pendente',
      })
      if (error) throw error
      setNovaTarefaParaNegocio(null)
      setNovaTarefaForm({ assunto:'', descricao:'', tipo:'tarefa', responsavel_id:'', data:'', hora:'09:00', concluida:false })
      carregarNegocios()
    } catch (e:any) {
      alert('Erro ao criar tarefa: ' + (e?.message || e))
    } finally {
      setSalvandoNovaTarefa(false)
    }
  }
  // Filtro por data (criação ou fechamento) com período opcional
  const [filtroData, setFiltroData] = useState<{ campo: 'sem'|'criacao'|'fechamento'; de: string; ate: string }>({ campo: 'sem', de: '', ate: '' })
  const [filtroUsuario, setFiltroUsuario] = useState<string>('')
  const [filtroEquipe, setFiltroEquipe]   = useState<string>('')
  const [filtroBusca, setFiltroBusca]     = useState<string>('')
  const [equipes, setEquipes]             = useState<any[]>([])
  const [equipeMembros, setEquipeMembros] = useState<Record<string,string[]>>({})
  const [visibleIds, setVisibleIds] = useState<string[] | null>(null)
  // Acesso amplo do funil "EMISSÃO E IMPLANTAÇÃO" para a EQUIPE PÓS VENDA:
  // membros/líder enxergam todas as negociações desse funil, independente
  // do vendedor. Bypass do filtro `visibleIds` (filtros manuais continuam).
  const [userInPosvenda, setUserInPosvenda] = useState(false)

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
  const [seguradorasAll, setSeguradorasAll] = useState<any[]>([])
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
  const [formNovo, setFormNovo]   = useState({ titulo:'', produto:'', seguradora:'', premio:'', etapa:'', obs:'', vendedor_id:'', telefone:'', contato_nome:'', contato_email:'', contato_cpf_cnpj:'' })
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
  const [premioInput, setPremioInput] = useState<string>('')
  const [salvandoPremio, setSalvandoPremio] = useState(false)
  const [telefoneInput, setTelefoneInput] = useState<string>('')
  const [salvandoTelefone, setSalvandoTelefone] = useState(false)
  const [tituloInput, setTituloInput] = useState<string>('')
  const [editandoTitulo, setEditandoTitulo] = useState(false)
  const [salvandoTitulo, setSalvandoTitulo] = useState(false)
  const [comissaoPctInput, setComissaoPctInput] = useState<string>('')
  const [comissaoValorInput, setComissaoValorInput] = useState<string>('')
  const [salvandoComissao, setSalvandoComissao] = useState(false)
  // Transferência do card aberto para outro funil
  const [transferFunilId, setTransferFunilId] = useState<string>('')

  // Tarefas: lista no card aberto e mapa "próxima tarefa em aberto" por negócio
  const [tarefasCard, setTarefasCard]           = useState<any[]>([])
  const [tarefasPorNegocio, setTarefasPorNegocio] = useState<Record<string, any>>({})
  const [tarefaEditId, setTarefaEditId]         = useState<string|null>(null)
  const [tarefaEditForm, setTarefaEditForm]     = useState<{ titulo: string; prazo: string }>({ titulo:'', prazo:'' })
  const [novaTarefa, setNovaTarefa]             = useState<{ titulo: string; prazo: string }>({ titulo:'', prazo:'' })
  const [titulosHistTarefa, setTitulosHistTarefa] = useState<string[]>([])
  const [salvandoTarefa, setSalvandoTarefa]     = useState(false)

  useEffect(() => { init() }, [])
  useEffect(() => { if (funilAtivo) carregarNegocios() }, [funilAtivo, filtroUsuario, filtroEquipe, filtroStatus, visibleIds, equipeMembros, userInPosvenda, funis])
  useEffect(() => { if (funis.length) carregarContagens(funis) }, [filtroUsuario, filtroEquipe, equipeMembros, userInPosvenda, funis])

  // Listener global de dragend/drop — resolve o relato de "kanban trava o
  // arrasto depois de alguns minutos". Quando o drag é interrompido fora
  // de uma zona de drop válida (alt-tab, ESC, drop em região vazia), o
  // onDragEnd dos elementos pode não disparar, deixando o estado
  // `arrastando` preso e bloqueando arrastos seguintes.
  useEffect(() => {
    const reset = () => { setArrastando(null); setEtapaHover(null) }
    window.addEventListener('dragend', reset)
    window.addEventListener('drop', reset)
    window.addEventListener('blur', reset)
    return () => {
      window.removeEventListener('dragend', reset)
      window.removeEventListener('drop', reset)
      window.removeEventListener('blur', reset)
    }
  }, [])

  // Sincroniza a barra de rolagem horizontal de cima com o kanban
  useEffect(() => {
    const k = kanbanRef.current
    const t = topScrollRef.current
    if (!k || !t) return
    // Lock assíncrono: eventos `scroll` chegam em frames diferentes, por isso
    // resetar o lock no mesmo tick não funciona — gerava feedback infinito
    // entre as duas barras (kanban ↔ topo), travando a rolagem.
    let syncing: 'k' | 't' | null = null
    let rafId = 0
    const release = () => { rafId = 0; syncing = null }
    const onK = () => {
      if (syncing === 't') return
      syncing = 'k'
      t.scrollLeft = k.scrollLeft
      if (rafId) cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(release)
    }
    const onT = () => {
      if (syncing === 'k') return
      syncing = 't'
      k.scrollLeft = t.scrollLeft
      if (rafId) cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(release)
    }
    k.addEventListener('scroll', onK, { passive: true })
    t.addEventListener('scroll', onT, { passive: true })
    const update = () => setKanbanWidth(k.scrollWidth)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(k)
    return () => { if (rafId) cancelAnimationFrame(rafId); k.removeEventListener('scroll', onK); t.removeEventListener('scroll', onT); ro.disconnect() }
  }, [funilAtivo, negocios.length])

  // Compatibilidade com URLs legadas ?card=<negocio_id> — redireciona
  // para a pagina dedicada /dashboard/negocios/[id] (layout estilo RD).
  useEffect(() => {
    const cardId = searchParams?.get('card')
    if (!cardId) return
    router.replace(`/dashboard/negocios/${cardId}`)
  }, [searchParams])
  useEffect(() => {
    supabase.from('motivos_perda').select('*').eq('ativo', true).order('ordem').order('nome').then(({ data }: any) => setMotivosPerda(data || []))
    supabase.from('origens').select('*').eq('ativo', true).order('nome').then(({ data }: any) => setOrigens(data || []))
    supabase.from('tags').select('*').order('nome').then(({ data }: any) => setTagsAll(data || []))
    supabase.from('produtos').select('*').eq('ativo', true).order('nome').then(({ data }: any) => setProdutosAll(data || []))
    supabase.from('seguradoras').select('id,nome').eq('ativo', true).order('nome').then(({ data }: any) => setSeguradorasAll(data || []))
    supabase.from('campos_personalizados').select('*').eq('entidade','negocio').eq('ativo', true).order('ordem').order('nome').then(({ data }: any) => setCamposPers(data || []))
    supabase.from('email_templates').select('*').eq('ativo', true)
      .in('categoria', ['assinatura','renovacao','cobranca','geral'])
      .order('categoria').order('is_default', { ascending: false }).order('nome')
      .then(({ data }: any) => setTemplates(data || []))
  }, [])

  // Estado de salvamento dos campos personalizados — feedback visual e
  // proteção contra corrida com a hidratação do cardAtivo.
  const [cfSavingKey, setCfSavingKey] = useState<string | null>(null)
  const [cfSavedKey,  setCfSavedKey]  = useState<string | null>(null)
  const cfDebounceRef = useRef<Record<string, any>>({})
  const cfPendingRef  = useRef<Record<string, any>>({})

  function setCustomField(chave: string, valor: any) {
    if (!cardAtivo) return
    const cf = { ...(cardAtivo.custom_fields || {}), [chave]: valor }
    // Atualiza o estado local IMEDIATAMENTE para o input não perder caracteres
    setCardAtivo({ ...cardAtivo, custom_fields: cf })
    // Marca como pendente; persiste com debounce para não bater no banco a cada tecla
    cfPendingRef.current[chave] = valor
    setCfSavingKey(chave); setCfSavedKey(null)
    if (cfDebounceRef.current[chave]) clearTimeout(cfDebounceRef.current[chave])
    const cardId = cardAtivo.id
    cfDebounceRef.current[chave] = setTimeout(async () => {
      const valorFinal = cfPendingRef.current[chave]
      delete cfPendingRef.current[chave]
      // Lê o estado mais recente para mesclar e evitar corrida com outros campos
      const cfAtual = (cardAtivo.custom_fields || {})
      const cfMerged = { ...cfAtual, [chave]: valorFinal }
      const { error } = await supabase
        .from('negocios')
        .update({ custom_fields: cfMerged })
        .eq('id', cardId)
      if (error) {
        alert('Erro ao salvar campo personalizado: ' + error.message)
        setCfSavingKey(prev => prev === chave ? null : prev)
        return
      }
      // Sincroniza a lista global de negócios para que ao reabrir o card os
      // valores não sumam (era a causa do "não está salvando").
      setNegocios(prev => prev.map(n => n.id === cardId ? { ...n, custom_fields: cfMerged } : n))
      setCfSavingKey(prev => prev === chave ? null : prev)
      setCfSavedKey(chave)
      setTimeout(() => setCfSavedKey(prev => prev === chave ? null : prev), 1500)
    }, 500)
  }

  // Quando abrir um card, carrega detalhes ricos
  useEffect(() => {
    if (!cardAtivo) { setTagsCard([]); setProdutosCard([]); setNotasCard([]); setOrigemCard(null); setAnexosCard([]); setPremioInput(''); setTelefoneInput(''); setTituloInput(''); setEditandoTitulo(false); setComissaoPctInput(''); setComissaoValorInput(''); setTarefasCard([]); setNovaTarefa({ titulo:'', prazo:'' }); setTransferFunilId(''); return }
    setTransferFunilId('')
    setPremioInput(cardAtivo.premio != null ? String(Number(cardAtivo.premio).toFixed(2)).replace('.', ',') : '')
    setTelefoneInput(cardAtivo.telefone_negocio || '')
    setTituloInput(cardAtivo.titulo || '')
    setEditandoTitulo(false)
    setComissaoPctInput(cardAtivo.comissao_pct != null ? String(Number(cardAtivo.comissao_pct).toFixed(2)).replace('.', ',') : '')
    setComissaoValorInput(cardAtivo.comissao_valor != null ? String(Number(cardAtivo.comissao_valor).toFixed(2)).replace('.', ',') : '')
    setNovaTarefa({ titulo:'', prazo:'' })
    Promise.all([
      supabase.from('negocio_tags').select('tag_id, tags(*)').eq('negocio_id', cardAtivo.id),
      supabase.from('negocio_produtos').select('*').eq('negocio_id', cardAtivo.id).order('criado_em'),
      supabase.from('negocio_notas').select('*, users(nome,avatar_url)').eq('negocio_id', cardAtivo.id).order('pinned', { ascending: false }).order('criado_em', { ascending: false }),
      cardAtivo.origem_id ? supabase.from('origens').select('*').eq('id', cardAtivo.origem_id).maybeSingle() : Promise.resolve({ data: null }),
      supabase.from('anexos').select('*, users(nome)').eq('negocio_id', cardAtivo.id).order('created_at', { ascending: false }),
      supabase.from('tarefas')
        .select('id,titulo,descricao,prazo,status,tipo,responsavel_id,users!tarefas_responsavel_id_fkey(id,nome,avatar_url)')
        .eq('negocio_id', cardAtivo.id)
        .order('status', { ascending: true })
        .order('prazo', { ascending: true, nullsFirst: false }),
    ]).then(([t, p, n, o, a, tk]) => {
      setTagsCard((t.data || []).map((x: any) => x.tags).filter(Boolean))
      setProdutosCard(p.data || [])
      setNotasCard(n.data || [])
      setOrigemCard((o as any).data || null)
      setAnexosCard((a as any).data || [])
      setTarefasCard((tk as any).data || [])
    })
  }, [cardAtivo?.id])

  // Carrega "próxima tarefa em aberto" de cada negócio visível + contagem total
  // de tarefas pendentes/atrasadas para o badge no kanban.
  const [tarefasContPorNegocio, setTarefasContPorNegocio] = useState<Record<string, { total: number; atrasadas: number }>>({})
  useEffect(() => {
    if (!negocios.length) { setTarefasPorNegocio({}); setTarefasContPorNegocio({}); return }
    const ids = negocios.map(n => n.id)
    let cancelled = false
    supabase.from('tarefas')
      .select('id,titulo,prazo,negocio_id,status')
      .in('negocio_id', ids)
      .not('status', 'in', '(concluida,cancelada)')
      .order('prazo', { ascending: true, nullsFirst: false })
      .then(({ data }: any) => {
        if (cancelled) return
        const map: Record<string, any> = {}
        const cont: Record<string, { total: number; atrasadas: number }> = {}
        const agora = Date.now()
        for (const t of (data || []) as any[]) {
          if (!t.negocio_id) continue
          if (!map[t.negocio_id]) map[t.negocio_id] = t
          if (!cont[t.negocio_id]) cont[t.negocio_id] = { total: 0, atrasadas: 0 }
          cont[t.negocio_id].total += 1
          if (t.prazo && new Date(t.prazo).getTime() < agora) cont[t.negocio_id].atrasadas += 1
        }
        setTarefasPorNegocio(map)
        setTarefasContPorNegocio(cont)
      })
    return () => { cancelled = true }
  }, [funilAtivo, negocios.length])

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

  function recalcularValorProdutosDoCard(itens: any[]) {
    if (!cardAtivo) return
    const total = itens.reduce((s, p) => s + (Number(p.quantidade || 1) * Number(p.valor_unit || 0) - Number(p.desconto || 0)), 0)
    setValorProdutosPorNegocio(prev => ({ ...prev, [cardAtivo.id]: total }))
  }

  async function adicionarProduto() {
    if (!cardAtivo) return
    const prod = produtosAll.find(p => p.id === novoProdNeg.produto_id)
    if (!prod) return
    const qtd = parseInt(novoProdNeg.quantidade) || 1
    const valor = (parseValorBR(novoProdNeg.valor_unit) ?? 0) || prod.preco_base || 0
    const { data } = await supabase.from('negocio_produtos').insert({
      negocio_id: cardAtivo.id, produto_id: prod.id, nome_snapshot: prod.nome,
      quantidade: qtd, valor_unit: valor,
    }).select('*').single()
    if (data) {
      const novos = [...produtosCard, data]
      setProdutosCard(novos)
      recalcularValorProdutosDoCard(novos)
    }
    setNovoProdNeg({ produto_id: '', quantidade: '1', valor_unit: '' })
  }

  async function removerProduto(id: string) {
    await supabase.from('negocio_produtos').delete().eq('id', id)
    const novos = produtosCard.filter(p => p.id !== id)
    setProdutosCard(novos)
    recalcularValorProdutosDoCard(novos)
  }

  async function adicionarNota() {
    if (!cardAtivo || !novaNota.trim() || !profile?.id) return
    const conteudo = novaNota.trim()
    const { data, error } = await supabase.from('negocio_notas').insert({
      negocio_id: cardAtivo.id, user_id: profile.id, conteudo,
    }).select('*, users(nome,avatar_url)').single()
    if (error) { alert('Erro ao salvar nota: ' + error.message); return }
    if (data) setNotasCard(prev => [data, ...prev])
    // Espelha no histórico do cliente pra aparecer na aba "🕐 Histórico" da
    // ficha. Se faltar cliente_id (negócio sem cliente vinculado), pula.
    if (cardAtivo.cliente_id) {
      const { error: errHist } = await supabase.from('historico').insert({
        cliente_id: cardAtivo.cliente_id, negocio_id: cardAtivo.id,
        tipo: 'gray', titulo: '📝 Nota adicionada', descricao: conteudo, user_id: profile.id,
      })
      if (errHist) console.warn('Falha ao espelhar nota no histórico:', errHist.message)
    }
    setNovaNota('')
  }

  async function excluirNota(id: string) {
    const nota = notasCard.find(n => n.id === id)
    const ehAutor = nota?.user_id === profile?.id
    if (profile?.role !== 'admin' && !ehAutor) {
      alert('Apenas o autor da nota ou um administrador pode excluir.')
      return
    }
    if (!confirm('Excluir essa anotação?')) return
    const { error } = await supabase.from('negocio_notas').delete().eq('id', id)
    if (error) { alert('Erro ao excluir nota: ' + error.message); return }
    setNotasCard(prev => prev.filter(n => n.id !== id))
  }

  async function alternarFixarNota(id: string, pinnedAtual: boolean) {
    const nota = notasCard.find(n => n.id === id)
    const ehAutor = nota?.user_id === profile?.id
    if (profile?.role !== 'admin' && !ehAutor) {
      alert('Apenas o autor da nota ou um administrador pode fixar.')
      return
    }
    const novo = !pinnedAtual
    const { error } = await supabase.from('negocio_notas').update({ pinned: novo }).eq('id', id)
    if (error) { alert('Erro ao fixar nota: ' + error.message); return }
    setNotasCard(prev => {
      const atualizadas = prev.map(n => n.id === id ? { ...n, pinned: novo } : n)
      // Reordena: fixadas primeiro, depois por data desc
      return atualizadas.slice().sort((a: any, b: any) => {
        if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1
        return new Date(b.criado_em).getTime() - new Date(a.criado_em).getTime()
      })
    })
  }

  function atualizarBadgeKanban(negocioId: string, lista: any[]) {
    const ativas = (lista || []).filter(t => t.status !== 'concluida' && t.status !== 'cancelada')
    const proxima = ativas.slice().sort((a,b) => {
      if (!a.prazo && !b.prazo) return 0
      if (!a.prazo) return 1
      if (!b.prazo) return -1
      return String(a.prazo).localeCompare(String(b.prazo))
    })[0] || null
    setTarefasPorNegocio(prev => {
      const m = { ...prev }
      if (proxima) m[negocioId] = proxima
      else delete m[negocioId]
      return m
    })
  }

  async function criarTarefaDoCard() {
    if (!cardAtivo || !profile?.id) return
    const titulo = novaTarefa.titulo.trim()
    if (!titulo) { alert('Informe o título da tarefa'); return }
    setSalvandoTarefa(true)
    const { data, error } = await supabase.from('tarefas').insert({
      titulo,
      tipo:           'tarefa',
      status:         'pendente',
      prazo:          novaTarefa.prazo ? new Date(novaTarefa.prazo).toISOString() : null,
      negocio_id:     cardAtivo.id,
      cliente_id:     cardAtivo.cliente_id || null,
      responsavel_id: profile.id,
      criado_por:     profile.id,
    }).select('id,titulo,descricao,prazo,status,tipo,responsavel_id,users!tarefas_responsavel_id_fkey(id,nome,avatar_url)').single()
    setSalvandoTarefa(false)
    if (error) { alert('Erro ao criar tarefa: '+error.message); return }
    if (data) {
      // Espelha em tarefa_responsaveis (mesmo padrão usado em /tarefas)
      await supabase.from('tarefa_responsaveis').insert({ tarefa_id: (data as any).id, user_id: profile.id })
      const novas = [data, ...tarefasCard]
      setTarefasCard(novas)
      atualizarBadgeKanban(cardAtivo.id, novas)
    }
    setNovaTarefa({ titulo:'', prazo:'' })
  }

  async function alterarStatusTarefa(id: string, status: string) {
    await supabase.from('tarefas').update({ status }).eq('id', id)
    const novas = tarefasCard.map(t => t.id === id ? { ...t, status } : t)
    setTarefasCard(novas)
    if (cardAtivo) atualizarBadgeKanban(cardAtivo.id, novas)
  }

  function iniciarEdicaoTarefa(t: any) {
    const prazoLocal = t.prazo ? new Date(t.prazo).toISOString().slice(0,16) : ''
    setTarefaEditForm({ titulo: t.titulo || '', prazo: prazoLocal })
    setTarefaEditId(t.id)
  }
  async function salvarEdicaoTarefa() {
    if (!tarefaEditId) return
    const titulo = tarefaEditForm.titulo.trim()
    if (!titulo) { alert('Título é obrigatório'); return }
    const prazoIso = tarefaEditForm.prazo ? new Date(tarefaEditForm.prazo).toISOString() : null
    const { error } = await supabase.from('tarefas').update({ titulo, prazo: prazoIso }).eq('id', tarefaEditId)
    if (error) { alert('Erro ao salvar: ' + error.message); return }
    const novas = tarefasCard.map(t => t.id === tarefaEditId ? { ...t, titulo, prazo: prazoIso } : t)
    setTarefasCard(novas)
    setTarefaEditId(null)
  }

  async function excluirTarefa(id: string) {
    if (!confirm('Excluir esta tarefa?')) return
    await supabase.from('tarefas').delete().eq('id', id)
    const novas = tarefasCard.filter(t => t.id !== id)
    setTarefasCard(novas)
    if (cardAtivo) atualizarBadgeKanban(cardAtivo.id, novas)
  }

  const [editandoNota, setEditandoNota] = useState<{ id: string; conteudo: string } | null>(null)
  async function salvarEdicaoNota() {
    if (!editandoNota) return
    const nota = notasCard.find(n => n.id === editandoNota.id)
    const ehAutor = nota?.user_id === profile?.id
    if (profile?.role !== 'admin' && !ehAutor) {
      alert('Apenas o autor da nota ou um administrador pode editar.')
      return
    }
    const { error } = await supabase.from('negocio_notas').update({ conteudo: editandoNota.conteudo }).eq('id', editandoNota.id)
    if (error) { alert('Erro ao editar nota: ' + error.message); return }
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

  function podeEditarPremio(card: any): boolean {
    if (!card || !profile) return false
    return profile.role === 'admin' || profile.id === card.vendedor_id
  }

  async function salvarTelefoneDoCard() {
    if (!cardAtivo) return
    const novo = (telefoneInput || '').trim()
    const atual = (cardAtivo.telefone_negocio || '').trim()
    if (novo === atual) return
    setSalvandoTelefone(true)
    const valor = novo === '' ? null : novo
    const { error } = await supabase.from('negocios').update({ telefone_negocio: valor }).eq('id', cardAtivo.id)
    setSalvandoTelefone(false)
    if (error) {
      alert('Erro ao salvar telefone: ' + error.message)
      return
    }
    setCardAtivo({ ...cardAtivo, telefone_negocio: valor })
    setNegocios(prev => prev.map(n => n.id === cardAtivo.id ? { ...n, telefone_negocio: valor } : n))
  }

  async function salvarPremioDoCard() {
    if (!cardAtivo) return
    if (!podeEditarPremio(cardAtivo)) {
      alert('Apenas o responsável pela negociação ou um administrador pode editar o valor.')
      return
    }
    const bruto = (premioInput || '').replace(/\./g, '').replace(',', '.').trim()
    const novo = bruto === '' ? 0 : Number(bruto)
    if (Number.isNaN(novo) || novo < 0) {
      alert('Valor inválido. Use apenas números (ex.: 1500,00).')
      return
    }
    const atual = Number(cardAtivo.premio || 0)
    if (novo === atual) return
    setSalvandoPremio(true)
    const { error } = await supabase.from('negocios').update({ premio: novo }).eq('id', cardAtivo.id)
    setSalvandoPremio(false)
    if (error) {
      alert('Erro ao salvar valor: ' + error.message)
      return
    }
    setCardAtivo({ ...cardAtivo, premio: novo })
    setNegocios(prev => prev.map(n => n.id === cardAtivo.id ? { ...n, premio: novo } : n))
  }

  async function salvarTituloDoCard() {
    if (!cardAtivo) return
    const novo = (tituloInput || '').trim()
    if (!novo) { setTituloInput(cardAtivo.titulo || ''); setEditandoTitulo(false); return }
    if (novo === (cardAtivo.titulo || '')) { setEditandoTitulo(false); return }
    setSalvandoTitulo(true)
    const { error } = await supabase.from('negocios').update({ titulo: novo }).eq('id', cardAtivo.id)
    setSalvandoTitulo(false)
    if (error) { alert('Erro ao salvar título: ' + error.message); return }
    setCardAtivo({ ...cardAtivo, titulo: novo })
    setNegocios(prev => prev.map(n => n.id === cardAtivo.id ? { ...n, titulo: novo } : n))
    setEditandoTitulo(false)
  }

  function parseValorBR(s: string): number | null {
    const bruto = (s || '').replace(/\./g, '').replace(',', '.').trim()
    if (bruto === '') return 0
    const n = Number(bruto)
    return Number.isNaN(n) || n < 0 ? null : n
  }

  async function salvarComissaoDoCard() {
    if (!cardAtivo) return
    if (!podeEditarPremio(cardAtivo)) {
      alert('Apenas o responsável pela negociação ou um administrador pode editar a comissão.')
      return
    }
    const pct  = parseValorBR(comissaoPctInput)
    const valr = parseValorBR(comissaoValorInput)
    if (pct === null || valr === null) {
      alert('Comissão inválida. Use apenas números (ex.: 12,50).')
      return
    }
    const pctAtual  = Number(cardAtivo.comissao_pct   || 0)
    const valrAtual = Number(cardAtivo.comissao_valor || 0)
    if (pct === pctAtual && valr === valrAtual) return
    setSalvandoComissao(true)
    const { error } = await supabase.from('negocios')
      .update({ comissao_pct: pct, comissao_valor: valr })
      .eq('id', cardAtivo.id)
    setSalvandoComissao(false)
    if (error) { alert('Erro ao salvar comissão: ' + error.message); return }
    setCardAtivo({ ...cardAtivo, comissao_pct: pct, comissao_valor: valr })
    setNegocios(prev => prev.map(n => n.id === cardAtivo.id ? { ...n, comissao_pct: pct, comissao_valor: valr } : n))
  }

  // Normaliza string ao mesmo padrão do `pt_norm` do banco (lower + sem acento)
  const ptNorm = (s: string) =>
    (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
  const isPosvendaNome = (nome?: string) => {
    const n = ptNorm(nome || '')
    return n === 'equipe pos venda'
        || n === 'pos venda'
        || n === 'pos-venda'
        || n === 'posvenda'
  }
  const isFunilEmissao = (funilId?: string | null) => {
    if (!funilId) return false
    const f = funis.find((x: any) => x.id === funilId)
    return !!f && ptNorm(f.nome) === ptNorm('EMISSÃO E IMPLANTAÇÃO')
  }
  // Quando o funil é EMISSÃO E IMPLANTAÇÃO e o usuário está na EQUIPE
  // PÓS VENDA, ele enxerga todos os cards independente do vendedor.
  // Para a EQUIPE GESTÃO, o bypass é total e já está tratado em
  // `getVisibleUserIds()` (retorna null = sem filtro), portanto não
  // precisa de tratamento adicional aqui.
  const bypassVisibleIds = (funilId?: string | null) =>
    userInPosvenda && isFunilEmissao(funilId)

  async function init() {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: prof } = await supabase.from('users').select('*').eq('id', user?.id||'').single()
    setProfile(prof)
    const ids = await getVisibleUserIds()
    setVisibleIds(ids)
    // Filtro padrão por usuário só faz sentido quando há visão restrita.
    // Admin/financeiro/GESTÃO/PÓS VENDA (ids === null) precisam ver todos
    // os cards do funil por padrão — se aplicarmos filtroUsuario = self,
    // o kanban fica vazio para esses perfis (não são vendedores).
    if (prof?.id && ids !== null) setFiltroUsuario(prof.id)
    let usrQ = supabase.from('users').select('id,nome,role').order('nome')
    if (ids) usrQ = usrQ.in('id', ids)
    const { data: usr } = await usrQ
    setUsuarios(usr||[])

    // Equipes + membros (para filtro por equipe)
    const [{ data: eqs }, { data: mems }] = await Promise.all([
      supabase.from('equipes').select('id, nome, lider_id').order('nome'),
      supabase.from('equipe_membros').select('equipe_id, user_id'),
    ])
    setEquipes(eqs || [])
    const mapa: Record<string,string[]> = {}
    for (const m of (mems||[])) {
      const eid = (m as any).equipe_id; const uid = (m as any).user_id
      if (!mapa[eid]) mapa[eid] = []
      mapa[eid].push(uid)
    }
    setEquipeMembros(mapa)

    const equipesPosvenda = (eqs || []).filter((e: any) => isPosvendaNome(e?.nome))
    const meuId = prof?.id || user?.id
    const ehPosvenda = !!meuId && equipesPosvenda.some((e: any) =>
      e.lider_id === meuId || (mapa[e.id] || []).includes(meuId)
    )
    setUserInPosvenda(ehPosvenda)

    await carregarFunis()
    // Histórico de títulos de tarefa pra autocomplete no card
    if (prof?.id) {
      const { data: hist } = await supabase
        .from('tarefas')
        .select('titulo')
        .or(`criado_por.eq.${prof.id},responsavel_id.eq.${prof.id}`)
        .order('created_at', { ascending: false })
        .limit(500)
      const uniq: string[] = []
      const seen = new Set<string>()
      for (const r of (hist || []) as any[]) {
        const t = (r.titulo || '').trim()
        if (t && !seen.has(t.toLowerCase())) { seen.add(t.toLowerCase()); uniq.push(t) }
        if (uniq.length >= 50) break
      }
      setTitulosHistTarefa(uniq)
    }
    setLoading(false)
  }

  async function carregarFunis() {
    const { data: fs } = await supabase.from('funis').select('*').order('ordem')
    setFunis(fs||[])
    if (fs?.length && !funilAtivo) {
      // Se a URL trouxer ?funil=<id>, abrir esse funil — usado pelo botão
      // "voltar" da página do negócio pra retornar ao funil de origem.
      const desejado = searchParams?.get('funil') || null
      const inicial  = (desejado && fs.find((f:any) => f.id === desejado)) ? desejado : fs[0].id
      setFunilAtivo(inicial)
    }
    await carregarContagens(fs || [])
  }

  // Conta negociações em andamento por funil (HEAD request) já respeitando
  // filtros de usuário e equipe — para o balãozinho do dropdown.
  async function carregarContagens(fs: any[]) {
    const out: Record<string, number> = {}
    const idsEquipe = filtroEquipe ? (equipeMembros[filtroEquipe] || []) : null
    await Promise.all((fs || []).map(async (f) => {
      let q = supabase.from('negocios')
        .select('id', { count: 'exact', head: true })
        .eq('funil_id', f.id)
        .or('status.is.null,status.eq.em_andamento')
      if (filtroUsuario)             q = q.eq('vendedor_id', filtroUsuario)
      else if (idsEquipe)            q = idsEquipe.length ? q.in('vendedor_id', idsEquipe) : q.eq('vendedor_id', '00000000-0000-0000-0000-000000000000')
      else if (bypassVisibleIds(f.id)) { /* pós-venda em EMISSÃO E IMPLANTAÇÃO: vê tudo */ }
      else if (visibleIds)           q = q.in('vendedor_id', visibleIds)
      const { count } = await q
      out[f.id] = count || 0
    }))
    setContagemPorFunil(out)
  }

  // Carrega negocios do funil ativo de forma progressiva: cada lote já
  // popula o kanban (não precisa esperar o fim para ver os primeiros cards).
  // Token de versão garante que troca de filtro descarta runs antigos
  // (evita misturar dados de filtros diferentes).
  const carregarVersionRef = useRef(0)
  async function carregarNegocios() {
    if (!funilAtivo) { setNegocios([]); setValorProdutosPorNegocio({}); return }
    const myVersion = ++carregarVersionRef.current
    setNegocios([])
    setValorProdutosPorNegocio({})
    const PRIMEIRA = 200
    const PAGE = 1000
    let offset = 0
    while (true) {
      if (myVersion !== carregarVersionRef.current) return
      const tamanho = offset === 0 ? PRIMEIRA : PAGE
      let q = supabase.from('negocios').select(`
        id, titulo, etapa, status, qualificacao, premio, vencimento,
        funil_id, cliente_id, vendedor_id, equipe_id, origem_id,
        produto, seguradora, cpf_cnpj, motivo_perda, obs,
        custom_fields, created_at, updated_at, data_fechamento, telefone_negocio,
        clientes(id,nome,cpf_cnpj,telefone,email),
        users!negocios_vendedor_id_fkey(nome)
      `).eq('funil_id', funilAtivo)
      if (filtroUsuario) q = q.eq('vendedor_id', filtroUsuario)
      else if (filtroEquipe) {
        const ids = equipeMembros[filtroEquipe] || []
        q = ids.length ? q.in('vendedor_id', ids) : q.eq('vendedor_id', '00000000-0000-0000-0000-000000000000')
      }
      else if (bypassVisibleIds(funilAtivo)) { /* pós-venda em EMISSÃO E IMPLANTAÇÃO: vê tudo */ }
      else if (visibleIds) q = q.in('vendedor_id', visibleIds)
      // Filtro de status no servidor — gigante diferença em funis com milhares de cards.
      // Não há mais status NULL no banco (confirmado), então .eq simples basta.
      if (filtroStatus === 'em_andamento') q = q.eq('status', 'em_andamento')
      else if (filtroStatus === 'ganho')   q = q.eq('status', 'ganho')
      else if (filtroStatus === 'perdido') q = q.eq('status', 'perdido')
      const { data, error } = await q
        .order('created_at', { ascending: false })
        .range(offset, offset + tamanho - 1)
      if (error || !data || data.length === 0) break
      if (myVersion !== carregarVersionRef.current) return
      setNegocios(prev => [...prev, ...data])
      // Soma os itens de negocio_produtos do lote em paralelo — não bloqueia o
      // render dos cards; quando chegar, atualiza as somas das colunas.
      const ids = data.map((n: any) => n.id)
      if (ids.length) {
        supabase.from('negocio_produtos')
          .select('negocio_id, quantidade, valor_unit, desconto')
          .in('negocio_id', ids)
          .then(({ data: prods }: { data: any[] | null }) => {
            if (!prods || prods.length === 0) return
            const somas: Record<string, number> = {}
            for (const p of prods as any[]) {
              const v = (Number(p.quantidade || 1) * Number(p.valor_unit || 0)) - Number(p.desconto || 0)
              somas[p.negocio_id] = (somas[p.negocio_id] || 0) + v
            }
            setValorProdutosPorNegocio(prev => ({ ...prev, ...somas }))
          })
      }
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

  async function resolverClienteDoContato(): Promise<string | null> {
    if (clienteSel?.id) return clienteSel.id
    const nome     = formNovo.contato_nome?.trim()    || ''
    const email    = formNovo.contato_email?.trim()   || ''
    const cpf      = formNovo.contato_cpf_cnpj?.trim()|| ''
    const telefone = formNovo.telefone?.trim()        || ''
    if (!nome && !email && !cpf && !telefone) return null

    // Procura cliente existente por CPF/CNPJ, depois email, depois telefone
    if (cpf) {
      const { data } = await supabase.from('clientes').select('id').eq('cpf_cnpj', cpf).limit(1)
      if (data && data[0]) return data[0].id
    }
    if (email) {
      const { data } = await supabase.from('clientes').select('id').ilike('email', email).limit(1)
      if (data && data[0]) return data[0].id
    }
    if (telefone) {
      const { data } = await supabase.from('clientes').select('id').eq('telefone', telefone).limit(1)
      if (data && data[0]) return data[0].id
    }

    const { data: novo } = await supabase.from('clientes').insert({
      nome:     nome || 'Sem nome',
      cpf_cnpj: cpf      || null,
      email:    email    || null,
      telefone: telefone || null,
      tipo:     'PF',
    }).select('id').single()
    return novo?.id || null
  }

  async function salvarNegocio() {
    if (!formNovo.titulo) return
    setSalvando(true)
    const funil = funilModal
    const etapa = formNovo.etapa || funil?.etapas?.[0] || ''
    const clienteId = await resolverClienteDoContato()
    await supabase.from('negocios').insert({
      titulo:          formNovo.titulo,
      produto:         formNovo.produto || null,
      seguradora:      formNovo.seguradora || null,
      premio:          formNovo.premio ? (parseValorBR(formNovo.premio) ?? null) : null,
      obs:             formNovo.obs || null,
      telefone_negocio: formNovo.telefone?.trim() || null,
      email_negocio:   formNovo.contato_email?.trim() || null,
      etapa,
      funil_id:        funil.id,
      cliente_id:      clienteId,
      vendedor_id:     formNovo.vendedor_id || profile?.id,
    })
    setModalNovo(false)
    setFormNovo({ titulo:'', produto:'', seguradora:'', premio:'', etapa:'', obs:'', vendedor_id:'', telefone:'', contato_nome:'', contato_email:'', contato_cpf_cnpj:'' })
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
    // Se o card do prêmio está aberto com valor editado mas ainda não salvo
    // (ex.: usuário clicou em "Marcar Ganho" sem tirar o foco do input),
    // grava o novo prêmio antes para não perder a alteração.
    if (cardAtivo && cardAtivo.id === negocioId && podeEditarPremio(cardAtivo)) {
      const bruto = (premioInput || '').replace(/\./g, '').replace(',', '.').trim()
      const novo = bruto === '' ? 0 : Number(bruto)
      const atual = Number(cardAtivo.premio || 0)
      if (!Number.isNaN(novo) && novo >= 0 && novo !== atual) {
        await salvarPremioDoCard()
      }
    }
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
    // Ao marcar PERDA, pergunta se o usuário quer excluir as tarefas
    // pendentes vinculadas. Sem perguntar, o usuário tinha que ir até a
    // aba Tarefas e remover manualmente — ou ficavam lembrando de um
    // lead que já foi descartado.
    if (status === 'perdido') {
      const { data: tarefasAbertas } = await supabase
        .from('tarefas')
        .select('id')
        .eq('negocio_id', negocioId)
        .in('status', ['pendente','em_andamento'])
      const qtd = (tarefasAbertas || []).length
      if (qtd > 0) {
        const excluir = confirm(`Existe(m) ${qtd} tarefa(s) em aberto vinculada(s) a este negócio. Deseja excluí-la(s)?`)
        if (excluir) {
          const ids = (tarefasAbertas as any[]).map(t => t.id)
          await supabase.from('tarefa_responsaveis').delete().in('tarefa_id', ids)
          await supabase.from('tarefas').delete().in('id', ids)
        } else {
          await supabase.from('tarefas').update({ status: 'cancelada' }).in('id', (tarefasAbertas as any[]).map(t => t.id))
        }
      }
    }

    await supabase.from('negocios').update(patch).eq('id', negocioId)

    // Ao marcar ganho, encerra tarefas pendentes vinculadas ao negócio
    // (cancela as pendentes/em andamento) — não pergunta porque o lead foi
    // convertido em venda e não faz sentido manter cobrança.
    if (status === 'ganho') {
      await supabase
        .from('tarefas')
        .update({ status: 'cancelada' })
        .eq('negocio_id', negocioId)
        .in('status', ['pendente','em_andamento'])
    }

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

  // Mesma regra do "Valor total" da página do negócio: se há produtos em
  // negocio_produtos com soma > 0, usa essa soma; senão cai no `premio`.
  function valorDoNegocio(n: any): number {
    const prod = Number(valorProdutosPorNegocio[n?.id] || 0)
    return prod > 0 ? prod : Number(n?.premio || 0)
  }

  const buscaNorm = filtroBusca.trim().toLowerCase()
  function passaFiltroBusca(n: any): boolean {
    if (!buscaNorm) return true
    const titulo = String(n.titulo || '').toLowerCase()
    const cliente = String(n.clientes?.nome || '').toLowerCase()
    const cpf = String(n.clientes?.cpf_cnpj || n.cpf_cnpj || '').toLowerCase()
    return titulo.includes(buscaNorm) || cliente.includes(buscaNorm) || cpf.includes(buscaNorm)
  }

  const negociosFunil = negocios.filter(n =>
    n.funil_id === funilAtivo &&
    (filtroStatus === 'todos' || (n.status || 'em_andamento') === filtroStatus) &&
    passaFiltroData(n) &&
    passaFiltroBusca(n)
  ).slice().sort((a,b) => {
    const tit = (x:any)=>String(x.titulo||'')
    const cri = (x:any)=>String(x.created_at||'')
    const upd = (x:any)=>String(x.updated_at||x.created_at||'')
    const val = (x:any)=>valorDoNegocio(x)
    const qua = (x:any)=>Number(x.qualificacao||0)
    const prox = (x:any)=>String(x.proxima_tarefa_em||'9999')
    const prev = (x:any)=>String(x.previsao_fechamento||'9999')
    const cont = (x:any)=>String(x.data_ultimo_contato||x.created_at||'')
    switch (ordenacao) {
      case 'recentes':           return cri(b).localeCompare(cri(a))
      case 'antigos':            return cri(a).localeCompare(cri(b))
      case 'az':                 return tit(a).localeCompare(tit(b),'pt-BR',{sensitivity:'base'})
      case 'za':                 return tit(b).localeCompare(tit(a),'pt-BR',{sensitivity:'base'})
      case 'prox_tarefa':        return prox(a).localeCompare(prox(b))
      case 'previsao_fech':      return prev(a).localeCompare(prev(b))
      case 'contato_recente':    return cont(b).localeCompare(cont(a))
      case 'contato_antigo':     return cont(a).localeCompare(cont(b))
      case 'mais_qual':          return qua(b) - qua(a)
      case 'menos_qual':         return qua(a) - qua(b)
      case 'maior_valor':        return val(b) - val(a)
      case 'menor_valor':        return val(a) - val(b)
      case 'interacao_recente':  return upd(b).localeCompare(upd(a))
      case 'interacao_antiga':   return upd(a).localeCompare(upd(b))
      default:                   return 0
    }
  })

  async function normalizarFunis() {
    const { data: { session } } = await supabase.auth.getSession()
    const headers = { 'Content-Type':'application/json', Authorization: `Bearer ${session?.access_token||''}` }
    const r1 = await fetch('/api/funis/normalize', { method:'POST', headers, body: JSON.stringify({ dryRun:true }) })
    const j1 = await r1.json()
    if (!r1.ok) { alert('Erro ao analisar: ' + (j1.error || 'falha')); return }
    if ((j1.grupos_duplicados || 0) === 0) { alert('Nenhuma negociação duplicada encontrada.'); return }
    const resumo = (j1.detalhes || []).slice(0, 15).map((a:any) =>
      `• "${a.titulo}" — manter 1 + unificar ${a.duplicatas.length} duplicata(s)`
    ).join('\n')
    const extra = (j1.detalhes || []).length > 15 ? `\n... e mais ${(j1.detalhes||[]).length - 15} grupo(s)` : ''
    if (!confirm(`Encontrados ${j1.grupos_duplicados} grupo(s) de negociações duplicadas (${j1.negocios_apagados} a remover):\n\n${resumo}${extra}\n\nHistórico, tarefas, comissões e anexos serão transferidos. Isto NÃO pode ser desfeito. Confirmar?`)) return
    const r2 = await fetch('/api/funis/normalize', { method:'POST', headers, body: JSON.stringify({ dryRun:false }) })
    const j2 = await r2.json()
    if (!r2.ok) { alert('Erro ao normalizar: ' + (j2.error || 'falha')); return }
    alert(`✓ Normalização concluída.\n${j2.negocios_apagados} negociação(ões) duplicada(s) removida(s).`)
    window.location.reload()
  }

  async function trocarVendedorNeg(negId: string, novoVendedor: string) {
    if (!(profile?.role === 'admin' || profile?.role === 'lider')) return
    const { error } = await supabase.from('negocios').update({ vendedor_id: novoVendedor || null }).eq('id', negId)
    if (error) { alert('Erro ao trocar responsável: ' + error.message); return }
    setNegocios(prev => prev.map(n => n.id === negId ? { ...n, vendedor_id: novoVendedor || null, users: usuarios.find(u => u.id === novoVendedor) || null } : n))
  }
  // ─── Seleção em massa (admin) ─────────────────────────────────
  function toggleSel(id: string) {
    setSelecionados(prev => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id); else n.add(id)
      return n
    })
  }
  function selecionarTodosVisiveis() {
    setSelecionados(new Set(negociosFunil.map(n => n.id)))
  }
  function limparSelecao() { setSelecionados(new Set()) }
  function sairModoSelecao() { setModoSelecao(false); limparSelecao() }

  async function bulkMoverEtapa(novaEtapa: string) {
    if (!novaEtapa || !selecionados.size) return
    if (!confirm(`Mover ${selecionados.size} negociação(ões) para a etapa "${novaEtapa}"?`)) return
    setBulkLoading(true)
    const ids = Array.from(selecionados)
    const { error } = await supabase.from('negocios').update({ etapa: novaEtapa }).in('id', ids)
    setBulkLoading(false)
    if (error) { alert('Erro: ' + error.message); return }
    setNegocios(prev => prev.map(n => ids.includes(n.id) ? { ...n, etapa: novaEtapa } : n))
    limparSelecao()
  }

  // Transfere as negociações selecionadas para outro funil. A etapa de
  // destino é a primeira do funil escolhido (admin pode reposicionar
  // depois, no funil novo).
  async function bulkMoverFunil(novoFunilId: string) {
    if (!novoFunilId || !selecionados.size) return
    if (novoFunilId === funilAtivo) return
    const destino = funis.find((f:any) => f.id === novoFunilId)
    if (!destino) { alert('Funil de destino não encontrado.'); return }
    const primeiraEtapa = destino.etapas?.[0] || ''
    if (!primeiraEtapa) { alert(`O funil "${destino.nome}" não tem etapas configuradas.`); return }
    if (!confirm(`Transferir ${selecionados.size} negociação(ões) para o funil "${destino.nome}"?\n\nElas entrarão na etapa "${primeiraEtapa}".`)) return
    setBulkLoading(true)
    const ids = Array.from(selecionados)
    const { error } = await supabase.from('negocios').update({ funil_id: novoFunilId, etapa: primeiraEtapa }).in('id', ids)
    setBulkLoading(false)
    if (error) { alert('Erro ao transferir: ' + error.message); return }
    setNegocios(prev => prev.filter(n => !ids.includes(n.id)))
    await carregarContagens(funis)
    limparSelecao()
  }

  // Move uma única negociação para outro funil + etapa específica.
  async function moverParaOutroFunil(negocioId: string, novoFunilId: string, novaEtapa: string) {
    if (!negocioId || !novoFunilId || !novaEtapa) return
    const destino = funis.find((f:any) => f.id === novoFunilId)
    if (!destino) { alert('Funil de destino não encontrado.'); return }
    if (!confirm(`Transferir esta negociação para o funil "${destino.nome}" · etapa "${novaEtapa}"?`)) return
    const { error } = await supabase.from('negocios').update({ funil_id: novoFunilId, etapa: novaEtapa }).eq('id', negocioId)
    if (error) { alert('Erro ao transferir: ' + error.message); return }
    setNegocios(prev => prev.filter(n => n.id !== negocioId))
    await carregarContagens(funis)
    setModalCard(false)
    setCardAtivo(null)
  }

  async function bulkTrocarVendedor(novoVendedor: string) {
    if (!selecionados.size) return
    const vendedor = usuarios.find(u => u.id === novoVendedor) || null
    const nomeVend = vendedor?.nome || 'Sem responsável'
    if (!confirm(`Atribuir ${selecionados.size} negociação(ões) para "${nomeVend}"?`)) return
    setBulkLoading(true)
    const ids = Array.from(selecionados)
    const { error } = await supabase.from('negocios').update({ vendedor_id: novoVendedor || null }).in('id', ids)
    setBulkLoading(false)
    if (error) { alert('Erro ao atribuir responsável: ' + error.message); return }
    setNegocios(prev => prev.map(n => ids.includes(n.id) ? { ...n, vendedor_id: novoVendedor || null, users: vendedor } : n))
    limparSelecao()
  }

  async function bulkMudarStatus(status: 'ganho'|'perdido'|'em_andamento') {
    if (!selecionados.size) return
    if (!confirm(`Marcar ${selecionados.size} negociação(ões) como ${status.toUpperCase()}?`)) return
    setBulkLoading(true)
    const ids = Array.from(selecionados)
    const patch: any = { status }
    if (status === 'ganho' || status === 'perdido') patch.data_fechamento = new Date().toISOString()
    if (status === 'em_andamento') { patch.data_fechamento = null; patch.motivo_perda = null }
    const { error } = await supabase.from('negocios').update(patch).in('id', ids)
    setBulkLoading(false)
    if (error) { alert('Erro: ' + error.message); return }
    setNegocios(prev => prev.map(n => ids.includes(n.id) ? { ...n, ...patch } : n))
    // Encerra tarefas em aberto vinculadas a esses negócios
    if (status === 'ganho' || status === 'perdido') {
      await supabase
        .from('tarefas')
        .update({ status: 'cancelada' })
        .in('negocio_id', ids)
        .in('status', ['pendente','em_andamento'])
    }
    // Dispara automações para ganho/perdido (uma por uma — engine é idempotente)
    if (status === 'ganho' || status === 'perdido') {
      for (const id of ids) disparaAutomacao(`status_${status}` as any, id)
    }
    limparSelecao()
  }

  async function exportarSelecao() {
    const ids = selecionados.size ? Array.from(selecionados) : negociosFunil.map((n:any)=>n.id)
    const lista = negociosFunil.filter((n:any) => ids.includes(n.id))
    if (!lista.length) { alert('Nada para exportar'); return }
    await exportarXLSX(lista, [
      { campo:'titulo',     titulo:'Título' },
      { campo:'etapa',      titulo:'Etapa' },
      { campo:'status',     titulo:'Status' },
      { campo:'clientes',   titulo:'Cliente',     fmt:(v:any)=>v?.nome || '' },
      { campo:'cpf_cnpj',   titulo:'CPF/CNPJ' },
      { campo:'produto',    titulo:'Produto' },
      { campo:'seguradora', titulo:'Seguradora' },
      { campo:'premio',     titulo:'Prêmio (R$)', fmt:fmt.brl },
      { campo:'comissao_pct', titulo:'Comissão %' },
      { campo:'placa',      titulo:'Placa' },
      { campo:'vencimento', titulo:'Vencimento',  fmt:fmt.data },
      { campo:'users',      titulo:'Vendedor',    fmt:(v:any)=>v?.nome || '' },
      { campo:'created_at', titulo:'Criado em',   fmt:fmt.dataHora },
    ], `negocios_${funiAtual?.nome?.replace(/\s+/g,'_').toLowerCase() || 'funil'}`)
  }

  async function bulkExcluir() {
    if (profile?.role !== 'admin' || !selecionados.size) return
    if (!confirm(`EXCLUIR ${selecionados.size} negociação(ões)? Esta ação não pode ser desfeita.`)) return
    if (!confirm('Tem certeza? Toda a lista será removida permanentemente.')) return
    setBulkLoading(true)
    const ids = Array.from(selecionados)
    const { error } = await supabase.from('negocios').delete().in('id', ids)
    setBulkLoading(false)
    if (error) { alert('Erro: ' + error.message); return }
    setNegocios(prev => prev.filter(n => !ids.includes(n.id)))
    limparSelecao()
  }

  const inp: React.CSSProperties = { width:'100%', background:'rgba(255,255,255,0.05)', border:'1px solid var(--border)', borderRadius:8, padding:'8px 12px', color:'var(--text)', fontSize:13, fontFamily:'Open Sans,sans-serif', outline:'none', boxSizing:'border-box' as const }

  if (loading) return <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',color:'var(--text-muted)'}}>Carregando...</div>

  return (
    <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
      {/* Header */}
      <div style={{minHeight:56,borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',flexWrap:'wrap',rowGap:8,padding:'8px 20px',gap:10,background:'var(--bg-soft)',backdropFilter:'blur(8px)',position:'sticky',top:0,zIndex:5,flexShrink:0}}>
        {/* Dropdown de funis (filtrado por equipe via RLS — funis já chegam só os permitidos) */}
        <div style={{position:'relative',minWidth:280}}>
          <button onClick={()=>setSeletorAberto(s=>!s)}
            style={{width:'100%',padding:'9px 14px',borderRadius:10,fontSize:13,cursor:'pointer',border:'1px solid var(--border)',background:'rgba(255,255,255,0.04)',color:'var(--text)',fontFamily:'Open Sans,sans-serif',display:'flex',alignItems:'center',gap:10,justifyContent:'space-between'}}>
            <span style={{display:'flex',alignItems:'center',gap:8,minWidth:0}}>
              <span style={{fontSize:16}}>{funiAtual?.emoji || '🏗'}</span>
              <span style={{fontWeight:500,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
                {funiAtual?.nome || 'Selecione um funil'}
              </span>
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
              style={{padding:'9px 12px',borderRadius:8,fontSize:12,cursor:'pointer',border:'1px solid var(--border)',background:'rgba(255,255,255,0.04)',color:'var(--gold)',fontFamily:'Open Sans,sans-serif'}}>
              ✎ Renomear
            </button>
            <button onClick={()=>excluirFunil(funiAtual)} title="Excluir funil"
              style={{padding:'9px 12px',borderRadius:8,fontSize:12,cursor:'pointer',border:'1px solid rgba(224,82,82,0.3)',background:'rgba(224,82,82,0.06)',color:'var(--red)',fontFamily:'Open Sans,sans-serif'}}>
              🗑 Excluir
            </button>
          </>
        )}

        {/* Busca por nome da negociação (também busca cliente/CPF) */}
        <div style={{position:'relative',display:'flex',alignItems:'center',minWidth:240,flex:'0 1 320px'}}>
          <span style={{position:'absolute',left:10,fontSize:13,color:'var(--text-muted)',pointerEvents:'none'}}>🔍</span>
          <input
            type="text"
            value={filtroBusca}
            onChange={e=>setFiltroBusca(e.target.value)}
            placeholder="Buscar negociação por nome, cliente ou CPF/CNPJ"
            title="Buscar negociação por nome, cliente ou CPF/CNPJ"
            style={{width:'100%',border:'1px solid var(--border)',background:'rgba(255,255,255,0.04)',color:'var(--text)',borderRadius:8,padding:'7px 28px 7px 30px',fontSize:12,outline:'none',fontFamily:'Open Sans,sans-serif'}}
          />
          {filtroBusca && (
            <button onClick={()=>setFiltroBusca('')}
              title="Limpar busca"
              style={{position:'absolute',right:6,border:'none',background:'transparent',color:'var(--text-muted)',cursor:'pointer',fontSize:14,padding:'0 4px',lineHeight:1}}>×</button>
          )}
        </div>

        <div style={{flex:1}}/>

        {/* Modo de visão: Kanban / Negociações */}
        <div style={{display:'flex',background:'rgba(255,255,255,0.04)',border:'1px solid var(--border)',borderRadius:8,padding:2}}>
          {([['kanban','🗂 Kanban'],['lista','📋 Negociações']] as const).map(([v,l]) => (
            <button key={v} onClick={()=>setModoVisao(v as any)}
              style={{padding:'5px 12px',fontSize:11,fontWeight:600,cursor:'pointer',border:'none',borderRadius:6,
                background: modoVisao===v ? 'rgba(201,168,76,0.18)' : 'transparent',
                color: modoVisao===v ? 'var(--gold)' : 'var(--text-muted)',
                fontFamily:'Open Sans,sans-serif',whiteSpace:'nowrap'}}>{l}</button>
          ))}
        </div>

        {/* Ordenação */}
        <select value={ordenacao} onChange={e=>setOrdenacao(e.target.value as any)}
          title="Ordenar por"
          style={{border:'1px solid var(--border)',background:'rgba(255,255,255,0.04)',color:'var(--text-muted)',borderRadius:8,padding:'6px 10px',fontSize:11,fontWeight:600,cursor:'pointer',outline:'none'}}>
          <option value="az">Alfabética A-Z</option>
          <option value="za">Alfabética Z-A</option>
          <option value="recentes">Criadas por último</option>
          <option value="antigos">Criadas primeiro</option>
          <option value="prox_tarefa">Data da próxima tarefa</option>
          <option value="previsao_fech">Previsão de fechamento</option>
          <option value="contato_recente">Contato mais recente</option>
          <option value="contato_antigo">Contato mais antigo</option>
          <option value="mais_qual">Mais qualificadas</option>
          <option value="menos_qual">Menos qualificadas</option>
          <option value="maior_valor">Maior valor total</option>
          <option value="menor_valor">Menor valor total</option>
          <option value="interacao_recente">Interação mais recente</option>
          <option value="interacao_antiga">Interação mais antiga</option>
        </select>

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
                fontFamily:'Open Sans,sans-serif',whiteSpace:'nowrap'}}>
              {l}
            </button>
          ))}
        </div>

        {/* Visibilidade (responsavel + equipe combinados) — estilo RD */}
        {profile && profile.role !== 'corretor' && (
          <div style={{position:'relative'}}>
            <button onClick={()=>setVisibilidadeOpen(o=>!o)}
              style={{padding:'7px 12px',borderRadius:8,fontSize:12,border:'1px solid var(--border-soft)',background:'#fff',color:'var(--text)',cursor:'pointer',display:'flex',alignItems:'center',gap:6,minWidth:200}}>
              <span>👤</span>
              <span style={{flex:1,textAlign:'left'}}>
                {filtroUsuario ? (usuarios.find(u=>u.id===filtroUsuario)?.nome || 'Usuário') :
                 filtroEquipe  ? `Equipe: ${equipes.find(e=>e.id===filtroEquipe)?.nome || ''}` :
                 'Todas as negociações'}
              </span>
              <span style={{fontSize:10,opacity:0.6}}>▾</span>
            </button>
            {visibilidadeOpen && (
              <>
                <div onClick={()=>setVisibilidadeOpen(false)} style={{position:'fixed',inset:0,zIndex:40}}/>
                <div style={{position:'absolute',top:'calc(100% + 4px)',left:0,minWidth:300,background:'#fff',border:'1px solid var(--border-soft)',borderRadius:10,boxShadow:'var(--shadow-lg)',zIndex:50,padding:10}}>
                  <input value={visibilidadeBusca} onChange={e=>setVisibilidadeBusca(e.target.value)}
                    placeholder="Pesquisar..." autoFocus
                    style={{width:'100%',padding:'8px 10px',border:'1px solid var(--border-soft)',borderRadius:6,fontSize:13,outline:'none',marginBottom:8,boxSizing:'border-box'}}/>
                  <div style={{maxHeight:320,overflow:'auto'}}>
                    <button onClick={()=>{setFiltroUsuario('');setFiltroEquipe('');setVisibilidadeOpen(false)}}
                      style={{width:'100%',textAlign:'left',padding:'8px 10px',border:'none',background:!filtroUsuario&&!filtroEquipe?'var(--gold-soft)':'transparent',color:!filtroUsuario&&!filtroEquipe?'var(--gold)':'var(--text)',cursor:'pointer',fontSize:13,fontWeight:600,borderRadius:6}}>
                      Todas as negociações
                    </button>
                    {profile?.id && (
                      <button onClick={()=>{setFiltroUsuario(profile.id);setFiltroEquipe('');setVisibilidadeOpen(false)}}
                        style={{width:'100%',textAlign:'left',padding:'8px 10px',border:'none',background:filtroUsuario===profile.id?'var(--gold-soft)':'transparent',color:filtroUsuario===profile.id?'var(--gold)':'var(--text)',cursor:'pointer',fontSize:13,fontWeight:600,borderRadius:6}}>
                        Minhas negociações
                      </button>
                    )}
                    <div style={{fontSize:10,fontWeight:700,letterSpacing:1,textTransform:'uppercase',color:'var(--text-muted)',padding:'10px 10px 6px'}}>Responsáveis</div>
                    {usuarios.filter(u => !visibilidadeBusca || (u.nome||'').toLowerCase().includes(visibilidadeBusca.toLowerCase())).map(u => (
                      <button key={u.id} onClick={()=>{setFiltroUsuario(u.id);setFiltroEquipe('');setVisibilidadeOpen(false)}}
                        style={{width:'100%',textAlign:'left',padding:'6px 10px',border:'none',background:filtroUsuario===u.id?'var(--gold-soft)':'transparent',color:filtroUsuario===u.id?'var(--gold)':'var(--text)',cursor:'pointer',fontSize:13,borderRadius:6}}>
                        {u.nome}
                      </button>
                    ))}
                    {equipes.length > 0 && (
                      <>
                        <div style={{fontSize:10,fontWeight:700,letterSpacing:1,textTransform:'uppercase',color:'var(--text-muted)',padding:'10px 10px 6px'}}>Equipes</div>
                        {equipes.filter(eq => !visibilidadeBusca || (eq.nome||'').toLowerCase().includes(visibilidadeBusca.toLowerCase())).map(eq => (
                          <button key={eq.id} onClick={()=>{setFiltroEquipe(eq.id);setFiltroUsuario('');setVisibilidadeOpen(false)}}
                            style={{width:'100%',textAlign:'left',padding:'6px 10px',border:'none',background:filtroEquipe===eq.id?'var(--gold-soft)':'transparent',color:filtroEquipe===eq.id?'var(--gold)':'var(--text)',cursor:'pointer',fontSize:13,borderRadius:6}}>
                            {eq.nome}
                          </button>
                        ))}
                      </>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Botão Filtros (drawer) */}
        {(() => {
          const filtrosAtivos = (filtroData.campo!=='sem'?1:0)
          return (
            <button onClick={()=>setFiltrosOpen(true)}
              style={{padding:'7px 12px',borderRadius:8,fontSize:12,fontWeight:600,border:'1px solid var(--border-soft)',background:filtrosAtivos>0?'var(--blue-soft)':'#fff',color:filtrosAtivos>0?'var(--blue-dark)':'var(--text)',cursor:'pointer',display:'flex',alignItems:'center',gap:6}}>
              <span>⚙</span> Filtros ({filtrosAtivos})
            </button>
          )
        })()}

        {(profile?.role === 'admin' || profile?.role === 'lider') && (
          <button onClick={() => { if (modoSelecao) sairModoSelecao(); else setModoSelecao(true) }}
            style={{padding:'6px 12px',borderRadius:8,fontSize:12,cursor:'pointer',border:'1px solid var(--border)',background: modoSelecao?'rgba(74,128,240,0.15)':'rgba(255,255,255,0.04)',color: modoSelecao?'#4a80f0':'var(--text-muted)',fontFamily:'Open Sans,sans-serif',whiteSpace:'nowrap'}}
            title="Modo seleção em massa">
            {modoSelecao ? '✕ Sair da seleção' : '☑ Selecionar em massa'}
          </button>
        )}
        {profile?.role === 'admin' && (
          <>
            <button onClick={normalizarFunis}
              style={{padding:'6px 12px',borderRadius:8,fontSize:12,cursor:'pointer',border:'1px solid var(--border)',background:'rgba(255,255,255,0.04)',color:'var(--text-muted)',fontFamily:'Open Sans,sans-serif',whiteSpace:'nowrap'}}
              title="Encontra negociações duplicadas (mesmo cliente, mesmo funil, mesmo título) e unifica em uma só (admin)">
              🧹 Normalizar negociações
            </button>
            <button onClick={()=>router.push('/dashboard/funis/configurar')}
              style={{padding:'6px 12px',borderRadius:8,fontSize:12,cursor:'pointer',border:'1px solid var(--border)',background:'rgba(255,255,255,0.04)',color:'var(--text-muted)',fontFamily:'Open Sans,sans-serif',whiteSpace:'nowrap'}}
              title="Criar, renomear e organizar funis (admin)">
              ⚙ Configurar funis
            </button>
          </>
        )}
        <button className="btn-primary" onClick={()=>{setFunilModal(funiAtual);setModalNovo(true);setFormNovo({titulo:'',produto:'',seguradora:'',premio:'',etapa:funiAtual?.etapas?.[0]||'',obs:'',vendedor_id:profile?.id||'',telefone:'',contato_nome:'',contato_email:'',contato_cpf_cnpj:''})}}>
          + Novo Card
        </button>
      </div>

      {/* Barra de ações em massa (admin/lider) */}
      {(profile?.role === 'admin' || profile?.role === 'lider') && modoSelecao && (
        <div style={{padding:'10px 20px',background:'#0f1729',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',gap:10,flexWrap:'wrap',position:'sticky',top:0,zIndex:50}}>
          <span style={{fontSize:13,color:'#fff',fontWeight:600}}>
            {selecionados.size} selecionada(s)
          </span>
          <button onClick={selecionarTodosVisiveis}
            style={{padding:'5px 10px',borderRadius:6,fontSize:11,border:'1px solid var(--border)',background:'rgba(255,255,255,0.06)',color:'#fff',cursor:'pointer'}}>
            Selecionar todos visíveis ({negociosFunil.length})
          </button>
          <button onClick={limparSelecao} disabled={!selecionados.size}
            style={{padding:'5px 10px',borderRadius:6,fontSize:11,border:'1px solid var(--border)',background:'rgba(255,255,255,0.06)',color:'#fff',cursor:selecionados.size?'pointer':'not-allowed',opacity:selecionados.size?1:0.4}}>
            Limpar
          </button>

          <div style={{width:1,height:20,background:'rgba(255,255,255,0.15)'}} />

          {funiAtual && profile?.role === 'admin' && (
            <select
              disabled={!selecionados.size || bulkLoading}
              onChange={e => { if (e.target.value) bulkMoverEtapa(e.target.value); e.target.value = '' }}
              defaultValue=""
              style={{padding:'5px 8px',borderRadius:6,fontSize:11,border:'1px solid var(--border)',background:'#fff',color:'#222',cursor:selecionados.size?'pointer':'not-allowed',opacity:selecionados.size?1:0.4}}>
              <option value="">→ Mover para etapa…</option>
              {(funiAtual.etapas || []).map((et:string) => <option key={et} value={et}>{et}</option>)}
            </select>
          )}

          {profile?.role === 'admin' && funis.length > 1 && (
            <select
              disabled={!selecionados.size || bulkLoading}
              onChange={e => { if (e.target.value) bulkMoverFunil(e.target.value); e.target.value = '' }}
              defaultValue=""
              title="Transfere as negociações selecionadas para outro funil (entram na primeira etapa)"
              style={{padding:'5px 8px',borderRadius:6,fontSize:11,border:'1px solid var(--border)',background:'#fff',color:'#222',cursor:selecionados.size?'pointer':'not-allowed',opacity:selecionados.size?1:0.4}}>
              <option value="">⇄ Transferir para outro funil…</option>
              {funis.filter((f:any) => f.id !== funilAtivo).map((f:any) => (
                <option key={f.id} value={f.id}>{f.nome}</option>
              ))}
            </select>
          )}

          <select
            disabled={!selecionados.size || bulkLoading}
            onChange={e => {
              const v = e.target.value
              if (!v) return
              bulkTrocarVendedor(v === '__none__' ? '' : v)
              e.target.value = ''
            }}
            defaultValue=""
            style={{padding:'5px 8px',borderRadius:6,fontSize:11,border:'1px solid var(--border)',background:'#fff',color:'#222',cursor:selecionados.size?'pointer':'not-allowed',opacity:selecionados.size?1:0.4}}>
            <option value="">👤 Atribuir responsável…</option>
            <option value="__none__">— Sem responsável —</option>
            {usuarios.map((u:any) => <option key={u.id} value={u.id}>{u.nome}</option>)}
          </select>

          {profile?.role === 'admin' && (
            <>
              <button onClick={()=>bulkMudarStatus('ganho')} disabled={!selecionados.size || bulkLoading}
                style={{padding:'5px 10px',borderRadius:6,fontSize:11,border:'1px solid rgba(28,181,160,0.5)',background:'rgba(28,181,160,0.15)',color:'#1cb5a0',cursor:selecionados.size?'pointer':'not-allowed',opacity:selecionados.size?1:0.4,fontWeight:600}}>
                ✓ Marcar Ganho
              </button>
              <button onClick={()=>bulkMudarStatus('perdido')} disabled={!selecionados.size || bulkLoading}
                style={{padding:'5px 10px',borderRadius:6,fontSize:11,border:'1px solid rgba(224,82,82,0.5)',background:'rgba(224,82,82,0.15)',color:'#e05252',cursor:selecionados.size?'pointer':'not-allowed',opacity:selecionados.size?1:0.4,fontWeight:600}}>
                ✕ Marcar Perdido
              </button>
              <button onClick={()=>bulkMudarStatus('em_andamento')} disabled={!selecionados.size || bulkLoading}
                style={{padding:'5px 10px',borderRadius:6,fontSize:11,border:'1px solid var(--border)',background:'rgba(255,255,255,0.06)',color:'#fff',cursor:selecionados.size?'pointer':'not-allowed',opacity:selecionados.size?1:0.4}}>
                ↺ Em andamento
              </button>
            </>
          )}

          <div style={{flex:1}} />

          {profile?.role === 'admin' && (
            <button onClick={exportarSelecao} disabled={bulkLoading}
              style={{padding:'5px 10px',borderRadius:6,fontSize:11,border:'1px solid var(--border)',background:'rgba(255,255,255,0.06)',color:'#fff',cursor:'pointer',fontWeight:600}}
              title={selecionados.size ? 'Exporta selecionadas' : 'Exporta todas as visíveis'}>
              📥 Exportar {selecionados.size ? `(${selecionados.size})` : 'visíveis'}
            </button>
          )}
          {profile?.role === 'admin' && (
            <button onClick={bulkExcluir} disabled={!selecionados.size || bulkLoading}
              style={{padding:'5px 10px',borderRadius:6,fontSize:11,border:'1px solid rgba(224,82,82,0.6)',background:'rgba(224,82,82,0.2)',color:'#fff',cursor:selecionados.size?'pointer':'not-allowed',opacity:selecionados.size?1:0.4,fontWeight:600}}>
              🗑 Excluir selecionadas
            </button>
          )}
          {bulkLoading && <span style={{fontSize:11,color:'#aaa'}}>⏳ aplicando…</span>}
        </div>
      )}

      {/* Kanban */}
      {funiAtual && modoVisao==='kanban' && (() => {
        const ocultarValor = isFunilEmissao(funilAtivo)
        // "Total do funil" deve mostrar a soma real de em_andamento e ganhos
        // do funil, IGNORANDO o filtro de status (caso contrário, ao filtrar
        // por "Andamento" o card de "Ganhos" zera). Os demais filtros
        // (busca, data, usuário/equipe — já aplicados na query) continuam valendo.
        const negociosFunilSemStatus = negocios.filter(n =>
          n.funil_id === funilAtivo &&
          passaFiltroData(n) &&
          passaFiltroBusca(n)
        )
        const totalEmAndamento = negociosFunilSemStatus
          .filter(n => n.status !== 'ganho' && n.status !== 'perdido')
          .reduce((acc, n) => acc + valorDoNegocio(n), 0)
        const totalGanho = negociosFunilSemStatus
          .filter(n => n.status === 'ganho')
          .reduce((acc, n) => acc + valorDoNegocio(n), 0)
        const qtdAndamento = negociosFunilSemStatus.filter(n => n.status !== 'ganho' && n.status !== 'perdido').length
        const qtdGanho     = negociosFunilSemStatus.filter(n => n.status === 'ganho').length
        return (
        <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden',position:'relative'}}>
          {/* Resumo do funil — soma total para responder ao pedido do time */}
          {!ocultarValor && (
          <div style={{display:'flex',gap:18,alignItems:'center',padding:'8px 20px 4px',flexWrap:'wrap',borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
            <div style={{fontSize:11,color:'var(--text-muted)',fontWeight:600,letterSpacing:'1.2px',textTransform:'uppercase'}}>
              Total do funil
            </div>
            <div title="Soma do prêmio das negociações em andamento (exclui ganhos/perdidos)"
              style={{fontSize:13,fontWeight:600,color:'var(--teal)'}}>
              📈 Em andamento: R$ {totalEmAndamento.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}
              <span style={{fontWeight:400,color:'var(--text-muted)',marginLeft:6,fontSize:11}}>· {qtdAndamento} card{qtdAndamento===1?'':'s'}</span>
            </div>
            <div title="Soma do prêmio das negociações ganhas neste funil"
              style={{fontSize:13,fontWeight:600,color:'var(--gold)'}}>
              ✓ Ganhos: R$ {totalGanho.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}
              <span style={{fontWeight:400,color:'var(--text-muted)',marginLeft:6,fontSize:11}}>· {qtdGanho} card{qtdGanho===1?'':'s'}</span>
            </div>
          </div>
          )}
          {/* Empty state quando o funil está sem cards (após filtros) */}
          {funiAtual && negociosFunil.length === 0 && (
            <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',padding:40}}>
              <div style={{textAlign:'center',maxWidth:400}}>
                <div style={{fontSize:42,marginBottom:14}}>📭</div>
                <div style={{fontSize:18,fontWeight:600,color:'var(--text)',marginBottom:6}}>Nenhum negócio neste funil</div>
                <div style={{fontSize:13,color:'var(--text-muted)',lineHeight:1.5,marginBottom:18}}>
                  {filtroBusca
                    ? 'Tente limpar a busca para ver outros negócios.'
                    : 'Comece criando seu primeiro negócio neste funil. É rápido!'}
                </div>
                {!filtroBusca && (
                  <button className="btn-primary" onClick={()=>{setFunilModal(funiAtual);setModalNovo(true);setFormNovo({titulo:'',produto:'',seguradora:'',premio:'',etapa:funiAtual?.etapas?.[0]||'',obs:'',vendedor_id:profile?.id||'',telefone:'',contato_nome:'',contato_email:'',contato_cpf_cnpj:''})}}>
                    + Criar primeiro negócio
                  </button>
                )}
              </div>
            </div>
          )}
          {/* Barra de rolagem horizontal sincronizada no topo */}
          <div className="kanban-scroll kanban-scroll-top" ref={topScrollRef}
            style={{overflowX:'auto',overflowY:'hidden',height:18,flexShrink:0,margin:'0 20px',display: funiAtual && negociosFunil.length === 0 ? 'none' : 'block'}}>
            <div style={{width:kanbanWidth,height:1}} />
          </div>
          <div className="kanban-scroll" ref={kanbanRef}
            style={{flex:1,overflowX:'auto',overflowY:'hidden',display:'flex',padding:'20px 60px 20px 20px'}}>
            <div style={{display:'flex',gap:14,alignItems:'flex-start',minWidth:'max-content'}}>
              {(funiAtual.etapas||[]).map((etapa: string) => {
                const cards = negociosFunil.filter(n => n.etapa === etapa)
                // Soma de acordo com o filtro de status ativo.
                // 'todos' considera em_andamento + ganho (pipeline + realizado, exclui perdido).
                // Demais filtros somam todos os cards visíveis (já filtrados pelo status).
                const cardsParaSoma = filtroStatus === 'todos'
                  ? cards.filter(n => (n.status || 'em_andamento') !== 'perdido')
                  : cards
                const valorEtapa = cardsParaSoma
                  .reduce((acc, n) => acc + valorDoNegocio(n), 0)
                const tituloSoma =
                  filtroStatus === 'ganho'        ? 'Soma do prêmio das negociações ganhas nesta etapa'
                  : filtroStatus === 'perdido'    ? 'Soma do prêmio das negociações perdidas nesta etapa'
                  : filtroStatus === 'em_andamento' ? 'Soma do prêmio das negociações em andamento nesta etapa'
                  : 'Soma do prêmio das negociações nesta etapa (em andamento + ganhas)'
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
                    style={{width:270,flexShrink:0,display:'flex',flexDirection:'column',gap:8,padding:'10px 8px',borderRadius:12,background:ehHover?'rgba(201,168,76,0.12)':'#f1f3f8',border:'1px solid #e2e6ee',outline:ehHover?'2px dashed rgba(201,168,76,0.5)':'none',outlineOffset:-2,transition:'background 0.15s',maxHeight:'calc(100vh - 200px)',overflowY:'auto'}}>
                  {/* Header coluna */}
                  <div style={{display:'flex',flexDirection:'column',gap:4,padding:'8px 12px',background:'rgba(255,255,255,0.04)',borderRadius:10,border:'1px solid var(--border)'}}>
                    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                      <span style={{fontSize:12,fontWeight:600}}>{etapa}</span>
                      <span style={{fontSize:11,color:'var(--text-muted)',background:'rgba(255,255,255,0.08)',padding:'1px 7px',borderRadius:10}}>{cards.length}</span>
                    </div>
                    {!ocultarValor && (
                    <div title={tituloSoma}
                      style={{fontSize:11,fontWeight:600,color:'var(--teal)'}}>
                      R$ {valorEtapa.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}
                    </div>
                    )}
                  </div>

                  {/* Cards */}
                  {cards.map(neg => {
                    const isGanho   = neg.status === 'ganho'
                    const isPerdido = neg.status === 'perdido'
                    const corBorda  = isGanho ? 'rgba(28,181,160,0.55)' : isPerdido ? 'rgba(224,82,82,0.55)' : 'var(--border)'
                    const bgCard    = isGanho ? 'rgba(28,181,160,0.06)' : isPerdido ? 'rgba(224,82,82,0.06)'  : 'rgba(255,255,255,0.04)'
                    const isSel = selecionados.has(neg.id)
                    return (
                    <div key={neg.id}
                      onClick={(e)=>{
                        if (modoSelecao) { toggleSel(neg.id); return }
                        // Ctrl/Cmd+clique = abrir em nova guia
                        if (e.ctrlKey || e.metaKey) {
                          window.open(`/dashboard/negocios/${neg.id}`, '_blank')
                          return
                        }
                        // Shift+clique = abre o modal de edicao rapida (legado)
                        if (e.shiftKey) {
                          setCardAtivo(neg); setModalCard(true)
                          return
                        }
                        router.push(`/dashboard/negocios/${neg.id}`)
                      }}
                      onAuxClick={(e)=>{
                        // Botão do meio do mouse abre nova guia
                        if (e.button === 1) {
                          e.preventDefault()
                          window.open(`/dashboard/negocios/${neg.id}`, '_blank')
                        }
                      }}
                      onContextMenu={(e)=>{
                        // Botão direito do mouse abre a negociação em nova guia
                        e.preventDefault()
                        window.open(`/dashboard/negocios/${neg.id}`, '_blank')
                      }}
                      draggable={!modoSelecao}
                      onDragStart={e=>{e.dataTransfer.setData('text/plain', neg.id);e.dataTransfer.effectAllowed='move';setArrastando(neg.id)}}
                      onDragEnd={()=>{setArrastando(null);setEtapaHover(null)}}
                      title="Clique para abrir · Ctrl/Cmd+Clique ou botão do meio para abrir em nova guia"
                      style={{background: isSel?'rgba(74,128,240,0.18)':bgCard,border:'1px solid '+(isSel?'#4a80f0':corBorda),borderRadius:12,padding:'12px',cursor: modoSelecao?'pointer':(arrastando===neg.id?'grabbing':'grab'),transition:'all 0.15s',position:'relative',opacity:arrastando===neg.id?0.5:1}}
                      onMouseEnter={e=>(e.currentTarget.style.borderColor= isSel?'#4a80f0':'var(--gold)')}
                      onMouseLeave={e=>(e.currentTarget.style.borderColor= isSel?'#4a80f0':corBorda)}>

                      {modoSelecao && (
                        <input
                          type="checkbox"
                          checked={isSel}
                          onChange={e=>{e.stopPropagation();toggleSel(neg.id)}}
                          onClick={e=>e.stopPropagation()}
                          style={{position:'absolute',top:8,left:8,width:16,height:16,cursor:'pointer',accentColor:'#4a80f0'}}
                        />
                      )}

                      {(isGanho || isPerdido) && (
                        <span style={{position:'absolute',top:8,right:32,fontSize:9,fontWeight:700,letterSpacing:'1px',padding:'2px 6px',borderRadius:5,textTransform:'uppercase',background:isGanho?'rgba(28,181,160,0.18)':'rgba(224,82,82,0.18)',color:isGanho?'var(--teal)':'var(--red)',border:'1px solid '+(isGanho?'rgba(28,181,160,0.4)':'rgba(224,82,82,0.4)')}}>
                          {isGanho?'✓ Ganho':'✕ Perdido'}
                        </span>
                      )}

                      {/* Atalho para abrir em página dedicada (estilo RD) */}
                      {!modoSelecao && (
                        <a
                          href={`/dashboard/negocios/${neg.id}`}
                          target="_blank"
                          rel="noreferrer"
                          onClick={e => { e.stopPropagation() }}
                          onMouseDown={e => e.stopPropagation()}
                          draggable={false}
                          title="Abrir página completa"
                          style={{position:'absolute',top:6,right:8,fontSize:12,padding:'1px 5px',borderRadius:4,background:'rgba(255,255,255,0.6)',border:'1px solid var(--border)',color:'var(--text-muted)',textDecoration:'none',lineHeight:1,fontWeight:600}}>
                          ↗
                        </a>
                      )}

                      {/* Badges de status estilo RD (acima do título) */}
                      {!isGanho && !isPerdido && (() => {
                        const updatedMs = neg.updated_at ? new Date(neg.updated_at).getTime() : null
                        const diffMs = updatedMs ? Math.max(0, tickNow - updatedMs) : null
                        const diasSemMov = diffMs !== null ? Math.floor(diffMs/86400000) : null
                        const cfg = (funiAtual?.meta_etapas as any)?.[neg.etapa]
                        const limite = (cfg?.esfriando ? Number(cfg?.dias)||3 : null)
                        const esfriando = limite !== null && diasSemMov !== null && diasSemMov >= limite
                        let cronometro: string | null = null
                        if (diffMs !== null) {
                          const min = Math.floor(diffMs/60000)
                          if (min < 60) cronometro = `${min}min`
                          else if (min < 1440) cronometro = `${Math.floor(min/60)}h ${min%60}min`
                          else {
                            const d = Math.floor(min/1440)
                            const h = Math.floor((min%1440)/60)
                            cronometro = h ? `${d}d ${h}h` : `${d}d`
                          }
                        }
                        return (
                          <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:6}}>
                            <span style={{fontSize:9,fontWeight:700,padding:'2px 7px',borderRadius:4,background:'rgba(74,128,240,0.14)',color:'#1d4ed8',display:'inline-flex',alignItems:'center',gap:4}}>
                              <span style={{width:7,height:7,borderRadius:'50%',background:'#1d4ed8'}}/>Em andamento
                            </span>
                            {cronometro && (() => {
                              const passou4h = (diffMs || 0) >= 4*3600_000
                              return (
                                <span title="Tempo desde a última movimentação do card"
                                  style={{fontSize:9,fontWeight:700,padding:'2px 7px',borderRadius:4,background:passou4h?'rgba(224,82,82,0.16)':'rgba(28,181,160,0.16)',color:passou4h?'#b91c1c':'#0f8a72',display:'inline-flex',alignItems:'center',gap:4,fontVariantNumeric:'tabular-nums'}}>
                                  ⏱ {cronometro}
                                </span>
                              )
                            })()}
                            {esfriando && (
                              <span style={{fontSize:9,fontWeight:700,padding:'2px 7px',borderRadius:4,background:'rgba(217,119,6,0.16)',color:'#a16207',display:'inline-flex',alignItems:'center',gap:4}}>
                                <span style={{width:7,height:7,borderRadius:'50%',background:'#d97706'}}/>Esfriando há {diasSemMov} dia{diasSemMov!==1?'s':''}
                              </span>
                            )}
                          </div>
                        )
                      })()}

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
                        <div style={{marginBottom:4}}>
                          <div style={{fontSize:11,color:'var(--teal)',display:'flex',alignItems:'center',gap:4}}>
                            <span>👤</span> {neg.clientes.nome}
                          </div>
                          {(neg.telefone_negocio || neg.clientes.telefone) && (
                            <div style={{fontSize:10,color:'var(--text-muted)',display:'flex',alignItems:'center',gap:4,marginTop:2,paddingLeft:16,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}} title={neg.telefone_negocio || neg.clientes.telefone}>
                              <span>📞</span> {neg.telefone_negocio || neg.clientes.telefone}
                            </div>
                          )}
                          {neg.clientes.email && (
                            <div style={{fontSize:10,color:'var(--text-muted)',display:'flex',alignItems:'center',gap:4,marginTop:2,paddingLeft:16,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}} title={neg.clientes.email}>
                              <span>✉️</span> {neg.clientes.email}
                            </div>
                          )}
                        </div>
                      ) : (
                        <>
                          <button onClick={e=>{e.stopPropagation();setNegocioVincular(neg);setVincularTab('buscar');setVincularBusca('');setVincularRes([]);setNovoClienteForm({nome:'',cpf_cnpj:neg.cpf_cnpj||'',telefone:neg.telefone_negocio||'',email:''}); setModalVincular(true)}}
                            style={{fontSize:11,padding:'3px 8px',borderRadius:6,border:'1px dashed rgba(201,168,76,0.4)',background:'rgba(201,168,76,0.06)',color:'var(--gold)',cursor:'pointer',fontFamily:'Open Sans,sans-serif',marginBottom:4,display:'block'}}>
                            + Vincular cliente
                          </button>
                          {neg.telefone_negocio && (
                            <div style={{fontSize:10,color:'var(--text-muted)',display:'flex',alignItems:'center',gap:4,marginTop:2,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}} title={neg.telefone_negocio}>
                              <span>📞</span> {neg.telefone_negocio}
                            </div>
                          )}
                        </>
                      )}

                      {neg.cpf_cnpj && !neg.clientes && (
                        <div style={{fontSize:10,color:'var(--text-muted)',marginBottom:4}}>CPF: {neg.cpf_cnpj}</div>
                      )}

                      {(() => {
                        const valorCard = valorDoNegocio(neg)
                        return (
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:4}}>
                        {!ocultarValor && valorCard ? <span style={{fontSize:12,fontWeight:600,color:'var(--teal)'}}>R$ {valorCard.toLocaleString('pt-BR',{minimumFractionDigits:2})}</span> : <span/>}
                        {neg.produto && <span style={{fontSize:10,color:'var(--text-muted)',background:'rgba(255,255,255,0.06)',padding:'1px 6px',borderRadius:8}}>{neg.produto}</span>}
                      </div>
                        )
                      })()}

                      {(() => {
                        const t = tarefasPorNegocio[neg.id]
                        const cont = tarefasContPorNegocio[neg.id]
                        if (!t) return null
                        const atrasada = !!t.prazo && new Date(t.prazo).getTime() < Date.now()
                        const totalAtrasadas = cont?.atrasadas || 0
                        return (
                          <div title={atrasada ? 'Tarefa atrasada' : 'Próxima tarefa'}
                            style={{
                              marginTop:6,
                              display:'flex',alignItems:'center',gap:6,
                              padding:'4px 8px',borderRadius:6,fontSize:10,fontWeight:600,
                              background: atrasada ? 'rgba(224,82,82,0.12)' : 'rgba(28,181,160,0.10)',
                              border: '1px solid '+(atrasada ? 'rgba(224,82,82,0.45)' : 'rgba(28,181,160,0.32)'),
                              color: atrasada ? 'var(--red)' : 'var(--teal)',
                            }}>
                            <span style={{flexShrink:0}}>{atrasada ? '⚠️' : '📋'}</span>
                            <span style={{flex:1,minWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{t.titulo}</span>
                            {totalAtrasadas > 1 && (
                              <span title={`${totalAtrasadas} tarefas atrasadas`} style={{fontSize:9,fontWeight:700,padding:'1px 5px',borderRadius:8,background:'rgba(224,82,82,0.25)',color:'var(--red)',flexShrink:0}}>
                                +{totalAtrasadas - (atrasada ? 1 : 0)}
                              </span>
                            )}
                            {t.prazo && (
                              <span style={{fontSize:9,opacity:0.85,flexShrink:0}}>
                                {new Date(t.prazo).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})}
                              </span>
                            )}
                          </div>
                        )
                      })()}

                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:6,gap:6,fontSize:9,color:'var(--text-muted)',borderTop:'1px solid rgba(0,0,0,0.05)',paddingTop:5}}>
                        {neg.created_at && (
                          <span title="Data de criação">🆕 {new Date(neg.created_at).toLocaleDateString('pt-BR')}</span>
                        )}
                        {neg.data_fechamento && (
                          <span title="Data de fechamento" style={{color:isGanho?'var(--teal)':isPerdido?'var(--red)':'var(--text-muted)'}}>🏁 {new Date(neg.data_fechamento).toLocaleDateString('pt-BR')}</span>
                        )}
                      </div>

                      {!isGanho && !isPerdido && (
                        <button
                          onClick={e=>{ e.stopPropagation(); setNovaTarefaParaNegocio?.(neg); }}
                          onMouseDown={e=>e.stopPropagation()}
                          draggable={false}
                          style={{marginTop:8,width:'100%',padding:'6px 0',borderRadius:6,border:'1px dashed var(--border-strong)',background:'transparent',color:'var(--blue)',cursor:'pointer',fontSize:11,fontWeight:600}}>
                          + Criar Tarefa
                        </button>
                      )}
                      {(isGanho || isPerdido) && (
                        <button
                          onClick={e=>{
                            e.stopPropagation()
                            if (!confirm('Retomar negociação? O card volta para "Em andamento".')) return
                            marcarStatus(neg.id, 'em_andamento')
                          }}
                          onMouseDown={e=>e.stopPropagation()}
                          draggable={false}
                          style={{marginTop:8,width:'100%',padding:'6px 0',borderRadius:6,border:'1px solid var(--gold)',background:'rgba(201,168,76,0.12)',color:'var(--gold)',cursor:'pointer',fontSize:11,fontWeight:600}}>
                          ↺ Retomar negociação
                        </button>
                      )}
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
        )
      })()}

      {/* Visão lista de negociações */}
      {funiAtual && modoVisao==='lista' && (
        <div style={{flex:1,overflow:'auto',padding:'16px 20px'}}>
          {negociosFunil.length === 0 && (
            <div style={{textAlign:'center',color:'var(--text-muted)',padding:40,fontSize:13}}>
              Nenhuma negociação encontrada com os filtros atuais.
            </div>
          )}
          {negociosFunil.length > 0 && (
            <div style={{background:'var(--card-bg)',border:'1px solid var(--border-soft)',borderRadius:12,overflow:'hidden'}}>
              <div style={{display:'grid',gridTemplateColumns:'2fr 1.4fr 1fr 1fr 1.2fr 1.4fr 60px',gap:0,padding:'10px 14px',background:'rgba(255,255,255,0.04)',borderBottom:'1px solid var(--border)',fontSize:11,fontWeight:600,letterSpacing:'0.5px',textTransform:'uppercase',color:'var(--text-muted)'}}>
                <div>Título</div>
                <div>Cliente</div>
                <div>Etapa</div>
                <div>Prêmio</div>
                <div>Criado em</div>
                <div>Responsável</div>
                <div></div>
              </div>
              {negociosFunil.map(neg => {
                const podeTrocar = profile?.role === 'admin' || profile?.role === 'lider'
                return (
                  <div key={neg.id} style={{display:'grid',gridTemplateColumns:'2fr 1.4fr 1fr 1fr 1.2fr 1.4fr 60px',gap:0,padding:'10px 14px',borderBottom:'1px solid rgba(255,255,255,0.04)',fontSize:12,alignItems:'center'}}>
                    <a href={`/dashboard/negocios/${neg.id}`}
                      onClick={(e)=>{
                        if (e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1) return /* deixa o browser abrir nova guia */
                        e.preventDefault()
                        router.push(`/dashboard/negocios/${neg.id}`)
                      }}
                      style={{display:'block',cursor:'pointer',color:'var(--gold)',fontWeight:500,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',paddingRight:8,textDecoration:'none'}}
                      title="Abrir negociação · botão direito: nova guia">
                      {neg.titulo}
                    </a>
                    <div style={{color:'var(--text)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',paddingRight:8}}>
                      {neg.clientes?.nome || <span style={{color:'var(--text-muted)'}}>—</span>}
                    </div>
                    <div style={{color:'var(--text-muted)'}}>{neg.etapa}</div>
                    {(() => {
                      const valorLinha = valorDoNegocio(neg)
                      const mostra = !isFunilEmissao(funilAtivo) && valorLinha > 0
                      return (
                    <div style={{color:mostra?'var(--teal)':'var(--text-muted)',fontWeight:mostra?600:400}}>
                      {mostra ? `R$ ${valorLinha.toLocaleString('pt-BR',{minimumFractionDigits:2})}` : '—'}
                    </div>
                      )
                    })()}
                    <div style={{color:'var(--text-muted)',fontSize:11}}>
                      {neg.created_at ? new Date(neg.created_at).toLocaleDateString('pt-BR') : '—'}
                    </div>
                    <div onClick={e=>e.stopPropagation()}>
                      {podeTrocar ? (
                        <select value={neg.vendedor_id || ''} onChange={e=>trocarVendedorNeg(neg.id, e.target.value)}
                          style={{...inp,padding:'5px 8px',fontSize:11,background:'rgba(255,255,255,0.04)'}}>
                          <option value="">— sem responsável —</option>
                          {usuarios.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
                        </select>
                      ) : (
                        <span style={{color:'var(--text-muted)'}}>{neg.users?.nome || '—'}</span>
                      )}
                    </div>
                    <div style={{textAlign:'right'}}>
                      <button onClick={()=>router.push(`/dashboard/negocios/${neg.id}`)}
                        title="Abrir negociação"
                        style={{background:'none',border:'1px solid var(--border)',borderRadius:6,padding:'4px 8px',color:'var(--text-muted)',cursor:'pointer',fontSize:11}}>↗</button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
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
                <select value={formNovo.produto} onChange={e=>setFormNovo(f=>({...f,produto:e.target.value}))} style={{...inp,background:'#ffffff'}}>
                  <option value="">— Selecione —</option>
                  {produtosAll.map(p=><option key={p.id} value={p.nome} style={{background:'#ffffff'}}>{p.nome}</option>)}
                </select></div>
              <div><label style={{fontSize:12,color:'var(--text-muted)',display:'block',marginBottom:4}}>Prêmio (R$)</label>
                <input value={formNovo.premio} onChange={e=>setFormNovo(f=>({...f,premio:e.target.value}))} placeholder="0,00" style={inp}/></div>
            </div>

            {!clienteSel && (
              <div style={{marginBottom:12,padding:'12px',background:'rgba(28,181,160,0.04)',border:'1px dashed rgba(28,181,160,0.3)',borderRadius:8}}>
                <div style={{fontSize:11,color:'var(--text-muted)',marginBottom:8,fontWeight:600,letterSpacing:'0.5px',textTransform:'uppercase'}}>Contato {clienteSel ? '' : '(será criado/vinculado como cliente)'}</div>
                <div style={{marginBottom:8}}><label style={{fontSize:12,color:'var(--text-muted)',display:'block',marginBottom:4}}>Nome</label>
                  <input value={formNovo.contato_nome} onChange={e=>setFormNovo(f=>({...f,contato_nome:e.target.value}))} placeholder="Nome do contato" style={inp}/></div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:8}}>
                  <div><label style={{fontSize:12,color:'var(--text-muted)',display:'block',marginBottom:4}}>Telefone</label>
                    <input value={formNovo.telefone} onChange={e=>setFormNovo(f=>({...f,telefone:e.target.value}))} placeholder="(00) 00000-0000" style={inp}/></div>
                  <div><label style={{fontSize:12,color:'var(--text-muted)',display:'block',marginBottom:4}}>CPF/CNPJ</label>
                    <input value={formNovo.contato_cpf_cnpj} onChange={e=>setFormNovo(f=>({...f,contato_cpf_cnpj:e.target.value}))} placeholder="000.000.000-00" style={inp}/></div>
                </div>
                <div><label style={{fontSize:12,color:'var(--text-muted)',display:'block',marginBottom:4}}>Email</label>
                  <input type="email" value={formNovo.contato_email} onChange={e=>setFormNovo(f=>({...f,contato_email:e.target.value}))} placeholder="email@email.com" style={inp}/></div>
              </div>
            )}
            {clienteSel && (
              <div style={{marginBottom:12}}><label style={{fontSize:12,color:'var(--text-muted)',display:'block',marginBottom:4}}>Telefone</label>
                <input value={formNovo.telefone} onChange={e=>setFormNovo(f=>({...f,telefone:e.target.value}))} placeholder="(00) 00000-0000" style={inp}/></div>
            )}

            <div style={{marginBottom:12}}><label style={{fontSize:12,color:'var(--text-muted)',display:'block',marginBottom:4}}>Seguradora</label>
              <select value={formNovo.seguradora} onChange={e=>setFormNovo(f=>({...f,seguradora:e.target.value}))} style={{...inp,background:'#ffffff'}}>
                <option value="">— Selecione —</option>
                {seguradorasAll.map(s=><option key={s.id} value={s.nome} style={{background:'#ffffff'}}>{s.nome}</option>)}
              </select>
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
                  style={{padding:'8px 16px',fontSize:12,cursor:'pointer',border:'none',borderBottom:vincularTab===k?'2px solid var(--gold)':'2px solid transparent',background:'transparent',color:vincularTab===k?'var(--gold)':'var(--text-muted)',fontFamily:'Open Sans,sans-serif',marginBottom:-1}}>
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
            <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:8,gap:10}}>
              {editandoTitulo && podeEditarPremio(cardAtivo) ? (
                <input
                  autoFocus
                  value={tituloInput}
                  onChange={e => setTituloInput(e.target.value)}
                  onBlur={salvarTituloDoCard}
                  onKeyDown={e => {
                    if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur()
                    if (e.key === 'Escape') { setTituloInput(cardAtivo.titulo || ''); setEditandoTitulo(false) }
                  }}
                  disabled={salvandoTitulo}
                  maxLength={200}
                  style={{flex:1,fontFamily:'DM Serif Display,serif',fontSize:18,background:'rgba(255,255,255,0.05)',border:'1px solid var(--border)',borderRadius:6,padding:'4px 8px',color:'var(--text)',outline:'none'}}
                />
              ) : (
                <div
                  onClick={() => podeEditarPremio(cardAtivo) && setEditandoTitulo(true)}
                  title={podeEditarPremio(cardAtivo) ? 'Clique para editar o título' : ''}
                  style={{fontFamily:'DM Serif Display,serif',fontSize:18,flex:1,cursor: podeEditarPremio(cardAtivo) ? 'text' : 'default'}}>
                  {cardAtivo.titulo} {podeEditarPremio(cardAtivo) && <span style={{fontSize:11,color:'var(--text-muted)',marginLeft:6}}>✎</span>}
                </div>
              )}
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
              {(([
                ['Etapa', cardAtivo.etapa] as [string, React.ReactNode],
                ['Produto', cardAtivo.produto||'—'] as [string, React.ReactNode],
                isFunilEmissao(cardAtivo.funil_id) ? null : (['Prêmio', podeEditarPremio(cardAtivo) ? (
                  <div style={{display:'flex',alignItems:'center',gap:6}}>
                    <span style={{fontSize:13,color:'var(--text-muted)'}}>R$</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={premioInput}
                      onChange={e => setPremioInput(e.target.value)}
                      onBlur={salvarPremioDoCard}
                      onKeyDown={e => { if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur() }}
                      placeholder="0,00"
                      disabled={salvandoPremio}
                      style={{flex:1,minWidth:0,background:'rgba(255,255,255,0.05)',border:'1px solid var(--border)',borderRadius:6,padding:'5px 9px',color:'var(--text)',fontSize:13,outline:'none',boxSizing:'border-box'}}
                    />
                  </div>
                ) : (cardAtivo.premio ? `R$ ${Number(cardAtivo.premio).toLocaleString('pt-BR',{minimumFractionDigits:2})}` : '—')] as [string, React.ReactNode]),
                ['Responsável', cardAtivo.users?.nome||'—'] as [string, React.ReactNode],
                ['🆕 Criado em', cardAtivo.created_at ? new Date(cardAtivo.created_at).toLocaleString('pt-BR') : '—'] as [string, React.ReactNode],
                ['🏁 Fechado em', cardAtivo.data_fechamento ? new Date(cardAtivo.data_fechamento).toLocaleString('pt-BR') : '— (em andamento)'] as [string, React.ReactNode],
              ] as Array<[string, React.ReactNode] | null>).filter(Boolean) as Array<[string, React.ReactNode]>).map(([l,v])=>(
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
                  <button onClick={()=>router.push(`/dashboard/clientes/${cardAtivo.cliente_id}`)} style={{fontSize:12,padding:'4px 10px',borderRadius:6,border:'1px solid var(--border)',background:'transparent',color:'var(--teal)',cursor:'pointer',fontFamily:'Open Sans,sans-serif'}}>
                    Ver perfil →
                  </button>
                </div>
              ) : (
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                  <div style={{fontSize:12,color:'var(--text-muted)'}}>
                    {cardAtivo.cpf_cnpj ? `CPF: ${cardAtivo.cpf_cnpj}` : 'Sem cliente vinculado'}
                  </div>
                  <button onClick={()=>{setModalCard(false);setNegocioVincular(cardAtivo);setVincularTab('buscar');setVincularBusca('');setVincularRes([]);setNovoClienteForm({nome:'',cpf_cnpj:cardAtivo.cpf_cnpj||'',telefone:'',email:''});setModalVincular(true)}}
                    style={{fontSize:12,padding:'5px 12px',borderRadius:6,border:'1px solid rgba(201,168,76,0.4)',background:'rgba(201,168,76,0.08)',color:'var(--gold)',cursor:'pointer',fontFamily:'Open Sans,sans-serif'}}>
                    + Vincular cliente
                  </button>
                </div>
              )}
            </div>

            {/* Telefone do negócio */}
            <div style={{marginBottom:16,padding:'12px 16px',background:'rgba(255,255,255,0.04)',borderRadius:10,border:'1px solid var(--border)'}}>
              <div style={{fontSize:10,fontWeight:600,letterSpacing:'1.2px',textTransform:'uppercase',color:'var(--text-muted)',marginBottom:6}}>📞 Telefone</div>
              <input
                type="tel"
                value={telefoneInput}
                onChange={e => setTelefoneInput(e.target.value)}
                onBlur={salvarTelefoneDoCard}
                onKeyDown={e => { if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur() }}
                placeholder="(00) 00000-0000"
                disabled={salvandoTelefone}
                style={{width:'100%',background:'rgba(255,255,255,0.05)',border:'1px solid var(--border)',borderRadius:6,padding:'7px 10px',color:'var(--text)',fontSize:13,outline:'none',boxSizing:'border-box'}}
              />
            </div>

            {/* Rastreador? (somente funil EMISSÃO E IMPLANTAÇÃO) */}
            {isFunilEmissao(cardAtivo.funil_id) && (
              <div style={{marginBottom:16,padding:'12px 16px',background:'rgba(255,255,255,0.04)',borderRadius:10,border:'1px solid var(--border)'}}>
                <div style={{fontSize:10,fontWeight:600,letterSpacing:'1.2px',textTransform:'uppercase',color:'var(--text-muted)',marginBottom:6}}>📡 Rastreador?</div>
                <div style={{display:'flex',gap:8}}>
                  {['SIM','NAO'].map(v => {
                    const ativo = (cardAtivo.rastreador || '').toUpperCase() === v
                    return (
                      <button key={v}
                        disabled={!podeEditarPremio(cardAtivo)}
                        onClick={async () => {
                          if (!podeEditarPremio(cardAtivo)) return
                          const novo = ativo ? null : v
                          const { error } = await supabase.from('negocios').update({ rastreador: novo }).eq('id', cardAtivo.id)
                          if (error) { alert('Erro: '+error.message); return }
                          setCardAtivo({ ...cardAtivo, rastreador: novo })
                          setNegocios(prev => prev.map(n => n.id === cardAtivo.id ? { ...n, rastreador: novo } : n))
                          if (v === 'SIM' && !ativo) alert('Rastreador marcado. Um card foi criado automaticamente no FUNIL RASTREADOR.')
                        }}
                        style={{flex:1,padding:'8px 12px',borderRadius:6,fontSize:12,fontWeight:600,cursor:podeEditarPremio(cardAtivo)?'pointer':'not-allowed',border:'1px solid '+(ativo?(v==='SIM'?'rgba(28,181,160,0.5)':'rgba(224,82,82,0.4)'):'var(--border)'),background:ativo?(v==='SIM'?'rgba(28,181,160,0.12)':'rgba(224,82,82,0.10)'):'rgba(255,255,255,0.04)',color:ativo?(v==='SIM'?'var(--teal)':'var(--red)'):'var(--text-muted)'}}>
                        {v === 'SIM' ? '✓ Sim' : '✕ Não'}
                      </button>
                    )
                  })}
                </div>
                <div style={{fontSize:10,color:'var(--text-muted)',marginTop:6}}>
                  Ao marcar SIM, um card é criado automaticamente no FUNIL RASTREADOR com cliente, telefone e placa.
                </div>
              </div>
            )}

            {/* Comissão do negócio */}
            <div style={{marginBottom:16,padding:'12px 16px',background:'rgba(255,255,255,0.04)',borderRadius:10,border:'1px solid var(--border)'}}>
              <div style={{fontSize:10,fontWeight:600,letterSpacing:'1.2px',textTransform:'uppercase',color:'var(--text-muted)',marginBottom:6}}>💰 Comissão</div>
              {podeEditarPremio(cardAtivo) ? (
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                  <div>
                    <label style={{fontSize:10,color:'var(--text-muted)',display:'block',marginBottom:3}}>% sobre o prêmio</label>
                    <div style={{display:'flex',alignItems:'center',gap:6}}>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={comissaoPctInput}
                        onChange={e => setComissaoPctInput(e.target.value)}
                        onBlur={salvarComissaoDoCard}
                        onKeyDown={e => { if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur() }}
                        placeholder="0,00"
                        disabled={salvandoComissao}
                        style={{flex:1,minWidth:0,background:'rgba(255,255,255,0.05)',border:'1px solid var(--border)',borderRadius:6,padding:'5px 9px',color:'var(--text)',fontSize:13,outline:'none',boxSizing:'border-box'}}
                      />
                      <span style={{fontSize:13,color:'var(--text-muted)'}}>%</span>
                    </div>
                  </div>
                  <div>
                    <label style={{fontSize:10,color:'var(--text-muted)',display:'block',marginBottom:3}}>Valor R$</label>
                    <div style={{display:'flex',alignItems:'center',gap:6}}>
                      <span style={{fontSize:13,color:'var(--text-muted)'}}>R$</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={comissaoValorInput}
                        onChange={e => setComissaoValorInput(e.target.value)}
                        onBlur={salvarComissaoDoCard}
                        onKeyDown={e => { if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur() }}
                        placeholder="0,00"
                        disabled={salvandoComissao}
                        style={{flex:1,minWidth:0,background:'rgba(255,255,255,0.05)',border:'1px solid var(--border)',borderRadius:6,padding:'5px 9px',color:'var(--text)',fontSize:13,outline:'none',boxSizing:'border-box'}}
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{fontSize:13}}>
                  {cardAtivo.comissao_pct ? `${Number(cardAtivo.comissao_pct).toLocaleString('pt-BR',{minimumFractionDigits:2})}%` : '—'}
                  {' · '}
                  {cardAtivo.comissao_valor ? `R$ ${Number(cardAtivo.comissao_valor).toLocaleString('pt-BR',{minimumFractionDigits:2})}` : '—'}
                </div>
              )}
            </div>

            {/* Apólice anterior — útil em cards de renovação para o
                corretor identificar a apólice que está vencendo. */}
            <div style={{marginBottom:16,padding:'12px 16px',background:'rgba(255,255,255,0.04)',borderRadius:10,border:'1px solid var(--border)'}}>
              <div style={{fontSize:10,fontWeight:600,letterSpacing:'1.2px',textTransform:'uppercase',color:'var(--text-muted)',marginBottom:6}}>📋 Apólice anterior</div>
              {podeEditarPremio(cardAtivo) ? (
                <input
                  type="text"
                  defaultValue={cardAtivo.apolice_anterior_numero || ''}
                  onBlur={async e => {
                    const novo = e.target.value.trim() || null
                    if (novo === (cardAtivo.apolice_anterior_numero || null)) return
                    const { error } = await supabase.from('negocios')
                      .update({ apolice_anterior_numero: novo })
                      .eq('id', cardAtivo.id)
                    if (error) { alert('Erro ao salvar nº da apólice anterior: ' + error.message); return }
                    setCardAtivo({ ...cardAtivo, apolice_anterior_numero: novo })
                    setNegocios(prev => prev.map(n => n.id === cardAtivo.id ? { ...n, apolice_anterior_numero: novo } : n))
                  }}
                  placeholder="Ex.: 123456789 (nº da apólice que está vencendo)"
                  style={{width:'100%',background:'rgba(255,255,255,0.05)',border:'1px solid var(--border)',borderRadius:6,padding:'7px 10px',color:'var(--text)',fontSize:13,outline:'none',boxSizing:'border-box',fontFamily:'monospace'}}
                />
              ) : (
                <div style={{fontSize:13,fontFamily:'monospace'}}>{cardAtivo.apolice_anterior_numero || '—'}</div>
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
                      style={{padding:'5px 12px',borderRadius:8,fontSize:12,cursor:'pointer',border:'1px solid var(--border)',background:'rgba(255,255,255,0.04)',color:'var(--text-muted)',fontFamily:'Open Sans,sans-serif'}}>
                      → {e}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Transferir para outro funil */}
            {funis.length > 1 && (
              <div style={{marginBottom:16,padding:'10px 14px',background:'rgba(255,255,255,0.03)',border:'1px solid var(--border)',borderRadius:10}}>
                <div style={{fontSize:10,fontWeight:600,letterSpacing:'1.2px',textTransform:'uppercase',color:'var(--text-muted)',marginBottom:8}}>⇄ Transferir para outro funil</div>
                <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
                  <select
                    value={transferFunilId}
                    onChange={e => setTransferFunilId(e.target.value)}
                    style={{flex:'1 1 180px',background:'#ffffff',border:'1px solid var(--border)',borderRadius:8,padding:'7px 10px',color:'var(--text)',fontSize:12,cursor:'pointer'}}>
                    <option value="">— escolha o funil —</option>
                    {funis.filter((f:any) => f.id !== cardAtivo.funil_id).map((f:any) => (
                      <option key={f.id} value={f.id}>{f.nome}</option>
                    ))}
                  </select>
                  {(() => {
                    const destino = funis.find((f:any) => f.id === transferFunilId)
                    if (!destino) return null
                    const etapasDest: string[] = destino.etapas || []
                    if (!etapasDest.length) {
                      return <div style={{fontSize:11,color:'var(--red)'}}>Esse funil não tem etapas configuradas.</div>
                    }
                    return (
                      <select
                        defaultValue=""
                        onChange={e => {
                          const et = e.target.value
                          e.target.value = ''
                          if (et) moverParaOutroFunil(cardAtivo.id, transferFunilId, et)
                        }}
                        style={{flex:'1 1 160px',background:'#ffffff',border:'1px solid var(--border)',borderRadius:8,padding:'7px 10px',color:'var(--text)',fontSize:12,cursor:'pointer'}}>
                        <option value="">→ etapa de destino…</option>
                        {etapasDest.map((et:string) => <option key={et} value={et}>{et}</option>)}
                      </select>
                    )
                  })()}
                </div>
                <div style={{fontSize:10,color:'var(--text-muted)',marginTop:6}}>
                  A negociação sai do funil atual e passa a aparecer no funil de destino.
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
                    const status = cfSavingKey === c.chave ? '⏳ salvando…' : cfSavedKey === c.chave ? '✓ salvo' : ''
                    return (
                      <div key={c.id}>
                        <label style={{fontSize:10,color:'var(--text-muted)',display:'flex',justifyContent:'space-between',marginBottom:3}}>
                          <span>{c.nome}{c.obrigatorio && <span style={{color:'var(--red)'}}> *</span>}</span>
                          {status && <span style={{color: cfSavedKey === c.chave ? 'var(--teal)' : 'var(--text-muted)'}}>{status}</span>}
                        </label>
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
                      <button title="Editar produto" onClick={async ()=>{
                        const novoProdId = prompt('ID do novo produto (deixe vazio pra manter):\n\n' + produtosAll.map(x => `${x.id} - ${x.nome}`).join('\n'), p.produto_id || '')
                        const novoNome = prompt('Nome do produto', p.nome_snapshot)
                        const novaQtd = prompt('Quantidade', String(p.quantidade || 1))
                        const novoVal = prompt('Valor unitário (R$)', String(p.valor_unit || 0))
                        if (novoNome === null || novaQtd === null || novoVal === null) return
                        const update: any = {
                          nome_snapshot: novoNome.trim() || p.nome_snapshot,
                          quantidade: Number(novaQtd) || p.quantidade,
                          valor_unit: Number(String(novoVal).replace(/\./g, '').replace(',', '.')) || p.valor_unit,
                        }
                        if (novoProdId && novoProdId.trim() !== p.produto_id) update.produto_id = novoProdId.trim()
                        const { error } = await supabase.from('negocio_produtos').update(update).eq('id', p.id)
                        if (error) alert('Erro: ' + error.message)
                        else {
                          const novos = produtosCard.map(x => x.id === p.id ? { ...x, ...update } : x)
                          setProdutosCard(novos)
                          recalcularValorProdutosDoCard(novos)
                        }
                      }} style={{background:'none',border:'none',color:'var(--blue)',cursor:'pointer',fontSize:13}}>✎</button>
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

            {/* Tarefas */}
            <div style={{marginBottom:14,padding:'10px 14px',background:'rgba(255,255,255,0.03)',border:'1px solid var(--border)',borderRadius:10}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8,gap:8,flexWrap:'wrap'}}>
                <div style={{fontSize:10,fontWeight:600,letterSpacing:'1.2px',textTransform:'uppercase',color:'var(--text-muted)'}}>
                  📋 Tarefas ({tarefasCard.filter(t => t.status !== 'concluida' && t.status !== 'cancelada').length} em aberto / {tarefasCard.length} total)
                </div>
                <a href="/dashboard/tarefas" target="_blank" rel="noreferrer" style={{fontSize:10,color:'var(--gold)',textDecoration:'none'}}>Painel completo →</a>
              </div>

              {/* Form de criar tarefa rápida */}
              <div style={{display:'grid',gridTemplateColumns:'1fr 170px auto',gap:6,marginBottom:8}}>
                <input
                  list="titulos-hist-tarefa-card"
                  value={novaTarefa.titulo}
                  onChange={e=>setNovaTarefa(f => ({...f, titulo:e.target.value}))}
                  onKeyDown={e=>{ if (e.key==='Enter' && novaTarefa.titulo.trim()) criarTarefaDoCard() }}
                  placeholder="Título da tarefa..."
                  style={{background:'rgba(255,255,255,0.05)',border:'1px solid var(--border)',borderRadius:6,padding:'6px 10px',color:'var(--text)',fontSize:12,outline:'none'}} />
                <datalist id="titulos-hist-tarefa-card">
                  {titulosHistTarefa.map(t => <option key={t} value={t} />)}
                </datalist>
                <input
                  type="datetime-local"
                  value={novaTarefa.prazo}
                  onChange={e=>setNovaTarefa(f => ({...f, prazo:e.target.value}))}
                  style={{background:'rgba(255,255,255,0.05)',border:'1px solid var(--border)',borderRadius:6,padding:'6px 10px',color:'var(--text)',fontSize:12,outline:'none'}} />
                <button onClick={criarTarefaDoCard} disabled={salvandoTarefa || !novaTarefa.titulo.trim()}
                  style={{padding:'6px 14px',borderRadius:6,fontSize:11,fontWeight:600,border:'1px solid rgba(201,168,76,0.4)',background:'rgba(201,168,76,0.10)',color:'var(--gold)',cursor:'pointer',fontFamily:'Open Sans,sans-serif',whiteSpace:'nowrap',opacity:(salvandoTarefa || !novaTarefa.titulo.trim())?0.6:1}}>
                  {salvandoTarefa ? '...' : '+ Criar tarefa'}
                </button>
              </div>

              {/* Lista de tarefas do card */}
              {tarefasCard.length === 0 ? (
                <div style={{fontSize:11,color:'var(--text-muted)',padding:'4px 0'}}>Nenhuma tarefa vinculada a essa negociação ainda.</div>
              ) : (
                <div style={{maxHeight:240,overflow:'auto',display:'flex',flexDirection:'column',gap:6}}>
                  {tarefasCard.map(t => {
                    const concluida = t.status === 'concluida'
                    const cancelada = t.status === 'cancelada'
                    const atrasada  = !concluida && !cancelada && t.prazo && new Date(t.prazo).getTime() < Date.now()
                    const corBorda  = atrasada ? 'rgba(224,82,82,0.45)' : concluida ? 'rgba(28,181,160,0.35)' : 'var(--border)'
                    const corFundo  = atrasada ? 'rgba(224,82,82,0.06)' : concluida ? 'rgba(28,181,160,0.05)' : 'rgba(255,255,255,0.03)'
                    return (
                      <div key={t.id}
                        style={{padding:'8px 10px',borderRadius:8,border:'1px solid '+corBorda,background:corFundo,display:'flex',alignItems:'flex-start',gap:8}}>
                        {tarefaEditId === t.id ? (
                          <div style={{flex:1,display:'flex',flexDirection:'column',gap:6}}>
                            <input type="text" value={tarefaEditForm.titulo}
                              onChange={e=>setTarefaEditForm({...tarefaEditForm, titulo:e.target.value})}
                              placeholder="Título"
                              style={{padding:'5px 8px',fontSize:11,borderRadius:5,border:'1px solid var(--border)',background:'rgba(0,0,0,0.2)',color:'var(--text)'}} />
                            <input type="datetime-local" value={tarefaEditForm.prazo}
                              onChange={e=>setTarefaEditForm({...tarefaEditForm, prazo:e.target.value})}
                              style={{padding:'5px 8px',fontSize:11,borderRadius:5,border:'1px solid var(--border)',background:'rgba(0,0,0,0.2)',color:'var(--text)'}} />
                            <div style={{display:'flex',gap:6}}>
                              <button onClick={salvarEdicaoTarefa}
                                style={{padding:'3px 10px',fontSize:10,borderRadius:5,border:'1px solid var(--teal)',background:'rgba(28,181,160,0.15)',color:'var(--teal)',cursor:'pointer',fontWeight:600}}>Salvar</button>
                              <button onClick={()=>setTarefaEditId(null)}
                                style={{padding:'3px 10px',fontSize:10,borderRadius:5,border:'1px solid var(--border)',background:'transparent',color:'var(--text-muted)',cursor:'pointer'}}>Cancelar</button>
                            </div>
                          </div>
                        ) : (
                        <>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>
                            <span style={{fontSize:12,fontWeight:600,color:atrasada?'var(--red)':'var(--text)',textDecoration:concluida||cancelada?'line-through':'none',opacity:concluida||cancelada?0.7:1}}>
                              {t.titulo}
                            </span>
                            {atrasada && <span style={{fontSize:9,padding:'1px 6px',borderRadius:8,background:'rgba(224,82,82,0.18)',color:'var(--red)',fontWeight:700,letterSpacing:'0.5px'}}>ATRASADA</span>}
                            {concluida && <span style={{fontSize:9,padding:'1px 6px',borderRadius:8,background:'rgba(28,181,160,0.18)',color:'var(--teal)',fontWeight:700,letterSpacing:'0.5px'}}>✓ CONCLUÍDA</span>}
                            {cancelada && <span style={{fontSize:9,padding:'1px 6px',borderRadius:8,background:'rgba(255,255,255,0.06)',color:'var(--text-muted)',fontWeight:700,letterSpacing:'0.5px'}}>CANCELADA</span>}
                          </div>
                          <div style={{display:'flex',alignItems:'center',gap:10,marginTop:3,fontSize:10,color:'var(--text-muted)',flexWrap:'wrap'}}>
                            {t.prazo && (
                              <span style={{color:atrasada?'var(--red)':'var(--text-muted)'}}>
                                📅 {new Date(t.prazo).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit'})}
                              </span>
                            )}
                            {t.users?.nome && <span>👤 {t.users.nome.split(' ')[0]}</span>}
                          </div>
                        </div>
                        <div style={{display:'flex',gap:4,flexShrink:0}}>
                          {!concluida && !cancelada && (
                            <button onClick={()=>alterarStatusTarefa(t.id,'concluida')}
                              title="Concluir"
                              style={{padding:'3px 8px',fontSize:10,borderRadius:5,border:'1px solid rgba(28,181,160,0.4)',background:'rgba(28,181,160,0.10)',color:'var(--teal)',cursor:'pointer'}}>✓</button>
                          )}
                          {(concluida || cancelada) && (
                            <button onClick={()=>alterarStatusTarefa(t.id,'pendente')}
                              title="Reabrir"
                              style={{padding:'3px 8px',fontSize:10,borderRadius:5,border:'1px solid var(--border)',background:'transparent',color:'var(--text-muted)',cursor:'pointer'}}>↺</button>
                          )}
                          <button onClick={()=>iniciarEdicaoTarefa(t)}
                            title="Editar"
                            style={{padding:'3px 8px',fontSize:10,borderRadius:5,border:'1px solid var(--border)',background:'transparent',color:'var(--gold)',cursor:'pointer'}}>✎</button>
                          <button onClick={()=>excluirTarefa(t.id)}
                            title="Excluir"
                            style={{padding:'3px 8px',fontSize:10,borderRadius:5,border:'1px solid rgba(224,82,82,0.3)',background:'transparent',color:'var(--red)',cursor:'pointer'}}>×</button>
                        </div>
                        </>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Anexos */}
            <div style={{marginBottom:14,padding:'10px 14px',background:'rgba(255,255,255,0.03)',border:'1px solid var(--border)',borderRadius:10}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8,flexWrap:'wrap',gap:8}}>
                <div style={{fontSize:10,fontWeight:600,letterSpacing:'1.2px',textTransform:'uppercase',color:'var(--text-muted)'}}>📎 Anexos ({anexosCard.length})</div>
                <div style={{display:'flex',gap:6}}>
                  <button onClick={()=>fileInputRef.current?.click()} disabled={uploadando}
                    style={{padding:'5px 12px',borderRadius:6,fontSize:11,border:'1px solid var(--border)',background:'rgba(255,255,255,0.04)',color:'var(--gold)',cursor:'pointer',fontFamily:'Open Sans,sans-serif',fontWeight:600}}>
                    {uploadando ? '⏳ Enviando...' : '+ Anexar arquivo'}
                  </button>
                  <button onClick={abrirModalAssinatura}
                    style={{padding:'5px 12px',borderRadius:6,fontSize:11,border:'1px solid rgba(28,181,160,0.4)',background:'rgba(28,181,160,0.10)',color:'var(--teal)',cursor:'pointer',fontFamily:'Open Sans,sans-serif',fontWeight:600}}>
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
                <span style={{fontWeight:400,marginLeft:8,textTransform:'none',letterSpacing:0,fontSize:9,color:'var(--text-muted)'}}>· cada autor edita / exclui / fixa as próprias</span>
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
                  const ehAutor = n.user_id === profile?.id
                  const podeMexer = profile?.role === 'admin' || ehAutor
                  return (
                    <div key={n.id} style={{padding:'6px 0',borderBottom:'1px solid rgba(255,255,255,0.04)',background: n.pinned ? 'rgba(201,168,76,0.06)' : 'transparent', borderLeft: n.pinned ? '2px solid var(--gold)' : 'none', paddingLeft: n.pinned ? 6 : 0}}>
                      {editing ? (
                        <div style={{display:'flex',gap:6,marginBottom:4}}>
                          <textarea value={editandoNota!.conteudo} onChange={e=>setEditandoNota(p=>p?{...p,conteudo:e.target.value}:p)}
                            rows={2} style={{flex:1,background:'rgba(255,255,255,0.05)',border:'1px solid var(--border)',borderRadius:6,padding:'5px 8px',color:'var(--text)',fontSize:12,outline:'none',resize:'none',fontFamily:'Open Sans,sans-serif'}} />
                          <div style={{display:'flex',flexDirection:'column',gap:4}}>
                            <button onClick={salvarEdicaoNota} style={{padding:'3px 8px',fontSize:10,borderRadius:5,border:'1px solid rgba(28,181,160,0.4)',background:'rgba(28,181,160,0.10)',color:'var(--teal)',cursor:'pointer'}}>✓</button>
                            <button onClick={()=>setEditandoNota(null)} style={{padding:'3px 8px',fontSize:10,borderRadius:5,border:'1px solid var(--border)',background:'transparent',color:'var(--text-muted)',cursor:'pointer'}}>✕</button>
                          </div>
                        </div>
                      ) : (
                        <div style={{fontSize:12,marginBottom:2,whiteSpace:'pre-wrap'}}>
                          {n.pinned && <span title="Nota fixada" style={{marginRight:4}}>📌</span>}
                          {n.conteudo}
                        </div>
                      )}
                      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8}}>
                        <div style={{fontSize:10,color:'var(--text-muted)'}}>
                          {n.users?.nome || '—'} · {new Date(n.criado_em).toLocaleString('pt-BR')}
                        </div>
                        {podeMexer && !editing && (
                          <div style={{display:'flex',gap:4}}>
                            <button onClick={()=>alternarFixarNota(n.id, !!n.pinned)}
                              title={n.pinned ? 'Desafixar' : 'Fixar nota no topo'}
                              style={{padding:'2px 6px',fontSize:10,borderRadius:5,border:'1px solid var(--border)',background:n.pinned?'rgba(201,168,76,0.15)':'transparent',color:'var(--gold)',cursor:'pointer'}}>📌</button>
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
                <button onClick={()=>{
                  const funilNome = (funis.find((f:any)=>f.id===cardAtivo.funil_id)?.nome || '').toUpperCase()
                  const exige = ['RCO','VENDA','VENDAS','RENOVAÇÕES','RENOVACOES','META + MULTICANAL','META MULTICANAL'].some(n => funilNome.includes(n.toUpperCase()))
                  if (exige && !cardAtivo.cliente_id) { alert('Negócio só pode ser finalizado com cliente vinculado. Vincule e finalize a negociação.'); return }
                  marcarStatus(cardAtivo.id,'ganho')
                }}
                  disabled={cardAtivo.status==='ganho'}
                  style={{flex:1,minWidth:120,padding:'8px 14px',borderRadius:8,fontSize:13,fontWeight:600,cursor:cardAtivo.status==='ganho'?'default':'pointer',border:'1px solid rgba(28,181,160,0.4)',background:cardAtivo.status==='ganho'?'rgba(28,181,160,0.25)':'rgba(28,181,160,0.1)',color:'var(--teal)',fontFamily:'Open Sans,sans-serif',opacity:cardAtivo.status==='ganho'?0.7:1}}>
                  ✓ Marcar Ganho
                </button>
                <button onClick={()=>{
                  const funilNome = (funis.find((f:any)=>f.id===cardAtivo.funil_id)?.nome || '').toUpperCase()
                  const exige = ['RCO','VENDA','VENDAS','RENOVAÇÕES','RENOVACOES','META + MULTICANAL','META MULTICANAL'].some(n => funilNome.includes(n.toUpperCase()))
                  if (exige && !cardAtivo.cliente_id) { alert('Negócio só pode ser finalizado com cliente vinculado. Vincule e finalize a negociação.'); return }
                  setModalPerdido(cardAtivo);setMotivoSelecionado('');setMotivoCustom('')
                }}
                  disabled={cardAtivo.status==='perdido'}
                  style={{flex:1,minWidth:120,padding:'8px 14px',borderRadius:8,fontSize:13,fontWeight:600,cursor:cardAtivo.status==='perdido'?'default':'pointer',border:'1px solid rgba(224,82,82,0.4)',background:cardAtivo.status==='perdido'?'rgba(224,82,82,0.25)':'rgba(224,82,82,0.1)',color:'var(--red)',fontFamily:'Open Sans,sans-serif',opacity:cardAtivo.status==='perdido'?0.7:1}}>
                  ✕ Marcar Perdido
                </button>
                {cardAtivo.status && cardAtivo.status !== 'em_andamento' && (
                  <button onClick={()=>{
                    if (!confirm('Retomar negociação? O card volta para "Em andamento".')) return
                    marcarStatus(cardAtivo.id,'em_andamento')
                  }}
                    style={{flex:1,minWidth:140,padding:'8px 14px',borderRadius:8,fontSize:13,fontWeight:600,cursor:'pointer',border:'1px solid var(--gold)',background:'rgba(201,168,76,0.15)',color:'var(--gold)',fontFamily:'Open Sans,sans-serif'}}>
                    ↺ Retomar negociação
                  </button>
                )}
              </div>
              {cardAtivo.status === 'perdido' && cardAtivo.motivo_perda && (
                <div style={{marginTop:8,fontSize:11,color:'var(--text-muted)'}}>Motivo: {cardAtivo.motivo_perda}</div>
              )}
            </div>

            <div style={{display:'flex',justifyContent:'space-between'}}>
              <button onClick={()=>excluirNegocio(cardAtivo.id)} style={{fontSize:12,padding:'6px 14px',borderRadius:8,border:'1px solid rgba(224,82,82,0.3)',background:'rgba(224,82,82,0.08)',color:'var(--red)',cursor:'pointer',fontFamily:'Open Sans,sans-serif'}}>
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
              }} style={{padding:'9px 18px',borderRadius:8,fontSize:13,fontWeight:600,cursor:'pointer',border:'1px solid rgba(224,82,82,0.4)',background:'rgba(224,82,82,0.15)',color:'var(--red)',fontFamily:'Open Sans,sans-serif'}}>
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
                style={{padding:'5px 12px',borderRadius:6,fontSize:11,border:'1px solid var(--border)',background:'rgba(255,255,255,0.04)',color:'var(--gold)',cursor:'pointer',fontFamily:'Open Sans,sans-serif'}}>+ Adicionar signatário</button>
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
                style={{width:'100%',background:'rgba(255,255,255,0.05)',border:'1px solid var(--border)',borderRadius:8,padding:'9px 13px',color:'var(--text)',fontSize:13,outline:'none',resize:'vertical',fontFamily:'Open Sans,sans-serif',lineHeight:1.5,boxSizing:'border-box'}} />
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

      {/* Drawer "Filtros" — Fase 7 (RD Station style) */}
      {filtrosOpen && (
        <>
          <div onClick={()=>setFiltrosOpen(false)} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',zIndex:1000}}/>
          <div style={{position:'fixed',top:0,right:0,bottom:0,width:'min(380px,100vw)',background:'#fff',zIndex:1001,boxShadow:'-8px 0 32px rgba(0,0,0,0.18)',display:'flex',flexDirection:'column'}}>
            <div style={{padding:'18px 22px',borderBottom:'1px solid var(--border-soft)',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              <div style={{fontSize:16,fontWeight:700,color:'var(--text)'}}>Filtros <span style={{color:'var(--text-muted)',fontSize:12,fontWeight:400}}>({filtroData.campo!=='sem'?1:0})</span></div>
              <button onClick={()=>setFiltrosOpen(false)} style={{background:'none',border:'none',cursor:'pointer',fontSize:18,color:'var(--text-muted)'}}>✕</button>
            </div>
            <div style={{flex:1,overflow:'auto',padding:'18px 22px'}}>
              <div style={{fontSize:12,fontWeight:600,color:'var(--text)',marginBottom:6}}>Status da negociação</div>
              <select value={filtroStatus} onChange={e=>setFiltroStatus(e.target.value as any)}
                style={{width:'100%',padding:'9px 12px',border:'1px solid var(--border-soft)',borderRadius:8,fontSize:13,outline:'none',background:'#fff',color:'var(--text)',marginBottom:14}}>
                <option value="todos">Todas</option>
                <option value="em_andamento">Em andamento</option>
                <option value="ganho">Ganho</option>
                <option value="perdido">Perdido</option>
              </select>

              <div style={{fontSize:12,fontWeight:600,color:'var(--text)',marginBottom:6}}>Filtrar por data</div>
              <select value={filtroData.campo} onChange={e=>setFiltroData(f=>({...f,campo:e.target.value as any}))}
                style={{width:'100%',padding:'9px 12px',border:'1px solid var(--border-soft)',borderRadius:8,fontSize:13,outline:'none',background:'#fff',color:'var(--text)',marginBottom:8}}>
                <option value="sem">Sem filtro</option>
                <option value="criacao">Data de criação</option>
                <option value="fechamento">Data de fechamento</option>
              </select>
              {filtroData.campo !== 'sem' && (
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                  <div>
                    <div style={{fontSize:11,color:'var(--text-muted)',marginBottom:4}}>De</div>
                    <input type="date" value={filtroData.de} onChange={e=>setFiltroData(f=>({...f,de:e.target.value}))}
                      style={{width:'100%',padding:'8px 10px',border:'1px solid var(--border-soft)',borderRadius:8,fontSize:13,outline:'none'}}/>
                  </div>
                  <div>
                    <div style={{fontSize:11,color:'var(--text-muted)',marginBottom:4}}>Até</div>
                    <input type="date" value={filtroData.ate} onChange={e=>setFiltroData(f=>({...f,ate:e.target.value}))}
                      style={{width:'100%',padding:'8px 10px',border:'1px solid var(--border-soft)',borderRadius:8,fontSize:13,outline:'none'}}/>
                  </div>
                </div>
              )}
            </div>
            <div style={{padding:'14px 22px',borderTop:'1px solid var(--border-soft)',display:'flex',gap:10,justifyContent:'space-between'}}>
              <button onClick={()=>{setFiltroData({campo:'sem',de:'',ate:''});setFiltroStatus('em_andamento')}}
                style={{padding:'9px 14px',borderRadius:8,border:'1px solid var(--border-soft)',background:'#fff',color:'var(--text)',cursor:'pointer',fontSize:13,fontWeight:600}}>Limpar filtros</button>
              <button onClick={()=>setFiltrosOpen(false)}
                style={{padding:'9px 18px',borderRadius:8,border:'none',background:'var(--blue)',color:'#fff',cursor:'pointer',fontSize:13,fontWeight:600}}>Aplicar filtros</button>
            </div>
          </div>
        </>
      )}

      {/* Drawer "Criar Tarefa" — Fase 6 (RD Station style) */}
      {novaTarefaParaNegocio && (
        <>
          <div onClick={()=>setNovaTarefaParaNegocio(null)} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',zIndex:1000}}/>
          <div style={{position:'fixed',top:0,right:0,bottom:0,width:'min(420px,100vw)',background:'#fff',zIndex:1001,boxShadow:'-8px 0 32px rgba(0,0,0,0.18)',display:'flex',flexDirection:'column'}}>
            <div style={{padding:'18px 22px',borderBottom:'1px solid var(--border-soft)',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              <div style={{fontSize:16,fontWeight:700,color:'var(--text)'}}>Criar Tarefa</div>
              <button onClick={()=>setNovaTarefaParaNegocio(null)} style={{background:'none',border:'none',cursor:'pointer',fontSize:18,color:'var(--text-muted)'}}>✕</button>
            </div>
            <div style={{flex:1,overflow:'auto',padding:'18px 22px'}}>
              {(() => {
                const labelStyle: React.CSSProperties = { fontSize:12,fontWeight:600,color:'var(--text)',display:'block',marginBottom:6,marginTop:14 }
                const inputStyle: React.CSSProperties = { width:'100%',padding:'9px 12px',border:'1px solid var(--border-soft)',borderRadius:8,fontSize:13,fontFamily:'inherit',outline:'none',color:'var(--text)',background:'#fff',boxSizing:'border-box' }
                return (
                  <>
                    <label style={{...labelStyle,marginTop:0}}>Empresa da negociação</label>
                    <input readOnly value={novaTarefaParaNegocio.clientes?.nome || novaTarefaParaNegocio.titulo || ''} style={{...inputStyle,background:'var(--bg-subtle)'}} />

                    <label style={labelStyle}>Negociação *</label>
                    <input readOnly value={novaTarefaParaNegocio.titulo || ''} style={{...inputStyle,background:'var(--bg-subtle)'}} />

                    <label style={labelStyle}>Assunto da tarefa *</label>
                    <input autoFocus value={novaTarefaForm.assunto}
                      onChange={e=>setNovaTarefaForm(f=>({...f,assunto:e.target.value}))}
                      placeholder="Assunto da tarefa" style={inputStyle} />

                    <label style={labelStyle}>Descrição da tarefa</label>
                    <textarea value={novaTarefaForm.descricao}
                      onChange={e=>setNovaTarefaForm(f=>({...f,descricao:e.target.value}))}
                      rows={3} placeholder="Descrição da tarefa"
                      style={{...inputStyle,resize:'vertical',fontFamily:'inherit'}} />

                    <label style={labelStyle}>Responsável *</label>
                    <select value={novaTarefaForm.responsavel_id}
                      onChange={e=>setNovaTarefaForm(f=>({...f,responsavel_id:e.target.value}))}
                      style={inputStyle}>
                      <option value="">— Eu mesmo —</option>
                      {usuarios.map(u=> <option key={u.id} value={u.id}>{u.nome}</option>)}
                    </select>

                    <label style={labelStyle}>Tipo de tarefa *</label>
                    <select value={novaTarefaForm.tipo}
                      onChange={e=>setNovaTarefaForm(f=>({...f,tipo:e.target.value}))}
                      style={inputStyle}>
                      <option value="tarefa">Tarefa</option>
                      <option value="ligacao">Ligação</option>
                      <option value="reuniao">Reunião</option>
                      <option value="visita">Visita</option>
                      <option value="email">E-mail</option>
                      <option value="whatsapp">WhatsApp</option>
                    </select>

                    <div style={{display:'grid',gridTemplateColumns:'1fr 120px',gap:10}}>
                      <div>
                        <label style={labelStyle}>Data do agendamento *</label>
                        <input type="date" value={novaTarefaForm.data}
                          onChange={e=>setNovaTarefaForm(f=>({...f,data:e.target.value}))}
                          style={inputStyle} />
                      </div>
                      <div>
                        <label style={labelStyle}>Horário *</label>
                        <input type="time" value={novaTarefaForm.hora}
                          onChange={e=>setNovaTarefaForm(f=>({...f,hora:e.target.value}))}
                          style={inputStyle} />
                      </div>
                    </div>

                    <label style={{display:'flex',alignItems:'center',gap:8,marginTop:16,fontSize:13,color:'var(--text)',cursor:'pointer'}}>
                      <input type="checkbox" checked={novaTarefaForm.concluida}
                        onChange={e=>setNovaTarefaForm(f=>({...f,concluida:e.target.checked}))} />
                      Marcar como concluída ao criar
                    </label>
                  </>
                )
              })()}
            </div>
            <div style={{padding:'14px 22px',borderTop:'1px solid var(--border-soft)',display:'flex',gap:10,justifyContent:'flex-end'}}>
              <button onClick={()=>setNovaTarefaParaNegocio(null)}
                style={{padding:'9px 16px',borderRadius:8,border:'1px solid var(--border-soft)',background:'#fff',color:'var(--text)',cursor:'pointer',fontSize:13,fontWeight:600}}>Cancelar</button>
              <button onClick={salvarNovaTarefa} disabled={salvandoNovaTarefa}
                style={{padding:'9px 18px',borderRadius:8,border:'none',background:'var(--blue)',color:'#fff',cursor:'pointer',fontSize:13,fontWeight:600,opacity:salvandoNovaTarefa?0.6:1}}>
                {salvandoNovaTarefa?'Salvando...':'Salvar'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
