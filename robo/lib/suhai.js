// Fluxo de cotação no Suhai (http://suhai.link/rk6s).
// Site público, sem login. Os seletores serão preenchidos após mapeamento
// via endpoint /debug-suhai. Esta função aceita um objeto `dados` genérico
// e tenta preencher campos por label/placeholder/name — as chaves esperadas
// serão consolidadas no formato definitivo após o debug.

const log = require('./log')

const SUHAI_URL = process.env.SUHAI_URL || 'http://suhai.link/rk6s'

// Tenta preencher um input procurando por label, placeholder, name ou id.
async function preencherPorRotulo(page, rotulo, valor) {
  if (valor === undefined || valor === null || valor === '') return false
  const v = String(valor)
  const ok = await page.evaluate(({ rotulo, v }) => {
    const norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
    const alvo = norm(rotulo)
    function setVal(el, val) {
      const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
      const setter = Object.getOwnPropertyDescriptor(proto, 'value').set
      setter.call(el, val)
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.dispatchEvent(new Event('change', { bubbles: true }))
      el.dispatchEvent(new Event('blur', { bubbles: true }))
    }
    // 1) label[for] -> input
    for (const lbl of document.querySelectorAll('label')) {
      if (norm(lbl.textContent).includes(alvo)) {
        const id = lbl.getAttribute('for')
        const el = id ? document.getElementById(id) : lbl.querySelector('input,select,textarea')
        if (el) {
          if (el.tagName === 'SELECT') {
            const opt = Array.from(el.options).find(o => norm(o.text).includes(norm(v)))
            if (opt) { el.value = opt.value; el.dispatchEvent(new Event('change', { bubbles: true })); return true }
          } else { setVal(el, v); return true }
        }
      }
    }
    // 2) name/id/placeholder/aria-label
    const inputs = Array.from(document.querySelectorAll('input,select,textarea'))
    for (const el of inputs) {
      const hay = norm([el.name, el.id, el.placeholder, el.getAttribute('aria-label')].filter(Boolean).join(' '))
      if (hay.includes(alvo)) {
        if (el.tagName === 'SELECT') {
          const opt = Array.from(el.options).find(o => norm(o.text).includes(norm(v)))
          if (opt) { el.value = opt.value; el.dispatchEvent(new Event('change', { bubbles: true })); return true }
        } else { setVal(el, v); return true }
      }
    }
    return false
  }, { rotulo, v })
  if (!ok) log.warn('Campo não encontrado no Suhai', { rotulo })
  return ok
}

// Cotação Suhai. `dados` deve trazer (mínimo esperado, ajustar após mapeamento):
//   nome, cpf, email, telefone, cep, dataNascimento,
//   placa, modelo, anoFab, anoMod, fipe, zeroKm, combustivel
async function cotacaoSuhai(page, dados) {
  log.info('Iniciando cotação Suhai', { url: SUHAI_URL })
  await page.goto(SUHAI_URL, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForTimeout(2500)

  // Mapa label-no-site → chave em dados. Ajustar após /debug-suhai retornar.
  const MAPA = {
    'nome':              dados.nome,
    'cpf':               dados.cpf,
    'e-mail':            dados.email,
    'email':             dados.email,
    'telefone':          dados.telefone,
    'celular':           dados.telefone,
    'cep':               dados.cep,
    'data de nascimento': dados.dataNascimento,
    'nascimento':        dados.dataNascimento,
    'placa':             dados.placa,
    'modelo':            dados.modelo,
    'ano':               dados.anoFab,
    'ano fabricação':    dados.anoFab,
    'ano modelo':        dados.anoMod,
    'fipe':              dados.fipe,
    'zero km':           dados.zeroKm,
    'combustível':       dados.combustivel,
  }

  for (const [rot, val] of Object.entries(MAPA)) {
    if (val !== undefined && val !== null && val !== '') {
      try { await preencherPorRotulo(page, rot, val) } catch (e) {
        log.warn('Falha preencher', { rot, erro: e.message })
      }
    }
  }

  // Submete o form. Tenta botão de "cotar/calcular/enviar".
  const submetido = await page.evaluate(() => {
    const norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
    const alvos = ['cotar', 'calcular', 'simular', 'enviar', 'continuar', 'avançar']
    const btns = Array.from(document.querySelectorAll('button, input[type=submit], a'))
    for (const b of btns) {
      const t = norm(b.innerText || b.textContent || b.value || '')
      if (alvos.some(a => t.includes(a))) { b.click(); return t }
    }
    return null
  })
  if (!submetido) throw new Error('Botão de envio não encontrado na página Suhai')

  // Aguarda resultado. Espera por mudança de URL OU por algo com "R$" na tela.
  await page.waitForFunction(() => /R\$\s*\d/.test(document.body.innerText), { timeout: 60000 }).catch(() => {})
  await page.waitForTimeout(2000)

  // Extração genérica do prêmio. Ajustar após mapear a tela de resultado.
  const resultado = await page.evaluate(() => {
    const txt = document.body.innerText
    const valores = Array.from(txt.matchAll(/R\$\s*([\d\.,]+)/g)).map(m => m[0])
    let premio = null
    const m = txt.match(/(?:pr[êe]mio|valor|total)[^\n]*?R\$\s*([\d\.,]+)/i)
    if (m) premio = `R$ ${m[1]}`
    return { url: location.href, premio, valores: valores.slice(0, 20), texto: txt.slice(0, 1500) }
  })

  // Screenshot final
  const screenshot = await page.screenshot({ fullPage: true }).then(b => b.toString('base64')).catch(() => null)

  return {
    ok: !!resultado.premio || (resultado.valores && resultado.valores.length > 0),
    valor: resultado.premio,
    resultado,
    screenshot,
  }
}

module.exports = { cotacaoSuhai }
