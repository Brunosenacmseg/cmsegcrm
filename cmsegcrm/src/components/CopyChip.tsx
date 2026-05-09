'use client'
import { useState } from 'react'

/**
 * Texto clicável que copia para clipboard com feedback visual.
 * Uso:
 *   <CopyChip value={cliente.telefone} label={maskTelefone(cliente.telefone)} />
 *   <CopyChip value={cliente.email} />
 */
interface Props {
  value: string | null | undefined
  label?: React.ReactNode
  title?: string
  style?: React.CSSProperties
}

export default function CopyChip({ value, label, title, style }: Props) {
  const [copiado, setCopiado] = useState(false)
  if (!value) return null
  const texto = label ?? value
  return (
    <span
      onClick={async (e) => {
        e.stopPropagation()
        try {
          await navigator.clipboard.writeText(String(value))
          setCopiado(true)
          setTimeout(() => setCopiado(false), 1400)
        } catch {}
      }}
      title={title || 'Clique para copiar'}
      style={{
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '1px 4px',
        margin: '-1px -4px',
        borderRadius: 4,
        transition: 'background 0.12s',
        background: copiado ? 'rgba(40,180,99,0.18)' : 'transparent',
        color: copiado ? '#5fd58a' : 'inherit',
        ...style,
      }}
      onMouseEnter={(e) => {
        if (!copiado) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)'
      }}
      onMouseLeave={(e) => {
        if (!copiado) (e.currentTarget as HTMLElement).style.background = 'transparent'
      }}
    >
      {texto}
      {copiado && <span style={{ fontSize: 10, marginLeft: 2 }}>✓</span>}
    </span>
  )
}
