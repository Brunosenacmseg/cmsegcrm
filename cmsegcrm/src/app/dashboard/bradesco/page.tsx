'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const TIPOS = [
  { key:'PARCELAS_PAGAS',     label:'Parcelas Pagas',          icon:'✅', desc:'Layout 1 — baixa em Contas a Pagar' },
  { key:'PARCELAS_VENCER',    label:'Parcelas a Vencer',       icon:'⏳', desc:'Layout 2 — Contas a Pagar pendentes' },
  { key:'PARCELAS_PENDENTES', label:'Parcelas Pendentes',      icon:'⚠️', desc:'Layout 3 — Contas em atraso' },
  { key:'EMITIDOS',           label:'Seguros Emitidos',        icon:'📜', desc:'Layout 4 — apólices ativas' },
  { key:'CANCELADOS',         label:'Seguros Cancelados',      icon:'❌', desc:'Layout 5 — apólices canceladas' },
  { key:'SINISTROS',          label:'Sinistros',               icon:'🚨', desc:'Layout 6 — abre/encerra sinistros' },
  { key:'RENOVAR',            label:'Seguros a Renovar',       icon:'🔄', desc:'Layout 7 — agenda renovações' },
  { key:'APOLICES_AUTO',      label:'Apólices Auto',           icon:'🚗', desc:'Layout 8 — detalhe completo' },
  { key:'PROPOSTAS_AUTO',     label:'Propostas Auto',          icon:'📝', desc:'Layout 9 — propostas em estudo' },
  { key:'ENDOSSOS_AUTO',      label:'Endossos Auto',           icon:'📋', desc:'Layout 10 — endossos' },
  { key:'COMISSOES',          label:'Extrato de Comissões',    icon:'💰', desc:'Layout 11 — comissões recebidas' },
  { key:'BVP_COMISSOES',      label:'BVP — Extratos Comissão', icon:'🧾', desc:'BVP tipos 01..21' },
]

export default function BradescoPage() {
  const supabase = createClient()
  const [profile, setProfile]         = useState<any>(null)
  const [historico, setHistorico]     = useState<any[]>([])
  const [file, setFile]               = useState<File | null>(null)
  const [tipo, setTipo]               = useState<string>('AUTO')
  const [processando, setProcessando] = useState(false)
  const [resultado, setResultado]     = useState<any>(null)
  const [aba, setAba]                 = useState<'upload'|'historico'>('upload')

  useEffect(() => { init() }, [])

  async function init() {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: prof } = await supabase.from('users').select('*').eq('id', user?.id||'').single()
    setProfile(prof)
    await carregarHistorico()
  }

  async function carregarHistorico() {
    const { data } = await supabase
      .from('importacoes_bradesco').select('*')
      .order('criado_em', { ascending: false }).limit(50)
    setHistorico(data||[])
  }

  async function enviar() {
    if (!file) return
    setProcessando(true); setResultado(null)
    try {
      const tamanhoMB = file.size / 1024 / 1024
      const usaStorage = tamanhoMB > 3
      const body: any = { action: 'processar_upload', nome_arquivo: file.name, tipo_forcado: tipo === 'AUTO' ? '' : tipo }

      if (usaStorage) {
        const path = `bradesco-uploads/${Date.now()}-${file.name.replace(/[^\w.-]/g, '_')}`
        const { error } = await supabase.storage.from('cmsegcrm').upload(path, file, {
          upsert: true, contentType: 'text/plain',
        })
        if (error) { setResultado({ erro: `Upload storage: ${error.message}` }); return }
        body.storage_path = path
      } else {
        body.conteudo = await file.text()
      }

      const r = await fetch('/api/bradesco/sync', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const d = await r.json()
      if (!r.ok || d.error) setResultado({ erro: d.error || `HTTP ${r.status}` })
      else setResultado({ ok: true, ...d })
      await carregarHistorico()
    } catch (err: any) {
      setResultado({ erro: err.message || 'Erro inesperado' })
    } finally { setProcessando(false) }
  }

  async function testarConfig() {
    const r = await fetch('/api/bradesco/sync', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'config' }),
    })
    const d = await r.json()
    setResultado({ ok: true, configCheck: d })
  }

  const isAdmin = profile?.role === 'admin' || profile?.role === 'lider'
  const inp: React.CSSProperties = { background:'rgba(255,255,255,0.05)', border:'1px solid var(--border)', borderRadius:8, padding:'7px 12px', color:'var(--text)', fontSize:13, fontFamily:'DM Sans,sans-serif', outline:'none' }

  return (
    <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
      <div style={{height:56,borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',padding:'0 28px',gap:12,background:'var(--bg-soft)',backdropFilter:'blur(8px)',position:'sticky',top:0,zIndex:5,flexShrink:0}}>
        <div style={{flex:1,display:'flex',alignItems:'center',gap:12}}>
          <div style={{fontFamily:'DM Serif Display,serif',fontSize:18}}>🏦 Bradesco Seguros</div>
          <span style={{fontSize:11,padding:'2px 10px',borderRadius:10,background:'rgba(28,181,160,0.15)',color:'var(--teal)',border:'1px solid rgba(28,181,160,0.3)'}}>● InfoSeguro Upload</span>
        </div>
        <div style={{display:'flex',gap:4}}>
          {(['upload','historico'] as const).map(a=>(
            <button key={a} onClick={()=>setAba(a)} style={{padding:'6px 14px',borderRadius:8,fontSize:12,cursor:'pointer',border:'1px solid var(--border)',fontFamily:'DM Sans,sans-serif',background:aba===a?'rgba(201,168,76,0.12)':'rgba(255,255,255,0.04)',color:aba===a?'var(--gold)':'var(--text-muted)',borderColor:aba===a?'var(--gold)':'var(--border)'}}>
              {a==='upload'?'📤 Upload':'📋 Histórico'}
            </button>
          ))}
        </div>
        {isAdmin && (
          <button onClick={testarConfig} style={{padding:'7px 14px',borderRadius:8,fontSize:12,cursor:'pointer',border:'1px solid var(--border)',background:'rgba(255,255,255,0.04)',color:'var(--text-muted)',fontFamily:'DM Sans,sans-serif'}}>
            🔍 Testar Config
          </button>
        )}
      </div>

      <div style={{flex:1,overflow:'auto',padding:'24px 28px'}}>
        {resultado && (
          <div style={{marginBottom:20,padding:'14px 18px',background:resultado.erro?'rgba(224,82,82,0.08)':'rgba(28,181,160,0.08)',border:`1px solid ${resultado.erro?'rgba(224,82,82,0.3)':'rgba(28,181,160,0.3)'}`,borderRadius:12,fontSize:13}}>
            {resultado.erro ? (
              <div style={{color:'var(--red)'}}>❌ {resultado.erro}</div>
            ) : resultado.configCheck ? (
              <div>
                <div style={{fontWeight:600,marginBottom:8,color:'var(--gold)'}}>🔍 Configuração Bradesco</div>
                {Object.entries(resultado.configCheck).map(([k,v])=>(
                  <div key={k} style={{fontSize:12,marginBottom:4}}>
                    <span style={{color:'var(--text-muted)',display:'inline-block',width:160}}>{k}:</span>
                    <span style={{color: typeof v === 'string' && (v.includes('NÃO') || v.includes('FALTA')) ? 'var(--red)' : 'var(--teal)'}}>{Array.isArray(v) ? v.join(', ') : String(v)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div>
                <div style={{fontWeight:600,marginBottom:6,color:'var(--teal)'}}>
                  ✅ {resultado.arquivo} ({resultado.tipo}) — {resultado.importados} importados
                  {resultado.erros>0 && <span style={{color:'var(--gold)'}}> · {resultado.erros} erros</span>}
                </div>
                {(resultado.msgs||[]).slice(0,8).map((m:string,i:number)=>(
                  <div key={i} style={{fontSize:11,color:'var(--text-muted)'}}>· {m}</div>
                ))}
              </div>
            )}
          </div>
        )}

        {aba === 'upload' && (
          <>
            <div className="card" style={{marginBottom:20}}>
              <div style={{fontFamily:'DM Serif Display,serif',fontSize:16,marginBottom:6}}>📤 Importar arquivo InfoSeguro / BVP</div>
              <div style={{fontSize:12,color:'var(--text-muted)',marginBottom:14, lineHeight:1.6}}>
                Selecione um arquivo exportado da aplicação <b>InfoSeguro</b> (Bradesco Seguros) ou dos extratos da <b>BVP</b> (Bradesco Vida e Previdência).
                Aceita arquivos delimitados por <code>|</code>, <code>;</code> ou tabulação. O sistema detecta o tipo pelo nome — você pode forçar abaixo.
              </div>
              <div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap'}}>
                <input type="file" accept=".txt,.csv,.dat,.TXT,.CSV,.DAT" onChange={e=>setFile(e.target.files?.[0]||null)}
                  style={{...inp, flex:'1 1 280px'}} />
                <select value={tipo} onChange={e=>setTipo(e.target.value)} style={{...inp, minWidth:240}}>
                  <option value="AUTO">Detectar automaticamente</option>
                  {TIPOS.map(t=> <option key={t.key} value={t.key}>{t.icon} {t.label}</option>)}
                </select>
                <button onClick={enviar} disabled={!file||processando} className="btn-primary" style={{padding:'7px 18px',fontSize:13,opacity:!file?0.5:1}}>
                  {processando ? '⏳ Processando...' : '📤 Enviar e processar'}
                </button>
              </div>
              {file && (
                <div style={{marginTop:10, fontSize:11, color: 'var(--text-muted)'}}>
                  📄 {file.name} · {(file.size/1024/1024).toFixed(2)} MB
                </div>
              )}
            </div>

            <div className="card">
              <div style={{fontFamily:'DM Serif Display,serif',fontSize:16,marginBottom:14}}>🎯 Pastas / tipos de arquivo aceitos</div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:12}}>
                {TIPOS.map(t => (
                  <div key={t.key} style={{padding:'14px',borderRadius:12,border:'1px solid var(--border)',background:'rgba(255,255,255,0.02)'}}>
                    <div style={{fontSize:24,marginBottom:6}}>{t.icon}</div>
                    <div style={{fontSize:13,fontWeight:600,marginBottom:4}}>{t.label}</div>
                    <div style={{fontSize:11,color:'var(--text-muted)'}}>{t.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {aba === 'historico' && (
          <div className="card">
            <div style={{fontFamily:'DM Serif Display,serif',fontSize:16,marginBottom:14}}>📋 Histórico de importações</div>
            {historico.length === 0 ? (
              <div style={{textAlign:'center',padding:30,color:'var(--text-muted)'}}>Nenhuma importação realizada ainda</div>
            ) : (
              <table style={{width:'100%',borderCollapse:'collapse'}}>
                <thead>
                  <tr>{['Arquivo','Tipo','Origem','Registros','Importados','Erros','Status','Data'].map(h=>(
                    <th key={h} style={{fontSize:10,fontWeight:600,letterSpacing:'1.2px',textTransform:'uppercase',color:'var(--text-muted)',textAlign:'left',padding:'0 0 10px',borderBottom:'1px solid var(--border)'}}>{h}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {historico.map((h,i)=>(
                    <tr key={i} style={{borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
                      <td style={{padding:'10px 0',fontSize:12}}>{h.nome_arquivo||'—'}</td>
                      <td style={{padding:'10px 0',fontSize:12,color:'var(--text-muted)'}}>{h.tipo_arquivo}</td>
                      <td style={{padding:'10px 0',fontSize:12,color:'var(--text-muted)'}}>{h.origem||'—'}</td>
                      <td style={{padding:'10px 0',fontSize:12}}>{h.qtd_registros||0}</td>
                      <td style={{padding:'10px 0',fontSize:12,color:'var(--teal)',fontWeight:600}}>{h.qtd_importados||0}</td>
                      <td style={{padding:'10px 0',fontSize:12,color:h.qtd_erros>0?'var(--red)':'var(--text-muted)'}}>{h.qtd_erros||0}</td>
                      <td style={{padding:'10px 0'}}>
                        <span style={{fontSize:11,padding:'2px 8px',borderRadius:10,background:h.status==='concluido'?'rgba(28,181,160,0.15)':h.status==='parcial'?'rgba(201,168,76,0.15)':'rgba(255,255,255,0.08)',color:h.status==='concluido'?'var(--teal)':h.status==='parcial'?'var(--gold)':'var(--text-muted)'}}>
                          {h.status==='concluido'?'✅ Concluído':h.status==='parcial'?'⚠️ Parcial':h.status==='processando'?'⏳ Processando':'—'}
                        </span>
                      </td>
                      <td style={{padding:'10px 0',fontSize:11,color:'var(--text-muted)'}}>{h.criado_em?new Date(h.criado_em).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
