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

**Publicação:** ✅ NO AR desde 2026-06-12 em **https://sgorestaurantesgbf.com.br** (+ www). Produção via Docker (`docker-compose.prod.yml`: `sgo_app` em 127.0.0.1:3100, `sgo_postgres` sem porta exposta, `restart: unless-stopped`). Publicado pelo **mesmo túnel Cloudflare do CEO** (id `095cb96a…`, tunnel "beija-flor"): ingress do SGO adicionado em `~/.cloudflared/config.yml` (rotas do CEO intactas; backup em `config.yml.bak-pre-sgo`); DNS = CNAME proxied de apex+www → `095cb96a….cfargotunnel.com` (criados no painel — o cert.pem do cloudflared só gerencia a zona do CEO).
**Operação do túnel (cuidado):** rode SEMPRE só UMA instância do cloudflared (binário real em `...WinGet\Packages\Cloudflare.cloudflared_*\cloudflared.exe`, NÃO o shim de `WinGet\Links`). Use `127.0.0.1` (não `localhost`) nas rotas do SGO (app é IPv4-only; `localhost`→::1 dá 502). Reiniciar o cloudflared derruba o CEO por ~5s.
**Auto-start no boot (✅ 2026-06-15):** o stack inteiro sobe por **logon** (não pré-login). Pasta `shell:startup` do usuário contém: `Docker Desktop.lnk` (+ flag nativo `AutoStart:true` em `%APPDATA%\Docker\settings-store.json`) → engine sobe e containers `restart:unless-stopped` voltam; `cloudflared-tunnel.vbs` → chama `~/.cloudflared/start-tunnel.cmd` (lança o binário real OCULTO, com **guarda de instância única** via tasklist) → túnel; `BeijaFlor Platform.lnk` (autostart do CEO, **não mexer**). Reboot exige login do usuário p/ tudo voltar. Diag pós-reboot: 1033=cloudflared off; 502 no SGO=Docker/app off; 502 no CEO=node do CEO (porta 3000) off — responsabilidade do CEO.
**Pendências de produção:** trocar senhas de demonstração antes de liberar usuários; rotacionar RH_API_KEY (exposta em prints); backup 3-2-1 agendado; refinos (PDF/Excel Teknisa, exports PDF/CSV, PWA/FCM, IA Claude nas Notas, Pessoas: férias/comissões/mobilidade).

## Stack
Next.js 14 full-stack + TS + Tailwind + shadcn/ui · PostgreSQL 16 (Docker) · JWT+refresh+bcrypt · Prisma · FCM + Central in-app · PWA · Claude API (`@anthropic-ai/sdk`, modelo via `CLAUDE_MODEL`, chave `ANTHROPIC_API_KEY` — visão usada na checagem de foto×padrão dos checklists, `src/lib/ai/vision.ts`, inerte sem chave)

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
| 1 — Checklists | ✅ Concluído (geração por dia operacional, conclusão transacional, evidência fotográfica, "não realizada" automática, 17 testes; **editar unidades onde o checklist aparece** via `groupKey` (`template.setUnits`); **Admin exclui histórico** de realizados/não em Tarefas→Histórico (`taskInstance` em /api/admin/ops)) |
| 2 — Desperdícios | ✅ Concluído (1 lançamento/dia, conclui tarefa WASTE c/ foto da balança, alerta >20% vs média 7d, mini-dashboard barras/% e comparativo entre unidades; **histórico clicável c/ itens**, **categorias em Config (CRUD)**, **lançar dia anterior** via seletor de data, **export Excel/CSV** `/api/waste/export`) |
| 3 — Comandas | ✅ Concluído (contagem diária "todas presentes"/ausentes, divergência+alerta supervisor, ciclo OPEN→apuração→encerrada recuperada/perdida, baixa sai da ativa, reposição admin; **várias sequências por unidade** — modelo `CommandSequence`, Config CRUD, `getActiveSequence` soma todas as faixas ativas; `UnitCommandConfig` legado) |
| 4 — Cancelamento de Cupons | ✅ Concluído (import CSV Teknisa genérico, pendência de justificativa, motivos configuráveis, mês/% justificados/ranking operador, badge dashboard; PDF/Excel a refinar) |
| 5 — Inventário | ✅ Concluído (agendamento pelo Admin, confirmação de execução pelo gerente, painel realizados/pendentes) |
| 6 — Ocorrências | ✅ Concluído (nº sequencial/unidade, tipo→categoria, gravidade 🟢🟡🔴⚫, anexos foto/vídeo, reincidência <30d, encerramento Supervisor/Admin com ação corretiva, alertas e badge no dashboard; **tipos/categorias em Config (CRUD)**, gravidade fixa em 4 níveis; **relatório PDF por ocorrência** (`[id]/relatorio`, print A4) p/ WhatsApp; **sub-aba Manutenção** filtra tipos `isMaintenance` — futura API de manutenção) |
| 7 — Pagamentos (com delegação) | ✅ Concluído (freelancers/HE/avulsos, fluxo solicitar→aprovar→pagar, delegação de aprovador por período, abas Minhas/Aprovar/Pagar/Histórico, badges dashboard; **Admin edita valor/descrição e exclui** lançamentos no histórico, auditado; **freelancer com chave PIX obrigatória** + valor padrão (Config); **divergência de valor** vs padrão no lançamento (snapshot `standardValue`+`divergent`, alerta gerente/aprovadores, não bloqueia); **relatório mensal de consolidação** de freelancers (`relatorio-freelancers`, PIX+total, PDF/print + Excel `/api/payments/freelancer-report`)) |
| 8 — Notas (QR + IA) | ✅ Concluído (leitura da chave 44 dígitos com pré-preenchimento, confirmação obrigatória, fallback manual/foto, status Recebida/Paga/Problema; **leitura do QR pela câmera** do celular — `QrScanner` usa BarcodeDetector nativo + fallback `jsqr`, extrai a chave; IA Claude é ponto via env) |
| 9 — Pessoas (API RH) | 🟡 Integração RH ATIVA: sync por unidade (Unit.rhUnitName ↔ razão social) + "Sincronizar todas as cadastradas" — só entram colaboradores das unidades do SGO (outros segmentos do grupo ficam de fora). **Mapa de Funções 9.3** ✅ alocado no SGO; **cada alocação/remoção notifica os Admins** (avisar o RH). Pendente: rota de Férias, comissões/mobilidade. POPs com vídeo YouTube ✅ |
| — Central de Notificações | ✅ Concluído (in-app, sino com badge no header, /notificacoes, marcar lida; notifyAdmins/notifyRole/notifyUsers — usado pelo Mapa de Funções; demais módulos podem plugar) |
| 10 — POPs | ✅ Concluído (blocos texto/checklist/imagem/vídeo, publicação, confirmação de leitura por versão, versionamento; **criar/editar/excluir** com unidades+setores; editor rico avançado a refinar) |
| 10.1 — Treinamentos (POPs) | ✅ POP vira treinamento: **Inicial** (todo novo) e/ou **Setorial** (por nome de setor) + recorrência Único/Mensal. `src/lib/training.ts` reconcilia pendências (alocação no Mapa = setor; sync RH = novos; mensal; vencidos; re-treino por versão); prazos novo=7d/mensal=fim do mês. Aba `/modulos/treinamentos` por setor (cobertura 🟢🟡🔴, gerente marca "Treinei"). **Conta na meta**: componente "Treinamentos" peso único configurável (`AppSetting TRAINING_META_WEIGHT`, em getUnitMonthScore + getMetaBreakdown) |
| 11 — Metas | ✅ Concluído (ranking mensal, Minha Meta do Mês, detalhamento por tarefa/peso; **histórico de meses anteriores** (seletor 12 meses) + **relatório PDF (print) e Excel** `/api/metas/export`) |
| 12 — Auditoria | ✅ Concluído (tela com filtros por módulo, timeline imutável; export PDF/CSV a refinar) |
| 13 — Configurações + LGPD | ✅ Concluído (cadastros Admin: Unidades, Usuários, Checklists (+**editar unidades** do checklist), **Comandas (multi-sequência)**, **Desperdícios (categorias)**, **Ocorrências (tipos/categorias)**, Pagamentos (freelancer c/ **PIX obrigatório**+valor padrão, tipos de avulso) via /api/admin com **editar/excluir** [exclusão bloqueada se houver histórico]; **Perfis de acesso** = matriz perfil×módulo Ver/Editar, oculta no menu o que o perfil não pode ver, ADMIN/CEO sempre totais; aceite de termo, LGPD) |
| 14 — Escala (presença mensal) | ✅ Concluído (`/modulos/escala`: Planejado [gerado do padrão 12x36 par/ímpar, 6x1, 5x2, personalizada + ajuste], Realizado [única aba editável: T/F/FI/FJ/A/FE por célula, Registrar ausência por período c/ anexo PDF/foto, preencher auto, puxar=planejado], Comparação; export Excel/CSV + PDF via print). Lógica em `src/lib/schedule.ts` |
| 9.3 — Mapa de Funções (turnos) | ✅ Turnos por unidade (Admin CRUD); setores **editar/excluir** + ordem alfabética + setores de referência; **disponibilidade do dia** puxando da Escala (hora-extra/freela). Admin pode **excluir lançamentos** de toda a Operação (reversão + auditoria) |
| — RH auto-sync | ✅ Sincronização automática ~1×/dia via scheduler (`instrumentation.ts`, log RH_SYNC_AUTO), além do botão manual |

## Como trabalhar
1. Leia a seção em `docs/especificacao.md`.
2. Plano curto antes de implementar; aguarde confirmação.
3. Um módulo por vez; testes para regras de negócio.
4. Commit por funcionalidade; tag ao concluir módulo; atualize esta tabela.
5. **A cada novo recurso/ajuste, atualize a central "Treinamento da Plataforma"** (`src/lib/guide.ts`, aba `/ajuda`) — guias por perfil. Pedido do Pedro: a central deve refletir TUDO que for criado/ajustado.

## Comandos
- `docker compose up -d` — sobe o Postgres dedicado do SGO (dev)
- `npm run dev` — app em http://localhost:3100
- `npm run db:migrate` / `npm run db:seed` — schema + seeds
- `npm test` — testes (Vitest)
- `docker compose -f docker-compose.prod.yml up -d --build` — produção
