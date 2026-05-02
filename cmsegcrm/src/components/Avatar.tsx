'use client'

interface AvatarProps {
  nome?: string
  avatarUrl?: string
  role?: string
  size?: number
  fontSize?: number
}

const ROLE_COR: Record<string,string> = {
  admin:    'var(--red)',
  lider:    'var(--gold)',
  corretor: 'var(--teal)',
  financeiro: '#7c5cff',
}

export default function Avatar({ nome, avatarUrl, role, size = 36, fontSize }: AvatarProps) {
  const initials = (nome||'?').split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase()
  const cor      = ROLE_COR[role||''] || 'var(--teal)'
  const fs       = fontSize || Math.round(size * 0.38)

  return (
    <div style={{
      width:  size,
      height: size,
      borderRadius: '50%',
      overflow: 'hidden',
      flexShrink: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: `linear-gradient(135deg,${cor},var(--navy))`,
      fontSize: fs,
      fontWeight: 700,
      color: '#fff',
    }}>
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt={nome||'avatar'}
          style={{ width:'100%', height:'100%', objectFit:'cover' }}
          onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
        />
      ) : (
        <span>{initials}</span>
      )}
    </div>
  )
}
