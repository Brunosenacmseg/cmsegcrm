'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

const STATUS_COR: Record<string,string> = {
  pendente: 'var(--text-muted)',
  enviado:  '#7aa3f8',
  assinado: 'var(--teal)',
  recusado: 'var(--red)',
  expirado: 'var(--warning)',
  cancelado:'var(--text-muted)',
  erro:     'var(--red)',
}

export default function AutentiquePage() {
  const supabase = createClient()
  const router = useRouter()

  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [docs, setDocs] = useState<any[]>([])
  const [filtro, setFiltro] = useState<'todos'|'pendente'|'assinado'|'recusado'>('todos')
  const [sync, setSync] = useState(false)
  const [modal, setModal] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [form, setForm] = useState({
    nome:'', mensagem:'',
    signatarios: [{ nome:'', email:'' }],
    file: null as File | null,
    negocio_id:'', cliente_id:'',
  })
  const [negocios, setNegocios] = useState<any[]>([])
  const [clientes, setClientes] = useState<any[]>([])
  const [respostaSync, setRespostaSync] = useState<string | null>(null)

  useEffect(() => { init() }, [])
  useEffect(() => { if (profile) carregar() }, [profile, filtro])

  async function init() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    const { data: prof } = await supabase.from('users').select('*').eq('id', user.id).single()
    setProfile(prof)
    const [{ data: n }, { data: c }] = await Promise.all([
      supabase.from('negocios').select('id, titulo, clientes(nome)').order('created_at',{ascending:false}).limit(50),
      supabase.from('clientes').select('id, nome').order('nome').limit(100),
    ])
    setNegocios(n || []); setClientes(c || [])
    setLoading(false)
  }

  async function carregar() {
    let q = supabase.from('assinaturas')
      .select('*, users:enviado_por(nome), clientes(nome), negocios(titulo)')
      .order('criado_em', { ascending: false }).limit(100)
    if (filtro !== 'todos') q = q.eq('status', filtro)
    const { data } = await q
    setDocs(data || [])
  }

  async function authHeaders() {
    const { data: { session } } = await supabase.auth.getSession()
    const h: Record<string, string> = {}
    if (session?.access_token) h['Authorization'] = `Bearer ${session.access_token}`
    return h
  }

  async function sincronizar() {
    setSync(true); setRespostaSync(null)
    try {
      const r = await fetch('/api/autentique/sync', { method:'POST', headers: { ...(await authHeaders()), 'Content-Type':'application/json' }, body: '{}' })
      const j = await r.json()
      if (!r.ok) setRespostaSync('❌ '+(j.error||'erro'))
      else setRespostaSync(`✅ ${j.atualizadas} documento(s) atualizado(s)`+(j.erros?.length?` · ${j.erros.length} erro(s)`:''))
      await carregar()
    } finally { setSync(false) }
  }

  async function enviar() {
    if (!form.file || !form.nome.trim()) return
    if (form.signatarios.some(s => !s.email.trim())) { alert('Todos os signatários precisam de email'); return }
    setSalvando(true)
    try {
      const fd = new FormData()
      fd.append('file', form.file)
      fd.append('nome', form.nome)
      fd.append('signatarios', JSON.stringify(form.signatarios.filter(s => s.email.trim())))
      if (form.mensagem) fd.append('mensagem', form.mensagem)
      if (form.negocio_id) fd.append('negocio_id', form.negocio_id)
      if (form.cliente_id) fd.append('cliente_id', form.cliente_id)
      const r = await fetch('/api/autentique/criar', { method:'POST', headers: await authHeaders(), body: fd })
      const j = await r.json()
      if (!r.ok) { alert('Erro: '+(j.error||'desconhecido')); return }
      setModal(false)
      setForm({ nome:'', mensagem:'', signatarios: [{ nome:'', email:'' }], file: null, negocio_id:'', cliente_id:'' })
      await carregar()
    } finally { setSalvando(false) }
  }

  if (loading) return <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',color:'var(--text-muted)'}}>Carregando...</div>

  const inp: React.CSSProperties = { width:'100%', background:'rgba(255,255,255,0.05)', border:'1px solid var(--border)', borderRadius:8, padding:'9px 13px', color:'var(--text)', fontSize:13, outline:'none', boxSizing:'border-box' as const, fontFamily:'DM Sans,sans-serif' }
  const lbl: React.CSSProperties = { fontSize:11, fontWeight:600, letterSpacing:'1px', textTransform:'uppercase', color:'var(--text-muted)', display:'block', marginBottom:5 }

  return (
    <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
      <div style={{height:56,borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',padding:'0 28px',gap:12,background:'var(--bg-soft)'}}>
        <div style={{fontFamily:'DM Serif Display,serif',fontSize:18,flex:1}}>✍️ Autentique — Assinaturas Digitais</div>
        <button onClick={sincronizar} disabled={sync} className="btn-secondary" style={{padding:'7px 14px',fontSize:12}}>
          {sync ? 'Sincronizando...' : '🔄 Sincronizar status'}
        </button>
        <button onClick={()=>setModal(true)} className="btn-primary" style={{padding:'7px 14px',fontSize:12}}>+ Novo documento</button>
      </div>

      {respostaSync && <div style={{padding:'8px 28px',fontSize:12,color:'var(--text)',background:'rgba(28,181,160,0.06)',borderBottom:'1px solid var(--border)'}}>{respostaSync}</div>}

      <div style={{flex:1,overflow:'auto',padding:'24px 28px'}}>
        <div style={{display:'flex',gap:8,marginBottom:18,flexWrap:'wrap'}}>
          {(['todos','pendente','enviado','assinado','recusado'] as const).map(f => (
            <button key={f} onClick={()=>setFiltro(f as any)}
              style={{padding:'5px 12px',borderRadius:6,fontSize:11,cursor:'pointer',border:'1px solid '+(filtro===f?'var(--gold)':'var(--border)'),background:filtro===f?'rgba(201,168,76,0.10)':'rgba(255,255,255,0.04)',color:filtro===f?'var(--gold)':'var(--text-muted)',textTransform:'capitalize',fontWeight:600,fontFamily:'DM Sans,sans-serif'}}>
              {f}
            </button>
          ))}
        </div>

        {docs.length === 0 ? (
          <div className="card" style={{padding:'40px 20px',textAlign:'center',color:'var(--text-muted)'}}>
            <div style={{fontSize:40,marginBottom:12}}>📄</div>
            <div style={{marginBottom:12}}>Nenhum documento ainda.</div>
            <button onClick={()=>setModal(true)} className="btn-primary">+ Enviar primeiro documento</button>
          </div>
        ) : (
          <div className="card">
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
              <thead>
                <tr style={{textAlign:'left',color:'var(--text-muted)',fontSize:10,letterSpacing:'1px',textTransform:'uppercase'}}>
                  <th style={{padding:'8px 4px',borderBottom:'1px solid var(--border)'}}>Documento</th>
                  <th style={{padding:'8px 4px',borderBottom:'1px solid var(--border)'}}>Vínculo</th>
                  <th style={{padding:'8px 4px',borderBottom:'1px solid var(--border)'}}>Status</th>
                  <th style={{padding:'8px 4px',borderBottom:'1px solid var(--border)',textAlign:'center'}}>Assinados</th>
                  <th style={{padding:'8px 4px',borderBottom:'1px solid var(--border)'}}>Enviado</th>
                  <th style={{padding:'8px 4px',borderBottom:'1px solid var(--border)',textAlign:'right'}}></th>
                </tr>
              </thead>
              <tbody>
                {docs.map((d:any) => (
                  <tr key={d.id} style={{borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
                    <td style={{padding:'10px 4px'}}>
                      <div style={{fontWeight:500}}>{d.nome_documento}</div>
                      {d.arquivo_nome && <div style={{fontSize:11,color:'var(--text-muted)'}}>{d.arquivo_nome}</div>}
                    </td>
                    <td style={{padding:'10px 4px',fontSize:12}}>
                      {d.negocios?.titulo && <div>📋 {d.negocios.titulo}</div>}
                      {d.clientes?.nome  && <div style={{color:'var(--teal)'}}>👤 {d.clientes.nome}</div>}
                      {!d.negocios && !d.clientes && <span style={{color:'var(--text-muted)'}}>—</span>}
                    </td>
                    <td style={{padding:'10px 4px'}}>
                      <span style={{fontSize:10,fontWeight:700,padding:'3px 9px',borderRadius:5,textTransform:'uppercase',letterSpacing:'1px',background:(STATUS_COR[d.status]||'#999')+'22',color:STATUS_COR[d.status]||'#999',border:'1px solid '+(STATUS_COR[d.status]||'#999')+'66'}}>
                        {d.status}
                      </span>
                    </td>
                    <td style={{padding:'10px 4px',textAlign:'center',fontSize:12,fontWeight:600,color:d.total_assinados===d.total_signatarios?'var(--teal)':'var(--text)'}}>
                      {d.total_assinados}/{d.total_signatarios}
                    </td>
                    <td style={{padding:'10px 4px',fontSize:11,color:'var(--text-muted)'}}>
                      {new Date(d.criado_em).toLocaleDateString('pt-BR')}
                      {d.users?.nome && <div>{d.users.nome}</div>}
                    </td>
                    <td style={{padding:'10px 4px',textAlign:'right',whiteSpace:'nowrap'}}>
                      {d.url_assinatura && <a href={d.url_assinatura} target="_blank" rel="noreferrer" style={{padding:'4px 10px',borderRadius:5,fontSize:11,border:'1px solid rgba(74,128,240,0.3)',background:'rgba(74,128,240,0.06)',color:'#7aa3f8',textDecoration:'none',marginRight:4}}>🔗 Link</a>}
                      {d.url_pdf_final && <a href={d.url_pdf_final} target="_blank" rel="noreferrer" style={{padding:'4px 10px',borderRadius:5,fontSize:11,border:'1px solid rgba(28,181,160,0.4)',background:'rgba(28,181,160,0.08)',color:'var(--teal)',textDecoration:'none'}}>📥 PDF</a>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal && (
        <div style={{position:'fixed',inset:0,background:'rgba(15,23,42,0.45)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',backdropFilter:'blur(6px)'}}
          onClick={e=>e.target===e.currentTarget&&setModal(false)}>
          <div style={{background:'#ffffff',border:'1px solid var(--border)',borderRadius:20,padding:'28px 32px',width:600,maxWidth:'95vw',maxHeight:'90vh',overflow:'auto'}}>
            <div style={{fontFamily:'DM Serif Display,serif',fontSize:18,marginBottom:18}}>+ Enviar documento para assinatura</div>

            <div style={{marginBottom:14}}>
              <label style={lbl}>Arquivo PDF *</label>
              <input type="file" accept="application/pdf" onChange={e=>setForm(f=>({...f,file:e.target.files?.[0]||null,nome:f.nome||(e.target.files?.[0]?.name.replace(/\.pdf$/i,'')||'')}))}
                style={{...inp,padding:'7px 13px'}} />
              {form.file && <div style={{fontSize:11,color:'var(--text-muted)',marginTop:4}}>{form.file.name} · {Math.round(form.file.size/1024)} KB</div>}
            </div>

            <div style={{marginBottom:14}}>
              <label style={lbl}>Nome do documento *</label>
              <input value={form.nome} onChange={e=>setForm(f=>({...f,nome:e.target.value}))} style={inp} />
            </div>

            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:14}}>
              <div>
                <label style={lbl}>Vincular a negócio (opcional)</label>
                <select value={form.negocio_id} onChange={e=>setForm(f=>({...f,negocio_id:e.target.value}))} style={{...inp,background:'#ffffff'}}>
                  <option value="">— nenhum —</option>
                  {negocios.map(n => <option key={n.id} value={n.id}>{n.titulo} {n.clientes?.nome ? `· ${n.clientes.nome}` : ''}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Vincular a cliente (opcional)</label>
                <select value={form.cliente_id} onChange={e=>setForm(f=>({...f,cliente_id:e.target.value}))} style={{...inp,background:'#ffffff'}}>
                  <option value="">— nenhum —</option>
                  {clientes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>
            </div>

            <div style={{marginBottom:14}}>
              <label style={lbl}>Signatários *</label>
              {form.signatarios.map((s, i) => (
                <div key={i} style={{display:'grid',gridTemplateColumns:'1fr 1fr auto',gap:8,marginBottom:6}}>
                  <input value={s.nome} onChange={e=>setForm(f=>{const a=[...f.signatarios];a[i]={...a[i],nome:e.target.value};return {...f,signatarios:a}})} placeholder="Nome" style={inp} />
                  <input value={s.email} onChange={e=>setForm(f=>{const a=[...f.signatarios];a[i]={...a[i],email:e.target.value};return {...f,signatarios:a}})} placeholder="email@exemplo.com" type="email" style={inp} />
                  <button onClick={()=>setForm(f=>({...f,signatarios:f.signatarios.filter((_,j)=>j!==i)}))}
                    disabled={form.signatarios.length===1}
                    style={{padding:'6px 10px',borderRadius:6,fontSize:11,border:'1px solid rgba(224,82,82,0.3)',background:'rgba(224,82,82,0.06)',color:'var(--red)',cursor:form.signatarios.length===1?'not-allowed':'pointer',opacity:form.signatarios.length===1?0.4:1}}>×</button>
                </div>
              ))}
              <button onClick={()=>setForm(f=>({...f,signatarios:[...f.signatarios,{nome:'',email:''}]}))}
                style={{padding:'5px 12px',borderRadius:6,fontSize:11,border:'1px solid var(--border)',background:'rgba(255,255,255,0.04)',color:'var(--gold)',cursor:'pointer',fontFamily:'DM Sans,sans-serif'}}>+ Adicionar signatário</button>
            </div>

            <div style={{marginBottom:18}}>
              <label style={lbl}>Mensagem (opcional)</label>
              <textarea value={form.mensagem} onChange={e=>setForm(f=>({...f,mensagem:e.target.value}))} rows={2} style={{...inp,resize:'none'}} placeholder="Mensagem que o signatário vai ver..." />
            </div>

            <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
              <button className="btn-secondary" onClick={()=>setModal(false)}>Cancelar</button>
              <button className="btn-primary" onClick={enviar} disabled={salvando||!form.file||!form.nome.trim()}>
                {salvando ? 'Enviando...' : '✓ Enviar para assinatura'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
