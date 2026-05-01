import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const maxDuration = 30

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// Funis em que ganhar gera/atualiza pendência de assinatura.
// Comparação case-insensitive sem acento.
const FUNIS_COM_PENDENCIA = ['venda', 'renovacoes', 'renovacao', 'meta + multicanal', 'meta+multicanal']

function norm(s?: string | null): string {
  return (s || '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()
}

async function autenticar(request: NextRequest) {
  const auth = request.headers.get('authorization') || ''
  const token = auth.replace(/^Bearer\s+/i, '').trim()
  if (!token) return null
  const { data } = await supabaseAdmin.auth.getUser(token)
  return data?.user || null
}

// POST { negocio_id } — chamado quando uma negociação vira "ganho".
//   - Se NÃO existe assinatura para esse negócio em VENDA/RENOVAÇÕES/
//     META+MULTICANAL → cria placeholder com status='pendente'
//     (lembrete de que precisa mandar contrato pra assinar).
//   - Se EXISTE assinatura com status='pendente' (placeholder) e o
//     usuário já enviou doc pra Autentique nesse meio tempo, deixa
//     no estado dela. Se foi enviado pelo card (gerou autentique_id),
//     a propria criar-de-anexo já cuida.
//   - Se EXISTE assinatura JÁ enviada pra Autentique e ainda está em
//     pendente (caso edge), atualiza para 'enviado'.
export async function POST(request: NextRequest) {
  const user = await autenticar(request)
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const negocioId: string | undefined = body?.negocio_id
  if (!negocioId) return NextResponse.json({ error: 'negocio_id obrigatório' }, { status: 400 })

  // Carrega negócio com nome do funil
  const { data: neg } = await supabaseAdmin.from('negocios')
    .select('id, titulo, cliente_id, funil_id, funis(nome)')
    .eq('id', negocioId).maybeSingle()
  if (!neg) return NextResponse.json({ error: 'negócio não encontrado' }, { status: 404 })

  const nomeFunil = norm((neg as any).funis?.nome)
  const aplica = FUNIS_COM_PENDENCIA.some(f => nomeFunil.includes(f))
  if (!aplica) return NextResponse.json({ ok: true, ignorado: true, motivo: `Funil "${(neg as any).funis?.nome}" não está na lista de funis com pendência` })

  // Já existe alguma assinatura pra esse negócio?
  const { data: existentes } = await supabaseAdmin.from('assinaturas')
    .select('id, status, autentique_id').eq('negocio_id', negocioId)
    .order('criado_em', { ascending: false })

  // Se há uma assinatura já com autentique_id (foi enviada de fato) e
  // ainda está marcada como 'pendente', sobe para 'enviado'.
  const enviadaMasPendente = (existentes || []).find(a => a.autentique_id && a.status === 'pendente')
  if (enviadaMasPendente) {
    await supabaseAdmin.from('assinaturas').update({ status: 'enviado' }).eq('id', enviadaMasPendente.id)
    return NextResponse.json({ ok: true, atualizada: enviadaMasPendente.id, novo_status: 'enviado' })
  }

  // Já tem alguma assinatura ativa (pendente/enviado/assinado)? Não cria duplicada.
  const ativa = (existentes || []).find(a => ['pendente','enviado','assinado'].includes(a.status))
  if (ativa) return NextResponse.json({ ok: true, ja_existente: ativa.id, status: ativa.status })

  // Cria placeholder pendente
  const { data: nova, error } = await supabaseAdmin.from('assinaturas').insert({
    nome_documento:    `Pendente — ${neg.titulo || 'Contrato'}`,
    arquivo_nome:      null,
    autentique_id:     null,
    status:            'pendente',
    total_signatarios: 0,
    total_assinados:   0,
    negocio_id:        neg.id,
    cliente_id:        neg.cliente_id || null,
    enviado_por:       user.id,
    obs:               'Pendência criada automaticamente ao marcar negócio como Ganho. Anexe o contrato no card e clique em "✍ Assinatura eletrônica".',
  }).select('id').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, criada: nova?.id, status: 'pendente' })
}
