// Consulta rápida: digita CPF no aggilizador e captura o que ele auto-preenche.
// Não calcula nada, só pega os dados básicos (nome, nascimento, sexo, etc.)

const log = require('./log')
const ag  = require('./aggilizador')

async function consultarCpf(page, cpf) {
  log.info('Consultando CPF', { cpf: cpf.slice(0, 3) + '***' })

  await ag.login(page)
  await ag.abrirCotacaoAuto(page)

  const ok = await ag.preencher(page, ['cpf', 'cpf_cnpj', 'documento'], cpf)
  if (!ok) throw new Error('Não encontrei o campo CPF no aggilizador')

  // Disparar evento de blur pra forçar a busca automática que o aggilizador faz
  try {
    await page.locator('input[name="cpf"], input[id="cpf"], input[name="cpf_cnpj"]').first().blur()
  } catch {}

  // Espera o aggilizador preencher os outros campos (até 8s)
  // Detecção: nome aparece preenchido OU passa o tempo limite.
  const inicio = Date.now()
  let nome = ''
  while (Date.now() - inicio < 8000) {
    nome = await ag.lerCampo(page, ['nome', 'nome_segurado', 'nome_completo']) || ''
    if (nome.length > 3) break
    await page.waitForTimeout(400)
  }

  const dados = {
    nome:         nome,
    nascimento:   await ag.lerCampo(page, ['nascimento','data_nascimento','dt_nascimento']),
    sexo:         await ag.lerCampo(page, ['sexo']),
    estado_civil: await ag.lerCampo(page, ['estado_civil','estadoCivil']),
    cep:          await ag.lerCampo(page, ['cep','cep_residencial']),
    telefone:     await ag.lerCampo(page, ['telefone','celular','fone']),
    email:        await ag.lerCampo(page, ['email']),
  }

  // Limpar nulls/vazios
  for (const k of Object.keys(dados)) if (!dados[k]) delete dados[k]

  log.info('Consulta concluída', { campos: Object.keys(dados) })
  return { encontrado: Object.keys(dados).length > 0, dados }
}

module.exports = { consultarCpf }
