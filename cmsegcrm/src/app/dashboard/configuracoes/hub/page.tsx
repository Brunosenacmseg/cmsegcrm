'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

type Item = { label: string; href: string; novo?: boolean; disabled?: boolean }
type Section = { title: string; items: Item[] }

const HIGHLIGHTS: Array<{ title: string; cta: string; href: string; bg: string }> = [
  { title:'Convide as pessoas da sua equipe para usar o CRM',
    cta:'Convidar usuários', href:'/dashboard/usuarios', bg:'#cfe8ff' },
  { title:'Crie campos personalizados de acordo com seu processo de vendas',
    cta:'Criar campos personalizados', href:'/dashboard/configuracoes?aba=campos', bg:'#e6d6ff' },
  { title:'Configure as etapas do Playbook de Vendas para sua equipe',
    cta:'Configurar etapas do funil', href:'/dashboard/funis/configurar', bg:'#ffe8b3' },
]

const SECTIONS: Section[][] = [
  // Coluna 1
  [
    { title:'SEU TIME', items:[
      { label:'Convites, usuários e equipes', href:'/dashboard/usuarios' },
    ]},
    { title:'CONFIGURE SEU PROCESSO DE VENDA', items:[
      { label:'Funis de vendas', href:'/dashboard/funis/configurar' },
      { label:'Configurar campos', href:'/dashboard/configuracoes?aba=campos' },
      { label:'Qualificação', href:'/dashboard/configuracoes' },
      { label:'Questionários', href:'/dashboard/configuracoes' },
    ]},
    { title:'AUTOMATIZE PROCESSOS', items:[
      { label:'Automação de vendas', href:'/dashboard/automacoes' },
    ]},
    { title:'PRODUTOS', items:[
      { label:'Agentes de IA', href:'/dashboard/agentes-ia', novo:true },
      { label:'RD Station CRM (integração)', href:'/dashboard/rdstation' },
    ]},
  ],
  // Coluna 2
  [
    { title:'AVANÇADO', items:[
      { label:'Importar dados', href:'/dashboard/importar' },
      { label:'Multi-vendas', href:'/dashboard/configuracoes' },
      { label:'Metas', href:'/dashboard/metas' },
      { label:'Modelos de proposta', href:'/dashboard/configuracoes' },
      { label:'Assinatura Eletrônica (Autentique)', href:'/dashboard/autentique' },
      { label:'Preferências', href:'/dashboard/configuracoes' },
      { label:'Integrações', href:'/dashboard/integracoes/integrador' },
      { label:'Privacidade de dados', href:'/dashboard/configuracoes' },
      { label:'Venda pelo WhatsApp', href:'/dashboard/whatsapp' },
    ]},
  ],
  // Coluna 3
  [
    { title:'AJUSTES DE SUA CONTA', items:[
      { label:'Fontes e campanhas', href:'/dashboard/integracoes/meta' },
      { label:'Produtos e serviços', href:'/dashboard/configuracoes?aba=produtos' },
      { label:'Segmentos', href:'/dashboard/configuracoes' },
      { label:'Motivo de perda', href:'/dashboard/configuracoes?aba=motivos' },
      { label:'Informações pré-definidas', href:'/dashboard/configuracoes' },
      { label:'Modelos de e-mail', href:'/dashboard/configuracoes?aba=templates' },
      { label:'Telefone virtual', href:'/dashboard/telefone' },
    ]},
    { title:'ADMINISTRAÇÃO', items:[
      { label:'Log do sistema', href:'/dashboard/logs' },
      { label:'Seguradoras', href:'/dashboard/seguradoras' },
      { label:'Tokio Marine (WS)', href:'/dashboard/tokio' },
      { label:'Cobrança · Sheets', href:'/dashboard/integracoes/sheets-cobranca' },
      { label:'Melhorias CRM', href:'/dashboard/melhorias' },
    ]},
  ],
]

export default function ConfiguracoesHubPage() {
  const supabase = createClient()
  const router = useRouter()
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)
  const [devMode, setDevMode] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }: any) => {
      if (!session) return setIsAdmin(false)
      const { data } = await supabase.from('users').select('role').eq('id', session.user.id).single()
      setIsAdmin(data?.role === 'admin' || data?.role === 'financeiro')
    })
    try { setDevMode(localStorage.getItem('cm_dev_mode') === '1') } catch {}
  }, [])

  function toggleDevMode() {
    const novo = !devMode
    setDevMode(novo)
    try { localStorage.setItem('cm_dev_mode', novo ? '1' : '0') } catch {}
  }

  return (
    <div style={{padding:'28px 32px',maxWidth:1280,margin:'0 auto'}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:18}}>
        <h1 style={{fontFamily:'DM Serif Display,serif',fontSize:28,color:'var(--text)'}}>Todas as configurações</h1>
      </div>

      <div style={{fontSize:12,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:1,fontWeight:700,marginBottom:10}}>Sugestões para você</div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))',gap:14,marginBottom:30}}>
        {HIGHLIGHTS.map((h,i)=>(
          <div key={i} style={{background:h.bg,borderRadius:14,padding:18,display:'flex',flexDirection:'column',justifyContent:'space-between',minHeight:130}}>
            <div style={{fontSize:14,color:'#142235',fontWeight:600,marginBottom:14,lineHeight:1.35}}>{h.title}</div>
            <Link href={h.href} style={{alignSelf:'flex-start',background:'#11182a',color:'#fff',padding:'9px 16px',borderRadius:8,fontSize:13,fontWeight:600,textDecoration:'none'}}>{h.cta}</Link>
          </div>
        ))}
      </div>

      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:32}}>
        {SECTIONS.map((coluna,ci)=>(
          <div key={ci} style={{display:'flex',flexDirection:'column',gap:24}}>
            {coluna.map(sec=>(
              <div key={sec.title}>
                <div style={{fontSize:11,color:'var(--text-muted)',letterSpacing:1.3,textTransform:'uppercase',fontWeight:700,marginBottom:10}}>{sec.title}</div>
                <div style={{display:'flex',flexDirection:'column',gap:8}}>
                  {sec.items.map((it,i)=>(
                    <Link key={it.label+i} href={it.href} prefetch={false}
                      style={{display:'flex',alignItems:'center',gap:8,color:'var(--blue)',textDecoration:'none',fontSize:13}}>
                      {it.label}
                      {it.novo && <span style={{background:'#22d3ee',color:'#03323a',fontSize:9,fontWeight:700,padding:'2px 6px',borderRadius:4,textTransform:'uppercase',letterSpacing:0.5}}>NOVO</span>}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      {isAdmin && (
        <div style={{marginTop:40,padding:18,border:'1px dashed var(--border-strong)',borderRadius:12,background:'var(--bg-subtle)'}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:16}}>
            <div>
              <div style={{fontSize:13,fontWeight:700,color:'var(--text)'}}>Modo desenvolvedor</div>
              <div style={{fontSize:12,color:'var(--text-muted)',marginTop:2}}>Exibe IDs internos (etapas, campos, negociações) em todo o sistema. Visível apenas para administradores.</div>
            </div>
            <button onClick={toggleDevMode}
              style={{width:48,height:26,borderRadius:999,border:'none',cursor:'pointer',background:devMode?'var(--teal)':'var(--border-strong)',position:'relative',transition:'background 0.2s'}}>
              <span style={{position:'absolute',top:3,left:devMode?25:3,width:20,height:20,borderRadius:'50%',background:'#fff',transition:'left 0.2s',boxShadow:'0 1px 3px rgba(0,0,0,0.3)'}}/>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
