'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Seguradora = {
  id: string
  nome: string
  ativo: boolean
  criado_em: string
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
    setIsAdmin(prof?.role === 'admin')
    const { data, error } = await supabase
      .from('seguradoras')
      .select('id,nome,ativo,criado_em')
      .order('nome')
    if (error) setMsg({ tipo: 'err', texto: error.message })
    else setLista(data || [])
    setLoading(false)
  }

  async function alternarAtivo(s: Seguradora) {
    const { error } = await supabase
      .from('seguradoras')
      .update({ ativo: !s.ativo })
      .eq('id', s.id)
    if (error) {
      setMsg({ tipo: 'err', texto: error.message })
      return
    }
    setLista(prev => prev.map(x => x.id === s.id ? { ...x, ativo: !s.ativo } : x))
  }

  async function adicionar() {
    const nome = novoNome.trim()
    if (!nome) return
    setSalvando(true)
    setMsg(null)
    const { error } = await supabase.from('seguradoras').insert({ nome, ativo: true })
    setSalvando(false)
    if (error) {
      setMsg({ tipo: 'err', texto: error.message })
      return
    }
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
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0 }}>🛡️ Seguradoras</h1>
          <p style={{ margin: '4px 0 0 0', color: '#888', fontSize: 13 }}>
            Cadastro central de seguradoras — {totalAtivas} ativas / {lista.length} total
          </p>
        </div>
      </div>

      {msg && (
        <div style={{
          padding: 10,
          borderRadius: 8,
          marginBottom: 12,
          background: msg.tipo === 'ok' ? '#0a3' : '#a00',
          color: '#fff',
          fontSize: 13,
        }}>
          {msg.texto}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="text"
          placeholder="Buscar seguradora..."
          value={filtro}
          onChange={e => setFiltro(e.target.value)}
          style={{ flex: '1 1 240px', padding: 8, borderRadius: 6, border: '1px solid #333', background: '#111', color: '#eee' }}
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#bbb' }}>
          <input
            type="checkbox"
            checked={mostrarInativas}
            onChange={e => setMostrarInativas(e.target.checked)}
          />
          Mostrar inativas
        </label>
      </div>

      {isAdmin && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="Nova seguradora"
            value={novoNome}
            onChange={e => setNovoNome(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') adicionar() }}
            style={{ flex: '1 1 240px', padding: 8, borderRadius: 6, border: '1px solid #333', background: '#111', color: '#eee' }}
          />
          <button
            onClick={adicionar}
            disabled={salvando || !novoNome.trim()}
            style={{ padding: '8px 16px', borderRadius: 6, border: 'none', background: '#0a7', color: '#fff', cursor: 'pointer', opacity: salvando || !novoNome.trim() ? 0.5 : 1 }}
          >
            {salvando ? 'Salvando...' : '+ Adicionar'}
          </button>
        </div>
      )}

      {loading ? (
        <p style={{ color: '#888' }}>Carregando...</p>
      ) : (
        <div style={{ border: '1px solid #222', borderRadius: 8, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#1a1a1a' }}>
                <th style={{ textAlign: 'left', padding: 10, fontSize: 12, color: '#aaa', textTransform: 'uppercase' }}>Seguradora</th>
                <th style={{ textAlign: 'center', padding: 10, fontSize: 12, color: '#aaa', textTransform: 'uppercase', width: 120 }}>Ativo</th>
              </tr>
            </thead>
            <tbody>
              {filtrada.map(s => (
                <tr key={s.id} style={{ borderTop: '1px solid #222' }}>
                  <td style={{ padding: 10, color: s.ativo ? '#eee' : '#777' }}>{s.nome}</td>
                  <td style={{ padding: 10, textAlign: 'center' }}>
                    <button
                      onClick={() => isAdmin && alternarAtivo(s)}
                      disabled={!isAdmin}
                      title={isAdmin ? 'Clique para alternar' : 'Somente admin'}
                      style={{
                        padding: '4px 12px',
                        borderRadius: 12,
                        border: 'none',
                        background: s.ativo ? '#0a7' : '#444',
                        color: '#fff',
                        fontSize: 12,
                        cursor: isAdmin ? 'pointer' : 'default',
                      }}
                    >
                      {s.ativo ? 'SIM' : 'NÃO'}
                    </button>
                  </td>
                </tr>
              ))}
              {filtrada.length === 0 && (
                <tr>
                  <td colSpan={2} style={{ padding: 16, textAlign: 'center', color: '#777' }}>
                    Nenhuma seguradora encontrada
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
