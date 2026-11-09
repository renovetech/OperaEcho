#!/usr/bin/env bash
# ==========================================================
# OPERA ECHO - deploy a partir do GitHub (roda NA VPS)
#
# Uso:  bash scripts/deploy.sh <pasta> <processo-pm2> [branch-ou-commit]
# Ex.:  bash /var/www/operaecho-hml/scripts/deploy.sh /var/www/operaecho-hml operaecho-hml-4000
#
# A versão pode vir também de $DEPLOY_REF (o Monitora Renove usa isso no
# "Voltar versão"). Branch: pega o último commit dele. Commit: volta para ele.
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
VERSAO="${3:-${DEPLOY_REF:-main}}"

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

echo ">>> [1/4] Baixando '$VERSAO' do GitHub..."
git fetch -q --prune origin
if git rev-parse --verify -q "origin/$VERSAO" > /dev/null; then
    ALVO="origin/$VERSAO"                       # branch: o último commit dele
else
    ALVO=$(git rev-parse --verify -q "$VERSAO^{commit}") \
        || { echo "Versão '$VERSAO' não existe no repositório."; false; }
fi
git reset -q --hard "$ALVO"
DEPOIS=$(git rev-parse HEAD)
echo "    ${ANTES:0:7} -> ${DEPOIS:0:7}: $(git log -1 --format=%s)"

echo ">>> [2/4] Instalando dependências do backend..."
(cd backend && npm install --omit=dev --no-audit --no-fund --loglevel=error)

echo ">>> [3/4] Verificando e gerando o build do frontend..."
(cd backend && npm test --silent)
(cd frontend && npm install --no-audit --no-fund --loglevel=error \
    && npm run typecheck --silent && npm run lint --silent \
    && npx vite build --outDir build.novo --emptyOutDir --logLevel warn)

# O npm da VPS reescreve detalhes do package-lock; a versão do GitHub manda.
git checkout -q -- backend/package-lock.json frontend/package-lock.json

trap - ERR

echo ">>> [4/4] Publicando e reiniciando '$PROCESSO'..."
rm -rf frontend/build.antigo
[ -d frontend/build ] && mv frontend/build frontend/build.antigo
mv frontend/build.novo frontend/build
pm2 reload "$PROCESSO" --update-env > /dev/null

echo ""
echo "=== Deploy concluído: $(git log -1 --format='%h - %s (%an, %ar)')"
