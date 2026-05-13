'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Aba = 'sistema' | 'logins' | 'jornadas'

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
  const [jornadasLogs, setJornadasLogs] = useState<any[]>([])
  const [jornadasFaltantes, setJornadasFaltantes] = useState<any[]>([])

  useEffect(() => { init() }, [])

  async function init() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    const { data: prof } = await supabase.from('users').select('*').eq('id', user.id).single()
    let liberado = prof?.role === 'admin'
    if (!liberado) {
      // Membro ou líder da EQUIPE GESTÃO tambem tem acesso
      const norm = (s: string) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
      const { data: minhas } = await supabase
        .from('equipe_membros').select('equipes(nome)').eq('user_id', user.id)
      const liderada = await supabase.from('equipes').select('nome').eq('lider_id', user.id)
      const nomesEq = [
        ...((minhas || []) as any[]).map(m => m.equipes?.nome),
        ...((liderada.data || []) as any[]).map(e => e.nome),
      ].filter(Boolean).map(norm)
      liberado = nomesEq.some(n => n === 'gestao' || n === 'equipe gestao')
    }
    if (!liberado) { router.push('/dashboard'); return }
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
    } else if (aba === 'logins') {
      let q = supabase.from('login_logs').select('*').order('criado_em', { ascending: false }).limit(PAGE_SIZE)
      if (filtroUser) q = q.eq('user_id', filtroUser)
      if (filtroDe)   q = q.gte('criado_em', filtroDe)
      if (filtroAte)  q = q.lte('criado_em', filtroAte + 'T23:59:59')
      const { data } = await q
      setLoginLogs(data || [])
    } else {
      // Aba 'jornadas' — mostra inícios de jornada (jornadas + system_logs cruzados)
      let q = supabase.from('jornadas').select('*, users(id,nome,email)').order('iniciada_em', { ascending: false }).limit(PAGE_SIZE)
      if (filtroUser) q = q.eq('user_id', filtroUser)
      if (filtroDe)   q = q.gte('iniciada_em', filtroDe)
      if (filtroAte)  q = q.lte('iniciada_em', filtroAte + 'T23:59:59')
      const { data: jornadas } = await q
      setJornadasLogs(jornadas || [])
      // Faltantes do dia: usuários que ainda não iniciaram a jornada hoje
      const hoje = new Date(); hoje.setHours(0,0,0,0)
      const hojeISO = hoje.toISOString()
      const { data: jHoje } = await supabase.from('jornadas').select('user_id').gte('iniciada_em', hojeISO)
      const userIdsHoje = new Set((jHoje || []).map((j:any) => j.user_id))
      const { data: us } = await supabase.from('users').select('id,nome,email,role').order('nome')
      const faltantes = (us || []).filter((u:any) => !userIdsHoje.has(u.id))
      setJornadasFaltantes(faltantes)
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

  function exportarCSV() {
    let linhas: string[][] = []
    let nomeArquivo = 'logs.csv'
    if (aba === 'sistema') {
      nomeArquivo = `logs-sistema-${new Date().toISOString().slice(0,10)}.csv`
      linhas = [['Data','Usuario','Email','Acao','Recurso','Recurso ID','Caminho','Detalhe','IP']]
      for (const l of sistemaFiltrado) {
        linhas.push([
          fmtData(l.criado_em),
          l.user_nome || '', l.user_email || '',
          l.acao || '', l.recurso || '', l.recurso_id || '',
          l.caminho || '', JSON.stringify(l.detalhe || {}),
          l.ip || '',
        ])
      }
    } else if (aba === 'logins') {
      nomeArquivo = `logs-logins-${new Date().toISOString().slice(0,10)}.csv`
      linhas = [['Data','Usuario','Email','IP','Cidade','Estado','Pais','User Agent','Sucesso']]
      for (const l of loginsFiltrados) {
        linhas.push([
          fmtData(l.criado_em),
          l.user_nome || '', l.user_email || '',
          l.ip || '', l.cidade || '', l.estado || '', l.pais || '',
          l.user_agent || '', l.sucesso === false ? 'falhou' : 'ok',
        ])
      }
    } else {
      nomeArquivo = `logs-jornadas-${new Date().toISOString().slice(0,10)}.csv`
      linhas = [['Iniciada em','Encerrada em','Usuario','Email','Duracao (min)']]
      for (const l of jornadasLogs) {
        const ini = l.iniciada_em ? new Date(l.iniciada_em) : null
        const fim = l.encerrada_em ? new Date(l.encerrada_em) : null
        const dur = ini && fim ? Math.round((fim.getTime() - ini.getTime())/60000) : ''
        linhas.push([
          ini ? fmtData(l.iniciada_em) : '',
          fim ? fmtData(l.encerrada_em) : 'Em andamento',
          l.users?.nome || '', l.users?.email || '',
          String(dur),
        ])
      }
    }
    const csv = linhas.map(r => r.map(c => {
      const s = String(c ?? '')
      return s.includes(',') || s.includes('"') || s.includes('\n') ? '"' + s.replace(/"/g,'""') + '"' : s
    }).join(',')).join('\r\n')
    // BOM para Excel reconhecer UTF-8
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = nomeArquivo; a.click()
    setTimeout(()=>URL.revokeObjectURL(url), 1000)
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
          { k:'sistema',  l:'Atividades no sistema' },
          { k:'logins',   l:'Logins' },
          { k:'jornadas', l:'Início de Jornada' },
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

      <div style={{display:'flex',justifyContent:'flex-end',marginBottom:12}}>
        <button onClick={exportarCSV}
          style={{padding:'8px 14px',borderRadius:8,border:'1px solid var(--teal)',background:'rgba(28,181,160,0.10)',color:'var(--teal)',cursor:'pointer',fontSize:12,fontWeight:600,fontFamily:'Open Sans,sans-serif'}}>
          ⬇ Exportar CSV ({aba === 'sistema' ? sistemaFiltrado.length : aba === 'logins' ? loginsFiltrados.length : jornadasLogs.length})
        </button>
      </div>

      {aba === 'sistema' && (
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
      )}

      {aba === 'logins' && (
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

      {aba === 'jornadas' && (
        <>
          <div style={{display:'flex',gap:12,marginBottom:14,flexWrap:'wrap'}}>
            <div style={{background:'var(--success-bg)',color:'var(--success)',padding:'8px 14px',borderRadius:8,fontSize:13}}>
              ✓ Jornadas listadas: <strong>{jornadasLogs.length}</strong>
            </div>
            <div style={{background:'var(--warning-bg)',color:'var(--warning)',padding:'8px 14px',borderRadius:8,fontSize:13}}>
              ⏳ Faltam iniciar hoje: <strong>{jornadasFaltantes.length}</strong>
            </div>
          </div>

          <div className="card" style={{padding:0, overflow:'hidden', marginBottom:18}}>
            <div style={{padding:'10px 14px',borderBottom:'1px solid var(--border-soft)',fontSize:12,fontWeight:700,color:'var(--text)'}}>Jornadas iniciadas</div>
            <div style={{overflowX:'auto'}}>
              <table style={{width:'100%', borderCollapse:'collapse', fontSize:12}}>
                <thead>
                  <tr style={{background:'var(--bg-soft)', textAlign:'left'}}>
                    <th style={th}>Início</th>
                    <th style={th}>Usuário</th>
                    <th style={th}>IP</th>
                    <th style={th}>Localização (lat,lng)</th>
                    <th style={th}>Cidade/UF</th>
                    <th style={th}>Encerramento</th>
                  </tr>
                </thead>
                <tbody>
                  {jornadasLogs.length === 0 ? (
                    <tr><td colSpan={6} style={{padding:24, textAlign:'center', color:'var(--text-muted)'}}>
                      Nenhuma jornada encontrada no período.
                    </td></tr>
                  ) : jornadasLogs.map(j => (
                    <tr key={j.id} style={{borderTop:'1px solid var(--border-soft)'}}>
                      <td style={td}>{fmtData(j.iniciada_em)}</td>
                      <td style={td}>
                        <div>{j.users?.nome || '—'}</div>
                        <div style={{fontSize:11, color:'var(--text-muted)'}}>{j.users?.email || ''}</div>
                      </td>
                      <td style={{...td, fontFamily:'monospace'}}>{j.ip || '—'}</td>
                      <td style={td}>
                        {j.lat && j.lng ? (
                          <a href={`https://www.google.com/maps/search/?api=1&query=${j.lat},${j.lng}`} target="_blank" rel="noreferrer"
                            style={{color:'var(--blue)',textDecoration:'none',fontFamily:'monospace',fontSize:11}}>
                            {Number(j.lat).toFixed(5)}, {Number(j.lng).toFixed(5)}
                          </a>
                        ) : <span style={{color:'var(--text-muted)'}}>não permitiu</span>}
                      </td>
                      <td style={td}>{[j.cidade, j.uf].filter(Boolean).join('/') || '—'}</td>
                      <td style={td}>
                        {j.encerrada_em ? (
                          <>
                            <div>{fmtData(j.encerrada_em)}</div>
                            <div style={{fontSize:11,color:'var(--text-muted)'}}>{j.encerrada_motivo || ''}</div>
                          </>
                        ) : <span style={{color:'var(--teal)'}}>Aberta</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{padding:'10px 14px', borderTop:'1px solid var(--border-soft)', fontSize:11, color:'var(--text-muted)'}}>
              Mostrando os {PAGE_SIZE} registros mais recentes do filtro selecionado.
            </div>
          </div>

          <div className="card" style={{padding:0, overflow:'hidden'}}>
            <div style={{padding:'10px 14px',borderBottom:'1px solid var(--border-soft)',fontSize:12,fontWeight:700,color:'var(--text)'}}>
              Usuários que ainda não iniciaram a jornada HOJE
            </div>
            {jornadasFaltantes.length === 0 ? (
              <div style={{padding:24,textAlign:'center',color:'var(--text-muted)',fontSize:13}}>
                ✓ Todos os usuários cadastrados já iniciaram a jornada hoje.
              </div>
            ) : (
              <div style={{overflowX:'auto'}}>
                <table style={{width:'100%', borderCollapse:'collapse', fontSize:12}}>
                  <thead>
                    <tr style={{background:'var(--bg-soft)', textAlign:'left'}}>
                      <th style={th}>Usuário</th>
                      <th style={th}>E-mail</th>
                      <th style={th}>Função</th>
                    </tr>
                  </thead>
                  <tbody>
                    {jornadasFaltantes.map(u => (
                      <tr key={u.id} style={{borderTop:'1px solid var(--border-soft)'}}>
                        <td style={td}>{u.nome || '—'}</td>
                        <td style={td}>{u.email || '—'}</td>
                        <td style={td}><span style={badge}>{u.role || '—'}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
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
