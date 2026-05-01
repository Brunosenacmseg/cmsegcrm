'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

type Aba = 'motivos' | 'produtos'

export default function ConfiguracoesPage() {
  const supabase = createClient()
  const router = useRouter()

  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [aba, setAba] = useState<Aba>('motivos')

  const [motivos, setMotivos] = useState<any[]>([])
  const [produtos, setProdutos] = useState<any[]>([])

  // Form motivo
  const [novoMotivo, setNovoMotivo] = useState('')
  const [editMotivo, setEditMotivo] = useState<any>(null)

  // Form produto
  const [novoProduto, setNovoProduto] = useState({ nome: '', preco_base: '' })
  const [editProduto, setEditProduto] = useState<any>(null)

  useEffect(() => { init() }, [])

  async function init() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    const { data: prof } = await supabase.from('users').select('*').eq('id', user.id).single()
    if (prof?.role !== 'admin') { router.push('/dashboard'); return }
    setProfile(prof)
    await carregar()
    setLoading(false)
  }

  async function carregar() {
    const [{ data: m }, { data: p }] = await Promise.all([
      supabase.from('motivos_perda').select('*').order('ordem').order('nome'),
      supabase.from('produtos').select('*').order('nome'),
    ])
    setMotivos(m || [])
    setProdutos(p || [])
  }

  async function criarMotivo() {
    if (!novoMotivo.trim()) return
    await supabase.from('motivos_perda').insert({ nome: novoMotivo.trim(), criado_por: profile?.id })
    setNovoMotivo('')
    await carregar()
  }

  async function salvarEdicaoMotivo() {
    if (!editMotivo?.id || !editMotivo?.nome?.trim()) return
    await supabase.from('motivos_perda').update({ nome: editMotivo.nome.trim(), ativo: editMotivo.ativo }).eq('id', editMotivo.id)
    setEditMotivo(null)
    await carregar()
  }

  async function excluirMotivo(id: string) {
    if (!confirm('Excluir esse motivo? Negociações que usam continuarão com o texto antigo.')) return
    await supabase.from('motivos_perda').delete().eq('id', id)
    await carregar()
  }

  async function toggleMotivoAtivo(m: any) {
    await supabase.from('motivos_perda').update({ ativo: !m.ativo }).eq('id', m.id)
    await carregar()
  }

  async function criarProduto() {
    if (!novoProduto.nome.trim()) return
    const preco = parseFloat(String(novoProduto.preco_base).replace(/[^\d,.-]/g,'').replace(',','.')) || null
    await supabase.from('produtos').insert({ nome: novoProduto.nome.trim(), preco_base: preco, criado_por: profile?.id })
    setNovoProduto({ nome: '', preco_base: '' })
    await carregar()
  }

  async function salvarEdicaoProduto() {
    if (!editProduto?.id || !editProduto?.nome?.trim()) return
    const preco = parseFloat(String(editProduto.preco_base ?? '').replace(/[^\d,.-]/g,'').replace(',','.')) || null
    await supabase.from('produtos').update({ nome: editProduto.nome.trim(), preco_base: preco, ativo: editProduto.ativo }).eq('id', editProduto.id)
    setEditProduto(null)
    await carregar()
  }

  async function excluirProduto(id: string) {
    if (!confirm('Excluir esse produto?')) return
    await supabase.from('produtos').delete().eq('id', id)
    await carregar()
  }

  if (loading) return <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',color:'var(--text-muted)'}}>Carregando...</div>

  const inp: React.CSSProperties = { width:'100%', background:'rgba(255,255,255,0.05)', border:'1px solid var(--border)', borderRadius:8, padding:'8px 12px', color:'var(--text)', fontSize:13, outline:'none', boxSizing:'border-box' as const, fontFamily:'DM Sans,sans-serif' }
  const fmtPreco = (n?: number | null) => n ? `R$ ${Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—'

  return (
    <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
      <div style={{height:56,borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',padding:'0 28px',gap:12,background:'rgba(10,22,40,0.7)'}}>
        <div style={{fontFamily:'DM Serif Display,serif',fontSize:18,flex:1}}>⚙️ Configurações</div>
      </div>

      <div style={{flex:1,overflow:'auto',padding:'24px 28px'}}>
        <div style={{display:'flex',gap:0,borderBottom:'1px solid var(--border)',marginBottom:18}}>
          {([['motivos','✕ Motivos de Perda'],['produtos','📦 Produtos']] as [Aba,string][]).map(([k,l])=>(
            <button key={k} onClick={()=>setAba(k)}
              style={{padding:'10px 20px',fontSize:13,cursor:'pointer',border:'none',background:'transparent',color:aba===k?'var(--gold)':'var(--text-muted)',fontWeight:aba===k?600:400,borderBottom:aba===k?'2px solid var(--gold)':'2px solid transparent',marginBottom:-1,fontFamily:'DM Sans,sans-serif'}}>
              {l}
            </button>
          ))}
        </div>

        {aba === 'motivos' && (
          <div style={{maxWidth:780}}>
            <div className="card" style={{marginBottom:16}}>
              <div style={{fontSize:12,color:'var(--text-muted)',marginBottom:10}}>
                Motivos disponíveis para selecionar quando uma negociação é marcada como perdida.
                Você pode importar os existentes do RD Station em <a href="/dashboard/rdstation" style={{color:'var(--teal)'}}>RD Station CRM → Sincronizar</a>.
              </div>
              <div style={{display:'flex',gap:10}}>
                <input value={novoMotivo} onChange={e=>setNovoMotivo(e.target.value)} placeholder="Novo motivo de perda..." style={inp} onKeyDown={e=>{if(e.key==='Enter')criarMotivo()}} />
                <button onClick={criarMotivo} className="btn-primary" style={{whiteSpace:'nowrap'}}>+ Adicionar</button>
              </div>
            </div>

            <div className="card">
              <div style={{fontFamily:'DM Serif Display,serif',fontSize:15,marginBottom:16}}>
                Motivos cadastrados ({motivos.length})
              </div>
              {motivos.length === 0 ? (
                <div style={{padding:24,textAlign:'center',color:'var(--text-muted)',fontSize:13}}>Nenhum motivo cadastrado.</div>
              ) : (
                <div>
                  {motivos.map(m => (
                    <div key={m.id} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 0',borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
                      {editMotivo?.id === m.id ? (
                        <>
                          <input value={editMotivo.nome} onChange={e=>setEditMotivo((p:any)=>({...p,nome:e.target.value}))} style={inp} autoFocus />
                          <label style={{display:'flex',alignItems:'center',gap:4,fontSize:11,color:'var(--text-muted)'}}>
                            <input type="checkbox" checked={!!editMotivo.ativo} onChange={e=>setEditMotivo((p:any)=>({...p,ativo:e.target.checked}))} /> Ativo
                          </label>
                          <button onClick={salvarEdicaoMotivo} className="btn-primary" style={{padding:'5px 12px',fontSize:11}}>✓ Salvar</button>
                          <button onClick={()=>setEditMotivo(null)} style={{padding:'5px 10px',fontSize:11,borderRadius:6,border:'1px solid var(--border)',background:'transparent',color:'var(--text-muted)',cursor:'pointer'}}>✕</button>
                        </>
                      ) : (
                        <>
                          <div style={{flex:1,fontSize:13,opacity:m.ativo?1:0.5,textDecoration:m.ativo?'none':'line-through'}}>
                            {m.nome}
                            {m.rd_id && <span style={{fontSize:9,color:'var(--text-muted)',marginLeft:8,fontFamily:'monospace'}}>RD: {m.rd_id.slice(0,6)}…</span>}
                          </div>
                          <button onClick={()=>toggleMotivoAtivo(m)} style={{padding:'4px 10px',borderRadius:6,fontSize:11,border:'1px solid var(--border)',background:'rgba(255,255,255,0.04)',color:m.ativo?'var(--teal)':'var(--text-muted)',cursor:'pointer'}}>
                            {m.ativo ? 'Ativo' : 'Inativo'}
                          </button>
                          <button onClick={()=>setEditMotivo({...m})} style={{padding:'4px 10px',borderRadius:6,fontSize:11,border:'1px solid var(--border)',background:'rgba(255,255,255,0.04)',color:'var(--gold)',cursor:'pointer'}}>✎</button>
                          <button onClick={()=>excluirMotivo(m.id)} style={{padding:'4px 8px',borderRadius:6,fontSize:11,border:'1px solid rgba(224,82,82,0.3)',background:'rgba(224,82,82,0.06)',color:'var(--red)',cursor:'pointer'}}>🗑</button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {aba === 'produtos' && (
          <div style={{maxWidth:780}}>
            <div className="card" style={{marginBottom:16}}>
              <div style={{fontSize:12,color:'var(--text-muted)',marginBottom:10}}>
                Produtos disponíveis no CRM (auto, vida, residencial, etc). Importe do RD em <a href="/dashboard/rdstation" style={{color:'var(--teal)'}}>RD Station → Sincronizar</a>.
              </div>
              <div style={{display:'grid',gridTemplateColumns:'2fr 1fr auto',gap:10}}>
                <input value={novoProduto.nome} onChange={e=>setNovoProduto(p=>({...p,nome:e.target.value}))} placeholder="Nome do produto" style={inp} />
                <input value={novoProduto.preco_base} onChange={e=>setNovoProduto(p=>({...p,preco_base:e.target.value}))} placeholder="Preço base (opcional)" style={inp} />
                <button onClick={criarProduto} className="btn-primary" style={{whiteSpace:'nowrap'}}>+ Adicionar</button>
              </div>
            </div>

            <div className="card">
              <div style={{fontFamily:'DM Serif Display,serif',fontSize:15,marginBottom:16}}>
                Produtos cadastrados ({produtos.length})
              </div>
              {produtos.length === 0 ? (
                <div style={{padding:24,textAlign:'center',color:'var(--text-muted)',fontSize:13}}>Nenhum produto cadastrado.</div>
              ) : (
                <div>
                  {produtos.map(p => (
                    <div key={p.id} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 0',borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
                      {editProduto?.id === p.id ? (
                        <>
                          <input value={editProduto.nome} onChange={e=>setEditProduto((s:any)=>({...s,nome:e.target.value}))} style={{...inp,flex:2}} autoFocus />
                          <input value={editProduto.preco_base ?? ''} onChange={e=>setEditProduto((s:any)=>({...s,preco_base:e.target.value}))} placeholder="Preço" style={{...inp,flex:1}} />
                          <label style={{display:'flex',alignItems:'center',gap:4,fontSize:11,color:'var(--text-muted)'}}>
                            <input type="checkbox" checked={!!editProduto.ativo} onChange={e=>setEditProduto((s:any)=>({...s,ativo:e.target.checked}))} /> Ativo
                          </label>
                          <button onClick={salvarEdicaoProduto} className="btn-primary" style={{padding:'5px 12px',fontSize:11}}>✓</button>
                          <button onClick={()=>setEditProduto(null)} style={{padding:'5px 10px',fontSize:11,borderRadius:6,border:'1px solid var(--border)',background:'transparent',color:'var(--text-muted)',cursor:'pointer'}}>✕</button>
                        </>
                      ) : (
                        <>
                          <div style={{flex:2,fontSize:13,opacity:p.ativo?1:0.5}}>
                            {p.nome}
                            {p.rd_id && <span style={{fontSize:9,color:'var(--text-muted)',marginLeft:8,fontFamily:'monospace'}}>RD: {p.rd_id.slice(0,6)}…</span>}
                          </div>
                          <div style={{flex:1,fontSize:12,color:'var(--text-muted)'}}>{fmtPreco(p.preco_base)}</div>
                          <button onClick={()=>setEditProduto({...p})} style={{padding:'4px 10px',borderRadius:6,fontSize:11,border:'1px solid var(--border)',background:'rgba(255,255,255,0.04)',color:'var(--gold)',cursor:'pointer'}}>✎</button>
                          <button onClick={()=>excluirProduto(p.id)} style={{padding:'4px 8px',borderRadius:6,fontSize:11,border:'1px solid rgba(224,82,82,0.3)',background:'rgba(224,82,82,0.06)',color:'var(--red)',cursor:'pointer'}}>🗑</button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
