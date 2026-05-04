// Parser de apólice Novo Seguros (Auto Clássico).
// Layout descrito pelo usuário:
//   Caixas azul-marinho arredondadas + duas colunas. Vigência MENSAL (não anual).
//   Apólice formato "1003100127842" + Proposta separada.

import {
  brNum, clean, splitSections, reFirst,
  pickDocFromBlock, pickEmail, pickTelefone, pickCep,
  pickPlaca, pickChassi, pickVigencia, truncateText, pickProcessoSusep,
  type ApoliceRow,
} from './_common'

export function parseNovo(text: string): ApoliceRow[] {
  const sections = splitSections(text, [
    { key: 'seguro',    re: /Dados\s+do\s+Seguro/i },
    { key: 'segurado',  re: /Dados\s+do\s+Segurado/i },
    { key: 'veiculo',   re: /\bVe[ií]culo\b|Dados\s+do\s+Ve[ií]culo/i },
    { key: 'coberturas', re: /\bCoberturas\b/i },
    { key: 'franquias', re: /Franquias?/i },
    { key: 'pagamentos', re: /Pagamentos?/i },
    { key: 'corretor',  re: /\bCorretor\b/i },
    { key: 'observacoes', re: /Observa[cç][õo]es/i },
  ])

  const numero = reFirst(/Ap[oó]lice\s*:?\s*(\d{8,})/i, text)
  const proposta = reFirst(/Proposta\s*:?\s*(\d+)/i, text)
  const ramo = reFirst(/Ramo\s*:?\s*([^\n]+?)(?:\s+Ap[oó]lice|\n)/i, text)

  // Vigência mensal: "Início: 24:00h, 26/04/26 Fim: 24:00h, 26/05/26"
  // pickVigencia funciona pq pega DD/MM/AA(AA). Mas é AAAA com 2 dígitos —
  // tenta fallback explícito.
  const vigShort = text.match(/In[ií]cio\s*:?\s*[^,]*?,?\s*(\d{2}\/\d{2}\/(?:\d{2}|\d{4}))[\s\S]*?Fim\s*:?\s*[^,]*?,?\s*(\d{2}\/\d{2}\/(?:\d{2}|\d{4}))/i)
  const vig = pickVigencia(text)
  const expandYear = (d: string) => {
    const m = d.match(/(\d{2})\/(\d{2})\/(\d{2,4})/)
    if (!m) return null
    const yy = m[3].length === 2 ? `20${m[3]}` : m[3]
    return `${yy}-${m[2]}-${m[1]}`
  }
  const vigencia_ini = vigShort ? expandYear(vigShort[1]) : vig.ini
  const vigencia_fim = vigShort ? expandYear(vigShort[2]) : vig.fim

  const segBlock = sections.segurado || ''
  const cliente_nome = clean(segBlock.match(/Nome\s*:?\s*([^\n]+)/i)?.[1])
                    ?? clean(segBlock.match(/Propon?ente\s*:?\s*([^\n]+)/i)?.[1])
  const cpf_cnpj = pickDocFromBlock(segBlock)
  const segurado_email = pickEmail(segBlock)
  const segurado_telefone = pickTelefone(segBlock)
  const segurado_cep = pickCep(segBlock)

  const veicBlock = sections.veiculo || ''
  const veiculo = clean(veicBlock.match(/Ve[ií]culo\s*:?\s*([^\n]+)/i)?.[1])
                ?? clean(veicBlock.match(/Modelo\s*:?\s*([^\n]+)/i)?.[1])
  const fabricante = clean(veicBlock.match(/Fabricante\s*:?\s*([^\n]+)/i)?.[1])
  const placa = pickPlaca(veicBlock)
  const chassi = pickChassi(veicBlock)
  const ano_modelo = reFirst(/Ano\s+Modelo\s*:?\s*([\d/]+)/i, veicBlock)
  const cod_fipe = reFirst(/C[oó]digo\s+FIPE\s*:?\s*([\w-]+)/i, veicBlock)
  const combustivel = reFirst(/Combust[ií]vel\s*:?\s*([^\n]+)/i, veicBlock)

  // Coberturas — tabela "Descrição | LMI | Prêmio Líquido"
  const cobBlock = sections.coberturas || ''
  const coberturas: Array<{ nome: string; lmi: number | null; premio: number | null }> = []
  for (const linha of cobBlock.split('\n').map(l => l.trim()).filter(Boolean)) {
    if (/^(coberturas|descri[cç][aã]o)/i.test(linha)) continue
    const m = linha.match(/^(.+?)\s+R?\$?\s*(\d{1,3}(?:\.\d{3})*,\d{2})\s+R?\$?\s*(\d{1,3}(?:\.\d{3})*,\d{2})$/)
    if (m) coberturas.push({ nome: clean(m[1]) ?? '', lmi: brNum(m[2]), premio: brNum(m[3]) })
  }

  // Prêmio
  const premio_liquido = brNum(reFirst(/Pr[eê]mio\s+L[ií]quido\s*:?\s*R?\$?\s*([\d.,]+)/i, text))
  const iof = brNum(reFirst(/\bIOF\s*:?\s*R?\$?\s*([\d.,]+)/i, text))
  const premio_total = brNum(reFirst(/Pr[eê]mio\s+Bruto\s+Total\s*:?\s*R?\$?\s*([\d.,]+)/i, text))
                    ?? brNum(reFirst(/Pr[eê]mio\s+Total\s*:?\s*R?\$?\s*([\d.,]+)/i, text))

  // Pagamento — geralmente boleto mensal
  const pag = sections.pagamentos || ''
  const forma_pagamento = clean(pag.match(/(Boleto|Cart[aã]o|D[eé]bito)/i)?.[0]) ?? 'Boleto Mensal'
  const vencimento = clean(pag.match(/Vencimento\s*:?\s*(\d{2}\/\d{2}\/\d{4})/i)?.[1])

  // Corretor
  const corBlock = sections.corretor || ''
  const corretor_nome = clean(corBlock.match(/Nome\s*:?\s*([^\n]+)/i)?.[1])
  const corretor_cnpj = pickDocFromBlock(corBlock)
  const corretor_susep = clean(corBlock.match(/SUSEP\s*:?\s*(\d+)/i)?.[1])

  return [{
    seguradora_origem: 'novo',
    numero,
    proposta,
    ramo_codigo: ramo,
    cliente_nome,
    cpf_cnpj,
    segurado_email,
    segurado_telefone,
    segurado_cep,
    marca: fabricante,
    modelo: veiculo,
    ano_modelo,
    placa,
    chassi,
    cod_fipe,
    combustivel,
    vigencia_ini,
    vigencia_fim,
    coberturas: coberturas.length ? coberturas : null,
    premio_liquido,
    iof,
    premio_total,
    premio: premio_total ?? premio_liquido,
    forma_pagamento,
    proximo_vencimento: vencimento,
    corretor_nome,
    corretor_cnpj,
    corretor_susep,
    processo_susep: pickProcessoSusep(text),
    produto: 'Auto Novo Seguros (Mensal)',
    status_apolice: 'ativo',
    layout_pdf: 'novo-auto-mensal',
    pdf_texto_bruto: truncateText(text),
  }]
}
