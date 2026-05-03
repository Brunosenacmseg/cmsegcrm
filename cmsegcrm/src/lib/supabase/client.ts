import { createBrowserClient } from '@supabase/ssr'

// Stub usado quando o build do Next prerendera as páginas e as
// NEXT_PUBLIC_SUPABASE_* ainda não estão disponíveis. Devolve um Proxy
// que silencia chamadas — em runtime no navegador, as vars já estarão
// resolvidas e o caminho normal é usado.
function clientStub(): any {
  const noop = async () => ({ data: null, error: null })
  const handler: ProxyHandler<any> = {
    get(_t, _p) {
      return new Proxy(noop, handler)
    },
    apply() {
      return new Proxy(noop, handler)
    },
  }
  return new Proxy(noop, handler)
}

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) {
    if (typeof window === 'undefined') return clientStub()
    throw new Error('Variáveis NEXT_PUBLIC_SUPABASE_* não configuradas no projeto Vercel.')
  }
  return createBrowserClient(
    url,
    key,
    {
      cookies: {
        get(name: string) {
          if (typeof document === 'undefined') return ''
          const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'))
          return match ? decodeURIComponent(match[2]) : ''
        },
        set(name: string, value: string, options: any) {
          if (typeof document === 'undefined') return
          let cookie = `${name}=${encodeURIComponent(value)}`
          if (options?.maxAge) cookie += `; max-age=${options.maxAge}`
          if (options?.path) cookie += `; path=${options.path}`
          else cookie += `; path=/`
          if (options?.sameSite) cookie += `; samesite=${options.sameSite}`
          cookie += `; secure`
          document.cookie = cookie
        },
        remove(name: string, options: any) {
          if (typeof document === 'undefined') return
          document.cookie = `${name}=; max-age=0; path=${options?.path || '/'}`
        }
      }
    }
  )
}
