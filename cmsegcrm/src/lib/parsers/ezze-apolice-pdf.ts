// Parser de apólices em PDF da Ezze Seguros.
// Suporta dois layouts:
//  1. Auto Individual (cabeçalho "APÓLICE SEGURO AUTO INDIVIDUAL")
//  2. RC Transporte / Carta Verde ("SEGURO DE RESPONSABILIDADE CIVIL DAS EMPRESAS DE TRANSPORTE…")
//
// Captura TODOS os campos relevantes em chaves "snake_case" alinhadas às colunas
// de seg_stage_apolices (vide migration 070_seg_stage_apolices_ezze_pdf.sql),
// para que mapApoliceEzze seja um passthrough direto. Texto bruto é incluído em
// `pdf_texto_bruto` (truncado) para debug quando uma regex falhar.
//
// Seções IGNORADAS (informativas, não fazem parte do contrato):
//   - rodapé (SUSEP/CNPJ/processo/endereço da Ezze)
//   - Canais de Atendimento
//   - Informações Importantes
//   - Disposições Gerais
//   - Emissão da Apólice

import pdfParse from 'pdf-parse'

export type EzzeApoliceRow = Record<string, any>
export type EzzeLayout = 'auto' | 'rc' | 'unknown'

const norm = (s: string) =>
  s.toLowerCase()
   .normalize('NFD')
   .replace(/[̀-ͯ]/g, '')
   .replace(/\s+/g, ' ')
   .trim()

function toIso(d: string | null | undefined): string | null {
  if (!d) return null
  const m = d.match(/(\d{2})\/(\d{2})\/(\d{4})/)
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null
}

function brNum(s: string | null | undefined): number | null {
  if (s == null) return null
  const t = String(s).replace(/[R$\s%]/g, '')
  if (!t) return null
  const n = Number(t.replace(/\./g, '').replace(',', '.'))
  return isFinite(n) ? n : null
}

function clean(s: string | null | undefined): string | null {
  if (s == null) return null
  const t = s.replace(/\s+/g, ' ').trim()
  return t === '' ? null : t
}

function simNao(s: string | null | undefined): string | null {
  if (!s) return null
  if (/n[aã]o/i.test(s)) return 'Não'
  if (/sim/i.test(s)) return 'Sim'
  return clean(s)
}

export function detectEzzeLayout(text: string): EzzeLayout {
  const n = norm(text)
  if (n.includes('apolice seguro auto individual') || n.includes('dados da apolice')) return 'auto'
  if (n.includes('seguro de responsabilidade civil') ||
      /apolice\s+numero\s*:/.test(n) ||
      n.includes('garantido por ezze seguros'))
    return 'rc'
  return 'unknown'
}

function splitSections(text: string, headers: { key: string; re: RegExp }[]): Record<string, string> {
  const positions: { key: string; pos: number }[] = []
  for (const h of headers) {
    const m = h.re.exec(text)
    if (m) positions.push({ key: h.key, pos: m.index })
  }
  positions.sort((a, b) => a.pos - b.pos)
  const out: Record<string, string> = {}
  for (let i = 0; i < positions.length; i++) {
    const start = positions[i].pos
    const end = i + 1 < positions.length ? positions[i + 1].pos : text.length
    out[positions[i].key] = text.slice(start, end)
  }
  return out
}

function listBrNumbers(s: string): number[] {
  return [...s.matchAll(/(\d{1,3}(?:\.\d{3})*,\d{2})/g)]
    .map(m => brNum(m[1]))
    .filter((n): n is number => n != null)
}

const SEG_LABELS = /^(?:nome|nome\s+social|cpf\/?cnpj|cpf|telefone|e-?mail|cep|cidade|uf|estado\s+civil|data\s+nascimento|sexo)\s*:?\s*$/i

// Acha o nome do segurado em um bloco de texto. Em vez de iterar por linhas
// (que falha quando pdf-parse junta texto sem espaços/quebras), procura
// substrings em CAIXA ALTA com 2+ palavras — funciona mesmo quando o output
// vem como "Nome completo do condutorBRUNO SANTOS SOUSA".
function pickNomeFromBlock(block: string): string | null {
  // Sequências de 2 a 6 palavras em CAIXA ALTA (mín. 2 letras cada)
  const re = /[A-ZÀ-Ÿ]{2,}(?:\s+[A-ZÀ-Ÿ\.\-']{2,}){1,5}/g
  const candidatos: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(block)) !== null) {
    const s = m[0].trim()
    if (s.length < 5 || s.length > 100) continue
    // Pula títulos/labels que ficam em CAPS no PDF da Ezze
    const sNoPunct = s.replace(/[\.\-']/g, '')
    if (/^(?:SEGURADO|CORRETOR|CORRETORA|CORRETORES|NOME|NOME SOCIAL|CPF|CNPJ|TELEFONE|EMAIL|E\s*-\s*MAIL|CEP|CIDADE|UF|ESTADO CIVIL|DATA EMISSAO|VIGENCIA|APOLICE|AP[OÓ]LICE|SEGURO|SEGUROS|EZZE|HDI|TOKIO|PORTO|ALLIANZ|BRADESCO|DARWIN|MAPFRE|SUSEP|FIPE|NOVO|VEICULO|VE[IÍ]CULO|MARCA|MODELO|CHASSI|PLACA|ANO MODELO|MATRIZ|FILIAL|RAMO|SUCURSAL|CASADO|SOLTEIRO|DIVORCIADO|VI[UÚ]VO|UNI[AÃ]O EST[AÁ]VEL|SIM|N[AÃ]O|RESERVA|HORAS|VIDROS|COMPREENSIVA|DANOS|ASSIST[EÊ]NCIA|CARRO|FRANQUIA|FRANQUIAS|COBERTURA|COBERTURAS|PARCELAMENTO|PR[EÊ]MIO|TOTAL|LIQUIDO|L[IÍ]QUIDO|IOF|VENCIMENTO|CASCO|VISTORIA|RASTREADOR|BLINDAGEM|FORD|VOLKSWAGEN|FIAT|CHEVROLET|GM|HYUNDAI|RENAULT|HONDA|TOYOTA|NISSAN|JEEP|PEUGEOT|CITROEN|VAN|SEDAN|HATCH|GUAIA[CÇ][AÃ])\b/i.test(sNoPunct)) continue
    candidatos.push(s)
  }
  return candidatos[0] ?? null
}

function pickDocFromBlock(block: string): string | null {
  const cnpjFmt = block.match(/\b(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})\b/)?.[1]
  if (cnpjFmt) return cnpjFmt.replace(/\D/g, '')
  const cpfFmt = block.match(/\b(\d{3}\.\d{3}\.\d{3}-\d{2})\b/)?.[1]
  if (cpfFmt) return cpfFmt.replace(/\D/g, '')
  const cnpj = block.match(/(?<!\d)(\d{14})(?!\d)/)?.[1]
  if (cnpj) return cnpj
  const cpf = block.match(/(?<!\d)(\d{11})(?!\d)/)?.[1]
  if (cpf) return cpf
  return null
}

// ─────────────────── Auto Individual ───────────────────
function parseAuto(rawText: string): EzzeApoliceRow {
  const text = rawText
  const reFirst = (r: RegExp, src = text) => r.exec(src)?.[1]?.trim() ?? null

  // Headers (Auto Individual). Ordem real: Dados da Apólice → Segurado → Corretor
  // → Questionário → Dados do Veículo → Cobertura → Prêmio Total → Dados de
  // Pagamento → Serviços → Franquias → Canais de Atendimento → Disposições.
  // Os \s+ foram trocados por \s* porque pdf-parse às vezes junta palavras de
  // headers sem whitespace ("DadosdaApólice"). Word boundaries (\b) também
  // foram removidas pelo mesmo motivo — a primeira ocorrência da string já é
  // sempre o cabeçalho de seção, antes dos labels/valores das seções seguintes.
  const sections = splitSections(text, [
    { key: 'dadosApolice', re: /Dados\s*da\s*Ap[oó]lice/i },
    { key: 'segurado',     re: /Segurado(?!\s*\(a\))/i }, // exclui "segurado(a)" do questionário
    { key: 'corretor',     re: /Corretor/i },
    { key: 'questionario', re: /Question[aá]rio\s*de\s*Avalia/i },
    { key: 'veiculo',      re: /Dados\s*do\s*Ve[ií]culo/i },
    { key: 'cobertura',    re: /Cobertura/i },
    { key: 'premioTotal',  re: /Pr[eê]mio\s*Total/i },
    { key: 'pagamento',    re: /Dados\s*de\s*Pagamento/i },
    { key: 'servicos',     re: /Servi[cç]os/i },
    { key: 'franquias',    re: /Franquias/i },
    { key: 'canais',       re: /Canais\s*de\s*Atendimento/i }, // marcador final — daqui em diante não capturamos
    { key: 'disposicoes',  re: /Disposi[cç][õo]es\s*Gerais/i },
  ])

  // Cabeçalho de página (sempre presente, não precisa de seção). Whitespace é
  // \s* porque pdf-parse pode juntar labels/valores ("NºApólice:1003...").
  const numero   = reFirst(/N[ºo°]\s*Ap[oó]lice\s*:?\s*(\d+)/i)
  const endosso  = reFirst(/Endosso\s*:?\s*(\d+)/i)
  const proposta = reFirst(/Proposta\s*:?\s*(\d+)/i)
  const versao   = reFirst(/Vers[aã]o\s*:?\s*([\d.]+)/i)
  const ruleId   = reFirst(/Rule\s*ID\s*:?\s*(\d+)/i)
  const tipoApolice = reFirst(/Ap[oó]lice\s*:\s*(Completo|Parcial|B[áa]sico)\b/i)

  // Dados da Apólice
  const dadosApolice = sections.dadosApolice ?? ''
  const codigoCi    = reFirst(/C[oó]digo\s*CI\s*:?\s*(\d+)/i, dadosApolice) ?? reFirst(/C[oó]digo\s*CI\s*:?\s*(\d+)/i)
  const tipoSeguro  = reFirst(/Tipo\s*de\s*Seguro\s*:?\s*([^\n]+?)(?:Classe|\n|$)/i, dadosApolice)
  const classeBonusStr = reFirst(/Classe\s*b[oô]nus\s*:?\s*(\d+)/i, dadosApolice)
  const classeBonus = classeBonusStr ? Number(classeBonusStr) : null
  const dataEmissao = reFirst(/Data\s*da\s*Emiss[aã]o\s*:?\s*(\d{2}\/\d{2}\/\d{4})/i, dadosApolice)
                   ?? reFirst(/Data\s*da\s*Emiss[aã]o\s*:?\s*(\d{2}\/\d{2}\/\d{4})/i)
  // Vigência: "das 00:00 do dia DD/MM/YYYY até 23:59 do dia DD/MM/YYYY". Mas
  // pdf-parse junta tudo: "das00:00dodia16/03/2026até23:59dodia16/03/2027" —
  // tudo \s* permite zero-or-more whitespace entre tokens.
  const vig = /das?\s*\d{1,2}\s*:\s*\d{2}\s*h?\s*do\s*dia\s*(\d{2}\/\d{2}\/\d{4})\s*at[eé]\s*\d{1,2}\s*:\s*\d{2}\s*h?\s*do\s*dia\s*(\d{2}\/\d{2}\/\d{4})/i.exec(dadosApolice || text)
            ?? /(\d{2}\/\d{2}\/\d{4})\s*at[eé]\s*[\d:hsdoia\s]*?(\d{2}\/\d{2}\/\d{4})/i.exec(dadosApolice || text)

  // Segurado. Se o splitSections não conseguiu isolar o bloco (pdf-parse
  // juntando "Segurado" com a próxima palavra), cai para o texto inteiro até
  // a primeira ocorrência de "Corretor" — a primeira instância de "Corretor"
  // sempre é o header de seção (vem antes do label "Corretor:" da linha de
  // baixo e antes da palavra "Corretora" do nome da empresa).
  let segBlock = sections.segurado ?? ''
  if (!segBlock || segBlock.length < 20) {
    const segIdx = text.search(/Segurado/i)
    const corIdx = text.search(/Corretor/i)
    if (segIdx >= 0 && corIdx > segIdx) {
      segBlock = text.slice(segIdx, corIdx)
    }
  }
  const cliente_nome = pickNomeFromBlock(segBlock)
  const cpf_cnpj     = pickDocFromBlock(segBlock)
  const segurado_email = segBlock.match(/([\w.\-+]+@[\w.\-]+\.[A-Za-z]{2,})/)?.[1] ?? null
  const segTelMatch = segBlock.match(/\(?\s*(\d{2})\s*\)?\s*(\d{4,5}-?\d{4})/)
  const segurado_telefone = segTelMatch ? `(${segTelMatch[1]}) ${segTelMatch[2]}` : null
  const segurado_cep = segBlock.match(/\b(\d{5}-?\d{3})\b/)?.[1] ?? null
  const segurado_uf  = segBlock.match(/\b([A-Z]{2})\b\s*$/m)?.[1]
                     ?? segBlock.match(/UF\s*:?\s*\n*\s*([A-Z]{2})/i)?.[1] ?? null
  const estadoCivilMatch = segBlock.match(/Estado\s+Civil\s*:?\s*\n*\s*(Casado\s*\(a\)|Solteiro\s*\(a\)|Divorciado\s*\(a\)|Vi[uú]vo\s*\(a\)|Uni[aã]o\s+Est[aá]vel)/i)
  const segurado_estado_civil = clean(estadoCivilMatch?.[1])
  // Cidade: linha capitalizada que não é o nome do segurado, UF, label, estado civil
  const segLines = segBlock.split('\n').map(l => l.trim()).filter(Boolean)
  const segurado_cidade = segLines.find(l =>
    !SEG_LABELS.test(l) && l !== cliente_nome && l !== segurado_uf &&
    /^[A-ZÀ-Ÿ][A-Za-zÀ-ÿ' \-]{2,40}$/.test(l) &&
    !/[0-9@]/.test(l) &&
    !/Casado|Solteiro|Divorciado|Vi[uú]vo|Uni[aã]o/i.test(l) &&
    l.length <= 50
  ) ?? null
  // Nome Social: a SEGUNDA linha em caixa alta no segBlock (a primeira é cliente_nome)
  const segurado_nome_social = (() => {
    let count = 0
    for (const l of segLines) {
      if (SEG_LABELS.test(l)) continue
      if (/[0-9@]/.test(l)) continue
      if (/^[A-ZÀ-Ÿ][A-ZÀ-Ÿ\s'\-\.&]{4,99}$/.test(l)) {
        count++
        if (count === 2) return l
      }
    }
    return cliente_nome
  })()

  // Corretor
  const corBlock = sections.corretor ?? ''
  const COR_LABELS = /^(?:corretor|cpf\/?cnpj|susep|telefone|e-?mail|filial\s+ezze)\s*:?\s*$/i
  const corLines = corBlock.split('\n').map(l => l.trim()).filter(Boolean)
  const corretor_nome = corLines.find(l =>
    !COR_LABELS.test(l) && /(LTDA|S\/?A|S\.A\.|CORRETORA|EIRELI|\bME\b)/i.test(l) && !/[0-9@]/.test(l)
  ) ?? corLines.find(l =>
    !COR_LABELS.test(l) && /^[A-ZÀ-Ÿ][A-Za-zÀ-ÿ&\s'\.\-]{4,100}$/.test(l) && !/[0-9@]/.test(l)
  ) ?? null
  const corretor_cnpj = pickDocFromBlock(corBlock)
  const corNums = [...corBlock.matchAll(/(?<!\d)(\d{6,14})(?!\d)/g)].map(m => m[1])
  const corretor_susep = corNums.find(n => n.length >= 6 && n.length <= 12 && n !== corretor_cnpj) ?? null
  const corretor_email = corBlock.match(/([\w.\-+]+@[\w.\-]+\.[A-Za-z]{2,})/)?.[1] ?? null
  const corTelMatch = corBlock.match(/Telefone\s*:?\s*\n*\s*\(?\s*(\d{2})\s*\)?\s*(\d{4,5}-?\d{4})/i)
  const corretor_telefone = corTelMatch ? `(${corTelMatch[1]}) ${corTelMatch[2]}` : null
  const filial_ezze = reFirst(/Filial\s+Ezze\s*:?\s*\n*\s*([^\n]+)/i, corBlock)
                   ?? reFirst(/Filial\s+Ezze\s*:?\s*\n*\s*([^\n]+)/i)

  // Questionário de Avaliação de Risco
  const qBlock = sections.questionario ?? ''
  const utilizacao_veiculo = reFirst(/utiliza[cç][aã]o\s+do\s+ve[ií]culo\s*\??\s*\n*\s*([^\n]+)/i, qBlock)
                          ?? reFirst(/Particular\s*\(.*?\)/i, qBlock)
  const principal_condutor = reFirst(/principal\s+condutor\s*\??\s*\n*\s*([^\n]+)/i, qBlock)
  const condutor_nome = reFirst(/Nome\s+completo\s+do\s+condutor\s*\n*\s*([^\n]+)/i, qBlock)
  const condutor_cpf_match = qBlock.match(/CPF\s+do\s+condutor\s*\n*\s*([\d\.\-]+)/i)
  const condutor_cpf = condutor_cpf_match?.[1]?.replace(/\D/g, '') ?? null
  const condutor_estado_civil = reFirst(/Estado\s+civil\s+do\s+condutor\s*\n*\s*([^\n]+)/i, qBlock)
  const condutor_cobertura_jovem = simNao(reFirst(/condutores\s+na\s+faixa[\s\S]{0,300}?(Sim|N[aã]o)/i, qBlock))

  // Dados do Veículo
  const vehBlock = sections.veiculo ?? ''
  const placa  = (vehBlock.match(/Placa\s*\n*\s*([A-Z0-9]{7})/i)
                ?? text.match(/Placa\s*\n*\s*([A-Z0-9]{7})/i))?.[1] ?? null
  const chassi = (vehBlock.match(/Chassi\s*\n*\s*([A-Z0-9]{17})/i)
                ?? text.match(/Chassi\s*\n*\s*([A-Z0-9]{17})/i))?.[1] ?? null
  const ano_modelo = (vehBlock.match(/Ano\s*Modelo\s*\n*\s*(\d{4})/i)
                ?? text.match(/Ano\s*Modelo\s*\n*\s*(\d{4})/i))?.[1] ?? null
  const cod_fipe = (vehBlock.match(/(?:C[oó]d\.?|C[oó]digo)\s*FIPE\s*\n*\s*([\w\-]+)/i)
                ?? text.match(/(?:C[oó]d\.?|C[oó]digo)\s*FIPE\s*\n*\s*([\w\-]+)/i))?.[1] ?? null
  const marca  = reFirst(/Marca\s*\n*\s*([A-Za-zÀ-ÿ\- ]{2,40})/i, vehBlock)
  const modelo = reFirst(/Modelo\s*\n*\s*([^\n]{2,80})/i, vehBlock)
  const zero_km = simNao(reFirst(/Zero\s*KM\s*\n*\s*(Sim|N[aã]o)/i, vehBlock))
  const blindagem = simNao(reFirst(/Blindagem\s*\n*\s*(Sim|N[aã]o)/i, vehBlock))
  const tipo_franquia_casco = reFirst(/Tipo\s+Franquia\s+Casco\s*\n*\s*([^\n]+?)(?:\s*Vistoria|\n)/i, vehBlock)
  const vistoria_previa = simNao(reFirst(/Vistoria\s+Pr[eé]via\s+Obrigat[oó]ria\s*\n*\s*(Sim|N[aã]o)/i, vehBlock))
  const rastreador_obrigatorio = simNao(reFirst(/Rastreador\s+Obrigat[oó]rio\s*\n*\s*(Sim|N[aã]o)/i, vehBlock))

  // Coberturas (tabela: nome | valor IS | prêmio)
  // Linhas como "Compreensiva 100% V.M.R Fipe 928,58", "Danos Materiais R$ 100.000,00 635,48", "Vidros 136,53"
  const cobBlock = sections.cobertura ?? ''
  const COB_NOMES = ['Compreensiva', 'Danos\\s+Materiais', 'Danos\\s+Corporais', 'Vidros', 'Assist[eê]ncia\\s+24\\s+Horas', 'Carro\\s+Reserva', 'APP', 'RCF\\b', 'RCF-V', 'RCF-DM', 'RCF-DC']
  const coberturas: Array<{ nome: string; valor_is: string | null; premio: number | null }> = []
  for (const nomeRe of COB_NOMES) {
    // 1) Tenta com Valor IS antes do prêmio
    const reComIs = new RegExp(`(${nomeRe})\\s*\\n*\\s*((?:R\\$\\s*)?\\d[\\d\\.\\,]*(?:\\s*%?\\s*V\\.M\\.R\\s*Fipe|\\s*Fipe)?)\\s*\\n*\\s*(\\d{1,3}(?:\\.\\d{3})*,\\d{2})\\b`, 'i')
    const m1 = reComIs.exec(cobBlock)
    if (m1) {
      coberturas.push({ nome: clean(m1[1]) ?? '', valor_is: clean(m1[2]) ?? null, premio: brNum(m1[3]) })
      continue
    }
    // 2) Sem Valor IS — só nome + prêmio
    const reSemIs = new RegExp(`(${nomeRe})\\s*\\n*\\s*(\\d{1,3}(?:\\.\\d{3})*,\\d{2})\\b`, 'i')
    const m2 = reSemIs.exec(cobBlock)
    if (m2) {
      coberturas.push({ nome: clean(m2[1]) ?? '', valor_is: null, premio: brNum(m2[2]) })
    }
  }

  // Prêmio Total — bloco entre "Prêmio Total" e "Dados de Pagamento"/"Serviços"
  // Esperado 4 valores em ordem: Prêmio Líquido, Adicional Fracionamento, IOF, PRÊMIO TOTAL
  const premBlock = sections.premioTotal ?? ''
  const premNumbers = listBrNumbers(premBlock)
  const premio_liquido = premNumbers[0] ?? null
  const adicional_fracionamento = premNumbers[1] ?? null
  const iof = premNumbers[2] ?? null
  const premio_total = premNumbers.length >= 4
    ? premNumbers[premNumbers.length - 1]
    : (premNumbers[premNumbers.length - 1] ?? null)

  // Dados de Pagamento
  const pagBlock = sections.pagamento ?? ''
  const forma_pagamento = reFirst(/Forma\s+de\s+Pagamento\s*:?\s*([^\n]+)/i, pagBlock)
                       ?? reFirst(/Forma\s+de\s+Pagamento\s*:?\s*([^\n]+)/i)
  // Tabela parcelas: "1  242,56  0,00  0.00 %  16,67  17/03/2026"
  const parcelas: Array<Record<string, any>> = []
  const parcelaRe = /(?:^|\n)\s*(\d{1,2})\s+(\d{1,3}(?:\.\d{3})*,\d{2})\s+([\d\.\,]+)\s+([\d\.,%\s]+%)\s+([\d\.\,]+)\s+(\d{2}\/\d{2}\/\d{4})/gm
  let pm: RegExpExecArray | null
  while ((pm = parcelaRe.exec(pagBlock)) !== null) {
    parcelas.push({
      numero: Number(pm[1]),
      valor: brNum(pm[2]),
      juros: brNum(pm[3]),
      adicional_pct: clean(pm[4]),
      iof: brNum(pm[5]),
      vencimento: toIso(pm[6]),
    })
  }

  // Serviços (página 3)
  const servBlock = sections.servicos ?? ''
  const servicos = {
    assistencia_24h:  reFirst(/Assist[eê]ncia\s+24\s+horas?\s*\n*\s*([^\n]+)/i, servBlock),
    carro_reserva:    reFirst(/Carro\s+Reserva\s*\n*\s*([^\n]+)/i, servBlock),
    danos_vidros:     reFirst(/Danos\s+aos\s+Vidros\s*\n*\s*([^\n]+)/i, servBlock),
    pequenos_reparos: reFirst(/Pequenos\s+Reparos\s*\n*\s*([^\n]+)/i, servBlock),
  }

  // Franquias (página 3)
  const franqBlock = sections.franquias ?? ''
  const franqNumbers = listBrNumbers(franqBlock)
  const franqVidros = (() => {
    const items: Array<{ item: string; valor: number | string | null }> = []
    const itensVidro = ['Para-brisa\\s*\\(troca\\)', 'Vidro\\s+traseiro\\s*\\(vigia\\)', 'Vidro\\s+lateral', 'Farol\\s+Convencional', 'Lanterna\\s+Convencional', 'Farol\\s+X[eê]non', 'Farol\\s+Led', 'Farol\\s+Auxiliar', 'Lanterna\\s+Led', 'Lanterna\\s+Auxiliar', 'Retrovisor', 'Teto\\s+solar', 'Teto\\s+panor[aâ]mico']
    for (const it of itensVidro) {
      const m = new RegExp(`(${it})\\s*\\n*\\s*(\\d{1,3}(?:\\.\\d{3})*,\\d{2}|sem\\s+cobertura)`, 'i').exec(franqBlock)
      if (m) {
        items.push({
          item: clean(m[1]) ?? '',
          valor: /sem\s+cobertura/i.test(m[2]) ? 'sem cobertura' : brNum(m[2]),
        })
      }
    }
    return items
  })()
  const franquias = {
    compreensiva: franqNumbers[0] ?? null,
    vidros: franqVidros,
  }

  // Texto bruto truncado para debug (vai para coluna pdf_texto_bruto)
  const pdf_texto_bruto = rawText.length > 6000 ? rawText.slice(0, 6000) + '\n…[truncado]' : rawText
  // Snippets de cada seção (truncados) — vão para `dados.pdf_sections` jsonb
  // para facilitar debug quando alguma extração estruturada falhar.
  const trunc = (s: string, n = 800) => (s.length > n ? s.slice(0, n) + '…[truncado]' : s)
  const pdf_sections = Object.fromEntries(
    Object.entries(sections).map(([k, v]) => [k, trunc(v)])
  )

  return {
    // chaves snake_case espelham as colunas de seg_stage_apolices
    numero,
    endosso,
    proposta,
    versao,
    rule_id: ruleId,
    tipo_apolice: tipoApolice,
    codigo_ci: codigoCi,
    tipo_seguro: tipoSeguro,
    classe_bonus: classeBonus,
    data_emissao: toIso(dataEmissao),
    vigencia_ini: toIso(vig?.[1]),
    vigencia_fim: toIso(vig?.[2]),
    cliente_nome,
    cpf_cnpj,
    segurado_nome_social,
    segurado_email,
    segurado_telefone,
    segurado_cep,
    segurado_cidade,
    segurado_uf,
    segurado_estado_civil,
    corretor_nome,
    corretor_cnpj,
    corretor_susep,
    corretor_email,
    corretor_telefone,
    filial_ezze,
    utilizacao_veiculo,
    principal_condutor,
    condutor_nome,
    condutor_cpf,
    condutor_estado_civil,
    condutor_cobertura_jovem,
    marca,
    modelo,
    ano_modelo,
    cod_fipe,
    placa,
    chassi,
    zero_km,
    blindagem,
    tipo_franquia_casco,
    vistoria_previa,
    rastreador_obrigatorio,
    premio_liquido,
    adicional_fracionamento,
    iof,
    premio_total,
    forma_pagamento,
    parcelas: parcelas.length ? parcelas : null,
    coberturas: coberturas.length ? coberturas : null,
    servicos,
    franquias,
    produto: 'Auto Individual',
    status_apolice: 'ativo',
    layout_pdf: 'ezze-auto',
    pdf_texto_bruto,
    pdf_sections,
  }
}

// ─────────────────── RC Transporte (Carta Verde) ───────────────────
function parseRC(rawText: string): EzzeApoliceRow[] {
  const text = rawText
  const reFirst = (r: RegExp, src = text) => r.exec(src)?.[1]?.trim() ?? null

  const sections = splitSections(text, [
    { key: 'cabecalho',     re: /Garantido\s+por\s+EZZE/i },
    { key: 'vigencia',      re: /VIG[EÊ]NCIA\s+DA\s+AP[OÓ]LICE/i },
    { key: 'segurado',      re: /\bSEGURADO\b/ },
    { key: 'corretor',      re: /\bCORRETOR\b/ },
    { key: 'premio',        re: /Pr[eê]mio\s*\(EM/i },
    { key: 'parcelamento',  re: /PARCELAMENTO\s*\(EM/i },
    { key: 'veiculo',       re: /VE[IÍ]CULO\s+ITEM\s+N\.?\s*:?/i },
    { key: 'observacoes',   re: /OBSERVA[CÇ][OÕ]ES/i },
    { key: 'disposicoes',   re: /Disposi[cç][õo]es\s+Gerais/i },
  ])

  const numero    = reFirst(/Ap[oó]lice\s+N[uú]mero\s*:?\s*(\d+)/i)
  const proposta  = reFirst(/N[uú]mero\s+da\s+Proposta\s*:?\s*(\d+)/i)
  const endosso   = reFirst(/(?:^|\n)\s*Endosso\s*:?\s*(\d+)/i)
  const ramoCod   = reFirst(/(?:^|\n)\s*Ramo\s*:?\s*(\d+)/i)
  const sucursal  = reFirst(/Sucursal\s*:?\s*(\d+)/i)
  const dataEmissao = reFirst(/Dt\.?\s*Emiss[aã]o\s+Ap[oó]lice\s*:?\s*(\d{2}\/\d{2}\/\d{4})/i)
  const faturamento = reFirst(/Faturamento\s*:?\s*(\d+)/i)

  const vig = /Das?\s+\d{1,2}\s*:\s*\d{2}\s*h?\s*do\s+dia\s+(\d{2}\/\d{2}\/\d{4})\s+at[eé]\s+\d{1,2}\s*:\s*\d{2}\s*h?\s*do\s+dia\s+(\d{2}\/\d{2}\/\d{4})/i.exec(text)

  const segBlock = sections.segurado ?? ''
  const cliente_nome = pickNomeFromBlock(segBlock)
  const cpf_cnpj     = pickDocFromBlock(segBlock) ?? pickDocFromBlock(text)
  const segurado_endereco = clean(segBlock.match(/Endere[cç]o\s*:?\s*([^\n]+)/i)?.[1])
  const segurado_cep = clean(segBlock.match(/CEP\s*:?\s*(\d{5}-?\d{3})/i)?.[1])
  const cidadeMatch = segBlock.match(/Cidade\s*:?\s*([^\n]+?)(?:\s+UF\s*:?\s*([A-Z]{2})|\n)/i)
  const segurado_cidade = clean(cidadeMatch?.[1])
  const segurado_uf = cidadeMatch?.[2] ?? clean(segBlock.match(/UF\s*:?\s*([A-Z]{2})/i)?.[1])

  const corBlock = sections.corretor ?? ''
  const corretor_nome  = clean(corBlock.match(/Nome\s+do\s+Corretor\s*:?\s*([^\n]+?)(?:\s*C[oó]digo\s*Susep|\n)/i)?.[1])
  const corretor_susep = clean(corBlock.match(/C[oó]digo\s+Susep\s*:?\s*(\d+)/i)?.[1])

  const premBlock = sections.premio ?? ''
  const premNumbers = listBrNumbers(premBlock)
  const premio_liquido = premNumbers[0] ?? null
  const adicional_fracionamento = premNumbers[1] ?? null
  const custo_apolice = premNumbers[2] ?? null
  const iof = premNumbers[3] ?? null
  const premio_total = premNumbers.length >= 5 ? premNumbers[premNumbers.length - 1] : (premNumbers[4] ?? null)

  const pdf_texto_bruto = rawText.length > 6000 ? rawText.slice(0, 6000) + '\n…[truncado]' : rawText

  const baseRow: EzzeApoliceRow = {
    numero,
    proposta,
    endosso,
    ramo_codigo: ramoCod,
    sucursal,
    faturamento,
    data_emissao: toIso(dataEmissao),
    vigencia_ini: toIso(vig?.[1]),
    vigencia_fim: toIso(vig?.[2]),
    cliente_nome,
    cpf_cnpj,
    segurado_endereco,
    segurado_cep,
    segurado_cidade,
    segurado_uf,
    corretor_nome,
    corretor_susep,
    premio_liquido,
    adicional_fracionamento,
    custo_apolice,
    iof,
    premio_total,
    produto: 'RC Transporte Coletivo Rodoviário',
    status_apolice: 'ativo',
    layout_pdf: 'ezze-rc-transporte',
    pdf_texto_bruto,
  }

  // Cada bloco "VEÍCULO ITEM N.: <n>" vira uma linha de staging
  const veiculoBlocks: Array<{ item: string; block: string }> = []
  const veicRe = /VE[IÍ]CULO\s+ITEM\s+N\.?\s*:?\s*(\d+)([\s\S]*?)(?=VE[IÍ]CULO\s+ITEM\s+N\.?\s*:|OBSERVA[CÇ][OÕ]ES|$)/gi
  let m: RegExpExecArray | null
  while ((m = veicRe.exec(text)) !== null) {
    veiculoBlocks.push({ item: m[1], block: m[2] })
  }

  if (!veiculoBlocks.length) return [baseRow]

  return veiculoBlocks.map(({ item, block }) => {
    const fab = clean(block.match(/Fabricante\s*:?\s*([^\n]+?)(?:\s*Nr\s+Passageiro|\n)/i)?.[1])
    const veic = clean(block.match(/(?:^|\n)\s*Ve[ií]culo\s*:?\s*([^\n]+?)(?:\s*Prefixo|\n)/i)?.[1])
    const licenca = clean(block.match(/Licen[cç]a\s*:?\s*([A-Z0-9]+)/i)?.[1])
    const chassi = clean(block.match(/Chassi\s*:?\s*([A-Z0-9]{17})/i)?.[1])
    const fabModelo = clean(block.match(/Fabrica[cç][aã]o\/Modelo\s*:?\s*([\d\/]+)/i)?.[1])
    const tipoVeic = clean(block.match(/Tipo\s+de\s+Ve[ií]culo\s*:?\s*([^\n]+)/i)?.[1])
    const utilizacao = clean(block.match(/Utiliza[cç][aã]o\s+do\s+Ve[ií]culo\s*:?\s*([^\n]+?)(?:\s*Tipo|\n)/i)?.[1])
    const passageirosStr = clean(block.match(/Nr\s+Passageiro\s*:?\s*(\d+)/i)?.[1])
    return {
      ...baseRow,
      item_veiculo: Number(item),
      marca: fab,
      modelo: veic,
      ano_modelo: fabModelo,
      placa: licenca,
      chassi,
      tipo_veiculo: tipoVeic,
      utilizacao_veiculo: utilizacao,
      nr_passageiros: passageirosStr ? Number(passageirosStr) : null,
    }
  })
}

export interface ParseEzzeResult {
  layout: EzzeLayout
  rows: EzzeApoliceRow[]
  textoBruto: string
}

export async function parseEzzeApolicePdf(buffer: Buffer | Uint8Array): Promise<ParseEzzeResult> {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer)
  const parsed = await pdfParse(buf)
  const texto = parsed.text || ''
  const layout = detectEzzeLayout(texto)
  if (layout === 'auto') return { layout, rows: [parseAuto(texto)], textoBruto: texto }
  if (layout === 'rc')   return { layout, rows: parseRC(texto), textoBruto: texto }
  throw new Error('Layout de apólice Ezze não reconhecido. Esperado: Auto Individual ou RC Transporte de Passageiros.')
}
