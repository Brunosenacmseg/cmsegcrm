'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Tab = 'funcionarios' | 'ferias' | 'avaliacoes' | 'comissoes' | 'beneficios' | 'aniversariantes' | 'cargos' | 'desligamentos' | 'documentos'

// Abas visíveis para QUALQUER usuário autenticado (vê só o que for próprio)
const TABS_TODOS: { key: Tab; label: string; icon: string }[] = [
  { key:'avaliacoes',       label:'Avaliações',       icon:'⭐' },
  { key:'comissoes',        label:'Comissões',        icon:'💰' },
]
// Abas restritas à equipe "RH" (e admin)
const TABS_RH: { key: Tab; label: string; icon: string }[] = [
  { key:'funcionarios',     label:'Funcionários',     icon:'🧑' },
  { key:'aniversariantes',  label:'Aniversariantes',  icon:'🎂' },
  { key:'ferias',           label:'Férias',           icon:'🏖️' },
  { key:'documentos',       label:'Documentos',       icon:'📁' },
  { key:'beneficios',       label:'Benefícios',       icon:'💼' },
  { key:'cargos',           label:'Cargos',           icon:'📋' },
  { key:'desligamentos',    label:'Desligamentos',    icon:'🚪' },
]

const inputStyle: React.CSSProperties = {
  width:'100%', background:'rgba(255,255,255,0.05)', border:'1px solid var(--border)',
  borderRadius:6, padding:'7px 10px', color:'var(--text)', fontSize:12, outline:'none', boxSizing:'border-box'
}

export default function RHPage() {
  const supabase = createClient()
  const [profile, setProfile] = useState<any>(null)
  const [isRH, setIsRH]       = useState(false)
  const [loading, setLoading] = useState(true)
  const [tab, setTab]         = useState<Tab>('avaliacoes')

  useEffect(() => { (async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: p } = await supabase.from('users').select('*').eq('id', user.id).single()
      setProfile(p)
      // Verifica se é membro da equipe "RH"
      const { data: equipes } = await supabase
        .from('equipe_membros')
        .select('equipes!inner(id, nome)')
        .eq('user_id', user.id)
      const ehRH = (equipes || []).some((m: any) =>
        String(m.equipes?.nome || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').trim() === 'rh'
      ) || p?.role === 'admin'
      setIsRH(ehRH)
      // Aba inicial: RH abre em Funcionários, demais em Comissões
      if (ehRH) setTab('funcionarios')
      else setTab('comissoes')
    }
    setLoading(false)
  })() }, [])

  // Líder e admin gerenciam o RH; demais usuários só leem o próprio.
  const podeEditar = profile?.role === 'admin' || profile?.role === 'lider' || isRH

  // Abas finais: RH vê tudo; demais só Avaliações + Comissões
  const TABS = isRH ? [...TABS_TODOS, ...TABS_RH] : TABS_TODOS

  return (
    <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
      <div style={{height:56,borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',padding:'0 28px',background:'var(--bg-soft)',position:'sticky',top:0,zIndex:5}}>
        <div style={{fontFamily:'DM Serif Display,serif',fontSize:18,flex:1}}>🧑‍💼 Recursos Humanos</div>
      </div>

      <div style={{display:'flex',gap:4,padding:'12px 28px 0',borderBottom:'1px solid var(--border)',overflowX:'auto'}}>
        {TABS.map(t => (
          <button key={t.key} onClick={()=>setTab(t.key)}
            style={{padding:'8px 14px',fontSize:12,fontWeight:600,border:'none',background:tab===t.key?'var(--gold-soft)':'transparent',color:tab===t.key?'var(--gold)':'var(--text-muted)',borderBottom:tab===t.key?'2px solid var(--gold)':'2px solid transparent',cursor:'pointer',whiteSpace:'nowrap',fontFamily:'DM Sans,sans-serif'}}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      <div style={{flex:1,overflow:'auto',padding:'24px 28px 40px'}}>
        {loading ? <div style={{color:'var(--text-muted)'}}>Carregando…</div> : (
          <>
            {tab === 'funcionarios'    && isRH && <FuncionariosTab isAdmin={podeEditar} />}
            {tab === 'aniversariantes' && isRH && <AniversariantesTab />}
            {tab === 'ferias'          && isRH && <FeriasTab isAdmin={podeEditar} />}
            {tab === 'avaliacoes'      && <SimpleListTab table="rh_avaliacoes"  isAdmin={isRH} columns={[
              {k:'periodo',label:'Período'},{k:'nota_geral',label:'Nota'},{k:'feedback',label:'Feedback'}
            ]} createFields={[
              {k:'funcionario_id',label:'Funcionário',type:'funcionario'},{k:'periodo',label:'Período (ex: 2026-Q1)',type:'text'},
              {k:'nota_geral',label:'Nota geral (0-10)',type:'number'},{k:'pontos_fortes',label:'Pontos fortes',type:'textarea'},
              {k:'pontos_melhoria',label:'Pontos de melhoria',type:'textarea'},{k:'metas',label:'Metas',type:'textarea'},
              {k:'feedback',label:'Feedback geral',type:'textarea'}
            ]} />}
            {tab === 'comissoes'       && <ComissoesTab isRH={isRH} userId={profile?.id} />}
            {tab === 'beneficios'      && isRH && <SimpleListTab table="rh_beneficios" isAdmin={podeEditar} columns={[
              {k:'tipo',label:'Tipo'},{k:'valor',label:'Valor'},{k:'inicio',label:'Início'}
            ]} createFields={[
              {k:'funcionario_id',label:'Funcionário',type:'funcionario'},{k:'tipo',label:'Tipo (VR/VT/Plano…)',type:'text'},
              {k:'valor',label:'Valor R$',type:'number'},{k:'inicio',label:'Início',type:'date'},{k:'fim',label:'Fim',type:'date'}
            ]} />}
            {tab === 'cargos'          && isRH && <SimpleListTab table="rh_cargos" isAdmin={podeEditar} columns={[
              {k:'nome',label:'Nome'},{k:'salario_base',label:'Salário base'},{k:'ativo',label:'Ativo'}
            ]} createFields={[
              {k:'nome',label:'Nome do cargo',type:'text'},{k:'descricao',label:'Descrição',type:'textarea'},
              {k:'salario_base',label:'Salário base R$',type:'number'}
            ]} />}
            {tab === 'desligamentos'   && isRH && <SimpleListTab table="rh_desligamentos" isAdmin={podeEditar} columns={[
              {k:'data',label:'Data'},{k:'tipo',label:'Tipo'},{k:'motivo',label:'Motivo'}
            ]} createFields={[
              {k:'funcionario_id',label:'Funcionário',type:'funcionario'},{k:'data',label:'Data',type:'date'},
              {k:'tipo',label:'Tipo (demissao_sem_justa_causa/justa_causa/pedido_demissao/acordo/aposentadoria/fim_contrato)',type:'text'},
              {k:'motivo',label:'Motivo',type:'textarea'},{k:'acerto_valor',label:'Acerto R$',type:'number'}
            ]} />}
            {tab === 'documentos'      && isRH && <DocumentosTab isAdmin={podeEditar} />}
          </>
        )}
      </div>
    </div>
  )
}

// ────────── Funcionários ──────────
function FuncionariosTab({ isAdmin }: { isAdmin: boolean }) {
  const supabase = createClient()
  const [list, setList] = useState<any[]>([])
  const [edit, setEdit] = useState<any|null>(null)
  const [busca, setBusca] = useState('')

  async function carregar() {
    const { data } = await supabase.from('rh_funcionarios').select('*, rh_cargos(nome)').order('nome')
    setList(data || [])
  }
  useEffect(() => { carregar() }, [])

  async function salvar() {
    if (!edit?.nome) return
    const payload: any = { ...edit }
    delete payload.rh_cargos
    if (payload.salario === '' || payload.salario === undefined) payload.salario = null
    else payload.salario = Number(String(payload.salario).replace(',','.'))
    ;['comissao_pct_padrao','comissao_pct_meta_batida'].forEach(k => {
      if (payload[k] === '' || payload[k] === undefined) payload[k] = null
      else payload[k] = Number(String(payload[k]).replace(',','.'))
    })
    ;['data_nascimento','data_admissao','data_demissao'].forEach(k => { if (payload[k] === '') payload[k] = null })
    const { error } = payload.id
      ? await supabase.from('rh_funcionarios').update(payload).eq('id', payload.id)
      : await supabase.from('rh_funcionarios').insert(payload)
    if (error) { alert('Erro: ' + error.message); return }
    setEdit(null); carregar()
  }

  async function excluir(id: string) {
    if (!confirm('Excluir funcionário?')) return
    const { error } = await supabase.from('rh_funcionarios').delete().eq('id', id)
    if (error) { alert('Erro: ' + error.message); return }
    carregar()
  }

  const filtrados = list.filter(f => !busca || f.nome.toLowerCase().includes(busca.toLowerCase()) || (f.cpf||'').includes(busca))

  return (
    <div>
      <div style={{display:'flex',gap:10,marginBottom:14,alignItems:'center'}}>
        <input placeholder="🔍 Buscar nome ou CPF…" value={busca} onChange={e=>setBusca(e.target.value)}
          style={{...inputStyle,width:300,fontSize:13}} />
        {isAdmin && <button className="btn-primary" onClick={()=>setEdit({ status:'ativo' })}>+ Novo funcionário</button>}
        <span style={{marginLeft:'auto',color:'var(--text-muted)',fontSize:12}}>{filtrados.length} funcionário(s)</span>
      </div>

      <div className="card">
        <table style={{width:'100%',borderCollapse:'collapse'}}>
          <thead><tr>
            {['Nome','Cargo','Admissão','Status','Salário','Telefone','Ações'].map(h => (
              <th key={h} style={{fontSize:10,fontWeight:600,letterSpacing:'1px',textTransform:'uppercase',color:'var(--text-muted)',textAlign:'left',padding:'0 0 10px',borderBottom:'1px solid var(--border)'}}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {filtrados.map(f => (
              <tr key={f.id}>
                <td style={{padding:'10px 0',borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
                  <div style={{fontWeight:500}}>{f.nome}</div>
                  <div style={{fontSize:11,color:'var(--text-muted)'}}>{f.cpf || '—'}</div>
                </td>
                <td style={{padding:'10px 0',borderBottom:'1px solid rgba(255,255,255,0.04)',fontSize:12}}>{f.rh_cargos?.nome || '—'}</td>
                <td style={{padding:'10px 0',borderBottom:'1px solid rgba(255,255,255,0.04)',fontSize:12}}>{f.data_admissao ? new Date(f.data_admissao).toLocaleDateString('pt-BR') : '—'}</td>
                <td style={{padding:'10px 0',borderBottom:'1px solid rgba(255,255,255,0.04)',fontSize:11}}>
                  <span style={{borderRadius:20,padding:'3px 10px',background:f.status==='ativo'?'rgba(28,181,160,0.10)':'rgba(255,255,255,0.06)',color:f.status==='ativo'?'var(--teal)':'var(--text-muted)',fontWeight:600}}>{f.status}</span>
                </td>
                <td style={{padding:'10px 0',borderBottom:'1px solid rgba(255,255,255,0.04)',fontSize:12,color:'var(--gold)'}}>{f.salario ? 'R$ '+Number(f.salario).toLocaleString('pt-BR',{minimumFractionDigits:2}) : '—'}</td>
                <td style={{padding:'10px 0',borderBottom:'1px solid rgba(255,255,255,0.04)',fontSize:12,color:'var(--text-muted)'}}>{f.telefone || '—'}</td>
                <td style={{padding:'10px 0',borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
                  {isAdmin && <>
                    <button onClick={()=>setEdit(f)} style={{fontSize:11,padding:'3px 8px',borderRadius:6,border:'1px solid var(--border)',background:'transparent',color:'var(--text)',cursor:'pointer',marginRight:4}}>Editar</button>
                    <button onClick={()=>excluir(f.id)} style={{fontSize:11,padding:'3px 8px',borderRadius:6,border:'1px solid rgba(224,82,82,0.4)',background:'rgba(224,82,82,0.05)',color:'var(--red)',cursor:'pointer'}}>Excluir</button>
                  </>}
                </td>
              </tr>
            ))}
            {filtrados.length === 0 && (
              <tr><td colSpan={7} style={{padding:30,textAlign:'center',color:'var(--text-muted)'}}>Nenhum funcionário cadastrado.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {edit && (
        <div style={{position:'fixed',inset:0,background:'rgba(15,23,42,0.55)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',backdropFilter:'blur(6px)'}} onClick={e=>e.target===e.currentTarget&&setEdit(null)}>
          <div style={{background:'#fff',borderRadius:16,padding:'24px 28px',width:760,maxWidth:'95vw',maxHeight:'90vh',overflow:'auto'}}>
            <div style={{fontFamily:'DM Serif Display,serif',fontSize:18,marginBottom:16}}>{edit.id ? '✏️ Editar funcionário' : '➕ Novo funcionário'}</div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12}}>
              {[
                ['nome','Nome *','text'],['cpf','CPF','text'],['rg','RG','text'],
                ['email','E-mail','email'],['telefone','Telefone','text'],['data_nascimento','Nascimento','date'],
                ['data_admissao','Admissão','date'],['data_demissao','Demissão','date'],['salario','Salário R$','number'],
                ['endereco','Endereço','text'],['cidade','Cidade','text'],['estado','UF','text'],
                ['cep','CEP','text'],['banco','Banco','text'],['agencia','Agência','text'],
                ['conta','Conta','text'],['pix','PIX','text'],['status','Status (ativo/ferias/afastado/desligado)','text'],
                ['contato_emerg_nome','Contato emergência','text'],['contato_emerg_fone','Fone emergência','text'],['foto_url','Foto URL','text'],
                ['comissao_pct_padrao','% Comissão padrão (sem meta)','number'],
                ['comissao_pct_meta_batida','% Comissão com meta batida','number'],
              ].map(([k,label,type]) => (
                <div key={k}>
                  <label style={{fontSize:10,color:'var(--text-muted)',display:'block',marginBottom:3,textTransform:'uppercase',fontWeight:600}}>{label}</label>
                  <input type={type} value={edit[k]??''} onChange={e=>setEdit((s:any)=>({...s,[k]:e.target.value}))} style={inputStyle} />
                </div>
              ))}
              <div style={{gridColumn:'span 3'}}>
                <label style={{fontSize:10,color:'var(--text-muted)',display:'block',marginBottom:3,textTransform:'uppercase',fontWeight:600}}>Observações</label>
                <textarea value={edit.obs??''} onChange={e=>setEdit((s:any)=>({...s,obs:e.target.value}))} rows={3} style={{...inputStyle,resize:'none',fontFamily:'DM Sans,sans-serif'}} />
              </div>
            </div>
            <div style={{display:'flex',gap:10,justifyContent:'flex-end',marginTop:18}}>
              <button className="btn-secondary" onClick={()=>setEdit(null)}>Cancelar</button>
              <button className="btn-primary" onClick={salvar}>✓ Salvar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ────────── Aniversariantes ──────────
function AniversariantesTab() {
  const supabase = createClient()
  const [list, setList] = useState<any[]>([])
  const [mes, setMes] = useState((new Date().getMonth()+1).toString())
  useEffect(() => { (async () => {
    const { data } = await supabase.from('rh_funcionarios').select('id, nome, data_nascimento, telefone').not('data_nascimento','is',null).eq('status','ativo')
    setList(data || [])
  })() }, [])
  const filtrados = list
    .filter(f => f.data_nascimento && new Date(f.data_nascimento+'T00:00:00').getMonth()+1 === parseInt(mes))
    .sort((a,b) => new Date(a.data_nascimento+'T00:00:00').getDate() - new Date(b.data_nascimento+'T00:00:00').getDate())
  const meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
  return (
    <div>
      <div style={{display:'flex',gap:10,marginBottom:14,alignItems:'center'}}>
        <span style={{fontSize:12,color:'var(--text-muted)'}}>Mês:</span>
        <select value={mes} onChange={e=>setMes(e.target.value)} style={{...inputStyle,width:160}}>
          {meses.map((m,i) => <option key={i+1} value={i+1}>{m}</option>)}
        </select>
      </div>
      <div className="card">
        {filtrados.length === 0 ? <div style={{padding:20,color:'var(--text-muted)',textAlign:'center'}}>Nenhum aniversariante neste mês.</div> :
          filtrados.map(f => {
            const d = new Date(f.data_nascimento+'T00:00:00')
            return (
              <div key={f.id} style={{display:'flex',justifyContent:'space-between',padding:'10px 0',borderBottom:'1px solid rgba(255,255,255,0.04)',alignItems:'center'}}>
                <div>
                  <div style={{fontWeight:500}}>🎂 {f.nome}</div>
                  <div style={{fontSize:11,color:'var(--text-muted)'}}>{f.telefone || '—'}</div>
                </div>
                <div style={{color:'var(--gold)',fontWeight:600,fontSize:14}}>{d.getDate().toString().padStart(2,'0')}/{(d.getMonth()+1).toString().padStart(2,'0')}</div>
              </div>
            )
          })
        }
      </div>
    </div>
  )
}

// ────────── Férias ──────────
function FeriasTab({ isAdmin }: { isAdmin: boolean }) {
  const supabase = createClient()
  const [list, setList] = useState<any[]>([])
  async function carregar() {
    const { data } = await supabase.from('rh_ferias').select('*, rh_funcionarios(nome)').order('inicio', { ascending: false })
    setList(data || [])
  }
  useEffect(() => { carregar() }, [])
  async function aprovar(id: string, status: 'aprovada'|'recusada') {
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('rh_ferias').update({ status, aprovado_por: user?.id, aprovado_em: new Date().toISOString() }).eq('id', id)
    if (error) { alert('Erro: '+error.message); return }
    carregar()
  }
  return (
    <div className="card">
      <table style={{width:'100%',borderCollapse:'collapse'}}>
        <thead><tr>{['Funcionário','Início','Fim','Dias','Status','Ações'].map(h=><th key={h} style={{fontSize:10,fontWeight:600,letterSpacing:'1px',textTransform:'uppercase',color:'var(--text-muted)',textAlign:'left',padding:'0 0 10px',borderBottom:'1px solid var(--border)'}}>{h}</th>)}</tr></thead>
        <tbody>
          {list.map(f => (
            <tr key={f.id}>
              <td style={{padding:'10px 0',borderBottom:'1px solid rgba(255,255,255,0.04)'}}>{f.rh_funcionarios?.nome || '—'}</td>
              <td style={{padding:'10px 0',borderBottom:'1px solid rgba(255,255,255,0.04)',fontSize:12}}>{new Date(f.inicio).toLocaleDateString('pt-BR')}</td>
              <td style={{padding:'10px 0',borderBottom:'1px solid rgba(255,255,255,0.04)',fontSize:12}}>{new Date(f.fim).toLocaleDateString('pt-BR')}</td>
              <td style={{padding:'10px 0',borderBottom:'1px solid rgba(255,255,255,0.04)',fontSize:12}}>{f.dias}d</td>
              <td style={{padding:'10px 0',borderBottom:'1px solid rgba(255,255,255,0.04)',fontSize:11}}><span style={{borderRadius:20,padding:'3px 10px',background:f.status==='aprovada'?'rgba(28,181,160,0.10)':f.status==='recusada'?'rgba(224,82,82,0.10)':'rgba(201,168,76,0.10)',color:f.status==='aprovada'?'var(--teal)':f.status==='recusada'?'var(--red)':'var(--gold)',fontWeight:600}}>{f.status}</span></td>
              <td style={{padding:'10px 0',borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
                {isAdmin && f.status === 'solicitada' && <>
                  <button onClick={()=>aprovar(f.id,'aprovada')} style={{fontSize:11,padding:'3px 8px',borderRadius:6,border:'1px solid rgba(28,181,160,0.4)',background:'rgba(28,181,160,0.05)',color:'var(--teal)',cursor:'pointer',marginRight:4}}>Aprovar</button>
                  <button onClick={()=>aprovar(f.id,'recusada')} style={{fontSize:11,padding:'3px 8px',borderRadius:6,border:'1px solid rgba(224,82,82,0.4)',background:'rgba(224,82,82,0.05)',color:'var(--red)',cursor:'pointer'}}>Recusar</button>
                </>}
              </td>
            </tr>
          ))}
          {list.length === 0 && <tr><td colSpan={6} style={{padding:30,textAlign:'center',color:'var(--text-muted)'}}>Sem férias registradas.</td></tr>}
        </tbody>
      </table>
    </div>
  )
}

// ────────── Lista genérica simples (CRUD básico) ──────────
function SimpleListTab({ table, columns, createFields, isAdmin }: {
  table: string,
  columns: { k: string, label: string }[],
  createFields: { k: string, label: string, type: string }[],
  isAdmin: boolean,
}) {
  const supabase = createClient()
  const [list, setList] = useState<any[]>([])
  const [novo, setNovo] = useState<any|null>(null)
  async function carregar() {
    const { data } = await supabase.from(table).select('*').order('criado_em', { ascending: false }).limit(200)
    setList(data || [])
  }
  useEffect(() => { carregar() }, [table])
  async function salvar() {
    const payload: any = { ...novo }
    for (const f of createFields) {
      if (payload[f.k] === '') payload[f.k] = null
      if (f.type === 'number' && payload[f.k] != null) payload[f.k] = Number(String(payload[f.k]).replace(',','.'))
    }
    const { error } = await supabase.from(table).insert(payload)
    if (error) { alert('Erro: '+error.message); return }
    setNovo(null); carregar()
  }
  async function excluir(id: string) {
    if (!confirm('Excluir registro?')) return
    const { error } = await supabase.from(table).delete().eq('id', id)
    if (error) { alert('Erro: '+error.message); return }
    carregar()
  }
  return (
    <div>
      {isAdmin && (
        <div style={{marginBottom:14}}>
          <button className="btn-primary" onClick={()=>setNovo({})}>+ Novo</button>
        </div>
      )}
      <div className="card">
        <table style={{width:'100%',borderCollapse:'collapse'}}>
          <thead><tr>{[...columns.map(c=>c.label),'Ações'].map(h=><th key={h} style={{fontSize:10,fontWeight:600,letterSpacing:'1px',textTransform:'uppercase',color:'var(--text-muted)',textAlign:'left',padding:'0 0 10px',borderBottom:'1px solid var(--border)'}}>{h}</th>)}</tr></thead>
          <tbody>
            {list.map(r => (
              <tr key={r.id}>
                {columns.map(c => (
                  <td key={c.k} style={{padding:'10px 0',borderBottom:'1px solid rgba(255,255,255,0.04)',fontSize:12}}>{String(r[c.k] ?? '—').slice(0,80)}</td>
                ))}
                <td style={{padding:'10px 0',borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
                  {isAdmin && <button onClick={()=>excluir(r.id)} style={{fontSize:11,padding:'3px 8px',borderRadius:6,border:'1px solid rgba(224,82,82,0.4)',background:'rgba(224,82,82,0.05)',color:'var(--red)',cursor:'pointer'}}>Excluir</button>}
                </td>
              </tr>
            ))}
            {list.length === 0 && <tr><td colSpan={columns.length+1} style={{padding:30,textAlign:'center',color:'var(--text-muted)'}}>Sem registros.</td></tr>}
          </tbody>
        </table>
      </div>
      {novo && (
        <div style={{position:'fixed',inset:0,background:'rgba(15,23,42,0.55)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',backdropFilter:'blur(6px)'}} onClick={e=>e.target===e.currentTarget&&setNovo(null)}>
          <div style={{background:'#fff',borderRadius:16,padding:'24px 28px',width:560,maxWidth:'95vw',maxHeight:'90vh',overflow:'auto'}}>
            <div style={{fontFamily:'DM Serif Display,serif',fontSize:18,marginBottom:16}}>➕ Novo</div>
            <div style={{display:'grid',gap:12}}>
              {createFields.map(f => (
                <div key={f.k}>
                  <label style={{fontSize:10,color:'var(--text-muted)',display:'block',marginBottom:3,textTransform:'uppercase',fontWeight:600}}>{f.label}</label>
                  {f.type === 'textarea' ?
                    <textarea value={novo[f.k]??''} onChange={e=>setNovo((s:any)=>({...s,[f.k]:e.target.value}))} rows={3} style={{...inputStyle,resize:'none',fontFamily:'DM Sans,sans-serif'}} /> :
                  f.type === 'funcionario' ?
                    <FuncionarioPicker value={novo[f.k]||null} onChange={(id)=>setNovo((s:any)=>({...s,[f.k]:id}))} /> :
                    <input type={f.type} value={novo[f.k]??''} onChange={e=>setNovo((s:any)=>({...s,[f.k]:e.target.value}))} style={inputStyle} />
                  }
                </div>
              ))}
            </div>
            <div style={{display:'flex',gap:10,justifyContent:'flex-end',marginTop:18}}>
              <button className="btn-secondary" onClick={()=>setNovo(null)}>Cancelar</button>
              <button className="btn-primary" onClick={salvar}>✓ Salvar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ────────── Picker de funcionário (autocomplete) ──────────
function FuncionarioPicker({ value, onChange }: { value: string|null, onChange: (id:string|null)=>void }) {
  const supabase = createClient()
  const [funcs, setFuncs] = useState<any[]>([])
  const [busca, setBusca] = useState('')
  const [aberto, setAberto] = useState(false)
  const selecionado = funcs.find(f => f.id === value)
  useEffect(() => { (async () => {
    const { data } = await supabase.from('rh_funcionarios').select('id, nome').order('nome').limit(500)
    setFuncs(data || [])
  })() }, [])
  const filtrados = busca
    ? funcs.filter(f => f.nome.toLowerCase().includes(busca.toLowerCase())).slice(0, 30)
    : funcs.slice(0, 30)
  return (
    <div style={{position:'relative'}}>
      <input
        value={aberto ? busca : (selecionado?.nome || '')}
        placeholder="Digite para buscar…"
        onFocus={()=>{ setAberto(true); setBusca('') }}
        onBlur={()=>setTimeout(()=>setAberto(false), 200)}
        onChange={e=>{ setBusca(e.target.value); setAberto(true) }}
        style={inputStyle}
      />
      {aberto && filtrados.length > 0 && (
        <div style={{position:'absolute',top:'100%',left:0,right:0,background:'#fff',border:'1px solid var(--border)',borderRadius:6,marginTop:2,maxHeight:220,overflow:'auto',zIndex:300,boxShadow:'0 4px 12px rgba(0,0,0,0.1)'}}>
          {filtrados.map(f => (
            <div key={f.id} onClick={()=>{ onChange(f.id); setBusca(''); setAberto(false) }}
              style={{padding:'8px 10px',fontSize:12,cursor:'pointer',borderBottom:'1px solid rgba(0,0,0,0.05)',color:'#000'}}
              onMouseEnter={e=>(e.currentTarget as HTMLDivElement).style.background='rgba(201,168,76,0.08)'}
              onMouseLeave={e=>(e.currentTarget as HTMLDivElement).style.background='transparent'}>
              {f.nome}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ────────── Documentos ──────────
function DocumentosTab({ isAdmin }: { isAdmin: boolean }) {
  const supabase = createClient()
  const [funcId, setFuncId] = useState<string|null>(null)
  const [docs, setDocs] = useState<any[]>([])
  const [tipo, setTipo] = useState('RG')
  const [validade, setValidade] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function carregar() {
    if (!funcId) { setDocs([]); return }
    const { data } = await supabase.from('rh_documentos').select('*').eq('funcionario_id', funcId).order('enviado_em', { ascending: false })
    setDocs(data || [])
  }
  useEffect(() => { carregar() }, [funcId])

  async function upload(file: File) {
    if (!funcId) { alert('Escolha um funcionário antes.'); return }
    setEnviando(true)
    try {
      const safe = file.name.replace(/[^\w.-]/g, '_')
      const path = `${funcId}/${Date.now()}_${safe}`
      const { error: upErr } = await supabase.storage.from('rh-documentos').upload(path, file, { upsert: false })
      if (upErr) throw upErr
      const { data: { user } } = await supabase.auth.getUser()
      const { error: insErr } = await supabase.from('rh_documentos').insert({
        funcionario_id: funcId, tipo, arquivo_url: path, arquivo_nome: file.name,
        validade: validade || null, enviado_por: user?.id || null,
      })
      if (insErr) throw insErr
      setValidade('')
      await carregar()
    } catch (e: any) {
      alert('Erro no upload: ' + (e?.message || ''))
    } finally {
      setEnviando(false)
    }
  }

  async function abrir(arquivo_url: string) {
    const { data, error } = await supabase.storage.from('rh-documentos').createSignedUrl(arquivo_url, 60)
    if (error) { alert('Erro ao gerar link: '+error.message); return }
    window.open(data.signedUrl, '_blank')
  }

  async function excluir(d: any) {
    if (!confirm('Excluir documento?')) return
    await supabase.storage.from('rh-documentos').remove([d.arquivo_url])
    await supabase.from('rh_documentos').delete().eq('id', d.id)
    carregar()
  }

  return (
    <div>
      <div style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr',gap:12,marginBottom:16,alignItems:'end'}}>
        <div>
          <label style={{fontSize:10,color:'var(--text-muted)',display:'block',marginBottom:3,textTransform:'uppercase',fontWeight:600}}>Funcionário</label>
          <FuncionarioPicker value={funcId} onChange={setFuncId} />
        </div>
        <div>
          <label style={{fontSize:10,color:'var(--text-muted)',display:'block',marginBottom:3,textTransform:'uppercase',fontWeight:600}}>Tipo</label>
          <select value={tipo} onChange={e=>setTipo(e.target.value)} style={inputStyle}>
            {['RG','CPF','CTPS','Contrato','Comprovante de residência','Foto 3x4','Atestado','Certificado','Outro'].map(t=><option key={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label style={{fontSize:10,color:'var(--text-muted)',display:'block',marginBottom:3,textTransform:'uppercase',fontWeight:600}}>Validade (opc)</label>
          <input type="date" value={validade} onChange={e=>setValidade(e.target.value)} style={inputStyle} />
        </div>
      </div>

      {isAdmin && funcId && (
        <div style={{marginBottom:16}}>
          <label style={{display:'inline-block',padding:'8px 14px',borderRadius:8,background:'var(--gold-soft)',color:'var(--gold)',cursor:enviando?'wait':'pointer',fontSize:12,fontWeight:600,border:'1px solid var(--gold)'}}>
            {enviando ? '⏳ Enviando…' : '📤 Enviar arquivo'}
            <input type="file" style={{display:'none'}} disabled={enviando}
              onChange={e=>{ const f = e.target.files?.[0]; if (f) upload(f); e.target.value='' }} />
          </label>
        </div>
      )}

      <div className="card">
        {!funcId ? <div style={{padding:20,color:'var(--text-muted)',textAlign:'center'}}>Selecione um funcionário para ver os documentos.</div> :
          docs.length === 0 ? <div style={{padding:20,color:'var(--text-muted)',textAlign:'center'}}>Nenhum documento ainda.</div> :
          <table style={{width:'100%',borderCollapse:'collapse'}}>
            <thead><tr>{['Tipo','Arquivo','Validade','Enviado em','Ações'].map(h=><th key={h} style={{fontSize:10,fontWeight:600,letterSpacing:'1px',textTransform:'uppercase',color:'var(--text-muted)',textAlign:'left',padding:'0 0 10px',borderBottom:'1px solid var(--border)'}}>{h}</th>)}</tr></thead>
            <tbody>
              {docs.map(d => (
                <tr key={d.id}>
                  <td style={{padding:'10px 0',borderBottom:'1px solid rgba(255,255,255,0.04)',fontSize:12,fontWeight:500}}>{d.tipo}</td>
                  <td style={{padding:'10px 0',borderBottom:'1px solid rgba(255,255,255,0.04)',fontSize:12,color:'var(--text-muted)'}}>{d.arquivo_nome || d.arquivo_url}</td>
                  <td style={{padding:'10px 0',borderBottom:'1px solid rgba(255,255,255,0.04)',fontSize:12}}>{d.validade ? new Date(d.validade).toLocaleDateString('pt-BR') : '—'}</td>
                  <td style={{padding:'10px 0',borderBottom:'1px solid rgba(255,255,255,0.04)',fontSize:12,color:'var(--text-muted)'}}>{new Date(d.enviado_em).toLocaleDateString('pt-BR')}</td>
                  <td style={{padding:'10px 0',borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
                    <button onClick={()=>abrir(d.arquivo_url)} style={{fontSize:11,padding:'3px 8px',borderRadius:6,border:'1px solid var(--border)',background:'transparent',color:'var(--text)',cursor:'pointer',marginRight:4}}>Abrir</button>
                    {isAdmin && <button onClick={()=>excluir(d)} style={{fontSize:11,padding:'3px 8px',borderRadius:6,border:'1px solid rgba(224,82,82,0.4)',background:'rgba(224,82,82,0.05)',color:'var(--red)',cursor:'pointer'}}>Excluir</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        }
      </div>
    </div>
  )
}

// ────────── Comissões ──────────
function ComissoesTab({ isRH, userId }: { isRH: boolean; userId: string }) {
  const supabase = createClient()
  const [list, setList] = useState<any[]>([])
  const [usuarios, setUsuarios] = useState<any[]>([])
  const [filtroUser, setFiltroUser] = useState<string>('')
  const [modal, setModal] = useState<'novo'|'duvida'|null>(null)
  const [duvidaItem, setDuvidaItem] = useState<any>(null)
  const [duvidaTexto, setDuvidaTexto] = useState('')
  const [novo, setNovo] = useState<any>({ vendedor_id:'', valor:'', competencia:'', descricao:'', file: null })
  const [carregando, setCarregando] = useState(false)
  const [filtroStatus, setFiltroStatus] = useState<'todos'|'pendente'|'aprovada'|'reprovada'|'duvida'>('todos')

  useEffect(() => { carregar() }, [filtroUser, filtroStatus])

  async function carregar() {
    let q = supabase.from('rh_comissoes')
      .select('*, vendedor:users!rh_comissoes_vendedor_id_fkey(id,nome,email), criador:users!rh_comissoes_created_by_fkey(nome)')
      .order('created_at', { ascending: false })
    if (filtroUser) q = q.eq('vendedor_id', filtroUser)
    if (filtroStatus !== 'todos') q = q.eq('status', filtroStatus)
    const { data } = await q
    setList(data || [])
    if (isRH && !usuarios.length) {
      const { data: u } = await supabase.from('users').select('id, nome').order('nome')
      setUsuarios(u || [])
    }
  }

  async function salvarNovo() {
    if (!novo.vendedor_id || !novo.valor) { alert('Vendedor e valor são obrigatórios'); return }
    setCarregando(true)
    let anexo_path: string | null = null
    let anexo_nome: string | null = null
    if (novo.file) {
      const f = novo.file as File
      const safe = f.name.replace(/[^a-zA-Z0-9._-]/g,'_')
      const path = `rh_comissoes/${novo.vendedor_id}/${Date.now()}_${safe}`
      const { error: errUp } = await supabase.storage.from('cmsegcrm').upload(path, f)
      if (errUp) { alert('Erro ao subir anexo: ' + errUp.message); setCarregando(false); return }
      anexo_path = path; anexo_nome = f.name
    }
    const { error } = await supabase.from('rh_comissoes').insert({
      vendedor_id: novo.vendedor_id,
      valor: Number(novo.valor),
      competencia: novo.competencia || null,
      descricao: novo.descricao || null,
      anexo_path, anexo_nome,
      created_by: userId,
    })
    setCarregando(false)
    if (error) { alert('Erro: ' + error.message); return }
    setModal(null); setNovo({ vendedor_id:'', valor:'', competencia:'', descricao:'', file: null })
    carregar()
  }

  async function decidir(id: string, status: 'aprovada'|'reprovada') {
    if (!confirm(`Confirmar ${status.toUpperCase()} desta comissão?`)) return
    const { error } = await supabase.from('rh_comissoes')
      .update({ status, decidido_em: new Date().toISOString() }).eq('id', id)
    if (error) { alert('Erro: ' + error.message); return }
    carregar()
  }

  async function enviarDuvida() {
    if (!duvidaItem || !duvidaTexto.trim()) return
    const { error } = await supabase.from('rh_comissoes')
      .update({ status: 'duvida', duvida_texto: duvidaTexto, decidido_em: new Date().toISOString() })
      .eq('id', duvidaItem.id)
    if (error) { alert('Erro: ' + error.message); return }
    setModal(null); setDuvidaItem(null); setDuvidaTexto('')
    carregar()
  }

  async function excluir(id: string) {
    if (!isRH) return
    if (!confirm('Excluir esta comissão?')) return
    const { error } = await supabase.from('rh_comissoes').delete().eq('id', id)
    if (error) { alert('Erro: ' + error.message); return }
    carregar()
  }

  async function baixarAnexo(path: string, nome: string) {
    const { data, error } = await supabase.storage.from('cmsegcrm').createSignedUrl(path, 60)
    if (error || !data?.signedUrl) { alert('Erro ao gerar link: ' + (error?.message || '?')); return }
    const a = document.createElement('a'); a.href = data.signedUrl; a.download = nome; a.click()
  }

  const corStatus = (s: string) =>
    s==='aprovada' ? 'rgba(28,181,160,0.18)' :
    s==='reprovada' ? 'rgba(224,82,82,0.18)' :
    s==='duvida' ? 'rgba(240,160,32,0.18)' : 'rgba(255,255,255,0.06)'
  const txtStatus = (s: string) =>
    s==='aprovada' ? 'var(--teal)' :
    s==='reprovada' ? 'var(--red)' :
    s==='duvida' ? '#f0a020' : 'var(--text-muted)'

  return (
    <div>
      <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:14,flexWrap:'wrap'}}>
        <span style={{fontSize:13,color:'var(--text-muted)'}}>
          {isRH ? 'Visualização geral (equipe RH)' : 'Suas comissões a aprovar'}
        </span>
        <div style={{flex:1}} />
        <select value={filtroStatus} onChange={e=>setFiltroStatus(e.target.value as any)}
          style={{...inputStyle, width:'auto'}}>
          <option value="todos">Todos status</option>
          <option value="pendente">Pendentes</option>
          <option value="aprovada">Aprovadas</option>
          <option value="reprovada">Reprovadas</option>
          <option value="duvida">Com dúvida</option>
        </select>
        {isRH && (
          <select value={filtroUser} onChange={e=>setFiltroUser(e.target.value)}
            style={{...inputStyle, width:'auto'}}>
            <option value="">Todos vendedores</option>
            {usuarios.map((u:any) => <option key={u.id} value={u.id}>{u.nome}</option>)}
          </select>
        )}
        {isRH && (
          <button onClick={()=>setModal('novo')} className="btn-primary"
            style={{padding:'7px 14px',fontSize:12}}>+ Nova comissão</button>
        )}
      </div>

      <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
        <thead>
          <tr style={{textAlign:'left',color:'var(--text-muted)',fontSize:10,letterSpacing:'1px',textTransform:'uppercase'}}>
            <th style={th}>Vendedor</th>
            <th style={th}>Competência</th>
            <th style={th}>Valor</th>
            <th style={th}>Anexo</th>
            <th style={th}>Status</th>
            <th style={th}>Lançada por</th>
            <th style={th}>Ações</th>
          </tr>
        </thead>
        <tbody>
          {list.map(it => {
            const podeDecidir = it.status === 'pendente' && it.vendedor_id === userId
            return (
              <tr key={it.id} style={{borderBottom:'1px solid var(--border)'}}>
                <td style={td}>{it.vendedor?.nome || '—'}</td>
                <td style={td}>{it.competencia || '—'}</td>
                <td style={{...td, fontWeight:600, color:'var(--teal)'}}>R$ {Number(it.valor||0).toLocaleString('pt-BR',{minimumFractionDigits:2})}</td>
                <td style={td}>
                  {it.anexo_path
                    ? <button onClick={()=>baixarAnexo(it.anexo_path, it.anexo_nome||'extrato.xlsx')}
                        style={{background:'none',border:'1px solid var(--border)',padding:'3px 8px',borderRadius:5,fontSize:11,cursor:'pointer',color:'var(--gold)'}}>
                        📎 {it.anexo_nome || 'baixar'}
                      </button>
                    : <span style={{color:'var(--text-muted)'}}>—</span>}
                </td>
                <td style={td}>
                  <span style={{padding:'3px 8px',borderRadius:6,fontSize:10,fontWeight:600,background:corStatus(it.status),color:txtStatus(it.status),textTransform:'uppercase'}}>
                    {it.status}
                  </span>
                  {it.status==='duvida' && it.duvida_texto && (
                    <div style={{fontSize:11,color:'#f0a020',marginTop:4}}>“{it.duvida_texto}”</div>
                  )}
                </td>
                <td style={{...td,color:'var(--text-muted)'}}>{it.criador?.nome || '—'}</td>
                <td style={td}>
                  {podeDecidir && (
                    <div style={{display:'flex',gap:4}}>
                      <button onClick={()=>decidir(it.id,'aprovada')}
                        style={{padding:'4px 8px',borderRadius:5,border:'1px solid rgba(28,181,160,0.5)',background:'rgba(28,181,160,0.12)',color:'var(--teal)',cursor:'pointer',fontSize:11,fontWeight:600}}>✓ Aprovar</button>
                      <button onClick={()=>decidir(it.id,'reprovada')}
                        style={{padding:'4px 8px',borderRadius:5,border:'1px solid rgba(224,82,82,0.5)',background:'rgba(224,82,82,0.12)',color:'var(--red)',cursor:'pointer',fontSize:11,fontWeight:600}}>✕ Reprovar</button>
                      <button onClick={()=>{setDuvidaItem(it); setDuvidaTexto(''); setModal('duvida')}}
                        style={{padding:'4px 8px',borderRadius:5,border:'1px solid rgba(240,160,32,0.5)',background:'rgba(240,160,32,0.12)',color:'#f0a020',cursor:'pointer',fontSize:11,fontWeight:600}}>? Dúvida</button>
                    </div>
                  )}
                  {isRH && (
                    <button onClick={()=>excluir(it.id)}
                      style={{padding:'4px 8px',borderRadius:5,border:'1px solid var(--border)',background:'transparent',color:'var(--red)',cursor:'pointer',fontSize:11,marginLeft:4}}>🗑</button>
                  )}
                </td>
              </tr>
            )
          })}
          {list.length === 0 && (
            <tr><td colSpan={7} style={{padding:24,textAlign:'center',color:'var(--text-muted)'}}>
              Nenhuma comissão encontrada
            </td></tr>
          )}
        </tbody>
      </table>

      {modal === 'novo' && isRH && (
        <div style={modalOverlay} onClick={e=>e.target===e.currentTarget&&setModal(null)}>
          <div style={modalBox}>
            <div style={{fontFamily:'DM Serif Display,serif',fontSize:18,marginBottom:14}}>+ Nova comissão</div>
            <div style={{display:'grid',gap:10}}>
              <div>
                <label style={lblSm}>Vendedor *</label>
                <select value={novo.vendedor_id} onChange={e=>setNovo({...novo,vendedor_id:e.target.value})} style={inputStyle}>
                  <option value="">— selecione —</option>
                  {usuarios.map((u:any) => <option key={u.id} value={u.id}>{u.nome}</option>)}
                </select>
              </div>
              <div>
                <label style={lblSm}>Valor (R$) *</label>
                <input type="number" step="0.01" value={novo.valor} onChange={e=>setNovo({...novo,valor:e.target.value})} style={inputStyle} />
              </div>
              <div>
                <label style={lblSm}>Competência (ex: 2026-04)</label>
                <input value={novo.competencia} onChange={e=>setNovo({...novo,competencia:e.target.value})} style={inputStyle} />
              </div>
              <div>
                <label style={lblSm}>Descrição</label>
                <textarea value={novo.descricao} onChange={e=>setNovo({...novo,descricao:e.target.value})} style={{...inputStyle, minHeight:60}} />
              </div>
              <div>
                <label style={lblSm}>Extrato (Excel/CSV/PDF)</label>
                <input type="file" accept=".xlsx,.xls,.csv,.pdf" onChange={e=>setNovo({...novo,file:e.target.files?.[0]||null})}
                  style={{...inputStyle, padding:6}} />
              </div>
            </div>
            <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:16}}>
              <button onClick={()=>setModal(null)} className="btn-secondary">Cancelar</button>
              <button onClick={salvarNovo} disabled={carregando} className="btn-primary">{carregando?'Salvando…':'✓ Lançar'}</button>
            </div>
          </div>
        </div>
      )}

      {modal === 'duvida' && (
        <div style={modalOverlay} onClick={e=>e.target===e.currentTarget&&setModal(null)}>
          <div style={modalBox}>
            <div style={{fontFamily:'DM Serif Display,serif',fontSize:18,marginBottom:14}}>? Tenho uma dúvida</div>
            <p style={{fontSize:13,color:'var(--text-muted)',marginTop:0}}>
              Descreva sua dúvida sobre essa comissão. A equipe RH será notificada.
            </p>
            <textarea value={duvidaTexto} onChange={e=>setDuvidaTexto(e.target.value)}
              placeholder="Ex: 'O valor da apólice X parece divergente'"
              style={{...inputStyle, minHeight:120}} autoFocus />
            <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:14}}>
              <button onClick={()=>setModal(null)} className="btn-secondary">Cancelar</button>
              <button onClick={enviarDuvida} disabled={!duvidaTexto.trim()} className="btn-primary">Enviar dúvida</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const th: React.CSSProperties = { padding:'8px 6px', borderBottom:'1px solid var(--border)' }
const td: React.CSSProperties = { padding:'8px 6px' }
const lblSm: React.CSSProperties = { display:'block', fontSize:11, color:'var(--text-muted)', marginBottom:3, textTransform:'uppercase', letterSpacing:'1px' }
const modalOverlay: React.CSSProperties = { position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:200, backdropFilter:'blur(4px)' }
const modalBox: React.CSSProperties = { background:'#fff', borderRadius:14, padding:'24px 28px', width:520, maxWidth:'95vw', maxHeight:'90vh', overflow:'auto' }
