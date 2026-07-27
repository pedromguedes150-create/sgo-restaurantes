# Plano — Denominações de troco configuráveis por unidade

> Documento de **planejamento** (nenhum código escrito ainda). Objetivo: revisar com o Pedro antes de implementar.
> Módulo 18 — Gestão de Troco (cofre). Branch: `feat/gestao-troco-denominacoes-configuraveis`.

---

## 0. Como está hoje (o problema, em linguagem simples)

O cofre da unidade guarda o dinheiro separado por tipo de nota/moeda ("denominação"): R$ 200,
R$ 100, … R$ 0,05, mais uma linha "outros". Esses valores estão **escritos dentro do código**,
em **três listas diferentes** — e aí está a raiz do incômodo:

| Onde | Lista | Para que serve |
|---|---|---|
| `src/lib/cash-vault.ts:19` | `200 100 50 20 10 5 2 1 0,50 0,25 0,10 0,05` + `outros` | lista mestra do servidor (valida o que entra, monta o saldo) |
| `src/components/cash/vault-client.tsx:14` | **a mesma lista, copiada** | monta os formulários na tela |
| `src/components/cash/vault-client.tsx:51` | `only="big"` = `200 100 50 20`<br>`only="small"` = `10 5 2 1 0,50 0,25 0,10 0,05` | decide quais linhas aparecem em cada **bloco** (SAIU / ENTROU) |
| `src/lib/cash-vault.ts:25` | `BIG_NOTES` = `200 100 50` | indicador "notas grandes ≥ 50% do cofre — hora de pedir troca" |

Repare em duas coisas que ninguém percebe olhando só a tela:

1. **A lista está duplicada** entre servidor e tela. Mexer só na tela cria um bug silencioso:
   o servidor descarta o que não conhece (a função `sanitize`, `cash-vault.ts:38`, só copia as
   chaves da lista mestra — o resto vira zero **sem avisar**).
2. **"Nota grande" tem hoje dois significados diferentes**: no formulário de reposição é
   `200/100/50/20`; no indicador de 50% é `200/100/50` (o R$ 20 fica fora). Isso é decisão de
   negócio embutida no código — e precisa de resposta do Pedro (ver §5, risco R1).

Fluxos que usam essas listas (todos os 5 do cofre):

| Fluxo | Bloco "saiu" | Bloco "entrou" |
|---|---|---|
| Conferir cofre | — | todas as linhas |
| **Repor balde (troca 1:1)** ← o pedido | miúdos (`small`) | notas grandes (`big`) |
| Troca no caixa | todas | todas |
| Troca c/ escritório | notas grandes (`big`) | miúdos (`small`) |
| Retirada (proibida) | todas | — |

Ou seja: **resolver só a tela de reposição resolveria 1 de 5 telas**. O plano abaixo troca a
fonte da verdade de uma vez, e todas as telas passam a ler do banco.

---

## 1. Schema Prisma — o que nasce de novo

### 1.1 Uma tabela nova: `CashDenomination`

Uma linha = "uma nota/moeda que existe no cofre desta unidade". Nada mais.

```prisma
/// Denominações do cofre de troco — configuráveis por unidade (Módulo 18).
/// Sem nenhuma linha cadastrada, a unidade usa a lista padrão do código
/// (compatibilidade: comportamento idêntico ao de hoje).
model CashDenomination {
  id     String @id @default(cuid())
  unitId String

  /// Chave usada no JSON de saldos/movimentos: "200", "0.50", "outros".
  /// É o que amarra esta linha ao histórico já gravado — NÃO muda depois de criada.
  key    String
  /// Valor em R$ da nota/moeda. Nulo só na linha "outros" (PIX/caixinha).
  value  Decimal? @db.Decimal(10, 2)
  /// "NOTE" | "COIN" | "OTHER" — só para o rótulo na tela ("Nota R$ 10" / "Moeda R$ 0,50").
  kind   String   @default("NOTE")
  /// Rótulo opcional para sobrescrever o texto automático.
  label  String?

  /// Em quais BLOCOS esta denominação aparece (o coração da configuração):
  isSmall Boolean @default(false) // bloco de miúdos/troco (SAIU na reposição, RECEBIDO do escritório)
  isBig   Boolean @default(false) // bloco de notas grandes (ENTROU na reposição, ENVIADO ao escritório)
  /// Conta no indicador "notas grandes ≥ 50% do cofre". Separado de isBig
  /// porque hoje as duas listas são diferentes (ver decisão R1 do plano).
  countsAsBigIndicator Boolean @default(false)

  order  Int     @default(0)     // ordem de exibição (200 primeiro … 0,05 por último)
  active Boolean @default(true)  // desligar sem apagar (preserva o histórico)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  unit Unit @relation(fields: [unitId], references: [id], onDelete: Cascade)

  @@unique([unitId, key])
  @@index([unitId, active])
  @@map("cash_denominations")
}
```

E uma linha na tabela `Unit` (só a "volta" do relacionamento, sem coluna nova no banco):

```prisma
model Unit {
  // …
  cashDenominations CashDenomination[]
}
```

### 1.2 Como se relaciona com `Unit`

Chave estrangeira `unitId` → `Unit`, com `onDelete: Cascade`: se a unidade for excluída, a
**configuração** dela vai embora junto (é só configuração, não é histórico). Mesmo padrão já
usado em `CommandSequence` (`schema.prisma:551`). Isso, somado ao `@@unique([unitId, key])`,
garante no próprio banco que cada unidade tem sua lista e que não existe "R$ 10" duplicado
dentro da mesma unidade.

> Nota: `CashVault` e `CashBucket` hoje guardam `unitId` **sem** chave estrangeira. Estou
> propondo FK aqui porque é tabela de configuração (cascade é seguro). Se o Pedro preferir
> uniformidade com o resto do módulo, tiramos a FK — decisão de 1 linha, sem impacto funcional.

### 1.3 Como se relaciona com os registros de reposição JÁ EXISTENTES

**Aqui está a boa notícia: nenhuma tabela existente é alterada.**

Hoje o saldo do cofre (`cash_vaults.balances`) e cada movimento
(`cash_vault_movements.deltas`) são gravados como **JSON com o valor de cada denominação**:

```json
{ "200": 0, "100": 400, "50": 150, …, "0.05": 12.30, "outros": 250 }
```

Esse JSON é uma **fotografia do que foi contado naquele dia** — ele não "aponta" para uma
tabela de denominações; ele carrega as próprias chaves. Consequência prática:

- A tabela nova **não precisa** de FK para os movimentos. Nada de `denominationId` em
  `CashVaultMovement`.
- Uma reposição de 3 meses atrás continua legível **mesmo que** a unidade depois desligue o
  R$ 0,25: o valor está gravado no JSON daquele movimento.
- O papel da tabela nova é **só decidir o que aparece nos formulários e o que é aceito na
  entrada** — passado nenhum é reescrito.

⚠️ **O detalhe que pode virar bug (e que o plano resolve):** hoje a função `sanitize()`
(`cash-vault.ts:38`) é usada para **duas coisas ao mesmo tempo** — validar o que o usuário
digita **e** ler o histórico de volta. Ela descarta qualquer chave fora da lista mestra. Se a
lista passar a variar por unidade, ler o histórico com a configuração *de hoje* faria os
totais antigos mudarem na tela. A implementação **precisa separar em duas funções**:

- `sanitizeInput(config, json)` → **restritiva**: só aceita as chaves ativas daquela unidade.
- `readBalances(json)` → **tolerante**: devolve tudo que está gravado, inclusive chaves que já
  não existem mais na configuração (aparecem marcadas como "legado" na tela).

Isso vale como requisito de teste automatizado (ver §4, PR 1).

---

## 2. Migração e compatibilidade

### 2.1 A migração em si

Uma migração **puramente aditiva**: `CREATE TABLE cash_denominations` + índices. Nenhum
`ALTER TABLE`, nenhum `UPDATE`, nenhum dado tocado. Em produção (droplet) isso roda em
milissegundos e é o tipo mais seguro de migração que existe.

```
prisma/migrations/2026MMDD_cash_denominations/migration.sql
```

**Rollback:** reverter o código e, se quiser, `DROP TABLE cash_denominations`. Como nenhuma
tabela antiga foi mexida, voltar atrás não perde nem um centavo de histórico.

### 2.2 O que acontece com quem já usa as listas fixas (compatibilidade)

A regra de ouro do plano: **no dia do deploy, nada muda visualmente para ninguém.**

Mecanismo — **fallback para a lista padrão**:

1. A lista atual (`200 … 0,05` + `outros`, com os grupos `small`/`big` de hoje) continua no
   código, mas rebatizada como `DEFAULT_DENOMINATIONS` — deixa de ser "a verdade" e passa a
   ser "o padrão de fábrica".
2. `getDenominations(unitId)` faz: *tem linhas no banco para esta unidade? usa elas. Não tem?
   devolve o padrão de fábrica.*
3. Como o padrão de fábrica é **byte a byte a lista de hoje**, uma unidade que ninguém
   configurou se comporta exatamente como hoje. Unidade nova, criada no ano que vem: idem.

**Semeadura (seed):** em vez de um `UPDATE` na migração, uso o padrão que o projeto já adota em
`ensureDefaultModels()` (`checklist-models-seed.ts`): uma função `ensureUnitDenominations(unitId)`
que **cria as 13 linhas padrão na primeira vez que alguém abre a tela de configuração daquela
unidade**. Vantagens: migração continua sem dados, e a criação fica auditada com autor.

**Saldos existentes:** ficam intactos. Se a unidade **ligar** o R$ 10 no bloco ENTROU, o R$ 10 já
existe no JSON (com 0 ou com valor) — nada a converter. Se **desligar** uma denominação que
ainda tem saldo, o valor não pode simplesmente desaparecer da soma → ver risco R2 (§5).

**Telas que hoje leem as listas fixas:** todas passam a receber a configuração como parâmetro.
Enquanto o PR 3 não sair, elas continuam com a lista fixa — e, como ela é igual ao padrão de
fábrica, o sistema fica coerente **em qualquer ponto intermediário** da sequência de PRs. Isso
é o que permite quebrar em PRs pequenos sem deixar a produção num estado meia-boca.

**Fora do escopo (checado):** `/api/cash/export` (`src/app/api/cash/export/route.ts`) exporta o
modelo **antigo** `CashSession`, não o cofre — não é afetado. A Visão Executiva
(`src/lib/executive.ts`) só consome o *total* de retiradas — também não é afetada.

---

## 3. Arquivos tocados

### Backend

| Arquivo | O que muda |
|---|---|
| `prisma/schema.prisma` | modelo `CashDenomination` + relação em `Unit` |
| `prisma/migrations/2026MMDD_cash_denominations/` | **novo** — só `CREATE TABLE` |
| `src/lib/cash-denominations.ts` | **novo** — padrão de fábrica, `getDenominations`, `ensureUnitDenominations`, CRUD (criar/editar/ligar-desligar/reordenar/excluir), auditoria |
| `src/lib/cash-vault.ts` | tira as constantes fixas (linhas 19–25); `sanitize` vira `sanitizeInput(config, …)` + `readBalances`; `invalidMultiples` passa a usar os valores do banco; `BIG_NOTES` → flag `countsAsBigIndicator`; `getVaultOverview` devolve a configuração junto |
| `src/lib/permissions.ts` | novo módulo `CASH_CONFIG` na matriz + helper `canEditModule(role, key)` para checagem no servidor |
| `src/app/api/cash/denominations/route.ts` | **novo** — GET (listar) / POST (salvar, reordenar, excluir), sempre com `canAccessUnit` |
| `src/lib/guide.ts` | seção "Gestão de Troco (cofre)" (linha ~332) ganha o passo a passo da nova configuração — **exigência do CLAUDE.md, regra 5** |
| `tests/cash-denominations.test.ts` | **novo** — regras de negócio (ver PR 1) |
| `tests/cash.integration.test.ts` | ajustes se algum teste assumir a lista fixa |

### Frontend

| Arquivo | O que muda |
|---|---|
| `src/components/cash/vault-client.tsx` | tira as 2 listas fixas (linhas 14 e 51); `DenomForm` passa a receber as denominações por props (`group: 'small' \| 'big' \| 'all'`); `denomLabel` (linha 38) usa `kind`/`label` do banco em vez de "≥2 é nota"; o texto do indicador (linha 198) deixa de dizer "(50/100/200)" fixo |
| `src/app/(app)/modulos/troco/page.tsx` | carrega a configuração da unidade e repassa; calcula `canConfigureDenoms` no servidor |
| `src/components/admin/cash-denominations-admin.tsx` | **novo** — tela de configuração (mesmo padrão de `commands-config-admin.tsx`) |
| `src/app/(app)/configuracoes/troco/page.tsx` | **novo** — página de configuração com seletor de unidade |
| `src/app/(app)/configuracoes/page.tsx` | novo cartão "Troco — denominações por unidade" |

### Permissão — como atender "usar a Gestão de Acessos, sem papel novo"

Não crio papel (`Role`) nenhum. Adiciono **uma linha nova na matriz perfil × módulo** que já
existe em `/configuracoes/perfis`:

```ts
{ key: 'CASH_CONFIG', label: 'Gestão de Troco — configurações' }   // sem `nav`: não aparece na sidebar
RESTRICTED_DEFAULT.CASH_CONFIG = ['SUPERVISOR', 'COORDINATOR']      // padrão; Admin/CEO sempre
```

É exatamente o mecanismo já usado por `SUPERVISION` e `EXECUTIVE` (`permissions.ts:52`). O Admin
liga/desliga para qualquer perfil na tela que já conhece, sem deploy. No servidor, cada ação de
configuração checa **duas** coisas (regra 3 do CLAUDE.md): `canEditModule(user.role, 'CASH_CONFIG')`
**e** `canAccessUnit(user, unitId)` — permissão de função *e* escopo de unidade, nunca só um.
Toda alteração entra no Log de Auditoria (`CASH_DENOM_SET` / `_OFF` / `_DELETE`) — regra 7.

---

## 4. Divisão em PRs

Quatro PRs pequenos, cada um sozinho no ar sem quebrar nada.

### PR 1 — Schema + backend (invisível para o usuário)
- Modelo, migração, `cash-denominations.ts` com o padrão de fábrica.
- `cash-vault.ts` passa a **ler do banco com fallback**; separação `sanitizeInput` / `readBalances`.
- Testes: (a) unidade sem configuração se comporta igual a hoje; (b) unidade com R$ 10 ligado no
  bloco ENTROU aceita R$ 10 na reposição; (c) movimento antigo com chave desativada continua
  somando o valor correto no histórico; (d) troca 1:1 e a validação de múltiplos seguem valendo.
- **Como validar:** `npm test`. A tela não muda — é o objetivo.

### PR 2 — Permissão + tela de configuração
- `CASH_CONFIG` na matriz + `canEditModule`.
- `/api/cash/denominations` e `/configuracoes/troco` (seletor de unidade, ligar/desligar, marcar
  em quais blocos aparece, reordenar, "copiar de outra unidade" se o Pedro aprovar — R4).
- Atualização do `guide.ts`.
- **Como validar:** supervisor configura, o Log de Auditoria registra, a tela de reposição
  **ainda não muda** (ela lê a lista fixa até o PR 3). Ponto de corte proposital: dá para
  configurar tudo com calma antes de a operação sentir qualquer diferença.

### PR 3 — Tela de reposição (e as outras 4) lendo do banco
- `troco/page.tsx` repassa a configuração; `DenomForm` fica orientado a dados; as listas fixas
  do frontend são apagadas; rótulos e indicador saem do banco.
- **Como validar:** ligar o R$ 10 em ENTROU na configuração e ver a linha aparecer na reposição
  **sem tocar em código** — que é o objetivo do pedido.

### PR 4 — Acabamento (opcional, pode virar backlog)
- Botão "aplicar esta configuração a todas as minhas unidades".
- Exclusão pelo Admin em `/api/admin/ops` para manter o padrão do projeto.
- Bloqueio de desativação com saldo ≠ 0 (depende de R2).

---

## 5. Riscos e decisões que dependem do Pedro

**R1 — "Nota grande" tem dois significados hoje. Unificar ou manter separado?**
O bloco ENTROU da reposição usa `200/100/50/20`; o alerta de "≥50% do cofre" usa `200/100/50`.
Uma flag só não reproduz os dois. **Recomendação:** manter as duas flags (`isBig` e
`countsAsBigIndicator`), com o padrão de fábrica reproduzindo exatamente os números de hoje —
assim ninguém vê indicador mudando de valor sozinho. Se o Pedro disser "é a mesma coisa,
unifica", simplifica o modelo, **mas o percentual do indicador muda de valor** em unidades com
R$ 20 em cofre. Precisa de "ok" explícito.

**R2 — Desligar uma denominação que ainda tem saldo no cofre.**
Ex.: desligar R$ 0,25 com R$ 8,50 em moedas de 25 centavos lá dentro. Opções: (a) **bloquear**
até zerar; (b) permitir e continuar mostrando a linha como "legado — zerar na próxima
conferência". **Recomendação: (a) bloquear**, com mensagem clara — cofre é dinheiro, sumir valor
da soma é o pior resultado possível. Decisão do Pedro.

**R3 — Valor livre ou lista pronta?**
Deixar digitar qualquer valor (R$ 3,00) abre porta para erro de digitação e quebra a validação
de múltiplos. **Recomendação:** a tela oferece a lista fechada das denominações reais do Real
(200, 100, 50, 20, 10, 5, 2, 1, 0,50, 0,25, 0,10, 0,05, 0,01) para **ligar/desligar e classificar**,
sem campo numérico livre. Resolve 100% do caso do Pedro (faltava o R$ 10 no bloco ENTROU) sem
abrir risco. Se ele quiser campo livre (moeda comemorativa, "vale", etc.), dá para adicionar
depois — o modelo já suporta.

**R4 — 15 unidades × configuração manual.**
O requisito é escopo por unidade, e o plano cumpre. Mas configurar uma por uma é trabalhoso.
**Recomendação:** manter por unidade (como pedido) e incluir no PR 2 um botão "copiar para
todas as minhas unidades". Alternativa que **não** recomendo: padrão global com exceção por
unidade — mais simples de operar, mas foge do requisito e complica o servidor.

**R5 — Quem configura, por padrão?**
Proponho `SUPERVISOR` + `COORDINATOR` (+ Admin/CEO sempre), espelhando o `canManageBuckets`
atual (`cash-vault.ts:60`). Como é matriz, o Admin muda depois sem deploy. Confirmar se gerente
deve ou não poder mexer — **minha recomendação é não**: quem opera o cofre não deve definir as
regras do cofre.

**R6 — A linha "outros" (PIX/caixinha).**
Recomendo travá-la como linha de sistema: não pode ser excluída (pode ser renomeada). Ela não
tem valor de nota, então fica fora da validação de múltiplos — se alguém a apagasse, o saldo
"outros" já gravado ficaria órfão.

**R7 — Coerência de relatórios se a configuração mudar no meio do mês.**
Baixo. O JSON de cada movimento é fotografia, então o histórico não muda. O único efeito é a
tela mostrar linhas "legado" para chaves desativadas — comportamento previsto no plano.

---

## Regras do CLAUDE.md respeitadas

- **Regra 3** — escopo por unidade sempre no servidor (`canAccessUnit` + `unitScopeWhere`).
- **Regra 7** — toda mudança de configuração no Log de Auditoria.
- **Regra 2** — interface PT-BR, mobile-first, tema claro; `MultiSelect` se a tela precisar de
  seleção de várias unidades.
- **Regra 5 (Como trabalhar)** — `src/lib/guide.ts` atualizado no PR 2.
- **Regra 1** — nada aqui toca proxy, túnel, Caddy ou a plataforma do CEO.
