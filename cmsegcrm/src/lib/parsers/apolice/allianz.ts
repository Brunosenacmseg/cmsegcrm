// Parser de apólice Allianz Auto.
// Layout descrito pelo usuário:
//   Seções "SUAS INFORMAÇÕES", "INFORMAÇÕES DO CONDUTOR PRINCIPAL",
//   "INFORMAÇÕES DO SEU SEGURO" (2 colunas), "OFERTA ESCOLHIDA" (tabela
//   coberturas), "INFORMAÇÕES DE PAGAMENTO".
//   Nº Apólice no rodapé: "Nº Apólice: 517720262V310613596".

import {
  brNum, clean, splitSections, reFirst, toIso,
  pickDocFromBlock, pickEmail, pickTelefone, pickCep,
  pickPlaca, pickChassi, pickVigencia, truncateText, pickProcessoSusep,
  type ApoliceRow,
} from './_common'

export function parseAllianz(text: string): ApoliceRow[] {
  const sections = splitSections(text, [
    { key: 'corretor',     re: /SEU\s+CORRETOR/i },
    { key: 'segurado',     re: /SUAS\s+INFORMA[CÇ][OÕ]ES/i },
    { key: 'condutor',     re: /INFORMA[CÇ][OÕ]ES\s+DO\s+CONDUTOR\s+PRINCIPAL/i },
    { key: 'seguro',       re: /INFORMA[CÇ][OÕ]ES\s+DO\s+SEU\s+SEGURO/i },
    { key: 'oferta',       re: /OFERTA\s+ESCOLHIDA/i },
    { key: 'assistencia',  re: /ASSIST[EÊ]NCIA\s+24H/i },
    { key: 'assistVidros', re: /ASSIST[EÊ]NCIA\s+A\s+VIDROS/i },
    { key: 'pagamento',    re: /INFORMA[CÇ][OÕ]ES\s+DE\s+PAGAMENTO/i },
  ])

  // Cabeçalho — número aparece no rodapé "Nº Apólice: ..." ou no topo "Nº Proposta: ..."
  const numero   = reFirst(/N[ºo°]\s*Ap[oó]lice\s*:?\s*(\S+)/i, text)
  const proposta = reFirst(/N[ºo°]\s*Proposta\s*:?\s*(\S+)/i, text)

  const segBlock = sections.segurado || ''
  const cliente_nome = clean(segBlock.match(/Nome\s*:?\s*([^\n]+?)(?:\s+Nome\s+Social|\s+CPF|\n)/i)?.[1])
  const cpf_cnpj = pickDocFromBlock(segBlock)
  const segurado_telefone = pickTelefone(segBlock)
  const segurado_email = pickEmail(segBlock)
  const segurado_endereco = clean(segBlock.match(/Endere[cç]o\s*:?\s*([^\n]+)/i)?.[1])

  const condBlock = sections.condutor || ''
  const condutor_nome = clean(condBlock.match(/Nome\s*:?\s*([^\n]+?)(?:\s+CPF|\n)/i)?.[1])
  const condutor_cpf = pickDocFromBlock(condBlock)
  const condutor_estado_civil = clean(condBlock.match(/Estado\s+Civil\s*:?\s*([^\n]+)/i)?.[1])

  const segurBlock = sections.seguro || ''
  const vig = pickVigencia(segurBlock || text)
  const veiculo = clean(segurBlock.match(/Ve[ií]culo\s*:?\s*([^\n]+?)(?:\s+C[oó]d|\s+FIPE|\n)/i)?.[1])
  const cod_fipe = reFirst(/C[oó]d\.?\s*FIPE\s*:?\s*([\w-]+)/i, segurBlock)
  const placa = pickPlaca(segurBlock)
  const chassi = pickChassi(segurBlock)
  const ano_modelo = reFirst(/Ano\s*\/?\s*Modelo\s*:?\s*([\d/]+)/i, segurBlock)
  const cep_pernoite = clean(segurBlock.match(/CEP\s+Pernoite\s*:?\s*(\d{5}-?\d{3})/i)?.[1])
  const classe_bonus = reFirst(/Classe\s+B[oô]nus\s*:?\s*(\d+)/i, segurBlock)
  const tipo_seguro = reFirst(/Tipo\s+de\s+Seguro\s*:?\s*([^\n]+)/i, segurBlock)
  const zero_km = reFirst(/Zero\s*Km\s*:?\s*(Sim|N[aã]o)/i, segurBlock)
  const kit_gas = reFirst(/Kit\s*g[aá]s\s*:?\s*(Sim|N[aã]o)/i, segurBlock)

  // Coberturas — tabela "Coberturas | Limite Máximo | Preço"
  const oferta = sections.oferta || ''
  const coberturas: Array<{ nome: string; lmi: string | null; premio: number | null }> = []
  for (const linha of oferta.split('\n').map(l => l.trim()).filter(Boolean)) {
    if (/^(coberturas|pre[cç]o\s+l[ií]quido|pre[cç]o\s+total)/i.test(linha)) continue
    const m = linha.match(/^(.+?)\s+(R\$\s?[\d.,]+|[A-Z][^\n]*)\s+R\$\s?(\d{1,3}(?:\.\d{3})*,\d{2})$/)
    if (m) coberturas.push({ nome: clean(m[1]) ?? '', lmi: clean(m[2]) ?? null, premio: brNum(m[3]) })
  }

  // Pagamento
  const pag = sections.pagamento || ''
  const forma_pagamento = clean(pag.match(/Forma\s+de\s+pagamento\s*:?\s*([^\n]+)/i)?.[1])
  const cartao = clean(pag.match(/N[ºo°]\s*Cart[aã]o\s*:?\s*([\d*\s-]+)/i)?.[1])
  const premio_liquido = brNum(reFirst(/Pre[cç]o\s+l[ií]quido\s*:?\s*R?\$?\s*([\d.,]+)/i, pag))
  const iof = brNum(reFirst(/\bIOF\s*:?\s*R?\$?\s*([\d.,]+)/i, pag))
  const juros = brNum(reFirst(/Taxa\s+juros\s*:?\s*R?\$?\s*([\d.,]+)/i, pag))
  const premio_total = brNum(reFirst(/Pre[cç]o\s+Total\s*[^R]*R?\$?\s*([\d.,]+)/i, pag))
  const qtd_parcelas = reFirst(/Parcelas\s*:?\s*(\d+)/i, pag)

  const parcelas: Array<Record<string, any>> = []
  const re = /(?:^|\n)\s*(\d{1,2})\s+(\d{2}\/\d{2}\/\d{4})\s+R?\$?\s*(\d{1,3}(?:\.\d{3})*,\d{2})/gm
  let pm: RegExpExecArray | null
  while ((pm = re.exec(pag)) !== null) {
    parcelas.push({
      numero: Number(pm[1]),
      vencimento: toIso(pm[2]),
      valor: brNum(pm[3]),
    })
  }

  // Corretor
  const corBlock = sections.corretor || ''
  const corretor_nome = clean(corBlock.match(/Nome\s*:?\s*([^\n]+?)(?:\s+e-?mail|\s+SUSEP|\n)/i)?.[1])
  const corretor_susep = clean(corBlock.match(/SUSEP\s*N?[º°]?\s*:?\s*(\d+)/i)?.[1])
  const corretor_email = pickEmail(corBlock)
  const corretor_telefone = pickTelefone(corBlock)

  return [{
    seguradora_origem: 'allianz',
    numero,
    proposta,
    tipo_seguro,
    classe_bonus: classe_bonus ? Number(classe_bonus) : null,
    cliente_nome,
    cpf_cnpj,
    segurado_email,
    segurado_telefone,
    segurado_endereco,
    condutor_nome,
    condutor_cpf,
    condutor_estado_civil,
    modelo: veiculo,
    ano_modelo,
    cod_fipe,
    placa,
    chassi,
    zero_km,
    kit_gas,
    cep_pernoite,
    vigencia_ini: vig.ini,
    vigencia_fim: vig.fim,
    coberturas: coberturas.length ? coberturas : null,
    premio_liquido,
    iof,
    juros,
    premio_total,
    premio: premio_total ?? premio_liquido,
    forma_pagamento,
    qtd_parcelas: qtd_parcelas ? Number(qtd_parcelas) : null,
    cartao_mascarado: cartao,
    parcelas: parcelas.length ? parcelas : null,
    corretor_nome,
    corretor_susep,
    corretor_email,
    corretor_telefone,
    processo_susep: pickProcessoSusep(text),
    produto: 'Auto Allianz',
    status_apolice: 'ativo',
    layout_pdf: 'allianz-auto',
    pdf_texto_bruto: truncateText(text),
  }]
}
