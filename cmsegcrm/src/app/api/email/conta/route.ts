// GET    /api/email/conta  → retorna a conta do usuário (sem a senha)
// POST   /api/email/conta  → cria/atualiza a conta (recebe senha em claro,
//                            grava ciphertext)
// DELETE /api/email/conta  → remove a conta
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { encryptSecret } from '@/lib/email-crypto'

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

async function getUser(req: NextRequest) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return null
  const { data } = await admin.auth.getUser(token)
  return data?.user || null
}

const PUBLIC_FIELDS =
  'id,user_id,from_email,from_nome,assinatura,smtp_host,smtp_port,smtp_secure,smtp_user,' +
  'imap_host,imap_port,imap_secure,imap_user,ativo,ultimo_teste_em,ultimo_teste_ok,ultimo_teste_msg,atualizado_em'

export async function GET(req: NextRequest) {
  const user = await getUser(req)
  if (!user) return NextResponse.json({ erro: 'não autenticado' }, { status: 401 })
  const { data, error } = await admin
    .from('email_contas').select(PUBLIC_FIELDS).eq('user_id', user.id).maybeSingle()
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 })
  return NextResponse.json({ conta: data })
}

export async function POST(req: NextRequest) {
  const user = await getUser(req)
  if (!user) return NextResponse.json({ erro: 'não autenticado' }, { status: 401 })
  const body = await req.json().catch(() => ({}))

  const required = ['from_email', 'smtp_host', 'smtp_user']
  for (const k of required) {
    if (!body[k]) return NextResponse.json({ erro: `campo "${k}" obrigatório` }, { status: 400 })
  }

  const payload: any = {
    user_id: user.id,
    from_email:  String(body.from_email).trim(),
    from_nome:   body.from_nome   || null,
    assinatura:  body.assinatura  || null,
    smtp_host:   String(body.smtp_host).trim(),
    smtp_port:   Number(body.smtp_port) || 587,
    smtp_secure: !!body.smtp_secure,
    smtp_user:   String(body.smtp_user).trim(),
    imap_host:   body.imap_host   || null,
    imap_port:   body.imap_port ? Number(body.imap_port) : null,
    imap_secure: body.imap_secure !== false,
    imap_user:   body.imap_user   || null,
    ativo:       body.ativo !== false,
  }

  // Senha só é regravada quando o cliente envia uma nova (não em claro retornada).
  if (body.smtp_pass && String(body.smtp_pass).length > 0) {
    try {
      payload.smtp_pass_enc = encryptSecret(String(body.smtp_pass))
    } catch (e: any) {
      return NextResponse.json({ erro: e?.message || 'falha ao encriptar' }, { status: 500 })
    }
  }

  const { data: existente } = await admin
    .from('email_contas').select('id').eq('user_id', user.id).maybeSingle()

  let res
  if (existente) {
    res = await admin.from('email_contas')
      .update(payload).eq('user_id', user.id).select(PUBLIC_FIELDS).single()
  } else {
    if (!payload.smtp_pass_enc) {
      return NextResponse.json({ erro: 'senha SMTP obrigatória' }, { status: 400 })
    }
    res = await admin.from('email_contas')
      .insert(payload).select(PUBLIC_FIELDS).single()
  }
  if (res.error) return NextResponse.json({ erro: res.error.message }, { status: 500 })
  return NextResponse.json({ conta: res.data })
}

export async function DELETE(req: NextRequest) {
  const user = await getUser(req)
  if (!user) return NextResponse.json({ erro: 'não autenticado' }, { status: 401 })
  const { error } = await admin.from('email_contas').delete().eq('user_id', user.id)
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
