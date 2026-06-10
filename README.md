# SGO Beija Flor

Sistema de Gestão Operacional para a Rede Beija Flor. Ver `docs/especificacao.md` e `CLAUDE.md`.

## ⚠️ Isolamento (regra inegociável nº 1)
Este servidor **já roda em produção a plataforma do CEO** (containers `bjf_*`, portas 3000/3001/5432/6379/9000, túnel Cloudflare em `bjf-plataforma.com.br`). O SGO usa portas e recursos **exclusivos** e **não pode conflitar**. Ver mapa no `CLAUDE.md`.

| Recurso SGO | Valor |
|---|---|
| App | porta **3100** (prod) / 3101 (homolog) |
| Banco | container `sgo_postgres`, host dev **5433** (em prod sem porta publicada) |
| Rede / volumes Docker | `sgo`, `sgo_db_data`, `sgo_uploads` |

## Desenvolvimento
```bash
# 1. Variáveis (já há um .env de dev gerado; ajuste se quiser)
copy .env.example .env   # se precisar recriar

# 2. Sobe o PostgreSQL dedicado do SGO (não toca no banco do CEO)
docker compose up -d

# 3. Dependências
npm install

# 4. Banco: aplica schema + seeds (3 unidades, 1 usuário por perfil)
npm run db:migrate
npm run db:seed

# 5. App
npm run dev    # http://localhost:3100
```

### Logins de teste (senha: `Beijaflor@123`)
- `gerente@beijaflor.com.br` — Gerente (multi-unidade: Centro + Orla)
- `admin@beijaflor.com.br` — Administrador (vê todas)
- `ceo@beijaflor.com.br` — CEO (consolidado)
- `supervisor@…`, `coordenador@…`, `financeiro@…`

## Testes
```bash
npm test        # regras sensíveis: data operacional, escopo por unidade
```

## Produção (servidor do cliente)
```bash
docker compose -f docker-compose.prod.yml up -d --build
npm run db:deploy   # migrações
```
Publicação via Cloudflare Tunnel (subdomínio dedicado) — configurar quando definido o domínio.

## Backups (3-2-1 — Fase 0.4)
- `scripts/backup-db.sh` — servidor Linux (pg_dump + uploads, criptografado, offsite)
- `scripts/backup-db.ps1` — backup local no Windows
- Agendar diariamente; **testar restauração mensalmente**.
