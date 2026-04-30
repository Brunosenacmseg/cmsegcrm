// Cliente Supabase (service role) — usado pelo /cotacao-async pra escrever
// o resultado direto no banco quando a cotação termina, sem depender da
// resposta HTTP que pode estourar timeout do Vercel Hobby.

const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = process.env.SUPABASE_URL || ''
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

let _client = null

function get() {
  if (_client) return _client
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return null
  }
  _client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return _client
}

function configurado() {
  return !!(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY)
}

module.exports = { get, configurado }
