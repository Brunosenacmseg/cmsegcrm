'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { maskCpfCnpj, maskTelefone, maskCEP } from '@/lib/masks'
import { getVisibleUserIds } from '@/lib/auth'
import { exportarXLSX, fmt } from '@/lib/export-xlsx'

const SEXOS         = ['Masculino','Feminino','Outro']
const ESTADOS_CIVIS = ['Solteiro(a)','Casado(a)','Divorciado(a)','Viúvo(a)','União Estável']
const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO']

// IMPORTANTE: estes componentes ficam FORA do componente principal.
// Se forem declarados dentro, são recriados a cada render → React desmonta e
// remonta os <input>, fazendo o foco saltar e/ou ser perdido a cada tecla.
function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ fontSize:11, color:'var(--text-muted)', display:'block', marginBottom:4, fontWeight:500 }}>{label}</label>
      {children}
    </div>
  )
}

function EnderecoBloco({
  prefix, titulo, form, setForm, buscarCep, inp, sel,
}: {
  prefix: ''|'2'|'3';
  titulo: string;
  form: any;
  setForm: React.Dispatch<React.SetStateAction<any>>;
  buscarCep: (cep: string, prefix: ''|'2'|'3') => void;
  inp: React.CSSProperties;
  sel: React.CSSProperties;
}) {
  const p = prefix
  return (
    <div style={{ marginBottom:20 }}>
      <div style={{ fontSize:13, fontWeight:600, color:'var(--gold)', marginBottom:12, paddingBottom:6, borderBottom:'1px solid var(--border)' }}>{titulo}</div>
      <div style={{ display:'grid', gridTemplateColumns:'140px 1fr 80px', gap:10, marginBottom:10 }}>
        <Campo label="CEP">
          <input value={form[`cep${p}`]} onChange={e=>setForm((f:any)=>({...f,[`cep${p}`]:maskCEP(e.target.value)}))}
            onBlur={e=>buscarCep(e.target.value, p)} placeholder="00000-000" style={inp} />
        </Campo>
        <Campo label="Endereço">
          <input value={form[`endereco${p}`]} onChange={e=>setForm((f:any)=>({...f,[`endereco${p}`]:e.target.value}))} placeholder="Rua, Av..." style={inp} />
        </Campo>
        <Campo label="Número">
          <input value={form[`numero${p}`]} onChange={e=>setForm((f:any)=>({...f,[`numero${p}`]:e.target.value}))} placeholder="123" style={inp} />
        </Campo>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 80px', gap:10 }}>
        <Campo label="Complemento">
          <input value={form[`complemento${p}`]} onChange={e=>setForm((f:any)=>({...f,[`complemento${p}`]:e.target.value}))} placeholder="Apto, Sala..." style={inp} />
        </Campo>
        <Campo label="Bairro">
          <input value={form[`bairro${p}`]} onChange={e=>setForm((f:any)=>({...f,[`bairro${p}`]:e.target.value}))} style={inp} />
        </Campo>
        <Campo label="Cidade">
          <input value={form[`cidade${p}`]} onChange={e=>setForm((f:any)=>({...f,[`cidade${p}`]:e.target.value}))} style={inp} />
        </Campo>
        <Campo label="UF">
          <select value={form[`estado${p}`]} onChange={e=>setForm((f:any)=>({...f,[`estado${p}`]:e.target.value}))} style={sel}>
            <option value="">—</option>
            {UFS.map(u=><option key={u}>{u}</option>)}
          </select>
        </Campo>
      </div>
    </div>
  )
}

export default function ClientesPage() {
  const supabase = createClient()
  const router   = useRouter()

  const [profile, setProfile]     = useState<any>(null)
  const [usuarios, setUsuarios]   = useState<any[]>([])
  const [clientes, setClientes]   = useState<any[]>([])
  const [loading, setLoading]     = useState(true)
  const [busca, setBusca]         = useState('')
  const [filtroUsuario, setFiltroUsuario] = useState<string>('')
  const [visibleIds, setVisibleIds]       = useState<string[] | null>(null)
  const [modal, setModal]         = useState(false)
  const [salvando, setSalvando]   = useState(false)
  const [editando, setEditando]   = useState<any>(null)

  const clienteVazio = {
    tipo:'PF', nome:'', cpf_cnpj:'', nascimento:'', aniversario:'', rg:'', sexo:'', estado_civil:'',
    telefone:'', telefone2:'', telefone3:'',
    email:'', email2:'', email3:'',
    cep:'', endereco:'', numero:'', complemento:'', bairro:'', cidade:'', estado:'',
    cep2:'', endereco2:'', numero2:'', complemento2:'', bairro2:'', cidade2:'', estado2:'',
    cep3:'', endereco3:'', numero3:'', complemento3:'', bairro3:'', cidade3:'', estado3:'',
    observacao:'',
    vendedor_id:'',
    // Novos campos (migration 028)
    cliente_desde:'', vencimento_cnh:'',
    ativo:true, receber_email:true,
    profissao:'', ramo:'', renda_mensal:'',
    estipulantes:'', filial:'', parentesco:'', pasta_cliente:'',
  }
  const [form, setForm] = useState({ ...clienteVazio })
  const [abaModal, setAbaModal] = useState<'dados'|'enderecos'|'contato'|'profissional'|'sistema'|'obs'>('dados')

  useEffect(() => { init() }, [])

  async function init() {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: prof } = await supabase.from('users').select('*').eq('id', user?.id||'').single()
    setProfile(prof)
    const ids = await getVisibleUserIds()
    setVisibleIds(ids)
    let usrsQ = supabase.from('users').select('id,nome,role').order('nome')
    if (ids) usrsQ = usrsQ.in('id', ids)
    const { data: usrs } = await usrsQ
    setUsuarios(usrs || [])
    await carregar(ids, '')
  }

  async function carregar(ids: string[] | null = visibleIds, fu: string = filtroUsuario) {
    setLoading(true)
    let q = supabase.from('clientes').select('*, users!clientes_vendedor_id_fkey(nome)').order('nome')
    if (busca) q = q.or(`nome.ilike.%${busca}%,cpf_cnpj.ilike.%${busca}%,telefone.ilike.%${busca}%,email.ilike.%${busca}%`)
    if (fu) q = q.eq('vendedor_id', fu)
    else if (ids) q = q.in('vendedor_id', ids)
    const { data } = await q
    setClientes(data||[])
    setLoading(false)
  }

  useEffect(() => { if (!loading) carregar() }, [busca, filtroUsuario])

  async function buscarCep(cep: string, prefix: ''|'2'|'3') {
    const c = cep.replace(/\D/g,'')
    if (c.length !== 8) return
    try {
      const res = await fetch(`https://viacep.com.br/ws/${c}/json/`)
      const data = await res.json()
      if (!data.erro) {
        setForm(f => ({
          ...f,
          [`endereco${prefix}`]: data.logradouro || '',
          [`bairro${prefix}`]:   data.bairro     || '',
          [`cidade${prefix}`]:   data.localidade || '',
          [`estado${prefix}`]:   data.uf         || '',
        }))
      }
    } catch {}
  }

  async function salvar() {
    if (!form.nome && !form.cpf_cnpj) { alert('Informe nome ou CPF/CNPJ'); return }
    setSalvando(true)
    const renda = form.renda_mensal ? parseFloat(String(form.renda_mensal).replace(/[R$\s.]/g,'').replace(',','.')) || null : null
    const payload: any = {
      ...form,
      nascimento:     form.nascimento || null,
      cliente_desde:  form.cliente_desde || null,
      vencimento_cnh: form.vencimento_cnh || null,
      renda_mensal:   renda,
      vendedor_id:    form.vendedor_id || profile?.id,
    }
    if (editando) {
      await supabase.from('clientes').update(payload).eq('id', editando.id)
    } else {
      await supabase.from('clientes').insert(payload)
    }
    setModal(false)
    setEditando(null)
    setForm({ ...clienteVazio })
    setSalvando(false)
    await carregar()
  }

  async function excluir(id: string) {
    if (profile?.role !== 'admin') { alert('Apenas administradores podem excluir clientes'); return }
    if (!confirm('Excluir este cliente? Esta ação não pode ser desfeita.')) return
    await supabase.from('clientes').delete().eq('id', id)
    await carregar()
  }

  function abrirEditar(c: any) {
    setEditando(c)
    setForm({
      tipo:         c.tipo||'PF',
      nome:         c.nome||'',
      cpf_cnpj:     c.cpf_cnpj||'',
      nascimento:   c.nascimento||'',
      rg:           c.rg||'',
      sexo:         c.sexo||'',
      estado_civil: c.estado_civil||'',
      telefone:     c.telefone||'',
      telefone2:    c.telefone2||'',
      telefone3:    c.telefone3||'',
      email:        c.email||'',
      email2:       c.email2||'',
      email3:       c.email3||'',
      cep:          c.cep||'',
      endereco:     c.endereco||'',
      numero:       c.numero||'',
      complemento:  c.complemento||'',
      bairro:       c.bairro||'',
      cidade:       c.cidade||'',
      estado:       c.estado||'',
      cep2:         c.cep2||'',
      endereco2:    c.endereco2||'',
      numero2:      c.numero2||'',
      complemento2: c.complemento2||'',
      bairro2:      c.bairro2||'',
      cidade2:      c.cidade2||'',
      estado2:      c.estado2||'',
      cep3:         c.cep3||'',
      endereco3:    c.endereco3||'',
      numero3:      c.numero3||'',
      complemento3: c.complemento3||'',
      bairro3:      c.bairro3||'',
      cidade3:      c.cidade3||'',
      estado3:      c.estado3||'',
      observacao:   c.observacao||'',
      vendedor_id:  c.vendedor_id||'',
      // Novos campos
      aniversario:    c.aniversario||'',
      cliente_desde:  c.cliente_desde||'',
      vencimento_cnh: c.vencimento_cnh||'',
      ativo:          c.ativo === false ? false : true,
      receber_email:  c.receber_email === false ? false : true,
      profissao:      c.profissao||'',
      ramo:           c.ramo||'',
      renda_mensal:   c.renda_mensal != null ? String(c.renda_mensal) : '',
      estipulantes:   c.estipulantes||'',
      filial:         c.filial||'',
      parentesco:     c.parentesco||'',
      pasta_cliente:  c.pasta_cliente||'',
    })
    setAbaModal('dados')
    setModal(true)
  }

  const inp: React.CSSProperties = { width:'100%', background:'rgba(255,255,255,0.05)', border:'1px solid var(--border)', borderRadius:8, padding:'8px 12px', color:'var(--text)', fontSize:13, fontFamily:'DM Sans,sans-serif', outline:'none', boxSizing:'border-box' as const }
  const sel: React.CSSProperties = { ...inp, cursor:'pointer', appearance:'none' as const }

  return (
    <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
      <div style={{height:56,borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',padding:'0 28px',gap:12,background:'var(--bg-soft)',backdropFilter:'blur(8px)',position:'sticky',top:0,zIndex:5,flexShrink:0}}>
        <div style={{fontFamily:'DM Serif Display,serif',fontSize:18,flex:1}}>👥 Clientes</div>
        <input value={busca} onChange={e=>setBusca(e.target.value)} placeholder="🔍 Buscar por nome, CPF, email, telefone..."
          style={{...inp, width:280, borderRadius:20}} />
        {profile && profile.role !== 'corretor' && (
          <select value={filtroUsuario} onChange={e=>setFiltroUsuario(e.target.value)}
            style={{...sel, width:200, borderRadius:20}} title="Filtrar por usuário">
            <option value="">👥 {profile.role==='admin'?'Todos os usuários':'Toda a equipe'}</option>
            {usuarios.map(u=><option key={u.id} value={u.id}>{u.nome}</option>)}
          </select>
        )}
        <button onClick={()=>exportarXLSX(clientes, [
          { campo:'nome',     titulo:'Nome' },
          { campo:'tipo',     titulo:'Tipo' },
          { campo:'cpf_cnpj', titulo:'CPF/CNPJ' },
          { campo:'email',    titulo:'Email' },
          { campo:'telefone', titulo:'Telefone' },
          { campo:'cep',      titulo:'CEP' },
          { campo:'cidade',   titulo:'Cidade' },
          { campo:'estado',   titulo:'UF' },
          { campo:'fonte',    titulo:'Fonte' },
          { campo:'created_at', titulo:'Cadastrado em', fmt:fmt.dataHora },
        ], 'clientes')}
          style={{padding:'7px 12px',borderRadius:8,fontSize:12,border:'1px solid var(--border)',background:'rgba(255,255,255,0.04)',color:'var(--text-muted)',cursor:'pointer',whiteSpace:'nowrap'}}
          title="Exportar lista atual em Excel">
          📥 Exportar ({clientes.length})
        </button>
        <button className="btn-primary" onClick={()=>{setEditando(null);setForm({...clienteVazio});setAbaModal('dados');setModal(true)}}>
          + Novo Cliente
        </button>
      </div>

      <div style={{flex:1,overflow:'auto',padding:'20px 28px'}}>
        {loading ? (
          <div style={{textAlign:'center',padding:40,color:'var(--text-muted)'}}>Carregando...</div>
        ) : clientes.length === 0 ? (
          <div className="card" style={{textAlign:'center',padding:40,color:'var(--text-muted)'}}>
            <div style={{fontSize:48,marginBottom:12}}>👥</div>
            <div>{busca ? 'Nenhum cliente encontrado' : 'Nenhum cliente cadastrado'}</div>
          </div>
        ) : (
          <div className="card">
            <table style={{width:'100%',borderCollapse:'collapse'}}>
              <thead>
                <tr>{['Nome','CPF/CNPJ','Telefone','Email','Cidade','Responsável',''].map(h=>(
                  <th key={h} style={{fontSize:10,fontWeight:600,letterSpacing:'1.2px',textTransform:'uppercase',color:'var(--text-muted)',textAlign:'left',padding:'0 0 10px',borderBottom:'1px solid var(--border)'}}>{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                {clientes.map(c=>(
                  <tr key={c.id} onMouseEnter={e=>(e.currentTarget.style.background='rgba(201,168,76,0.03)')} onMouseLeave={e=>(e.currentTarget.style.background='')}>
                    <td style={{padding:'10px 0',borderBottom:'1px solid rgba(255,255,255,0.04)',cursor:'pointer'}} onClick={()=>router.push(`/dashboard/clientes/${c.id}`)}>
                      <div style={{fontSize:13,fontWeight:500}}>{c.nome||'—'}</div>
                      <div style={{fontSize:11,color:'var(--text-muted)'}}>{c.tipo}</div>
                    </td>
                    <td style={{padding:'10px 0',borderBottom:'1px solid rgba(255,255,255,0.04)',fontSize:12,color:'var(--text-muted)'}}>{c.cpf_cnpj||'—'}</td>
                    <td style={{padding:'10px 0',borderBottom:'1px solid rgba(255,255,255,0.04)',fontSize:12}}>{c.telefone||'—'}</td>
                    <td style={{padding:'10px 0',borderBottom:'1px solid rgba(255,255,255,0.04)',fontSize:12,color:'var(--text-muted)'}}>{c.email||'—'}</td>
                    <td style={{padding:'10px 0',borderBottom:'1px solid rgba(255,255,255,0.04)',fontSize:12,color:'var(--text-muted)'}}>{c.cidade||'—'}</td>
                    <td style={{padding:'10px 0',borderBottom:'1px solid rgba(255,255,255,0.04)',fontSize:12,color:'var(--gold)'}}>{c['users!clientes_vendedor_id_fkey']?.nome?.split(' ')[0]||'—'}</td>
                    <td style={{padding:'10px 0',borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
                      <div style={{display:'flex',gap:6}}>
                        <button onClick={()=>abrirEditar(c)} style={{padding:'4px 10px',borderRadius:6,fontSize:11,cursor:'pointer',border:'1px solid var(--border)',background:'rgba(255,255,255,0.05)',color:'var(--text-muted)',fontFamily:'DM Sans,sans-serif'}}>✏️</button>
                        {profile?.role==='admin' && (
                          <button onClick={()=>excluir(c.id)} style={{padding:'4px 10px',borderRadius:6,fontSize:11,cursor:'pointer',border:'1px solid rgba(224,82,82,0.3)',background:'rgba(224,82,82,0.08)',color:'var(--red)',fontFamily:'DM Sans,sans-serif'}}>🗑</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      {modal && (
        <div style={{position:'fixed',inset:0,background:'rgba(15,23,42,0.45)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',backdropFilter:'blur(6px)'}}
          onClick={e=>e.target===e.currentTarget&&setModal(false)}>
          <div style={{background:'#ffffff',border:'1px solid var(--border)',borderRadius:20,width:680,maxWidth:'97vw',maxHeight:'92vh',display:'flex',flexDirection:'column',overflow:'hidden'}}>
            {/* Header modal */}
            <div style={{padding:'20px 24px',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0}}>
              <div style={{fontFamily:'DM Serif Display,serif',fontSize:18}}>{editando?'Editar Cliente':'Novo Cliente'}</div>
              <button onClick={()=>setModal(false)} style={{background:'none',border:'none',color:'var(--text-muted)',cursor:'pointer',fontSize:20}}>✕</button>
            </div>

            {/* Abas */}
            <div style={{display:'flex',gap:0,borderBottom:'1px solid var(--border)',flexShrink:0}}>
              {([['dados','👤 Dados'],['contato','📞 Contato'],['enderecos','📍 Endereços'],['profissional','💼 Profissional'],['sistema','⚙ Sistema'],['obs','📝 Obs']] as const).map(([k,l])=>(
                <button key={k} onClick={()=>setAbaModal(k as any)}
                  style={{padding:'10px 20px',fontSize:13,cursor:'pointer',border:'none',borderBottom:abaModal===k?'2px solid var(--gold)':'2px solid transparent',background:'transparent',color:abaModal===k?'var(--gold)':'var(--text-muted)',fontFamily:'DM Sans,sans-serif',marginBottom:-1}}>
                  {l}
                </button>
              ))}
            </div>

            {/* Conteúdo */}
            <div style={{flex:1,overflow:'auto',padding:'20px 24px'}}>

              {abaModal==='dados' && (
                <div style={{display:'flex',flexDirection:'column',gap:14}}>
                  <div style={{display:'grid',gridTemplateColumns:'120px 1fr',gap:12}}>
                    <Campo label="Tipo">
                      <select value={form.tipo} onChange={e=>setForm(f=>({...f,tipo:e.target.value}))} style={sel}>
                        <option value="PF">Pessoa Física</option>
                        <option value="PJ">Pessoa Jurídica</option>
                      </select>
                    </Campo>
                    <Campo label="CPF / CNPJ">
                      <input value={form.cpf_cnpj} onChange={e=>setForm(f=>({...f,cpf_cnpj:maskCpfCnpj(e.target.value)}))} placeholder={form.tipo==='PF'?'000.000.000-00':'00.000.000/0000-00'} style={inp} />
                    </Campo>
                  </div>
                  <Campo label="Nome Completo">
                    <input value={form.nome} onChange={e=>setForm(f=>({...f,nome:e.target.value}))} placeholder="Nome completo" style={inp} />
                  </Campo>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12}}>
                    <Campo label="Data de Nascimento">
                      <input type="date" value={form.nascimento} onChange={e=>setForm(f=>({...f,nascimento:e.target.value}))} style={inp} />
                    </Campo>
                    <Campo label="RG">
                      <input value={form.rg} onChange={e=>setForm(f=>({...f,rg:e.target.value}))} placeholder="00.000.000-0" style={inp} />
                    </Campo>
                    <Campo label="Sexo">
                      <select value={form.sexo} onChange={e=>setForm(f=>({...f,sexo:e.target.value}))} style={sel}>
                        <option value="">— Selecione —</option>
                        {SEXOS.map(s=><option key={s}>{s}</option>)}
                      </select>
                    </Campo>
                  </div>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                    <Campo label="Estado Civil">
                      <select value={form.estado_civil} onChange={e=>setForm(f=>({...f,estado_civil:e.target.value}))} style={sel}>
                        <option value="">— Selecione —</option>
                        {ESTADOS_CIVIS.map(s=><option key={s}>{s}</option>)}
                      </select>
                    </Campo>
                    <Campo label="Aniversário (DD/MM)">
                      <input value={form.aniversario} onChange={e=>setForm(f=>({...f,aniversario:e.target.value}))} placeholder="01/05" maxLength={5} style={inp} />
                    </Campo>
                  </div>
                </div>
              )}

              {abaModal==='contato' && (
                <div style={{display:'flex',flexDirection:'column',gap:14}}>
                  <div style={{fontSize:13,fontWeight:600,color:'var(--gold)',marginBottom:4}}>Telefones</div>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12}}>
                    <Campo label="Telefone 1"><input value={form.telefone} onChange={e=>setForm(f=>({...f,telefone:maskTelefone(e.target.value)}))} placeholder="(00) 00000-0000" style={inp} /></Campo>
                    <Campo label="Telefone 2"><input value={form.telefone2} onChange={e=>setForm(f=>({...f,telefone2:maskTelefone(e.target.value)}))} placeholder="(00) 00000-0000" style={inp} /></Campo>
                    <Campo label="Telefone 3"><input value={form.telefone3} onChange={e=>setForm(f=>({...f,telefone3:maskTelefone(e.target.value)}))} placeholder="(00) 00000-0000" style={inp} /></Campo>
                  </div>
                  <div style={{fontSize:13,fontWeight:600,color:'var(--gold)',marginTop:8,marginBottom:4}}>E-mails</div>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12}}>
                    <Campo label="Email 1"><input type="email" value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))} placeholder="email@email.com" style={inp} /></Campo>
                    <Campo label="Email 2"><input type="email" value={form.email2} onChange={e=>setForm(f=>({...f,email2:e.target.value}))} placeholder="email@email.com" style={inp} /></Campo>
                    <Campo label="Email 3"><input type="email" value={form.email3} onChange={e=>setForm(f=>({...f,email3:e.target.value}))} placeholder="email@email.com" style={inp} /></Campo>
                  </div>
                </div>
              )}

              {abaModal==='enderecos' && (
                <div>
                  <EnderecoBloco prefix=""  titulo="📍 Endereço Principal" form={form} setForm={setForm} buscarCep={buscarCep} inp={inp} sel={sel} />
                  <EnderecoBloco prefix="2" titulo="📍 Endereço 2"          form={form} setForm={setForm} buscarCep={buscarCep} inp={inp} sel={sel} />
                  <EnderecoBloco prefix="3" titulo="📍 Endereço 3"          form={form} setForm={setForm} buscarCep={buscarCep} inp={inp} sel={sel} />
                </div>
              )}

              {abaModal==='profissional' && (
                <div style={{display:'flex',flexDirection:'column',gap:14}}>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                    <Campo label="Profissão">
                      <input value={form.profissao} onChange={e=>setForm(f=>({...f,profissao:e.target.value}))} placeholder="Ex: Médico, Engenheiro" style={inp} />
                    </Campo>
                    <Campo label="Ramo de Atuação">
                      <input value={form.ramo} onChange={e=>setForm(f=>({...f,ramo:e.target.value}))} placeholder="Ex: Saúde, Tecnologia" style={inp} />
                    </Campo>
                  </div>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                    <Campo label="Renda Mensal (R$)">
                      <input value={form.renda_mensal} onChange={e=>setForm(f=>({...f,renda_mensal:e.target.value}))} placeholder="0,00" style={inp} />
                    </Campo>
                    <Campo label="Vencimento CNH">
                      <input type="date" value={form.vencimento_cnh} onChange={e=>setForm(f=>({...f,vencimento_cnh:e.target.value}))} style={inp} />
                    </Campo>
                  </div>
                  <Campo label="Estipulantes">
                    <input value={form.estipulantes} onChange={e=>setForm(f=>({...f,estipulantes:e.target.value}))} placeholder="Empresa/órgão estipulante (apólices coletivas)" style={inp} />
                  </Campo>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                    <Campo label="Filial">
                      <input value={form.filial} onChange={e=>setForm(f=>({...f,filial:e.target.value}))} placeholder="Ex: Matriz, Unidade SP" style={inp} />
                    </Campo>
                    <Campo label="Parentesco">
                      <input value={form.parentesco} onChange={e=>setForm(f=>({...f,parentesco:e.target.value}))} placeholder="Ex: Cônjuge de João" style={inp} />
                    </Campo>
                  </div>
                </div>
              )}

              {abaModal==='sistema' && (
                <div style={{display:'flex',flexDirection:'column',gap:14}}>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                    <Campo label="Cliente desde">
                      <input type="date" value={form.cliente_desde} onChange={e=>setForm(f=>({...f,cliente_desde:e.target.value}))} style={inp} />
                    </Campo>
                    <Campo label="Vendedor responsável">
                      <select value={form.vendedor_id} onChange={e=>setForm(f=>({...f,vendedor_id:e.target.value}))} style={sel}>
                        <option value="">— Sem vendedor —</option>
                        {usuarios.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
                      </select>
                    </Campo>
                  </div>
                  <Campo label="Pasta do Cliente (URL externa)">
                    <input value={form.pasta_cliente} onChange={e=>setForm(f=>({...f,pasta_cliente:e.target.value}))} placeholder="https://drive.google.com/... (opcional)" style={inp} />
                  </Campo>
                  <div style={{display:'flex',gap:14,padding:'10px 12px',background:'var(--bg-subtle)',border:'1px solid var(--border-soft)',borderRadius:8}}>
                    <label style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer',fontSize:13}}>
                      <input type="checkbox" checked={!!form.ativo} onChange={e=>setForm(f=>({...f,ativo:e.target.checked}))} />
                      <span>✅ Cliente ativo</span>
                    </label>
                    <label style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer',fontSize:13}}>
                      <input type="checkbox" checked={!!form.receber_email} onChange={e=>setForm(f=>({...f,receber_email:e.target.checked}))} />
                      <span>✉ Receber e-mail (newsletter, avisos)</span>
                    </label>
                  </div>
                  {form.nascimento && (
                    <div style={{fontSize:12,color:'var(--text-muted)',padding:'8px 12px',background:'rgba(184,146,63,0.06)',border:'1px solid rgba(184,146,63,0.2)',borderRadius:8}}>
                      📅 Idade: <strong>{Math.floor((Date.now() - new Date(form.nascimento+'T12:00:00').getTime()) / (365.25*24*60*60*1000))}</strong> anos
                      {' '} (calculado a partir do nascimento)
                    </div>
                  )}
                </div>
              )}

              {abaModal==='obs' && (
                <Campo label="Observações">
                  <textarea value={form.observacao} onChange={e=>setForm(f=>({...f,observacao:e.target.value}))}
                    placeholder="Anotações, informações relevantes sobre o cliente..."
                    rows={10} style={{...inp,resize:'none'}} />
                </Campo>
              )}
            </div>

            {/* Footer */}
            <div style={{padding:'16px 24px',borderTop:'1px solid var(--border)',display:'flex',justifyContent:'flex-end',gap:10,flexShrink:0}}>
              <button className="btn-secondary" onClick={()=>setModal(false)}>Cancelar</button>
              <button className="btn-primary" onClick={salvar} disabled={salvando}>
                {salvando?'Salvando...':editando?'✓ Salvar alterações':'✓ Criar Cliente'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
