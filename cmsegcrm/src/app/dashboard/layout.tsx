'use client'
import { useState, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import ChatIA from '@/components/ChatIA'
import MetaPixel from '@/components/MetaPixel'
import Avatar from '@/components/Avatar'
import { registrarLog } from '@/lib/logs'

const NAV: Array<{ href: string; icon: string; label: string; section?: string; badge?: string; adminOnly?: boolean; equipePosVenda?: boolean }> = [
  { href:'/dashboard',              icon:'📈', label:'Dashboard' },
  { href:'/dashboard/funis',        icon:'🏗', label:'Funis' },
  { href:'/dashboard/cotacoes',     icon:'🔍', label:'Cotações', adminOnly:true },
  { href:'/dashboard/telefone',     icon:'📞', label:'Telefone' },
  { href:'/dashboard/whatsapp',     icon:'💬', label:'WhatsApp' },
  { href:'/dashboard/mensagens',    icon:'✉️', label:'Mensagens', badge:'mensagens' },
  { href:'/dashboard/mural',        icon:'📣', label:'Mural' },
  { href:'/dashboard/clientes',     icon:'👥', label:'Clientes' },
  { href:'/dashboard/apolices',     icon:'📋', label:'Apólices' },
  { href:'/dashboard/tarefas',      icon:'✅', label:'Tarefas', badge:'tarefas' },
  { href:'/dashboard/metas',        icon:'🎯', label:'Metas' },
  { href:'/dashboard/renovacoes',   icon:'🔄', label:'Renovações' },
  { href:'/dashboard/relatorios',   icon:'📊', label:'Relatórios' },
  { href:'/dashboard/autentique',   icon:'✍️', label:'Autentique', equipePosVenda:true },
  { href:'/dashboard/comissoes',    icon:'💰', label:'Comissões', section:'Financeiro' },
  { href:'/dashboard/financeiro',   icon:'💼', label:'Financeiro / DRE', adminOnly:true },
  { href:'/dashboard/contas-pagar', icon:'💳', label:'Contas a Pagar', adminOnly:true },
  { href:'/dashboard/campanhas',    icon:'📣', label:'Campanhas Meta', section:'Marketing', adminOnly:true },
  { href:'/dashboard/porto',        icon:'🏢', label:'Porto Seguro', section:'Integrações', adminOnly:true },
  { href:'/dashboard/integracoes/allianz', icon:'🛡️', label:'Allianz', section:'Integrações', adminOnly:true },
  { href:'/dashboard/rdstation',    icon:'🔁', label:'RD Station CRM', adminOnly:true },
  { href:'/dashboard/integracoes/meta', icon:'🔗', label:'Conectar Meta', adminOnly:true },
  { href:'/dashboard/agentes-ia',   icon:'🤖', label:'Agentes de IA', adminOnly:true },
  { href:'/dashboard/automacoes',   icon:'⚡', label:'Automações', adminOnly:true },
  { href:'/dashboard/manuais',      icon:'📚', label:'Manuais & Processos', section:'Empresa' },
  { href:'/dashboard/rh',           icon:'🧑‍💼', label:'RH', section:'Empresa' },
  { href:'/dashboard/importar',     icon:'📥', label:'Importar Dados', section:'Config', adminOnly:true },
  { href:'/dashboard/perfil',       icon:'👤', label:'Meu Perfil', section:'Config' },
  { href:'/dashboard/usuarios',     icon:'👥', label:'Usuários', section:'Config', adminOnly:true },
  { href:'/dashboard/logs',         icon:'📜', label:'Log do Sistema', section:'Config', adminOnly:true },
  { href:'/dashboard/configuracoes',icon:'⚙️', label:'Configurações', section:'Config', adminOnly:true },
]

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router   = useRouter()
  const pathname = usePathname()
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
    supabase.auth.getSession().then(({ data: { session } }) => {
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
    }, 15000)
    return () => clearInterval(interval)
  }, [user])

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
    const rotaPosVenda = NAV.find(item => item.equipePosVenda && (pathname === item.href || pathname.startsWith(item.href + '/')))
    if (rotaPosVenda && !isAdminUser && !ehPosVenda) {
      router.replace('/dashboard')
    }
  }, [profile, ehPosVenda, pathname, router])

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
    setEhPosVenda(nomes.some(n => n === 'EQUIPE PÓS VENDA' || n === 'EQUIPE POS VENDA'))
  }

  async function carregarBadges(userId: string) {
    const [{ count: msg }, { count: tarefas }] = await Promise.all([
      supabase.from('mensagens_internas').select('*', { count:'exact', head:true }).eq('para_user_id', userId).eq('lida', false),
      supabase.from('tarefas').select('*', { count:'exact', head:true }).eq('responsavel_id', userId).eq('status', 'pendente'),
    ])
    setBadges({ mensagens: msg||0, tarefas: tarefas||0 })
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
    // Financeiro / DRE: agora é adminOnly (já filtrado acima); o flag
    // temAcessoFin permanece como no-op para compat.
    if (item.href === '/dashboard/financeiro' && !temAcessoFin) return false
    return true
  })

  return (
    <div style={{display:'flex', minHeight:'100vh', overflow:'hidden'}}>
      <div style={{position:'fixed',inset:0,pointerEvents:'none',zIndex:0,background:'radial-gradient(ellipse 60% 50% at 80% 10%, rgba(201,168,76,0.07) 0%, transparent 60%), radial-gradient(ellipse 50% 60% at 10% 80%, rgba(28,181,160,0.06) 0%, transparent 60%)'}}/>

      <aside style={{width:'var(--sidebar-w)',background:'var(--bg-soft)',borderRight:'1px solid var(--border)',display:'flex',flexDirection:'column',position:'fixed',top:0,left:0,bottom:0,zIndex:10}}>
        <div style={{padding:'26px 22px 20px',borderBottom:'1px solid var(--border)'}}>
          <div style={{fontFamily:'DM Serif Display,serif',fontSize:20,color:'var(--gold)'}}>CM Seguros</div>
          <div style={{fontSize:10,color:'var(--text-muted)',letterSpacing:1,textTransform:'uppercase',marginTop:2,lineHeight:1.4,fontWeight:700}}>Transformando vidas através do seguro</div>
        </div>

        <nav style={{flex:1,padding:'14px 0',overflowY:'auto'}}>
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
                  <Link href={item.href} prefetch={false}
                    style={{display:'flex',alignItems:'center',gap:10,padding:'8px 22px',cursor:'pointer',fontSize:13,color:active?'var(--gold)':'var(--text-muted)',background:active?'var(--gold-soft)':'transparent',borderLeft:active?'3px solid var(--gold)':'3px solid transparent',fontWeight:active?600:400,transition:'all 0.18s',textDecoration:'none'}}
                    onMouseEnter={e => { if (!active) (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text)' }}
                    onMouseLeave={e => { if (!active) (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-muted)' }}>
                    <span style={{fontSize:15,width:20,textAlign:'center'}}>{item.icon}</span>
                    {item.label}
                    {badgeCount > 0 && (
                      <span style={{marginLeft:'auto',background:'var(--danger)',color:'#fff',fontSize:10,fontWeight:700,borderRadius:10,padding:'1px 6px',minWidth:18,textAlign:'center'}}>
                        {badgeCount}
                      </span>
                    )}
                  </Link>
                )}
              </div>
            )
          })}
        </nav>

        {/* Rodapé com avatar clicável */}
        <div style={{padding:'16px 22px',borderTop:'1px solid var(--border)',display:'flex',alignItems:'center',gap:10}}>
          <div onClick={()=>router.push('/dashboard/perfil')} title="Meu perfil"
            style={{cursor:'pointer',border:'2px solid var(--gold)',borderRadius:'50%',flexShrink:0}}>
            <Avatar nome={profile?.nome||user?.email} avatarUrl={profile?.avatar_url} role={profile?.role} size={34} />
          </div>
          <div style={{flex:1,minWidth:0,cursor:'pointer'}} onClick={()=>router.push('/dashboard/perfil')}>
            <div style={{fontSize:13,fontWeight:500,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{profile?.nome||user?.email}</div>
            <div style={{fontSize:11,color:'var(--text-muted)'}}>{profile?.role||'Corretor'}</div>
          </div>
          <span onClick={logout} style={{fontSize:16,cursor:'pointer',color:'var(--text-muted)'}} title="Sair">🚪</span>
        </div>
      </aside>

      <main style={{marginLeft:'var(--sidebar-w)',flex:1,minWidth:0,maxWidth:'calc(100vw - var(--sidebar-w))',display:'flex',flexDirection:'column',position:'relative',zIndex:1,overflow:'hidden'}} onClick={()=>setShowNotif(false)}>
        {/* Header com sino */}
        <div style={{height:48,borderBottom:'1px solid var(--border-soft)',display:'flex',alignItems:'center',justifyContent:'center',padding:'0 24px',background:'#ffffff',position:'sticky',top:0,zIndex:20,flexShrink:0,gap:16}}>
          <div style={{flex:1}}/>

          <div style={{position:'relative'}}>
            <button onClick={e=>{e.stopPropagation();setShowNotif(!showNotif)}}
              style={{background:'#ffffff',border:'1px solid var(--border-strong)',borderRadius:10,padding:'7px 16px',cursor:'pointer',display:'flex',alignItems:'center',gap:8,color:'var(--text)',fontFamily:'DM Sans,sans-serif',fontSize:13}}>
              <span style={{fontSize:16}}>🔔</span>
              <span style={{fontSize:12,color:'var(--text-muted)'}}>Notificações</span>
              {totalNaoLidas > 0 && (
                <span style={{background:'var(--red)',color:'#fff',fontSize:10,fontWeight:700,borderRadius:10,padding:'1px 7px',minWidth:18,textAlign:'center'}}>
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

          <div style={{flex:1,display:'flex',justifyContent:'flex-end',alignItems:'center',gap:8}}>
            <span style={{fontSize:12,color:'var(--text-muted)',cursor:'pointer'}} onClick={()=>router.push('/dashboard/perfil')}>
              {profile?.nome?.split(' ')[0] || user?.email}
            </span>
            <Avatar nome={profile?.nome||user?.email} avatarUrl={profile?.avatar_url} role={profile?.role} size={28} />
          </div>
        </div>

        {children}
      </main>

      <ChatIA />
      <MetaPixel />
    </div>
  )
}
