'use client'
import { useState } from 'react'

const NAV: Array<{ icon: string; label: string; section?: string; badge?: number }> = [
  { icon:'📈', label:'Dashboard' },
  { icon:'🏗', label:'Funis' },
  { icon:'🔍', label:'Cotações' },
  { icon:'📞', label:'Telefone' },
  { icon:'💬', label:'WhatsApp' },
  { icon:'✉️', label:'Mensagens', badge: 3 },
  { icon:'📧', label:'Email' },
  { icon:'📣', label:'Mural' },
  { icon:'👥', label:'Clientes' },
  { icon:'📋', label:'Apólices' },
  { icon:'📝', label:'Propostas' },
  { icon:'✅', label:'Tarefas', badge: 2 },
  { icon:'🎯', label:'Metas' },
  { icon:'🔄', label:'Renovações' },
  { icon:'📊', label:'Relatórios' },
  { icon:'💰', label:'Comissões', section:'Financeiro' },
  { icon:'💼', label:'Financeiro / DRE' },
  { icon:'💳', label:'Contas a Pagar' },
  { icon:'📣', label:'Campanhas Meta', section:'Marketing' },
  { icon:'🛡️', label:'Seguradoras', section:'Seguradoras' },
  { icon:'🔁', label:'RD Station CRM', section:'Integrações' },
  { icon:'🔗', label:'Conectar Meta' },
  { icon:'🤖', label:'Agentes de IA' },
  { icon:'⚡', label:'Automações' },
  { icon:'📚', label:'Manuais & Processos', section:'Empresa' },
  { icon:'🧭', label:'Gestão de Equipe' },
  { icon:'🧑‍💼', label:'RH' },
  { icon:'💡', label:'Melhorias CRM' },
  { icon:'📥', label:'Importar Dados', section:'Config' },
  { icon:'👤', label:'Meu Perfil' },
  { icon:'⚙️', label:'Configurações' },
]

export default function PreviewLayoutPage() {
  const [active, setActive] = useState('Dashboard')
  const [collapsed, setCollapsed] = useState<Record<string,boolean>>({ Marketing:true, Integrações:true, Empresa:true, Config:true })
  let lastSection = ''
  return (
    <div style={{display:'flex', minHeight:'100vh', background:'var(--bg)'}}>
      <aside style={{width:'var(--sidebar-w)', background:'var(--sb-bg)', borderRight:'1px solid var(--sb-border)', display:'flex', flexDirection:'column', position:'fixed', top:0, left:0, bottom:0, zIndex:10, color:'var(--sb-text)'}}>
        <div style={{padding:'20px 18px 16px',borderBottom:'1px solid var(--sb-border)',display:'flex',alignItems:'center',gap:10}}>
          <div style={{width:36,height:36,borderRadius:10,background:'linear-gradient(135deg,var(--gold) 0%,var(--gold-light) 100%)',display:'flex',alignItems:'center',justifyContent:'center',color:'#11182a',fontFamily:'DM Serif Display,serif',fontSize:18,fontWeight:700}}>CM</div>
          <div style={{minWidth:0}}>
            <div style={{fontFamily:'DM Serif Display,serif',fontSize:16,color:'#fff',lineHeight:1.1}}>CM Seguros</div>
            <div style={{fontSize:9,color:'var(--sb-text-dim)',letterSpacing:1.2,textTransform:'uppercase',marginTop:3,fontWeight:600}}>CRM · Preview</div>
          </div>
        </div>

        <nav style={{flex:1,padding:'10px 0',overflowY:'auto'}}>
          {NAV.map((item, i) => {
            const showSection = item.section && item.section !== lastSection
            if (item.section) lastSection = item.section
            const sec = (() => { let s: string | undefined; for (let j=0;j<=i;j++){ if (NAV[j].section) s = NAV[j].section } return s })()
            const recolhida = sec ? !!collapsed[sec] : false
            const isActive = active === item.label
            return (
              <div key={i}>
                {showSection && (
                  <div className={'nav-section' + (recolhida?' nav-section-collapsed':'')}
                       onClick={()=>setCollapsed(c => ({...c, [item.section!]: !c[item.section!]}))}>
                    <span>{item.section}</span>
                    <span className="nav-section-arrow">▾</span>
                  </div>
                )}
                {!recolhida && (
                  <a onClick={()=>setActive(item.label)} className={'cm-nav-item' + (isActive?' active':'')}>
                    <span className="cm-nav-ico">{item.icon}</span>
                    {item.label}
                    {item.badge ? (
                      <span style={{marginLeft:'auto',background:'var(--danger)',color:'#fff',fontSize:10,fontWeight:700,borderRadius:10,padding:'1px 6px',minWidth:18,textAlign:'center'}}>{item.badge}</span>
                    ) : null}
                  </a>
                )}
              </div>
            )
          })}
        </nav>

        <div style={{padding:'12px 14px',borderTop:'1px solid var(--sb-border)',display:'flex',alignItems:'center',gap:10,background:'var(--sb-bg-2)'}}>
          <div style={{width:34,height:34,borderRadius:'50%',background:'var(--gold)',display:'flex',alignItems:'center',justifyContent:'center',color:'#11182a',fontWeight:700,border:'2px solid var(--gold)'}}>BS</div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:13,fontWeight:500,color:'#fff'}}>Bruno Sena</div>
            <div style={{fontSize:11,color:'var(--sb-text-dim)'}}>admin</div>
          </div>
          <span style={{fontSize:16,cursor:'pointer',color:'var(--sb-text-dim)'}}>🚪</span>
        </div>
      </aside>

      <main style={{marginLeft:'var(--sidebar-w)',flex:1,display:'flex',flexDirection:'column'}}>
        <div style={{height:56,borderBottom:'1px solid var(--border-soft)',display:'flex',alignItems:'center',padding:'0 20px',background:'#fff',gap:14,position:'sticky',top:0,zIndex:20}}>
          <label className="cm-topbar-search" style={{flex:'0 1 420px'}}>
            <span style={{fontSize:14,color:'var(--text-faint)'}}>🔍</span>
            <input readOnly placeholder="Buscar clientes, apólices, tarefas… (⌘K)" />
          </label>
          <div style={{flex:1}}/>
          <button className="cm-icon-btn" title="Notificações">
            <span>🔔</span>
            <span style={{position:'absolute',top:-4,right:-4,background:'var(--red)',color:'#fff',fontSize:10,fontWeight:700,borderRadius:10,padding:'1px 5px',minWidth:18,textAlign:'center',border:'2px solid #fff'}}>5</span>
          </button>
          <div style={{display:'flex',alignItems:'center',gap:10,padding:'4px 10px 4px 4px',border:'1px solid var(--border-soft)',borderRadius:999,background:'#fff'}}>
            <div style={{width:28,height:28,borderRadius:'50%',background:'var(--gold)',display:'flex',alignItems:'center',justifyContent:'center',color:'#11182a',fontWeight:700,fontSize:12}}>BS</div>
            <span style={{fontSize:13,fontWeight:500,color:'var(--text)'}}>Bruno</span>
          </div>
        </div>

        <div style={{padding:24}}>
          <h1 style={{fontFamily:'DM Serif Display,serif',fontSize:28,color:'var(--text)',marginBottom:6}}>Preview do Layout</h1>
          <p style={{color:'var(--text-muted)',fontSize:13,marginBottom:24}}>Página isolada para inspeção visual da sidebar e topbar redesenhadas (estilo RD Station CRM). Não usa Supabase nem autenticação.</p>

          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(240px,1fr))',gap:16}}>
            {[
              { titulo:'Clientes ativos', valor:'1.284', delta:'+12%' },
              { titulo:'Apólices vigentes', valor:'2.450', delta:'+4%' },
              { titulo:'Comissão do mês', valor:'R$ 48,2k', delta:'+8%' },
              { titulo:'Tarefas atrasadas', valor:'7', delta:'urgente' },
            ].map((c,i)=>(
              <div key={i} style={{background:'#fff',border:'1px solid var(--border-soft)',borderRadius:14,padding:18,boxShadow:'var(--shadow-sm)'}}>
                <div style={{fontSize:11,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:1,fontWeight:700}}>{c.titulo}</div>
                <div style={{fontSize:26,fontWeight:700,marginTop:6,color:'var(--text)'}}>{c.valor}</div>
                <div style={{fontSize:12,color:'var(--teal)',marginTop:4}}>{c.delta}</div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}
