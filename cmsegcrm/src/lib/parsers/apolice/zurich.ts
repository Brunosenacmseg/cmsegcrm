// Parser de apólice Zurich Automóvel Individual.
// Layout descrito pelo usuário:
//   Formulário com bordas. Vigência "24hs do dia DD de MÊS de AAAA".
//   Tabela de parcelas BIDIMENSIONAL (2 colunas paralelas) — atenção.

import {
  brNum, clean, splitSections, reFirst, toIso, listBrNumbers,
  pickDocFromBlock, pickEmail, pickTelefone, pickCep,
  pickPlaca, pickChassi, pickVigencia, truncateText, pickProcessoSusep,
  type ApoliceRow,
} from './_common'

const MESES: Record<string, string> = {
  janeiro: '01', fevereiro: '02', marco: '03', abril: '04', maio: '05',
  junho: '06', julho: '07', agosto: '08', setembro: '09', outubro: '10',
  novembro: '11', dezembro: '12',
}

function parseZurichDate(s: string): string | null {
  // "24hs do dia 15 de janeiro de 2026"
  const m = s.match(/(\d{1,2})\s+de\s+([a-zç]+)\s+de\s+(\d{4})/i)
  if (!m) return null
  const dia = m[1].padStart(2, '0')
  const mes = MESES[m[2].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')]
  return mes ? `${m[3]}-${mes}-${dia}` : null
}

export function parseZurich(text: string): ApoliceRow[] {
  const sections = splitSections(text, [
    { key: 'segurado',     re: /Dados\s+do\s+Segurado/i },
    { key: 'risco',        re: /Dados\s+do\s+Risco/i },
    { key: 'questionario', re: /Question[aá]rio\s+Perfil\s+Condutor/i },
    { key: 'coberturas',   re: /\bCoberturas\b/i },
    { key: 'clausulas',    re: /\bCl[aá]usulas\b/i },
    { key: 'conta',        re: /Conta\s+do\s+Pr[eê]mio/i },
    { key: 'pagamento',    re: /Plano\s+de\s+Pagamento\s+do\s+Pr[eê]mio/i },
    { key: 'vigencia',     re: /Vig[eê]ncia\s+do\s+Seguro/i },
  ])

  const numero = reFirst(/Ap[oó]lice\s*:?\s*(\S+)/i, text)
  const endosso = reFirst(/Endosso\s*:?\s*(\d+)/i, text)
  const proposta = reFirst(/Proposta\s*:?\s*(\d+)/i, text)
  const ramo = reFirst(/Grupo\s*\/?\s*Ramo\s*:?\s*([\d/]+)/i, text)

  const vigBlock = sections.vigencia || text
  const inicioMatch = vigBlock.match(/In[ií]cio[\s\S]{0,80}?(\d{1,2}\s+de\s+\w+\s+de\s+\d{4})/i)?.[1]
  const fimMatch = vigBlock.match(/T[eé]rmino[\s\S]{0,80}?(\d{1,2}\s+de\s+\w+\s+de\s+\d{4})/i)?.[1]
  const vigDigit = pickVigencia(text)
  const vigencia_ini = (inicioMatch && parseZurichDate(inicioMatch)) || vigDigit.ini
  const vigencia_fim = (fimMatch && parseZurichDate(fimMatch)) || vigDigit.fim

  const segBlock = sections.segurado || ''
  const cliente_nome = clean(segBlock.match(/Nome\s+Completo\s*:?\s*([^\n]+)/i)?.[1])
                    ?? clean(segBlock.match(/Nome\s*:?\s*([^\n]+)/i)?.[1])
  const cpf_cnpj = pickDocFromBlock(segBlock)
  const data_nascimento = clean(segBlock.match(/Data\s+de\s+nascimento\s*:?\s*(\d{2}\/\d{2}\/\d{4})/i)?.[1])
  const sexo = clean(segBlock.match(/Sexo\s*:?\s*([MF])\b/i)?.[1])
  const estado_civil = clean(segBlock.match(/Estado\s+Civil\s*:?\s*([^\n]+)/i)?.[1])
  const segurado_endereco = clean(segBlock.match(/Endere[cç]o\s*:?\s*([^\n]+)/i)?.[1])
  const segurado_bairro = clean(segBlock.match(/Bairro\s*:?\s*([^\n]+)/i)?.[1])
  const segurado_cidade = clean(segBlock.match(/Cidade\s*:?\s*([^\n]+)/i)?.[1])
  const segurado_uf = clean(segBlock.match(/UF\s*:?\s*([A-Z]{2})/i)?.[1])
  const segurado_cep = pickCep(segBlock)

  const riscoBlock = sections.risco || ''
  const veiculo = clean(riscoBlock.match(/Ve[ií]culo\s*:?\s*([^\n]+)/i)?.[1])
  const ano_modelo = reFirst(/Ano\s*\/?\s*Modelo\s*:?\s*([\d/]+)/i, riscoBlock)
  const placa = pickPlaca(riscoBlock)
  const chassi = pickChassi(riscoBlock)
  const renavam = reFirst(/Renavam\s*:?\s*(\d+)/i, riscoBlock)
  const cod_fipe = reFirst(/C[oó]digo\s*:?\s*([\w-]+)/i, riscoBlock)
  const combustivel = reFirst(/Combust[ií]vel\s*:?\s*([^\n]+)/i, riscoBlock)
  const cep_pernoite = clean(riscoBlock.match(/CEP\s+de\s+pernoite\s*:?\s*(\d{5}-?\d{3})/i)?.[1])
  const classe_bonus = reFirst(/Classe\s+de\s+B[oô]nus\s*:?\s*(\d+)/i, riscoBlock)

  // Coberturas
  const cobBlock = sections.coberturas || ''
  const coberturas: Array<{ nome: string; lmg: number | null; franquia: number | null; premio: number | null }> = []
  for (const linha of cobBlock.split('\n').map(l => l.trim()).filter(Boolean)) {
    if (/^(coberturas|descri[cç][aã]o)/i.test(linha)) continue
    const m = linha.match(/^(.+?)\s+R?\$?\s*(\d{1,3}(?:\.\d{3})*,\d{2})\s+R?\$?\s*(\d{1,3}(?:\.\d{3})*,\d{2})\s+R?\$?\s*(\d{1,3}(?:\.\d{3})*,\d{2})$/)
    if (m) coberturas.push({ nome: clean(m[1]) ?? '', lmg: brNum(m[2]), franquia: brNum(m[3]), premio: brNum(m[4]) })
  }

  // Conta do prêmio
  const conta = sections.conta || ''
  const premio_auto = brNum(reFirst(/Pr[eê]mio\s+Auto\s*:?\s*R?\$?\s*([\d.,]+)/i, conta))
  const premio_rcv = brNum(reFirst(/Pr[eê]mio\s+RCV\s*:?\s*R?\$?\s*([\d.,]+)/i, conta))
  const premio_app = brNum(reFirst(/Pr[eê]mio\s+APP\s*:?\s*R?\$?\s*([\d.,]+)/i, conta))
  const premio_liquido = brNum(reFirst(/Pr[eê]mio\s+l[ií]quido\s*:?\s*R?\$?\s*([\d.,]+)/i, conta))
  const custo_apolice = brNum(reFirst(/Custo\s+de\s+Emiss[aã]o\s*:?\s*R?\$?\s*([\d.,]+)/i, conta))
  const juros = brNum(reFirst(/Juros\s*:?\s*R?\$?\s*([\d.,]+)/i, conta))
  const iof = brNum(reFirst(/\bIOF\s*:?\s*R?\$?\s*([\d.,]+)/i, conta))
  const premio_total = brNum(reFirst(/Pr[eê]mio\s+Total\s*:?\s*R?\$?\s*([\d.,]+)/i, conta))

  // Plano de pagamento — duas colunas paralelas. Capturamos todas as parcelas.
  const pag = sections.pagamento || ''
  const forma_pagamento = clean(pag.match(/Forma\s+de\s+Pagamento\s*:?\s*([^\n]+)/i)?.[1])
  const titular_cartao = clean(pag.match(/Titular\s+Cart[aã]o\s*:?\s*([^\n]+)/i)?.[1])
  const cartao = clean(pag.match(/N[uú]mero\s+Cart[aã]o\s*:?\s*([\d*\s-]+)/i)?.[1])
  const parcelas: Array<Record<string, any>> = []
  const re = /(?:^|\n)\s*(\d{1,2})\s+(\d{2}\/\d{2}\/\d{4})\s+R?\$?\s*(\d{1,3}(?:\.\d{3})*,\d{2})/gm
  let pm: RegExpExecArray | null
  while ((pm = re.exec(pag)) !== null) {
    parcelas.push({ numero: Number(pm[1]), vencimento: toIso(pm[2]), valor: brNum(pm[3]) })
  }

  // Corretor
  const corretor_nome = clean(text.match(/Corretor:\s*[\d\s]*([A-ZÀ-Ÿ][^\n]+?)(?:\s+Inspetor|\n)/i)?.[1])
  const corretor_susep = clean(text.match(/Inspetor:\s*SUSEP\s*:?\s*(\d+)/i)?.[1])

  return [{
    seguradora_origem: 'zurich',
    numero,
    proposta,
    endosso,
    ramo_codigo: ramo,
    cliente_nome,
    cpf_cnpj,
    data_nascimento: toIso(data_nascimento),
    sexo,
    segurado_estado_civil: estado_civil,
    segurado_endereco,
    segurado_bairro,
    segurado_cidade,
    segurado_uf,
    segurado_cep,
    modelo: veiculo,
    ano_modelo,
    placa,
    chassi,
    renavam,
    cod_fipe,
    combustivel,
    cep_pernoite,
    classe_bonus: classe_bonus ? Number(classe_bonus) : null,
    vigencia_ini,
    vigencia_fim,
    coberturas: coberturas.length ? coberturas : null,
    premio_auto,
    premio_rcv,
    premio_app,
    premio_liquido,
    custo_apolice,
    juros,
    iof,
    premio_total,
    premio: premio_total ?? premio_liquido,
    forma_pagamento,
    titular_cartao,
    cartao_mascarado: cartao,
    parcelas: parcelas.length ? parcelas : null,
    corretor_nome,
    corretor_susep,
    processo_susep: pickProcessoSusep(text),
    produto: 'Auto Zurich',
    status_apolice: 'ativo',
    layout_pdf: 'zurich-auto',
    pdf_texto_bruto: truncateText(text),
  }]
}
