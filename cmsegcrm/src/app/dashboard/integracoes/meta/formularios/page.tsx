'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

type Form = {
  form_id: string
  nome: string
  status: string
  leads_count?: number
  criado_em?: string
  questions?: { key: string; label?: string; type?: string }[]
  mapeamento: null | {
    funil_id: string | null
    etapa: string | null
    vendedor_id: string | null
    vendedor_ids?: string[]
    ativo: boolean
    criar_negocio: boolean
    campo_map?: Record<string, string>
  }
}

const COLS_CLIENTE_PADRAO = [
  { val: 'cliente:nome',     label: 'Nome' },
  { val: 'cliente:cpf_cnpj', label: 'CPF/CNPJ' },
  { val: 'cliente:email',    label: 'E-mail' },
  { val: 'cliente:telefone', label: 'Telefone' },
  { val: 'cliente:cep',      label: 'CEP' },
  { val: 'cliente:cidade',   label: 'Cidade' },
  { val: 'cliente:estado',   label: 'Estado' },
  { val: 'cliente:fonte',    label: 'Fonte' },
]
const COLS_NEGOCIO_PADRAO = [
  { val: 'negocio:titulo',     label: 'Título' },
  { val: 'negocio:produto',    label: 'Produto' },
  { val: 'negocio:seguradora', label: 'Seguradora' },
  { val: 'negocio:premio',     label: 'Prêmio' },
  { val: 'negocio:comissao_pct', label: 'Comissão %' },
  { val: 'negocio:placa',      label: 'Placa' },
  { val: 'negocio:cep',        label: 'CEP' },
  { val: 'negocio:vencimento', label: 'Vencimento' },
  { val: 'negocio:obs',        label: 'Observações' },
]

export default function FormulariosMetaPage() {
  const supabase = createClient()
  const router = useRouter()
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [forms, setForms] = useState<Form[]>([])
  const [funis, setFunis] = useState<any[]>([])
  const [vendedores, setVendedores] = useState<any[]>([])
  const [customFields, setCustomFields] = useState<any[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState<string | null>(null)
  const [statusMeta, setStatusMeta] = useState<any>(null)

  useEffect(() => { init() }, [])

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

    const [{ data: f }, { data: u }, { data: cf }, statusR] = await Promise.all([
      supabase.from('funis').select('id, nome, tipo, emoji, etapas').order('ordem'),
      supabase.from('users').select('id, nome, email, role').order('nome'),
      supabase.from('campos_personalizados').select('entidade, chave, nome').eq('ativo', true).order('ordem'),
      fetch('/api/meta/connect', { headers: await authHeaders() }).then(r => r.json()).catch(() => null),
    ])
    setFunis(f || [])
    setVendedores(u || [])
    setCustomFields(cf || [])
    setStatusMeta(statusR)

    await carregarForms()
    setLoading(false)
  }

  async function carregarForms() {
    setErro(null)
    try {
      const r = await fetch('/api/meta/forms', { headers: await authHeaders() })
      const j = await r.json()
      if (!r.ok) { setErro(j.error || 'erro'); setForms([]); return }
      setForms(j.forms || [])
    } catch (e: any) {
      setErro(e.message)
    }
  }

  function loginMeta() {
    window.location.href = '/api/meta/oauth/start'
  }

  async function salvarMapeamento(form: Form, patch: Partial<NonNullable<Form['mapeamento']>>) {
    setSalvando(form.form_id)
    const atual = form.mapeamento || { funil_id: null, etapa: null, vendedor_id: null, vendedor_ids: [], ativo: true, criar_negocio: true, campo_map: {} }
    const novo = { ...atual, ...patch }
    try {
      await fetch('/api/meta/forms', {
        method: 'POST', headers: await authHeaders(),
        body: JSON.stringify({
          form_id: form.form_id, form_nome: form.nome,
          page_id: statusMeta?.page_id || null,
          ...novo,
        }),
      })
      setForms(prev => prev.map(x => x.form_id === form.form_id ? { ...x, mapeamento: novo } : x))
    } finally { setSalvando(null) }
  }
  function mapearCampo(form: Form, formKey: string, clienteCol: string) {
    const m = form.mapeamento || { funil_id: null, etapa: null, vendedor_id: null, ativo: true, criar_negocio: true, campo_map: {} }
    const cm = { ...(m.campo_map || {}) }
    if (clienteCol) cm[formKey] = clienteCol
    else delete cm[formKey]
    salvarMapeamento(form, { campo_map: cm })
  }

  async function removerMapeamento(form: Form) {
    if (!confirm(`Remover mapeamento do formulário "${form.nome}"?`)) return
    setSalvando(form.form_id)
    try {
      await fetch(`/api/meta/forms?form_id=${encodeURIComponent(form.form_id)}`, { method: 'DELETE', headers: await authHeaders() })
      setForms(prev => prev.map(x => x.form_id === form.form_id ? { ...x, mapeamento: null } : x))
    } finally { setSalvando(null) }
  }

  if (loading) return <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',color:'var(--text-muted)'}}>Carregando...</div>
  if (profile?.role !== 'admin') return (
    <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:10,color:'var(--text-muted)'}}>
      <div style={{fontSize:40}}>🔒</div><div>Apenas administradores.</div>
    </div>
  )

  const sel: React.CSSProperties = { width:'100%',padding:'7px 10px',borderRadius:6,border:'1px solid var(--border)',background:'#ffffff',color:'#1a1a2e',fontSize:12,cursor:'pointer' }

  return (
    <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
      <div style={{height:56,borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',padding:'0 28px',gap:12}}>
        <button onClick={()=>router.push('/dashboard/integracoes/meta')} style={{background:'none',border:'none',color:'var(--text-muted)',cursor:'pointer',fontSize:13}}>← Conexão Meta</button>
        <div style={{fontFamily:'DM Serif Display,serif',fontSize:18}}>📋 Formulários do Meta Lead Ads</div>
        <div style={{flex:1}}/>
        <button onClick={loginMeta} style={{padding:'8px 14px',borderRadius:8,border:'1px solid #1877f2',background:'#1877f2',color:'#fff',cursor:'pointer',fontSize:13,fontWeight:600}}>
          🔐 Login com Meta
        </button>
        <button onClick={carregarForms} style={{padding:'8px 14px',borderRadius:8,border:'1px solid var(--border)',background:'rgba(255,255,255,0.05)',color:'var(--text)',cursor:'pointer',fontSize:13}}>
          🔄 Atualizar
        </button>
      </div>

      <div style={{flex:1,overflow:'auto',padding:'24px 28px'}}>
        <div style={{maxWidth:1100,margin:'0 auto'}}>

          {!statusMeta?.conectado && (
            <div className="card" style={{marginBottom:18,background:'rgba(224,82,82,0.08)',borderColor:'rgba(224,82,82,0.3)'}}>
              <div style={{fontSize:13,color:'var(--red)',fontWeight:600,marginBottom:6}}>⚠ Meta não conectado</div>
              <div style={{fontSize:12,color:'var(--text-muted)'}}>
                Conecte primeiro em <a href="/dashboard/integracoes/meta" style={{color:'var(--teal)'}}>Integrações → Meta</a> ou clique em <b>Login com Meta</b>.
              </div>
            </div>
          )}

          {erro && (
            <div className="card" style={{marginBottom:18,background:'rgba(224,82,82,0.08)',borderColor:'rgba(224,82,82,0.3)',color:'var(--red)',fontSize:13}}>
              ❌ {erro}
            </div>
          )}

          <div style={{fontSize:12,color:'var(--text-muted)',marginBottom:14,lineHeight:1.5}}>
            Para cada formulário do Meta Lead Ads abaixo, escolha em qual <b>funil</b>, <b>etapa</b> e <b>vendedor</b> a negociação deve ser criada quando alguém preencher.
            Formulários sem mapeamento ativo continuam caindo no funil padrão de venda, sem vendedor.
          </div>

          {forms.length === 0 && !erro && (
            <div className="card" style={{textAlign:'center',padding:40,color:'var(--text-muted)'}}>
              Nenhum formulário encontrado nesta Page.
            </div>
          )}

          <div style={{display:'flex',flexDirection:'column',gap:12}}>
            {forms.map(form => {
              const m = form.mapeamento
              const funil = funis.find(f => f.id === m?.funil_id)
              return (
                <div key={form.form_id} className="card" style={{padding:'16px 18px',borderColor: m?.ativo ? 'rgba(28,181,160,0.3)' : 'var(--border)'}}>
                  <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:14}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:14,fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{form.nome}</div>
                      <div style={{fontSize:11,color:'var(--text-muted)',marginTop:3}}>
                        ID: <code style={{background:'rgba(255,255,255,0.05)',padding:'1px 5px',borderRadius:3}}>{form.form_id}</code>
                        {form.status && <> · status: <b>{form.status}</b></>}
                        {form.leads_count != null && <> · {form.leads_count} leads</>}
                      </div>
                    </div>
                    <label style={{display:'flex',alignItems:'center',gap:6,fontSize:12,color: m?.ativo?'var(--teal)':'var(--text-muted)',cursor:'pointer'}}>
                      <input type="checkbox" checked={!!m?.ativo}
                        onChange={e=>salvarMapeamento(form, { ativo: e.target.checked })}/>
                      {m?.ativo ? 'Ativo' : 'Desativado'}
                    </label>
                  </div>

                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10}}>
                    <div>
                      <div style={{fontSize:10,color:'var(--text-muted)',marginBottom:4,textTransform:'uppercase',letterSpacing:1}}>Funil</div>
                      <select value={m?.funil_id || ''} onChange={e=>salvarMapeamento(form, { funil_id: e.target.value || null, etapa: null })} style={sel}>
                        <option value="">— funil padrão (venda) —</option>
                        {funis.map(f => <option key={f.id} value={f.id}>{f.emoji||''} {f.nome}</option>)}
                      </select>
                    </div>
                    <div>
                      <div style={{fontSize:10,color:'var(--text-muted)',marginBottom:4,textTransform:'uppercase',letterSpacing:1}}>Etapa inicial</div>
                      <select value={m?.etapa || ''} onChange={e=>salvarMapeamento(form, { etapa: e.target.value || null })} style={sel} disabled={!funil}>
                        <option value="">— primeira etapa —</option>
                        {(funil?.etapas || []).map((et: string) => <option key={et} value={et}>{et}</option>)}
                      </select>
                    </div>
                    <div>
                      <div style={{fontSize:10,color:'var(--text-muted)',marginBottom:4,textTransform:'uppercase',letterSpacing:1}}>
                        Distribuição (round-robin)
                      </div>
                      <div style={{padding:8,background:'#ffffff',border:'1px solid var(--border)',borderRadius:6,maxHeight:140,overflow:'auto'}}>
                        {vendedores.length === 0 && <div style={{fontSize:11,color:'#6b7280'}}>Sem usuários</div>}
                        {vendedores.map(u => {
                          const ativo = (m?.vendedor_ids || []).includes(u.id)
                          return (
                            <label key={u.id} style={{display:'flex',alignItems:'center',gap:8,fontSize:12,padding:'4px 6px',cursor:'pointer',color:'#1a1a2e',borderRadius:4,background: ativo ? 'rgba(201,168,76,0.08)' : 'transparent'}}>
                              <input type="checkbox" checked={ativo} onChange={e=>{
                                const cur = new Set<string>(m?.vendedor_ids || [])
                                if (e.target.checked) cur.add(u.id); else cur.delete(u.id)
                                salvarMapeamento(form, { vendedor_ids: Array.from(cur), vendedor_id: cur.size === 1 ? Array.from(cur)[0] : null })
                              }} style={{accentColor:'var(--gold)'}}/>
                              <span style={{color:'#1a1a2e'}}>{u.nome || u.email}</span>
                            </label>
                          )
                        })}
                      </div>
                      <div style={{fontSize:10,color:'var(--text-muted)',marginTop:4}}>
                        {(m?.vendedor_ids || []).length === 0 ? 'Sem responsável fixo (sem distribuição)' :
                         (m?.vendedor_ids || []).length === 1 ? '1 vendedor — sempre ele' :
                         `${(m?.vendedor_ids || []).length} vendedores — distribui em sequência`}
                      </div>
                    </div>
                  </div>

                  {form.questions && form.questions.length > 0 && (
                    <div style={{marginTop:14,paddingTop:12,borderTop:'1px dashed var(--border)'}}>
                      <div style={{fontSize:10,color:'var(--text-muted)',marginBottom:8,textTransform:'uppercase',letterSpacing:1,fontWeight:600}}>
                        Mapeamento de campos do formulário
                      </div>
                      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                        {form.questions.map(q => {
                          const valorMap = (m?.campo_map || {})[q.key] || ''
                          return (
                            <div key={q.key} style={{display:'flex',gap:6,alignItems:'center',background:'rgba(255,255,255,0.03)',padding:'6px 8px',borderRadius:6,border:'1px solid var(--border)'}}>
                              <div style={{flex:1,minWidth:0,fontSize:11}}>
                                <div style={{fontWeight:600,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}} title={q.label || q.key}>
                                  {q.label || q.key}
                                </div>
                                <div style={{color:'var(--text-muted)',fontSize:10,fontFamily:'monospace'}}>{q.key}</div>
                              </div>
                              <span style={{fontSize:11,color:'var(--text-muted)'}}>→</span>
                              <select value={valorMap} onChange={e=>mapearCampo(form, q.key, e.target.value)}
                                style={{...sel,width:'auto',minWidth:200,padding:'4px 6px',fontSize:11}}>
                                <option value="">— ignorar —</option>
                                <optgroup label="Cliente — campos padrão">
                                  {COLS_CLIENTE_PADRAO.map(c => <option key={c.val} value={c.val}>{c.label}</option>)}
                                </optgroup>
                                {customFields.filter(cf => cf.entidade === 'cliente').length > 0 && (
                                  <optgroup label="Cliente — campos personalizados">
                                    {customFields.filter(cf => cf.entidade === 'cliente').map(cf =>
                                      <option key={cf.chave} value={`cliente_cf:${cf.chave}`}>{cf.nome}</option>
                                    )}
                                  </optgroup>
                                )}
                                <optgroup label="Negociação — campos padrão">
                                  {COLS_NEGOCIO_PADRAO.map(c => <option key={c.val} value={c.val}>{c.label}</option>)}
                                </optgroup>
                                {customFields.filter(cf => cf.entidade === 'negocio').length > 0 && (
                                  <optgroup label="Negociação — campos personalizados">
                                    {customFields.filter(cf => cf.entidade === 'negocio').map(cf =>
                                      <option key={cf.chave} value={`negocio_cf:${cf.chave}`}>{cf.nome}</option>
                                    )}
                                  </optgroup>
                                )}
                              </select>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginTop:12,paddingTop:10,borderTop:'1px solid var(--border)'}}>
                    <label style={{fontSize:11,color:'var(--text-muted)',display:'flex',gap:6,alignItems:'center',cursor:'pointer'}}>
                      <input type="checkbox" checked={m?.criar_negocio !== false}
                        onChange={e=>salvarMapeamento(form, { criar_negocio: e.target.checked })}/>
                      Criar negociação automaticamente
                    </label>
                    <div style={{display:'flex',gap:8,alignItems:'center'}}>
                      {salvando === form.form_id && <span style={{fontSize:11,color:'var(--gold)'}}>Salvando...</span>}
                      {m && <button onClick={()=>removerMapeamento(form)} style={{fontSize:11,padding:'4px 10px',borderRadius:6,border:'1px solid rgba(224,82,82,0.3)',background:'rgba(224,82,82,0.06)',color:'var(--red)',cursor:'pointer'}}>Remover</button>}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
