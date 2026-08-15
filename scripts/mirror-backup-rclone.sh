#!/usr/bin/env bash
# =============================================================================
# SGO Beija Flor — espelho do backup em nuvem (rclone)
#
# PARA QUE SERVE
# O droplet guarda os backups em /opt/sgo/backups, no MESMO disco do banco.
# Se o droplet se perder, os 14 dias de retenção se perdem junto — hoje o
# arranjo é 1-1-0, não 3-2-1. Este script é a cópia fora da máquina.
#
# ONDE RODA
# No droplet (174.138.88.225), DEPOIS do backup-sgo.sh. Não substitui o backup:
# só espelha o que ele já produziu.
#
# REGRA DE SEGURANÇA (o motivo de metade deste arquivo)
# Estes dumps contêm dado pessoal de funcionário: CPF, chave PIX, valor de
# pagamento e CID de atestado — que a própria LGPD trata como dado sensível de
# saúde. Mandar isso para uma nuvem em texto claro seria pior que não ter
# espelho. Por isso o script ABORTA se encontrar arquivo não criptografado,
# em vez de enviar "só dessa vez".
#
# CONFIGURAÇÃO (no .env do droplet, /opt/sgo/app/.env)
#   BACKUP_ENCRYPTION_PASSPHRASE=...   # já existe; usada para cifrar o que faltar
#   BACKUP_REMOTE=sgo-drive:SGO/Backups # remote:caminho do rclone
#
# INSTALAÇÃO
#   install -m 700 mirror-backup-rclone.sh /opt/sgo/mirror-backup-rclone.sh
#   # cron 30 min depois do backup (que roda 06:00 UTC):
#   (crontab -l; echo '30 6 * * * /opt/sgo/mirror-backup-rclone.sh >> /var/log/sgo-mirror.log 2>&1') | crontab -
# =============================================================================
set -euo pipefail

ORIGEM="${BACKUP_DIR:-/opt/sgo/backups}"
ENV_FILE="${ENV_FILE:-/opt/sgo/app/.env}"

# shellcheck disable=SC1090
set -a; [ -f "$ENV_FILE" ] && . "$ENV_FILE"; set +a

erro() { echo "ERRO: $*" >&2; exit 1; }

command -v rclone >/dev/null 2>&1 || erro "rclone não instalado."
[ -d "$ORIGEM" ] || erro "diretório de backup não encontrado: $ORIGEM"
[ -n "${BACKUP_REMOTE:-}" ] || erro "BACKUP_REMOTE não definido em $ENV_FILE (ex.: sgo-drive:SGO/Backups)."

REMOTE_NOME="${BACKUP_REMOTE%%:*}"
rclone listremotes | grep -qx "${REMOTE_NOME}:" \
  || erro "remote '${REMOTE_NOME}' não existe. Configure com: rclone config"

# --- 1. Prepara cópias cifradas numa área à parte ----------------------------
# O espelho NÃO mexe no backup local do droplet: os arquivos originais ficam
# como estão, porque são eles que o procedimento de restauração usa. O que sobe
# é uma cópia cifrada, montada aqui. Só esta pasta é enviada — assim a trava do
# passo 2 vale sobre um diretório que, por construção, só contém .enc.
PREPARO="${PREPARO:-/opt/sgo/backups/.espelho}"
mkdir -p "$PREPARO"
chmod 700 "$PREPARO"

novos=0
while IFS= read -r -d '' f; do
  base="$(basename "$f")"
  destino="$PREPARO/${base}.enc"
  # Já cifrado na origem? Copia como está. Senão, cifra para o preparo.
  if [ "${base%.enc}" != "$base" ]; then
    destino="$PREPARO/$base"
    [ -f "$destino" ] || { cp -p "$f" "$destino"; novos=$((novos + 1)); }
    continue
  fi
  [ -f "$destino" ] && continue
  [ -n "${BACKUP_ENCRYPTION_PASSPHRASE:-}" ] \
    || erro "$base não está cifrado e BACKUP_ENCRYPTION_PASSPHRASE não está definida."
  echo "  cifrando $base"
  openssl enc -aes-256-cbc -pbkdf2 -salt \
    -in "$f" -out "$destino.parcial" -pass "pass:$BACKUP_ENCRYPTION_PASSPHRASE"
  # Renomeia só no fim: interrupção no meio não deixa arquivo truncado subir.
  mv "$destino.parcial" "$destino"
  novos=$((novos + 1))
done < <(find "$ORIGEM" -maxdepth 1 -type f \
           \( -name '*.dump' -o -name '*.sql' -o -name '*.sql.gz' -o -name '*.tgz' -o -name '*.tar.gz' -o -name '*.enc' \) \
           -print0)
echo "[1/3] $novos arquivo(s) novo(s) no preparo."

# --- 2. Trava: nada sai daqui em texto claro ---------------------------------
# Cinto e suspensório. Se o passo 1 deixar passar algum padrão de nome, é aqui
# que o script para — antes de vazar, não depois.
rm -f "$PREPARO"/*.parcial
restante="$(find "$PREPARO" -maxdepth 1 -type f ! -name '*.enc' | head -5)"
[ -z "$restante" ] || erro "arquivo(s) não cifrado(s) no preparo — envio cancelado:
$restante"

# --- 3. Envia só o que está cifrado ------------------------------------------
echo "[2/3] Enviando para $BACKUP_REMOTE …"
rclone copy "$PREPARO" "$BACKUP_REMOTE" \
  --include '*.enc' \
  --transfers 2 --checkers 4 \
  --log-level INFO

# O preparo é cache de envio, não segundo backup: segue a retenção da origem.
find "$PREPARO" -maxdepth 1 -type f -mtime +14 -delete

# --- 4. Retenção no destino --------------------------------------------------
# Maior que a do droplet (14d) de propósito: o espelho existe justamente para o
# caso em que a origem sumiu.
DIAS="${BACKUP_REMOTE_RETENTION_DAYS:-60}"
echo "[3/3] Limpando cópias com mais de $DIAS dias no destino…"
rclone delete "$BACKUP_REMOTE" --min-age "${DIAS}d" --include '*.enc'

echo "OK — espelho concluído em $(date -u +%Y-%m-%dT%H:%M:%SZ)."
echo "     origem: $ORIGEM"
echo "     destino: $BACKUP_REMOTE"
rclone size "$BACKUP_REMOTE" 2>/dev/null || true
