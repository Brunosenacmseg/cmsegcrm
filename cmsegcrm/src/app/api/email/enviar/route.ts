// POST /api/email/enviar
// Envia um email usando a conta SMTP do usuário autenticado. Registra em
// emails_enviados (status enviado/erro). Body:
//  { para, cc?, bcc?, assunto, html?, texto?,
//    cliente_id?, negocio_id?, apolice_id?, template_id? }
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { decryptSecret } from '@/lib/email-crypto'
import { enviarEmail } from '@/lib/email-smtp'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

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
  const userId = u.user.id

  const body = await req.json().catch(() => ({} as any))
  const para = String(body?.para || '').trim()
  const assunto = String(body?.assunto || '').trim()
  if (!para)    return NextResponse.json({ erro: 'destinatário (para) obrigatório' }, { status: 400 })
  if (!assunto) return NextResponse.json({ erro: 'assunto obrigatório' }, { status: 400 })
  if (!body?.html && !body?.texto) {
    return NextResponse.json({ erro: 'corpo do email obrigatório' }, { status: 400 })
  }

  const { data: conta } = await admin
    .from('email_contas').select('*').eq('user_id', userId).eq('ativo', true).maybeSingle()
  if (!conta) return NextResponse.json({ erro: 'conta de email não configurada' }, { status: 404 })

  // Cria registro pendente cedo — ajuda diagnóstico em automações.
  const { data: log } = await admin.from('emails_enviados').insert({
    user_id: userId,
    conta_id: conta.id,
    para, cc: body.cc || null, bcc: body.bcc || null,
    assunto,
    corpo_html:  body.html  || null,
    corpo_texto: body.texto || null,
    cliente_id:  body.cliente_id  || null,
    negocio_id:  body.negocio_id  || null,
    apolice_id:  body.apolice_id  || null,
    template_id: body.template_id || null,
    status: 'pendente',
  }).select('id').single()

  let pass: string
  try { pass = decryptSecret(conta.smtp_pass_enc) }
  catch (e: any) {
    if (log) await admin.from('emails_enviados').update({ status: 'erro', erro: e?.message }).eq('id', log.id)
    return NextResponse.json({ erro: e?.message || 'falha ao ler senha' }, { status: 500 })
  }

  const r = await enviarEmail({
    smtp: { host: conta.smtp_host, port: conta.smtp_port, secure: conta.smtp_secure, user: conta.smtp_user, pass },
    from: { email: conta.from_email, nome: conta.from_nome || undefined },
    para, cc: body.cc, bcc: body.bcc,
    assunto, html: body.html, texto: body.texto,
  })

  if (log) {
    await admin.from('emails_enviados').update(
      r.ok
        ? { status: 'enviado', message_id: r.messageId || null, enviado_em: new Date().toISOString() }
        : { status: 'erro', erro: r.erro }
    ).eq('id', log.id)
  }

  if (!r.ok) return NextResponse.json({ erro: r.erro }, { status: 502 })
  return NextResponse.json({ ok: true, id: log?.id, messageId: r.messageId })
}
