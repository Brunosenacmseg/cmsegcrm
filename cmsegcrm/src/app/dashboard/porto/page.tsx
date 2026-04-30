'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const TIPOS_ARQUIVO = [
  { key:'AUTOMOVEL',   label:'Automóvel',    icon:'🚗', desc:'Apólices e movimentações auto' },
  { key:'VIDA',        label:'Vida',          icon:'💙', desc:'Apólices de vida' },
  { key:'RE',          label:'Residencial',   icon:'🏠', desc:'Apólices residencial' },
  { key:'COMISSOES',   label:'Comissões',     icon:'💰', desc:'Relatório de comissões' },
  { key:'COBRANCA',    label:'Cobrança',      icon:'⚠️', desc:'Inadimplência e cobranças' },
  { key:'SINISTRO',    label:'Sinistros',     icon:'🚨', desc:'Sinistros abertos/encerrados' },
  { key:'PREVIDENCIA', label:'Previdência',   icon:'📈', desc:'Produtos de previdência' },
  { key:'IMOBILIARIA', label:'Imobiliária',   icon:'🏢', desc:'Seguros imobiliários' },
]

export default function PortoIntegracaoPage() {
  const supabase = createClient()

  const [profile, setProfile]               = useState<any>(null)
  const [arquivos, setArquivos]             = useState<any[]>([])
  const [historico, setHistorico]           = useState<any[]>([])
  const [loading, setLoading]               = useState(false)
  const [sincronizando, setSincronizando]   = useState(false)
  const [resultado, setResultado]           = useState<any>(null)
  const [aba, setAba]                       = useState<'dashboard'|'arquivos'|'historico'>('dashboard')
  const [dataInicio, setDataInicio]         = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 7)
    return d.toISOString().split('T')[0]
  })
  const [dataFim, setDataFim]               = useState(() => new Date().toISOString().split('T')[0])
  const [stats, setStats]                   = useState<any>({})

  useEffect(() => { init() }, [])

  async function init() {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: prof } = await supabase.from('users').select('*').eq('id', user?.id||'').single()
    setProfile(prof)
    await carregarHistorico()
    await carregarStats()
  }

  async function carregarStats() {
    const [
      { count: apolices },
      { count: inadimplentes },
      { count: sinistros },
      { data: ultimaImport },
    ] = await Promise.all([
      supabase.from('apolices').select('*', { count:'exact', head:true }).eq('seguradora','Porto Seguro'),
      supabase.from('tarefas').select('*', { count:'exact', head:true }).ilike('titulo','%inadimpl%').eq('status','pendente'),
      supabase.from('historico').select('*', { count:'exact', head:true }).ilike('titulo','%Sinistro Porto%'),
      supabase.from('importacoes_porto').select('concluido_em').order('concluido_em', { ascending:false }).limit(1),
    ])
    setStats({ apolices, inadimplentes, sinistros, ultimaImport: ultimaImport?.[0]?.concluido_em })
  }

  async function carregarHistorico() {
    const { data } = await supabase
      .from('importacoes_porto')
      .select('*')
      .order('criado_em', { ascending: false })
      .limit(30)
    setHistorico(data||[])
  }

  async function listarArquivos() {
    setLoading(true)
    setResultado(null)
    const res = await fetch('/api/porto/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'listar', inicio: dataInicio, fim: dataFim }),
    })
    const data = await res.json()
    if (data.error) { setResultado({ erro: data.error }); setLoading(false); return }
    setArquivos(data.arquivos || [])
    setLoading(false)
  }

  async function sincronizarTudo() {
    setSincronizando(true)
    setResultado(null)
    const res = await fetch('/api/porto/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'sincronizar' }),
    })
    const data = await res.json()
    setResultado(data)
    setSincronizando(false)
    await carregarHistorico()
    await carregarStats()
  }

  async function sincronizarTipo(tipo: string) {
    setSincronizando(true)
    setResultado(null)
    const res = await fetch('/api/porto/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'sincronizar_tipo', tipo_produto: tipo }),
    })
    const data = await res.json()
    setResultado(data)
    setSincronizando(false)
    await carregarHistorico()
    await carregarStats()
  }

  const isAdmin = profile?.role === 'admin' || profile?.role === 'lider'
  const inp: React.CSSProperties = { background:'rgba(255,255,255,0.05)', border:'1px solid var(--border)', borderRadius:8, padding:'7px 12px', color:'var(--text)', fontSize:13, fontFamily:'DM Sans,sans-serif', outline:'none' }

  return (
    <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
      {/* Topbar */}
      <div style={{height:56,borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',padding:'0 28px',gap:12,background:'rgba(10,22,40,0.7)',backdropFilter:'blur(8px)',position:'sticky',top:0,zIndex:5,flexShrink:0}}>
        <div style={{flex:1,display:'flex',alignItems:'center',gap:12}}>
          <div style={{fontFamily:'DM Serif Display,serif',fontSize:18}}>🏢 Porto Seguro</div>
          <span style={{fontSize:11,padding:'2px 10px',borderRadius:10,background:'rgba(28,181,160,0.15)',color:'var(--teal)',border:'1px solid rgba(28,181,160,0.3)'}}>● Integração Ativa</span>
        </div>
        <div style={{display:'flex',gap:4}}>
          {(['dashboard','arquivos','historico'] as const).map(a=>(
            <button key={a} onClick={()=>setAba(a)} style={{padding:'6px 14px',borderRadius:8,fontSize:12,cursor:'pointer',border:'1px solid var(--border)',fontFamily:'DM Sans,sans-serif',background:aba===a?'rgba(201,168,76,0.12)':'rgba(255,255,255,0.04)',color:aba===a?'var(--gold)':'var(--text-muted)',borderColor:aba===a?'var(--gold)':'var(--border)'}}>
              {a==='dashboard'?'📊 Dashboard':a==='arquivos'?'📁 Arquivos':'📋 Histórico'}
            </button>
          ))}
        </div>
        {isAdmin && (
          <button onClick={sincronizarTudo} disabled={sincronizando} className="btn-primary" style={{display:'flex',alignItems:'center',gap:8,minWidth:140,justifyContent:'center'}}>
            {sincronizando ? <><span style={{display:'inline-block',width:12,height:12,border:'2px solid rgba(255,255,255,0.3)',borderTopColor:'#fff',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/>Sincronizando...</> : '🔄 Sincronizar Tudo'}
          </button>
        )}
      </div>

      <div style={{flex:1,overflow:'auto',padding:'24px 28px'}}>

        {/* Resultado da sincronização */}
        {resultado && (
          <div style={{marginBottom:20,padding:'14px 18px',background:resultado.erro?'rgba(224,82,82,0.08)':'rgba(28,181,160,0.08)',border:`1px solid ${resultado.erro?'rgba(224,82,82,0.3)':'rgba(28,181,160,0.3)'}`,borderRadius:12,fontSize:13}}>
            {resultado.erro ? (
              <div style={{color:'var(--red)'}}>❌ {resultado.erro}</div>
            ) : (
              <>
                <div style={{fontWeight:600,marginBottom:8,color:'var(--teal)'}}>✅ Sincronização concluída — {resultado.total || resultado.resultados?.length || 0} arquivo(s) processados</div>
                {(resultado.resultados||[]).map((r:any,i:number)=>(
                  <div key={i} style={{fontSize:12,color:'var(--text-muted)',marginBottom:2}}>
                    {r.erro ? `❌ ${r.arquivo}: ${r.erro}` : `✓ ${r.arquivo} (${r.tipo}) — ${r.importados} importados${r.erros>0?`, ${r.erros} erros`:''}`}
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        {/* DASHBOARD */}
        {aba === 'dashboard' && (
          <div>
            {/* Cards de stats */}
            <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:16,marginBottom:24}}>
              {[
                { icon:'📋', label:'Apólices Porto', valor:stats.apolices||0, cor:'var(--teal)' },
                { icon:'⚠️', label:'Inadimplentes',  valor:stats.inadimplentes||0, cor:'var(--gold)' },
                { icon:'🚨', label:'Sinistros',       valor:stats.sinistros||0, cor:'var(--red)' },
                { icon:'🕐', label:'Última Sync',     valor:stats.ultimaImport?new Date(stats.ultimaImport).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'Nunca', cor:'var(--text-muted)', small:true },
              ].map((s,i)=>(
                <div key={i} className="card" style={{textAlign:'center',padding:'20px 16px'}}>
                  <div style={{fontSize:28,marginBottom:8}}>{s.icon}</div>
                  <div style={{fontSize:(s as any).small?14:24,fontWeight:700,color:s.cor,marginBottom:4}}>{s.valor}</div>
                  <div style={{fontSize:12,color:'var(--text-muted)'}}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Sincronização por tipo */}
            <div className="card" style={{marginBottom:20}}>
              <div style={{fontFamily:'DM Serif Display,serif',fontSize:16,marginBottom:16}}>🎯 Sincronizar por tipo</div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12}}>
                {TIPOS_ARQUIVO.map(t=>(
                  <div key={t.key} style={{padding:'14px',borderRadius:12,border:'1px solid var(--border)',background:'rgba(255,255,255,0.02)',textAlign:'center'}}>
                    <div style={{fontSize:24,marginBottom:6}}>{t.icon}</div>
                    <div style={{fontSize:13,fontWeight:500,marginBottom:4}}>{t.label}</div>
                    <div style={{fontSize:11,color:'var(--text-muted)',marginBottom:10}}>{t.desc}</div>
                    {isAdmin && (
                      <button onClick={()=>sincronizarTipo(t.key)} disabled={sincronizando}
                        style={{width:'100%',padding:'6px',borderRadius:8,fontSize:11,cursor:'pointer',border:'1px solid rgba(201,168,76,0.3)',background:'rgba(201,168,76,0.08)',color:'var(--gold)',fontFamily:'DM Sans,sans-serif'}}>
                        🔄 Sincronizar
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Info de credenciais */}
            <div className="card" style={{padding:'16px 20px'}}>
              <div style={{fontFamily:'DM Serif Display,serif',fontSize:15,marginBottom:12}}>⚙️ Configuração</div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:16}}>
                {[
                  ['SUSEP', process.env.NEXT_PUBLIC_PORTO_SUSEP || '—'],
                  ['Ambiente', 'Produção'],
                  ['Frequência', 'Diária (automática)'],
                ].map(([k,v])=>(
                  <div key={k}>
                    <div style={{fontSize:10,fontWeight:600,letterSpacing:'1.2px',textTransform:'uppercase',color:'var(--text-muted)',marginBottom:4}}>{k}</div>
                    <div style={{fontSize:13}}>{v}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ARQUIVOS */}
        {aba === 'arquivos' && (
          <div>
            <div style={{display:'flex',gap:10,marginBottom:16,alignItems:'center',flexWrap:'wrap'}}>
              <div style={{display:'flex',gap:8,alignItems:'center'}}>
                <label style={{fontSize:12,color:'var(--text-muted)'}}>De:</label>
                <input type="date" value={dataInicio} onChange={e=>setDataInicio(e.target.value)} style={inp} />
              </div>
              <div style={{display:'flex',gap:8,alignItems:'center'}}>
                <label style={{fontSize:12,color:'var(--text-muted)'}}>Até:</label>
                <input type="date" value={dataFim} onChange={e=>setDataFim(e.target.value)} style={inp} />
              </div>
              <button onClick={listarArquivos} disabled={loading} className="btn-primary" style={{padding:'7px 18px',fontSize:13}}>
                {loading?'Buscando...':'🔍 Listar Arquivos'}
              </button>
            </div>

            {arquivos.length === 0 ? (
              <div className="card" style={{textAlign:'center',padding:40,color:'var(--text-muted)'}}>
                <div style={{fontSize:40,marginBottom:12}}>📁</div>
                <div>Clique em "Listar Arquivos" para ver os disponíveis</div>
              </div>
            ) : (
              <div className="card">
                <div style={{fontFamily:'DM Serif Display,serif',fontSize:15,marginBottom:16}}>{arquivos.length} arquivo(s) disponíveis</div>
                <table style={{width:'100%',borderCollapse:'collapse'}}>
                  <thead>
                    <tr>{['Arquivo','Produto','Tipo','Gerado em','Código'].map(h=>(
                      <th key={h} style={{fontSize:10,fontWeight:600,letterSpacing:'1.2px',textTransform:'uppercase',color:'var(--text-muted)',textAlign:'left',padding:'0 0 10px',borderBottom:'1px solid var(--border)'}}>{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody>
                    {arquivos.map((a,i)=>{
                      const tipoConfig = TIPOS_ARQUIVO.find(t=>a.produto?.toUpperCase().includes(t.key))
                      return (
                        <tr key={i} style={{borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
                          <td style={{padding:'10px 0',fontSize:13}}>{tipoConfig?.icon||'📄'} {a.nomeArquivo}</td>
                          <td style={{padding:'10px 0',fontSize:12,color:'var(--text-muted)'}}>{a.produto}</td>
                          <td style={{padding:'10px 0',fontSize:11}}><span style={{padding:'2px 8px',borderRadius:10,background:'rgba(201,168,76,0.1)',color:'var(--gold)'}}>{a.tipoArquivo}</span></td>
                          <td style={{padding:'10px 0',fontSize:12,color:'var(--text-muted)'}}>{a.dataGeracao}</td>
                          <td style={{padding:'10px 0',fontSize:11,color:'var(--text-muted)'}}>{a.codigo}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* HISTÓRICO */}
        {aba === 'historico' && (
          <div>
            <div style={{fontFamily:'DM Serif Display,serif',fontSize:18,marginBottom:20}}>📋 Histórico de Importações</div>
            {historico.length === 0 ? (
              <div className="card" style={{textAlign:'center',padding:40,color:'var(--text-muted)'}}>
                <div style={{fontSize:40,marginBottom:12}}>📋</div>
                <div>Nenhuma importação realizada ainda</div>
              </div>
            ) : (
              <div className="card">
                <table style={{width:'100%',borderCollapse:'collapse'}}>
                  <thead>
                    <tr>{['Arquivo','Tipo','Registros','Importados','Erros','Status','Data'].map(h=>(
                      <th key={h} style={{fontSize:10,fontWeight:600,letterSpacing:'1.2px',textTransform:'uppercase',color:'var(--text-muted)',textAlign:'left',padding:'0 0 10px',borderBottom:'1px solid var(--border)'}}>{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody>
                    {historico.map((h,i)=>(
                      <tr key={i} style={{borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
                        <td style={{padding:'10px 0',fontSize:12}}>{h.nome_arquivo||'—'}</td>
                        <td style={{padding:'10px 0',fontSize:12,color:'var(--text-muted)'}}>{h.tipo_arquivo}</td>
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
              </div>
            )}
          </div>
        )}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
