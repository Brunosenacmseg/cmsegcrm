# 🤖 Robô de Cotação — CM.segCRM v2.0

Robô de automação que faz cotações no aggilizador.com.br via Playwright.
Recebe os dados do CRM e devolve resultado + screenshot.

## Novidades da v2

- **Endpoint `/consultar-cpf`** — preenche o CPF no aggilizador e devolve os
  dados que ele auto-preenche (nome, nascimento, etc.) pra alimentar o
  formulário do CRM antes de abrir o modal de cotação completa
- **Browser pool** — mantém o Chromium aberto entre requests, baixando o
  custo de cada cotação de ~12s pra ~2-3s
- **Credenciais via `.env`** — senha não fica mais hardcoded no código
- **Token de autenticação opcional** (`ROBO_TOKEN`)
- **Logs estruturados** com nível e timestamp, salvos em arquivo
- **Screenshot automático em caso de erro** (em `./logs/erro-*.png`)
- **Extração de resultado** estruturado (preços, seguradoras, parcelamento)
- **Retry com seletores múltiplos** — se o aggilizador mudar um nome, ainda funciona

## Instalação no VPS

```bash
# 1. Clone ou copie a pasta robo/ para o servidor
git clone https://github.com/Brunosenacmseg/cmsegcrm.git
cd cmsegcrm/robo

# 2. Configure as credenciais
cp .env.example .env
nano .env   # preencha AGGILIZADOR_SENHA

# 3. Rode o instalador
sudo bash instalar.sh
```

O instalador:
- Copia tudo pra `/opt/cotacao`
- Instala Node 18 + PM2 + Playwright + Chromium
- Sobe com PM2 + auto-start no boot

## Configuração (.env)

| Variável | Padrão | Descrição |
|---|---|---|
| `AGGILIZADOR_URL` | `https://aggilizador.com.br` | URL do site |
| `AGGILIZADOR_EMAIL` | — | Email de login (obrigatório) |
| `AGGILIZADOR_SENHA` | — | Senha (obrigatório) |
| `PORT` | `3001` | Porta do servidor |
| `HOST` | `0.0.0.0` | Bind address |
| `ROBO_TOKEN` | — | Token. Se setado, o CRM precisa enviar `x-robo-token` |
| `HEADLESS` | `true` | `false` mostra a janela do browser (debug local) |
| `SLOW_MO` | `0` | ms entre ações (debug visual) |
| `KEEP_BROWSER_OPEN` | `true` | Reusa Chromium entre requests |
| `TIMEOUT_NAV` | `60000` | Timeout de navegação (ms) |
| `TIMEOUT_FIELD` | `15000` | Timeout de seletor (ms) |
| `LOG_DIR` | `./logs` | Diretório de logs e screenshots de erro |

## Endpoints

### `GET /health`
Retorna status, versão e se as credenciais estão configuradas.

```bash
curl http://localhost:3001/health
```

### `POST /consultar-cpf`
Preenche o CPF no aggilizador e devolve os dados que ele auto-preenche.
Usado pelo CRM ao digitar CPF na cotação.

```bash
curl -X POST http://localhost:3001/consultar-cpf \
  -H "Content-Type: application/json" \
  -d '{"cpf":"12345678900"}'

# Resposta:
# { "ok": true, "encontrado": true, "dados": { "nome": "...", "nascimento": "...", ... } }
```

### `POST /cotacao` (ou `POST /`)
Cotação completa de automóvel. Preenche todas as etapas e captura resultado.

```bash
curl -X POST http://localhost:3001/cotacao \
  -H "Content-Type: application/json" \
  -d '{"produto":"carro","dados":{"cpf":"12345678900","nome":"Teste","placa":"ABC1234", ... }}'

# Resposta:
# {
#   "ok": true,
#   "resultado": {
#     "precos_encontrados": ["1234,56","2345,67"],
#     "seguradoras_encontradas": ["Porto Seguro","Bradesco"],
#     "parcelamento": "10x de R$ 234,56"
#   },
#   "screenshot": "<base64 do PNG>"
# }
```

## Comandos PM2

```bash
pm2 status              # Ver status
pm2 logs robo-cotacao   # Ver logs em tempo real
pm2 restart robo-cotacao
pm2 stop robo-cotacao
pm2 monit               # Dashboard interativo
```

## Debug local

```bash
# Mostrar a janela do Chromium (em vez de headless)
HEADLESS=false SLOW_MO=500 npm start

# Logs detalhados
NODE_ENV=development npm start

# Ver screenshot do último erro
ls -lt logs/erro-*.png | head -1
```

## Quando o aggilizador mudar o HTML

Os seletores estão centralizados em `lib/aggilizador.js`. Se o site mudar:

1. Abra a página em modo dev com `HEADLESS=false SLOW_MO=500 npm start`
2. Identifique o novo nome/id dos campos com inspetor do navegador
3. Adicione os nomes novos nos arrays de seletores na função `preencher`/`selecionar`
4. Reinicie com `pm2 restart robo-cotacao`

## Atualizar de v1 para v2

A v2 mantém compatibilidade: o endpoint `POST /` da v1 continua funcionando
exatamente igual. A diferença é que agora você ganha:

- `POST /consultar-cpf` (novo)
- `POST /cotacao` (alias estruturado, mesma resposta + campo `resultado`)
- `GET /health` melhorado
- `.env` em vez de senha hardcoded
- Logs e screenshots de erro

Pra atualizar:

```bash
cd /opt/cotacao
git pull         # ou copia os arquivos novos
cp .env.example .env
nano .env        # cole sua senha
npm install
pm2 restart robo-cotacao --update-env
```
