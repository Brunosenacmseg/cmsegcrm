// Pool de browser do Playwright.
// Mantém um único Chromium rodando e cria contextos isolados por request.
// Isso reduz o custo de cotação de ~10s (open browser) pra ~2s (open context).

const { chromium } = require('playwright')
const log = require('./log')

let _browser = null
let _starting = null

const HEADLESS         = (process.env.HEADLESS || 'true') !== 'false'
const SLOW_MO          = parseInt(process.env.SLOW_MO || '0')
const KEEP_BROWSER_OPEN = (process.env.KEEP_BROWSER_OPEN || 'true') !== 'false'

async function getBrowser() {
  if (_browser && _browser.isConnected()) return _browser
  if (_starting) return _starting
  _starting = chromium.launch({
    headless: HEADLESS,
    slowMo:   SLOW_MO,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled',
    ],
  }).then(b => {
    _browser = b
    log.info('Browser iniciado (headless=' + HEADLESS + ')')
    b.on('disconnected', () => {
      log.warn('Browser desconectou')
      _browser = null
    })
    return b
  }).catch(err => {
    _starting = null
    throw err
  })
  const b = await _starting
  _starting = null
  return b
}

// Cria um contexto novo (cookies/sessão isolados) e devolve { context, page, close }.
// Se KEEP_BROWSER_OPEN=false, fecha o browser inteiro a cada chamada (modo seguro).
async function newSession(opts = {}) {
  const browser = await getBrowser()
  const context = await browser.newContext({
    viewport: { width: opts.width || 1280, height: opts.height || 900 },
    locale:   'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    userAgent: opts.userAgent,
  })
  const page = await context.newPage()
  page.setDefaultTimeout(parseInt(process.env.TIMEOUT_FIELD || '15000'))
  page.setDefaultNavigationTimeout(parseInt(process.env.TIMEOUT_NAV || '60000'))

  return {
    context, page,
    close: async () => {
      try { await context.close() } catch {}
      if (!KEEP_BROWSER_OPEN) {
        try { await browser.close() } catch {}
        _browser = null
      }
    },
  }
}

async function shutdown() {
  if (_browser) {
    try { await _browser.close() } catch {}
    _browser = null
  }
}

module.exports = { getBrowser, newSession, shutdown }
