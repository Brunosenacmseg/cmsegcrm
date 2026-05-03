'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

type Seguradora = {
  id: string
  nome: string
  ativo: boolean
  criado_em: string
}

const inp: React.CSSProperties = {
  width:'100%', background:'rgba(255,255,255,0.05)', border:'1px solid var(--border)',
  borderRadius:8, padding:'8px 12px', color:'var(--text)', fontSize:13,
  fontFamily:'DM Sans,sans-serif', outline:'none', boxSizing:'border-box',
}

export default function SeguradorasPage() {
  const supabase = createClient()
  const [lista, setLista] = useState<Seguradora[]>([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState('')
  const [mostrarInativas, setMostrarInativas] = useState(true)
  const [novoNome, setNovoNome] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'err'; texto: string } | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => { carregar() }, [])

  async function carregar() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { data: prof } = await supabase.from('users').select('role').eq('id', user?.id || '').single()
    setIsAdmin((prof as any)?.role === 'admin')
    const { data, error } = await supabase
      .from('seguradoras')
      .select('id,nome,ativo,criado_em')
      .order('nome')
    if (error) setMsg({ tipo: 'err', texto: error.message })
    else setLista((data as any) || [])
    setLoading(false)
  }

  async function alternarAtivo(s: Seguradora) {
    const { error } = await supabase.from('seguradoras').update({ ativo: !s.ativo }).eq('id', s.id)
    if (error) { setMsg({ tipo: 'err', texto: error.message }); return }
    setLista(prev => prev.map(x => x.id === s.id ? { ...x, ativo: !s.ativo } : x))
  }

  async function adicionar() {
    const nome = novoNome.trim()
    if (!nome) return
    setSalvando(true); setMsg(null)
    const { error } = await supabase.from('seguradoras').insert({ nome, ativo: true })
    setSalvando(false)
    if (error) { setMsg({ tipo: 'err', texto: error.message }); return }
    setNovoNome('')
    setMsg({ tipo: 'ok', texto: 'Seguradora adicionada' })
    carregar()
  }

  const filtrada = lista.filter(s => {
    if (!mostrarInativas && !s.ativo) return false
    if (!filtro.trim()) return true
    return s.nome.toLowerCase().includes(filtro.trim().toLowerCase())
  })
  const totalAtivas = lista.filter(s => s.ativo).length

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
      <div style={{ height:56, borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', padding:'0 28px', gap:12, background:'var(--bg-soft)', position:'sticky', top:0, zIndex:5 }}>
        <div style={{ fontFamily:'DM Serif Display,serif', fontSize:18, flex:1 }}>🛡️ Seguradoras</div>
        <span style={{ fontSize:12, color:'var(--text-muted)' }}>
          {totalAtivas} ativas / {lista.length} total
        </span>
      </div>

      <div style={{ flex:1, overflow:'auto', padding:'24px 28px 40px' }}>
        {msg && (
          <div style={{
            padding:10, borderRadius:8, marginBottom:12, fontSize:13, fontWeight:500,
            background: msg.tipo === 'ok' ? 'rgba(28,181,160,0.12)' : 'rgba(224,82,82,0.12)',
            color: msg.tipo === 'ok' ? 'var(--teal)' : 'var(--red)',
            border:'1px solid ' + (msg.tipo === 'ok' ? 'rgba(28,181,160,0.3)' : 'rgba(224,82,82,0.3)'),
          }}>{msg.texto}</div>
        )}

        <div style={{ display:'flex', gap:10, marginBottom:14, flexWrap:'wrap', alignItems:'center' }}>
          <input
            type="text"
            placeholder="🔍  Buscar seguradora..."
            value={filtro}
            onChange={e => setFiltro(e.target.value)}
            style={{ ...inp, flex:'1 1 280px', maxWidth:320 }}
          />
          <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:'var(--text-muted)', cursor:'pointer' }}>
            <input
              type="checkbox"
              checked={mostrarInativas}
              onChange={e => setMostrarInativas(e.target.checked)}
              style={{ accentColor:'var(--teal)' }}
            />
            Mostrar inativas
          </label>
          <span style={{ marginLeft:'auto', fontSize:12, color:'var(--text-muted)' }}>
            {filtrada.length} resultado{filtrada.length !== 1 ? 's' : ''}
          </span>
        </div>

        {isAdmin && (
          <div style={{ display:'flex', gap:8, marginBottom:18, flexWrap:'wrap' }}>
            <input
              type="text"
              placeholder="+ Nome da nova seguradora"
              value={novoNome}
              onChange={e => setNovoNome(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') adicionar() }}
              style={{ ...inp, flex:'1 1 280px', maxWidth:320 }}
            />
            <button
              className="btn-primary"
              onClick={adicionar}
              disabled={salvando || !novoNome.trim()}
              style={{ padding:'8px 16px', fontSize:13 }}
            >
              {salvando ? 'Salvando...' : '+ Adicionar'}
            </button>
          </div>
        )}

        {loading ? (
          <div style={{ textAlign:'center', padding:40, color:'var(--text-muted)' }}>Carregando...</div>
        ) : (
          <div className="card" style={{ padding:0, overflow:'hidden' }}>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr>
                  <th style={{ textAlign:'left', padding:'12px 16px', fontSize:10, fontWeight:600, letterSpacing:'1.2px', textTransform:'uppercase', color:'var(--text-muted)', borderBottom:'1px solid var(--border)' }}>
                    Seguradora
                  </th>
                  <th style={{ textAlign:'center', padding:'12px 16px', fontSize:10, fontWeight:600, letterSpacing:'1.2px', textTransform:'uppercase', color:'var(--text-muted)', borderBottom:'1px solid var(--border)', width:120 }}>
                    Ativo
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtrada.map(s => (
                  <tr key={s.id} style={{ borderBottom:'1px solid rgba(255,255,255,0.04)' }}>
                    <td style={{ padding:'12px 16px' }}>
                      <Link href={`/dashboard/seguradoras/${s.id}`}
                        style={{ color: s.ativo ? 'var(--text)' : 'var(--text-muted)', textDecoration:'none', fontWeight:500, display:'flex', alignItems:'center', gap:8 }}>
                        <span>{s.nome}</span>
                        <span style={{ fontSize:11, color:'var(--gold)', opacity:0.7 }}>→ importar / sincronizar</span>
                      </Link>
                    </td>
                    <td style={{ padding:'12px 16px', textAlign:'center' }}>
                      <button
                        onClick={() => isAdmin && alternarAtivo(s)}
                        disabled={!isAdmin}
                        title={isAdmin ? 'Clique para alternar' : 'Somente admin'}
                        style={{
                          padding:'4px 14px', borderRadius:20, border:'1px solid',
                          fontSize:11, fontWeight:700, cursor: isAdmin ? 'pointer' : 'default',
                          background: s.ativo ? 'rgba(28,181,160,0.10)' : 'rgba(255,255,255,0.05)',
                          color: s.ativo ? 'var(--teal)' : 'var(--text-muted)',
                          borderColor: s.ativo ? 'rgba(28,181,160,0.3)' : 'var(--border)',
                          transition:'all 0.15s',
                        }}
                      >
                        {s.ativo ? 'SIM' : 'NÃO'}
                      </button>
                    </td>
                  </tr>
                ))}
                {filtrada.length === 0 && (
                  <tr>
                    <td colSpan={2} style={{ padding:30, textAlign:'center', color:'var(--text-muted)' }}>
                      Nenhuma seguradora encontrada
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
