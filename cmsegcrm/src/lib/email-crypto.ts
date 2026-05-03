// AES-256-GCM para criptografar a senha SMTP no servidor.
// A chave vem de EMAIL_ENC_KEY (env). Pode ser:
//   - 64 hex chars  → 32 bytes
//   - qualquer string → derivada via SHA-256.
// O ciphertext é "v1:<iv_b64>:<tag_b64>:<data_b64>".
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto'

function getKey(): Buffer {
  const raw = process.env.EMAIL_ENC_KEY
  if (!raw) throw new Error('EMAIL_ENC_KEY não configurada')
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, 'hex')
  return createHash('sha256').update(raw).digest()
}

export function encryptSecret(plain: string): string {
  const key = getKey()
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${data.toString('base64')}`
}

export function decryptSecret(payload: string): string {
  const key = getKey()
  const parts = payload.split(':')
  if (parts.length !== 4 || parts[0] !== 'v1') throw new Error('ciphertext inválido')
  const iv  = Buffer.from(parts[1], 'base64')
  const tag = Buffer.from(parts[2], 'base64')
  const data = Buffer.from(parts[3], 'base64')
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
}
