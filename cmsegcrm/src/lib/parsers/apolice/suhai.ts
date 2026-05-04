// Parser de apólice SUHAI Seguradora.
// Layout descrito pelo usuário:
//   Formulário tabular tradicional com bordas. Tudo em 1 página.
//   Apólice formato "1003111931798". 12 parcelas.

import {
  brNum, clean, splitSections, reFirst, toIso,
  pickDocFromBlock, pickEmail, pickTelefone, pickCep,
  pickPlaca, pickChassi, pickVigencia, truncateText, pickProcessoSusep,
  type ApoliceRow,
} from './_common'

export function parseSuhai(text: string): ApoliceRow[] {
  const sections = splitSections(text, [
    { key: 'corretor',     re: /\bCORRETOR\b/ },
    { key: 'estipulante',  re: /\bESTIPULANTE\b/ },
    { key: 'proponente',   re: /\bPROPONENTE\b/ },
    { key: 'veiculo',      re: /\bVE[IÍ]CULO\b/ },
    { key: 'seguro',       re: /\bSEGURO\b/ },
    { key: 'parcelamento', re: /PARCELAMENTO\s+DO\s+SEGURO/i },
  ])

  const numero = reFirst(/Ap[oó]lice\s*:?\s*(\d{8,})/i, text)
  const proposta = reFirst(/Proposta\s*:?\s*(\d+)/i, text)
  const endosso = reFirst(/Endosso\s*:?\s*(\d+)/i, text)

  const vig = pickVigencia(text)

  const propBlock = sections.proponente || ''
  const cliente_nome = clean(propBlock.match(/(?:Nome|Propon?ente)\s*:?\s*([^\n]+)/i)?.[1])
  const cpf_cnpj = pickDocFromBlock(propBlock)
  const segurado_email = pickEmail(propBlock)
  const segurado_telefone = pickTelefone(propBlock)
  const segurado_cep = pickCep(propBlock)
  const data_nascimento = clean(propBlock.match(/Nascimento\s*:?\s*(\d{2}\/\d{2}\/\d{4})/i)?.[1])
  const sexo = clean(propBlock.match(/G[eê]nero\s*:?\s*([MF])\b/i)?.[1])

  const veicBlock = sections.veiculo || ''
  const veiculo = clean(veicBlock.match(/Marca\s*\/?\s*Modelo\s*:?\s*([^\n]+)/i)?.[1])
                ?? clean(veicBlock.match(/Modelo\s*:?\s*([^\n]+)/i)?.[1])
  const ano_modelo = reFirst(/Ano\s+Fabr\s*\/?\s*Modelo\s*:?\s*([\d/]+)/i, veicBlock)
  const placa = pickPlaca(veicBlock)
  const chassi = pickChassi(veicBlock)
  const cod_fipe = reFirst(/C[oó]digo\s+FIPE\s*:?\s*([\w-]+)/i, veicBlock)
  const cep_pernoite = clean(veicBlock.match(/CEP\s+Pernoite\s*:?\s*(\d{5}-?\d{3})/i)?.[1])
  const zero_km = reFirst(/Zero\s*KM\s*:?\s*(Sim|N[aã]o)/i, veicBlock)
  const cor = clean(veicBlock.match(/Cor\s*:?\s*([^\n]+)/i)?.[1])

  // Coberturas — "Cobertura | Importância Máxima | Franquia | Prêmio Líquido"
  const segBlock = sections.seguro || ''
  const coberturas: Array<{ nome: string; lmi: number | null; franquia: number | null; premio: number | null }> = []
  for (const linha of segBlock.split('\n').map(l => l.trim()).filter(Boolean)) {
    if (/^(seguro|cobertura\s)/i.test(linha)) continue
    const m = linha.match(/^(.+?)\s+R?\$?\s*(\d{1,3}(?:\.\d{3})*,\d{2})\s+R?\$?\s*(\d{1,3}(?:\.\d{3})*,\d{2})\s+R?\$?\s*(\d{1,3}(?:\.\d{3})*,\d{2})$/)
    if (m) coberturas.push({ nome: clean(m[1]) ?? '', lmi: brNum(m[2]), franquia: brNum(m[3]), premio: brNum(m[4]) })
  }

  // Bloco financeiro
  const premio_liquido = brNum(reFirst(/Pr[eê]mio\s+L[ií]quido\s+Total\s*:?\s*R?\$?\s*([\d.,]+)/i, text))
  const adicional_fracionamento = brNum(reFirst(/Adicional\s+Frac\.?\s*:?\s*R?\$?\s*([\d.,]+)/i, text))
  const iof = brNum(reFirst(/\bIOF\s*:?\s*R?\$?\s*([\d.,]+)/i, text))
  const premio_total = brNum(reFirst(/Pr[eê]mio\s+Total\s*:?\s*R?\$?\s*([\d.,]+)/i, text))

  // Parcelamento — tabela 12 parcelas
  const parcBlock = sections.parcelamento || ''
  const parcelas: Array<Record<string, any>> = []
  const re = /(?:^|\n)\s*(\d{1,2})\s+(\d{2}\/\d{2}\/\d{4})\s+R?\$?\s*(\d{1,3}(?:\.\d{3})*,\d{2})/gm
  let pm: RegExpExecArray | null
  while ((pm = re.exec(parcBlock)) !== null) {
    parcelas.push({ numero: Number(pm[1]), vencimento: toIso(pm[2]), valor: brNum(pm[3]) })
  }
  const qtd_parcelas = parcelas.length || null

  // Corretor
  const corBlock = sections.corretor || ''
  const corretor_nome = clean(corBlock.match(/Nome\s*:?\s*([^\n]+)/i)?.[1])
  const corretor_susep = clean(corBlock.match(/SUSEP\s*:?\s*(\d+)/i)?.[1])

  return [{
    seguradora_origem: 'suhai',
    numero,
    proposta,
    endosso,
    cliente_nome,
    cpf_cnpj,
    segurado_email,
    segurado_telefone,
    segurado_cep,
    data_nascimento: toIso(data_nascimento),
    sexo,
    modelo: veiculo,
    ano_modelo,
    placa,
    chassi,
    cod_fipe,
    cor,
    cep_pernoite,
    zero_km,
    vigencia_ini: vig.ini,
    vigencia_fim: vig.fim,
    coberturas: coberturas.length ? coberturas : null,
    premio_liquido,
    adicional_fracionamento,
    iof,
    premio_total,
    premio: premio_total ?? premio_liquido,
    qtd_parcelas,
    parcelas: parcelas.length ? parcelas : null,
    corretor_nome,
    corretor_susep,
    processo_susep: pickProcessoSusep(text),
    produto: 'Auto Suhai',
    status_apolice: 'ativo',
    layout_pdf: 'suhai-auto',
    pdf_texto_bruto: truncateText(text),
  }]
}
