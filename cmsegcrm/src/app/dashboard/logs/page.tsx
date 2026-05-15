'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Aba = 'sistema' | 'logins' | 'jornadas' | 'tempo'

const PAGE_SIZE = 100

type UsoRow = {
  data: string         // 'YYYY-MM-DD' (Brasília)
  user_id: string
  user_nome: string
  user_email: string
  inicio: Date
  fim: Date
  horas: number
}

function brDateOf(d: Date | string): string {
  const dt = typeof d === 'string' ? new Date(d) : d
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(dt)
}

function brTimeOf(d: Date | string): string {
  const dt = typeof d === 'string' ? new Date(d) : d
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).format(dt)
}

function brDataBR(yyyymmdd: string): string {
  const [y, m, d] = yyyymmdd.split('-')
  return `${d}/${m}/${y}`
}

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
  const [tempoLinhas, setTempoLinhas] = useState<UsoRow[]>([])
  const [tempoCarregando, setTempoCarregando] = useState(false)

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
    } else if (aba === 'jornadas') {
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
    } else if (aba === 'tempo') {
      await carregarTempo()
    }
  }

  async function carregarTempo() {
    setTempoCarregando(true)
    try {
      const hojeISO = brDateOf(new Date())
      const de = filtroDe || hojeISO
      const ate = filtroAte || hojeISO

      // Limite de 31 dias para evitar consultas pesadas
      const diff = Math.abs(new Date(ate + 'T00:00:00-03:00').getTime() - new Date(de + 'T00:00:00-03:00').getTime()) / 86400000
      if (diff > 31) {
        alert('Período máximo: 31 dias. Ajuste o intervalo.')
        setTempoLinhas([])
        return
      }

      const inicioISO = de + 'T00:00:00.000-03:00'
      const fimISO    = ate + 'T23:59:59.999-03:00'

      let qLogins: any = supabase.from('login_logs')
        .select('user_id,user_nome,user_email,criado_em,sucesso')
        .gte('criado_em', inicioISO).lte('criado_em', fimISO)
        .eq('sucesso', true).limit(5000)
      if (filtroUser) qLogins = qLogins.eq('user_id', filtroUser)

      let qJornadas: any = supabase.from('jornadas')
        .select('user_id,iniciada_em,users(nome,email)')
        .gte('iniciada_em', inicioISO).lte('iniciada_em', fimISO).limit(5000)
      if (filtroUser) qJornadas = qJornadas.eq('user_id', filtroUser)

      let qSystem: any = supabase.from('system_logs')
        .select('user_id,user_nome,user_email,criado_em')
        .gte('criado_em', inicioISO).lte('criado_em', fimISO).limit(50000)
      if (filtroUser) qSystem = qSystem.eq('user_id', filtroUser)

      const [rLogins, rJornadas, rSystem] = await Promise.all([qLogins, qJornadas, qSystem])

      type Agg = {
        data: string, user_id: string, user_nome: string, user_email: string,
        inicio: Date | null, fim: Date | null,
      }
      const mapa = new Map<string, Agg>()
      function ensure(key: string, data: string, user_id: string, nome: string, email: string): Agg {
        let r = mapa.get(key)
        if (!r) {
          r = { data, user_id, user_nome: nome, user_email: email, inicio: null, fim: null }
          mapa.set(key, r)
        }
        if (nome && !r.user_nome) r.user_nome = nome
        if (email && !r.user_email) r.user_email = email
        return r
      }

      for (const l of (rLogins.data || [])) {
        if (!l.user_id) continue
        const dt = new Date(l.criado_em)
        const d = brDateOf(dt)
        const r = ensure(`${d}|${l.user_id}`, d, l.user_id, l.user_nome || '', l.user_email || '')
        if (!r.inicio || dt < r.inicio) r.inicio = dt
      }
      for (const j of (rJornadas.data || [])) {
        if (!j.user_id) continue
        const dt = new Date(j.iniciada_em)
        const d = brDateOf(dt)
        const r = ensure(`${d}|${j.user_id}`, d, j.user_id, j.users?.nome || '', j.users?.email || '')
        if (!r.inicio || dt < r.inicio) r.inicio = dt
      }
      for (const s of (rSystem.data || [])) {
        if (!s.user_id) continue
        const dt = new Date(s.criado_em)
        const d = brDateOf(dt)
        const r = ensure(`${d}|${s.user_id}`, d, s.user_id, s.user_nome || '', s.user_email || '')
        if (!r.fim || dt > r.fim) r.fim = dt
      }

      const uById = new Map(usuarios.map((u: any) => [u.id, u]))
      const linhas: UsoRow[] = []
      for (const r of mapa.values()) {
        if (!r.inicio) continue
        const fim = r.fim || r.inicio
        const u: any = uById.get(r.user_id)
        const nome = r.user_nome || u?.nome || '—'
        const email = r.user_email || u?.email || ''
        const horas = (fim.getTime() - r.inicio.getTime()) / 3600000
        linhas.push({
          data: r.data, user_id: r.user_id,
          user_nome: nome, user_email: email,
          inicio: r.inicio, fim, horas,
        })
      }

      linhas.sort((a, b) => {
        if (a.data !== b.data) return a.data < b.data ? 1 : -1
        return b.horas - a.horas
      })
      setTempoLinhas(linhas)
    } finally {
      setTempoCarregando(false)
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
    } else if (aba === 'jornadas') {
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
    } else {
      nomeArquivo = `tempo-uso-${new Date().toISOString().slice(0,10)}.csv`
      linhas = [['Data','Usuario','Email','Inicio','Fim','Horas']]
      for (const l of tempoLinhas) {
        linhas.push([
          brDataBR(l.data),
          l.user_nome, l.user_email,
          brTimeOf(l.inicio), brTimeOf(l.fim),
          l.horas.toFixed(2).replace('.', ','),
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
          { k:'tempo',    l:'Tempo de uso' },
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
          ⬇ Exportar CSV ({aba === 'sistema' ? sistemaFiltrado.length : aba === 'logins' ? loginsFiltrados.length : aba === 'jornadas' ? jornadasLogs.length : tempoLinhas.length})
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

      {aba === 'tempo' && (() => {
        const porData = new Map<string, UsoRow[]>()
        for (const l of tempoLinhas) {
          const arr = porData.get(l.data) || []
          arr.push(l); porData.set(l.data, arr)
        }
        const datasOrdenadas = Array.from(porData.keys()).sort((a, b) => a < b ? 1 : -1)
        return (
          <>
            <div style={{fontSize:12, color:'var(--text-muted)', marginBottom:12}}>
              Início = primeiro entre login bem-sucedido e início de jornada. Fim = última atividade registrada em <code>system_logs</code>. Horário de Brasília.
              {!filtroDe && !filtroAte ? ' Período padrão: hoje.' : ''}
            </div>
            {tempoCarregando ? (
              <div className="card" style={{padding:24, textAlign:'center', color:'var(--text-muted)'}}>Calculando...</div>
            ) : datasOrdenadas.length === 0 ? (
              <div className="card" style={{padding:24, textAlign:'center', color:'var(--text-muted)'}}>
                Nenhum registro de uso encontrado no período.
              </div>
            ) : datasOrdenadas.map(data => {
              const rows = porData.get(data)!
              const total = rows.reduce((acc, r) => acc + r.horas, 0)
              return (
                <div key={data} className="card" style={{padding:0, overflow:'hidden', marginBottom:18}}>
                  <div style={{padding:'10px 14px', borderBottom:'1px solid var(--border-soft)', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                    <div style={{fontSize:13, fontWeight:700, color:'var(--text)'}}>{brDataBR(data)}</div>
                    <div style={{fontSize:12, color:'var(--text-muted)'}}>
                      {rows.length} usuários · Total: <strong style={{color:'var(--gold)'}}>{total.toFixed(2).replace('.', ',')} h</strong>
                    </div>
                  </div>
                  <div style={{overflowX:'auto'}}>
                    <table style={{width:'100%', borderCollapse:'collapse', fontSize:12}}>
                      <thead>
                        <tr style={{background:'var(--bg-soft)', textAlign:'left'}}>
                          <th style={th}>#</th>
                          <th style={th}>Usuário</th>
                          <th style={{...th, textAlign:'right'}}>Início</th>
                          <th style={{...th, textAlign:'right'}}>Fim</th>
                          <th style={{...th, textAlign:'right'}}>Horas</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r, i) => (
                          <tr key={`${r.data}|${r.user_id}`} style={{borderTop:'1px solid var(--border-soft)'}}>
                            <td style={{...td, color:'var(--text-muted)', width:36}}>{i+1}</td>
                            <td style={td}>
                              <div>{r.user_nome}</div>
                              <div style={{fontSize:11, color:'var(--text-muted)'}}>{r.user_email}</div>
                            </td>
                            <td style={{...td, textAlign:'right', fontFamily:'monospace'}}>{brTimeOf(r.inicio)}</td>
                            <td style={{...td, textAlign:'right', fontFamily:'monospace'}}>{brTimeOf(r.fim)}</td>
                            <td style={{...td, textAlign:'right', fontWeight:600, color: r.horas >= 8 ? 'var(--teal)' : r.horas >= 4 ? 'var(--text)' : 'var(--text-muted)'}}>
                              {r.horas.toFixed(2).replace('.', ',')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            })}
          </>
        )
      })()}

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
