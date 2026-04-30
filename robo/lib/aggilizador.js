// Tudo específico ao aggilizador.com.br.
// Centralizado aqui pra ser fácil de ajustar quando o site mudar HTML.

const log = require('./log')

const URL    = process.env.AGGILIZADOR_URL   || 'https://aggilizador.com.br'
const EMAIL  = process.env.AGGILIZADOR_EMAIL || ''
const SENHA  = process.env.AGGILIZADOR_SENHA || ''

if (!EMAIL || !SENHA) {
  log.error('AGGILIZADOR_EMAIL ou AGGILIZADOR_SENHA não configurados no .env')
}

// ─── Login ───────────────────────────────────────────────────────────
async function login(page) {
  log.info('Login no aggilizador', { email: EMAIL })
  await page.goto(URL, { waitUntil: 'domcontentloaded' })

  // Se a home não tem campo de login, tenta as rotas mais comuns
  let emailSel = await primeiroSeletor(page, SELECTORES_EMAIL)
  if (!emailSel) {
    for (const path of ['/login', '/entrar', '/auth/login', '/sign-in']) {
      log.debug('Tentando ' + path)
      await page.goto(URL.replace(/\/$/, '') + path, { waitUntil: 'domcontentloaded' }).catch(() => {})
      emailSel = await primeiroSeletor(page, SELECTORES_EMAIL)
      if (emailSel) break
    }
  }
  // Talvez o login esteja num modal — tentar abrir clicando em "Entrar"
  if (!emailSel) {
    for (const sel of ['button:has-text("Entrar")', 'a:has-text("Entrar")', 'button:has-text("Login")', 'a:has-text("Login")']) {
      const btn = await page.$(sel).catch(() => null)
      if (btn) { await btn.click().catch(() => {}); await page.waitForTimeout(800); break }
    }
    emailSel = await primeiroSeletor(page, SELECTORES_EMAIL)
  }

  if (!emailSel) throw new Error('Campo de email não encontrado na tela de login')
  await page.fill(emailSel, EMAIL)

  const senhaSel = await primeiroSeletor(page, SELECTORES_SENHA)
  if (!senhaSel) throw new Error('Campo de senha não encontrado')
  await page.fill(senhaSel, SENHA)

  // Botão de submit
  const btn = await primeiroSeletor(page, [
    'button[type="submit"]',
    'button:has-text("Entrar")',
    'button:has-text("Login")',
    'button:has-text("Acessar")',
    'input[type="submit"]',
  ])
  if (btn) await page.click(btn)

  // Espera redirecionamento ou erro
  await Promise.race([
    page.waitForURL(u => !/\/(login|entrar|sign-in|auth)/i.test(u.toString()), { timeout: 30000 }).catch(() => null),
    page.waitForTimeout(8000),
  ])

  // Detecta erro de login: ainda na mesma URL ou mensagem visível
  if (/\/(login|entrar|sign-in|auth)/i.test(page.url())) {
    const err = await page.locator('text=/inválid|incorret|erro|senha/i').first().textContent().catch(() => '')
    throw new Error('Login falhou' + (err ? ': ' + err.trim() : ''))
  }

  log.info('Login OK', { url: page.url() })
}

// Lista expandida de seletores comuns para email/usuário em apps brasileiros
const SELECTORES_EMAIL = [
  'input[type="email"]',
  'input[name="email"]',
  'input[id="email"]',
  '#email',
  'input[autocomplete="username"]',
  'input[autocomplete="email"]',
  'input[name="usuario"]',
  'input[name="user"]',
  'input[name="login"]',
  'input[id="usuario"]',
  'input[id="login"]',
  'input[id="username"]',
  'input[name="username"]',
  'input[placeholder*="mail" i]',
  'input[placeholder*="usuário" i]',
  'input[placeholder*="usuario" i]',
  'input[placeholder*="login" i]',
  'input[data-testid*="email" i]',
  'input[data-testid*="login" i]',
  'input[data-testid*="user" i]',
]

const SELECTORES_SENHA = [
  'input[type="password"]',
  'input[name="password"]',
  'input[name="senha"]',
  'input[id="password"]',
  'input[id="senha"]',
  '#password',
  '#senha',
  'input[autocomplete="current-password"]',
  'input[autocomplete="password"]',
  'input[placeholder*="senha" i]',
  'input[placeholder*="password" i]',
  'input[data-testid*="senha" i]',
  'input[data-testid*="password" i]',
]

// ─── Navegação para cotação de auto ──────────────────────────────────
async function abrirCotacaoAuto(page) {
  const url = `${URL.replace(/\/$/, '')}/cotacoes/novo/auto`
  log.info('Abrindo cotação auto', { url })
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {})
}

// ─── Helpers genéricos de preenchimento ──────────────────────────────

// Procura o primeiro seletor que existe na página, devolve o seletor (ou null).
async function primeiroSeletor(page, seletores) {
  for (const sel of seletores) {
    try {
      const el = await page.$(sel)
      if (el) return sel
    } catch {}
  }
  return null
}

// Preenche pelo primeiro nome encontrado. Devolve true se conseguiu preencher.
async function preencher(page, nomes, valor) {
  if (valor === undefined || valor === null || valor === '') return false
  const candidatos = []
  for (const n of nomes) {
    candidatos.push(`input[name="${n}"]`)
    candidatos.push(`input[id="${n}"]`)
    candidatos.push(`input[data-field="${n}"]`)
    candidatos.push(`input[name*="${n}" i]`)
  }
  const sel = await primeiroSeletor(page, candidatos)
  if (!sel) {
    log.debug('Campo não encontrado', { nomes })
    return false
  }
  try {
    await page.fill(sel, '')
    await page.fill(sel, String(valor))
    return true
  } catch (err) {
    log.warn('Falha ao preencher', { sel, erro: err.message })
    return false
  }
}

// Lê o valor atual de um input (depois que o aggilizador auto-preencheu)
async function lerCampo(page, nomes) {
  const candidatos = []
  for (const n of nomes) {
    candidatos.push(`input[name="${n}"]`)
    candidatos.push(`input[id="${n}"]`)
    candidatos.push(`input[name*="${n}" i]`)
    candidatos.push(`select[name="${n}"]`)
    candidatos.push(`select[id="${n}"]`)
  }
  const sel = await primeiroSeletor(page, candidatos)
  if (!sel) return null
  try {
    return await page.inputValue(sel)
  } catch { return null }
}

// Seleciona opção de um <select>. Tenta por label, depois por value, depois
// por correspondência parcial (texto contém).
async function selecionar(page, nomes, valor) {
  if (valor === undefined || valor === null || valor === '') return false
  const candidatos = []
  for (const n of nomes) {
    candidatos.push(`select[name="${n}"]`)
    candidatos.push(`select[id="${n}"]`)
    candidatos.push(`select[name*="${n}" i]`)
  }
  const sel = await primeiroSeletor(page, candidatos)
  if (!sel) return false
  const v = String(valor)
  try { await page.selectOption(sel, { label: v }); return true } catch {}
  try { await page.selectOption(sel, { value: v }); return true } catch {}
  // Fallback: procura option com texto contendo o valor
  try {
    const handle = await page.$(sel)
    if (handle) {
      const opts = await handle.evaluate(s => Array.from(s.options).map(o => ({ value: o.value, text: o.text })))
      const match = opts.find(o => o.text.toLowerCase().includes(v.toLowerCase()))
      if (match) { await page.selectOption(sel, { value: match.value }); return true }
    }
  } catch {}
  log.warn('Não consegui selecionar opção', { sel, valor: v })
  return false
}

async function clicarProximo(page) {
  const btns = [
    'button:has-text("Próximo")',
    'button:has-text("Continuar")',
    'button:has-text("Avançar")',
    'button[type="submit"]:not(:has-text("Calcular")):not(:has-text("Cotar"))',
  ]
  for (const sel of btns) {
    const el = await page.$(sel).catch(() => null)
    if (el) {
      await el.click()
      await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {})
      return true
    }
  }
  return false
}

async function clicarCalcular(page) {
  const btns = [
    'button:has-text("Calcular")',
    'button:has-text("Cotar")',
    'button:has-text("Finalizar")',
    'button[type="submit"]',
  ]
  for (const sel of btns) {
    const el = await page.$(sel).catch(() => null)
    if (el) { await el.click(); return true }
  }
  return false
}

// Tenta extrair preço/parcelas/seguradora da tela de resultado em formato JSON.
// Heurística: pega blocos com "R$", "parcela", "seguradora". Sempre devolve algo,
// mesmo que parcial — o screenshot é o backup oficial.
async function extrairResultado(page) {
  try {
    return await page.evaluate(() => {
      const txt = document.body.innerText
      const linhas = txt.split('\n').map(s => s.trim()).filter(Boolean)
      const precos = []
      const seguradoras = []
      const REGEX_VALOR = /R\$\s*([\d.]+,\d{2})/g
      let m
      while ((m = REGEX_VALOR.exec(txt)) !== null) precos.push(m[1])

      // Detectar seguradoras conhecidas no texto
      const NOMES = ['Porto Seguro','Bradesco','Allianz','HDI','Tokio','Azul','Sompo','Liberty','Itaú','Mapfre','Sul América','Generali','Yelum']
      for (const n of NOMES) if (txt.includes(n) && !seguradoras.includes(n)) seguradoras.push(n)

      const parcelaMatch = txt.match(/(\d+)\s*x\s*de\s*R\$\s*([\d.]+,\d{2})/i)

      return {
        precos_encontrados: precos.slice(0, 10),
        seguradoras_encontradas: seguradoras,
        parcelamento: parcelaMatch ? `${parcelaMatch[1]}x de R$ ${parcelaMatch[2]}` : null,
        primeiras_linhas: linhas.slice(0, 30),
      }
    })
  } catch (err) {
    log.warn('Falha ao extrair resultado', { erro: err.message })
    return null
  }
}

module.exports = {
  URL, login, abrirCotacaoAuto,
  preencher, selecionar, lerCampo,
  clicarProximo, clicarCalcular, extrairResultado,
  primeiroSeletor,
}
