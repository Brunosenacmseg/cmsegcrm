import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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
