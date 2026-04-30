// Fluxo de cotação completa de automóvel no aggilizador.
// Mapeamento confirmado via /listar-opcoes em /cotacao/auto/formulario:
//
// SEGURADO: cpfCnpj, nomeSegurado, dataNascimento, cepImovel, fone, emailSegurado
//   selects: sexo, estadoCivil
//
// VEÍCULO:  placa, chassi, anoFab, fipe, modelo, valReferenciado, perfilCepPernoite, gasInstalValor
//   selects: anoMod (disabled→habilitado após placa), zeroKm, combustivel,
//            rastreador, dispAntiFurto, blindado, kitGas, alienado
//
// CONDUTOR: perfilCpfCnpj, perfilNomeCondutor, perfilDataNascimento
//   selects: perfilRelacaoSegurado, perfilSexo, perfilEstadoCivil,
//            perfilTempoHabilitacao (disabled→habilitado após dataNasc)
//
// QUESTIONÁRIO: garagemResidencia, garagemTrabalho, garagemEstudo,
//   perfilTpUso, perfilJovemCondutor, perfilIdadeJovem (disabled),
//   perfilJovemSexo (disabled), perfilTipoResidencia, perfilKmMensal,
//   isPCD, isencaoFiscal (disabled)
//
// SEGURO: vigenciaIni, vigenciaFim (DD/MM/YYYY)
// RENOVAÇÃO: vigFimAnterior, numeroRenovacao, CI
//   selects: seguradoraAnteriorId, sinistrosAnterior, bonusAnterior
//   checkbox: name="renovacao"
//
// COBERTURAS:
//   tipoCobertura     → pacote (Prata/Ouro/Diamante/Personalizada)
//   tpCobertura       → Tipo (Compreensiva/RCF/Roubo/Furto)
//   descricaoFranquia → Tipo de Franquia (Reduzida/Normal/Majorada)
//   pctAjuste         → Fipe (%) com espaço (ex: "100 %")
//   inputs valor:     isDanosMateriais, isDanosCorporais, isDanosMorais,
//                     isAppMorte, isBlindagemValor
//   selects:          assist24hs, vidros, carroReserva, carroReservaAr

const log = require('./log')
const ag  = require('./aggilizador')

// Converte YYYY-MM-DD → DD/MM/YYYY. Aceita DD/MM/YYYY pronto e devolve igual.
// Aggilizador usa máscaras BR; mandar formato HTML (YYYY-MM-DD) gera campo
// inválido sem mensagem clara.
function formatarDataBr(d) {
  if (!d) return ''
  const s = String(d).trim()
  // já em DD/MM/YYYY
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return s
  // YYYY-MM-DD (HTML date input)
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[3]}/${m[2]}/${m[1]}`
  return s
}

// Traduz valores antigos do CRM pros valores reais do aggilizador atual.
// Assim o robô aceita tanto frontend antigo (pré-merge) quanto novo.
// Cada chave é um campo de `dados`; o map faz lookup case-insensitive.
function sanitizarDados(dados) {
  const d = { ...dados }
  const lookup = (map, valor) => {
    if (!valor) return valor
    const k = String(valor).trim().toLowerCase()
    for (const [from, to] of Object.entries(map)) {
      if (from.toLowerCase() === k) return to
    }
    return valor
  }

  // Fipe %: '100%' (sem espaço) → '100 %' (com espaço)
  if (d.fipe_pct && /^\d+\s*%$/.test(d.fipe_pct)) {
    d.fipe_pct = d.fipe_pct.replace(/(\d+)\s*%/, '$1 %')
  }

  // Assistência: valores antigos Sim/Não → Básica/Não
  d.assistencia = lookup({ 'Sim': 'Básica', 'Não': 'Não' }, d.assistencia)

  // Vidros: nomenclatura antiga (franquia) → novas opções
  d.vidros = lookup({
    'Franquia Normal':   'Completo',
    'Franquia Reduzida': 'Básico',
    'Sem Franquia':      'Completo',
    'Não':               'Não',
  }, d.vidros)

  // Condutor Principal: 'Sim'/'Não' → 'Próprio'/'Outros'
  d.condutor_principal = lookup({ 'Sim': 'Próprio', 'Não': 'Outros' }, d.condutor_principal)

  // Tipo de cobertura: o valor antigo do CRM era o pacote completo.
  // Mapeamos pra Compreensiva (que vai em tpCobertura) e definimos pacote.
  if (d.tipo_cobertura && /^compreensiv/i.test(d.tipo_cobertura)) {
    d.tipo_cobertura = 'Compreensiva'
  }
  if (!d.pacote_cobertura) d.pacote_cobertura = 'Personalizada'

  // Carro reserva: dias soltos → Básico N dias
  d.carro_reserva = lookup({
    '7 dias':  'Básico 7 dias',
    '14 dias': 'Básico 15 dias',
    '15 dias': 'Básico 15 dias',
    '21 dias': 'Básico 30 dias',
    '28 dias': 'Básico 30 dias',
    '30 dias': 'Básico 30 dias',
    'Não':     'Não contratar',
  }, d.carro_reserva)

  // Tipo de uso: valores antigos
  d.tipo_uso = lookup({
    'Trabalho': 'Particular',
    'Escola/Faculdade': 'Particular',
    'Lazer': 'Particular',
  }, d.tipo_uso)

  // Tipo de residência
  d.tipo_residencia = lookup({
    'Condomínio fechado': 'Condomínio',
    'Outro': 'Outros',
  }, d.tipo_residencia)

  // Estado civil
  const mapEC = {
    'Casado(a)': 'Casado ou União Estável',
    'União Estável': 'Casado ou União Estável',
  }
  d.estado_civil_segurado = lookup(mapEC, d.estado_civil_segurado)
  d.estado_civil_condutor = lookup(mapEC, d.estado_civil_condutor)

  // Combustível: caixa baixa → MAIÚSCULA (aggilizador usa caixa alta)
  if (d.combustivel) {
    const mapComb = {
      'Flex': 'FLEX', 'Gasolina': 'GASOLINA', 'Álcool': 'ALCOOL',
      'Alcool': 'ALCOOL', 'Diesel': 'DIESEL', 'Elétrico': 'ELÉTRICO',
      'Eletrico': 'ELÉTRICO', 'Híbrido': 'HÍBRIDO', 'Hibrido': 'HÍBRIDO',
      'GNV': 'TETRAFUEL',
    }
    d.combustivel = lookup(mapComb, d.combustivel)
  }

  // Antifurto: valores antigos
  d.antifurto = lookup({
    'Bloqueador': 'Bloqueador de Ignição',
    'Rastreador': 'Outros',
    'Alarme + Bloqueador': 'Alarme',
    'Alarme + Rastreador': 'Alarme',
    'Bloqueador + Rastreador': 'Bloqueador de Ignição',
    'Todos': 'Outros',
  }, d.antifurto)

  // Garagem residência
  d.garagem_residencia = lookup({
    'Com portão automático': 'Com portão eletrônico',
    'Sem portão':            'Não possui garagem',
    'Não possui':            'Não possui garagem',
  }, d.garagem_residencia)

  // Garagem trabalho/estudo
  const mapGarT = {
    'Com portão automático': 'Sim',
    'Com portão manual': 'Sim',
    'Sem portão': 'Não',
  }
  d.garagem_trabalho = lookup(mapGarT, d.garagem_trabalho)
  d.garagem_estudo   = lookup(mapGarT, d.garagem_estudo)

  // Quilometragem: faixas antigas → novas
  d.quilometragem = lookup({
    'De 501 a 1.000 km':    'De 501 km até 800 km',
    'De 1.001 a 2.000 km':  'De 801 km até 1.500 km',
    'De 2.001 a 3.000 km':  'Mais de 1.500 km',
    'Acima de 3.000 km':    'Mais de 1.500 km',
  }, d.quilometragem)

  return d
}

async function cotacaoAuto(page, dados) {
  // Sanitiza valores antigos do CRM antes de qualquer coisa
  dados = sanitizarDados(dados || {})
  log.info('Iniciando cotação auto', { cpf: (dados.cpf || '').slice(0,3) + '***', placa: dados.placa })

  await ag.login(page)
  await ag.abrirCotacaoAuto(page)

  // Esperar formulário aparecer
  await page.waitForSelector('input[formcontrolname="cpfCnpj"]', { state: 'visible', timeout: 15000 })

  // ─── 1) Segurado ───────────────────────────────────────────
  // Order dos arrays: NAME específico primeiro, formcontrolname depois.
  // Segurado e condutor compartilham formcontrolname (cpfCnpj/nome/dataNasc),
  // então o name é a única forma confiável de não cruzar.
  await ag.preencher(page, ['cpfCnpj'], dados.cpf)
  // Aggilizador auto-preenche nome+nascimento+sexo a partir do CPF — espera
  await page.waitForTimeout(2500)
  // Pode aparecer modal de "cliente já cadastrado" — dispensa
  await ag.dismissarOverlays(page)

  // Lê o que o aggilizador auto-preencheu (a partir do CPF). Se dados.nome
  // vier vazio, usa o valor auto-preenchido — assim a cotação não falha
  // por payload incompleto. Se dados.nome veio, sobrescreve.
  const nomeAuto       = await ag.lerCampo(page, ['nomeSegurado', 'nome'])
  const nascimentoAuto = await ag.lerCampo(page, ['dataNascimento', 'dataNasc'])
  const nomeFinal       = (dados.nome || '').trim() || (nomeAuto || '').trim()
  const nascimentoFinal = (dados.nascimento || '').trim() || (nascimentoAuto || '').trim()
  if (!nomeFinal)       log.warn('Nome do segurado vazio (CPF auto-fill falhou e payload sem nome)')
  if (!nascimentoFinal) log.warn('Data de nascimento vazia (CPF auto-fill falhou e payload sem nascimento)')

  await ag.preencher(page, ['nomeSegurado', 'nome'],            nomeFinal)
  await ag.preencher(page, ['dataNascimento', 'dataNasc'],      formatarDataBr(nascimentoFinal))
  await ag.preencher(page, ['cepImovel', 'cep'],                dados.cep)
  await ag.preencher(page, ['emailSegurado', 'email'],          dados.email)
  await ag.preencher(page, ['fone'], dados.telefone)
  // Sexo e Estado Civil do segurado.
  // Quando há ambos (segurado + condutor), o `selecionar` pega o primeiro
  // (segurado). Se condutor=Próprio, o segundo está disabled.
  if (dados.sexo_segurado)         await ag.selecionar(page, ['sexo'], dados.sexo_segurado)
  if (dados.estado_civil_segurado) await ag.selecionar(page, ['estadoCivil'], dados.estado_civil_segurado)

  // ─── 2) Veículo ────────────────────────────────────────────
  await ag.preencher(page, ['placa'], dados.placa)
  // Aggilizador busca dados do veículo pela placa — espera
  await page.waitForTimeout(2500)
  // Pode aparecer modal de seleção FIPE (múltiplos modelos pra mesma placa).
  // Dispensa o overlay antes de continuar pra não bloquear próximos cliques.
  await ag.dismissarOverlays(page)
  await page.waitForTimeout(400)

  await ag.preencher(page, ['chassi'], dados.chassi)
  await ag.preencher(page, ['anoFab'], dados.ano_fab)
  await ag.preencher(page, ['modelo'], dados.modelo)
  // Modelo também pode disparar modal FIPE
  await ag.dismissarOverlays(page)
  await page.waitForTimeout(300)
  await ag.preencher(page, ['perfilCepPernoite', 'cepPernoite'], dados.cep_pernoite)
  await ag.selecionar(page, ['anoMod'],         dados.ano_mod)
  await ag.selecionar(page, ['zeroKm'],         dados.zero_km)
  await ag.selecionar(page, ['combustivel'],    dados.combustivel)
  await ag.selecionar(page, ['rastreador'],     dados.rastreador)
  await ag.selecionar(page, ['dispAntiFurto'],  dados.antifurto)
  await ag.selecionar(page, ['blindado'],       dados.blindado)
  await ag.selecionar(page, ['kitGas'],         dados.kit_gas)
  if (dados.kit_gas === 'Sim' && dados.valor_kit_gas) {
    // O input gasInstalValor aparece apenas depois que o Angular reage
    // ao kitGas=Sim — espera pequena.
    await page.waitForTimeout(500)
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
  // Se relação é Próprio, condutor=segurado e não precisa preencher.
  // Para outros casos, preencher e esperar auto-busca (igual segurado).
  if (dados.cpf_condutor) {
    await ag.preencher(page, ['perfilCpfCnpj'], dados.cpf_condutor)
    await page.waitForTimeout(2000) // aggilizador busca dados pelo CPF
  }
  await ag.preencher(page, ['perfilNomeCondutor'],     dados.nome_condutor)
  await ag.preencher(page, ['perfilDataNascimento'],   formatarDataBr(dados.nascimento_condutor))
  // Sexo e Estado Civil do CONDUTOR têm names específicos (perfilSexo,
  // perfilEstadoCivil). Versões antigas usavam o mesmo "sexo"/"estadoCivil"
  // como segundo índice — manter como fallback.
  if (dados.sexo_condutor) {
    const okSexo = await ag.selecionar(page, ['perfilSexo'], dados.sexo_condutor)
    if (!okSexo) await ag.selecionarPorIndex(page, 'sexo', 1, dados.sexo_condutor)
  }
  if (dados.estado_civil_condutor) {
    const okEC = await ag.selecionar(page, ['perfilEstadoCivil'], dados.estado_civil_condutor)
    if (!okEC) await ag.selecionarPorIndex(page, 'estadoCivil', 1, dados.estado_civil_condutor)
  }
  // tempoHabilitacao só fica habilitado depois que dataNasc do condutor
  // for processada e validada (idade calculada).
  await page.waitForTimeout(800)
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

  // Campos extras que aparecem em alguns veículos (utilitário/caminhão)
  // ou condicionalmente. Tentamos a primeira opção disponível pra cada,
  // pois ficam required mas não têm valor padrão.
  await ag.selecionarPrimeiraOpcaoDisponivel(page, ['perfilTpCarroceria','tpCarroceria'])
  await ag.selecionarPrimeiraOpcaoDisponivel(page, ['perfilAreaCirculacao','areaCirculacao'])
  await ag.selecionarPrimeiraOpcaoDisponivel(page, ['perfilPeriodoUso','periodoUso'])

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
  await ag.preencher(page, ['vigenciaIni'], formatarDataBr(dados.inicio_vigencia))
  await ag.preencher(page, ['vigenciaFim'], formatarDataBr(dados.final_vigencia))

  if (dados.renovacao === 'Sim') {
    // Marca o checkbox de renovação se não estiver marcado
    const checked = await page.$eval('input[id="mat-mdc-checkbox-1-input"]', el => el.checked).catch(() => false)
    if (!checked) {
      await page.click('label[for="mat-mdc-checkbox-1-input"]', { force: true }).catch(() => {})
      await page.waitForTimeout(400)
    }
    await ag.preencher(page, ['vigFimAnterior'], formatarDataBr(dados.final_vigencia_anterior))
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
  // carroReservaAr só é relevante quando há carro reserva
  if (dados.carro_reserva_ar && dados.carro_reserva && dados.carro_reserva !== 'Não contratar') {
    await ag.selecionar(page, ['carroReservaAr'], dados.carro_reserva_ar)
  }

  // Comissão Padrão %: campo sem name/formcontrolname; localizar via label.
  // Default 20 conforme padrão da corretora.
  const comissao = dados.comissao_pct || dados.comissao_padrao || '20'
  await ag.preencherPorLabel(page, 'Comissão Padrão', String(comissao))

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
    const isDisabled = (b) => b.disabled
      || b.getAttribute('disabled') !== null
      || b.getAttribute('aria-disabled') === 'true'
      || b.classList.contains('mat-mdc-button-disabled')
      || b.classList.contains('my-btn--disabled')
    const alvo = btns.find(b => /calcular/i.test(b.textContent || '')
                          && !/configurar/i.test(b.textContent || '')
                          && !isDisabled(b))
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

  // Aguarda a tela de seguradoras aparecer — é caracterizada por múltiplos
  // checkboxes de seguradoras (Bradesco, Itaú, Porto, etc) E o botão
  // Calcular reaparecer. Se não aparecer em 12s, segue com timeout antigo.
  try {
    await page.waitForFunction(() => {
      const txt = document.body.innerText || ''
      const temCheckboxes = document.querySelectorAll('mat-checkbox, input[type="checkbox"]').length >= 3
      const temSeguradoras = /Bradesco|Porto|Allianz|HDI|Itaú|Mapfre|Tokio|Sompo|Liberty|Azul/i.test(txt)
      return temCheckboxes && temSeguradoras
    }, { timeout: 12000 })
    log.info('Tela de seguradoras carregou')
  } catch {
    log.warn('Tela de seguradoras não confirmada em 12s — seguindo')
  }
  await page.waitForTimeout(800)

  // Dispensa popup "Item calculado recentemente" / "Entendi, continuar"
  // que aparece quando o veículo já foi cotado antes
  await ag.dismissarOverlays(page)
  await page.waitForTimeout(400)

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
    // Dispensa overlays antes de checar preços e tentar clicar
    await ag.dismissarOverlays(page)

    const temPreco = await page.locator('text=/R\\$\\s*\\d+/').count().then(c => c > 0).catch(() => false)
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
    // Dispensa popups que podem ter aparecido após o click (ex: "Item
    // calculado recentemente" / "Entendi, continuar")
    await ag.dismissarOverlays(page)
  }

  // Espera o resultado final (heurística: aparece "R$" várias vezes ou passa 90s)
  const inicio = Date.now()
  while (Date.now() - inicio < 90000) {
    const tem = await page.locator('text=/R\\$\\s*\\d+/').count().then(c => c > 1).catch(() => false)
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
