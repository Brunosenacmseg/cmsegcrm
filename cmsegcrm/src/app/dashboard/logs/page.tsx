'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Aba = 'sistema' | 'logins'

const PAGE_SIZE = 100

export default function LogsPage() {
  const supabase = createClient()
  const router = useRouter()

  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [aba, setAba] = useState<Aba>('sistema')

  const [usuarios, setUsuarios] = useState<any[]>([])
  const [filtroUser, setFiltroUser] = useState<string>('')
  const [filtroBusca, setFiltroBusca] = useState<string>('')
  const [filtroDe, setFiltroDe] = useState<string>('')
  const [filtroAte, setFiltroAte] = useState<string>('')

  const [systemLogs, setSystemLogs] = useState<any[]>([])
  const [loginLogs, setLoginLogs] = useState<any[]>([])

  useEffect(() => { init() }, [])

  async function init() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    const { data: prof } = await supabase.from('users').select('*').eq('id', user.id).single()
    if (prof?.role !== 'admin') { router.push('/dashboard'); return }
    setProfile(prof)
    const { data: us } = await supabase.from('users').select('id,nome,email').order('nome')
    setUsuarios(us || [])
    await carregar()
    setLoading(false)
  }

  useEffect(() => {
    if (profile) carregar()
  }, [aba, filtroUser, filtroDe, filtroAte])

  async function carregar() {
    if (aba === 'sistema') {
      let q = supabase.from('system_logs').select('*').order('criado_em', { ascending: false }).limit(PAGE_SIZE)
      if (filtroUser) q = q.eq('user_id', filtroUser)
      if (filtroDe)   q = q.gte('criado_em', filtroDe)
      if (filtroAte)  q = q.lte('criado_em', filtroAte + 'T23:59:59')
      const { data } = await q
      setSystemLogs(data || [])
    } else {
      let q = supabase.from('login_logs').select('*').order('criado_em', { ascending: false }).limit(PAGE_SIZE)
      if (filtroUser) q = q.eq('user_id', filtroUser)
      if (filtroDe)   q = q.gte('criado_em', filtroDe)
      if (filtroAte)  q = q.lte('criado_em', filtroAte + 'T23:59:59')
      const { data } = await q
      setLoginLogs(data || [])
    }
  }

  function fmtData(d: string) {
    try {
      return new Date(d).toLocaleString('pt-BR', {
        day:'2-digit', month:'2-digit', year:'numeric',
        hour:'2-digit', minute:'2-digit', second:'2-digit',
      })
    } catch { return d }
  }

  function buscaTexto(v: any) {
    return JSON.stringify(v || '').toLowerCase()
  }

  const sistemaFiltrado = systemLogs.filter(l => {
    if (!filtroBusca.trim()) return true
    const q = filtroBusca.toLowerCase()
    return buscaTexto(l).includes(q)
  })

  const loginsFiltrados = loginLogs.filter(l => {
    if (!filtroBusca.trim()) return true
    const q = filtroBusca.toLowerCase()
    return buscaTexto(l).includes(q)
  })

  if (loading) return (
    <div style={{padding:24, color:'var(--text-muted)'}}>Carregando...</div>
  )

  return (
    <div style={{padding:'24px 28px', maxWidth:1400}}>
      <div style={{marginBottom:18}}>
        <div style={{fontFamily:'DM Serif Display, serif', fontSize:24, color:'var(--text)'}}>
          Log do Sistema
        </div>
        <div style={{fontSize:12, color:'var(--text-muted)', marginTop:2}}>
          Histórico de acessos e ações de cada usuário no CRM. Apenas administradores podem visualizar.
        </div>
      </div>

      {/* Abas */}
      <div style={{display:'flex', gap:8, marginBottom:16, borderBottom:'1px solid var(--border-soft)'}}>
        {([
          { k:'sistema', l:'Atividades no sistema' },
          { k:'logins',  l:'Logins' },
        ] as {k:Aba,l:string}[]).map(t => (
          <div key={t.k} onClick={()=>setAba(t.k)}
            style={{
              padding:'10px 16px', cursor:'pointer', fontSize:13,
              color: aba===t.k ? 'var(--gold)' : 'var(--text-muted)',
              borderBottom: aba===t.k ? '2px solid var(--gold)' : '2px solid transparent',
              fontWeight: aba===t.k ? 600 : 400,
            }}>
            {t.l}
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div style={{display:'grid', gridTemplateColumns:'2fr 1fr 1fr 2fr', gap:10, marginBottom:14}}>
        <select className="input" value={filtroUser} onChange={e=>setFiltroUser(e.target.value)}>
          <option value="">Todos os usuários</option>
          {usuarios.map(u => (
            <option key={u.id} value={u.id}>{u.nome} ({u.email})</option>
          ))}
        </select>
        <input className="input" type="date" value={filtroDe}
          onChange={e=>setFiltroDe(e.target.value)} placeholder="De"/>
        <input className="input" type="date" value={filtroAte}
          onChange={e=>setFiltroAte(e.target.value)} placeholder="Até"/>
        <input className="input" type="text" value={filtroBusca}
          onChange={e=>setFiltroBusca(e.target.value)}
          placeholder="Buscar (ação, recurso, IP, cidade...)"/>
      </div>

      {aba === 'sistema' ? (
        <div className="card" style={{padding:0, overflow:'hidden'}}>
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%', borderCollapse:'collapse', fontSize:12}}>
              <thead>
                <tr style={{background:'var(--bg-soft)', textAlign:'left'}}>
                  <th style={th}>Data / Hora</th>
                  <th style={th}>Usuário</th>
                  <th style={th}>Ação</th>
                  <th style={th}>Recurso</th>
                  <th style={th}>Caminho</th>
                  <th style={th}>Detalhe</th>
                </tr>
              </thead>
              <tbody>
                {sistemaFiltrado.length === 0 ? (
                  <tr><td colSpan={6} style={{padding:24, textAlign:'center', color:'var(--text-muted)'}}>
                    Nenhum log encontrado.
                  </td></tr>
                ) : sistemaFiltrado.map(l => (
                  <tr key={l.id} style={{borderTop:'1px solid var(--border-soft)'}}>
                    <td style={td}>{fmtData(l.criado_em)}</td>
                    <td style={td}>
                      <div>{l.user_nome || '—'}</div>
                      <div style={{fontSize:11, color:'var(--text-muted)'}}>{l.user_email}</div>
                    </td>
                    <td style={td}><span style={badge}>{l.acao}</span></td>
                    <td style={td}>{l.recurso || '—'}{l.recurso_id ? ` #${l.recurso_id}` : ''}</td>
                    <td style={{...td, fontFamily:'monospace', fontSize:11}}>{l.pathname || '—'}</td>
                    <td style={td}>{l.detalhe || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{padding:'10px 14px', borderTop:'1px solid var(--border-soft)', fontSize:11, color:'var(--text-muted)'}}>
            Mostrando os {PAGE_SIZE} registros mais recentes.
          </div>
        </div>
      ) : (
        <div className="card" style={{padding:0, overflow:'hidden'}}>
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%', borderCollapse:'collapse', fontSize:12}}>
              <thead>
                <tr style={{background:'var(--bg-soft)', textAlign:'left'}}>
                  <th style={th}>Data / Hora</th>
                  <th style={th}>Usuário</th>
                  <th style={th}>Status</th>
                  <th style={th}>IP</th>
                  <th style={th}>Localização</th>
                  <th style={th}>Operadora</th>
                  <th style={th}>Dispositivo</th>
                </tr>
              </thead>
              <tbody>
                {loginsFiltrados.length === 0 ? (
                  <tr><td colSpan={7} style={{padding:24, textAlign:'center', color:'var(--text-muted)'}}>
                    Nenhum login registrado.
                  </td></tr>
                ) : loginsFiltrados.map(l => (
                  <tr key={l.id} style={{borderTop:'1px solid var(--border-soft)'}}>
                    <td style={td}>{fmtData(l.criado_em)}</td>
                    <td style={td}>
                      <div>{l.user_nome || '—'}</div>
                      <div style={{fontSize:11, color:'var(--text-muted)'}}>{l.user_email}</div>
                    </td>
                    <td style={td}>
                      {l.sucesso ? (
                        <span style={{...badge, background:'rgba(28,181,160,0.15)', color:'var(--teal)'}}>Sucesso</span>
                      ) : (
                        <span style={{...badge, background:'rgba(224,82,82,0.15)', color:'var(--red)'}} title={l.motivo||''}>Falhou</span>
                      )}
                    </td>
                    <td style={{...td, fontFamily:'monospace'}}>{l.ip || '—'}</td>
                    <td style={td}>
                      {l.cidade || l.regiao || l.pais ? (
                        <>
                          <div>{[l.cidade, l.regiao].filter(Boolean).join(' / ') || '—'}</div>
                          <div style={{fontSize:11, color:'var(--text-muted)'}}>
                            {l.pais || ''}
                            {l.latitude && l.longitude ? (
                              <> · <a href={`https://www.google.com/maps?q=${l.latitude},${l.longitude}`}
                                target="_blank" rel="noreferrer"
                                style={{color:'var(--gold)'}}>mapa</a></>
                            ) : null}
                          </div>
                        </>
                      ) : '—'}
                    </td>
                    <td style={td}>{l.isp || '—'}</td>
                    <td style={{...td, fontSize:11, color:'var(--text-muted)', maxWidth:280, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}
                        title={l.user_agent || ''}>
                      {l.user_agent || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{padding:'10px 14px', borderTop:'1px solid var(--border-soft)', fontSize:11, color:'var(--text-muted)'}}>
            Mostrando os {PAGE_SIZE} registros mais recentes.
          </div>
        </div>
      )}
    </div>
  )
}

const th: React.CSSProperties = {
  padding:'10px 12px', fontWeight:600, fontSize:11,
  color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:0.5,
}
const td: React.CSSProperties = {
  padding:'10px 12px', verticalAlign:'top',
}
const badge: React.CSSProperties = {
  display:'inline-block', padding:'2px 8px', borderRadius:6,
  background:'var(--gold-soft)', color:'var(--gold)',
  fontSize:11, fontWeight:600,
}
