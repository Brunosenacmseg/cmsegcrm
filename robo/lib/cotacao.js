// Fluxo de cotação completa de automóvel no aggilizador.
// Mapeamento descoberto via /debug-cotacao em /cotacao/auto/formulario:
//
// SEGURADO: cpfCnpj, nomeSegurado, dataNascimento, cepImovel, fone, emailSegurado
//   selects: sexo (idx 0), estadoCivil (idx 0)
//
// VEÍCULO:  placa, chassi, anoFab, fipe, modelo, valReferenciado, perfilCepPernoite, gasInstalValor
//   selects: anoMod, zeroKm, combustivel, rastreador, dispAntiFurto, blindado, kitGas, alienado
//
// CONDUTOR: perfilCpfCnpj, perfilNomeCondutor, perfilDataNascimento
//   selects: relacaoSegurado, sexo (idx 1), estadoCivil (idx 1), tempoHabilitacao
//
// QUESTIONÁRIO: garagemResidencia, garagemTrabalho, garagemEstudo, tpUso,
//   jovemCondutor, idadeJovem, jovemSexo, tipoResidencia, kmMensal, isPCD, isencaoFiscal
//
// SEGURO: vigenciaIni, vigenciaFim
// RENOVAÇÃO: vigFimAnterior, numeroRenovacao, CI
//   selects: seguradoraAnteriorId, sinistrosAnterior, bonusAnterior
//   checkbox: name="renovacao"
//
// COBERTURAS: tipoCobertura, tipoFranquia, pctAjuste (% Franquia / Fipe)
//   inputs: isDanosMateriais, isDanosCorporais, isDanosMorais, isAppMorte, isBlindagemValor
//   selects: assist24hs, vidros, carroReserva, carroReservaAr

const log = require('./log')
const ag  = require('./aggilizador')

async function cotacaoAuto(page, dados) {
  log.info('Iniciando cotação auto', { cpf: (dados.cpf || '').slice(0,3) + '***', placa: dados.placa })

  await ag.login(page)
  await ag.abrirCotacaoAuto(page)

  // Esperar formulário aparecer
  await page.waitForSelector('input[formcontrolname="cpfCnpj"]', { state: 'visible', timeout: 15000 })

  // ─── 1) Segurado ───────────────────────────────────────────
  await ag.preencher(page, ['cpfCnpj'], dados.cpf)
  // Aggilizador auto-preenche nome+nascimento+sexo a partir do CPF — espera
  await page.waitForTimeout(2500)

  await ag.preencher(page, ['nome', 'nomeSegurado'], dados.nome)
  await ag.preencher(page, ['dataNasc', 'dataNascimento'], dados.nascimento)
  await ag.preencher(page, ['cep', 'cepImovel'], dados.cep)
  await ag.preencher(page, ['email', 'emailSegurado'], dados.email)
  await ag.preencher(page, ['fone'], dados.telefone)
  // Sexo e Estado Civil do segurado: primeiro mat-select com cada nome
  if (dados.sexo_segurado)         await ag.selecionarPorIndex(page, 'sexo', 0, dados.sexo_segurado)
  if (dados.estado_civil_segurado) await ag.selecionarPorIndex(page, 'estadoCivil', 0, dados.estado_civil_segurado)

  // ─── 2) Veículo ────────────────────────────────────────────
  await ag.preencher(page, ['placa'], dados.placa)
  // Aggilizador busca dados do veículo pela placa — espera
  await page.waitForTimeout(2500)

  await ag.preencher(page, ['chassi'], dados.chassi)
  await ag.preencher(page, ['anoFab'], dados.ano_fab)
  await ag.preencher(page, ['modelo'], dados.modelo)
  await ag.preencher(page, ['cepPernoite', 'perfilCepPernoite'], dados.cep_pernoite)
  await ag.selecionar(page, ['anoMod'],         dados.ano_mod)
  await ag.selecionar(page, ['zeroKm'],         dados.zero_km)
  await ag.selecionar(page, ['combustivel'],    dados.combustivel)
  await ag.selecionar(page, ['rastreador'],     dados.rastreador)
  await ag.selecionar(page, ['dispAntiFurto'],  dados.antifurto)
  await ag.selecionar(page, ['blindado'],       dados.blindado)
  await ag.selecionar(page, ['kitGas'],         dados.kit_gas)
  if (dados.kit_gas === 'Sim' && dados.valor_kit_gas) {
    await ag.preencher(page, ['gasInstalValor'], dados.valor_kit_gas)
  }
  await ag.selecionar(page, ['alienado'],       dados.alienado)

  // ─── 3) Condutor ───────────────────────────────────────────
  // ATENÇÃO: usar SEMPRE o nome específico do condutor PRIMEIRO
  // (perfilCpfCnpj, perfilNomeCondutor, perfilDataNascimento). Ambos os
  // campos do condutor e do segurado compartilham formcontrolname (cpfCnpj/
  // nome/dataNasc), então se passar o genérico antes, sobrescreveremos o
  // segurado por engano.
  if (dados.condutor_principal) await ag.selecionar(page, ['perfilRelacaoSegurado','relacaoSegurado'], dados.condutor_principal)
  await ag.preencher(page, ['perfilCpfCnpj'],          dados.cpf_condutor)
  await ag.preencher(page, ['perfilNomeCondutor'],     dados.nome_condutor)
  await ag.preencher(page, ['perfilDataNascimento'],   dados.nascimento_condutor)
  // Sexo e Estado Civil do CONDUTOR: segundo mat-select com cada nome
  if (dados.sexo_condutor)         await ag.selecionarPorIndex(page, 'sexo', 1, dados.sexo_condutor)
  if (dados.estado_civil_condutor) await ag.selecionarPorIndex(page, 'estadoCivil', 1, dados.estado_civil_condutor)
  // tempoHabilitacao depende do estadoCivil/dataNasc estarem preenchidos
  await page.waitForTimeout(500)
  if (dados.tempo_habilitacao)     await ag.selecionar(page, ['perfilTempoHabilitacao','tempoHabilitacao'], dados.tempo_habilitacao)

  // ─── 4) Questionário ───────────────────────────────────────
  // Os nomes reais (vistos via /listar-opcoes) começam com 'perfil',
  // mas mantemos o fallback pra versões antigas do aggilizador.
  await ag.selecionar(page, ['garagemResidencia'],       dados.garagem_residencia)
  await ag.selecionar(page, ['garagemTrabalho'],         dados.garagem_trabalho)
  await ag.selecionar(page, ['garagemEstudo'],           dados.garagem_estudo)
  await ag.selecionar(page, ['perfilTpUso','tpUso'],     dados.tipo_uso)
  await ag.selecionar(page, ['perfilTipoResidencia','tipoResidencia'], dados.tipo_residencia)
  await ag.selecionar(page, ['perfilKmMensal','kmMensal'], dados.quilometragem)

  if (dados.jovem_condutor === 'Sim') {
    await ag.selecionar(page, ['perfilJovemCondutor','jovemCondutor'], 'Sim')
    // Espera Angular reabilitar idadeJovem/jovemSexo
    await page.waitForTimeout(700)
    if (dados.idade_mais_novo) await ag.selecionar(page, ['perfilIdadeJovem','idadeJovem'], dados.idade_mais_novo)
    if (dados.sexo_jovens)     await ag.selecionar(page, ['perfilJovemSexo','jovemSexo'],  dados.sexo_jovens)
  } else {
    await ag.selecionar(page, ['perfilJovemCondutor','jovemCondutor'], 'Não')
  }
  await ag.selecionar(page, ['isPCD'], dados.pcd)
  // isencaoFiscal por padrão é desabilitado — só tenta se PCD=Sim
  if (dados.pcd === 'Sim' && dados.isencao_fiscal) {
    await page.waitForTimeout(500)
    await ag.selecionar(page, ['isencaoFiscal'], dados.isencao_fiscal)
  }

  // ─── 5) Vigência e Renovação ───────────────────────────────
  await ag.preencher(page, ['vigenciaIni'], dados.inicio_vigencia)
  await ag.preencher(page, ['vigenciaFim'], dados.final_vigencia)

  if (dados.renovacao === 'Sim') {
    // Marca o checkbox de renovação se não estiver marcado
    const checked = await page.$eval('input[id="mat-mdc-checkbox-1-input"]', el => el.checked).catch(() => false)
    if (!checked) {
      await page.click('label[for="mat-mdc-checkbox-1-input"]', { force: true }).catch(() => {})
      await page.waitForTimeout(400)
    }
    await ag.preencher(page, ['vigFimAnterior'], dados.final_vigencia_anterior)
    await ag.preencher(page, ['numeroRenovacao'], dados.numero_apolice_anterior)
    await ag.preencher(page, ['CI'], dados.codigo_interno)
    await ag.selecionar(page, ['seguradoraAnteriorId'], dados.seguradora_anterior)
    await ag.selecionar(page, ['sinistrosAnterior'],    dados.qtd_sinistros)
    await ag.selecionar(page, ['bonusAnterior'],        dados.novo_bonus)
  }

  // ─── 6) Coberturas ─────────────────────────────────────────
  // Atenção aos nomes reais dos selects no aggilizador:
  //   tipoCobertura     → pacote (Prata/Ouro/Diamante/Personalizada)
  //   tpCobertura       → Tipo de Cobertura (Compreensiva/RCF/Roubo/Furto)
  //   descricaoFranquia → Tipo de Franquia (Reduzida/Normal/Majorada)
  //   pctAjuste         → Fipe (%) — opções com espaço, ex: "100 %"
  // Selecionar "Personalizada" no pacote habilita os campos individuais.
  // Angular precisa de ~1.5s pra propagar a mudança e reabilitar os campos.
  await ag.selecionar(page, ['tipoCobertura'], dados.pacote_cobertura || 'Personalizada')
  await page.waitForTimeout(1500)
  await ag.selecionar(page, ['tpCobertura'],       dados.tipo_cobertura)
  await ag.selecionar(page, ['descricaoFranquia'], dados.tipo_franquia)
  await ag.selecionar(page, ['pctAjuste'],         dados.fipe_pct)

  // Coberturas em valor R$ — convertem strings tipo "10.000" pro input.
  // Se vier "Não", deixa em branco.
  const limparValor = v => (v && v !== 'Não' && v !== 'Ilimitado') ? String(v).replace(/\D/g, '') : ''
  await ag.preencher(page, ['isDanosMateriais'],   limparValor(dados.danos_materiais))
  await ag.preencher(page, ['isDanosCorporais'],   limparValor(dados.danos_corporais))
  await ag.preencher(page, ['isDanosMorais'],      limparValor(dados.danos_morais))
  await ag.preencher(page, ['isAppMorte'],         limparValor(dados.morte_invalidez))
  await ag.preencher(page, ['isBlindagemValor'],   limparValor(dados.blindagem))

  await ag.selecionar(page, ['assist24hs'],     dados.assistencia)
  await ag.selecionar(page, ['vidros'],         dados.vidros)
  await ag.selecionar(page, ['carroReserva'],   dados.carro_reserva)

  // ─── 6.5) Validar formulário antes do Calcular #1 ──────────
  // Força blur em todos os campos pra Angular marcar os "touched"
  // e depois escaneia mat-form-field-invalid / mat-error / required vazios.
  await ag.forcarValidacao(page)
  await page.waitForTimeout(400)
  const validacao = await ag.verificarErrosFormulario(page)
  if (!validacao.ok) {
    log.warn('Formulário tem problemas antes do Calcular', { problemas: validacao.problemas })
    // Aborta com mensagem amigável — o screenshot é capturado de qualquer forma
    const lista = validacao.problemas.slice(0, 12)
      .map(p => `• ${p.campo}: ${p.motivo}${p.valor?` (atual: "${p.valor}")`:''}`)
      .join('\n')
    const screenshot = (await page.screenshot({ type: 'png', fullPage: true })).toString('base64')
    return {
      ok: false,
      erro: 'Formulário inválido — não cliquei em Calcular',
      problemas: validacao.problemas,
      detalhe: lista,
      screenshot,
    }
  }
  log.info('Formulário validado — sem erros aparentes')

  // ─── 7) Calcular ───────────────────────────────────────────
  // O aggilizador tem DOIS passos de Calcular:
  //   1º — fim do formulário → vai pra tela de seleção de seguradoras
  //   2º — na tela de seguradoras (Bradesco, Itaú, Porto, etc.) →
  //        dispara o cálculo real, mostra preços
  // Estratégia: clica, espera, e se ainda não apareceu "R$" no DOM
  // e ainda há um botão Calcular visível, clica de novo.

  // Calcular #1 — abre a tela de seguradoras. Dispara o click via DOM
  // pra contornar overlays de mat-select que possam ter ficado.
  const clicou1 = await page.evaluate(() => {
    // Limpa qualquer overlay residual primeiro
    document.querySelectorAll('.cdk-overlay-backdrop').forEach(b => { try { b.click() } catch (e) {} })
    const btns = Array.from(document.querySelectorAll('button'))
    const alvo = btns.find(b => /calcular/i.test(b.textContent || '') && !/configurar/i.test(b.textContent || '') && !b.disabled)
    if (!alvo) return false
    alvo.scrollIntoView({ block: 'center' })
    const o = { bubbles: true, cancelable: true, view: window, button: 0 }
    try { alvo.dispatchEvent(new PointerEvent('pointerdown', o)) } catch (e) {}
    try { alvo.dispatchEvent(new MouseEvent('mousedown', o)) } catch (e) {}
    try { alvo.click() } catch (e) {}
    return true
  })
  if (!clicou1) throw new Error('Botão Calcular #1 não foi encontrado/habilitado')
  log.info('Clicou em Calcular #1 (formulário → seguradoras)')
  await page.waitForTimeout(4500)

  // Helper robusto pra clicar no Calcular da tela de seguradoras
  async function tentarCalcularSeguradoras(label) {
    // Localiza o botão preferindo o azul/filled e excluindo "Configurar"
    const candidatos = [
      'button.my-btn--filled:has-text("Calcular")',
      'button:has-text("Calcular"):not(:has-text("Configurar"))',
      'button.btn-primary:has-text("Calcular")',
      'button[type="submit"]:has-text("Calcular")',
    ]
    for (const sel of candidatos) {
      const loc = page.locator(sel).first()
      const visivel = await loc.isVisible().catch(() => false)
      if (!visivel) continue

      // Espera ficar habilitado (até 8s)
      try { await loc.waitFor({ state: 'visible', timeout: 3000 }) } catch {}
      const desabilitado = await loc.evaluate((el) => (el).hasAttribute('disabled') || (el).getAttribute('aria-disabled') === 'true').catch(() => false)
      if (desabilitado) {
        // Tenta esperar habilitar
        for (let w = 0; w < 8; w++) {
          await page.waitForTimeout(1000)
          const ainda = await loc.evaluate((el) => (el).hasAttribute('disabled')).catch(() => true)
          if (!ainda) break
        }
      }

      await loc.scrollIntoViewIfNeeded().catch(() => {})
      try {
        await loc.click({ force: true, timeout: 5000 })
        log.info(`${label} via ${sel}`)
        return true
      } catch (e) {
        // Fallback: dispatchEvent('click')
        try {
          await loc.evaluate((el) => (el).click())
          log.info(`${label} via dispatchEvent (${sel})`)
          return true
        } catch {}
      }
    }
    return false
  }

  // Tenta clicar em "Calcular" de novo (até 4 vezes ou até aparecer R$).
  for (let i = 0; i < 4; i++) {
    const temPreco = await page.locator('text=/R\\$\\s*\\d{2,}/').count().then(c => c > 0).catch(() => false)
    if (temPreco) {
      log.info(`Preços apareceram após ${i+1} tentativa(s) de Calcular`)
      break
    }

    const ok = await tentarCalcularSeguradoras(`Calcular #${i+2}`)
    if (!ok) {
      log.info('Botão Calcular não está mais visível/clicável — aguardando resultado')
      break
    }
    await page.waitForTimeout(4000)
  }

  // Espera o resultado final (heurística: aparece "R$" várias vezes ou passa 90s)
  const inicio = Date.now()
  while (Date.now() - inicio < 90000) {
    const tem = await page.locator('text=/R\\$\\s*\\d{2,}/').count().then(c => c > 1).catch(() => false)
    if (tem) break
    await page.waitForTimeout(1500)
  }

  // ─── 8) Capturar resultado ─────────────────────────────────
  const resultado = await ag.extrairResultado(page)
  const screenshot = (await page.screenshot({ type: 'png', fullPage: true })).toString('base64')

  log.info('Cotação concluída', { precos: resultado?.precos_encontrados?.length || 0 })

  return {
    ok: true,
    resultado,
    screenshot,
  }
}

module.exports = { cotacaoAuto }
