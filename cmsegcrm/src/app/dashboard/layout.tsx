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

type MenuGroup = { label: string; href?: string; badge?: string; children?: Array<{ href: string; label: string; icon?: string; badge?: string }> }

function buildMenuGroups(isAdmin: boolean, ehPosVenda: boolean, ehGestao: boolean, ehLider: boolean): MenuGroup[] {
  const all = NAV.filter(item => {
    if (item.adminOnly && !isAdmin) return false
    if (item.equipePosVenda && !isAdmin && !ehPosVenda) return false
    if (item.equipeGestao && !isAdmin && !ehGestao) return false
    if (item.liderOnly && !isAdmin && !ehLider) return false
    return true
  })
  const has = (href: string) => all.find(i => i.href === href)
  const child = (href: string, label?: string, badge?: string) => {
    const it = has(href); if (!it) return null
    return { href: it.href, label: label || it.label, icon: it.icon, badge }
  }
  const compact = <T,>(arr: (T|null)[]): T[] => arr.filter(Boolean) as T[]

  const groups: MenuGroup[] = [
    { label: 'Início', href: '/dashboard' },
    { label: 'Negociações', children: compact([
      child('/dashboard/funis', 'Funis'),
      child('/dashboard/cotacoes', 'Cotações'),
      child('/dashboard/propostas', 'Propostas'),
      child('/dashboard/renovacoes', 'Renovações'),
    ])},
    { label: 'Clientes', children: compact([
      child('/dashboard/clientes', 'Clientes'),
      child('/dashboard/apolices', 'Apólices'),
    ])},
    { label: 'Tarefas', href: '/dashboard/tarefas', badge: 'tarefas' },
    { label: 'Mensagens', children: compact([
      child('/dashboard/telefone', 'Telefone'),
      child('/dashboard/whatsapp', 'WhatsApp'),
      child('/dashboard/mensagens', 'Mensagens', 'mensagens'),
      child('/dashboard/email', 'Email'),
      child('/dashboard/mural', 'Mural'),
    ])},
    { label: 'Análises', children: compact([
      child('/dashboard/relatorios', 'Relatórios'),
      child('/dashboard/metas', 'Metas'),
    ])},
    { label: 'Financeiro', children: compact([
      child('/dashboard/financeiro', 'Financeiro / DRE'),
      child('/dashboard/comissoes', 'Comissões'),
      child('/dashboard/contas-pagar', 'Contas a Pagar'),
    ])},
    { label: 'RH', href: '/dashboard/rh' },
    { label: 'Gestão de Equipe', href: '/dashboard/gestao-equipe' },
    { label: 'Autentique', href: '/dashboard/autentique' },
  ]
  return groups.filter(g => {
    if (g.children) return g.children.length > 0
    if (g.href) {
      const base = g.href.split('?')[0]
      return !!all.find(i => i.href === base)
    }
    return false
  })
}

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
  const [showGear, setShowGear]           = useState(false)
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

  const menuGroups = buildMenuGroups(isAdmin, ehPosVenda, ehGestao, ehLider)
  const tarefasAtrasadas = badges['tarefas'] || 0
  const tarefasPendentes = (badges as any)['tarefas_pendentes'] || 0

  function badgeFor(badgeKey?: string): { count: number; danger: boolean } | null {
    if (!badgeKey) return null
    if (badgeKey === 'tarefas') {
      if (tarefasAtrasadas > 0) return { count: tarefasAtrasadas, danger: true }
      if (tarefasPendentes > 0) return { count: tarefasPendentes, danger: false }
      return null
    }
    const c = badges[badgeKey] || 0
    return c > 0 ? { count: c, danger: true } : null
  }

  return (
    <ToastProvider><ConfirmProvider>
    <CommandPalette />
    <style>{`
      .cm-topnav-item { position: relative; }
      .cm-topnav-item > a, .cm-topnav-item > button {
        display: inline-flex; align-items: center; gap: 6px;
        padding: 18px 12px; font-size: 14px; color: var(--sb-text);
        text-decoration: none; background: transparent; border: none; cursor: pointer;
        font-family: inherit; transition: color 0.15s; position: relative;
      }
      .cm-topnav-item:hover > a, .cm-topnav-item:hover > button { color: #fff; }
      .cm-topnav-item.active > a, .cm-topnav-item.active > button {
        color: var(--gold-light); font-weight: 600;
      }
      .cm-topnav-item.active > a::after, .cm-topnav-item.active > button::after {
        content:''; position:absolute; left:8px; right:8px; bottom:0; height:3px;
        background: var(--gold-bright); border-radius: 2px 2px 0 0;
      }
      .cm-topnav-dropdown {
        position: absolute; top: 100%; left: 0; min-width: 220px;
        background: #fff; border: 1px solid var(--border-soft); border-radius: 10px;
        box-shadow: var(--shadow-lg); padding: 6px; z-index: 50;
        display: none;
      }
      .cm-topnav-item:hover .cm-topnav-dropdown { display: block; }
      .cm-topnav-dropdown a {
        display: flex; align-items: center; gap: 10px;
        padding: 8px 12px; border-radius: 6px;
        color: var(--text); text-decoration: none; font-size: 13px;
      }
      .cm-topnav-dropdown a:hover { background: var(--bg-subtle); }
      .cm-topnav-dropdown a.active { background: var(--gold-soft); color: var(--gold); font-weight: 600; }
      @media (max-width: 1100px) {
        .cm-topnav-item > a, .cm-topnav-item > button { padding: 18px 8px; font-size: 13px; }
      }
      @media (max-width: 900px) {
        .cm-topnav-scroller { overflow-x: auto; }
        .cm-topnav-brand-sub { display: none; }
      }
    `}</style>
    <div style={{display:'flex', flexDirection:'column', minHeight:'100vh'}}>
      <div style={{position:'fixed',inset:0,pointerEvents:'none',zIndex:0,background:'radial-gradient(ellipse 60% 50% at 80% 10%, rgba(201,168,76,0.07) 0%, transparent 60%), radial-gradient(ellipse 50% 60% at 10% 80%, rgba(28,181,160,0.06) 0%, transparent 60%)'}}/>

      {/* TOP NAVIGATION — estilo RD Station CRM */}
      <header style={{position:'sticky',top:0,zIndex:30,background:'var(--sb-bg)',borderBottom:'1px solid var(--sb-border)',color:'var(--sb-text)'}}>
        <div className="cm-topnav-scroller" style={{display:'flex',alignItems:'center',height:56,padding:'0 18px',gap:6}} onClick={()=>{setShowNotif(false);setShowGear(false)}}>
          {/* Brand */}
          <Link href="/dashboard" prefetch={false} style={{display:'flex',alignItems:'center',gap:10,textDecoration:'none',color:'#fff',marginRight:18,flexShrink:0}}>
            {/* Logo: usa /logo-cm.svg ou /logo-cm.png se presente em public/, senão fallback dourado "CM" */}
            <img src="/logo-cm.svg" alt="CM SEGUROS" width={36} height={36}
              onError={(e)=>{ const t = e.currentTarget; if (!t.dataset.fallback) { t.dataset.fallback='1'; t.src='/logo-cm.png' } else { t.style.display='none'; (t.nextElementSibling as HTMLElement|null)!.style.display='flex' } }}
              style={{display:'block',borderRadius:8}} />
            <div style={{display:'none',width:36,height:36,borderRadius:8,background:'linear-gradient(135deg,var(--gold) 0%,var(--gold-light) 100%)',alignItems:'center',justifyContent:'center',color:'#11182a',fontFamily:'DM Serif Display,serif',fontSize:15,fontWeight:700}}>CM</div>
            <div style={{minWidth:0,lineHeight:1.1}}>
              <div style={{fontFamily:'DM Serif Display,serif',fontSize:15,color:'#fff',letterSpacing:0.5}}>CM SEGUROS</div>
            </div>
          </Link>

          {/* Menu groups */}
          <nav style={{display:'flex',alignItems:'center',flex:1,minWidth:0}}>
            {menuGroups.map(group => {
              const isActive = group.href
                ? (pathname === group.href || (group.href !== '/dashboard' && pathname.startsWith(group.href)))
                : (group.children || []).some(c => pathname === c.href || (c.href !== '/dashboard' && pathname.startsWith(c.href)))
              const b = badgeFor(group.badge)
              if (group.href && !group.children) {
                return (
                  <div key={group.label} className={'cm-topnav-item' + (isActive?' active':'')}>
                    <Link href={group.href} prefetch={false}>
                      {group.label}
                      {b && (
                        <span style={{background:b.danger?'var(--danger)':'var(--gold)',color:'#fff',fontSize:10,fontWeight:700,borderRadius:10,padding:'1px 6px',minWidth:18,textAlign:'center'}}>{b.count}</span>
                      )}
                    </Link>
                  </div>
                )
              }
              return (
                <div key={group.label} className={'cm-topnav-item' + (isActive?' active':'')}>
                  <button>
                    {group.label}
                    <span style={{fontSize:10,opacity:0.7}}>▾</span>
                  </button>
                  <div className="cm-topnav-dropdown">
                    {(group.children || []).map(c => {
                      const ca = pathname === c.href || (c.href !== '/dashboard' && pathname.startsWith(c.href))
                      const cb = badgeFor(c.badge)
                      return (
                        <Link key={c.href} href={c.href} prefetch={false} className={ca?'active':''}>
                          {c.icon && <span style={{width:18,textAlign:'center'}}>{c.icon}</span>}
                          <span style={{flex:1}}>{c.label}</span>
                          {cb && <span style={{background:cb.danger?'var(--danger)':'var(--gold)',color:'#fff',fontSize:10,fontWeight:700,borderRadius:10,padding:'1px 6px'}}>{cb.count}</span>}
                        </Link>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </nav>

          {/* Ações à direita */}
          <div style={{display:'flex',alignItems:'center',gap:8,flexShrink:0}}>
            <button title="Buscar (⌘K)" onClick={()=>{ try { window.dispatchEvent(new KeyboardEvent('keydown',{key:'k',metaKey:true,ctrlKey:true,bubbles:true})) } catch{} }}
              style={{background:'transparent',border:'none',color:'var(--sb-text)',cursor:'pointer',padding:8,borderRadius:8,fontSize:15}}>🔍</button>

            <div style={{position:'relative'}}>
              <button onClick={e=>{e.stopPropagation();setShowNotif(!showNotif)}}
                style={{background:'transparent',border:'none',color:'var(--sb-text)',cursor:'pointer',padding:8,borderRadius:8,fontSize:15,position:'relative'}} title="Notificações">
                🔔
                {totalNaoLidas > 0 && (
                  <span style={{position:'absolute',top:2,right:2,background:'var(--red)',color:'#fff',fontSize:9,fontWeight:700,borderRadius:10,padding:'1px 4px',minWidth:16,textAlign:'center',border:'2px solid var(--sb-bg)'}}>
                    {totalNaoLidas > 99 ? '99+' : totalNaoLidas}
                  </span>
                )}
              </button>

              {showNotif && (
                <div onClick={e=>e.stopPropagation()} style={{position:'absolute',top:'calc(100% + 8px)',right:0,width:380,background:'#ffffff',border:'1px solid var(--border-soft)',borderRadius:12,zIndex:100,boxShadow:'var(--shadow-lg)',overflow:'hidden',color:'var(--text)'}}>
                  <div style={{padding:'14px 18px',borderBottom:'1px solid var(--border-soft)',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                    <div style={{fontSize:14,fontWeight:600}}>🔔 Notificações</div>
                    {totalNaoLidas > 0 && (
                      <button onClick={marcarTodasLidas} style={{fontSize:12,background:'none',border:'none',color:'var(--teal)',cursor:'pointer',fontFamily:'Open Sans,sans-serif'}}>
                        Marcar todas lidas
                      </button>
                    )}
                  </div>
                  <div style={{maxHeight:420,overflow:'auto'}}>
                    {notificacoes.length === 0 ? (
                      <div style={{padding:28,textAlign:'center',color:'var(--text-muted)',fontSize:13}}>Nenhuma notificação</div>
                    ) : notificacoes.map(n=>(
                      <div key={n.id} onClick={()=>clicarNotificacao(n)}
                        style={{padding:'12px 18px',cursor:'pointer',borderBottom:'1px solid var(--border-soft)',background:n.lida?'transparent':'rgba(201,168,76,0.06)',display:'flex',gap:12,alignItems:'flex-start',transition:'background 0.15s'}}>
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

            <div style={{position:'relative'}}>
              <button onClick={e=>{e.stopPropagation();setShowGear(g=>!g);setShowNotif(false)}} title="Configurações"
                style={{background:'transparent',border:'none',color:'var(--sb-text)',cursor:'pointer',padding:8,borderRadius:8,fontSize:15}}>⚙️</button>
              {showGear && (
                <div onClick={e=>e.stopPropagation()} style={{position:'absolute',top:'calc(100% + 8px)',right:0,minWidth:240,background:'#fff',border:'1px solid var(--border-soft)',borderRadius:10,boxShadow:'var(--shadow-lg)',padding:6,zIndex:100,color:'var(--text)'}}>
                  {[
                    { label:'Funis de venda', href:'/dashboard/funis/configurar' },
                    { label:'Configurar campos', href:'/dashboard/configuracoes/campos' },
                    { label:'Convites, usuários e equipes', href:'/dashboard/usuarios' },
                    { label:'Todas as configurações', href:'/dashboard/configuracoes/hub' },
                  ].map(opt => (
                    <Link key={opt.href} href={opt.href} prefetch={false}
                      onClick={()=>setShowGear(false)}
                      style={{display:'block',padding:'8px 12px',borderRadius:6,fontSize:13,color:'var(--text)',textDecoration:'none'}}
                      onMouseEnter={e=>(e.currentTarget.style.background='var(--bg-subtle)')}
                      onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
                      {opt.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>

            <div onClick={()=>router.push('/dashboard/perfil')} title="Meu perfil"
              style={{display:'flex',alignItems:'center',gap:10,marginLeft:6,cursor:'pointer'}}>
              <Avatar nome={profile?.nome||user?.email} avatarUrl={profile?.avatar_url} role={profile?.role} size={32} />
              <div style={{lineHeight:1.15}}>
                <div style={{fontSize:13,fontWeight:600,color:'#fff'}}>{profile?.nome?.split(' ').slice(0,2).join(' ') || user?.email}</div>
                <div style={{fontSize:10,color:'var(--sb-text-dim)',textTransform:'uppercase',letterSpacing:0.8}}>{profile?.role || 'Corretor'}</div>
              </div>
            </div>
            <button onClick={logout} title="Sair"
              style={{background:'transparent',border:'none',color:'var(--sb-text-dim)',cursor:'pointer',padding:8,borderRadius:8,fontSize:14}}>🚪</button>
          </div>
        </div>
      </header>


      <main className="cm-main" style={{flex:1,minWidth:0,maxWidth:'100vw',display:'flex',flexDirection:'column',position:'relative',zIndex:1}} onClick={()=>{setShowNotif(false);setShowGear(false)}}>
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
