#!/usr/bin/env bash
# ============================================================================
# SGO — Pacote de MIGRAÇÃO de servidor (export completo, pronto para transferir)
# Uso:   bash scripts/pre-migracao-export.sh [DESTINO]
#        DESTINO padrão: "G:/Meu Drive/SGO Backups/migracao-<data>"
# NÃO derruba nada. Só LÊ do ambiente atual e empacota. Rode com o SGO no ar.
# ============================================================================
set -euo pipefail

STAMP="$(date +%Y%m%d-%H%M%S)"
DEST="${1:-G:/Meu Drive/SGO Backups/migracao-$STAMP}"
mkdir -p "$DEST"
echo ">> Destino: $DEST"

# 1) Dump lógico do banco (custom format, restaurável com pg_restore)
echo ">> [1/5] Dump do PostgreSQL (sgo_postgres)…"
docker exec sgo_postgres pg_dump -U sgo -d sgo -Fc > "$DEST/sgo-db-$STAMP.dump"

# 2) Volume de uploads (fotos/anexos) — tar do volume
echo ">> [2/5] Uploads (volume sgo_uploads)…"
docker run --rm -v sgo_uploads:/data -v "$DEST":/out alpine \
  sh -c "cd /data && tar czf /out/sgo-uploads-$STAMP.tgz ." || echo "   (ajuste o nome do volume se necessário)"

# 3) Arquivos de configuração e deploy do repositório
echo ">> [3/5] Configuração (.env, compose, migrations)…"
cp -f .env "$DEST/.env" 2>/dev/null || echo "   .env não encontrado (copie manualmente — contém segredos)"
cp -f docker-compose.prod.yml "$DEST/" 2>/dev/null || true
cp -f Dockerfile "$DEST/" 2>/dev/null || true
# estado das migrações aplicadas (para conferência pós-restore)
docker exec sgo_postgres psql -U sgo -d sgo -c "SELECT migration_name, finished_at FROM \"_prisma_migrations\" ORDER BY finished_at;" > "$DEST/_migrations-aplicadas.txt" 2>/dev/null || true

# 4) Config do túnel Cloudflare (rotas do SGO) — SÓ REFERÊNCIA (não sobrescrever o do CEO)
echo ">> [4/5] Referência do túnel Cloudflare…"
cp -f "$HOME/.cloudflared/config.yml" "$DEST/cloudflared-config-REFERENCIA.yml" 2>/dev/null || echo "   (config do túnel não copiada — é compartilhada com o CEO)"

# 5) Manifesto
echo ">> [5/5] Manifesto…"
{
  echo "SGO — pacote de migração"
  echo "Gerado: $STAMP"
  echo "Versão do app (rodando): $(docker exec sgo_app node -e "console.log(require('/app/.next/BUILD_ID'))" 2>/dev/null || echo '?')"
  echo "Conteúdo:"
  ls -lh "$DEST"
} > "$DEST/MANIFESTO.txt"
cat "$DEST/MANIFESTO.txt"
echo ">> OK. Pacote pronto em: $DEST"
echo ">> No servidor NOVO: instalar Docker, copiar este pacote, e rodar scripts/restore-migracao.sh"
