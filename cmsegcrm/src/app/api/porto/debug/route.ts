import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const PORTO_URL   = 'https://wwws.portoseguro.com.br/CentralDownloadsIntegrationService/Proxy_Services/ArquivoRetornoIntegrationService'
const PORTO_SUSEP = process.env.PORTO_SUSEP || 'J8FXUJ'
const PORTO_LOGIN = process.env.PORTO_LOGIN || ''
const PORTO_SENHA = process.env.PORTO_SENHA || ''

function subDias(dateStr: string, dias: number): string {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() - dias)
  return d.toISOString().split('T')[0]
}

function toDateTime(dateStr: string, end = false): string {
  return `${dateStr}T${end ? '23:59:59' : '00:00:00'}`
}

async function soapRequest(body: string): Promise<string> {
  const envelope = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope 
  xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" 
  xmlns:ws="http://ws.centraldownloadsics.pecorporativo.corporativo.porto.com/">
  <soapenv:Header>
    <ws:susep>${PORTO_SUSEP}</ws:susep>
    <ws:senha>${PORTO_SENHA}</ws:senha>
    <ws:login>${PORTO_LOGIN}</ws:login>
  </soapenv:Header>
  <soapenv:Body>${body}</soapenv:Body>
</soapenv:Envelope>`

  const res = await fetch(PORTO_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/xml;charset=UTF-8', 'SOAPAction': '' },
    body: envelope,
    signal: AbortSignal.timeout(30000),
  })
  return await res.text()
}

function extractTag(xml: string, tag: string): string {
  const match = xml.match(new RegExp(`<(?:[^:>]+:)?${tag}[^>]*>([\\s\\S]*?)<\\/(?:[^:>]+:)?${tag}>`, 'i'))
  return match ? match[1].trim() : ''
}

function extractBlocks(xml: string, tag: string): string[] {
  const regex = new RegExp(`<(?:[^:>]+:)?${tag}[^>]*>[\\s\\S]*?<\\/(?:[^:>]+:)?${tag}>`, 'gi')
  const results: string[] = []
  let match
  while ((match = regex.exec(xml)) !== null) results.push(match[0])
  return results
}

export async function POST(request: NextRequest) {
  try {
    const { arquivo_index = 0 } = await request.json()
    const hoje = new Date().toISOString().split('T')[0]
    const ini  = subDias(hoje, 6)

    // Listar arquivos
    const xmlLista = await soapRequest(`<ws:listarArquivos>
      <inicioPeriodo>${toDateTime(ini)}</inicioPeriodo>
      <finalPeriodo>${toDateTime(hoje, true)}</finalPeriodo>
    </ws:listarArquivos>`)

    const fault = extractTag(xmlLista, 'faultstring')
    if (fault) return NextResponse.json({ erro: fault })

    const blocos = extractBlocks(xmlLista, 'arquivo')
    if (!blocos.length) return NextResponse.json({ erro: 'Nenhum arquivo disponível' })

    // Listar todos
    const todos = blocos.map(b => ({
      codigo:      extractTag(b, 'codigo'),
      nomeArquivo: extractTag(b, 'nomeArquivo'),
      produto:     extractTag(b, 'descricao') || extractTag(b, 'produto'),
      tipoArquivo: extractTag(b, 'tipoArquivo'),
    }))

    const arq = blocos[arquivo_index]
    const codigo      = extractTag(arq, 'codigo')
    const nomeArquivo = extractTag(arq, 'nomeArquivo')

    // Baixar arquivo
    const xmlArq = await soapRequest(`<ws:recuperarConteudoArquivo>
      <idArquivo>${codigo}</idArquivo>
    </ws:recuperarConteudoArquivo>`)

    const conteudoB64 = extractTag(xmlArq, 'conteudo')
    const nome = extractTag(xmlArq, 'nome') || nomeArquivo

    if (!conteudoB64) return NextResponse.json({ erro: 'Sem conteúdo', todos })

    // Salvar arquivo BRUTO (bytes originais) no Supabase Storage
    const bytes = Buffer.from(conteudoB64, 'base64')

    // Magic bytes para identificar tipo
    const magic = Array.from(bytes.slice(0, 8)).map(b => b.toString(16).padStart(2,'0')).join(' ')
    const isGzip = bytes[0] === 0x1f && bytes[1] === 0x8b
    const isZip  = bytes[0] === 0x50 && bytes[1] === 0x4b

    // Salvar no storage como arquivo original
    const storagePath = `porto_debug/${nome}`
    await supabaseAdmin.storage.from('cmsegcrm').upload(storagePath, bytes, {
      contentType: 'application/octet-stream',
      upsert: true,
    })

    const { data: urlData } = supabaseAdmin.storage.from('cmsegcrm').getPublicUrl(storagePath)

    // Também salvar uma versão decodificada com cada método
    const resultados: Record<string, any> = {
      arquivo: nome,
      tamanho_bytes: bytes.length,
      magic_hex: magic,
      is_gzip: isGzip,
      is_zip: isZip,
      download_bruto: urlData.publicUrl,
      todos_arquivos: todos,
    }

    // Tentar mostrar primeiros 500 bytes como ASCII imprimível
    const ascii = Array.from(bytes.slice(0, 500))
      .map(b => (b >= 32 && b <= 126) ? String.fromCharCode(b) : `[${b.toString(16)}]`)
      .join('')
    resultados.ascii_500 = ascii

    // Contar chars imprimíveis vs binários nos primeiros 200 bytes
    const primeiros200 = bytes.slice(0, 200)
    const imprimiveis  = Array.from(primeiros200).filter(b => b >= 32 && b <= 126).length
    const percentual   = Math.round(imprimiveis / 200 * 100)
    resultados.percentual_ascii = `${percentual}% dos primeiros 200 bytes são ASCII imprimível`

    return NextResponse.json(resultados)

  } catch (err: any) {
    return NextResponse.json({ erro: err.message }, { status: 500 })
  }
}
