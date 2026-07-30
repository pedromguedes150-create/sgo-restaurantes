# Plano — Fichas configuráveis por link, DENTRO do módulo Checklist

> Documento de **planejamento** (nenhum código escrito). Revisar antes de implementar.
> Caso-âncora: a **"Ficha de Controle de Massas"** da pizzaria (foto), preenchida via **link sem login**, com escolha do funcionário e histórico.
> **Decisão R1 (arquitetural):** NÃO é um módulo separado — as fichas são um **braço do módulo Checklist já existente** (`TaskTemplate`/`ChecklistItem`), reaproveitando o máximo. Este documento foi reescrito sob essa decisão (o que mudou vs. a 1ª versão está no §8).

---

## 0. Resumo em uma frase
Uma **ficha** é um **checklist do tipo "por link"**: o mesmo `TaskTemplate` de hoje, amarrado a uma unidade, mas com **modo de entrega = LINK** (em vez de geração diária) e **itens tipados** (número, horário, data, lista suspensa, Sim/Não, observação…). Gera um **link público**; quem abre **escolhe o próprio nome numa lista de funcionários da unidade** e preenche; cada envio vira um registro de **histórico**.

---

## 1. Como as fichas se encaixam NO módulo Checklist atual (R1)

### 1.1 Como o módulo está estruturado hoje
- **Config:** `TaskTemplate` (checklist por unidade) + `ChecklistItem` (itens de verificação, com `text`, `section`, `requiresPhoto`, `aiCheck`). Telas em **Configurações → Checklists** (hub com abas: `unidades` = `templates-admin.tsx`, `modelos` = biblioteca `ChecklistModel`, `supervisor`, `resumo`).
- **Execução (diária):** `TaskInstance` (uma por dia operacional) + `TaskItemResponse` (🟢🟡🔴 por item) + `TaskPhoto`. Superfície do gerente em **/tarefas**.
- **Geração/meta:** `src/lib/tasks/generate.ts` cria as instâncias do dia; meta/dashboard/cobertura leem de **`TaskInstance`**.

### 1.2 O encaixe (reaproveitando o máximo)
| Peça da ficha | Decisão | Reaproveita? |
|---|---|---|
| Definição da ficha | é um **`TaskTemplate`** com **`deliveryMode = LINK`** | ✅ reaproveita a tabela, o vínculo com unidade, `groupKey` (replicar em várias unidades), `active`, `order` |
| Perguntas/campos | são **`ChecklistItem`** com um **tipo** (`fieldKind`) + `options` + `required` | ✅ reaproveita a tabela e o editor de itens (com um seletor de tipo quando é ficha) |
| Config (telas) | **nova aba "Fichas por link"** no hub `Configurações → Checklists` | ✅ reaproveita o hub, o seletor de unidade e o CRUD do `templates-admin` |
| Modelos prontos | (opcional) fichas padrão na **biblioteca `ChecklistModel`** | ✅ mesmo mecanismo `ensureDefaultModels`/`fromModels` |
| Preenchimento | **NOVO**: página pública + renderer de campos tipados (o runner atual é 🟢🟡🔴, não serve) | ❌ novo (mas espelha a página pública de **Higiene**) |
| Guardar envios | **NOVA tabela `ChecklistSubmission`** (por quê no §2.2) | ❌ novo (única tabela nova) |

**Por que NÃO reusar `TaskInstance`/`TaskItemResponse` para os envios:** eles são "1 por dia operacional" (`@@unique([templateId, operationalDate, assignedToId])`) e a resposta é um enum de status 🟢🟡🔴 — incompatível com **vários envios/dia** de **valores tipados** por pessoas diferentes. Forçar isso quebraria o unique e o tipo. Então os envios ganham **uma** tabela própria; todo o resto é reuso.

### 1.3 O guard que mantém as fichas fora do fluxo diário/meta
Como **meta, dashboard, cobertura e histórico diário leem de `TaskInstance`**, e uma ficha-LINK **nunca gera `TaskInstance`**, ela fica **automaticamente fora** da meta e da tela /tarefas. O único ponto que precisa de filtro explícito é:
- **`src/lib/tasks/generate.ts:25`** — `taskTemplate.findMany({ where: { unitId, active: true } })` passa a incluir **`deliveryMode: 'DAILY'`** (não gera instâncias para fichas-LINK).
- **`configuracoes/checklists/page.tsx`** — a listagem de templates passa a **separar por `deliveryMode`** (diários na aba "unidades", fichas na aba "Fichas por link").
- Demais sites (`admin.ts`, `checklist-models.ts`, `desperdicios/page.tsx`) são por nome/`groupKey`/`module` e não misturam — só revisar no PR.

> Esse é o principal risco técnico da abordagem "dentro do módulo": estender tabelas compartilhadas exige garantir o filtro `deliveryMode` nos poucos pontos acima. A boa notícia é que são poucos, porque o resto é derivado de `TaskInstance` (inexistente para fichas). Ver R-novo em §5.

---

## 2. Banco — mudanças (aditivas) e a única tabela nova

Migração **puramente aditiva**: 2 colunas-grupo em tabelas existentes (com defaults que preservam 100% o comportamento atual) + 2 enums + 1 tabela nova. Nenhum dado tocado.

### 2.1 Ajustes em tabelas existentes
```prisma
enum DeliveryMode {
  DAILY   // checklist operacional gerado por dia (comportamento atual) — default
  LINK    // ficha preenchida por link público, sob demanda
}

enum ChecklistFieldKind {
  VERIFICATION // item 🟢🟡🔴 atual (default — itens diários não mudam)
  SHORT_TEXT
  TEXTAREA     // observação (texto livre)      ← requisito
  NUMBER
  TIME
  DATE
  SELECT       // lista suspensa (opções)        ← requisito
  BOOLEAN      // Sim/Não / item de marcar       ← requisito
  SECTION      // subtítulo (ex.: "Checklist de Conferência") — não é resposta
}

model TaskTemplate {
  // … campos atuais …
  deliveryMode DeliveryMode @default(DAILY)   // NOVO
  // Campos usados só quando deliveryMode = LINK (todos opcionais/inertes p/ DAILY):
  publicToken  String?  @unique               // token aleatório do link (revogável)
  linkEnabled  Boolean  @default(true)
  expiresAt    DateTime?
  maxPerDay    Int      @default(0)            // 0 = sem teto (anti-spam, §4)
  notifyRole   String?                         // avisa MANAGER/SUPERVISOR ao receber envio (opcional)
  // entersMeta continua existindo: fichas nascem com entersMeta = false.
}

model ChecklistItem {
  // … campos atuais (text, section, requiresPhoto, aiCheck, …) …
  fieldKind ChecklistFieldKind @default(VERIFICATION) // NOVO (DAILY continua VERIFICATION)
  options   Json?                                     // opções do SELECT (e rótulos de grupo)
  required  Boolean            @default(false)         // obrigatório no preenchimento da ficha
}
```
> Defaults garantem que **todo checklist diário de hoje continua idêntico** (deliveryMode=DAILY, itens VERIFICATION).

### 2.2 Tabela nova — envios da ficha
```prisma
/// Um preenchimento de ficha (via link). Respostas em SNAPSHOT JSON (imutável). R2.
model ChecklistSubmission {
  id            String   @id @default(cuid())
  templateId    String                         // a ficha (TaskTemplate deliveryMode=LINK)
  unitId        String                         // snapshot (vem da ficha, nunca do cliente)
  /// Quem preencheu: escolhido numa lista de funcionários da unidade (R6).
  collaboratorId   String?                     // ref. ao Collaborator (sem FK dura; histórico sobrevive)
  respondentName   String                      // snapshot do nome escolhido
  /// [{ itemId, label, kind, value }] — fotografia das perguntas+respostas no envio.
  answers       Json
  ip            String?                         // anti-abuso/auditoria (LGPD: R9)
  userAgent     String?
  createdAt     DateTime @default(now())

  template TaskTemplate @relation(fields: [templateId], references: [id], onDelete: Cascade)

  @@index([templateId, createdAt])
  @@index([unitId, createdAt])
  @@map("checklist_submissions")
}
```
E a "volta" em `TaskTemplate`: `submissions ChecklistSubmission[]`.

**Respostas em JSON snapshot (R2 aceito):** imutável mesmo se a ficha for editada depois (mesmo princípio do `deltas` do cofre e do `TaskItemResponse.itemText`). Sem explosão de linhas. BI por campo, se um dia quiserem, parseia o JSON ou adiciona tabela normalizada depois — sem quebrar nada.

---

## 3. Fluxos e telas

### 3.1 Configuração (interno) — reaproveitando o hub de Checklists
- Em **Configurações → Checklists**, nova aba **"Fichas por link"** (ou `?tab=fichas`): lista as fichas do escopo, "Nova ficha".
- Editor da ficha = o mesmo `templates-admin`, em **modo ficha**: título/descrição, **unidade** (obrigatória), e o **construtor de campos** — cada item ganha um **seletor de tipo** (`fieldKind`) e, para SELECT, as opções; SECTION para subtítulos; reordenar ▲▼; `required`. Gestão do **link** (copiar URL, ligar/desligar, rotacionar token, expiração opcional).
- Permissão pelo módulo `CHECKLIST_FORMS` (R5, §4).

### 3.2 Preenchimento (público, sem login) — espelha a página de Higiene
- URL: `https://sgorestaurantesgbf.com.br/checklists/<publicToken>`.
- `getPublicChecklist(token)` devolve **só**: título/descrição, nome da unidade, os campos (rótulo/tipo/opções/obrigatório) e a **lista de funcionários ativos da unidade** (id+nome) para o seletor (R6).
- A pessoa **escolhe o próprio nome** na lista (obrigatório) e preenche; **unidade vem da ficha** (cliente nunca envia unidade). Envia → agradecimento.
- `POST /api/checklists/public` valida e grava (§4).

### 3.3 Histórico (interno) — dentro do módulo
- Superfície: uma área **"Fichas"** no módulo de Checklist/Tarefas (ex.: `/tarefas/fichas` ou aba), listando envios por ficha/unidade com **quem preencheu, data/hora e as respostas** (abre o snapshot). Filtros por ficha/período; escopo por unidade no servidor. Export CSV/print num PR posterior.
- Notificação opcional ao gerente/supervisão no envio (`notifyRole` + `notifyUnitRole`).

### 3.4 Mapeamento da "Ficha de Controle de Massas" (cobre 100%)
Data→DATE · Responsável→(é o **funcionário escolhido**) · Quantidades (iniciar/recebida/total/finalizar)→NUMBER ×4 · Retirada p/ fermentação→TIME · Perdas/Descartes→NUMBER · Motivo→TEXTAREA · Validade conferida→BOOLEAN + DATE · Observações→TEXTAREA · "Checklist de Conferência" (6 itens)→SECTION + 6×BOOLEAN.

---

## 4. Segurança do link público + permissão

**Não vazar dados:** `getPublicChecklist` devolve só a estrutura da ficha + nome da unidade + **nomes dos funcionários daquela unidade** (necessário para o R6). Unidade e checklist resolvidos **no servidor** pelo token; o POST não escolhe unidade/ficha arbitrária. Respostas de SELECT validadas contra as opções; `collaboratorId` validado como pertencente à unidade; texto limitado; campos fora da ficha descartados.

**Link validado por token (não o id):** `publicToken` aleatório (32+ chars), **revogável** (rotacionar) e **desligável** (`linkEnabled=false`), **expiração opcional** (padrão desligada — fichas são recorrentes).

**Anti-spam (R4 aceito — sem CAPTCHA no v1):** honeypot (campo oculto) + throttle por **IP+token** (contagem simples em `checklist_submissions`) + teto diário opcional (`maxPerDay`) + validações duras (funcionário obrigatório, payload pequeno, recusa se link off/expirado/ficha inativa). CAPTCHA fica para depois (exigiria provedor externo).

**Permissão de configuração (R5):** novo módulo **`CHECKLIST_FORMS`** na matriz perfil×módulo (sem `nav`, como `CASH_CONFIG`), **sem papel fixo** — `RESTRICTED_DEFAULT.CHECKLIST_FORMS = []` (só ADMIN/CEO por padrão; o admin libera quem quiser na Gestão de Acessos). No servidor, toda ação de config/histórico checa **`canEditModule(role,'CHECKLIST_FORMS')` E `canAccessUnit`** (o preenchimento em si é público).

---

## 5. Riscos e decisões

- **R1 — RESOLVIDO:** fichas vivem **dentro** do módulo Checklist (TaskTemplate `deliveryMode=LINK` + itens tipados); única tabela nova = `ChecklistSubmission`.
- **R-novo (tabelas compartilhadas):** estender `TaskTemplate`/`ChecklistItem` exige o filtro **`deliveryMode`** em `generate.ts` e na listagem de config (§1.3). Mitigado por meta/dashboard serem derivados de `TaskInstance` (que fichas não criam). **Recomendo** essa via (máximo reuso, pedido no R1); alternativa seria tabelas paralelas — descartada pelo R1.
- **R2 — aceito:** respostas em **JSON snapshot**.
- **R4 — aceito:** honeypot + throttle + teto diário; **CAPTCHA fora do v1**.
- **R5 — definido:** módulo `CHECKLIST_FORMS`, sem papel fixo, default só ADMIN/CEO (admin libera); servidor checa permissão + unidade.
- **R6 — definido:** quem preenche **escolhe numa lista de funcionários da unidade** (fonte: `Collaborator` + `CollaboratorUnit`, ativos, da unidade da ficha). Guardo `collaboratorId` + `respondentName` (snapshot). **Consequência LGPD:** a página pública passa a **listar nomes dos funcionários daquela unidade** — exposição maior que a de higiene; aceitável por ser só a lista da unidade, mas registrada aqui (ver R9).
- **R7 — aceito:** tipos `SHORT_TEXT, TEXTAREA, NUMBER, TIME, DATE, SELECT, BOOLEAN, SECTION` (+ `VERIFICATION` que já existe p/ os diários). Foto/anexo fica **fora do v1** (dá para reusar `saveAttachment`/`TaskPhoto` depois).
- **R8 — aceito:** `notifyRole` opcional por ficha (recomendo **desligado por padrão**; o gestor liga quando quiser).
- **R9 — LGPD:** guardamos nome do funcionário e IP; a página pública expõe a lista de nomes da unidade (R6). Definir retenção e acesso (proponho: histórico por escopo de unidade; IP só Admin). Confirmar.
- **R10 — exclusão:** editar a ficha não afeta envios antigos (snapshot). Excluir ficha = `active=false` (soft); exclusão dura só por Admin via `/api/admin/ops`, apagando envios em cascade.

---

## 6. Divisão em PRs pequenos e incrementais

- **PR 1 — Schema + backend (invisível).** Enums `DeliveryMode`/`ChecklistFieldKind`; colunas em `TaskTemplate`/`ChecklistItem`; tabela `ChecklistSubmission`; migração aditiva. **Filtro `deliveryMode='DAILY'` no `generate.ts`** (garante que nada muda no diário). `src/lib/checklist-forms/*`: `getPublicChecklist` (exposição mínima + lista de funcionários), `submitChecklist` (validação + honeypot + throttle), CRUD de ficha (reusando lógica de template) com `canEditModule('CHECKLIST_FORMS')`+`canAccessUnit`, geração de `publicToken`. **Testes:** diário intacto (não gera instância p/ LINK; meta inalterada), validação de SELECT/obrigatórios, `collaboratorId` da unidade, unidade vem da ficha, token off/expirado recusa, snapshot imutável, throttle/honeypot.
- **PR 2 — Permissão + config.** Módulo `CHECKLIST_FORMS` na matriz; aba **"Fichas por link"** no hub `Configurações → Checklists` (criar ficha, unidade, construtor de campos tipados, gerir link). Atualiza `guide.ts`. Sem rota pública ainda.
- **PR 3 — Página pública + submit.** `/checklists/[token]` (server component + form com seletor de funcionário) e `POST /api/checklists/public`; adiciona os prefixos ao `middleware.ts`; honeypot/throttle. Link funcionando ponta a ponta.
- **PR 4 — Histórico interno.** Área "Fichas" no módulo (lista de envios, abrir snapshot, filtros, escopo); notificação opcional no envio.
- **PR 5 (opcional).** Export CSV/print + analytics por campo; modelos de ficha na biblioteca (`ChecklistModel`); exclusão via `/api/admin/ops`; (se houver abuso) CAPTCHA.

Corte proposital: configurar (PR2) antes do link existir (PR3), e o link antes do histórico rico (PR4). Coerente em qualquer ponto.

---

## 7. Regras do CLAUDE.md respeitadas
Regra 3 (escopo por unidade no servidor; no público a unidade vem da ficha) · Regra 7 (config no Log de Auditoria) · Regra 2 (PT-BR, mobile-first) · Regra 5 (`guide.ts` no PR 2) · Regra 1 (rota pública só via `PUBLIC_PREFIXES`, mesmo mecanismo do `/higiene`; nada toca CEO/proxy) · Regras 9/10 (sem porta nova; token do link é dado, não credencial).

---

## 8. O que MUDOU vs. a 1ª versão do plano (por causa do R1)

**Arquitetura / navegação:**
- Antes: **módulo separado** ("Fichas") com telas próprias e módulo de sidebar. Agora: **braço do módulo Checklist** — config na **aba "Fichas por link"** de `Configurações → Checklists`, histórico dentro do módulo (`/tarefas/fichas`), sem novo item de sidebar.
- Permissão: antes `CHECKLIST_FORMS` com default SUPERVISOR+ADMIN; agora `CHECKLIST_FORMS` **sem papel fixo** (default só ADMIN/CEO; admin libera) — R5.

**Schema (a maior mudança):**
- Antes: **3 tabelas novas** (`Checklist`, `ChecklistField`, `ChecklistSubmission`).
- Agora: **reaproveita** `TaskTemplate` (via `deliveryMode=LINK` + campos de link) e `ChecklistItem` (via `fieldKind`+`options`+`required`); **só 1 tabela nova** (`ChecklistSubmission`) + 2 enums. Some o par `Checklist`/`ChecklistField`.
- Novo cuidado que não existia antes: **filtrar `deliveryMode`** nos poucos pontos que varrem `TaskTemplate` (principalmente `generate.ts`) para as fichas não vazarem no diário/meta.

**Preenchimento (R6):**
- Antes: identificação por **nome em texto livre**. Agora: **seletor de funcionário** da unidade (`Collaborator`/`CollaboratorUnit`), com consequência LGPD de listar nomes na página pública (registrada em R9).

**Sem mudança:** segurança do link (token revogável + honeypot + throttle, sem CAPTCHA), respostas em JSON snapshot, e a divisão incremental em PRs.
