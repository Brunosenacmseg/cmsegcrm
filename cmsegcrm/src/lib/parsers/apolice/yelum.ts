// Parser de apólice Yelum (Auto Perfil).
// Layout descrito pelo usuário:
//   Cabeçalhos em barras amarelas. Estilo planilha: rótulos numa linha,
//   valores na linha seguinte. Vigência "Das 24:00hs de DD/MM/AAAA às 24:00hs de DD/MM/AAAA".

import {
  brNum, clean, splitSections, reFirst,
  pickDocFromBlock, pickEmail, pickTelefone, pickCep,
  pickPlaca, pickChassi, pickVigencia, truncateText, pickProcessoSusep,
  type ApoliceRow,
} from './_common'

export function parseYelum(text: string): ApoliceRow[] {
  const sections = splitSections(text, [
    { key: 'segurado',   re: /DADOS\s+DO\(A\)\s+SEGURADO\(A\)|DADOS\s+DO\s+SEGURADO/i },
    { key: 'apolice',    re: /DADOS\s+DA\s+APOLICE|DADOS\s+DA\s+AP[OÓ]LICE/i },
    { key: 'demonstrativo', re: /DEMONSTRATIVO\s+DE\s+PR[EÊ]MIO/i },
    { key: 'pagamento',  re: /FORMA\s+DE\s+PAGAMENTO/i },
    { key: 'veiculo',    re: /ITEM\s+0+1\s*-\s*DADOS\s+DO\s+VE[IÍ]CULO/i },
    { key: 'cobertura',  re: /DADOS\s+DO\s+SEGURO\/?COBERTURA|Coberturas\s+Contratadas/i },
    { key: 'perfil',     re: /DADOS\s+DO\s+PERFIL/i },
    { key: 'proprietario', re: /DADOS\s+DO\s+PROPRIET[AÁ]RIO/i },
    { key: 'corretor',   re: /DADOS\s+DO\s+CORRETOR/i },
  ])

  const apol = sections.apolice || text
  const numero = reFirst(/Ap[oó]lice\s*:?\s*(\d+)/i, apol)
  const endosso = reFirst(/Endosso\s*:?\s*(\d+)/i, apol)
  const proposta = reFirst(/Proposta\s*:?\s*(\d+)/i, apol)
  const contrato = reFirst(/N[ºo°]\s*do\s*Contrato\s*:?\s*(\d+)/i, apol)
  const dataEmissao = reFirst(/Data\s+de\s+Emiss[aã]o\s*:?\s*(\d{2}\/\d{2}\/\d{4})/i, apol)
  const vig = pickVigencia(apol || text)

  const segBlock = sections.segurado || ''
  const cliente_nome = clean(segBlock.match(/Nome\s*\n+\s*([^\n]+)/i)?.[1])
                    ?? clean(segBlock.match(/Nome\s*:?\s*([^\n]+)/i)?.[1])
  const cpf_cnpj = pickDocFromBlock(segBlock)
  const segurado_email = pickEmail(segBlock)
  const segurado_telefone = pickTelefone(segBlock)
  const segurado_cep = pickCep(segBlock)
  const segurado_endereco = clean(segBlock.match(/Endere[cç]o\s*:?\s*([^\n]+)/i)?.[1])
  const segurado_cidade = clean(segBlock.match(/Cidade\s*:?\s*([^\n]+?)(?:\s+UF|\n)/i)?.[1])
  const segurado_uf = clean(segBlock.match(/UF\s*:?\s*([A-Z]{2})/i)?.[1])

  const veicBlock = sections.veiculo || ''
  const veiculo = clean(veicBlock.match(/Marca\s*\/?\s*Tipo\s*:?\s*([^\n]+)/i)?.[1])
  const ano_modelo = reFirst(/Ano\s+Fab\s*\/?\s*Mod\s*:?\s*([\d/]+)/i, veicBlock)
  const placa = pickPlaca(veicBlock)
  const chassi = pickChassi(veicBlock)
  const cod_fipe = reFirst(/C[oó]digo\s+FIPE\s*:?\s*([\w-]+)/i, veicBlock)
  const cep_pernoite = clean(veicBlock.match(/CEP\s+Pernoite\s*:?\s*(\d{5}-?\d{3})/i)?.[1])
  const classe_bonus = reFirst(/Classe\s+B[oô]nus\s*:?\s*(\d+)/i, veicBlock)
  const utilizacao = clean(veicBlock.match(/Utiliza[cç][aã]o\s*:?\s*([^\n]+)/i)?.[1])

  // Coberturas
  const cobBlock = sections.cobertura || ''
  const coberturas: Array<{ nome: string; lmi: number | null; premio: number | null; franquia: number | null }> = []
  for (const linha of cobBlock.split('\n').map(l => l.trim()).filter(Boolean)) {
    if (/^(coberturas|cobertura\s)/i.test(linha)) continue
    const m = linha.match(/^(.+?)\s+R?\$?\s*(\d{1,3}(?:\.\d{3})*,\d{2})\s+R?\$?\s*(\d{1,3}(?:\.\d{3})*,\d{2})\s+R?\$?\s*(\d{1,3}(?:\.\d{3})*,\d{2})$/)
    if (m) coberturas.push({ nome: clean(m[1]) ?? '', lmi: brNum(m[2]), premio: brNum(m[3]), franquia: brNum(m[4]) })
  }

  // Demonstrativo
  const demo = sections.demonstrativo || ''
  const premio_liquido = brNum(reFirst(/Pr[eê]mio\s+L[ií]quido\s*:?\s*R?\$?\s*([\d.,]+)/i, demo))
  const adicional_franquia = brNum(reFirst(/Adic\.?\s*Franc\.?\s*:?\s*R?\$?\s*([\d.,]+)/i, demo))
  const custo_apolice = brNum(reFirst(/Custo\s+Ap[oó]lice\s*:?\s*R?\$?\s*([\d.,]+)/i, demo))
  const iof = brNum(reFirst(/\bIOF\s*:?\s*R?\$?\s*([\d.,]+)/i, demo))
  const juros = brNum(reFirst(/\bJuros\s*:?\s*R?\$?\s*([\d.,]+)/i, demo))
  const premio_total = brNum(reFirst(/Pr[eê]mio\s+Total\s*:?\s*R?\$?\s*([\d.,]+)/i, demo))

  // Forma de pagamento - "1+9(CC)" estilo
  const pag = sections.pagamento || ''
  const forma_pagamento = clean(pag.match(/Tipo\s+de\s+Cobran[cç]a\s*:?\s*([^\n]+)/i)?.[1])
                       ?? clean(pag.match(/Cart[aã]o|Boleto|D[eé]bito/i)?.[0])
  const qtd_parcelas = reFirst(/N[ºo°]\s*Parcelas\s*:?\s*(\d+)/i, pag)

  // Perfil / condutor
  const perfilBlock = sections.perfil || ''
  const condutor_nome = clean(perfilBlock.match(/Nome\s+do\s+Principal\s+Condutor\s*:?\s*([^\n]+)/i)?.[1])
  const condutor_cpf = clean(perfilBlock.match(/CPF\s+Condutor\s*:?\s*([\d.\-]+)/i)?.[1])?.replace(/\D/g, '') ?? null

  // Corretor
  const corBlock = sections.corretor || ''
  const corretor_nome = clean(corBlock.match(/Corretor\s*:?\s*([^\n]+)/i)?.[1])
  const corretor_cnpj = pickDocFromBlock(corBlock)
  const corretor_susep = clean(corBlock.match(/C[oó]d\s*SUSEP\s*:?\s*(\d+)/i)?.[1])
  const corretor_cod_yelum = clean(corBlock.match(/C[oó]d\s*Yelum\s*:?\s*(\d+)/i)?.[1])

  return [{
    seguradora_origem: 'yelum',
    numero,
    endosso,
    proposta,
    contrato,
    data_emissao: dataEmissao,
    vigencia_ini: vig.ini,
    vigencia_fim: vig.fim,
    cliente_nome,
    cpf_cnpj,
    segurado_email,
    segurado_telefone,
    segurado_cep,
    segurado_endereco,
    segurado_cidade,
    segurado_uf,
    condutor_nome,
    condutor_cpf,
    modelo: veiculo,
    ano_modelo,
    placa,
    chassi,
    cod_fipe,
    cep_pernoite,
    classe_bonus: classe_bonus ? Number(classe_bonus) : null,
    utilizacao_veiculo: utilizacao,
    coberturas: coberturas.length ? coberturas : null,
    premio_liquido,
    adicional_fracionamento: adicional_franquia,
    custo_apolice,
    iof,
    juros,
    premio_total,
    premio: premio_total ?? premio_liquido,
    forma_pagamento,
    qtd_parcelas: qtd_parcelas ? Number(qtd_parcelas) : null,
    corretor_nome,
    corretor_cnpj,
    corretor_susep,
    corretor_cod_interno: corretor_cod_yelum,
    processo_susep: pickProcessoSusep(text),
    produto: 'Auto Yelum Perfil',
    status_apolice: 'ativo',
    layout_pdf: 'yelum-auto',
    pdf_texto_bruto: truncateText(text),
  }]
}
