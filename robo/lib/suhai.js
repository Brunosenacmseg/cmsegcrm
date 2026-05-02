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

// Preenche um input/select/radio pelo atributo name. Lida com o ciclo do Angular
// (ngModel só reage se o evento for despachado nativamente).
// Retorna 'ok' / 'invisivel' / 'ja_preenchido' / 'sem_opcao' / 'inexistente'.
async function setarCampoPorNome(page, name, valor) {
  if (valor === undefined || valor === null || valor === '') return 'inexistente'
  const v = String(valor)
  return await page.evaluate(({ name, v }) => {
    const norm = s => (s || '').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
    const els = Array.from(document.querySelectorAll(`[name="${name}"]`))
    if (!els.length) return 'inexistente'
    const visiveis = els.filter(e => e.offsetParent !== null && !e.disabled)
    if (!visiveis.length) return 'invisivel'

    // Radios: várias entradas com mesmo name
    if (visiveis.every(e => e.tagName === 'INPUT' && e.type === 'radio')) {
      const alvo = visiveis.find(e => {
        const lbl = e.closest('label') || (e.id ? document.querySelector(`label[for="${e.id}"]`) : null)
        const txt = norm((lbl && lbl.textContent) || e.value)
        return txt === norm(v) || txt.includes(norm(v))
      })
      if (!alvo) return 'sem_opcao'
      if (alvo.checked) return 'ja_preenchido'
      alvo.click()
      alvo.dispatchEvent(new Event('change', { bubbles: true }))
      return 'ok'
    }

    const el = visiveis[0]
    if (el.tagName === 'SELECT') {
      const opt = Array.from(el.options).find(o =>
        norm(o.text) === norm(v) || norm(o.value) === norm(v) ||
        norm(o.text).startsWith(norm(v)) || norm(o.text).includes(norm(v))
      )
      if (!opt) return 'sem_opcao'
      if (el.value === opt.value) return 'ja_preenchido'
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set
      setter.call(el, opt.value)
      el.dispatchEvent(new Event('change', { bubbles: true }))
      el.dispatchEvent(new Event('input',  { bubbles: true }))
      el.dispatchEvent(new Event('blur',   { bubbles: true }))
      return 'ok'
    }

    if (el.value === v) return 'ja_preenchido'
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set
    setter.call(el, v)
    el.dispatchEvent(new Event('input',  { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
    el.dispatchEvent(new Event('blur',   { bubbles: true }))
    return 'ok'
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

  // Loop iterativo: campos têm dependências em cascata (Angular ng-show/ng-if).
  // A cada ciclo, preenche o que estiver visível, espera o Angular reagir,
  // tenta clicar Continuar, e refaz. Para quando btnCalcular ficar visível
  // ou quando ninguém mais aceita preenchimento.
  const ordemPreferencial = [
    'tCpf','tDataNascimento','tGenero','tEstadoCivil',
    'tUtilizacao','tTipoSeguro','tBonus',
    'tPlaca','tAnoFabricacao','tAnoModelo','tZeroKm','tModelo','tCep',
    'tUf','tCor','tCombustivel',
    'tTipoCondutor','tCpfCondutor','tNomeCondutor','tDataNascimentoCondutor',
    'tGeneroCondutor','tEstadoCivilCondutor',
  ]
  const pendentes = new Set(ordemPreferencial.filter(k => todos[k] !== undefined && todos[k] !== null && todos[k] !== ''))

  let cotarPronto = false
  for (let ciclo = 0; ciclo < 20 && !cotarPronto; ciclo++) {
    let preencheuAlgum = false
    for (const k of Array.from(pendentes)) {
      const r = await setarCampoPorNome(page, k, todos[k])
      if (r === 'ok' || r === 'ja_preenchido') {
        pendentes.delete(k)
        if (r === 'ok') { preencheuAlgum = true; await page.waitForTimeout(250) }
      } else if (r === 'inexistente') {
        pendentes.delete(k)  // desiste — campo não existe nessa cotação
      }
      // 'invisivel' / 'sem_opcao' → mantém na fila pra tentar depois
    }
    await page.waitForTimeout(600)

    // Se Cotar já apareceu, sai
    cotarPronto = await page.evaluate(() => {
      const b = document.getElementById('btnCalcular')
      return !!(b && b.offsetParent !== null && !b.disabled)
    })
    if (cotarPronto) break

    // Tenta avançar pra próxima etapa
    const continuou = await clicarBotao(page, '#btnContinuar')
      || await clicarBotao(page, 'Continuar')
    if (continuou) {
      await page.waitForTimeout(1500)
      preencheuAlgum = true
    }
    if (!preencheuAlgum && !continuou) break  // travou
  }
  if (pendentes.size) log.warn('Suhai: campos pendentes', { campos: Array.from(pendentes) })

  // ── Cotar ───────────────────────────────────────────────────────────
  if (!await clicarBotao(page, '#btnCalcular')) {
    if (!await clicarBotao(page, 'Cotar')) {
      // Tira screenshot do estado pra debug e devolve erro detalhado
      const snap = await page.screenshot({ fullPage: true }).then(b => b.toString('base64')).catch(() => null)
      const estado = await page.evaluate(() => {
        const visiveis = Array.from(document.querySelectorAll('input,select,button'))
          .filter(e => e.offsetParent !== null)
          .map(e => ({ tag: e.tagName.toLowerCase(), name: e.name, id: e.id, type: e.type, text: (e.innerText || e.value || '').slice(0, 40), disabled: e.disabled }))
        return { url: location.href, texto: document.body.innerText.slice(0, 1500), visiveis: visiveis.slice(0, 60) }
      })
      const e = new Error('Suhai: botão "Cotar" não encontrado')
      e.estado = estado
      e.screenshot = snap
      throw e
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
