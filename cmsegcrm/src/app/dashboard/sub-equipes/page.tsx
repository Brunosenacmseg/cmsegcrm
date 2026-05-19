'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Equipe = { id: string; nome: string; lider_id: string | null }
type SubEquipe = { id: string; equipe_id: string; nome: string }
type Membro = { sub_equipe_id: string; user_id: string }
type Usuario = { id: string; nome: string; email: string }

export default function SubEquipesPage() {
  const supabase = createClient()
  const [autorizado, setAutorizado] = useState(false)
  const [verificando, setVerificando] = useState(true)
  const [meuId, setMeuId] = useState<string>('')
  const [ehAdmin, setEhAdmin] = useState(false)
  const [equipes, setEquipes] = useState<Equipe[]>([])
  const [subs, setSubs] = useState<SubEquipe[]>([])
  const [membros, setMembros] = useState<Membro[]>([])
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [equipeMembros, setEquipeMembros] = useState<Record<string, string[]>>({})
  const [novaSub, setNovaSub] = useState<Record<string, string>>({})

  useEffect(() => { init() }, [])

  async function init() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setMeuId(user.id)
    const { data: prof } = await supabase.from('users').select('role').eq('id', user.id).maybeSingle()
    const isAdmin = prof?.role === 'admin' || prof?.role === 'financeiro'
    setEhAdmin(isAdmin)
    const { data: eqs } = await supabase.from('equipes').select('id,nome,lider_id').order('nome')
    const visiveis = (eqs || []).filter((e: any) => isAdmin || e.lider_id === user.id)
    if (!visiveis.length) { setVerificando(false); return }
    setEquipes(visiveis)
    setAutorizado(true)
    const ids = visiveis.map((e: any) => e.id)
    const [{ data: subsData }, { data: emb }, { data: us }] = await Promise.all([
      supabase.from('sub_equipes').select('*').in('equipe_id', ids).order('nome'),
      supabase.from('equipe_membros').select('equipe_id, user_id').in('equipe_id', ids),
      supabase.from('users').select('id, nome, email').eq('ativo', true).order('nome'),
    ])
    setSubs(subsData || [])
    setUsuarios((us || []) as Usuario[])
    const map: Record<string, string[]> = {}
    ;(emb || []).forEach((m: any) => { if (!map[m.equipe_id]) map[m.equipe_id] = []; map[m.equipe_id].push(m.user_id) })
    setEquipeMembros(map)
    const subIds = (subsData || []).map((s: any) => s.id)
    if (subIds.length) {
      const { data: mems } = await supabase.from('sub_equipe_membros').select('sub_equipe_id, user_id').in('sub_equipe_id', subIds)
      setMembros(mems || [])
    }
    setVerificando(false)
  }

  async function criarSub(equipe_id: string) {
    const nome = (novaSub[equipe_id] || '').trim()
    if (!nome) return
    const { data, error } = await supabase.from('sub_equipes').insert({ equipe_id, nome }).select('*').single()
    if (error) { alert(error.message); return }
    setSubs(prev => [...prev, data])
    setNovaSub(s => ({ ...s, [equipe_id]: '' }))
  }
  async function excluirSub(sub_id: string) {
    if (!confirm('Excluir esta sub-equipe? Os membros são desvinculados.')) return
    const { error } = await supabase.from('sub_equipes').delete().eq('id', sub_id)
    if (error) { alert(error.message); return }
    setSubs(prev => prev.filter(s => s.id !== sub_id))
    setMembros(prev => prev.filter(m => m.sub_equipe_id !== sub_id))
  }
  async function toggleMembro(sub_id: string, user_id: string) {
    const existe = membros.find(m => m.sub_equipe_id === sub_id && m.user_id === user_id)
    if (existe) {
      const { error } = await supabase.from('sub_equipe_membros').delete().eq('sub_equipe_id', sub_id).eq('user_id', user_id)
      if (error) { alert(error.message); return }
      setMembros(prev => prev.filter(m => !(m.sub_equipe_id === sub_id && m.user_id === user_id)))
    } else {
      const { error } = await supabase.from('sub_equipe_membros').insert({ sub_equipe_id: sub_id, user_id })
      if (error) { alert(error.message); return }
      setMembros(prev => [...prev, { sub_equipe_id: sub_id, user_id }])
    }
  }

  if (verificando) return <div style={{padding:40,color:'var(--text-muted)'}}>Carregando…</div>
  if (!autorizado) return <div style={{padding:40,color:'var(--text-muted)'}}>Apenas admin ou líder de equipe pode gerenciar sub-equipes.</div>

  const inp: React.CSSProperties = { padding:'7px 10px', fontSize:12, borderRadius:6, border:'1px solid var(--border)', background:'rgba(0,0,0,0.15)', color:'var(--text)' }

  return (
    <div style={{flex:1,overflow:'auto',padding:'28px 32px'}}>
      <div style={{maxWidth:1100,margin:'0 auto'}}>
        <h1 style={{fontFamily:'DM Serif Display,serif',fontSize:24,marginBottom:6}}>🏆 Sub-equipes (Gamificação)</h1>
        <p style={{fontSize:13,color:'var(--text-muted)',marginBottom:20}}>Crie sub-divisões dentro de cada equipe e atribua membros para competições internas.</p>

        {equipes.map(eq => {
          const subsDestaEquipe = subs.filter(s => s.equipe_id === eq.id)
          const idsEquipe = equipeMembros[eq.id] || []
          const usuariosEquipe = usuarios.filter(u => idsEquipe.includes(u.id))
          return (
            <div key={eq.id} className="card" style={{padding:18,marginBottom:20}}>
              <div style={{fontFamily:'DM Serif Display,serif',fontSize:17,marginBottom:12,color:'var(--gold)'}}>{eq.nome}</div>

              {subsDestaEquipe.length === 0 && (
                <div style={{fontSize:12,color:'var(--text-muted)',marginBottom:10}}>Nenhuma sub-equipe cadastrada.</div>
              )}

              {subsDestaEquipe.map(sub => {
                const idsDoSub = membros.filter(m => m.sub_equipe_id === sub.id).map(m => m.user_id)
                return (
                  <div key={sub.id} style={{padding:12,marginBottom:10,border:'1px solid var(--border)',borderRadius:8,background:'rgba(255,255,255,0.02)'}}>
                    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8,gap:8,flexWrap:'wrap'}}>
                      <div style={{fontSize:14,fontWeight:600}}>⚔️ {sub.nome} <span style={{color:'var(--text-muted)',fontWeight:400}}>({idsDoSub.length} {idsDoSub.length === 1 ? 'membro' : 'membros'})</span></div>
                      <button onClick={() => excluirSub(sub.id)}
                        style={{padding:'4px 10px',fontSize:11,borderRadius:5,border:'1px solid rgba(224,82,82,0.4)',background:'transparent',color:'var(--red)',cursor:'pointer'}}>Excluir sub-equipe</button>
                    </div>
                    <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                      {usuariosEquipe.length === 0 && <span style={{fontSize:11,color:'var(--text-muted)'}}>Sem membros na equipe principal pra escolher.</span>}
                      {usuariosEquipe.map(u => {
                        const sel = idsDoSub.includes(u.id)
                        return (
                          <button key={u.id} onClick={() => toggleMembro(sub.id, u.id)}
                            style={{padding:'5px 10px',fontSize:11,borderRadius:14,cursor:'pointer',border:'1px solid '+(sel?'var(--teal)':'var(--border)'),background:sel?'rgba(28,181,160,0.15)':'transparent',color:sel?'var(--teal)':'var(--text-muted)',fontWeight:sel?700:400}}>
                            {sel ? '✓ ' : '+ '} {u.nome}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}

              <div style={{display:'flex',gap:8,marginTop:8}}>
                <input
                  value={novaSub[eq.id] || ''}
                  onChange={e => setNovaSub(s => ({ ...s, [eq.id]: e.target.value }))}
                  placeholder="Nome da nova sub-equipe"
                  style={{...inp, flex:1}} />
                <button onClick={() => criarSub(eq.id)} className="btn-primary"
                  style={{padding:'7px 14px',fontSize:12,borderRadius:6}}>+ Criar</button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
