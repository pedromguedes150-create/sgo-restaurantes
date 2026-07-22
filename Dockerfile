# =============================================================================
# SGO Beija Flor — imagem de produção (Next.js standalone)
# Multi-stage: deps -> build -> runner (imagem final enxuta, non-root)
# =============================================================================

FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat
WORKDIR /app

# ---- Dependências ----
FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm ci

# ---- Build ----
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
# Envs dummy APENAS para o build (env.ts valida no import; os reais vêm do
# compose em runtime). Nenhum segredo é gravado na imagem final (multi-stage).
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build?schema=public" \
    JWT_ACCESS_SECRET="build-time-dummy-secret-not-used" \
    JWT_REFRESH_SECRET="build-time-dummy-secret-not-used"
# Heap maior p/ o type-check do build (app cresceu — evita OOM/SIGABRT no worker)
ENV NODE_OPTIONS="--max-old-space-size=4096"
RUN npm run build

# ---- Runner ----
FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3100
# Next standalone liga em HOSTNAME; 0.0.0.0 garante loopback + rede (healthcheck)
ENV HOSTNAME=0.0.0.0
# openssl: requerido pelo engine do Prisma (linux-musl-openssl-3.0.x)
RUN apk add --no-cache openssl \
  && addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

# Artefatos do build standalone do Next.js
COPY --from=build /app/public ./public
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
# Prisma (client + schema) para migrações em runtime
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/prisma ./prisma

# Volume de uploads (regra: storage local em volume Docker)
RUN mkdir -p /app/uploads && chown -R nextjs:nodejs /app/uploads

USER nextjs
EXPOSE 3100

# Health check da própria imagem
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3100/api/health || exit 1

CMD ["node", "server.js"]
