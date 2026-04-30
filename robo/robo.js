// Robô de cotação — CM.segCRM v2.0
// Endpoints expostos:
//   GET  /health           — status do robô
//   POST /                 — (compat antigo) cotação completa, screenshot
//   POST /cotacao          — alias de POST /
//   POST /consultar-cpf    — preenche CPF e captura auto-preenchimento
//   POST /screenshot       — debug: tira foto da última página

require('dotenv').config()

const express  = require('express')
const fs       = require('fs')
const path     = require('path')
const log      = require('./lib/log')
const browser  = require('./lib/browser')
const consulta = require('./lib/consulta')
const cotacao  = require('./lib/cotacao')

const app  = express()
const PORT = parseInt(process.env.PORT || '3001')
const HOST = process.env.HOST || '0.0.0.0'
const ROBO_TOKEN = process.env.ROBO_TOKEN || ''

app.use(express.json({ limit: '10mb' }))

// Middleware de autenticação opcional. Se ROBO_TOKEN estiver setado,
// rejeita requests sem o header `x-robo-token` correspondente.
app.use((req, res, next) => {
  if (!ROBO_TOKEN) return next()
  if (req.path === '/health') return next()
  if (req.headers['x-robo-token'] === ROBO_TOKEN) return next()
  res.status(401).json({ ok: false, erro: 'token inválido' })
})

// Salva screenshot de erro pra debug posterior
async function salvarErroScreenshot(page, prefixo) {
  try {
    const dir = process.env.LOG_DIR || './logs'
    fs.mkdirSync(dir, { recursive: true })
    const file = path.join(dir, `erro-${prefixo}-${Date.now()}.png`)
    await page.screenshot({ path: file, fullPage: true })
    log.info('Screenshot de erro salvo', { file })
    return file
  } catch { return null }
}

// ─── Rotas ───────────────────────────────────────────────────────────

app.get('/health', (req, res) => {
  res.json({
    ok: true,
    versao: '2.0.0',
    porta: PORT,
    headless: (process.env.HEADLESS || 'true') !== 'false',
    aggilizador: process.env.AGGILIZADOR_URL || 'https://aggilizador.com.br',
    credenciais_configuradas: !!(process.env.AGGILIZADOR_EMAIL && process.env.AGGILIZADOR_SENHA),
    token_obrigatorio: !!ROBO_TOKEN,
  })
})

// Consulta rápida por CPF (usado pelo CRM para auto-preencher cotação)
app.post('/consultar-cpf', async (req, res) => {
  const { cpf } = req.body || {}
  const cpfLimpo = String(cpf || '').replace(/\D/g, '')
  if (cpfLimpo.length !== 11) return res.status(400).json({ ok: false, erro: 'CPF inválido' })

  let session = null
  try {
    session = await browser.newSession()
    const r = await consulta.consultarCpf(session.page, cpfLimpo)
    res.json({ ok: true, ...r })
  } catch (err) {
    log.error('Erro em /consultar-cpf', { erro: err.message })
    if (session) await salvarErroScreenshot(session.page, 'consulta')
    res.status(500).json({ ok: false, erro: err.message })
  } finally {
    if (session) await session.close()
  }
})

// Cotação completa de auto
app.post(['/','/cotacao'], async (req, res) => {
  const { produto, dados } = req.body || {}
  if (!dados) return res.status(400).json({ ok: false, erro: 'Dados obrigatórios' })

  if (produto && produto !== 'carro' && produto !== 'auto') {
    return res.status(400).json({ ok: false, erro: `Produto '${produto}' não suportado` })
  }

  let session = null
  try {
    session = await browser.newSession()
    const r = await cotacao.cotacaoAuto(session.page, dados)
    res.json(r)
  } catch (err) {
    log.error('Erro em /cotacao', { erro: err.message })
    let screenshotErro = null
    if (session) screenshotErro = await salvarErroScreenshot(session.page, 'cotacao')
    res.status(500).json({ ok: false, erro: err.message, screenshot_erro: screenshotErro })
  } finally {
    if (session) await session.close()
  }
})

// ─── Inicialização ───────────────────────────────────────────────────

const server = app.listen(PORT, HOST, () => {
  log.info(`🤖 Robô v2.0.0 rodando em http://${HOST}:${PORT}`)
})

async function shutdown(signal) {
  log.info(`Recebido ${signal}, fechando...`)
  server.close()
  await browser.shutdown()
  process.exit(0)
}
process.on('SIGINT',  () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('uncaughtException', err => log.error('uncaughtException', { erro: err.message, stack: err.stack }))
process.on('unhandledRejection', err => log.error('unhandledRejection', { erro: String(err) }))
