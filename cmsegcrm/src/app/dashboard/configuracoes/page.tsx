'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

type Aba = 'motivos' | 'produtos' | 'campos' | 'templates'

export default function ConfiguracoesPage() {
  const supabase = createClient()
  const router = useRouter()

  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [aba, setAba] = useState<Aba>('motivos')

  const [motivos, setMotivos] = useState<any[]>([])
  const [produtos, setProdutos] = useState<any[]>([])
  const [campos, setCampos] = useState<any[]>([])

  // Form campo personalizado
  const emptyCampo = { entidade:'negocio', nome:'', chave:'', tipo:'texto', opcoes:'', obrigatorio:false }
  const [novoCampo, setNovoCampo] = useState<any>(emptyCampo)
  const [editCampo, setEditCampo] = useState<any>(null)

  // Templates de email (assinatura)
  const [templates, setTemplates] = useState<any[]>([])
  const emptyTemplate = { nome:'', categoria:'assinatura', assunto:'', mensagem:'', is_default:false }
  const [editTemplate, setEditTemplate] = useState<any>(null)
  const [modalTemplate, setModalTemplate] = useState(false)
  const [formTemplate, setFormTemplate] = useState<any>(emptyTemplate)

  // Form motivo
  const [novoMotivo, setNovoMotivo] = useState('')
  const [editMotivo, setEditMotivo] = useState<any>(null)

  // Form produto
  const [novoProduto, setNovoProduto] = useState({ nome: '', preco_base: '' })
  const [editProduto, setEditProduto] = useState<any>(null)

  useEffect(() => { init() }, [])

  async function init() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    const { data: prof } = await supabase.from('users').select('*').eq('id', user.id).single()
    if (prof?.role !== 'admin') { router.push('/dashboard'); return }
    setProfile(prof)
    await carregar()
    setLoading(false)
  }

  async function carregar() {
    const [{ data: m }, { data: p }, { data: c }, { data: t }] = await Promise.all([
      supabase.from('motivos_perda').select('*').order('ordem').order('nome'),
      supabase.from('produtos').select('*').order('nome'),
      supabase.from('campos_personalizados').select('*').order('entidade').order('ordem').order('nome'),
      supabase.from('email_templates').select('*').order('categoria').order('nome'),
    ])
    setMotivos(m || [])
    setProdutos(p || [])
    setCampos(c || [])
    setTemplates(t || [])
  }

  async function salvarTemplate() {
    if (!formTemplate.nome.trim() || !formTemplate.mensagem.trim()) return
    const payload: any = {
      nome: formTemplate.nome.trim(),
      categoria: formTemplate.categoria,
      assunto: formTemplate.assunto || null,
      mensagem: formTemplate.mensagem,
      is_default: !!formTemplate.is_default,
      criado_por: profile?.id,
    }
    // Se marcando default, desmarca os outros da mesma categoria primeiro
    if (formTemplate.is_default) {
      await supabase.from('email_templates').update({ is_default: false })
        .eq('categoria', formTemplate.categoria).neq('id', editTemplate?.id || '00000000-0000-0000-0000-000000000000')
    }
    if (editTemplate) {
      const { error } = await supabase.from('email_templates').update(payload).eq('id', editTemplate.id)
      if (error) { alert('Erro: '+error.message); return }
    } else {
      const { error } = await supabase.from('email_templates').insert(payload)
      if (error) { alert('Erro: '+error.message); return }
    }
    setModalTemplate(false); setEditTemplate(null); setFormTemplate(emptyTemplate)
    await carregar()
  }

  async function excluirTemplate(id: string, nome: string) {
    if (!confirm(`Excluir o template "${nome}"?`)) return
    await supabase.from('email_templates').delete().eq('id', id)
    await carregar()
  }

  async function toggleTemplateAtivo(t: any) {
    await supabase.from('email_templates').update({ ativo: !t.ativo }).eq('id', t.id)
    await carregar()
  }

  async function tornarDefault(t: any) {
    await supabase.from('email_templates').update({ is_default: false }).eq('categoria', t.categoria)
    await supabase.from('email_templates').update({ is_default: true }).eq('id', t.id)
    await carregar()
  }

  function slugify(s: string): string {
    return s.toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'')
      .replace(/[^a-z0-9_\s]/g,'').trim().replace(/\s+/g,'_').slice(0, 60)
  }

  async function criarCampo() {
    if (!novoCampo.nome.trim()) return
    const chave = novoCampo.chave?.trim() || slugify(novoCampo.nome)
    const opcoes = novoCampo.tipo === 'select' ? String(novoCampo.opcoes || '').split(',').map((s:string)=>s.trim()).filter(Boolean) : null
    const { error } = await supabase.from('campos_personalizados').insert({
      entidade: novoCampo.entidade,
      nome: novoCampo.nome.trim(),
      chave,
      tipo: novoCampo.tipo,
      opcoes,
      obrigatorio: !!novoCampo.obrigatorio,
      criado_por: profile?.id,
    })
    if (error) { alert('Erro: '+error.message); return }
    setNovoCampo(emptyCampo)
    await carregar()
  }

  async function salvarEdicaoCampo() {
    if (!editCampo?.id || !editCampo?.nome?.trim()) return
    const opcoes = editCampo.tipo === 'select'
      ? (typeof editCampo.opcoes === 'string'
          ? String(editCampo.opcoes).split(',').map((s:string)=>s.trim()).filter(Boolean)
          : editCampo.opcoes)
      : null
    await supabase.from('campos_personalizados').update({
      nome: editCampo.nome.trim(),
      tipo: editCampo.tipo,
      opcoes,
      obrigatorio: !!editCampo.obrigatorio,
      ativo: editCampo.ativo,
    }).eq('id', editCampo.id)
    setEditCampo(null)
    await carregar()
  }

  async function excluirCampo(id: string) {
    if (!confirm('Excluir esse campo? Os valores já preenchidos nas negociações continuam no banco mas não aparecerão mais.')) return
    await supabase.from('campos_personalizados').delete().eq('id', id)
    await carregar()
  }

  async function criarMotivo() {
    if (!novoMotivo.trim()) return
    await supabase.from('motivos_perda').insert({ nome: novoMotivo.trim(), criado_por: profile?.id })
    setNovoMotivo('')
    await carregar()
  }

  async function salvarEdicaoMotivo() {
    if (!editMotivo?.id || !editMotivo?.nome?.trim()) return
    await supabase.from('motivos_perda').update({ nome: editMotivo.nome.trim(), ativo: editMotivo.ativo }).eq('id', editMotivo.id)
    setEditMotivo(null)
    await carregar()
  }

  async function excluirMotivo(id: string) {
    if (!confirm('Excluir esse motivo? Negociações que usam continuarão com o texto antigo.')) return
    await supabase.from('motivos_perda').delete().eq('id', id)
    await carregar()
  }

  async function toggleMotivoAtivo(m: any) {
    await supabase.from('motivos_perda').update({ ativo: !m.ativo }).eq('id', m.id)
    await carregar()
  }

  async function criarProduto() {
    if (!novoProduto.nome.trim()) return
    const preco = parseFloat(String(novoProduto.preco_base).replace(/[^\d,.-]/g,'').replace(',','.')) || null
    await supabase.from('produtos').insert({ nome: novoProduto.nome.trim(), preco_base: preco, criado_por: profile?.id })
    setNovoProduto({ nome: '', preco_base: '' })
    await carregar()
  }

  async function salvarEdicaoProduto() {
    if (!editProduto?.id || !editProduto?.nome?.trim()) return
    const preco = parseFloat(String(editProduto.preco_base ?? '').replace(/[^\d,.-]/g,'').replace(',','.')) || null
    await supabase.from('produtos').update({ nome: editProduto.nome.trim(), preco_base: preco, ativo: editProduto.ativo }).eq('id', editProduto.id)
    setEditProduto(null)
    await carregar()
  }

  async function excluirProduto(id: string) {
    if (!confirm('Excluir esse produto?')) return
    await supabase.from('produtos').delete().eq('id', id)
    await carregar()
  }

  if (loading) return <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',color:'var(--text-muted)'}}>Carregando...</div>

  const inp: React.CSSProperties = { width:'100%', background:'rgba(255,255,255,0.05)', border:'1px solid var(--border)', borderRadius:8, padding:'8px 12px', color:'var(--text)', fontSize:13, outline:'none', boxSizing:'border-box' as const, fontFamily:'DM Sans,sans-serif' }
  const fmtPreco = (n?: number | null) => n ? `R$ ${Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—'

  return (
    <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
      <div style={{height:56,borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',padding:'0 28px',gap:12,background:'var(--bg-soft)'}}>
        <div style={{fontFamily:'DM Serif Display,serif',fontSize:18,flex:1}}>⚙️ Configurações</div>
      </div>

      <div style={{flex:1,overflow:'auto',padding:'24px 28px'}}>
        <div style={{display:'flex',gap:0,borderBottom:'1px solid var(--border)',marginBottom:18}}>
          {([['motivos','✕ Motivos de Perda'],['produtos','📦 Produtos'],['campos','🧩 Campos personalizados'],['templates','📧 Templates de Email']] as [Aba,string][]).map(([k,l])=>(
            <button key={k} onClick={()=>setAba(k)}
              style={{padding:'10px 20px',fontSize:13,cursor:'pointer',border:'none',background:'transparent',color:aba===k?'var(--gold)':'var(--text-muted)',fontWeight:aba===k?600:400,borderBottom:aba===k?'2px solid var(--gold)':'2px solid transparent',marginBottom:-1,fontFamily:'DM Sans,sans-serif'}}>
              {l}
            </button>
          ))}
        </div>

        {aba === 'motivos' && (
          <div style={{maxWidth:780}}>
            <div className="card" style={{marginBottom:16}}>
              <div style={{fontSize:12,color:'var(--text-muted)',marginBottom:10}}>
                Motivos disponíveis para selecionar quando uma negociação é marcada como perdida.
                Você pode importar os existentes do RD Station em <a href="/dashboard/rdstation" style={{color:'var(--teal)'}}>RD Station CRM → Sincronizar</a>.
              </div>
              <div style={{display:'flex',gap:10}}>
                <input value={novoMotivo} onChange={e=>setNovoMotivo(e.target.value)} placeholder="Novo motivo de perda..." style={inp} onKeyDown={e=>{if(e.key==='Enter')criarMotivo()}} />
                <button onClick={criarMotivo} className="btn-primary" style={{whiteSpace:'nowrap'}}>+ Adicionar</button>
              </div>
            </div>

            <div className="card">
              <div style={{fontFamily:'DM Serif Display,serif',fontSize:15,marginBottom:16}}>
                Motivos cadastrados ({motivos.length})
              </div>
              {motivos.length === 0 ? (
                <div style={{padding:24,textAlign:'center',color:'var(--text-muted)',fontSize:13}}>Nenhum motivo cadastrado.</div>
              ) : (
                <div>
                  {motivos.map(m => (
                    <div key={m.id} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 0',borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
                      {editMotivo?.id === m.id ? (
                        <>
                          <input value={editMotivo.nome} onChange={e=>setEditMotivo((p:any)=>({...p,nome:e.target.value}))} style={inp} autoFocus />
                          <label style={{display:'flex',alignItems:'center',gap:4,fontSize:11,color:'var(--text-muted)'}}>
                            <input type="checkbox" checked={!!editMotivo.ativo} onChange={e=>setEditMotivo((p:any)=>({...p,ativo:e.target.checked}))} /> Ativo
                          </label>
                          <button onClick={salvarEdicaoMotivo} className="btn-primary" style={{padding:'5px 12px',fontSize:11}}>✓ Salvar</button>
                          <button onClick={()=>setEditMotivo(null)} style={{padding:'5px 10px',fontSize:11,borderRadius:6,border:'1px solid var(--border)',background:'transparent',color:'var(--text-muted)',cursor:'pointer'}}>✕</button>
                        </>
                      ) : (
                        <>
                          <div style={{flex:1,fontSize:13,opacity:m.ativo?1:0.5,textDecoration:m.ativo?'none':'line-through'}}>
                            {m.nome}
                            {m.rd_id && <span style={{fontSize:9,color:'var(--text-muted)',marginLeft:8,fontFamily:'monospace'}}>RD: {m.rd_id.slice(0,6)}…</span>}
                          </div>
                          <button onClick={()=>toggleMotivoAtivo(m)} style={{padding:'4px 10px',borderRadius:6,fontSize:11,border:'1px solid var(--border)',background:'rgba(255,255,255,0.04)',color:m.ativo?'var(--teal)':'var(--text-muted)',cursor:'pointer'}}>
                            {m.ativo ? 'Ativo' : 'Inativo'}
                          </button>
                          <button onClick={()=>setEditMotivo({...m})} style={{padding:'4px 10px',borderRadius:6,fontSize:11,border:'1px solid var(--border)',background:'rgba(255,255,255,0.04)',color:'var(--gold)',cursor:'pointer'}}>✎</button>
                          <button onClick={()=>excluirMotivo(m.id)} style={{padding:'4px 8px',borderRadius:6,fontSize:11,border:'1px solid rgba(224,82,82,0.3)',background:'rgba(224,82,82,0.06)',color:'var(--red)',cursor:'pointer'}}>🗑</button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {aba === 'produtos' && (
          <div style={{maxWidth:780}}>
            <div className="card" style={{marginBottom:16}}>
              <div style={{fontSize:12,color:'var(--text-muted)',marginBottom:10}}>
                Produtos disponíveis no CRM (auto, vida, residencial, etc). Importe do RD em <a href="/dashboard/rdstation" style={{color:'var(--teal)'}}>RD Station → Sincronizar</a>.
              </div>
              <div style={{display:'grid',gridTemplateColumns:'2fr 1fr auto',gap:10}}>
                <input value={novoProduto.nome} onChange={e=>setNovoProduto(p=>({...p,nome:e.target.value}))} placeholder="Nome do produto" style={inp} />
                <input value={novoProduto.preco_base} onChange={e=>setNovoProduto(p=>({...p,preco_base:e.target.value}))} placeholder="Preço base (opcional)" style={inp} />
                <button onClick={criarProduto} className="btn-primary" style={{whiteSpace:'nowrap'}}>+ Adicionar</button>
              </div>
            </div>

            <div className="card">
              <div style={{fontFamily:'DM Serif Display,serif',fontSize:15,marginBottom:16}}>
                Produtos cadastrados ({produtos.length})
              </div>
              {produtos.length === 0 ? (
                <div style={{padding:24,textAlign:'center',color:'var(--text-muted)',fontSize:13}}>Nenhum produto cadastrado.</div>
              ) : (
                <div>
                  {produtos.map(p => (
                    <div key={p.id} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 0',borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
                      {editProduto?.id === p.id ? (
                        <>
                          <input value={editProduto.nome} onChange={e=>setEditProduto((s:any)=>({...s,nome:e.target.value}))} style={{...inp,flex:2}} autoFocus />
                          <input value={editProduto.preco_base ?? ''} onChange={e=>setEditProduto((s:any)=>({...s,preco_base:e.target.value}))} placeholder="Preço" style={{...inp,flex:1}} />
                          <label style={{display:'flex',alignItems:'center',gap:4,fontSize:11,color:'var(--text-muted)'}}>
                            <input type="checkbox" checked={!!editProduto.ativo} onChange={e=>setEditProduto((s:any)=>({...s,ativo:e.target.checked}))} /> Ativo
                          </label>
                          <button onClick={salvarEdicaoProduto} className="btn-primary" style={{padding:'5px 12px',fontSize:11}}>✓</button>
                          <button onClick={()=>setEditProduto(null)} style={{padding:'5px 10px',fontSize:11,borderRadius:6,border:'1px solid var(--border)',background:'transparent',color:'var(--text-muted)',cursor:'pointer'}}>✕</button>
                        </>
                      ) : (
                        <>
                          <div style={{flex:2,fontSize:13,opacity:p.ativo?1:0.5}}>
                            {p.nome}
                            {p.rd_id && <span style={{fontSize:9,color:'var(--text-muted)',marginLeft:8,fontFamily:'monospace'}}>RD: {p.rd_id.slice(0,6)}…</span>}
                          </div>
                          <div style={{flex:1,fontSize:12,color:'var(--text-muted)'}}>{fmtPreco(p.preco_base)}</div>
                          <button onClick={()=>setEditProduto({...p})} style={{padding:'4px 10px',borderRadius:6,fontSize:11,border:'1px solid var(--border)',background:'rgba(255,255,255,0.04)',color:'var(--gold)',cursor:'pointer'}}>✎</button>
                          <button onClick={()=>excluirProduto(p.id)} style={{padding:'4px 8px',borderRadius:6,fontSize:11,border:'1px solid rgba(224,82,82,0.3)',background:'rgba(224,82,82,0.06)',color:'var(--red)',cursor:'pointer'}}>🗑</button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {aba === 'campos' && (
          <div style={{maxWidth:920}}>
            <div className="card" style={{marginBottom:16}}>
              <div style={{fontSize:12,color:'var(--text-muted)',marginBottom:10}}>
                Campos extras que aparecem no card da negociação. Texto, número, data, lista (select), checkbox ou textarea.
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 2fr 1fr 1fr 1fr auto',gap:8}}>
                <select value={novoCampo.entidade} onChange={e=>setNovoCampo((n:any)=>({...n,entidade:e.target.value}))} style={{...inp,background:'#ffffff'}}>
                  <option value="negocio">Negócio</option>
                  <option value="cliente">Cliente</option>
                </select>
                <input value={novoCampo.nome} onChange={e=>setNovoCampo((n:any)=>({...n,nome:e.target.value,chave:slugify(e.target.value)}))} placeholder='Nome do campo (ex: "Modelo do veículo")' style={inp} />
                <input value={novoCampo.chave} onChange={e=>setNovoCampo((n:any)=>({...n,chave:slugify(e.target.value)}))} placeholder="chave_slug" style={{...inp,fontFamily:'monospace',fontSize:11}} />
                <select value={novoCampo.tipo} onChange={e=>setNovoCampo((n:any)=>({...n,tipo:e.target.value}))} style={{...inp,background:'#ffffff'}}>
                  <option value="texto">Texto</option>
                  <option value="textarea">Texto longo</option>
                  <option value="numero">Número</option>
                  <option value="data">Data</option>
                  <option value="select">Lista (select)</option>
                  <option value="boolean">Sim/Não</option>
                </select>
                <input value={novoCampo.opcoes} onChange={e=>setNovoCampo((n:any)=>({...n,opcoes:e.target.value}))} placeholder={novoCampo.tipo==='select'?'Op1, Op2, Op3':'(só p/ Lista)'} disabled={novoCampo.tipo!=='select'} style={{...inp,opacity:novoCampo.tipo==='select'?1:0.5}} />
                <button onClick={criarCampo} className="btn-primary" style={{whiteSpace:'nowrap'}}>+ Adicionar</button>
              </div>
            </div>

            <div className="card">
              <div style={{fontFamily:'DM Serif Display,serif',fontSize:15,marginBottom:16}}>Campos cadastrados ({campos.length})</div>
              {campos.length === 0 ? (
                <div style={{padding:24,textAlign:'center',color:'var(--text-muted)',fontSize:13}}>Nenhum campo cadastrado.</div>
              ) : (
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
                  <thead><tr style={{textAlign:'left',color:'var(--text-muted)',fontSize:10,letterSpacing:'1px',textTransform:'uppercase'}}>
                    <th style={{padding:'8px 4px',borderBottom:'1px solid var(--border)'}}>Onde</th>
                    <th style={{padding:'8px 4px',borderBottom:'1px solid var(--border)'}}>Nome</th>
                    <th style={{padding:'8px 4px',borderBottom:'1px solid var(--border)'}}>Chave</th>
                    <th style={{padding:'8px 4px',borderBottom:'1px solid var(--border)'}}>Tipo</th>
                    <th style={{padding:'8px 4px',borderBottom:'1px solid var(--border)'}}>Opções</th>
                    <th style={{padding:'8px 4px',borderBottom:'1px solid var(--border)',textAlign:'right'}}></th>
                  </tr></thead>
                  <tbody>
                    {campos.map(c => (
                      <tr key={c.id} style={{borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
                        {editCampo?.id === c.id ? (
                          <>
                            <td style={{padding:'8px 4px'}}><span style={{fontSize:10,color:'var(--text-muted)'}}>{c.entidade}</span></td>
                            <td style={{padding:'6px 4px'}}><input value={editCampo.nome} onChange={e=>setEditCampo((p:any)=>({...p,nome:e.target.value}))} style={inp} /></td>
                            <td style={{padding:'6px 4px',fontFamily:'monospace',fontSize:11}}>{c.chave}</td>
                            <td style={{padding:'6px 4px'}}>
                              <select value={editCampo.tipo} onChange={e=>setEditCampo((p:any)=>({...p,tipo:e.target.value}))} style={{...inp,background:'#ffffff'}}>
                                <option value="texto">Texto</option><option value="textarea">Texto longo</option>
                                <option value="numero">Número</option><option value="data">Data</option>
                                <option value="select">Lista</option><option value="boolean">Sim/Não</option>
                              </select>
                            </td>
                            <td style={{padding:'6px 4px'}}>
                              <input value={Array.isArray(editCampo.opcoes)?editCampo.opcoes.join(', '):(editCampo.opcoes||'')} onChange={e=>setEditCampo((p:any)=>({...p,opcoes:e.target.value}))} disabled={editCampo.tipo!=='select'} style={{...inp,opacity:editCampo.tipo==='select'?1:0.5}} />
                            </td>
                            <td style={{padding:'6px 4px',textAlign:'right',whiteSpace:'nowrap'}}>
                              <button onClick={salvarEdicaoCampo} className="btn-primary" style={{padding:'4px 10px',fontSize:11,marginRight:4}}>✓</button>
                              <button onClick={()=>setEditCampo(null)} style={{padding:'4px 8px',fontSize:11,borderRadius:6,border:'1px solid var(--border)',background:'transparent',color:'var(--text-muted)',cursor:'pointer'}}>✕</button>
                            </td>
                          </>
                        ) : (
                          <>
                            <td style={{padding:'10px 4px'}}><span style={{fontSize:10,fontWeight:600,padding:'2px 7px',borderRadius:5,background:'rgba(74,128,240,0.10)',color:'#7aa3f8',textTransform:'uppercase'}}>{c.entidade}</span></td>
                            <td style={{padding:'10px 4px'}}>{c.nome}{c.obrigatorio && <span style={{color:'var(--red)',marginLeft:4}}>*</span>}</td>
                            <td style={{padding:'10px 4px',fontFamily:'monospace',fontSize:11,color:'var(--text-muted)'}}>{c.chave}</td>
                            <td style={{padding:'10px 4px',fontSize:11}}>{c.tipo}</td>
                            <td style={{padding:'10px 4px',fontSize:11,color:'var(--text-muted)'}}>{Array.isArray(c.opcoes) ? c.opcoes.join(', ') : '—'}</td>
                            <td style={{padding:'10px 4px',textAlign:'right',whiteSpace:'nowrap'}}>
                              <button onClick={()=>setEditCampo({...c, opcoes: Array.isArray(c.opcoes)?c.opcoes.join(', '):''})} style={{padding:'4px 10px',borderRadius:6,fontSize:11,border:'1px solid var(--border)',background:'rgba(255,255,255,0.04)',color:'var(--gold)',cursor:'pointer',marginRight:4}}>✎</button>
                              <button onClick={()=>excluirCampo(c.id)} style={{padding:'4px 8px',borderRadius:6,fontSize:11,border:'1px solid rgba(224,82,82,0.3)',background:'rgba(224,82,82,0.06)',color:'var(--red)',cursor:'pointer'}}>🗑</button>
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {aba === 'templates' && (
          <div style={{maxWidth:920}}>
            <div className="card" style={{marginBottom:16}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:6}}>
                <div style={{fontFamily:'DM Serif Display,serif',fontSize:15}}>📧 Templates de Email</div>
                <button onClick={()=>{setEditTemplate(null);setFormTemplate(emptyTemplate);setModalTemplate(true)}} className="btn-primary" style={{padding:'7px 14px',fontSize:12}}>+ Novo template</button>
              </div>
              <div style={{fontSize:12,color:'var(--text-muted)',lineHeight:1.5}}>
                Templates de mensagem usados ao enviar documentos para assinatura digital (Autentique).
                Variáveis disponíveis: <code>{'{{cliente}}'}</code>, <code>{'{{negocio}}'}</code>, <code>{'{{documento}}'}</code>.
                Marque um template como <strong style={{color:'var(--gold)'}}>padrão</strong> da categoria pra ele vir pré-selecionado quando alguém for enviar um documento.
              </div>
            </div>

            {templates.length === 0 ? (
              <div className="card" style={{textAlign:'center',padding:'30px 20px',color:'var(--text-muted)'}}>
                <div style={{fontSize:36,marginBottom:10}}>📧</div>
                <div style={{marginBottom:10}}>Nenhum template cadastrado.</div>
                <button onClick={()=>{setEditTemplate(null);setFormTemplate(emptyTemplate);setModalTemplate(true)}} className="btn-primary">+ Criar primeiro</button>
              </div>
            ) : (
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill, minmax(360px, 1fr))',gap:14}}>
                {templates.map(t => (
                  <div key={t.id} className="card" style={{display:'flex',flexDirection:'column'}}>
                    <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:8,gap:8}}>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontFamily:'DM Serif Display,serif',fontSize:15}}>{t.nome}</div>
                        <div style={{fontSize:10,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:1,marginTop:2}}>{t.categoria}</div>
                      </div>
                      <div style={{display:'flex',flexDirection:'column',gap:4,alignItems:'flex-end'}}>
                        {t.is_default && <span style={{fontSize:9,fontWeight:700,padding:'2px 7px',borderRadius:5,background:'rgba(201,168,76,0.18)',color:'var(--gold)',border:'1px solid rgba(201,168,76,0.4)',textTransform:'uppercase',letterSpacing:1}}>Padrão</span>}
                        <button onClick={()=>toggleTemplateAtivo(t)} style={{fontSize:9,padding:'2px 7px',borderRadius:5,background:t.ativo?'var(--success-bg)':'rgba(255,255,255,0.04)',color:t.ativo?'var(--success)':'var(--text-muted)',border:'1px solid '+(t.ativo?'var(--success-border)':'var(--border)'),textTransform:'uppercase',letterSpacing:1,cursor:'pointer'}}>{t.ativo?'Ativo':'Inativo'}</button>
                      </div>
                    </div>
                    {t.assunto && <div style={{fontSize:12,color:'var(--text-muted)',marginBottom:8}}><strong style={{color:'var(--text)'}}>Assunto:</strong> {t.assunto}</div>}
                    <pre style={{whiteSpace:'pre-wrap',fontSize:11,padding:10,background:'rgba(0,0,0,0.3)',borderRadius:8,fontFamily:'DM Sans,sans-serif',color:'var(--text-muted)',maxHeight:120,overflow:'auto',marginBottom:10}}>{t.mensagem}</pre>
                    <div style={{display:'flex',gap:6,marginTop:'auto',flexWrap:'wrap'}}>
                      {!t.is_default && (
                        <button onClick={()=>tornarDefault(t)} style={{padding:'5px 10px',borderRadius:6,fontSize:11,border:'1px solid rgba(201,168,76,0.4)',background:'rgba(201,168,76,0.06)',color:'var(--gold)',cursor:'pointer'}}>★ Tornar padrão</button>
                      )}
                      <button onClick={()=>{
                        setEditTemplate(t)
                        setFormTemplate({nome:t.nome,categoria:t.categoria,assunto:t.assunto||'',mensagem:t.mensagem,is_default:t.is_default})
                        setModalTemplate(true)
                      }} style={{padding:'5px 10px',borderRadius:6,fontSize:11,border:'1px solid var(--border)',background:'rgba(255,255,255,0.04)',color:'var(--gold)',cursor:'pointer'}}>✎ Editar</button>
                      <button onClick={()=>excluirTemplate(t.id, t.nome)} style={{padding:'5px 10px',borderRadius:6,fontSize:11,border:'1px solid rgba(224,82,82,0.3)',background:'rgba(224,82,82,0.06)',color:'var(--red)',cursor:'pointer'}}>🗑</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {modalTemplate && (
        <div style={{position:'fixed',inset:0,background:'rgba(15,23,42,0.45)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',backdropFilter:'blur(6px)'}}
          onClick={e=>e.target===e.currentTarget&&setModalTemplate(false)}>
          <div style={{background:'#ffffff',border:'1px solid var(--border)',borderRadius:20,padding:'28px 32px',width:640,maxWidth:'95vw',maxHeight:'90vh',overflow:'auto'}}>
            <div style={{fontFamily:'DM Serif Display,serif',fontSize:18,marginBottom:18}}>
              {editTemplate ? '✎ Editar template' : '+ Novo template de email'}
            </div>

            <div style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr',gap:12,marginBottom:14}}>
              <div>
                <label style={{fontSize:11,fontWeight:600,letterSpacing:'1px',textTransform:'uppercase',color:'var(--text-muted)',display:'block',marginBottom:5}}>Nome *</label>
                <input value={formTemplate.nome} onChange={e=>setFormTemplate((f:any)=>({...f,nome:e.target.value}))} placeholder='Ex: "Renovação Auto"' style={inp} autoFocus />
              </div>
              <div>
                <label style={{fontSize:11,fontWeight:600,letterSpacing:'1px',textTransform:'uppercase',color:'var(--text-muted)',display:'block',marginBottom:5}}>Categoria</label>
                <select value={formTemplate.categoria} onChange={e=>setFormTemplate((f:any)=>({...f,categoria:e.target.value}))} style={{...inp,background:'#ffffff'}}>
                  <option value="assinatura">Assinatura</option>
                  <option value="renovacao">Renovação</option>
                  <option value="cobranca">Cobrança</option>
                  <option value="geral">Geral</option>
                </select>
              </div>
              <div>
                <label style={{fontSize:11,fontWeight:600,letterSpacing:'1px',textTransform:'uppercase',color:'var(--text-muted)',display:'block',marginBottom:5}}>Padrão</label>
                <label style={{display:'flex',alignItems:'center',gap:6,marginTop:8,cursor:'pointer',fontSize:13}}>
                  <input type="checkbox" checked={!!formTemplate.is_default} onChange={e=>setFormTemplate((f:any)=>({...f,is_default:e.target.checked}))} style={{accentColor:'var(--gold)'}} />
                  <span style={{color:'var(--gold)'}}>★ Padrão da categoria</span>
                </label>
              </div>
            </div>

            <div style={{marginBottom:14}}>
              <label style={{fontSize:11,fontWeight:600,letterSpacing:'1px',textTransform:'uppercase',color:'var(--text-muted)',display:'block',marginBottom:5}}>Assunto</label>
              <input value={formTemplate.assunto} onChange={e=>setFormTemplate((f:any)=>({...f,assunto:e.target.value}))} placeholder="Documento para assinatura — CM.seg" style={inp} />
            </div>

            <div style={{marginBottom:18}}>
              <label style={{fontSize:11,fontWeight:600,letterSpacing:'1px',textTransform:'uppercase',color:'var(--text-muted)',display:'block',marginBottom:5}}>
                Mensagem * <span style={{textTransform:'none',letterSpacing:0,fontWeight:400,color:'var(--text-muted)'}}>· variáveis: <code>{'{{cliente}}'}</code> <code>{'{{negocio}}'}</code> <code>{'{{documento}}'}</code></span>
              </label>
              <textarea value={formTemplate.mensagem} onChange={e=>setFormTemplate((f:any)=>({...f,mensagem:e.target.value}))} rows={10}
                style={{...inp,resize:'vertical',fontFamily:'DM Sans,sans-serif',lineHeight:1.5}} />
            </div>

            <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
              <button className="btn-secondary" onClick={()=>setModalTemplate(false)}>Cancelar</button>
              <button className="btn-primary" onClick={salvarTemplate} disabled={!formTemplate.nome.trim()||!formTemplate.mensagem.trim()}>✓ Salvar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
