#!/usr/bin/env bash
# ==========================================================
# OPERA ECHO - deploy a partir do GitHub (roda NA VPS)
#
# Uso:  bash scripts/deploy.sh <pasta> <processo-pm2> [branch]
# Ex.:  bash /var/www/operaecho-hml/scripts/deploy.sh /var/www/operaecho-hml operaecho-hml-4000
#
# O que faz:
#   1. baixa a versão mais nova do GitHub
#   2. instala dependências do backend e do frontend
#   3. gera o build do frontend numa pasta separada (build.novo)
#   4. só se tudo deu certo: troca o build e reinicia a API no PM2
#
# Se qualquer passo falhar, o código volta para a versão anterior
# e o sistema que está no ar NÃO é reiniciado.
# .env, uploads e node_modules nunca vêm do GitHub e são preservados.
# ==========================================================
set -euo pipefail

PASTA="${1:?informe a pasta, ex.: /var/www/operaecho-hml}"
PROCESSO="${2:?informe o processo do PM2, ex.: operaecho-hml-4000}"
BRANCH="${3:-main}"

cd "$PASTA"
ANTES=$(git rev-parse HEAD)

voltar() {
    echo ""
    echo "!!! Deploy FALHOU. Voltando o código para ${ANTES:0:7}. O sistema no ar não foi reiniciado."
    git reset -q --hard "$ANTES"
    rm -rf frontend/build.novo
    exit 1
}
trap voltar ERR

echo ">>> [1/4] Baixando '$BRANCH' do GitHub..."
git fetch -q origin "$BRANCH"
git reset -q --hard "origin/$BRANCH"
DEPOIS=$(git rev-parse HEAD)
echo "    ${ANTES:0:7} -> ${DEPOIS:0:7}: $(git log -1 --format=%s)"

echo ">>> [2/4] Instalando dependências do backend..."
(cd backend && npm install --omit=dev --no-audit --no-fund --loglevel=error)

echo ">>> [3/4] Gerando o build do frontend..."
(cd frontend && npm install --no-audit --no-fund --loglevel=error \
    && npx vite build --outDir build.novo --emptyOutDir --logLevel warn)

trap - ERR

echo ">>> [4/4] Publicando e reiniciando '$PROCESSO'..."
rm -rf frontend/build.antigo
[ -d frontend/build ] && mv frontend/build frontend/build.antigo
mv frontend/build.novo frontend/build
pm2 reload "$PROCESSO" --update-env > /dev/null

echo ""
echo "=== Deploy concluído: $(git log -1 --format='%h - %s (%an, %ar)')"
