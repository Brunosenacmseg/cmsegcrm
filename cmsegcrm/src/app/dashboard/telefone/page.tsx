'use client'
import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'

const GOTO_AUTH_URL = 'https://authentication.logmeininc.com/oauth/authorize'
const GOTO_CLIENT_ID = process.env.NEXT_PUBLIC_GOTO_CLIENT_ID || '80293cbb-2cb4-44a2-92f5-1e69c02e6fca'
const GOTO_REDIRECT_URI = process.env.NEXT_PUBLIC_APP_URL
  ? `${process.env.NEXT_PUBLIC_APP_URL}/api/goto/callback`
  : 'https://cmsegcrm.vercel.app/api/goto/callback'

function formatDuracao(seg: number) {
  if (!seg) return '—'
  const m = Math.floor(seg / 60)
  const s = seg % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function formatTel(n: string) {
  if (!n) return '—'
  const d = n.replace(/\D/g, '')
  if (d.length === 13) return `+${d.slice(0,2)} (${d.slice(2,4)}) ${d.slice(4,9)}-${d.slice(9)}`
  if (d.length === 11) return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`
  return n
}

export default function TelefonePage() {
  const supabase = createClient()
  const router = useRouter()
  const searchParams = useSearchParams()

  const [profile, setProfile]             = useState<any>(null)
  const [conectado, setConectado]         = useState(false)
  const [ligacoes, setLigacoes]           = useState<any[]>([])
  const [emAndamento, setEmAndamento]     = useState<any[]>([])
  const [clientes, setClientes]           = useState<any[]>([])
  const [loading, setLoading]             = useState(true)
  const [discando, setDiscando]           = useState(false)
  const [numero, setNumero]               = useState('')
  const [buscaCliente, setBuscaCliente]   = useState('')
  const [clientesBusca, setClientesBusca] = useState<any[]>([])
  const [clienteSel, setClienteSel]       = useState<any>(null)
  const [aba, setAba]                     = useState<'discador'|'historico'|'andamento'>('discador')
  const [msg, setMsg]                     = useState('')
  const [tempoLigacao, setTempoLigacao]   = useState(0)
  const [ligacaoAtiva, setLigacaoAtiva]   = useState<any>(null)
  const timerRef = useRef<any>(null)

  useEffect(() => { init() }, [])

  useEffect(() => {
    const c = searchParams.get('conectado')
    const e = searchParams.get('erro')
    if (c) setMsg('✅ GoTo Connect conectado com sucesso!')
    if (e) setMsg(`❌ Erro ao conectar: ${e}`)
  }, [searchParams])

  async function init() {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: prof } = await supabase.from('users').select('*').eq('id', user?.id||'').single()
    setProfile(prof)
    await verificarConexao(user?.id||'')
    await carregarLigacoes(user?.id||'')
    setLoading(false)
  }

  async function verificarConexao(userId: string) {
    const res = await fetch('/api/goto/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'status', user_id: userId })
    })
    const data = await res.json()
    setConectado(!!data.conectado)
  }

  async function carregarLigacoes(userId: string) {
    const res = await fetch('/api/goto/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'listar_ligacoes', user_id: userId })
    })
    const data = await res.json()
    setLigacoes(data.ligacoes || [])

    const res2 = await fetch('/api/goto/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'ligacoes_em_andamento', user_id: userId })
    })
    const data2 = await res2.json()
    setEmAndamento(data2.ligacoes || [])
  }

  function conectarGoTo() {
    const url = `${GOTO_AUTH_URL}?` + new URLSearchParams({
      client_id: GOTO_CLIENT_ID,
      response_type: 'code',
      redirect_uri: GOTO_REDIRECT_URI,
      state: profile?.id || '',
    }).toString()
    window.location.href = url
  }

  async function buscarClientes(q: string) {
    setBuscaCliente(q)
    if (q.length < 2) { setClientesBusca([]); return }
    const { data } = await supabase.from('clientes').select('id,nome,telefone,cpf_cnpj').or(`nome.ilike.%${q}%,telefone.ilike.%${q}%,cpf_cnpj.ilike.%${q}%`).limit(6)
    setClientesBusca(data||[])
  }

  function selecionarCliente(c: any) {
    setClienteSel(c)
    setBuscaCliente(c.nome)
    setClientesBusca([])
    if (c.telefone) setNumero(c.telefone.replace(/\D/g,''))
  }

  async function ligar() {
    if (!numero.trim()) { setMsg('Informe um número'); return }
    if (!conectado) { setMsg('Conecte o GoTo Connect primeiro'); return }
    setDiscando(true)
    setMsg('')

    // Salvar ligação no banco
    const { data: novaLig } = await supabase.from('ligacoes').insert({
      user_id: profile?.id,
      cliente_id: clienteSel?.id || null,
      numero_destino: numero,
      nome_contato: clienteSel?.nome || numero,
      direcao: 'sainte',
      status: 'iniciada',
    }).select().single()

    setLigacaoAtiva(novaLig)
    setTempoLigacao(0)
    timerRef.current = setInterval(() => setTempoLigacao(t => t+1), 1000)

    const res = await fetch('/api/goto/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'ligar', user_id: profile?.id, numero })
    })
    const data = await res.json()

    if (data.error) {
      setMsg('❌ Erro ao ligar: ' + data.error)
      clearInterval(timerRef.current)
      setLigacaoAtiva(null)
      if (novaLig) await supabase.from('ligacoes').update({ status: 'erro' }).eq('id', novaLig.id)
    } else {
      setMsg('📞 Ligação iniciada!')
      await supabase.from('ligacoes').update({
        status: 'em_andamento',
        goto_call_id: data.callId || data.id || '',
      }).eq('id', novaLig?.id)
    }

    setDiscando(false)
    await carregarLigacoes(profile?.id)
  }

  async function encerrarLigacao() {
    clearInterval(timerRef.current)
    if (ligacaoAtiva) {
      await fetch('/api/goto/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'encerrar_ligacao', user_id: profile?.id, ligacao_id: ligacaoAtiva.id, duracao_seg: tempoLigacao })
      })
    }
    setLigacaoAtiva(null)
    setTempoLigacao(0)
    setNumero('')
    setClienteSel(null)
    setBuscaCliente('')
    setMsg('✅ Ligação encerrada')
    await carregarLigacoes(profile?.id)
  }

  function adicionarDigito(d: string) {
    setNumero(n => n + d)
  }

  const statusCor: Record<string,string> = {
    iniciada: 'var(--gold)',
    em_andamento: 'var(--teal)',
    encerrada: 'var(--text-muted)',
    perdida: 'var(--red)',
    erro: 'var(--red)',
  }

  const statusLabel: Record<string,string> = {
    iniciada: '📞 Iniciando',
    em_andamento: '🟢 Em andamento',
    encerrada: '✓ Encerrada',
    perdida: '❌ Perdida',
    erro: '⚠ Erro',
  }

  const inp: React.CSSProperties = { width:'100%', background:'rgba(255,255,255,0.05)', border:'1px solid var(--border)', borderRadius:8, padding:'9px 14px', color:'var(--text)', fontSize:13, fontFamily:'DM Sans,sans-serif', outline:'none', boxSizing:'border-box' }

  if (loading) return (
    <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',color:'var(--text-muted)'}}>Carregando...</div>
  )

  return (
    <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
      {/* Topbar */}
      <div style={{height:56,borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',padding:'0 28px',gap:12,background:'var(--bg-soft)',backdropFilter:'blur(8px)',position:'sticky',top:0,zIndex:5,flexShrink:0}}>
        <div style={{fontFamily:'DM Serif Display,serif',fontSize:18,flex:1}}>📞 Telefone</div>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <div style={{width:8,height:8,borderRadius:'50%',background:conectado?'var(--teal)':'var(--red)'}}/>
          <span style={{fontSize:12,color:conectado?'var(--teal)':'var(--red)',fontWeight:600}}>{conectado?'GoTo Conectado':'GoTo Desconectado'}</span>
        </div>
        {!conectado && (
          <button onClick={conectarGoTo} className="btn-primary" style={{fontSize:12,padding:'7px 16px'}}>🔗 Conectar GoTo</button>
        )}
        <div style={{display:'flex',gap:4}}>
          {(['discador','andamento','historico'] as const).map(a=>(
            <button key={a} onClick={()=>setAba(a)} style={{padding:'6px 14px',borderRadius:8,fontSize:12,cursor:'pointer',border:'1px solid var(--border)',fontFamily:'DM Sans,sans-serif',background:aba===a?'rgba(201,168,76,0.12)':'rgba(255,255,255,0.04)',color:aba===a?'var(--gold)':'var(--text-muted)',borderColor:aba===a?'var(--gold)':'var(--border)',position:'relative'}}>
              {a==='discador'?'📱 Discador':a==='andamento'?'🔴 Em andamento':'📋 Histórico'}
              {a==='andamento'&&emAndamento.length>0&&<span style={{position:'absolute',top:-4,right:-4,background:'var(--red)',color:'#fff',fontSize:9,fontWeight:700,borderRadius:10,padding:'1px 5px'}}>{emAndamento.length}</span>}
            </button>
          ))}
        </div>
      </div>

      <div style={{flex:1,overflow:'auto',padding:'24px 28px'}}>
        {msg && (
          <div style={{marginBottom:16,padding:'10px 16px',background:msg.includes('❌')?'rgba(224,82,82,0.1)':'rgba(28,181,160,0.1)',border:`1px solid ${msg.includes('❌')?'rgba(224,82,82,0.3)':'rgba(28,181,160,0.3)'}`,borderRadius:10,fontSize:13,color:msg.includes('❌')?'var(--red)':'var(--teal)'}}>
            {msg}
          </div>
        )}

        {/* DISCADOR */}
        {aba==='discador' && (
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20,alignItems:'start',maxWidth:900}}>

            {/* Teclado + input */}
            <div className="card">
              <div style={{fontFamily:'DM Serif Display,serif',fontSize:16,marginBottom:16}}>
                {ligacaoAtiva ? '📞 Ligação em andamento' : 'Fazer ligação'}
              </div>

              {/* Busca cliente */}
              {!ligacaoAtiva && (
                <div style={{marginBottom:12,position:'relative'}}>
                  <input value={buscaCliente} onChange={e=>buscarClientes(e.target.value)}
                    placeholder="🔍 Buscar cliente..." style={inp} />
                  {clientesBusca.length>0&&(
                    <div style={{position:'absolute',top:'100%',left:0,right:0,background:'#0e2040',border:'1px solid var(--border)',borderRadius:8,zIndex:10,marginTop:4,maxHeight:180,overflow:'auto'}}>
                      {clientesBusca.map(c=>(
                        <div key={c.id} onClick={()=>selecionarCliente(c)} style={{padding:'10px 14px',cursor:'pointer',borderBottom:'1px solid rgba(255,255,255,0.05)'}}
                          onMouseEnter={e=>(e.currentTarget.style.background='rgba(201,168,76,0.08)')}
                          onMouseLeave={e=>(e.currentTarget.style.background='')}>
                          <div style={{fontSize:13,fontWeight:500}}>{c.nome}</div>
                          <div style={{fontSize:11,color:'var(--text-muted)'}}>{c.telefone}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {clienteSel && !ligacaoAtiva && (
                <div style={{marginBottom:12,padding:'8px 12px',background:'rgba(28,181,160,0.08)',border:'1px solid rgba(28,181,160,0.3)',borderRadius:8,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <div>
                    <div style={{fontSize:13,fontWeight:600}}>{clienteSel.nome}</div>
                    <div style={{fontSize:11,color:'var(--text-muted)'}}>{clienteSel.telefone}</div>
                  </div>
                  <button onClick={()=>{setClienteSel(null);setBuscaCliente('')}} style={{background:'none',border:'none',color:'var(--text-muted)',cursor:'pointer'}}>✕</button>
                </div>
              )}

              {/* Display número */}
              <div style={{background:'rgba(0,0,0,0.3)',borderRadius:12,padding:'16px 20px',marginBottom:16,textAlign:'center',minHeight:60,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                {ligacaoAtiva ? (
                  <div style={{width:'100%',textAlign:'center'}}>
                    <div style={{fontSize:14,color:'var(--teal)',fontWeight:600,marginBottom:4}}>🟢 {ligacaoAtiva.nome_contato || ligacaoAtiva.numero_destino}</div>
                    <div style={{fontSize:28,fontWeight:700,fontFamily:'monospace',color:'var(--gold)'}}>{formatDuracao(tempoLigacao)}</div>
                  </div>
                ) : (
                  <>
                    <div style={{fontSize:22,fontWeight:600,fontFamily:'monospace',flex:1,textAlign:'center'}}>{numero || '—'}</div>
                    {numero && <button onClick={()=>setNumero(n=>n.slice(0,-1))} style={{background:'none',border:'none',cursor:'pointer',color:'var(--text-muted)',fontSize:18}}>⌫</button>}
                  </>
                )}
              </div>

              {/* Teclado numérico */}
              {!ligacaoAtiva && (
                <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8,marginBottom:16}}>
                  {['1','2','3','4','5','6','7','8','9','*','0','#'].map(d=>(
                    <button key={d} onClick={()=>adicionarDigito(d)}
                      style={{padding:'14px',borderRadius:10,fontSize:16,fontWeight:600,cursor:'pointer',border:'1px solid var(--border)',background:'rgba(255,255,255,0.04)',color:'var(--text)',fontFamily:'DM Sans,sans-serif',transition:'background 0.1s'}}
                      onMouseEnter={e=>(e.currentTarget.style.background='rgba(201,168,76,0.1)')}
                      onMouseLeave={e=>(e.currentTarget.style.background='rgba(255,255,255,0.04)')}>
                      {d}
                    </button>
                  ))}
                </div>
              )}

              {/* Input manual */}
              {!ligacaoAtiva && (
                <input value={numero} onChange={e=>setNumero(e.target.value.replace(/\D/g,''))}
                  placeholder="Ou digite o número..." style={{...inp,marginBottom:12,textAlign:'center',fontSize:16}} />
              )}

              {/* Botão ligar/encerrar */}
              {ligacaoAtiva ? (
                <button onClick={encerrarLigacao}
                  style={{width:'100%',padding:'14px',borderRadius:50,fontSize:16,fontWeight:700,cursor:'pointer',border:'none',background:'var(--red)',color:'#fff',fontFamily:'DM Sans,sans-serif',display:'flex',alignItems:'center',justifyContent:'center',gap:8}}>
                  📵 Encerrar
                </button>
              ) : (
                <button onClick={ligar} disabled={discando||!numero.trim()}
                  style={{width:'100%',padding:'14px',borderRadius:50,fontSize:16,fontWeight:700,cursor:'pointer',border:'none',background:numero.trim()?'var(--teal)':'rgba(255,255,255,0.1)',color:'#fff',fontFamily:'DM Sans,sans-serif',display:'flex',alignItems:'center',justifyContent:'center',gap:8,transition:'background 0.2s'}}>
                  {discando?'📞 Discando...':'📞 Ligar'}
                </button>
              )}
            </div>

            {/* Últimas ligações */}
            <div className="card">
              <div style={{fontFamily:'DM Serif Display,serif',fontSize:16,marginBottom:16}}>Últimas ligações</div>
              {ligacoes.length===0 ? (
                <div style={{color:'var(--text-muted)',fontSize:13,textAlign:'center',padding:20}}>Nenhuma ligação registrada</div>
              ) : ligacoes.slice(0,10).map(l=>(
                <div key={l.id} style={{display:'flex',alignItems:'center',gap:12,padding:'10px 0',borderBottom:'1px solid rgba(255,255,255,0.04)',cursor:'pointer'}}
                  onClick={()=>l.clientes?.nome&&setBuscaCliente(l.clientes.nome)}>
                  <div style={{fontSize:20,flexShrink:0}}>{l.direcao==='entrante'?'📲':'📞'}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13,fontWeight:500,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                      {l.clientes?.nome||l.nome_contato||l.numero_destino||l.numero_origem||'—'}
                    </div>
                    <div style={{fontSize:11,color:'var(--text-muted)'}}>
                      {formatTel(l.direcao==='entrante'?l.numero_origem:l.numero_destino)} · {formatDuracao(l.duracao_seg)}
                    </div>
                  </div>
                  <div style={{textAlign:'right',flexShrink:0}}>
                    <div style={{fontSize:11,fontWeight:600,color:statusCor[l.status]||'var(--text-muted)'}}>{statusLabel[l.status]||l.status}</div>
                    <div style={{fontSize:10,color:'var(--text-muted)'}}>{new Date(l.criado_em).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</div>
                  </div>
                  {l.clientes && (
                    <button onClick={e=>{e.stopPropagation();router.push(`/dashboard/clientes/${l.cliente_id}`)}}
                      style={{fontSize:11,padding:'4px 8px',borderRadius:6,border:'1px solid rgba(201,168,76,0.3)',background:'rgba(201,168,76,0.08)',color:'var(--gold)',cursor:'pointer',flexShrink:0,fontFamily:'DM Sans,sans-serif'}}>
                      Ver →
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* EM ANDAMENTO */}
        {aba==='andamento' && (
          <div style={{maxWidth:700}}>
            <div style={{fontFamily:'DM Serif Display,serif',fontSize:18,marginBottom:20}}>🔴 Ligações em andamento</div>
            {emAndamento.length===0 ? (
              <div className="card" style={{textAlign:'center',padding:40,color:'var(--text-muted)'}}>
                <div style={{fontSize:40,marginBottom:12}}>📵</div>
                <div>Nenhuma ligação em andamento</div>
              </div>
            ) : emAndamento.map(l=>(
              <div key={l.id} className="card" style={{marginBottom:12,display:'flex',alignItems:'center',gap:16}}>
                <div style={{width:10,height:10,borderRadius:'50%',background:'var(--red)',animation:'pulse 1s infinite',flexShrink:0}}/>
                <div style={{flex:1}}>
                  <div style={{fontSize:14,fontWeight:600}}>{l.clientes?.nome||l.nome_contato||'Desconhecido'}</div>
                  <div style={{fontSize:12,color:'var(--text-muted)'}}>
                    {l.direcao==='entrante'?'📲 Recebida':'📞 Sainte'} · {formatTel(l.direcao==='entrante'?l.numero_origem:l.numero_destino)}
                  </div>
                </div>
                <div style={{fontSize:12,color:'var(--teal)',fontWeight:600}}>{formatDuracao(Math.round((Date.now()-new Date(l.inicio).getTime())/1000))}</div>
                {l.clientes && (
                  <button onClick={()=>router.push(`/dashboard/clientes/${l.cliente_id}`)}
                    style={{fontSize:11,padding:'5px 10px',borderRadius:6,border:'1px solid rgba(201,168,76,0.3)',background:'rgba(201,168,76,0.08)',color:'var(--gold)',cursor:'pointer',fontFamily:'DM Sans,sans-serif'}}>
                    Ver ficha →
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* HISTÓRICO */}
        {aba==='historico' && (
          <div>
            <div style={{fontFamily:'DM Serif Display,serif',fontSize:18,marginBottom:20}}>📋 Histórico de ligações</div>
            <div className="card">
              <table style={{width:'100%',borderCollapse:'collapse'}}>
                <thead>
                  <tr>
                    {['','Cliente/Número','Direção','Duração','Status','Data',''].map(h=>(
                      <th key={h} style={{fontSize:10,fontWeight:600,letterSpacing:'1.2px',textTransform:'uppercase',color:'var(--text-muted)',textAlign:'left',padding:'0 0 10px',borderBottom:'1px solid var(--border)'}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ligacoes.map(l=>(
                    <tr key={l.id} style={{cursor:'pointer'}}
                      onMouseEnter={e=>(e.currentTarget.style.background='rgba(201,168,76,0.03)')}
                      onMouseLeave={e=>(e.currentTarget.style.background='')}>
                      <td style={{padding:'10px 0',borderBottom:'1px solid rgba(255,255,255,0.04)',fontSize:18}}>{l.direcao==='entrante'?'📲':'📞'}</td>
                      <td style={{padding:'10px 0',borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
                        <div style={{fontSize:13,fontWeight:500}}>{l.clientes?.nome||l.nome_contato||'—'}</div>
                        <div style={{fontSize:11,color:'var(--text-muted)'}}>{formatTel(l.direcao==='entrante'?l.numero_origem:l.numero_destino)}</div>
                      </td>
                      <td style={{padding:'10px 0',borderBottom:'1px solid rgba(255,255,255,0.04)',fontSize:12,color:'var(--text-muted)'}}>{l.direcao==='entrante'?'Recebida':'Sainte'}</td>
                      <td style={{padding:'10px 0',borderBottom:'1px solid rgba(255,255,255,0.04)',fontSize:13}}>{formatDuracao(l.duracao_seg)}</td>
                      <td style={{padding:'10px 0',borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
                        <span style={{fontSize:11,fontWeight:600,color:statusCor[l.status]||'var(--text-muted)'}}>{statusLabel[l.status]||l.status}</span>
                      </td>
                      <td style={{padding:'10px 0',borderBottom:'1px solid rgba(255,255,255,0.04)',fontSize:11,color:'var(--text-muted)'}}>{new Date(l.criado_em).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit'})}</td>
                      <td style={{padding:'10px 0',borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
                        {l.clientes && <button onClick={()=>router.push(`/dashboard/clientes/${l.cliente_id}`)} style={{fontSize:11,padding:'4px 8px',borderRadius:6,border:'1px solid rgba(201,168,76,0.3)',background:'rgba(201,168,76,0.08)',color:'var(--gold)',cursor:'pointer',fontFamily:'DM Sans,sans-serif'}}>Ver →</button>}
                      </td>
                    </tr>
                  ))}
                  {ligacoes.length===0&&<tr><td colSpan={7} style={{padding:30,textAlign:'center',color:'var(--text-muted)'}}>Nenhuma ligação encontrada</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>
    </div>
  )
}
