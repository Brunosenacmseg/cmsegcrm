import { NextRequest, NextResponse } from 'next/server'
import { createClient, SupabaseClient } from '@supabase/supabase-js'

// Endpoint de consulta progressiva: recebe CPF (ou outros campos parciais) e
// devolve dados pra preencher o formulário de cotação.
//
// Estratégia em camadas:
//   1) Busca primeiro na base local de clientes — instantâneo, gratuito
//   2) Se a env COTACAO_CONSULTA_URL estiver configurada, chama o robô
//      em /consultar-cpf esperando JSON com os campos a preencher
//   3) Se nada funcionar, devolve { ok: true, encontrado: false }
//
// Contrato esperado do robô (rota POST {COTACAO_CONSULTA_URL}/consultar-cpf):
//   request:  { cpf: "12345678900" }
//   response: { ok: true, dados: { nome, nascimento, sexo, estado_civil, ... } }
// Quando o robô não tiver dados ou der timeout, o CRM continua funcionando
// com o que conseguiu da base local.

export const runtime  = 'nodejs'
export const dynamic  = 'force-dynamic'
export const maxDuration = 60

let _supabaseAdmin: SupabaseClient | null = null
function supabaseAdmin() {
  if (!_supabaseAdmin) {
    _supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
  }
  return _supabaseAdmin
}
// Mesma URL do robô; v2 expõe /consultar-cpf no mesmo serviço.
// Mantém a possibilidade de override via COTACAO_CONSULTA_URL caso queira
// usar um serviço de consulta diferente.
const ROBO_URL   = process.env.COTACAO_CONSULTA_URL || process.env.COTACAO_ROBO_URL || ''
const ROBO_TOKEN = process.env.COTACAO_ROBO_TOKEN || ''

export async function POST(request: NextRequest) {
  try {
    const { cpf } = await request.json()
    const cpfLimpo = (cpf || '').replace(/\D/g, '')
    if (cpfLimpo.length < 11) {
      return NextResponse.json({ ok: false, error: 'CPF inválido' }, { status: 400 })
    }

    // 1) Busca na base local
    const { data: cli } = await supabaseAdmin()
      .from('clientes')
      .select('id, nome, cpf_cnpj, nascimento, sexo, estado_civil, telefone, telefone2, email, cep, endereco, numero, bairro, cidade, estado')
      .or(`cpf_cnpj.eq.${cpfLimpo},cpf_cnpj.ilike.%${cpfLimpo}%`)
      .limit(1)
      .maybeSingle()

    if (cli) {
      return NextResponse.json({
        ok: true,
        encontrado: true,
        fonte: 'base_local',
        dados: {
          cliente_id:   cli.id,
          nome:         cli.nome,
          nascimento:   cli.nascimento,
          sexo:         cli.sexo,
          estado_civil: cli.estado_civil,
          telefone:     cli.telefone,
          email:        cli.email,
          cep:          cli.cep,
          endereco:     cli.endereco,
          numero:       cli.numero,
          bairro:       cli.bairro,
          cidade:       cli.cidade,
          estado:       cli.estado,
        },
      })
    }

    // 2) Se há robô configurado, tenta consultar
    if (ROBO_URL) {
      try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' }
        if (ROBO_TOKEN) headers['x-robo-token'] = ROBO_TOKEN
        const res = await fetch(`${ROBO_URL.replace(/\/$/, '')}/consultar-cpf`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ cpf: cpfLimpo }),
          signal: AbortSignal.timeout(45000),
        })
        if (res.ok) {
          const json = await res.json().catch(() => null)
          if (json?.encontrado && json?.dados) {
            return NextResponse.json({ ok: true, encontrado: true, fonte: 'robo', dados: json.dados })
          }
        }
      } catch {
        // Falha no robô não impede o CRM de funcionar — só não preenche.
      }
    }

    return NextResponse.json({ ok: true, encontrado: false })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || 'Erro inesperado' }, { status: 500 })
  }
}
