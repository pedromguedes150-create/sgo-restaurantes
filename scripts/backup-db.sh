#!/usr/bin/env bash
# =============================================================================
# SGO Beija Flor — Backup 3-2-1 (Fase 0.4) — servidor de produção (Linux)
# Faz pg_dump do Postgres do SGO + cópia dos uploads, criptografa e envia
# para armazenamento externo. Agende no cron (ex: diário 03:30).
#
# Requisitos: docker, openssl, e o CLI do destino externo (ex: rclone p/ B2/S3).
# Variáveis lidas do .env (BACKUP_ENCRYPTION_PASSPHRASE, BACKUP_REMOTE_BUCKET).
# =============================================================================
set -euo pipefail

cd "$(dirname "$0")/.."
set -a; [ -f .env ] && . ./.env; set +a

STAMP="$(date +%Y%m%d-%H%M%S)"
OUT_DIR="backups"
mkdir -p "$OUT_DIR"

DUMP="$OUT_DIR/sgo-db-$STAMP.sql.gz"
UPLOADS="$OUT_DIR/sgo-uploads-$STAMP.tar.gz"

echo "[1/4] Dump do PostgreSQL ($POSTGRES_DB)..."
docker exec sgo_postgres pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  | gzip > "$DUMP"

echo "[2/4] Empacotando uploads..."
docker run --rm -v sgo_uploads:/data -v "$PWD/$OUT_DIR":/out alpine \
  tar czf "/out/$(basename "$UPLOADS")" -C /data . 2>/dev/null || \
  echo "  (volume sgo_uploads ainda vazio — ok)"

echo "[3/4] Criptografando (AES-256)..."
for f in "$DUMP" "$UPLOADS"; do
  [ -f "$f" ] || continue
  openssl enc -aes-256-cbc -pbkdf2 -salt \
    -in "$f" -out "$f.enc" -pass "pass:$BACKUP_ENCRYPTION_PASSPHRASE"
  rm -f "$f"
done

echo "[4/4] Enviando para destino externo ($BACKUP_REMOTE_BUCKET)..."
if command -v rclone >/dev/null 2>&1 && [ -n "${BACKUP_REMOTE_BUCKET:-}" ]; then
  rclone copy "$OUT_DIR/" "$BACKUP_REMOTE_BUCKET/" --include "*-$STAMP.*.enc"
else
  echo "  AVISO: rclone/BACKUP_REMOTE_BUCKET não configurado — backup só local."
fi

# Retenção: 30 dias de diários (mensais devem ser copiados à parte)
find "$OUT_DIR" -name "*.enc" -type f -mtime +30 -delete

echo "OK — backup $STAMP concluído."
