'use client'
import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

const CATEGORIAS = [
  { key: 'geral',      label: 'Geral',           icon: '📁' },
  { key: 'vendas',     label: 'Manual de Vendas', icon: '📈' },
  { key: 'processos',  label: 'Processos',        icon: '⚙️' },
  { key: 'produtos',   label: 'Produtos',         icon: '📋' },
  { key: 'treinamento',label: 'Treinamento',      icon: '🎓' },
  { key: 'juridico',   label: 'Jurídico',         icon: '⚖️' },
]

function tamanhoArquivo(bytes: number) {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function iconeArquivo(tipo: string) {
  if (!tipo) return '📄'
  if (tipo.includes('pdf')) return '📕'
  if (tipo.includes('word') || tipo.includes('doc')) return '📘'
  if (tipo.includes('sheet') || tipo.includes('excel') || tipo.includes('xls')) return '📗'
  if (tipo.includes('presentation') || tipo.includes('powerpoint') || tipo.includes('ppt')) return '📙'
  if (tipo.includes('image')) return '🖼'
  if (tipo.includes('video')) return '🎬'
  if (tipo.includes('zip') || tipo.includes('rar')) return '🗜'
  return '📄'
}

export default function ManuaisPage() {
  const supabase = createClient()
  const fileRef = useRef<HTMLInputElement>(null)

  const [profile, setProfile]         = useState<any>(null)
  const [manuais, setManuais]         = useState<any[]>([])
  const [loading, setLoading]         = useState(true)
  const [uploading, setUploading]     = useState(false)
  const [categoriaAtiva, setCategoriaAtiva] = useState('todos')
  const [busca, setBusca]             = useState('')
  const [modalAberto, setModalAberto] = useState(false)
  const [form, setForm]               = useState({ titulo: '', descricao: '', categoria: 'geral' })
  const [arquivoSel, setArquivoSel]   = useState<File | null>(null)
  const [progresso, setProgresso]     = useState(0)
  const [msg, setMsg]                 = useState('')

  useEffect(() => { init() }, [])

  async function init() {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: prof } = await supabase.from('users').select('*').eq('id', user?.id || '').single()
    setProfile(prof)
    await carregarManuais()
    setLoading(false)
  }

  async function carregarManuais() {
    const { data } = await supabase
      .from('manuais')
      .select('*, users!manuais_criado_por_fkey(nome)')
      .order('criado_em', { ascending: false })
    setManuais(data || [])
  }

  async function uploadArquivo() {
    if (!arquivoSel || !form.titulo) { alert('Informe o título e selecione um arquivo'); return }
    setUploading(true)
    setProgresso(10)
    setMsg('')

    try {
      const ext = arquivoSel.name.split('.').pop()
      const nomeArquivo = `manuais/${Date.now()}_${arquivoSel.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`

      setProgresso(30)

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('cmsegcrm')
        .upload(nomeArquivo, arquivoSel, { contentType: arquivoSel.type, upsert: false })

      if (uploadError) throw uploadError

      setProgresso(70)

      const { data: urlData } = supabase.storage.from('cmsegcrm').getPublicUrl(nomeArquivo)

      await supabase.from('manuais').insert({
        titulo: form.titulo,
        descricao: form.descricao || null,
        categoria: form.categoria,
        arquivo_url: urlData.publicUrl,
        arquivo_nome: arquivoSel.name,
        arquivo_tipo: arquivoSel.type,
        tamanho_bytes: arquivoSel.size,
        criado_por: profile?.id,
      })

      setProgresso(100)
      setMsg('✅ Arquivo enviado com sucesso!')
      setModalAberto(false)
      setForm({ titulo: '', descricao: '', categoria: 'geral' })
      setArquivoSel(null)
      await carregarManuais()
    } catch (err: any) {
      setMsg('❌ Erro: ' + err.message)
    }

    setUploading(false)
    setProgresso(0)
  }

  async function excluirManual(manual: any) {
    if (!confirm(`Excluir "${manual.titulo}"?`)) return
    // Remover do storage
    const path = manual.arquivo_url?.split('/cmsegcrm/')[1]
    if (path) await supabase.storage.from('cmsegcrm').remove([path])
    await supabase.from('manuais').delete().eq('id', manual.id)
    await carregarManuais()
  }

  const isAdminOrLider = profile?.role === 'admin' || profile?.role === 'lider'

  const manuaisFiltrados = manuais.filter(m => {
    const catOk = categoriaAtiva === 'todos' || m.categoria === categoriaAtiva
    const buscaOk = !busca || m.titulo.toLowerCase().includes(busca.toLowerCase()) || m.descricao?.toLowerCase().includes(busca.toLowerCase())
    return catOk && buscaOk
  })

  const contsPorCat: Record<string, number> = {}
  manuais.forEach(m => { contsPorCat[m.categoria] = (contsPorCat[m.categoria] || 0) + 1 })

  const inp: React.CSSProperties = { width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontSize: 13, fontFamily: 'DM Sans,sans-serif', outline: 'none', boxSizing: 'border-box' as const }

  if (loading) return <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>Carregando...</div>

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Topbar */}
      <div style={{ height: 56, borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', padding: '0 28px', gap: 12, background: 'rgba(10,22,40,0.7)', backdropFilter: 'blur(8px)', position: 'sticky', top: 0, zIndex: 5, flexShrink: 0 }}>
        <div style={{ fontFamily: 'DM Serif Display,serif', fontSize: 18, flex: 1 }}>📚 Manuais & Processos</div>
        <div style={{ position: 'relative' }}>
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="🔍 Buscar..." style={{ ...inp, width: 200, paddingLeft: 14 }} />
        </div>
        {isAdminOrLider && (
          <button className="btn-primary" onClick={() => { setModalAberto(true); setMsg(''); setArquivoSel(null); setForm({ titulo: '', descricao: '', categoria: 'geral' }) }}>
            + Adicionar arquivo
          </button>
        )}
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Sidebar categorias */}
        <div style={{ width: 220, flexShrink: 0, borderRight: '1px solid var(--border)', padding: '16px 0', overflowY: 'auto' }}>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--text-muted)', padding: '0 18px', marginBottom: 8 }}>Categorias</div>
          <div onClick={() => setCategoriaAtiva('todos')}
            style={{ padding: '8px 18px', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: categoriaAtiva === 'todos' ? 'rgba(201,168,76,0.08)' : 'transparent', borderLeft: categoriaAtiva === 'todos' ? '3px solid var(--gold)' : '3px solid transparent', color: categoriaAtiva === 'todos' ? 'var(--gold)' : 'var(--text-muted)' }}>
            <span>📂 Todos</span>
            <span style={{ fontSize: 11, background: 'rgba(255,255,255,0.08)', borderRadius: 10, padding: '1px 7px' }}>{manuais.length}</span>
          </div>
          {CATEGORIAS.map(cat => (
            <div key={cat.key} onClick={() => setCategoriaAtiva(cat.key)}
              style={{ padding: '8px 18px', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: categoriaAtiva === cat.key ? 'rgba(201,168,76,0.08)' : 'transparent', borderLeft: categoriaAtiva === cat.key ? '3px solid var(--gold)' : '3px solid transparent', color: categoriaAtiva === cat.key ? 'var(--gold)' : 'var(--text-muted)' }}>
              <span>{cat.icon} {cat.label}</span>
              {contsPorCat[cat.key] > 0 && <span style={{ fontSize: 11, background: 'rgba(255,255,255,0.08)', borderRadius: 10, padding: '1px 7px' }}>{contsPorCat[cat.key]}</span>}
            </div>
          ))}
        </div>

        {/* Lista de arquivos */}
        <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
          {manuaisFiltrados.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>📚</div>
              <div style={{ fontSize: 15, marginBottom: 6 }}>Nenhum arquivo encontrado</div>
              {isAdminOrLider && <div style={{ fontSize: 13 }}>Clique em "+ Adicionar arquivo" para começar</div>}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
              {manuaisFiltrados.map(manual => {
                const cat = CATEGORIAS.find(c => c.key === manual.categoria)
                return (
                  <div key={manual.id} className="card" style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                      <div style={{ fontSize: 32, flexShrink: 0 }}>{iconeArquivo(manual.arquivo_tipo)}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={manual.titulo}>{manual.titulo}</div>
                        {manual.descricao && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const }}>{manual.descricao}</div>}
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: 'rgba(201,168,76,0.1)', color: 'var(--gold)', border: '1px solid rgba(201,168,76,0.2)' }}>{cat?.icon} {cat?.label || manual.categoria}</span>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{tamanhoArquivo(manual.tamanho_bytes)}</span>
                        </div>
                      </div>
                    </div>

                    <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>📤 {manual['users!manuais_criado_por_fkey']?.nome?.split(' ')[0]}</span>
                      <span>{new Date(manual.criado_em).toLocaleDateString('pt-BR')}</span>
                    </div>

                    <div style={{ display: 'flex', gap: 8 }}>
                      <a href={manual.arquivo_url} target="_blank" rel="noopener noreferrer" style={{ flex: 1, padding: '7px', borderRadius: 8, fontSize: 12, textAlign: 'center', textDecoration: 'none', border: '1px solid rgba(28,181,160,0.3)', background: 'rgba(28,181,160,0.08)', color: 'var(--teal)', fontFamily: 'DM Sans,sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                        👁 Visualizar
                      </a>
                      <a href={manual.arquivo_url} download={manual.arquivo_nome} style={{ flex: 1, padding: '7px', borderRadius: 8, fontSize: 12, textAlign: 'center', textDecoration: 'none', border: '1px solid rgba(201,168,76,0.3)', background: 'rgba(201,168,76,0.08)', color: 'var(--gold)', fontFamily: 'DM Sans,sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                        ⬇ Baixar
                      </a>
                      {isAdminOrLider && (
                        <button onClick={() => excluirManual(manual)} style={{ padding: '7px 10px', borderRadius: 8, fontSize: 13, cursor: 'pointer', border: '1px solid rgba(224,82,82,0.3)', background: 'rgba(224,82,82,0.08)', color: 'var(--red)', fontFamily: 'DM Sans,sans-serif' }}>🗑</button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Modal upload */}
      {modalAberto && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(5,12,26,0.85)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(6px)' }}
          onClick={e => e.target === e.currentTarget && !uploading && setModalAberto(false)}>
          <div style={{ background: '#0a1628', border: '1px solid var(--border)', borderRadius: 20, padding: '28px 32px', width: 480, maxWidth: '95vw' }}>
            <div style={{ fontFamily: 'DM Serif Display,serif', fontSize: 20, marginBottom: 20 }}>📎 Adicionar arquivo</div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Título *</label>
              <input value={form.titulo} onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))} placeholder="Ex: Manual de Vendas 2025" style={inp} autoFocus />
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Descrição</label>
              <textarea value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} placeholder="Breve descrição do conteúdo..." rows={2} style={{ ...inp, resize: 'none' }} />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Categoria</label>
              <select value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))} style={inp}>
                {CATEGORIAS.map(c => <option key={c.key} value={c.key}>{c.icon} {c.label}</option>)}
              </select>
            </div>

            {/* Área de upload */}
            <input ref={fileRef} type="file" style={{ display: 'none' }} onChange={e => e.target.files?.[0] && setArquivoSel(e.target.files[0])} accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.mp4,.zip" />
            <div onClick={() => !uploading && fileRef.current?.click()}
              style={{ border: `2px dashed ${arquivoSel ? 'var(--teal)' : 'var(--border)'}`, borderRadius: 12, padding: '20px', textAlign: 'center', cursor: 'pointer', marginBottom: 16, background: arquivoSel ? 'rgba(28,181,160,0.05)' : 'transparent', transition: 'all 0.2s' }}>
              {arquivoSel ? (
                <div>
                  <div style={{ fontSize: 28, marginBottom: 6 }}>{iconeArquivo(arquivoSel.type)}</div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{arquivoSel.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{tamanhoArquivo(arquivoSel.size)}</div>
                  <div style={{ fontSize: 11, color: 'var(--teal)', marginTop: 4 }}>Clique para trocar</div>
                </div>
              ) : (
                <div>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>📎</div>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 4 }}>Clique para selecionar o arquivo</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>PDF, Word, Excel, PowerPoint, imagens, vídeos, ZIP</div>
                </div>
              )}
            </div>

            {/* Barra de progresso */}
            {uploading && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.08)', overflow: 'hidden', marginBottom: 6 }}>
                  <div style={{ height: '100%', borderRadius: 3, background: 'var(--teal)', width: `${progresso}%`, transition: 'width 0.3s' }} />
                </div>
                <div style={{ fontSize: 12, color: 'var(--teal)', textAlign: 'center' }}>Enviando... {progresso}%</div>
              </div>
            )}

            {msg && (
              <div style={{ marginBottom: 16, padding: '10px 14px', background: msg.includes('✅') ? 'rgba(28,181,160,0.1)' : 'rgba(224,82,82,0.1)', border: `1px solid ${msg.includes('✅') ? 'rgba(28,181,160,0.3)' : 'rgba(224,82,82,0.3)'}`, borderRadius: 8, fontSize: 13, color: msg.includes('✅') ? 'var(--teal)' : 'var(--red)' }}>
                {msg}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn-secondary" onClick={() => setModalAberto(false)} disabled={uploading}>Cancelar</button>
              <button className="btn-primary" onClick={uploadArquivo} disabled={uploading || !arquivoSel || !form.titulo} style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 120, justifyContent: 'center' }}>
                {uploading ? <><span style={{ display: 'inline-block', width: 12, height: 12, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} /> Enviando...</> : '📤 Enviar'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
