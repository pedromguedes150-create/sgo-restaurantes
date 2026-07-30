#!/usr/bin/env bash
# =============================================================================
# SGO — deploy automático (CI). Este é o ÚNICO comando que a chave de deploy do
# GitHub consegue executar (forced command). Ele SÓ toca no SGO — nunca nos
# containers da plataforma do CEO (bjf_*). Não abre terminal, não roda nada além
# disto, não enxerga o CEO.
#
# Comandos aceitos (via SSH_ORIGINAL_COMMAND):
#   deploy [ator] [versao]   -> lê uma imagem docker (gz) do stdin, migra, publica
#                               e avisa os admins no SGO (versão + quem publicou)
#   rollback vX.Y.Z          -> volta o app para uma versão já publicada
#   health                   -> só reporta a saúde
# =============================================================================
set -uo pipefail
APP=/opt/sgo/app
COMPOSE="$APP/docker-compose.prod.yml"
LOG=/opt/sgo/ci-deploy.log
BK=/opt/sgo/backups
CMD="${SSH_ORIGINAL_COMMAND:-}"

exec > >(tee -a "$LOG") 2>&1
echo "──────────── $(date -u '+%Y-%m-%d %H:%M:%S UTC') · CI: [$CMD] ────────────"

health() { curl -sf --max-time 8 http://127.0.0.1:3100/api/health; }

# Notificação in-app aos ADMIN/CEO (nunca derruba o deploy se falhar).
# $1 = versão (ex.: v1.42.0), $2 = ator (quem publicou). Ambos já validados.
notify_inapp() {
  local ver="${1:-nova versão}" ator="${2:-a equipe}"
  local title="🚀 SGO atualizado para ${ver}"
  local body="Publicado por ${ator} em $(TZ=America/Sao_Paulo date '+%d/%m %H:%M'). Toque para ver as novidades no Treinamento da Plataforma."
  docker exec sgo_postgres psql -U sgo -d sgo -v ON_ERROR_STOP=1 -c \
    "INSERT INTO notifications (id, \"userId\", title, body, link, module, critical, read, \"createdAt\")
     SELECT gen_random_uuid()::text, u.id, '${title}', '${body}', '/ajuda', 'GENERAL', false, false, now()
     FROM users u WHERE u.role IN ('ADMIN','CEO') AND u.active = true;" >/dev/null \
    && echo ">> notificação in-app enviada aos admins" \
    || echo ">> (aviso: notificação in-app falhou, seguindo)"
}

deploy() {
  local ator="${1:-}" ver="${2:-}"
  echo ">> guardando a versão atual para rollback rápido"
  docker image inspect sgo-sgo-app:latest >/dev/null 2>&1 && docker tag sgo-sgo-app:latest sgo-sgo-app:rollback-prev || true

  echo ">> recebendo e carregando a nova imagem (stdin)"
  gunzip -c | docker load

  # CRÍTICO: extrai as migrações/schema DA IMAGEM NOVA para /opt/sgo/app/prisma.
  # Sem isto, o migrate roda contra migrações antigas do disco e migrações novas
  # NUNCA são aplicadas — o que derruba a produção (incidente 28/07). Só troca a
  # pasta se a extração der certo.
  echo ">> sincronizando migrações/schema da imagem nova"
  local cid; cid=$(docker create sgo-sgo-app:latest)
  if docker cp "$cid:/app/prisma" "$APP/prisma.new" >/dev/null 2>&1; then
    rm -rf "$APP/prisma"; mv "$APP/prisma.new" "$APP/prisma"
    echo "   prisma sincronizada ($(ls -1 "$APP/prisma/migrations" | grep -c '^[0-9]') migrações)"
  else
    echo "   (aviso: não consegui extrair prisma da imagem — usando a do disco)"
    rm -rf "$APP/prisma.new" 2>/dev/null || true
  fi
  docker rm "$cid" >/dev/null 2>&1 || true

  echo ">> backup do banco antes de migrar"
  mkdir -p "$BK"
  docker exec sgo_postgres pg_dump -U sgo -d sgo -Fc > "$BK/predeploy-$(date -u +%Y%m%d-%H%M%S).dump" || echo "   (aviso: backup falhou, seguindo)"
  ls -1t "$BK"/predeploy-*.dump 2>/dev/null | tail -n +11 | xargs -r rm -f

  echo ">> aplicando migrações (Prisma)"
  local PW; PW=$(grep '^POSTGRES_PASSWORD=' "$APP/.env" | cut -d= -f2-)
  if ! docker run --rm --network sgo -v "$APP/prisma:/prisma" \
      -e DATABASE_URL="postgresql://sgo:${PW}@sgo-db:5432/sgo?schema=public" \
      node:20-alpine sh -c "apk add --no-cache openssl >/dev/null 2>&1 && npm i -g -s prisma@5.22.0 >/dev/null 2>&1 && prisma migrate deploy --schema=/prisma/schema.prisma"; then
    echo ">> ❌ migração falhou — produção NÃO alterada (app antigo segue no ar)"; return 1
  fi

  echo ">> subindo o app (só sgo_app; CEO intocado)"
  cd "$APP" && docker compose -f "$COMPOSE" up -d --no-build

  echo ">> verificando saúde"
  for i in $(seq 1 20); do sleep 3; if health >/dev/null 2>&1; then
      echo ">> ✅ DEPLOY OK — $(health)"
      notify_inapp "$ver" "$ator"
      return 0
  fi; done

  echo ">> ❌ SGO não respondeu — REVERTENDO para a versão anterior"
  docker tag sgo-sgo-app:rollback-prev sgo-sgo-app:latest
  cd "$APP" && docker compose -f "$COMPOSE" up -d --no-build
  echo ">> revertido."; return 1
}

rollback() {
  local ver="$1"
  [[ "$ver" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "versão inválida: $ver"; return 2; }
  docker image inspect "sgo-sgo-app:$ver" >/dev/null 2>&1 || { echo "imagem $ver não existe no servidor"; return 3; }
  echo ">> voltando para $ver"
  docker tag "sgo-sgo-app:$ver" sgo-sgo-app:latest
  cd "$APP" && docker compose -f "$COMPOSE" up -d --no-build
  for i in $(seq 1 20); do sleep 3; health >/dev/null 2>&1 && { echo ">> ✅ ROLLBACK $ver OK — $(health)"; return 0; }; done
  echo ">> ❌ SGO não respondeu após rollback"; return 1
}

# ── roteamento com validação estrita dos argumentos ──
read -r verb a1 a2 _ <<< "$CMD"
case "$verb" in
  deploy)
    ator=""; ver=""
    [[ "${a1:-}" =~ ^[A-Za-z0-9._-]+$ ]] && ator="$a1"
    [[ "${a2:-}" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] && ver="$a2"
    deploy "$ator" "$ver"
    ;;
  rollback) rollback "${a1:-}" ;;
  health)   health && echo ;;
  *)        echo "comando não permitido: [$CMD]"; exit 10 ;;
esac
