# Backlog das Ondas — lote de ajustes (jul/2026)

> Estado em **06–07/07/2026**. App no ar em **v1.7.0**. Ordem acordada: ondas 1→4.
> Fluxo de deploy seguro: `npx next lint --no-cache` (0 erros) → `docker compose -f docker-compose.prod.yml build --progress=plain sgo-app` → se OK, `up -d`. Ver memória `deploy-build-gotchas`.

## ✅ Concluído e no ar
- **v1.4.0** — Manutenção (chamados+preventiva), exports Cupons/Auditoria, editor rico de POPs, backup 3-2-1 agendado.
- **v1.5.0 (Onda 1)** — Metas dropdown; Minha área (editar/excluir tarefas + horário 30min; notas com título/edição/texto rico); Comandas seleção em lote por faixa; Pagamentos histórico com filtros; consolidação freelancer em lista.
- **v1.6.0 (Onda 2)** — Notas: aba Análise (fornecedor/unidade/status) + status **Devolvida**; Folgas/férias: consolidado da equipe por período (`/modulos/folgas-equipe`, visibilidade configurável na matriz de Perfis, módulo `LEAVES_TEAM`).
- **v1.7.0 (Onda 3 — Bloco A)** — Pessoas: **Período de Experiência ≤90d** (aprovação + anotações, notifica Admins). Modelo `ProbationReview`.
- **v1.8.0 (Onda 3 — Bloco B, item 13)** — Pessoas: **Avaliação do colaborador** — observações do dia a dia + avaliação mensal (4 critérios 1–5★, 1/colaborador/mês, histórico 12m). Models `CollaboratorObservation`/`CollaboratorEvaluation`. Meta: componente "Avaliações da equipe", peso `EVALUATION_META_WEIGHT` **padrão 0** (Admin liga na própria tela); missed só em mês encerrado. Admin exclui via `/api/admin/ops`.
- **v1.9.0 (Onda 3 — item 12)** — Pessoas: **Mudanças de função/setor → RH**. Model `RoleChange` (FUNCTION|SECTOR, from→to, snapshot). Setor muda no SGO via `updateAllocation` (agora registra+notifica); função é **solicitação** (RH sobrescreve `jobTitle` no sync — decisão: não editar local). UI: campo "Função" no editar do Mapa + registro em `/modulos/pessoas/mudancas`.
- **v1.10.0 (Onda 3 — itens 14, 11, 15 — ONDA 3 CONCLUÍDA)** — **Comissões & Mobilidade** (model `CollaboratorPayout` COMMISSION|MOBILITY, `/modulos/pessoas/comissoes`, dashboard mês/unidade/top10/tendência 12m, Supervisor+Admin+CEO lançam); **Férias solicitar ao RH** (status `REQUESTED` no enum `VacationStatus`, form na aba Férias, anti-overlap, notifica Admins); **Trocas de escala** (model `ScheduleChange`, `/modulos/escala/trocas`, A+diaA ⇄ B/diaB opcionais, notifica Admins). Tudo com exclusão Admin via `/api/admin/ops`.

## ✅ Onda 3 — Pessoas/RH: CONCLUÍDA (v1.7.0 → v1.10.0)
> Itens 11, 12, 15 dependem da **futura API do RH** → entregues como **registro local + notificação aos Admins** (prontos para plugar a API depois).

## 🔴 Onda 4 — Módulos novos
- ✅ **16 — Gestão de Troco** (v1.11.0): model `CashSession` (cadeia: `expectedOpening` = último fechamento da unidade, mesmo entre dias; `divergence` ≥ R$0,01 → alerta supervisor+admins), um caixa aberto por vez, `/modulos/troco` (abrir/fechar, hoje, histórico, divergências do mês por unidade), módulo `CASH` na matriz, Admin exclui via /api/admin/ops. `src/lib/cash.ts`.
- ✅ **17 — Rotina do Supervisor** (v1.12.0, 3 fases): módulo `SUPERVISION` (default restrito a SUPERVISOR na matriz), `/modulos/supervisao`. **A** painel de uso (`src/lib/supervisor/usage.ts`: checklist%, cobertura waste/comandas ÷ dias decorridos, ocorrências/notas/caixas, meta, tone 🟢≥80/🟡≥50/🔴, piores primeiro). **B** visitas (`SupervisorVisit` PLANNED→DONE/CANCELED, feedback obrigatório, notifica gerente no agendar e no feedback, números do mês). **C** checklists de visita (`SupervisorChecklist` items JSON, CRUD Admin em `/configuracoes/checklists-supervisor`, resultados congelados em `checklistResults` na visita; excluir com histórico = inativa). `src/lib/supervisor/visits.ts`.

## 🎉 LOTE DE AJUSTES JUL/2026 CONCLUÍDO (Ondas 1–4, v1.5.0 → v1.12.0)

## ✅ Pacote 07/07 do Pedro (noite 07→08/07) — v1.15.0 + v1.16.0
- **v1.15.0**: Ocorrências sub-aba **TI** (`isIT`); Manutenção fora da sidebar; **unidades de teste excluídas** (backup antes); **lançamento fora do prazo** em Pagamentos/Notas/Gás/Óleo (data visível, ordenação por solicitação, edição Admin/Supervisor via `/api/entry-date`, penalidade `LATE_ENTRY_PENALTY_PCT` 2%/lançamento na meta + editor na tela de Metas); POP via Treinamentos = visualização + confirmar leitura marca treinado; Config: checklists unificados (1 página, 3 abas).
- **v1.16.0**: **Integrações RH** — recepção RH→SGO (`/api/integracoes/rh/*`, Bearer `RH_INBOUND_TOKEN`, `RhInboundEvent`), webhook férias SGO→RH (`SGO_WEBHOOK_TOKEN`, inerte até colar no painel), CPF no sync, central `Configurações → APIs & Integrações`; Escala: `RhScheduleNotice` + `/modulos/escala/avisos-rh`; Avaliação filtro de unidade; Comissões histórico/variação ao lançar. `/api/integracoes` liberado no middleware (auth por token na rota).
- **Diagnósticos**: Período de Experiência 2×30+ = **bug na API do RH** (sem admissões pós-09/04); API sem `nascimento` (idade dos Desligamentos segue manual); meta sem templates Desperdício/Comandas em NENHUMA unidade (4 unidades com zero templates); Mapa de Funções: único gap vs. visão do Pedro = **simulação salvável na projeção** (aguardando aprovação p/ construir). Relatório completo: `docs/relatorio-noite-2026-07-08.md`.

## ✅ Pós-lote 08/07 (sugestões 2, 4, 5, 6, 7 da análise) — v1.13.0 + v1.14.0
- **Testes**: suíte 47/47 verde + 15 novos (cadeia do troco, avaliação-meta) = 62.
- **v1.13.0**: recorrência de visitas (`SupervisorVisitPlan`, vencida avisa 1×/dia), resumo semanal de aderência (cobra sozinho), exports CSV Troco/Comissões/Visitas.
- **v1.14.0**: **Visão Executiva** (`/modulos/executivo`, EXECUTIVE só CEO/Admin) — rede em 1 tela/mês + Imprimir/PDF.
- **Higiene**: `BACKUP_MIRROR_DIR` → Google Drive (3-2-1 completo, testado); build cache Docker −6,5 GB. Senhas/chaves: passo a passo em `docs/pendencias-producao.md` (exigem o Pedro). PWA/FCM segue pendente (próximo grande bloco).

## Itens cancelados/decididos
- **Notas — leitura por foto/IA**: cancelado pelo Pedro (lançamento já é simples).
- Pendências de produção ainda abertas: trocar senhas de demonstração; rotacionar RH_API_KEY + chave Anthropic; definir `BACKUP_MIRROR_DIR` no `.env` p/ a 2ª cópia externa do 3-2-1. PWA/FCM ainda pendente.
