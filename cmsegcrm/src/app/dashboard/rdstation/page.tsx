'use client'
import { useEffect, useState } from 'react'

// Página simplificada: a integração com RD Station é feita 100% por
// webhook (RD → CMSEGCRM). Sem token, sem API, sem importação manual.
// O endpoint /api/rdstation/webhook é fixo e permanente — basta colar
// a URL abaixo no RD Station uma única vez.

export default function RDStationPage() {
  const [url, setUrl] = useState('')
  const [copiado, setCopiado] = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setUrl(`${window.location.origin}/api/rdstation/webhook?secret=SEU_SECRET`)
    }
  }, [])

  function copiar() {
    navigator.clipboard.writeText(url).then(() => {
      setCopiado(true); setTimeout(() => setCopiado(false), 1500)
    })
  }

  return (
    <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
      <div style={{height:56,borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',padding:'0 28px',background:'var(--bg-soft)',backdropFilter:'blur(8px)',flexShrink:0}}>
        <div style={{fontFamily:'DM Serif Display,serif',fontSize:18}}>🔁 RD Station CRM — Sincronização por Webhook</div>
      </div>

      <div style={{flex:1,overflow:'auto',padding:'28px'}}>
        <div style={{maxWidth:780,margin:'0 auto'}}>

          <div className="card" style={{marginBottom:20,background:'linear-gradient(135deg,rgba(28,181,160,0.08),rgba(74,128,240,0.06))'}}>
            <div style={{fontFamily:'DM Serif Display,serif',fontSize:16,marginBottom:8}}>⚡ Sincronização em tempo real</div>
            <div style={{fontSize:13,color:'var(--text-muted)',marginBottom:16,lineHeight:1.6}}>
              A RD Station envia eventos pra cá automaticamente quando algo muda lá: criação de negócio, mudança de etapa, ganho, perdido, atualização de contato. <strong style={{color:'var(--gold)'}}>Configura uma vez e fica fixo</strong> — não precisa reconectar nem rodar importação manual.
            </div>

            <div style={{fontSize:12,marginBottom:6,color:'var(--gold)',fontWeight:600}}>URL do webhook (cole no RD Station):</div>
            <div style={{display:'flex',gap:8,marginBottom:12}}>
              <input readOnly value={url}
                style={{flex:1,background:'rgba(255,255,255,0.05)',border:'1px solid var(--border)',borderRadius:8,padding:'10px 14px',color:'var(--text)',fontSize:12,fontFamily:'monospace',outline:'none'}} />
              <button onClick={copiar}
                style={{background:'rgba(28,181,160,0.15)',border:'1px solid rgba(28,181,160,0.4)',borderRadius:8,padding:'10px 18px',color:'var(--teal)',cursor:'pointer',fontFamily:'DM Sans,sans-serif',fontSize:12,fontWeight:600}}>
                {copiado ? '✓ Copiado' : '📋 Copiar'}
              </button>
            </div>
          </div>

          <div className="card" style={{marginBottom:20}}>
            <div style={{fontFamily:'DM Serif Display,serif',fontSize:16,marginBottom:12}}>🛠 Como configurar (uma vez)</div>
            <ol style={{fontSize:13,color:'var(--text-muted)',lineHeight:1.9,paddingLeft:20,margin:0}}>
              <li>
                Defina a env var <code style={{background:'rgba(255,255,255,0.06)',padding:'2px 6px',borderRadius:4,color:'var(--gold)'}}>RDSTATION_WEBHOOK_SECRET</code> com uma senha forte (32+ caracteres) na Vercel e faça redeploy.
              </li>
              <li>
                Substitua <code style={{background:'rgba(255,255,255,0.06)',padding:'2px 6px',borderRadius:4,color:'var(--gold)'}}>SEU_SECRET</code> na URL acima pelo valor da env var.
              </li>
              <li>
                No RD Station CRM: <strong style={{color:'var(--text)'}}>Configurações → Integrações → Webhooks</strong>.
              </li>
              <li>
                Clique em <strong style={{color:'var(--text)'}}>Novo webhook</strong>, cole a URL e selecione os eventos:
                <div style={{marginTop:6,marginBottom:6,padding:'8px 12px',background:'rgba(255,255,255,0.04)',borderRadius:6,fontSize:12,color:'var(--text)',fontFamily:'monospace'}}>
                  deal_created · deal_updated · deal_won · deal_lost · deal_deleted · contact_created · contact_updated
                </div>
              </li>
              <li>
                Salve. Pronto — a partir daqui qualquer movimentação no RD reflete no CMSEGCRM em segundos.
              </li>
            </ol>
          </div>

          <div className="card" style={{borderColor:'rgba(201,168,76,0.25)',background:'rgba(201,168,76,0.04)'}}>
            <div style={{fontSize:12,color:'var(--text-muted)',lineHeight:1.6}}>
              <strong style={{color:'var(--gold)'}}>ℹ Sentido único:</strong> hoje a sincronização funciona apenas <strong>RD → CMSEGCRM</strong>. Para que o CMSEGCRM também consiga empurrar mudanças de volta pra RD seria necessário um token de API da RD Station — quando tiver disponível, é só configurar e ativamos o sentido inverso.
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
