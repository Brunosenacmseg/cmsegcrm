import { createClient } from '@/lib/supabase/client'

export type UserRole = 'admin' | 'lider' | 'corretor' | 'financeiro'

export interface UserProfile {
  id: string
  nome: string
  email: string
  role: UserRole
}

// Cache por id de usuário (em vez de cache global single-slot): evita que
// um perfil "vaze" para outra requisição quando esta lib é carregada em
// runtime compartilhado (Server Components, edge). Best-effort para
// reduzir round-trips no client; sempre re-consulta se id muda.
const profileById = new Map<string, UserProfile>()

export async function getUserProfile(): Promise<UserProfile | null> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const cached = profileById.get(user.id)
  if (cached) return cached
  const { data } = await supabase.from('users').select('*').eq('id', user.id).single()
  if (data) profileById.set(user.id, data as UserProfile)
  return (data as UserProfile) || null
}

export function clearProfileCache() { profileById.clear() }

// Retorna IDs visíveis para o usuário atual
export async function getVisibleUserIds(): Promise<string[] | null> {
  const supabase = createClient()
  const profile = await getUserProfile()
  if (!profile) return null

  // Admin e Financeiro veem todos
  if (profile.role === 'admin' || profile.role === 'financeiro') return null // null = sem filtro

  // Equipe GESTÃO tem acesso total a funis e negociações,
  // independente de vendedor.
  if (await isMemberOfGestao(profile.id)) return null

  // Líder vê próprio + equipe
  if (profile.role === 'lider') {
    const { data: equipes } = await supabase
      .from('equipes').select('id').eq('lider_id', profile.id)
    if (!equipes?.length) return [profile.id]
    const equipeIds = equipes.map((e: any) => e.id)
    const { data: membros } = await supabase
      .from('equipe_membros').select('user_id').in('equipe_id', equipeIds)
    const ids = [profile.id, ...(membros?.map((m: any) => m.user_id) || [])]
    return [...new Set(ids)]
  }

  // Corretor vê só o próprio
  return [profile.id]
}

async function isMemberOfGestao(userId: string): Promise<boolean> {
  const supabase = createClient()
  const norm = (s: string) =>
    (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
  const isGestao = (n?: string | null) => {
    const v = norm(n || '')
    return v === 'gestao' || v === 'equipe gestao'
  }

  const [{ data: membros }, { data: lideradas }] = await Promise.all([
    supabase.from('equipe_membros').select('equipes!inner(nome)').eq('user_id', userId),
    supabase.from('equipes').select('nome').eq('lider_id', userId),
  ])

  if ((membros || []).some((m: any) => isGestao(m.equipes?.nome))) return true
  if ((lideradas || []).some((e: any) => isGestao(e.nome))) return true
  return false
}
