'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useDebounce } from '@/lib/use-debounce'

// Command Palette estilo Cmd+K do Notion/Linear.
// Atalho: Cmd/Ctrl+K para abrir, Esc fecha, ↑/↓ navega, Enter executa.
//
// Resultados: navegação fixa (todas as rotas) + busca dinâmica em
// clientes (nome/email/cpf) e negócios (titulo/produto). Limita a 8 de
// cada para responsividade.

interface Cmd {
  id: string
  group: 'Navegação' | 'Clientes' | 'Negócios' | 'Ações'
  label: string
  hint?: string
  icon: string
  perform: () => void
}

const ROTAS: Array<{ label: string; href: string; icon: string; admin?: boolean }> = [
  { label: 'Dashboard',      href: '/dashboard',           icon: '📈' },
  { label: 'Funis (Kanban)', href: '/dashboard/funis',     icon: '🏗' },
  { label: 'Clientes',       href: '/dashboard/clientes',  icon: '👥' },
  { label: 'Tarefas',        href: '/dashboard/tarefas',   icon: '✅' },
  { label: 'Apólices',       href: '/dashboard/apolices',  icon: '📋' },
  { label: 'Propostas',      href: '/dashboard/propostas', icon: '📝' },
  { label: 'Renovações',     href: '/dashboard/renovacoes',icon: '🔄' },
  { label: 'WhatsApp',       href: '/dashboard/whatsapp',  icon: '💬' },
  { label: 'Email',          href: '/dashboard/email',     icon: '📧' },
  { label: 'Mensagens',      href: '/dashboard/mensagens', icon: '✉️' },
  { label: 'Mural',          href: '/dashboard/mural',     icon: '📣' },
  { label: 'Telefone',       href: '/dashboard/telefone',  icon: '📞' },
  { label: 'Comissões',      href: '/dashboard/comissoes', icon: '💰' },
  { label: 'Metas',          href: '/dashboard/metas',     icon: '🎯' },
  { label: 'Relatórios',     href: '/dashboard/relatorios',icon: '📊' },
  { label: 'Manuais',        href: '/dashboard/manuais',   icon: '📚' },
  { label: 'Mural de Melhorias', href: '/dashboard/melhorias', icon: '💡' },
  { label: 'Perfil',         href: '/dashboard/perfil',    icon: '👤' },
  { label: 'Financeiro',     href: '/dashboard/financeiro',icon: '💼', admin: true },
  { label: 'Contas a Pagar', href: '/dashboard/contas-pagar', icon: '💳', admin: true },
  { label: 'Usuários',       href: '/dashboard/usuarios',  icon: '👥', admin: true },
  { label: 'Configurações',  href: '/dashboard/configuracoes', icon: '⚙️', admin: true },
  { label: 'Logs do Sistema',href: '/dashboard/logs',      icon: '📜', admin: true },
  { label: 'Importar Dados', href: '/dashboard/importar',  icon: '📥', admin: true },
  { label: 'Automações',     href: '/dashboard/automacoes',icon: '⚡', admin: true },
  { label: 'Agentes IA',     href: '/dashboard/agentes-ia',icon: '🤖', admin: true },
]

export default function CommandPalette() {
  const router = useRouter()
  const supabase = createClient()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const [role, setRole] = useState<string | null>(null)
  const [clientesHits, setClientesHits] = useState<any[]>([])
  const [negociosHits, setNegociosHits] = useState<any[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const qDeb = useDebounce(q, 200)

  // Hot key Cmd/Ctrl+K
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(o => !o)
      } else if (e.key === 'Escape' && open) {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  // Carrega role do usuário (admin only sees admin routes)
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }: any) => {
      if (!user) return
      const { data } = await supabase.from('users').select('role').eq('id', user.id).single() as any
      setRole(data?.role || null)
    })
  }, [])

  // Foca o input ao abrir, reset state
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 30)
      setActive(0)
    } else {
      setQ('')
      setClientesHits([])
      setNegociosHits([])
    }
  }, [open])

  // Busca dinâmica: clientes + negócios
  useEffect(() => {
    if (!open) return
    const term = qDeb.trim()
    if (term.length < 2) { setClientesHits([]); setNegociosHits([]); return }
    let cancelled = false
    const tNorm = term.replace(/[%]/g, '')
    Promise.all([
      supabase.from('clientes')
        .select('id, nome, email, cpf_cnpj, telefone')
        .or(`nome.ilike.%${tNorm}%,email.ilike.%${tNorm}%,cpf_cnpj.ilike.%${tNorm}%`)
        .limit(6),
      supabase.from('negocios')
        .select('id, titulo, produto, etapa, clientes(nome)')
        .or(`titulo.ilike.%${tNorm}%,produto.ilike.%${tNorm}%`)
        .limit(6),
    ]).then(([cli, neg]: any[]) => {
      if (cancelled) return
      setClientesHits(cli?.data || [])
      setNegociosHits(neg?.data || [])
    })
    return () => { cancelled = true }
  }, [qDeb, open])

  const cmds = useMemo<Cmd[]>(() => {
    const list: Cmd[] = []
    const isAdmin = role === 'admin'
    const lc = q.trim().toLowerCase()
    // Navegação
    for (const r of ROTAS) {
      if (r.admin && !isAdmin) continue
      if (lc && !r.label.toLowerCase().includes(lc)) continue
      list.push({ id: 'nav-' + r.href, group: 'Navegação', label: r.label, icon: r.icon, perform: () => router.push(r.href) })
    }
    // Ações rápidas
    const acoes: Array<{ label: string; icon: string; perform: () => void; lc: string }> = [
      { label: 'Novo negócio',  icon: '➕', perform: () => router.push('/dashboard/funis?novo=1'),    lc: 'novo negocio negócio criar deal' },
      { label: 'Nova tarefa',   icon: '✅', perform: () => router.push('/dashboard/tarefas?novo=1'),  lc: 'nova tarefa task' },
      { label: 'Novo cliente',  icon: '👤', perform: () => router.push('/dashboard/clientes?novo=1'), lc: 'novo cliente' },
    ]
    for (const a of acoes) {
      if (lc && !a.lc.includes(lc) && !a.label.toLowerCase().includes(lc)) continue
      list.push({ id: 'acao-' + a.label, group: 'Ações', label: a.label, icon: a.icon, perform: a.perform })
    }
    // Clientes
    for (const c of clientesHits) {
      const tail = [c.cpf_cnpj, c.email, c.telefone].filter(Boolean).join(' · ')
      list.push({ id: 'cli-' + c.id, group: 'Clientes', label: c.nome || '(sem nome)', hint: tail, icon: '👤', perform: () => router.push('/dashboard/clientes/' + c.id) })
    }
    // Negócios
    for (const n of negociosHits) {
      const cli = (n.clientes as any)?.nome
      const tail = [n.produto, n.etapa, cli].filter(Boolean).join(' · ')
      list.push({ id: 'neg-' + n.id, group: 'Negócios', label: n.titulo || '(sem título)', hint: tail, icon: '🏗', perform: () => router.push('/dashboard/funis?card=' + n.id) })
    }
    return list
  }, [q, role, clientesHits, negociosHits, router])

  function executar(idx: number) {
    const c = cmds[idx]
    if (!c) return
    setOpen(false)
    setTimeout(c.perform, 0)
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, cmds.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); executar(active) }
  }

  if (!open) return null

  // Agrupa para exibir com headers
  let lastGroup = ''
  return (
    <div
      onClick={() => setOpen(false)}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 10001, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '12vh' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(640px, 95vw)', background: '#0a1628', border: '1px solid var(--border)',
          borderRadius: 14, boxShadow: '0 20px 60px rgba(0,0,0,0.6)', overflow: 'hidden', color: '#f5f5f7',
        }}
      >
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ fontSize: 18 }}>🔍</span>
          <input
            ref={inputRef}
            value={q}
            onChange={e => { setQ(e.target.value); setActive(0) }}
            onKeyDown={onKeyDown}
            placeholder="Buscar páginas, clientes, negócios... (Ctrl+K)"
            style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: '#f5f5f7', fontSize: 14, fontFamily: 'inherit' }}
          />
          <kbd style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)' }}>ESC</kbd>
        </div>
        <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
          {cmds.length === 0 && (
            <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              {q.trim().length < 2 ? 'Digite ao menos 2 caracteres para buscar clientes/negócios' : 'Nenhum resultado'}
            </div>
          )}
          {cmds.map((c, i) => {
            const showGroup = c.group !== lastGroup
            lastGroup = c.group
            const activeRow = i === active
            return (
              <div key={c.id}>
                {showGroup && (
                  <div style={{ padding: '10px 18px 4px', fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700 }}>
                    {c.group}
                  </div>
                )}
                <div
                  onMouseEnter={() => setActive(i)}
                  onClick={() => executar(i)}
                  style={{
                    padding: '8px 18px', display: 'flex', alignItems: 'center', gap: 12,
                    background: activeRow ? 'rgba(201,168,76,0.10)' : 'transparent',
                    cursor: 'pointer',
                    borderLeft: activeRow ? '3px solid var(--gold)' : '3px solid transparent',
                  }}
                >
                  <span style={{ fontSize: 16 }}>{c.icon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{c.label}</div>
                    {c.hint && <div style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.hint}</div>}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
        <div style={{ padding: '8px 18px', borderTop: '1px solid var(--border)', fontSize: 10, color: 'var(--text-muted)', display: 'flex', gap: 14, justifyContent: 'flex-end' }}>
          <span><kbd style={kbdStyle}>↑</kbd><kbd style={kbdStyle}>↓</kbd> navegar</span>
          <span><kbd style={kbdStyle}>↵</kbd> abrir</span>
          <span><kbd style={kbdStyle}>esc</kbd> fechar</span>
        </div>
      </div>
    </div>
  )
}

const kbdStyle: React.CSSProperties = { padding: '1px 5px', borderRadius: 3, background: 'rgba(255,255,255,0.06)', marginRight: 3, fontSize: 9 }
