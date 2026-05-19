'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Celebracao = {
  id: string
  vendedor_nome: string | null
  valor: number | null
  mensagem: string | null
  funil_nome: string | null
  criado_em: string
}

const SEEN_KEY = 'celebracao_vendas_seen_v1'
function jaViu(id: string): boolean {
  try {
    const arr: string[] = JSON.parse(sessionStorage.getItem(SEEN_KEY) || '[]')
    return arr.includes(id)
  } catch { return false }
}
function marcarVisto(id: string) {
  try {
    const arr: string[] = JSON.parse(sessionStorage.getItem(SEEN_KEY) || '[]')
    arr.push(id)
    sessionStorage.setItem(SEEN_KEY, JSON.stringify(arr.slice(-100)))
  } catch {}
}

function fmtBRL(v: number | null) {
  const n = Number(v || 0)
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function CelebracaoVenda() {
  const supabase = createClient()
  const [fila, setFila] = useState<Celebracao[]>([])

  function exibir(c: Celebracao) {
    if (jaViu(c.id)) return
    marcarVisto(c.id)
    setFila(prev => [...prev, c])
  }
  function fechar(id: string) {
    setFila(prev => prev.filter(x => x.id !== id))
  }

  useEffect(() => {
    // Realtime: novas vendas (a partir de agora)
    const channel = supabase
      .channel('celebracao-vendas')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'vendas_celebracoes' },
        (payload: any) => { if (payload.new) exibir(payload.new as Celebracao) }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  if (!fila.length) return null

  return (
    <div style={{position:'fixed',top:80,right:20,zIndex:9999,display:'flex',flexDirection:'column',gap:10,pointerEvents:'none'}}>
      {fila.map(c => (
        <div key={c.id}
          style={{
            position:'relative',
            pointerEvents:'auto',
            minWidth:300, maxWidth:380,
            background:'linear-gradient(135deg, #c9a84c 0%, #b8923a 100%)',
            color:'#1a1f2e',
            padding:'14px 36px 14px 18px',
            borderRadius:12,
            boxShadow:'0 12px 40px rgba(0,0,0,0.35)',
            border:'2px solid #fff',
            animation:'celebraSlide 0.4s ease-out',
          }}>
          <button onClick={()=>fechar(c.id)} aria-label="Fechar"
            style={{position:'absolute',top:6,right:8,width:22,height:22,padding:0,border:'none',background:'rgba(0,0,0,0.15)',color:'#1a1f2e',borderRadius:'50%',cursor:'pointer',fontSize:13,fontWeight:700,lineHeight:1,display:'flex',alignItems:'center',justifyContent:'center'}}>×</button>
          {(() => {
            const fn = String(c.funil_nome || '').toUpperCase()
            const ehSinistro = fn.includes('SINISTRO')
            const ehCobranca = fn.includes('COBRAN')
            let headline: string, sub: string, icon: string
            if (ehSinistro) {
              headline = `${c.vendedor_nome || 'Alguém'} finalizou mais um sinistro`
              sub = c.mensagem || 'AQUI NÃO TEM PROBLEMA, SÓ TEM SOLUÇÃO!!'
              icon = '🛡️'
            } else if (ehCobranca) {
              headline = `${c.vendedor_nome || 'Alguém'} é diferenciada, finalizou mais uma cobrança!`
              sub = c.mensagem || 'OU PAGA OU PAGAAA'
              icon = '💸'
            } else {
              headline = `${c.vendedor_nome || 'Alguém'} fechou uma venda de ${fmtBRL(c.valor)}`
              sub = c.mensagem || 'O CHORO É LIVRE!!'
              icon = '🎉'
            }
            return (
              <>
                <div style={{fontSize:13,fontWeight:700,marginBottom:4,display:'flex',alignItems:'center',gap:6}}>
                  <span style={{fontSize:18}}>{icon}</span>
                  <span>{headline}</span>
                </div>
                <div style={{fontSize:14,fontWeight:800,fontStyle:'italic',letterSpacing:0.3}}>{sub}</div>
              </>
            )
          })()}
        </div>
      ))}
      <style jsx>{`
        @keyframes celebraSlide {
          from { transform: translateX(120%); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
      `}</style>
    </div>
  )
}
