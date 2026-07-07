# Backlog das Ondas — lote de ajustes (jul/2026)

> Estado em **06–07/07/2026**. App no ar em **v1.7.0**. Ordem acordada: ondas 1→4.
> Fluxo de deploy seguro: `npx next lint --no-cache` (0 erros) → `docker compose -f docker-compose.prod.yml build --progress=plain sgo-app` → se OK, `up -d`. Ver memória `deploy-build-gotchas`.

## ✅ Concluído e no ar
- **v1.4.0** — Manutenção (chamados+preventiva), exports Cupons/Auditoria, editor rico de POPs, backup 3-2-1 agendado.
- **v1.5.0 (Onda 1)** — Metas dropdown; Minha área (editar/excluir tarefas + horário 30min; notas com título/edição/texto rico); Comandas seleção em lote por faixa; Pagamentos histórico com filtros; consolidação freelancer em lista.
- **v1.6.0 (Onda 2)** — Notas: aba Análise (fornecedor/unidade/status) + status **Devolvida**; Folgas/férias: consolidado da equipe por período (`/modulos/folgas-equipe`, visibilidade configurável na matriz de Perfis, módulo `LEAVES_TEAM`).
- **v1.7.0 (Onda 3 — Bloco A)** — Pessoas: **Período de Experiência ≤90d** (aprovação + anotações, notifica Admins). Modelo `ProbationReview`.

## 🔜 Onda 3 — Pessoas/RH (restante)
> Itens 11, 12, 15 dependem de uma **futura API do RH** (não existe hoje) → entregar como **registro local + notificação aos Admins** (prontos para plugar a API depois).

- **13 — Avaliação do colaborador**: observações no dia a dia (sem editar o cadastro, que vem do RH) + **avaliação mensal** com histórico. **Conta na meta com PESO 0 por padrão** (decisão do Pedro em 07/07 — não mexer nas notas atuais; Admin liga o peso em Config quando a equipe estiver pronta). Modelos sugeridos: `CollaboratorObservation`, `CollaboratorEvaluation` (unique collaboratorId+yearMonth); peso `EVALUATION_META_WEIGHT` default 0 integrado em `getUnitMonthScore`.
- **12 — Mudança de função/setor → RH**: no Mapa de Funções, gerente edita **função e setor** do colaborador; a mudança gera um **registro** (`RoleChange`) que notifica Admins p/ avisar o RH. Reusar `WorkforceAllocation`/`updateAllocation` (já notifica). Falta editar a função (jobTitle) e um registro consolidado.
- **14 — Comissões/Mobilidade**: supervisor/admin lança valores (comissão do Teknisa / mobilidade manual) por colaborador/unidade → **dashboard + histórico mensal**. Modelo `CollaboratorPayout` (tipo COMMISSION|MOBILITY, valor, mês, colaborador, unidade).
- **11 — Férias (provisório)**: gerente **seleciona colaborador e pede as férias ao RH** pelo sistema, com período. Já existe `Vacation`; adicionar fluxo "solicitar ao RH" + notificação (sem API RH ainda).
- **15 — Escala: trocas → RH**: registrar as trocas de escala (a partir do cadastramento) para informar o RH via futura API. Construir o **registro** agora (`ScheduleChange`), plugar API depois.

## 🔴 Onda 4 — Módulos novos
- **16 — Gestão de Troco** (modelo aprovado: **sessões de caixa em cadeia**): por unidade/dia, cada caixa tem abertura e fechamento; o **fechamento de um caixa = abertura do próximo** (auto), 1+ caixas/dia, alerta de **divergência** se a abertura digitada ≠ fechamento anterior; resumo do dia + dashboard de divergências e histórico.
- **17 — Rotina do Supervisor** (aprovado: **3 fases**):
  - **Fase A** — Painel de uso dos gerentes: consolida checklists %, desperdício, comandas, ocorrências, notas, metas… num placar por gerente/unidade com indicador de "uso correto" (quem está deixando de usar).
  - **Fase B** — Visitas & Feedbacks: agenda de visitas por unidade + feedbacks recorrentes (recorrência variável), acompanhados por números.
  - **Fase C** — Checklists de supervisor: checklists específicos de unidade, criados em Configurações mas destinados ao supervisor (usados na visita).

## Itens cancelados/decididos
- **Notas — leitura por foto/IA**: cancelado pelo Pedro (lançamento já é simples).
- Pendências de produção ainda abertas: trocar senhas de demonstração; rotacionar RH_API_KEY + chave Anthropic; definir `BACKUP_MIRROR_DIR` no `.env` p/ a 2ª cópia externa do 3-2-1. PWA/FCM ainda pendente.
