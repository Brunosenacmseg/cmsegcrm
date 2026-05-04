// Parser de apólice Youse / Caixa Seguradora.
// Layout descrito pelo usuário:
//   ATENÇÃO: Vigência de 24 MESES (não 12). Valores das tabelas principais
//   são MENSAIS (multiplicar por 24 ou usar o total do final).
//   Layout em duas colunas: rótulo numa linha, valor na de baixo.

import {
  brNum, clean, splitSections, reFirst,
  pickDocFromBlock, pickEmail, pickTelefone, pickCep,
  pickPlaca, pickChassi, pickVigencia, truncateText, pickProcessoSusep,
  type ApoliceRow,
} from './_common'

export function parseYouse(text: string): ApoliceRow[] {
  const sections = splitSections(text, [
    { key: 'segurado',   re: /Seus\s+dados/i },
    { key: 'veiculo',    re: /Dados\s+do\s+seu\s+ve[ií]culo/i },
    { key: 'questionario', re: /Question[aá]rio/i },
    { key: 'coberturas', re: /Suas\s+coberturas\s+e\s+os\s+Limites/i },
    { key: 'pagamento',  re: /Condi[cç][õo]es\s+de\s+pagamento|Dados\s+do\s+cart[aã]o/i },
    { key: 'seguradora', re: /Dados\s+da\s+Seguradora/i },
    { key: 'corretora',  re: /Dados\s+da\s+Corretora/i },
  ])

  const numero = reFirst(/N[ºo°]\s*da\s*ap[oó]lice\s*[:\n]\s*(\S+)/i, text)
                ?? reFirst(/N[ºo°]\s*ap[oó]lice\s*[:\n]\s*(\S+)/i, text)
  const proposta = reFirst(/N[ºo°]\s*da\s*proposta\s*[:\n]\s*(\S+)/i, text)
  const protocolo = reFirst(/N[ºo°]\s*do\s*protocolo\s*[:\n]\s*(\S+)/i, text)
  const dataEmissao = reFirst(/Data\s+e\s+hora\s+da\s+emiss[aã]o\s*[:\n]\s*([^\n]+)/i, text)

  const vig = pickVigencia(text)

  const segBlock = sections.segurado || ''
  const cliente_nome = clean(segBlock.match(/Nome\s+do\s+registro\s+civil\s*\n+\s*([^\n]+)/i)?.[1])
                    ?? clean(segBlock.match(/Nome\s*\n+\s*([^\n]+)/i)?.[1])
  const cpf_cnpj = pickDocFromBlock(segBlock)
  const segurado_email = pickEmail(segBlock)
  const segurado_telefone = pickTelefone(segBlock)
  const segurado_cep = pickCep(segBlock)
  const segurado_endereco = clean(segBlock.match(/Endere[cç]o\s*\n+\s*([^\n]+)/i)?.[1])
                         ?? clean(segBlock.match(/Endere[cç]o\s*:?\s*([^\n]+)/i)?.[1])
  const segurado_cidade = clean(segBlock.match(/Cidade\s*\n+\s*([^\n]+)/i)?.[1])
                       ?? clean(segBlock.match(/Cidade\s*:?\s*([^\n]+?)(?:\s+UF|\n)/i)?.[1])
  const segurado_uf = clean(segBlock.match(/UF\s*\n+\s*([A-Z]{2})/i)?.[1])
                   ?? clean(segBlock.match(/UF\s*:?\s*([A-Z]{2})/i)?.[1])

  const veicBlock = sections.veiculo || ''
  const marca = clean(veicBlock.match(/Marca\s*\n+\s*([^\n]+)/i)?.[1])
             ?? clean(veicBlock.match(/Marca\s*:?\s*([^\n]+)/i)?.[1])
  const veiculo = clean(veicBlock.match(/Modelo\s*\n+\s*([^\n]+)/i)?.[1])
               ?? clean(veicBlock.match(/Modelo\s*:?\s*([^\n]+)/i)?.[1])
  const ano_modelo = reFirst(/Ano\s+modelo\s*\n+\s*(\d{4})/i, veicBlock)
                   ?? reFirst(/Ano\s+modelo\s*:?\s*(\d{4})/i, veicBlock)
  const placa = pickPlaca(veicBlock)
  const chassi = pickChassi(veicBlock)
  const cod_fipe = reFirst(/C[oó]d\.?\s*Tabela\s*FIPE\s*\n+\s*([\w-]+)/i, veicBlock)
                 ?? reFirst(/FIPE\s*:?\s*([\w-]+)/i, veicBlock)
  const cep_pernoite = clean(veicBlock.match(/CEP\s+de\s+pernoite\s*\n+\s*(\d{5}-?\d{3})/i)?.[1])
                    ?? clean(veicBlock.match(/CEP\s+de\s+pernoite\s*:?\s*(\d{5}-?\d{3})/i)?.[1])

  // Coberturas — tabela com 4 colunas
  const cobBlock = sections.coberturas || ''
  const coberturas: Array<{ nome: string; lmi: string | null; premio_mensal: number | null }> = []
  for (const linha of cobBlock.split('\n').map(l => l.trim()).filter(Boolean)) {
    if (/^(coberturas|cobertura\s|total\s+pr[eê]mio)/i.test(linha)) continue
    const m = linha.match(/^(.+?)\s+(R?\$?\s?[\d.,A-Z%]+)\s+R?\$?\s*(\d{1,3}(?:\.\d{3})*,\d{2})$/)
    if (m) coberturas.push({ nome: clean(m[1]) ?? '', lmi: clean(m[2]) ?? null, premio_mensal: brNum(m[3]) })
  }

  // Valores: a Youse mostra MENSAIS — capturamos os totais e os mensais
  const premio_mensal_liquido = brNum(reFirst(/Total\s+pr[eê]mio\s+l[ií]quido\s*\/\s*m[eê]s\s*[:\n]\s*R?\$?\s*([\d.,]+)/i, text))
  const iof_mensal = brNum(reFirst(/IOF\s*\/\s*m[eê]s\s*[:\n]\s*R?\$?\s*([\d.,]+)/i, text))
  const premio_mensal_total = brNum(reFirst(/Pr[eê]mio\s+total\s+do\s+seguro\s*\/\s*m[eê]s\s*[:\n]\s*R?\$?\s*([\d.,]+)/i, text))
  // Total para 24 meses (página 7 ou texto livre)
  const premio_total = brNum(reFirst(/Total\s+(?:do\s+seguro|para\s+24\s+meses?)\s*[:\n]\s*R?\$?\s*([\d.,]+)/i, text))
                    ?? (premio_mensal_total != null ? premio_mensal_total * 24 : null)

  const pag = sections.pagamento || ''
  const cartao = clean(pag.match(/N[uú]mero\s+do\s+cart[aã]o\s*\n+\s*([\d*\s-]+)/i)?.[1])
              ?? clean(pag.match(/Cart[aã]o\s*:?\s*([\d*\s-]+)/i)?.[1])
  const titular_cartao = clean(pag.match(/Nome\s+do\s+titular\s*\n+\s*([^\n]+)/i)?.[1])
  const periodicidade = clean(pag.match(/Periodicidade\s*\n+\s*([^\n]+)/i)?.[1])
                     ?? clean(pag.match(/Periodicidade\s*:?\s*([^\n]+)/i)?.[1])

  // Corretora
  const corBlock = sections.corretora || ''
  const corretor_nome = clean(corBlock.match(/Nome\s+do\s+Corretor\s*\n+\s*([^\n]+)/i)?.[1])
                     ?? clean(corBlock.match(/Nome\s*:?\s*([^\n]+)/i)?.[1])
  const corretor_susep = clean(corBlock.match(/Susep\s*\n+\s*(\d+)/i)?.[1])
                      ?? clean(corBlock.match(/SUSEP\s*:?\s*(\d+)/i)?.[1])

  return [{
    seguradora_origem: 'youse',
    numero,
    proposta,
    protocolo,
    data_emissao: dataEmissao,
    vigencia_ini: vig.ini,
    vigencia_fim: vig.fim,
    vigencia_meses: 24, // Youse é sempre 24 meses
    cliente_nome,
    cpf_cnpj,
    segurado_email,
    segurado_telefone,
    segurado_cep,
    segurado_endereco,
    segurado_cidade,
    segurado_uf,
    marca,
    modelo: veiculo,
    ano_modelo,
    placa,
    chassi,
    cod_fipe,
    cep_pernoite,
    coberturas: coberturas.length ? coberturas : null,
    premio_liquido_mensal: premio_mensal_liquido,
    iof_mensal,
    premio_total_mensal: premio_mensal_total,
    premio_total,                      // total p/ 24 meses
    premio: premio_total ?? null,
    forma_pagamento: 'Cartão de crédito mensal',
    periodicidade: periodicidade ?? 'Mensal',
    cartao_mascarado: cartao,
    titular_cartao,
    corretor_nome,
    corretor_susep,
    processo_susep: pickProcessoSusep(text),
    produto: 'Auto Youse',
    status_apolice: 'ativo',
    layout_pdf: 'youse-auto',
    pdf_texto_bruto: truncateText(text),
  }]
}
