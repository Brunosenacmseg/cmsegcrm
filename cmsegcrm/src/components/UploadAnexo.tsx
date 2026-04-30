'use client'
import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

export interface Anexo {
  id: string
  nome_arquivo: string
  tipo_mime: string
  tamanho_kb: number
  path: string
  created_at: string
  categoria: string
  negocio_id?: string
  cliente_id?: string
}

interface UploadAnexoProps {
  categoria: 'negocio' | 'cliente' | 'comissao' | 'outro'
  negocioId?: string
  clienteId?: string
  accept?: string          // ex: ".pdf,.jpg,.png" ou ".xlsx,.xls"
  label?: string
  maxMB?: number
  onUpload?: (anexo: Anexo) => void
  anexosExistentes?: Anexo[]
  onDelete?: (id: string) => void
  compact?: boolean        // modo compacto para ficha
}

export default function UploadAnexo({
  categoria, negocioId, clienteId,
  accept = '.pdf,.jpg,.jpeg,.png,.doc,.docx',
  label = 'Anexar arquivo',
  maxMB = 10,
  onUpload, anexosExistentes = [], onDelete,
  compact = false
}: UploadAnexoProps) {
  const supabase   = createClient()
  const inputRef   = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [erro, setErro]           = useState('')
  const [drag, setDrag]           = useState(false)

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setErro('')
    for (const file of Array.from(files)) {
      if (file.size > maxMB * 1024 * 1024) {
        setErro(`Arquivo "${file.name}" excede ${maxMB}MB.`)
        continue
      }
      await uploadFile(file)
    }
  }

  async function uploadFile(file: File) {
    setUploading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const ext       = file.name.split('.').pop()
      const timestamp = Date.now()
      const pasta     = categoria === 'negocio' ? `negocios/${negocioId}`
                      : categoria === 'cliente' ? `clientes/${clienteId}`
                      : `comissoes/${user?.id}`
      const path = `${pasta}/${timestamp}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`

      const { error: errUp } = await supabase.storage.from('cmsegcrm').upload(path, file)
      if (errUp) throw errUp

      const { data: anexo, error: errDb } = await supabase.from('anexos').insert({
        bucket: 'cmsegcrm',
        path,
        nome_arquivo: file.name,
        tipo_mime:    file.type,
        tamanho_kb:   Math.round(file.size / 1024),
        categoria,
        negocio_id: negocioId || null,
        cliente_id: clienteId || null,
        user_id:    user?.id,
      }).select().single()

      if (errDb) throw errDb
      onUpload?.(anexo)
    } catch (e: any) {
      setErro('Erro ao enviar: ' + (e.message || 'tente novamente'))
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  async function abrirArquivo(path: string, nome: string) {
    const { data } = await supabase.storage.from('cmsegcrm').createSignedUrl(path, 60)
    if (data?.signedUrl) {
      const a = document.createElement('a')
      a.href = data.signedUrl
      a.target = '_blank'
      a.download = nome
      a.click()
    }
  }

  async function deletarAnexo(id: string, path: string) {
    if (!confirm('Remover este anexo?')) return
    await supabase.storage.from('cmsegcrm').remove([path])
    await supabase.from('anexos').delete().eq('id', id)
    onDelete?.(id)
  }

  const icone = (mime: string) => {
    if (mime?.includes('pdf'))   return '📄'
    if (mime?.includes('image')) return '🖼️'
    if (mime?.includes('sheet') || mime?.includes('excel')) return '📊'
    if (mime?.includes('word'))  return '📝'
    return '📎'
  }

  return (
    <div>
      {/* Zona de drop */}
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDrag(true) }}
        onDragLeave={() => setDrag(false)}
        onDrop={e => { e.preventDefault(); setDrag(false); handleFiles(e.dataTransfer.files) }}
        style={{
          border: `2px dashed ${drag ? 'var(--gold)' : 'rgba(201,168,76,0.25)'}`,
          borderRadius: 10,
          padding: compact ? '10px 16px' : '18px 20px',
          textAlign: 'center',
          cursor: uploading ? 'wait' : 'pointer',
          background: drag ? 'rgba(201,168,76,0.06)' : 'rgba(255,255,255,0.02)',
          transition: 'all 0.18s',
          marginBottom: 10,
        }}
      >
        <input ref={inputRef} type="file" accept={accept} multiple style={{ display: 'none' }}
          onChange={e => handleFiles(e.target.files)} />
        {uploading ? (
          <div style={{ color: 'var(--teal)', fontSize: 13 }}>⏳ Enviando...</div>
        ) : (
          <>
            <div style={{ fontSize: compact ? 20 : 28, marginBottom: 4 }}>📎</div>
            <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500 }}>{label}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
              {accept.replace(/\./g, '').toUpperCase().replace(/,/g, ' · ')} · máx {maxMB}MB
            </div>
          </>
        )}
      </div>

      {erro && (
        <div style={{ fontSize: 12, color: 'var(--red)', marginBottom: 8,
          background: 'rgba(224,82,82,0.08)', borderRadius: 8, padding: '6px 10px' }}>
          ⚠ {erro}
        </div>
      )}

      {/* Lista de anexos existentes */}
      {anexosExistentes.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {anexosExistentes.map(a => (
            <div key={a.id} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid var(--border)',
              borderRadius: 8, padding: '8px 12px',
            }}>
              <span style={{ fontSize: 18 }}>{icone(a.tipo_mime)}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden',
                  textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.nome_arquivo}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {a.tamanho_kb < 1000 ? a.tamanho_kb + ' KB' : (a.tamanho_kb/1024).toFixed(1) + ' MB'}
                  {' · '}{new Date(a.created_at).toLocaleDateString('pt-BR')}
                </div>
              </div>
              <button onClick={() => abrirArquivo(a.path, a.nome_arquivo)} style={{
                fontSize: 11, background: 'rgba(74,128,240,0.1)',
                border: '1px solid rgba(74,128,240,0.3)', color: '#7aa3f8',
                borderRadius: 6, padding: '4px 10px', cursor: 'pointer',
                fontFamily: 'DM Sans,sans-serif', whiteSpace: 'nowrap',
              }}>⬇ Baixar</button>
              <button onClick={() => deletarAnexo(a.id, a.path)} style={{
                fontSize: 11, background: 'rgba(224,82,82,0.08)',
                border: '1px solid rgba(224,82,82,0.2)', color: 'var(--red)',
                borderRadius: 6, padding: '4px 10px', cursor: 'pointer',
                fontFamily: 'DM Sans,sans-serif',
              }}>✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
