# SGO Beija Flor — Contexto do Projeto

> Lido automaticamente pelo Claude Code no início de cada sessão. Mantenha atualizado — especialmente a tabela de status e o mapa do ambiente.

## O que é
Sistema de Gestão Operacional (SGO) para rede de restaurantes/churrascarias (6–15 unidades). Especificação completa: `docs/especificacao.md` — leia a seção do módulo antes de codar.

## ⚠️ Ambiente REAL deste servidor (inspeção Fase 0.1 — 2026-06-10)
Esta máquina (Windows 10 Pro) **já roda em produção a plataforma do CEO ("Beija Flor Platform") — INTOCÁVEL**. Mapa do que NÃO pode ser conflitado:

| Recurso do CEO | Porta / Local |
|---|---|
| Frontend Next.js (CEO) | `localhost:3000` (node, `Desktop\beija-flor-platform\apps\web`) |
| API NestJS (CEO) | `localhost:3001` (`/v1/*`) |
| WhatsApp Evolution API | container `bjf_evolution` → `9000` (`/wa/*`) |
| PostgreSQL do CEO | container `bjf_postgres` → **`5432`** (`bjf_user`/`bjf_platform`) |
| Redis do CEO | container `bjf_redis` → `6379` |
| Stack Docker do CEO | `C:\Users\User\bjf\docker-compose.yml` (projeto `bjf`) |
| Publicação | **Cloudflare Tunnel** `cloudflared` (PID/serviço), config `C:\Users\User\.cloudflared\config.yml`, domínio `bjf-plataforma.com.br` |

**Portas/recursos do SGO (exclusivos, sem conflito):** app `3100` (prod) / `3101` (homolog) · Postgres dedicado `sgo_postgres` (host dev `5433`, em prod sem porta publicada) · rede docker `sgo` · volumes `sgo_db_data`/`sgo_uploads`.

**Publicação:** decidido com o usuário em 2026-06-10 — **deixar para depois**. O domínio do SGO será "outro domínio" (a definir). Quando for publicar: adicionar regra de ingress NOVA no túnel Cloudflare (sem tocar nas rotas do CEO) + criar DNS na conta Cloudflare. Não editar `~/.cloudflared/config.yml` sem confirmação explícita.

## Stack
Next.js 14 full-stack + TS + Tailwind + shadcn/ui · PostgreSQL 16 (Docker) · JWT+refresh+bcrypt · Prisma · FCM + Central in-app · PWA · Claude API (modelo via env)

## Regras inegociáveis (nunca viole)
1. **NUNCA alterar/derrubar/conflitar com a plataforma do CEO.** Ver mapa acima. Mudanças no proxy/túnel só com confirmação explícita.
2. Interface 100% PT-BR, mobile-first, tema claro. **Cores das churrascarias (desde 2026-06-11): bordô `#6E1423` + cinza escuro `#3F3F46`** (token tailwind `gold` = grafite, nome mantido por compatibilidade). Semáforos de status continuam verde/âmbar/vermelho.
3. Escopo por unidade (`unit_id`) SEMPRE no servidor.
4. Lógica diária usa **data operacional** (corte por unidade, padrão 04:00).
5. Tarefas pelo **calendário de operação** (fins de semana incluídos), nunca "dias úteis".
6. Modelo Claude API por env — nunca fixo no código.
7. Ações críticas no Log de Auditoria (imutável).
8. Conclusão de tarefas transacional (sem duplicidade).
9. Nenhuma porta de container publicada direto na internet — só o proxy/túnel.
10. Segredos em `.env` fora do Git.

## Status
| Fase / Módulo | Status |
|---|---|
| Fase 0 — Infraestrutura | ✅ Concluído (compose dev/prod, Dockerfile, backups, /api/health) |
| 1 — Auth + Estrutura base | ✅ Concluído (JWT+refresh+bcrypt, perfis, multi-unidade, escopo no servidor, data operacional, 10 testes verdes) |
| 0 (UI) — Dashboard | ✅ Concluído (gerente: anel+meta+atalhos; CEO/Admin/Supervisor: semáforo+ranking+alertas; refresh 60s, skeletons) |
| 1 — Checklists | ✅ Concluído (geração por dia operacional, conclusão transacional, evidência fotográfica, "não realizada" automática, 17 testes) |
| 2 — Desperdícios | ✅ Concluído (1 lançamento/dia, conclui tarefa WASTE c/ foto da balança, alerta >20% vs média 7d, mini-dashboard barras/% e comparativo entre unidades) |
| 3 — Comandas | ✅ Concluído (sequência por unidade, contagem diária "todas presentes"/ausentes, divergência+alerta supervisor, ciclo OPEN→apuração→encerrada recuperada/perdida, baixa sai da ativa, reposição admin) |
| 4 — Cancelamento de Cupons | ✅ Concluído (import CSV Teknisa genérico, pendência de justificativa, motivos configuráveis, mês/% justificados/ranking operador, badge dashboard; PDF/Excel a refinar) |
| 5 — Inventário | ✅ Concluído (agendamento pelo Admin, confirmação de execução pelo gerente, painel realizados/pendentes) |
| 6 — Ocorrências | ✅ Concluído (nº sequencial/unidade, tipo→categoria, gravidade 🟢🟡🔴⚫, anexos foto/vídeo, reincidência <30d, encerramento Supervisor/Admin com ação corretiva, alertas e badge no dashboard) |
| 7 — Pagamentos (com delegação) | ✅ Concluído (freelancers/HE/avulsos, fluxo solicitar→aprovar→pagar, delegação de aprovador por período, abas Minhas/Aprovar/Pagar/Histórico, badges dashboard) |
| 8 — Notas (QR + IA) | ✅ Concluído (leitura da chave 44 dígitos com pré-preenchimento, confirmação obrigatória, fallback manual/foto, status Recebida/Paga/Problema; IA Claude é ponto via env) |
| 9 — Pessoas (API RH) | 🟡 Integração RH ATIVA: sync por unidade (Unit.rhUnitName ↔ razão social) + "Sincronizar todas as cadastradas" — só entram colaboradores das unidades do SGO (outros segmentos do grupo ficam de fora). **Mapa de Funções 9.3** ✅ alocado no SGO; **cada alocação/remoção notifica os Admins** (avisar o RH). Pendente: rota de Férias, comissões/mobilidade. POPs com vídeo YouTube ✅ |
| — Central de Notificações | ✅ Concluído (in-app, sino com badge no header, /notificacoes, marcar lida; notifyAdmins/notifyRole/notifyUsers — usado pelo Mapa de Funções; demais módulos podem plugar) |
| 10 — POPs | ✅ Concluído (blocos texto/checklist/imagem/vídeo, publicação, confirmação de leitura por versão, versionamento; editor rico avançado a refinar) |
| 11 — Metas | ✅ Concluído (ranking mensal, Minha Meta do Mês, detalhamento por tarefa/peso; export PDF a refinar) |
| 12 — Auditoria | ✅ Concluído (tela com filtros por módulo, timeline imutável; export PDF/CSV a refinar) |
| 13 — Configurações + LGPD | ✅ Concluído (cadastros Admin: Unidades, Usuários, Checklists, Pagamentos [freelancers/tipos avulso/delegações] via /api/admin; aceite de termo no 1º login, LGPD retenção/visibilidade/export do titular) |

## Como trabalhar
1. Leia a seção em `docs/especificacao.md`.
2. Plano curto antes de implementar; aguarde confirmação.
3. Um módulo por vez; testes para regras de negócio.
4. Commit por funcionalidade; tag ao concluir módulo; atualize esta tabela.

## Comandos
- `docker compose up -d` — sobe o Postgres dedicado do SGO (dev)
- `npm run dev` — app em http://localhost:3100
- `npm run db:migrate` / `npm run db:seed` — schema + seeds
- `npm test` — testes (Vitest)
- `docker compose -f docker-compose.prod.yml up -d --build` — produção
