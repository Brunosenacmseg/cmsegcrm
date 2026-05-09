'use client'
import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react'

export type ToastType = 'success' | 'error' | 'info' | 'warning'

export interface Toast {
  id: string
  type: ToastType
  message: string
  description?: string
  durationMs?: number
}

interface ToastContextValue {
  show: (t: Omit<Toast, 'id'>) => void
  success: (message: string, description?: string) => void
  error:   (message: string, description?: string) => void
  info:    (message: string, description?: string) => void
  warning: (message: string, description?: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    // Fallback silencioso para componentes carregados fora do Provider:
    // melhor não-lançar do que crashar a página.
    return {
      show: () => {}, success: () => {}, error: () => {}, info: () => {}, warning: () => {},
    }
  }
  return ctx
}

const COR: Record<ToastType, { bg: string; border: string; text: string; icon: string }> = {
  success: { bg: 'rgba(40,180,99,0.12)',  border: 'rgba(40,180,99,0.45)',  text: '#5fd58a', icon: '✅' },
  error:   { bg: 'rgba(224,82,82,0.12)',   border: 'rgba(224,82,82,0.45)',  text: '#ff8b8b', icon: '⚠' },
  info:    { bg: 'rgba(74,128,240,0.12)',  border: 'rgba(74,128,240,0.45)', text: '#8fb6ff', icon: 'ℹ' },
  warning: { bg: 'rgba(232,160,32,0.12)',  border: 'rgba(232,160,32,0.45)', text: '#f5c66b', icon: '⚠' },
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const remove = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const show = useCallback((t: Omit<Toast, 'id'>) => {
    const id = `t-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const toast: Toast = { ...t, id }
    setToasts(prev => [...prev, toast])
    const duration = t.durationMs ?? (t.type === 'error' ? 6000 : 3500)
    if (duration > 0) {
      setTimeout(() => remove(id), duration)
    }
  }, [remove])

  const success = useCallback((m: string, d?: string) => show({ type: 'success', message: m, description: d }), [show])
  const error   = useCallback((m: string, d?: string) => show({ type: 'error',   message: m, description: d }), [show])
  const info    = useCallback((m: string, d?: string) => show({ type: 'info',    message: m, description: d }), [show])
  const warning = useCallback((m: string, d?: string) => show({ type: 'warning', message: m, description: d }), [show])

  // Shim de window.alert: todo alert() existente no app passa a ser um toast
  // de info, sem precisar reescrever cada call. O confirm() segue nativo
  // porque é síncrono e o substituto async quebra fluxos existentes.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const native = window.alert.bind(window)
    window.alert = (msg?: any) => {
      const m = msg == null ? '' : String(msg)
      // Heurística: textos curtos com ❌/⚠/erro/falha → error
      const lower = m.toLowerCase()
      if (/^❌|^⚠|erro|falha|inválid|n[ãa]o foi poss[íi]vel/i.test(lower)) {
        show({ type: 'error', message: m })
      } else if (/^✅|sucesso|salvo|criado|atualizado|removido|exclu[íi]do/i.test(lower)) {
        show({ type: 'success', message: m })
      } else {
        show({ type: 'info', message: m })
      }
    }
    return () => { window.alert = native }
  }, [show])

  return (
    <ToastContext.Provider value={{ show, success, error, info, warning }}>
      {children}
      <div
        aria-live="polite"
        style={{
          position: 'fixed',
          top: 16,
          right: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          zIndex: 9999,
          maxWidth: 380,
          pointerEvents: 'none',
        }}
      >
        {toasts.map(t => {
          const c = COR[t.type]
          return (
            <div
              key={t.id}
              onClick={() => remove(t.id)}
              role="button"
              style={{
                pointerEvents: 'auto',
                cursor: 'pointer',
                background: '#0a1628',
                border: `1px solid ${c.border}`,
                borderLeft: `4px solid ${c.text}`,
                borderRadius: 10,
                padding: '12px 14px',
                color: '#f5f5f7',
                fontSize: 13,
                lineHeight: 1.4,
                boxShadow: '0 6px 24px rgba(0,0,0,0.35)',
                animation: 'cm-toast-in 0.18s ease',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
              }}
            >
              <span style={{ color: c.text, fontSize: 14, marginTop: 1 }}>{c.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>{t.message}</div>
                {t.description && (
                  <div style={{ marginTop: 3, color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>{t.description}</div>
                )}
              </div>
            </div>
          )
        })}
        <style>{`@keyframes cm-toast-in{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:translateX(0)}}`}</style>
      </div>
    </ToastContext.Provider>
  )
}

// Modal de confirmação reutilizável usando o mesmo provider.
// Use:  const ok = await confirmar({ titulo, mensagem, confirmLabel, perigoso })
// Ainda exposto como API simples — o componente vive aqui.
let _confirmHandler: ((opts: ConfirmOpts) => Promise<boolean>) | null = null

export interface ConfirmOpts {
  titulo: string
  mensagem?: string
  confirmLabel?: string
  cancelLabel?: string
  perigoso?: boolean
}

export async function confirmar(opts: ConfirmOpts): Promise<boolean> {
  if (_confirmHandler) return _confirmHandler(opts)
  // Fallback se o ConfirmProvider não estiver montado: usa window.confirm
  if (typeof window !== 'undefined') return window.confirm(opts.mensagem || opts.titulo)
  return false
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOpts | null>(null)
  const [resolver, setResolver] = useState<((b: boolean) => void) | null>(null)

  _confirmHandler = (o: ConfirmOpts) => {
    return new Promise<boolean>(resolve => {
      setOpts(o)
      setResolver(() => resolve)
    })
  }

  function close(result: boolean) {
    resolver?.(result)
    setOpts(null)
    setResolver(null)
  }

  return (
    <>
      {children}
      {opts && (
        <div
          onClick={() => close(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 10000,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#0a1628', border: '1px solid var(--border)',
              borderRadius: 14, maxWidth: 440, width: '100%', padding: 24,
              boxShadow: '0 20px 60px rgba(0,0,0,0.6)', color: '#f5f5f7',
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>{opts.titulo}</div>
            {opts.mensagem && (
              <div style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.75)', lineHeight: 1.5 }}>{opts.mensagem}</div>
            )}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 22 }}>
              <button
                onClick={() => close(false)}
                style={{
                  background: 'transparent', color: '#f5f5f7',
                  border: '1px solid var(--border)', borderRadius: 8,
                  padding: '8px 16px', cursor: 'pointer', fontSize: 13,
                  fontFamily: 'inherit',
                }}
              >{opts.cancelLabel || 'Cancelar'}</button>
              <button
                onClick={() => close(true)}
                style={{
                  background: opts.perigoso ? 'var(--red)' : 'var(--gold)',
                  color: opts.perigoso ? '#fff' : '#000',
                  border: 'none', borderRadius: 8,
                  padding: '8px 16px', cursor: 'pointer', fontSize: 13,
                  fontWeight: 600, fontFamily: 'inherit',
                }}
              >{opts.confirmLabel || 'Confirmar'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
