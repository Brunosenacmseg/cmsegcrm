'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { createClient } from '@/lib/supabase/client'

type Pergunta = { id: string; pergunta: string; tipo: string; min_escala: number | null; max_escala: number | null; ordem: number }
type Resposta = { pergunta_id: string; nota: number | null; resposta_texto: string | null }
type Avaliacao = {
  id: string; data: string; colaborador_id: string; lider_id: string | null;
  nota_geral: number | null; humor: string | null;
  destaque: string | null; dificuldade: string | null; acao_proxima: string | null; comentario: string | null;
}

export function AvaliacaoDetalheModal({ avaliacaoId, onClose }: { avaliacaoId: string; onClose: () => void }) {
  const supabase = createClient()
  const [aval, setAval] = useState<Avaliacao | null>(null)
  const [perguntas, setPerguntas] = useState<Pergunta[]>([])
  const [respostas, setRespostas] = useState<Record<string, Resposta>>({})
  const [colaborador, setColaborador] = useState<{ id: string; nome: string } | null>(null)
  const [lider, setLider] = useState<{ id: string; nome: string } | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => { (async () => {
    setCarregando(true); setErro(null)
    const { data: a, error: ea } = await supabase
      .from('gestao_equipe_avaliacoes')
      .select('*')
      .eq('id', avaliacaoId)
      .maybeSingle()
    if (ea) { setErro(ea.message); setCarregando(false); return }
    if (!a) { setErro('Avaliação não encontrada (sem permissão ou removida).'); setCarregando(false); return }
    setAval(a as Avaliacao)

    const [{ data: pgs }, { data: rs }, { data: col }, { data: ld }] = await Promise.all([
      supabase.from('gestao_equipe_perguntas').select('*').order('ordem'),
      supabase.from('gestao_equipe_respostas').select('pergunta_id,nota,resposta_texto').eq('avaliacao_id', avaliacaoId),
      supabase.from('users').select('id,nome').eq('id', a.colaborador_id).maybeSingle(),
      a.lider_id ? supabase.from('users').select('id,nome').eq('id', a.lider_id).maybeSingle() : Promise.resolve({ data: null } as any),
    ])
    setPerguntas((pgs || []) as Pergunta[])
    const map: Record<string, Resposta> = {}
    for (const r of (rs || [])) map[(r as any).pergunta_id] = r as Resposta
    setRespostas(map)
    setColaborador(col as any)
    setLider(ld as any)
    setCarregando(false)
  })() }, [avaliacaoId])

  if (typeof document === 'undefined') return null

  return createPortal(
    <div onClick={e => e.target === e.currentTarget && onClose()}
      style={{position:'fixed',inset:0,background:'rgba(15,23,42,0.55)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center',backdropFilter:'blur(6px)',padding:20}}>
      <div style={{background:'#fff',borderRadius:16,padding:'24px 28px',width:680,maxWidth:'min(95vw, 680px)',maxHeight:'90vh',overflow:'auto',boxShadow:'0 20px 60px rgba(0,0,0,0.3)',color:'#0f172a'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:16,gap:14}}>
          <div>
            <div style={{fontFamily:'DM Serif Display,serif',fontSize:20}}>
              {colaborador?.nome || 'Avaliação'}
            </div>
            {aval && (
              <div style={{fontSize:12,color:'#64748b',marginTop:4}}>
                {new Date(aval.data).toLocaleDateString('pt-BR')}
                {lider?.nome ? <> · Avaliado por <strong>{lider.nome}</strong></> : null}
                {aval.nota_geral != null && <> · Nota geral <strong>{Number(aval.nota_geral).toFixed(1)}</strong></>}
              </div>
            )}
          </div>
          <button onClick={onClose} style={{border:'none',background:'transparent',cursor:'pointer',fontSize:22,color:'#64748b'}}>×</button>
        </div>

        {carregando && <div style={{color:'#64748b'}}>Carregando…</div>}
        {erro && <div style={{padding:14,borderRadius:8,background:'#fef2f2',color:'#b91c1c',fontSize:13}}>{erro}</div>}

        {!carregando && !erro && aval && (
          <div style={{display:'flex',flexDirection:'column',gap:14}}>
            {aval.humor && <Linha label="Humor" valor={aval.humor} />}

            {perguntas.length > 0 && (
              <div>
                <div style={{fontSize:11,fontWeight:600,letterSpacing:'1px',textTransform:'uppercase',color:'#64748b',marginBottom:8}}>
                  Tópicos avaliados
                </div>
                <div style={{display:'flex',flexDirection:'column',gap:8}}>
                  {perguntas.map(p => {
                    const r = respostas[p.id]
                    return (
                      <div key={p.id} style={{padding:'10px 12px',borderRadius:8,border:'1px solid #e2e8f0',background:'#f8fafc'}}>
                        <div style={{fontSize:13,fontWeight:600,marginBottom:4}}>{p.pergunta}</div>
                        {p.tipo === 'escala' ? (
                          <div style={{fontSize:13}}>
                            {r?.nota != null
                              ? <span><strong>{r.nota}</strong> <span style={{color:'#64748b'}}>/ {p.max_escala ?? 5}</span></span>
                              : <span style={{color:'#94a3b8'}}>Sem resposta</span>}
                          </div>
                        ) : (
                          <div style={{fontSize:13,whiteSpace:'pre-wrap',color: r?.resposta_texto ? '#0f172a' : '#94a3b8'}}>
                            {r?.resposta_texto || 'Sem resposta'}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {aval.destaque     && <Linha label="Destaque da semana" valor={aval.destaque} />}
            {aval.dificuldade  && <Linha label="Maior dificuldade" valor={aval.dificuldade} />}
            {aval.acao_proxima && <Linha label="Próxima ação combinada" valor={aval.acao_proxima} />}
            {aval.comentario   && <Linha label="Comentário do líder" valor={aval.comentario} />}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}

function Linha({ label, valor }: { label: string; valor: string }) {
  return (
    <div>
      <div style={{fontSize:11,fontWeight:600,letterSpacing:'1px',textTransform:'uppercase',color:'#64748b',marginBottom:4}}>{label}</div>
      <div style={{fontSize:13,whiteSpace:'pre-wrap'}}>{valor}</div>
    </div>
  )
}
