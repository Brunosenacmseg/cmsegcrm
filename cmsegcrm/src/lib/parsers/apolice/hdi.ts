// Parser de apólice HDI Auto Perfil.
// Layout descrito pelo usuário:
//   Títulos em negrito + linhas separadoras. Padrão "label : valor" (com 2 pontos).
//   Apólice formato "01.049.431.218814".

import {
  brNum, clean, splitSections, reFirst, toIso,
  pickDocFromBlock, pickEmail, pickTelefone, pickCep,
  pickPlaca, pickChassi, pickVigencia, truncateText, pickProcessoSusep,
  type ApoliceRow,
} from './_common'

export function parseHdi(text: string): ApoliceRow[] {
  const sections = splitSections(text, [
    { key: 'corretor',    re: /\bCorretor\b/i },
    { key: 'segurado',    re: /Dados\s+do\s+Segurado|Propon?ente|Nome\s+de\s+Registro/i },
    { key: 'vigencia',    re: /Per[ií]odo\s+de\s+Vig[eê]ncia/i },
    { key: 'cobranca',    re: /Dados\s+de\s+Cobran[cç]a/i },
    { key: 'premio',      re: /C[aá]lculo\s+do\s+Pr[eê]mio|Pr[eê]mio\s+da\s+Ap[oó]lice/i },
    { key: 'parcelamento', re: /Parcelamento\s+do\s+Pr[eê]mio/i },
    { key: 'veiculo',     re: /Dados\s+do\s+Ve[ií]culo|Item\s+0+1/i },
    { key: 'coberturas',  re: /Coberturas?\s+Auto/i },
    { key: 'condutor',    re: /\bCondutor\b/i },
  ])

  const numero = reFirst(/N[ºo°]\s*da\s*Ap[oó]lice\s*:?\s*([\d./\-]+)/i, text)
                ?? reFirst(/Ap[oó]lice\s*:?\s*([\d./\-]+)/i, text)
  const proposta = reFirst(/N[ºo°]\s*da\s*Proposta\s*:?\s*([\d./\-]+)/i, text)
  const endosso = reFirst(/Endosso\s*:?\s*(\d+)/i, text)

  const segBlock = sections.segurado || ''
  const cliente_nome = clean(segBlock.match(/Nome\s+de\s+Registro\s*:?\s*([^\n]+)/i)?.[1])
                    ?? clean(segBlock.match(/Nome\s*:?\s*([^\n]+)/i)?.[1])
  const segurado_nome_social = clean(segBlock.match(/Nome\s+Social\s*:?\s*([^\n]+)/i)?.[1])
  const cpf_cnpj = pickDocFromBlock(segBlock)
  const segurado_telefone = pickTelefone(segBlock)
  const segurado_email = pickEmail(segBlock)
  const segurado_cep = pickCep(segBlock)
  const segurado_endereco = clean(segBlock.match(/Endere[cç]o\s*:?\s*([^\n]+)/i)?.[1])
  const segurado_bairro = clean(segBlock.match(/Bairro\s*:?\s*([^\n]+)/i)?.[1])
  const segurado_cidade = clean(segBlock.match(/Cidade\s*:?\s*([^\n]+)/i)?.[1])

  const vig = pickVigencia(sections.vigencia || text)

  const veicBlock = sections.veiculo || ''
  const veiculo = clean(veicBlock.match(/Modelo\s*:?\s*([^\n]+)/i)?.[1])
  const ano_modelo = reFirst(/Ano\s+Fabr\s*\/?\s*Modelo\s*:?\s*([\d/]+)/i, veicBlock)
  const placa = pickPlaca(veicBlock)
  const chassi = pickChassi(veicBlock)
  const cod_fipe = reFirst(/C[oó]digo\s+FIPE\s*:?\s*([\w-]+)/i, veicBlock)
  const combustivel = reFirst(/Combust[ií]vel\s*:?\s*([^\n]+)/i, veicBlock)
  const cep_pernoite = clean(veicBlock.match(/CEP\s+Pernoite\s*:?\s*(\d{5}-?\d{3})/i)?.[1])
  const classe_bonus = reFirst(/Classe\s+B[oô]nus\s*:?\s*(\d+)/i, veicBlock)

  // Coberturas — tabela "Cobertura | LMI | Prêmio | Prêmio Anual | Franquia"
  const cobBlock = sections.coberturas || ''
  const coberturas: Array<{ nome: string; lmi: number | null; premio: number | null; franquia: number | null }> = []
  const lines = cobBlock.split('\n').map(l => l.trim()).filter(Boolean)
  for (const linha of lines) {
    if (/^(coberturas|cobertura\s)/i.test(linha)) continue
    const m = linha.match(/^(.+?)\s+R?\$?\s*(\d{1,3}(?:\.\d{3})*,\d{2})\s+R?\$?\s*(\d{1,3}(?:\.\d{3})*,\d{2})\s+R?\$?\s*(\d{1,3}(?:\.\d{3})*,\d{2})\s+R?\$?\s*(\d{1,3}(?:\.\d{3})*,\d{2})$/)
    if (m) {
      coberturas.push({
        nome: clean(m[1]) ?? '',
        lmi: brNum(m[2]),
        premio: brNum(m[3]),
        franquia: brNum(m[5]),
      })
    }
  }

  // Prêmio
  const premBlock = sections.premio || ''
  const premio_liquido = brNum(reFirst(/Pr[eê]mio\s+L[ií]quido\s*:?\s*R?\$?\s*([\d.,]+)/i, premBlock))
  const adicional_fracionamento = brNum(reFirst(/Adicional\s+Parcelamento\s*:?\s*R?\$?\s*([\d.,]+)/i, premBlock))
  const custo_apolice = brNum(reFirst(/Custo\s+Ap[oó]lice\s*:?\s*R?\$?\s*([\d.,]+)/i, premBlock))
  const iof = brNum(reFirst(/\bIOF\s*:?\s*R?\$?\s*([\d.,]+)/i, premBlock))
  const premio_total = brNum(reFirst(/Pr[eê]mio\s+Total\s*:?\s*R?\$?\s*([\d.,]+)/i, premBlock))

  // Cobrança
  const cobr = sections.cobranca || ''
  const banco = clean(cobr.match(/Banco\s*:?\s*([^\n]+)/i)?.[1])
  const forma_pagamento = clean(cobr.match(/Forma\s+Pagamento\s*:?\s*([^\n]+)/i)?.[1])
                       ?? clean(cobr.match(/Cart[aã]o\s+de\s+Cr[eé]dito|Boleto|D[eé]bito/i)?.[0])
  const qtd_parcelas = reFirst(/(\d+)\s*x/i, cobr)

  // Condutor
  const condBlock = sections.condutor || ''
  const condutor_nome = clean(condBlock.match(/Condutor\s*:?\s*([^\n]+)/i)?.[1])
  const condutor_cpf = pickDocFromBlock(condBlock)

  // Corretor
  const corBlock = sections.corretor || ''
  const corretor_nome = clean(corBlock.match(/Corretor\s*:?\s*([^\n]+)/i)?.[1])
  const corretor_susep = clean(corBlock.match(/SUSEP\s*:?\s*(\d+)/i)?.[1])

  return [{
    seguradora_origem: 'hdi',
    numero,
    proposta,
    endosso,
    cliente_nome,
    segurado_nome_social,
    cpf_cnpj,
    segurado_email,
    segurado_telefone,
    segurado_cep,
    segurado_endereco,
    segurado_bairro,
    segurado_cidade,
    condutor_nome,
    condutor_cpf,
    modelo: veiculo,
    ano_modelo,
    placa,
    chassi,
    cod_fipe,
    combustivel,
    cep_pernoite,
    classe_bonus: classe_bonus ? Number(classe_bonus) : null,
    vigencia_ini: vig.ini,
    vigencia_fim: vig.fim,
    coberturas: coberturas.length ? coberturas : null,
    premio_liquido,
    adicional_fracionamento,
    custo_apolice,
    iof,
    premio_total,
    premio: premio_total ?? premio_liquido,
    banco,
    forma_pagamento,
    qtd_parcelas: qtd_parcelas ? Number(qtd_parcelas) : null,
    corretor_nome,
    corretor_susep,
    processo_susep: pickProcessoSusep(text),
    produto: 'Auto HDI',
    status_apolice: 'ativo',
    layout_pdf: 'hdi-auto',
    pdf_texto_bruto: truncateText(text),
  }]
}
