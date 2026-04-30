// Consultas rápidas no aggilizador (sem fazer cotação completa).
//   consultarCpf:   preenche CPF e captura nome/nascimento/cep auto-preenchidos
//   consultarPlaca: preenche placa e captura modelo/ano/fipe/etc.

const log = require('./log')
const ag  = require('./aggilizador')

async function consultarCpf(page, cpf) {
  log.info('Consultando CPF', { cpf: cpf.slice(0, 3) + '***' })

  await ag.login(page)
  await ag.abrirCotacaoAuto(page)

  // Esperar formulário aparecer (cpfCnpj é o primeiro input)
  try {
    await page.waitForSelector('input[formcontrolname="cpfCnpj"]', { state: 'visible', timeout: 15000 })
  } catch {
    throw new Error('Formulário de cotação não carregou (campo CPF não apareceu)')
  }

  const ok = await ag.preencher(page, ['cpfCnpj'], cpf)
  if (!ok) throw new Error('Não consegui preencher o campo CPF')

  // Aggilizador busca os dados após preenchimento + blur (Tab).
  // Esperar o nome aparecer (até 12s).
  const inicio = Date.now()
  let nome = ''
  while (Date.now() - inicio < 12000) {
    nome = await ag.lerCampo(page, ['nome', 'nomeSegurado']) || ''
    if (nome && nome.length > 3) break
    await page.waitForTimeout(500)
  }

  const dados = {
    nome:         await ag.lerCampo(page, ['nome', 'nomeSegurado']),
    nascimento:   await ag.lerCampo(page, ['dataNasc', 'dataNascimento']),
    cep:          await ag.lerCampo(page, ['cep', 'cepImovel']),
    telefone:     await ag.lerCampo(page, ['fone']),
    email:        await ag.lerCampo(page, ['email', 'emailSegurado']),
    sexo:         await ag.lerMatSelect(page, ['sexo']),
    estado_civil: await ag.lerMatSelect(page, ['estadoCivil']),
  }

  for (const k of Object.keys(dados)) if (!dados[k]) delete dados[k]

  log.info('Consulta CPF concluída', { campos: Object.keys(dados), achouNome: !!nome })
  return { encontrado: Object.keys(dados).length > 0, dados }
}

async function consultarPlaca(page, placa) {
  const placaLimpa = (placa || '').toUpperCase().replace(/\W/g, '')
  log.info('Consultando placa', { placa: placaLimpa })

  await ag.login(page)
  await ag.abrirCotacaoAuto(page)

  // Esperar formulário aparecer
  try {
    await page.waitForSelector('input[formcontrolname="placa"]', { state: 'visible', timeout: 15000 })
  } catch {
    throw new Error('Formulário de cotação não carregou (campo placa não apareceu)')
  }

  const ok = await ag.preencher(page, ['placa'], placaLimpa)
  if (!ok) throw new Error('Não consegui preencher o campo placa')

  // Aggilizador busca os dados do veículo após preenchimento + blur.
  // Esperar o modelo aparecer (até 15s — busca FIPE pode ser lenta).
  const inicio = Date.now()
  let modelo = ''
  while (Date.now() - inicio < 15000) {
    modelo = await ag.lerCampo(page, ['modelo']) || ''
    if (modelo && modelo.length > 3) break
    await page.waitForTimeout(500)
  }

  const dados = {
    modelo:           await ag.lerCampo(page, ['modelo']),
    chassi:           await ag.lerCampo(page, ['chassi']),
    ano_fab:          await ag.lerCampo(page, ['anoFab']),
    fipe:             await ag.lerCampo(page, ['fipe']),
    valor_referencia: await ag.lerCampo(page, ['valReferenciado']),
    ano_mod:          await ag.lerMatSelect(page, ['anoMod']),
    combustivel:      await ag.lerMatSelect(page, ['combustivel']),
  }

  for (const k of Object.keys(dados)) if (!dados[k]) delete dados[k]

  log.info('Consulta placa concluída', { campos: Object.keys(dados), achouModelo: !!modelo })
  return { encontrado: Object.keys(dados).length > 0, dados }
}

module.exports = { consultarCpf, consultarPlaca }
