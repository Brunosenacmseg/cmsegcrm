'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

export default function FinanceiroPage() {
  const supabase = createClient()
  const router = useRouter()

  const [profile, setProfile] = useState<any>(null)
  const [temAcesso, setTemAcesso] = useState(false)
  const [loading, setLoading] = useState(true)

  const hoje = new Date()
  const [ano, setAno] = useState(hoje.getFullYear())
  const [mes, setMes] = useState(hoje.getMonth() + 1) // 1-12
  const competencia = `${ano}-${String(mes).padStart(2,'0')}`

  // Dados
  const [seguradoras, setSeguradoras] = useState<any[]>([])
  const [categorias, setCategorias]   = useState<any[]>([])
  const [despesas, setDespesas]       = useState<any[]>([])
  const [faturamentoSeg, setFaturamentoSeg] = useState<any[]>([])
  const [dre, setDre] = useState<any>(null)
  const [acessos, setAcessos] = useState<any[]>([])
  const [usuarios, setUsuarios] = useState<any[]>([])

  // Modais
  const [modalDespesa, setModalDespesa] = useState(false)
  const [editandoDespesa, setEditandoDespesa] = useState<any>(null)
  const [formDespesa, setFormDespesa] = useState({ categoria_id:'', descricao:'', valor:'', data: hoje.toISOString().slice(0,10), forma_pagto:'', fornecedor:'', obs:'' })

  const [modalCategoria, setModalCategoria] = useState(false)
  const [formCategoria, setFormCategoria] = useState({ codigo:'', nome:'', tipo:'despesa' })

  const [modalAcessos, setModalAcessos] = useState(false)

  const [aba, setAba] = useState<'dre'|'despesas'|'categorias'>('dre')

  useEffect(()=>{ init() }, [])
  useEffect(()=>{ if (temAcesso) carregarDados() }, [competencia, temAcesso])

  async function init() {
    const { data:{ user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    const { data: prof } = await supabase.from('users').select('*').eq('id', user.id).single()
    setProfile(prof)
    // Verifica acesso (admin OU está em financeiro_acessos)
    if (prof?.role === 'admin') {
      setTemAcesso(true)
    } else {
      const { data: ac } = await supabase.from('financeiro_acessos').select('user_id').eq('user_id', user.id).maybeSingle()
      setTemAcesso(!!ac)
    }
    setLoading(false)
  }

  async function carregarDados() {
    const desdeMes = `${ano}-${String(mes).padStart(2,'0')}-01`
    const ateMesNum = mes === 12 ? `${ano+1}-01-01` : `${ano}-${String(mes+1).padStart(2,'0')}-01`

    const [{data: seg}, {data: cat}, {data: desp}, {data: fat}, {data: dreData}, {data: ac}, {data: usrs}] = await Promise.all([
      supabase.from('financeiro_seguradoras').select('*').eq('ativo', true).order('codigo'),
      supabase.from('financeiro_categorias').select('*').eq('ativo', true).order('codigo'),
      supabase.from('financeiro_despesas').select('*, financeiro_categorias(codigo,nome,tipo)')
        .gte('data', desdeMes).lt('data', ateMesNum).order('data', { ascending: false }),
      supabase.from('financeiro_faturamento_seguradora').select('*').eq('competencia', competencia),
      supabase.from('financeiro_dre_mensal').select('*').eq('competencia', competencia).maybeSingle(),
      profile?.role === 'admin' ? supabase.from('financeiro_acessos').select('*, users(id,nome,email,role)') : Promise.resolve({data:[]}),
      profile?.role === 'admin' ? supabase.from('users').select('id,nome,email,role').order('nome') : Promise.resolve({data:[]}),
    ])
    setSeguradoras(seg||[]); setCategorias(cat||[]); setDespesas(desp||[]); setFaturamentoSeg(fat||[]); setDre(dreData||null); setAcessos(ac||[]); setUsuarios(usrs||[])
  }

  async function salvarDespesa() {
    if (!formDespesa.descricao || !formDespesa.valor) return
    const valor = parseFloat(String(formDespesa.valor).replace(/[R$\s.]/g,'').replace(',','.'))
    const payload: any = {
      categoria_id: formDespesa.categoria_id || null,
      descricao:    formDespesa.descricao,
      valor,
      data:         formDespesa.data,
      competencia:  formDespesa.data.slice(0,7),
      forma_pagto:  formDespesa.forma_pagto || null,
      fornecedor:   formDespesa.fornecedor || null,
      obs:          formDespesa.obs || null,
      registrado_por: profile?.id,
    }
    if (editandoDespesa) {
      await supabase.from('financeiro_despesas').update(payload).eq('id', editandoDespesa.id)
    } else {
      await supabase.from('financeiro_despesas').insert(payload)
    }
    setModalDespesa(false); setEditandoDespesa(null)
    setFormDespesa({ categoria_id:'', descricao:'', valor:'', data: hoje.toISOString().slice(0,10), forma_pagto:'', fornecedor:'', obs:'' })
    await carregarDados()
  }

  async function excluirDespesa(id: string) {
    if (!confirm('Excluir essa despesa?')) return
    await supabase.from('financeiro_despesas').delete().eq('id', id)
    await carregarDados()
  }

  async function salvarCategoria() {
    if (!formCategoria.codigo || !formCategoria.nome) return
    const { error } = await supabase.from('financeiro_categorias').insert(formCategoria)
    if (error) { alert('Erro: '+error.message); return }
    setModalCategoria(false); setFormCategoria({ codigo:'', nome:'', tipo:'despesa' })
    await carregarDados()
  }

  async function liberarAcesso(userId: string) {
    if (!profile) return
    await supabase.from('financeiro_acessos').insert({ user_id: userId, liberado_por: profile.id })
    await carregarDados()
  }
  async function revogarAcesso(userId: string) {
    if (!confirm('Remover acesso desse usuário ao módulo financeiro?')) return
    await supabase.from('financeiro_acessos').delete().eq('user_id', userId)
    await carregarDados()
  }

  if (loading) return <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',color:'var(--text-muted)'}}>Carregando...</div>

  if (!temAcesso) return (
    <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:10,color:'var(--text-muted)'}}>
      <div style={{fontSize:40}}>🔒</div>
      <div style={{fontFamily:'DM Serif Display,serif',fontSize:20,color:'var(--text)'}}>Acesso restrito</div>
      <div>Apenas usuários autorizados podem acessar o módulo Financeiro.</div>
    </div>
  )

  const isAdmin = profile?.role === 'admin'
  const fmt = (n: number) => Number(n||0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const inp: React.CSSProperties = { width:'100%', background:'rgba(255,255,255,0.05)', border:'1px solid var(--border)', borderRadius:8, padding:'9px 13px', color:'var(--text)', fontSize:13, outline:'none', boxSizing:'border-box' as const, fontFamily:'DM Sans,sans-serif' }
  const lbl: React.CSSProperties = { fontSize:11, fontWeight:600, letterSpacing:'1px', textTransform:'uppercase', color:'var(--text-muted)', display:'block', marginBottom:5 }

  // Total de despesas por categoria (pra DRE)
  const despesasPorCategoria: Record<string,{ codigo: string; nome: string; total: number }> = {}
  for (const d of despesas) {
    const cat = d.financeiro_categorias
    if (!cat) continue
    const key = cat.codigo
    if (!despesasPorCategoria[key]) despesasPorCategoria[key] = { codigo: cat.codigo, nome: cat.nome, total: 0 }
    despesasPorCategoria[key].total += Number(d.valor || 0)
  }
  const despesasOrdenadas = Object.values(despesasPorCategoria).sort((a,b)=>a.codigo.localeCompare(b.codigo))

  return (
    <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
      <div style={{height:56,borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',padding:'0 28px',gap:12,background:'rgba(10,22,40,0.7)',position:'sticky',top:0,zIndex:5}}>
        <div style={{fontFamily:'DM Serif Display,serif',fontSize:18,flex:1}}>💼 Financeiro / DRE</div>

        <select value={mes} onChange={e=>setMes(Number(e.target.value))}
          style={{padding:'7px 12px',borderRadius:8,border:'1px solid var(--border)',background:'rgba(255,255,255,0.04)',color:'var(--text)',fontSize:12,cursor:'pointer'}}>
          {MESES.map((m,i)=><option key={i} value={i+1}>{m}</option>)}
        </select>
        <select value={ano} onChange={e=>setAno(Number(e.target.value))}
          style={{padding:'7px 12px',borderRadius:8,border:'1px solid var(--border)',background:'rgba(255,255,255,0.04)',color:'var(--text)',fontSize:12,cursor:'pointer'}}>
          {[ano-2,ano-1,ano,ano+1].map(a=><option key={a}>{a}</option>)}
        </select>

        {isAdmin && (
          <button onClick={()=>setModalAcessos(true)} className="btn-secondary" style={{padding:'7px 14px',fontSize:12}}>
            👥 Acessos
          </button>
        )}
        <button onClick={()=>{setEditandoDespesa(null);setFormDespesa({categoria_id:'',descricao:'',valor:'',data:hoje.toISOString().slice(0,10),forma_pagto:'',fornecedor:'',obs:''});setModalDespesa(true)}} className="btn-primary" style={{padding:'7px 14px',fontSize:12}}>
          + Lançar despesa
        </button>
      </div>

      <div style={{flex:1,overflow:'auto',padding:'24px 28px'}}>

        {/* Cards principais (DRE resumo) */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(200px, 1fr))',gap:20,marginBottom:24}}>
          <div className="kpi kpi-warning">
            <div className="kpi-label">Receita Bruta</div>
            <div className="kpi-value kpi-value-warning">R$ {fmt(dre?.receita_bruta || 0)}</div>
          </div>
          <div className="kpi kpi-danger">
            <div className="kpi-label">IR Retido</div>
            <div className="kpi-value kpi-value-danger">R$ {fmt(dre?.ir_retido || 0)}</div>
          </div>
          <div className="kpi kpi-success">
            <div className="kpi-label">Receita Líquida</div>
            <div className="kpi-value kpi-value-success">R$ {fmt(dre?.receita_liquida || 0)}</div>
          </div>
          <div className="kpi kpi-danger">
            <div className="kpi-label">Despesas</div>
            <div className="kpi-value kpi-value-danger">R$ {fmt(dre?.total_despesas || 0)}</div>
          </div>
          <div className="kpi kpi-success">
            <div className="kpi-label">Resultado</div>
            <div className={`kpi-value ${(dre?.resultado||0)>=0?'kpi-value-success':'kpi-value-danger'}`}>R$ {fmt(dre?.resultado || 0)}</div>
          </div>
        </div>

        {/* Tabs */}
        <div style={{display:'flex',gap:0,borderBottom:'1px solid var(--border)',marginBottom:18}}>
          {[['dre','📊 DRE'],['despesas','💸 Despesas'],['categorias','🗂 Categorias']].map(([k,l])=>(
            <button key={k} onClick={()=>setAba(k as any)}
              style={{padding:'10px 20px',fontSize:13,cursor:'pointer',border:'none',background:'transparent',color:aba===k?'var(--gold)':'var(--text-muted)',fontWeight:aba===k?600:400,borderBottom:aba===k?'2px solid var(--gold)':'2px solid transparent',marginBottom:-1,fontFamily:'DM Sans,sans-serif'}}>
              {l}
            </button>
          ))}
        </div>

        {/* DRE */}
        {aba === 'dre' && (
          <>
            <div className="card" style={{marginBottom:18}}>
              <div style={{fontFamily:'DM Serif Display,serif',fontSize:15,marginBottom:16}}>
                Faturamento por Seguradora — {MESES[mes-1]}/{ano}
              </div>
              {faturamentoSeg.length === 0 ? (
                <div style={{padding:24,textAlign:'center',color:'var(--text-muted)',fontSize:13}}>Nenhuma comissão recebida nesse mês ainda.</div>
              ) : (
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
                  <thead>
                    <tr style={{textAlign:'left',color:'var(--text-muted)',fontSize:10,letterSpacing:'1px',textTransform:'uppercase'}}>
                      <th style={{padding:'8px 4px',borderBottom:'1px solid var(--border)'}}>Código</th>
                      <th style={{padding:'8px 4px',borderBottom:'1px solid var(--border)'}}>Seguradora</th>
                      <th style={{padding:'8px 4px',borderBottom:'1px solid var(--border)',textAlign:'right'}}>Qtd</th>
                      <th style={{padding:'8px 4px',borderBottom:'1px solid var(--border)',textAlign:'right'}}>Bruto</th>
                      <th style={{padding:'8px 4px',borderBottom:'1px solid var(--border)',textAlign:'right'}}>IR</th>
                      <th style={{padding:'8px 4px',borderBottom:'1px solid var(--border)',textAlign:'right'}}>Líquido</th>
                    </tr>
                  </thead>
                  <tbody>
                    {faturamentoSeg.map(r => (
                      <tr key={r.codigo+r.seguradora} style={{borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
                        <td style={{padding:'10px 4px',fontWeight:600,color:'var(--gold)',fontFamily:'monospace'}}>{r.codigo || '—'}</td>
                        <td style={{padding:'10px 4px'}}>{r.seguradora}</td>
                        <td style={{padding:'10px 4px',textAlign:'right'}}>{r.qtd_comissoes}</td>
                        <td style={{padding:'10px 4px',textAlign:'right',color:'var(--warning)'}}>R$ {fmt(r.bruto)}</td>
                        <td style={{padding:'10px 4px',textAlign:'right',color:'var(--danger)'}}>R$ {fmt(r.ir_retido)}</td>
                        <td style={{padding:'10px 4px',textAlign:'right',color:'var(--success)',fontWeight:600}}>R$ {fmt(r.liquido)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="card">
              <div style={{fontFamily:'DM Serif Display,serif',fontSize:15,marginBottom:16}}>
                Despesas por Categoria — {MESES[mes-1]}/{ano}
              </div>
              {despesasOrdenadas.length === 0 ? (
                <div style={{padding:24,textAlign:'center',color:'var(--text-muted)',fontSize:13}}>Nenhuma despesa lançada nesse mês.</div>
              ) : (
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
                  <thead>
                    <tr style={{textAlign:'left',color:'var(--text-muted)',fontSize:10,letterSpacing:'1px',textTransform:'uppercase'}}>
                      <th style={{padding:'8px 4px',borderBottom:'1px solid var(--border)'}}>Código</th>
                      <th style={{padding:'8px 4px',borderBottom:'1px solid var(--border)'}}>Categoria</th>
                      <th style={{padding:'8px 4px',borderBottom:'1px solid var(--border)',textAlign:'right'}}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {despesasOrdenadas.map(c => (
                      <tr key={c.codigo} style={{borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
                        <td style={{padding:'10px 4px',fontWeight:600,color:'var(--gold)',fontFamily:'monospace'}}>{c.codigo}</td>
                        <td style={{padding:'10px 4px'}}>{c.nome}</td>
                        <td style={{padding:'10px 4px',textAlign:'right',color:'var(--danger)',fontWeight:600}}>R$ {fmt(c.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}

        {/* Despesas */}
        {aba === 'despesas' && (
          <div className="card">
            <div style={{fontFamily:'DM Serif Display,serif',fontSize:15,marginBottom:16}}>
              Lançamentos de Despesas — {MESES[mes-1]}/{ano} ({despesas.length})
            </div>
            {despesas.length === 0 ? (
              <div style={{padding:24,textAlign:'center',color:'var(--text-muted)',fontSize:13}}>Nenhuma despesa nesse mês. Clique em <b>+ Lançar despesa</b>.</div>
            ) : (
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
                <thead>
                  <tr style={{textAlign:'left',color:'var(--text-muted)',fontSize:10,letterSpacing:'1px',textTransform:'uppercase'}}>
                    <th style={{padding:'8px 4px',borderBottom:'1px solid var(--border)'}}>Data</th>
                    <th style={{padding:'8px 4px',borderBottom:'1px solid var(--border)'}}>Categoria</th>
                    <th style={{padding:'8px 4px',borderBottom:'1px solid var(--border)'}}>Descrição</th>
                    <th style={{padding:'8px 4px',borderBottom:'1px solid var(--border)'}}>Fornecedor</th>
                    <th style={{padding:'8px 4px',borderBottom:'1px solid var(--border)',textAlign:'right'}}>Valor</th>
                    <th style={{padding:'8px 4px',borderBottom:'1px solid var(--border)',textAlign:'right'}}></th>
                  </tr>
                </thead>
                <tbody>
                  {despesas.map((d:any) => (
                    <tr key={d.id} style={{borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
                      <td style={{padding:'10px 4px',color:'var(--text-muted)'}}>{new Date(d.data).toLocaleDateString('pt-BR')}</td>
                      <td style={{padding:'10px 4px',fontFamily:'monospace',fontSize:12,color:'var(--gold)'}}>{d.financeiro_categorias?.codigo || '—'} {d.financeiro_categorias?.nome || ''}</td>
                      <td style={{padding:'10px 4px'}}>{d.descricao}</td>
                      <td style={{padding:'10px 4px',color:'var(--text-muted)'}}>{d.fornecedor || '—'}</td>
                      <td style={{padding:'10px 4px',textAlign:'right',color:'var(--danger)',fontWeight:600}}>R$ {fmt(d.valor)}</td>
                      <td style={{padding:'10px 4px',textAlign:'right'}}>
                        <button onClick={()=>{setEditandoDespesa(d);setFormDespesa({categoria_id:d.categoria_id||'',descricao:d.descricao,valor:String(d.valor),data:d.data,forma_pagto:d.forma_pagto||'',fornecedor:d.fornecedor||'',obs:d.obs||''});setModalDespesa(true)}}
                          style={{padding:'4px 8px',borderRadius:5,fontSize:11,border:'1px solid var(--border)',background:'rgba(255,255,255,0.04)',color:'var(--gold)',cursor:'pointer',marginRight:4}}>✎</button>
                        <button onClick={()=>excluirDespesa(d.id)}
                          style={{padding:'4px 8px',borderRadius:5,fontSize:11,border:'1px solid rgba(224,82,82,0.3)',background:'rgba(224,82,82,0.06)',color:'var(--red)',cursor:'pointer'}}>🗑</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Categorias */}
        {aba === 'categorias' && (
          <div className="card">
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
              <div style={{fontFamily:'DM Serif Display,serif',fontSize:15}}>Classes de Custos / Categorias</div>
              {isAdmin && (
                <button onClick={()=>setModalCategoria(true)} className="btn-secondary" style={{padding:'6px 14px',fontSize:12}}>+ Nova categoria</button>
              )}
            </div>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
              <thead>
                <tr style={{textAlign:'left',color:'var(--text-muted)',fontSize:10,letterSpacing:'1px',textTransform:'uppercase'}}>
                  <th style={{padding:'8px 4px',borderBottom:'1px solid var(--border)'}}>Código</th>
                  <th style={{padding:'8px 4px',borderBottom:'1px solid var(--border)'}}>Nome</th>
                  <th style={{padding:'8px 4px',borderBottom:'1px solid var(--border)'}}>Tipo</th>
                </tr>
              </thead>
              <tbody>
                {categorias.map(c => (
                  <tr key={c.id} style={{borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
                    <td style={{padding:'10px 4px',fontFamily:'monospace',color:'var(--gold)',fontWeight:600}}>{c.codigo}</td>
                    <td style={{padding:'10px 4px'}}>{c.nome}</td>
                    <td style={{padding:'10px 4px'}}>
                      <span style={{fontSize:10,fontWeight:600,padding:'2px 8px',borderRadius:5,background:c.tipo==='despesa'?'var(--danger-bg)':c.tipo==='imposto'?'var(--warning-bg)':'var(--success-bg)',color:c.tipo==='despesa'?'var(--danger)':c.tipo==='imposto'?'var(--warning)':'var(--success)',border:'1px solid '+(c.tipo==='despesa'?'var(--danger-border)':c.tipo==='imposto'?'var(--warning-border)':'var(--success-border)'),textTransform:'uppercase',letterSpacing:'1px'}}>{c.tipo}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      </div>

      {/* Modal: Lançar/Editar despesa */}
      {modalDespesa && (
        <div style={{position:'fixed',inset:0,background:'rgba(5,12,26,0.85)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',backdropFilter:'blur(6px)'}}
          onClick={e=>e.target===e.currentTarget&&setModalDespesa(false)}>
          <div style={{background:'#0a1628',border:'1px solid var(--border)',borderRadius:20,padding:'28px 32px',width:520,maxWidth:'95vw',maxHeight:'90vh',overflow:'auto'}}>
            <div style={{fontFamily:'DM Serif Display,serif',fontSize:18,marginBottom:18}}>
              {editandoDespesa?'✎ Editar despesa':'+ Lançar nova despesa'}
            </div>

            <div style={{marginBottom:14}}>
              <label style={lbl}>Categoria *</label>
              <select value={formDespesa.categoria_id} onChange={e=>setFormDespesa(f=>({...f,categoria_id:e.target.value}))} style={{...inp,background:'#0e2040'}}>
                <option value="">— selecione —</option>
                {categorias.map(c => <option key={c.id} value={c.id}>{c.codigo} {c.nome}</option>)}
              </select>
            </div>

            <div style={{marginBottom:14}}>
              <label style={lbl}>Descrição *</label>
              <input value={formDespesa.descricao} onChange={e=>setFormDespesa(f=>({...f,descricao:e.target.value}))} placeholder="Ex: Aluguel sala 23" style={inp} autoFocus />
            </div>

            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:14}}>
              <div>
                <label style={lbl}>Valor (R$) *</label>
                <input value={formDespesa.valor} onChange={e=>setFormDespesa(f=>({...f,valor:e.target.value}))} placeholder="0,00" style={inp} />
              </div>
              <div>
                <label style={lbl}>Data *</label>
                <input type="date" value={formDespesa.data} onChange={e=>setFormDespesa(f=>({...f,data:e.target.value}))} style={inp} />
              </div>
            </div>

            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:14}}>
              <div>
                <label style={lbl}>Forma de pagto</label>
                <input value={formDespesa.forma_pagto} onChange={e=>setFormDespesa(f=>({...f,forma_pagto:e.target.value}))} placeholder="PIX, transf, cartão..." style={inp} />
              </div>
              <div>
                <label style={lbl}>Fornecedor</label>
                <input value={formDespesa.fornecedor} onChange={e=>setFormDespesa(f=>({...f,fornecedor:e.target.value}))} placeholder="(opcional)" style={inp} />
              </div>
            </div>

            <div style={{marginBottom:18}}>
              <label style={lbl}>Observações</label>
              <textarea value={formDespesa.obs} onChange={e=>setFormDespesa(f=>({...f,obs:e.target.value}))} rows={2} style={{...inp,resize:'none'}} placeholder="Detalhes..."/>
            </div>

            <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
              <button className="btn-secondary" onClick={()=>setModalDespesa(false)}>Cancelar</button>
              <button className="btn-primary" onClick={salvarDespesa} disabled={!formDespesa.descricao||!formDespesa.valor}>
                ✓ Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: nova categoria */}
      {modalCategoria && (
        <div style={{position:'fixed',inset:0,background:'rgba(5,12,26,0.85)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',backdropFilter:'blur(6px)'}}
          onClick={e=>e.target===e.currentTarget&&setModalCategoria(false)}>
          <div style={{background:'#0a1628',border:'1px solid var(--border)',borderRadius:20,padding:'28px 32px',width:420,maxWidth:'95vw'}}>
            <div style={{fontFamily:'DM Serif Display,serif',fontSize:18,marginBottom:18}}>+ Nova categoria</div>
            <div style={{marginBottom:14}}>
              <label style={lbl}>Código *</label>
              <input value={formCategoria.codigo} onChange={e=>setFormCategoria(f=>({...f,codigo:e.target.value}))} placeholder="Ex: 4.6.01" style={inp} autoFocus />
            </div>
            <div style={{marginBottom:14}}>
              <label style={lbl}>Nome *</label>
              <input value={formCategoria.nome} onChange={e=>setFormCategoria(f=>({...f,nome:e.target.value}))} placeholder="Ex: Treinamento" style={inp} />
            </div>
            <div style={{marginBottom:18}}>
              <label style={lbl}>Tipo</label>
              <select value={formCategoria.tipo} onChange={e=>setFormCategoria(f=>({...f,tipo:e.target.value}))} style={{...inp,background:'#0e2040'}}>
                <option value="despesa">Despesa</option>
                <option value="imposto">Imposto</option>
                <option value="receita">Receita</option>
              </select>
            </div>
            <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
              <button className="btn-secondary" onClick={()=>setModalCategoria(false)}>Cancelar</button>
              <button className="btn-primary" onClick={salvarCategoria} disabled={!formCategoria.codigo||!formCategoria.nome}>✓ Criar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: gerenciar acessos */}
      {modalAcessos && isAdmin && (
        <div style={{position:'fixed',inset:0,background:'rgba(5,12,26,0.85)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',backdropFilter:'blur(6px)'}}
          onClick={e=>e.target===e.currentTarget&&setModalAcessos(false)}>
          <div style={{background:'#0a1628',border:'1px solid var(--border)',borderRadius:20,padding:'28px 32px',width:520,maxWidth:'95vw',maxHeight:'90vh',overflow:'auto'}}>
            <div style={{fontFamily:'DM Serif Display,serif',fontSize:18,marginBottom:6}}>👥 Acesso ao módulo Financeiro</div>
            <div style={{fontSize:12,color:'var(--text-muted)',marginBottom:18}}>
              Admins sempre têm acesso. Usuários adicionais autorizados aqui também podem ver e lançar.
            </div>

            <div style={{maxHeight:380,overflow:'auto'}}>
              {usuarios.filter(u=>u.role !== 'admin').map(u => {
                const liberado = acessos.find((a:any)=>a.user_id===u.id)
                return (
                  <div key={u.id} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 0',borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
                    <div style={{flex:1}}>
                      <div style={{fontSize:13,fontWeight:500}}>{u.nome}</div>
                      <div style={{fontSize:11,color:'var(--text-muted)'}}>{u.email} · {u.role}</div>
                    </div>
                    {liberado ? (
                      <button onClick={()=>revogarAcesso(u.id)} style={{padding:'5px 12px',borderRadius:6,fontSize:12,border:'1px solid rgba(224,82,82,0.3)',background:'rgba(224,82,82,0.08)',color:'var(--red)',cursor:'pointer'}}>Revogar</button>
                    ) : (
                      <button onClick={()=>liberarAcesso(u.id)} style={{padding:'5px 12px',borderRadius:6,fontSize:12,border:'1px solid rgba(28,181,160,0.4)',background:'rgba(28,181,160,0.10)',color:'var(--teal)',cursor:'pointer'}}>Liberar</button>
                    )}
                  </div>
                )
              })}
            </div>

            <div style={{display:'flex',justifyContent:'flex-end',marginTop:16}}>
              <button className="btn-secondary" onClick={()=>setModalAcessos(false)}>Fechar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
