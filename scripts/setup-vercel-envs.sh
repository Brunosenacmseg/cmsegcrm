#!/bin/bash
# ╔════════════════════════════════════════════════════════════════════╗
# ║  Configura todas as variáveis de ambiente do CRM no Vercel         ║
# ║  de uma vez só, sem precisar clicar uma por uma na interface.      ║
# ║                                                                     ║
# ║  Pré-requisitos (execute UMA VEZ na sua máquina local):            ║
# ║                                                                     ║
# ║   1. Instalar o Vercel CLI:                                         ║
# ║       npm install -g vercel                                         ║
# ║                                                                     ║
# ║   2. Logar:                                                         ║
# ║       vercel login                                                  ║
# ║                                                                     ║
# ║   3. Linkar o projeto (rode dentro de cmsegcrm/cmsegcrm):           ║
# ║       cd cmsegcrm                                                   ║
# ║       vercel link                                                   ║
# ║       (escolha "Brunosenacmseg" → "cmsegcrm")                       ║
# ║                                                                     ║
# ║   4. Copiar e preencher o template:                                 ║
# ║       cp ../scripts/.env.vercel.example ../scripts/.env.vercel.local
# ║       (edite com os valores reais)                                  ║
# ║                                                                     ║
# ║   5. Executar este script (a partir de cmsegcrm/cmsegcrm):          ║
# ║       bash ../scripts/setup-vercel-envs.sh                          ║
# ║                                                                     ║
# ╚════════════════════════════════════════════════════════════════════╝
set -e

ENV_FILE="$(dirname "$0")/.env.vercel.local"

if [ ! -f "$ENV_FILE" ]; then
  echo "❌ Arquivo $ENV_FILE não encontrado."
  echo "   Crie a partir do template:"
  echo "     cp $(dirname "$0")/.env.vercel.example $ENV_FILE"
  echo "   e preencha os valores antes de rodar de novo."
  exit 1
fi

# Confere se o vercel CLI está instalado e linkado
if ! command -v vercel &>/dev/null; then
  echo "❌ Vercel CLI não está instalado."
  echo "   Rode: npm install -g vercel"
  exit 1
fi

if [ ! -f .vercel/project.json ]; then
  echo "❌ Esta pasta não está linkada a um projeto Vercel."
  echo "   Você está rodando o script da pasta certa?"
  echo "   Esperado: cmsegcrm/cmsegcrm  (a pasta com next.config.js)"
  echo "   Rode primeiro: vercel link"
  exit 1
fi

echo "🔧 Configurando envs no Vercel a partir de $ENV_FILE..."
echo ""

count_ok=0
count_skip=0
count_fail=0

while IFS= read -r LINHA; do
  # Pula comentários e linhas vazias
  LINHA="${LINHA%%$'\r'}"  # remove CR de Windows
  [[ -z "$LINHA" || "$LINHA" =~ ^[[:space:]]*# ]] && continue

  # Separa KEY=VALUE
  if [[ "$LINHA" != *"="* ]]; then continue; fi
  KEY="${LINHA%%=*}"
  VAL="${LINHA#*=}"
  KEY="$(echo "$KEY" | xargs)"
  # Remove aspas do valor
  VAL="${VAL%\"}"
  VAL="${VAL#\"}"

  if [ -z "$VAL" ]; then
    echo "⏭  $KEY (vazio, pulando)"
    count_skip=$((count_skip+1))
    continue
  fi

  # Remove valor antigo (se existir) em todos os ambientes pra não duplicar.
  for ENV in production preview development; do
    vercel env rm "$KEY" "$ENV" --yes >/dev/null 2>&1 || true
  done

  # Adiciona em todos os ambientes
  ok=true
  for ENV in production preview development; do
    if printf '%s' "$VAL" | vercel env add "$KEY" "$ENV" >/dev/null 2>&1; then :; else ok=false; fi
  done

  if $ok; then
    echo "✅ $KEY"
    count_ok=$((count_ok+1))
  else
    echo "❌ $KEY (falhou)"
    count_fail=$((count_fail+1))
  fi
done < "$ENV_FILE"

echo ""
echo "Resumo: $count_ok configuradas, $count_skip vazias, $count_fail erros"
echo ""

if [ $count_ok -gt 0 ]; then
  echo "🚀 Disparar redeploy pra produção?"
  read -p "   [s/N] " resp
  if [[ "$resp" =~ ^[sSyY]$ ]]; then
    vercel --prod --yes
  else
    echo "   OK. Pra deployar manualmente depois: vercel --prod"
  fi
fi
