'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function CotadorSuhaiPage() {
  const supabase = createClient()
  const [busca, setBusca] = useState('')
  const [negocios, setNegocios] = useState<any[]>([])
  const [sel, setSel] = useState<any>(null)
  const [vendedor, setVendedor] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [resultado, setResultado] = useState<any>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => { buscar() }, [])

  async function buscar() {
    const q = supabase
      .from('negocios')
      .select('id, titulo, cpf_cnpj, placa, placa_veiculo, cep, cep_negocio, etapa, funil_id, funis(nome), clientes(nome)')
      .order('updated_at', { ascending: false })
      .limit(50)
    if (busca.trim()) {
      const t = busca.trim()
      q.or(`titulo.ilike.%${t}%,cpf_cnpj.ilike.%${t}%,placa.ilike.%${t}%,placa_veiculo.ilike.%${t}%`)
    }
    const { data } = await q
    setNegocios(data || [])
  }

  async function cotar() {
    if (!sel) return
    setCarregando(true); setErro(null); setResultado(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const resp = await fetch('/api/cotacoes/suhai', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ negocio_id: sel.id, vendedor: vendedor || undefined }),
      })
      const json = await resp.json()
      if (!resp.ok) throw new Error(json?.error || `Erro ${resp.status}`)
      setResultado(json)
    } catch (e: any) {
      setErro(e?.message || 'erro desconhecido')
    } finally {
      setCarregando(false)
    }
  }

  const inp: React.CSSProperties = { width:'100%', background:'rgba(255,255,255,0.05)', border:'1px solid var(--border)', borderRadius:8, padding:'9px 13px', color:'var(--text)', fontSize:13, outline:'none', boxSizing:'border-box' }
  const placa = sel?.placa || sel?.placa_veiculo || ''
  const cep   = sel?.cep   || sel?.cep_negocio  || ''
  const podeCotar = !!sel?.cpf_cnpj && !!placa

  return (
    <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
      <div style={{height:56,borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',padding:'0 28px',background:'var(--bg-soft)'}}>
        <div style={{fontFamily:'DM Serif Display,serif',fontSize:18}}>🛡 Cotador Suhai (manual)</div>
      </div>

      <div style={{flex:1,overflow:'auto',padding:'24px 28px',display:'grid',gridTemplateColumns:'1fr 1fr',gap:20}}>
        <div className="card">
          <div style={{fontFamily:'DM Serif Display,serif',fontSize:15,marginBottom:10}}>1) Escolha a negociação</div>
          <div style={{display:'flex',gap:8,marginBottom:12}}>
            <input value={busca} onChange={e=>setBusca(e.target.value)} placeholder="Buscar por título, CPF ou placa" style={inp} onKeyDown={e=>e.key==='Enter'&&buscar()} />
            <button className="btn-secondary" onClick={buscar}>Buscar</button>
          </div>
          <div style={{maxHeight:520,overflow:'auto',border:'1px solid var(--border)',borderRadius:8}}>
            {negocios.length === 0 ? (
              <div style={{padding:20,textAlign:'center',color:'var(--text-muted)',fontSize:12}}>Nada encontrado.</div>
            ) : negocios.map((n:any) => {
              const isSel = sel?.id === n.id
              const pl = n.placa || n.placa_veiculo || ''
              return (
                <button key={n.id} onClick={()=>setSel(n)}
                  style={{display:'block',width:'100%',textAlign:'left',padding:'10px 14px',background:isSel?'rgba(201,168,76,0.12)':'transparent',border:'none',borderBottom:'1px solid var(--border)',cursor:'pointer',color:'var(--text)'}}>
                  <div style={{fontSize:13,fontWeight:600}}>{n.titulo || '(sem título)'}</div>
                  <div style={{fontSize:11,color:'var(--text-muted)',marginTop:2}}>
                    {n.clientes?.nome || '—'} · CPF {n.cpf_cnpj || '—'} · Placa {pl || '—'} · {n.funis?.nome} / {n.etapa}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        <div className="card">
          <div style={{fontFamily:'DM Serif Display,serif',fontSize:15,marginBottom:10}}>2) Cotar</div>
          {!sel ? (
            <div style={{color:'var(--text-muted)',fontSize:13}}>Selecione uma negociação ao lado.</div>
          ) : (
            <>
              <div style={{fontSize:12,marginBottom:14,padding:10,background:'rgba(255,255,255,0.04)',borderRadius:8}}>
                <div><strong>Negócio:</strong> {sel.titulo}</div>
                <div><strong>CPF:</strong> {sel.cpf_cnpj || <span style={{color:'var(--red)'}}>faltando</span>}</div>
                <div><strong>Placa:</strong> {placa || <span style={{color:'var(--red)'}}>faltando</span>}</div>
                <div><strong>CEP:</strong> {cep || '—'}</div>
              </div>

              <label style={{fontSize:11,color:'var(--text-muted)',display:'block',marginBottom:4}}>Vendedor no portal Suhai (opcional)</label>
              <input value={vendedor} onChange={e=>setVendedor(e.target.value)} placeholder="default: BRUNO PEREIRA BONACCORSI DE SENA" style={{...inp,marginBottom:12}} />

              <button className="btn-primary" onClick={cotar} disabled={!podeCotar||carregando} style={{width:'100%',padding:'10px 14px'}}>
                {carregando ? 'Cotando... pode levar 1-2 min' : '🚀 Cotar agora na Suhai'}
              </button>
              {!podeCotar && <div style={{fontSize:11,color:'var(--red)',marginTop:8}}>CPF e placa são obrigatórios.</div>}

              {erro && <div style={{marginTop:14,padding:10,background:'rgba(224,82,82,0.1)',border:'1px solid rgba(224,82,82,0.3)',borderRadius:8,fontSize:12,color:'var(--red)'}}>❌ {erro}</div>}

              {resultado?.coberturas && (
                <div style={{marginTop:14}}>
                  <div style={{fontSize:12,color:'var(--success)',marginBottom:8}}>✓ Cotação salva no histórico do negócio</div>
                  {resultado.coberturas.map((c:any, i:number) => (
                    <div key={i} style={{padding:10,background:'rgba(255,255,255,0.04)',borderRadius:8,marginBottom:8,fontSize:12}}>
                      <div style={{fontWeight:600,marginBottom:4}}>{c.titulo}</div>
                      {c.erro ? <div style={{color:'var(--red)'}}>{c.erro}</div> : (
                        <>
                          <div>Prêmio Líquido: R$ {c.premio_liquido || '—'} · Total: R$ {c.premio_total || '—'}</div>
                          <div style={{fontSize:11,color:'var(--text-muted)',marginTop:4}}>{(c.parcelas||[]).length} opções de parcelamento</div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
