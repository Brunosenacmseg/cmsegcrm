'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
const FORMAS_PGTO = ['PIX','BOLETO','TED','CARTÃO DE CRÉDITO','DÉBITO COMISSÃO','DINHEIRO']

type Modo = 'projecao' | 'real'

export default function FinanceiroPage() {
  const supabase = createClient()
  const router = useRouter()

  const [profile, setProfile] = useState<any>(null)
  const [temAcesso, setTemAcesso] = useState(false)
  const [loading, setLoading] = useState(true)

  const hoje = new Date()
  const [ano, setAno] = useState(hoje.getFullYear())
  const [mes, setMes] = useState(hoje.getMonth() + 1)
  const competencia = `${ano}-${String(mes).padStart(2,'0')}`

  const [modo, setModo] = useState<Modo>('projecao')

  // Dados
  const [seguradoras, setSeguradoras] = useState<any[]>([])
  const [categorias, setCategorias]   = useState<any[]>([])
  const [despesas, setDespesas]       = useState<any[]>([])
  const [recorrentes, setRecorrentes] = useState<any[]>([])
  const [faturamentoSeg, setFaturamentoSeg] = useState<any[]>([])
  const [dre, setDre] = useState<any>(null)
  const [acessos, setAcessos] = useState<any[]>([])
  const [usuarios, setUsuarios] = useState<any[]>([])

  // Modais
  const [modalDespesa, setModalDespesa] = useState(false)
  const [editandoDespesa, setEditandoDespesa] = useState<any>(null)
  const emptyDespesa = {
    categoria_id:'', descricao:'', valor:'',
    data_vencimento: hoje.toISOString().slice(0,10),
    data_pgto:'',
    tipo_despesa:'FIXA',
    forma_pagto:'PIX', condicao:'',
    fornecedor:'', obs:'',
    recorrente_id:'',
    salvar_recorrente: true
  }
  const [formDespesa, setFormDespesa] = useState<any>(emptyDespesa)

  const [modalCategoria, setModalCategoria] = useState(false)
  const [formCategoria, setFormCategoria] = useState({ codigo:'', nome:'', tipo:'despesa' })

  const [modalRecorrente, setModalRecorrente] = useState(false)
  const [editandoRecorrente, setEditandoRecorrente] = useState<any>(null)
  const emptyRecorrente = {
    descricao:'', categoria_id:'', tipo_despesa:'FIXA',
    forma_pagto:'PIX', condicao:'', dia_vencimento:'10',
    valor_padrao:'', fornecedor:'', obs:''
  }
  const [formRecorrente, setFormRecorrente] = useState<any>(emptyRecorrente)

  const [modalAcessos, setModalAcessos] = useState(false)

  const [aba, setAba] = useState<'dre'|'despesas'|'recorrentes'|'categorias'>('dre')

  useEffect(()=>{ init() }, [])
  useEffect(()=>{ if (temAcesso) carregarDados() }, [competencia, temAcesso, modo])

  async function init() {
    const { data:{ user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    const { data: prof } = await supabase.from('users').select('*').eq('id', user.id).single()
    setProfile(prof)
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
    const dreView = modo === 'projecao' ? 'financeiro_dre_projetado' : 'financeiro_dre_real'
    // Para a lista de despesas no modo real, mostramos só pagas; no projetado, mostramos tudo do mês de vencimento.
    const dataField = modo === 'projecao' ? 'data_vencimento' : 'data_pgto'

    let despQuery = supabase.from('financeiro_despesas')
      .select('*, financeiro_categorias(codigo,nome,tipo)')
      .gte(dataField, desdeMes).lt(dataField, ateMesNum)
      .order(dataField, { ascending: false })
    if (modo === 'real') despQuery = despQuery.not('data_pgto','is',null)

    const [{data: seg}, {data: cat}, {data: desp}, {data: rec}, {data: fat}, {data: dreData}, {data: ac}, {data: usrs}] = await Promise.all([
      supabase.from('financeiro_seguradoras').select('*').eq('ativo', true).order('codigo'),
      supabase.from('financeiro_categorias').select('*').eq('ativo', true).order('codigo'),
      despQuery,
      supabase.from('financeiro_despesas_recorrentes').select('*, financeiro_categorias(codigo,nome)').eq('ativo', true).order('descricao'),
      supabase.from('financeiro_faturamento_seguradora').select('*').eq('competencia', competencia),
      supabase.from(dreView).select('*').eq('competencia', competencia).maybeSingle(),
      profile?.role === 'admin' ? supabase.from('financeiro_acessos').select('*, users(id,nome,email,role)') : Promise.resolve({data:[]}),
      profile?.role === 'admin' ? supabase.from('users').select('id,nome,email,role').order('nome') : Promise.resolve({data:[]}),
    ])
    setSeguradoras(seg||[]); setCategorias(cat||[]); setDespesas(desp||[]); setRecorrentes(rec||[])
    setFaturamentoSeg(fat||[]); setDre(dreData||null); setAcessos(ac||[]); setUsuarios(usrs||[])
  }

  async function salvarDespesa() {
    if (!formDespesa.descricao || !formDespesa.valor) return
    const valor = parseFloat(String(formDespesa.valor).replace(/[R$\s.]/g,'').replace(',','.'))
    const dv = formDespesa.data_vencimento || null
    const dp = formDespesa.data_pgto || null
    const dataLegacy = dp || dv || hoje.toISOString().slice(0,10)
    const payload: any = {
      categoria_id:    formDespesa.categoria_id || null,
      descricao:       formDespesa.descricao,
      valor,
      data:            dataLegacy,
      data_vencimento: dv,
      data_pgto:       dp,
      tipo_despesa:    formDespesa.tipo_despesa || null,
      condicao:        formDespesa.condicao || null,
      competencia:     (dv || dataLegacy).slice(0,7),
      forma_pagto:     formDespesa.forma_pagto || null,
      fornecedor:      formDespesa.fornecedor || null,
      obs:             formDespesa.obs || null,
      recorrente_id:   formDespesa.recorrente_id || null,
      registrado_por:  profile?.id,
    }
    if (editandoDespesa) {
      await supabase.from('financeiro_despesas').update(payload).eq('id', editandoDespesa.id)
    } else {
      await supabase.from('financeiro_despesas').insert(payload)
      // Salva como recorrente (se marcado e ainda não está vinculado a um modelo)
      if (formDespesa.salvar_recorrente && !formDespesa.recorrente_id) {
        const dia = dv ? parseInt(dv.slice(8,10)) : (dp ? parseInt(dp.slice(8,10)) : 10)
        const jaExiste = recorrentes.find((r:any)=>
          r.descricao?.toLowerCase().trim() === formDespesa.descricao.toLowerCase().trim()
        )
        if (!jaExiste) {
          await supabase.from('financeiro_despesas_recorrentes').insert({
            descricao:      formDespesa.descricao,
            categoria_id:   formDespesa.categoria_id || null,
            tipo_despesa:   formDespesa.tipo_despesa || 'FIXA',
            forma_pagto:    formDespesa.forma_pagto || null,
            condicao:       formDespesa.condicao || null,
            dia_vencimento: dia,
            valor_padrao:   valor,
            fornecedor:     formDespesa.fornecedor || null,
            obs:            formDespesa.obs || null,
            criado_por:     profile?.id,
          })
        }
      }
    }
    setModalDespesa(false); setEditandoDespesa(null); setFormDespesa(emptyDespesa)
    await carregarDados()
  }

  function aplicarRecorrente(rec: any) {
    // Calcula data de vencimento do mês corrente com o dia configurado
    const dia = Math.min(rec.dia_vencimento || 10, 28)
    const dataVenc = `${ano}-${String(mes).padStart(2,'0')}-${String(dia).padStart(2,'0')}`
    setFormDespesa({
      categoria_id: rec.categoria_id || '',
      descricao: rec.descricao,
      valor: String(rec.valor_padrao || ''),
      data_vencimento: dataVenc,
      data_pgto: '',
      tipo_despesa: rec.tipo_despesa || 'FIXA',
      forma_pagto: rec.forma_pagto || 'PIX',
      condicao: rec.condicao || '',
      fornecedor: rec.fornecedor || '',
      obs: rec.obs || '',
      recorrente_id: rec.id,
    })
  }

  async function marcarComoPaga(d: any) {
    const data_pgto = prompt('Data do pagamento (YYYY-MM-DD):', hoje.toISOString().slice(0,10))
    if (!data_pgto) return
    await supabase.from('financeiro_despesas').update({ data_pgto, data: data_pgto }).eq('id', d.id)
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

  async function salvarRecorrente() {
    if (!formRecorrente.descricao || !formRecorrente.valor_padrao) return
    const valor = parseFloat(String(formRecorrente.valor_padrao).replace(/[R$\s.]/g,'').replace(',','.'))
    const payload: any = {
      descricao:      formRecorrente.descricao,
      categoria_id:   formRecorrente.categoria_id || null,
      tipo_despesa:   formRecorrente.tipo_despesa,
      forma_pagto:    formRecorrente.forma_pagto || null,
      condicao:       formRecorrente.condicao || null,
      dia_vencimento: parseInt(formRecorrente.dia_vencimento) || null,
      valor_padrao:   valor,
      fornecedor:     formRecorrente.fornecedor || null,
      obs:            formRecorrente.obs || null,
      criado_por:     profile?.id,
    }
    if (editandoRecorrente) {
      await supabase.from('financeiro_despesas_recorrentes').update(payload).eq('id', editandoRecorrente.id)
    } else {
      await supabase.from('financeiro_despesas_recorrentes').insert(payload)
    }
    setModalRecorrente(false); setEditandoRecorrente(null); setFormRecorrente(emptyRecorrente)
    await carregarDados()
  }

  async function excluirRecorrente(id: string) {
    if (!confirm('Excluir esse modelo de despesa recorrente?')) return
    await supabase.from('financeiro_despesas_recorrentes').update({ ativo:false }).eq('id', id)
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
    const codigo = cat?.codigo || '—'
    const nome = cat?.nome || 'Sem categoria'
    if (!despesasPorCategoria[codigo]) despesasPorCategoria[codigo] = { codigo, nome, total: 0 }
    despesasPorCategoria[codigo].total += Number(d.valor || 0)
  }
  const despesasOrdenadas = Object.values(despesasPorCategoria).sort((a,b)=>a.codigo.localeCompare(b.codigo))

  return (
    <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
      <div style={{height:56,borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',padding:'0 28px',gap:12,background:'var(--bg-soft)',position:'sticky',top:0,zIndex:5}}>
        <div style={{fontFamily:'DM Serif Display,serif',fontSize:18,flex:1}}>💼 Financeiro / DRE</div>

        {/* Toggle Projeção / Real */}
        <div style={{display:'flex',background:'rgba(255,255,255,0.04)',border:'1px solid var(--border)',borderRadius:8,padding:2}}>
          {(['projecao','real'] as Modo[]).map(m => (
            <button key={m} onClick={()=>setModo(m)}
              style={{
                padding:'6px 14px', fontSize:12, fontWeight:600, cursor:'pointer',
                border:'none', borderRadius:6,
                background: modo===m ? (m==='projecao'?'rgba(74,128,240,0.2)':'rgba(28,181,160,0.2)') : 'transparent',
                color: modo===m ? (m==='projecao'?'#7aa3f8':'var(--teal)') : 'var(--text-muted)',
                fontFamily:'DM Sans,sans-serif'
              }}>
              {m==='projecao' ? '📅 Projeção' : '✅ Real'}
            </button>
          ))}
        </div>

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
        <button onClick={()=>{setEditandoDespesa(null);setFormDespesa(emptyDespesa);setModalDespesa(true)}} className="btn-primary" style={{padding:'7px 14px',fontSize:12}}>
          + Lançar despesa
        </button>
      </div>

      <div style={{flex:1,overflow:'auto',padding:'24px 28px'}}>

        {/* Cards principais */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(180px, 1fr))',gap:16,marginBottom:24}}>
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
            <div className="kpi-label">Despesas {modo==='projecao'?'(Programado)':'(Pago)'}</div>
            <div className="kpi-value kpi-value-danger">R$ {fmt(dre?.total_despesas || 0)}</div>
          </div>
          <div className="kpi">
            <div className="kpi-label">Fixas / Variáveis</div>
            <div style={{fontSize:13,fontWeight:600,marginTop:8}}>
              <span style={{color:'var(--gold)'}}>R$ {fmt(dre?.despesas_fixas || 0)}</span>
              <span style={{color:'var(--text-muted)',margin:'0 6px'}}>·</span>
              <span style={{color:'#7aa3f8'}}>R$ {fmt(dre?.despesas_variaveis || 0)}</span>
            </div>
          </div>
          <div className="kpi kpi-success">
            <div className="kpi-label">Resultado</div>
            <div className={`kpi-value ${(dre?.resultado||0)>=0?'kpi-value-success':'kpi-value-danger'}`}>R$ {fmt(dre?.resultado || 0)}</div>
          </div>
        </div>

        {/* Tabs */}
        <div style={{display:'flex',gap:0,borderBottom:'1px solid var(--border)',marginBottom:18}}>
          {[['dre','📊 DRE'],['despesas','💸 Despesas'],['recorrentes','🔁 Recorrentes'],['categorias','🗂 Categorias']].map(([k,l])=>(
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
                Despesas por Categoria — {MESES[mes-1]}/{ano} <span style={{fontSize:12,color:'var(--text-muted)',marginLeft:8}}>({modo==='projecao'?'projetado':'real'})</span>
              </div>
              {despesasOrdenadas.length === 0 ? (
                <div style={{padding:24,textAlign:'center',color:'var(--text-muted)',fontSize:13}}>Nenhuma despesa nesse mês.</div>
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
              Lançamentos — {MESES[mes-1]}/{ano} ({despesas.length}) <span style={{fontSize:12,color:'var(--text-muted)',marginLeft:8}}>({modo==='projecao'?'todas (projetadas + pagas)':'apenas pagas'})</span>
            </div>
            {despesas.length === 0 ? (
              <div style={{padding:24,textAlign:'center',color:'var(--text-muted)',fontSize:13}}>Nenhuma despesa nesse mês. Clique em <b>+ Lançar despesa</b>.</div>
            ) : (
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
                <thead>
                  <tr style={{textAlign:'left',color:'var(--text-muted)',fontSize:10,letterSpacing:'1px',textTransform:'uppercase'}}>
                    <th style={{padding:'8px 4px',borderBottom:'1px solid var(--border)'}}>Vencimento</th>
                    <th style={{padding:'8px 4px',borderBottom:'1px solid var(--border)'}}>Pago em</th>
                    <th style={{padding:'8px 4px',borderBottom:'1px solid var(--border)'}}>Tipo</th>
                    <th style={{padding:'8px 4px',borderBottom:'1px solid var(--border)'}}>Descrição</th>
                    <th style={{padding:'8px 4px',borderBottom:'1px solid var(--border)'}}>Forma</th>
                    <th style={{padding:'8px 4px',borderBottom:'1px solid var(--border)'}}>Cond.</th>
                    <th style={{padding:'8px 4px',borderBottom:'1px solid var(--border)',textAlign:'right'}}>Valor</th>
                    <th style={{padding:'8px 4px',borderBottom:'1px solid var(--border)',textAlign:'right'}}></th>
                  </tr>
                </thead>
                <tbody>
                  {despesas.map((d:any) => {
                    const pago = !!d.data_pgto
                    return (
                      <tr key={d.id} style={{borderBottom:'1px solid rgba(255,255,255,0.04)',opacity: pago ? 1 : 0.85}}>
                        <td style={{padding:'10px 4px',color:'var(--text-muted)'}}>{d.data_vencimento ? new Date(d.data_vencimento+'T00:00:00').toLocaleDateString('pt-BR') : '—'}</td>
                        <td style={{padding:'10px 4px'}}>
                          {pago ? (
                            <span style={{color:'var(--teal)'}}>{new Date(d.data_pgto+'T00:00:00').toLocaleDateString('pt-BR')}</span>
                          ) : (
                            <button onClick={()=>marcarComoPaga(d)} style={{fontSize:11,padding:'2px 8px',borderRadius:5,border:'1px solid rgba(28,181,160,0.4)',background:'rgba(28,181,160,0.10)',color:'var(--teal)',cursor:'pointer'}}>Marcar paga</button>
                          )}
                        </td>
                        <td style={{padding:'10px 4px'}}>
                          {d.tipo_despesa && <span style={{fontSize:10,fontWeight:600,padding:'2px 7px',borderRadius:5,background:d.tipo_despesa==='FIXA'?'rgba(201,168,76,0.15)':'rgba(122,163,248,0.15)',color:d.tipo_despesa==='FIXA'?'var(--gold)':'#7aa3f8',textTransform:'uppercase'}}>{d.tipo_despesa}</span>}
                        </td>
                        <td style={{padding:'10px 4px'}}>
                          <div>{d.descricao}</div>
                          {d.fornecedor && <div style={{fontSize:11,color:'var(--text-muted)'}}>{d.fornecedor}</div>}
                        </td>
                        <td style={{padding:'10px 4px',fontSize:11,color:'var(--text-muted)'}}>{d.forma_pagto || '—'}</td>
                        <td style={{padding:'10px 4px',fontSize:11,color:'var(--text-muted)',fontFamily:'monospace'}}>{d.condicao || '—'}</td>
                        <td style={{padding:'10px 4px',textAlign:'right',color:'var(--danger)',fontWeight:600}}>R$ {fmt(d.valor)}</td>
                        <td style={{padding:'10px 4px',textAlign:'right'}}>
                          <button onClick={()=>{
                            setEditandoDespesa(d)
                            setFormDespesa({
                              categoria_id:d.categoria_id||'', descricao:d.descricao, valor:String(d.valor),
                              data_vencimento:d.data_vencimento||d.data||'',
                              data_pgto:d.data_pgto||'',
                              tipo_despesa:d.tipo_despesa||'FIXA',
                              forma_pagto:d.forma_pagto||'PIX',
                              condicao:d.condicao||'',
                              fornecedor:d.fornecedor||'', obs:d.obs||'',
                              recorrente_id:d.recorrente_id||''
                            })
                            setModalDespesa(true)
                          }}
                            style={{padding:'4px 8px',borderRadius:5,fontSize:11,border:'1px solid var(--border)',background:'rgba(255,255,255,0.04)',color:'var(--gold)',cursor:'pointer',marginRight:4}}>✎</button>
                          <button onClick={()=>excluirDespesa(d.id)}
                            style={{padding:'4px 8px',borderRadius:5,fontSize:11,border:'1px solid rgba(224,82,82,0.3)',background:'rgba(224,82,82,0.06)',color:'var(--red)',cursor:'pointer'}}>🗑</button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Recorrentes */}
        {aba === 'recorrentes' && (
          <div className="card">
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
              <div>
                <div style={{fontFamily:'DM Serif Display,serif',fontSize:15}}>Despesas Recorrentes ({recorrentes.length})</div>
                <div style={{fontSize:12,color:'var(--text-muted)',marginTop:4}}>Cadastre uma vez e use mensalmente sem digitar tudo de novo.</div>
              </div>
              <button onClick={()=>{setEditandoRecorrente(null);setFormRecorrente(emptyRecorrente);setModalRecorrente(true)}} className="btn-primary" style={{padding:'7px 14px',fontSize:12}}>+ Novo modelo</button>
            </div>
            {recorrentes.length === 0 ? (
              <div style={{padding:24,textAlign:'center',color:'var(--text-muted)',fontSize:13}}>Nenhum modelo cadastrado.</div>
            ) : (
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
                <thead>
                  <tr style={{textAlign:'left',color:'var(--text-muted)',fontSize:10,letterSpacing:'1px',textTransform:'uppercase'}}>
                    <th style={{padding:'8px 4px',borderBottom:'1px solid var(--border)'}}>Descrição</th>
                    <th style={{padding:'8px 4px',borderBottom:'1px solid var(--border)'}}>Categoria</th>
                    <th style={{padding:'8px 4px',borderBottom:'1px solid var(--border)'}}>Tipo</th>
                    <th style={{padding:'8px 4px',borderBottom:'1px solid var(--border)'}}>Forma</th>
                    <th style={{padding:'8px 4px',borderBottom:'1px solid var(--border)'}}>Cond.</th>
                    <th style={{padding:'8px 4px',borderBottom:'1px solid var(--border)',textAlign:'center'}}>Dia venc.</th>
                    <th style={{padding:'8px 4px',borderBottom:'1px solid var(--border)',textAlign:'right'}}>Valor</th>
                    <th style={{padding:'8px 4px',borderBottom:'1px solid var(--border)',textAlign:'right'}}></th>
                  </tr>
                </thead>
                <tbody>
                  {recorrentes.map((r:any)=> (
                    <tr key={r.id} style={{borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
                      <td style={{padding:'10px 4px'}}>
                        <div>{r.descricao}</div>
                        {r.fornecedor && <div style={{fontSize:11,color:'var(--text-muted)'}}>{r.fornecedor}</div>}
                      </td>
                      <td style={{padding:'10px 4px',fontSize:11,fontFamily:'monospace',color:'var(--gold)'}}>{r.financeiro_categorias?.codigo} {r.financeiro_categorias?.nome}</td>
                      <td style={{padding:'10px 4px'}}>
                        <span style={{fontSize:10,fontWeight:600,padding:'2px 7px',borderRadius:5,background:r.tipo_despesa==='FIXA'?'rgba(201,168,76,0.15)':'rgba(122,163,248,0.15)',color:r.tipo_despesa==='FIXA'?'var(--gold)':'#7aa3f8'}}>{r.tipo_despesa}</span>
                      </td>
                      <td style={{padding:'10px 4px',fontSize:11,color:'var(--text-muted)'}}>{r.forma_pagto || '—'}</td>
                      <td style={{padding:'10px 4px',fontSize:11,fontFamily:'monospace'}}>{r.condicao || '—'}</td>
                      <td style={{padding:'10px 4px',textAlign:'center'}}>{r.dia_vencimento || '—'}</td>
                      <td style={{padding:'10px 4px',textAlign:'right',color:'var(--danger)',fontWeight:600}}>R$ {fmt(r.valor_padrao)}</td>
                      <td style={{padding:'10px 4px',textAlign:'right',whiteSpace:'nowrap'}}>
                        <button title="Lançar agora" onClick={()=>{setEditandoDespesa(null);aplicarRecorrente(r);setModalDespesa(true)}}
                          style={{padding:'4px 10px',borderRadius:5,fontSize:11,border:'1px solid rgba(28,181,160,0.4)',background:'rgba(28,181,160,0.10)',color:'var(--teal)',cursor:'pointer',marginRight:4}}>+ Lançar</button>
                        <button onClick={()=>{
                          setEditandoRecorrente(r)
                          setFormRecorrente({
                            descricao:r.descricao, categoria_id:r.categoria_id||'',
                            tipo_despesa:r.tipo_despesa, forma_pagto:r.forma_pagto||'PIX',
                            condicao:r.condicao||'', dia_vencimento:String(r.dia_vencimento||10),
                            valor_padrao:String(r.valor_padrao||''), fornecedor:r.fornecedor||'', obs:r.obs||''
                          })
                          setModalRecorrente(true)
                        }} style={{padding:'4px 8px',borderRadius:5,fontSize:11,border:'1px solid var(--border)',background:'rgba(255,255,255,0.04)',color:'var(--gold)',cursor:'pointer',marginRight:4}}>✎</button>
                        <button onClick={()=>excluirRecorrente(r.id)} style={{padding:'4px 8px',borderRadius:5,fontSize:11,border:'1px solid rgba(224,82,82,0.3)',background:'rgba(224,82,82,0.06)',color:'var(--red)',cursor:'pointer'}}>🗑</button>
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
          <div style={{background:'#0a1628',border:'1px solid var(--border)',borderRadius:20,padding:'28px 32px',width:600,maxWidth:'95vw',maxHeight:'90vh',overflow:'auto'}}>
            <div style={{fontFamily:'DM Serif Display,serif',fontSize:18,marginBottom:18}}>
              {editandoDespesa?'✎ Editar despesa':'+ Lançar nova despesa'}
            </div>

            {!editandoDespesa && recorrentes.length > 0 && (
              <div style={{marginBottom:14,padding:12,borderRadius:8,background:'rgba(28,181,160,0.06)',border:'1px solid rgba(28,181,160,0.2)'}}>
                <label style={{...lbl,color:'var(--teal)'}}>🔁 Usar despesa recorrente</label>
                <select onChange={e=>{
                  const r = recorrentes.find((x:any)=>x.id===e.target.value)
                  if (r) aplicarRecorrente(r)
                }} value={formDespesa.recorrente_id} style={{...inp,background:'#0e2040'}}>
                  <option value="">— selecione um modelo (opcional) —</option>
                  {recorrentes.map((r:any)=> (
                    <option key={r.id} value={r.id}>{r.descricao} · R$ {fmt(r.valor_padrao)}</option>
                  ))}
                </select>
              </div>
            )}

            <div style={{display:'grid',gridTemplateColumns:'2fr 1fr',gap:12,marginBottom:14}}>
              <div>
                <label style={lbl}>Categoria *</label>
                <select value={formDespesa.categoria_id} onChange={e=>setFormDespesa((f:any)=>({...f,categoria_id:e.target.value}))} style={{...inp,background:'#0e2040'}}>
                  <option value="">— selecione —</option>
                  {categorias.map(c => <option key={c.id} value={c.id}>{c.codigo} {c.nome}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Tipo</label>
                <select value={formDespesa.tipo_despesa} onChange={e=>setFormDespesa((f:any)=>({...f,tipo_despesa:e.target.value}))} style={{...inp,background:'#0e2040'}}>
                  <option value="FIXA">FIXA</option>
                  <option value="VARIÁVEL">VARIÁVEL</option>
                </select>
              </div>
            </div>

            <div style={{marginBottom:14}}>
              <label style={lbl}>Descrição *</label>
              <input value={formDespesa.descricao} onChange={e=>setFormDespesa((f:any)=>({...f,descricao:e.target.value}))} placeholder="Ex: Aluguel matriz" style={inp} autoFocus />
            </div>

            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12,marginBottom:14}}>
              <div>
                <label style={lbl}>Valor (R$) *</label>
                <input value={formDespesa.valor} onChange={e=>setFormDespesa((f:any)=>({...f,valor:e.target.value}))} placeholder="0,00" style={inp} />
              </div>
              <div>
                <label style={lbl}>Data Venc. *</label>
                <input type="date" value={formDespesa.data_vencimento} onChange={e=>setFormDespesa((f:any)=>({...f,data_vencimento:e.target.value}))} style={inp} />
              </div>
              <div>
                <label style={lbl}>Data Pgto</label>
                <input type="date" value={formDespesa.data_pgto} onChange={e=>setFormDespesa((f:any)=>({...f,data_pgto:e.target.value}))} style={inp} />
              </div>
            </div>

            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12,marginBottom:14}}>
              <div>
                <label style={lbl}>Forma de pagto</label>
                <select value={formDespesa.forma_pagto} onChange={e=>setFormDespesa((f:any)=>({...f,forma_pagto:e.target.value}))} style={{...inp,background:'#0e2040'}}>
                  {FORMAS_PGTO.map(fp=> <option key={fp} value={fp}>{fp}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Condição</label>
                <input value={formDespesa.condicao} onChange={e=>setFormDespesa((f:any)=>({...f,condicao:e.target.value}))} placeholder="04/60, MENSAL..." style={inp} />
              </div>
              <div>
                <label style={lbl}>Fornecedor</label>
                <input value={formDespesa.fornecedor} onChange={e=>setFormDespesa((f:any)=>({...f,fornecedor:e.target.value}))} placeholder="(opcional)" style={inp} />
              </div>
            </div>

            <div style={{marginBottom:14}}>
              <label style={lbl}>Observações</label>
              <textarea value={formDespesa.obs} onChange={e=>setFormDespesa((f:any)=>({...f,obs:e.target.value}))} rows={2} style={{...inp,resize:'none'}} placeholder="Detalhes..."/>
            </div>

            {!editandoDespesa && !formDespesa.recorrente_id && (
              <label style={{display:'flex',alignItems:'center',gap:8,padding:'10px 12px',marginBottom:18,borderRadius:8,background:'rgba(201,168,76,0.06)',border:'1px solid rgba(201,168,76,0.25)',cursor:'pointer',fontSize:13}}>
                <input type="checkbox" checked={!!formDespesa.salvar_recorrente}
                  onChange={e=>setFormDespesa((f:any)=>({...f,salvar_recorrente:e.target.checked}))}
                  style={{accentColor:'var(--gold)'}} />
                <span>🔁 Salvar como modelo recorrente <span style={{color:'var(--text-muted)',fontSize:11}}>(reutilizável nos próximos meses)</span></span>
              </label>
            )}

            <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
              <button className="btn-secondary" onClick={()=>setModalDespesa(false)}>Cancelar</button>
              <button className="btn-primary" onClick={salvarDespesa} disabled={!formDespesa.descricao||!formDespesa.valor}>
                ✓ Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Recorrente */}
      {modalRecorrente && (
        <div style={{position:'fixed',inset:0,background:'rgba(5,12,26,0.85)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',backdropFilter:'blur(6px)'}}
          onClick={e=>e.target===e.currentTarget&&setModalRecorrente(false)}>
          <div style={{background:'#0a1628',border:'1px solid var(--border)',borderRadius:20,padding:'28px 32px',width:600,maxWidth:'95vw',maxHeight:'90vh',overflow:'auto'}}>
            <div style={{fontFamily:'DM Serif Display,serif',fontSize:18,marginBottom:6}}>
              {editandoRecorrente?'✎ Editar modelo':'🔁 Novo modelo de despesa recorrente'}
            </div>
            <div style={{fontSize:12,color:'var(--text-muted)',marginBottom:18}}>
              Cadastre uma vez. Depois use o botão "+ Lançar" pra gerar a despesa do mês com 1 clique.
            </div>

            <div style={{display:'grid',gridTemplateColumns:'2fr 1fr',gap:12,marginBottom:14}}>
              <div>
                <label style={lbl}>Categoria</label>
                <select value={formRecorrente.categoria_id} onChange={e=>setFormRecorrente((f:any)=>({...f,categoria_id:e.target.value}))} style={{...inp,background:'#0e2040'}}>
                  <option value="">— selecione —</option>
                  {categorias.map(c => <option key={c.id} value={c.id}>{c.codigo} {c.nome}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Tipo</label>
                <select value={formRecorrente.tipo_despesa} onChange={e=>setFormRecorrente((f:any)=>({...f,tipo_despesa:e.target.value}))} style={{...inp,background:'#0e2040'}}>
                  <option value="FIXA">FIXA</option>
                  <option value="VARIÁVEL">VARIÁVEL</option>
                </select>
              </div>
            </div>

            <div style={{marginBottom:14}}>
              <label style={lbl}>Descrição *</label>
              <input value={formRecorrente.descricao} onChange={e=>setFormRecorrente((f:any)=>({...f,descricao:e.target.value}))} placeholder="Ex: Aluguel matriz - Falabellas Imobiliária" style={inp} autoFocus />
            </div>

            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:12,marginBottom:14}}>
              <div>
                <label style={lbl}>Valor padrão *</label>
                <input value={formRecorrente.valor_padrao} onChange={e=>setFormRecorrente((f:any)=>({...f,valor_padrao:e.target.value}))} placeholder="0,00" style={inp} />
              </div>
              <div>
                <label style={lbl}>Forma pgto</label>
                <select value={formRecorrente.forma_pagto} onChange={e=>setFormRecorrente((f:any)=>({...f,forma_pagto:e.target.value}))} style={{...inp,background:'#0e2040'}}>
                  {FORMAS_PGTO.map(fp=> <option key={fp} value={fp}>{fp}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Condição</label>
                <input value={formRecorrente.condicao} onChange={e=>setFormRecorrente((f:any)=>({...f,condicao:e.target.value}))} placeholder="04/60, MENSAL" style={inp} />
              </div>
              <div>
                <label style={lbl}>Dia venc.</label>
                <input type="number" min={1} max={31} value={formRecorrente.dia_vencimento} onChange={e=>setFormRecorrente((f:any)=>({...f,dia_vencimento:e.target.value}))} style={inp} />
              </div>
            </div>

            <div style={{marginBottom:14}}>
              <label style={lbl}>Fornecedor</label>
              <input value={formRecorrente.fornecedor} onChange={e=>setFormRecorrente((f:any)=>({...f,fornecedor:e.target.value}))} placeholder="Razão social/CNPJ (opcional)" style={inp} />
            </div>

            <div style={{marginBottom:18}}>
              <label style={lbl}>Observações</label>
              <textarea value={formRecorrente.obs} onChange={e=>setFormRecorrente((f:any)=>({...f,obs:e.target.value}))} rows={2} style={{...inp,resize:'none'}} />
            </div>

            <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
              <button className="btn-secondary" onClick={()=>setModalRecorrente(false)}>Cancelar</button>
              <button className="btn-primary" onClick={salvarRecorrente} disabled={!formRecorrente.descricao||!formRecorrente.valor_padrao}>
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
