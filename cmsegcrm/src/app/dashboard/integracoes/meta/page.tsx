'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function ConectarMetaPage() {
  const supabase = createClient()
  const router = useRouter()
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<any>(null)
  const [salvando, setSalvando] = useState(false)
  const [msg, setMsg] = useState<string|null>(null)
  const [form, setForm] = useState({
    access_token: '',
    ad_account_id: '',
    page_id: '',
    page_access_token: '',
    app_id: '',
    app_secret: '',
    verify_token: '',
    pixel_id: '',
    conversions_token: '',
    dataset_id: '',
  })
  const [testandoCAPI, setTestandoCAPI] = useState(false)
  const [respostaCAPI, setRespostaCAPI] = useState<string|null>(null)
  const [secrets, setSecrets] = useState<Record<string,string|null>|null>(null)
  const [revelando, setRevelando] = useState(false)
  const [mostrar, setMostrar] = useState<Record<string,boolean>>({})

  useEffect(()=>{ init() }, [])

  async function authHeaders() {
    const { data: { session } } = await supabase.auth.getSession()
    const h: Record<string, string> = { 'Content-Type': 'application/json' }
    if (session?.access_token) h['Authorization'] = `Bearer ${session.access_token}`
    return h
  }

  async function init() {
    const { data:{ user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    const { data: prof } = await supabase.from('users').select('*').eq('id', user.id).single()
    setProfile(prof)
    if (prof?.role !== 'admin') { setLoading(false); return }
    try {
      const r = await fetch('/api/meta/connect', { headers: await authHeaders() })
      const j = await r.json()
      setStatus(j)
      if (j.ad_account_id) setForm(f => ({ ...f, ad_account_id: j.ad_account_id }))
      if (j.page_id)       setForm(f => ({ ...f, page_id: j.page_id }))
      if (j.app_id)        setForm(f => ({ ...f, app_id: j.app_id }))
      if (j.pixel_id)      setForm(f => ({ ...f, pixel_id: j.pixel_id }))
      if (j.dataset_id)    setForm(f => ({ ...f, dataset_id: j.dataset_id }))
    } catch {}
    setLoading(false)
  }

  async function salvar() {
    setSalvando(true); setMsg(null)
    try {
      const r = await fetch('/api/meta/connect', { method:'POST', headers: await authHeaders(), body: JSON.stringify(form) })
      const j = await r.json()
      if (!r.ok) { setMsg('❌ ' + (j.error || 'erro') + (j.detalhe ? ': '+j.detalhe : '')); return }
      let m = `✅ Conectado como "${j.me?.name}"`
      if (j.webhook_subscribed) m += ' · Webhook leadgen ativo'
      else if (j.webhook_erro)  m += ' · ⚠ Webhook: ' + j.webhook_erro
      setMsg(m)
      await init()
    } finally { setSalvando(false) }
  }

  async function desconectar() {
    if (!confirm('Desconectar a integração Meta? Os dados sincronizados serão mantidos.')) return
    const r = await fetch('/api/meta/connect', { method:'DELETE', headers: await authHeaders() })
    if (r.ok) { setMsg('Desconectado'); setForm({ access_token:'',ad_account_id:'',page_id:'',page_access_token:'',app_id:'',app_secret:'',verify_token:'',pixel_id:'',conversions_token:'',dataset_id:'' }); await init() }
  }

  async function revelarSecrets() {
    setRevelando(true)
    try {
      const r = await fetch('/api/meta/connect?revelar=1', { headers: await authHeaders() })
      const j = await r.json()
      if (r.ok) setSecrets(j.secrets || {})
    } finally { setRevelando(false) }
  }

  async function testarCAPI() {
    setTestandoCAPI(true); setRespostaCAPI(null)
    try {
      const r = await fetch('/api/meta/conversions', {
        method: 'POST', headers: await authHeaders(),
        body: JSON.stringify({ event_name: 'Lead', test: true }),
      })
      const j = await r.json()
      setRespostaCAPI(r.ok ? '✅ Evento de teste enviado. Verifique em Events Manager → Test Events.' : ('❌ ' + (j.error || 'erro')))
    } finally { setTestandoCAPI(false) }
  }

  const inp: React.CSSProperties = { width:'100%', background:'rgba(255,255,255,0.05)', border:'1px solid var(--border)', borderRadius:8, padding:'9px 13px', color:'var(--text)', fontSize:13, fontFamily:'DM Sans,sans-serif', outline:'none', boxSizing:'border-box' as const }
  const lbl: React.CSSProperties = { fontSize:11, fontWeight:600, letterSpacing:'1px', textTransform:'uppercase', color:'var(--text-muted)', display:'block', marginBottom:5 }

  if (loading) return <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',color:'var(--text-muted)'}}>Carregando...</div>
  if (profile?.role !== 'admin') return (
    <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:10,color:'var(--text-muted)'}}>
      <div style={{fontSize:40}}>🔒</div>
      <div>Apenas administradores podem configurar integrações.</div>
    </div>
  )

  const webhookUrl = typeof window !== 'undefined'
    ? `${window.location.protocol}//${window.location.host}/api/meta/webhook`
    : '/api/meta/webhook'

  return (
    <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
      <div style={{height:56,borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',padding:'0 28px',gap:12}}>
        <button onClick={()=>router.push('/dashboard/campanhas')} style={{background:'none',border:'none',color:'var(--text-muted)',cursor:'pointer',fontSize:13}}>← Campanhas</button>
        <div style={{fontFamily:'DM Serif Display,serif',fontSize:18}}>🔗 Conectar Meta Ads</div>
        <div style={{marginLeft:'auto',display:'flex',gap:10,alignItems:'center'}}>
          {status?.conectado && (
            <button onClick={()=>router.push('/dashboard/integracoes/meta/formularios')}
              style={{padding:'6px 12px',borderRadius:6,border:'1px solid rgba(201,168,76,0.3)',background:'rgba(201,168,76,0.08)',color:'var(--gold)',cursor:'pointer',fontSize:12,fontWeight:600}}>
              📋 Formulários e mapeamento →
            </button>
          )}
          {status?.conectado && <span style={{fontSize:11,color:'var(--teal)',fontWeight:600,padding:'4px 10px',borderRadius:5,border:'1px solid rgba(28,181,160,0.3)',background:'rgba(28,181,160,0.1)'}}>● Conectado</span>}
        </div>
      </div>

      <div style={{flex:1,overflow:'auto',padding:'24px 28px'}}>
        <div style={{maxWidth:780,margin:'0 auto'}}>

          {msg && <div style={{padding:'12px 16px',marginBottom:18,borderRadius:10,fontSize:13,background:msg.startsWith('✅')?'rgba(28,181,160,0.1)':'rgba(224,82,82,0.1)',color:msg.startsWith('✅')?'var(--teal)':'var(--red)',border:'1px solid '+(msg.startsWith('✅')?'rgba(28,181,160,0.3)':'rgba(224,82,82,0.3)')}}>{msg}</div>}

          <div className="card" style={{marginBottom:20}}>
            <div style={{fontFamily:'DM Serif Display,serif',fontSize:16,marginBottom:14,color:'var(--gold)'}}>📘 Como obter as credenciais</div>
            <ol style={{fontSize:13,color:'var(--text-muted)',lineHeight:1.8,paddingLeft:18}}>
              <li>Acesse <a href="https://developers.facebook.com" target="_blank" rel="noreferrer" style={{color:'var(--teal)'}}>developers.facebook.com</a> e crie um App do tipo <b>Business</b></li>
              <li>Adicione os produtos: <b>Marketing API</b> e <b>Webhooks</b></li>
              <li>Em <b>Marketing API → Tools → Access Token</b>: gere um <b>System User Access Token</b> com escopos <code>ads_read, ads_management, leads_retrieval, pages_read_engagement, pages_manage_metadata, pages_show_list</code></li>
              <li>Pegue o <b>ad_account_id</b> (formato <code>act_XXXXXXXXX</code>) em Ads Manager → Conta de Anúncios</li>
              <li>Pegue o <b>page_id</b> da Página do Facebook que receberá leads</li>
              <li>Em <b>Webhooks</b> → Page → Add Subscription:
                <ul style={{paddingLeft:16,marginTop:4}}>
                  <li>Callback URL: <code style={{background:'rgba(255,255,255,0.06)',padding:'2px 5px',borderRadius:3}}>{webhookUrl}</code></li>
                  <li>Verify Token: invente uma string e cole no campo &quot;Verify Token&quot; abaixo</li>
                  <li>Subscribed Fields: <b>leadgen</b></li>
                </ul>
              </li>
              <li>Salve aqui — o robô vai testar o token e tentar subscrever a Page automaticamente</li>
            </ol>
          </div>

          {status?.conectado && (
            <div className="card" style={{marginBottom:20}}>
              <div style={{display:'flex',alignItems:'center',marginBottom:14}}>
                <div style={{fontFamily:'DM Serif Display,serif',fontSize:16,flex:1}}>📋 Configuração salva</div>
                {!secrets ? (
                  <button onClick={revelarSecrets} disabled={revelando}
                    style={{padding:'6px 12px',borderRadius:6,fontSize:11,cursor:'pointer',border:'1px solid rgba(201,168,76,0.4)',background:'rgba(201,168,76,0.08)',color:'var(--gold)',fontFamily:'DM Sans,sans-serif',fontWeight:600}}>
                    {revelando ? 'Carregando...' : '👁 Mostrar secrets'}
                  </button>
                ) : (
                  <button onClick={()=>{setSecrets(null);setMostrar({})}}
                    style={{padding:'6px 12px',borderRadius:6,fontSize:11,cursor:'pointer',border:'1px solid var(--border)',background:'rgba(255,255,255,0.04)',color:'var(--text-muted)',fontFamily:'DM Sans,sans-serif'}}>
                    🙈 Ocultar
                  </button>
                )}
              </div>
              {(() => {
                const linhas: Array<{ key:string; label:string; val:string|null|undefined; secret:boolean }> = [
                  { key:'ad_account_id',     label:'Ad Account ID',     val: status?.ad_account_id, secret:false },
                  { key:'page_id',           label:'Page ID',           val: status?.page_id,       secret:false },
                  { key:'app_id',            label:'App ID',            val: status?.app_id,        secret:false },
                  { key:'pixel_id',          label:'Pixel ID',          val: status?.pixel_id,      secret:false },
                  { key:'dataset_id',        label:'CAPI Dataset ID',   val: status?.dataset_id,    secret:false },
                  { key:'access_token',      label:'Access Token',      val: secrets?.access_token,      secret:true },
                  { key:'page_access_token', label:'Page Access Token', val: secrets?.page_access_token, secret:true },
                  { key:'app_secret',        label:'App Secret',        val: secrets?.app_secret,        secret:true },
                  { key:'verify_token',      label:'Verify Token',      val: secrets?.verify_token,      secret:true },
                  { key:'conversions_token', label:'Conversions API Token', val: secrets?.conversions_token, secret:true },
                ]
                const mask = (v: string) => v.length <= 8 ? '••••' : v.slice(0,4) + '•'.repeat(Math.max(8, v.length-8)) + v.slice(-4)
                return (
                  <div style={{display:'grid',gridTemplateColumns:'1fr',gap:8,fontSize:12}}>
                    {linhas.map(l => {
                      const temValor = !!l.val
                      const temFlag = l.secret
                        ? (l.key === 'access_token' ? status?.tem_access_token
                          : l.key === 'page_access_token' ? status?.tem_page_access_token
                          : l.key === 'app_secret' ? status?.tem_app_secret
                          : l.key === 'verify_token' ? status?.tem_verify_token
                          : l.key === 'conversions_token' ? status?.tem_conversions_token
                          : false)
                        : temValor
                      const exibe = l.secret ? (mostrar[l.key] && l.val ? l.val : (l.val ? mask(l.val) : null)) : (l.val || null)
                      return (
                        <div key={l.key} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 10px',background:'rgba(255,255,255,0.03)',borderRadius:6,border:'1px solid var(--border)'}}>
                          <div style={{flex:'0 0 180px',color:'var(--text-muted)',fontSize:11,letterSpacing:'0.5px',textTransform:'uppercase',fontWeight:600}}>{l.label}</div>
                          <div style={{flex:1,fontFamily:'monospace',fontSize:12,color: exibe ? 'var(--text)' : 'var(--text-muted)',wordBreak:'break-all'}}>
                            {exibe || (temFlag ? '✓ salvo (clique em Mostrar secrets)' : '— não configurado')}
                          </div>
                          {l.secret && l.val && (
                            <>
                              <button onClick={()=>setMostrar(m=>({...m,[l.key]:!m[l.key]}))}
                                style={{padding:'3px 8px',borderRadius:4,fontSize:10,cursor:'pointer',border:'1px solid var(--border)',background:'rgba(255,255,255,0.04)',color:'var(--text-muted)'}}>
                                {mostrar[l.key]?'Ocultar':'Mostrar'}
                              </button>
                              <button onClick={()=>{navigator.clipboard.writeText(l.val!);setMsg('✅ Copiado: '+l.label)}}
                                style={{padding:'3px 8px',borderRadius:4,fontSize:10,cursor:'pointer',border:'1px solid var(--border)',background:'rgba(255,255,255,0.04)',color:'var(--text-muted)'}}>
                                Copiar
                              </button>
                            </>
                          )}
                          {!l.secret && l.val && (
                            <button onClick={()=>{navigator.clipboard.writeText(l.val!);setMsg('✅ Copiado: '+l.label)}}
                              style={{padding:'3px 8px',borderRadius:4,fontSize:10,cursor:'pointer',border:'1px solid var(--border)',background:'rgba(255,255,255,0.04)',color:'var(--text-muted)'}}>
                              Copiar
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )
              })()}
            </div>
          )}

          <div className="card">
            <div style={{fontFamily:'DM Serif Display,serif',fontSize:16,marginBottom:18}}>Credenciais</div>

            <div style={{marginBottom:14}}>
              <label style={lbl}>Access Token (System User) *</label>
              <input type="password" value={form.access_token} onChange={e=>setForm(f=>({...f,access_token:e.target.value}))} placeholder="EAA..." style={inp} />
            </div>

            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:14}}>
              <div>
                <label style={lbl}>ad_account_id *</label>
                <input value={form.ad_account_id} onChange={e=>setForm(f=>({...f,ad_account_id:e.target.value}))} placeholder="act_123456789" style={inp} />
              </div>
              <div>
                <label style={lbl}>page_id (para leads)</label>
                <input value={form.page_id} onChange={e=>setForm(f=>({...f,page_id:e.target.value}))} placeholder="123456789" style={inp} />
              </div>
            </div>

            <div style={{marginBottom:14}}>
              <label style={lbl}>Page Access Token {status?.tem_page_access_token ? <span style={{color:'var(--teal)'}}>(salvo ✓)</span> : <span style={{color:'var(--text-muted)'}}>(recomendado)</span>}</label>
              <input type="password" value={form.page_access_token} onChange={e=>setForm(f=>({...f,page_access_token:e.target.value}))} placeholder={status?.tem_page_access_token ? '(deixe em branco pra manter o salvo)' : 'EAA... — Page Access Token específico da Página'} style={inp} />
              <div style={{fontSize:11,color:'var(--text-muted)',marginTop:4,lineHeight:1.5}}>
                Gere em <a href="https://developers.facebook.com/tools/explorer/" target="_blank" rel="noreferrer" style={{color:'var(--teal)'}}>Graph API Explorer</a> selecionando a Page no campo "Application" e marcando os escopos <code>leads_retrieval, pages_show_list, pages_read_engagement, pages_manage_metadata</code>. Sem esse token, <code>/leadgen_forms</code> retorna <b>"API access blocked"</b>.
              </div>
            </div>

            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:14}}>
              <div>
                <label style={lbl}>app_id</label>
                <input value={form.app_id} onChange={e=>setForm(f=>({...f,app_id:e.target.value}))} placeholder="(opcional)" style={inp} />
              </div>
              <div>
                <label style={lbl}>app_secret</label>
                <input type="password" value={form.app_secret} onChange={e=>setForm(f=>({...f,app_secret:e.target.value}))} placeholder="(opcional)" style={inp} />
              </div>
            </div>

            <div style={{marginBottom:14}}>
              <label style={lbl}>Verify Token (Webhook) *</label>
              <input value={form.verify_token} onChange={e=>setForm(f=>({...f,verify_token:e.target.value}))} placeholder="ex: cmsegcrm_meta_2026_xyz" style={inp} />
              <div style={{fontSize:11,color:'var(--text-muted)',marginTop:4}}>Cole essa mesma string no campo &quot;Verify Token&quot; do webhook no Meta for Developers.</div>
            </div>

            {/* Pixel — separado por linha */}
            <div style={{marginTop:18,paddingTop:18,borderTop:'1px solid var(--border)'}}>
              <div style={{fontSize:13,fontWeight:600,color:'var(--gold)',marginBottom:10}}>📊 Pixel de Conversão</div>
              <div style={{fontSize:12,color:'var(--text-muted)',marginBottom:12,lineHeight:1.5}}>
                O Pixel registra conversões (PageView, Lead, Purchase) automaticamente. Ative pra otimizar suas campanhas.
                Pegue o ID em <a href="https://business.facebook.com/events_manager2/list/pixel" target="_blank" rel="noreferrer" style={{color:'var(--teal)'}}>Events Manager → Pixels</a>.
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:14}}>
                <div>
                  <label style={lbl}>Pixel ID</label>
                  <input value={form.pixel_id} onChange={e=>setForm(f=>({...f,pixel_id:e.target.value}))} placeholder="ex: 1234567890123456" style={inp} />
                </div>
                <div>
                  <label style={lbl}>Conversions API Token (opcional)</label>
                  <input type="password" value={form.conversions_token} onChange={e=>setForm(f=>({...f,conversions_token:e.target.value}))} placeholder="(server-side, evita bloqueio iOS)" style={inp} />
                </div>
              </div>
              <div style={{fontSize:11,color:'var(--text-muted)',background:'rgba(74,128,240,0.07)',padding:'8px 12px',borderRadius:8,border:'1px solid rgba(74,128,240,0.2)'}}>
                💡 Quando configurado, o pixel é injetado automaticamente nas páginas do CRM. PageView é registrado a cada navegação;
                eventos Lead e Purchase quando vier um lead Meta ou um negócio for marcado como Ganho.
              </div>
            </div>

            {/* Conversions API — Eventos de CRM (server-side) */}
            <div style={{marginTop:18,paddingTop:18,borderTop:'1px solid var(--border)'}}>
              <div style={{fontSize:13,fontWeight:600,color:'var(--gold)',marginBottom:10}}>🔄 API de Conversão — Eventos de CRM</div>
              <div style={{fontSize:12,color:'var(--text-muted)',marginBottom:12,lineHeight:1.5}}>
                Envia mudanças de status do lead (Lead → MQL → SQL → Customer) direto pra Meta via servidor.
                <strong style={{color:'var(--warning)'}}> Apenas negociações no funil &quot;META + MULTICANAL&quot; disparam eventos.</strong>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr',gap:12,marginBottom:14}}>
                <div>
                  <label style={lbl}>Dataset ID (do Events Manager)</label>
                  <input value={form.dataset_id} onChange={e=>setForm(f=>({...f,dataset_id:e.target.value}))} placeholder="ex: 1278482872791335" style={inp} />
                  <div style={{fontSize:10,color:'var(--text-muted)',marginTop:4}}>Pegue em Events Manager → Conjuntos de dados → Visão geral. É o ID que aparece na URL <code>graph.facebook.com/v25.0/&lt;DATASET&gt;/events</code>.</div>
                </div>
              </div>
              <div style={{display:'flex',gap:10,marginBottom:8}}>
                <button onClick={testarCAPI} disabled={testandoCAPI||!form.dataset_id||!form.conversions_token}
                  style={{padding:'7px 14px',borderRadius:8,fontSize:12,cursor:'pointer',border:'1px solid rgba(28,181,160,0.4)',background:'rgba(28,181,160,0.08)',color:'var(--teal)',fontFamily:'DM Sans,sans-serif',fontWeight:600}}>
                  {testandoCAPI?'Enviando...':'🧪 Enviar evento de teste'}
                </button>
              </div>
              {respostaCAPI && <div style={{fontSize:11,color:'var(--text)',padding:'8px 12px',background:'rgba(0,0,0,0.3)',borderRadius:6}}>{respostaCAPI}</div>}
            </div>

            <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
              {status?.conectado && (
                <button onClick={desconectar} style={{padding:'9px 18px',borderRadius:8,fontSize:13,border:'1px solid rgba(224,82,82,0.4)',background:'rgba(224,82,82,0.08)',color:'var(--red)',cursor:'pointer',fontFamily:'DM Sans,sans-serif'}}>Desconectar</button>
              )}
              <button onClick={salvar} disabled={salvando||!form.access_token} className="btn-primary">
                {salvando?'Salvando...':status?.conectado?'✓ Atualizar conexão':'✓ Conectar'}
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
