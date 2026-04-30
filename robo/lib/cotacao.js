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
  if (dados.condutor_principal) await ag.selecionar(page, ['relacaoSegurado'], dados.condutor_principal)
  await ag.preencher(page, ['cpfCnpj', 'perfilCpfCnpj'], dados.cpf_condutor)
  await ag.preencher(page, ['nome', 'perfilNomeCondutor'], dados.nome_condutor)
  await ag.preencher(page, ['dataNasc', 'perfilDataNascimento'], dados.nascimento_condutor)
  // Sexo e Estado Civil do CONDUTOR: segundo mat-select com cada nome
  if (dados.sexo_condutor)         await ag.selecionarPorIndex(page, 'sexo', 1, dados.sexo_condutor)
  if (dados.estado_civil_condutor) await ag.selecionarPorIndex(page, 'estadoCivil', 1, dados.estado_civil_condutor)
  if (dados.tempo_habilitacao)     await ag.selecionar(page, ['tempoHabilitacao'], dados.tempo_habilitacao)

  // ─── 4) Questionário ───────────────────────────────────────
  await ag.selecionar(page, ['garagemResidencia'], dados.garagem_residencia)
  await ag.selecionar(page, ['garagemTrabalho'],   dados.garagem_trabalho)
  await ag.selecionar(page, ['garagemEstudo'],     dados.garagem_estudo)
  await ag.selecionar(page, ['tpUso'],             dados.tipo_uso)
  await ag.selecionar(page, ['tipoResidencia'],    dados.tipo_residencia)
  await ag.selecionar(page, ['kmMensal'],          dados.quilometragem)

  if (dados.jovem_condutor === 'Sim') {
    await ag.selecionar(page, ['jovemCondutor'], 'Sim')
    if (dados.idade_mais_novo) await ag.selecionar(page, ['idadeJovem'], dados.idade_mais_novo)
    if (dados.sexo_jovens)     await ag.selecionar(page, ['jovemSexo'],  dados.sexo_jovens)
  } else {
    await ag.selecionar(page, ['jovemCondutor'], 'Não')
  }
  await ag.selecionar(page, ['isPCD'],         dados.pcd)
  await ag.selecionar(page, ['isencaoFiscal'], dados.isencao_fiscal)

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
  await ag.selecionar(page, ['tipoCobertura'], dados.tipo_cobertura)
  await ag.selecionar(page, ['tipoFranquia'],  dados.tipo_franquia)
  await ag.selecionar(page, ['pctAjuste'],     dados.fipe_pct)

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

  // ─── 7) Calcular ───────────────────────────────────────────
  // O aggilizador tem DOIS passos de Calcular:
  //   1º — fim do formulário → vai pra tela de seleção de seguradoras
  //   2º — na tela de seguradoras (Bradesco, Itaú, Porto, etc.) →
  //        dispara o cálculo real, mostra preços
  // ATENÇÃO: a tela de seguradoras tem 3 botões (Voltar, Salvar, Calcular).
  // Não basta procurar por my-btn--filled — pega o Salvar disabled. Tem
  // que filtrar especificamente pelo texto "Calcular" e usar last() pra
  // pegar o azul à direita, ignorando botões disabled.
  //
  // Após o Calcular, pode aparecer um modal "Item calculado recentemente"
  // com botão "Entendi, continuar" — dismissarPopupConfirmacao() trata isso.

  async function dismissarPopupConfirmacao() {
    const seletores = [
      'button:has-text("Entendi, continuar")',
      'button:has-text("Entendi")',
      'button:has-text("Continuar")',
      'button:has-text("OK")',
      'button:has-text("Confirmar")',
    ]
    for (const sel of seletores) {
      try {
        const btn = page.locator(sel).first()
        if (await btn.isVisible({ timeout: 500 }).catch(() => false)) {
          await btn.click({ force: true })
          log.info('Dismissou popup de confirmação', { botao: sel })
          await page.waitForTimeout(800)
          return true
        }
      } catch {}
    }
    return false
  }

  const btnCalcular = await page.$('button:has-text("Calcular"):not(:has-text("Configurar"))')
  if (!btnCalcular) throw new Error('Botão Calcular não foi encontrado')
  const urlAntes = page.url()
  await btnCalcular.click({ force: true })
  log.info('Clicou em Calcular #1 (formulário → seguradoras)')
  await page.waitForTimeout(6000)
  // Pode aparecer popup "Item calculado recentemente" — dismissa
  await dismissarPopupConfirmacao()
  log.info('Estado após Calcular #1', { url_antes: urlAntes, url_agora: page.url() })

  // Loop: até clicar no Calcular da tela de seguradoras (até 2 cliques extras).
  // Espera mais tempo entre cliques porque o cálculo real é lento (15-30s).
  for (let i = 0; i < 2; i++) {
    const temPreco = await page.locator('text=/R\\$\\s*\\d/').count().then(c => c > 2).catch(() => false)
    if (temPreco) {
      log.info(`Preços detectados após ${i+1} click(s) extra(s)`)
      break
    }

    // Procura SOMENTE botões habilitados (sem [disabled]) com texto Calcular
    const btnNext = page.locator('button:not([disabled]):has-text("Calcular")').last()
    const visivel = await btnNext.isVisible().catch(() => false)
    const habilitado = await btnNext.isEnabled().catch(() => false)
    if (!visivel || !habilitado) {
      log.info('Calcular não disponível — aguardando resultados', { visivel, habilitado })
      break
    }

    await btnNext.click({ force: true }).catch(() => {})
    log.info(`Clicou em Calcular #${i+2} (seguradoras → resultados)`)
    // Pode aparecer popup "Item calculado recentemente" também aqui
    await page.waitForTimeout(2000)
    await dismissarPopupConfirmacao()
    // Cálculo real pode demorar — aguarda 13s antes do próximo check
    await page.waitForTimeout(13000)
  }

  // Espera o resultado final (até 90s)
  const inicio = Date.now()
  while (Date.now() - inicio < 90000) {
    const tem = await page.locator('text=/R\\$\\s*\\d/').count().then(c => c > 2).catch(() => false)
    if (tem) break
    await page.waitForTimeout(2000)
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
