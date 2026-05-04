// Identifica automaticamente qual seguradora emitiu uma apólice em PDF
// olhando o texto. As assinaturas vêm das descrições de layout fornecidas
// pelo usuário (cabeçalhos, logos, textos institucionais).
//
// A ordem importa: testes mais específicos antes dos genéricos.
// Por exemplo, "Porto Seguro" deve vir antes de "azul" pq a Porto operava a Azul.

import { norm } from './pdf-utils'

export type SeguradoraId =
  | 'allianz'
  | 'azul'
  | 'bradesco'
  | 'darwin'
  | 'ezze'
  | 'hdi'
  | 'justos'
  | 'kovr'
  | 'mapfre'
  | 'novo'
  | 'pier'
  | 'porto'
  | 'suhai'
  | 'tokio'
  | 'yelum'
  | 'youse'
  | 'zurich'
  | 'unknown'

interface Signature {
  id: SeguradoraId
  // Lista de strings (já normalizadas — minúsculas, sem acento) que precisam aparecer
  // no texto pra reconhecer a seguradora. Basta UMA das alternativas casar.
  any?: string[]
  // Strings que TODAS precisam aparecer (refina match quando 'any' é ambíguo).
  all?: string[]
}

const SIGS: Signature[] = [
  // ─── Específicas / com risco de ambiguidade primeiro ──────────────────────
  // Azul Seguros é operada pela Porto, então o nome "azul seguros" precisa vir antes.
  { id: 'azul',     any: ['azul seguros', 'azul tradicional'] },
  // Porto pode aparecer como "porto seguro" no rodapé/cabeçalho de Porto Moto/Porto Auto
  { id: 'porto',    any: ['porto seguro', 'porto moto', 'porto auto'] },
  // Bradesco Seguros (auto/auto mulher)
  { id: 'bradesco', any: ['bradesco seguros', 'bradesco auto re', 'bradesco seguro auto'] },
  // Tokio Marine
  { id: 'tokio',    any: ['tokio marine'] },
  // Mapfre
  { id: 'mapfre',   any: ['mapfre seguros', 'mapfre auto'] },
  // Allianz
  { id: 'allianz',  any: ['allianz seguros', 'allianz auto'] },
  // HDI
  { id: 'hdi',      any: ['hdi seguros', 'hdi auto'] },
  // Zurich Minas Brasil
  { id: 'zurich',   any: ['zurich automovel', 'zurich minas brasil', 'zurich brasil', 'zurich seguros'] },
  // Yelum
  { id: 'yelum',    any: ['yelum seguros', 'yelum seguradora', 'yelum auto'] },
  // Youse / Caixa
  { id: 'youse',    any: ['youse seguros', 'caixa seguradora', 'youse auto'] },
  // Justos (PDF chamado "justus" no enunciado, mas a marca é Justos)
  { id: 'justos',   any: ['justos seguros'] },
  // Suhai
  { id: 'suhai',    any: ['suhai seguradora', 'suhai seguro'] },
  // Pier (chama de "Contrato")
  { id: 'pier',     any: ['pier seguros', 'pier seguradora', 'pier corretora', 'pier digital'] },
  // Darwin
  { id: 'darwin',   any: ['darwin seguros'] },
  // Novo Seguros (auto clássico, mensal)
  { id: 'novo',     any: ['novo seguros'] },
  // Kovr (RC transporte)
  { id: 'kovr',     any: ['kovr seguradora', 'kovr seguros'] },
  // Ezze (último — fallback de "ezze" seguros para auto e RC)
  { id: 'ezze',     any: ['ezze seguros', 'garantido por ezze'] },
]

export function detectSeguradora(text: string): SeguradoraId {
  if (!text) return 'unknown'
  const n = norm(text)
  for (const sig of SIGS) {
    const anyOk = sig.any ? sig.any.some(s => n.includes(s)) : true
    const allOk = sig.all ? sig.all.every(s => n.includes(s)) : true
    if (anyOk && allOk) return sig.id
  }
  return 'unknown'
}

// Mapeia o nome cadastrado em `seguradoras.nome` (livre) para o ID interno
// usado pelos parsers. Se o usuário cadastrou "Tokio Marine Seguradora" (vs.
// só "Tokio"), conseguimos casar mesmo assim.
export function mapSeguradoraNome(nome: string | null | undefined): SeguradoraId {
  if (!nome) return 'unknown'
  const n = norm(nome)
  if (n.includes('allianz')) return 'allianz'
  if (n.includes('azul')) return 'azul'
  if (n.includes('bradesco')) return 'bradesco'
  if (n.includes('darwin')) return 'darwin'
  if (n.includes('ezze')) return 'ezze'
  if (n.includes('hdi')) return 'hdi'
  if (n.includes('justos') || n.includes('justus')) return 'justos'
  if (n.includes('kovr')) return 'kovr'
  if (n.includes('mapfre')) return 'mapfre'
  if (n.includes('novo seg')) return 'novo'
  if (n.includes('pier')) return 'pier'
  if (n.includes('porto')) return 'porto'
  if (n.includes('suhai')) return 'suhai'
  if (n.includes('tokio')) return 'tokio'
  if (n.includes('yelum')) return 'yelum'
  if (n.includes('youse') || n.includes('caixa')) return 'youse'
  if (n.includes('zurich')) return 'zurich'
  return 'unknown'
}
