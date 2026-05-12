'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import ChatIA from '@/components/ChatIA'
import MetaPixel from '@/components/MetaPixel'
import Avatar from '@/components/Avatar'
import BoasVindasLider from '@/components/BoasVindasLider'
import CommandPalette from '@/components/CommandPalette'
import { ToastProvider, ConfirmProvider } from '@/components/Toast'
import { registrarLog } from '@/lib/logs'

const NAV: Array<{ href: string; icon: string; label: string; section?: string; badge?: string; adminOnly?: boolean; equipePosVenda?: boolean; equipeGestao?: boolean; liderOnly?: boolean }> = [
  { href:'/dashboard',              icon:'📈', label:'Dashboard' },
  { href:'/dashboard/funis',        icon:'🏗', label:'Funis' },
  { href:'/dashboard/cotacoes',     icon:'🔍', label:'Cotações', adminOnly:true },
  { href:'/dashboard/telefone',     icon:'📞', label:'Telefone' },
  { href:'/dashboard/whatsapp',     icon:'💬', label:'WhatsApp' },
  { href:'/dashboard/mensagens',    icon:'✉️', label:'Mensagens', badge:'mensagens' },
  { href:'/dashboard/email',        icon:'📧', label:'Email' },
  { href:'/dashboard/mural',        icon:'📣', label:'Mural' },
  { href:'/dashboard/clientes',     icon:'👥', label:'Clientes' },
  { href:'/dashboard/apolices',     icon:'📋', label:'Apólices' },
  { href:'/dashboard/propostas',    icon:'📝', label:'Propostas' },
  { href:'/dashboard/tarefas',      icon:'✅', label:'Tarefas', badge:'tarefas' },
  { href:'/dashboard/metas',        icon:'🎯', label:'Metas' },
  { href:'/dashboard/renovacoes',   icon:'🔄', label:'Renovações' },
  { href:'/dashboard/relatorios',   icon:'📊', label:'Relatórios' },
  { href:'/dashboard/autentique',   icon:'✍️', label:'Autentique', equipePosVenda:true },
  { href:'/dashboard/comissoes',    icon:'💰', label:'Comissões', section:'Financeiro' },
  { href:'/dashboard/financeiro',   icon:'💼', label:'Financeiro / DRE', adminOnly:true },
  { href:'/dashboard/contas-pagar', icon:'💳', label:'Contas a Pagar', adminOnly:true },
  { href:'/dashboard/campanhas',    icon:'📣', label:'Campanhas Meta', section:'Marketing', adminOnly:true },
  { href:'/dashboard/seguradoras',  icon:'🛡️', label:'Seguradoras', section:'Seguradoras', equipeGestao:true },
  { href:'/dashboard/tokio',        icon:'🌐', label:'Tokio Marine (WS)', section:'Seguradoras', adminOnly:true },
  { href:'/dashboard/rdstation',    icon:'🔁', label:'RD Station CRM', section:'Integrações', adminOnly:true },
  { href:'/dashboard/integracoes/meta', icon:'🔗', label:'Conectar Meta', section:'Integrações', adminOnly:true },
  { href:'/dashboard/integracoes/integrador', icon:'🔌', label:'Integrador (API/Webhooks)', section:'Integrações', adminOnly:true },
  { href:'/dashboard/integracoes/sheets-cobranca', icon:'📥', label:'Cobrança · Sheets', section:'Integrações', adminOnly:true },
  { href:'/dashboard/agentes-ia',   icon:'🤖', label:'Agentes de IA', adminOnly:true },
  { href:'/dashboard/automacoes',   icon:'⚡', label:'Automações', adminOnly:true },
  { href:'/dashboard/manuais',      icon:'📚', label:'Manuais & Processos', section:'Empresa' },
  { href:'/dashboard/gestao-equipe',icon:'🧭', label:'Gestão de Equipe', section:'Empresa', liderOnly:true },
  { href:'/dashboard/rh',           icon:'🧑‍💼', label:'RH', section:'Empresa' },
  { href:'/dashboard/melhorias',    icon:'💡', label:'Melhorias CRM', section:'Empresa' },
  { href:'/dashboard/importar',     icon:'📥', label:'Importar Dados', section:'Config', adminOnly:true },
  { href:'/dashboard/perfil',       icon:'👤', label:'Meu Perfil', section:'Config' },
  { href:'/dashboard/usuarios',     icon:'👥', label:'Usuários', section:'Config', adminOnly:true },
  { href:'/dashboard/logs',         icon:'📜', label:'Log do Sistema', section:'Config', adminOnly:true },
  { href:'/dashboard/configuracoes',icon:'⚙️', label:'Configurações', section:'Config', adminOnly:true },
]

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router   = useRouter()
  const pathname = usePathname()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  // Fecha drawer ao trocar de rota
  useEffect(() => { setMobileNavOpen(false) }, [pathname])
  const supabase = createClient()
  const [user, setUser]                   = useState<any>(null)
  const [checked, setChecked]             = useState(false)
  const [badges, setBadges]               = useState<Record<string,number>>({})
  const [notificacoes, setNotificacoes]   = useState<any[]>([])
  const [totalNaoLidas, setTotalNaoLidas] = useState(0)
  const [showNotif, setShowNotif]         = useState(false)
  const [profile, setProfile]             = useState<any>(null)
  const [temAcessoFin, setTemAcessoFin]   = useState(false)
  const [ehPosVenda, setEhPosVenda]       = useState(false)
  const [ehGestao, setEhGestao]           = useState(false)
  const [ehLider, setEhLider]             = useState(false)
  // Seções recolhidas — começa com Marketing/Integrações/Empresa/Config
  // recolhidos para reduzir densidade visual. Persiste em localStorage.
  const [secoesRecolhidas, setSecoesRecolhidas] = useState<Record<string,boolean>>(() => {
    if (typeof window === 'undefined') return { 'Marketing':true,'Integrações':true,'Empresa':true,'Config':true }
    try {
      const s = localStorage.getItem('cm_nav_recolhidas')
      if (s) return JSON.parse(s)
    } catch {}
    return { 'Marketing':true,'Integrações':true,'Empresa':true,'Config':true }
  })
  function toggleSecao(nome: string) {
    setSecoesRecolhidas(prev => {
      const novo = { ...prev, [nome]: !prev[nome] }
      try { localStorage.setItem('cm_nav_recolhidas', JSON.stringify(novo)) } catch {}
      return novo
    })
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }: any) => {
      if (!session) { window.location.replace('/login') }
      else {
        setUser(session.user)
        setChecked(true)
        carregarProfile(session.user.id)
        carregarBadges(session.user.id)
        carregarNotificacoes(session.user.id)
      }
    })
  }, [])

  useEffect(() => {
    if (!user) return
    const interval = setInterval(() => {
      carregarBadges(user.id)
      carregarNotificacoes(user.id)
      carregarProfile(user.id) // Atualiza avatar periodicamente
      verificarTarefasVencendoAgora(user.id)
    }, 15000)
    return () => clearInterval(interval)
  }, [user])

  // Toasts de tarefas que acabaram de vencer (1 alerta por tarefa por sessão).
  const [toasts, setToasts] = useState<Array<{ id: string; titulo: string; tarefa_id: string }>>([])
  // useRef para evitar re-render ao marcar tarefas já notificadas
  const tarefasJaAvisadasRef = useRef<Set<string>>(new Set())

  async function verificarTarefasVencendoAgora(userId: string) {
    // Pega tarefas do user com prazo nos últimos 5 min e ainda pendentes/em andamento.
    const agora = Date.now()
    const inicioJanela = new Date(agora - 5*60*1000).toISOString()
    const fimJanela    = new Date(agora).toISOString()
    const { data } = await supabase.from('tarefas')
      .select('id,titulo,prazo,status,responsavel_id')
      .eq('responsavel_id', userId)
      .in('status', ['pendente','em_andamento'])
      .gte('prazo', inicioJanela)
      .lte('prazo', fimJanela)
    if (!data) return
    const novos: typeof toasts = []
    for (const t of data) {
      if (tarefasJaAvisadasRef.current.has(t.id)) continue
      tarefasJaAvisadasRef.current.add(t.id)
      novos.push({ id: `toast-${t.id}-${Date.now()}`, titulo: t.titulo, tarefa_id: t.id })
    }
    if (novos.length > 0) {
      setToasts(prev => [...prev, ...novos])
      novos.forEach(n => {
        setTimeout(() => setToasts(prev => prev.filter(t => t.id !== n.id)), 12000)
      })
    }
  }

  // Bloqueia acesso direto via URL para rotas adminOnly e equipe-only.
  // Precisa estar ANTES de qualquer early return para respeitar as Rules of
  // Hooks (caso contrário gera React error #310).
  useEffect(() => {
    if (!profile) return
    const isAdminUser = profile.role === 'admin' || profile.role === 'financeiro'
    const rotaAdmin = NAV.find(item => item.adminOnly && (pathname === item.href || pathname.startsWith(item.href + '/')))
    if (rotaAdmin && !isAdminUser) {
      router.replace('/dashboard')
      return
    }
    const rotaGestao = NAV.find(item => item.equipeGestao && (pathname === item.href || pathname.startsWith(item.href + '/')))
    if (rotaGestao && !isAdminUser && !ehGestao) {
      router.replace('/dashboard'); return
    }
    const rotaPosVenda = NAV.find(item => item.equipePosVenda && (pathname === item.href || pathname.startsWith(item.href + '/')))
    if (rotaPosVenda && !isAdminUser && !ehPosVenda) {
      router.replace('/dashboard')
      return
    }
    const rotaLider = NAV.find(item => item.liderOnly && (pathname === item.href || pathname.startsWith(item.href + '/')))
    if (rotaLider && !isAdminUser && !ehLider) {
      router.replace('/dashboard')
    }
  }, [profile, ehPosVenda, ehGestao, ehLider, pathname, router])

  // Registra navegação do usuário (auditoria). Usa o label do NAV quando
  // possível para que o log fique legível no painel de admin.
  useEffect(() => {
    if (!user || !pathname) return
    const item = NAV.find(it => pathname === it.href || (it.href !== '/dashboard' && pathname.startsWith(it.href)))
    registrarLog({
      acao: 'page_view',
      recurso: item?.label || pathname,
      pathname,
    })
  }, [user, pathname])

  async function carregarProfile(userId: string) {
    const { data } = await supabase.from('users').select('id,nome,role,avatar_url,ramal_goto').eq('id', userId).single()
    setProfile(data)
    // Acesso ao módulo financeiro: admin sempre tem; demais via financeiro_acessos
    if (data?.role === 'admin' || data?.role === 'financeiro') {
      setTemAcessoFin(true)
    } else {
      const { data: ac } = await supabase.from('financeiro_acessos').select('user_id').eq('user_id', userId).maybeSingle()
      setTemAcessoFin(!!ac)
    }
    // Pertence à EQUIPE PÓS VENDA? (libera Autentique)
    const { data: eq } = await supabase
      .from('equipe_membros')
      .select('equipes!inner(nome)')
      .eq('user_id', userId)
    const nomes = (eq || []).map((r: any) => (r.equipes?.nome || '').toString().toUpperCase().trim())
    setEhPosVenda(nomes.some((n: string) => n === 'EQUIPE PÓS VENDA' || n === 'EQUIPE POS VENDA'))
    // Pertence à equipe GESTÃO? (libera módulo Seguradoras)
    const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').trim()
    setEhGestao(nomes.some((n: string) => norm(n) === 'gestao' || norm(n) === 'equipe gestao'))
    // É líder? role='lider' ou consta como lider_id em alguma equipe
    if (data?.role === 'lider' || data?.role === 'admin') {
      setEhLider(true)
    } else {
      const { data: eqs } = await supabase.from('equipes').select('id').eq('lider_id', userId).limit(1)
      setEhLider(!!(eqs && eqs.length))
    }
  }

  async function carregarBadges(userId: string) {
    const agoraIso = new Date(Date.now() - 60*1000).toISOString()
    const [
      { count: msg },
      { count: tarefasAtrasadas },
      { count: tarefasPendentes },
    ] = await Promise.all([
      supabase.from('mensagens_internas').select('*', { count:'exact', head:true }).eq('para_user_id', userId).eq('lida', false),
      // ATRASADAS = prazo já passou (mais de 1min) e ainda não concluídas
      supabase.from('tarefas').select('*', { count:'exact', head:true })
        .eq('responsavel_id', userId)
        .in('status', ['pendente', 'em_andamento'])
        .lt('prazo', agoraIso)
        .not('prazo', 'is', null),
      // PENDENTES TOTAIS (cor amarela quando não há atrasadas)
      supabase.from('tarefas').select('*', { count:'exact', head:true })
        .eq('responsavel_id', userId)
        .eq('status', 'pendente'),
    ])
    setBadges({
      mensagens: msg||0,
      tarefas: tarefasAtrasadas || 0,            // O badge vermelho mostra só atrasadas
      tarefas_pendentes: tarefasPendentes || 0, // Total pendente para compor tooltip
    })
  }

  async function carregarNotificacoes(userId: string) {
    const { data } = await supabase.from('notificacoes').select('*').eq('user_id', userId).order('criado_em', { ascending: false }).limit(20)
    setNotificacoes(data||[])
    setTotalNaoLidas((data||[]).filter((n:any) => !n.lida).length)
  }

  async function marcarTodasLidas() {
    if (!user) return
    await supabase.from('notificacoes').update({ lida: true }).eq('user_id', user.id).eq('lida', false)
    await carregarNotificacoes(user.id)
  }

  async function clicarNotificacao(notif: any) {
    await supabase.from('notificacoes').update({ lida: true }).eq('id', notif.id)
    setShowNotif(false)
    if (notif.link) router.push(notif.link)
    await carregarNotificacoes(user.id)
  }

  async function logout() {
    await registrarLog({ acao: 'logout' })
    await supabase.auth.signOut()
    window.location.replace('/login')
  }

  if (!checked) return (
    <div style={{minHeight:'100vh',background:'var(--bg)',display:'flex',alignItems:'center',justifyContent:'center',color:'var(--text-muted)'}}>
      Carregando...
    </div>
  )

  const tipoIcone: Record<string,string> = {
    mencao:'📣', tarefa:'✅', comentario:'💬', reacao:'❤️',
    ligacao:'📞', renovacao:'🔄', vencimento:'⚠️', sistema:'🔔',
  }

  function tempoAtras(data: string) {
    const diff = Date.now() - new Date(data).getTime()
    const min = Math.floor(diff/60000)
    if (min < 1) return 'agora'
    if (min < 60) return `${min}min`
    const h = Math.floor(min/60)
    if (h < 24) return `${h}h`
    return `${Math.floor(h/24)}d`
  }

  let lastSection = ''
  const isAdmin = profile?.role === 'admin' || profile?.role === 'financeiro'
  const navVisible = NAV.filter(item => {
    if (item.adminOnly && !isAdmin) return false
    // Autentique: só admin ou membro da EQUIPE PÓS VENDA
    if (item.equipePosVenda && !isAdmin && !ehPosVenda) return false
    if (item.equipeGestao && !isAdmin && !ehGestao) return false
    if (item.liderOnly && !isAdmin && !ehLider) return false
    // Financeiro / DRE: agora é adminOnly (já filtrado acima); o flag
    // temAcessoFin permanece como no-op para compat.
    if (item.href === '/dashboard/financeiro' && !temAcessoFin) return false
    return true
  })

  return (
    <ToastProvider><ConfirmProvider>
    <CommandPalette />
    <style>{`
      /* Mobile: sidebar vira drawer */
      @media (max-width: 900px) {
        .cm-sidebar { transform: translateX(-100%); transition: transform 0.22s ease; box-shadow: 8px 0 32px rgba(0,0,0,0.4); }
        .cm-sidebar.open { transform: translateX(0); }
        .cm-main { margin-left: 0 !important; padding-left: 12px !important; padding-right: 12px !important; }
        .cm-mobile-toggle { display: inline-flex !important; }
        .cm-mobile-overlay { display: block !important; }
      }
      .cm-mobile-toggle { display: none; }
      .cm-mobile-overlay { display: none; }
    `}</style>
    {/* Botão hamburger flutuante (visível só mobile) */}
    <button
      onClick={() => setMobileNavOpen(o => !o)}
      className="cm-mobile-toggle"
      aria-label="Abrir menu"
      style={{
        position:'fixed', top:14, left:14, zIndex:40,
        width:42, height:42, borderRadius:10, border:'1px solid var(--border)',
        background:'var(--bg-soft)', color:'var(--gold)', fontSize:20, cursor:'pointer',
        alignItems:'center', justifyContent:'center', boxShadow:'0 2px 10px rgba(0,0,0,0.3)',
      }}
    >☰</button>
    {mobileNavOpen && (
      <div
        className="cm-mobile-overlay"
        onClick={() => setMobileNavOpen(false)}
        style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:9}}
      />
    )}
    <div style={{display:'flex', minHeight:'100vh', overflow:'hidden'}}>
      <div style={{position:'fixed',inset:0,pointerEvents:'none',zIndex:0,background:'radial-gradient(ellipse 60% 50% at 80% 10%, rgba(201,168,76,0.07) 0%, transparent 60%), radial-gradient(ellipse 50% 60% at 10% 80%, rgba(28,181,160,0.06) 0%, transparent 60%)'}}/>

      <aside className={`cm-sidebar ${mobileNavOpen ? 'open' : ''}`} style={{width:'var(--sidebar-w)',background:'var(--sb-bg)',borderRight:'1px solid var(--sb-border)',display:'flex',flexDirection:'column',position:'fixed',top:0,left:0,bottom:0,zIndex:10,color:'var(--sb-text)'}}>
        <div style={{padding:'20px 18px 16px',borderBottom:'1px solid var(--sb-border)',display:'flex',alignItems:'center',gap:10}}>
          <div style={{width:36,height:36,borderRadius:10,background:'linear-gradient(135deg,var(--gold) 0%,var(--gold-light) 100%)',display:'flex',alignItems:'center',justifyContent:'center',color:'#11182a',fontFamily:'DM Serif Display,serif',fontSize:18,fontWeight:700}}>CM</div>
          <div style={{minWidth:0}}>
            <div style={{fontFamily:'DM Serif Display,serif',fontSize:16,color:'#fff',lineHeight:1.1}}>CM Seguros</div>
            <div style={{fontSize:9,color:'var(--sb-text-dim)',letterSpacing:1.2,textTransform:'uppercase',marginTop:3,fontWeight:600}}>CRM · Painel</div>
          </div>
        </div>

        <nav style={{flex:1,padding:'10px 0',overflowY:'auto'}}>
          {navVisible.map((item) => {
            const showSection = item.section && item.section !== lastSection
            if (item.section) lastSection = item.section
            const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
            const badgeCount = item.badge ? badges[item.badge]||0 : 0
            // Seção atual (item dentro de uma seção): se a seção estiver
            // recolhida, só mostra o cabeçalho clicável e oculta os filhos.
            const secaoAtual = (() => {
              // Encontra a seção mais recente declarada em itens anteriores
              let s: string | undefined = undefined
              for (const it of navVisible) {
                if (it === item) break
                if (it.section) s = it.section
              }
              return item.section || s
            })()
            const recolhida = secaoAtual ? !!secoesRecolhidas[secaoAtual] : false
            return (
              <div key={item.href}>
                {showSection && (
                  <div className={'nav-section' + (recolhida?' nav-section-collapsed':'')}
                       onClick={() => toggleSecao(item.section!)}
                       title={recolhida?'Expandir':'Recolher'}>
                    <span>{item.section}</span>
                    <span className="nav-section-arrow">▾</span>
                  </div>
                )}
                {!recolhida && (
                  <Link href={item.href} prefetch={false} className={'cm-nav-item' + (active?' active':'')}>
                    <span className="cm-nav-ico">{item.icon}</span>
                    {item.label}
                    {(() => {
                      // Para o item "tarefas", o número vermelho mostra só ATRASADAS.
                      // Se não houver atrasadas mas houver pendentes, mostra um
                      // indicador amarelo discreto. Outras badges seguem o padrão.
                      if (item.badge === 'tarefas') {
                        const atrasadas = badges['tarefas'] || 0
                        const pendentes = (badges as any)['tarefas_pendentes'] || 0
                        if (atrasadas > 0) {
                          return (
                            <span title={`${atrasadas} atrasada${atrasadas>1?'s':''} · ${pendentes} pendente${pendentes!==1?'s':''} no total`}
                              style={{marginLeft:'auto',background:'var(--danger)',color:'#fff',fontSize:10,fontWeight:700,borderRadius:10,padding:'1px 6px',minWidth:18,textAlign:'center'}}>
                              🔴 {atrasadas}
                            </span>
                          )
                        }
                        if (pendentes > 0) {
                          return (
                            <span title={`${pendentes} tarefa${pendentes>1?'s':''} pendente${pendentes>1?'s':''}`}
                              style={{marginLeft:'auto',background:'rgba(201,168,76,0.18)',color:'var(--gold)',fontSize:10,fontWeight:700,borderRadius:10,padding:'1px 6px',minWidth:18,textAlign:'center'}}>
                              {pendentes}
                            </span>
                          )
                        }
                        return null
                      }
                      return badgeCount > 0 ? (
                        <span style={{marginLeft:'auto',background:'var(--danger)',color:'#fff',fontSize:10,fontWeight:700,borderRadius:10,padding:'1px 6px',minWidth:18,textAlign:'center'}}>
                          {badgeCount}
                        </span>
                      ) : null
                    })()}
                  </Link>
                )}
              </div>
            )
          })}
        </nav>

        {/* Rodapé com avatar clicável */}
        <div style={{padding:'12px 14px',borderTop:'1px solid var(--sb-border)',display:'flex',alignItems:'center',gap:10,background:'var(--sb-bg-2)'}}>
          <div onClick={()=>router.push('/dashboard/perfil')} title="Meu perfil"
            style={{cursor:'pointer',border:'2px solid var(--gold)',borderRadius:'50%',flexShrink:0}}>
            <Avatar nome={profile?.nome||user?.email} avatarUrl={profile?.avatar_url} role={profile?.role} size={34} />
          </div>
          <div style={{flex:1,minWidth:0,cursor:'pointer'}} onClick={()=>router.push('/dashboard/perfil')}>
            <div style={{fontSize:13,fontWeight:500,color:'#fff',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{profile?.nome||user?.email}</div>
            <div style={{fontSize:11,color:'var(--sb-text-dim)'}}>{profile?.role||'Corretor'}</div>
          </div>
          <span onClick={logout} style={{fontSize:16,cursor:'pointer',color:'var(--sb-text-dim)'}} title="Sair">🚪</span>
        </div>
      </aside>

      <main className="cm-main" style={{marginLeft:'var(--sidebar-w)',flex:1,minWidth:0,maxWidth:'calc(100vw - var(--sidebar-w))',display:'flex',flexDirection:'column',position:'relative',zIndex:1,overflow:'hidden'}} onClick={()=>setShowNotif(false)}>
        {/* Header com busca, sino e usuário (estilo RD Station) */}
        <div style={{height:56,borderBottom:'1px solid var(--border-soft)',display:'flex',alignItems:'center',padding:'0 20px',background:'#ffffff',position:'sticky',top:0,zIndex:20,flexShrink:0,gap:14}}>
          <label className="cm-topbar-search" style={{flex:'0 1 420px'}} onClick={(e)=>{
            // Dispara Command Palette ao clicar
            const ev = new KeyboardEvent('keydown',{key:'k',metaKey:true,bubbles:true})
            window.dispatchEvent(ev)
          }}>
            <span style={{fontSize:14,color:'var(--text-faint)'}}>🔍</span>
            <input readOnly placeholder="Buscar clientes, apólices, tarefas… (⌘K)" />
          </label>

          <div style={{flex:1}}/>

          <div style={{position:'relative'}}>
            <button onClick={e=>{e.stopPropagation();setShowNotif(!showNotif)}}
              className="cm-icon-btn" title="Notificações">
              <span>🔔</span>
              {totalNaoLidas > 0 && (
                <span style={{position:'absolute',top:-4,right:-4,background:'var(--red)',color:'#fff',fontSize:10,fontWeight:700,borderRadius:10,padding:'1px 5px',minWidth:18,textAlign:'center',border:'2px solid #fff'}}>
                  {totalNaoLidas > 99 ? '99+' : totalNaoLidas}
                </span>
              )}
            </button>

            {showNotif && (
              <div onClick={e=>e.stopPropagation()} style={{position:'absolute',top:'calc(100% + 10px)',left:'50%',transform:'translateX(-50%)',width:380,background:'#ffffff',border:'1px solid var(--border-soft)',borderRadius:16,zIndex:100,boxShadow:'var(--shadow-lg)',overflow:'hidden'}}>
                <div style={{padding:'14px 18px',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                  <div style={{fontSize:14,fontWeight:600}}>🔔 Notificações</div>
                  {totalNaoLidas > 0 && (
                    <button onClick={marcarTodasLidas} style={{fontSize:12,background:'none',border:'none',color:'var(--teal)',cursor:'pointer',fontFamily:'DM Sans,sans-serif'}}>
                      Marcar todas lidas
                    </button>
                  )}
                </div>
                <div style={{maxHeight:420,overflow:'auto'}}>
                  {notificacoes.length === 0 ? (
                    <div style={{padding:28,textAlign:'center',color:'var(--text-muted)',fontSize:13}}>Nenhuma notificação</div>
                  ) : notificacoes.map(n=>(
                    <div key={n.id} onClick={()=>clicarNotificacao(n)}
                      style={{padding:'12px 18px',cursor:'pointer',borderBottom:'1px solid rgba(255,255,255,0.04)',background:n.lida?'transparent':'rgba(201,168,76,0.05)',display:'flex',gap:12,alignItems:'flex-start',transition:'background 0.15s'}}
                      onMouseEnter={e=>(e.currentTarget.style.background='rgba(255,255,255,0.04)')}
                      onMouseLeave={e=>(e.currentTarget.style.background=n.lida?'transparent':'rgba(201,168,76,0.05)')}>
                      <span style={{fontSize:20,flexShrink:0}}>{tipoIcone[n.tipo]||'🔔'}</span>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:13,fontWeight:n.lida?400:600,marginBottom:2}}>{n.titulo}</div>
                        {n.descricao && <div style={{fontSize:12,color:'var(--text-muted)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{n.descricao}</div>}
                        <div style={{fontSize:11,color:'var(--text-muted)',marginTop:3}}>{tempoAtras(n.criado_em)}</div>
                      </div>
                      {!n.lida && <div style={{width:8,height:8,borderRadius:'50%',background:'var(--gold)',flexShrink:0,marginTop:4}}/>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div onClick={()=>router.push('/dashboard/perfil')} style={{display:'flex',alignItems:'center',gap:10,padding:'4px 10px 4px 4px',border:'1px solid var(--border-soft)',borderRadius:999,cursor:'pointer',background:'#fff'}}>
            <Avatar nome={profile?.nome||user?.email} avatarUrl={profile?.avatar_url} role={profile?.role} size={28} />
            <span style={{fontSize:13,fontWeight:500,color:'var(--text)'}}>{profile?.nome?.split(' ')[0] || user?.email}</span>
          </div>
        </div>

        {children}
      </main>

      <ChatIA />
      <MetaPixel />
      <BoasVindasLider visivel={profile?.role === 'lider' && pathname !== '/dashboard/gestao-equipe'} />

      {/* Toasts de tarefas vencendo agora */}
      {toasts.length > 0 && (
        <div style={{position:'fixed',bottom:24,right:24,zIndex:1000,display:'flex',flexDirection:'column',gap:10,maxWidth:360}}>
          {toasts.map(t => (
            <div key={t.id}
              onClick={() => { router.push('/dashboard/tarefas'); setToasts(prev => prev.filter(x => x.id !== t.id)) }}
              style={{cursor:'pointer',background:'#ffffff',border:'2px solid var(--red)',borderRadius:12,padding:'14px 18px',boxShadow:'0 8px 28px rgba(224,82,82,0.30)',display:'flex',alignItems:'flex-start',gap:10,animation:'slide-in 0.25s ease-out'}}>
              <span style={{fontSize:22}}>⏰</span>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:12,fontWeight:700,color:'var(--red)',letterSpacing:0.5,textTransform:'uppercase',marginBottom:4}}>Tarefa vencendo agora</div>
                <div style={{fontSize:13,fontWeight:500,color:'var(--text)',marginBottom:4}}>{t.titulo}</div>
                <div style={{fontSize:11,color:'var(--text-muted)'}}>Clique para abrir tarefas →</div>
              </div>
              <button onClick={(e)=>{ e.stopPropagation(); setToasts(prev => prev.filter(x => x.id !== t.id)) }}
                style={{background:'none',border:'none',color:'var(--text-muted)',cursor:'pointer',fontSize:16}}>✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
    </ConfirmProvider></ToastProvider>
  )
}
