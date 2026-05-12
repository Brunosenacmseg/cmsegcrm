'use client'
import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import ContatoAcoes from '@/components/ContatoAcoes'

type Tab = 'historico' | 'email' | 'tarefas' | 'questionarios' | 'produtos' | 'arquivos' | 'propostas'

export default function NegocioDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const supabase = createClient()

  const [loading, setLoading]   = useState(true)
  const [negocio, setNegocio]   = useState<any>(null)
  const [funil, setFunil]       = useState<any>(null)
  const [cliente, setCliente]   = useState<any>(null)
  const [responsavel, setResp]  = useState<any>(null)
  const [tarefas, setTarefas]   = useState<any[]>([])
  const [eventos, setEventos]   = useState<any[]>([])
  const [tab, setTab]           = useState<Tab>('historico')
  const [devMode, setDevMode]   = useState(false)
  const [openSections, setOpenSections] = useState<Record<string,boolean>>({
    negociacao:true, contatos:true, info:false, empresa:true, responsavel:true,
  })

  useEffect(()=>{ try { setDevMode(localStorage.getItem('cm_dev_mode')==='1') } catch{} }, [])

  useEffect(() => {
    if (!id) return
    ;(async () => {
      setLoading(true)
      const { data: neg } = await supabase.from('negocios').select('*').eq('id', id).single()
      if (!neg) { setLoading(false); return }
      setNegocio(neg)
      const [{ data: fn }, { data: cl }, { data: rp }, { data: tr }] = await Promise.all([
        neg.funil_id ? supabase.from('funis').select('*').eq('id', neg.funil_id).single() : Promise.resolve({ data: null } as any),
        neg.cliente_id ? supabase.from('clientes').select('id,nome,telefone,email,cpf_cnpj,empresa,cargo').eq('id', neg.cliente_id).single() : Promise.resolve({ data: null } as any),
        neg.vendedor_id ? supabase.from('users').select('id,nome,email,avatar_url,role').eq('id', neg.vendedor_id).single() : Promise.resolve({ data: null } as any),
        supabase.from('tarefas').select('*').eq('negocio_id', id).order('prazo', { ascending: true }),
      ])
      setFunil(fn)
      setCliente(cl)
      setResp(rp)
      setTarefas(tr || [])
      // Histórico: pega logs do sistema relacionados a este negócio
      const { data: ev } = await supabase.from('logs').select('*').or(`recurso.ilike.%${id}%,pathname.ilike.%${id}%`).order('criado_em', { ascending: false }).limit(50)
      setEventos(ev || [])
      setLoading(false)
    })()
  }, [id])

  const etapas: string[] = funil?.etapas || []
  const etapaAtualIdx = useMemo(() => etapas.findIndex(e => e === negocio?.etapa), [etapas, negocio?.etapa])
  const status = negocio?.status || 'em_andamento'
  const isGanho = status === 'ganho'
  const isPerdido = status === 'perdido'

  const diasSemMov = negocio?.updated_at ? Math.floor((Date.now() - new Date(negocio.updated_at).getTime())/86400000) : null
  const cfgEtapa = (funil?.meta_etapas as any)?.[negocio?.etapa]
  const limiteEsfri = cfgEtapa?.esfriando ? Number(cfgEtapa?.dias)||3 : null
  const esfriando = limiteEsfri !== null && diasSemMov !== null && diasSemMov >= limiteEsfri

  async function mudarEtapa(nova: string) {
    await supabase.from('negocios').update({ etapa: nova, updated_at: new Date().toISOString() }).eq('id', id)
    setNegocio((n:any)=>({...n, etapa: nova}))
  }

  if (loading) return <div style={{padding:40,textAlign:'center',color:'var(--text-muted)'}}>Carregando negociação...</div>
  if (!negocio) return <div style={{padding:40,textAlign:'center',color:'var(--text-muted)'}}>Negociação não encontrada</div>

  const proximasTarefas = tarefas.filter(t => t.status !== 'concluida')
  const tarefasConcluidas = tarefas.filter(t => t.status === 'concluida')

  return (
    <div style={{padding:'18px 24px',maxWidth:1400,margin:'0 auto'}}>
      {/* Header */}
      <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:8}}>
        <button onClick={()=>router.back()}
          style={{background:'transparent',border:'1px solid var(--border-soft)',borderRadius:8,padding:'6px 10px',cursor:'pointer',fontSize:13}}>←</button>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:11,color:'var(--text-muted)',marginBottom:2}}>
            <Link href="/dashboard/funis" style={{color:'inherit',textDecoration:'none'}}>Negociações</Link>
            {funil?.nome && <span> › {funil.nome}</span>}
          </div>
          <div style={{fontSize:18,fontWeight:600,color:'var(--text)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{negocio.titulo}</div>
        </div>
        <div style={{display:'flex',gap:8}}>
          {!isPerdido && (
            <button onClick={async ()=>{ if(confirm('Marcar como perda?')){ await supabase.from('negocios').update({status:'perdido',data_fechamento:new Date().toISOString()}).eq('id',id); setNegocio((n:any)=>({...n,status:'perdido'})) }}}
              style={{background:'#fee2e2',color:'var(--red)',border:'1px solid #fecaca',borderRadius:8,padding:'8px 14px',cursor:'pointer',fontSize:13,fontWeight:600}}>👎 Marcar perda</button>
          )}
          {!isGanho && (
            <button onClick={async ()=>{ if(confirm('Marcar como venda?')){ await supabase.from('negocios').update({status:'ganho',data_fechamento:new Date().toISOString()}).eq('id',id); setNegocio((n:any)=>({...n,status:'ganho'})) }}}
              style={{background:'var(--teal)',color:'#fff',border:'none',borderRadius:8,padding:'8px 14px',cursor:'pointer',fontSize:13,fontWeight:600}}>👍 Marcar venda</button>
          )}
        </div>
      </div>

      {/* Badges */}
      <div style={{display:'flex',gap:6,marginBottom:14,flexWrap:'wrap'}}>
        {isGanho && <span style={{fontSize:11,fontWeight:700,padding:'3px 9px',borderRadius:5,background:'rgba(28,181,160,0.18)',color:'var(--teal)',textTransform:'uppercase',letterSpacing:1}}>✓ Ganho</span>}
        {isPerdido && <span style={{fontSize:11,fontWeight:700,padding:'3px 9px',borderRadius:5,background:'rgba(224,82,82,0.18)',color:'var(--red)',textTransform:'uppercase',letterSpacing:1}}>✕ Perdido</span>}
        {!isGanho && !isPerdido && (
          <>
            <span style={{fontSize:11,fontWeight:700,padding:'3px 9px',borderRadius:5,background:'rgba(74,128,240,0.14)',color:'#1d4ed8',textTransform:'uppercase',letterSpacing:0.8}}>Em andamento</span>
            {esfriando && <span style={{fontSize:11,fontWeight:700,padding:'3px 9px',borderRadius:5,background:'rgba(217,119,6,0.16)',color:'#a16207',textTransform:'uppercase',letterSpacing:0.8}}>Esfriando há {diasSemMov} dia{diasSemMov!==1?'s':''}</span>}
          </>
        )}
        {funil && <span style={{fontSize:11,fontWeight:600,padding:'3px 9px',borderRadius:5,background:'var(--bg-subtle)',color:'var(--text-muted)'}}>{funil.nome}</span>}
      </div>

      {/* Stepper de etapas */}
      {etapas.length > 0 && (
        <div style={{display:'flex',gap:2,marginBottom:18,overflowX:'auto',background:'var(--bg-subtle)',padding:4,borderRadius:8}}>
          {etapas.map((et, i) => {
            const ativo = et === negocio.etapa
            const passada = etapaAtualIdx !== -1 && i < etapaAtualIdx
            return (
              <button key={et} onClick={()=>mudarEtapa(et)}
                style={{flex:'1 0 auto',minWidth:120,padding:'9px 12px',borderRadius:6,border:'none',background:ativo?'var(--teal)':'transparent',color:ativo?'#fff':(passada?'var(--teal)':'var(--text-muted)'),fontSize:11,fontWeight:700,letterSpacing:0.5,textTransform:'uppercase',cursor:'pointer',whiteSpace:'nowrap'}}>
                {et}
              </button>
            )
          })}
        </div>
      )}

      {/* Layout 2 colunas */}
      <div style={{display:'grid',gridTemplateColumns:'320px 1fr',gap:18}}>
        {/* Painel esquerdo */}
        <div style={{display:'flex',flexDirection:'column',gap:12}}>
          <PainelSection title="Negociação" open={openSections.negociacao} onToggle={()=>setOpenSections(s=>({...s,negociacao:!s.negociacao}))}>
            <KV label="Nome" value={negocio.titulo} />
            <KV label="Qualificação" value={negocio.qualificacao ? '★'.repeat(negocio.qualificacao) : '—'} />
            <KV label="Criada em" value={negocio.created_at ? new Date(negocio.created_at).toLocaleString('pt-BR') : '—'} />
            <KV label="Valor total" value={negocio.premio ? `R$ ${Number(negocio.premio).toLocaleString('pt-BR',{minimumFractionDigits:2})}` : '—'} />
            <KV label="Previsão de fechamento" value={negocio.previsao_fechamento || '—'} />
            <KV label="Fonte" value={negocio.fonte_origem || negocio.fonte || '—'} />
            <KV label="Campanha" value={negocio.campanha || '—'} />
            <KV label="Placa" value={negocio.placa_veiculo || negocio.placa || '—'} />
            <KV label="Modelo do veículo" value={negocio.modelo_veiculo || '—'} />
            <KV label="CPF" value={negocio.cpf_cnpj || '—'} />
            <KV label="CPF 2" value={negocio.cpf_2 || '—'} />
            <KV label="CEP" value={negocio.cep_negocio || negocio.cep || '—'} />
            <KV label="Tipo do seguro" value={negocio.tipo_seguro || '—'} />
            <KV label="Seguradora" value={negocio.seguradora || '—'} />
            <KV label="Comissão" value={negocio.comissao_valor ? `R$ ${Number(negocio.comissao_valor).toLocaleString('pt-BR',{minimumFractionDigits:2})}` : (negocio.comissao_pct ? `${negocio.comissao_pct}%` : '—')} />
            <KV label="Rastreador" value={negocio.rastreador || '—'} />
            <KV label="Vigência do seguro" value={negocio.vigencia_seguro_ini ? `${negocio.vigencia_seguro_ini}${negocio.vigencia_seguro_fim?` a ${negocio.vigencia_seguro_fim}`:''}` : '—'} />
            <KV label="E-mail" value={negocio.email_negocio || '—'} />
            {devMode && <KV label="ID" value={negocio.id} mono />}
          </PainelSection>

          {cliente && (
            <PainelSection title="Contatos" open={openSections.contatos} onToggle={()=>setOpenSections(s=>({...s,contatos:!s.contatos}))}>
              <div style={{fontSize:13,fontWeight:600,color:'var(--text)',marginBottom:4}}>{cliente.nome}</div>
              {cliente.cargo && <div style={{fontSize:11,color:'var(--text-muted)',marginBottom:8}}>{cliente.cargo}</div>}
              {(cliente.telefone || cliente.email) && (
                <div style={{marginTop:6}}>
                  <ContatoAcoes telefone={cliente.telefone} email={cliente.email} clienteId={cliente.id} size="sm" />
                </div>
              )}
              {cliente.telefone && <KV label="Telefone" value={cliente.telefone} />}
              {cliente.email && <KV label="E-mail" value={cliente.email} />}
            </PainelSection>
          )}

          <PainelSection title="Empresa" open={openSections.empresa} onToggle={()=>setOpenSections(s=>({...s,empresa:!s.empresa}))}>
            <KV label="Nome" value={negocio.empresa || cliente?.empresa || '—'} />
            {(negocio.empresa || cliente?.empresa) && (
              <Link href={`/dashboard/clientes?q=${encodeURIComponent(negocio.empresa||cliente?.empresa)}`}
                style={{display:'inline-block',marginTop:6,fontSize:12,color:'var(--blue)',textDecoration:'none'}}>
                Abrir página da Empresa →
              </Link>
            )}
          </PainelSection>

          <PainelSection title="Responsável" open={openSections.responsavel} onToggle={()=>setOpenSections(s=>({...s,responsavel:!s.responsavel}))}>
            {responsavel ? (
              <div style={{fontSize:13,color:'var(--text)'}}>{responsavel.nome}<div style={{fontSize:11,color:'var(--text-muted)'}}>{responsavel.email}</div></div>
            ) : <div style={{fontSize:12,color:'var(--text-muted)'}}>Sem responsável</div>}
          </PainelSection>
        </div>

        {/* Coluna central */}
        <div style={{display:'flex',flexDirection:'column',gap:14}}>
          {/* Próximas tarefas */}
          <div style={{background:'#fff',border:'1px solid var(--border-soft)',borderRadius:12,padding:18}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
              <div style={{fontSize:14,fontWeight:700,color:'var(--text)'}}>Próximas tarefas</div>
              <Link href={`/dashboard/funis?card=${id}&tarefa=nova`}
                style={{background:'var(--blue)',color:'#fff',padding:'7px 13px',borderRadius:8,fontSize:12,fontWeight:600,textDecoration:'none'}}>+ Criar tarefa</Link>
            </div>
            {proximasTarefas.length === 0 ? (
              <div style={{padding:'18px 12px',textAlign:'center',color:'var(--text-muted)',fontSize:13}}>
                Não existem tarefas pendentes para essa negociação
              </div>
            ) : (
              <div style={{display:'flex',flexDirection:'column',gap:8}}>
                {proximasTarefas.map(t => {
                  const atrasada = t.prazo && new Date(t.prazo).getTime() < Date.now()
                  return (
                    <div key={t.id} style={{display:'flex',gap:10,alignItems:'center',padding:'10px 12px',border:'1px solid var(--border-soft)',borderRadius:8}}>
                      <span style={{fontSize:14}}>{atrasada?'⚠️':'📋'}</span>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:13,color:'var(--text)',fontWeight:500}}>{t.titulo}</div>
                        {t.prazo && <div style={{fontSize:11,color:atrasada?'var(--red)':'var(--text-muted)'}}>{new Date(t.prazo).toLocaleString('pt-BR')}</div>}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Tabs */}
          <div style={{background:'#fff',border:'1px solid var(--border-soft)',borderRadius:12,overflow:'hidden'}}>
            <div style={{display:'flex',borderBottom:'1px solid var(--border-soft)',overflowX:'auto'}}>
              {([
                ['historico','Histórico'],
                ['email','E-mail'],
                ['tarefas','Tarefas'],
                ['questionarios','Questionários'],
                ['produtos','Produtos'],
                ['arquivos','Arquivos'],
                ['propostas','Propostas'],
              ] as Array<[Tab,string]>).map(([k,l]) => (
                <button key={k} onClick={()=>setTab(k)}
                  style={{padding:'12px 18px',background:'transparent',border:'none',cursor:'pointer',fontSize:13,color:tab===k?'var(--teal)':'var(--text-muted)',fontWeight:tab===k?600:400,borderBottom:'2px solid '+(tab===k?'var(--teal)':'transparent'),whiteSpace:'nowrap'}}>
                  {l}
                </button>
              ))}
            </div>
            <div style={{padding:18,minHeight:220}}>
              {tab==='historico' && (
                eventos.length === 0
                  ? <div style={{textAlign:'center',color:'var(--text-muted)',fontSize:13,padding:24}}>Sem histórico registrado</div>
                  : <div style={{display:'flex',flexDirection:'column',gap:10}}>
                      {eventos.map((e:any)=>(
                        <div key={e.id} style={{display:'flex',gap:10,paddingBottom:10,borderBottom:'1px solid var(--border-soft)'}}>
                          <div style={{width:6,height:6,borderRadius:'50%',background:'var(--teal)',marginTop:7,flexShrink:0}}/>
                          <div style={{flex:1}}>
                            <div style={{fontSize:13,color:'var(--text)'}}>{e.acao || 'evento'} {e.recurso ? <span style={{color:'var(--text-muted)'}}>· {e.recurso}</span> : null}</div>
                            <div style={{fontSize:11,color:'var(--text-muted)'}}>{new Date(e.criado_em).toLocaleString('pt-BR')}</div>
                          </div>
                        </div>
                      ))}
                    </div>
              )}
              {tab==='tarefas' && (
                <div style={{display:'flex',flexDirection:'column',gap:8}}>
                  {tarefas.length === 0 && <div style={{textAlign:'center',color:'var(--text-muted)',fontSize:13,padding:24}}>Sem tarefas</div>}
                  {tarefas.map(t=>(
                    <div key={t.id} style={{display:'flex',gap:10,padding:10,border:'1px solid var(--border-soft)',borderRadius:8}}>
                      <span style={{fontSize:14}}>{t.status==='concluida'?'✅':'📋'}</span>
                      <div style={{flex:1}}>
                        <div style={{fontSize:13,fontWeight:500}}>{t.titulo}</div>
                        {t.prazo && <div style={{fontSize:11,color:'var(--text-muted)'}}>{new Date(t.prazo).toLocaleString('pt-BR')}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {tab==='email' && <div style={{textAlign:'center',color:'var(--text-muted)',fontSize:13,padding:24}}>E-mails relacionados serão exibidos aqui em breve.</div>}
              {tab==='questionarios' && <div style={{textAlign:'center',color:'var(--text-muted)',fontSize:13,padding:24}}>Sem questionários cadastrados.</div>}
              {tab==='produtos' && <div style={{textAlign:'center',color:'var(--text-muted)',fontSize:13,padding:24}}>Produtos vinculados serão exibidos aqui.</div>}
              {tab==='arquivos' && <div style={{textAlign:'center',color:'var(--text-muted)',fontSize:13,padding:24}}>Arquivos anexados serão exibidos aqui.</div>}
              {tab==='propostas' && <div style={{textAlign:'center',color:'var(--text-muted)',fontSize:13,padding:24}}>Propostas vinculadas serão exibidas aqui.</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function PainelSection({ title, open, onToggle, children }: { title:string; open:boolean; onToggle:()=>void; children:React.ReactNode }) {
  return (
    <div style={{background:'#fff',border:'1px solid var(--border-soft)',borderRadius:12,overflow:'hidden'}}>
      <button onClick={onToggle}
        style={{width:'100%',display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 16px',background:'transparent',border:'none',cursor:'pointer',fontSize:13,fontWeight:700,color:'var(--text)'}}>
        {title}
        <span style={{fontSize:11,color:'var(--text-muted)',transform:open?'rotate(180deg)':'none',transition:'transform 0.18s'}}>▾</span>
      </button>
      {open && <div style={{padding:'4px 16px 14px'}}>{children}</div>}
    </div>
  )
}

function KV({ label, value, mono }: { label:string; value:any; mono?:boolean }) {
  return (
    <div style={{display:'grid',gridTemplateColumns:'110px 1fr',gap:8,padding:'5px 0',fontSize:12,alignItems:'baseline'}}>
      <span style={{color:'var(--text-muted)',fontSize:11,textTransform:'uppercase',letterSpacing:0.5}}>{label}</span>
      <span style={{color:'var(--text)',fontFamily:mono?'monospace':'inherit',overflowWrap:'anywhere'}}>{value || '—'}</span>
    </div>
  )
}
