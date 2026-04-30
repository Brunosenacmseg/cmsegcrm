// Robô Suhai — landing pública (sem login) tipo http://suhai.link/<id>.
// Preenche o formulário de cotação e captura o resultado/redirect.
//
// Como o link público pode mudar de layout, os seletores tentam casar por
// múltiplas heurísticas: name, id, placeholder, label e tipo.
// Use o endpoint /debug-suhai pra dumpar a estrutura real e calibrar.

const log = require('./log')

const URL_DEFAULT = process.env.SUHAI_URL || 'http://suhai.link/rk6s'

// Mapeia chave lógica → lista de seletores candidatos (CSS).
// Quando o site mudar, basta adicionar novos seletores no array.
const CAMPOS = {
  nome:        ['input[name*="nome" i]', 'input[id*="nome" i]', 'input[placeholder*="nome" i]'],
  cpf:         ['input[name*="cpf" i]', 'input[id*="cpf" i]', 'input[placeholder*="cpf" i]'],
  email:       ['input[type="email"]', 'input[name*="mail" i]', 'input[placeholder*="mail" i]'],
  telefone:    ['input[type="tel"]', 'input[name*="tel" i]', 'input[name*="celular" i]', 'input[placeholder*="telefone" i]', 'input[placeholder*="celular" i]'],
  cep:         ['input[name*="cep" i]', 'input[id*="cep" i]', 'input[placeholder*="cep" i]'],
  placa:       ['input[name*="placa" i]', 'input[id*="placa" i]', 'input[placeholder*="placa" i]'],
  nascimento:  ['input[name*="nasc" i]', 'input[id*="nasc" i]', 'input[placeholder*="nasc" i]', 'input[type="date"]'],
}

async function primeiroSeletor(page, sels) {
  for (const s of sels) {
    const el = await page.$(s)
    if (el && await el.isVisible().catch(() => false)) return s
  }
  return null
}

async function preencher(page, dados) {
  for (const [chave, sels] of Object.entries(CAMPOS)) {
    const valor = dados[chave]
    if (!valor) continue
    const sel = await primeiroSeletor(page, sels)
    if (!sel) {
      log.warn('Campo não encontrado', { chave })
      continue
    }
    try {
      await page.fill(sel, String(valor))
      log.info('Campo preenchido', { chave, sel })
    } catch (e) {
      log.warn('Falha ao preencher', { chave, erro: e.message })
    }
  }
}

async function clicarEnviar(page) {
  const candidatos = [
    'button[type="submit"]',
    'input[type="submit"]',
    'button:has-text("Cotar")',
    'button:has-text("Calcular")',
    'button:has-text("Continuar")',
    'button:has-text("Enviar")',
    'button:has-text("Quero")',
    'a:has-text("Cotar")',
  ]
  for (const sel of candidatos) {
    const el = await page.$(sel)
    if (el && await el.isVisible().catch(() => false)) {
      await el.click()
      log.info('Botão enviar clicado', { sel })
      return sel
    }
  }
  throw new Error('Botão de envio não encontrado')
}

// Cotação pública: abre URL, preenche, envia, captura resultado.
// `dados` aceita: nome, cpf, email, telefone, cep, placa, nascimento.
async function cotacao(page, dados = {}, urlCustom) {
  const url = urlCustom || URL_DEFAULT
  log.info('Suhai: abrindo cotação', { url })
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(2000)

  await preencher(page, dados)
  await clicarEnviar(page)

  // Aguarda resposta — landing geralmente redireciona ou mostra mensagem.
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {})
  await page.waitForTimeout(2500)

  const resultado = await page.evaluate(() => ({
    url: location.href,
    title: document.title,
    texto: document.body.innerText.slice(0, 4000),
  }))

  // Tenta extrair preço se aparecer na tela
  const matchPreco = resultado.texto.match(/R\$\s*[\d.,]+/g)
  if (matchPreco) resultado.precos = matchPreco.slice(0, 10)

  const screenshot = await page.screenshot({ fullPage: true }).then(b => b.toString('base64')).catch(() => null)
  return { ok: true, ...resultado, screenshot }
}

// Captura estrutura da página (pra calibrar seletores).
async function debug(page, urlCustom) {
  const url = urlCustom || URL_DEFAULT
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(2500)
  return await page.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll('input, select, textarea')).map(i => ({
      tag: i.tagName.toLowerCase(),
      type: i.type, name: i.name, id: i.id,
      placeholder: i.placeholder,
      class: (i.className || '').slice(0, 80),
      visible: i.offsetParent !== null,
    }))
    const buttons = Array.from(document.querySelectorAll('button, a[role="button"], input[type="submit"]')).map(b => ({
      tag: b.tagName.toLowerCase(),
      text: (b.innerText || b.textContent || b.value || '').trim().slice(0, 80),
      type: b.type, id: b.id,
      class: (b.className || '').slice(0, 80),
    })).filter(b => b.text)
    const labels = Array.from(document.querySelectorAll('label')).map(l => ({
      text: (l.innerText || '').trim().slice(0, 80), for: l.htmlFor,
    })).filter(l => l.text)
    return {
      url: location.href,
      title: document.title,
      texto: document.body.innerText.slice(0, 2000),
      inputs, buttons, labels,
    }
  })
}

module.exports = { cotacao, debug, URL_DEFAULT }
