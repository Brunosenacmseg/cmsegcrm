'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { maskCpfCnpj, maskTelefone, maskCEP, maskPlaca } from '@/lib/masks'

const COMBUSTIVEIS      = ['Flex','Gasolina','Álcool','Diesel','Elétrico','Híbrido','GNV']
const RASTREADORES      = ['Não Possui','Blink','Autotrac','Sigmatek','OnixSat','Sascar','Outros']
const ANTIFURTOS        = ['Não possui','Alarme','Bloqueador','Rastreador','Alarme + Bloqueador','Alarme + Rastreador','Bloqueador + Rastreador','Todos']
const GARAGEM_RES       = ['Com portão automático','Com portão manual','Sem portão','Não possui']
const GARAGEM_TRAB      = ['Com portão automático','Com portão manual','Sem portão','Não utiliza para este fim']
const TIPO_USO          = ['Particular','Trabalho','Escola/Faculdade','Lazer']
const SEXOS_JOVEM       = ['Masculino','Feminino','Ambos']
const TIPO_RESIDENCIA   = ['Casa','Apartamento','Condomínio fechado','Outro']
const QUILOMETRAGEM     = ['Até 500 km','De 501 a 1.000 km','De 1.001 a 2.000 km','De 2.001 a 3.000 km','Acima de 3.000 km']
const TEMPO_HABILITACAO = ['Menos de 1 ano','1 a 2 anos','3 a 5 anos','6 a 10 anos','Mais de 10 anos']
const TIPO_COBERTURA    = ['Compreensivo (Colisão + Incêndio + Roubo)','Incêndio e Roubo','Somente Roubo','Somente Incêndio','Apenas RCF']
const TIPO_FRANQUIA     = ['Reduzida','Normal','Majorada','Franquia Zero']
const SEGURADORAS       = ['Porto Seguro','Bradesco','Allianz','HDI','Tokio Marine','Azul','Sompo','Liberty','Itaú','Mapfre','Sul América','Generali']
const COBERTURAS_VALOR  = ['Não','10.000','15.000','20.000','25.000','30.000','40.000','50.000','75.000','100.000','150.000','200.000','300.000','Ilimitado']
const VIDROS_OPTS       = ['Não','Franquia Normal','Franquia Reduzida','Sem Franquia']
const CARRO_RESERVA     = ['Não','7 dias','14 dias','21 dias','28 dias','30 dias']
const SEXOS             = ['Masculino','Feminino']
const ESTADOS_CIVIS     = ['Solteiro(a)','Casado(a)','Divorciado(a)','Viúvo(a)','União Estável']
const BOOL_OPTS         = ['Sim','Não']
const FIPE_OPTS         = ['70%','75%','80%','85%','90%','95%','100%']
const NOVO_BONUS        = ['0','10','20','30','40','43','50','60']
// O robô é chamado via proxy server-side (/api/cotacoes/calcular) para evitar
// mixed content (HTTPS → HTTP) e esconder a URL real do cliente.
const ROBO_PROXY        = '/api/cotacoes/calcular'

const INP_STYLE: React.CSSProperties = {
  width:'100%', background:'rgba(255,255,255,0.06)', border:'1px solid var(--border)',
  borderRadius:8, padding:'8px 12px', color:'var(--text)', fontSize:13,
  fontFamily:'DM Sans,sans-serif', outline:'none', boxSizing:'border-box',
}
const SEL_STYLE: React.CSSProperties = {
  ...INP_STYLE, cursor:'pointer', background:'#0e2040',
}

// ─── Componentes de campo — FORA do componente principal ─────────────────────

function Campo({ label, children }: { label: string, children: React.ReactNode }) {
  return (
    <div>
      <label style={{ fontSize:11, color:'var(--text-muted)', display:'block', marginBottom:4 }}>{label}</label>
      {children}
    </div>
  )
}

interface InpProps {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  placeholder?: string
}
function Inp({ label, value, onChange, type='text', placeholder='' }: InpProps) {
  return (
    <Campo label={label}>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={INP_STYLE}
      />
    </Campo>
  )
}

interface SelProps {
  label: string
  value: string
  onChange: (v: string) => void
  opts: string[]
}
function Sel({ label, value, onChange, opts }: SelProps) {
  return (
    <Campo label={label}>
      <select value={value} onChange={e => onChange(e.target.value)} style={SEL_STYLE}>
        <option value="">— Selecione —</option>
        {opts.map(o => <option key={o} value={o} style={{ background:'#0e2040' }}>{o}</option>)}
      </select>
    </Campo>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function CotacoesPage() {
  const supabase = createClient()

  const [profile, setProfile]       = useState<any>(null)
  const [cotacoes, setCotacoes]     = useState<any[]>([])
  const [loading, setLoading]       = useState(true)
  const [modal, setModal]           = useState(false)
  const [calculando, setCalculando] = useState(false)
  const [aba, setAba]               = useState<'segurado'|'veiculo'|'condutor'|'questionario'|'seguro'>('segurado')
  const [clienteBusca, setClienteBusca] = useState('')
  const [clientesRes, setClientesRes]   = useState<any[]>([])
  const [clienteSel, setClienteSel]     = useState<any>(null)
  const [msg, setMsg]               = useState('')

  const hoje   = new Date().toISOString().split('T')[0]
  const fimVig = new Date(new Date().setFullYear(new Date().getFullYear()+1)).toISOString().split('T')[0]

  const formVazio = {
    cpf_cnpj:'', nome_segurado:'', nascimento_segurado:'', sexo_segurado:'', estado_civil_segurado:'',
    cep_residencial:'', telefone:'', email:'',
    placa:'', chassi:'', ano_fab:'', ano_mod:'', zero_km:'Não', modelo:'', combustivel:'Flex',
    cep_pernoite:'', rastreador:'Não Possui', antifurto:'Não possui',
    blindado:'Não', kit_gas:'Não', valor_kit_gas:'', alienado:'Não',
    condutor_principal:'Sim', cpf_condutor:'', nome_condutor:'', nascimento_condutor:'',
    sexo_condutor:'', estado_civil_condutor:'', tempo_habilitacao:'',
    garagem_residencia:'Com portão manual', garagem_trabalho:'Não utiliza para este fim',
    garagem_estudo:'Não utiliza para este fim', tipo_uso:'Particular',
    jovem_condutor:'Não', idade_mais_novo:'', sexo_jovens:'',
    tipo_residencia:'', quilometragem:'Até 500 km',
    pcd:'Não', isencao_fiscal:'Não',
    renovacao:'Não', inicio_vigencia:hoje, final_vigencia:fimVig,
    final_vigencia_anterior:'', seguradora_anterior:'', numero_apolice_anterior:'',
    codigo_interno:'', qtd_sinistros:'0', novo_bonus:'0',
    tipo_cobertura:'', tipo_franquia:'', fipe_pct:'100%',
    danos_materiais:'', danos_corporais:'', danos_morais:'', morte_invalidez:'',
    assistencia:'Sim', vidros:'Franquia Normal', carro_reserva:'7 dias', comissao_pct:'',
  }
  const [form, setForm] = useState({ ...formVazio })

  // Helper para atualizar campo sem recriar função
  function set(field: string) {
    return (v: string) => setForm(f => ({ ...f, [field]: v }))
  }
  // Variante com máscara aplicada antes de gravar
  function setMasked(field: string, mask: (v: string) => string) {
    return (v: string) => setForm(f => ({ ...f, [field]: mask(v) }))
  }

  // Indicadores de auto-preenchimento (mostra spinner ao consultar)
  const [consultandoCpf, setConsultandoCpf]     = useState(false)
  const [consultandoPlaca, setConsultandoPlaca] = useState(false)
  const [consultandoCep, setConsultandoCep]     = useState<'res'|'pernoite'|null>(null)
  const [ultimoCpfConsultado, setUltimoCpfConsultado]     = useState('')
  const [ultimaPlacaConsultada, setUltimaPlacaConsultada] = useState('')

  // Quando o CPF tem 11 dígitos completos, chama /api/cotacoes/consultar
  // que tenta achar na base local primeiro, depois no robô (se configurado).
  async function consultarCpf(cpfFormatado: string) {
    const cpfLimpo = cpfFormatado.replace(/\D/g, '')
    if (cpfLimpo.length !== 11) return
    if (cpfLimpo === ultimoCpfConsultado) return  // evita re-consulta
    setUltimoCpfConsultado(cpfLimpo)
    setConsultandoCpf(true)
    try {
      const res = await fetch('/api/cotacoes/consultar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cpf: cpfLimpo }),
      })
      const json = await res.json().catch(() => ({}))
      if (json?.encontrado && json?.dados) {
        const d = json.dados
        // Preenche apenas campos vazios pra não sobrescrever digitação manual
        setForm(f => ({
          ...f,
          nome_segurado:         f.nome_segurado         || d.nome         || '',
          nascimento_segurado:   f.nascimento_segurado   || d.nascimento   || '',
          sexo_segurado:         f.sexo_segurado         || d.sexo         || '',
          estado_civil_segurado: f.estado_civil_segurado || d.estado_civil || '',
          cep_residencial:       f.cep_residencial       || d.cep          || '',
          telefone:              f.telefone              || d.telefone     || '',
          email:                 f.email                 || d.email        || '',
        }))
        if (d.cliente_id) {
          setClienteSel({ id: d.cliente_id, nome: d.nome, cpf_cnpj: cpfFormatado })
        }
        setMsg(`✅ Dados encontrados (${json.fonte === 'base_local' ? 'base local' : 'consulta automática'})`)
        setTimeout(() => setMsg(''), 3000)
      }
    } catch {} finally {
      setConsultandoCpf(false)
    }
  }

  // Quando a placa tem 7 caracteres válidos, chama /api/cotacoes/consultar-placa
  // que delega ao robô — ele loga no aggilizador, digita a placa e captura
  // modelo, ano, fipe, etc. preenchidos automaticamente.
  async function consultarPlaca(placaFormatada: string) {
    const placaLimpa = (placaFormatada || '').toUpperCase().replace(/\W/g, '')
    if (placaLimpa.length < 7) return
    if (placaLimpa === ultimaPlacaConsultada) return
    setUltimaPlacaConsultada(placaLimpa)
    setConsultandoPlaca(true)
    try {
      const res = await fetch('/api/cotacoes/consultar-placa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ placa: placaLimpa }),
      })
      const json = await res.json().catch(() => ({}))
      if (json?.encontrado && json?.dados) {
        const d = json.dados
        setForm(f => ({
          ...f,
          modelo:      f.modelo      || d.modelo           || '',
          ano_fab:     f.ano_fab     || d.ano_fab          || '',
          ano_mod:     f.ano_mod     || d.ano_mod          || '',
          combustivel: f.combustivel || d.combustivel      || '',
        }))
        setMsg('✅ Veículo encontrado pela placa')
        setTimeout(() => setMsg(''), 3000)
      } else if (json?.error) {
        setMsg('⚠ ' + json.error)
        setTimeout(() => setMsg(''), 4000)
      }
    } catch {} finally {
      setConsultandoPlaca(false)
    }
  }

  // ViaCEP: preenche cidade/estado a partir do CEP. Atualiza o campo `cidade_*`
  // se existir no form (não temos no formVazio, mas preserva extensibilidade).
  async function buscarCep(cepFormatado: string, dest: 'res'|'pernoite') {
    const c = cepFormatado.replace(/\D/g, '')
    if (c.length !== 8) return
    setConsultandoCep(dest)
    try {
      const res  = await fetch(`https://viacep.com.br/ws/${c}/json/`)
      const data = await res.json()
      if (!data.erro) {
        // Apenas cidade/UF são úteis pro contexto da cotação auto.
        setForm(f => ({ ...f, cidade: data.localidade || (f as any).cidade || '', estado: data.uf || (f as any).estado || '' }))
      }
    } catch {} finally {
      setConsultandoCep(null)
    }
  }

  useEffect(() => { init() }, [])

  async function init() {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: prof } = await supabase.from('users').select('*').eq('id', user?.id||'').single()
    setProfile(prof)
    await carregarCotacoes()
    setLoading(false)
  }

  async function carregarCotacoes() {
    const { data } = await supabase.from('cotacoes').select('*, clientes(nome), users(nome)').order('criado_em', { ascending:false }).limit(50)
    setCotacoes(data||[])
  }

  async function buscarClientes(q: string) {
    setClienteBusca(q)
    if (q.length < 2) { setClientesRes([]); return }
    const { data } = await supabase.from('clientes').select('id,nome,cpf_cnpj,telefone,email,nascimento,sexo,estado_civil,cep').or(`nome.ilike.%${q}%,cpf_cnpj.ilike.%${q}%`).limit(6)
    setClientesRes(data||[])
  }

  function selecionarCliente(c: any) {
    setClienteSel(c)
    setClienteBusca(c.nome)
    setClientesRes([])
    setForm(f => ({
      ...f,
      cpf_cnpj:              c.cpf_cnpj||'',
      nome_segurado:         c.nome||'',
      nascimento_segurado:   c.nascimento||'',
      sexo_segurado:         c.sexo||'',
      estado_civil_segurado: c.estado_civil||'',
      cep_residencial:       c.cep||'',
      telefone:              c.telefone||'',
      email:                 c.email||'',
    }))
  }

  async function calcular() {
    if (!form.placa || !form.nome_segurado || !form.cpf_cnpj) {
      setMsg('❌ Preencha pelo menos: CPF, Nome e Placa'); return
    }
    setCalculando(true); setMsg('')
    const dados = {
      ...form,
      cpf:          form.cpf_cnpj.replace(/\D/g,''),
      nome:         form.nome_segurado,
      nascimento:   form.nascimento_segurado,
      cep:          form.cep_residencial.replace(/\D/g,''),
      placa:        form.placa.toUpperCase().replace(/\W/g,''),
      combustivel:  form.combustivel.toUpperCase(),
      cep_pernoite: (form.cep_pernoite||form.cep_residencial).replace(/\D/g,''),
    }
    const { data: cot } = await supabase.from('cotacoes').insert({
      cliente_id: clienteSel?.id||null, produto:'carro', status:'calculando',
      user_id: profile?.id, dados,
      cpf_cnpj: form.cpf_cnpj, nome_segurado: form.nome_segurado,
      placa: form.placa, modelo: form.modelo, combustivel: form.combustivel,
      cep_residencial: form.cep_residencial,
    }).select().single()

    try {
      const res = await fetch(ROBO_PROXY, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ produto: 'carro', dados }),
      })
      const resultado = await res.json().catch(() => ({}))

      // Erro retornado pelo proxy (robô offline, timeout, etc.)
      if (!res.ok || resultado.ok === false) {
        const erroMsg = resultado.error || `HTTP ${res.status}`
        if (cot?.id) await supabase.from('cotacoes').update({ status: 'erro', dados: { ...dados, erro: erroMsg } }).eq('id', cot.id)
        setMsg('❌ ' + erroMsg)
        await carregarCotacoes()
        return
      }

      // Salvar screenshot se vier
      let screenshotUrl: string | null = null
      if (resultado.screenshot && cot?.id) {
        try {
          const bs = atob(resultado.screenshot)
          const ab = new ArrayBuffer(bs.length)
          const ia = new Uint8Array(ab)
          for (let i = 0; i < bs.length; i++) ia[i] = bs.charCodeAt(i)
          const blob = new Blob([ab], { type: 'image/png' })
          const fn = `cotacoes/${cot.id}.png`
          const { data: up } = await supabase.storage.from('cmsegcrm').upload(fn, blob, { contentType: 'image/png', upsert: true })
          if (up) {
            const { data: url } = supabase.storage.from('cmsegcrm').getPublicUrl(fn)
            screenshotUrl = url.publicUrl
          }
        } catch {}
      }

      if (cot?.id) await supabase.from('cotacoes').update({
        status: resultado.ok ? 'concluido' : 'erro',
        screenshot_url: screenshotUrl,
      }).eq('id', cot.id)

      setMsg(resultado.ok ? '✅ Cotação concluída!' : '⚠ Robô retornou erro')
      if (resultado.ok) setModal(false)
      await carregarCotacoes()
    } catch (err: any) {
      if (cot?.id) await supabase.from('cotacoes').update({ status: 'erro' }).eq('id', cot.id)
      setMsg('❌ Erro inesperado: ' + (err?.message || 'falha na rede'))
    } finally {
      setCalculando(false)
    }
  }

  const abas = [['segurado','👤 Segurado'],['veiculo','🚗 Veículo'],['condutor','👨 Condutor'],['questionario','📋 Questionário'],['seguro','🛡 Seguro']] as const

  return (
    <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
      <div style={{height:56,borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',padding:'0 28px',gap:12,background:'rgba(10,22,40,0.7)',backdropFilter:'blur(8px)',position:'sticky',top:0,zIndex:5,flexShrink:0}}>
        <div style={{fontFamily:'DM Serif Display,serif',fontSize:18,flex:1}}>🔍 Cotações</div>
        <button className="btn-primary" onClick={()=>{setModal(true);setForm({...formVazio});setClienteSel(null);setClienteBusca('');setAba('segurado');setMsg('')}}>+ Nova Cotação</button>
      </div>

      <div style={{flex:1,overflow:'auto',padding:'20px 28px'}}>
        {msg && !modal && <div style={{marginBottom:16,padding:'10px 16px',background:msg.includes('✅')?'rgba(28,181,160,0.1)':'rgba(224,82,82,0.1)',border:`1px solid ${msg.includes('✅')?'rgba(28,181,160,0.3)':'rgba(224,82,82,0.3)'}`,borderRadius:10,fontSize:13,color:msg.includes('✅')?'var(--teal)':'var(--red)'}}>{msg}</div>}

        {loading ? <div style={{textAlign:'center',padding:40,color:'var(--text-muted)'}}>Carregando...</div> : (
          <div className="card">
            <table style={{width:'100%',borderCollapse:'collapse'}}>
              <thead><tr>{['Cliente','Placa / Modelo','Usuário','Status','Data',''].map(h=><th key={h} style={{fontSize:10,fontWeight:600,letterSpacing:'1.2px',textTransform:'uppercase',color:'var(--text-muted)',textAlign:'left',padding:'0 0 10px',borderBottom:'1px solid var(--border)'}}>{h}</th>)}</tr></thead>
              <tbody>
                {cotacoes.map(c=>(
                  <tr key={c.id} onMouseEnter={e=>(e.currentTarget.style.background='rgba(201,168,76,0.03)')} onMouseLeave={e=>(e.currentTarget.style.background='')}>
                    <td style={{padding:'10px 0',borderBottom:'1px solid rgba(255,255,255,0.04)',fontSize:13}}>{c.clientes?.nome||c.nome_segurado||'—'}</td>
                    <td style={{padding:'10px 0',borderBottom:'1px solid rgba(255,255,255,0.04)',fontSize:12,color:'var(--text-muted)'}}>{c.placa||'—'}{c.modelo?` · ${c.modelo}`:''}</td>
                    <td style={{padding:'10px 0',borderBottom:'1px solid rgba(255,255,255,0.04)',fontSize:12,color:'var(--gold)'}}>{c.users?.nome?.split(' ')[0]||'—'}</td>
                    <td style={{padding:'10px 0',borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
                      <span style={{fontSize:11,padding:'2px 8px',borderRadius:10,background:c.status==='concluido'?'rgba(28,181,160,0.15)':c.status==='calculando'?'rgba(201,168,76,0.15)':'rgba(224,82,82,0.15)',color:c.status==='concluido'?'var(--teal)':c.status==='calculando'?'var(--gold)':'var(--red)'}}>
                        {c.status==='concluido'?'✅ Concluído':c.status==='calculando'?'⏳ Calculando':'❌ Erro'}
                      </span>
                    </td>
                    <td style={{padding:'10px 0',borderBottom:'1px solid rgba(255,255,255,0.04)',fontSize:11,color:'var(--text-muted)'}}>{new Date(c.criado_em).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</td>
                    <td style={{padding:'10px 0',borderBottom:'1px solid rgba(255,255,255,0.04)'}}>{c.screenshot_url&&<a href={c.screenshot_url} target="_blank" rel="noopener noreferrer" style={{fontSize:11,padding:'4px 10px',borderRadius:6,border:'1px solid rgba(201,168,76,0.3)',background:'rgba(201,168,76,0.08)',color:'var(--gold)',textDecoration:'none'}}>Ver resultado</a>}</td>
                  </tr>
                ))}
                {cotacoes.length===0&&<tr><td colSpan={6} style={{padding:30,textAlign:'center',color:'var(--text-muted)'}}>Nenhuma cotação realizada</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      {modal && (
        <div style={{position:'fixed',inset:0,background:'rgba(5,12,26,0.88)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',backdropFilter:'blur(6px)'}}
          onClick={e=>e.target===e.currentTarget&&!calculando&&setModal(false)}>
          <div style={{background:'#0a1628',border:'1px solid var(--border)',borderRadius:20,width:720,maxWidth:'97vw',maxHeight:'93vh',display:'flex',flexDirection:'column',overflow:'hidden'}}>

            <div style={{padding:'18px 24px',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0}}>
              <div style={{fontFamily:'DM Serif Display,serif',fontSize:18}}>🔍 Nova Cotação — Automóvel</div>
              <button onClick={()=>!calculando&&setModal(false)} style={{background:'none',border:'none',color:'var(--text-muted)',cursor:'pointer',fontSize:20}}>✕</button>
            </div>

            {/* Busca cliente */}
            <div style={{padding:'12px 24px',borderBottom:'1px solid var(--border)',flexShrink:0,position:'relative'}}>
              {clienteSel ? (
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'8px 14px',background:'rgba(28,181,160,0.08)',border:'1px solid rgba(28,181,160,0.3)',borderRadius:10}}>
                  <div><div style={{fontSize:13,fontWeight:600}}>{clienteSel.nome}</div><div style={{fontSize:11,color:'var(--text-muted)'}}>{clienteSel.cpf_cnpj}</div></div>
                  <button onClick={()=>{setClienteSel(null);setClienteBusca('')}} style={{background:'none',border:'none',color:'var(--text-muted)',cursor:'pointer',fontSize:16}}>✕</button>
                </div>
              ) : (
                <>
                  <input value={clienteBusca} onChange={e=>buscarClientes(e.target.value)} placeholder="🔍 Buscar cliente existente (opcional)..." style={{...INP_STYLE,borderRadius:20}} />
                  {clientesRes.length>0&&(
                    <div style={{position:'absolute',top:'100%',left:24,right:24,background:'#0e2040',border:'1px solid var(--border)',borderRadius:10,zIndex:10,maxHeight:200,overflow:'auto',boxShadow:'0 4px 20px rgba(0,0,0,0.4)'}}>
                      {clientesRes.map(c=>(
                        <div key={c.id} onClick={()=>selecionarCliente(c)} style={{padding:'10px 14px',cursor:'pointer',borderBottom:'1px solid rgba(255,255,255,0.05)'}}
                          onMouseEnter={e=>(e.currentTarget.style.background='rgba(201,168,76,0.08)')}
                          onMouseLeave={e=>(e.currentTarget.style.background='')}>
                          <div style={{fontSize:13,fontWeight:500}}>{c.nome}</div>
                          <div style={{fontSize:11,color:'var(--text-muted)'}}>{c.cpf_cnpj}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Abas */}
            <div style={{display:'flex',borderBottom:'1px solid var(--border)',flexShrink:0,overflowX:'auto'}}>
              {abas.map(([k,l])=>(
                <button key={k} onClick={()=>setAba(k)}
                  style={{padding:'10px 18px',fontSize:12,cursor:'pointer',border:'none',borderBottom:aba===k?'2px solid var(--gold)':'2px solid transparent',background:'transparent',color:aba===k?'var(--gold)':'var(--text-muted)',fontFamily:'DM Sans,sans-serif',whiteSpace:'nowrap',marginBottom:-1}}>
                  {l}
                </button>
              ))}
            </div>

            <div style={{flex:1,overflow:'auto',padding:'20px 24px'}}>
              {aba==='segurado' && (
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
                  <Campo label={`CPF / CNPJ *${consultandoCpf ? ' 🔄 consultando...' : ''}`}>
                    <input
                      value={form.cpf_cnpj}
                      onChange={e => {
                        const masked = maskCpfCnpj(e.target.value)
                        setForm(f => ({ ...f, cpf_cnpj: masked }))
                        if (masked.replace(/\D/g, '').length === 11) consultarCpf(masked)
                      }}
                      placeholder="000.000.000-00"
                      style={INP_STYLE}
                    />
                  </Campo>
                  <Inp label="Nome Completo *"      value={form.nome_segurado}         onChange={set('nome_segurado')}         placeholder="Nome completo" />
                  <Inp label="Data de Nascimento *" value={form.nascimento_segurado}   onChange={set('nascimento_segurado')}   type="date" />
                  <Sel label="Sexo *"               value={form.sexo_segurado}         onChange={set('sexo_segurado')}         opts={SEXOS} />
                  <Sel label="Estado Civil *"       value={form.estado_civil_segurado} onChange={set('estado_civil_segurado')} opts={ESTADOS_CIVIS} />
                  <Campo label={`CEP Residencial *${consultandoCep === 'res' ? ' 🔄' : ''}`}>
                    <input
                      value={form.cep_residencial}
                      onChange={e => setForm(f => ({ ...f, cep_residencial: maskCEP(e.target.value) }))}
                      onBlur={e => buscarCep(e.target.value, 'res')}
                      placeholder="00000-000"
                      style={INP_STYLE}
                    />
                  </Campo>
                  <Inp label="Telefone"             value={form.telefone}              onChange={setMasked('telefone', maskTelefone)} placeholder="(00) 00000-0000" />
                  <Inp label="Email"                value={form.email}                 onChange={set('email')}                 type="email" placeholder="email@email.com" />
                </div>
              )}

              {aba==='veiculo' && (
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
                  <Campo label={`Placa *${consultandoPlaca ? ' 🔄 buscando dados...' : ''}`}>
                    <input
                      value={form.placa}
                      onChange={e => setForm(f => ({ ...f, placa: maskPlaca(e.target.value) }))}
                      onBlur={e => consultarPlaca(e.target.value)}
                      placeholder="ABC-1D23"
                      style={INP_STYLE}
                    />
                  </Campo>
                  <Inp label="Chassi"                   value={form.chassi}      onChange={set('chassi')}      placeholder="Opcional" />
                  <Inp label="Ano Fabricação *"         value={form.ano_fab}     onChange={set('ano_fab')}     placeholder="2020" />
                  <Inp label="Ano Modelo *"             value={form.ano_mod}     onChange={set('ano_mod')}     placeholder="2021" />
                  <Sel label="Zero KM *"                value={form.zero_km}     onChange={set('zero_km')}     opts={BOOL_OPTS} />
                  <Inp label="Modelo *"                 value={form.modelo}      onChange={set('modelo')}      placeholder="Ex: Toyota Corolla" />
                  <Sel label="Combustível *"            value={form.combustivel} onChange={set('combustivel')} opts={COMBUSTIVEIS} />
                  <Campo label={`CEP Pernoite *${consultandoCep === 'pernoite' ? ' 🔄' : ''}`}>
                    <input
                      value={form.cep_pernoite}
                      onChange={e => setForm(f => ({ ...f, cep_pernoite: maskCEP(e.target.value) }))}
                      onBlur={e => buscarCep(e.target.value, 'pernoite')}
                      placeholder="00000-000"
                      style={INP_STYLE}
                    />
                  </Campo>
                  <Sel label="Rastreador *"             value={form.rastreador}  onChange={set('rastreador')}  opts={RASTREADORES} />
                  <Sel label="Dispositivo Anti-furto *" value={form.antifurto}   onChange={set('antifurto')}   opts={ANTIFURTOS} />
                  <Sel label="Blindado *"               value={form.blindado}    onChange={set('blindado')}    opts={BOOL_OPTS} />
                  <Sel label="Kit Gás *"                value={form.kit_gas}     onChange={set('kit_gas')}     opts={BOOL_OPTS} />
                  {form.kit_gas==='Sim' && <Inp label="Valor Kit Gás (R$)" value={form.valor_kit_gas} onChange={set('valor_kit_gas')} placeholder="0,00" />}
                  <Sel label="Alienado *"               value={form.alienado}    onChange={set('alienado')}    opts={BOOL_OPTS} />
                </div>
              )}

              {aba==='condutor' && (
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
                  <Sel label="Condutor Principal *"    value={form.condutor_principal}    onChange={set('condutor_principal')}    opts={BOOL_OPTS} />
                  <Inp label="CPF do Condutor *"       value={form.cpf_condutor}          onChange={set('cpf_condutor')}          placeholder="000.000.000-00" />
                  <div style={{gridColumn:'1/-1'}}><Inp label="Nome Completo *"           value={form.nome_condutor}             onChange={set('nome_condutor')}         placeholder="Nome completo do condutor" /></div>
                  <Inp label="Data de Nascimento *"    value={form.nascimento_condutor}   onChange={set('nascimento_condutor')}   type="date" />
                  <Sel label="Sexo *"                  value={form.sexo_condutor}         onChange={set('sexo_condutor')}         opts={SEXOS} />
                  <Sel label="Estado Civil *"          value={form.estado_civil_condutor} onChange={set('estado_civil_condutor')} opts={ESTADOS_CIVIS} />
                  <Sel label="Tempo de Habilitação *"  value={form.tempo_habilitacao}     onChange={set('tempo_habilitacao')}     opts={TEMPO_HABILITACAO} />
                </div>
              )}

              {aba==='questionario' && (
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
                  <Sel label="Garagem na Residência *"      value={form.garagem_residencia} onChange={set('garagem_residencia')} opts={GARAGEM_RES} />
                  <Sel label="Garagem no Trabalho *"        value={form.garagem_trabalho}   onChange={set('garagem_trabalho')}   opts={GARAGEM_TRAB} />
                  <Sel label="Garagem no Local de Estudo *" value={form.garagem_estudo}     onChange={set('garagem_estudo')}     opts={GARAGEM_TRAB} />
                  <Sel label="Tipo de Uso *"                value={form.tipo_uso}           onChange={set('tipo_uso')}           opts={TIPO_USO} />
                  <Sel label="Jovem Condutor (17-25 anos)*" value={form.jovem_condutor}     onChange={set('jovem_condutor')}     opts={BOOL_OPTS} />
                  {form.jovem_condutor==='Sim' && <>
                    <Inp label="Idade do Mais Novo *" value={form.idade_mais_novo} onChange={set('idade_mais_novo')} placeholder="Ex: 18" />
                    <Sel label="Sexo dos Jovens *"    value={form.sexo_jovens}     onChange={set('sexo_jovens')}     opts={SEXOS_JOVEM} />
                  </>}
                  <Sel label="Tipo de Residência *"   value={form.tipo_residencia} onChange={set('tipo_residencia')} opts={TIPO_RESIDENCIA} />
                  <Sel label="Quilometragem Mensal *"  value={form.quilometragem}   onChange={set('quilometragem')}   opts={QUILOMETRAGEM} />
                  <Sel label="PCD *"                   value={form.pcd}             onChange={set('pcd')}             opts={BOOL_OPTS} />
                  <Sel label="Isenção Fiscal *"        value={form.isencao_fiscal}  onChange={set('isencao_fiscal')}  opts={BOOL_OPTS} />
                </div>
              )}

              {aba==='seguro' && (
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
                  <div style={{gridColumn:'1/-1',fontSize:13,fontWeight:600,color:'var(--gold)',paddingBottom:6,borderBottom:'1px solid var(--border)'}}>Renovação</div>
                  <Sel label="Esta é uma renovação?"   value={form.renovacao}        onChange={set('renovacao')}        opts={BOOL_OPTS} />
                  <Inp label="Início de Vigência *"    value={form.inicio_vigencia}  onChange={set('inicio_vigencia')}  type="date" />
                  <Inp label="Final de Vigência *"     value={form.final_vigencia}   onChange={set('final_vigencia')}   type="date" />
                  {form.renovacao==='Sim' && <>
                    <Inp label="Final Vigência Anterior"  value={form.final_vigencia_anterior}  onChange={set('final_vigencia_anterior')}  type="date" />
                    <Sel label="Seguradora Anterior"      value={form.seguradora_anterior}      onChange={set('seguradora_anterior')}      opts={SEGURADORAS} />
                    <Inp label="Nº Apólice Anterior"      value={form.numero_apolice_anterior}  onChange={set('numero_apolice_anterior')}  placeholder="Número" />
                    <Inp label="Código Interno (CI)"      value={form.codigo_interno}           onChange={set('codigo_interno')}           placeholder="CI" />
                    <Inp label="Qtd. Sinistros"           value={form.qtd_sinistros}            onChange={set('qtd_sinistros')}            placeholder="0" />
                    <Sel label="Novo Bônus"               value={form.novo_bonus}               onChange={set('novo_bonus')}               opts={NOVO_BONUS} />
                  </>}
                  <div style={{gridColumn:'1/-1',fontSize:13,fontWeight:600,color:'var(--gold)',paddingBottom:6,borderBottom:'1px solid var(--border)',marginTop:8}}>Coberturas</div>
                  <div style={{gridColumn:'1/-1'}}><Sel label="Tipo de Cobertura *" value={form.tipo_cobertura} onChange={set('tipo_cobertura')} opts={TIPO_COBERTURA} /></div>
                  <Sel label="Tipo de Franquia *"      value={form.tipo_franquia}    onChange={set('tipo_franquia')}    opts={TIPO_FRANQUIA} />
                  <Sel label="Fipe (%) *"              value={form.fipe_pct}         onChange={set('fipe_pct')}         opts={FIPE_OPTS} />
                  <Sel label="Danos Materiais *"       value={form.danos_materiais}  onChange={set('danos_materiais')}  opts={COBERTURAS_VALOR} />
                  <Sel label="Danos Corporais *"       value={form.danos_corporais}  onChange={set('danos_corporais')}  opts={COBERTURAS_VALOR} />
                  <Sel label="Danos Morais *"          value={form.danos_morais}     onChange={set('danos_morais')}     opts={COBERTURAS_VALOR} />
                  <Sel label="Morte/Invalidez *"       value={form.morte_invalidez}  onChange={set('morte_invalidez')}  opts={COBERTURAS_VALOR} />
                  <Sel label="Assistência *"           value={form.assistencia}      onChange={set('assistencia')}      opts={BOOL_OPTS} />
                  <Sel label="Vidros *"                value={form.vidros}           onChange={set('vidros')}           opts={VIDROS_OPTS} />
                  <Sel label="Carro Reserva *"         value={form.carro_reserva}    onChange={set('carro_reserva')}    opts={CARRO_RESERVA} />
                  <Inp label="Comissão Padrão %"       value={form.comissao_pct}     onChange={set('comissao_pct')}     placeholder="Ex: 20" />
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{padding:'14px 24px',borderTop:'1px solid var(--border)',display:'flex',justifyContent:'space-between',alignItems:'center',flexShrink:0}}>
              <div style={{display:'flex',gap:8}}>
                {aba!=='segurado'&&<button className="btn-secondary" onClick={()=>{const i=abas.findIndex(a=>a[0]===aba);if(i>0)setAba(abas[i-1][0])}}>← Anterior</button>}
                {aba!=='seguro' &&<button className="btn-secondary" onClick={()=>{const i=abas.findIndex(a=>a[0]===aba);if(i<abas.length-1)setAba(abas[i+1][0])}}>Próximo →</button>}
              </div>
              <div style={{display:'flex',gap:10,alignItems:'center'}}>
                {msg&&<span style={{fontSize:12,color:msg.includes('✅')?'var(--teal)':'var(--red)'}}>{msg}</span>}
                <button className="btn-secondary" onClick={()=>setModal(false)} disabled={calculando}>Cancelar</button>
                <button className="btn-primary" onClick={calcular} disabled={calculando} style={{display:'flex',alignItems:'center',gap:8,minWidth:160,justifyContent:'center'}}>
                  {calculando?<><span style={{display:'inline-block',width:12,height:12,border:'2px solid rgba(255,255,255,0.3)',borderTopColor:'#fff',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/>Calculando...</>:'🚀 Calcular Cotação'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}
