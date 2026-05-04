// Parser de apólice Porto Seguro / Azul Seguros — layout idêntico (mesmo grupo).
// Estrutura: caixas com título em barra azul arredondada (label/valor).
// Reconhecimento por marca: a função detectSeguradora já distingue 'porto' x 'azul'.

import {
  brNum, clean, splitSections, reFirst, toIso,
  pickDocFromBlock, pickCep,
  pickPlaca, pickChassi, pickVigencia, truncateText, pickProcessoSusep,
  type ApoliceRow,
} from './_common'
import type { SeguradoraId } from '../apolice-detector'

export function parsePortoOuAzul(text: string, marca: SeguradoraId): ApoliceRow[] {
  const sections = splitSections(text, [
    { key: 'apolice',     re: /Dados\s+da\s+sua\s+ap[oó]lice/i },
    { key: 'segurado',    re: /Dados\s+do\s+segurado|Dados\s+cadastrais/i },
    { key: 'veiculo',     re: /Descri[cç][aã]o\s+do\s+ve[ií]culo\s+segurado/i },
    { key: 'corretor',    re: /Dados\s+do\s+Corretor/i },
    { key: 'coberturas',  re: /Valores?\s+do\s+seu\s+seguro|COBERTURAS\s+AUTO/i },
    { key: 'adicionais',  re: /Coberturas\s+adicionais/i },
    { key: 'franquias',   re: /Valores?\s+e\s+franquias/i },
    { key: 'pagamento',   re: /Dados\s+de\s+pagamento/i },
    { key: 'questionario', re: /Question[aá]rio\s+de\s+avalia[cç][aã]o\s+de\s+risco/i },
  ])

  const apolBlock = sections.apolice || text
  const numero = reFirst(/Ap[oó]lice\s*:?\s*([\d\s.\-]+)/i, apolBlock)?.replace(/\s+/g, ' ').trim() ?? null
  const codigoCi = reFirst(/C[oó]digo\s+C\.?I\.?\s*:?\s*(\S+)/i, apolBlock)
  const vig = pickVigencia(apolBlock || text)

  const segBlock = sections.segurado || ''
  const cliente_nome = clean(segBlock.match(/Nome\s*:?\s*([^\n]+)/i)?.[1])
                    ?? clean(segBlock.match(/Segurado\s*:?\s*([^\n]+)/i)?.[1])
  const cpf_cnpj = pickDocFromBlock(segBlock)
  const segurado_cep = pickCep(segBlock)

  const veicBlock = sections.veiculo || ''
  const veiculo = clean(veicBlock.match(/Ve[ií]culo\s*:?\s*([^\n]+)/i)?.[1])
  const ano_modelo = reFirst(/Ano\s+Fab\s*\/?\s*Modelo\s*:?\s*([\d/]+)/i, veicBlock)
  const placa = pickPlaca(veicBlock)
  const chassi = pickChassi(veicBlock)
  const cod_fipe = reFirst(/FIPE\s*:?\s*([\w-]+)/i, veicBlock)
  const combustivel = reFirst(/Combust[ií]vel\s*:?\s*([^\n]+)/i, veicBlock)

  const questBlock = sections.questionario || ''
  const condutor_nome = clean(questBlock.match(/Nome\s+Condutor\s*:?\s*([^\n]+?)(?:\s+CPF|\n)/i)?.[1])
  const condutor_cpf = pickDocFromBlock(questBlock)
  const cep_pernoite = clean(questBlock.match(/CEP\s+Pernoite\s*:?\s*(\d{5}-?\d{3})/i)?.[1])

  // Coberturas — tabela "Cobertura | LMI | Franquia | Var | Depreciação | Prêmio"
  const cobBlock = sections.coberturas || ''
  const coberturas: Array<{ nome: string; lmi: string | null; franquia: string | null; premio: number | null }> = []
  for (const linha of cobBlock.split('\n').map(l => l.trim()).filter(Boolean)) {
    if (/^(coberturas|valores?|cobertura)/i.test(linha)) continue
    const m = linha.match(/^(.+?)\s+(R?\$?\s?[\d.,%A-Z]+)\s+(R?\$?\s?[\d.,]+)\s+R?\$?\s?(\d{1,3}(?:\.\d{3})*,\d{2})$/)
    if (m) coberturas.push({ nome: clean(m[1]) ?? '', lmi: clean(m[2]) ?? null, franquia: clean(m[3]) ?? null, premio: brNum(m[4]) })
  }

  // Pagamento
  const pag = sections.pagamento || ''
  const forma_pagamento = clean(pag.match(/Forma\s*:?\s*([^\n]+)/i)?.[1])
                       ?? clean(pag.match(/C[oó]digo\s*:?\s*([^\n]+)/i)?.[1])
  const premio_liquido = brNum(reFirst(/Pr[eê]mio\s+Total\s+L[ií]quido\s*:?\s*R?\$?\s*([\d.,]+)/i, text))
  const iof = brNum(reFirst(/\bIOF\s*:?\s*R?\$?\s*([\d.,]+)/i, text))
  const premio_total = brNum(reFirst(/Total\s+do\s+seguro\s*:?\s*R?\$?\s*([\d.,]+)/i, text))
                    ?? brNum(reFirst(/Pr[eê]mio\s+Total\s*:?\s*R?\$?\s*([\d.,]+)/i, text))

  const parcelas: Array<Record<string, any>> = []
  const re = /(?:^|\n)\s*(\d{1,2})\s+(\d{2}\/\d{2}\/\d{4})\s+R?\$?\s*(\d{1,3}(?:\.\d{3})*,\d{2})/gm
  let pm: RegExpExecArray | null
  while ((pm = re.exec(pag)) !== null) {
    parcelas.push({ numero: Number(pm[1]), vencimento: toIso(pm[2]), valor: brNum(pm[3]) })
  }

  // Corretor
  const corBlock = sections.corretor || ''
  const corretor_nome = clean(corBlock.match(/Corretor\s*:?\s*([^\n]+?)(?:\s+Participa|\s+SUSEP|\n)/i)?.[1])
  const corretor_susep = clean(corBlock.match(/SUSEP\s*(?:Oficial)?\s*:?\s*(\d+)/i)?.[1])

  return [{
    seguradora_origem: marca,
    numero,
    codigo_ci: codigoCi,
    cliente_nome,
    cpf_cnpj,
    segurado_cep,
    condutor_nome,
    condutor_cpf,
    cep_pernoite,
    modelo: veiculo,
    ano_modelo,
    placa,
    chassi,
    cod_fipe,
    combustivel,
    vigencia_ini: vig.ini,
    vigencia_fim: vig.fim,
    coberturas: coberturas.length ? coberturas : null,
    premio_liquido,
    iof,
    premio_total,
    premio: premio_total ?? premio_liquido,
    forma_pagamento,
    parcelas: parcelas.length ? parcelas : null,
    corretor_nome,
    corretor_susep,
    processo_susep: pickProcessoSusep(text),
    produto: marca === 'porto' ? 'Auto Porto' : 'Auto Azul',
    status_apolice: 'ativo',
    layout_pdf: marca === 'porto' ? 'porto-auto' : 'azul-auto',
    pdf_texto_bruto: truncateText(text),
  }]
}
