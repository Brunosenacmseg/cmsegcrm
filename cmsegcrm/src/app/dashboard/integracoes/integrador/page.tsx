'use client'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const ENTIDADES = [
  { v: 'negocio', label: 'Negócio (cria lead/oportunidade)' },
  { v: 'cliente', label: 'Cliente (upsert)' },
  { v: 'tarefa',  label: 'Tarefa' },
  { v: 'nota',    label: 'Nota / histórico' },
]

const EVENTOS = [
  'negocio.criado','negocio.atualizado','negocio.etapa_alterada','negocio.ganho','negocio.perdido',
  'cliente.criado','cliente.atualizado',
  'tarefa.criada','tarefa.concluida',
  'nota.criada',
]

export default function IntegradorPage() {
  const supabase = createClient()
  const router = useRouter()
  const [profile, setProfile] = useState<any>(null)
  const [user, setUser] = useState<any>(null)
  const [carregando, setCarregando] = useState(true)
  const [conexoes, setConexoes] = useState<any[]>([])
  const [funis, setFunis] = useState<any[]>([])
  const [usuarios, setUsuarios] = useState<any[]>([])
  const [conexaoSel, setConexaoSel] = useState<any>(null)
  const [keys, setKeys] = useState<any[]>([])
  const [whIns, setWhIns] = useState<any[]>([])
  const [whOuts, setWhOuts] = useState<any[]>([])
  const [logs, setLogs] = useState<any[]>([])

  // Modais
  const [modalConexao, setModalConexao] = useState(false)
  const [novaConexao, setNovaConexao] = useState({ nome: '', descricao: '', ferramenta: '' })
  const [modalKey, setModalKey] = useState(false)
  const [novaKey, setNovaKey] = useState({ nome: '', escopos: ['read','write'] as string[] })
  const [tokenRevelado, setTokenRevelado] = useState<string | null>(null)
  const [modalWhIn, setModalWhIn] = useState(false)
  const [novoWhIn, setNovoWhIn] = useState<any>({ nome: '', entidade_alvo: 'negocio', funil_id: '', etapa_inicial: '', responsavel_id: '', mapa_campos: '' })
  const [modalWhOut, setModalWhOut] = useState(false)
  const [novoWhOut, setNovoWhOut] = useState<any>({ nome: '', url: '', eventos: [] as string[] })

  const baseUrl = useMemo(() => (typeof window !== 'undefined' ? window.location.origin : ''), [])

  useEffect(() => { init() }, [])

  async function init() {
    const { data: { user: u } } = await supabase.auth.getUser()
    if (!u) { router.push('/login'); return }
    setUser(u)
    const { data: prof } = await supabase.from('users').select('*').eq('id', u.id).single()
    if (prof?.role !== 'admin') { router.push('/dashboard'); return }
    setProfile(prof)
    const [{ data: cs }, { data: fs }, { data: us }] = await Promise.all([
      supabase.from('integracoes_conexoes').select('*').order('criado_em', { ascending: false }),
      supabase.from('funis').select('id, nome, etapas').order('ordem'),
      supabase.from('users').select('id, nome').order('nome'),
    ])
    setConexoes(cs || []); setFunis(fs || []); setUsuarios(us || [])
    if (cs && cs.length && !conexaoSel) selecionar(cs[0])
    setCarregando(false)
  }

  async function selecionar(c: any) {
    setConexaoSel(c)
    const [{ data: k }, { data: wi }, { data: wo }, { data: lg }] = await Promise.all([
      supabase.from('integracoes_api_keys').select('*').eq('conexao_id', c.id).order('criada_em', { ascending: false }),
      supabase.from('integracoes_webhooks_in').select('*').eq('conexao_id', c.id).order('criado_em', { ascending: false }),
      supabase.from('integracoes_webhooks_out').select('*').eq('conexao_id', c.id).order('criado_em', { ascending: false }),
      supabase.from('integracoes_logs').select('*').eq('conexao_id', c.id).order('criado_em', { ascending: false }).limit(30),
    ])
    setKeys(k || []); setWhIns(wi || []); setWhOuts(wo || []); setLogs(lg || [])
  }

  async function criarConexao() {
    if (!novaConexao.nome.trim()) return
    const { data, error } = await supabase.from('integracoes_conexoes').insert({
      ...novaConexao, owner_id: user.id,
    }).select('*').single()
    if (error) { alert(error.message); return }
    setModalConexao(false); setNovaConexao({ nome: '', descricao: '', ferramenta: '' })
    await init()
    if (data) selecionar(data)
  }

  async function alternarConexao(c: any) {
    await supabase.from('integracoes_conexoes').update({ ativo: !c.ativo }).eq('id', c.id)
    await init()
  }

  async function excluirConexao(c: any) {
    if (!confirm(`Excluir a conexão "${c.nome}" e tudo associado?`)) return
    await supabase.from('integracoes_conexoes').delete().eq('id', c.id)
    setConexaoSel(null); await init()
  }

  async function criarKey() {
    if (!conexaoSel || !novaKey.nome.trim()) return
    const { data: { session } } = await supabase.auth.getSession()
    const r = await fetch('/api/integrador/admin/keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ conexao_id: conexaoSel.id, ...novaKey }),
    })
    const j = await r.json()
    if (!j.ok) { alert(j.erro || 'erro'); return }
    setTokenRevelado(j.key.token)
    setNovaKey({ nome: '', escopos: ['read','write'] })
    await selecionar(conexaoSel)
  }

  async function excluirKey(id: string) {
    if (!confirm('Revogar esta key?')) return
    await supabase.from('integracoes_api_keys').delete().eq('id', id)
    await selecionar(conexaoSel)
  }

  async function criarWhIn() {
    if (!conexaoSel || !novoWhIn.nome.trim()) return
    let mapa: any = {}
    if (novoWhIn.mapa_campos.trim()) {
      try { mapa = JSON.parse(novoWhIn.mapa_campos) } catch { alert('Mapa de campos não é JSON válido'); return }
    }
    const { data: { session } } = await supabase.auth.getSession()
    const r = await fetch('/api/integrador/admin/webhooks-in', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({
        conexao_id: conexaoSel.id,
        nome: novoWhIn.nome,
        entidade_alvo: novoWhIn.entidade_alvo,
        funil_id: novoWhIn.funil_id || null,
        etapa_inicial: novoWhIn.etapa_inicial || null,
        responsavel_id: novoWhIn.responsavel_id || null,
        mapa_campos: mapa,
      }),
    })
    const j = await r.json()
    if (!j.ok) { alert(j.erro || 'erro'); return }
    setModalWhIn(false)
    setNovoWhIn({ nome: '', entidade_alvo: 'negocio', funil_id: '', etapa_inicial: '', responsavel_id: '', mapa_campos: '' })
    await selecionar(conexaoSel)
  }

  async function alternarWhIn(w: any) {
    await supabase.from('integracoes_webhooks_in').update({ ativo: !w.ativo }).eq('id', w.id)
    await selecionar(conexaoSel)
  }

  async function excluirWhIn(id: string) {
    if (!confirm('Excluir webhook de entrada?')) return
    await supabase.from('integracoes_webhooks_in').delete().eq('id', id)
    await selecionar(conexaoSel)
  }

  async function criarWhOut() {
    if (!conexaoSel || !novoWhOut.nome.trim() || !novoWhOut.url.trim()) return
    const { data: { session } } = await supabase.auth.getSession()
    const r = await fetch('/api/integrador/admin/webhooks-out', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ conexao_id: conexaoSel.id, ...novoWhOut }),
    })
    const j = await r.json()
    if (!j.ok) { alert(j.erro || 'erro'); return }
    setModalWhOut(false)
    setNovoWhOut({ nome: '', url: '', eventos: [] })
    await selecionar(conexaoSel)
  }

  async function alternarWhOut(w: any) {
    await supabase.from('integracoes_webhooks_out').update({ ativo: !w.ativo }).eq('id', w.id)
    await selecionar(conexaoSel)
  }

  async function excluirWhOut(id: string) {
    if (!confirm('Excluir webhook de saída?')) return
    await supabase.from('integracoes_webhooks_out').delete().eq('id', id)
    await selecionar(conexaoSel)
  }

  async function processarFila() {
    const r = await fetch('/api/integrador/cron/dispatch', { method: 'POST' })
    const j = await r.json()
    alert(j.ok ? `Processados: ${j.processados}` : (j.erro || 'erro'))
    if (conexaoSel) await selecionar(conexaoSel)
  }

  function copiar(t: string) { navigator.clipboard.writeText(t).catch(() => {}) }

  if (carregando) return <div className="p-6 text-sm text-gray-500">Carregando…</div>

  const ehAdmin = profile?.role === 'admin'

  return (
    <div className="p-6 space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">🔌 Integrador</h1>
          <p className="text-sm text-gray-600 max-w-3xl">
            Conecte qualquer ferramenta externa (Typeform, Zapier, Make, n8n, planilhas, formulários próprios, etc.)
            ao CRM mesmo sem integração nativa. Use <strong>webhooks de entrada</strong> para receber dados,
            <strong> API por token</strong> para que a ferramenta leia/escreva no CRM e <strong>webhooks de saída</strong> para
            disparar ações em outros sistemas quando algo acontecer no CRM.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {ehAdmin && (
            <button onClick={processarFila} className="px-3 py-2 text-sm border rounded hover:bg-gray-50">
              Processar fila agora
            </button>
          )}
          <button onClick={() => setModalConexao(true)} className="px-3 py-2 text-sm bg-yellow-500 text-white rounded hover:bg-yellow-600">
            + Nova conexão
          </button>
        </div>
      </header>

      <div className="grid grid-cols-12 gap-4">
        {/* Lista de conexões */}
        <aside className="col-span-3 border rounded bg-white">
          <div className="p-3 border-b font-semibold text-sm">Conexões</div>
          {conexoes.length === 0 && (
            <div className="p-4 text-sm text-gray-500">
              Nenhuma conexão. Crie a primeira para começar.
            </div>
          )}
          <ul>
            {conexoes.map((c) => (
              <li
                key={c.id}
                onClick={() => selecionar(c)}
                className={`p-3 border-b cursor-pointer text-sm flex items-center justify-between ${conexaoSel?.id === c.id ? 'bg-yellow-50' : 'hover:bg-gray-50'}`}
              >
                <div>
                  <div className="font-medium">{c.nome}</div>
                  <div className="text-xs text-gray-500">{c.ferramenta || '—'}</div>
                </div>
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${c.ativo ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'}`}>
                  {c.ativo ? 'ativa' : 'pausada'}
                </span>
              </li>
            ))}
          </ul>
        </aside>

        {/* Painel da conexão selecionada */}
        <main className="col-span-9 space-y-4">
          {!conexaoSel && (
            <div className="border rounded bg-white p-6 text-sm text-gray-500">
              Selecione uma conexão à esquerda ou crie uma nova.
            </div>
          )}

          {conexaoSel && (
            <>
              <section className="border rounded bg-white p-4 flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-semibold">{conexaoSel.nome}</h2>
                  {conexaoSel.descricao && <p className="text-sm text-gray-600">{conexaoSel.descricao}</p>}
                  <p className="text-xs text-gray-400 mt-1">ID: <code>{conexaoSel.id}</code></p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => alternarConexao(conexaoSel)} className="px-3 py-1 text-sm border rounded">
                    {conexaoSel.ativo ? 'Pausar' : 'Ativar'}
                  </button>
                  <button onClick={() => excluirConexao(conexaoSel)} className="px-3 py-1 text-sm border rounded text-red-600 border-red-300 hover:bg-red-50">
                    Excluir
                  </button>
                </div>
              </section>

              {/* API KEYS */}
              <section className="border rounded bg-white p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold">🔑 API Keys</h3>
                  <button onClick={() => { setTokenRevelado(null); setModalKey(true) }} className="text-sm px-3 py-1 border rounded hover:bg-gray-50">
                    + Nova key
                  </button>
                </div>
                <p className="text-xs text-gray-500 mb-3">
                  Use no header <code>Authorization: Bearer cmint_…</code> nas chamadas a <code>{baseUrl}/api/integrador/v1/*</code>
                </p>
                {keys.length === 0 && <div className="text-sm text-gray-500">Nenhuma key.</div>}
                <ul className="divide-y">
                  {keys.map((k: any) => (
                    <li key={k.id} className="py-2 flex items-center justify-between gap-2 text-sm">
                      <div>
                        <div className="font-medium">{k.nome}</div>
                        <div className="text-xs text-gray-500">
                          <code>{k.prefixo}…</code> · escopos: {(k.escopos || []).join(', ')} · {k.ativa ? 'ativa' : 'inativa'}
                          {k.ultimo_uso && <> · último uso: {new Date(k.ultimo_uso).toLocaleString('pt-BR')}</>}
                        </div>
                      </div>
                      <button onClick={() => excluirKey(k.id)} className="text-xs text-red-600 hover:underline">Revogar</button>
                    </li>
                  ))}
                </ul>
              </section>

              {/* WEBHOOKS DE ENTRADA */}
              <section className="border rounded bg-white p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold">📥 Webhooks de entrada</h3>
                  <button onClick={() => setModalWhIn(true)} className="text-sm px-3 py-1 border rounded hover:bg-gray-50">
                    + Novo webhook
                  </button>
                </div>
                <p className="text-xs text-gray-500 mb-3">
                  URLs para a ferramenta externa enviar POST. O sistema cria a entidade configurada.
                </p>
                {whIns.length === 0 && <div className="text-sm text-gray-500">Nenhum webhook.</div>}
                <ul className="divide-y">
                  {whIns.map((w: any) => {
                    const url = `${baseUrl}/api/integrador/in/${w.token}`
                    return (
                      <li key={w.id} className="py-3 text-sm space-y-1">
                        <div className="flex items-center justify-between">
                          <div className="font-medium">{w.nome} <span className="text-xs text-gray-500">→ {w.entidade_alvo}</span></div>
                          <div className="flex gap-2">
                            <button onClick={() => alternarWhIn(w)} className="text-xs border rounded px-2 py-0.5">{w.ativo ? 'Pausar' : 'Ativar'}</button>
                            <button onClick={() => excluirWhIn(w.id)} className="text-xs text-red-600 hover:underline">Excluir</button>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <code className="text-xs bg-gray-100 px-2 py-1 rounded flex-1 break-all">{url}</code>
                          <button onClick={() => copiar(url)} className="text-xs px-2 py-1 border rounded">Copiar</button>
                        </div>
                        {Object.keys(w.mapa_campos || {}).length > 0 && (
                          <details className="text-xs text-gray-600">
                            <summary>Mapa de campos</summary>
                            <pre className="bg-gray-50 p-2 rounded">{JSON.stringify(w.mapa_campos, null, 2)}</pre>
                          </details>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </section>

              {/* WEBHOOKS DE SAÍDA */}
              <section className="border rounded bg-white p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold">📤 Webhooks de saída</h3>
                  <button onClick={() => setModalWhOut(true)} className="text-sm px-3 py-1 border rounded hover:bg-gray-50">
                    + Novo webhook
                  </button>
                </div>
                <p className="text-xs text-gray-500 mb-3">
                  Quando os eventos selecionados ocorrem, o CRM faz POST na URL informada com payload assinado (header <code>X-Cm-Signature</code>).
                </p>
                {whOuts.length === 0 && <div className="text-sm text-gray-500">Nenhum webhook.</div>}
                <ul className="divide-y">
                  {whOuts.map((w: any) => (
                    <li key={w.id} className="py-3 text-sm space-y-1">
                      <div className="flex items-center justify-between">
                        <div className="font-medium">{w.nome}</div>
                        <div className="flex gap-2">
                          <button onClick={() => alternarWhOut(w)} className="text-xs border rounded px-2 py-0.5">{w.ativo ? 'Pausar' : 'Ativar'}</button>
                          <button onClick={() => excluirWhOut(w.id)} className="text-xs text-red-600 hover:underline">Excluir</button>
                        </div>
                      </div>
                      <div className="text-xs text-gray-600 break-all">→ {w.url}</div>
                      <div className="text-xs text-gray-500">eventos: {(w.eventos || []).join(', ') || '(nenhum)'} · último status: {w.ultimo_status ?? '—'}</div>
                    </li>
                  ))}
                </ul>
              </section>

              {/* LOGS */}
              <section className="border rounded bg-white p-4">
                <h3 className="font-semibold mb-3">📜 Eventos recentes (últimos 30)</h3>
                {logs.length === 0 && <div className="text-sm text-gray-500">Sem registros ainda.</div>}
                <ul className="divide-y text-xs">
                  {logs.map((l: any) => (
                    <li key={l.id} className="py-2 flex items-start gap-2">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] ${l.status === 'ok' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{l.direcao}</span>
                      <span className="text-gray-500 w-32 shrink-0">{new Date(l.criado_em).toLocaleString('pt-BR')}</span>
                      <span className="font-medium">{l.evento || l.recurso}</span>
                      {l.http_status && <span className="text-gray-500">[{l.http_status}]</span>}
                      {l.erro && <span className="text-red-600 ml-2">{l.erro}</span>}
                    </li>
                  ))}
                </ul>
              </section>

              {/* DOCS RÁPIDAS */}
              <section className="border rounded bg-white p-4 text-sm space-y-3">
                <h3 className="font-semibold">📘 Como usar</h3>
                <div>
                  <p className="font-medium mb-1">Criar negócio via API:</p>
                  <pre className="bg-gray-900 text-gray-100 p-3 rounded text-xs overflow-x-auto">
{`curl -X POST ${baseUrl}/api/integrador/v1/negocios \\
  -H "Authorization: Bearer cmint_xxx" \\
  -H "Content-Type: application/json" \\
  -d '{
    "nome": "Maria Silva",
    "email": "maria@email.com",
    "telefone": "11999998888",
    "produto": "Auto",
    "premio": 1500,
    "fonte": "site"
  }'`}
                  </pre>
                </div>
                <div>
                  <p className="font-medium mb-1">Listar negócios:</p>
                  <pre className="bg-gray-900 text-gray-100 p-3 rounded text-xs">
{`curl ${baseUrl}/api/integrador/v1/negocios?limit=20 \\
  -H "Authorization: Bearer cmint_xxx"`}
                  </pre>
                </div>
                <div>
                  <p className="font-medium mb-1">Mudar etapa:</p>
                  <pre className="bg-gray-900 text-gray-100 p-3 rounded text-xs">
{`curl -X PATCH ${baseUrl}/api/integrador/v1/negocios/<id> \\
  -H "Authorization: Bearer cmint_xxx" \\
  -d '{"etapa":"Fechado Ganho"}'`}
                  </pre>
                </div>
              </section>
            </>
          )}
        </main>
      </div>

      {/* MODAL: nova conexão */}
      {modalConexao && (
        <Overlay onClose={() => setModalConexao(false)}>
          <h2 className="text-lg font-semibold mb-3">Nova conexão</h2>
          <div className="space-y-2">
            <input className="border rounded px-2 py-1 w-full" placeholder="Nome (ex: Site institucional)" value={novaConexao.nome} onChange={e => setNovaConexao({ ...novaConexao, nome: e.target.value })} />
            <input className="border rounded px-2 py-1 w-full" placeholder="Ferramenta (typeform, zapier, n8n...)" value={novaConexao.ferramenta} onChange={e => setNovaConexao({ ...novaConexao, ferramenta: e.target.value })} />
            <textarea className="border rounded px-2 py-1 w-full" placeholder="Descrição (opcional)" value={novaConexao.descricao} onChange={e => setNovaConexao({ ...novaConexao, descricao: e.target.value })} />
          </div>
          <div className="flex justify-end gap-2 mt-3">
            <button className="px-3 py-1 border rounded" onClick={() => setModalConexao(false)}>Cancelar</button>
            <button className="px-3 py-1 bg-yellow-500 text-white rounded" onClick={criarConexao}>Criar</button>
          </div>
        </Overlay>
      )}

      {/* MODAL: nova key */}
      {modalKey && (
        <Overlay onClose={() => setModalKey(false)}>
          <h2 className="text-lg font-semibold mb-3">Nova API Key</h2>
          {tokenRevelado ? (
            <div className="space-y-3">
              <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                ⚠ Copie o token agora. Ele <strong>não será mostrado novamente</strong>.
              </div>
              <code className="block bg-gray-900 text-gray-100 p-3 rounded text-xs break-all">{tokenRevelado}</code>
              <div className="flex justify-end gap-2">
                <button className="px-3 py-1 border rounded" onClick={() => copiar(tokenRevelado!)}>Copiar</button>
                <button className="px-3 py-1 bg-yellow-500 text-white rounded" onClick={() => { setTokenRevelado(null); setModalKey(false) }}>Fechar</button>
              </div>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <input className="border rounded px-2 py-1 w-full" placeholder="Nome (ex: Produção)" value={novaKey.nome} onChange={e => setNovaKey({ ...novaKey, nome: e.target.value })} />
                <div className="flex gap-3 text-sm">
                  <label className="flex items-center gap-1"><input type="checkbox" checked={novaKey.escopos.includes('read')} onChange={e => setNovaKey({ ...novaKey, escopos: toggle(novaKey.escopos, 'read', e.target.checked) })} /> read</label>
                  <label className="flex items-center gap-1"><input type="checkbox" checked={novaKey.escopos.includes('write')} onChange={e => setNovaKey({ ...novaKey, escopos: toggle(novaKey.escopos, 'write', e.target.checked) })} /> write</label>
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-3">
                <button className="px-3 py-1 border rounded" onClick={() => setModalKey(false)}>Cancelar</button>
                <button className="px-3 py-1 bg-yellow-500 text-white rounded" onClick={criarKey}>Gerar token</button>
              </div>
            </>
          )}
        </Overlay>
      )}

      {/* MODAL: webhook entrada */}
      {modalWhIn && (
        <Overlay onClose={() => setModalWhIn(false)}>
          <h2 className="text-lg font-semibold mb-3">Novo webhook de entrada</h2>
          <div className="space-y-2 text-sm">
            <input className="border rounded px-2 py-1 w-full" placeholder="Nome (ex: Form Typeform)" value={novoWhIn.nome} onChange={e => setNovoWhIn({ ...novoWhIn, nome: e.target.value })} />
            <select className="border rounded px-2 py-1 w-full" value={novoWhIn.entidade_alvo} onChange={e => setNovoWhIn({ ...novoWhIn, entidade_alvo: e.target.value })}>
              {ENTIDADES.map(e => <option key={e.v} value={e.v}>{e.label}</option>)}
            </select>
            {novoWhIn.entidade_alvo === 'negocio' && (
              <>
                <select className="border rounded px-2 py-1 w-full" value={novoWhIn.funil_id} onChange={e => setNovoWhIn({ ...novoWhIn, funil_id: e.target.value, etapa_inicial: '' })}>
                  <option value="">Funil padrão (primeiro)</option>
                  {funis.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
                </select>
                {novoWhIn.funil_id && (
                  <select className="border rounded px-2 py-1 w-full" value={novoWhIn.etapa_inicial} onChange={e => setNovoWhIn({ ...novoWhIn, etapa_inicial: e.target.value })}>
                    <option value="">Etapa inicial padrão</option>
                    {(funis.find(f => f.id === novoWhIn.funil_id)?.etapas || []).map((e: string) => <option key={e} value={e}>{e}</option>)}
                  </select>
                )}
              </>
            )}
            <select className="border rounded px-2 py-1 w-full" value={novoWhIn.responsavel_id} onChange={e => setNovoWhIn({ ...novoWhIn, responsavel_id: e.target.value })}>
              <option value="">Responsável padrão (sem)</option>
              {usuarios.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
            </select>
            <div>
              <label className="text-xs text-gray-600">Mapa de campos (JSON, opcional). Exemplo:</label>
              <pre className="text-[10px] bg-gray-50 p-1 rounded">{`{"nome":"answers.0.text","email":"answers.1.email","produto":"=Auto"}`}</pre>
              <textarea rows={5} className="border rounded px-2 py-1 w-full font-mono text-xs" value={novoWhIn.mapa_campos} onChange={e => setNovoWhIn({ ...novoWhIn, mapa_campos: e.target.value })} placeholder="{}" />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-3">
            <button className="px-3 py-1 border rounded" onClick={() => setModalWhIn(false)}>Cancelar</button>
            <button className="px-3 py-1 bg-yellow-500 text-white rounded" onClick={criarWhIn}>Criar</button>
          </div>
        </Overlay>
      )}

      {/* MODAL: webhook saída */}
      {modalWhOut && (
        <Overlay onClose={() => setModalWhOut(false)}>
          <h2 className="text-lg font-semibold mb-3">Novo webhook de saída</h2>
          <div className="space-y-2 text-sm">
            <input className="border rounded px-2 py-1 w-full" placeholder="Nome" value={novoWhOut.nome} onChange={e => setNovoWhOut({ ...novoWhOut, nome: e.target.value })} />
            <input className="border rounded px-2 py-1 w-full" placeholder="https://hooks.zapier.com/..." value={novoWhOut.url} onChange={e => setNovoWhOut({ ...novoWhOut, url: e.target.value })} />
            <div>
              <div className="text-xs font-medium mb-1">Eventos:</div>
              <div className="grid grid-cols-2 gap-1 text-xs">
                {EVENTOS.map(ev => (
                  <label key={ev} className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={novoWhOut.eventos.includes(ev)}
                      onChange={e => setNovoWhOut({ ...novoWhOut, eventos: toggle(novoWhOut.eventos, ev, e.target.checked) })}
                    />
                    {ev}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-3">
            <button className="px-3 py-1 border rounded" onClick={() => setModalWhOut(false)}>Cancelar</button>
            <button className="px-3 py-1 bg-yellow-500 text-white rounded" onClick={criarWhOut}>Criar</button>
          </div>
        </Overlay>
      )}
    </div>
  )
}

function toggle<T>(arr: T[], v: T, on: boolean): T[] {
  const s = new Set(arr); on ? s.add(v) : s.delete(v); return Array.from(s)
}

function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-lg max-w-lg w-full p-4" onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}
