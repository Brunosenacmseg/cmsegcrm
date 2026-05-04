// Parser de apólices em PDF da Ezze Seguros.
// Suporta dois layouts:
//  1. Auto Individual (cabeçalho "APÓLICE SEGURO AUTO INDIVIDUAL")
//  2. RC Transporte / Carta Verde ("SEGURO DE RESPONSABILIDADE CIVIL DAS EMPRESAS DE TRANSPORTE…")
//
// IMPORTANTE — sobre o pdf-parse e o layout da Ezze:
// O pdf-parse extrai texto na ordem em que os tokens estão no fluxo do PDF, e
// para os PDFs da Ezze (gerados a partir de templates com colunas paralelas)
// isso significa que o output vem como:
//   1) todos os LABELS na ordem coluna-esquerda → coluna-direita
//   2) todos os VALORES correspondentes na mesma ordem
//   3) os HEADERS DE SEÇÃO ("Dados da Apólice", "Segurado", "Corretor",
//      "Questionário…") aparecem só NO FIM da página
// Por isso fatiar por header de seção (versões anteriores) NÃO funciona.
// Esta versão usa extração por ÂNCORA: para cada campo, procura o label
// específico no texto inteiro e extrai o valor adjacente, ou usa heurísticas
// de posição independentes (1º all-caps name = segurado, 1º bloco de 11
// dígitos = CPF segurado, etc.).
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

function listBrNumbers(s: string): number[] {
  return [...s.matchAll(/(\d{1,3}(?:\.\d{3})*,\d{2})/g)]
    .map(m => brNum(m[1]))
    .filter((n): n is number => n != null)
}

// Procura nomes em CAIXA ALTA com 2+ palavras no bloco/texto. Filtra
// strings que ficam em CAPS no PDF mas não são nomes próprios (CORRETORA,
// FIPE, MATRIZ, marcas de carro, palavras técnicas, etc.).
const CAPS_BLACKLIST = /^(?:SEGURADO|CORRETOR|CORRETORA|CORRETORES|NOME|NOME\s+SOCIAL|CPF|CNPJ|TELEFONE|EMAIL|E\s*-?\s*MAIL|CEP|CIDADE|UF|ESTADO\s+CIVIL|DATA\s+EMISSAO|VIGENCIA|APOLICE|AP[OÓ]LICE|SEGURO|SEGUROS|EZZE|HDI|TOKIO|PORTO|ALLIANZ|BRADESCO|DARWIN|MAPFRE|SUSEP|FIPE|NOVO|VEICULO|VE[IÍ]CULO|MARCA|MODELO|CHASSI|PLACA|ANO\s+MODELO|MATRIZ|FILIAL|RAMO|SUCURSAL|CASADO|SOLTEIRO|DIVORCIADO|VI[UÚ]VO|UNI[AÃ]O\s+EST[AÁ]VEL|SIM|N[AÃ]O|RESERVA|HORAS|VIDROS|COMPREENSIVA|DANOS|ASSIST[EÊ]NCIA|CARRO|FRANQUIA|FRANQUIAS|COBERTURA|COBERTURAS|PARCELAMENTO|PR[EÊ]MIO|TOTAL|LIQUIDO|L[IÍ]QUIDO|IOF|VENCIMENTO|CASCO|VISTORIA|RASTREADOR|BLINDAGEM|FORD|VOLKSWAGEN|FIAT|CHEVROLET|GM|HYUNDAI|RENAULT|HONDA|TOYOTA|NISSAN|JEEP|PEUGEOT|CITROEN|VAN|SEDAN|HATCH|GUAIA[CÇ][AÃ]|JUNDIA[IÍ]|S[AÃ]O\s+PAULO|RIO|LTDA|SA|SAS|EIRELI|ME|EPP)\b/i

function findAllUpperNames(text: string): string[] {
  const re = /[A-ZÀ-Ÿ]{2,}(?:\s+[A-ZÀ-Ÿ\.\-']{2,}){1,5}/g
  const out: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const s = m[0].trim()
    if (s.length < 5 || s.length > 100) continue
    const sNoPunct = s.replace(/[\.\-']/g, '')
    if (CAPS_BLACKLIST.test(sNoPunct)) continue
    out.push(s)
  }
  return out
}

// Aceita formato com ou sem pontuação. Filtra zeros e identificadores genéricos.
function findAllDocs(text: string): { cpfs: string[]; cnpjs: string[] } {
  const cpfs = new Set<string>()
  const cnpjs = new Set<string>()
  // Formatados primeiro
  for (const m of text.matchAll(/\b(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})\b/g)) {
    cnpjs.add(m[1].replace(/\D/g, ''))
  }
  for (const m of text.matchAll(/\b(\d{3}\.\d{3}\.\d{3}-\d{2})\b/g)) {
    cpfs.add(m[1].replace(/\D/g, ''))
  }
  // Sem formatação (em ordem de aparição)
  const cpfsOrder: string[] = []
  const cnpjsOrder: string[] = []
  for (const m of text.matchAll(/(?<!\d)(\d{11}|\d{14})(?!\d)/g)) {
    const v = m[1]
    if (v.length === 14 && !cnpjs.has(v)) { cnpjs.add(v); cnpjsOrder.push(v) }
    if (v.length === 11 && !cpfs.has(v)) { cpfs.add(v); cpfsOrder.push(v) }
    if (v.length === 11 && cpfs.has(v) && !cpfsOrder.includes(v)) cpfsOrder.push(v)
    if (v.length === 14 && cnpjs.has(v) && !cnpjsOrder.includes(v)) cnpjsOrder.push(v)
  }
  // Ordena array de retorno por posição: prioriza ordem de aparição
  // (não é trivial misturar formatados/não-formatados; mantém só Set + order)
  return {
    cpfs: cpfsOrder.length ? cpfsOrder : Array.from(cpfs),
    cnpjs: cnpjsOrder.length ? cnpjsOrder : Array.from(cnpjs),
  }
}

// ─────────────────── Auto Individual ───────────────────
function parseAuto(rawText: string): EzzeApoliceRow {
  const text = rawText
  const reF = (r: RegExp, src = text) => r.exec(src)?.[1]?.trim() ?? null

  // ── Cabeçalho da apólice (presente em toda página)
  const numero       = reF(/N[ºo°]\s*Ap[oó]lice\s*:?\s*(\d+)/i)
  const endosso      = reF(/Endosso\s*:?\s*\n?\s*(\d+)/i)
  const proposta     = reF(/Proposta\s*:?\s*(\d+)/i)
  const versao       = reF(/Vers[aã]o\s*:?\s*\n?\s*([\d.]+)/i)
  const ruleId       = reF(/Rule\s*ID\s*:?\s*\n?\s*(\d+)/i)
  const tipoApolice  = reF(/Ap[oó]lice\s*:\s*(Completo|Parcial|B[áa]sico)\b/i)
  const codigoCi     = reF(/C[oó]digo\s*CI[\s\S]{0,60}?(\d{10,16})/i)
                     ?? reF(/(\d{10,16})\s*\n?\s*C[oó]digo\s*CI/i)

  // ── Tipo de Seguro / Classe Bônus
  // Layout: "Classe bônus:Tipo de Seguro:\nSeguro Novo0\nDados da Apólice"
  // Os 2 valores ficam concatenados ("Seguro Novo" + "0"). Extraímos cada um
  // procurando o padrão correspondente no resto do texto.
  const tipoSeguro = reF(/Tipo\s*de\s*Seguro[\s\S]{0,80}?\n([A-Za-zÀ-ÿ ]{2,40}?)(?=\d|\n|$)/i)
  const classeBonusStr = reF(/Classe\s*b[oô]nus[\s\S]{0,120}?(\d+)\s*\n/i)
                      ?? reF(/Classe\s*b[oô]nus[\s\S]{0,80}?(\d+)/i)
  const classeBonus = classeBonusStr != null ? Number(classeBonusStr) : null

  // ── Data Emissão (1º DD/MM/YYYY após "Data da Emissão")
  const dataEmissao = reF(/Data\s*da\s*Emiss[aã]o[\s\S]{0,200}?(\d{2}\/\d{2}\/\d{4})/i)

  // ── Vigência: "das 00:00 do dia DD/MM/YYYY até 23:59 do dia DD/MM/YYYY"
  // Aparece com whitespace normal mesmo nesse layout (é frase contínua).
  const vig = /das?\s*\d{1,2}\s*:\s*\d{2}\s*h?\s*do\s*dia\s*(\d{2}\/\d{2}\/\d{4})\s*at[eé]\s*\d{1,2}\s*:\s*\d{2}\s*h?\s*do\s*dia\s*(\d{2}\/\d{2}\/\d{4})/i.exec(text)

  // ── Cliente (segurado): 1º all-caps name no texto que não seja
  // título/marca/cidade. Funciona porque o nome do segurado aparece antes
  // do nome do corretor, antes de "BRUNO" do questionário, antes de "Nome
  // Social" etc. — e é a primeira sequência válida em CAIXA ALTA.
  const allUpperNames = findAllUpperNames(text)
  const cliente_nome = allUpperNames[0] ?? null
  // Nome Social: 2ª ocorrência (geralmente igual ao 1º)
  const segurado_nome_social = allUpperNames.find((n, i) => i > 0 && n === cliente_nome) ?? cliente_nome

  // ── CPF/CNPJ segurado: 1º documento sem formatação. Para PF a Ezze envia
  // CPF "puro" (11 dígitos contínuos) na seção segurado. CNPJs aparecem só
  // no corretor e no rodapé (filtrados via ordem de aparição).
  const docs = findAllDocs(text)
  // CPF do segurado: 1º CPF puro (não formatado) — vem antes do condutor
  // (que aparece formatado). Fallback: 1º CPF.
  const cpf_cnpj = docs.cpfs[0] ?? docs.cnpjs[0] ?? null
  // CNPJ do corretor: 1º CNPJ. O CNPJ da Ezze (rodapé) também é 14 dígitos
  // mas formatado como "31.534.848/0001-24" — fica em docs.cnpjs depois do
  // CNPJ não-formatado da corretora (ex.: "32186014000138").
  // Pulamos qualquer CNPJ que comece com "31534848" (CNPJ da Ezze).
  const corretor_cnpj = docs.cnpjs.find(n => !n.startsWith('31534848')) ?? null

  // ── Email: 1º email é do segurado, 2º é do corretor
  const allEmails = [...text.matchAll(/([\w.\-+]+@[\w.\-]+\.[A-Za-z]{2,})/g)]
    .map(m => m[1])
    .filter(e => !/i4proinfo\.local|ezzeseguros\.com\.br/i.test(e))
  const segurado_email = allEmails[0] ?? null
  const corretor_email = allEmails[1] ?? null

  // ── Telefone segurado: 1º (DD) NNNNN-NNNN no texto
  const telMatch = /\(\s*(\d{2})\s*\)\s*(\d{4,5}-?\d{4})/.exec(text)
  const segurado_telefone = telMatch ? `(${telMatch[1]}) ${telMatch[2]}` : null

  // ── CEP: 8 dígitos isolados (sem ser parte de outros números)
  // No texto aparece "13212375" como uma linha solta. Pode aparecer formatado
  // como "13212-375" também. Pegamos o 1º.
  const cepMatch = text.match(/\b(\d{5}-\d{3}|\d{8})\b/)
  const segurado_cep = cepMatch?.[1] ?? null

  // ── Estado civil
  const segurado_estado_civil = reF(/(Casado|Solteiro|Divorciado|Vi[uú]vo|Uni[aã]o\s+Est[aá]vel)\s*\(a\)/i)

  // ── UF e Cidade: aparece como "SPJUNDIAÍ" — 2 caps + nome cidade
  // (também pode aparecer com espaço/quebra). Pega 1ª ocorrência.
  let segurado_uf: string | null = null
  let segurado_cidade: string | null = null
  const ufCidadeJoined = /\b([A-Z]{2})([A-ZÀ-Ÿ][A-Za-zÀ-ÿ' \-]{2,40})\b/.exec(text)
  if (ufCidadeJoined) {
    segurado_uf = ufCidadeJoined[1]
    segurado_cidade = ufCidadeJoined[2].trim()
  } else {
    segurado_uf = reF(/UF\s*:?\s*\n?\s*([A-Z]{2})\b/i)
    segurado_cidade = reF(/Cidade\s*:?\s*\n?\s*([A-ZÀ-Ÿ][A-Za-zÀ-ÿ' \-]{2,40})/i)
  }

  // ── Corretor nome: padrão "PEIXOTO & SENA CORRETORA DE SEGUROS\nLTDA"
  // ou "NOME LTDA"/"NOME S/A"/"NOME EIRELI" em uma ou duas linhas.
  const corretor_nome = (() => {
    // Multi-linha: NOME contendo CORRETORA + LTDA
    const m1 = /([A-ZÀ-Ÿ][A-ZÀ-Ÿ&\s'\.\-]{4,80}?CORRETORA[\s\nA-ZÀ-Ÿ]*?LTDA)/i.exec(text)
    if (m1) return clean(m1[1].replace(/\n/g, ' '))
    // Genérico: NOME + LTDA/SA/EIRELI
    const m2 = /([A-ZÀ-Ÿ][A-ZÀ-Ÿ&\s'\.\-]{4,80}?(?:LTDA|S\/?A|S\.A\.|EIRELI|\bME\b))/i.exec(text)
    return m2 ? clean(m2[1].replace(/\n/g, ' ')) : null
  })()

  // ── SUSEP corretor: número 6-9 dígitos que não seja CPF, CNPJ, código CI
  const susepCandidates = [...text.matchAll(/(?<!\d)(\d{6,9})(?!\d)/g)].map(m => m[1])
  const corretor_susep = susepCandidates.find(n =>
    n !== cpf_cnpj && n !== corretor_cnpj && n !== codigoCi && n.length <= 10
  ) ?? null

  // ── Telefone corretor: 2º telefone (se houver)
  const allTels = [...text.matchAll(/\(\s*(\d{2})\s*\)\s*(\d{4,5}-?\d{4})/g)]
  const corretor_telefone = allTels[1] ? `(${allTels[1][1]}) ${allTels[1][2]}` : null

  // ── Filial Ezze (Matriz / Filial X)
  const filial_ezze = reF(/Filial\s*Ezze\s*:?\s*\n?\s*(Matriz|Filial[^\n]*)/i)

  // ── Veículo
  const placa  = reF(/Placa\s*\n?\s*([A-Z0-9]{7})/i)
  const chassi = reF(/Chassi\s*\n?\s*([A-Z0-9]{17})/i)
  const ano_modelo = reF(/Ano\s*Modelo\s*\n?\s*(\d{4})/i)
  const cod_fipe = reF(/(?:C[oó]d\.?|C[oó]digo)\s*FIPE\s*\n?\s*([\w\-]+)/i)
  const marca = reF(/Marca\s*\n?\s*([A-Za-zÀ-ÿ\- ]{2,40})/i)
  const modelo = reF(/Modelo\s*\n?\s*([A-Za-z0-9À-ÿ\.\-\/\(\) ]{2,80})/i)
  const zero_km = simNao(reF(/Zero\s*KM\s*\n?\s*(Sim|N[aã]o)/i))
  const blindagem = simNao(reF(/Blindagem\s*\n?\s*(Sim|N[aã]o)/i))
  const tipo_franquia_casco = reF(/Tipo\s*Franquia\s*Casco\s*\n?\s*([^\n]+?)(?:\s*Vistoria|\n)/i)
  const vistoria_previa = simNao(reF(/Vistoria\s*Pr[eé]via\s*Obrigat[oó]ria\s*\n?\s*(Sim|N[aã]o)/i))
  const rastreador_obrigatorio = simNao(reF(/Rastreador\s*Obrigat[oó]rio\s*\n?\s*(Sim|N[aã]o)/i))

  // ── Prêmio: bloco entre "Prêmio Líquido" e "Cobertura" tem todos os valores
  // em ordem (label1, label2, ..., valor1, valor2, ...). Formato típico:
  //   "Prêmio Líquido\nIOF\nPRÊMIO TOTAL\n2.258,88\n166,70\n2.425,59"
  // (Adicional Fracionamento é frequentemente omitido pelo pdf-parse quando 0,00.)
  // O LAST número é sempre o Prêmio Total.
  const premBlockMatch = /Pr[eê]mio\s*L[ií]quido[\s\S]{0,500}?(?=Cobertura|Coberturas|Pr[eê]mio\s*L[ií]quido\s*Total|ParcelasValor)/i.exec(text)
  const premBlock = premBlockMatch?.[0] ?? ''
  const premNumbers = listBrNumbers(premBlock)
  const premio_liquido = premNumbers[0] ?? null
  const premio_total   = premNumbers[premNumbers.length - 1] ?? null
  // 3 valores → ordem Líquido / IOF / Total. 4 valores → Líquido / Frac / IOF / Total.
  const adicional_fracionamento = premNumbers.length === 4 ? premNumbers[1] : null
  const iof = premNumbers.length === 4 ? premNumbers[2]
            : premNumbers.length === 3 ? premNumbers[1]
            : null

  // ── Forma de Pagamento + Parcelas (tabela)
  const forma_pagamento = reF(/Forma\s*de\s*Pagamento\s*:?\s*([^\n]+)/i)
  const parcelas: Array<Record<string, any>> = []
  const parcelaRe = /(?:^|\n)\s*(\d{1,2})\s+(\d{1,3}(?:\.\d{3})*,\d{2})\s+([\d\.\,]+)\s+([\d\.,%\s]+%)\s+([\d\.\,]+)\s+(\d{2}\/\d{2}\/\d{4})/gm
  let pm: RegExpExecArray | null
  while ((pm = parcelaRe.exec(text)) !== null) {
    parcelas.push({
      numero: Number(pm[1]),
      valor: brNum(pm[2]),
      juros: brNum(pm[3]),
      adicional_pct: clean(pm[4]),
      iof: brNum(pm[5]),
      vencimento: toIso(pm[6]),
    })
  }

  // ── Coberturas (tabela "Cobertura | Valor IS | Prêmio")
  // Padrão linha-por-cobertura quando pdf-parse junta colunas:
  // "Compreensiva100% V.M.R Fipe928,58", "Danos MateriaisR$ 100.000,00635,48", "Vidros136,53"
  const COB_NOMES = ['Compreensiva', 'Danos\\s*Materiais', 'Danos\\s*Corporais', 'Vidros', 'Assist[eê]ncia\\s*24\\s*Horas', 'Carro\\s*Reserva', 'APP', 'RCF']
  const coberturas: Array<{ nome: string; valor_is: string | null; premio: number | null }> = []
  for (const nomeRe of COB_NOMES) {
    // 1) Com Valor IS antes do prêmio
    const reComIs = new RegExp(`(${nomeRe})\\s*\\n*\\s*((?:R\\$\\s*)?\\d[\\d\\.\\,]*(?:\\s*%?\\s*V\\.M\\.R\\s*Fipe|\\s*Fipe)?)\\s*\\n*\\s*(\\d{1,3}(?:\\.\\d{3})*,\\d{2})\\b`, 'i')
    const m1 = reComIs.exec(text)
    if (m1) {
      coberturas.push({ nome: clean(m1[1]) ?? '', valor_is: clean(m1[2]) ?? null, premio: brNum(m1[3]) })
      continue
    }
    // 2) Sem Valor IS — só nome + prêmio
    const reSemIs = new RegExp(`(${nomeRe})\\s*\\n*\\s*(\\d{1,3}(?:\\.\\d{3})*,\\d{2})\\b`, 'i')
    const m2 = reSemIs.exec(text)
    if (m2) {
      coberturas.push({ nome: clean(m2[1]) ?? '', valor_is: null, premio: brNum(m2[2]) })
    }
  }

  // ── Questionário de Avaliação de Risco
  const utilizacao_veiculo = reF(/utiliza[cç][aã]o\s*do\s*ve[ií]culo\s*\??\s*\n?\s*([^\n]+)/i)
  const principal_condutor = reF(/principal\s*condutor\s*\??\s*\n?\s*([^\n]+)/i)
  const condutor_nome = reF(/Nome\s*completo\s*do\s*condutor\s*\n?\s*([A-ZÀ-Ÿ][A-Za-zÀ-ÿ\s'\-\.]{4,99}?)(?:\s*CPF|\n|$)/i)
  const condutor_cpf_match = /CPF\s*do\s*condutor\s*\n?\s*([\d\.\-]+)/i.exec(text)
  const condutor_cpf = condutor_cpf_match?.[1]?.replace(/\D/g, '') ?? null
  const condutor_estado_civil = reF(/Estado\s*civil\s*do\s*condutor\s*\n?\s*([^\n]+?)(?:\s*Deseja|\n|$)/i)
  const condutor_cobertura_jovem = simNao(reF(/condutores\s*na\s*faixa[\s\S]{0,300}?(Sim|N[aã]o)/i))

  // ── Serviços e Franquias (página 3)
  const servicos = {
    assistencia_24h:  reF(/Assist[eê]ncia\s*24\s*horas?\s*\n?\s*([^\n]+)/i),
    carro_reserva:    reF(/Carro\s*Reserva\s*\n?\s*([^\n]+)/i),
    danos_vidros:     reF(/Danos\s*aos\s*Vidros\s*\n?\s*([^\n]+)/i),
    pequenos_reparos: reF(/Pequenos\s*Reparos\s*\n?\s*([^\n]+)/i),
  }
  const franquias = (() => {
    const compreensiva = brNum(reF(/Franquia\s*\(R\$\)\s*\n?\s*([\d\.\,]+)/i))
    return { compreensiva }
  })()

  // ── Texto bruto + sections (debug)
  const pdf_texto_bruto = rawText.length > 6000 ? rawText.slice(0, 6000) + '\n…[truncado]' : rawText

  return {
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
  }
}

// ─────────────────── RC Transporte (Carta Verde) ───────────────────
function parseRC(rawText: string): EzzeApoliceRow[] {
  const text = rawText
  const reF = (r: RegExp, src = text) => r.exec(src)?.[1]?.trim() ?? null

  const numero    = reF(/Ap[oó]lice\s+N[uú]mero\s*:?\s*(\d+)/i)
  const proposta  = reF(/N[uú]mero\s+da\s+Proposta\s*:?\s*(\d+)/i)
  const endosso   = reF(/(?:^|\n)\s*Endosso\s*:?\s*(\d+)/i)
  const ramoCod   = reF(/(?:^|\n)\s*Ramo\s*:?\s*(\d+)/i)
  const sucursal  = reF(/Sucursal\s*:?\s*(\d+)/i)
  const dataEmissao = reF(/Dt\.?\s*Emiss[aã]o\s+Ap[oó]lice\s*:?\s*(\d{2}\/\d{2}\/\d{4})/i)
  const faturamento = reF(/Faturamento\s*:?\s*(\d+)/i)

  const vig = /Das?\s+\d{1,2}\s*:\s*\d{2}\s*h?\s*do\s+dia\s+(\d{2}\/\d{2}\/\d{4})\s+at[eé]\s+\d{1,2}\s*:\s*\d{2}\s*h?\s*do\s+dia\s+(\d{2}\/\d{2}\/\d{4})/i.exec(text)

  // Segurado
  const allUpperNames = findAllUpperNames(text)
  const cliente_nome = allUpperNames[0] ?? null
  const docs = findAllDocs(text)
  const cpf_cnpj = docs.cnpjs[0] ?? docs.cpfs[0] ?? null

  const segurado_endereco = clean(text.match(/Endere[cç]o\s*:?\s*([^\n]+)/i)?.[1])
  const segurado_cep = clean(text.match(/CEP\s*:?\s*(\d{5}-?\d{3})/i)?.[1])
  const cidadeMatch = text.match(/Cidade\s*:?\s*([^\n]+?)(?:\s+UF\s*:?\s*([A-Z]{2})|\n)/i)
  const segurado_cidade = clean(cidadeMatch?.[1])
  const segurado_uf = cidadeMatch?.[2] ?? clean(text.match(/UF\s*:?\s*([A-Z]{2})/i)?.[1])

  const corretor_nome  = clean(text.match(/Nome\s+do\s+Corretor\s*:?\s*([^\n]+?)(?:\s*C[oó]digo\s*Susep|\n)/i)?.[1])
  const corretor_susep = clean(text.match(/C[oó]digo\s+Susep\s*:?\s*(\d+)/i)?.[1])

  // Prêmios — bloco "Prêmio (EM R$)" tem 5+ valores em sequência
  const premBlockMatch = /Pr[eê]mio\s*\(EM\s*R\$\)([\s\S]*?)(?=PARCELAMENTO|VE[IÍ]CULO|OBSERVA)/i.exec(text)
  const premNumbers = listBrNumbers(premBlockMatch?.[1] ?? text)
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
