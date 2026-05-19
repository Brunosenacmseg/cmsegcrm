// Fluxo de cotação no portal da Suhai Seguradora.
// Endpoint público: https://suhaiseguradoracotacao.com.br/
//
// Etapas:
//   1) Login com usuário/senha (envs SUHAI_LOGIN / SUHAI_SENHA, com fallback
//      pras credenciais do print original)
//   2) Cotador → Nova Cotação → Incluir
//   3) Preenche vendedor, proponente (CPF dispara auto-fill nome+nascimento),
//      estado civil "Casado/União Estável"
//   4) Preenche placa, TAB; se abrir modal "Selecione o veículo", clica no
//      primeiro flag verde
//   5) Preenche combustível, utilização, CEP, desconto aut., perguntas
//      de garagem/uso, etc.
//   6) Calcular → coleta as 5 colunas
//   7) Para "Roubo + Furto + Terceiros (RCF)" e
//      "Roubo + Furto + Perda Total por Colisão ou Danos + Terceiros (RCF)"
//      clica Selecionar e captura tabela de parcelas
//
// Cada opção retorna { titulo, premio_total, premio_liquido, parcelas: [...] }.

const log = require('./log')

const URL   = process.env.SUHAI_URL   || 'https://suhaiseguradoracotacao.com.br'
const LOGIN = process.env.SUHAI_LOGIN || '41558919805'
const SENHA = process.env.SUHAI_SENHA || 'Elisa123#'

const VENDEDOR_DEFAULT = process.env.SUHAI_VENDEDOR_DEFAULT || 'BRUNO PEREIRA BONACCORSI DE SENA'

// Coberturas que o robô precisa selecionar (na ordem em que aparecem na grade).
// O título sai exatamente do header da coluna; deixar acentuação como vem.
const COBERTURAS_ALVO = [
  'Roubo + Furto + Terceiros (RCF)',
  'Roubo + Furto + Perda Total por Colisão ou Danos* + Terceiros (RCF)',
]

// ─── Helpers ─────────────────────────────────────────────────────────

function somenteDigitos(s) { return String(s || '').replace(/\D/g, '') }
function placaLimpa(p)     { return String(p || '').toUpperCase().replace(/[^A-Z0-9]/g, '') }

// Tenta preencher um input por seletor; ignora falha silenciosa.
async function fill(page, selector, valor) {
  if (valor == null || valor === '') return false
  try {
    const loc = page.locator(selector).first()
    await loc.waitFor({ state: 'visible', timeout: 4000 })
    await loc.fill(String(valor))
    return true
  } catch (e) {
    log.debug('fill falhou', { selector, erro: e.message })
    return false
  }
}

// Seleciona opção por texto visível em <select>
async function selectByText(page, selector, texto) {
  if (!texto) return false
  try {
    const loc = page.locator(selector).first()
    await loc.waitFor({ state: 'visible', timeout: 4000 })
    // tenta por label
    try {
      await loc.selectOption({ label: texto })
      return true
    } catch {}
    // tenta por valor
    try {
      await loc.selectOption(texto)
      return true
    } catch {}
    // fallback: procura option cuja label contenha o texto
    const options = await loc.locator('option').all()
    for (const o of options) {
      const t = (await o.textContent() || '').trim()
      if (t.toLowerCase().includes(texto.toLowerCase())) {
        const val = await o.getAttribute('value')
        if (val != null) {
          await loc.selectOption(val)
          return true
        }
      }
    }
  } catch (e) {
    log.debug('selectByText falhou', { selector, texto, erro: e.message })
  }
  return false
}

// Clica em botão por texto (insensível a acento/caixa).
async function clickByText(page, texto, opts = {}) {
  const candidatos = [
    `button:has-text("${texto}")`,
    `a:has-text("${texto}")`,
    `*[role="button"]:has-text("${texto}")`,
    `text=${texto}`,
  ]
  for (const sel of candidatos) {
    try {
      const loc = page.locator(sel).first()
      if (await loc.isVisible({ timeout: opts.timeout || 2000 }).catch(() => false)) {
        await loc.click({ force: true })
        return true
      }
    } catch {}
  }
  return false
}

// ─── Login ───────────────────────────────────────────────────────────

async function login(page) {
  log.info('Suhai: abrindo login', { url: URL })
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})

  // Tela de login tem campos "Usuário" e "Senha" + botão "Entrar"
  await page.waitForSelector('input', { timeout: 15000 })

  // Heurística: primeiro input visível = Usuário, primeiro password = Senha
  const usuarioSel = await page.locator(
    'input[name*="user" i], input[id*="user" i], input[placeholder*="suário" i], input[type="text"]:visible'
  ).first()
  await usuarioSel.fill(LOGIN)

  const senhaSel = page.locator('input[type="password"]').first()
  await senhaSel.fill(SENHA)

  const okBtn = await clickByText(page, 'Entrar', { timeout: 3000 })
  if (!okBtn) {
    // fallback: submeter form
    await senhaSel.press('Enter').catch(() => {})
  }

  // Aguarda saída da tela de login (alguma referência ao cotador deve aparecer)
  await page.waitForFunction(() => {
    const txt = document.body.innerText || ''
    return /Cotador|Cotações|Cadastro/i.test(txt) && !/Acesso ao sistema/i.test(txt)
  }, { timeout: 30000 }).catch(() => {
    throw new Error('Login Suhai falhou ou demorou demais')
  })

  log.info('Suhai: login OK')
}

// ─── Navegação até "Nova Cotação" → Incluir ──────────────────────────

async function abrirNovaCotacao(page) {
  // Abre menu Cotador (acordeon lateral)
  await clickByText(page, 'Cotador')
  await page.waitForTimeout(600)
  await clickByText(page, 'Nova Cotação')
  await page.waitForTimeout(1500)

  // Tela "Cotações" — clicar "+ Incluir" (canto sup. direito)
  // Procura por texto Incluir (icone "+ Incluir")
  const ok = await clickByText(page, 'Incluir', { timeout: 4000 })
  if (!ok) throw new Error('Botão "Incluir" não encontrado em Nova Cotação')
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {})
  await page.waitForTimeout(1500)
}

// ─── Preenche formulário Cotação de Seguro ──────────────────────────

async function preencherCotacao(page, dados) {
  log.info('Suhai: preenchendo cotação', { cpf: (dados.cpf||'').slice(0,3)+'***', placa: dados.placa })

  // Vendedor (combo com autocomplete) — campo identificável pelo label "Vendedor:"
  // O input fica logo abaixo do label. Vamos localizar por placeholder ou label.
  const vendedor = dados.vendedor || VENDEDOR_DEFAULT
  await preencherPorLabel(page, 'Vendedor', vendedor)
  // O componente é autocomplete; aguarda dropdown e clica na primeira opção
  await page.waitForTimeout(900)
  await selecionarPrimeiraSugestao(page)

  // CPF — dispara auto-fill de nome/nascimento/sexo
  await preencherPorLabel(page, 'CPF', somenteDigitos(dados.cpf))
  await page.waitForTimeout(2500)

  // Estado civil — sempre "Casado/União Estável"
  await selecionarPorLabel(page, 'Estado Civil', 'Casado')

  // Placa: campo "Busca por Placa" → input "Placa:"
  await preencherPorLabel(page, 'Placa', placaLimpa(dados.placa))
  // TAB pra disparar busca
  await page.keyboard.press('Tab')
  await page.waitForTimeout(2500)

  // Modal "Selecione o veículo" pode aparecer
  await selecionarPrimeiroVeiculo(page)
  await page.waitForTimeout(800)

  // Após carregar veículo aparecem novos campos. Preenche:
  // Combustível = Flex
  await selecionarPorLabel(page, 'Combustível', 'Flex')
  // Utilização = Particular
  await selecionarPorLabel(page, 'Utilização', 'Particular')
  // CEP de Pernoite
  if (dados.cep) await preencherPorLabel(page, 'CEP de Pernoite', somenteDigitos(dados.cep))
  // Desconto Aut.: 3,00
  await preencherPorLabel(page, 'Desconto Aut', '3,00')

  // Perguntas (tabela Pergunta/Resposta) — selects logo após
  await responderPergunta(page, 'Tipo de utilização',
    'Locomoção ida-retorno local fixo de trabalho/lazer')
  await responderPergunta(page, 'guardado em garagem/estacionamento fechado na residência',
    'Sim, garagem na residência')
  await responderPergunta(page, 'guardado em garagem/estacionamento fechado quando utilizado para ir ao local de trabalho',
    'utiliza mas não guarda em local de trabalho/serviços externos')
  await responderPergunta(page, 'guardado em garagem/estacionamento fechado quando utilizado para ir à faculdade',
    'Não utiliza para ir à faculdade/colégio')
}

// ─── Helpers de label ────────────────────────────────────────────────

// Preenche um input cujo label/legenda contém `labelText`.
async function preencherPorLabel(page, labelText, valor) {
  if (valor == null || valor === '') return false
  const found = await page.evaluate(({ labelText, valor }) => {
    function norm(s) { return (s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'') }
    const alvo = norm(labelText)
    const labels = Array.from(document.querySelectorAll('label, span, td, div'))
    for (const lbl of labels) {
      const txt = norm(lbl.innerText || lbl.textContent || '')
      if (!txt.includes(alvo)) continue
      // Procura o input mais próximo: irmão ou descendente do pai
      let input = lbl.querySelector('input, textarea')
      if (!input) {
        let host = lbl
        for (let i = 0; i < 4 && host; i++) {
          host = host.parentElement
          if (!host) break
          input = host.querySelector('input:not([type="hidden"]):not([type="checkbox"]), textarea')
          if (input) break
        }
      }
      if (input && input.offsetParent !== null) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
        setter.call(input, String(valor))
        input.dispatchEvent(new Event('input', { bubbles: true }))
        input.dispatchEvent(new Event('change', { bubbles: true }))
        input.focus()
        return true
      }
    }
    return false
  }, { labelText, valor: String(valor) })
  if (!found) log.debug('preencherPorLabel: não achei', { labelText })
  return found
}

async function selecionarPorLabel(page, labelText, valor) {
  if (!valor) return false
  const found = await page.evaluate(({ labelText, valor }) => {
    function norm(s) { return (s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'') }
    const alvo = norm(labelText)
    const valNorm = norm(valor)
    const labels = Array.from(document.querySelectorAll('label, span, td, div'))
    for (const lbl of labels) {
      const txt = norm(lbl.innerText || lbl.textContent || '')
      if (!txt.includes(alvo)) continue
      let select = lbl.querySelector('select')
      if (!select) {
        let host = lbl
        for (let i = 0; i < 4 && host; i++) {
          host = host.parentElement
          if (!host) break
          select = host.querySelector('select')
          if (select) break
        }
      }
      if (select && select.offsetParent !== null) {
        const opts = Array.from(select.options)
        const match = opts.find(o => norm(o.textContent).includes(valNorm))
                   || opts.find(o => norm(o.textContent).split(' ').some(p => p === valNorm))
        if (match) {
          select.value = match.value
          select.dispatchEvent(new Event('change', { bubbles: true }))
          return true
        }
      }
    }
    return false
  }, { labelText, valor: String(valor) })
  if (!found) log.debug('selecionarPorLabel: não achei', { labelText, valor })
  return found
}

// Responde uma pergunta na tabela Pergunta/Resposta (select à direita).
async function responderPergunta(page, perguntaTxt, respostaTxt) {
  const found = await page.evaluate(({ perguntaTxt, respostaTxt }) => {
    function norm(s) { return (s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'') }
    const alvoPerg = norm(perguntaTxt)
    const alvoResp = norm(respostaTxt)
    const linhas = Array.from(document.querySelectorAll('tr'))
    for (const tr of linhas) {
      const txt = norm(tr.innerText || '')
      if (!txt.includes(alvoPerg)) continue
      const select = tr.querySelector('select')
      if (!select) continue
      const opts = Array.from(select.options)
      const match = opts.find(o => norm(o.textContent).includes(alvoResp))
      if (match) {
        select.value = match.value
        select.dispatchEvent(new Event('change', { bubbles: true }))
        return true
      }
    }
    return false
  }, { perguntaTxt, respostaTxt })
  if (!found) log.debug('responderPergunta: não achei', { perguntaTxt, respostaTxt })
  return found
}

// Após digitar em autocomplete, clica na primeira sugestão visível.
async function selecionarPrimeiraSugestao(page) {
  const seletores = [
    '.ui-autocomplete:visible li:first-child',
    'ul.dropdown-menu:visible li:first-child a',
    '.tt-suggestion:first-child',
    '.autocomplete-suggestion:first-child',
  ]
  for (const sel of seletores) {
    try {
      const loc = page.locator(sel).first()
      if (await loc.isVisible({ timeout: 800 }).catch(() => false)) {
        await loc.click({ force: true })
        return true
      }
    } catch {}
  }
  // fallback: setinha + enter
  await page.keyboard.press('ArrowDown').catch(() => {})
  await page.keyboard.press('Enter').catch(() => {})
  return false
}

// Modal "Selecione o veículo" — clica no flag verde da primeira linha.
async function selecionarPrimeiroVeiculo(page) {
  // Modal pode demorar pra montar. Aguarda até 5s; se não aparecer, ignora.
  try {
    await page.waitForSelector('text=/Selecione o ve.culo/i', { timeout: 4000 })
  } catch {
    return false
  }
  log.info('Suhai: modal de seleção de veículo apareceu')
  // O "flag verde" é um link/ícone na coluna "Selecionar" da primeira linha.
  const clicou = await page.evaluate(() => {
    const modal = Array.from(document.querySelectorAll('.modal, [role="dialog"], div'))
      .find(d => /Selecione o ve/i.test(d.innerText || ''))
    if (!modal) return false
    const table = modal.querySelector('table')
    if (!table) return false
    const firstRow = table.querySelector('tbody tr')
    if (!firstRow) return false
    // pega último td (coluna Selecionar) e clica no elemento ativo
    const tds = firstRow.querySelectorAll('td')
    const sel = tds[tds.length - 1]
    if (!sel) return false
    const clickable = sel.querySelector('a, button, i, span') || sel
    clickable.click()
    return true
  })
  if (clicou) {
    log.info('Suhai: primeiro veículo selecionado')
    await page.waitForTimeout(1200)
  }
  return clicou
}

// ─── Calcular e capturar coberturas ─────────────────────────────────

async function calcularECapturar(page) {
  const ok = await clickByText(page, 'Calcular', { timeout: 5000 })
  if (!ok) throw new Error('Botão Calcular não encontrado')

  // Aguarda renderização da grade de 5 colunas (cada coluna tem "Prêmio Total:")
  await page.waitForFunction(() => {
    const txt = document.body.innerText || ''
    return (txt.match(/Pr.mio Total/gi) || []).length >= 2
  }, { timeout: 60000 }).catch(() => {
    throw new Error('Grade de coberturas não carregou após Calcular')
  })
  await page.waitForTimeout(1500)

  const resultados = []
  for (const alvo of COBERTURAS_ALVO) {
    log.info('Suhai: selecionando cobertura', { alvo })
    const okSel = await selecionarColuna(page, alvo)
    if (!okSel) {
      resultados.push({ titulo: alvo, erro: 'coluna não encontrada' })
      continue
    }
    // Após selecionar, a tabela de parcelas aparece/atualiza no rodapé
    await page.waitForTimeout(2500)
    const dadosCol = await extrairResumoColuna(page, alvo)
    const parcelas = await extrairParcelas(page)
    resultados.push({ titulo: alvo, ...dadosCol, parcelas })
  }
  return resultados
}

// Clica no botão "Selecionar" da coluna cujo cabeçalho corresponde a `titulo`.
async function selecionarColuna(page, titulo) {
  return await page.evaluate((tituloAlvo) => {
    function norm(s) { return (s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\s+/g,' ').trim() }
    const alvo = norm(tituloAlvo)
    // Cada coluna é um <td> ou <div> com header. Buscamos por texto.
    const candidatos = Array.from(document.querySelectorAll('td, th, div'))
    for (const c of candidatos) {
      const h = norm(c.innerText || '')
      if (!h.startsWith(alvo) && !h.includes(alvo)) continue
      // Sobe pra raiz da coluna, depois acha botão "Selecionar"
      let host = c
      for (let i = 0; i < 6 && host; i++) {
        const btn = Array.from(host.querySelectorAll('button, a, span'))
          .find(b => /selecionar/i.test(b.innerText || ''))
        if (btn) { btn.click(); return true }
        host = host.parentElement
      }
    }
    return false
  }, titulo)
}

async function extrairResumoColuna(page, titulo) {
  return await page.evaluate((tituloAlvo) => {
    function norm(s) { return (s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\s+/g,' ').trim() }
    const alvo = norm(tituloAlvo)
    const candidatos = Array.from(document.querySelectorAll('td, th, div'))
    for (const c of candidatos) {
      const h = norm(c.innerText || '')
      if (!h.startsWith(alvo) && !h.includes(alvo)) continue
      let host = c
      for (let i = 0; i < 6 && host; i++) {
        const texto = host.innerText || ''
        const liquido = texto.match(/Pr.mio L.quido[:\s]*([\d.,]+)/i)
        const total   = texto.match(/Pr.mio Total[:\s]*([\d.,]+)/i)
        if (liquido || total) {
          return {
            premio_liquido: liquido ? liquido[1] : null,
            premio_total:   total   ? total[1]   : null,
          }
        }
        host = host.parentElement
      }
    }
    return { premio_liquido: null, premio_total: null }
  }, titulo)
}

async function extrairParcelas(page) {
  // Procura tabela com cabeçalhos "Nº Parcelas / Valor da Parcela / Valor Total / Juros"
  return await page.evaluate(() => {
    const tabelas = Array.from(document.querySelectorAll('table'))
    for (const t of tabelas) {
      const header = (t.querySelector('thead')?.innerText || t.rows[0]?.innerText || '').toLowerCase()
      if (!header.includes('parcela') && !header.includes('parcelas')) continue
      const linhas = Array.from(t.querySelectorAll('tbody tr, tr')).filter(r => r.cells && r.cells.length >= 3)
      const out = []
      for (const tr of linhas) {
        const cells = Array.from(tr.cells).map(c => (c.innerText || '').trim())
        // pula cabeçalho
        if (/parcela/i.test(cells[0]) && /valor/i.test(cells[1])) continue
        if (!/^\d+$/.test(cells[0])) continue
        out.push({
          n_parcelas:    parseInt(cells[0]),
          valor_parcela: cells[1],
          valor_total:   cells[2],
          juros:         cells[3] || '',
        })
      }
      if (out.length) return out
    }
    return []
  })
}

// ─── Fluxo principal ─────────────────────────────────────────────────

async function cotarSuhai(page, dados) {
  await login(page)
  await abrirNovaCotacao(page)
  await preencherCotacao(page, dados)
  const coberturas = await calcularECapturar(page)
  const screenshot = (await page.screenshot({ type: 'png', fullPage: true })).toString('base64')
  return { ok: true, coberturas, screenshot }
}

module.exports = { cotarSuhai }
