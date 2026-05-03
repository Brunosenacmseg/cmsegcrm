'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function RedirectHdi() {
  const router = useRouter()
  const supabase = createClient()
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('seguradoras')
        .select('id').ilike('nome', 'hdi%').limit(1)
      const id = data?.[0]?.id
      router.replace(id ? `/dashboard/seguradoras/${id}` : '/dashboard/seguradoras')
    })()
  }, [])
  return <div style={{ padding: 24, color: '#888' }}>Redirecionando para Seguradoras → HDI…</div>
}
