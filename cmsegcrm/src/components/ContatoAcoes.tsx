'use client'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/Toast'

type Props = {
  telefone?: string | null
  email?: string | null
  clienteId?: string | null
  size?: 'sm' | 'md'
}

/**
 * Ícones de ação para um contato: copiar telefone, abrir WhatsApp dentro
 * do CRM, abrir Telefone (discador interno), abrir composer de e-mail, e
 * link para a página do cliente. Reutilizável em card de negociação,
 * página de cliente, popovers, etc.
 */
export default function ContatoAcoes({ telefone, email, clienteId, size='md' }: Props) {
  const router = useRouter()
  const toast = useToast()
  const dim = size === 'sm' ? 22 : 28
  const fs = size === 'sm' ? 11 : 13

  const tel = (telefone || '').replace(/\D/g, '')

  function copy(text: string, label: string) {
    if (!text) return
    try { navigator.clipboard.writeText(text); toast.success(`${label} copiado`) } catch {}
  }

  const btn: React.CSSProperties = {
    width: dim, height: dim, borderRadius: 6, border: '1px solid var(--border-soft)',
    background: '#fff', cursor: 'pointer', display: 'inline-flex',
    alignItems: 'center', justifyContent: 'center', fontSize: fs,
    color: 'var(--text-muted)', flexShrink: 0,
  }

  return (
    <div style={{display:'inline-flex',alignItems:'center',gap:4,flexWrap:'wrap'}}>
      {tel && (
        <>
          <button style={btn} title="Copiar telefone" onClick={()=>copy(tel,'Telefone')}>📋</button>
          <button style={btn} title="Abrir WhatsApp interno"
            onClick={()=>router.push(`/dashboard/whatsapp?numero=${encodeURIComponent(tel)}`)}>💬</button>
          <button style={btn} title="Ligar pelo discador interno"
            onClick={()=>router.push(`/dashboard/telefone?ligar=${encodeURIComponent(tel)}`)}>📞</button>
        </>
      )}
      {email && (
        <>
          <button style={btn} title="Copiar e-mail" onClick={()=>copy(email,'E-mail')}>📋</button>
          <button style={btn} title="Enviar e-mail pelo CRM"
            onClick={()=>router.push(`/dashboard/email?para=${encodeURIComponent(email)}`)}>✉️</button>
        </>
      )}
      {clienteId && (
        <button style={{...btn, width:'auto', padding:'0 10px', color:'var(--blue)', fontSize: fs, fontWeight:600}}
          title="Abrir página do cliente"
          onClick={()=>router.push(`/dashboard/clientes/${clienteId}`)}>
          Abrir cliente →
        </button>
      )}
    </div>
  )
}
