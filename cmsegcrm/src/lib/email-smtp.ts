// Cliente SMTP minimalista para o módulo de Email.
//
// Suporta duas formas de envio (na ordem de tentativa):
//  1. nodemailer (se instalado) — entrega completa com STARTTLS, etc.
//  2. fallback HTTP via EMAIL_RELAY_URL — útil em ambientes serverless onde
//     SMTP outbound é bloqueado (ex.: Vercel free).
//
// Em ambos os casos a senha em claro só vive no servidor durante o envio.

export type SmtpConfig = {
  host: string
  port: number
  secure: boolean
  user: string
  pass: string
}

export type SendInput = {
  smtp: SmtpConfig
  from: { email: string; nome?: string }
  para: string                // separados por vírgula
  cc?: string
  bcc?: string
  assunto: string
  html?: string
  texto?: string
}

export type SendResult = { ok: true; messageId?: string } | { ok: false; erro: string }

export async function testarSmtp(smtp: SmtpConfig): Promise<SendResult> {
  try {
    const nm: any = await tryRequireNodemailer()
    if (nm) {
      const tx = nm.createTransport({
        host: smtp.host, port: smtp.port, secure: smtp.secure,
        auth: { user: smtp.user, pass: smtp.pass },
      })
      await tx.verify()
      return { ok: true }
    }
    const relay = process.env.EMAIL_RELAY_URL
    if (relay) {
      const r = await fetch(relay + '/verify', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ smtp }),
      })
      if (!r.ok) return { ok: false, erro: `relay ${r.status}` }
      return { ok: true }
    }
    return { ok: false, erro: 'nodemailer não instalado e EMAIL_RELAY_URL ausente' }
  } catch (e: any) {
    return { ok: false, erro: e?.message || String(e) }
  }
}

export async function enviarEmail(input: SendInput): Promise<SendResult> {
  try {
    const nm: any = await tryRequireNodemailer()
    const fromHeader = input.from.nome
      ? `"${input.from.nome.replace(/"/g, '\\"')}" <${input.from.email}>`
      : input.from.email
    if (nm) {
      const tx = nm.createTransport({
        host: input.smtp.host, port: input.smtp.port, secure: input.smtp.secure,
        auth: { user: input.smtp.user, pass: input.smtp.pass },
      })
      const info = await tx.sendMail({
        from: fromHeader,
        to: input.para,
        cc: input.cc || undefined,
        bcc: input.bcc || undefined,
        subject: input.assunto,
        html: input.html || undefined,
        text: input.texto || undefined,
      })
      return { ok: true, messageId: info?.messageId }
    }
    const relay = process.env.EMAIL_RELAY_URL
    if (relay) {
      const r = await fetch(relay + '/send', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ smtp: input.smtp, from: fromHeader, ...input }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) return { ok: false, erro: j?.erro || `relay ${r.status}` }
      return { ok: true, messageId: j?.messageId }
    }
    return { ok: false, erro: 'nodemailer não instalado e EMAIL_RELAY_URL ausente' }
  } catch (e: any) {
    return { ok: false, erro: e?.message || String(e) }
  }
}

async function tryRequireNodemailer(): Promise<any | null> {
  try {
    // require dinâmico: evita falha em build se a dependência ainda não foi instalada.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('nodemailer')
    return mod?.default || mod
  } catch {
    return null
  }
}
