// Constantes e utilitários compartilhados da integração Meta (Graph API).
//
// Centralizar a versão evita o problema clássico de cada rota apontar pra uma
// versão diferente — quando a Meta deprecia uma versão, todos os endpoints
// começam a retornar OAuthException simultaneamente. Mude APENAS aqui.

import { createHmac, timingSafeEqual } from 'crypto'

export const META_API_VERSION = 'v25.0'
export const GRAPH = `https://graph.facebook.com/${META_API_VERSION}`
export const FB_OAUTH_DIALOG = `https://www.facebook.com/${META_API_VERSION}/dialog/oauth`

// Verifica a assinatura HMAC SHA-256 que a Meta envia no header
// X-Hub-Signature-256. Retorna true quando o app_secret confere; false caso
// contrário. Quando appSecret estiver vazio, devolve null (caller decide o
// que fazer — em produção deve recusar; em dev pode aceitar com warning).
export function verifyMetaSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string | null | undefined,
): boolean | null {
  if (!appSecret) return null
  if (!signatureHeader) return false
  const prefix = 'sha256='
  if (!signatureHeader.startsWith(prefix)) return false
  const provided = signatureHeader.slice(prefix.length).trim()
  const expected = createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex')
  if (provided.length !== expected.length) return false
  try {
    return timingSafeEqual(Buffer.from(provided, 'hex'), Buffer.from(expected, 'hex'))
  } catch {
    return false
  }
}
