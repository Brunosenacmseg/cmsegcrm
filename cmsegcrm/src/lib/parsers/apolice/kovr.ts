// Parser de apólice KOVR (Seguro RC Empresas Transporte).
// Layout descrito pelo usuário:
//   Idêntico ao EZZE Transporte. Formulário tabular com bordas.
//   Apólice formato "1002800156933". Segurado é PJ.

import {
  brNum, clean, splitSections, reFirst, toIso, listBrNumbers,
  pickDocFromBlock, pickEmail, pickTelefone, pickCep,
  pickPlaca, pickChassi, pickVigencia, truncateText, pickProcessoSusep,
  type ApoliceRow,
} from './_common'

export function parseKovr(text: string): ApoliceRow[] {
  const sections = splitSections(text, [
    { key: 'cabecalho',     re: /KOVR/i },
    { key: 'vigencia',      re: /VIG[EÊ]NCIA\s+DA\s+AP[OÓ]LICE/i },
    { key: 'segurado',      re: /\bSEGURADO\b/ },
    { key: 'corretor',      re: /\bCORRETOR\b/ },
    { key: 'premio',        re: /Pr[eê]mio\s*\(EM/i },
    { key: 'parcelamento',  re: /PARCELAMENTO\s*\(EM/i },
    { key: 'veiculo',       re: /VE[IÍ]CULO\s+ITEM\s+N\.?\s*:?/i },
    { key: 'coberturas',    re: /Coberturas?\s+Contratadas/i },
    { key: 'observacoes',   re: /OBSERVA[CÇ][OÕ]ES/i },
  ])

  const numero = reFirst(/Ap[oó]lice\s*N[uú]mero\s*:?\s*(\d+)/i, text)
                ?? reFirst(/Ap[oó]lice\s*:?\s*(\d{8,})/i, text)
  const proposta = reFirst(/N[uú]mero\s+da\s+Proposta\s*:?\s*(\d+)/i, text)
  const endosso = reFirst(/Endosso\s*:?\s*(\d+)/i, text)
  const dataEmissao = reFirst(/Dt\.?\s*Emiss[aã]o\s+Ap[oó]lice\s*:?\s*(\d{2}\/\d{2}\/\d{4})/i, text)
  const vig = pickVigencia(sections.vigencia || text)

  const segBlock = sections.segurado || ''
  const cliente_nome = clean(segBlock.match(/Nome\s*:?\s*([^\n]+)/i)?.[1])
                    ?? clean(segBlock.match(/Segurado\s*:?\s*([^\n]+)/i)?.[1])
  const cpf_cnpj = pickDocFromBlock(segBlock)
  const segurado_endereco = clean(segBlock.match(/Endere[cç]o\s*:?\s*([^\n]+)/i)?.[1])
  const segurado_cep = pickCep(segBlock)
  const segurado_cidade = clean(segBlock.match(/Cidade\s*:?\s*([^\n]+?)(?:\s+UF|\n)/i)?.[1])
  const segurado_uf = clean(segBlock.match(/UF\s*:?\s*([A-Z]{2})/i)?.[1])

  // Veículo
  const veicBlock = sections.veiculo || ''
  const fabricante = clean(veicBlock.match(/Fabricante\s*:?\s*([^\n]+?)(?:\s+Nr\s+Passageiro|\n)/i)?.[1])
  const veiculo = clean(veicBlock.match(/Ve[ií]culo\s*:?\s*([^\n]+?)(?:\s+Prefixo|\n)/i)?.[1])
  const placa = pickPlaca(veicBlock) || clean(veicBlock.match(/Licen[cç]a\s*:?\s*([A-Z0-9]+)/i)?.[1])
  const chassi = pickChassi(veicBlock)
  const ano_modelo = clean(veicBlock.match(/Fabrica[cç][aã]o\/Modelo\s*:?\s*([\d/]+)/i)?.[1])
  const passageirosStr = clean(veicBlock.match(/Nr\s+Passageiro\s*:?\s*(\d+)/i)?.[1])

  // Coberturas (lista de "nome: valor")
  const cobBlock = sections.coberturas || ''
  const coberturas: Array<{ nome: string; valor: number | null }> = []
  for (const linha of cobBlock.split('\n').map(l => l.trim()).filter(Boolean)) {
    const m = linha.match(/^(.+?)\s+R?\$?\s*(\d{1,3}(?:\.\d{3})*,\d{2})$/)
    if (m) coberturas.push({ nome: clean(m[1]) ?? '', valor: brNum(m[2]) })
  }

  const premBlock = sections.premio || ''
  const nums = listBrNumbers(premBlock)
  const premio_liquido = nums[0] ?? null
  const adicional_fracionamento = nums[1] ?? null
  const custo_apolice = nums[2] ?? null
  const iof = nums[3] ?? null
  const premio_total = nums.length >= 5 ? nums[nums.length - 1] : (nums[4] ?? null)

  const corBlock = sections.corretor || ''
  const corretor_nome = clean(corBlock.match(/Nome\s+do\s+Corretor\s*:?\s*([^\n]+?)(?:\s*C[oó]digo\s*Susep|\n)/i)?.[1])
                     ?? clean(corBlock.match(/Corretor\s*:?\s*([^\n]+)/i)?.[1])
  const corretor_susep = clean(corBlock.match(/C[oó]digo\s*Susep\s*:?\s*(\d+)/i)?.[1])

  return [{
    seguradora_origem: 'kovr',
    numero,
    proposta,
    endosso,
    data_emissao: toIso(dataEmissao),
    vigencia_ini: vig.ini,
    vigencia_fim: vig.fim,
    cliente_nome,
    cpf_cnpj,
    segurado_endereco,
    segurado_cep,
    segurado_cidade,
    segurado_uf,
    marca: fabricante,
    modelo: veiculo,
    ano_modelo,
    placa,
    chassi,
    nr_passageiros: passageirosStr ? Number(passageirosStr) : null,
    coberturas: coberturas.length ? coberturas : null,
    premio_liquido,
    adicional_fracionamento,
    custo_apolice,
    iof,
    premio_total,
    premio: premio_total ?? premio_liquido,
    corretor_nome,
    corretor_susep,
    processo_susep: pickProcessoSusep(text),
    produto: 'RC Transporte Coletivo Rodoviário',
    status_apolice: 'ativo',
    layout_pdf: 'kovr-rc-transporte',
    pdf_texto_bruto: truncateText(text),
  }]
}
