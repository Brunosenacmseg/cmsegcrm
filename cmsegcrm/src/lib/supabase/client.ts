import { createBrowserClient } from '@supabase/ssr'

// Stub usado quando o build do Next prerendera as páginas e as
// NEXT_PUBLIC_SUPABASE_* ainda não estão disponíveis. Devolve um Proxy
// que silencia chamadas — em runtime no navegador, as vars já estarão
// resolvidas e o caminho normal é usado.
// Stub que silencia chamadas. Em modo DEMO (sem envs) permite renderizar
// o layout para inspeção visual com dados vazios.
function clientStub(demo = false): any {
  const demoUser = { id: 'demo', email: 'demo@cmseguros.local' }
  const demoSession = { user: demoUser, access_token: 'demo' }
  const noop = async () => ({ data: null, error: null })
  const handler: ProxyHandler<any> = {
    get(_t, prop) {
      if (demo && prop === 'auth') {
        return {
          getSession: async () => ({ data: { session: demoSession }, error: null }),
          signOut: async () => ({ error: null }),
          onAuthStateChange: () => ({ data: { subscription: { unsubscribe(){} } } }),
        }
      }
      if (demo && prop === 'from') {
        const q: any = {
          select: () => q, insert: () => q, update: () => q, delete: () => q,
          eq: () => q, in: () => q, gte: () => q, lte: () => q, lt: () => q, gt: () => q,
          not: () => q, is: () => q, order: () => q, limit: () => q,
          single: async () => ({ data: null, error: null }),
          maybeSingle: async () => ({ data: null, error: null }),
          then: (resolve: any) => resolve({ data: [], error: null, count: 0 }),
        }
        return () => q
      }
      return new Proxy(noop, handler)
    },
    apply() { return new Proxy(noop, handler) },
  }
  return new Proxy(noop, handler)
}

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) {
    if (typeof window === 'undefined') return clientStub()
    // Modo DEMO no navegador: permite ver o layout sem Supabase configurado.
    if (typeof console !== 'undefined') {
      console.warn('[CM CRM] Rodando em modo DEMO — NEXT_PUBLIC_SUPABASE_* ausentes. Layout renderizado com dados vazios.')
    }
    return clientStub(true)
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
