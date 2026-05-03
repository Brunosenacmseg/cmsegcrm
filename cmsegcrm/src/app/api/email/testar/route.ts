// POST /api/email/testar
// Testa a conexão SMTP da conta do usuário. Atualiza o último resultado
// na tabela email_contas. Aceita opcionalmente smtp_pass no body para testar
// uma senha NOVA antes de salvar.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { decryptSecret } from '@/lib/email-crypto'
import { testarSmtp } from '@/lib/email-smtp'

export const dynamic = 'force-dynamic'

// lazy-init: evita que o build do Next falhe quando env vars
// não estão disponíveis na fase 'Collecting page data'.
const admin = new Proxy({} as ReturnType<typeof createClient>, {
  get(_t, prop) {
    const g = globalThis as any
    if (!g['__sa_admin']) g['__sa_admin'] = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    return (g['__sa_admin'] as any)[prop]
  }
})

export async function POST(req: NextRequest) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return NextResponse.json({ erro: 'não autenticado' }, { status: 401 })
  const { data: u } = await admin.auth.getUser(token)
  if (!u?.user) return NextResponse.json({ erro: 'sessão inválida' }, { status: 401 })

  const body = await req.json().catch(() => ({} as any))
  const { data: conta } = await admin
    .from('email_contas').select('*').eq('user_id', u.user.id).maybeSingle()
  if (!conta) return NextResponse.json({ erro: 'conta não configurada' }, { status: 404 })

  let pass: string
  try {
    pass = body?.smtp_pass ? String(body.smtp_pass) : decryptSecret(conta.smtp_pass_enc)
  } catch (e: any) {
    return NextResponse.json({ erro: e?.message || 'falha ao ler senha' }, { status: 500 })
  }

  const r = await testarSmtp({
    host: conta.smtp_host,
    port: conta.smtp_port,
    secure: conta.smtp_secure,
    user: conta.smtp_user,
    pass,
  })

  await admin.from('email_contas').update({
    ultimo_teste_em: new Date().toISOString(),
    ultimo_teste_ok: r.ok,
    ultimo_teste_msg: r.ok ? 'OK' : r.erro,
  }).eq('user_id', u.user.id)

  return NextResponse.json(r, { status: r.ok ? 200 : 400 })
}
