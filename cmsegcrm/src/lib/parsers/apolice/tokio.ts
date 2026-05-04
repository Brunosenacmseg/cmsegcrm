// Parser de apólice Tokio Marine (formato auto pessoal).
// Layout descrito pelo usuário:
//   Cabeçalhos coloridos (verde) com seções nomeadas: DADOS DO SEGURO,
//   SEGURADO/CONDUTOR, VEÍCULO, LOCAL DE RISCO, COBERTURAS, SERVIÇOS,
//   FRANQUIAS, CONDIÇÕES ESPECIAIS, PAGAMENTO, CORRETOR.
// Padrão chave-valor: "Chave: Valor" (separador 2 pontos).

import {
  brNum, clean, listBrNumbers, splitSections, reFirst, toIso,
  pickDocFromBlock, pickEmail, pickTelefone, pickCep,
  pickPlaca, pickChassi, pickVigencia, truncateText, pickProcessoSusep,
  type ApoliceRow,
} from './_common'

export function parseTokio(text: string): ApoliceRow[] {
  const sections = splitSections(text, [
    { key: 'dadosSeguro',  re: /DADOS\s+DO\s+SEGURO/i },
    { key: 'segurado',     re: /SEGURADO\s*\/?\s*CONDUTOR/i },
    { key: 'veiculo',      re: /\bVE[IÍ]CULO\b/i },
    { key: 'localRisco',   re: /LOCAL\s+DE\s+RISCO/i },
    { key: 'coberturas',   re: /\bCOBERTURAS\b/i },
    { key: 'servicos',     re: /\bSERVI[CÇ]OS\b/i },
    { key: 'franquias',    re: /\bFRANQUIAS\b/i },
    { key: 'condicoes',    re: /CONDI[CÇ][OÕ]ES\s+ESPECIAIS/i },
    { key: 'pagamento',    re: /\bPAGAMENTO\b/i },
    { key: 'corretor',     re: /\bCORRETOR\b/i },
  ])

  const dadosBlock = sections.dadosSeguro || text
  const segBlock   = sections.segurado || ''
  const veicBlock  = sections.veiculo || ''
  const cobBlock   = sections.coberturas || ''
  const pagBlock   = sections.pagamento || ''
  const corBlock   = sections.corretor || ''
  const localBlock = sections.localRisco || ''

  // Cabeçalho da apólice
  const numero    = reFirst(/Ap[oó]lice\s*:?\s*(\S+)/i, dadosBlock)
  const proposta  = reFirst(/Proposta\s*:?\s*(\S+)/i, dadosBlock)
  const ramo      = reFirst(/Ramo\s*:?\s*([^\n]+?)(?:\s{2,}|\n)/i, dadosBlock)
  const ci        = reFirst(/\bCI\s*:?\s*(\S+)/i, dadosBlock)
  const classeBon = reFirst(/Classe\s+de\s+B[oô]nus\s*:?\s*(\d+)/i, dadosBlock)
  const tipoSeg   = reFirst(/Tipo\s+de\s+Seguro\s*:?\s*([^\n]+?)(?:\s+CI|\s{2,}|\n)/i, dadosBlock)
  const dataEmissao = reFirst(/Data\s+da\s+Emiss[aã]o\s*:?\s*(\d{2}\/\d{2}\/\d{4})/i, dadosBlock)
  const vig = pickVigencia(dadosBlock || text)

  // Segurado
  const cliente_nome = clean(segBlock.match(/Segurado\s*:?\s*([^\n]+?)(?:\s+Nome\s+Social|\s+CPF|\n)/i)?.[1])
                    ?? clean(segBlock.match(/Segurado\s*:?\s*([^\n]+)/i)?.[1])
  const cpf_cnpj = pickDocFromBlock(segBlock)
  const segurado_email = pickEmail(segBlock)
  const segurado_telefone = pickTelefone(segBlock)
  const segurado_cep = pickCep(segBlock)
  const segurado_endereco = clean(segBlock.match(/Endere[cç]o\s+de\s+Correspond[eê]ncia\s*:?\s*([^\n]+)/i)?.[1])
  const segurado_cidade = clean(segBlock.match(/Cidade\s*:?\s*([^\n]+?)(?:\s+UF|\n)/i)?.[1])
  const segurado_uf = clean(segBlock.match(/UF\s*:?\s*([A-Z]{2})/i)?.[1])
  const segurado_estado_civil = clean(segBlock.match(/Estado\s+Civil\s*:?\s*([^\n]+)/i)?.[1])
  const condutor_nome = clean(segBlock.match(/Principal\s+condutor\s*:?\s*([^\n]+?)(?:\s+CPF|\n)/i)?.[1])
  const condutor_cpf = clean(segBlock.match(/CPF\s+principal\s+condutor\s*:?\s*([\d.\-]+)/i)?.[1])?.replace(/\D/g, '') ?? null

  // Veículo
  const marca   = reFirst(/Fabricante\s*:?\s*([^\n]+?)(?:\s+Ano|\n)/i, veicBlock)
  const modelo  = reFirst(/Ve[ií]culo\s*:?\s*([^\n]+?)(?:\s+Fabricante|\n)/i, veicBlock)
  const ano_modelo = reFirst(/Ano\s+Modelo\s*:?\s*(\d{4}\/?\d{0,4})/i, veicBlock)
  const placa   = pickPlaca(veicBlock)
  const chassi  = pickChassi(veicBlock)
  const cod_fipe = reFirst(/C[oó]digo\s+Fipe\s*:?\s*([\w-]+)/i, veicBlock)
  const combustivel = reFirst(/Combust[ií]vel\s*:?\s*([^\n]+?)(?:\s+Chassi|\n)/i, veicBlock)
  const zero_km = reFirst(/Zero\s*Km\s*:?\s*(Sim|N[aã]o)/i, veicBlock)
  const blindagem = reFirst(/Ve[ií]culo\s+Blindado\s*:?\s*(Sim|N[aã]o)/i, veicBlock)
  const kit_gas = reFirst(/Ve[ií]culo\s+Com\s+Kit\s+G[aá]s\s*:?\s*(Sim|N[aã]o)/i, veicBlock)
  const cep_pernoite = pickCep(localBlock) || pickCep(veicBlock)

  // Coberturas — tabela "Descrição | LMI | Prêmio Líquido"
  // A seção lista linhas como "Colisão/Incêndio/Roubo  100% Fipe  1.234,56"
  const coberturas: Array<{ nome: string; lmi: string | null; premio: number | null }> = []
  const cobLines = cobBlock.split('\n').map(l => l.trim()).filter(Boolean)
  for (const linha of cobLines) {
    // ignora cabeçalhos e linha de total
    if (/^(coberturas|descri[cç][aã]o|pr[eê]mio\s+l[ií]quido\s+total)/i.test(linha)) continue
    const m = linha.match(/^(.+?)\s+([\d.,%R$\s\w]+?)\s+(\d{1,3}(?:\.\d{3})*,\d{2})$/)
    if (m) {
      coberturas.push({ nome: clean(m[1]) ?? '', lmi: clean(m[2]) ?? null, premio: brNum(m[3]) })
    }
  }

  // Prêmio Total + Pagamento
  const premio_liquido = brNum(reFirst(/Pr[eê]mio\s+L[ií]quido\s+Total\s*:?\s*R?\$?\s*([\d.,]+)/i, text))
  const iof = brNum(reFirst(/\bIOF\s*:?\s*R?\$?\s*([\d.,]+)/i, pagBlock || text))
  const juros = brNum(reFirst(/\bJuros\s*:?\s*R?\$?\s*([\d.,]+)/i, pagBlock || text))
  const premio_total = brNum(reFirst(/Pr[eê]mio\s+Total\s*:?\s*R?\$?\s*([\d.,]+)/i, pagBlock || text))

  const forma_pagamento = clean(pagBlock.match(/Cobran[cç]a\s*:?\s*([^\n]+)/i)?.[1])
                       ?? clean(pagBlock.match(/Forma\s+de\s+Pagamento\s*:?\s*([^\n]+)/i)?.[1])
  const cartao = clean(pagBlock.match(/N[uú]mero\s+do\s+Cart[aã]o\s*:?\s*([\d*\s-]+)/i)?.[1])

  // Tabela de parcelas: "1   123,45   17/03/2026   Cartão"
  const parcelas: Array<Record<string, any>> = []
  const re = /(?:^|\n)\s*(\d{1,2})\s+(\d{1,3}(?:\.\d{3})*,\d{2})\s+(\d{2}\/\d{2}\/\d{4})\s+([^\n]+)/gm
  let pm: RegExpExecArray | null
  while ((pm = re.exec(pagBlock)) !== null) {
    parcelas.push({
      numero: Number(pm[1]),
      valor: brNum(pm[2]),
      vencimento: toIso(pm[3]),
      forma: clean(pm[4]),
    })
  }

  // Corretor
  const corretor_nome  = clean(corBlock.match(/Nome\s*:?\s*([^\n]+?)(?:\s+CNPJ|\n)/i)?.[1])
  const corretor_cnpj  = pickDocFromBlock(corBlock)
  const corretor_susep = clean(corBlock.match(/C[oó]d\.?\s*SUSEP\s*:?\s*(\d+)/i)?.[1])

  return [{
    seguradora_origem: 'tokio',
    numero,
    proposta,
    ramo_codigo: ramo,
    codigo_ci: ci,
    classe_bonus: classeBon ? Number(classeBon) : null,
    tipo_seguro: tipoSeg,
    data_emissao: toIso(dataEmissao),
    vigencia_ini: vig.ini,
    vigencia_fim: vig.fim,
    cliente_nome,
    cpf_cnpj,
    segurado_email,
    segurado_telefone,
    segurado_cep,
    segurado_cidade,
    segurado_uf,
    segurado_endereco,
    segurado_estado_civil,
    condutor_nome,
    condutor_cpf,
    marca,
    modelo,
    ano_modelo,
    cod_fipe,
    placa,
    chassi,
    combustivel,
    zero_km,
    blindagem,
    kit_gas,
    cep_pernoite,
    coberturas: coberturas.length ? coberturas : null,
    premio_liquido,
    iof,
    juros,
    premio_total,
    premio: premio_total ?? premio_liquido,
    forma_pagamento,
    cartao_mascarado: cartao,
    parcelas: parcelas.length ? parcelas : null,
    corretor_nome,
    corretor_cnpj,
    corretor_susep,
    processo_susep: pickProcessoSusep(text),
    produto: 'Auto Tokio Marine',
    status_apolice: 'ativo',
    layout_pdf: 'tokio-auto',
    pdf_texto_bruto: truncateText(text),
  }]
}
