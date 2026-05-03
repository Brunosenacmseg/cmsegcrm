'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

type Funil = {
  id: string
  nome: string
  tipo: string | null
  emoji: string | null
  cor: string | null
  etapas: string[]
  ordem: number | null
  descricao?: string | null
}

const EMOJIS_SUGERIDOS = ['🆕','🔄','💰','🛡️','📞','🚗','🏠','💼','📊','🎯','⭐','🔥','📈','🧾','🩺','🧰','✈️','🏥','🧮','🪪','💳']
const CORES_SUGERIDAS = ['#c9a84c','#1cb5a0','#e05252','#4a80f0','#9c5de4','#ff8a3d','#3dc46a','#d8425c','#5b8def','#a0a8b8']

export default function ConfigurarFunisPage() {
  const supabase = createClient()
  const router = useRouter()

  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [funis, setFunis] = useState<Funil[]>([])
  const [equipes, setEquipes] = useState<{id:string; nome:string}[]>([])
  const [funilEquipes, setFunilEquipes] = useState<Record<string,string[]>>({}) // funil_id → equipe_ids[]
  const [editandoId, setEditandoId] = useState<string|'novo'|null>(null)
  const [form, setForm] = useState<Funil>({ id:'', nome:'', tipo:'', emoji:'🆕', cor:'#c9a84c', etapas:[], ordem:0, descricao:'' })
  const [equipeIds, setEquipeIds] = useState<string[]>([]) // equipes selecionadas no editor
  const [novaEtapa, setNovaEtapa] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string|null>(null)
  const [dragIdx, setDragIdx] = useState<number|null>(null)
  const [dragOverIdx, setDragOverIdx] = useState<number|null>(null)

  useEffect(()=>{ init() }, [])

  async function init() {
    const { data:{ user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    const { data: prof } = await supabase.from('users').select('*').eq('id', user.id).single()
    setProfile(prof)
    if (prof?.role !== 'admin') { setLoading(false); return }
    await carregar()
    setLoading(false)
  }

  async function carregar() {
    const [{ data: fs }, { data: eqs }, { data: fe }] = await Promise.all([
      supabase.from('funis').select('*').order('ordem'),
      supabase.from('equipes').select('id, nome').order('nome'),
      supabase.from('funis_equipes').select('funil_id, equipe_id'),
    ])
    setFunis((fs||[]) as Funil[])
    setEquipes((eqs||[]) as any[])
    const mapa: Record<string,string[]> = {}
    for (const r of fe || []) {
      const fid = (r as any).funil_id
      if (!mapa[fid]) mapa[fid] = []
      mapa[fid].push((r as any).equipe_id)
    }
    setFunilEquipes(mapa)
  }

  function novoFunil() {
    const proxOrdem = (funis.reduce((m,f)=>Math.max(m, f.ordem||0), 0)) + 1
    setForm({ id:'', nome:'', tipo:'custom', emoji:'🆕', cor:'#c9a84c', etapas:['Novo'], ordem: proxOrdem, descricao:'' })
    setEquipeIds([])
    setEditandoId('novo'); setErro(null); setNovaEtapa('')
  }

  function editarFunil(f: Funil) {
    setForm({ ...f, etapas: [...(f.etapas||[])] })
    setEquipeIds(funilEquipes[f.id] || [])
    setEditandoId(f.id); setErro(null); setNovaEtapa('')
  }

  function cancelar() {
    setEditandoId(null); setErro(null); setNovaEtapa('')
  }

  function adicionarEtapa() {
    const e = novaEtapa.trim()
    if (!e) return
    if (form.etapas.includes(e)) { setErro('Etapa já existe'); return }
    setForm(f => ({ ...f, etapas: [...f.etapas, e] }))
    setNovaEtapa('')
  }

  function removerEtapa(idx: number) {
    setForm(f => ({ ...f, etapas: f.etapas.filter((_,i)=>i!==idx) }))
  }

  function moverEtapa(idx: number, dir: -1|1) {
    const novo = [...form.etapas]
    const alvo = idx + dir
    if (alvo < 0 || alvo >= novo.length) return
    ;[novo[idx], novo[alvo]] = [novo[alvo], novo[idx]]
    setForm(f => ({ ...f, etapas: novo }))
  }

  async function salvar() {
    setErro(null)
    if (!form.nome.trim()) { setErro('Nome é obrigatório'); return }
    if (form.etapas.length === 0) { setErro('Adicione ao menos 1 etapa'); return }
    setSalvando(true)
    const payload = {
      nome:      form.nome.trim(),
      tipo:      form.tipo?.trim() || 'custom',
      emoji:     form.emoji || null,
      cor:       form.cor   || null,
      etapas:    form.etapas,
      ordem:     form.ordem ?? 0,
      descricao: form.descricao || null,
    }
    let funilId: string | null = null
    if (editandoId === 'novo') {
      // INSERT continua via supabase client (admin tem RLS de insert)
      const r = await supabase.from('funis').insert(payload).select('id').single()
      if (r.error) { setSalvando(false); setErro(r.error.message); return }
      funilId = (r.data as any)?.id || null
    } else {
      // UPDATE via endpoint server-side (bypassa RLS, dá erro claro)
      const { data: { session } } = await supabase.auth.getSession()
      const r = await fetch('/api/funis', {
        method: 'PATCH',
        headers: { 'Content-Type':'application/json', Authorization: `Bearer ${session?.access_token||''}` },
        body: JSON.stringify({ id: editandoId, ...payload })
      })
      const j = await r.json()
      if (!r.ok) { setSalvando(false); setErro(j.error || 'Erro ao atualizar'); return }
      funilId = editandoId as string
    }

    // Sincroniza visibilidade por equipe (funis_equipes)
    if (funilId) {
      await supabase.from('funis_equipes').delete().eq('funil_id', funilId)
      if (equipeIds.length > 0) {
        const linhas = equipeIds.map(eid => ({ funil_id: funilId, equipe_id: eid }))
        const { error: eFE } = await supabase.from('funis_equipes').insert(linhas)
        if (eFE) { setSalvando(false); setErro('Funil salvo, mas falhou ao gravar equipes: ' + eFE.message); return }
      }
    }

    setSalvando(false)
    setEditandoId(null)
    await carregar()
  }

  async function excluir(f: Funil) {
    const { count: cards } = await supabase
      .from('negocios')
      .select('*', { count: 'exact', head: true })
      .eq('funil_id', f.id)

    const msg = (cards || 0) > 0
      ? `O funil "${f.nome}" tem ${cards} card(s).\n\nIsto irá excluir o funil E todos os ${cards} card(s) dentro dele.\nEsta ação NÃO pode ser desfeita.\n\nConfirmar?`
      : `Excluir o funil "${f.nome}"?\n\nEsta ação não pode ser desfeita.`
    if (!confirm(msg)) return

    // Usa endpoint server-side (bypassa RLS, faz cascade dos cards)
    const { data: { session } } = await supabase.auth.getSession()
    const r = await fetch(`/api/funis?id=${f.id}&cascade=1`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${session?.access_token||''}` },
    })
    const j = await r.json()
    if (!r.ok) { alert('Erro ao excluir: ' + (j.error || 'falha')); return }
    await carregar()
  }

  async function normalizar() {
    // 1) preview com dryRun
    const { data: { session } } = await supabase.auth.getSession()
    const headers = { 'Content-Type':'application/json', Authorization: `Bearer ${session?.access_token||''}` }
    const r1 = await fetch('/api/funis/normalize', { method:'POST', headers, body: JSON.stringify({ dryRun:true }) })
    const j1 = await r1.json()
    if (!r1.ok) { alert('Erro ao analisar: ' + (j1.error || 'falha')); return }
    if ((j1.grupos_duplicados || 0) === 0) { alert('Nenhum funil duplicado encontrado.'); return }

    const resumo = (j1.detalhes || []).map((a:any) =>
      `• "${a.keeper.nome}" — manter (${a.keeper.cards} cards) + unificar ${a.duplicatas.length} duplicata(s) (${a.duplicatas.reduce((s:number,d:any)=>s+d.cards,0)} cards a mover)`
    ).join('\n')
    const msg = `Encontrados ${j1.grupos_duplicados} grupo(s) de funis duplicados:\n\n${resumo}\n\nIsto irá:\n- mover todos os cards das duplicatas pro funil mantido\n- unificar etapas (união)\n- transferir vínculos de equipe\n- apagar ${j1.funis_apagados} funil(is) duplicado(s)\n\nEsta ação NÃO pode ser desfeita. Confirmar?`
    if (!confirm(msg)) return

    // 2) executa
    const r2 = await fetch('/api/funis/normalize', { method:'POST', headers, body: JSON.stringify({ dryRun:false }) })
    const j2 = await r2.json()
    if (!r2.ok) { alert('Erro ao normalizar: ' + (j2.error || 'falha')); return }
    alert(`✓ Normalização concluída.\n${j2.funis_apagados} funil(is) apagado(s).\n${j2.cards_movidos} card(s) movido(s).`)
    await carregar()
  }

  async function reordenar(idx: number, dir: -1|1) {
    const alvo = idx + dir
    if (alvo < 0 || alvo >= funis.length) return
    const a = funis[idx], b = funis[alvo]
    await supabase.from('funis').update({ ordem: b.ordem ?? alvo }).eq('id', a.id)
    await supabase.from('funis').update({ ordem: a.ordem ?? idx  }).eq('id', b.id)
    await carregar()
  }

  const inp: React.CSSProperties = { width:'100%', background:'rgba(255,255,255,0.05)', border:'1px solid var(--border)', borderRadius:8, padding:'8px 12px', color:'var(--text)', fontSize:13, fontFamily:'DM Sans,sans-serif', outline:'none', boxSizing:'border-box' as const }

  if (loading) return <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',color:'var(--text-muted)'}}>Carregando...</div>

  if (profile?.role !== 'admin') {
    return (
      <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:10,color:'var(--text-muted)'}}>
        <div style={{fontSize:40}}>🔒</div>
        <div style={{fontFamily:'DM Serif Display,serif',fontSize:20,color:'var(--text)'}}>Acesso restrito</div>
        <div>Apenas administradores podem configurar funis.</div>
      </div>
    )
  }

  return (
    <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
      {/* Header */}
      <div style={{height:56,borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',padding:'0 20px',gap:12,background:'var(--bg-soft)',position:'sticky',top:0,zIndex:5}}>
        <button onClick={()=>router.push('/dashboard/funis')} style={{background:'none',border:'none',color:'var(--text-muted)',cursor:'pointer',fontSize:13,fontFamily:'DM Sans,sans-serif'}}>← Voltar aos funis</button>
        <div style={{fontFamily:'DM Serif Display,serif',fontSize:18,flex:1}}>⚙ Configurar Funis</div>
        <button className="btn-secondary" onClick={normalizar} title="Encontra funis com nome duplicado e unifica em um só">🧹 Normalizar duplicados</button>
        <button className="btn-primary" onClick={novoFunil}>+ Novo Funil</button>
      </div>

      <div style={{flex:1,overflow:'auto',padding:'20px'}}>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,maxWidth:1400,margin:'0 auto'}}>

          {/* Lista de funis */}
          <div style={{display:'flex',flexDirection:'column',gap:10}}>
            <div style={{fontSize:12,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'1.2px',fontWeight:600,marginBottom:4}}>Funis cadastrados ({funis.length})</div>
            {funis.length === 0 && (
              <div style={{padding:24,textAlign:'center',color:'var(--text-muted)',border:'1px dashed var(--border)',borderRadius:12,fontSize:13}}>
                Nenhum funil cadastrado. Clique em <b>+ Novo Funil</b>.
              </div>
            )}
            {funis.map((f, idx) => (
              <div key={f.id} style={{padding:'12px 14px',background:'rgba(255,255,255,0.04)',border:'1px solid '+(editandoId===f.id?'var(--gold)':'var(--border)'),borderRadius:12,display:'flex',alignItems:'center',gap:10}}>
                <div style={{width:36,height:36,borderRadius:8,background:(f.cor||'#333')+'22',border:'1px solid '+(f.cor||'var(--border)'),display:'flex',alignItems:'center',justifyContent:'center',fontSize:18}}>{f.emoji||'📁'}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:600,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',display:'flex',alignItems:'center',gap:6}}>
                    {f.nome}
                    {(funilEquipes[f.id]?.length || 0) > 0 ? (
                      <span title={`Restrito a ${funilEquipes[f.id].length} equipe(s)`} style={{fontSize:9,fontWeight:700,padding:'1px 6px',borderRadius:5,background:'rgba(28,181,160,0.15)',color:'var(--teal)',border:'1px solid rgba(28,181,160,0.3)',letterSpacing:'1px',textTransform:'uppercase'}}>
                        🔒 {funilEquipes[f.id].length} eq.
                      </span>
                    ) : (
                      <span title="Visível para todos" style={{fontSize:9,fontWeight:600,padding:'1px 6px',borderRadius:5,background:'rgba(255,255,255,0.05)',color:'var(--text-muted)',border:'1px solid var(--border)',letterSpacing:'1px',textTransform:'uppercase'}}>
                        🌐 Todos
                      </span>
                    )}
                  </div>
                  <div style={{fontSize:11,color:'var(--text-muted)'}}>{(f.etapas||[]).length} etapa(s) · ordem {f.ordem??0} {f.tipo?`· ${f.tipo}`:''}</div>
                </div>
                <div style={{display:'flex',gap:4}}>
                  <button title="Subir"  onClick={()=>reordenar(idx,-1)} disabled={idx===0}            style={btnIcon}>↑</button>
                  <button title="Descer" onClick={()=>reordenar(idx, 1)} disabled={idx===funis.length-1} style={btnIcon}>↓</button>
                  <button title="Editar" onClick={()=>editarFunil(f)} style={{...btnIcon,color:'var(--gold)'}}>✎</button>
                  <button title="Excluir" onClick={()=>excluir(f)} style={{...btnIcon,color:'var(--red)'}}>🗑</button>
                </div>
              </div>
            ))}
          </div>

          {/* Editor */}
          <div style={{padding:'18px 20px',background:'rgba(255,255,255,0.03)',border:'1px solid var(--border)',borderRadius:14,minHeight:400,position:'sticky',top:0,alignSelf:'start'}}>
            {!editandoId && (
              <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:'100%',color:'var(--text-muted)',gap:8,padding:'40px 0'}}>
                <div style={{fontSize:38}}>📋</div>
                <div style={{fontSize:13}}>Selecione um funil para editar ou crie um novo.</div>
              </div>
            )}

            {editandoId && (
              <div style={{display:'flex',flexDirection:'column',gap:14}}>
                <div style={{fontFamily:'DM Serif Display,serif',fontSize:18}}>
                  {editandoId === 'novo' ? '+ Novo Funil' : '✎ Editar Funil'}
                </div>

                <div style={{display:'grid',gridTemplateColumns:'80px 1fr',gap:10}}>
                  <div>
                    <label style={lbl}>Emoji</label>
                    <input value={form.emoji||''} onChange={e=>setForm(f=>({...f,emoji:e.target.value}))} style={{...inp,textAlign:'center',fontSize:18}} maxLength={4} />
                  </div>
                  <div>
                    <label style={lbl}>Nome *</label>
                    <input value={form.nome} onChange={e=>setForm(f=>({...f,nome:e.target.value}))} placeholder="Ex: Saúde" style={inp} />
                  </div>
                </div>

                <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                  {EMOJIS_SUGERIDOS.map(em=>(
                    <button key={em} onClick={()=>setForm(f=>({...f,emoji:em}))} style={{padding:'4px 8px',borderRadius:6,border:'1px solid '+(form.emoji===em?'var(--gold)':'var(--border)'),background:'rgba(255,255,255,0.03)',cursor:'pointer',fontSize:14}}>{em}</button>
                  ))}
                </div>

                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 90px',gap:10}}>
                  <div>
                    <label style={lbl}>Tipo (livre)</label>
                    <input value={form.tipo||''} onChange={e=>setForm(f=>({...f,tipo:e.target.value}))} placeholder="custom" style={inp} />
                  </div>
                  <div>
                    <label style={lbl}>Cor</label>
                    <div style={{display:'flex',gap:6,alignItems:'center'}}>
                      <input type="color" value={form.cor||'#c9a84c'} onChange={e=>setForm(f=>({...f,cor:e.target.value}))} style={{width:36,height:36,padding:0,border:'1px solid var(--border)',borderRadius:6,background:'transparent',cursor:'pointer'}} />
                      <input value={form.cor||''} onChange={e=>setForm(f=>({...f,cor:e.target.value}))} style={inp} />
                    </div>
                  </div>
                  <div>
                    <label style={lbl}>Ordem</label>
                    <input type="number" value={form.ordem??0} onChange={e=>setForm(f=>({...f,ordem:parseInt(e.target.value)||0}))} style={inp} />
                  </div>
                </div>

                <div style={{display:'flex',flexWrap:'wrap',gap:4}}>
                  {CORES_SUGERIDAS.map(c=>(
                    <button key={c} onClick={()=>setForm(f=>({...f,cor:c}))} style={{width:22,height:22,borderRadius:5,background:c,border:'2px solid '+(form.cor===c?'var(--text)':'transparent'),cursor:'pointer'}} />
                  ))}
                </div>

                <div>
                  <label style={lbl}>Descrição (opcional)</label>
                  <input value={form.descricao||''} onChange={e=>setForm(f=>({...f,descricao:e.target.value}))} placeholder="Para que serve este funil..." style={inp} />
                </div>

                {/* Visibilidade por equipe */}
                <div>
                  <label style={lbl}>Visível para</label>
                  {equipes.length === 0 ? (
                    <div style={{padding:'10px 12px',background:'rgba(255,255,255,0.03)',border:'1px dashed var(--border)',borderRadius:8,fontSize:12,color:'var(--text-muted)'}}>
                      Nenhuma equipe cadastrada. Crie equipes em <b style={{color:'var(--text)'}}>/dashboard/usuarios</b> para liberar este funil para grupos específicos.
                    </div>
                  ) : (
                    <>
                      <div style={{display:'flex',gap:6,alignItems:'center',marginBottom:8}}>
                        <button onClick={()=>setEquipeIds([])}
                          style={{padding:'4px 10px',borderRadius:6,fontSize:11,cursor:'pointer',border:'1px solid '+(equipeIds.length===0?'var(--gold)':'var(--border)'),background:equipeIds.length===0?'rgba(201,168,76,0.12)':'rgba(255,255,255,0.04)',color:equipeIds.length===0?'var(--gold)':'var(--text-muted)',fontFamily:'DM Sans,sans-serif'}}>
                          🌐 Todos os usuários
                        </button>
                        <span style={{fontSize:11,color:'var(--text-muted)'}}>ou selecione equipes:</span>
                      </div>
                      <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                        {equipes.map(eq => {
                          const sel = equipeIds.includes(eq.id)
                          return (
                            <button key={eq.id} onClick={()=>setEquipeIds(prev => sel ? prev.filter(x=>x!==eq.id) : [...prev, eq.id])}
                              style={{padding:'5px 12px',borderRadius:6,fontSize:12,cursor:'pointer',border:'1px solid '+(sel?'var(--teal)':'var(--border)'),background:sel?'rgba(28,181,160,0.12)':'rgba(255,255,255,0.04)',color:sel?'var(--teal)':'var(--text-muted)',fontFamily:'DM Sans,sans-serif'}}>
                              {sel ? '✓ ' : ''}{eq.nome}
                            </button>
                          )
                        })}
                      </div>
                      <div style={{fontSize:11,color:'var(--text-muted)',marginTop:6}}>
                        {equipeIds.length === 0
                          ? 'Sem restrição: todos os usuários autenticados verão este funil.'
                          : `Apenas líderes/membros das ${equipeIds.length} equipe(s) selecionada(s) verão este funil. Admins sempre veem tudo.`}
                      </div>
                    </>
                  )}
                </div>

                {/* Etapas */}
                <div>
                  <label style={lbl}>Etapas * <span style={{color:'var(--text-muted)',fontWeight:400}}>({form.etapas.length})</span></label>
                  <div style={{display:'flex',flexDirection:'column',gap:6,marginBottom:8}}>
                    {form.etapas.map((et, i)=>(
                      <div key={i}
                        draggable
                        onDragStart={e=>{ setDragIdx(i); e.dataTransfer.effectAllowed='move' }}
                        onDragOver={e=>{ e.preventDefault(); if (dragOverIdx!==i) setDragOverIdx(i) }}
                        onDragLeave={()=>setDragOverIdx(prev=>prev===i?null:prev)}
                        onDrop={e=>{
                          e.preventDefault()
                          if (dragIdx===null || dragIdx===i) { setDragIdx(null); setDragOverIdx(null); return }
                          const novo=[...form.etapas]
                          const [it]=novo.splice(dragIdx,1)
                          novo.splice(i,0,it)
                          setForm(f=>({...f,etapas:novo}))
                          setDragIdx(null); setDragOverIdx(null)
                        }}
                        onDragEnd={()=>{ setDragIdx(null); setDragOverIdx(null) }}
                        style={{display:'flex',alignItems:'center',gap:6,padding:'6px 10px',background:'rgba(255,255,255,0.04)',border:`1px solid ${dragOverIdx===i&&dragIdx!==i?'var(--gold)':'var(--border)'}`,borderRadius:8,opacity:dragIdx===i?0.4:1,cursor:'grab',transition:'border-color 0.12s'}}>
                        <span title="Arraste para reordenar" style={{fontSize:14,color:'var(--text-muted)',cursor:'grab',userSelect:'none'}}>⋮⋮</span>
                        <span style={{fontSize:11,color:'var(--text-muted)',width:22}}>{i+1}.</span>
                        <input value={et} onChange={e=>{ const novo=[...form.etapas]; novo[i]=e.target.value; setForm(f=>({...f,etapas:novo})) }} style={{...inp,padding:'4px 8px',background:'transparent',border:'none'}} />
                        <button onClick={()=>moverEtapa(i,-1)} disabled={i===0} style={btnIcon}>↑</button>
                        <button onClick={()=>moverEtapa(i, 1)} disabled={i===form.etapas.length-1} style={btnIcon}>↓</button>
                        <button onClick={()=>removerEtapa(i)} style={{...btnIcon,color:'var(--red)'}}>✕</button>
                      </div>
                    ))}
                  </div>
                  <div style={{display:'flex',gap:6}}>
                    <input value={novaEtapa} onChange={e=>setNovaEtapa(e.target.value)} onKeyDown={e=>e.key==='Enter'&&adicionarEtapa()} placeholder="Nome da nova etapa..." style={inp} />
                    <button className="btn-secondary" onClick={adicionarEtapa}>+ Adicionar</button>
                  </div>
                </div>

                {erro && <div style={{padding:'8px 12px',background:'rgba(224,82,82,0.12)',border:'1px solid rgba(224,82,82,0.3)',borderRadius:8,color:'var(--red)',fontSize:12}}>{erro}</div>}

                <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:6}}>
                  <button className="btn-secondary" onClick={cancelar} disabled={salvando}>Cancelar</button>
                  <button className="btn-primary" onClick={salvar} disabled={salvando||!form.nome.trim()||form.etapas.length===0}>
                    {salvando?'Salvando...':'✓ Salvar funil'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

const lbl: React.CSSProperties = { fontSize:11, color:'var(--text-muted)', display:'block', marginBottom:4, textTransform:'uppercase', letterSpacing:'1px', fontWeight:600 }
const btnIcon: React.CSSProperties = { width:28, height:28, borderRadius:6, border:'1px solid var(--border)', background:'rgba(255,255,255,0.04)', color:'var(--text)', cursor:'pointer', fontSize:13, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'DM Sans,sans-serif' }
