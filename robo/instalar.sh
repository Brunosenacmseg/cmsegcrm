#!/bin/bash
# Instalador do Robô de Cotação v2.0 — CM.segCRM
# Execute como root no VPS: bash instalar.sh
set -e

DIR="/opt/cotacao"

echo "🤖 Instalando Robô Cotação v2.0..."

# 1. Pasta de destino
mkdir -p "$DIR"
cp -r robo.js package.json instalar.sh README.md lib "$DIR/"
[ -f .env ] && cp .env "$DIR/" || cp .env.example "$DIR/.env"

cd "$DIR"

# 2. Node.js 18+ se não tiver
if ! command -v node &>/dev/null || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt 18 ]; then
  echo "📦 Instalando Node.js 18..."
  curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
  apt-get install -y nodejs
fi

# 3. PM2
command -v pm2 &>/dev/null || npm install -g pm2

# 4. Dependências
echo "📦 Instalando dependências..."
npm install --omit=dev

# 5. Browsers Playwright
echo "🌐 Instalando Chromium..."
npx playwright install chromium
npx playwright install-deps chromium

# 6. Configurar .env se não tiver
if [ ! -s .env ] || grep -q "AGGILIZADOR_SENHA=$" .env; then
  echo ""
  echo "⚠ ATENÇÃO: edite o arquivo $DIR/.env com sua senha do aggilizador antes de iniciar!"
  echo "   nano $DIR/.env"
  echo ""
fi

# 7. Reiniciar/iniciar com PM2
echo "🚀 Iniciando..."
pm2 delete robo-cotacao 2>/dev/null || true
pm2 start robo.js --name robo-cotacao --update-env
pm2 save
pm2 startup | tail -1 | bash || true

echo ""
echo "✅ Robô v2.0 instalado!"
echo "   Status:  pm2 status"
echo "   Logs:    pm2 logs robo-cotacao"
echo "   Health:  curl http://localhost:3001/health"
echo ""
echo "Endpoints disponíveis:"
echo "   GET  /health           — status"
echo "   POST /consultar-cpf    — auto-preenche dados pelo CPF"
echo "   POST /cotacao          — cotação completa de auto"
