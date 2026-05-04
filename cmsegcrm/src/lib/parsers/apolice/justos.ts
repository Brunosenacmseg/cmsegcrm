// Parser de apólice Justos.
// Layout descrito pelo usuário:
//   Design jovem (amarelo + preto). Subtítulos MAIÚSCULO cinza pequeno + valores
//   em destaque. Apólice formato "02241202605310658630".
//   Vigência completa "de HH:MM de DD/MM/AAAA até HH:MM de DD/MM/AAAA".

import {
  brNum, clean, splitSections, reFirst, toIso,
  pickDocFromBlock, pickEmail, pickTelefone, pickCep,
  pickPlaca, pickChassi, pickVigencia, truncateText, pickProcessoSusep,
  type ApoliceRow,
} from './_common'

export function parseJustos(text: string): ApoliceRow[] {
  const sections = splitSections(text, [
    { key: 'segurado',   re: /SEUS\s+DADOS|DADOS\s+DO\s+SEGURADO/i },
    { key: 'carro',      re: /SEU\s+CARRO|DADOS\s+DO\s+CARRO/i },
    { key: 'corretor',   re: /SEU\s+CORRETOR/i },
    { key: 'plano',      re: /SEU\s+PLANO/i },
    { key: 'cobranca',   re: /DADOS\s+DE\s+COBRAN[CÇ]A/i },
    { key: 'contrato',   re: /DETALHES\s+DO\s+CONTRATO/i },
  ])

  const numero = reFirst(/Ap[oó]lice\s*:?\s*(\d{15,})/i, text)
                ?? reFirst(/Ap[oó]lice\s*:?\s*([\d.\-]+)/i, text)
  const proposta = reFirst(/Proposta\s*:?\s*([\d.\-]+)/i, text)

  const segBlock = sections.segurado || ''
  const cliente_nome = clean(segBlock.match(/Nome\s*\n+\s*([^\n]+)/i)?.[1])
                    ?? clean(segBlock.match(/Nome\s*:?\s*([^\n]+)/i)?.[1])
  const cpf_cnpj = pickDocFromBlock(segBlock)
  const segurado_email = pickEmail(segBlock)
  const segurado_telefone = pickTelefone(segBlock)
  const cep_pernoite = clean(segBlock.match(/CEP\s+Pernoite\s*:?\s*(\d{5}-?\d{3})/i)?.[1])
                    ?? pickCep(segBlock)
  const classe_bonus = reFirst(/Classe\s+de\s+b[oô]nus\s*:?\s*(\d+)/i, segBlock)

  // Carro
  const carBlock = sections.carro || ''
  const placa = pickPlaca(carBlock)
  const chassi = pickChassi(carBlock + ' ' + text) // chassi pode estar fora da seção
  const ano_modelo = reFirst(/Ano\s*:?\s*(\d{4})/i, carBlock)
  const veiculo = clean(carBlock.match(/Modelo\s*:?\s*([^\n]+)/i)?.[1])
                ?? clean(carBlock.match(/Marca\s*:?\s*([^\n]+)/i)?.[1])
  const cod_fipe = reFirst(/FIPE\s*:?\s*([\w-]+)/i, text)

  const vig = pickVigencia(text)

  // Plano — tabela "Cobertura | Limites | Franquia | Prêmio"
  const planBlock = sections.plano || ''
  const coberturas: Array<{ nome: string; limite: string | null; franquia: string | null; premio: number | null }> = []
  for (const linha of planBlock.split('\n').map(l => l.trim()).filter(Boolean)) {
    if (/^(seu\s+plano|cobertura\s)/i.test(linha)) continue
    const m = linha.match(/^(.+?)\s+(R?\$?\s?[\d.,A-Z%]+)\s+(R?\$?\s?[\d.,A-Z%]+)\s+R?\$?\s*(\d{1,3}(?:\.\d{3})*,\d{2})$/)
    if (m) coberturas.push({ nome: clean(m[1]) ?? '', limite: clean(m[2]) ?? null, franquia: clean(m[3]) ?? null, premio: brNum(m[4]) })
  }

  // Cobrança
  const cobr = sections.cobranca || ''
  const pagMatch = cobr.match(/(\d+)x\s+de\s+R?\$?\s*([\d.,]+)/i) || text.match(/(\d+)x\s+de\s+R?\$?\s*([\d.,]+)/i)
  const qtd_parcelas = pagMatch ? Number(pagMatch[1]) : null
  const valor_parcela = pagMatch ? brNum(pagMatch[2]) : null
  const forma_pagamento = pagMatch ? `${pagMatch[1]}x de R$ ${pagMatch[2]}` : clean(cobr.match(/Forma\s*:?\s*([^\n]+)/i)?.[1])
  const premio_liquido = brNum(reFirst(/Pr[eê]mio\s+L[ií]quido\s*:?\s*R?\$?\s*([\d.,]+)/i, text))
  const iof = brNum(reFirst(/\bIOF\s*:?\s*R?\$?\s*([\d.,]+)/i, text))
  const premio_total = brNum(reFirst(/Total\s*:?\s*R?\$?\s*([\d.,]+)/i, text))

  // Corretor
  const corBlock = sections.corretor || ''
  const corretor_nome = clean(corBlock.match(/Corretora?\s*:?\s*([^\n]+)/i)?.[1])
                     ?? clean(corBlock.match(/Nome\s*:?\s*([^\n]+)/i)?.[1])
  const corretor_susep = clean(corBlock.match(/SUSEP\s*:?\s*(\d+)/i)?.[1])
  const corretor_cnpj = pickDocFromBlock(corBlock)
  const corretor_email = pickEmail(corBlock)

  return [{
    seguradora_origem: 'justos',
    numero,
    proposta,
    cliente_nome,
    cpf_cnpj,
    segurado_email,
    segurado_telefone,
    cep_pernoite,
    classe_bonus: classe_bonus ? Number(classe_bonus) : null,
    modelo: veiculo,
    ano_modelo,
    placa,
    chassi,
    cod_fipe,
    vigencia_ini: vig.ini,
    vigencia_fim: vig.fim,
    coberturas: coberturas.length ? coberturas : null,
    premio_liquido,
    iof,
    premio_total,
    premio: premio_total ?? premio_liquido,
    qtd_parcelas,
    valor_parcela,
    forma_pagamento,
    corretor_nome,
    corretor_susep,
    corretor_cnpj,
    corretor_email,
    processo_susep: pickProcessoSusep(text),
    produto: 'Auto Justos',
    status_apolice: 'ativo',
    layout_pdf: 'justos-auto',
    pdf_texto_bruto: truncateText(text),
  }]
}
