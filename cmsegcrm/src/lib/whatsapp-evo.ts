// Helpers para falar com a Evolution API direto do servidor.
// Extraído de /api/whatsapp/webhook pra ser reutilizado pelo cron SDR.

interface EvoConfig {
  evo_url: string
  api_key: string
  instance: string
}

function urlBase(cfg: EvoConfig): string {
  return cfg.evo_url.replace(/\/$/, '')
}

// Envia mensagem de texto. Não lança em caso de erro de rede — apenas
// loga e retorna false. Quem chama decide o que fazer.
export async function enviarTextoEvo(cfg: EvoConfig, jid: string, texto: string): Promise<boolean> {
  const r = await enviarTextoEvoDetalhado(cfg, jid, texto)
  return r.ok
}

// Versão detalhada: devolve status + body trimmed do response. Usada
// quando quem chama precisa gravar o motivo concreto da falha.
export async function enviarTextoEvoDetalhado(cfg: EvoConfig, jid: string, texto: string): Promise<{ ok: boolean; status?: number; body?: string; erro?: string }> {
  try {
    // Evolution rejeita o JID completo no campo `number` em algumas
    // versões — manda só os dígitos (DDI+DDD+número).
    const numero = String(jid || '').split('@')[0].replace(/\D/g, '')
    const res = await fetch(`${urlBase(cfg)}/message/sendText/${cfg.instance}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': cfg.api_key },
      // Envia em ambos os formatos: `text` (Evolution v2) e
      // `textMessage.text` (Evolution v1). Servidores aceitam um e ignoram
      // o outro — evita 400 "instance requires property textMessage".
      body: JSON.stringify({ number: numero || jid, text: texto, textMessage: { text: texto } }),
      signal: AbortSignal.timeout(20_000),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.error('[Evolution] sendText falhou', res.status, body.slice(0, 200))
      return { ok: false, status: res.status, body: body.slice(0, 300) }
    }
    return { ok: true, status: res.status }
  } catch (e: any) {
    console.error('[Evolution] erro ao enviar texto:', e)
    return { ok: false, erro: String(e?.message || e).slice(0, 200) }
  }
}

// Normaliza um número brasileiro pra JID do WhatsApp.
// Aceita "5511999998888", "+55 (11) 99999-8888", "11999998888", etc.
// Se já vier com sufixo @s.whatsapp.net, retorna como está.
export function numeroParaJid(numero: string): string | null {
  if (!numero) return null
  if (/@s\.whatsapp\.net$/.test(numero)) return numero
  let d = String(numero).replace(/\D/g, '')
  if (!d) return null
  // Sem código do país? Assume Brasil (55).
  if (d.length === 10 || d.length === 11) d = '55' + d
  if (d.length < 12 || d.length > 14) return null
  return `${d}@s.whatsapp.net`
}

// Resolve o JID canônico para um número numa instância: se já existe uma
// conversa (whatsapp_mensagens) para o mesmo telefone, reutiliza o JID
// gravado lá. Caso contrário, devolve o JID normalizado por numeroParaJid.
//
// Necessário porque, em BR, o mesmo número pode ter dois JIDs válidos
// (com/sem o "9" de celular) e o WhatsApp/Evolution escolhe um. Se a gente
// só normalizar pra um lado, criamos uma conversa nova quando já existia
// uma sob o outro JID — e a resposta do cliente cai na conversa antiga.
export async function resolverJidCanonico(
  supabase: any,
  instanciaId: string,
  numero: string,
): Promise<string | null> {
  const jidNormalizado = numeroParaJid(numero)
  if (!jidNormalizado) return null
  // Últimos 8 dígitos do número local — bastante específico pra identificar
  // o mesmo contato mesmo com variações de DDI/DDD ou do "9".
  const digitos = String(numero).replace(/\D/g, '')
  if (digitos.length < 8) return jidNormalizado
  const sufixo = digitos.slice(-8)
  try {
    const { data } = await supabase
      .from('whatsapp_mensagens')
      .select('remoto_jid')
      .eq('instancia_id', instanciaId)
      .ilike('remoto_jid', `%${sufixo}@s.whatsapp.net`)
      .not('remoto_jid', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
    if (data && data.length && data[0].remoto_jid) return data[0].remoto_jid as string
  } catch {
    // Em caso de erro no lookup, cai pra normalização padrão — pior caso
    // é o comportamento anterior, não pior que isso.
  }
  return jidNormalizado
}
