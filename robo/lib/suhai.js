// Robô Suhai — landing pública (sem login) tipo http://suhai.link/<id>.
// O link redireciona para suhaiseguradoracotacao.com.br/simulador.html?token=...
// O form é AngularJS multi-etapas:
//   Etapa 1 (visível): tNome, tEmail, tFone → botão "Inicie sua cotação"
//   Etapa 2: CPF, nascimento, gênero, estado civil, placa/veículo, ano, CEP,
//            condutor → botão Continuar / Cotar (#btnCalcular)
// AVISO: a tela tem reCAPTCHA antes do submit final — pode bloquear o robô
// se o site escalar pra v2 visível. Hoje é v3 invisível e geralmente passa.

const log = require('./log')

const URL_DEFAULT = process.env.SUHAI_URL || 'http://suhai.link/rk6s'

// Mapa: chave de entrada (nice name) → seletor real do input/select.
// Names confirmados pelo /debug-suhai rodado em 30/04/2026.
const CAMPOS_ETAPA1 = {
  nome:     'input[name="tNome"]',
  email:    'input[name="tEmail"]',
  telefone: 'input[name="tFone"]',
}

const CAMPOS_ETAPA2 = {
  cpf:           'input[name="tCpf"]',
  nascimento:    'input[name="tDataNascimento"]',
  genero:        'select[name="tGenero"]',
  estado_civil:  'select[name="tEstadoCivil"]',
  utilizacao:    'select[name="tUtilizacao"]',
  tipo_seguro:   'select[name="tTipoSeguro"]',
  bonus:         'select[name="tBonus"]',
  placa:         'input[name="tPlaca"], input.ng-valid-car-plate',
  ano_fabricacao:'select[name="tAnoFabricacao"]',
  ano_modelo:    'select[name="tAnoModelo"]',
  veiculo:       'input[name="tVeiculo"]',
  cep:           'input[name="tCepPernoite"]',
  tipo_condutor: 'select[name="tTipoCondutor"]',
  cpf_condutor:  'input[name="tCpfCondutor"]',
  nome_condutor: 'input[name="tNomeCondutor"]',
  nascimento_condutor: 'input[name="tDataNascimentoCondutor"]',
  genero_condutor:     'select[name="tGeneroCondutor"]',
  estado_civil_condutor: 'select[name="tEstadoCivilCondutor"]',
}

async function preencherInput(page, sel, valor) {
  if (valor === undefined || valor === null || valor === '') return false
  const el = await page.$(sel)
  if (!el) return false
  if (!(await el.isVisible().catch(() => false))) return false
  try {
    await el.click({ delay: 50 })
    await page.fill(sel, '')
    await page.type(sel, String(valor), { delay: 30 })
    // dispara input/change pra AngularJS notar
    await el.evaluate(e => {
      e.dispatchEvent(new Event('input', { bubbles: true }))
      e.dispatchEvent(new Event('change', { bubbles: true }))
      e.blur()
    })
    return true
  } catch (e) {
    log.warn('Falha preencher input', { sel, erro: e.message })
    return false
  }
}

async function selecionarSelect(page, sel, valor) {
  if (valor === undefined || valor === null || valor === '') return false
  const el = await page.$(sel)
  if (!el) return false
  try {
    // Tenta por label (texto visível) primeiro, depois por value
    await page.selectOption(sel, { label: String(valor) }).catch(async () => {
      await page.selectOption(sel, String(valor))
    })
    await el.evaluate(e => e.dispatchEvent(new Event('change', { bubbles: true })))
    return true
  } catch (e) {
    log.warn('Falha selecionar', { sel, valor, erro: e.message })
    return false
  }
}

async function preencherEtapa(page, mapa, dados) {
  for (const [chave, sel] of Object.entries(mapa)) {
    const valor = dados[chave]
    if (valor === undefined) continue
    const tag = sel.startsWith('select') ? 'select' : 'input'
    const ok = tag === 'select'
      ? await selecionarSelect(page, sel, valor)
      : await preencherInput(page, sel, valor)
    log.info(ok ? 'Campo OK' : 'Campo não preenchido', { chave })
  }
}

async function clicar(page, seletores, label) {
  for (const sel of seletores) {
    const el = await page.$(sel)
    if (el && await el.isVisible().catch(() => false) && !(await el.isDisabled().catch(() => false))) {
      await el.click()
      log.info(`Clicou ${label}`, { sel })
      return true
    }
  }
  return false
}

async function cotacao(page, dados = {}, urlCustom) {
  const url = urlCustom || URL_DEFAULT
  log.info('Suhai: abrindo', { url })
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForSelector('input[name="tNome"]', { timeout: 30000 })
  await page.waitForTimeout(1000)

  // Etapa 1
  await preencherEtapa(page, CAMPOS_ETAPA1, dados)
  if (!await clicar(page, ['button:has-text("Inicie sua cotação")', 'button.btn-green'], 'Inicie sua cotação')) {
    throw new Error('Botão "Inicie sua cotação" não encontrado')
  }

  // Espera etapa 2 aparecer
  await page.waitForSelector('input[name="tCpf"]', { state: 'visible', timeout: 20000 }).catch(() => {})
  await page.waitForTimeout(1500)

  // Etapa 2
  await preencherEtapa(page, CAMPOS_ETAPA2, dados)

  // Botão Cotar (#btnCalcular). Pode haver Continuar antes.
  await clicar(page, ['#btnContinuar:visible', 'button:has-text("Continuar"):visible'], 'Continuar').catch(() => {})
  await page.waitForTimeout(1000)
  if (!await clicar(page, ['#btnCalcular', 'button:has-text("Cotar")'], 'Cotar')) {
    throw new Error('Botão "Cotar" não encontrado')
  }

  // Espera resultado (ou erro de validação / reCAPTCHA)
  await page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {})
  await page.waitForTimeout(4000)

  const resultado = await page.evaluate(() => ({
    url: location.href,
    title: document.title,
    texto: document.body.innerText.slice(0, 6000),
  }))
  const matchPreco = resultado.texto.match(/R\$\s*[\d.,]+/g)
  if (matchPreco) resultado.precos = [...new Set(matchPreco)].slice(0, 20)

  const screenshot = await page.screenshot({ fullPage: true })
    .then(b => b.toString('base64')).catch(() => null)
  return { ok: true, ...resultado, screenshot }
}

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
      url: location.href, title: document.title,
      texto: document.body.innerText.slice(0, 2000),
      inputs, buttons, labels,
    }
  })
}

module.exports = { cotacao, debug, URL_DEFAULT }
