'use client'
import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { getVisibleUserIds } from '@/lib/auth'

// Emojis mais usados
const EMOJIS = ['😀','😂','🥰','😎','🤔','👍','👏','🙏','❤️','🔥','✅','⚠️','📋','📞','💰','🚗','🏠','📅','⏰','✉️','🎉','💪','👋','😊','🤝']

const STICKERS_DEMO = [
  { id:'1', emoji:'😂', label:'Rindo' },
  { id:'2', emoji:'👍', label:'Joinha' },
  { id:'3', emoji:'❤️', label:'Coração' },
  { id:'4', emoji:'🙏', label:'Obrigado' },
  { id:'5', emoji:'🎉', label:'Parabéns' },
  { id:'6', emoji:'💪', label:'Força' },
]

// Formata telefone brasileiro: 5511999998888 -> +55 (11) 99999-8888.
// Se não parecer um telefone válido (ex: código @lid do Meta com 18+
// dígitos), retorna null para que a UI esconda em vez de mostrar lixo.
function formatarTelefone(numero?: string | null): string | null {
  if (!numero) return null
  const d = String(numero).replace(/\D/g, '')
  if (d.length < 10 || d.length > 14) return null
  // 13 dígitos com 55 → +55 (XX) 9XXXX-XXXX
  if (d.length === 13 && d.startsWith('55')) {
    return `+55 (${d.slice(2,4)}) ${d.slice(4,9)}-${d.slice(9)}`
  }
  // 12 dígitos com 55 (fixo) → +55 (XX) XXXX-XXXX
  if (d.length === 12 && d.startsWith('55')) {
    return `+55 (${d.slice(2,4)}) ${d.slice(4,8)}-${d.slice(8)}`
  }
  // 11 dígitos (DDD + celular) → (XX) 9XXXX-XXXX
  if (d.length === 11) return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`
  // 10 dígitos (DDD + fixo) → (XX) XXXX-XXXX
  if (d.length === 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`
  return `+${d}`
}

// Texto para exibir o contato: nome > telefone formatado > "Sem número".
// Nunca devolve o código @lid bruto.
function rotuloContato(c: any): string {
  if (c?.clientes?.nome) return c.clientes.nome
  if (c?.remoto_nome && !c.remoto_nome.includes('@lid')) return c.remoto_nome
  const tel = formatarTelefone(c?.remoto_numero)
  if (tel) return tel
  return 'Contato sem número'
}

export default function WhatsAppPage() {
  const supabase = createClient()
  const router   = useRouter()

  const [instancia, setInstancia]         = useState<any>(null)
  const [conversas, setConversas]         = useState<any[]>([])
  const [conversa, setConversa]           = useState<any>(null)
  const [mensagens, setMensagens]         = useState<any[]>([])
  const [textoEnvio, setTextoEnvio]       = useState('')
  const [loading, setLoading]             = useState(true)
  const [loadingQR, setLoadingQR]         = useState(false)
  const [enviando, setEnviando]           = useState(false)
  const msgFimRef  = useRef<HTMLDivElement>(null)
  const fileRef    = useRef<HTMLInputElement>(null)
  const audioRef   = useRef<HTMLInputElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder|null>(null)
  const audioChunksRef   = useRef<Blob[]>([])

  // Editar contato
  const [editandoContato, setEditandoContato] = useState(false)
  const [editNome, setEditNome]               = useState('')
  const [editNumero, setEditNumero]           = useState('')

  // Nova conversa
  const [modalNovaConversa, setModalNovaConversa]         = useState(false)
  const [novoNumero, setNovoNumero]                       = useState('')
  const [novaNomeBusca, setNovaNomeBusca]                 = useState('')
  const [clientesBusca, setClientesBusca]                 = useState<any[]>([])
  const [clienteNovaConversa, setClienteNovaConversa]     = useState<any>(null)
  const [iniciando, setIniciando]                         = useState(false)

  // Vincular cliente
  const [modalVincular, setModalVincular]   = useState(false)
  const [buscaVincular, setBuscaVincular]   = useState('')
  const [resultVincular, setResultVincular] = useState<any[]>([])

  // Mídia
  const [showEmojis, setShowEmojis]     = useState(false)
  const [showStickers, setShowStickers] = useState(false)
  const [gravandoAudio, setGravandoAudio] = useState(false)
  const [tempoGravacao, setTempoGravacao] = useState(0)
  const timerRef = useRef<any>(null)

  // Histórico
  const [salvandoHistorico, setSalvandoHistorico] = useState(false)

  // Agentes IA disponíveis (admin cadastra em /dashboard/agentes-ia)
  const [agentesIA, setAgentesIA] = useState<any[]>([])

  // Visualização do WhatsApp de outro usuário (admin → todos; líder → time).
  // Quando viewUserId !== meuUserId o envio é bloqueado (modo somente leitura).
  const [meuUserId, setMeuUserId]               = useState<string>('')
  const [profile, setProfile]                   = useState<any>(null)
  const [usuariosVisiveis, setUsuariosVisiveis] = useState<any[]>([])
  const [viewUserId, setViewUserId]             = useState<string>('')
  const somenteLeitura = !!meuUserId && !!viewUserId && viewUserId !== meuUserId

  useEffect(() => { carregarInstancia() }, [viewUserId])
  useEffect(() => {
    supabase.from('ai_agentes').select('id, nome').eq('ativo', true).order('nome').then(({ data }) => setAgentesIA(data || []))
  }, [])
  useEffect(() => { msgFimRef.current?.scrollIntoView({ behavior:'smooth' }) }, [mensagens])
  useEffect(() => {
    if (!instancia) return
    const interval = setInterval(() => {
      verificarStatus()
      if (conversa) carregarMensagens(conversa.remoto_jid)
    }, 5000)
    return () => clearInterval(interval)
  }, [instancia, conversa])

  async function carregarInstancia() {
    const { data: { user } } = await supabase.auth.getUser()
    const myId = user?.id || ''
    setMeuUserId(myId)

    // Carrega profile e lista de usuários visíveis (uma vez).
    let alvoId = viewUserId || myId
    if (!profile) {
      const { data: prof } = await supabase.from('users').select('id,nome,role').eq('id', myId).single()
      setProfile(prof)
      if (prof?.role !== 'corretor') {
        const ids = await getVisibleUserIds()
        let q = supabase.from('users').select('id,nome,role').order('nome')
        if (ids) q = q.in('id', ids)
        const { data: usrs } = await q
        setUsuariosVisiveis(usrs || [])
      }
      if (!viewUserId) { setViewUserId(myId); alvoId = myId }
    }

    // Reseta conversa ao trocar de usuário visualizado
    setConversa(null)
    setMensagens([])

    const { data } = await supabase.from('whatsapp_instancias').select('*').eq('user_id', alvoId).single()
    setInstancia(data || null)
    if (data) await carregarConversas(data.id)
    setLoading(false)
  }

  async function carregarConversas(instanciaId: string) {
    const { data } = await supabase
      .from('whatsapp_mensagens')
      .select('remoto_jid, remoto_nome, remoto_numero, conteudo, created_at, lida, direcao, cliente_id, clientes(nome)')
      .eq('instancia_id', instanciaId)
      .order('created_at', { ascending: false })
    const map: Record<string, any> = {}
    ;(data || []).forEach(m => {
      if (!map[m.remoto_jid]) map[m.remoto_jid] = { ...m, nao_lidas: 0 }
      if (!m.lida && m.direcao === 'recebida') map[m.remoto_jid].nao_lidas++
    })
    setConversas(Object.values(map))
  }

  async function carregarMensagens(jid: string) {
    if (!instancia) return
    const { data } = await supabase.from('whatsapp_mensagens').select('*').eq('instancia_id', instancia.id).eq('remoto_jid', jid).order('created_at', { ascending: true })
    setMensagens(data || [])
    await supabase.from('whatsapp_mensagens').update({ lida: true }).eq('instancia_id', instancia.id).eq('remoto_jid', jid).eq('lida', false)
  }

  async function selecionarConversa(conv: any) {
    setConversa(conv)
    setEditandoContato(false)
    setShowEmojis(false)
    setShowStickers(false)
    await carregarMensagens(conv.remoto_jid)
  }

  async function verificarStatus() {
    if (!instancia) return
    const res = await fetch('/api/whatsapp/action', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ action:'status', evo_url:instancia.evolution_url, api_key:instancia.api_key, instance:instancia.nome }) })
    const data = await res.json()
    const novoStatus = data?.instance?.state==='open'?'connected':data?.instance?.state==='close'?'disconnected':instancia.status
    if (novoStatus !== instancia.status) {
      await supabase.from('whatsapp_instancias').update({ status: novoStatus }).eq('id', instancia.id)
      setInstancia((prev: any) => ({ ...prev, status: novoStatus }))
    }
  }

  async function desconectar() {
    if (!instancia || !confirm('Desconectar WhatsApp?')) return
    await fetch('/api/whatsapp/action', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ action:'desconectar', evo_url:instancia.evolution_url, api_key:instancia.api_key, instance:instancia.nome }) })
    await supabase.from('whatsapp_instancias').update({ status:'disconnected', qrcode:null }).eq('id', instancia.id)
    setInstancia((prev: any) => ({ ...prev, status:'disconnected', qrcode:null }))
  }

  async function setAgenteWhats(agenteId: string) {
    if (!instancia) return
    const novo = agenteId || null
    await supabase.from('whatsapp_instancias').update({ agente_id: novo }).eq('id', instancia.id)
    setInstancia((p:any) => ({ ...p, agente_id: novo }))
  }

  async function toggleAgente(ativo: boolean) {
    if (!instancia) return
    if (ativo && !instancia.agente_id) { alert('Selecione um agente antes de ativar.'); return }
    await supabase.from('whatsapp_instancias').update({ agente_ativo: ativo }).eq('id', instancia.id)
    setInstancia((p:any) => ({ ...p, agente_ativo: ativo }))
  }

  async function conectarWhatsApp() {
    setLoadingQR(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoadingQR(false); return }

      let inst = instancia
      if (!inst) {
        const sug = (profile?.nome||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').split(/\s+/).filter(Boolean)[0]
        const nomeInst = (sug ? `corretor_${sug}` : `corretor_${user.id.slice(0,8)}`).replace(/[^a-z0-9_]/g,'')
        const { data: novaInst } = await supabase.from('whatsapp_instancias').upsert({
          user_id: user.id, nome: nomeInst, status: 'disconnected',
        }).select().single()
        inst = novaInst
        setInstancia(inst)
      }
      if (!inst) { setLoadingQR(false); alert('Não foi possível criar a instância no banco.'); return }

      const r1 = await fetch('/api/whatsapp/action', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ action:'criar_instancia', evo_url:inst.evolution_url, api_key:inst.api_key, instance:inst.nome }) })
      const d1 = await r1.json()
      const qr1 = d1?.base64 || d1?.qrcode?.base64
      if (qr1) {
        await supabase.from('whatsapp_instancias').update({ qrcode: qr1, status:'qrcode' }).eq('id', inst.id)
        setInstancia((p:any) => ({ ...p, qrcode: qr1, status:'qrcode' }))
        setLoadingQR(false)
        return
      }

      let ultimoErro = d1?.error || ''
      for (let i = 0; i < 10; i++) {
        const r2 = await fetch('/api/whatsapp/action', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ action:'qrcode', evo_url:inst.evolution_url, api_key:inst.api_key, instance:inst.nome }) })
        const d2 = await r2.json()
        if (d2?.base64) {
          await supabase.from('whatsapp_instancias').update({ qrcode: d2.base64, status:'qrcode' }).eq('id', inst.id)
          setInstancia((p:any) => ({ ...p, qrcode: d2.base64, status:'qrcode' }))
          setLoadingQR(false)
          return
        }
        if (d2?.error) ultimoErro = d2.error
        await new Promise(r => setTimeout(r, 3000))
      }
      setLoadingQR(false)
      alert('Não foi possível gerar o QR Code.' + (ultimoErro ? `\n\nMotivo: ${ultimoErro}` : '\n\nVerifique se a Evolution API está acessível.'))
    } catch (err: any) {
      setLoadingQR(false)
      alert('Erro: ' + (err?.message || 'desconhecido'))
    }
  }

  // Salvar mensagem no banco
  async function salvarMensagemBanco(conteudo: string, tipo = 'text') {
    if (!conversa || !instancia) return
    await supabase.from('whatsapp_mensagens').insert({
      instancia_id: instancia.id, cliente_id: conversa.cliente_id||null,
      remoto_jid: conversa.remoto_jid, remoto_numero: conversa.remoto_numero,
      remoto_nome: conversa.remoto_nome, conteudo, tipo, direcao:'enviada', lida:true,
    })
    await carregarMensagens(conversa.remoto_jid)
  }

  // Enviar texto
  async function enviarMensagem() {
    if (somenteLeitura) return
    if (!textoEnvio.trim() || !conversa || !instancia) return
    setEnviando(true)
    setShowEmojis(false)
    const res = await fetch('/api/whatsapp/action', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ action:'enviar', evo_url:instancia.evolution_url, api_key:instancia.api_key, instance:instancia.nome, numero:conversa.remoto_jid, mensagem:textoEnvio }) })
    const data = await res.json()
    if (!data.error) { await salvarMensagemBanco(textoEnvio, 'text'); setTextoEnvio('') }
    else alert('Erro ao enviar: ' + data.error)
    setEnviando(false)
  }

  // Enviar arquivo/imagem
  async function enviarArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !conversa || !instancia) return
    setEnviando(true)
    const reader = new FileReader()
    reader.onload = async () => {
      const base64 = (reader.result as string).split(',')[1]
      const res = await fetch('/api/whatsapp/action', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ action:'enviar_midia', evo_url:instancia.evolution_url, api_key:instancia.api_key, instance:instancia.nome, numero:conversa.remoto_jid, base64, mimetype:file.type, nome_arquivo:file.name, caption:'' }) })
      const data = await res.json()
      if (!data.error) await salvarMensagemBanco(`📎 ${file.name}`, file.type.startsWith('image')?'image':'document')
      else alert('Erro ao enviar arquivo: ' + data.error)
      setEnviando(false)
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  // Gravar áudio
  async function iniciarGravacao() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mr = new MediaRecorder(stream)
      mediaRecorderRef.current = mr
      audioChunksRef.current = []
      mr.ondataavailable = e => audioChunksRef.current.push(e.data)
      mr.start()
      setGravandoAudio(true)
      setTempoGravacao(0)
      timerRef.current = setInterval(() => setTempoGravacao(t => t+1), 1000)
    } catch { alert('Permissão de microfone negada') }
  }

  async function pararGravacao() {
    if (!mediaRecorderRef.current) return
    clearInterval(timerRef.current)
    setGravandoAudio(false)
    mediaRecorderRef.current.onstop = async () => {
      const blob = new Blob(audioChunksRef.current, { type:'audio/ogg; codecs=opus' })
      const reader = new FileReader()
      reader.onload = async () => {
        const base64 = (reader.result as string).split(',')[1]
        setEnviando(true)
        const res = await fetch('/api/whatsapp/action', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ action:'enviar_audio', evo_url:instancia.evolution_url, api_key:instancia.api_key, instance:instancia.nome, numero:conversa.remoto_jid, base64 }) })
        const data = await res.json()
        if (!data.error) await salvarMensagemBanco('🎵 Áudio', 'audio')
        else alert('Erro ao enviar áudio: ' + data.error)
        setEnviando(false)
      }
      reader.readAsDataURL(blob)
      mediaRecorderRef.current?.stream.getTracks().forEach(t => t.stop())
    }
    mediaRecorderRef.current.stop()
  }

  function cancelarGravacao() {
    clearInterval(timerRef.current)
    mediaRecorderRef.current?.stream.getTracks().forEach(t => t.stop())
    mediaRecorderRef.current = null
    setGravandoAudio(false)
    setTempoGravacao(0)
  }

  // Enviar sticker (emoji como texto por enquanto)
  async function enviarSticker(sticker: any) {
    if (!conversa || !instancia) return
    setShowStickers(false)
    setEnviando(true)
    const res = await fetch('/api/whatsapp/action', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ action:'enviar', evo_url:instancia.evolution_url, api_key:instancia.api_key, instance:instancia.nome, numero:conversa.remoto_jid, mensagem:sticker.emoji }) })
    const data = await res.json()
    if (!data.error) await salvarMensagemBanco(sticker.emoji, 'sticker')
    setEnviando(false)
  }

  // Registrar conversa no histórico do cliente
  async function registrarNoHistorico() {
    if (!conversa?.cliente_id) { alert('Vincule esta conversa a um cliente antes de registrar no histórico.'); return }
    setSalvandoHistorico(true)
    const ultimas = mensagens.slice(-20)
    const resumo = ultimas.map(m => `[${m.direcao==='enviada'?'Eu':rotuloContato(conversa)}] ${m.conteudo}`).join('\n')
    await supabase.from('historico').insert({
      cliente_id: conversa.cliente_id,
      tipo: 'info',
      titulo: `💬 Conversa WhatsApp — ${rotuloContato(conversa)}`,
      descricao: resumo.slice(0, 2000),
    })
    setSalvandoHistorico(false)
    alert('✅ Conversa registrada no histórico do cliente!')
  }

  // Editar contato
  async function salvarEdicaoContato() {
    if (!conversa || !instancia) return
    await supabase.from('whatsapp_mensagens').update({ remoto_nome:editNome, remoto_numero:editNumero }).eq('instancia_id', instancia.id).eq('remoto_jid', conversa.remoto_jid)
    setConversa((p: any) => ({ ...p, remoto_nome:editNome, remoto_numero:editNumero }))
    setConversas(prev => prev.map(c => c.remoto_jid===conversa.remoto_jid?{...c,remoto_nome:editNome,remoto_numero:editNumero}:c))
    setEditandoContato(false)
  }

  // Vincular cliente
  async function buscarParaVincular(q: string) {
    setBuscaVincular(q)
    if (q.length < 2) { setResultVincular([]); return }
    const { data } = await supabase.from('clientes').select('id,nome,cpf_cnpj,telefone').or(`nome.ilike.%${q}%,cpf_cnpj.ilike.%${q}%`).limit(8)
    setResultVincular(data||[])
  }

  async function vincularCliente(cliente: any) {
    if (!conversa || !instancia) return
    await supabase.from('whatsapp_mensagens').update({ cliente_id:cliente.id }).eq('instancia_id', instancia.id).eq('remoto_jid', conversa.remoto_jid)
    setConversa((p: any) => ({ ...p, cliente_id:cliente.id, clientes:{nome:cliente.nome} }))
    setConversas(prev => prev.map(c => c.remoto_jid===conversa.remoto_jid?{...c,cliente_id:cliente.id,clientes:{nome:cliente.nome}}:c))
    setModalVincular(false); setBuscaVincular(''); setResultVincular([])
  }

  // Nova conversa
  async function buscarClientesNovaConversa(q: string) {
    setNovaNomeBusca(q)
    if (q.length < 2) { setClientesBusca([]); return }
    const { data } = await supabase.from('clientes').select('id,nome,cpf_cnpj,telefone').or(`nome.ilike.%${q}%,cpf_cnpj.ilike.%${q}%,telefone.ilike.%${q}%`).limit(8)
    setClientesBusca(data||[])
  }

  function selecionarClienteNovaConversa(c: any) {
    setClienteNovaConversa(c); setNovaNomeBusca(c.nome); setClientesBusca([])
    if (c.telefone) setNovoNumero(c.telefone.replace(/\D/g,''))
  }

  async function iniciarNovaConversa() {
    if (!novoNumero.trim() || !instancia) { alert('Informe o número'); return }
    setIniciando(true)
    const numeroLimpo = novoNumero.replace(/\D/g,'')
    const jid = `${numeroLimpo}@s.whatsapp.net`
    const existente = conversas.find(c => c.remoto_jid===jid||c.remoto_numero===numeroLimpo)
    if (existente) { setModalNovaConversa(false); setNovoNumero(''); setNovaNomeBusca(''); setClienteNovaConversa(null); await selecionarConversa(existente); setIniciando(false); return }
    const novaConv = { remoto_jid:jid, remoto_numero:numeroLimpo, remoto_nome:clienteNovaConversa?.nome||novaNomeBusca||numeroLimpo, cliente_id:clienteNovaConversa?.id||null, clientes:clienteNovaConversa?{nome:clienteNovaConversa.nome}:null, conteudo:'', created_at:new Date().toISOString(), nao_lidas:0 }
    setConversas(prev=>[novaConv,...prev]); setConversa(novaConv); setMensagens([])
    setModalNovaConversa(false); setNovoNumero(''); setNovaNomeBusca(''); setClienteNovaConversa(null); setIniciando(false)
  }

  const statusCor:   Record<string,string> = { connected:'var(--teal)', disconnected:'var(--red)', qrcode:'var(--gold)', connecting:'#7aa3f8' }
  const statusLabel: Record<string,string> = { connected:'Conectado ✓', disconnected:'Desconectado', qrcode:'Aguardando QR Code', connecting:'Conectando...' }
  const inp = { width:'100%', background:'rgba(255,255,255,0.06)', border:'1px solid var(--border)', borderRadius:8, padding:'8px 12px', color:'var(--text)', fontSize:13, fontFamily:'DM Sans,sans-serif', boxSizing:'border-box' as const, outline:'none' }

  const btnIcon = (title: string, onClick: ()=>void, ativo=false) => (
    <button title={title} onClick={onClick}
      style={{width:34,height:34,borderRadius:8,border:`1px solid ${ativo?'var(--gold)':'var(--border)'}`,background:ativo?'rgba(201,168,76,0.12)':'rgba(255,255,255,0.04)',cursor:'pointer',fontSize:16,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,color:ativo?'var(--gold)':'var(--text-muted)'}}>
      {title === 'Emoji' ? '😊' : title==='Figurinha'?'🎭':title==='Arquivo'?'📎':title==='Áudio'?'🎤':''}
    </button>
  )

  const seletorUsuario = profile && profile.role !== 'corretor' ? (
    <div style={{display:'flex',alignItems:'center',gap:8}}>
      <span style={{fontSize:11,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'1px',fontWeight:600}}>
        {somenteLeitura ? '👁 Visualizando' : 'Caixa de'}
      </span>
      <select value={viewUserId} onChange={e=>setViewUserId(e.target.value)}
        title="Selecionar WhatsApp de outro usuário"
        style={{border:'1px solid var(--border)',background:somenteLeitura?'rgba(201,168,76,0.08)':'rgba(255,255,255,0.04)',color:somenteLeitura?'var(--gold)':'var(--text)',borderRadius:8,padding:'6px 10px',fontSize:12,fontWeight:600,cursor:'pointer',outline:'none'}}>
        <option value={meuUserId}>👤 Meu WhatsApp</option>
        {usuariosVisiveis.filter(u=>u.id!==meuUserId).map(u=><option key={u.id} value={u.id}>{u.nome}</option>)}
      </select>
    </div>
  ) : null

  if (loading) return <Shell topRight={seletorUsuario}><div style={{padding:40,color:'var(--text-muted)'}}>Carregando...</div></Shell>

  return (
    <Shell topRight={seletorUsuario}>
      {!instancia && !somenteLeitura && (
        <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center'}}>
          <div className="card" style={{textAlign:'center',padding:'50px 40px',maxWidth:440}}>
            <div style={{fontSize:56,marginBottom:16}}>💬</div>
            <div style={{fontFamily:'DM Serif Display,serif',fontSize:22,marginBottom:8}}>WhatsApp no CM Seguros</div>
            <div style={{fontSize:13,color:'var(--text-muted)',marginBottom:28,lineHeight:1.6}}>Conecte seu número do WhatsApp para enviar e receber mensagens diretamente do CRM.</div>
            <button className="btn-primary" style={{padding:'12px 28px',fontSize:14}} onClick={conectarWhatsApp} disabled={loadingQR}>
              {loadingQR ? 'Gerando QR Code...' : '📱 Conectar WhatsApp'}
            </button>
          </div>
        </div>
      )}
      {!instancia && somenteLeitura && (
        <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center'}}>
          <div className="card" style={{textAlign:'center',padding:'40px',maxWidth:440,color:'var(--text-muted)'}}>
            <div style={{fontSize:40,marginBottom:12}}>📭</div>
            <div style={{fontSize:14}}>Este usuário ainda não configurou o WhatsApp.</div>
          </div>
        </div>
      )}

      {instancia && (
        <div style={{flex:1,display:'flex',overflow:'hidden'}}>

          {/* Lista conversas */}
          <div style={{width:300,flexShrink:0,borderRight:'1px solid var(--border)',display:'flex',flexDirection:'column'}}>
            <div style={{padding:'14px 16px',borderBottom:'1px solid var(--border)',background:'rgba(255,255,255,0.02)'}}>
              <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
                <div style={{width:8,height:8,borderRadius:'50%',background:statusCor[instancia.status]||'var(--text-muted)'}}/>
                <span style={{fontSize:12,fontWeight:600,color:statusCor[instancia.status]||'var(--text-muted)'}}>{statusLabel[instancia.status]||instancia.status}</span>
              </div>
              {instancia.numero&&<div style={{fontSize:11,color:'var(--text-muted)',marginBottom:8}}>📱 {instancia.numero}</div>}
              <div style={{display:'flex',gap:6}}>
                {instancia.status!=='connected'&&<button onClick={conectarWhatsApp} disabled={loadingQR} style={{flex:1,fontSize:11,background:'rgba(201,168,76,0.1)',border:'1px solid rgba(201,168,76,0.3)',color:'var(--gold)',borderRadius:6,padding:'5px',cursor:'pointer',fontFamily:'DM Sans,sans-serif'}}>{loadingQR?'...':'📱 Conectar'}</button>}
                {instancia.status==='connected'&&<button onClick={desconectar} style={{flex:1,fontSize:11,background:'rgba(224,82,82,0.1)',border:'1px solid rgba(224,82,82,0.3)',color:'var(--red)',borderRadius:6,padding:'5px',cursor:'pointer',fontFamily:'DM Sans,sans-serif'}}>Desconectar</button>}
              </div>
            </div>

            {/* Agente de IA */}
            <div style={{padding:'10px 16px',borderBottom:'1px solid var(--border)',background:instancia.agente_ativo?'rgba(28,181,160,0.05)':'transparent'}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:6}}>
                <div style={{fontSize:11,fontWeight:600,color:instancia.agente_ativo?'var(--teal)':'var(--text-muted)',letterSpacing:'1px',textTransform:'uppercase'}}>
                  🤖 Agente IA
                </div>
                <label style={{position:'relative',display:'inline-block',width:34,height:18,cursor:'pointer'}}>
                  <input type="checkbox" checked={!!instancia.agente_ativo} onChange={e=>toggleAgente(e.target.checked)}
                    style={{opacity:0,width:0,height:0}} />
                  <span style={{position:'absolute',inset:0,borderRadius:18,background:instancia.agente_ativo?'var(--teal)':'rgba(255,255,255,0.1)',transition:'background 0.2s'}}>
                    <span style={{position:'absolute',top:2,left:instancia.agente_ativo?18:2,width:14,height:14,borderRadius:'50%',background:'#fff',transition:'left 0.2s'}}/>
                  </span>
                </label>
              </div>
              <select value={instancia.agente_id||''} onChange={e=>setAgenteWhats(e.target.value)}
                style={{width:'100%',padding:'5px 8px',borderRadius:6,border:'1px solid var(--border)',background:'#ffffff',color:'var(--text)',fontSize:11,cursor:'pointer'}}>
                <option value="">— selecione um agente —</option>
                {agentesIA.map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
              </select>
              {instancia.agente_ativo && instancia.agente_id && (
                <div style={{fontSize:10,color:'var(--teal)',marginTop:5}}>
                  ✓ Respondendo automaticamente
                </div>
              )}
            </div>

            <div style={{padding:'10px 16px',borderBottom:'1px solid var(--border)'}}>
              <button onClick={()=>{setModalNovaConversa(true);setNovoNumero('');setNovaNomeBusca('');setClienteNovaConversa(null);setClientesBusca([])}}
                style={{width:'100%',padding:'7px',borderRadius:8,fontSize:12,cursor:'pointer',border:'1px solid rgba(201,168,76,0.3)',background:'rgba(201,168,76,0.06)',color:'var(--gold)',fontFamily:'DM Sans,sans-serif',fontWeight:600}}>
                ✉️ Nova Conversa
              </button>
            </div>

            {instancia.status==='qrcode'&&instancia.qrcode&&(
              <div style={{padding:16,borderBottom:'1px solid var(--border)',textAlign:'center'}}>
                <div style={{fontSize:12,color:'var(--gold)',marginBottom:8,fontWeight:600}}>Escaneie com o WhatsApp</div>
                <img src={instancia.qrcode} alt="QR Code" style={{width:'100%',maxWidth:200,borderRadius:8}}/>
                <div style={{fontSize:11,color:'var(--text-muted)',marginTop:6}}>WhatsApp → Aparelhos conectados → Conectar</div>
              </div>
            )}

            <div style={{flex:1,overflowY:'auto'}}>
              {conversas.length===0&&<div style={{padding:20,textAlign:'center',color:'var(--text-muted)',fontSize:13}}>{instancia.status==='connected'?'Nenhuma conversa ainda':'Conecte o WhatsApp'}</div>}
              {conversas.map(conv=>(
                <div key={conv.remoto_jid} onClick={()=>selecionarConversa(conv)}
                  style={{padding:'12px 16px',cursor:'pointer',borderBottom:'1px solid rgba(255,255,255,0.04)',background:conversa?.remoto_jid===conv.remoto_jid?'rgba(201,168,76,0.08)':'transparent',transition:'background 0.15s'}}>
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:3}}>
                    <div style={{fontWeight:500,fontSize:13,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',flex:1}}>
                      {rotuloContato(conv)}
                    </div>
                    {conv.nao_lidas>0&&<span style={{background:'var(--teal)',color:'#fff',fontSize:10,fontWeight:700,borderRadius:10,padding:'1px 6px',flexShrink:0}}>{conv.nao_lidas}</span>}
                  </div>
                  {formatarTelefone(conv.remoto_numero) && rotuloContato(conv) !== formatarTelefone(conv.remoto_numero) && (
                    <div style={{fontSize:10,color:'var(--text-muted)',marginBottom:2}}>📱 {formatarTelefone(conv.remoto_numero)}</div>
                  )}
                  <div style={{fontSize:11,color:'var(--text-muted)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{conv.conteudo}</div>
                  <div style={{fontSize:10,color:'var(--text-muted)',marginTop:2}}>{new Date(conv.created_at).toLocaleDateString('pt-BR')}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Chat */}
          <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
            {!conversa ? (
              <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',color:'var(--text-muted)'}}>
                <div style={{textAlign:'center'}}><div style={{fontSize:40,marginBottom:8}}>💬</div><div>Selecione uma conversa</div></div>
              </div>
            ) : (
              <>
                {/* Header */}
                <div style={{padding:'12px 20px',borderBottom:'1px solid var(--border)',background:'rgba(255,255,255,0.02)'}}>
                  {editandoContato ? (
                    <div style={{display:'flex',gap:10,alignItems:'center'}}>
                      <div style={{flex:1,display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                        <input value={editNome} onChange={e=>setEditNome(e.target.value)} placeholder="Nome" style={{...inp,padding:'6px 10px',fontSize:12}} />
                        <input value={editNumero} onChange={e=>setEditNumero(e.target.value)} placeholder="Número" style={{...inp,padding:'6px 10px',fontSize:12}} />
                      </div>
                      <button onClick={salvarEdicaoContato} style={{padding:'6px 14px',borderRadius:8,fontSize:12,cursor:'pointer',border:'none',background:'var(--teal)',color:'#fff',fontFamily:'DM Sans,sans-serif',fontWeight:600,flexShrink:0}}>✓</button>
                      <button onClick={()=>setEditandoContato(false)} style={{padding:'6px 10px',borderRadius:8,fontSize:12,cursor:'pointer',border:'1px solid var(--border)',background:'transparent',color:'var(--text-muted)',fontFamily:'DM Sans,sans-serif',flexShrink:0}}>✕</button>
                    </div>
                  ) : (
                    <div style={{display:'flex',alignItems:'center',gap:12}}>
                      <div style={{width:36,height:36,borderRadius:'50%',background:'linear-gradient(135deg,var(--gold),var(--teal))',display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,fontWeight:700,color:'var(--navy)',flexShrink:0}}>
                        {rotuloContato(conversa)[0].toUpperCase()}
                      </div>
                      <div style={{flex:1}}>
                        <div style={{fontWeight:600,fontSize:14}}>{rotuloContato(conversa)}</div>
                        <div style={{fontSize:11,color:'var(--text-muted)'}}>📱 {formatarTelefone(conversa.remoto_numero) || 'número não disponível'}</div>
                      </div>
                      <div style={{display:'flex',gap:6,flexWrap:'wrap',justifyContent:'flex-end'}}>
                        <button onClick={()=>{setEditandoContato(true);setEditNome(conversa.remoto_nome||'');setEditNumero(conversa.remoto_numero||'')}}
                          style={{fontSize:11,background:'rgba(255,255,255,0.05)',border:'1px solid var(--border)',color:'var(--text-muted)',borderRadius:6,padding:'5px 10px',cursor:'pointer',fontFamily:'DM Sans,sans-serif'}}>✏️ Editar</button>
                        {conversa.cliente_id ? (
                          <>
                            <button onClick={()=>router.push(`/dashboard/clientes/${conversa.cliente_id}`)}
                              style={{fontSize:11,background:'rgba(201,168,76,0.1)',border:'1px solid rgba(201,168,76,0.3)',color:'var(--gold)',borderRadius:6,padding:'5px 10px',cursor:'pointer',fontFamily:'DM Sans,sans-serif'}}>Ver ficha →</button>
                            <button onClick={registrarNoHistorico} disabled={salvandoHistorico}
                              style={{fontSize:11,background:'rgba(28,181,160,0.08)',border:'1px solid rgba(28,181,160,0.3)',color:'var(--teal)',borderRadius:6,padding:'5px 10px',cursor:'pointer',fontFamily:'DM Sans,sans-serif'}}>
                              {salvandoHistorico?'Salvando...':'📋 Registrar no histórico'}
                            </button>
                          </>
                        ) : (
                          <button onClick={()=>{setModalVincular(true);setBuscaVincular('');setResultVincular([])}}
                            style={{fontSize:11,background:'rgba(28,181,160,0.08)',border:'1px solid rgba(28,181,160,0.3)',color:'var(--teal)',borderRadius:6,padding:'5px 10px',cursor:'pointer',fontFamily:'DM Sans,sans-serif'}}>
                            👤 Vincular cliente
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Mensagens */}
                <div style={{flex:1,overflowY:'auto',padding:'16px 20px',display:'flex',flexDirection:'column',gap:8}} onClick={()=>{setShowEmojis(false);setShowStickers(false)}}>
                  {mensagens.map(m=>(
                    <div key={m.id} style={{display:'flex',justifyContent:m.direcao==='enviada'?'flex-end':'flex-start'}}>
                      <div style={{maxWidth:'70%',padding:'8px 12px',borderRadius:m.direcao==='enviada'?'12px 12px 4px 12px':'12px 12px 12px 4px',background:m.direcao==='enviada'?'#dcf8c6':'#ffffff',color:'#1a1a2e',border:`1px solid ${m.direcao==='enviada'?'#bcdc99':'#e5e7eb'}`,boxShadow:'0 1px 1px rgba(0,0,0,0.06)'}}>
                        <MidiaMensagem m={m} />
                        {m.conteudo && (m.tipo==='text' || m.tipo==='sticker' || m.tipo==='document' || !['📷 Imagem','🎬 Vídeo','🎵 Áudio'].includes(m.conteudo)) && (
                          <div style={{fontSize:13,lineHeight:1.5,marginTop:m.midia_url?6:0}}>{m.conteudo}</div>
                        )}
                        <div style={{fontSize:10,color:'var(--text-muted)',marginTop:4,textAlign:'right'}}>
                          {new Date(m.created_at).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}
                          {m.direcao==='enviada'&&' ✓'}
                        </div>
                      </div>
                    </div>
                  ))}
                  <div ref={msgFimRef}/>
                </div>

                {/* Painel emoji */}
                {showEmojis && (
                  <div style={{padding:'10px 16px',borderTop:'1px solid var(--border)',background:'#ffffff',display:'flex',flexWrap:'wrap',gap:6}}>
                    {EMOJIS.map(e=>(
                      <button key={e} onClick={()=>setTextoEnvio(t=>t+e)}
                        style={{background:'none',border:'none',fontSize:22,cursor:'pointer',borderRadius:6,padding:'4px',transition:'transform 0.1s'}}
                        onMouseEnter={el=>(el.currentTarget.style.transform='scale(1.3)')}
                        onMouseLeave={el=>(el.currentTarget.style.transform='')}>
                        {e}
                      </button>
                    ))}
                  </div>
                )}

                {/* Painel stickers */}
                {showStickers && (
                  <div style={{padding:'10px 16px',borderTop:'1px solid var(--border)',background:'#ffffff',display:'flex',flexWrap:'wrap',gap:8}}>
                    {STICKERS_DEMO.map(s=>(
                      <button key={s.id} onClick={()=>enviarSticker(s)}
                        style={{background:'rgba(255,255,255,0.05)',border:'1px solid var(--border)',borderRadius:10,padding:'8px 12px',cursor:'pointer',fontSize:24,display:'flex',flexDirection:'column',alignItems:'center',gap:2}}
                        title={s.label}>
                        {s.emoji}
                        <span style={{fontSize:9,color:'var(--text-muted)'}}>{s.label}</span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Input área */}
                {somenteLeitura ? (
                  <div style={{padding:'12px 20px',borderTop:'1px solid var(--border)',background:'rgba(201,168,76,0.06)',display:'flex',alignItems:'center',gap:8,fontSize:12,color:'var(--gold)',justifyContent:'center'}}>
                    👁 Modo somente leitura — você está visualizando o WhatsApp de outro usuário.
                  </div>
                ) : (
                <div style={{padding:'12px 20px',borderTop:'1px solid var(--border)',background:'var(--bg-soft)'}}>
                  {gravandoAudio ? (
                    <div style={{display:'flex',alignItems:'center',gap:12}}>
                      <div style={{width:10,height:10,borderRadius:'50%',background:'var(--red)',animation:'pulse 1s infinite'}}/>
                      <span style={{fontSize:13,color:'var(--red)',fontWeight:600}}>Gravando... {tempoGravacao}s</span>
                      <div style={{flex:1}}/>
                      <button onClick={cancelarGravacao} style={{padding:'6px 14px',borderRadius:8,fontSize:12,cursor:'pointer',border:'1px solid rgba(224,82,82,0.3)',background:'rgba(224,82,82,0.08)',color:'var(--red)',fontFamily:'DM Sans,sans-serif'}}>✕ Cancelar</button>
                      <button onClick={pararGravacao} style={{padding:'6px 14px',borderRadius:8,fontSize:12,cursor:'pointer',border:'none',background:'var(--teal)',color:'#fff',fontFamily:'DM Sans,sans-serif',fontWeight:600}}>✓ Enviar</button>
                    </div>
                  ) : (
                    <div style={{display:'flex',gap:8,alignItems:'flex-end'}}>
                      {/* Botões mídia */}
                      <div style={{display:'flex',gap:4,flexShrink:0}}>
                        {btnIcon('Emoji', ()=>{setShowEmojis(e=>!e);setShowStickers(false)}, showEmojis)}
                        {btnIcon('Figurinha', ()=>{setShowStickers(e=>!e);setShowEmojis(false)}, showStickers)}
                        <button title="Arquivo" onClick={()=>fileRef.current?.click()}
                          style={{width:34,height:34,borderRadius:8,border:'1px solid var(--border)',background:'rgba(255,255,255,0.04)',cursor:'pointer',fontSize:16,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,color:'var(--text-muted)'}}>📎</button>
                        <button title="Áudio" onClick={iniciarGravacao}
                          style={{width:34,height:34,borderRadius:8,border:'1px solid var(--border)',background:'rgba(255,255,255,0.04)',cursor:'pointer',fontSize:16,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,color:'var(--text-muted)'}}>🎤</button>
                      </div>

                      {/* Input texto */}
                      <textarea rows={1}
                        style={{flex:1,background:'rgba(255,255,255,0.05)',border:'1px solid var(--border)',borderRadius:20,padding:'10px 16px',color:'var(--text)',fontSize:13,fontFamily:'DM Sans,sans-serif',outline:'none',resize:'none',maxHeight:100,overflowY:'auto'}}
                        placeholder="Digite uma mensagem..."
                        value={textoEnvio}
                        onChange={e=>setTextoEnvio(e.target.value)}
                        onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();enviarMensagem()}}}
                      />

                      {/* Enviar */}
                      <button onClick={enviarMensagem} disabled={enviando||!textoEnvio.trim()}
                        style={{width:44,height:44,borderRadius:'50%',background:textoEnvio.trim()?'var(--gold)':'rgba(255,255,255,0.1)',border:'none',cursor:textoEnvio.trim()?'pointer':'default',fontSize:18,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,transition:'background 0.2s'}}>
                        {enviando?'⏳':'✈'}
                      </button>
                    </div>
                  )}
                </div>

                )}

                {/* Input oculto arquivo */}
                <input ref={fileRef} type="file" accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx" style={{display:'none'}} onChange={enviarArquivo} />
              </>
            )}
          </div>
        </div>
      )}

      {/* Modal Nova Conversa */}
      {modalNovaConversa&&(
        <div style={{position:'fixed',inset:0,background:'rgba(15,23,42,0.45)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',backdropFilter:'blur(6px)'}}
          onClick={e=>e.target===e.currentTarget&&setModalNovaConversa(false)}>
          <div style={{background:'#ffffff',border:'1px solid var(--border)',borderRadius:20,padding:'28px 32px',width:420,maxWidth:'95vw'}}>
            <div style={{fontFamily:'DM Serif Display,serif',fontSize:18,marginBottom:20}}>✉️ Nova Conversa</div>
            <div style={{marginBottom:14,position:'relative'}}>
              <label style={{fontSize:12,color:'var(--text-muted)',display:'block',marginBottom:4}}>Buscar cliente (opcional)</label>
              <input value={novaNomeBusca} onChange={e=>buscarClientesNovaConversa(e.target.value)} placeholder="🔍 Nome, CPF ou telefone..." style={inp} autoFocus />
              {clientesBusca.length>0&&(
                <div style={{position:'absolute',top:'100%',left:0,right:0,background:'#ffffff',border:'1px solid var(--border)',borderRadius:8,zIndex:10,marginTop:4,maxHeight:180,overflow:'auto'}}>
                  {clientesBusca.map(c=>(
                    <div key={c.id} onClick={()=>selecionarClienteNovaConversa(c)} style={{padding:'10px 14px',cursor:'pointer',borderBottom:'1px solid rgba(255,255,255,0.05)'}}
                      onMouseEnter={e=>(e.currentTarget.style.background='rgba(201,168,76,0.08)')} onMouseLeave={e=>(e.currentTarget.style.background='')}>
                      <div style={{fontSize:13,fontWeight:500}}>{c.nome}</div>
                      <div style={{fontSize:11,color:'var(--text-muted)'}}>{c.telefone||c.cpf_cnpj}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {clienteNovaConversa&&(
              <div style={{marginBottom:14,padding:'8px 12px',background:'rgba(28,181,160,0.08)',border:'1px solid rgba(28,181,160,0.3)',borderRadius:8,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <div style={{fontSize:13,fontWeight:600}}>{clienteNovaConversa.nome}</div>
                <button onClick={()=>{setClienteNovaConversa(null);setNovaNomeBusca('')}} style={{background:'none',border:'none',color:'var(--text-muted)',cursor:'pointer'}}>✕</button>
              </div>
            )}
            <div style={{marginBottom:20}}>
              <label style={{fontSize:12,color:'var(--text-muted)',display:'block',marginBottom:4}}>Número do WhatsApp *</label>
              <input value={novoNumero} onChange={e=>setNovoNumero(e.target.value)} placeholder="5511999999999" style={inp} />
              <div style={{fontSize:11,color:'var(--text-muted)',marginTop:4}}>Formato: 55 + DDD + número</div>
            </div>
            <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
              <button className="btn-secondary" onClick={()=>setModalNovaConversa(false)}>Cancelar</button>
              <button className="btn-primary" onClick={iniciarNovaConversa} disabled={iniciando||!novoNumero.trim()}>{iniciando?'Iniciando...':'✉️ Iniciar'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Vincular */}
      {modalVincular&&(
        <div style={{position:'fixed',inset:0,background:'rgba(15,23,42,0.45)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',backdropFilter:'blur(6px)'}}
          onClick={e=>e.target===e.currentTarget&&setModalVincular(false)}>
          <div style={{background:'#ffffff',border:'1px solid var(--border)',borderRadius:20,padding:'28px 32px',width:420,maxWidth:'95vw'}}>
            <div style={{fontFamily:'DM Serif Display,serif',fontSize:18,marginBottom:20}}>👤 Vincular ao Cliente</div>
            <div style={{marginBottom:16,position:'relative'}}>
              <input value={buscaVincular} onChange={e=>buscarParaVincular(e.target.value)} placeholder="🔍 Nome ou CPF..." style={inp} autoFocus />
              {resultVincular.length>0&&(
                <div style={{position:'absolute',top:'100%',left:0,right:0,background:'#ffffff',border:'1px solid var(--border)',borderRadius:8,zIndex:10,marginTop:4,maxHeight:200,overflow:'auto'}}>
                  {resultVincular.map(c=>(
                    <div key={c.id} onClick={()=>vincularCliente(c)} style={{padding:'10px 14px',cursor:'pointer',borderBottom:'1px solid rgba(255,255,255,0.05)'}}
                      onMouseEnter={e=>(e.currentTarget.style.background='rgba(201,168,76,0.08)')} onMouseLeave={e=>(e.currentTarget.style.background='')}>
                      <div style={{fontSize:13,fontWeight:500}}>{c.nome}</div>
                      <div style={{fontSize:11,color:'var(--text-muted)'}}>{c.cpf_cnpj||c.telefone}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <button className="btn-secondary" onClick={()=>setModalVincular(false)} style={{width:'100%'}}>Cancelar</button>
          </div>
        </div>
      )}

      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>
    </Shell>
  )
}

// Renderiza a mídia da mensagem (imagem, vídeo, áudio, documento, sticker).
// Resolve a signed URL do Storage sob demanda e mostra transcrição de áudio.
function MidiaMensagem({ m }: { m: any }) {
  const [url, setUrl] = useState<string | null>(null)
  const [transcricao, setTranscricao] = useState<string | null>(m.transcricao || null)
  const [transcrevendo, setTranscrevendo] = useState(false)

  useEffect(() => {
    if (!m.midia_url) return
    let cancel = false
    fetch(`/api/whatsapp/midia?path=${encodeURIComponent(m.midia_url)}`)
      .then(r => r.json())
      .then(d => { if (!cancel && d.url) setUrl(d.url) })
    return () => { cancel = true }
  }, [m.midia_url])

  useEffect(() => { setTranscricao(m.transcricao || null) }, [m.transcricao])

  async function transcreverAgora() {
    setTranscrevendo(true)
    try {
      const r = await fetch('/api/whatsapp/midia', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ mensagem_id: m.id }),
      })
      const d = await r.json()
      if (d.transcricao) setTranscricao(d.transcricao)
      else alert('Não foi possível transcrever: ' + (d.error || 'erro desconhecido'))
    } finally { setTranscrevendo(false) }
  }

  if (!m.midia_url) return null

  if (m.tipo === 'image' || m.tipo === 'sticker') {
    return url ? (
      <a href={url} target="_blank" rel="noreferrer">
        <img src={url} alt="" style={{maxWidth:260,maxHeight:280,borderRadius:8,display:'block'}} />
      </a>
    ) : <div style={{fontSize:11,color:'var(--text-muted)'}}>📷 carregando imagem...</div>
  }

  if (m.tipo === 'video') {
    return url ? (
      <video src={url} controls style={{maxWidth:280,borderRadius:8,display:'block'}} />
    ) : <div style={{fontSize:11,color:'var(--text-muted)'}}>🎬 carregando vídeo...</div>
  }

  if (m.tipo === 'audio') {
    return (
      <div style={{minWidth:240}}>
        {url
          ? <audio src={url} controls style={{width:'100%'}} />
          : <div style={{fontSize:11,color:'var(--text-muted)'}}>🎵 carregando áudio...</div>}
        {transcricao ? (
          <div style={{marginTop:6,padding:'6px 8px',background:'rgba(28,181,160,0.08)',border:'1px solid rgba(28,181,160,0.25)',borderRadius:6,fontSize:12,fontStyle:'italic',color:'var(--text)'}}>
            <div style={{fontSize:10,color:'var(--teal)',fontWeight:600,marginBottom:2}}>📝 Transcrição</div>
            {transcricao}
          </div>
        ) : (
          <button onClick={transcreverAgora} disabled={transcrevendo}
            style={{marginTop:6,fontSize:11,background:'rgba(255,255,255,0.06)',border:'1px solid var(--border)',color:'var(--text-muted)',borderRadius:6,padding:'4px 10px',cursor:'pointer'}}>
            {transcrevendo ? 'Transcrevendo...' : '📝 Transcrever áudio'}
          </button>
        )}
      </div>
    )
  }

  if (m.tipo === 'document') {
    return url ? (
      <a href={url} target="_blank" rel="noreferrer"
        style={{display:'flex',alignItems:'center',gap:8,padding:'8px 10px',background:'rgba(255,255,255,0.04)',border:'1px solid var(--border)',borderRadius:8,textDecoration:'none',color:'var(--text)',minWidth:220}}>
        <span style={{fontSize:24}}>📄</span>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:12,fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{m.midia_nome || 'Documento'}</div>
          <div style={{fontSize:10,color:'var(--text-muted)'}}>{m.midia_mimetype || 'arquivo'}</div>
        </div>
      </a>
    ) : <div style={{fontSize:11,color:'var(--text-muted)'}}>📄 carregando arquivo...</div>
  }

  return null
}

function Shell({ children, topRight }: { children: React.ReactNode; topRight?: React.ReactNode }) {
  return (
    <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
      <div style={{height:56,borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',padding:'0 28px',gap:16,background:'var(--bg-soft)',backdropFilter:'blur(8px)',position:'sticky',top:0,zIndex:5,flexShrink:0}}>
        <div style={{fontFamily:'DM Serif Display,serif',fontSize:18,flex:1}}>💬 WhatsApp</div>
        {topRight}
      </div>
      <div style={{flex:1,display:'flex',overflow:'hidden'}}>{children}</div>
    </div>
  )
}
