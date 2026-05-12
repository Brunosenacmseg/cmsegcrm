'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

declare global { interface Window { XLSX: any } }

async function carregarSheetJS(): Promise<void> {
  if (typeof window === 'undefined' || window.XLSX) return
  return new Promise((res, rej) => {
    const s = document.createElement('script')
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
    s.onload = () => res(); s.onerror = rej
    document.head.appendChild(s)
  })
}

type Linha = {
  nomeCliente: string
  apolice: string
  vencimento: string
  seguradora: string
  // resolvidos
  cliente_id?: string | null
  cliente_match?: 'exato' | 'aproximado' | 'nao' | null
  ja_existe?: boolean
}

function normalizarData(v: any): string {
  if (!v) return ''
  if (v instanceof Date) {
    const d = v
    return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`
  }
  const s = String(v).trim()
  // Aceita DD/MM/YYYY, YYYY-MM-DD, etc.
  const m1 = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/)
  if (m1) {
    const dd = m1[1].padStart(2,'0'); const mm = m1[2].padStart(2,'0')
    let yy = m1[3]; if (yy.length === 2) yy = '20'+yy
    return `${dd}/${mm}/${yy}`
  }
  const m2 = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m2) return `${m2[3].padStart(2,'0')}/${m2[2].padStart(2,'0')}/${m2[1]}`
  return s
}

export default function ImportarCobrancaPage() {
  const supabase = createClient()
  const router = useRouter()

  const [profile, setProfile]   = useState<any>(null)
  const [autorizado, setAuto]   = useState<boolean | null>(null)
  const [loading, setLoading]   = useState(true)

  const [linhas, setLinhas]     = useState<Linha[]>([])
  const [arquivo, setArquivo]   = useState<File | null>(null)
  const [processando, setProc]  = useState(false)
  const [importando, setImp]    = useState(false)
  const [resultado, setRes]     = useState<{criados:number; ignorados:number; erros:number; mensagens:string[]} | null>(null)

  useEffect(() => { carregarSheetJS() }, [])

  useEffect(() => {
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setAuto(false); setLoading(false); return }
      const { data: prof } = await supabase.from('users').select('id,nome,role').eq('id', user.id).single()
      setProfile(prof)
      if (prof?.role === 'admin') {
        setAuto(true); setLoading(false); return
      }
      // Permissão extra: equipe GESTÃO
      const { data: equipes } = await supabase
        .from('equipe_membros')
        .select('equipes!inner(nome)')
        .eq('user_id', user.id)
      const nomes = (equipes || []).map((r: any) => (r.equipes?.nome || '').toString().toUpperCase().trim())
      const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
      const temGestao = nomes.some((n: string) => norm(n) === 'gestao' || norm(n) === 'equipe gestao')
      setAuto(temGestao)
      setLoading(false)
    })()
  }, [])

  async function lerArquivo(file: File) {
    setProc(true)
    setLinhas([])
    setRes(null)
    setArquivo(file)
    try {
      await carregarSheetJS()
      const buf = await file.arrayBuffer()
      const wb = window.XLSX.read(buf, { type: 'array', cellDates: true })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const json = window.XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as any[][]
      if (json.length < 2) { alert('Planilha vazia'); setProc(false); return }
      // Detecta cabeçalho (linha 0)
      const headers = (json[0] || []).map((h: any) => String(h || '').toUpperCase().trim())
      const idxNome = headers.findIndex(h => h === 'NOME CLIENTE' || h === 'CLIENTE' || h === 'NOME')
      const idxApol = headers.findIndex(h => h === 'APOLICE' || h === 'APÓLICE')
      const idxVenc = headers.findIndex(h => h === 'VENCIMENTO' || h === 'VENC')
      const idxSeg  = headers.findIndex(h => h === 'SEGURADORA' || h === 'SEGURADORA(S)')
      if (idxNome < 0 || idxApol < 0 || idxVenc < 0 || idxSeg < 0) {
        alert('Cabeçalho não reconhecido. Esperado: NOME CLIENTE | APOLICE | VENCIMENTO | SEGURADORA')
        setProc(false); return
      }
      const linhasRaw: Linha[] = []
      for (let i = 1; i < json.length; i++) {
        const r = json[i] || []
        const nomeCliente = String(r[idxNome] || '').trim()
        if (!nomeCliente) continue
        linhasRaw.push({
          nomeCliente,
          apolice: String(r[idxApol] || '').trim(),
          vencimento: normalizarData(r[idxVenc]),
          seguradora: String(r[idxSeg] || '').trim(),
        })
      }
      // Match de clientes
      const nomes = Array.from(new Set(linhasRaw.map(l => l.nomeCliente)))
      const { data: clientes } = await supabase.from('clientes').select('id,nome').in('nome', nomes)
      const exatos = new Map<string,string>()
      ;(clientes || []).forEach((c: any) => exatos.set(c.nome.toLowerCase(), c.id))
      // Para os que não casaram exatamente, faz ilike por trecho
      const semExato = linhasRaw.filter(l => !exatos.has(l.nomeCliente.toLowerCase()))
      const aproximados = new Map<string,string>()
      for (const l of semExato) {
        const { data } = await supabase.from('clientes').select('id,nome').ilike('nome', `%${l.nomeCliente}%`).limit(1)
        if (data && data.length > 0) aproximados.set(l.nomeCliente.toLowerCase(), data[0].id)
      }
      const resolvidas: Linha[] = linhasRaw.map(l => {
        const id1 = exatos.get(l.nomeCliente.toLowerCase())
        if (id1) return { ...l, cliente_id: id1, cliente_match: 'exato' }
        const id2 = aproximados.get(l.nomeCliente.toLowerCase())
        if (id2) return { ...l, cliente_id: id2, cliente_match: 'aproximado' }
        return { ...l, cliente_id: null, cliente_match: 'nao' }
      })
      setLinhas(resolvidas)
    } catch (e: any) {
      alert('Erro ao ler arquivo: ' + (e?.message || e))
    } finally {
      setProc(false)
    }
  }

  async function importar() {
    if (linhas.length === 0) return
    if (!confirm(`Confirmar importação de ${linhas.length} linha(s)? Cada linha vira um card no funil COBRANÇA atribuído à equipe COBRANÇA.`)) return
    setImp(true)
    setRes(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const resp = await fetch('/api/importar/cobranca', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
        body: JSON.stringify({ linhas }),
      })
      const j = await resp.json()
      if (!resp.ok) {
        alert('Erro: ' + (j.error || 'falha'))
      } else {
        setRes(j)
      }
    } finally {
      setImp(false)
    }
  }

  if (loading) return <div style={{padding:40,textAlign:'center',color:'var(--text-muted)'}}>Carregando...</div>
  if (!autorizado) return (
    <div style={{padding:60,textAlign:'center',color:'var(--text-muted)'}}>
      <div style={{fontSize:40,marginBottom:12}}>🔒</div>
      <div>Apenas administradores ou equipe GESTÃO podem importar cobranças.</div>
    </div>
  )

  const semCliente = linhas.filter(l => l.cliente_match === 'nao').length
  const exatoCount = linhas.filter(l => l.cliente_match === 'exato').length
  const aproxCount = linhas.filter(l => l.cliente_match === 'aproximado').length

  return (
    <div style={{padding:'24px 32px',maxWidth:1280,margin:'0 auto'}}>
      <div style={{fontSize:11,color:'var(--text-muted)',marginBottom:4}}>
        <Link href="/dashboard/importar" style={{color:'inherit',textDecoration:'none'}}>← Importar dados</Link>
      </div>
      <h1 style={{fontFamily:'DM Serif Display,serif',fontSize:24,color:'var(--text)',marginBottom:8}}>💰 Importar Cobrança</h1>
      <p style={{fontSize:13,color:'var(--text-muted)',marginBottom:20}}>
        Upload de planilha <strong>.xlsx</strong> com as colunas <code>NOME CLIENTE · APOLICE · VENCIMENTO · SEGURADORA</code>.
        Cada linha vira um card no funil <strong>COBRANÇA</strong>, atribuído à equipe <strong>COBRANÇA</strong>,
        com o cliente vinculado por nome e uma anotação contendo apólice + seguradora.
      </p>

      <div style={{background:'#fff',border:'1px solid var(--border-soft)',borderRadius:12,padding:20,marginBottom:18}}>
        <label style={{display:'block',fontSize:13,fontWeight:600,marginBottom:8}}>Selecione a planilha</label>
        <input type="file" accept=".xlsx,.xls" onChange={e=>{ const f=e.target.files?.[0]; if (f) lerArquivo(f) }} disabled={processando}
          style={{fontSize:13}} />
        {arquivo && <div style={{fontSize:12,color:'var(--text-muted)',marginTop:6}}>Arquivo: <strong>{arquivo.name}</strong> · {linhas.length} linha{linhas.length!==1?'s':''}</div>}
      </div>

      {processando && (
        <div style={{padding:20,textAlign:'center',color:'var(--text-muted)',fontSize:13}}>Processando planilha…</div>
      )}

      {linhas.length > 0 && !processando && (
        <>
          <div style={{display:'flex',gap:12,marginBottom:14,flexWrap:'wrap'}}>
            <div style={{background:'var(--success-bg)',color:'var(--success)',padding:'8px 14px',borderRadius:8,fontSize:13}}>✓ Match exato: <strong>{exatoCount}</strong></div>
            <div style={{background:'var(--warning-bg)',color:'var(--warning)',padding:'8px 14px',borderRadius:8,fontSize:13}}>≈ Match aproximado: <strong>{aproxCount}</strong></div>
            {semCliente > 0 && <div style={{background:'var(--danger-bg)',color:'var(--danger)',padding:'8px 14px',borderRadius:8,fontSize:13}}>✕ Sem cliente: <strong>{semCliente}</strong></div>}
          </div>

          <div style={{background:'#fff',border:'1px solid var(--border-soft)',borderRadius:12,overflow:'hidden',marginBottom:18}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
              <thead>
                <tr style={{background:'var(--bg-subtle)'}}>
                  {['NOME CLIENTE','APOLICE','VENCIMENTO','SEGURADORA','MATCH'].map(h=>(
                    <th key={h} style={{padding:'10px 14px',textAlign:'left',fontSize:10,fontWeight:700,letterSpacing:1.2,color:'var(--text-muted)',borderBottom:'1px solid var(--border-soft)'}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {linhas.slice(0, 100).map((l,i)=>(
                  <tr key={i} style={{borderBottom:'1px solid var(--border-soft)'}}>
                    <td style={{padding:'8px 14px'}}>{l.nomeCliente}</td>
                    <td style={{padding:'8px 14px'}}>{l.apolice}</td>
                    <td style={{padding:'8px 14px'}}>{l.vencimento}</td>
                    <td style={{padding:'8px 14px'}}>{l.seguradora}</td>
                    <td style={{padding:'8px 14px'}}>
                      {l.cliente_match === 'exato' && <span style={{color:'var(--success)'}}>✓ exato</span>}
                      {l.cliente_match === 'aproximado' && <span style={{color:'var(--warning)'}}>≈ aproximado</span>}
                      {l.cliente_match === 'nao' && <span style={{color:'var(--danger)'}}>✕ sem cliente</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {linhas.length > 100 && <div style={{padding:'10px 14px',fontSize:12,color:'var(--text-muted)'}}>… e mais {linhas.length - 100} linha(s)</div>}
          </div>

          <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
            <button onClick={()=>{ setLinhas([]); setArquivo(null); setRes(null) }} disabled={importando}
              style={{padding:'9px 18px',borderRadius:8,border:'1px solid var(--border-soft)',background:'#fff',color:'var(--text)',cursor:'pointer',fontSize:13,fontWeight:600}}>Cancelar</button>
            <button onClick={importar} disabled={importando}
              style={{padding:'9px 18px',borderRadius:8,border:'none',background:'var(--blue)',color:'#fff',cursor:'pointer',fontSize:13,fontWeight:600,opacity:importando?0.6:1}}>
              {importando?'Importando...':`Importar ${linhas.length} card(s)`}
            </button>
          </div>
        </>
      )}

      {resultado && (
        <div style={{marginTop:18,padding:18,background:'#fff',border:'1px solid var(--border-soft)',borderRadius:12}}>
          <div style={{fontSize:14,fontWeight:700,marginBottom:8}}>Resultado da importação</div>
          <div style={{fontSize:13,color:'var(--text)'}}>✓ Criados: <strong>{resultado.criados}</strong></div>
          <div style={{fontSize:13,color:'var(--text)'}}>⏭ Ignorados (já existiam): <strong>{resultado.ignorados}</strong></div>
          {resultado.erros > 0 && <div style={{fontSize:13,color:'var(--red)'}}>✕ Erros: <strong>{resultado.erros}</strong></div>}
          {resultado.mensagens?.length > 0 && (
            <pre style={{marginTop:10,padding:10,background:'var(--bg-subtle)',borderRadius:6,fontSize:11,maxHeight:240,overflow:'auto',whiteSpace:'pre-wrap'}}>{resultado.mensagens.join('\n')}</pre>
          )}
        </div>
      )}
    </div>
  )
}
