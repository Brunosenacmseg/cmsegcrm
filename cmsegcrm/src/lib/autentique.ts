// Cliente Autentique — GraphQL API.
// Docs: https://docs.autentique.com.br
// Endpoint:  POST https://api.autentique.com.br/v2/graphql
// Auth:      Bearer AUTENTIQUE_TOKEN (env)
// Rate-limit: 60 reqs/min.

const ENDPOINT = 'https://api.autentique.com.br/v2/graphql'

function getToken(): string {
  const t = process.env.AUTENTIQUE_TOKEN
  if (!t) throw new Error('AUTENTIQUE_TOKEN não configurado no servidor')
  return t
}

async function gql<T = any>(query: string, variables?: any, files?: Record<string, Buffer | Blob>): Promise<T> {
  const token = getToken()

  // Se houver arquivos, usar multipart spec do GraphQL.
  if (files && Object.keys(files).length) {
    const fd = new FormData()
    fd.append('operations', JSON.stringify({ query, variables }))
    const map: Record<string, string[]> = {}
    Object.keys(files).forEach((k, i) => { map[String(i)] = [k] })
    fd.append('map', JSON.stringify(map))
    Object.values(files).forEach((f, i) => {
      // Blob aceita ArrayBuffer; convertemos Buffer copiando os bytes pra
      // um ArrayBuffer "puro" (não SharedArrayBuffer).
      let blob: Blob
      if (f instanceof Blob) {
        blob = f
      } else {
        const buf = f as Buffer
        const ab = new ArrayBuffer(buf.byteLength)
        new Uint8Array(ab).set(buf)
        blob = new Blob([ab])
      }
      fd.append(String(i), blob, 'documento.pdf')
    })
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: fd as any,
    })
    const json = await res.json()
    if (json.errors) throw new Error(json.errors.map((e: any) => e.message).join(' | '))
    return json.data
  }

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  })
  const json = await res.json()
  if (json.errors) throw new Error(json.errors.map((e: any) => e.message).join(' | '))
  return json.data
}

export interface SignatarioInput {
  email: string
  name?: string
  action?: 'SIGN' | 'WITNESS' | 'APPROVE'
}

export interface CriarDocumentoInput {
  nome: string
  signatarios: SignatarioInput[]
  arquivo: Buffer            // PDF
  pasta_id?: string
  mensagem?: string
}

// Cria um documento no Autentique e dispara assinaturas.
// Retorna o objeto completo do documento criado.
export async function criarDocumento(input: CriarDocumentoInput) {
  const query = `
    mutation CreateDocument($document: DocumentInput!, $signers: [SignerInput!]!, $file: Upload!) {
      createDocument(document: $document, signers: $signers, file: $file) {
        id
        name
        signatures {
          public_id
          name
          email
          link { short_link }
          action { name }
        }
      }
    }
  `
  const variables = {
    document: {
      name: input.nome,
      ...(input.pasta_id ? { folder_id: input.pasta_id } : {}),
      ...(input.mensagem ? { message: input.mensagem } : {}),
    },
    signers: input.signatarios.map(s => ({
      email: s.email,
      ...(s.name ? { name: s.name } : {}),
      action: s.action || 'SIGN',
    })),
    file: null,
  }
  return gql(query, variables, { 'variables.file': input.arquivo })
}

// Busca status atual de um documento
export async function buscarDocumento(id: string) {
  const query = `
    query Document($id: UUID!) {
      document(id: $id) {
        id
        name
        files { original signed }
        signatures {
          public_id
          name
          email
          signed { created_at }
          rejected { created_at reason }
          expired
          link { short_link }
          action { name }
        }
      }
    }
  `
  return gql(query, { id })
}

// Lista documentos (paginado)
export async function listarDocumentos(page = 1, limit = 60) {
  const query = `
    query Documents($limit: Int!, $page: Int!) {
      documents(limit: $limit, page: $page) {
        total
        data {
          id
          name
          created_at
          files { original signed }
          signatures { signed { created_at } rejected { created_at } }
        }
      }
    }
  `
  return gql(query, { limit, page })
}

// Recalcula o status agregado a partir das assinaturas individuais
export function statusAgregado(signatures: any[]): { status: string; total: number; assinados: number } {
  const total = signatures?.length || 0
  const assinados = (signatures || []).filter(s => s?.signed?.created_at).length
  const recusou   = (signatures || []).some(s => s?.rejected?.created_at)
  const expirou   = (signatures || []).some(s => s?.expired)
  let status = 'enviado'
  if (recusou) status = 'recusado'
  else if (expirou) status = 'expirado'
  else if (total > 0 && assinados === total) status = 'assinado'
  return { status, total, assinados }
}
