// Parser de apólice MAPFRE Auto.
// Layout descrito pelo usuário:
//   Faixa vermelha no topo. Títulos com barra vertical vermelha + texto MAIÚSCULO.
//   Seções: DADOS GERAIS, DADOS DA SEGURADORA, DADOS DA SUCURSAL,
//   DADOS DO CORRETOR, DADOS DO SEGURADO, QUESTIONÁRIO, DADOS DO VEÍCULO,
//   COBERTURAS CONTRATADAS, FRANQUIA, DEMONSTRATIVO DE PRÊMIO, PAGAMENTO.

import {
  brNum, clean, splitSections, reFirst, toIso,
  pickDocFromBlock, pickEmail, pickTelefone, pickCep,
  pickPlaca, pickChassi, pickVigencia, truncateText, pickProcessoSusep,
  type ApoliceRow,
} from './_common'

export function parseMapfre(text: string): ApoliceRow[] {
  const sections = splitSections(text, [
    { key: 'gerais',     re: /DADOS\s+GERAIS/i },
    { key: 'corretor',   re: /DADOS\s+DO\s+CORRETOR/i },
    { key: 'segurado',   re: /DADOS\s+DO\s+SEGURADO/i },
    { key: 'questionario', re: /QUESTION[AÁ]RIO\s+DE\s+AVALIA[CÇ][AÃ]O/i },
    { key: 'veiculo',    re: /DADOS\s+DO\s+VE[IÍ]CULO/i },
    { key: 'coberturas', re: /COBERTURAS\s+CONTRATADAS/i },
    { key: 'franquia',   re: /\bFRANQUIA\b/i },
    { key: 'demonstrativo', re: /DEMONSTRATIVO\s+DE\s+PR[EÊ]MIO/i },
    { key: 'pagamento',  re: /PAGAMENTO\s+DO\s+PR[EÊ]MIO|VENCIMENTO\s+DAS\s+PARCELAS/i },
  ])

  const numero = reFirst(/Ap[oó]lice\s*:?\s*(\d{8,})/i, text)
  const ci = reFirst(/CI\s*:?\s*(\d+)/i, text)
  const proposta = reFirst(/Proposta\s*:?\s*(\d+)/i, text)
  const vig = pickVigencia(text)

  const segBlock = sections.segurado || ''
  const cliente_nome = clean(segBlock.match(/Nome\s*:?\s*([^\n]+)/i)?.[1])
  const cpf_cnpj = pickDocFromBlock(segBlock)
  const segurado_email = pickEmail(segBlock)
  const segurado_telefone = pickTelefone(segBlock)
  const segurado_cep = pickCep(segBlock)
  const segurado_endereco = clean(segBlock.match(/Endere[cç]o\s*:?\s*([^\n]+)/i)?.[1])
  const data_nascimento = clean(segBlock.match(/Data\s+Nasc\.?\s*:?\s*(\d{2}\/\d{2}\/\d{4})/i)?.[1])
  const sexo = clean(segBlock.match(/Sexo\s*:?\s*([MF])\b/i)?.[1])
  const estado_civil = clean(segBlock.match(/Estado\s+Civil\s*:?\s*([^\n]+)/i)?.[1])

  const veicBlock = sections.veiculo || ''
  const veiculo = clean(veicBlock.match(/Ve[ií]culo\s*:?\s*([^\n]+)/i)?.[1])
  const ano_modelo = reFirst(/Ano\s+Modelo\s*:?\s*([\d/]+)/i, veicBlock)
  const placa = pickPlaca(veicBlock)
  const chassi = pickChassi(veicBlock)
  const zero_km = reFirst(/0\s*Km\s*:?\s*(Sim|N[aã]o)/i, veicBlock)
  const cep_pernoite = clean(sections.questionario?.match(/CEP\s+pernoite\s*:?\s*(\d{5}-?\d{3})/i)?.[1])
  const classe_bonus = reFirst(/Classe\s+B[oô]nus\s*:?\s*(\d+)/i, veicBlock)

  const questBlock = sections.questionario || ''
  const condutor_nome = clean(questBlock.match(/Nome\s+Condutor\s*:?\s*([^\n]+)/i)?.[1])

  // Coberturas
  const cobBlock = sections.coberturas || ''
  const coberturas: Array<{ nome: string; lmi: number | null; premio: number | null }> = []
  for (const linha of cobBlock.split('\n').map(l => l.trim()).filter(Boolean)) {
    if (/^(coberturas|cobertura\s)/i.test(linha)) continue
    const m = linha.match(/^(.+?)\s+R?\$?\s*(\d{1,3}(?:\.\d{3})*,\d{2})\s+R?\$?\s*(\d{1,3}(?:\.\d{3})*,\d{2})$/)
    if (m) coberturas.push({ nome: clean(m[1]) ?? '', lmi: brNum(m[2]), premio: brNum(m[3]) })
  }

  // Demonstrativo
  const demo = sections.demonstrativo || ''
  const premio_liquido = brNum(reFirst(/Pr[eê]mio\s+L[ií]quido\s*:?\s*R?\$?\s*([\d.,]+)/i, demo))
  const encargos = brNum(reFirst(/Encargos?\s*:?\s*R?\$?\s*([\d.,]+)/i, demo))
  const iof = brNum(reFirst(/\bIOF\s*:?\s*R?\$?\s*([\d.,]+)/i, demo))
  const premio_total = brNum(reFirst(/Pr[eê]mio\s+Total\s*:?\s*R?\$?\s*([\d.,]+)/i, demo))

  // Pagamento — tabela de parcelas com vencimentos
  const pag = sections.pagamento || ''
  const parcelas: Array<Record<string, any>> = []
  const re = /(?:^|\n)\s*(\d{1,2})\s+(\d{2}\/\d{2}\/\d{4})\s+R?\$?\s*(\d{1,3}(?:\.\d{3})*,\d{2})/gm
  let pm: RegExpExecArray | null
  while ((pm = re.exec(pag)) !== null) {
    parcelas.push({ numero: Number(pm[1]), vencimento: toIso(pm[2]), valor: brNum(pm[3]) })
  }

  // Corretor
  const corBlock = sections.corretor || ''
  const corretor_nome = clean(corBlock.match(/Nome\s*:?\s*([^\n]+)/i)?.[1])
  const corretor_susep = clean(corBlock.match(/SUSEP\s*:?\s*(\d+)/i)?.[1])

  return [{
    seguradora_origem: 'mapfre',
    numero,
    proposta,
    codigo_ci: ci,
    cliente_nome,
    cpf_cnpj,
    segurado_email,
    segurado_telefone,
    segurado_cep,
    segurado_endereco,
    data_nascimento: toIso(data_nascimento),
    sexo,
    segurado_estado_civil: estado_civil,
    condutor_nome,
    modelo: veiculo,
    ano_modelo,
    placa,
    chassi,
    zero_km,
    cep_pernoite,
    classe_bonus: classe_bonus ? Number(classe_bonus) : null,
    vigencia_ini: vig.ini,
    vigencia_fim: vig.fim,
    coberturas: coberturas.length ? coberturas : null,
    premio_liquido,
    adicional_fracionamento: encargos,
    iof,
    premio_total,
    premio: premio_total ?? premio_liquido,
    parcelas: parcelas.length ? parcelas : null,
    corretor_nome,
    corretor_susep,
    processo_susep: pickProcessoSusep(text),
    produto: 'Auto Mapfre',
    status_apolice: 'ativo',
    layout_pdf: 'mapfre-auto',
    pdf_texto_bruto: truncateText(text),
  }]
}
