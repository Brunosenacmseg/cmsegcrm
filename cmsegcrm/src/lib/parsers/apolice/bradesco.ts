// Parser de apólice Bradesco Seguro Auto.
// Layout descrito pelo usuário:
//   Títulos em rosa, layout em duas colunas, número composto
//   "0977.990.0244.399737" + Item 0001 + Endosso 000000.

import {
  brNum, clean, splitSections, reFirst, toIso,
  pickDocFromBlock, pickEmail, pickTelefone, pickCep,
  pickPlaca, pickChassi, pickVigencia, truncateText, pickProcessoSusep,
  type ApoliceRow,
} from './_common'

export function parseBradesco(text: string): ApoliceRow[] {
  const sections = splitSections(text, [
    { key: 'apolice',     re: /Dados\s+da\s+sua\s+ap[oó]lice/i },
    { key: 'segurado',    re: /Dados\s+do\s+segurado/i },
    { key: 'condutor',    re: /Dados\s+do\s+principal\s+condutor/i },
    { key: 'proprietario', re: /Dados\s+do\s+propriet[aá]rio/i },
    { key: 'veiculo',     re: /Dados\s+do\s+ve[ií]culo/i },
    { key: 'coberturas',  re: /\bCoberturas\b/i },
    { key: 'franquia',    re: /\bFranquia\b/i },
    { key: 'demonstrativo', re: /Demonstrativo\s+de\s+Pr[eê]mio/i },
    { key: 'pagamento',   re: /Formas?\s+de\s+pagamento/i },
    { key: 'corretor',    re: /Dados\s+do\s+Corretor|Corretor/i },
  ])

  // Apólice composta: pode aparecer "Sucursal: 0977 Ramo: 990 Cia: 0244 Apólice: 399737"
  // ou tudo junto "0977.990.0244.399737"
  const composta = text.match(/(\d{4})\s*\.\s*(\d{3})\s*\.\s*(\d{4})\s*\.\s*(\d{6,7})/)
  const numero = composta ? composta.slice(1).join('.') : reFirst(/Ap[oó]lice\s*:?\s*([\d.\-/]+)/i, text)
  const item    = reFirst(/Item\s*:?\s*(\d+)/i, text)
  const endosso = reFirst(/Endosso\s*:?\s*(\d+)/i, text)

  const apol = sections.apolice || text
  const codigoCi = reFirst(/CI\s*:?\s*(\S+)/i, apol)
  const vig = pickVigencia(apol || text)

  const segBlock = sections.segurado || ''
  const cliente_nome = clean(segBlock.match(/Nome\s*:?\s*([^\n]+)/i)?.[1])
  const cpf_cnpj = pickDocFromBlock(segBlock)
  const segurado_email = pickEmail(segBlock)
  const segurado_telefone = pickTelefone(segBlock)
  const segurado_cep = pickCep(segBlock)
  const data_nascimento = clean(segBlock.match(/Data\s+Nascimento\s*:?\s*(\d{2}\/\d{2}\/\d{4})/i)?.[1])
  const sexo = clean(segBlock.match(/Sexo\s*:?\s*([MF])\b/i)?.[1])

  const condBlock = sections.condutor || ''
  const condutor_nome = clean(condBlock.match(/Nome\s*:?\s*([^\n]+)/i)?.[1])
  const condutor_cpf = pickDocFromBlock(condBlock)

  const veicBlock = sections.veiculo || ''
  const veiculo = clean(veicBlock.match(/Marca\s*:?\s*([^\n]+)/i)?.[1])
  const ano_modelo = reFirst(/Ano\s+Fab\s*:?\s*([\d/]+)/i, veicBlock)
  const placa = pickPlaca(veicBlock)
  const chassi = pickChassi(veicBlock)
  const cod_fipe = reFirst(/C[oó]digo\s+FIPE\s*:?\s*([\w-]+)/i, veicBlock)

  // Coberturas — formato "LMI R$ XXX / Prêmio Líq. R$ XXX"
  const cobBlock = sections.coberturas || ''
  const coberturas: Array<{ nome: string; lmi: number | null; premio: number | null }> = []
  const cobRe = /(.+?)\s+LMI\s+R\$\s*(\d{1,3}(?:\.\d{3})*,\d{2})\s+Pr[eê]mio\s+L[ií]q\.\s+R\$\s*(\d{1,3}(?:\.\d{3})*,\d{2})/gi
  let cm: RegExpExecArray | null
  while ((cm = cobRe.exec(cobBlock)) !== null) {
    coberturas.push({ nome: clean(cm[1]) ?? '', lmi: brNum(cm[2]), premio: brNum(cm[3]) })
  }

  // Demonstrativo
  const demo = sections.demonstrativo || ''
  const premio_auto = brNum(reFirst(/Auto\s*:?\s*R?\$?\s*([\d.,]+)/i, demo))
  const premio_rcf  = brNum(reFirst(/RCF\s*:?\s*R?\$?\s*([\d.,]+)/i, demo))
  const premio_app  = brNum(reFirst(/APP\s*:?\s*R?\$?\s*([\d.,]+)/i, demo))
  const premio_liquido = brNum(reFirst(/Sub-?Total\s*:?\s*R?\$?\s*([\d.,]+)/i, demo))
                       ?? brNum(reFirst(/L[ÍI]QUIDO\s*:?\s*R?\$?\s*([\d.,]+)/i, demo))
  const iof = brNum(reFirst(/\bIOF\s*:?\s*R?\$?\s*([\d.,]+)/i, demo))
  const premio_total = brNum(reFirst(/Total\s*:?\s*R?\$?\s*([\d.,]+)/i, demo))

  // Pagamento
  const pag = sections.pagamento || ''
  const cartao = clean(pag.match(/Cart[aã]o\s*:?\s*([\d*\s-]+)/i)?.[1])
  const qtd_parcelas = reFirst(/Quant\.?\s+Parcelas\s*:?\s*(\d+)/i, pag)
  const taxa_juros = brNum(reFirst(/Taxa\s+Juros\s*:?\s*([\d.,]+)/i, pag))

  // Corretor
  const corBlock = sections.corretor || ''
  const corretor_nome = clean(corBlock.match(/Nome\s*:?\s*([^\n]+)/i)?.[1])
  const corretor_cpd  = clean(corBlock.match(/CPD\s*:?\s*(\d+)/i)?.[1])

  return [{
    seguradora_origem: 'bradesco',
    numero,
    item,
    endosso,
    codigo_ci: codigoCi,
    cliente_nome,
    cpf_cnpj,
    segurado_email,
    segurado_telefone,
    segurado_cep,
    data_nascimento: toIso(data_nascimento),
    sexo,
    condutor_nome,
    condutor_cpf,
    modelo: veiculo,
    ano_modelo,
    placa,
    chassi,
    cod_fipe,
    vigencia_ini: vig.ini,
    vigencia_fim: vig.fim,
    coberturas: coberturas.length ? coberturas : null,
    premio_auto,
    premio_rcf,
    premio_app,
    premio_liquido,
    iof,
    premio_total,
    premio: premio_total ?? premio_liquido,
    forma_pagamento: clean(pag.match(/Cart[aã]o|Boleto|D[eé]bito|Cr[eé]dito/i)?.[0]),
    cartao_mascarado: cartao,
    qtd_parcelas: qtd_parcelas ? Number(qtd_parcelas) : null,
    taxa_juros,
    corretor_nome,
    corretor_cpd,
    processo_susep: pickProcessoSusep(text),
    produto: 'Auto Bradesco',
    status_apolice: 'ativo',
    layout_pdf: 'bradesco-auto',
    pdf_texto_bruto: truncateText(text),
  }]
}
