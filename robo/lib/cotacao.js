// Fluxo de cotação completa de automóvel. Reaproveita os helpers do aggilizador.

const log = require('./log')
const ag  = require('./aggilizador')

async function cotacaoAuto(page, dados) {
  log.info('Iniciando cotação auto', { cpf: (dados.cpf || '').slice(0,3) + '***', placa: dados.placa })

  await ag.login(page)
  await ag.abrirCotacaoAuto(page)

  // ─── 1) Segurado ───────────────────────────────────────────
  await ag.preencher(page, ['cpf','cpf_cnpj','documento'], dados.cpf)
  // Aggilizador auto-preenche nome+nascimento+sexo a partir do CPF
  await page.waitForTimeout(2000)

  await ag.preencher(page, ['nome','nome_segurado','nome_completo'], dados.nome)
  await ag.preencher(page, ['nascimento','data_nascimento','dt_nascimento'], dados.nascimento)
  await ag.preencher(page, ['cep','cep_residencial'], dados.cep)
  await ag.preencher(page, ['email'], dados.email)
  await ag.preencher(page, ['telefone','celular','fone'], dados.telefone)
  await ag.selecionar(page, ['sexo'], dados.sexo_segurado)
  await ag.selecionar(page, ['estado_civil','estadoCivil'], dados.estado_civil_segurado)

  await ag.clicarProximo(page)
  await page.waitForTimeout(1500)

  // ─── 2) Veículo ────────────────────────────────────────────
  await ag.preencher(page, ['placa'], dados.placa)
  // Aggilizador busca dados do veículo pela placa
  await page.waitForTimeout(2500)

  if (dados.zero_km === 'Sim') {
    const el = await page.$('[name="zero_km"], [data-field="zero_km"]')
    if (el) await el.click()
  }
  await ag.preencher(page, ['ano_fabricacao','ano_fab','anoFabricacao'], dados.ano_fab)
  await ag.preencher(page, ['ano_modelo','ano_mod','anoModelo'], dados.ano_mod)
  await ag.preencher(page, ['modelo','veiculo','descricao_veiculo'], dados.modelo)
  await ag.preencher(page, ['cep_pernoite','cepPernoite'], dados.cep_pernoite)
  await ag.selecionar(page, ['combustivel'], dados.combustivel)
  await ag.selecionar(page, ['rastreador'], dados.rastreador)
  await ag.selecionar(page, ['antifurto','dispositivo_antifurto'], dados.antifurto)
  await ag.selecionar(page, ['blindado'], dados.blindado)
  await ag.selecionar(page, ['kit_gas','kitGas'], dados.kit_gas)
  await ag.selecionar(page, ['alienado'], dados.alienado)

  await ag.clicarProximo(page)
  await page.waitForTimeout(1500)

  // ─── 3) Condutor ───────────────────────────────────────────
  await ag.preencher(page, ['cpf_condutor','cpfCondutor'], dados.cpf_condutor)
  await ag.preencher(page, ['nome_condutor','nomeCondutor'], dados.nome_condutor)
  await ag.preencher(page, ['nascimento_condutor','dtNascimentoCondutor'], dados.nascimento_condutor)
  await ag.selecionar(page, ['sexo_condutor','sexoCondutor'], dados.sexo_condutor)
  await ag.selecionar(page, ['estado_civil_condutor'], dados.estado_civil_condutor)
  await ag.selecionar(page, ['tempo_habilitacao','tempoHabilitacao'], dados.tempo_habilitacao)

  await ag.clicarProximo(page)
  await page.waitForTimeout(1500)

  // ─── 4) Questionário ───────────────────────────────────────
  await ag.selecionar(page, ['garagem_residencia','garagemResidencia'], dados.garagem_residencia)
  await ag.selecionar(page, ['garagem_trabalho','garagemTrabalho'], dados.garagem_trabalho)
  await ag.selecionar(page, ['garagem_estudo','garagemEstudo'], dados.garagem_estudo)
  await ag.selecionar(page, ['tipo_uso','tipoUso'], dados.tipo_uso)
  await ag.selecionar(page, ['tipo_residencia','tipoResidencia'], dados.tipo_residencia)
  await ag.selecionar(page, ['quilometragem'], dados.quilometragem)

  if (dados.jovem_condutor === 'Sim') {
    await ag.selecionar(page, ['jovem_condutor','jovemCondutor'], 'Sim')
    await ag.preencher(page, ['idade_mais_novo','idadeMaisNovo'], dados.idade_mais_novo)
    await ag.selecionar(page, ['sexo_jovens','sexoJovens'], dados.sexo_jovens)
  }
  if (dados.pcd === 'Sim')            await ag.selecionar(page, ['pcd'], 'Sim')
  if (dados.isencao_fiscal === 'Sim') await ag.selecionar(page, ['isencao_fiscal','isencaoFiscal'], 'Sim')

  await ag.clicarProximo(page)
  await page.waitForTimeout(1500)

  // ─── 5) Seguro / Coberturas ────────────────────────────────
  await ag.preencher(page, ['inicio_vigencia','inicioVigencia','dt_inicio'], dados.inicio_vigencia)
  await ag.preencher(page, ['final_vigencia','fimVigencia','dt_fim'], dados.final_vigencia)

  if (dados.renovacao === 'Sim') {
    await ag.selecionar(page, ['renovacao'], 'Sim')
    await ag.selecionar(page, ['seguradora_anterior'], dados.seguradora_anterior)
    await ag.preencher(page, ['numero_apolice_anterior','apoliceAnterior'], dados.numero_apolice_anterior)
    await ag.selecionar(page, ['novo_bonus','novoBonus'], dados.novo_bonus)
    await ag.preencher(page, ['qtd_sinistros','qtdSinistros'], dados.qtd_sinistros)
  }

  await ag.selecionar(page, ['tipo_cobertura','tipoCobertura'], dados.tipo_cobertura)
  await ag.selecionar(page, ['tipo_franquia','tipoFranquia'], dados.tipo_franquia)
  await ag.selecionar(page, ['fipe','fipe_pct','percentualFipe'], dados.fipe_pct)
  await ag.selecionar(page, ['danos_materiais','danosMateriais'], dados.danos_materiais)
  await ag.selecionar(page, ['danos_corporais','danosCorporais'], dados.danos_corporais)
  await ag.selecionar(page, ['danos_morais','danosMorais'], dados.danos_morais)
  await ag.selecionar(page, ['morte_invalidez','morteInvalidez'], dados.morte_invalidez)
  await ag.selecionar(page, ['assistencia'], dados.assistencia)
  await ag.selecionar(page, ['vidros'], dados.vidros)
  await ag.selecionar(page, ['carro_reserva','carroReserva'], dados.carro_reserva)
  await ag.preencher(page, ['comissao','comissao_pct','percentualComissao'], dados.comissao_pct)

  // ─── 6) Calcular ───────────────────────────────────────────
  const clicou = await ag.clicarCalcular(page)
  if (!clicou) throw new Error('Botão Calcular não foi encontrado')

  // Espera o resultado (heurística: aparece "R$" no DOM ou passa 30s)
  const inicio = Date.now()
  while (Date.now() - inicio < 30000) {
    const tem = await page.locator('text=/R\\$\\s*\\d/').first().isVisible().catch(() => false)
    if (tem) break
    await page.waitForTimeout(800)
  }

  // ─── 7) Capturar resultado ─────────────────────────────────
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
