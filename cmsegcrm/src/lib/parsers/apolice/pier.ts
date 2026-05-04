// Parser de "Contrato" Pier (chamado de "Contrato", não "Apólice").
// Layout descrito pelo usuário:
//   Design moderno e simples. Tudo na página 1 em blocos.
//   Apólice formato "01202601053106949679".

import {
  brNum, clean, splitSections, reFirst, toIso,
  pickDocFromBlock, pickEmail, pickTelefone, pickCep,
  pickPlaca, pickChassi, pickVigencia, truncateText, pickProcessoSusep,
  type ApoliceRow,
} from './_common'

export function parsePier(text: string): ApoliceRow[] {
  const sections = splitSections(text, [
    { key: 'contrato',   re: /Seu\s+Contrato/i },
    { key: 'segurado',   re: /Seus\s+Dados/i },
    { key: 'carro',      re: /Seu\s+Carro/i },
    { key: 'plano',      re: /Seu\s+Plano/i },
    { key: 'coberturas', re: /Suas\s+Coberturas/i },
    { key: 'servicos',   re: /Seus\s+Servi[cç]os/i },
    { key: 'corretor',   re: /Corretor/i },
  ])

  const contBlock = sections.contrato || text
  const numero = reFirst(/Ap[oó]lice\s*:?\s*(\d{15,})/i, contBlock)
                ?? reFirst(/Ap[oó]lice\s*:?\s*(\S+)/i, contBlock)
  const codigoCi = reFirst(/CI\s*:?\s*(\S+)/i, contBlock)
  const classe_bonus = reFirst(/Classe\s+B[oô]nus\s*:?\s*(\d+)/i, contBlock)
  const vig = pickVigencia(contBlock || text)
  const dataEmissao = clean(contBlock.match(/Emiss[aã]o\s*:?\s*(\d{2}\/\d{2}\/\d{4})/i)?.[1])

  const segBlock = sections.segurado || ''
  const cliente_nome = clean(segBlock.match(/Segurado\s*:?\s*([^\n]+)/i)?.[1])
  const cpf_cnpj = pickDocFromBlock(segBlock)
  const segurado_telefone = pickTelefone(segBlock)
  const segurado_email = pickEmail(segBlock)
  const segurado_cep = pickCep(segBlock)
  const garagem = clean(segBlock.match(/Garagem\s*:?\s*([^\n]+)/i)?.[1])

  const carBlock = sections.carro || ''
  const placa = pickPlaca(carBlock)
  const chassi = pickChassi(carBlock)
  const marca = clean(carBlock.match(/Marca\s*:?\s*([^\n]+)/i)?.[1])
  const veiculo = clean(carBlock.match(/Modelo\s*:?\s*([^\n]+)/i)?.[1])
  const ano_modelo = reFirst(/Ano\s*:?\s*(\d{4})/i, carBlock)
  const blindagem = reFirst(/Blindagem\s*:?\s*(Sim|N[aã]o)/i, carBlock)
  const kit_gas = reFirst(/Kit\s*G[aá]s\s*:?\s*(Sim|N[aã]o)/i, carBlock)

  // Plano
  const planBlock = sections.plano || ''
  const premio_liquido = brNum(reFirst(/Pr[eê]mio\s+L[ií]quido\s*:?\s*R?\$?\s*([\d.,]+)/i, planBlock))
  const iof = brNum(reFirst(/\bIOF\s*:?\s*R?\$?\s*([\d.,]+)/i, planBlock))
  const premio_total = brNum(reFirst(/Pr[eê]mio\s+Total\s*:?\s*R?\$?\s*([\d.,]+)/i, planBlock))
  const forma_pagamento = clean(planBlock.match(/Forma\s+Pagamento\s*:?\s*([^\n]+)/i)?.[1])
  const custeio = clean(planBlock.match(/Custeio\s*:?\s*([^\n]+)/i)?.[1])

  // Coberturas
  const cobBlock = sections.coberturas || ''
  const coberturas: Array<{ nome: string; capital: string | null; premio: number | null }> = []
  for (const linha of cobBlock.split('\n').map(l => l.trim()).filter(Boolean)) {
    if (/^(suas?\s+coberturas)/i.test(linha)) continue
    const m = linha.match(/^(.+?)\s+R?\$?\s*([\d.,]+|[A-Z][^\n]*)\s+R?\$?\s*(\d{1,3}(?:\.\d{3})*,\d{2})/)
    if (m) coberturas.push({ nome: clean(m[1]) ?? '', capital: clean(m[2]) ?? null, premio: brNum(m[3]) })
  }

  // Corretor
  const corBlock = sections.corretor || ''
  const corretor_nome = clean(corBlock.match(/Corretor\s*:?\s*([^\n]+)/i)?.[1])
  const corretor_susep = clean(corBlock.match(/SUSEP\s*:?\s*(\d+)/i)?.[1])

  return [{
    seguradora_origem: 'pier',
    numero,
    codigo_ci: codigoCi,
    classe_bonus: classe_bonus ? Number(classe_bonus) : null,
    data_emissao: toIso(dataEmissao),
    cliente_nome,
    cpf_cnpj,
    segurado_telefone,
    segurado_email,
    segurado_cep,
    garagem,
    marca,
    modelo: veiculo,
    ano_modelo,
    placa,
    chassi,
    blindagem,
    kit_gas,
    vigencia_ini: vig.ini,
    vigencia_fim: vig.fim,
    coberturas: coberturas.length ? coberturas : null,
    premio_liquido,
    iof,
    premio_total,
    premio: premio_total ?? premio_liquido,
    forma_pagamento,
    custeio,
    corretor_nome,
    corretor_susep,
    processo_susep: pickProcessoSusep(text),
    produto: 'Auto Pier',
    status_apolice: 'ativo',
    layout_pdf: 'pier-contrato',
    pdf_texto_bruto: truncateText(text),
  }]
}
