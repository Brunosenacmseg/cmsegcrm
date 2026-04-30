// Consulta rápida: digita CPF no aggilizador e captura o que ele auto-preenche.
// Não calcula nada, só pega os dados básicos (nome, nascimento, sexo, etc.)
// Mapeamento dos campos descobertos via /debug-cotacao no formulário
// /cotacao/auto/formulario do aggilizador.

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

  // O Angular do aggilizador busca os dados após preenchimento + blur.
  // O blur já é disparado pelo helper preencher().
  // Esperar o nome aparecer (até 10s).
  const inicio = Date.now()
  let nome = ''
  while (Date.now() - inicio < 10000) {
    nome = await ag.lerCampo(page, ['nome', 'nomeSegurado']) || ''
    if (nome && nome.length > 3) break
    await page.waitForTimeout(500)
  }

  // Lê todos os campos preenchidos automaticamente
  const dados = {
    nome:         await ag.lerCampo(page, ['nome', 'nomeSegurado']),
    nascimento:   await ag.lerCampo(page, ['dataNasc', 'dataNascimento']),
    cep:          await ag.lerCampo(page, ['cep', 'cepImovel']),
    telefone:     await ag.lerCampo(page, ['fone']),
    email:        await ag.lerCampo(page, ['email', 'emailSegurado']),
  }

  // Os selects (sexo, estado_civil) precisariam ser lidos diferente em mat-select.
  // Por enquanto pulamos — o usuário pode preencher manualmente.

  // Limpar nulls/vazios
  for (const k of Object.keys(dados)) if (!dados[k]) delete dados[k]

  log.info('Consulta concluída', { campos: Object.keys(dados), achouNome: !!nome })
  return { encontrado: Object.keys(dados).length > 0, dados }
}

module.exports = { consultarCpf }
