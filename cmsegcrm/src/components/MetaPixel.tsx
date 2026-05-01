'use client'
import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

declare global {
  interface Window { fbq?: any; _fbq?: any }
}

/**
 * Injeta o Meta Pixel (fbq) automaticamente quando há um pixel_id configurado
 * em meta_config.pixel_id. Dispara PageView a cada navegação.
 *
 * Uso: importar e renderizar uma vez em layout.tsx — só carrega script
 * se houver pixel configurado.
 */
export default function MetaPixel() {
  const pathname = usePathname()

  // Inicialização: busca pixel_id e injeta script (uma vez por page load)
  useEffect(() => {
    let cancelled = false
    fetch('/api/meta/pixel').then(r => r.json()).then((j: { pixel_id: string|null }) => {
      if (cancelled) return
      const pid = j?.pixel_id
      if (!pid || typeof window === 'undefined') return

      // Se já carregou, só dispara PageView pra essa rota
      if (typeof window.fbq === 'function') {
        try { window.fbq('track', 'PageView') } catch {}
        return
      }

      // Injeta o script padrão do Meta
      ;(function(f: any, b: Document, e: string, v: string) {
        if (f.fbq) return
        const n: any = f.fbq = function () {
          n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments)
        }
        if (!f._fbq) f._fbq = n
        n.push = n; n.loaded = true; n.version = '2.0'; n.queue = []
        const t = b.createElement(e) as HTMLScriptElement
        t.async = true
        t.src = v
        const s = b.getElementsByTagName(e)[0]
        s?.parentNode?.insertBefore(t, s)
      })(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js')

      window.fbq('init', pid)
      window.fbq('track', 'PageView')
    }).catch(() => {})
    return () => { cancelled = true }
  }, [])

  // Dispara PageView em cada mudança de rota
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (typeof window.fbq !== 'function') return
    try { window.fbq('track', 'PageView') } catch {}
  }, [pathname])

  return null
}

/**
 * Helper pra disparar eventos custom do Pixel.
 * Ex: trackMetaEvent('Lead'), trackMetaEvent('Purchase', { value: 1500, currency: 'BRL' })
 */
export function trackMetaEvent(name: string, params?: Record<string, any>) {
  if (typeof window === 'undefined') return
  if (typeof window.fbq !== 'function') return
  try { window.fbq('track', name, params || {}) } catch {}
}
