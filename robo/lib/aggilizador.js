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
// O aggilizador usa Angular Material. A home redireciona para /login automaticamente,
// e os inputs (mat-mdc-input-element) só aparecem após o Angular renderizar.
async function login(page) {
  log.info('Login no aggilizador', { email: EMAIL })
  await page.goto(URL, { waitUntil: 'domcontentloaded' })

  // CRUCIAL: esperar o Angular renderizar os campos.
  // A página tem `input[type="email"]` e `input[type="password"]` no formulário de login.
  try {
    await page.waitForSelector('input[type="email"], input[type="password"]', {
      state: 'visible', timeout: 20000,
    })
  } catch {
    throw new Error('Página de login não carregou (Angular não renderizou em 20s)')
  }

  const emailSel = await primeiroSeletor(page, SELECTORES_EMAIL)
  if (!emailSel) throw new Error('Campo de email não encontrado na tela de login')
  await page.fill(emailSel, EMAIL)

  const senhaSel = await primeiroSeletor(page, SELECTORES_SENHA)
  if (!senhaSel) throw new Error('Campo de senha não encontrado')
  await page.fill(senhaSel, SENHA)

  // Aggilizador tem 3 botões submit: "Entrar", "Novo por aqui? Teste grátis",
  // "Central do cliente". Por isso usamos a classe específica do botão de login.
  const btnSel = await primeiroSeletor(page, [
    'button.login__btn-login',
    'button.mat-mdc-raised-button:has-text("Entrar")',
    'button:has-text("Entrar"):not(:has-text("grátis")):not(:has-text("aqui"))',
  ])
  if (!btnSel) throw new Error('Botão Entrar não encontrado')
  await page.click(btnSel)

  // CASO ESPECIAL — sessão duplicada:
  // Quando o aggilizador detecta uma sessão ativa do mesmo usuário, ele abre
  // um modal "Já há uma sessão ativa... Cancelar / Prosseguir". Se isso
  // aparecer, clicamos em "Prosseguir" pra encerrar a sessão antiga e seguir.
  try {
    const modalSel = 'button:has-text("Prosseguir"), button:has-text("prosseguir")'
    await page.waitForSelector(modalSel, { state: 'visible', timeout: 5000 })
    log.info('Modal de sessão duplicada detectado — clicando em Prosseguir')
    await page.click(modalSel)
  } catch {
    // Sem modal — login direto, prosseguir normalmente
  }

  // Espera sair da tela de login (o aggilizador redireciona pra /cotacoes)
  try {
    await page.waitForURL(u => !u.toString().includes('/login'), { timeout: 30000 })
  } catch {
    // Se ainda na tela de login, lê a mensagem de erro do Angular
    const err = await page.locator('mat-error, .login__form-field--error, text=/inválid|incorret|erro|senha/i').first().textContent().catch(() => '')
    throw new Error('Login falhou' + (err ? ': ' + err.trim() : ' (sem redirect em 30s)'))
  }

  log.info('Login OK', { url: page.url() })
}

// Logout: clica no menu do usuário e em Sair, pra encerrar a sessão antes de
// fechar o browser. Evita o aviso "sessão duplicada" na próxima execução.
// Se algo falhar, ignora silenciosamente — não é crítico.
async function logout(page) {
  try {
    // Tenta achar botão/avatar do usuário ou direto Sair
    const candidatos = [
      'button:has-text("Sair")',
      'a:has-text("Sair")',
      'button:has-text("Logout")',
      '[aria-label*="usuário" i]',
      '[aria-label*="user" i]',
      '.user-menu',
      '.avatar',
    ]
    for (const sel of candidatos) {
      const el = await page.$(sel).catch(() => null)
      if (el) {
        await el.click().catch(() => {})
        await page.waitForTimeout(500)
      }
    }
    // Após abrir o menu, tenta clicar Sair
    const sair = await page.$('button:has-text("Sair"), a:has-text("Sair")').catch(() => null)
    if (sair) await sair.click().catch(() => {})
    await page.waitForTimeout(1500)
    log.debug('Logout tentado')
  } catch {}
}

// Seletores priorizando os do aggilizador (Angular Material) primeiro,
// depois fallbacks para outros sites.
const SELECTORES_EMAIL = [
  'input.login__form-field--input[type="email"]',  // específico do aggilizador
  '#mat-input-0',                                   // primeiro mat-input da página de login
  'input[type="email"]',
  'input[name="email"]',
  'input[id="email"]',
  '#email',
  'input[autocomplete="username"]',
  'input[autocomplete="email"]',
  'input[name="usuario"]',
  'input[name="login"]',
  'input[placeholder*="mail" i]',
  'input[placeholder*="usuário" i]',
]

const SELECTORES_SENHA = [
  'input.login__form-field--input[type="password"]', // específico do aggilizador
  '#mat-input-1',
  'input[type="password"]',
  'input[name="password"]',
  'input[name="senha"]',
  'input[id="password"]',
  '#password',
  '#senha',
  'input[autocomplete="current-password"]',
  'input[placeholder*="senha" i]',
]

// ─── Navegação para cotação de auto ──────────────────────────────────
// Após login, o aggilizador vai pra /cotacoes (lista). Pra criar nova,
// precisa clicar em "Nova Cotação", que abre um wizard pra escolher o
// tipo (Automóvel, Vida, etc). Em seguida selecionamos Automóvel.
async function abrirCotacaoAuto(page) {
  log.info('Abrindo nova cotação de auto')

  // 1) Garante que estamos na lista de cotações
  if (!page.url().includes('/cotacoes')) {
    await page.goto(`${URL.replace(/\/$/, '')}/cotacoes`, { waitUntil: 'domcontentloaded' })
  }
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(2000)

  // Aggilizador mostra popups ("Conheça o novo ramo saúde", "Comunicados",
  // banner de extensão). Eles ficam num cdk-overlay-backdrop que intercepta
  // cliques. Precisa fechar antes de tentar interagir.
  await dismissarOverlays(page)

  // 2) Clica em "Nova Cotação" usando o data-testid estável
  const btnNova = await primeiroSeletor(page, [
    '[data-testid="btn_nova-cotacao"]',
    'button[touranchor="nova-cotacao-btn"]',
    'button:has-text("Nova Cotação")',
    'button.wrapper-trigger',
  ])
  if (!btnNova) throw new Error('Botão "Nova Cotação" não encontrado')

  try {
    await page.click(btnNova, { timeout: 5000 })
  } catch (err) {
    // Provavelmente um overlay surgiu. Tenta fechar e clicar com force.
    log.warn('Click bloqueado, tentando fechar overlays e forçar', { erro: err.message })
    await dismissarOverlays(page)
    await page.click(btnNova, { force: true, timeout: 10000 })
  }
  await page.waitForTimeout(2000)

  // 3) Wizard abre com categorias e produtos. Estrutura observada:
  //    Automóvel
  //      → Carro     ← é onde clicamos pra cotação de auto
  //      → Caminhão
  //      → Motocicleta
  //    Compreensivos / Vida / Diversos / Saúde
  //
  // Os itens são divs/links sem name específico. Usamos getByText com
  // exact match pra acertar o "Carro" certo.
  await page.waitForTimeout(800)

  let clicouCarro = false
  try {
    const opcaoCarro = page.getByText('Carro', { exact: true }).first()
    await opcaoCarro.waitFor({ state: 'visible', timeout: 8000 })
    await opcaoCarro.click({ force: true })
    clicouCarro = true
    log.info('Clicou em "Carro"')
  } catch {
    // Talvez precise expandir "Automóvel" primeiro
    log.warn('Não achei "Carro" direto, tentando expandir "Automóvel"')
    try {
      await page.getByText('Automóvel', { exact: true }).first().click({ force: true })
      await page.waitForTimeout(800)
      await page.getByText('Carro', { exact: true }).first().click({ force: true })
      clicouCarro = true
    } catch (err) {
      throw new Error('Não consegui chegar no produto "Carro" do wizard: ' + err.message)
    }
  }

  if (!clicouCarro) throw new Error('Não consegui selecionar "Carro" no wizard')

  await page.waitForTimeout(2500)
  await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {})
  await page.waitForTimeout(1500)
}

// Fecha qualquer popup/modal/overlay que possa estar bloqueando interações.
// Estratégia: ESC + clicar em botões de fechar + clicar no backdrop.
async function dismissarOverlays(page) {
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    let agiu = false

    // ESC fecha modais Material por padrão
    await page.keyboard.press('Escape').catch(() => {})
    await page.waitForTimeout(200)

    // Botões com texto "close" ou X visíveis dentro de overlays
    const closes = await page.$$('.cdk-overlay-container button, .cdk-overlay-container [role="button"]').catch(() => [])
    for (const el of closes) {
      const txt = await el.textContent().catch(() => '')
      const aria = await el.getAttribute('aria-label').catch(() => '')
      if (/close|fechar|x/i.test((txt || '') + (aria || ''))) {
        await el.click({ force: true }).catch(() => {})
        agiu = true
        await page.waitForTimeout(200)
      }
    }

    // Banner "Comunicados" tem botão "Marcar como visto"
    const ok = await page.$('button:has-text("Marcar como visto"), button:has-text("Entendi")').catch(() => null)
    if (ok) {
      await ok.click({ force: true }).catch(() => {})
      agiu = true
      await page.waitForTimeout(200)
    }

    // Clica no backdrop pra fechar (último recurso)
    const backdrop = await page.$('.cdk-overlay-backdrop-showing').catch(() => null)
    if (backdrop) {
      await backdrop.click({ force: true, position: { x: 5, y: 5 } }).catch(() => {})
      agiu = true
      await page.waitForTimeout(200)
    }

    if (!agiu) break
  }
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
// Aggilizador usa Angular Material com `formcontrolname` ou `name` no input.
async function preencher(page, nomes, valor) {
  if (valor === undefined || valor === null || valor === '') return false
  const candidatos = []
  for (const n of nomes) {
    candidatos.push(`input[formcontrolname="${n}"]`)
    candidatos.push(`input[name="${n}"]`)
    candidatos.push(`input[id="${n}"]`)
  }
  const sel = await primeiroSeletor(page, candidatos)
  if (!sel) {
    log.debug('Campo não encontrado', { nomes })
    return false
  }
  try {
    await page.fill(sel, '')
    await page.fill(sel, String(valor))
    // Disparar blur pra Angular reagir e validar
    await page.locator(sel).first().blur().catch(() => {})
    return true
  } catch (err) {
    log.warn('Falha ao preencher', { sel, erro: err.message })
    return false
  }
}

// Lê o valor atual de um input (depois que o aggilizador auto-preencheu).
async function lerCampo(page, nomes) {
  const candidatos = []
  for (const n of nomes) {
    candidatos.push(`input[formcontrolname="${n}"]`)
    candidatos.push(`input[name="${n}"]`)
    candidatos.push(`input[id="${n}"]`)
  }
  const sel = await primeiroSeletor(page, candidatos)
  if (!sel) return null
  try {
    return await page.inputValue(sel)
  } catch { return null }
}

// Lê o valor exibido em um mat-select (Angular Material).
// O valor real fica no <span class="mat-mdc-select-value-text"> dentro do trigger.
async function lerMatSelect(page, nomes) {
  for (const n of nomes) {
    const sel = `mat-select[name="${n}"] .mat-mdc-select-value-text, mat-select[formcontrolname="${n}"] .mat-mdc-select-value-text`
    try {
      const el = await page.$(sel)
      if (el) {
        const txt = await el.textContent()
        if (txt && txt.trim()) return txt.trim()
      }
    } catch {}
  }
  return null
}

// Selecionar opção em <select> nativo OU em mat-select (Angular Material).
// O aggilizador usa só mat-select, mas mantemos suporte ao <select> pra
// compatibilidade com outros sites.
async function selecionar(page, nomes, valor) {
  if (valor === undefined || valor === null || valor === '') return false
  const v = String(valor).trim()
  const vLower = v.toLowerCase()

  // 1) Tenta como <select> nativo
  const candidatosNativo = []
  for (const n of nomes) {
    candidatosNativo.push(`select[name="${n}"]`)
    candidatosNativo.push(`select[id="${n}"]`)
  }
  const selNativo = await primeiroSeletor(page, candidatosNativo)
  if (selNativo) {
    try { await page.selectOption(selNativo, { label: v }); return true } catch {}
    try { await page.selectOption(selNativo, { value: v }); return true } catch {}
  }

  // 2) Tenta como mat-select (Angular Material)
  const candidatosMat = []
  for (const n of nomes) {
    candidatosMat.push(`mat-select[name="${n}"]`)
    candidatosMat.push(`mat-select[id="${n}"]`)
    candidatosMat.push(`mat-select[formcontrolname="${n}"]`)
    candidatosMat.push(`[formcontrolname="${n}"] mat-select`)
  }
  const selMat = await primeiroSeletor(page, candidatosMat)
  if (!selMat) {
    log.debug('Select não encontrado', { nomes, valor: v })
    return false
  }

  try {
    // Garante que nenhum dropdown anterior tem o backdrop aberto
    // (se tiver, o cdk-overlay-backdrop intercepta os próximos cliques).
    await page.evaluate(() => {
      // Click no backdrop dispensa qualquer overlay aberto
      const backs = document.querySelectorAll('.cdk-overlay-backdrop')
      backs.forEach(b => { try { b.click() } catch (e) {} })
    }).catch(() => {})
    await page.keyboard.press('Escape').catch(() => {})
    await page.waitForTimeout(250)

    // Abre o mat-select disparando .click() direto no DOM —
    // assim o Playwright não bloqueia por causa do backdrop ainda visível.
    const abriu = await page.evaluate((sel) => {
      const el = document.querySelector(sel)
      if (!el) return false
      // Scroll pra trazer pra perto do meio da tela
      el.scrollIntoView({ block: 'center', behavior: 'instant' })
      el.click()
      return true
    }, selMat)
    if (!abriu) { log.warn('mat-select não abriu', { nomes }); return false }

    await page.waitForSelector('mat-option, .mat-mdc-option', { timeout: 5000 })
    // Lista as opções e tenta achar match
    const opcoes = await page.$$('mat-option, .mat-mdc-option')
    let clicou = false
    for (const opt of opcoes) {
      const txt = (await opt.textContent().catch(() => '') || '').trim()
      const txtLower = txt.toLowerCase()
      if (txtLower === vLower) {
        await opt.evaluate(el => el.click()).catch(() => {})
        clicou = true; break
      }
    }
    // Se não achou exato, tenta contém
    if (!clicou) {
      for (const opt of opcoes) {
        const txt = (await opt.textContent().catch(() => '') || '').trim()
        const txtLower = txt.toLowerCase()
        if (txtLower.includes(vLower) || vLower.includes(txtLower)) {
          await opt.evaluate(el => el.click()).catch(() => {})
          clicou = true; break
        }
      }
    }
    if (!clicou) {
      // Fecha o dropdown
      await page.keyboard.press('Escape').catch(() => {})
      log.warn('Opção não encontrada no mat-select', { nomes, valor: v })
      return false
    }
    await page.waitForTimeout(350)
    return true
  } catch (err) {
    log.warn('Erro ao selecionar mat-select', { nomes, erro: err.message })
    await page.keyboard.press('Escape').catch(() => {})
    return false
  }
}

// Seleciona o n-ésimo mat-select que match um nome (útil quando há
// vários mat-select com o mesmo `name`, ex: sexo do segurado e do condutor).
async function selecionarPorIndex(page, name, index, valor) {
  if (valor === undefined || valor === null || valor === '') return false
  const v = String(valor).trim()
  const vLower = v.toLowerCase()

  const matches = await page.$$(`mat-select[name="${name}"]`)
  if (matches.length <= index) {
    log.debug('mat-select index fora do range', { name, index, total: matches.length })
    return false
  }
  try {
    await matches[index].click({ timeout: 5000 })
    await page.waitForSelector('mat-option, .mat-mdc-option', { timeout: 5000 })
    const opcoes = await page.$$('mat-option, .mat-mdc-option')
    for (const opt of opcoes) {
      const txt = (await opt.textContent().catch(() => '') || '').trim().toLowerCase()
      if (txt === vLower || txt.includes(vLower) || vLower.includes(txt)) {
        await opt.click({ force: true }).catch(() => {})
        await page.waitForTimeout(300)
        return true
      }
    }
    await page.keyboard.press('Escape').catch(() => {})
  } catch (err) {
    log.warn('Erro selecionarPorIndex', { name, erro: err.message })
    await page.keyboard.press('Escape').catch(() => {})
  }
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

// Verifica se o formulário tem erros de validação ou campos obrigatórios vazios.
// Retorna { ok, problemas: [{ campo, motivo, valor }] }.
// Heurística baseada em Angular Material (mat-form-field-invalid, mat-error,
// ng-invalid, aria-invalid). Sempre devolve algo — se não encontrar, ok=true.
async function verificarErrosFormulario(page) {
  try {
    return await page.evaluate(() => {
      const problemas = []
      const norm = (s) => (s || '').toString().trim().replace(/\s+/g, ' ')

      // Função pra achar o "label" do campo: matFormField label, label[for],
      // placeholder, ou label visível mais próximo
      function rotuloDoCampo(el) {
        // 1) Sobe até o mat-form-field e pega o mat-label
        const mff = el.closest('mat-form-field, .mat-form-field, .mat-mdc-form-field')
        if (mff) {
          const lbl = mff.querySelector('mat-label, .mat-mdc-floating-label, .mat-form-field-label')
          if (lbl && lbl.innerText) return norm(lbl.innerText)
        }
        // 2) label[for=id]
        if (el.id) {
          const lblFor = document.querySelector(`label[for="${el.id}"]`)
          if (lblFor) return norm(lblFor.innerText)
        }
        // 3) placeholder ou aria-label
        return norm(el.getAttribute('aria-label') || el.placeholder || el.name || el.id || el.tagName)
      }

      // 1) Campos com classes/atributos de inválido
      const invalidos = Array.from(document.querySelectorAll(
        '.mat-form-field-invalid input, .mat-form-field-invalid mat-select, ' +
        '.ng-invalid.ng-touched:not(form):not([formgroup]), ' +
        '[aria-invalid="true"]'
      ))
      const vistos = new Set()
      for (const el of invalidos) {
        const rotulo = rotuloDoCampo(el) || '(sem rótulo)'
        if (vistos.has(rotulo)) continue
        vistos.add(rotulo)
        const valor = (el.value || el.innerText || '').toString().slice(0, 40)
        problemas.push({ campo: rotulo, motivo: 'inválido', valor })
      }

      // 2) Mensagens de erro renderizadas (mat-error, .error-message)
      const erros = Array.from(document.querySelectorAll('mat-error, .mat-mdc-form-field-error, .mat-error, .error-message, .field-error'))
      for (const el of erros) {
        const txt = norm(el.innerText)
        if (!txt) continue
        const mff = el.closest('mat-form-field, .mat-form-field, .mat-mdc-form-field')
        let rotulo = '(sem rótulo)'
        if (mff) {
          const lbl = mff.querySelector('mat-label, .mat-mdc-floating-label')
          if (lbl) rotulo = norm(lbl.innerText)
        }
        if (vistos.has(rotulo + ':' + txt)) continue
        vistos.add(rotulo + ':' + txt)
        problemas.push({ campo: rotulo, motivo: txt, valor: '' })
      }

      // 3) Inputs obrigatórios visíveis sem valor
      const obrigatorios = Array.from(document.querySelectorAll('input[required], select[required], mat-select[required]'))
      for (const el of obrigatorios) {
        const visivel = el.offsetParent !== null || (el.getBoundingClientRect && el.getBoundingClientRect().height > 0)
        if (!visivel) continue
        const v = (el.value || '').toString().trim()
        if (v) continue
        const rotulo = rotuloDoCampo(el) || '(sem rótulo)'
        if (vistos.has(rotulo + ':obrig')) continue
        vistos.add(rotulo + ':obrig')
        problemas.push({ campo: rotulo, motivo: 'obrigatório vazio', valor: '' })
      }

      return { ok: problemas.length === 0, problemas }
    })
  } catch (err) {
    return { ok: true, problemas: [], aviso: 'falha ao escanear: ' + err.message }
  }
}

// Tenta forçar o "blur" em todos os campos pra que o Angular marque os
// inválidos antes de inspecionar (mat-form-field só fica invalid após touched).
async function forcarValidacao(page) {
  try {
    await page.evaluate(() => {
      const els = document.querySelectorAll('input, mat-select, select, textarea')
      for (const el of els) {
        try {
          el.dispatchEvent(new Event('blur', { bubbles: true }))
        } catch {}
      }
    })
  } catch {}
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
  URL, login, logout, abrirCotacaoAuto,
  preencher, selecionar, selecionarPorIndex, lerCampo, lerMatSelect,
  clicarProximo, clicarCalcular, extrairResultado,
  verificarErrosFormulario, forcarValidacao,
  primeiroSeletor,
}
