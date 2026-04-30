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

// DEBUG: abre a página inicial do aggilizador e devolve a estrutura dos
// campos de input/button pra ajudar a ajustar seletores quando o site mudar.
app.post('/debug-login', async (req, res) => {
  let session = null
  try {
    session = await browser.newSession()
    const page = session.page
    const URL = process.env.AGGILIZADOR_URL || 'https://aggilizador.com.br'

    const visitas = [URL, URL + '/login', URL + '/entrar', URL + '/auth/login']
    const resultados = []

    for (const u of visitas) {
      try {
        await page.goto(u, { waitUntil: 'domcontentloaded', timeout: 20000 })
        await page.waitForTimeout(1500)
        const info = await page.evaluate(() => {
          const inputs = Array.from(document.querySelectorAll('input')).map(i => ({
            type: i.type, name: i.name, id: i.id,
            placeholder: i.placeholder, autocomplete: i.autocomplete,
            class: (i.className || '').slice(0, 80),
            visible: i.offsetParent !== null,
          }))
          const buttons = Array.from(document.querySelectorAll('button, a[role="button"]')).map(b => ({
            type: b.type || 'button',
            text: (b.innerText || b.textContent || '').trim().slice(0, 60),
            id: b.id, class: (b.className || '').slice(0, 80),
            visible: b.offsetParent !== null,
          })).filter(b => b.text || b.id)
          const forms = Array.from(document.querySelectorAll('form')).map(f => ({
            action: f.action, method: f.method, id: f.id,
          }))
          return { url: location.href, title: document.title, inputs, buttons: buttons.slice(0, 20), forms }
        })
        resultados.push({ tentou: u, ...info })
      } catch (err) {
        resultados.push({ tentou: u, erro: err.message })
      }
    }

    res.json({ ok: true, resultados })
  } catch (err) {
    log.error('Erro em /debug-login', { erro: err.message })
    res.status(500).json({ ok: false, erro: err.message })
  } finally {
    if (session) await session.close()
  }
})

// DEBUG: faz login e abre a tela de cotação, devolve estrutura dos campos.
// Usado pra mapear seletores corretos quando o site mudar.
app.post('/debug-cotacao', async (req, res) => {
  let session = null
  try {
    session = await browser.newSession()
    const page = session.page
    const ag   = require('./lib/aggilizador')

    await ag.login(page)
    await ag.abrirCotacaoAuto(page)
    await page.waitForTimeout(3000)  // dá tempo do Angular renderizar

    const info = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input')).map(i => ({
        type: i.type, name: i.name, id: i.id,
        placeholder: i.placeholder,
        formcontrolname: i.getAttribute('formcontrolname'),
        class: (i.className || '').slice(0, 100),
        visible: i.offsetParent !== null,
      })).filter(i => i.visible)
      const selects = Array.from(document.querySelectorAll('select, mat-select')).map(s => ({
        tag: s.tagName.toLowerCase(),
        name: s.name || s.getAttribute('formcontrolname'),
        id: s.id, class: (s.className || '').slice(0, 100),
      }))
      const labels = Array.from(document.querySelectorAll('label, mat-label')).map(l => ({
        text: (l.innerText || l.textContent || '').trim().slice(0, 60),
        for:  l.htmlFor,
      })).filter(l => l.text)
      const buttons = Array.from(document.querySelectorAll('button')).map(b => ({
        text: (b.innerText || b.textContent || '').trim().slice(0, 60),
        type: b.type, id: b.id,
        class: (b.className || '').slice(0, 100),
      })).filter(b => b.text)
      return { url: location.href, title: document.title, inputs, selects, labels, buttons: buttons.slice(0, 30) }
    })

    res.json({ ok: true, ...info })
  } catch (err) {
    log.error('Erro em /debug-cotacao', { erro: err.message })
    let screenshotPath = null
    let pageInfo = null
    if (session) {
      try {
        const dir = process.env.LOG_DIR || './logs'
        fs.mkdirSync(dir, { recursive: true })
        screenshotPath = path.join(dir, `debug-cotacao-${Date.now()}.png`)
        await session.page.screenshot({ path: screenshotPath, fullPage: true })
        // Captura estrutura da página atual (mesmo se não chegou em /cotacoes)
        pageInfo = await session.page.evaluate(() => ({
          url: location.href,
          title: document.title,
          texto_visivel: document.body.innerText.slice(0, 800),
          inputs: Array.from(document.querySelectorAll('input')).slice(0, 15).map(i => ({
            type: i.type, id: i.id, name: i.name,
            visible: i.offsetParent !== null,
          })),
        })).catch(() => null)
      } catch {}
    }
    res.status(500).json({
      ok: false, erro: err.message,
      screenshot_path: screenshotPath,
      page_info: pageInfo,
    })
  } finally {
    if (session) {
      const ag = require('./lib/aggilizador')
      try { await ag.logout(session.page) } catch {}
      await session.close()
    }
  }
})

// Consulta rápida por CPF (usado pelo CRM para auto-preencher cotação)
app.post('/consultar-cpf', async (req, res) => {
  const { cpf } = req.body || {}
  const cpfLimpo = String(cpf || '').replace(/\D/g, '')
  if (cpfLimpo.length !== 11) return res.status(400).json({ ok: false, erro: 'CPF inválido' })

  let session = null
  const ag = require('./lib/aggilizador')
  try {
    session = await browser.newSession()
    const r = await consulta.consultarCpf(session.page, cpfLimpo)
    res.json({ ok: true, ...r })
  } catch (err) {
    log.error('Erro em /consultar-cpf', { erro: err.message })
    if (session) await salvarErroScreenshot(session.page, 'consulta')
    res.status(500).json({ ok: false, erro: err.message })
  } finally {
    if (session) {
      try { await ag.logout(session.page) } catch {}
      await session.close()
    }
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
  const ag = require('./lib/aggilizador')
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
    if (session) {
      try { await ag.logout(session.page) } catch {}
      await session.close()
    }
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
