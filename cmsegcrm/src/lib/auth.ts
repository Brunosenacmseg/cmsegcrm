import { createClient } from '@/lib/supabase/client'

export type UserRole = 'admin' | 'lider' | 'corretor'

export interface UserProfile {
  id: string
  nome: string
  email: string
  role: UserRole
}

let cachedProfile: UserProfile | null = null

export async function getUserProfile(): Promise<UserProfile | null> {
  if (cachedProfile) return cachedProfile
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase.from('users').select('*').eq('id', user.id).single()
  if (data) cachedProfile = data
  return data
}

export function clearProfileCache() { cachedProfile = null }

// Retorna IDs visíveis para o usuário atual
export async function getVisibleUserIds(): Promise<string[] | null> {
  const supabase = createClient()
  const profile = await getUserProfile()
  if (!profile) return null

  // Admin vê todos
  if (profile.role === 'admin') return null // null = sem filtro

  // Líder vê próprio + equipe
  if (profile.role === 'lider') {
    const { data: equipes } = await supabase
      .from('equipes').select('id').eq('lider_id', profile.id)
    if (!equipes?.length) return [profile.id]
    const equipeIds = equipes.map(e => e.id)
    const { data: membros } = await supabase
      .from('equipe_membros').select('user_id').in('equipe_id', equipeIds)
    const ids = [profile.id, ...(membros?.map(m => m.user_id) || [])]
    return [...new Set(ids)]
  }

  // Corretor vê só o próprio
  return [profile.id]
}
