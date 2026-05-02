import { createClient } from '@/lib/supabase/client'

export type SystemLogInput = {
  acao: string
  recurso?: string
  recurso_id?: string | number
  detalhe?: string
  metadata?: Record<string, any>
  pathname?: string
}

// Registra um evento de auditoria no CRM. Falha de log nunca deve
// quebrar a UX do usuário, então sempre engolimos qualquer erro.
export async function registrarLog(input: SystemLogInput): Promise<void> {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    let user_nome: string | null = null
    try {
      const { data } = await supabase.from('users').select('nome').eq('id', user.id).single()
      user_nome = data?.nome ?? null
    } catch {}

    await supabase.from('system_logs').insert({
      user_id: user.id,
      user_email: user.email ?? null,
      user_nome,
      acao: input.acao,
      recurso: input.recurso ?? null,
      recurso_id: input.recurso_id != null ? String(input.recurso_id) : null,
      detalhe: input.detalhe ?? null,
      metadata: input.metadata ?? null,
      pathname: input.pathname ?? (typeof window !== 'undefined' ? window.location.pathname : null),
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
    })
  } catch {
    /* silencioso: log não pode quebrar a aplicação */
  }
}
