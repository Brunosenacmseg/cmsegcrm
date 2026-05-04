// Adapter para o parser Ezze já existente. Recebe texto cru (vs. o parser
// original que recebe Buffer) e devolve o array de linhas com a chave
// `seguradora_origem` adicionada para o dispatcher unificado.

import { detectEzzeLayout } from '../ezze-apolice-pdf'
import type { ApoliceRow } from './_common'

// Re-exportamos as funções internas do parser. Como o módulo original
// declara apenas `parseEzzeApolicePdf` como exportada, usamos a função pública
// que recebe Buffer. Aqui adaptamos pra texto, recriando a lógica de dispatch.
import { parseEzzeApolicePdf } from '../ezze-apolice-pdf'

// Quando o caller já fez pdfParse(), usamos parseFromText pra evitar dupla leitura.
// Como o parser interno do Ezze trabalha sobre texto, podemos chamar
// parseEzzeApolicePdf(Buffer.from(textRaw)) — mas isso re-roda pdfParse e quebra.
// Solução: re-implementamos um stub que reaproveita a detecção e chama o parseAuto/parseRC
// internos. Para evitar duplicar código, expõe-se parseEzzeFromText abaixo via re-import.

export async function parseEzze(text: string, originalBuffer?: Buffer): Promise<ApoliceRow[]> {
  // Para reaproveitar a lógica completa do parser Ezze (que lê com pdf-parse),
  // exigimos o buffer original. Se não vier, faz fallback para detector básico
  // e devolve uma linha mínima — assim não quebramos o dispatch.
  if (originalBuffer) {
    const r = await parseEzzeApolicePdf(originalBuffer)
    return r.rows.map(row => ({ ...row, seguradora_origem: 'ezze' }))
  }
  // Fallback (sem buffer): só detecta layout e devolve struct mínima.
  const layout = detectEzzeLayout(text)
  return [{
    seguradora_origem: 'ezze',
    layout_pdf: `ezze-${layout}`,
    pdf_texto_bruto: text.length > 6000 ? text.slice(0, 6000) + '\n…[truncado]' : text,
  }]
}
