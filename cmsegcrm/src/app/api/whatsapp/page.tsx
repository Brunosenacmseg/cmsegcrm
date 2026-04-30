'use client'
import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

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
  const [modalConfig, setModalConfig]     = useState(false)
  const [enviando, setEnviando]           = useState(false)
  const [config, setConfig]               = useState({ evo_url:'', api_key:'', nome:'' })
  const msgFimRef = useRef<HTMLDivElement>(null)

  useEffect(() => { carregarInstancia() }, [])
  useEffect(() => { msgFimRef.current?.scrollIntoView({ behavior:'smooth' }) }, [mensagens])

  // Polling de status e mensagens
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
    const { data } = await supabase
      .from('whatsapp_instancias')
      .select('*')
      .eq('user_id', user?.id)
      .single()
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

    // Agrupar por conversa (último msg de cada contato)
    const map: Record<string, any> = {}
    ;(data || []).forEach(m => {
      if (!map[m.remoto_jid]) map[m.remoto_jid] = { ...m, nao_lidas: 0 }
      if (!m.lida && m.direcao === 'recebida') map[m.remoto_jid].nao_lidas++
    })
    setConversas(Object.values(map))
  }

  async function carregarMensagens(jid: string) {
    if (!instancia) return
    const { data } = await supabase
      .from('whatsapp_mensagens')
      .select('*')
      .eq('instancia_id', instancia.id)
      .eq('remoto_jid', jid)
      .order('created_at', { ascending: true })
    setMensagens(data || [])

    // Marcar como lidas
    await supabase.from('whatsapp_mensagens')
      .update({ lida: true })
      .eq('instancia_id', instancia.id)
      .eq('remoto_jid', jid)
      .eq('lida', false)
  }

  async function selecionarConversa(conv: any) {
    setConversa(conv)
    await carregarMensagens(conv.remoto_jid)
  }

  async function verificarStatus() {
    if (!instancia) return
    const res = await fetch('/api/whatsapp/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action:'status', evo_url:instancia.evolution_url, api_key:instancia.api_key, instance:instancia.nome })
    })
    const data = await res.json()
    const novoStatus = data?.instance?.state === 'open' ? 'connected'
                     : data?.instance?.state === 'close' ? 'disconnected'
                     : instancia.status
    if (novoStatus !== instancia.status) {
      await supabase.from('whatsapp_instancias').update({ status: novoStatus }).eq('id', instancia.id)
      setInstancia((prev: any) => ({ ...prev, status: novoStatus }))
    }
  }

  async function gerarQRCode() {
    if (!instancia) return
    setLoadingQR(true)
    
    // Tentar até 10 vezes com intervalo de 3 segundos
    for (let i = 0; i < 10; i++) {
      const res = await fetch('/api/whatsapp/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action:'qrcode', evo_url:instancia.evolution_url, api_key:instancia.api_key, instance:instancia.nome })
      })
      const data = await res.json()
      
      if (data?.base64) {
        await supabase.from('whatsapp_instancias').update({ qrcode: data.base64, status:'qrcode' }).eq('id', instancia.id)
        setInstancia((prev: any) => ({ ...prev, qrcode: data.base64, status:'qrcode' }))
        setLoadingQR(false)
        return
      }
      
      // Aguardar 3 segundos antes de tentar novamente
      await new Promise(r => setTimeout(r, 3000))
    }
    
    setLoadingQR(false)
    alert('Não foi possível gerar o QR Code. Verifique se a Evolution API está rodando.')
  }

  async function desconectar() {
    if (!instancia || !confirm('Desconectar WhatsApp?')) return
    await fetch('/api/whatsapp/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action:'desconectar', evo_url:instancia.evolution_url, api_key:instancia.api_key, instance:instancia.nome })
    })
    await supabase.from('whatsapp_instancias').update({ status:'disconnected', qrcode:null }).eq('id', instancia.id)
    setInstancia((prev: any) => ({ ...prev, status:'disconnected', qrcode:null }))
  }

  async function salvarConfig() {
    const { data: { user } } = await supabase.auth.getUser()
    const nomeInst = config.nome || `corretor_${user?.id?.slice(0,8)}`

    // Salvar no banco primeiro
    const { data: inst } = await supabase.from('whatsapp_instancias').upsert({
      user_id:       user?.id,
      nome:          nomeInst,
      evolution_url: config.evo_url,
      api_key:       config.api_key,
      status:        'disconnected',
    }).select().single()

    setInstancia(inst)
    setModalConfig(false)

    // Criar instância na Evolution API via server-side
    const res = await fetch('/api/whatsapp/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action:'criar_instancia', evo_url:config.evo_url, api_key:config.api_key, instance:nomeInst })
    })
    const data = await res.json()
    if (data?.qrcode?.base64) {
      await supabase.from('whatsapp_instancias').update({ qrcode: data.qrcode.base64, status:'qrcode' }).eq('id', inst.id)
      setInstancia((prev: any) => ({ ...prev, qrcode: data.qrcode.base64, status:'qrcode' }))
    }
  }

  async function enviarMensagem() {
    if (!textoEnvio.trim() || !conversa || !instancia) return
    setEnviando(true)

    const res = await fetch('/api/whatsapp/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action:'enviar', evo_url:instancia.evolution_url,
        api_key:instancia.api_key, instance:instancia.nome,
        numero:conversa.remoto_numero, mensagem:textoEnvio
      })
    })
    const data = await res.json()
    if (!data.error) {
      await supabase.from('whatsapp_mensagens').insert({
        instancia_id:  instancia.id,
        cliente_id:    conversa.cliente_id || null,
        remoto_jid:    conversa.remoto_jid,
        remoto_numero: conversa.remoto_numero,
        remoto_nome:   conversa.remoto_nome,
        conteudo:      textoEnvio,
        direcao:       'enviada',
        lida:          true,
      })
      setTextoEnvio('')
      await carregarMensagens(conversa.remoto_jid)
    }
    setEnviando(false)
  }

  const statusCor: Record<string,string> = { connected:'var(--teal)', disconnected:'var(--red)', qrcode:'var(--gold)', connecting:'#7aa3f8' }
  const statusLabel: Record<string,string> = { connected:'Conectado ✅', disconnected:'Desconectado', qrcode:'Aguardando QR Code', connecting:'Conectando...' }

  if (loading) return <Shell><div style={{padding:40,color:'var(--text-muted)'}}>Carregando...</div></Shell>

  return (
    <Shell>
      {/* Sem instância configurada */}
      {!instancia && (
        <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center'}}>
          <div className="card" style={{textAlign:'center',padding:'50px 40px',maxWidth:440}}>
            <div style={{fontSize:56,marginBottom:16}}>💬</div>
            <div style={{fontFamily:'DM Serif Display,serif',fontSize:22,marginBottom:8}}>WhatsApp no CM.segCRM</div>
            <div style={{fontSize:13,color:'var(--text-muted)',marginBottom:28,lineHeight:1.6}}>
              Conecte seu número do WhatsApp para enviar e receber mensagens diretamente do CRM, vinculadas aos seus clientes.
            </div>
            <button className="btn-primary" style={{padding:'12px 28px',fontSize:14}} onClick={()=>setModalConfig(true)}>
              🔗 Configurar WhatsApp
            </button>
          </div>
        </div>
      )}

      {/* Com instância */}
      {instancia && (
        <div style={{flex:1,display:'flex',overflow:'hidden'}}>

          {/* Coluna esquerda — lista de conversas */}
          <div style={{width:300,flexShrink:0,borderRight:'1px solid var(--border)',display:'flex',flexDirection:'column'}}>
            {/* Status do número */}
            <div style={{padding:'14px 16px',borderBottom:'1px solid var(--border)',background:'rgba(255,255,255,0.02)'}}>
              <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
                <div style={{width:8,height:8,borderRadius:'50%',background:statusCor[instancia.status]||'var(--text-muted)'}}/>
                <span style={{fontSize:12,fontWeight:600,color:statusCor[instancia.status]||'var(--text-muted)'}}>{statusLabel[instancia.status]||instancia.status}</span>
              </div>
              {instancia.numero && <div style={{fontSize:11,color:'var(--text-muted)',marginBottom:8}}>📱 {instancia.numero}</div>}
              <div style={{display:'flex',gap:6}}>
                {instancia.status !== 'connected' && (
                  <button onClick={gerarQRCode} disabled={loadingQR} style={{flex:1,fontSize:11,background:'rgba(201,168,76,0.1)',border:'1px solid rgba(201,168,76,0.3)',color:'var(--gold)',borderRadius:6,padding:'5px',cursor:'pointer',fontFamily:'DM Sans,sans-serif'}}>
                    {loadingQR ? '...' : '📱 Conectar'}
                  </button>
                )}
                {instancia.status === 'connected' && (
                  <button onClick={desconectar} style={{flex:1,fontSize:11,background:'rgba(224,82,82,0.1)',border:'1px solid rgba(224,82,82,0.3)',color:'var(--red)',borderRadius:6,padding:'5px',cursor:'pointer',fontFamily:'DM Sans,sans-serif'}}>
                    Desconectar
                  </button>
                )}
                <button onClick={()=>setModalConfig(true)} style={{fontSize:11,background:'rgba(255,255,255,0.05)',border:'1px solid var(--border)',color:'var(--text-muted)',borderRadius:6,padding:'5px 8px',cursor:'pointer',fontFamily:'DM Sans,sans-serif'}}>⚙️</button>
              </div>
            </div>

            {/* QR Code */}
            {instancia.status === 'qrcode' && instancia.qrcode && (
              <div style={{padding:16,borderBottom:'1px solid var(--border)',textAlign:'center'}}>
                <div style={{fontSize:12,color:'var(--gold)',marginBottom:8,fontWeight:600}}>Escaneie com o WhatsApp</div>
                <img src={instancia.qrcode} alt="QR Code" style={{width:'100%',maxWidth:200,borderRadius:8}} />
                <div style={{fontSize:11,color:'var(--text-muted)',marginTop:6}}>WhatsApp → Aparelhos conectados → Conectar</div>
              </div>
            )}

            {/* Lista de conversas */}
            <div style={{flex:1,overflowY:'auto'}}>
              {conversas.length === 0 && (
                <div style={{padding:20,textAlign:'center',color:'var(--text-muted)',fontSize:13}}>
                  {instancia.status === 'connected' ? 'Nenhuma conversa ainda' : 'Conecte o WhatsApp para ver conversas'}
                </div>
              )}
              {conversas.map(conv => (
                <div key={conv.remoto_jid} onClick={()=>selecionarConversa(conv)}
                  style={{padding:'12px 16px',cursor:'pointer',borderBottom:'1px solid rgba(255,255,255,0.04)',
                    background:conversa?.remoto_jid===conv.remoto_jid?'rgba(201,168,76,0.08)':'transparent',
                    transition:'background 0.15s'}}>
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:3}}>
                    <div style={{fontWeight:500,fontSize:13,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',flex:1}}>
                      {conv.clientes?.nome || conv.remoto_nome || conv.remoto_numero}
                    </div>
                    {conv.nao_lidas > 0 && (
                      <span style={{background:'var(--teal)',color:'#fff',fontSize:10,fontWeight:700,borderRadius:10,padding:'1px 6px',flexShrink:0}}>{conv.nao_lidas}</span>
                    )}
                  </div>
                  <div style={{fontSize:11,color:'var(--text-muted)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{conv.conteudo}</div>
                  <div style={{fontSize:10,color:'var(--text-muted)',marginTop:2}}>{new Date(conv.created_at).toLocaleDateString('pt-BR')}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Área de chat */}
          <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
            {!conversa ? (
              <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',color:'var(--text-muted)'}}>
                <div style={{textAlign:'center'}}>
                  <div style={{fontSize:40,marginBottom:8}}>💬</div>
                  <div>Selecione uma conversa</div>
                </div>
              </div>
            ) : (
              <>
                {/* Header do chat */}
                <div style={{padding:'12px 20px',borderBottom:'1px solid var(--border)',background:'rgba(255,255,255,0.02)',display:'flex',alignItems:'center',gap:12}}>
                  <div style={{width:36,height:36,borderRadius:'50%',background:'linear-gradient(135deg,var(--gold),var(--teal))',display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,fontWeight:700,color:'var(--navy)',flexShrink:0}}>
                    {(conversa.clientes?.nome||conversa.remoto_nome||'?')[0].toUpperCase()}
                  </div>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:600,fontSize:14}}>{conversa.clientes?.nome||conversa.remoto_nome||conversa.remoto_numero}</div>
                    <div style={{fontSize:11,color:'var(--text-muted)'}}>📱 {conversa.remoto_numero}</div>
                  </div>
                  {conversa.cliente_id && (
                    <button onClick={()=>router.push(`/dashboard/clientes/${conversa.cliente_id}`)}
                      style={{fontSize:11,background:'rgba(201,168,76,0.1)',border:'1px solid rgba(201,168,76,0.3)',color:'var(--gold)',borderRadius:6,padding:'5px 12px',cursor:'pointer',fontFamily:'DM Sans,sans-serif'}}>
                      Ver ficha →
                    </button>
                  )}
                </div>

                {/* Mensagens */}
                <div style={{flex:1,overflowY:'auto',padding:'16px 20px',display:'flex',flexDirection:'column',gap:8}}>
                  {mensagens.map(m => (
                    <div key={m.id} style={{display:'flex',justifyContent:m.direcao==='enviada'?'flex-end':'flex-start'}}>
                      <div style={{
                        maxWidth:'70%',padding:'8px 12px',borderRadius:m.direcao==='enviada'?'12px 12px 4px 12px':'12px 12px 12px 4px',
                        background:m.direcao==='enviada'?'rgba(201,168,76,0.15)':'rgba(255,255,255,0.06)',
                        border:`1px solid ${m.direcao==='enviada'?'rgba(201,168,76,0.25)':'rgba(255,255,255,0.08)'}`,
                      }}>
                        <div style={{fontSize:13,color:'var(--text)',lineHeight:1.4}}>{m.conteudo}</div>
                        <div style={{fontSize:10,color:'var(--text-muted)',marginTop:4,textAlign:'right'}}>
                          {new Date(m.created_at).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}
                          {m.direcao==='enviada'&&' ✓'}
                        </div>
                      </div>
                    </div>
                  ))}
                  <div ref={msgFimRef}/>
                </div>

                {/* Input de envio */}
                <div style={{padding:'12px 20px',borderTop:'1px solid var(--border)',display:'flex',gap:10,alignItems:'center'}}>
                  <input
                    style={{flex:1,background:'rgba(255,255,255,0.05)',border:'1px solid var(--border)',borderRadius:24,padding:'10px 16px',color:'var(--text)',fontSize:13,fontFamily:'DM Sans,sans-serif',outline:'none'}}
                    placeholder={instancia.status==='connected'?'Digite uma mensagem...':'Conecte o WhatsApp para enviar'}
                    value={textoEnvio}
                    onChange={e=>setTextoEnvio(e.target.value)}
                    onKeyDown={e=>e.key==='Enter'&&!e.shiftKey&&enviarMensagem()}
                    disabled={instancia.status!=='connected'}
                  />
                  <button onClick={enviarMensagem} disabled={enviando||!textoEnvio.trim()||instancia.status!=='connected'}
                    style={{width:40,height:40,borderRadius:'50%',background:textoEnvio.trim()&&instancia.status==='connected'?'var(--gold)':'rgba(255,255,255,0.1)',border:'none',cursor:'pointer',fontSize:18,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,transition:'background 0.15s'}}>
                    {enviando?'⏳':'➤'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Modal de configuração */}
      {modalConfig && (
        <div style={{position:'fixed',inset:0,background:'rgba(5,12,26,0.8)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',backdropFilter:'blur(4px)'}}
          onClick={e=>e.target===e.currentTarget&&setModalConfig(false)}>
          <div style={{background:'#0e2040',border:'1px solid var(--border)',borderRadius:18,padding:'30px 32px',width:480,maxWidth:'95vw'}}>
            <div style={{fontFamily:'DM Serif Display,serif',fontSize:20,color:'var(--gold)',marginBottom:6}}>Configurar WhatsApp</div>
            <div style={{fontSize:12,color:'var(--text-muted)',marginBottom:20}}>Informe os dados da Evolution API instalada no seu VPS.</div>

            {[
              {label:'URL do VPS (Evolution API)',key:'evo_url',ph:'http://SEU-IP:8080'},
              {label:'API Key',key:'api_key',ph:'sua-chave-secreta'},
              {label:'Nome da instância',key:'nome',ph:'corretor_bruno'},
            ].map(({label,key,ph})=>(
              <div key={key} style={{marginBottom:14}}>
                <label className="label">{label}</label>
                <input className="input" placeholder={ph} value={(config as any)[key]}
                  onChange={e=>setConfig(c=>({...c,[key]:e.target.value}))} />
              </div>
            ))}

            <div style={{background:'rgba(74,128,240,0.07)',border:'1px solid rgba(74,128,240,0.2)',borderRadius:10,padding:'12px 16px',marginBottom:20,fontSize:12,color:'var(--text-muted)'}}>
              💡 A URL é o IP do seu VPS seguido de :8080. Ex: http://123.45.67.89:8080
            </div>

            <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
              <button className="btn-secondary" onClick={()=>setModalConfig(false)}>Cancelar</button>
              <button className="btn-primary" onClick={salvarConfig} disabled={!config.evo_url||!config.api_key}>
                💾 Salvar e Conectar
              </button>
            </div>
          </div>
        </div>
      )}
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
      <div style={{height:56,borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',padding:'0 28px',gap:16,background:'rgba(10,22,40,0.7)',backdropFilter:'blur(8px)',position:'sticky',top:0,zIndex:5,flexShrink:0}}>
        <div style={{fontFamily:'DM Serif Display,serif',fontSize:18,flex:1}}>💬 WhatsApp</div>
      </div>
      <div style={{flex:1,display:'flex',overflow:'hidden'}}>{children}</div>
    </div>
  )
}
