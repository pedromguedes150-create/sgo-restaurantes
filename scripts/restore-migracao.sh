#!/usr/bin/env bash
# ============================================================================
# SGO — RESTORE no servidor NOVO (a partir do pacote pre-migracao-export)
# Uso:   bash scripts/restore-migracao.sh <PASTA_DO_PACOTE>
# Pré-requisitos no servidor novo: Docker + Docker Compose, e o repositório SGO clonado.
# ============================================================================
set -euo pipefail
PKG="${1:?informe a pasta do pacote de migração}"

echo ">> [1/5] Copiando .env e compose…"
cp -f "$PKG/.env" .env
cp -f "$PKG/docker-compose.prod.yml" docker-compose.prod.yml 2>/dev/null || true

echo ">> [2/5] Subindo só o Postgres…"
docker compose -f docker-compose.prod.yml up -d sgo_postgres
until docker exec sgo_postgres pg_isready -U sgo -d sgo >/dev/null 2>&1; do sleep 2; done

echo ">> [3/5] Restaurando o banco…"
DUMP="$(ls -1 "$PKG"/sgo-db-*.dump | head -1)"
docker exec -i sgo_postgres pg_restore -U sgo -d sgo --clean --if-exists < "$DUMP"

echo ">> [4/5] Restaurando uploads…"
UP="$(ls -1 "$PKG"/sgo-uploads-*.tgz | head -1)"
docker run --rm -v sgo_uploads:/data -v "$PKG":/in alpine sh -c "cd /data && tar xzf /in/$(basename "$UP")"

echo ">> [5/5] Build + subir o app…"
docker compose -f docker-compose.prod.yml up -d --build

echo ">> Conferência:"
sleep 15
curl -s -o /dev/null -w "SGO local: %{http_code}\n" http://127.0.0.1:3100/api/health || true
echo ">> Depois: apontar o túnel Cloudflare (ingress do SGO) para este servidor e conferir o domínio público."
