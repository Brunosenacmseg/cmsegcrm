#!/bin/bash
# ╔════════════════════════════════════════════════════════════════════╗
# ║  Setup de deploy automático do robô — execute UMA VEZ na VPS       ║
# ║                                                                     ║
# ║  O que faz:                                                         ║
# ║   1. Gera um par de chaves SSH dedicado pro deploy                  ║
# ║   2. Adiciona a pública em ~/.ssh/authorized_keys                   ║
# ║   3. Mostra a privada na tela pra você colar no GitHub Secrets      ║
# ║                                                                     ║
# ║  Como rodar (na VPS):                                               ║
# ║   curl -sL https://raw.githubusercontent.com/Brunosenacmseg/cmsegcrm/main/scripts/setup-deploy-vps.sh | bash
# ║                                                                     ║
# ╚════════════════════════════════════════════════════════════════════╝
set -e

KEY_FILE="$HOME/.ssh/cmsegcrm-deploy"

mkdir -p "$HOME/.ssh"
chmod 700 "$HOME/.ssh"

if [ -f "$KEY_FILE" ]; then
  echo "ℹ Chave já existe em $KEY_FILE — vou reutilizar."
else
  echo "🔑 Gerando chave SSH dedicada (ed25519)..."
  ssh-keygen -t ed25519 -N "" -f "$KEY_FILE" -C "cmsegcrm-deploy@$(hostname)" >/dev/null
fi

# Garante que a pública está em authorized_keys (sem duplicar)
PUB_LINE=$(cat "${KEY_FILE}.pub")
touch "$HOME/.ssh/authorized_keys"
chmod 600 "$HOME/.ssh/authorized_keys"
grep -qxF "$PUB_LINE" "$HOME/.ssh/authorized_keys" || echo "$PUB_LINE" >> "$HOME/.ssh/authorized_keys"

# Pega o IP público (pra você não ter que olhar)
IP_PUB=$(curl -s --max-time 5 ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')

clear
cat <<EOF

╔══════════════════════════════════════════════════════════════════════╗
║  Configuração concluída na VPS — agora cole no GitHub Secrets        ║
╠══════════════════════════════════════════════════════════════════════╣
║                                                                       ║
║  Acesse:                                                              ║
║   https://github.com/Brunosenacmseg/cmsegcrm/settings/secrets/actions
║                                                                       ║
║  Crie os seguintes Repository secrets clicando "New repository secret"║
║                                                                       ║
║  ┌─────────────────────┬──────────────────────────────────────┐      ║
║  │ Name                │ Value                                │      ║
║  ├─────────────────────┼──────────────────────────────────────┤      ║
║  │ SSH_HOST            │ $IP_PUB
║  │ SSH_USER            │ $USER
║  │ SSH_PORT            │ 22  (omita se for a porta padrão)   │      ║
║  │ SSH_PRIVATE_KEY     │ (a chave abaixo, INTEIRA)            │      ║
║  └─────────────────────┴──────────────────────────────────────┘      ║
║                                                                       ║
╚══════════════════════════════════════════════════════════════════════╝

──────── COLE A SAÍDA ABAIXO INTEIRA EM SSH_PRIVATE_KEY ────────

EOF

cat "$KEY_FILE"

cat <<EOF

──────── FIM DA CHAVE ────────

Próximos passos:
  1. Cole a chave acima no secret SSH_PRIVATE_KEY (incluindo BEGIN/END)
  2. Crie SSH_HOST = $IP_PUB
  3. Crie SSH_USER = $USER

  4. Crie a estrutura inicial uma vez (se ainda não fez):
     sudo mkdir -p /opt/cotacao
     sudo chown -R $USER:$USER /opt/cotacao
     git clone https://github.com/Brunosenacmseg/cmsegcrm.git /opt/cotacao
     cd /opt/cotacao/robo
     cp .env.example .env
     nano .env   # → preencha AGGILIZADOR_SENHA
     npm install --omit=dev
     npx playwright install chromium
     npx playwright install-deps chromium
     pm2 start robo.js --name robo-cotacao --update-env

  5. Pronto. Daí em diante, cada push em robo/ na branch main
     dispara deploy automático. Pode acompanhar em:
     https://github.com/Brunosenacmseg/cmsegcrm/actions

EOF
