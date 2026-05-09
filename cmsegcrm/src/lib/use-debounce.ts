'use client'
import { useEffect, useState } from 'react'

/**
 * Retorna `value` defasado em `delay` ms. Útil para inputs de busca:
 *   const [q, setQ] = useState('')
 *   const qDebounced = useDebounce(q, 300)
 *   useEffect(() => { fetch... }, [qDebounced])
 */
export function useDebounce<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(id)
  }, [value, delay])
  return debounced
}
