'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Operacao = {
  id: string; mes: string; equipe_id: string | null; nome: string;
  margem_lucro_pct: number; observacao: string | null;
}
type Item = { id: string; operacao_id: string; descricao: string; categoria: string | null; valor: number; ordem: number }
type Vendedor = {
  id: string; operacao_id: string; user_id: string | null; nome_snapshot: string;
  salario_fixo: number; encargos_pct: number; comissao_pct: number; faturamento_mes: number; ordem: number;
}

const fmtBRL = (n: number) => 'R$ ' + Number(n||0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function DespesasOperacaoPage() {
  const supabase = createClient()
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [autorizado, setAutorizado] = useState(false)
  const [operacoes, setOperacoes] = useState<Operacao[]>([])
  const [opSelId, setOpSelId] = useState<string | null>(null)
  const [equipes, setEquipes] = useState<any[]>([])
  const [usuarios, setUsuarios] = useState<any[]>([])
  const [itens, setItens] = useState<Item[]>([])
  const [vendedores, setVendedores] = useState<Vendedor[]>([])
  const [simExtras, setSimExtras] = useState(0)
  const [simSalario, setSimSalario] = useState(3000)
  const [novoNome, setNovoNome] = useState('')
  const [novoMes, setNovoMes] = useState(() => new Date().toISOString().slice(0,7))
  const [novoEquipe, setNovoEquipe] = useState<string>('')
  const [novaMargem, setNovaMargem] = useState(30)
  const [modalNova, setModalNova] = useState(false)

  useEffect(() => { init() }, [])

  async function init() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    const { data: prof } = await supabase.from('users').select('role').eq('id', user.id).single()
    let lib = prof?.role === 'admin'
    if (!lib) {
      const norm = (s: string) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
      const { data: minhas } = await supabase.from('equipe_membros').select('equipes(nome)').eq('user_id', user.id)
      const { data: liderada } = await supabase.from('equipes').select('nome').eq('lider_id', user.id)
      const nomesEq = [
        ...((minhas || []) as any[]).map(m => m.equipes?.nome),
        ...((liderada || []) as any[]).map(e => e.nome),
      ].filter(Boolean).map(norm)
      lib = nomesEq.some(n => n === 'gestao' || n === 'equipe gestao')
    }
    if (!lib) { router.push('/dashboard'); return }
    setAutorizado(true)

    const [{ data: ops }, { data: eqs }, { data: us }] = await Promise.all([
      supabase.from('despesas_operacao').select('*').order('mes', { ascending: false }),
      supabase.from('equipes').select('id, nome').order('nome'),
      supabase.from('users').select('id, nome, email').is('deleted_at', null).order('nome'),
    ])
    setOperacoes((ops || []) as any)
    setEquipes(eqs || [])
    setUsuarios(us || [])
    if (ops && ops.length) setOpSelId((ops as any)[0].id)
    setLoading(false)
  }

  useEffect(() => {
    if (!opSelId) { setItens([]); setVendedores([]); return }
    Promise.all([
      supabase.from('despesas_operacao_itens').select('*').eq('operacao_id', opSelId).order('ordem'),
      supabase.from('despesas_operacao_vendedores').select('*').eq('operacao_id', opSelId).order('ordem'),
    ]).then(([resI, resV]) => {
      if (resI.error) { console.error('[despesas/itens]', resI.error); alert('Erro ao carregar despesas: ' + resI.error.message) }
      if (resV.error) { console.error('[despesas/vendedores]', resV.error); alert('Erro ao carregar vendedores: ' + resV.error.message) }
      setItens((resI.data || []) as any)
      setVendedores((resV.data || []) as any)
    }).catch(e => { console.error('[despesas/load]', e); alert('Erro ao carregar: ' + (e?.message || e)) })
  }, [opSelId])

  const opSel = useMemo(() => operacoes.find(o => o.id === opSelId) || null, [operacoes, opSelId])

  const custoOperacaoTotal = useMemo(() => itens.reduce((s, i) => s + Number(i.valor || 0), 0), [itens])
  const nVendedoresReais = vendedores.length
  const nVendedoresSimulado = Math.max(1, nVendedoresReais + simExtras)
  const custoPorVendedor = nVendedoresSimulado > 0 ? custoOperacaoTotal / nVendedoresSimulado : 0

  const calcVendedor = (v: { salario_fixo: number; encargos_pct: number; comissao_pct: number; faturamento_mes: number }) => {
    const encargos = Number(v.salario_fixo || 0) * Number(v.encargos_pct || 0) / 100
    const comissao = Number(v.faturamento_mes || 0) * Number(v.comissao_pct || 0) / 100
    const custoFolha = Number(v.salario_fixo || 0) + encargos + comissao
    const custoTotal = custoFolha + custoPorVendedor
    const margem = (opSel?.margem_lucro_pct || 0) / 100
    const fatNeutro = custoTotal // faturamento que zera (cobre custo)
    const fatLucro = custoTotal * (1 + margem)
    const resultado = Number(v.faturamento_mes || 0) - custoTotal
    return { encargos, comissao, custoFolha, custoTotal, fatNeutro, fatLucro, resultado }
  }

  const totaisGerais = useMemo(() => {
    const linhas = vendedores.map(v => ({ v, c: calcVendedor(v) }))
    const totFolha = linhas.reduce((s, x) => s + x.c.custoFolha, 0)
    const totCustoTotal = linhas.reduce((s, x) => s + x.c.custoTotal, 0)
    const totFatLucro = linhas.reduce((s, x) => s + x.c.fatLucro, 0)
    const totFaturamento = linhas.reduce((s, x) => s + Number(x.v.faturamento_mes || 0), 0)
    const totResultado = totFaturamento - totCustoTotal
    return { totFolha, totCustoTotal, totFatLucro, totFaturamento, totResultado, linhas }
  }, [vendedores, custoPorVendedor, opSel?.margem_lucro_pct])

  // Simulação: adiciona simExtras vendedores hipotéticos com simSalario
  const simulacao = useMemo(() => {
    if (simExtras <= 0) return null
    const simEncargosPct = 70
    const custoExtraPorVendedor = simSalario * (1 + simEncargosPct/100)
    const novoCustoOperacaoPorVendedor = custoOperacaoTotal / (nVendedoresReais + simExtras)
    const reducaoCustoFixoPorVendedor = (custoOperacaoTotal / Math.max(1, nVendedoresReais)) - novoCustoOperacaoPorVendedor
    return {
      novoCustoOperacaoPorVendedor,
      reducaoCustoFixoPorVendedor,
      custoExtraTotal: custoExtraPorVendedor * simExtras,
      ponto_equilibrio_extras: custoExtraPorVendedor * (1 + (opSel?.margem_lucro_pct || 0)/100),
    }
  }, [simExtras, simSalario, custoOperacaoTotal, nVendedoresReais, opSel?.margem_lucro_pct])

  async function criarOperacao() {
    if (!novoNome.trim() || !novoMes) return
    const mes = novoMes + '-01'
    const { data, error } = await supabase.from('despesas_operacao').insert({
      mes, equipe_id: novoEquipe || null, nome: novoNome.trim(),
      margem_lucro_pct: novaMargem,
    }).select().single()
    if (error) { alert('Erro: ' + error.message); return }
    setOperacoes(prev => [data as any, ...prev])
    setOpSelId((data as any).id)
    setModalNova(false); setNovoNome(''); setNovoEquipe(''); setNovaMargem(30)
  }

  async function excluirOperacao() {
    if (!opSel || !confirm(`Excluir "${opSel.nome}"?`)) return
    await supabase.from('despesas_operacao').delete().eq('id', opSel.id)
    setOperacoes(prev => prev.filter(o => o.id !== opSel.id))
    setOpSelId(operacoes.filter(o => o.id !== opSel.id)[0]?.id || null)
  }

  const [novoItemDesc, setNovoItemDesc] = useState('')
  const [novoItemValor, setNovoItemValor] = useState('')
  async function adicionarItem() {
    if (!opSel) return
    const desc = novoItemDesc.trim()
    if (!desc) { alert('Informe a descrição'); return }
    const valor = Number(String(novoItemValor).replace(',', '.')) || 0
    const { data, error } = await supabase.from('despesas_operacao_itens').insert({
      operacao_id: opSel.id, descricao: desc, valor, ordem: itens.length,
    }).select().single()
    if (error) { alert('Erro ao adicionar: ' + error.message); return }
    if (data) {
      setItens(prev => [...prev, data as any])
      setNovoItemDesc(''); setNovoItemValor('')
    }
  }

  async function salvarItem(id: string, campo: 'descricao' | 'valor', valor: any) {
    const v = campo === 'valor' ? Number(String(valor).replace(',', '.')) || 0 : valor
    const { error } = await supabase.from('despesas_operacao_itens').update({ [campo]: v }).eq('id', id)
    if (error) { alert('Erro ao salvar: ' + error.message); return }
    setItens(prev => prev.map(i => i.id === id ? { ...i, [campo]: v } : i))
  }

  async function removerItem(id: string) {
    await supabase.from('despesas_operacao_itens').delete().eq('id', id)
    setItens(prev => prev.filter(i => i.id !== id))
  }

  async function adicionarVendedor(userId: string) {
    if (!opSel) return
    const u = usuarios.find(x => x.id === userId)
    if (!u) return
    const { data, error } = await supabase.from('despesas_operacao_vendedores').insert({
      operacao_id: opSel.id, user_id: userId, nome_snapshot: u.nome,
      salario_fixo: 0, encargos_pct: 70, comissao_pct: 0, faturamento_mes: 0, ordem: vendedores.length,
    }).select().single()
    if (error) { alert('Erro: ' + error.message); return }
    setVendedores(prev => [...prev, data as any])
  }

  async function salvarVendedor(id: string, campo: keyof Vendedor, valor: any) {
    const v = ['salario_fixo','encargos_pct','comissao_pct','faturamento_mes'].includes(campo as string)
      ? Number(String(valor).replace(',', '.')) || 0
      : valor
    const { error } = await supabase.from('despesas_operacao_vendedores').update({ [campo]: v }).eq('id', id)
    if (error) { alert('Erro ao salvar vendedor: ' + error.message); return }
    setVendedores(prev => prev.map(x => x.id === id ? { ...x, [campo]: v } : x))
  }

  async function removerVendedor(id: string) {
    await supabase.from('despesas_operacao_vendedores').delete().eq('id', id)
    setVendedores(prev => prev.filter(v => v.id !== id))
  }

  async function salvarOpCampo(campo: 'margem_lucro_pct' | 'nome' | 'observacao', valor: any) {
    if (!opSel) return
    const v = campo === 'margem_lucro_pct' ? Number(String(valor).replace(',', '.')) || 0 : valor
    const { error } = await supabase.from('despesas_operacao').update({ [campo]: v }).eq('id', opSel.id)
    if (error) { alert('Erro ao salvar: ' + error.message); return }
    setOperacoes(prev => prev.map(o => o.id === opSel.id ? { ...o, [campo]: v } : o))
  }

  if (loading) return <div style={{padding:30, color:'var(--text-muted)'}}>Carregando…</div>
  if (!autorizado) return null

  const inp: React.CSSProperties = { padding:'4px 8px', border:'1px solid var(--border-strong)', borderRadius:6, fontSize:12, width:'100%', background:'#fff', color:'#0f172a' }
  const th: React.CSSProperties = { padding:'10px 12px', fontSize:11, fontWeight:600, textAlign:'left', color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:0.5, borderBottom:'1px solid var(--border-soft)' }
  const td: React.CSSProperties = { padding:'8px 12px', fontSize:12, borderBottom:'1px solid var(--border-soft)' }

  return (
    <div style={{padding:'24px 30px', maxWidth:1400, margin:'0 auto'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:18,gap:12,flexWrap:'wrap'}}>
        <div>
          <h1 style={{fontSize:22,fontWeight:700,margin:0}}>💼 Despesas da Operação</h1>
          <div style={{fontSize:12,color:'var(--text-muted)',marginTop:4}}>
            Custo total da operação dividido entre os vendedores + folha individual. Calcula faturamento mínimo para cobrir custos e gerar a margem desejada.
          </div>
        </div>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          <select value={opSelId || ''} onChange={e=>setOpSelId(e.target.value)} style={{...inp, width:280}}>
            <option value="">— Selecione uma operação —</option>
            {operacoes.map(o => (
              <option key={o.id} value={o.id}>{o.nome} ({o.mes.slice(0,7)})</option>
            ))}
          </select>
          <button onClick={()=>setModalNova(true)} style={{padding:'8px 12px',background:'var(--teal)',color:'#fff',border:'none',borderRadius:8,fontWeight:600,cursor:'pointer',fontSize:12}}>+ Nova Operação</button>
          {opSel && <button onClick={excluirOperacao} style={{padding:'8px 10px',background:'transparent',color:'var(--red)',border:'1px solid var(--red)',borderRadius:8,cursor:'pointer',fontSize:12}}>🗑</button>}
        </div>
      </div>

      {!opSel ? (
        <div style={{padding:40,textAlign:'center',color:'var(--text-muted)',background:'var(--bg-soft)',borderRadius:12}}>
          {operacoes.length === 0 ? 'Nenhuma operação cadastrada ainda. Crie a primeira.' : 'Selecione uma operação acima.'}
        </div>
      ) : (
        <>
          {/* Cabeçalho da operação */}
          <div style={{background:'var(--bg-soft)',borderRadius:12,padding:16,marginBottom:18,display:'grid',gridTemplateColumns:'1fr 200px 200px',gap:12}}>
            <div>
              <label style={{fontSize:11,color:'var(--text-muted)',textTransform:'uppercase'}}>Nome</label>
              <input value={opSel.nome} onChange={e=>salvarOpCampo('nome', e.target.value)} style={inp}/>
            </div>
            <div>
              <label style={{fontSize:11,color:'var(--text-muted)',textTransform:'uppercase'}}>Mês</label>
              <input value={opSel.mes.slice(0,7)} disabled style={{...inp,opacity:0.6}}/>
            </div>
            <div>
              <label style={{fontSize:11,color:'var(--text-muted)',textTransform:'uppercase'}}>Margem alvo (%)</label>
              <input type="number" value={opSel.margem_lucro_pct} onChange={e=>salvarOpCampo('margem_lucro_pct', e.target.value)} style={inp}/>
            </div>
          </div>

          {/* Despesas */}
          <div style={{background:'#fff',border:'1px solid var(--border-soft)',borderRadius:12,marginBottom:18,overflow:'hidden'}}>
            <div style={{padding:'12px 16px',display:'flex',justifyContent:'space-between',alignItems:'center',background:'var(--bg-soft)',borderBottom:'1px solid var(--border-soft)',gap:10,flexWrap:'wrap'}}>
              <div style={{fontWeight:600,fontSize:13,color:'#0f172a'}}>🏢 Despesas da Operação</div>
              <div style={{display:'flex',gap:6,alignItems:'center',flex:1,maxWidth:560}}>
                <input value={novoItemDesc} onChange={e=>setNovoItemDesc(e.target.value)}
                  placeholder="Descrição (ex: Aluguel, Café, Faxineira, Marketing)"
                  onKeyDown={e=>{ if(e.key==='Enter') adicionarItem() }}
                  style={{...inp, flex:2}}/>
                <input value={novoItemValor} onChange={e=>setNovoItemValor(e.target.value)}
                  placeholder="Valor R$" type="number" step="0.01"
                  onKeyDown={e=>{ if(e.key==='Enter') adicionarItem() }}
                  style={{...inp, flex:1, maxWidth:130, textAlign:'right'}}/>
                <button onClick={adicionarItem} style={{padding:'6px 12px',background:'var(--teal)',color:'#fff',border:'none',borderRadius:6,fontSize:11,fontWeight:600,cursor:'pointer',whiteSpace:'nowrap'}}>+ Adicionar</button>
              </div>
            </div>
            <table style={{width:'100%',borderCollapse:'collapse'}}>
              <thead>
                <tr><th style={th}>Descrição</th><th style={{...th,textAlign:'right',width:160}}>Valor</th><th style={{...th,width:50}}/></tr>
              </thead>
              <tbody>
                {itens.length === 0 ? (
                  <tr><td colSpan={3} style={{...td,textAlign:'center',color:'var(--text-muted)',padding:'24px'}}>Nenhuma despesa adicionada.</td></tr>
                ) : itens.map(i => (
                  <tr key={i.id}>
                    <td style={td}><input defaultValue={i.descricao} onBlur={e=>salvarItem(i.id,'descricao',e.target.value)} style={inp}/></td>
                    <td style={{...td,textAlign:'right'}}><input type="number" defaultValue={i.valor} onBlur={e=>salvarItem(i.id,'valor',e.target.value)} style={{...inp,textAlign:'right'}}/></td>
                    <td style={td}><button onClick={()=>removerItem(i.id)} style={{background:'transparent',border:'none',color:'var(--red)',cursor:'pointer'}}>×</button></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{background:'var(--bg-soft)',fontWeight:600,color:'#0f172a'}}>
                  <td style={td}>TOTAL OPERAÇÃO</td>
                  <td style={{...td,textAlign:'right'}}>{fmtBRL(custoOperacaoTotal)}</td>
                  <td style={td}/>
                </tr>
                <tr>
                  <td style={{...td,fontSize:11,color:'var(--text-muted)'}}>Custo por vendedor (÷ {nVendedoresSimulado}{simExtras>0?` = ${nVendedoresReais}+${simExtras}`:''})</td>
                  <td style={{...td,textAlign:'right',color:'var(--blue)',fontWeight:600}}>{fmtBRL(custoPorVendedor)}</td>
                  <td style={td}/>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Vendedores */}
          <div style={{background:'#fff',border:'1px solid var(--border-soft)',borderRadius:12,marginBottom:18,overflow:'auto'}}>
            <div style={{padding:'12px 16px',display:'flex',justifyContent:'space-between',alignItems:'center',background:'var(--bg-soft)',borderBottom:'1px solid var(--border-soft)'}}>
              <div style={{fontWeight:600,fontSize:13,color:'#0f172a'}}>👥 Vendedores ({vendedores.length})</div>
              <select onChange={e=>{ if(e.target.value){ adicionarVendedor(e.target.value); e.target.value='' }}} style={{...inp, width:240}}>
                <option value="">+ Adicionar vendedor…</option>
                {usuarios.filter(u => !vendedores.some(v => v.user_id === u.id)).map(u => (
                  <option key={u.id} value={u.id}>{u.nome}</option>
                ))}
              </select>
            </div>
            <table style={{width:'100%',borderCollapse:'collapse',minWidth:1200}}>
              <thead>
                <tr>
                  <th style={th}>Vendedor</th>
                  <th style={{...th,textAlign:'right'}}>Salário</th>
                  <th style={{...th,textAlign:'right'}}>Encargos %</th>
                  <th style={{...th,textAlign:'right'}}>Comissão %</th>
                  <th style={{...th,textAlign:'right'}}>Faturamento</th>
                  <th style={{...th,textAlign:'right'}}>Folha</th>
                  <th style={{...th,textAlign:'right'}}>Custo Total</th>
                  <th style={{...th,textAlign:'right'}}>Fatur. p/ Lucro</th>
                  <th style={{...th,textAlign:'right'}}>Resultado</th>
                  <th style={{...th,width:40}}/>
                </tr>
              </thead>
              <tbody>
                {totaisGerais.linhas.length === 0 ? (
                  <tr><td colSpan={10} style={{...td,textAlign:'center',color:'var(--text-muted)',padding:'24px'}}>Adicione vendedores pra ver os cálculos.</td></tr>
                ) : totaisGerais.linhas.map(({ v, c }) => (
                  <tr key={v.id}>
                    <td style={td}>{v.nome_snapshot}</td>
                    <td style={{...td,textAlign:'right',width:100}}><input type="number" defaultValue={v.salario_fixo} onBlur={e=>salvarVendedor(v.id,'salario_fixo',e.target.value)} style={{...inp,textAlign:'right'}}/></td>
                    <td style={{...td,textAlign:'right',width:80}}><input type="number" defaultValue={v.encargos_pct} onBlur={e=>salvarVendedor(v.id,'encargos_pct',e.target.value)} style={{...inp,textAlign:'right'}}/></td>
                    <td style={{...td,textAlign:'right',width:80}}><input type="number" defaultValue={v.comissao_pct} onBlur={e=>salvarVendedor(v.id,'comissao_pct',e.target.value)} style={{...inp,textAlign:'right'}}/></td>
                    <td style={{...td,textAlign:'right',width:120}}><input type="number" defaultValue={v.faturamento_mes} onBlur={e=>salvarVendedor(v.id,'faturamento_mes',e.target.value)} style={{...inp,textAlign:'right'}}/></td>
                    <td style={{...td,textAlign:'right'}}>{fmtBRL(c.custoFolha)}</td>
                    <td style={{...td,textAlign:'right',color:'#0f172a',fontWeight:600}}>{fmtBRL(c.custoTotal)}</td>
                    <td style={{...td,textAlign:'right',color:'var(--gold)',fontWeight:600}}>{fmtBRL(c.fatLucro)}</td>
                    <td style={{...td,textAlign:'right',fontWeight:700,color: c.resultado >= 0 ? 'var(--teal)' : 'var(--red)'}}>{fmtBRL(c.resultado)}</td>
                    <td style={td}><button onClick={()=>removerVendedor(v.id)} style={{background:'transparent',border:'none',color:'var(--red)',cursor:'pointer'}}>×</button></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{background:'var(--bg-soft)',fontWeight:600,color:'#0f172a'}}>
                  <td style={td}>TOTAIS</td>
                  <td style={td}/><td style={td}/><td style={td}/>
                  <td style={{...td,textAlign:'right'}}>{fmtBRL(totaisGerais.totFaturamento)}</td>
                  <td style={{...td,textAlign:'right'}}>{fmtBRL(totaisGerais.totFolha)}</td>
                  <td style={{...td,textAlign:'right'}}>{fmtBRL(totaisGerais.totCustoTotal)}</td>
                  <td style={{...td,textAlign:'right',color:'var(--gold)'}}>{fmtBRL(totaisGerais.totFatLucro)}</td>
                  <td style={{...td,textAlign:'right',color: totaisGerais.totResultado >= 0 ? 'var(--teal)' : 'var(--red)'}}>{fmtBRL(totaisGerais.totResultado)}</td>
                  <td style={td}/>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Simulação */}
          <div style={{background:'linear-gradient(135deg,rgba(28,181,160,0.08),rgba(28,181,160,0.02))',border:'1px solid rgba(28,181,160,0.3)',borderRadius:12,padding:16,marginBottom:30}}>
            <div style={{fontWeight:600,fontSize:13,color:'var(--teal)',marginBottom:10}}>🔮 Simulação: e se adicionasse mais vendedores?</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12,marginBottom:12}}>
              <div>
                <label style={{fontSize:11,color:'var(--text-muted)',textTransform:'uppercase'}}>+ Vendedores hipotéticos</label>
                <input type="number" min={0} value={simExtras} onChange={e=>setSimExtras(Math.max(0, Number(e.target.value||0)))} style={inp}/>
              </div>
              <div>
                <label style={{fontSize:11,color:'var(--text-muted)',textTransform:'uppercase'}}>Salário médio dos novos</label>
                <input type="number" value={simSalario} onChange={e=>setSimSalario(Number(e.target.value||0))} style={inp}/>
              </div>
              <div/>
            </div>
            {simulacao && (
              <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10,fontSize:12}}>
                <div style={{background:'#fff',padding:10,borderRadius:8}}>
                  <div style={{color:'var(--text-muted)',fontSize:11}}>Novo custo operação / vendedor</div>
                  <div style={{fontWeight:700,fontSize:14,color:'var(--blue)'}}>{fmtBRL(simulacao.novoCustoOperacaoPorVendedor)}</div>
                </div>
                <div style={{background:'#fff',padding:10,borderRadius:8}}>
                  <div style={{color:'var(--text-muted)',fontSize:11}}>Redução por vendedor existente</div>
                  <div style={{fontWeight:700,fontSize:14,color:'var(--teal)'}}>{fmtBRL(simulacao.reducaoCustoFixoPorVendedor)}</div>
                </div>
                <div style={{background:'#fff',padding:10,borderRadius:8}}>
                  <div style={{color:'var(--text-muted)',fontSize:11}}>Cada novo precisa faturar ≥</div>
                  <div style={{fontWeight:700,fontSize:14,color:'var(--gold)'}}>{fmtBRL(simulacao.ponto_equilibrio_extras)}</div>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Modal nova operação */}
      {modalNova && (
        <div onClick={()=>setModalNova(false)} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:100}}>
          <div onClick={e=>e.stopPropagation()} style={{background:'#fff',borderRadius:14,padding:24,width:460,maxWidth:'92vw'}}>
            <div style={{fontWeight:700,fontSize:16,marginBottom:14,color:'#0f172a'}}>Nova Operação</div>
            <div style={{display:'grid',gap:10}}>
              <div><label style={{fontSize:11,color:'var(--text-muted)'}}>Nome</label><input value={novoNome} onChange={e=>setNovoNome(e.target.value)} placeholder="Ex: Maio/2026 - Vendas" style={inp}/></div>
              <div><label style={{fontSize:11,color:'var(--text-muted)'}}>Mês</label><input type="month" value={novoMes} onChange={e=>setNovoMes(e.target.value)} style={inp}/></div>
              <div><label style={{fontSize:11,color:'var(--text-muted)'}}>Equipe (opcional)</label>
                <select value={novoEquipe} onChange={e=>setNovoEquipe(e.target.value)} style={inp}>
                  <option value="">— Sem equipe específica —</option>
                  {equipes.map(eq => <option key={eq.id} value={eq.id}>{eq.nome}</option>)}
                </select>
              </div>
              <div><label style={{fontSize:11,color:'var(--text-muted)'}}>Margem alvo (%)</label><input type="number" value={novaMargem} onChange={e=>setNovaMargem(Number(e.target.value||0))} style={inp}/></div>
            </div>
            <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:14}}>
              <button onClick={()=>setModalNova(false)} style={{padding:'8px 14px',background:'transparent',border:'1px solid var(--border-strong)',borderRadius:8,cursor:'pointer'}}>Cancelar</button>
              <button onClick={criarOperacao} style={{padding:'8px 14px',background:'var(--teal)',color:'#fff',border:'none',borderRadius:8,fontWeight:600,cursor:'pointer'}}>Criar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
