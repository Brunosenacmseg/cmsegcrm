'use client'
import { useState } from 'react'

type Group = { label: string; href?: string; badge?: number; children?: { label: string; href: string }[] }

const GROUPS: Group[] = [
  { label: 'Início', href: '/dashboard' },
  { label: 'Negociações', children: [
    { label: 'Funis', href: '/dashboard/funis' },
    { label: 'Cotações', href: '/dashboard/cotacoes' },
    { label: 'Propostas', href: '/dashboard/propostas' },
    { label: 'Renovações', href: '/dashboard/renovacoes' },
  ]},
  { label: 'Clientes', children: [
    { label: 'Clientes', href: '/dashboard/clientes' },
    { label: 'Apólices', href: '/dashboard/apolices' },
  ]},
  { label: 'Tarefas', href: '/dashboard/tarefas', badge: 3 },
  { label: 'Mensagens', children: [
    { label: 'Telefone', href: '/dashboard/telefone' },
    { label: 'WhatsApp', href: '/dashboard/whatsapp' },
    { label: 'Mensagens', href: '/dashboard/mensagens' },
    { label: 'Email', href: '/dashboard/email' },
    { label: 'Mural', href: '/dashboard/mural' },
  ]},
  { label: 'Análises', children: [
    { label: 'Relatórios', href: '/dashboard/relatorios' },
    { label: 'Metas', href: '/dashboard/metas' },
    { label: 'Comissões', href: '/dashboard/comissoes' },
    { label: 'Financeiro / DRE', href: '/dashboard/financeiro' },
  ]},
  { label: 'Marketing', children: [
    { label: 'Campanhas Meta', href: '/dashboard/campanhas' },
    { label: 'Conectar Meta', href: '/dashboard/integracoes/meta' },
  ]},
]

export default function PreviewLayoutPage() {
  const [active, setActive] = useState('Negociações')
  return (
    <div style={{minHeight:'100vh',background:'var(--bg-subtle)'}}>
      <style>{`
        .pv-item { position:relative; }
        .pv-item > button { display:inline-flex;align-items:center;gap:6px;padding:18px 12px;font-size:14px;color:var(--sb-text);background:transparent;border:none;cursor:pointer;font-family:inherit;position:relative; }
        .pv-item:hover > button { color:#fff; }
        .pv-item.active > button { color:var(--gold-light);font-weight:600; }
        .pv-item.active > button::after { content:'';position:absolute;left:8px;right:8px;bottom:0;height:3px;background:var(--gold-bright);border-radius:2px 2px 0 0; }
        .pv-dd { position:absolute;top:100%;left:0;min-width:220px;background:#fff;border:1px solid var(--border-soft);border-radius:10px;box-shadow:var(--shadow-lg);padding:6px;z-index:50;display:none; }
        .pv-item:hover .pv-dd { display:block; }
        .pv-dd a { display:flex;align-items:center;gap:10px;padding:8px 12px;border-radius:6px;color:var(--text);text-decoration:none;font-size:13px; }
        .pv-dd a:hover { background:var(--bg-subtle); }
      `}</style>

      <header style={{position:'sticky',top:0,zIndex:30,background:'var(--sb-bg)',color:'var(--sb-text)',borderBottom:'1px solid var(--sb-border)'}}>
        <div style={{display:'flex',alignItems:'center',height:56,padding:'0 18px',gap:6}}>
          <a href="#" style={{display:'flex',alignItems:'center',gap:10,textDecoration:'none',marginRight:18}}>
            <div style={{width:32,height:32,borderRadius:8,background:'linear-gradient(135deg,var(--gold),var(--gold-light))',display:'flex',alignItems:'center',justifyContent:'center',color:'#11182a',fontFamily:'DM Serif Display,serif',fontSize:15,fontWeight:700}}>CM</div>
            <div style={{lineHeight:1}}>
              <div style={{fontFamily:'DM Serif Display,serif',fontSize:15,color:'#fff'}}>CRM</div>
              <div style={{fontSize:9,color:'var(--sb-text-dim)',letterSpacing:1,textTransform:'uppercase',marginTop:2,fontWeight:600}}>CM Seguros</div>
            </div>
          </a>

          <nav style={{display:'flex',alignItems:'center',flex:1}}>
            {GROUPS.map(g => (
              <div key={g.label} className={'pv-item' + (active===g.label?' active':'')}>
                <button onClick={()=>setActive(g.label)}>
                  {g.label}
                  {g.children && <span style={{fontSize:10,opacity:0.7}}>▾</span>}
                  {g.badge && <span style={{background:'var(--danger)',color:'#fff',fontSize:10,fontWeight:700,borderRadius:10,padding:'1px 6px'}}>{g.badge}</span>}
                </button>
                {g.children && (
                  <div className="pv-dd">
                    {g.children.map(c => (
                      <a key={c.href} href="#">{c.label}</a>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </nav>

          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <button style={{background:'transparent',border:'none',color:'var(--sb-text)',cursor:'pointer',padding:8,borderRadius:8,fontSize:15}}>🔍</button>
            <button style={{background:'transparent',border:'none',color:'var(--sb-text)',cursor:'pointer',padding:8,borderRadius:8,fontSize:15,position:'relative'}}>
              🔔
              <span style={{position:'absolute',top:2,right:2,background:'var(--red)',color:'#fff',fontSize:9,fontWeight:700,borderRadius:10,padding:'1px 4px',border:'2px solid var(--sb-bg)'}}>5</span>
            </button>
            <button style={{background:'transparent',border:'none',color:'var(--sb-text)',cursor:'pointer',padding:8,borderRadius:8,fontSize:15}}>⚙️</button>
            <div style={{display:'flex',alignItems:'center',gap:10,marginLeft:6}}>
              <div style={{width:32,height:32,borderRadius:'50%',background:'var(--gold)',display:'flex',alignItems:'center',justifyContent:'center',color:'#11182a',fontWeight:700,fontSize:13}}>BS</div>
              <div style={{lineHeight:1.15}}>
                <div style={{fontSize:13,fontWeight:600,color:'#fff'}}>Bruno Sena</div>
                <div style={{fontSize:10,color:'var(--sb-text-dim)',textTransform:'uppercase',letterSpacing:0.8}}>admin</div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div style={{padding:24}}>
        <h1 style={{fontFamily:'DM Serif Display,serif',fontSize:28,color:'var(--text)',marginBottom:6}}>Preview do Layout</h1>
        <p style={{color:'var(--text-muted)',fontSize:13,marginBottom:24}}>Top navigation horizontal estilo RD Station CRM. Passe o mouse em "Negociações", "Mensagens" etc. para ver os dropdowns.</p>
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
    </div>
  )
}
