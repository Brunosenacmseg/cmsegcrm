// ═════════════════════════════════════════════════════════════
// Mapeamento configurável RD Station → CMSEGCRM (negocios)
//
// Usuário admin define em /dashboard/rdstation/mapeamento pares
// {rd_path, local_col} que sobrescrevem o payload default tanto
// no sync admin (importarNegocios) quanto no webhook (aplicarDeal).
// ═════════════════════════════════════════════════════════════

export interface RegraMapeamento {
  rd_path: string   // ex: "amount_total", "deal_custom_fields[Placa].value", "deal_source.name"
  local_col: string // ex: "premio", "placa", "fonte"
}

// Colunas locais de `negocios` que fazem sentido o admin mapear.
// Excluímos id/FKs/timestamps/colunas resolvidas via lógica especial
// (funil_id, etapa, status, vendedor_id, cliente_id, motivo_perda_id, origem_id).
export const COLUNAS_LOCAIS_NEGOCIOS: { col: string; label: string; tipo: 'texto' | 'numero' | 'data' | 'boolean' }[] = [
  { col: 'titulo',                label: 'Título',                  tipo: 'texto' },
  { col: 'produto',               label: 'Produto',                 tipo: 'texto' },
  { col: 'seguradora',            label: 'Seguradora',              tipo: 'texto' },
  { col: 'premio',                label: 'Prêmio',                  tipo: 'numero' },
  { col: 'comissao_pct',          label: '% Comissão',              tipo: 'numero' },
  { col: 'comissao_valor',        label: 'Valor Comissão',          tipo: 'numero' },
  { col: 'valor_unico',           label: 'Valor Único',             tipo: 'numero' },
  { col: 'valor_recorrente',      label: 'Valor Recorrente',        tipo: 'numero' },
  { col: 'placa',                 label: 'Placa (legado)',          tipo: 'texto' },
  { col: 'placa_veiculo',         label: 'Placa Veículo',           tipo: 'texto' },
  { col: 'modelo_veiculo',        label: 'Modelo Veículo',          tipo: 'texto' },
  { col: 'cpf_cnpj',              label: 'CPF/CNPJ',                tipo: 'texto' },
  { col: 'cpf_2',                 label: 'CPF 2',                   tipo: 'texto' },
  { col: 'cep',                   label: 'CEP',                     tipo: 'texto' },
  { col: 'cep_negocio',           label: 'CEP Negócio',             tipo: 'texto' },
  { col: 'email_negocio',         label: 'E-mail Negócio',          tipo: 'texto' },
  { col: 'telefone_negocio',      label: 'Telefone Negócio',        tipo: 'texto' },
  { col: 'fonte',                 label: 'Fonte',                   tipo: 'texto' },
  { col: 'fonte_origem',          label: 'Fonte/Origem',            tipo: 'texto' },
  { col: 'campanha',              label: 'Campanha',                tipo: 'texto' },
  { col: 'empresa',               label: 'Empresa',                 tipo: 'texto' },
  { col: 'cargo_contato',         label: 'Cargo Contato',           tipo: 'texto' },
  { col: 'vencimento',            label: 'Vencimento',              tipo: 'data' },
  { col: 'previsao_fechamento',   label: 'Previsão Fechamento',     tipo: 'data' },
  { col: 'data_primeiro_contato', label: 'Data 1º Contato',         tipo: 'data' },
  { col: 'data_ultimo_contato',   label: 'Data Último Contato',     tipo: 'data' },
  { col: 'data_proxima_tarefa',   label: 'Data Próxima Tarefa',     tipo: 'data' },
  { col: 'qualificacao',          label: 'Qualificação (1-5)',      tipo: 'numero' },
  { col: 'pausada',               label: 'Pausada',                 tipo: 'boolean' },
  { col: 'tipo_seguro',           label: 'Tipo Seguro',             tipo: 'texto' },
  { col: 'operadora',             label: 'Operadora',               tipo: 'texto' },
  { col: 'rastreador',            label: 'Rastreador',              tipo: 'texto' },
  { col: 'tipo_cnpj',             label: 'Tipo CNPJ',               tipo: 'texto' },
  { col: 'funcionario_clt',       label: 'Funcionário CLT',         tipo: 'texto' },
  { col: 'plano_atual',           label: 'Plano Atual',             tipo: 'texto' },
  { col: 'mensalidade_atual',     label: 'Mensalidade Atual',       tipo: 'numero' },
  { col: 'idade_beneficiarios',   label: 'Idade Beneficiários',     tipo: 'texto' },
  { col: 'qual_hospital',         label: 'Qual Hospital',           tipo: 'texto' },
  { col: 'seguradora_atual',      label: 'Seguradora Atual',        tipo: 'texto' },
  { col: 'vigencia_seguro_ini',   label: 'Vigência Início',         tipo: 'data' },
  { col: 'vigencia_seguro_fim',   label: 'Vigência Fim',            tipo: 'data' },
  { col: 'anotacao_motivo_perda', label: 'Anotação Motivo Perda',   tipo: 'texto' },
  { col: 'obs',                   label: 'Observação',              tipo: 'texto' },
  { col: 'particular',            label: 'Particular',              tipo: 'boolean' },
  { col: 'possui_plano',          label: 'Possui Plano',            tipo: 'boolean' },
  { col: 'possui_hospital_pref',  label: 'Possui Hospital Pref.',   tipo: 'boolean' },
  { col: 'motivo_troca_plano',    label: 'Motivo Troca Plano',      tipo: 'texto' },
]

// Campos padrão do RD Station (deal) — paths estáveis
export const CAMPOS_RD_PADRAO: { rd_path: string; label: string }[] = [
  { rd_path: 'name',                       label: 'Nome do negócio' },
  { rd_path: 'amount_total',               label: 'Valor total' },
  { rd_path: 'amount_montly',              label: 'Valor mensal (v1)' },
  { rd_path: 'amount_monthly',             label: 'Valor mensal (v2)' },
  { rd_path: 'amount_unique',              label: 'Valor único' },
  { rd_path: 'prediction_date',            label: 'Previsão fechamento' },
  { rd_path: 'closed_at',                  label: 'Data fechamento' },
  { rd_path: 'rating',                     label: 'Qualificação (rating)' },
  { rd_path: 'hold',                       label: 'Hold' },
  { rd_path: 'win',                        label: 'Win (true/false)' },
  { rd_path: 'organization.name',          label: 'Empresa (organization.name)' },
  { rd_path: 'deal_source.name',           label: 'Origem (deal_source.name)' },
  { rd_path: 'campaign.name',              label: 'Campanha (campaign.name)' },
  { rd_path: 'deal_lost_reason.name',      label: 'Motivo Perda (deal_lost_reason.name)' },
  { rd_path: 'deal_pipeline.name',         label: 'Funil (deal_pipeline.name)' },
  { rd_path: 'deal_stage.name',            label: 'Etapa (deal_stage.name)' },
  { rd_path: 'user.name',                  label: 'Responsável (user.name)' },
  { rd_path: 'user.email',                 label: 'E-mail responsável (user.email)' },
  { rd_path: 'contacts[0].name',           label: 'Nome contato' },
  { rd_path: 'contacts[0].emails[0].email',label: 'E-mail contato' },
  { rd_path: 'contacts[0].phones[0].phone',label: 'Telefone contato' },
  { rd_path: 'contacts[0].cpf',            label: 'CPF contato' },
  { rd_path: 'contacts[0].cnpj',           label: 'CNPJ contato' },
  { rd_path: 'contacts[0].cep',            label: 'CEP contato' },
  { rd_path: 'deal_products[0].product.name', label: 'Produto[0] nome' },
  { rd_path: 'deal_products[0].price',     label: 'Produto[0] preço' },
]

// Resolve um rd_path em um deal RD. Suporta:
//   • dot path simples: "deal_source.name"
//   • índice numérico:  "contacts[0].name"
//   • lookup por label de custom_field: "deal_custom_fields[Placa].value"
//     (case-insensitive na label)
export function lerCampoRD(deal: any, rdPath: string): any {
  if (!deal || !rdPath) return null
  const partes: { tipo: 'prop' | 'idx' | 'cf'; valor: string }[] = []
  // Parser super simples — divide por "." e trata "[...]" inline
  const tokens = rdPath.split('.')
  for (const tk of tokens) {
    const m = tk.match(/^([^\[]+)?(?:\[([^\]]+)\])?$/)
    if (!m) return null
    const prop = m[1]
    const idx  = m[2]
    if (prop) partes.push({ tipo: 'prop', valor: prop })
    if (idx !== undefined) {
      if (/^\d+$/.test(idx)) partes.push({ tipo: 'idx', valor: idx })
      else partes.push({ tipo: 'cf', valor: idx })
    }
  }

  let cur: any = deal
  for (const p of partes) {
    if (cur == null) return null
    if (p.tipo === 'prop') cur = cur[p.valor]
    else if (p.tipo === 'idx') cur = cur[parseInt(p.valor, 10)]
    else if (p.tipo === 'cf') {
      // Busca em array de custom_fields por label case-insensitive
      if (!Array.isArray(cur)) return null
      const alvo = p.valor.toLowerCase()
      cur = cur.find((it: any) => {
        const lbl = (it?.custom_field?.label || it?.label || it?.name || '').toString().toLowerCase()
        return lbl === alvo
      })
    }
  }
  return cur
}

// Aplica regras de mapeamento sobre um payload — só sobrescreve valores
// não-nulos, então mantém o default quando o campo não está preenchido no RD.
export function aplicarMapeamento(payload: any, deal: any, regras: RegraMapeamento[] | null | undefined): any {
  if (!regras || !regras.length) return payload
  for (const r of regras) {
    if (!r?.rd_path || !r?.local_col) continue
    const v = lerCampoRD(deal, r.rd_path)
    if (v === undefined || v === null || v === '') continue
    payload[r.local_col] = coercir(v, r.local_col)
  }
  return payload
}

// Coerção mínima (numero/data) baseada em heurística da coluna —
// evita gravar string em coluna numeric.
function coercir(v: any, col: string): any {
  const meta = COLUNAS_LOCAIS_NEGOCIOS.find(c => c.col === col)
  if (!meta) return v
  if (meta.tipo === 'numero') {
    const n = Number(typeof v === 'string' ? v.replace(/[^\d.,-]/g, '').replace(',', '.') : v)
    return Number.isFinite(n) ? n : null
  }
  if (meta.tipo === 'data') {
    if (typeof v === 'string') return v.slice(0, 10)
    return v
  }
  if (meta.tipo === 'boolean') {
    if (typeof v === 'boolean') return v
    if (typeof v === 'string') return /^(true|sim|yes|1)$/i.test(v.trim())
    return !!v
  }
  // texto
  if (typeof v === 'object') {
    // Custom field às vezes vem como { values: [...] } ou objeto.
    if (Array.isArray(v)) return v.join(', ')
    if (v?.value !== undefined) return String(v.value)
    return JSON.stringify(v)
  }
  return String(v)
}
