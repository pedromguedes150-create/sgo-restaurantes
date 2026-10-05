# Rotina do Supervisor → Acompanhamento Operacional — diagnóstico e plano

> Base: SGO v1.154.0 · 05/10/2026 · evolução **aditiva** (nada do que existe sai ou muda de regra).

## A) Diagnóstico da implementação atual

| Parte | Onde | O que faz hoje |
|---|---|---|
| Tela | `/modulos/supervisao` → `components/supervisor/supervision-client.tsx` | Abas **Painel de uso** e **Visitas & Feedbacks** (abas na matriz: `SUPERVISION_TAB_PANEL`, `SUPERVISION_TAB_VISITS`) |
| Painel de uso | `lib/supervisor/usage.ts` → `getUsageBoard` | Por unidade/mês: % checklists, cobertura de desperdício e comandas, ocorrências, notas, meta |
| Painel da rede | `/modulos/painel-unidade` + `lib/supervisor/rede.ts` | Visão REDE/UNIDADE, variação vs mês anterior, pontos de atenção, evolução 6 meses |
| Visitas | `lib/supervisor/visits.ts`, model `SupervisorVisit` | Agendar → concluir com **feedback obrigatório** + checklist simples (`checklistResults` em JSON: item, OK/Não, observação) → cancelar. Notifica o gerente. Auditoria `VISIT_*` |
| Checklist de visita | model `SupervisorChecklist` (itens = lista de textos) | CRUD do Admin; resposta só OK/Não + obs. Sem tipo de unidade, foto, gravidade, amostragem |
| Recorrência | `lib/supervisor/visit-plans.ts`, model `SupervisorVisitPlan` | "A cada N dias" por unidade; aviso de vencida; reagenda ao concluir |
| Resumo semanal | `lib/supervisor/digest.ts` | Cobra supervisor e consolida para Admins |

**O que falta para o pedido:**
1. Não há **preparação** da visita a partir dos dados.
2. O checklist é **plano**: lista fixa, sem tipo de unidade, sem foto, gravidade ou amostragem.
3. Não há **aderência física** separada da aderência ao sistema.
4. Não conformidade **não vira ação** rastreável.
5. Não há **pendências da visita anterior** nem validação presencial.
6. Não há **indicadores** de auditoria nem visão da evolução da unidade.

## B) Arquitetura proposta

Terceira aba **"Acompanhamento Operacional"** na mesma tela. Ela é composta de quatro peças:

1. **Resumo pré-visita** (só leitura, derivado):
   - uma função pura recebe os números que os módulos já calculam e devolve alertas 🔴🟠🟡🟢, cada um com a fonte e o link;
   - **nenhum alerta sem dado real**; ausência de lançamento aparece como "não lançado", nunca como zero.
2. **Roteiro dinâmico**, gerado ao iniciar a visita:
   - **A Primordiais:** itens marcados como primordiais e aplicáveis ao tipo da unidade;
   - **B Direcionadas:** um item para cada alerta do resumo pré-visita, por exemplo "Desperdício sem lançamento há 2 dias → conferir rotina de pesagem";
   - **C Complementares:** os demais itens configuráveis, recolhidos.
3. **Execução no celular:**
   - Conforme / Não conforme / N/A em botões grandes;
   - na Não conformidade abre foto, observação, gravidade, responsável, prazo e "Gerar ocorrência";
   - amostragem (conferidos/conformes) e temperatura (valor + faixa configurável);
   - salvamento por item e barra de progresso;
   - continuar visita iniciada.
4. **Resultado e acompanhamento:**
   - resumo final com aderência = conformes ÷ (conformes + não conformes), N/A fora da conta;
   - PDF e Excel;
   - indicadores da rede e visão da unidade.

**Plano de ação = Ocorrências (reuso)**. A não conformidade vira uma **ocorrência existente**, com vínculo à visita. Assim não nasce um segundo sistema de tarefas.

## C) Tabelas reutilizadas (só leitura, salvo onde indicado)

| Dado | Fonte existente |
|---|---|
| Checklists, não realizados, atrasados, itens com falha e evidências | `TaskInstance`, `TaskItemResponse`, `TaskPhoto` |
| Desperdício (lançado/não lançado, fotos) | `WasteEntry`, `WasteEntryPhoto`, `WasteSnackDiscard`, `WasteSnackDayEvidence` |
| Validade | `StockLot` (faixas calculadas, tratativas pendentes) |
| Comandas | contagens diárias + `CommandDivergence` |
| Cofre e despesas | `CashVault*`, `CashExpense` |
| Ocorrências | `Occurrence`, `OccurrenceUpdate` (**ganha campos — ver D**) |
| Escala, férias, atestados, freelancers | `getScheduleGrid`, `getUnitDayMap`, `PaymentRequest` (freelancer do dia) |
| Treinamentos e POPs | `TrainingRecord`, confirmações de leitura de POP |
| Visitas e recorrência | `SupervisorVisit` (**ganha campos**), `SupervisorVisitPlan` (intacto) |

## D) Alterações no banco (todas aditivas)

1. **`Unit.operationType`** — enum `RESTAURANTE | LANCHONETE | CD | FABRICA`, padrão `RESTAURANTE`. Pizzaria continua sendo o marcador `hasPizzeria`, que já existe e funciona como adicional. O Admin ajusta em Configurações → Unidades.
2. **`VisitAuditItem`** — o catálogo configurável de itens de auditoria:
   - seção (Desperdício, Checklists, Validade, Higiene, Temperatura, Estrutura, Pragas, Equipe, Treinamentos, Comandas, Cofre, Ocorrências, Salão, Banheiros…);
   - texto e ordem;
   - nível (primordial/complementar);
   - tipos de unidade em que se aplica, e se exige pizzaria;
   - modo de resposta: simples, amostragem ou temperatura (com faixa mínima e máxima **configurável**, sem limite fixo no código);
   - exige foto / exige observação na não conformidade;
   - ativo.
   - **Semeado** com o roteiro padrão do pedido; o Admin edita.
3. **`SupervisorVisit` ganha:**
   - `kind` (`SIMPLES` = a visita de hoje | `OPERACIONAL`);
   - `startedAt`;
   - `preVisitSnapshot` (os alertas congelados no início, para o histórico não mudar);
   - `summary` (o resultado congelado ao finalizar).
   - As visitas antigas seguem como `SIMPLES`, intactas.
4. **`VisitAuditResponse`** — uma linha por item respondido na visita:
   - status, observação, gravidade, foto(s);
   - amostragem (conferidos/conformes);
   - temperatura (valor);
   - `occurrenceId` gerado;
   - quem respondeu e quando;
   - texto do item **congelado**.
5. **`Occurrence` ganha:**
   - `sourceVisitId` e `sourceVisitResponseId`;
   - `responsibleName`;
   - `dueDate`;
   - `validatedById`, `validatedAt` e `validatedVisitId` (validação presencial).
   - Status continua `OPEN / IN_PROGRESS / CLOSED`. **"Vencido"** e **"Aguardando validação"** são **derivados**: prazo passado e não encerrada; encerrada mas sem validação, quando veio de visita.
6. Reincidência: mesmo item de auditoria não conforme na unidade nas últimas N visitas, **derivado** (sem coluna).

## E) Endpoints

- **Reusados:**
  - `/api/supervision` (agendar, concluir e cancelar continuam iguais);
  - `/api/occurrences` (criação, com os campos novos opcionais);
  - `/api/uploads` (foto);
  - exportação existente.
- **Novos:**
  - `/api/supervision/operacional`: iniciar visita, salvar resposta de item (com foto, multipart), gerar ocorrência a partir do item, validar pendência anterior, finalizar;
  - `/api/supervision/operacional/export?visita=` (Excel);
  - `/api/admin` entidade `visitAuditItem` (CRUD do catálogo).
- Todas com a guarda da matriz (`SUPERVISION` / nova aba) e o escopo de unidade no servidor.

## F) Telas e componentes

- **Aba "Acompanhamento Operacional"** (nova `SUPERVISION_TAB_OPERATIONAL` na matriz, padrão Supervisão, Coordenação, Admin e CEO):
  - indicadores da rede: aderência média, visitas, unidades sem visita, não conformidades, críticas, pendências vencidas, reincidências e taxa de resolução, com o mês anterior ao lado;
  - principais desvios da rede;
  - lista de unidades: uso do SGO × aderência operacional, última e próxima visita, pendências.
- **Visão da unidade** (`/modulos/supervisao/unidade/[id]`): resumo, visitas, pendências, evolução de 6 meses e histórico.
- **Preparar/iniciar visita** (`/modulos/supervisao/visita/[id]`, mobile first):
  - resumo pré-visita;
  - pendências da visita anterior com "Validar";
  - roteiro A/B/C em seções recolhíveis;
  - barra de progresso e salvamento por item.
- **Resultado** (`/modulos/supervisao/visita/[id]/resultado`): a mesma tela vale como PDF (`.sgo-print`); Excel pela rota.
- **Configurações → Checklists de visita**: a tela atual ganha o catálogo com tipo de unidade, nível, modo, foto/obs e faixa de temperatura. Os checklists simples antigos continuam funcionando.
- **Visual:** design system atual (cards, `SgoKpi`, `.sgo-tag`, `SgoModal`, `SgoDrawer`), sem gráficos desnecessários.

## G) Regras de negócio

1. **Aderência ao sistema ≠ aderência operacional.** São indicadores separados; **as metas atuais não mudam**.
2. **Aderência operacional** = conformes ÷ (conformes + não conformes). N/A fica fora. Na amostragem, cada unidade conferida conta.
3. **Ausência de informação nunca vira zero.** Cada alerta e cada número tem estado: lançado, não lançado, sem movimento (só onde há regra) ou não se aplica.
4. **Alerta só com dado real**, e cada alerta mostra a fonte.
5. **Conferência física não altera o registro original** do gerente (checklist, estoque, desperdício, escala). Ela só alimenta a aderência.
6. **Não conforme → ocorrência** (opcional por item, obrigatória quando a gravidade é Crítica): reusa o tipo, a categoria e o fluxo de Ocorrências; problema de estrutura cai na sub-aba Manutenção.
7. **Validação presencial:** a pendência encerrada vira "Validada pelo supervisor" só na visita seguinte, com quem, quando e qual visita. Se não foi validada, conta como reincidência quando o item volta a falhar.
8. **Cofre:** a auditoria só observa; **nenhuma movimentação** é criada.
9. **IA não decide conformidade.** Ela fica fora desta entrega; no futuro, só para resumir.
10. **Permissões e escopo:**
    - Supervisor: só as suas unidades;
    - Coordenador e Admin: conforme a matriz;
    - Gerente: vê resultado e pendências **da própria unidade**, se a matriz liberar.
11. **Auditoria:** iniciar, responder, alterar, foto, gerar ocorrência, validar e finalizar. Visita finalizada **não se apaga** (só o Admin cancela, com motivo).

## H) Plano de migração

- Tudo aditivo: colunas anuláveis com padrão, tabelas novas e um enum novo.
- O tipo de unidade nasce `RESTAURANTE` para todas; o Admin ajusta CD, Lanchonete e Fábrica uma vez.
- O catálogo de itens é semeado na primeira abertura (padrão `ensureDefault…`), sem sobrescrever o que o Admin editar.
- As visitas antigas seguem `SIMPLES` e aparecem no histórico como hoje.
- O módulo de Ocorrências ganha só campos opcionais, e as ocorrências antigas não mudam.

## I) Testes

- **Puros:**
  - montagem do resumo pré-visita (cada alerta exige dado; "não lançado" ≠ zero);
  - aplicabilidade por tipo de unidade e pizzaria;
  - montagem do roteiro A/B/C;
  - cálculo de aderência (N/A fora, amostragem);
  - estados derivados (vencido, aguardando validação);
  - reincidência.
- **Integração:**
  - escopo (supervisor de outra unidade é barrado, inclusive por id);
  - iniciar → responder → gerar ocorrência com vínculo → finalizar → resumo congelado;
  - visita seguinte lista a pendência e a validação grava quem/quando;
  - conferência não altera checklist nem estoque;
  - visitas antigas intactas;
  - Gerente vê só a própria unidade.
- **Tela:** abas e permissões, roteiro no celular (375px) e PDF.

## Proposta de entrega em 3 PRs

1. **Fundação e visita:**
   - tipo de unidade;
   - catálogo de itens configurável (com semente);
   - resumo pré-visita;
   - roteiro A/B/C;
   - execução no celular com foto, amostragem e temperatura;
   - "Gerar ocorrência" com vínculo;
   - resultado com PDF e Excel.
2. **Plano de ação e revisita:**
   - responsável, prazo, vencido e aguardando validação nas ocorrências vindas de visita;
   - "Pendências da visita anterior" com validação presencial;
   - Gerente vendo o resultado da própria unidade.
3. **Indicadores:**
   - aba de indicadores da rede (aderência, cobertura, desvios, reincidências, taxa de resolução);
   - visão da unidade com evolução de 6 meses.
