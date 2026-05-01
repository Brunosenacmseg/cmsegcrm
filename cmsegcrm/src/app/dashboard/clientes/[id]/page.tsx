'use client'
import { useEffect, useState } from 'react'
import UploadAnexo, { Anexo } from '@/components/UploadAnexo'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useParams } from 'next/navigation'

const FUNIS_CONFIG: Record<string, any> = {
  venda:     { label:'Venda Nova',          emoji:'🆕', cor:'var(--gold)',  etapas:['Prospecção','Cotação Enviada','Proposta Enviada','Negociação','Fechado Ganho','Fechado Perdido'] },
  renovacao: { label:'Renovação',           emoji:'🔄', cor:'var(--teal)',  etapas:['Identificado','Cotando','Proposta Enviada','Aguardando Assinatura','Renovado','Não Renovado'] },
  cobranca:  { label:'Cobrança',            emoji:'💰', cor:'var(--red)',   etapas:['Em Atraso','Contato Realizado','Promessa de Pagamento','Pago','Inadimplente'] },
  posVenda:  { label:'Pós-venda / Sinistro',emoji:'🛡️',cor:'var(--blue)', etapas:['Novo Sinistro','Em Análise','Aguardando Docs','Em Regulação','Concluído','Negado'] },
}

const PRODUTOS = ['Auto — PF','Auto — Frota PJ','Vida Individual','Vida em Grupo','Saúde Individual','Saúde PME','Residencial','Empresarial / Multi-risco','RC Geral','RC Transportador','Outros']
const SEGURADORAS = ['Porto Seguro','Allianz','Bradesco Seguros','Zurich','Tokio Marine','Amil','Qualicorp','Azul Seguros','SulAmérica','Mapfre','Itaú Seguros','Outras']

export default function FichaClientePage() {
  const params   = useParams()
  const router   = useRouter()
  const supabase = createClient()
  const id       = params.id as string

  const [cliente,   setCliente]   = useState<any>(null)
  const [negocios,  setNegocios]  = useState<any[]>([])
  const [historico, setHistorico] = useState<any[]>([])
  const [abaAtiva,  setAbaAtiva]  = useState('negocios')
  const [loading,   setLoading]   = useState(true)
  const [modalNeg,  setModalNeg]  = useState(false)
  const [funis,     setFunis]     = useState<any[]>([])
  const [anexosNeg, setAnexosNeg] = useState<Record<string,Anexo[]>>({})
  const [anexosCli, setAnexosCli] = useState<Anexo[]>([])

  // Form novo negócio
  const [neg, setNeg] = useState({
    funil_id:'', etapa:'', produto:'', seguradora:'', cpf_cnpj:'',
    placa:'', premio:'', comissao_pct:'', cep:'', fonte:'', vencimento:'', obs:''
  })

  useEffect(() => { carregar() }, [id])

  async function carregar() {
    const [{ data: cli }, { data: negs }, { data: hist }, { data: fns }, { data: anxCli }, { data: anxNegs }] = await Promise.all([
      supabase.from('clientes').select('*').eq('id', id).single(),
      supabase.from('negocios').select('*, funis(tipo,nome,emoji,etapas,cor)').eq('cliente_id', id).order('created_at', {ascending:false}),
      supabase.from('historico').select('*, negocios(produto, funis(tipo,nome,emoji))').eq('cliente_id', id).order('created_at', {ascending:false}),
      supabase.from('funis').select('*').order('ordem'),
      supabase.from('anexos').select('*').eq('cliente_id', id).eq('categoria','cliente').order('created_at',{ascending:false}),
      supabase.from('anexos').select('*').eq('cliente_id', id).eq('categoria','negocio').order('created_at',{ascending:false}),
    ])
    setCliente(cli)
    setNegocios(negs || [])
    setHistorico(hist || [])
    setFunis(fns || [])
    if (fns && fns.length > 0) setNeg(n => ({ ...n, funil_id: fns[0].id, etapa: fns[0].etapas[0] }))
    setAnexosCli(anxCli || [])
    // Agrupar anexos por negocio_id
    const agrupados: Record<string,Anexo[]> = {}
    ;(anxNegs || []).forEach((a:Anexo) => {
      if(a.negocio_id){if(!agrupados[a.negocio_id])agrupados[a.negocio_id]=[];agrupados[a.negocio_id].push(a)}
    })
    setAnexosNeg(agrupados)
    setLoading(false)
  }

  async function salvarNegocio() {
    const funil = funis.find(f => f.id === neg.funil_id)
    const { data: novaNeg } = await supabase.from('negocios').insert({
      cliente_id: id, funil_id: neg.funil_id, etapa: neg.etapa,
      produto: neg.produto, seguradora: neg.seguradora,
      premio: parseFloat(neg.premio)||0, comissao_pct: parseFloat(neg.comissao_pct)||0,
      placa: neg.placa, cpf_cnpj: neg.cpf_cnpj, cep: neg.cep,
      fonte: neg.fonte, vencimento: neg.vencimento||null, obs: neg.obs
    }).select().single()
    if (novaNeg) {
      await supabase.from('historico').insert({
        cliente_id: id, negocio_id: novaNeg.id, tipo: 'gold',
        titulo: 'Novo negócio criado',
        descricao: `${funil?.label||''} — ${neg.produto} · ${neg.seguradora}`
      })
    }
    setModalNeg(false)
    carregar()
  }

  async function moverEtapa(negId: string, novaEtapa: string, funilLabel: string) {
    await supabase.from('negocios').update({ etapa: novaEtapa }).eq('id', negId)
    await supabase.from('historico').insert({
      cliente_id: id, negocio_id: negId, tipo: 'teal',
      titulo: 'Etapa alterada', descricao: `${funilLabel}: movido para "${novaEtapa}"`
    })
    carregar()
  }

  async function adicionarNota(negId: string) {
    const txt = prompt('Adicionar nota:')
    if (!txt) return
    await supabase.from('historico').insert({
      cliente_id: id, negocio_id: negId, tipo: 'gray',
      titulo: 'Nota adicionada', descricao: txt
    })
    carregar()
  }

  if (loading) return <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',color:'var(--text-muted)'}}>Carregando ficha...</div>
  if (!cliente) return <div style={{flex:1,padding:40,color:'var(--text-muted)'}}>Cliente não encontrado.</div>

  const totalPremio   = negocios.reduce((s,n) => s+(n.premio||0), 0)
  const totalComissao = negocios.reduce((s,n) => s+(n.premio&&n.comissao_pct?n.premio*n.comissao_pct/100:0), 0)
  const funisAtivos   = [...new Set(negocios.map(n => n.funis?.tipo).filter(Boolean))]

  // Negócios agrupados por funil
  const negPorFunil: Record<string, any[]> = {}
  negocios.forEach(n => {
    const tipo = n.funis?.tipo || 'outro'
    if (!negPorFunil[tipo]) negPorFunil[tipo] = []
    negPorFunil[tipo].push(n)
  })

  const corDot: Record<string,string> = { gold:'var(--gold)', teal:'var(--teal)', red:'var(--red)', blue:'var(--blue)', gray:'var(--text-muted)' }

  const selStyle = {
    background:'rgba(255,255,255,0.05)', border:'1px solid var(--border)',
    borderRadius:6, padding:'4px 8px', color:'var(--text)',
    fontFamily:'DM Sans,sans-serif', fontSize:11, cursor:'pointer', width:'100%', marginTop:8
  }

  return (
    <div style={{flex:1, display:'flex', flexDirection:'column', overflow:'hidden'}}>
      {/* Topbar */}
      <div style={{
        height:56, borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center',
        padding:'0 28px', gap:16, background:'var(--bg-soft)', backdropFilter:'blur(8px)',
        position:'sticky', top:0, zIndex:5, flexShrink:0
      }}>
        <span style={{color:'var(--text-muted)',cursor:'pointer',fontSize:13}} onClick={() => router.push('/dashboard/clientes')}>← Clientes</span>
        <div style={{fontFamily:'DM Serif Display,serif',fontSize:18,flex:1}}>{cliente.nome}</div>
        <button className="btn-primary" onClick={() => setModalNeg(true)}>+ Novo Negócio</button>
      </div>

      {/* Header da ficha */}
      <div style={{padding:'20px 28px 0', borderBottom:'1px solid var(--border)', background:'var(--bg-subtle)', flexShrink:0}}>
        <div style={{fontSize:12,color:'var(--text-muted)',display:'flex',gap:16,flexWrap:'wrap',marginBottom:16}}>
          {cliente.telefone && <span>📱 {cliente.telefone}</span>}
          {cliente.email    && <span>✉️ {cliente.email}</span>}
          {cliente.cidade   && <span>📍 {cliente.cidade}</span>}
          {cliente.cpf_cnpj && <span>CPF/CNPJ: {cliente.cpf_cnpj}</span>}
          <span style={{color:'var(--text-muted)'}}>{cliente.tipo}</span>
        </div>
        {/* KPIs da ficha */}
        <div style={{display:'flex',gap:24,marginBottom:16}}>
          {[
            [negocios.length, 'Negócios'],
            ['R$ '+totalPremio.toLocaleString('pt-BR'), 'Prêmio Total'],
            ['R$ '+Math.round(totalComissao).toLocaleString('pt-BR'), 'Comissão Est.'],
            [funisAtivos.length, 'Funis'],
          ].map(([val,lbl],i) => (
            <div key={i} style={{textAlign:'center',paddingRight:i<3?24:0,borderRight:i<3?'1px solid var(--border)':'none'}}>
              <div style={{fontFamily:'DM Serif Display,serif',fontSize:20,color:i===2?'var(--teal)':'var(--gold)'}}>{val}</div>
              <div style={{fontSize:10,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:1,marginTop:2}}>{lbl}</div>
            </div>
          ))}
        </div>
        {/* Abas */}
        <div style={{display:'flex',gap:0}}>
          {[['negocios','🤝 Negócios'],['historico','🕐 Histórico'],['apolices','📋 Apólices'],['dados','👤 Dados'],['anexos','📎 Anexos']].map(([k,l]) => (
            <button key={k} onClick={() => setAbaAtiva(k)} style={{
              padding:'10px 20px', fontSize:13, fontWeight:500, cursor:'pointer', background:'none',
              border:'none', borderBottom:`2px solid ${abaAtiva===k?'var(--gold)':'transparent'}`,
              color:abaAtiva===k?'var(--gold)':'var(--text-muted)', fontFamily:'DM Sans,sans-serif',
              transition:'all 0.15s'
            }}>{l}</button>
          ))}
        </div>
      </div>

      {/* Conteúdo das abas */}
      <div style={{flex:1, overflow:'auto', padding:'24px 28px'}}>

        {/* NEGÓCIOS */}
        {abaAtiva === 'negocios' && (
          <div>
            <button onClick={() => setModalNeg(true)} style={{
              display:'flex',alignItems:'center',gap:8,width:'100%',
              border:'1px dashed rgba(201,168,76,0.3)',borderRadius:10,padding:'12px 16px',
              cursor:'pointer',color:'var(--gold)',fontSize:13,
              background:'rgba(201,168,76,0.03)',fontFamily:'DM Sans,sans-serif',marginBottom:16,
            }}>＋ Novo Negócio para {cliente.nome}</button>

            {Object.entries(negPorFunil).map(([tipo, negs]) => {
              const fc = FUNIS_CONFIG[tipo] || {}
              return (
                <div key={tipo} style={{marginBottom:24}}>
                  <div style={{fontSize:11,fontWeight:600,letterSpacing:'1.5px',textTransform:'uppercase',color:'var(--text-muted)',marginBottom:10}}>
                    {fc.emoji} {fc.label}
                  </div>
                  {negs.map(n => {
                    const com = n.premio && n.comissao_pct ? Math.round(n.premio*n.comissao_pct/100) : 0
                    const etapas = n.funis?.etapas || []
                    return (
                      <div key={n.id} style={{
                        background:'rgba(255,255,255,0.03)',border:'1px solid var(--border)',
                        borderRadius:12,padding:'16px 18px',marginBottom:12,
                        borderLeft:`4px solid ${fc.cor||'var(--gold)'}`
                      }}>
                        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
                          <div style={{fontSize:14,fontWeight:600}}>{n.produto} {n.placa?'· '+n.placa:''}</div>
                          <div style={{fontSize:14,fontWeight:700,color:'var(--gold)'}}>{n.premio?'R$ '+n.premio.toLocaleString('pt-BR')+'/ano':'—'}</div>
                        </div>
                        <div style={{display:'flex',gap:10,flexWrap:'wrap',alignItems:'center',marginBottom:8}}>
                          <span style={{fontSize:10,fontWeight:600,borderRadius:10,padding:'2px 9px',
                            background:'rgba(201,168,76,0.12)',color:'var(--gold)'}}>{n.etapa}</span>
                          <span style={{fontSize:11,color:'var(--text-muted)'}}>{n.seguradora}</span>
                          {com>0 && <span style={{fontSize:11,color:'var(--teal)'}}>Com: R$ {com.toLocaleString('pt-BR')}</span>}
                          {n.vencimento && <span style={{fontSize:11,color:'var(--text-muted)'}}>Venc: {new Date(n.vencimento).toLocaleDateString('pt-BR')}</span>}
                        </div>
                        {n.obs && <div style={{fontSize:12,color:'var(--text-muted)',marginBottom:8}}>💬 {n.obs}</div>}
                        <div style={{display:'flex',gap:8}}>
                          <select style={selStyle} value={n.etapa} onChange={e => moverEtapa(n.id, e.target.value, fc.label)}>
                            {etapas.map((e:string) => <option key={e}>{e}</option>)}
                          </select>
                          <button onClick={() => adicionarNota(n.id)} style={{
                            fontSize:11,background:'rgba(28,181,160,0.1)',border:'1px solid rgba(28,181,160,0.3)',
                            color:'var(--teal)',borderRadius:6,padding:'4px 12px',cursor:'pointer',
                            fontFamily:'DM Sans,sans-serif',whiteSpace:'nowrap',marginTop:8
                          }}>+ Nota</button>
                        </div>
                        {/* Anexos do negócio */}
                        <div style={{marginTop:12,borderTop:'1px solid rgba(255,255,255,0.06)',paddingTop:12}}>
                          <div style={{fontSize:11,fontWeight:600,letterSpacing:'1px',textTransform:'uppercase',color:'var(--text-muted)',marginBottom:8}}>📎 Anexos</div>
                          <UploadAnexo
                            categoria="negocio"
                            negocioId={n.id}
                            clienteId={id}
                            accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xlsx"
                            label="Anexar documento"
                            maxMB={15}
                            compact={true}
                            anexosExistentes={anexosNeg[n.id]||[]}
                            onUpload={a => setAnexosNeg(prev=>({...prev,[n.id]:[a,...(prev[n.id]||[])]}))}
                            onDelete={aid => setAnexosNeg(prev=>({...prev,[n.id]:(prev[n.id]||[]).filter(x=>x.id!==aid)}))}
                          />
                        </div>

                      </div>
                    )
                  })}
                </div>
              )
            })}
            {negocios.length === 0 && <div style={{color:'var(--text-muted)',padding:20}}>Nenhum negócio ainda.</div>}
          </div>
        )}

        {/* HISTÓRICO */}
        {abaAtiva === 'historico' && (
          <div style={{position:'relative',paddingLeft:28}}>
            <div style={{position:'absolute',left:9,top:0,bottom:0,width:2,background:'rgba(255,255,255,0.06)',borderRadius:2}}/>
            {historico.length === 0 && <div style={{color:'var(--text-muted)'}}>Sem histórico ainda.</div>}
            {historico.map((h,i) => (
              <div key={i} style={{position:'relative',marginBottom:20}}>
                <div style={{position:'absolute',left:-28,top:3,width:12,height:12,borderRadius:'50%',
                  background:corDot[h.tipo]||'var(--text-muted)',border:'2px solid var(--navy)'}}/>
                <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
                  <span style={{fontSize:13,fontWeight:500}}>{h.titulo}</span>
                  <span style={{fontSize:11,color:'var(--text-muted)'}}>{new Date(h.created_at).toLocaleDateString('pt-BR')}</span>
                </div>
                {h.descricao && <div style={{fontSize:12,color:'var(--text-muted)',lineHeight:1.5}}>{h.descricao}</div>}
                {h.negocios && (
                  <div style={{display:'inline-flex',alignItems:'center',gap:5,fontSize:11,
                    background:'rgba(255,255,255,0.05)',border:'1px solid var(--border)',
                    borderRadius:6,padding:'2px 8px',marginTop:4,color:'var(--text-muted)'}}>
                    {h.negocios.funis?.emoji} {h.negocios.funis?.nome} · {h.negocios.produto}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* APÓLICES */}
        {abaAtiva === 'apolices' && (
          <div className="card">
            <table style={{width:'100%',borderCollapse:'collapse'}}>
              <thead>
                <tr>{['Produto','Seguradora','Prêmio','Vencimento','Etapa'].map(h =>
                  <th key={h} style={{fontSize:10,fontWeight:600,letterSpacing:'1.2px',textTransform:'uppercase',
                    color:'var(--text-muted)',textAlign:'left',padding:'0 0 10px',borderBottom:'1px solid var(--border)'}}>{h}</th>
                )}</tr>
              </thead>
              <tbody>
                {negocios.filter(n=>n.premio>0).map(n => (
                  <tr key={n.id}>
                    <td style={{padding:'10px 0',borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
                      <strong>{n.produto}</strong>{n.placa&&<><br/><span style={{fontSize:11,color:'var(--text-muted)'}}>{n.placa}</span></>}
                    </td>
                    <td style={{padding:'10px 0',borderBottom:'1px solid rgba(255,255,255,0.04)',fontSize:12}}>{n.seguradora}</td>
                    <td style={{padding:'10px 0',borderBottom:'1px solid rgba(255,255,255,0.04)',color:'var(--gold)',fontWeight:600}}>R$ {n.premio.toLocaleString('pt-BR')}</td>
                    <td style={{padding:'10px 0',borderBottom:'1px solid rgba(255,255,255,0.04)',fontSize:12}}>{n.vencimento?new Date(n.vencimento).toLocaleDateString('pt-BR'):'—'}</td>
                    <td style={{padding:'10px 0',borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
                      <span style={{fontSize:10,fontWeight:600,borderRadius:10,padding:'2px 9px',
                        background:'rgba(201,168,76,0.12)',color:'var(--gold)'}}>{n.etapa}</span>
                    </td>
                  </tr>
                ))}
                {negocios.filter(n=>n.premio>0).length===0 && (
                  <tr><td colSpan={5} style={{padding:20,color:'var(--text-muted)'}}>Sem apólices.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* DADOS */}
        {abaAtiva === 'dados' && (
          <div className="card">
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20}}>
              {[['Nome',cliente.nome],['Tipo',cliente.tipo],['CPF/CNPJ',cliente.cpf_cnpj],
                ['E-mail',cliente.email],['Telefone',cliente.telefone],['CEP',cliente.cep],
                ['Cidade',cliente.cidade],['Estado',cliente.estado],['Fonte',cliente.fonte]
              ].map(([l,v]) => (
                <div key={l}>
                  <div style={{fontSize:10,fontWeight:600,letterSpacing:'1.2px',textTransform:'uppercase',color:'var(--text-muted)',marginBottom:4}}>{l}</div>
                  <div style={{fontSize:13}}>{v||'—'}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ANEXOS DO CLIENTE */}
      {abaAtiva === 'anexos' && (
        <div>
          <div className="card" style={{marginBottom:16}}>
            <div style={{fontFamily:'DM Serif Display,serif',fontSize:15,marginBottom:14}}>📄 Apólices em PDF</div>
            <UploadAnexo
              categoria="cliente"
              clienteId={id}
              accept=".pdf"
              label="Anexar PDF de apólice"
              maxMB={20}
              anexosExistentes={anexosCli.filter(a=>a.tipo_mime==='application/pdf'||a.nome_arquivo.endsWith('.pdf'))}
              onUpload={a => setAnexosCli(prev=>[a,...prev])}
              onDelete={aid => setAnexosCli(prev=>prev.filter(x=>x.id!==aid))}
            />
          </div>
          <div className="card">
            <div style={{fontFamily:'DM Serif Display,serif',fontSize:15,marginBottom:14}}>📎 Outros documentos</div>
            <UploadAnexo
              categoria="cliente"
              clienteId={id}
              accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
              label="Outros documentos do cliente"
              maxMB={10}
              anexosExistentes={anexosCli.filter(a=>!(a.tipo_mime==='application/pdf'||a.nome_arquivo.endsWith('.pdf')))}
              onUpload={a => setAnexosCli(prev=>[a,...prev])}
              onDelete={aid => setAnexosCli(prev=>prev.filter(x=>x.id!==aid))}
            />
          </div>
        </div>
      )}

      {/* MODAL NOVO NEGÓCIO */}
      {modalNeg && (
        <div style={{position:'fixed',inset:0,background:'rgba(15,23,42,0.40)',zIndex:200,
          display:'flex',alignItems:'center',justifyContent:'center',backdropFilter:'blur(4px)'}}
          onClick={e => e.target===e.currentTarget && setModalNeg(false)}>
          <div style={{background:'#ffffff',border:'1px solid var(--border)',borderRadius:18,
            padding:'30px 32px',width:520,maxWidth:'95vw',maxHeight:'90vh',overflowY:'auto',
            animation:'fadeUp 0.25s ease'}}>
            <div style={{fontFamily:'DM Serif Display,serif',fontSize:20,color:'var(--gold)',marginBottom:18}}>
              Novo Negócio — {cliente.nome}
            </div>

            {[
              { label:'Funil', render:() => (
                <select style={{...selStyle,marginTop:0}} value={neg.funil_id}
                  onChange={e => {
                    const f = funis.find(f=>f.id===e.target.value)
                    setNeg(n=>({...n,funil_id:e.target.value,etapa:f?.etapas[0]||''}))
                  }}>
                  {funis.map(f => <option key={f.id} value={f.id}>{f.emoji} {f.nome}</option>)}
                </select>)
              },
              { label:'Etapa', render:() => (
                <select style={{...selStyle,marginTop:0}} value={neg.etapa} onChange={e=>setNeg(n=>({...n,etapa:e.target.value}))}>
                  {(funis.find(f=>f.id===neg.funil_id)?.etapas||[]).map((e:string) => <option key={e}>{e}</option>)}
                </select>)
              },
            ].map(({label,render}) => (
              <div key={label} style={{marginBottom:14}}>
                <label className="label">{label}</label>
                {render()}
              </div>
            ))}

            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
              {[
                {label:'Produto / Ramo', key:'produto', type:'select', opts:PRODUTOS},
                {label:'Seguradora',     key:'seguradora', type:'select', opts:SEGURADORAS},
                {label:'CPF / CNPJ',     key:'cpf_cnpj',  type:'text',   ph:'000.000.000-00'},
                {label:'Placa',          key:'placa',      type:'text',   ph:'ABC-1D23'},
                {label:'Prêmio Anual (R$)', key:'premio',  type:'text',   ph:'0,00'},
                {label:'Comissão (%)',    key:'comissao_pct',type:'text', ph:'12,5'},
                {label:'CEP',            key:'cep',        type:'text',   ph:'00000-000'},
                {label:'Vencimento',     key:'vencimento', type:'date'},
              ].map(({label,key,type,opts,ph}:any) => (
                <div key={key} style={{marginBottom:14}}>
                  <label className="label">{label}</label>
                  {type==='select' ? (
                    <select className="input" style={{appearance:'none'}} value={(neg as any)[key]}
                      onChange={e=>setNeg(n=>({...n,[key]:e.target.value}))}>
                      <option value="">Selecione...</option>
                      {opts.map((o:string)=><option key={o}>{o}</option>)}
                    </select>
                  ) : (
                    <input className="input" type={type} placeholder={ph}
                      value={(neg as any)[key]} onChange={e=>setNeg(n=>({...n,[key]:e.target.value}))} />
                  )}
                </div>
              ))}
            </div>

            {neg.premio && neg.comissao_pct && (
              <div style={{background:'rgba(28,181,160,0.1)',border:'1px solid rgba(28,181,160,0.25)',
                borderRadius:10,padding:'12px 16px',marginBottom:14,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <div style={{fontSize:12,color:'var(--text-muted)'}}>Comissão estimada</div>
                <div style={{fontFamily:'DM Serif Display,serif',fontSize:20,color:'var(--teal)'}}>
                  R$ {(parseFloat(neg.premio)*parseFloat(neg.comissao_pct)/100).toLocaleString('pt-BR',{minimumFractionDigits:2})}
                </div>
              </div>
            )}

            <div style={{marginBottom:14}}>
              <label className="label">Fonte do Lead</label>
              <select className="input" style={{appearance:'none'}} value={neg.fonte} onChange={e=>setNeg(n=>({...n,fonte:e.target.value}))}>
                <option value="">Selecione...</option>
                {['Indicação de cliente','Instagram / Facebook','Google Ads','Site orgânico','WhatsApp direto','Parceiro comercial','Prospecção ativa','Reativação'].map(o=><option key={o}>{o}</option>)}
              </select>
            </div>
            <div style={{marginBottom:20}}>
              <label className="label">Observações</label>
              <input className="input" placeholder="Detalhes importantes..." value={neg.obs} onChange={e=>setNeg(n=>({...n,obs:e.target.value}))} />
            </div>

            <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
              <button className="btn-secondary" onClick={() => setModalNeg(false)}>Cancelar</button>
              <button className="btn-primary" onClick={salvarNegocio}>💾 Salvar Negócio</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
