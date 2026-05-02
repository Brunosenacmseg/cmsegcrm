// Fluxo de cotação no Suhai (https://suhaiseguradoracotacao.com.br/simulador.html)
// O link público http://suhai.link/rk6s redireciona pra esse simulador (Angular).
//
// Formulário multi-step. Campos têm name="tXxx". Botões importantes:
//   - "Inicie sua cotação" (submit) — sai da etapa 1
//   - "Continuar" (btnContinuar) — avança etapas intermediárias
//   - "Cotar" (btnCalcular) — calcula prêmio
//
// Mapeamento (pode ser ajustado conforme o flow real):
//   tNome, tEmail, tFone                    [etapa 1]
//   tCpf, tDataNascimento, tGenero, tEstadoCivil
//   tUtilizacao, tTipoSeguro, tBonus
//   tPlaca, tAnoFabricacao, tAnoModelo, tZeroKm, tModelo, tCep
//   tTipoCondutor, tCpfCondutor, tNomeCondutor, tDataNascimentoCondutor,
//   tGeneroCondutor, tEstadoCivilCondutor
//   tUf, tCor, tCombustivel, tSeguradora, tFormaPagamento, tPagamento

const log = require('./log')

const SUHAI_URL = process.env.SUHAI_URL || 'http://suhai.link/rk6s'

// Preenche um input/select pelo atributo name. Lida com o ciclo do Angular
// (ngModel só reage se o evento for despachado nativamente).
async function setarCampoPorNome(page, name, valor) {
  if (valor === undefined || valor === null || valor === '') return false
  const v = String(valor)
  return await page.evaluate(({ name, v }) => {
    const norm = s => (s || '').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
    const els = Array.from(document.querySelectorAll(`[name="${name}"]`))
      .filter(e => e.offsetParent !== null)  // só visíveis
    const el = els[0] || document.querySelector(`[name="${name}"]`)
    if (!el) return false

    if (el.tagName === 'SELECT') {
      const opt = Array.from(el.options).find(o =>
        norm(o.text) === norm(v) || norm(o.value) === norm(v) ||
        norm(o.text).includes(norm(v))
      )
      if (!opt) return false
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set
      setter.call(el, opt.value)
      el.dispatchEvent(new Event('change', { bubbles: true }))
      el.dispatchEvent(new Event('input',  { bubbles: true }))
      el.dispatchEvent(new Event('blur',   { bubbles: true }))
      return true
    }

    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set
    setter.call(el, v)
    el.dispatchEvent(new Event('input',  { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
    el.dispatchEvent(new Event('blur',   { bubbles: true }))
    return true
  }, { name, v })
}

// Clica num botão por id, texto exato ou texto contido.
async function clicarBotao(page, alvo) {
  return await page.evaluate(({ alvo }) => {
    const norm = s => (s || '').toLowerCase().trim()
    const candidatos = Array.from(document.querySelectorAll('button, input[type=submit], a'))
      .filter(b => b.offsetParent !== null && !b.disabled)
    let btn = null
    if (alvo.startsWith('#')) {
      btn = document.getElementById(alvo.slice(1))
      if (btn && btn.offsetParent === null) btn = null
    }
    if (!btn) {
      btn = candidatos.find(b => norm(b.id) === norm(alvo))
        || candidatos.find(b => norm(b.innerText || b.value) === norm(alvo))
        || candidatos.find(b => norm(b.innerText || b.value).includes(norm(alvo)))
    }
    if (!btn) return false
    btn.scrollIntoView({ block: 'center' })
    btn.click()
    return true
  }, { alvo })
}

async function aguardarCampoVisivel(page, name, timeout = 15000) {
  try {
    await page.waitForFunction(
      n => {
        const e = document.querySelector(`[name="${n}"]`)
        return e && e.offsetParent !== null
      },
      name,
      { timeout }
    )
    return true
  } catch { return false }
}

async function cotacaoSuhai(page, dados) {
  log.info('Suhai: iniciando cotação', { url: SUHAI_URL })
  await page.goto(SUHAI_URL, { waitUntil: 'domcontentloaded', timeout: 45000 })
  await page.waitForTimeout(2000)
  await aguardarCampoVisivel(page, 'tNome', 20000)

  // ── Etapa 1: dados de contato ───────────────────────────────────────
  const etapa1 = {
    tNome:  dados.nome,
    tEmail: dados.email,
    tFone:  dados.telefone || dados.celular,
  }
  for (const [k, v] of Object.entries(etapa1)) {
    const ok = await setarCampoPorNome(page, k, v)
    if (!ok) log.warn('Suhai: não preencheu campo etapa 1', { campo: k })
  }
  if (!await clicarBotao(page, 'Inicie sua cotação')) {
    throw new Error('Suhai: botão "Inicie sua cotação" não encontrado')
  }
  await page.waitForTimeout(1500)

  // ── Etapa 2+: dados completos do segurado/veículo ───────────────────
  // Aguarda algum campo da etapa 2 aparecer
  await aguardarCampoVisivel(page, 'tCpf', 15000)
    .catch(() => aguardarCampoVisivel(page, 'tPlaca', 15000))

  const todos = {
    // Segurado
    tCpf:                    dados.cpf,
    tDataNascimento:         dados.dataNascimento,
    tGenero:                 dados.genero || dados.sexo,
    tEstadoCivil:            dados.estadoCivil,
    // Uso/seguro
    tUtilizacao:             dados.utilizacao || 'Particular',
    tTipoSeguro:             dados.tipoSeguro || 'Novo',
    tBonus:                  dados.bonus || '0',
    // Veículo
    tPlaca:                  dados.placa,
    tAnoFabricacao:          dados.anoFab || dados.anoFabricacao,
    tAnoModelo:              dados.anoMod || dados.anoModelo,
    tZeroKm:                 dados.zeroKm || 'Não',
    tModelo:                 dados.modelo,
    tCep:                    dados.cep,
    tUf:                     dados.uf,
    tCor:                    dados.cor,
    tCombustivel:            dados.combustivel,
    // Condutor
    tTipoCondutor:           dados.tipoCondutor || 'Sim',
    tCpfCondutor:            dados.cpfCondutor || dados.cpf,
    tNomeCondutor:           dados.nomeCondutor || dados.nome,
    tDataNascimentoCondutor: dados.dataNascimentoCondutor || dados.dataNascimento,
    tGeneroCondutor:         dados.generoCondutor || dados.genero || dados.sexo,
    tEstadoCivilCondutor:    dados.estadoCivilCondutor || dados.estadoCivil,
  }

  for (const [k, v] of Object.entries(todos)) {
    if (v === undefined || v === null || v === '') continue
    const ok = await setarCampoPorNome(page, k, v)
    if (!ok) log.warn('Suhai: campo não preenchido', { campo: k })
    await page.waitForTimeout(150)  // dá tempo do Angular reagir (cascata UF→cidade etc.)
  }

  // Avança etapas intermediárias até chegar no botão "Cotar".
  // Tenta clicar em "Continuar" até 5 vezes; se "Cotar" aparecer antes, sai do loop.
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(800)
    const cotarVisivel = await page.evaluate(() => {
      const b = document.getElementById('btnCalcular')
      return !!(b && b.offsetParent !== null && !b.disabled)
    })
    if (cotarVisivel) break
    const continuou = await clicarBotao(page, '#btnContinuar')
      || await clicarBotao(page, 'Continuar')
    if (!continuou) break
    await page.waitForTimeout(1500)
  }

  // ── Cotar ───────────────────────────────────────────────────────────
  if (!await clicarBotao(page, '#btnCalcular')) {
    if (!await clicarBotao(page, 'Cotar')) {
      throw new Error('Suhai: botão "Cotar" não encontrado')
    }
  }

  // Aguarda resultado: prêmio em R$ aparecer ou tela de resultado.
  await page.waitForFunction(
    () => /R\$\s*[\d\.,]+/.test(document.body.innerText) &&
          document.body.innerText.toLowerCase().includes('pr'),
    { timeout: 90000 }
  ).catch(() => {})
  await page.waitForTimeout(2000)

  const resultado = await page.evaluate(() => {
    const txt = document.body.innerText
    const valores = Array.from(txt.matchAll(/R\$\s*([\d\.,]+)/g)).map(m => m[0])
    let premio = null, parcelamento = null
    const mP = txt.match(/(?:pr[êe]mio[^\n]*?total|total[^\n]*?pr[êe]mio|valor\s+do\s+seguro|pr[êe]mio\s+l[íi]quido|pr[êe]mio)[^\n]*?R\$\s*([\d\.,]+)/i)
    if (mP) premio = `R$ ${mP[1]}`
    else if (valores.length) premio = valores[0]
    const mPar = txt.match(/(\d+)\s*x\s*(?:de\s*)?R\$\s*([\d\.,]+)/i)
    if (mPar) parcelamento = `${mPar[1]}x de R$ ${mPar[2]}`
    return {
      url: location.href,
      premio,
      parcelamento,
      valores: valores.slice(0, 30),
      texto: txt.slice(0, 2000),
    }
  })

  const screenshot = await page.screenshot({ fullPage: true })
    .then(b => b.toString('base64'))
    .catch(() => null)

  log.info('Suhai: cotação finalizada', { premio: resultado.premio })

  return {
    ok: !!resultado.premio,
    valor: resultado.premio,
    parcelamento: resultado.parcelamento,
    resultado,
    screenshot,
  }
}

module.exports = { cotacaoSuhai }
