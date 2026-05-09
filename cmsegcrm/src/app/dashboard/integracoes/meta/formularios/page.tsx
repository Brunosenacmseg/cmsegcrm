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
    campo_map?: Record<string, any>
    titulo_campos?: string[]
    campo_negocio_map?: Record<string, string[]>
  }
}

// Linhas exibidas como campos da negociação. Cada uma vira uma key em
// campo_negocio_map e recebe uma lista ordenada de origens (chips) que
// serão concatenadas com " - " ao criar a negociação.
const LINHAS_NEGOCIO: Array<{ key: string; label: string; required?: boolean }> = [
  { key: 'negocio:titulo',           label: 'Título da negociação', required: true },
  { key: 'negocio:produto',          label: 'Produto' },
  { key: 'negocio:seguradora',       label: 'Seguradora' },
  { key: 'negocio:premio',           label: 'Prêmio' },
  { key: 'negocio:comissao_pct',     label: 'Comissão %' },
  { key: 'negocio:telefone_negocio', label: 'Telefone' },
  { key: 'negocio:email_negocio',    label: 'E-mail' },
  { key: 'negocio:placa',            label: 'Placa' },
  { key: 'negocio:cep',              label: 'CEP' },
  { key: 'negocio:vencimento',       label: 'Vencimento' },
  { key: 'negocio:fonte',            label: 'Fonte da negociação' },
  { key: 'negocio:obs',              label: 'Anotação da negociação' },
]

// Metadados expostos pelo webhook em valorPorKey (além das questions do form).
const META_CAMPOS: { key: string; label: string }[] = [
  { key: '__meta__:campaign_name', label: 'Campanha (nome)' },
  { key: '__meta__:adset_name',    label: 'Conjunto de anúncios (nome)' },
  { key: '__meta__:ad_name',       label: 'Anúncio (nome)' },
  { key: '__meta__:form_name',     label: 'Formulário (nome)' },
  { key: '__meta__:campaign_id',   label: 'Campanha (ID)' },
  { key: '__meta__:adset_id',      label: 'Conjunto (ID)' },
  { key: '__meta__:ad_id',         label: 'Anúncio (ID)' },
  { key: '__meta__:form_id',       label: 'Formulário (ID)' },
  { key: '__meta__:page_id',       label: 'Página (ID)' },
  { key: '__meta__:lead_id',       label: 'Lead (ID)' },
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
  const [diagnostico, setDiagnostico] = useState<any>(null)
  const [diagnosticando, setDiagnosticando] = useState(false)
  // picker aberto: identifica formulário + linha (coluna da negociação)
  const [picker, setPicker] = useState<{ form_id: string; col: string } | null>(null)

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
    const atual = form.mapeamento || { funil_id: null, etapa: null, vendedor_id: null, vendedor_ids: [], ativo: true, criar_negocio: true, campo_map: {}, titulo_campos: [], campo_negocio_map: {} }
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

  // Adiciona uma origem (chave do form ou __meta__:*) ao final da lista
  // de uma coluna da negociação em campo_negocio_map.
  function adicionarOrigem(form: Form, col: string, origem: string) {
    const m = form.mapeamento
    const mapAtual: Record<string, string[]> = { ...(m?.campo_negocio_map || {}) }
    const lista = Array.isArray(mapAtual[col]) ? [...mapAtual[col]] : []
    lista.push(origem)
    mapAtual[col] = lista
    salvarMapeamento(form, { campo_negocio_map: mapAtual })
  }

  // Remove a origem na posição idx da lista de uma coluna.
  function removerOrigem(form: Form, col: string, idx: number) {
    const m = form.mapeamento
    const mapAtual: Record<string, string[]> = { ...(m?.campo_negocio_map || {}) }
    const lista = Array.isArray(mapAtual[col]) ? [...mapAtual[col]] : []
    lista.splice(idx, 1)
    if (lista.length) mapAtual[col] = lista
    else delete mapAtual[col]
    salvarMapeamento(form, { campo_negocio_map: mapAtual })
  }

  // Resolve label legível para uma chave (questão do form, meta ou outra).
  function labelDeOrigem(form: Form, origem: string): { label: string; tipo: 'form' | 'meta' | 'outro' } {
    const meta = META_CAMPOS.find(c => c.key === origem)
    if (meta) return { label: meta.label, tipo: 'meta' }
    const q = form.questions?.find(x => x.key === origem)
    if (q) return { label: q.label || q.key, tipo: 'form' }
    return { label: origem, tipo: 'outro' }
  }

  async function removerMapeamento(form: Form) {
    if (!confirm(`Remover mapeamento do formulário "${form.nome}"?`)) return
    setSalvando(form.form_id)
    try {
      await fetch(`/api/meta/forms?form_id=${encodeURIComponent(form.form_id)}`, { method: 'DELETE', headers: await authHeaders() })
      setForms(prev => prev.map(x => x.form_id === form.form_id ? { ...x, mapeamento: null } : x))
    } finally { setSalvando(null) }
  }

  async function rodarDiagnostico() {
    setDiagnosticando(true)
    setDiagnostico(null)
    try {
      const r = await fetch('/api/meta/diagnose', { headers: await authHeaders() })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) {
        alert('❌ ' + (j.error || `HTTP ${r.status}`))
        return
      }
      setDiagnostico(j)
    } catch (e: any) {
      alert('❌ ' + (e?.message || 'erro de rede'))
    } finally { setDiagnosticando(false) }
  }

  async function enviarLeadTeste(form: Form) {
    setSalvando(form.form_id)
    try {
      const r = await fetch('/api/meta/webhook/test', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ form_id: form.form_id }),
      })
      const j = await r.json().catch(() => ({}))
      // Erros antes do pipeline (auth, form_id) vêm em `j.error`. Erros do
      // pipeline (RLS, constraint, etc.) vêm em `j.erros[]` mesmo com 500.
      if (!r.ok && !Array.isArray(j.erros)) {
        alert('❌ ' + (j.error || `HTTP ${r.status}`))
        return
      }
      const linhas: string[] = []
      linhas.push(
        r.ok && j.ok ? '✅ Lead de teste processado com sucesso.'
        : j.negocio_id ? '⚠ Lead processado parcialmente.'
        : '❌ Negociação não foi criada.'
      )
      linhas.push('')
      linhas.push(`Cliente:    ${j.cliente_id || '— não criado —'}`)
      linhas.push(`Negociação: ${j.negocio_id || '— não criada —'}`)
      if (j.vendedor_id) linhas.push(`Vendedor:   ${j.vendedor_id}`)
      if (j.motivo)      linhas.push(`Motivo:     ${j.motivo}`)
      if (Array.isArray(j.erros) && j.erros.length) {
        linhas.push('')
        linhas.push('Erros:')
        for (const e of j.erros) linhas.push(`  • ${e}`)
      }
      alert(linhas.join('\n'))
    } catch (e: any) {
      alert('❌ ' + (e?.message || 'erro de rede'))
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
        <button onClick={rodarDiagnostico} disabled={diagnosticando}
          style={{padding:'8px 14px',borderRadius:8,border:'1px solid var(--gold)',background:'var(--gold-soft)',color:'var(--gold)',cursor:diagnosticando?'wait':'pointer',fontSize:13,fontWeight:600}}>
          {diagnosticando ? '⏳ Diagnosticando…' : '🔬 Diagnosticar webhook'}
        </button>
      </div>

      {diagnostico && (
        <div onClick={() => setDiagnostico(null)} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.55)',backdropFilter:'blur(3px)',zIndex:900,display:'flex',alignItems:'flex-start',justifyContent:'center',padding:'20px 12px',overflow:'auto'}}>
          <div onClick={(e) => e.stopPropagation()} className="card" style={{maxWidth:780,width:'100%',padding:20,fontSize:13,lineHeight:1.55,overflowWrap:'anywhere',wordBreak:'break-word'}}>
            <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:14,flexWrap:'wrap'}}>
              <div style={{fontFamily:'DM Serif Display,serif',fontSize:18,flex:1,minWidth:0}}>🔬 Diagnóstico Meta → CRM</div>
              <button
                onClick={() => {
                  try {
                    navigator.clipboard.writeText(JSON.stringify(diagnostico, null, 2))
                    alert('JSON copiado para a área de transferência. Cola no chat.')
                  } catch { alert('Não foi possível copiar — abra o console do navegador.') }
                }}
                style={{padding:'6px 10px',borderRadius:6,border:'1px solid var(--gold)',background:'var(--gold-soft)',color:'var(--gold)',cursor:'pointer',fontSize:12,fontWeight:600}}
              >📋 Copiar JSON</button>
              <button onClick={() => setDiagnostico(null)} style={{background:'none',border:'none',color:'var(--text-muted)',fontSize:18,cursor:'pointer',padding:'4px 8px'}}>✕</button>
            </div>

            <div style={{marginBottom:16}}>
              <div style={{fontWeight:600,marginBottom:6}}>Configuração local</div>
              <div style={{paddingLeft:8,color:'var(--text-muted)',fontSize:12}}>
                Page: <code>{diagnostico.config?.page_id || '—'}</code><br/>
                App: <code>{diagnostico.config?.app_id || '—'}</code><br/>
                Ad Account: <code>{diagnostico.config?.ad_account_id || '—'}</code><br/>
                Page token: {diagnostico.config?.tem_page_access_token ? '✅' : '❌'} · User token: {diagnostico.config?.tem_user_access_token ? '✅' : '❌'} · webhook_subscribed (banco): {diagnostico.config?.webhook_subscribed_local ? '✅' : '❌'}
              </div>
            </div>

            <div style={{marginBottom:16}}>
              <div style={{fontWeight:600,marginBottom:6}}>1️⃣ Page subscribed_apps (Meta confirma a inscrição?)</div>
              {!diagnostico.subscribed_apps?.ok ? (
                <div style={{paddingLeft:8,color:'var(--red)',fontSize:12}}>❌ {diagnostico.subscribed_apps?.erro || diagnostico.subscribed_apps?.motivo || 'falhou'}</div>
              ) : (
                <div style={{paddingLeft:8,fontSize:12}}>
                  <div>{diagnostico.subscribed_apps.nosso_app_inscrito ? '✅' : '❌'} Nosso app está inscrito na page</div>
                  <div>{diagnostico.subscribed_apps.leadgen_subscribed ? '✅' : '❌'} Campo <code>leadgen</code> está nas <code>subscribed_fields</code></div>
                  {diagnostico.subscribed_apps.nosso_app && (
                    <div style={{color:'var(--text-muted)',marginTop:4}}>App: {diagnostico.subscribed_apps.nosso_app.name} · fields: {(diagnostico.subscribed_apps.nosso_app.subscribed_fields || []).join(', ') || '∅'}</div>
                  )}
                  {diagnostico.subscribed_apps.outros_apps?.length > 0 && (
                    <div style={{color:'var(--text-muted)',marginTop:4}}>Outros apps inscritos: {diagnostico.subscribed_apps.outros_apps.map((a: any) => a.name).join(', ')}</div>
                  )}
                </div>
              )}
            </div>

            <div style={{marginBottom:16}}>
              <div style={{fontWeight:600,marginBottom:6}}>2️⃣ Forms ativos × leads recebidos no Meta vs CRM</div>
              <div style={{paddingLeft:8,fontSize:12,color:'var(--text-muted)'}}>
                {(diagnostico.forms || []).length === 0 && <div>Nenhum form ativo mapeado.</div>}
                {(diagnostico.forms || []).map((f: any) => (
                  <div key={f.form_id} style={{marginBottom:8,paddingBottom:8,borderBottom:'1px solid var(--border-soft)'}}>
                    <div style={{color:'var(--text)'}}>
                      <code>{f.form_id}</code>{f.form_nome ? <> · {f.form_nome}</> : null}
                    </div>
                    {f.ok === false ? (
                      <div style={{color:'var(--red)',whiteSpace:'pre-wrap'}}>❌ Meta: {f.erro}</div>
                    ) : (
                      <div>
                        Meta (últimos 5): {f.leads_no_meta ?? '—'} · CRM: {f.leads_no_crm ?? '—'}<br/>
                        Último lead Meta: {f.ultimo_lead_meta || '—'}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div style={{marginBottom:16}}>
              <div style={{fontWeight:600,marginBottom:6}}>3️⃣ Campanhas no ad account</div>
              {!diagnostico.campanhas?.ok ? (
                <div style={{paddingLeft:8,color:'var(--red)',fontSize:12,whiteSpace:'pre-wrap'}}>❌ {diagnostico.campanhas?.erro || diagnostico.campanhas?.motivo || 'falhou'}</div>
              ) : (
                <div style={{paddingLeft:8,fontSize:12,color:'var(--text-muted)'}}>
                  <div>Total: {diagnostico.campanhas.total} · Ativas: {diagnostico.campanhas.ativas}</div>
                  {(diagnostico.campanhas.amostra || []).slice(0, 5).map((c: any) => (
                    <div key={c.id} style={{marginTop:2}}><code>{c.effective_status || c.status}</code> · {c.name}</div>
                  ))}
                </div>
              )}
            </div>

            <div style={{marginBottom:8}}>
              <div style={{fontWeight:600,marginBottom:6}}>4️⃣ Resumo do banco</div>
              <div style={{paddingLeft:8,fontSize:12,color:'var(--text-muted)'}}>
                meta_leads total: {diagnostico.crm?.leads_total} · testes: {diagnostico.crm?.leads_teste} · reais: {diagnostico.crm?.leads_reais}
              </div>
            </div>

            <details style={{marginTop:16,fontSize:11,color:'var(--text-muted)'}}>
              <summary style={{cursor:'pointer'}}>Ver JSON cru</summary>
              <pre style={{marginTop:8,padding:10,background:'rgba(0,0,0,0.25)',borderRadius:6,overflowX:'auto',fontSize:10,lineHeight:1.4,maxHeight:300}}>{JSON.stringify(diagnostico, null, 2)}</pre>
            </details>
          </div>
        </div>
      )}

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
            <div className="card" style={{marginBottom:18,background:'rgba(224,82,82,0.08)',borderColor:'rgba(224,82,82,0.3)',color:'var(--red)',fontSize:13,lineHeight:1.6}}>
              <div>❌ {erro}</div>
              {/^api access blocked/i.test(erro) && (
                <div style={{marginTop:10,paddingTop:10,borderTop:'1px solid rgba(224,82,82,0.25)',color:'var(--text)',fontSize:12}}>
                  <b>Como resolver:</b> abra <a href="/dashboard/integracoes/meta" style={{color:'var(--gold)'}}>Integrações → Meta</a> e cole um <b>Page Access Token</b> (campo dedicado). Esse token deve ter <code>leads_retrieval</code> e ser específico da Page, não do usuário.
                </div>
              )}
            </div>
          )}

          <div style={{fontSize:12,color:'var(--text-muted)',marginBottom:14,lineHeight:1.5}}>
            Para cada formulário do Meta Lead Ads abaixo, escolha em qual <b>funil</b>, <b>etapa</b> e <b>vendedor</b> a negociação deve ser criada quando alguém preencher.
            Formulários sem mapeamento ativo continuam caindo no funil padrão de venda, sem vendedor.
            <br/><b>Importante:</b> esta integração cria apenas a <b>negociação</b> — nenhum cliente é criado ou alterado.
            Em cada campo da negociação você pode <b>combinar várias origens</b> (campos do formulário ou dados da Meta); os valores são concatenados com <code style={{background:'rgba(255,255,255,0.05)',padding:'1px 4px',borderRadius:3}}>-</code>.
          </div>
          {picker && (
            <div onClick={()=>setPicker(null)} style={{position:'fixed',inset:0,zIndex:10}} />
          )}

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

                  {form.questions && form.questions.length > 0 && (() => {
                    const cfsNeg = customFields.filter(cf => cf.entidade === 'negocio')
                    const linhas: Array<{ key: string; label: string; required?: boolean; custom?: boolean }> = [
                      ...LINHAS_NEGOCIO,
                      ...cfsNeg.map(cf => ({ key: `negocio_cf:${cf.chave}`, label: `Negociação: ${cf.nome}`, custom: true })),
                    ]
                    const negMap = m?.campo_negocio_map || {}
                    return (
                      <div style={{marginTop:14,paddingTop:12,borderTop:'1px dashed var(--border)'}}>
                        <div style={{fontSize:10,color:'var(--text-muted)',marginBottom:8,textTransform:'uppercase',letterSpacing:1,fontWeight:600}}>
                          Campos da negociação
                        </div>
                        <div style={{fontSize:11,color:'var(--text-muted)',marginBottom:10,lineHeight:1.5}}>
                          Para cada campo, clique em <b>+ INSERIR INFOS</b> e escolha campos do formulário ou dados da Meta.
                          Quando houver mais de uma origem, os valores serão concatenados com <code style={{background:'rgba(255,255,255,0.05)',padding:'1px 4px',borderRadius:3}}>-</code>.
                        </div>

                        <div style={{display:'flex',flexDirection:'column',gap:8}}>
                          {linhas.map(lin => {
                            const origens = Array.isArray(negMap[lin.key]) ? negMap[lin.key] : []
                            const aberto = picker?.form_id === form.form_id && picker?.col === lin.key
                            const usados = new Set<string>(origens)
                            return (
                              <div key={lin.key} style={{position:'relative'}}>
                                <div style={{fontSize:12,color:'#1a1a2e',marginBottom:4,display:'flex',alignItems:'center',gap:6}}>
                                  {lin.custom && <span style={{color:'var(--gold)'}}>★</span>}
                                  <span style={{fontWeight:500}}>{lin.label}</span>
                                  <span style={{fontSize:10,color:lin.required?'var(--red)':'var(--text-muted)'}}>{lin.required ? '(obrigatório)' : '(opcional)'}</span>
                                </div>
                                <div style={{display:'flex',alignItems:'center',gap:6,padding:'6px 8px',minHeight:38,background:'#ffffff',border:'1px solid var(--border)',borderRadius:6,flexWrap:'wrap'}}>
                                  {origens.length === 0 && (
                                    <span style={{fontSize:11,color:'#9ca3af',flex:1}}>Digite ou insira informações</span>
                                  )}
                                  {origens.map((src, idx) => {
                                    const info = labelDeOrigem(form, src)
                                    const cor = info.tipo === 'meta' ? 'rgba(28,181,160,0.15)' : info.tipo === 'form' ? 'rgba(24,119,242,0.12)' : 'rgba(201,168,76,0.12)'
                                    const corBorda = info.tipo === 'meta' ? 'rgba(28,181,160,0.5)' : info.tipo === 'form' ? 'rgba(24,119,242,0.45)' : 'rgba(201,168,76,0.5)'
                                    const icone = info.tipo === 'meta' ? '📣' : info.tipo === 'form' ? '📝' : '•'
                                    return (
                                      <span key={idx} style={{display:'inline-flex',alignItems:'center',gap:6}}>
                                        <span style={{display:'inline-flex',alignItems:'center',gap:6,padding:'3px 8px',background:cor,border:`1px solid ${corBorda}`,borderRadius:14,fontSize:11,color:'#1a1a2e',maxWidth:300}}>
                                          <span style={{minWidth:14,height:14,display:'inline-flex',alignItems:'center',justifyContent:'center',background:'rgba(255,255,255,0.6)',color:'#1a1a2e',borderRadius:7,fontSize:9,fontWeight:700}}>{idx + 1}</span>
                                          <span style={{fontSize:11}}>{icone}</span>
                                          <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}} title={info.label}>{info.label}</span>
                                          <button onClick={()=>removerOrigem(form, lin.key, idx)} style={{background:'none',border:'none',cursor:'pointer',color:'#6b7280',fontSize:13,lineHeight:1,padding:0}}>×</button>
                                        </span>
                                        {idx < origens.length - 1 && <span style={{fontSize:11,color:'#6b7280'}}>-</span>}
                                      </span>
                                    )
                                  })}
                                  <div style={{flex:1}}/>
                                  <button onClick={()=>setPicker(aberto ? null : { form_id: form.form_id, col: lin.key })}
                                    style={{fontSize:11,fontWeight:600,color:'var(--teal)',background:'none',border:'none',cursor:'pointer',padding:'2px 6px',whiteSpace:'nowrap'}}>
                                    + INSERIR INFOS
                                  </button>
                                </div>

                                {aberto && (
                                  <div style={{position:'absolute',right:0,top:'100%',marginTop:4,zIndex:20,width:340,maxHeight:340,overflow:'auto',background:'#ffffff',border:'1px solid var(--border)',borderRadius:8,boxShadow:'0 8px 24px rgba(0,0,0,0.15)'}}>
                                    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'8px 10px',borderBottom:'1px solid var(--border)'}}>
                                      <span style={{fontSize:11,fontWeight:600,color:'#1a1a2e'}}>Inserir informação</span>
                                      <button onClick={()=>setPicker(null)} style={{background:'none',border:'none',color:'#6b7280',fontSize:14,cursor:'pointer',padding:0}}>×</button>
                                    </div>
                                    <div style={{padding:'6px 0'}}>
                                      <div style={{fontSize:9,color:'var(--text-muted)',padding:'4px 12px',textTransform:'uppercase',letterSpacing:0.6}}>Campos do formulário</div>
                                      {(form.questions || []).length === 0 && (
                                        <div style={{fontSize:11,color:'#9ca3af',padding:'4px 12px'}}>Sem perguntas no formulário</div>
                                      )}
                                      {(form.questions || []).map(q => (
                                        <button key={q.key} onClick={()=>{ adicionarOrigem(form, lin.key, q.key); setPicker(null) }}
                                          style={{display:'flex',alignItems:'center',gap:8,width:'100%',padding:'6px 12px',background: usados.has(q.key) ? 'rgba(24,119,242,0.05)' : 'none',border:'none',cursor:'pointer',textAlign:'left',fontSize:11,color:'#1a1a2e'}}>
                                          <span>📝</span>
                                          <span style={{flex:1,minWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{q.label || q.key}</span>
                                          {usados.has(q.key) && <span style={{fontSize:9,color:'var(--text-muted)'}}>já usado</span>}
                                        </button>
                                      ))}
                                      <div style={{fontSize:9,color:'var(--text-muted)',padding:'8px 12px 4px',textTransform:'uppercase',letterSpacing:0.6}}>Dados da Meta</div>
                                      {META_CAMPOS.map(c => (
                                        <button key={c.key} onClick={()=>{ adicionarOrigem(form, lin.key, c.key); setPicker(null) }}
                                          style={{display:'flex',alignItems:'center',gap:8,width:'100%',padding:'6px 12px',background: usados.has(c.key) ? 'rgba(28,181,160,0.06)' : 'none',border:'none',cursor:'pointer',textAlign:'left',fontSize:11,color:'#1a1a2e'}}>
                                          <span>📣</span>
                                          <span style={{flex:1,minWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{c.label}</span>
                                          {usados.has(c.key) && <span style={{fontSize:9,color:'var(--text-muted)'}}>já usado</span>}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })()}

                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginTop:12,paddingTop:10,borderTop:'1px solid var(--border)'}}>
                    <label style={{fontSize:11,color:'var(--text-muted)',display:'flex',gap:6,alignItems:'center',cursor:'pointer'}}>
                      <input type="checkbox" checked={m?.criar_negocio !== false}
                        onChange={e=>salvarMapeamento(form, { criar_negocio: e.target.checked })}/>
                      Criar negociação automaticamente
                    </label>
                    <div style={{display:'flex',gap:8,alignItems:'center'}}>
                      {salvando === form.form_id && <span style={{fontSize:11,color:'var(--gold)'}}>Salvando...</span>}
                      <button onClick={()=>enviarLeadTeste(form)} disabled={salvando === form.form_id}
                        style={{fontSize:11,padding:'4px 10px',borderRadius:6,border:'1px solid rgba(28,181,160,0.3)',background:'rgba(28,181,160,0.06)',color:'var(--teal)',cursor:'pointer'}}
                        title="Cria uma negociação fictícia usando o mapeamento atual, simulando o webhook da Meta">
                        🧪 Enviar lead de teste
                      </button>
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
