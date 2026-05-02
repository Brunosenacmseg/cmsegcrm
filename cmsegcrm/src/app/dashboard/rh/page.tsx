'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Tab = 'funcionarios' | 'ferias' | 'avaliacoes' | 'treinamentos' | 'beneficios' | 'aniversariantes' | 'cargos' | 'desligamentos' | 'documentos'

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key:'funcionarios',     label:'Funcionários',     icon:'🧑' },
  { key:'aniversariantes',  label:'Aniversariantes',  icon:'🎂' },
  { key:'ferias',           label:'Férias',           icon:'🏖️' },
  { key:'documentos',       label:'Documentos',       icon:'📁' },
  { key:'avaliacoes',       label:'Avaliações',       icon:'⭐' },
  { key:'treinamentos',     label:'Treinamentos',     icon:'🎓' },
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
  const [tab, setTab] = useState<Tab>('funcionarios')
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { (async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: p } = await supabase.from('users').select('*').eq('id', user.id).single()
      setProfile(p)
    }
    setLoading(false)
  })() }, [])

  // Líder e admin gerenciam o RH; demais usuários só leem o próprio.
  const podeEditar = profile?.role === 'admin' || profile?.role === 'lider'

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
            {tab === 'funcionarios'    && <FuncionariosTab isAdmin={podeEditar} />}
            {tab === 'aniversariantes' && <AniversariantesTab />}
            {tab === 'ferias'          && <FeriasTab isAdmin={podeEditar} />}
            {tab === 'avaliacoes'      && <SimpleListTab table="rh_avaliacoes"  isAdmin={podeEditar} columns={[
              {k:'periodo',label:'Período'},{k:'nota_geral',label:'Nota'},{k:'feedback',label:'Feedback'}
            ]} createFields={[
              {k:'funcionario_id',label:'Funcionário',type:'funcionario'},{k:'periodo',label:'Período (ex: 2026-Q1)',type:'text'},
              {k:'nota_geral',label:'Nota geral (0-10)',type:'number'},{k:'pontos_fortes',label:'Pontos fortes',type:'textarea'},
              {k:'pontos_melhoria',label:'Pontos de melhoria',type:'textarea'},{k:'metas',label:'Metas',type:'textarea'},
              {k:'feedback',label:'Feedback geral',type:'textarea'}
            ]} />}
            {tab === 'treinamentos'    && <SimpleListTab table="rh_treinamentos" isAdmin={podeEditar} columns={[
              {k:'titulo',label:'Título'},{k:'instituicao',label:'Instituição'},{k:'status',label:'Status'},{k:'data_inicio',label:'Início'}
            ]} createFields={[
              {k:'funcionario_id',label:'Funcionário',type:'funcionario'},{k:'titulo',label:'Título',type:'text'},
              {k:'instituicao',label:'Instituição',type:'text'},{k:'carga_horaria',label:'Carga horária (h)',type:'number'},
              {k:'data_inicio',label:'Início',type:'date'},{k:'data_fim',label:'Fim',type:'date'},
              {k:'certificado_url',label:'URL do certificado',type:'text'}
            ]} />}
            {tab === 'beneficios'      && <SimpleListTab table="rh_beneficios" isAdmin={podeEditar} columns={[
              {k:'tipo',label:'Tipo'},{k:'valor',label:'Valor'},{k:'inicio',label:'Início'}
            ]} createFields={[
              {k:'funcionario_id',label:'Funcionário',type:'funcionario'},{k:'tipo',label:'Tipo (VR/VT/Plano…)',type:'text'},
              {k:'valor',label:'Valor R$',type:'number'},{k:'inicio',label:'Início',type:'date'},{k:'fim',label:'Fim',type:'date'}
            ]} />}
            {tab === 'cargos'          && <SimpleListTab table="rh_cargos" isAdmin={podeEditar} columns={[
              {k:'nome',label:'Nome'},{k:'salario_base',label:'Salário base'},{k:'ativo',label:'Ativo'}
            ]} createFields={[
              {k:'nome',label:'Nome do cargo',type:'text'},{k:'descricao',label:'Descrição',type:'textarea'},
              {k:'salario_base',label:'Salário base R$',type:'number'}
            ]} />}
            {tab === 'desligamentos'   && <SimpleListTab table="rh_desligamentos" isAdmin={podeEditar} columns={[
              {k:'data',label:'Data'},{k:'tipo',label:'Tipo'},{k:'motivo',label:'Motivo'}
            ]} createFields={[
              {k:'funcionario_id',label:'Funcionário',type:'funcionario'},{k:'data',label:'Data',type:'date'},
              {k:'tipo',label:'Tipo (demissao_sem_justa_causa/justa_causa/pedido_demissao/acordo/aposentadoria/fim_contrato)',type:'text'},
              {k:'motivo',label:'Motivo',type:'textarea'},{k:'acerto_valor',label:'Acerto R$',type:'number'}
            ]} />}
            {tab === 'documentos'      && <DocumentosTab isAdmin={podeEditar} />}
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
