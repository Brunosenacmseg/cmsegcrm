// Parser de apólice Darwin Seguros.
// Layout descrito pelo usuário:
//   Design moderno minimalista. Magenta + preto. Apólice formato "01010002025040016182".
//   Layout em 3 colunas. Vigência com hora.

import {
  brNum, clean, splitSections, reFirst, toIso,
  pickDocFromBlock, pickEmail, pickTelefone, pickCep,
  pickPlaca, pickChassi, pickVigencia, truncateText, pickProcessoSusep,
  type ApoliceRow,
} from './_common'

export function parseDarwin(text: string): ApoliceRow[] {
  const sections = splitSections(text, [
    { key: 'segurado',  re: /Seus\s+dados|Segurado/i },
    { key: 'condutor',  re: /\bCondutor\b/i },
    { key: 'veiculo',   re: /\bVe[ií]culo\b/i },
    { key: 'corretora', re: /Corretora?/i },
    { key: 'seguro',    re: /Seu\s+seguro|Plano/i },
    { key: 'coberturas', re: /\bCoberturas\b/i },
    { key: 'pagamento',  re: /Forma\s+de\s+pagamento|Cart[aã]o\s+de\s+cr[eé]dito/i },
    { key: 'franquias',  re: /Franquias?/i },
  ])

  const numero = reFirst(/Ap[oó]lice\s*:?\s*(\d{15,})/i, text)
                ?? reFirst(/Ap[oó]lice\s*[:#]?\s*(\d+)/i, text)
  const proposta = reFirst(/Proposta\s*:?\s*(\d+)/i, text)

  const segBlock = sections.segurado || ''
  const cliente_nome = clean(segBlock.match(/Segurado\s*\n+\s*([^\n]+)/i)?.[1])
                    ?? clean(segBlock.match(/Nome\s*:?\s*([^\n]+)/i)?.[1])
  const cpf_cnpj = pickDocFromBlock(segBlock)
  const segurado_email = pickEmail(segBlock)
  const segurado_telefone = pickTelefone(segBlock)
  const segurado_cep = pickCep(segBlock)

  const veicBlock = sections.veiculo || ''
  const veiculo = clean(veicBlock.match(/Modelo\s*:?\s*([^\n]+)/i)?.[1])
  const placa = pickPlaca(veicBlock)
  const chassi = pickChassi(veicBlock)
  const cod_fipe = reFirst(/FIPE\s*:?\s*([\w-]+)/i, veicBlock)
  const ano_modelo = reFirst(/Ano\s*\/?\s*Modelo\s*:?\s*([\d/]+)/i, veicBlock)

  const segBlockSeg = sections.seguro || ''
  // Vigência (formato com hora). pickVigencia funciona, ou olhamos labels específicos.
  const inicioMatch = text.match(/In[ií]cio\s+da\s+vig[eê]ncia\s*[:\n]\s*([^\n]+)/i)?.[1]
  const fimMatch = text.match(/Fim\s+da\s+vig[eê]ncia\s*[:\n]\s*([^\n]+)/i)?.[1]
  const vigGen = pickVigencia(text)
  const vigencia_ini = (inicioMatch && toIso(inicioMatch)) || vigGen.ini
  const vigencia_fim = (fimMatch && toIso(fimMatch)) || vigGen.fim

  // Coberturas — formato "Cobertura ... Valor"
  const cobBlock = sections.coberturas || ''
  const coberturas: Array<{ nome: string; valor: number | null }> = []
  for (const linha of cobBlock.split('\n').map(l => l.trim()).filter(Boolean)) {
    const m = linha.match(/^(.+?)\s+R\$?\s*(\d{1,3}(?:\.\d{3})*,\d{2})$/)
    if (m) coberturas.push({ nome: clean(m[1]) ?? '', valor: brNum(m[2]) })
  }

  // Bloco financeiro
  const premio_liquido = brNum(reFirst(/Total\s+pr[eê]mio\s+l[ií]quido\s*:?\s*R?\$?\s*([\d.,]+)/i, text))
  const taxas = brNum(reFirst(/Taxas?\s*:?\s*R?\$?\s*([\d.,]+)/i, text))
  const iof = brNum(reFirst(/\bIOF\s*:?\s*R?\$?\s*([\d.,]+)/i, text))
  const premio_total = brNum(reFirst(/Valor\s+total\s*:?\s*R?\$?\s*([\d.,]+)/i, text))

  // Forma de pagamento: "Cartão de crédito em 10x de R$ X"
  const pagMatch = text.match(/Cart[aã]o\s+de\s+cr[eé]dito\s+em\s+(\d+)x\s+de\s+R?\$?\s*([\d.,]+)/i)
  const forma_pagamento = pagMatch ? `Cartão de crédito em ${pagMatch[1]}x de R$ ${pagMatch[2]}` : null
  const qtd_parcelas = pagMatch ? Number(pagMatch[1]) : null

  // Corretora
  const corBlock = sections.corretora || ''
  const corretor_nome = clean(corBlock.match(/Corretora?\s*\n+\s*([^\n]+)/i)?.[1])
                     ?? clean(corBlock.match(/Nome\s*:?\s*([^\n]+)/i)?.[1])
  const corretor_susep = clean(corBlock.match(/SUSEP\s*:?\s*(\d+)/i)?.[1])

  return [{
    seguradora_origem: 'darwin',
    numero,
    proposta,
    cliente_nome,
    cpf_cnpj,
    segurado_email,
    segurado_telefone,
    segurado_cep,
    modelo: veiculo,
    ano_modelo,
    placa,
    chassi,
    cod_fipe,
    vigencia_ini,
    vigencia_fim,
    coberturas: coberturas.length ? coberturas : null,
    premio_liquido,
    taxas,
    iof,
    premio_total,
    premio: premio_total ?? premio_liquido,
    forma_pagamento,
    qtd_parcelas,
    corretor_nome,
    corretor_susep,
    processo_susep: pickProcessoSusep(text),
    produto: 'Auto Darwin',
    status_apolice: 'ativo',
    layout_pdf: 'darwin-auto',
    pdf_texto_bruto: truncateText(text),
  }]
}
