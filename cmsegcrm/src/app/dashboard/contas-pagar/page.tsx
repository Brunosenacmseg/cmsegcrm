'use client'
import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

type Tipo = 'conta' | 'compra_aprovacao'
type Status = 'pendente' | 'aprovado' | 'pago' | 'recusado'

const STATUS_COR: Record<Status, string> = {
  pendente: 'var(--warning)',
  aprovado: '#7aa3f8',
  pago:     'var(--teal)',
  recusado: 'var(--red)',
}

export default function ContasPagarPage() {
  const supabase = createClient()
  const router = useRouter()

  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [aba, setAba] = useState<Tipo>('conta')
  const [filtroStatus, setFiltroStatus] = useState<'todos' | Status>('todos')
  const [contas, setContas] = useState<any[]>([])
  const [categorias, setCategorias] = useState<any[]>([])

  const [modal, setModal] = useState(false)
  const empty = { nome:'', valor:'', vencimento:'', descricao:'', fornecedor:'', categoria_id:'', file:null as File|null }
  const [form, setForm] = useState<any>(empty)
  const [salvando, setSalvando] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const [criandoCat, setCriandoCat] = useState(false)
  const [novaCat, setNovaCat] = useState({ codigo:'', nome:'' })

  // Modal de pagar (admin escolhe categoria + forma)
  const [modalPagar, setModalPagar] = useState<any>(null)
  const [formPagar, setFormPagar] = useState({ categoria_id:'', forma_pagto:'PIX', data_pagamento: new Date().toISOString().slice(0,10), obs:'' })

  useEffect(() => { init() }, [])
  useEffect(() => { if (profile) carregar() }, [profile, aba, filtroStatus])

  async function init() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    const { data: prof } = await supabase.from('users').select('*').eq('id', user.id).single()
    setProfile(prof)
    const { data: cats } = await supabase.from('financeiro_categorias').select('*').eq('ativo', true).order('codigo')
    setCategorias(cats || [])
    setLoading(false)
  }

  async function carregar() {
    let q = supabase.from('contas_pagar')
      .select('*, criado:criado_por(nome), aprovado:aprovado_por(nome), pago:pago_por(nome), anexo:anexo_id(path,bucket,nome_arquivo), categoria:categoria_id(codigo,nome)')
      .eq('tipo', aba)
      .order('vencimento', { ascending: true })
    if (filtroStatus !== 'todos') q = q.eq('status', filtroStatus)
    const { data } = await q
    setContas(data || [])
  }

  async function salvar() {
    if (!form.nome.trim() || !form.valor || !form.vencimento) return
    if (!profile?.id) return
    setSalvando(true)
    let anexoId: string | null = null
    try {
      if (form.file) {
        const ts = Date.now()
        const safe = form.file.name.replace(/[^\w.\-]/g,'_')
        const path = `contas_pagar/${profile.id}/${ts}_${safe}`
        const { error: errUp } = await supabase.storage.from('cmsegcrm').upload(path, form.file)
        if (errUp) { alert('Erro upload PDF: '+errUp.message); setSalvando(false); return }
        const { data: anx } = await supabase.from('anexos').insert({
          bucket:'cmsegcrm', path, nome_arquivo: form.file.name,
          tipo_mime: form.file.type, tamanho_kb: Math.round(form.file.size/1024),
          categoria: 'outro', user_id: profile.id,
        }).select('id').single()
        anexoId = anx?.id || null
      }
      const valor = parseFloat(String(form.valor).replace(/[R$\s.]/g,'').replace(',','.'))
      const { error } = await supabase.from('contas_pagar').insert({
        tipo: aba,
        nome: form.nome.trim(),
        valor,
        vencimento: form.vencimento,
        descricao: form.descricao || null,
        fornecedor: form.fornecedor || null,
        categoria_id: form.categoria_id || null,
        anexo_id: anexoId,
        criado_por: profile.id,
      })
      if (error) { alert('Erro: '+error.message); return }
      setModal(false); setForm(empty)
      await carregar()
    } finally { setSalvando(false) }
  }

  async function authHeaders() {
    const { data: { session } } = await supabase.auth.getSession()
    const h: Record<string,string> = { 'Content-Type':'application/json' }
    if (session?.access_token) h['Authorization'] = `Bearer ${session.access_token}`
    return h
  }

  async function aprovar(c: any) {
    const ok = confirm(`Aprovar "${c.nome}" — R$ ${Number(c.valor).toLocaleString('pt-BR',{minimumFractionDigits:2})}?`)
    if (!ok) return
    const r = await fetch('/api/contas-pagar/acao', { method:'POST', headers:await authHeaders(),
      body: JSON.stringify({ conta_id: c.id, acao: 'aprovar' })
    })
    const j = await r.json(); if (!r.ok) alert('Erro: '+j.error); await carregar()
  }

  async function recusar(c: any) {
    const obs = prompt('Motivo da recusa (opcional):', '')
    if (obs === null) return
    const r = await fetch('/api/contas-pagar/acao', { method:'POST', headers:await authHeaders(),
      body: JSON.stringify({ conta_id: c.id, acao: 'recusar', obs: obs || undefined })
    })
    const j = await r.json(); if (!r.ok) alert('Erro: '+j.error); await carregar()
  }

  function abrirPagar(c: any) {
    setFormPagar({
      categoria_id: c.categoria_id || '',
      forma_pagto:  c.forma_pagto || 'PIX',
      data_pagamento: new Date().toISOString().slice(0,10),
      obs: '',
    })
    setModalPagar(c)
  }

  async function confirmarPagar() {
    if (!modalPagar) return
    const r = await fetch('/api/contas-pagar/acao', { method:'POST', headers:await authHeaders(),
      body: JSON.stringify({ conta_id: modalPagar.id, acao: 'pagar', ...formPagar })
    })
    const j = await r.json()
    if (!r.ok) { alert('Erro: '+j.error); return }
    setModalPagar(null); await carregar()
  }

  async function excluir(c: any) {
    if (!confirm(`Excluir "${c.nome}"?`)) return
    await supabase.from('contas_pagar').delete().eq('id', c.id)
    await carregar()
  }

  async function baixarAnexo(anexo: any) {
    const { data } = await supabase.storage.from(anexo.bucket||'cmsegcrm').createSignedUrl(anexo.path, 60*60)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  if (loading) return <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',color:'var(--text-muted)'}}>Carregando...</div>

  const isAdmin = profile?.role === 'admin'
  const fmt = (n: number) => Number(n||0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const inp: React.CSSProperties = { width:'100%', background:'rgba(255,255,255,0.05)', border:'1px solid var(--border)', borderRadius:8, padding:'9px 13px', color:'var(--text)', fontSize:13, outline:'none', boxSizing:'border-box' as const, fontFamily:'DM Sans,sans-serif' }
  const lbl: React.CSSProperties = { fontSize:11, fontWeight:600, letterSpacing:'1px', textTransform:'uppercase', color:'var(--text-muted)', display:'block', marginBottom:5 }

  const totalPendente = contas.filter(c => c.status === 'pendente').reduce((s,c) => s + Number(c.valor||0), 0)
  const totalAprovado = contas.filter(c => c.status === 'aprovado').reduce((s,c) => s + Number(c.valor||0), 0)
  const totalPago     = contas.filter(c => c.status === 'pago'    ).reduce((s,c) => s + Number(c.valor||0), 0)

  return (
    <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
      <div style={{height:56,borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',padding:'0 28px',gap:12,background:'var(--bg-soft)'}}>
        <div style={{fontFamily:'DM Serif Display,serif',fontSize:18,flex:1}}>💳 Contas a Pagar</div>
        <button onClick={()=>{setForm(empty);setModal(true)}} className="btn-primary" style={{padding:'7px 14px',fontSize:12}}>
          + Lançar {aba === 'conta' ? 'conta' : 'compra'}
        </button>
      </div>

      <div style={{flex:1,overflow:'auto',padding:'24px 28px'}}>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(180px, 1fr))',gap:14,marginBottom:20}}>
          <div className="kpi kpi-warning">
            <div className="kpi-label">Pendentes</div>
            <div className="kpi-value kpi-value-warning">R$ {fmt(totalPendente)}</div>
          </div>
          <div className="kpi">
            <div className="kpi-label">Aprovadas</div>
            <div className="kpi-value" style={{color:'#7aa3f8'}}>R$ {fmt(totalAprovado)}</div>
          </div>
          <div className="kpi kpi-success">
            <div className="kpi-label">Pagas</div>
            <div className="kpi-value kpi-value-success">R$ {fmt(totalPago)}</div>
          </div>
        </div>

        <div style={{display:'flex',gap:0,borderBottom:'1px solid var(--border)',marginBottom:18}}>
          {([['conta','💳 Contas a Pagar'],['compra_aprovacao','🛒 Compras para Aprovação']] as [Tipo,string][]).map(([k,l])=>(
            <button key={k} onClick={()=>setAba(k)}
              style={{padding:'10px 20px',fontSize:13,cursor:'pointer',border:'none',background:'transparent',color:aba===k?'var(--gold)':'var(--text-muted)',fontWeight:aba===k?600:400,borderBottom:aba===k?'2px solid var(--gold)':'2px solid transparent',marginBottom:-1,fontFamily:'DM Sans,sans-serif'}}>{l}</button>
          ))}
        </div>

        <div style={{display:'flex',gap:6,marginBottom:18,flexWrap:'wrap'}}>
          {(['todos','pendente','aprovado','pago','recusado'] as const).map(s => (
            <button key={s} onClick={()=>setFiltroStatus(s as any)}
              style={{padding:'5px 12px',borderRadius:6,fontSize:11,cursor:'pointer',border:'1px solid '+(filtroStatus===s?'var(--gold)':'var(--border)'),background:filtroStatus===s?'rgba(201,168,76,0.10)':'rgba(255,255,255,0.04)',color:filtroStatus===s?'var(--gold)':'var(--text-muted)',textTransform:'capitalize',fontWeight:600}}>{s}</button>
          ))}
        </div>

        {contas.length === 0 ? (
          <div className="card" style={{padding:'40px 20px',textAlign:'center',color:'var(--text-muted)'}}>
            <div style={{fontSize:40,marginBottom:12}}>{aba==='conta'?'💳':'🛒'}</div>
            <div style={{marginBottom:10}}>
              {aba === 'conta' ? 'Nenhuma conta cadastrada.' : 'Nenhuma compra para aprovação.'}
            </div>
            <button onClick={()=>{setForm(empty);setModal(true)}} className="btn-primary">+ Lançar primeira</button>
          </div>
        ) : (
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill, minmax(340px, 1fr))',gap:14}}>
            {contas.map(c => {
              const venceuHa = Math.floor((Date.now() - new Date(c.vencimento+'T12:00:00').getTime()) / 86400000)
              return (
                <div key={c.id} className="card" style={{display:'flex',flexDirection:'column',borderLeft:`3px solid ${STATUS_COR[c.status as Status]}`}}>
                  <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:8,gap:8}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontFamily:'DM Serif Display,serif',fontSize:16}}>{c.nome}</div>
                      {c.fornecedor && <div style={{fontSize:11,color:'var(--text-muted)'}}>{c.fornecedor}</div>}
                    </div>
                    <span style={{fontSize:10,fontWeight:700,padding:'3px 9px',borderRadius:5,background:STATUS_COR[c.status as Status]+'22',color:STATUS_COR[c.status as Status],border:'1px solid '+STATUS_COR[c.status as Status]+'66',textTransform:'uppercase',letterSpacing:1}}>
                      {c.status}
                    </span>
                  </div>

                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:10}}>
                    <div>
                      <div style={{fontSize:9,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:1}}>Valor</div>
                      <div style={{fontSize:18,fontWeight:600,color:'var(--gold)',fontFamily:'DM Serif Display,serif'}}>R$ {fmt(c.valor)}</div>
                    </div>
                    <div>
                      <div style={{fontSize:9,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:1}}>Vencimento</div>
                      <div style={{fontSize:13,fontWeight:500}}>{new Date(c.vencimento+'T12:00:00').toLocaleDateString('pt-BR')}</div>
                      {c.status==='pendente' && venceuHa > 0 && <div style={{fontSize:10,color:'var(--red)'}}>{venceuHa}d atraso</div>}
                      {c.status==='pendente' && venceuHa < 0 && venceuHa > -5 && <div style={{fontSize:10,color:'var(--warning)'}}>{-venceuHa}d</div>}
                    </div>
                  </div>

                  {c.descricao && <div style={{fontSize:12,color:'var(--text-muted)',marginBottom:10,whiteSpace:'pre-wrap'}}>{c.descricao}</div>}

                  <div style={{fontSize:10,color:'var(--text-muted)',marginBottom:10}}>
                    Lançado por {c.criado?.nome || '—'} · {new Date(c.criado_em).toLocaleDateString('pt-BR')}
                    {c.aprovado_por && <> · Aprovado por <strong>{c.aprovado?.nome}</strong></>}
                    {c.pago_por && <> · Pago por <strong>{c.pago?.nome}</strong></>}
                    {c.categoria && <> · {c.categoria.codigo} {c.categoria.nome}</>}
                  </div>
                  {c.obs_admin && <div style={{fontSize:11,padding:'5px 8px',background:'rgba(255,255,255,0.04)',borderRadius:6,marginBottom:8,fontStyle:'italic'}}>💬 {c.obs_admin}</div>}

                  <div style={{display:'flex',gap:6,marginTop:'auto',flexWrap:'wrap'}}>
                    {c.anexo && (
                      <button onClick={()=>baixarAnexo(c.anexo)} style={{padding:'5px 10px',borderRadius:6,fontSize:11,border:'1px solid var(--border)',background:'rgba(255,255,255,0.04)',color:'var(--gold)',cursor:'pointer'}}>📄 Ver PDF</button>
                    )}
                    {isAdmin && c.status === 'pendente' && (
                      <>
                        {aba === 'compra_aprovacao' && (
                          <button onClick={()=>aprovar(c)} style={{padding:'5px 12px',borderRadius:6,fontSize:11,border:'1px solid rgba(74,128,240,0.4)',background:'rgba(74,128,240,0.10)',color:'#7aa3f8',cursor:'pointer'}}>✓ Aprovar</button>
                        )}
                        <button onClick={()=>abrirPagar(c)} style={{padding:'5px 12px',borderRadius:6,fontSize:11,border:'1px solid rgba(28,181,160,0.4)',background:'rgba(28,181,160,0.10)',color:'var(--teal)',cursor:'pointer'}}>💸 Pagar</button>
                        <button onClick={()=>recusar(c)} style={{padding:'5px 10px',borderRadius:6,fontSize:11,border:'1px solid rgba(224,82,82,0.3)',background:'rgba(224,82,82,0.06)',color:'var(--red)',cursor:'pointer'}}>✕ Recusar</button>
                      </>
                    )}
                    {isAdmin && c.status === 'aprovado' && (
                      <button onClick={()=>abrirPagar(c)} style={{padding:'5px 12px',borderRadius:6,fontSize:11,border:'1px solid rgba(28,181,160,0.4)',background:'rgba(28,181,160,0.10)',color:'var(--teal)',cursor:'pointer'}}>💸 Pagar</button>
                    )}
                    {(isAdmin || (c.criado_por === profile?.id && c.status === 'pendente')) && (
                      <button onClick={()=>excluir(c)} style={{padding:'5px 8px',borderRadius:6,fontSize:11,border:'1px solid rgba(224,82,82,0.3)',background:'transparent',color:'var(--red)',cursor:'pointer'}}>🗑</button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {modal && (
        <div style={{position:'fixed',inset:0,background:'rgba(15,23,42,0.45)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',backdropFilter:'blur(6px)'}}
          onClick={e=>e.target===e.currentTarget&&setModal(false)}>
          <div style={{background:'#ffffff',border:'1px solid var(--border)',borderRadius:20,padding:'28px 32px',width:540,maxWidth:'95vw',maxHeight:'90vh',overflow:'auto'}}>
            <div style={{fontFamily:'DM Serif Display,serif',fontSize:18,marginBottom:18}}>
              + Lançar {aba === 'conta' ? 'conta a pagar' : 'compra para aprovação'}
            </div>

            <div style={{marginBottom:14}}>
              <label style={lbl}>Categoria *</label>
              {!criandoCat ? (
                <select
                  value={form.categoria_id}
                  onChange={e=>{
                    const v = e.target.value
                    if (v === '__nova__') { setCriandoCat(true); setNovaCat({ codigo:'', nome:'' }); return }
                    const cat = categorias.find(c => c.id === v)
                    setForm((f:any)=>({
                      ...f,
                      categoria_id: v,
                      nome: cat ? `${cat.codigo} ${cat.nome}` : f.nome,
                    }))
                  }}
                  style={{...inp,background:'#0e2040'}}>
                  <option value="" style={{background:'#0e2040'}}>— selecionar —</option>
                  {categorias.map(c => (
                    <option key={c.id} value={c.id} style={{background:'#0e2040'}}>{c.codigo} {c.nome}</option>
                  ))}
                  <option value="__nova__" style={{background:'#0e2040'}}>+ Criar nova categoria…</option>
                </select>
              ) : (
                <div style={{display:'grid',gridTemplateColumns:'120px 1fr auto auto',gap:8,alignItems:'center'}}>
                  <input value={novaCat.codigo} onChange={e=>setNovaCat(n=>({...n,codigo:e.target.value}))}
                    placeholder="Código (ex: 4.3.30)" style={inp} />
                  <input value={novaCat.nome} onChange={e=>setNovaCat(n=>({...n,nome:e.target.value}))}
                    placeholder="Nome da categoria" style={inp} />
                  <button className="btn-primary" style={{padding:'7px 14px',fontSize:12}}
                    disabled={!novaCat.codigo.trim() || !novaCat.nome.trim()}
                    onClick={async()=>{
                      const { data, error } = await supabase
                        .from('financeiro_categorias')
                        .insert({ codigo: novaCat.codigo.trim(), nome: novaCat.nome.trim(), tipo:'despesa' })
                        .select().single()
                      if (error) { alert('Erro ao criar categoria: '+error.message); return }
                      setCategorias(cs => [...cs, data].sort((a,b)=>String(a.codigo).localeCompare(String(b.codigo))))
                      setForm((f:any)=>({...f, categoria_id: data.id, nome:`${data.codigo} ${data.nome}`}))
                      setCriandoCat(false)
                    }}>Criar</button>
                  <button className="btn-secondary" style={{padding:'7px 14px',fontSize:12}}
                    onClick={()=>setCriandoCat(false)}>Cancelar</button>
                </div>
              )}
            </div>

            <div style={{marginBottom:14}}>
              <label style={lbl}>Nome / referência *</label>
              <input value={form.nome} onChange={e=>setForm((f:any)=>({...f,nome:e.target.value}))}
                placeholder='Ex: "Aluguel matriz - março/26"' style={inp} />
            </div>

            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:14}}>
              <div>
                <label style={lbl}>Valor (R$) *</label>
                <input value={form.valor} onChange={e=>setForm((f:any)=>({...f,valor:e.target.value}))}
                  placeholder="0,00" style={inp} />
              </div>
              <div>
                <label style={lbl}>Vencimento *</label>
                <input type="date" value={form.vencimento} onChange={e=>setForm((f:any)=>({...f,vencimento:e.target.value}))} style={inp} />
              </div>
            </div>

            <div style={{marginBottom:14}}>
              <label style={lbl}>Descrição</label>
              <textarea value={form.descricao} onChange={e=>setForm((f:any)=>({...f,descricao:e.target.value}))} rows={3}
                placeholder="Detalhes, observações..." style={{...inp,resize:'none'}} />
            </div>

            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:18}}>
              <div>
                <label style={lbl}>Fornecedor</label>
                <input value={form.fornecedor} onChange={e=>setForm((f:any)=>({...f,fornecedor:e.target.value}))}
                  placeholder="Razão social/CNPJ" style={inp} />
              </div>
              <div>
                <label style={lbl}>Anexar PDF/Boleto</label>
                <input ref={fileRef} type="file" accept="application/pdf,image/*"
                  onChange={e=>setForm((f:any)=>({...f,file:e.target.files?.[0]||null}))}
                  style={{...inp,padding:'7px 13px'}} />
                {form.file && <div style={{fontSize:10,color:'var(--text-muted)',marginTop:4}}>{form.file.name} · {Math.round(form.file.size/1024)} KB</div>}
              </div>
            </div>

            <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
              <button className="btn-secondary" onClick={()=>setModal(false)}>Cancelar</button>
              <button className="btn-primary" onClick={salvar} disabled={salvando||!form.nome||!form.valor||!form.vencimento}>
                {salvando ? 'Salvando...' : '✓ Lançar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {modalPagar && (
        <div style={{position:'fixed',inset:0,background:'rgba(15,23,42,0.45)',zIndex:300,display:'flex',alignItems:'center',justifyContent:'center',backdropFilter:'blur(6px)'}}
          onClick={e=>e.target===e.currentTarget&&setModalPagar(null)}>
          <div style={{background:'#ffffff',border:'1px solid var(--border)',borderRadius:20,padding:'28px 32px',width:480,maxWidth:'95vw',maxHeight:'90vh',overflow:'auto'}}>
            <div style={{fontFamily:'DM Serif Display,serif',fontSize:18,marginBottom:6,color:'var(--teal)'}}>💸 Pagar conta</div>
            <div style={{fontSize:13,marginBottom:18}}>
              <strong>{modalPagar.nome}</strong> · R$ {fmt(modalPagar.valor)}
            </div>

            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:14}}>
              <div>
                <label style={lbl}>Categoria DRE</label>
                <select value={formPagar.categoria_id} onChange={e=>setFormPagar(f=>({...f,categoria_id:e.target.value}))} style={{...inp,background:'#ffffff'}}>
                  <option value="">— sem categoria —</option>
                  {categorias.map(c => <option key={c.id} value={c.id}>{c.codigo} {c.nome}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Forma pagto</label>
                <select value={formPagar.forma_pagto} onChange={e=>setFormPagar(f=>({...f,forma_pagto:e.target.value}))} style={{...inp,background:'#ffffff'}}>
                  {['PIX','BOLETO','TED','CARTÃO DE CRÉDITO','DÉBITO COMISSÃO','DINHEIRO'].map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
            </div>

            <div style={{marginBottom:14}}>
              <label style={lbl}>Data do pagamento</label>
              <input type="date" value={formPagar.data_pagamento} onChange={e=>setFormPagar(f=>({...f,data_pagamento:e.target.value}))} style={inp} />
            </div>

            <div style={{marginBottom:18}}>
              <label style={lbl}>Observação (opcional)</label>
              <input value={formPagar.obs} onChange={e=>setFormPagar(f=>({...f,obs:e.target.value}))} style={inp} placeholder="Comprovante, etc" />
            </div>

            <div style={{fontSize:11,color:'var(--text-muted)',padding:'8px 12px',background:'rgba(28,181,160,0.06)',border:'1px solid rgba(28,181,160,0.25)',borderRadius:8,marginBottom:18}}>
              💡 Ao confirmar, será criada automaticamente uma despesa em <strong>Financeiro / DRE</strong> com a data do pagamento.
            </div>

            <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
              <button className="btn-secondary" onClick={()=>setModalPagar(null)}>Cancelar</button>
              <button onClick={confirmarPagar} style={{padding:'9px 18px',borderRadius:8,fontSize:13,fontWeight:600,cursor:'pointer',border:'1px solid rgba(28,181,160,0.4)',background:'rgba(28,181,160,0.15)',color:'var(--teal)',fontFamily:'DM Sans,sans-serif'}}>
                💸 Confirmar pagamento
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
