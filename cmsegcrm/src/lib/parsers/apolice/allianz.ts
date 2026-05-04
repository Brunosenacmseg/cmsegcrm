// Parser de apólice Allianz Auto.
// Layout descrito pelo usuário (e validado contra PDF real):
//   Seções "SUAS INFORMAÇÕES", "INFORMAÇÕES DO CONDUTOR PRINCIPAL",
//   "INFORMAÇÕES DO SEU SEGURO" (2 colunas), "OFERTA ESCOLHIDA" (tabela
//   coberturas + Preço Líquido + Preço Total), "INFORMAÇÕES DE PAGAMENTO".
//
// Particularidades dessa seguradora (testadas contra um PDF real):
//   - O label do nome do segurado é "Segurado:", NÃO "Nome:" (que pega
//     "Nome Social:" por engano).
//   - A vigência fica colada ao próximo campo: "Vigência: das 24H de
//     11/03/2026 às 24H de 11/03/2027Apólice Nº.: ..." (sem espaço entre
//     o ano e "Apólice").
//   - Preço Total vem dentro do bloco OFERTA ESCOLHIDA, não em PAGAMENTO.
//   - "NÃ£o" aparece no lugar de "Não" em alguns PDFs (encoding pdf-parse).

import {
  brNum, clean, splitSections, reFirst, toIso,
  pickDocFromBlock, pickEmail, pickTelefone, pickCep,
  pickPlaca, pickChassi, pickVigencia, truncateText, pickProcessoSusep,
  type ApoliceRow,
} from './_common'

// "NÃ£o" → "Não", "NÃ¡o" → "Não" (pdf-parse encoding noise).
function fixSimNao(s: string | null): string | null {
  if (!s) return null
  if (/n[a-zã£¡]/i.test(s)) return 'Não'
  if (/sim/i.test(s)) return 'Sim'
  return s.trim() || null
}

export function parseAllianz(text: string): ApoliceRow[] {
  const sections = splitSections(text, [
    { key: 'corretor',     re: /SEU\s+CORRETOR/i },
    { key: 'segurado',     re: /SUAS\s+INFORMA[CÇ][OÕ]ES/i },
    { key: 'condutor',     re: /INFORMA[CÇ][OÕ]ES\s+DO\s+CONDUTOR\s+PRINCIPAL/i },
    { key: 'seguro',       re: /INFORMA[CÇ][OÕ]ES\s+DO\s+SEU\s+SEGURO/i },
    { key: 'renovacao',    re: /INFORMA[CÇ][OÕ]ES\s+DA\s+RENOVA[CÇ][AÃ]O/i },
    { key: 'oferta',       re: /OFERTA\s+ESCOLHIDA/i },
    { key: 'franquia',     re: /FRANQUIA/i },
    { key: 'assistencia',  re: /ASSIST[EÊ]NCIA\s+24H/i },
    { key: 'assistVidros', re: /ASSIST[EÊ]NCIA\s+A\s+VIDROS/i },
    { key: 'pagamento',    re: /INFORMA[CÇ][OÕ]ES\s+DE\s+PAGAMENTO/i },
  ])

  // Cabeçalho — formato: "Nº Apólice:517720262V310517873" (sem espaço após :)
  const numero   = reFirst(/N[ºo°]\s*Ap[oó]lice\s*\.?\s*:?\s*([A-Z0-9]+)/i, text)
                ?? reFirst(/Ap[oó]lice\s*N[ºo°]\.?\s*:?\s*([A-Z0-9]+)/i, text)
  const proposta = reFirst(/N[ºo°]\s*Proposta\s*:?\s*(\d+)/i, text)
                ?? reFirst(/Proposta\s*N[ºo°]\.?\s*:?\s*(\d+)/i, text)
  const endosso  = reFirst(/N[ºo°]\s*Endosso\s*:?\s*(\d+)/i, text)

  // ── SEGURADO ────────────────────────────────────────────────
  // Label correto na Allianz é "Segurado:" (não "Nome:" — que casaria com
  // "Nome Social:" e devolveria "Social: BRUNO...").
  const segBlock = sections.segurado || ''
  const cliente_nome = clean(
    segBlock.match(/Segurado\s*:?\s*([^\n]+?)(?:\s*Nome\s+Social|\n)/i)?.[1]
    ?? segBlock.match(/Segurado\s*:?\s*([^\n]+)/i)?.[1]
  )
  const segurado_nome_social = clean(segBlock.match(/Nome\s+Social\s*:?\s*([^\n]+?)(?:\s*CPF|\n)/i)?.[1])
  const cpf_cnpj = pickDocFromBlock(segBlock)
  const segurado_telefone = pickTelefone(segBlock)
  const segurado_email = pickEmail(segBlock)
  const segurado_endereco = clean(segBlock.match(/Endere[cç]o\s*:?\s*([^\n]+)/i)?.[1])
  const segurado_cep = pickCep(segBlock)

  // ── CONDUTOR ────────────────────────────────────────────────
  const condBlock = sections.condutor || ''
  const condutor_nome = clean(condBlock.match(/Nome\s*:?\s*([^\n]+?)(?:\s+CPF|\n)/i)?.[1])
  const condutor_cpf = pickDocFromBlock(condBlock)
  const condutor_idade_str = condBlock.match(/Idade\s*:?\s*(\d+)/i)?.[1]
  const condutor_estado_civil = clean(condBlock.match(/Estado\s+Civil\s*:?\s*([^\n]+)/i)?.[1])
  const tipo_residencia = clean(condBlock.match(/(?:reside|residencia)\s*[:.]?\s*(?:em\s+)?([^\n]+)/i)?.[1])
  const condutor_cobertura_jovem = fixSimNao(condBlock.match(/18\s*a\s*25[\s\S]{0,200}?(Sim|N[a-zã£¡]+|n[a-zã£¡]+)/i)?.[1] ?? null)

  // ── SEGURO + VEÍCULO ────────────────────────────────────────
  const segurBlock = sections.seguro || ''
  // pickVigencia já corrigido (usa [^/\n] em vez de [^\d])
  const vig = pickVigencia(segurBlock || text)
  const veiculo = clean(segurBlock.match(/Ve[ií]culo\s*:?\s*([^\n]+(?:\n[A-Z][^\n]*)?)/i)?.[1])
  const cod_fipe = reFirst(/C[oó]d\.?\s*FIPE\s*:?\s*([\w-]+)/i, segurBlock)
  const placa = pickPlaca(segurBlock)
  const chassi = pickChassi(segurBlock)
  const ano_modelo = reFirst(/Ano\s*\/?\s*Modelo\s*:?\s*([\d/]+)/i, segurBlock)
  const cep_pernoite = clean(segurBlock.match(/CEP\s+Pernoite\s*:?\s*(\d{5}-?\d{3})/i)?.[1])
  const classe_bonus = reFirst(/Classe\s+B[oô]nus\s*:?\s*(\d+)/i, segurBlock)
  const tipo_seguro = clean(segurBlock.match(/Tipo\s+de\s+Seguro\s*:?\s*([^\n]+?)(?:\s*Proposta|\n)/i)?.[1])
  const ramo = clean(segurBlock.match(/Ramo\s*:?\s*([^\n]+?)(?:\s*Placa|\n)/i)?.[1])
  const produto = clean(segurBlock.match(/Produto\s*:?\s*([^\n]+?)(?:\s*Chassi|\n)/i)?.[1])
  const versao = clean(segurBlock.match(/Vers[aã]o\s*:?\s*([^\n]+?)(?:\s*Zero|\n)/i)?.[1])
  const condicoes_gerais = clean(segurBlock.match(/Condi[cç][õo]es\s+Gerais\s*:?\s*([^\n]+?)(?:\s*Ano|\n)/i)?.[1])
  const grupo = clean(segurBlock.match(/Grupo\s*:?\s*([^\n]+?)(?:\s*Finalidade|\n)/i)?.[1])
  const finalidade_uso = clean(segurBlock.match(/Finalidade\s+de\s+Uso\s*:?\s*([^\n]+?)(?:\s*C[oó]d\.?\s*CI|\n)/i)?.[1])
  const codigo_ci = reFirst(/C[oó]d\.?\s*CI\s*:?\s*(\S+)/i, segurBlock)
  const categoria_risco = clean(segurBlock.match(/Categoria\s+de\s+Risco\s*:?\s*([^\n]+?)(?:\s*Grupo|\n)/i)?.[1])
  const data_emissao = reFirst(/Emiss[aã]o\s*:?\s*(\d{2}\/\d{2}\/\d{4})/i, segurBlock)
  const zero_km = fixSimNao(segurBlock.match(/Zero\s*Km\s*:?\s*(Sim|N[a-zã£¡]+|n[a-zã£¡]+)/i)?.[1] ?? null)
  const kit_gas = fixSimNao(segurBlock.match(/Kit\s*g[aá]s\s*:?\s*(Sim|N[a-zã£¡]+|n[a-zã£¡]+)/i)?.[1] ?? null)
  const seguradora_anterior = clean(segurBlock.match(/Seguradora\s+Anterior\s*:?\s*([^\n]+?)(?:\s*Kit|\s*Veiculo|\n)/i)?.[1])

  // ── RENOVAÇÃO (quando vier) ─────────────────────────────────
  const renovBlock = sections.renovacao || ''
  const apolice_anterior = clean(renovBlock.match(/N[ºo°]\.?\s*Ap[oó]lice\s+Anterior\s*:?\s*(\d+)/i)?.[1])
  const fim_vigencia_anterior = reFirst(/Fim\s+da\s+vig[eê]ncia\s+anterior\s*:?\s*(\d{2}\/\d{2}\/\d{4})/i, renovBlock)

  // ── COBERTURAS + PRÊMIO TOTAL (na seção OFERTA ESCOLHIDA) ───
  const oferta = sections.oferta || ''
  const coberturas: Array<{ nome: string; lmi: string | null; premio: number | null }> = []
  for (const linha of oferta.split('\n').map(l => l.trim()).filter(Boolean)) {
    if (/^(coberturas|pre[cç]o\s+l[ií]quido|pre[cç]o\s+total|^B[ÁA]SICO|tabela)/i.test(linha)) continue
    // Padrões aceitos:
    //   "Casco - Básica Compreensiva - ... 100% FIPE *R$ 7.031,47"
    //   "RCF* - Danos Materiais R$ 100.000,00 R$ 814,94"
    //   "Vidros Plano 4 R$ 2.197,15"
    const m = linha.match(/^(.+?)\s+([\dA-Z%][\w\s%.,$*]*?)\s*\*?R\$\s*(\d{1,3}(?:\.\d{3})*,\d{2})\s*$/)
    if (m) coberturas.push({ nome: clean(m[1]) ?? '', lmi: clean(m[2]) ?? null, premio: brNum(m[3]) })
  }

  // Prêmio Líquido + Prêmio Total ficam na seção OFERTA, não em PAGAMENTO
  const premio_liquido = brNum(reFirst(/Pre[cç]o\s+L[ií]quido\s*R?\$?\s*([\d.,]+)/i, oferta || text))
  const premio_total = brNum(reFirst(/Pre[cç]o\s+Total[^R]*R?\$?\s*([\d.,]+)/i, oferta || text))

  // ── PAGAMENTO ───────────────────────────────────────────────
  const pag = sections.pagamento || ''
  const forma_pagamento = clean(pag.match(/Forma\s+de\s+pagamento\s*:?\s*([^\n]+)/i)?.[1])
  const cartao = clean(pag.match(/N[ºo°]\s*Cart[aã]o\s*:?\s*([\d*\s-]+)/i)?.[1])
  const iof = brNum(reFirst(/\bIOF\s*:?\s*R?\$?\s*([\d.,]+)/i, pag || oferta || text))
  const juros = brNum(reFirst(/Taxa\s+juros\s*:?\s*R?\$?\s*([\d.,]+)/i, pag || text))
  const qtd_parcelas = reFirst(/Parcelas\s*:?\s*(\d+)/i, pag)
  const vencimento_dia = reFirst(/Vencimento\s*:?\s*(\d+)/i, pag)

  const parcelas: Array<Record<string, any>> = []
  const re = /(?:^|\n)\s*(\d{1,2})\s+(\d{2}\/\d{2}\/\d{4})\s+R?\$?\s*(\d{1,3}(?:\.\d{3})*,\d{2})/gm
  let pm: RegExpExecArray | null
  while ((pm = re.exec(pag)) !== null) {
    parcelas.push({
      numero: Number(pm[1]),
      vencimento: toIso(pm[2]),
      valor: brNum(pm[3]),
    })
  }

  // ── FRANQUIA ────────────────────────────────────────────────
  const franqBlock = sections.franquia || ''
  const franquia_valor = brNum(reFirst(/(?:Isen[cç][aã]o\s+de\s+franquia|Franquia)[^\d]*([\d.,]+)/i, franqBlock))

  // ── CORRETOR ────────────────────────────────────────────────
  const corBlock = sections.corretor || ''
  const corretor_nome = clean(corBlock.match(/(?:^|\n)\s*([A-ZÀ-Ÿ][A-Z0-9À-Ÿ\s&'.\-]{4,80}(?:LTDA|EIRELI|S\.?A\.?|CORRETORA|SEGUROS|ME)\b[^\n]*)/i)?.[1])
                     ?? clean(corBlock.match(/Nome\s*:?\s*([^\n]+?)(?:\s+e-?mail|\s+SUSEP|\n)/i)?.[1])
  const corretor_susep = clean(corBlock.match(/SUSEP\s*N?[º°]?\s*:?\s*(\d+)/i)?.[1])
  const corretor_codigo = clean(corBlock.match(/C[ÓO]DIGO\s*:?\s*(\d+)/i)?.[1])
  const corretor_filial = clean(corBlock.match(/FILIAL\s*:?\s*([\w]+)/i)?.[1])
  const corretor_email = pickEmail(corBlock)
  const corretor_telefone = pickTelefone(corBlock)
  const corretor_endereco = clean(corBlock.match(/ENDERE[ÇC]O\s*:?\s*([^\n]+)/i)?.[1])

  return [{
    seguradora_origem: 'allianz',
    numero,
    proposta,
    endosso,
    codigo_ci,
    tipo_seguro,
    ramo_descricao: ramo,
    versao,
    grupo,
    classe_bonus: classe_bonus ? Number(classe_bonus) : null,
    finalidade_uso,
    categoria_risco,
    data_emissao: toIso(data_emissao),
    cliente_nome,
    nome_social: segurado_nome_social,
    cpf_cnpj,
    segurado_email,
    segurado_telefone,
    segurado_endereco,
    segurado_cep,
    condutor_nome,
    condutor_cpf,
    condutor_idade: condutor_idade_str ? Number(condutor_idade_str) : null,
    condutor_estado_civil,
    condutor_cobertura_jovem,
    tipo_residencia,
    modelo: veiculo,
    produto_seguradora: produto,  // ex: "Automoveis 1211" — código interno da Allianz
    ano_modelo,
    cod_fipe,
    placa,
    chassi,
    zero_km,
    kit_gas,
    cep_pernoite,
    seguradora_anterior,
    apolice_anterior,
    fim_vigencia_anterior: toIso(fim_vigencia_anterior),
    vigencia_ini: vig.ini,
    vigencia_fim: vig.fim,
    coberturas: coberturas.length ? coberturas : null,
    franquias: franquia_valor != null ? { isencao: franquia_valor } : null,
    premio_liquido,
    iof,
    juros,
    premio_total,
    premio: premio_total ?? premio_liquido,
    forma_pagamento,
    qtd_parcelas: qtd_parcelas ? Number(qtd_parcelas) : null,
    dia_vencimento: vencimento_dia ? Number(vencimento_dia) : null,
    cartao_mascarado: cartao,
    parcelas: parcelas.length ? parcelas : null,
    corretor_nome,
    corretor_susep,
    corretor_codigo,
    corretor_filial,
    corretor_email,
    corretor_telefone,
    corretor_endereco,
    processo_susep: pickProcessoSusep(text),
    produto: 'Auto Allianz',
    status_apolice: 'ativo',
    layout_pdf: 'allianz-auto',
    pdf_texto_bruto: truncateText(text),
  }]
}
