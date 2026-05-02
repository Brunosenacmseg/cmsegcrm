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

// Preenche um input/select/radio pelo atributo name. Usa primeiro a API
// nativa do Playwright (auto-wait, focus, blur reais), com fallback DOM.
async function setarCampoPorNome(page, name, valor) {
  if (valor === undefined || valor === null || valor === '') return 'inexistente'
  const v = String(valor)

  // Tenta via Playwright (mais confiável pra Angular).
  try {
    const sel = `[name="${name}"]:visible`
    const el = page.locator(sel).first()
    const count = await page.locator(`[name="${name}"]`).count()
    if (count === 0) return 'inexistente'

    const tag = await el.evaluate(e => e.tagName).catch(() => null)
    if (!tag) return 'invisivel'

    if (tag === 'SELECT') {
      // Tenta por label primeiro, depois por value
      try {
        await el.selectOption({ label: v }, { timeout: 3000 })
        return 'ok'
      } catch {}
      try {
        await el.selectOption({ value: v }, { timeout: 1000 })
        return 'ok'
      } catch {}
      // Match parcial: pega texto da opção que contenha v
      const opcoes = await el.locator('option').allTextContents().catch(() => [])
      const norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
      const match = opcoes.find(o => norm(o).includes(norm(v)))
      if (match) {
        try { await el.selectOption({ label: match }, { timeout: 2000 }); return 'ok' } catch {}
      }
      return 'sem_opcao'
    }

    if (tag === 'INPUT') {
      const type = await el.evaluate(e => e.type).catch(() => 'text')
      if (type === 'radio' || type === 'checkbox') {
        // Encontra o radio com value/label correspondente
        const radios = page.locator(`input[name="${name}"]`)
        const n = await radios.count()
        const norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
        for (let i = 0; i < n; i++) {
          const r = radios.nth(i)
          const val = await r.getAttribute('value').catch(() => '')
          const lbl = await r.evaluate(e => {
            const l = e.closest('label') || (e.id && document.querySelector(`label[for="${e.id}"]`))
            return l ? (l.innerText || l.textContent || '') : ''
          }).catch(() => '')
          if (norm(val) === norm(v) || norm(lbl).includes(norm(v))) {
            await r.check({ force: true }).catch(() => r.click({ force: true }))
            return 'ok'
          }
        }
        return 'sem_opcao'
      }
      // Input de texto/tel/email
      try {
        await el.fill(v, { timeout: 3000 })
        await el.dispatchEvent('change')
        await el.dispatchEvent('blur')
        return 'ok'
      } catch {
        return 'invisivel'
      }
    }

    return 'invisivel'
  } catch (err) {
    return 'invisivel'
  }
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

// Preenche um input/select procurando pelo texto do label mais próximo.
// Útil pra campos sem name= (ex: input de placa na etapa "Informe seu Veículo").
async function preencherPorLabel(page, regexLabel, valor) {
  if (valor === undefined || valor === null || valor === '') return 'inexistente'
  const v = String(valor)
  return await page.evaluate(({ regex, v }) => {
    const norm = s => (s || '').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
    const re = new RegExp(regex, 'i')
    const isVisivel = e => {
      const r = e.getBoundingClientRect()
      if (r.width === 0 && r.height === 0) return false
      const cs = getComputedStyle(e)
      return cs.display !== 'none' && cs.visibility !== 'hidden'
    }
    const labels = Array.from(document.querySelectorAll('label, span, div, p'))
      .filter(l => isVisivel(l) && re.test(l.textContent || ''))
    for (const lbl of labels) {
      // Procura input/select irmão ou descendente do mesmo container
      const cont = lbl.closest('div, fieldset, form-group, mat-form-field') || lbl.parentElement
      if (!cont) continue
      const candidatos = Array.from(cont.querySelectorAll('input, select, textarea'))
        .filter(e => isVisivel(e) && !e.disabled && e.type !== 'hidden')
      const el = candidatos[0]
      if (!el) continue

      if (el.tagName === 'SELECT') {
        const opt = Array.from(el.options).find(o =>
          norm(o.text) === norm(v) || norm(o.text).includes(norm(v))
        )
        if (!opt) continue
        const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set
        setter.call(el, opt.value)
        el.dispatchEvent(new Event('change', { bubbles: true }))
        el.dispatchEvent(new Event('input',  { bubbles: true }))
        el.dispatchEvent(new Event('blur',   { bubbles: true }))
        return 'ok'
      }
      const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
      const setter = Object.getOwnPropertyDescriptor(proto, 'value').set
      setter.call(el, v)
      el.dispatchEvent(new Event('input',  { bubbles: true }))
      el.dispatchEvent(new Event('change', { bubbles: true }))
      el.dispatchEvent(new Event('blur',   { bubbles: true }))
      return 'ok'
    }
    return 'invisivel'
  }, { regex: regexLabel.source || regexLabel, v })
}

// Conjunto de campos sem name= que precisam de fallback por label.
// Mapeia chave do nosso modelo → regex do label visível na página.
const FALLBACK_LABELS = {
  tPlaca:  /^placa[:\s*]*$/i,
  tCep:    /^cep[:\s*]/i,
  tModelo: /informe seu ve[íi]culo|marca\/modelo/i,
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
    tVeiculo:                dados.modelo || dados.veiculo,
    tCepPernoite:            dados.cep,
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

  // Loop iterativo: campos têm dependências em cascata (Angular ng-show/ng-if).
  // A cada ciclo, preenche o que estiver visível, espera o Angular reagir,
  // tenta clicar Continuar, e refaz. Para quando btnCalcular ficar visível
  // ou quando ninguém mais aceita preenchimento.
  const ordemPreferencial = [
    'tCpf','tDataNascimento','tGenero','tEstadoCivil',
    'tUtilizacao','tTipoSeguro','tBonus',
    'tPlaca','tAnoFabricacao','tAnoModelo','tZeroKm','tVeiculo','tCepPernoite',
    'tUf','tCor','tCombustivel',
    'tTipoCondutor','tCpfCondutor','tNomeCondutor','tDataNascimentoCondutor',
    'tGeneroCondutor','tEstadoCivilCondutor',
  ]
  const pendentes = new Set(ordemPreferencial.filter(k => todos[k] !== undefined && todos[k] !== null && todos[k] !== ''))

  let cotarPronto = false
  let semProgresso = 0
  for (let ciclo = 0; ciclo < 25 && !cotarPronto; ciclo++) {
    // Espera o Angular renderizar a etapa atual antes do primeiro pass
    if (ciclo === 0) await page.waitForTimeout(1500)

    let preencheuAlgum = false
    let aindaTemVisivel = false
    for (const k of Array.from(pendentes)) {
      let r = await setarCampoPorNome(page, k, todos[k])
      // Fallback por label se o campo não tem name= ou não foi achado
      if ((r === 'inexistente' || r === 'invisivel') && FALLBACK_LABELS[k]) {
        const r2 = await preencherPorLabel(page, FALLBACK_LABELS[k], todos[k])
        if (r2 === 'ok') r = 'ok'
      }
      // Autocomplete: depois de setar tVeiculo, tenta clicar a 1ª sugestão.
      if (r === 'ok' && k === 'tVeiculo') {
        await page.waitForTimeout(1500)
        await page.evaluate(() => {
          const opt = document.querySelector('.uib-typeahead-match a, .dropdown-menu li a, [role="option"]')
          if (opt) opt.click()
        }).catch(() => {})
        await page.waitForTimeout(500)
      }
      if (r === 'ok' || r === 'ja_preenchido') {
        pendentes.delete(k)
        if (r === 'ok') { preencheuAlgum = true; await page.waitForTimeout(300) }
      } else if (r === 'inexistente') {
        pendentes.delete(k)
      } else if (r === 'invisivel') {
        // mantém — talvez apareça depois
      } else if (r === 'sem_opcao') {
        aindaTemVisivel = true
        log.warn('Suhai: opção não casa com nenhuma do select', { campo: k, valor: todos[k] })
        pendentes.delete(k)  // não vai resolver mesmo, segue
      }
    }
    await page.waitForTimeout(700)

    cotarPronto = await page.evaluate(() => {
      const b = document.getElementById('btnCalcular')
      return !!(b && b.offsetParent !== null && !b.disabled)
    })
    if (cotarPronto) break

    // Só clica Continuar se todos os campos visíveis da etapa atual estão preenchidos.
    // Heurística: se neste ciclo não preenchemos nada, é hora de tentar avançar.
    if (!preencheuAlgum) {
      const continuou = await clicarBotao(page, '#btnContinuar')
        || await clicarBotao(page, 'Continuar')
      if (continuou) {
        await page.waitForTimeout(2000)  // espera nova etapa renderizar
        semProgresso = 0
      } else {
        semProgresso++
        if (semProgresso >= 2) break
      }
    } else {
      semProgresso = 0
    }
  }
  if (pendentes.size) log.warn('Suhai: campos pendentes', { campos: Array.from(pendentes) })

  // ── Pass final: alguns campos reaparecem na última etapa (ex: tTipoCondutor
  // pergunta "O segurado é o principal condutor?"). Re-seta antes de Cotar.
  for (const k of ['tTipoCondutor','tGenero','tEstadoCivil','tDataNascimento']) {
    if (todos[k]) await setarCampoPorNome(page, k, todos[k])
  }
  // Tenta também por label "principal condutor" → clica Sim
  await page.evaluate(() => {
    const isVis = e => { const r = e.getBoundingClientRect(); return r.width>0&&r.height>0 && getComputedStyle(e).display!=='none' }
    const rotulos = Array.from(document.querySelectorAll('label, span, div, p, h1, h2, h3, h4'))
      .filter(e => isVis(e) && /principal\s+condutor/i.test(e.textContent || ''))
    for (const lbl of rotulos) {
      const cont = lbl.closest('div, fieldset, form-group') || lbl.parentElement
      if (!cont) continue
      const sim = Array.from(cont.querySelectorAll('button, label, input[type=radio], a'))
        .find(b => isVis(b) && /^\s*sim\s*$/i.test((b.innerText || b.value || '').trim()))
      if (sim) { sim.click(); return }
    }
  }).catch(() => {})
  await page.waitForTimeout(800)

  // Log do estado pré-Cotar pra debug
  const preCotar = await page.evaluate(() => {
    const isVis = e => { const r = e.getBoundingClientRect(); return r.width>0&&r.height>0 && getComputedStyle(e).display!=='none' }
    return {
      inputs: Array.from(document.querySelectorAll('input,textarea')).filter(isVis).map(e => ({ type: e.type, name: e.name, value: (e.value||'').slice(0,30), checked: e.checked })),
      selects: Array.from(document.querySelectorAll('select')).filter(isVis).map(e => ({ name: e.name, value: e.value })),
      buttons: Array.from(document.querySelectorAll('button')).filter(isVis).map(e => ({ id: e.id, text: (e.innerText||'').trim().slice(0,30), disabled: e.disabled })),
      texto: document.body.innerText.slice(-400),
    }
  })
  log.info('Suhai: estado pre-Cotar', preCotar)

  // ── Cotar ───────────────────────────────────────────────────────────
  // Click nativo Playwright (mais confiável pra ng-click do que .click() em evaluate)
  let cotarOk = false
  try {
    await page.click('#btnCalcular', { timeout: 5000 })
    cotarOk = true
  } catch {
    cotarOk = await clicarBotao(page, '#btnCalcular') || await clicarBotao(page, 'Cotar')
  }
  if (!cotarOk) {
      // Dump do estado da página pra debug
      const estado = await page.evaluate(() => {
        const visivel = e => {
          const r = e.getBoundingClientRect()
          if (r.width === 0 && r.height === 0) return false
          const cs = getComputedStyle(e)
          return cs.display !== 'none' && cs.visibility !== 'hidden'
        }
        const inputs = Array.from(document.querySelectorAll('input,textarea')).filter(visivel)
          .map(e => ({ tag: e.tagName.toLowerCase(), type: e.type, name: e.name, value: (e.value || '').slice(0, 30), disabled: e.disabled }))
        const selects = Array.from(document.querySelectorAll('select')).filter(visivel)
          .map(e => ({ name: e.name, value: e.value, disabled: e.disabled }))
        const buttons = Array.from(document.querySelectorAll('button')).filter(visivel)
          .map(b => ({ id: b.id, text: (b.innerText || '').trim().slice(0, 30), disabled: b.disabled }))
        return { url: location.href, inputs, selects, buttons, texto: document.body.innerText.slice(0, 600) }
      })
      log.warn('Suhai: estado no momento da falha', estado)
      throw new Error('Suhai: botão "Cotar" não encontrado (ver logs/estado)')
  }

  // Aguarda resultado: tela muda da pergunta "principal condutor?" pra resultado.
  await page.waitForFunction(
    () => {
      const t = document.body.innerText
      // Mudou da pergunta final E tem R$
      return !/principal\s+condutor\?\s*\n\s*sim/i.test(t) && /R\$\s*[\d\.,]+/.test(t)
    },
    { timeout: 90000 }
  ).catch(() => {})
  await page.waitForTimeout(2500)
  // Log pós-click pra debug
  const posCotar = await page.evaluate(() => ({ url: location.href, texto: document.body.innerText.slice(0, 800) }))
  log.info('Suhai: estado pos-Cotar', posCotar)

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
