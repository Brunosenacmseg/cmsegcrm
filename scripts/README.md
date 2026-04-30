# 🚀 Scripts de deploy automático

Esta pasta tem scripts pra automatizar dois fluxos:

1. **Robô** atualiza sozinho na VPS sempre que você fizer push
2. **Vercel** recebe todas as variáveis de ambiente de uma vez

---

## 1️⃣ Auto-deploy do robô (GitHub Actions + SSH)

### Como funciona
- Sempre que você fizer um push em `main` que mexa em `robo/**`, o GitHub
  Actions conecta na sua VPS via SSH e roda `git pull + npm install + pm2 restart`
- Você nunca mais precisa logar manualmente na VPS pra atualizar o robô

### Setup (UMA VEZ)

#### Na VPS — gera a chave SSH dedicada do deploy

```bash
curl -sL https://raw.githubusercontent.com/Brunosenacmseg/cmsegcrm/main/scripts/setup-deploy-vps.sh | bash
```

Isso vai:
- Gerar um par de chaves novo em `~/.ssh/cmsegcrm-deploy`
- Adicionar a pública no `~/.ssh/authorized_keys`
- Mostrar a privada no terminal e te mandar pra configurar no GitHub

#### No GitHub — adicionar os secrets

Vai em https://github.com/Brunosenacmseg/cmsegcrm/settings/secrets/actions
e clica em **"New repository secret"** pra cada um:

| Nome | Valor |
|---|---|
| `SSH_HOST` | IP da sua VPS (ex: `177.7.38.7`) |
| `SSH_USER` | usuário do SSH (ex: `root`) |
| `SSH_PORT` | `22` (omita se já é a padrão) |
| `SSH_PRIVATE_KEY` | a chave inteira que apareceu na tela (começa com `-----BEGIN OPENSSH PRIVATE KEY-----`) |

#### Primeira instalação do robô na VPS (uma vez)

```bash
sudo mkdir -p /opt/cotacao
sudo chown -R $USER:$USER /opt/cotacao
git clone https://github.com/Brunosenacmseg/cmsegcrm.git /opt/cotacao
cd /opt/cotacao/robo
cp .env.example .env
nano .env                    # → preencha AGGILIZADOR_SENHA
npm install --omit=dev
npx playwright install chromium
npx playwright install-deps chromium
pm2 start robo.js --name robo-cotacao --update-env
pm2 save
pm2 startup | tail -1 | bash  # ativa auto-start no boot
```

#### Testar o deploy automático

```bash
# Na sua máquina local, faça uma mudança qualquer em robo/ e push
echo "# teste deploy" >> robo/README.md
git add robo/README.md
git commit -m "Teste deploy auto"
git push
```

Depois acompanha em
**https://github.com/Brunosenacmseg/cmsegcrm/actions**.

---

## 2️⃣ Variáveis do Vercel via CLI

### Setup (UMA VEZ)

#### Na sua máquina local

```bash
# 1. Instalar o Vercel CLI globalmente
npm install -g vercel

# 2. Logar com sua conta
vercel login

# 3. Entrar na pasta do app e linkar com o projeto
cd cmsegcrm/cmsegcrm        # a pasta com next.config.js
vercel link                  # responde:
                             #  Set up "~/.../cmsegcrm/cmsegcrm"? [Y/n] y
                             #  Which scope? Brunosenacmseg
                             #  Link to existing project? [y/N] y
                             #  What's the name? cmsegcrm

# 4. Copiar o template de envs e preencher com valores reais
cp ../scripts/.env.vercel.example ../scripts/.env.vercel.local
nano ../scripts/.env.vercel.local
```

#### Rodar o script

```bash
# A partir da pasta cmsegcrm/cmsegcrm:
bash ../scripts/setup-vercel-envs.sh
```

O script vai:
- Ler `scripts/.env.vercel.local`
- Adicionar cada variável em **Production + Preview + Development** no Vercel
- Pular variáveis vazias
- Perguntar se você quer disparar redeploy no fim

#### Atualizar uma variável depois

Edite `scripts/.env.vercel.local` e rode o script de novo. Ele apaga o valor
antigo e adiciona o novo (não duplica).

---

## ⚠️ Avisos de segurança

- O arquivo `scripts/.env.vercel.local` **NÃO é commitado** (tá no `.gitignore` raiz)
- A chave privada SSH gerada pelo `setup-deploy-vps.sh` fica só na VPS — você só copia/cola pro GitHub
- Os secrets do GitHub Actions são criptografados e nunca aparecem em logs
- Se desconfiar que algo vazou, pode revogar a chave SSH antiga removendo a linha correspondente em `~/.ssh/authorized_keys` na VPS, e gerar uma nova rodando o setup de novo
