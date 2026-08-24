# Changelog — SGO Beija Flor

Registro das versões do aplicativo. Convenção de versão: **v{maior}.{menor}.{correção}**
- **correção** (x.y.**z**): ajustes de texto/tela, correção de bugs.
- **menor** (x.**y**.0): melhorias e novas funções dentro de módulos existentes.
- **maior** (**x**.0.0): módulo novo grande / mudança estrutural.

A versão em uso aparece no rodapé do menu e na tela de login.

---

## v1.54.3 — 2026-08-24 (Tarefas obedece o seletor de unidade do cabeçalho)

### O problema por trás do "voltar"
O app tinha **dois filtros de unidade que não se falavam**:

- o **seletor global** do cabeçalho (o chip com o nome da unidade) grava `?unidade=` + cookie;
- a tela de **Tarefas** lia só `?unit=`, o parâmetro dos atalhos do Dashboard.

Resultado: o cabeçalho dizia "Moreira" e a lista mostrava a rede inteira. A unidade que parecia
"perdida" ao voltar de uma tarefa **nunca esteve aplicada** — por isso a correção da v1.54.2, que
levava o filtro no link, não resolveu o caso de quem escolhe a unidade lá em cima.

### Corrigido
A tela de Tarefas passa a **obedecer o seletor**. Precedência, do mais explícito para o mais
implícito (`src/lib/scope/unit-filter.ts`):

1. `?unit=todas` — "ver todas", e vence o seletor;
2. `?unit=<ids>` — filtro explícito da tela (atalhos do Dashboard), aceita vários;
3. `?unidade=<id>` — o seletor refletido na URL;
4. o **cookie do seletor** — o que o chip mostra. É o padrão.

- **"Ver todas as unidades"** passou a ser explícito (`?unit=todas`): sem isso, um `/tarefas` sem
  parâmetro voltaria a cair no seletor e o link não sairia do lugar.
- Com **uma unidade só** no alcance, a tela nunca se diz "filtrada" — senão ofereceria um "ver
  todas" que não muda nada.
- Unidade fora do alcance do usuário continua ignorada: isto é filtro de tela, e quem garante o
  escopo é o `unitScopeWhere` no banco (regra nº 3).

### Testes
`tests/unit-filter.test.ts` (9) — cada nível da precedência, várias unidades, unidade de outro
grupo ignorada, usuário de uma unidade só e usuário sem unidade alguma.

---

## v1.54.2 — 2026-08-24 (Tarefas: o "voltar" devolve a lista da unidade)

### Corrigido
Abrir uma tarefa e clicar em **"← Tarefas"** caía na lista de **todas as unidades**. Quem estava
vendo Moreira perdia o lugar e tinha de filtrar de novo — a cada tarefa aberta.

O link do "voltar" era um `/tarefas` fixo, sem o filtro que a lista usa (`?unit=`). Agora o filtro
**viaja com o link**: a lista o manda no link do detalhe e o detalhe o devolve na volta.

- `src/lib/tasks/links.ts` — `hrefDetalheTarefa` e `hrefVoltarTarefas`, juntos porque só funcionam
  em par: se só um lado carregasse o parâmetro, a volta continuaria caindo na lista geral.
- O destino do "voltar" é **sempre** `/tarefas`; o parâmetro só reconstrói o filtro, e a lista o
  valida contra as unidades do usuário (escopo no servidor, regra nº 3).
- Tarefa de módulo ainda pendente continua abrindo o módulo, como antes.
- A seta **←** do cabeçalho já usava o histórico do navegador e sempre funcionou — o defeito era
  só do link dentro da página.

### Testes
- `tests/tasks-links.test.ts` (4) — ida e volta com o mesmo filtro, URL limpa sem filtro, várias
  unidades (`u1,u2`), e a volta nunca saindo de `/tarefas` com parâmetro malicioso.
- `tests/task-item-render.test.tsx` (4) — o link sai no HTML com a unidade, inclusive na tarefa
  **concluída** (a tela exata do relato).

---

## v1.54.1 — 2026-08-24 (URGENTE — a conferência em grade não estava registrando nada)

### O que estava acontecendo
A rota `/api/commands/count` **descartava a grade**. A tela mandava as comandas marcadas
(`presentNumbers`, `inUseNumbers`, `scopeNumbers`); a rota repassava só `absentNumbers`, que a grade
não usa. O servidor recebia uma grade vazia e concluía que **não faltava nada**:

- gravava a contagem do dia com **0 faltando**, qualquer que fosse a marcação;
- **não abria divergência** para comanda nenhuma, e o supervisor não era avisado;
- **aceitava sem observação**, porque para ele não havia falta;
- salvava a grade **em branco** — no dia seguinte ela reabria zerada.

A função `submitCount` estava certa e testada. O que faltava era teste **na rota**: os campos
morriam no caminho entre a tela e a função, e nenhum teste passava por ali.

### O beco sem saída do botão
Comandas **em apuração** e **baixadas** ficam na grade só para o número não sumir da sequência —
são desabilitadas e se resolvem no bloco de Divergências. A tela, porém, as contava como faltantes.
Com tudo o que dava para marcar marcado, o contador zerava e **o campo de observação sumia** — mas
a confirmação continuava recusando por falta de observação. Botão sem resposta possível.

### Corrigido
- A rota repassa `presentNumbers`, `inUseNumbers` e `scopeNumbers` (como `undefined` quando não
  vêm — `[]` significaria "nada marcado" e transformaria a sequência inteira em falta).
- A tela julga o mesmo universo que mostra (`ausentesDaGrade`, em `src/lib/commands/grid.ts`) e
  manda o **escopo** da conferência, para em apuração não reabrir divergência a cada contagem.
- A recusa por falta de observação agora **aparece no campo**: ele fica em vermelho, recebe o foco,
  a tela rola até ele e o texto diz que sem isso a conferência não é registrada. Antes o aviso saía
  num banner longe do botão e parecia que o botão estava quebrado.

### Testes
- `tests/commands-count-route.integration.test.ts` (5) — chama **a rota**: falta vira divergência,
  a grade é gravada, em uso conta como presente, contagem parcial só julga o escopo dela, e sem
  observação o **servidor** recusa. Contra o código anterior, 3 destes falham.
- `tests/commands-grid.test.ts` (5) — inclusive o beco sem saída.

---

## v1.54.0 — 2026-08-21 (Notas: vários boletos por nota, cada um acompanhado)

### Novo
- **A nota aceita vários boletos, sem limite de quantidade.** Abaixo do vencimento há "Adicionar outro boleto"; cada um tem
  vencimento e valor próprios. O **boleto 1 recebe automaticamente o que sobra** do valor da nota —
  quem lança não precisa recalcular à mão o que o sistema sabe fazer.
- **Cada boleto entra sozinho no acompanhamento de vencimentos**, com o valor dele, identificado
  como "boleto 2 de 3" — e **alerta a supervisão e o financeiro na data dele**.
- **Os boletos também se editam** em "Ver e editar" (Supervisão/Admin): corrigir vencimento, corrigir
  valor, acrescentar ou remover boleto de uma nota já lançada. Sem isso, um vencimento digitado
  errado ficaria errado para sempre — avisando no dia errado, que é pior do que não avisar.

### Por que isso importa mais do que parece
A nota tinha **um** vencimento. Com 3 boletos — e às vezes mais —, o 2º em diante simplesmente não existia para o
sistema: não apareciam na aba de Vencimentos e não disparavam alerta. Venciam sem ninguém saber.
O campo faltando no formulário era o sintoma; o risco era boleto vencendo no silêncio.

### Detalhes que sustentam isso
- O aviso é controlado **por parcela** (`alertedAt` na parcela, não na nota). Com o controle na
  nota, o alerta do 1º boleto silenciaria os outros dois.
- O `dueDate` da nota passa a ser o do **primeiro** boleto, e os boletos são ordenados por
  vencimento independentemente da ordem de digitação. Assim a lista, os alertas antigos e as
  exportações que já leem esse campo continuam corretos.
- **Nota de boleto único não muda em nada** — nem no formulário, nem na aba de Vencimentos.
- Editar uma nota **sem falar de boleto** (trocar o fornecedor, por exemplo) não apaga as parcelas.
- Gás fica de fora: não vem parcelado.

### Testes
- `tests/notes-installments.integration.test.ts` — 8 casos: ordenação e numeração, linha vazia
  descartada, os três gravados, **cada boleto aparecendo no acompanhamento com o próprio valor**,
  a nota parcelada não aparecendo em duplicidade, edição substituindo os boletos, edição de outro
  campo preservando-os, e a nota de boleto único inalterada.
- `tests/notes-client-render.test.tsx` — a tela de Notas **monta** em cinco estados. Toda tela que
  eu mexer passa a ter isto, pela lição de ontem.

282 testes no total.

---

## v1.53.2 — 2026-08-21 (A tela de Troco voltou a abrir)

### Corrigido — a tela de Troco não abria, para ninguém
- **"Application error: a client-side exception" ao entrar no Troco.** Defeito meu, publicado na
  v1.53.0: eu li a variável `chegou` **quatro linhas antes** do `useState` que a declara. Ler uma
  `const` antes da própria declaração estoura na hora, e como isso acontece no corpo do componente,
  a tela morria ao montar — **toda vez, para todo mundo**.
- O TypeScript não pegou porque a leitura estava dentro do callback de um `reduce`: ele não prova
  quando o callback roda. Os 265 testes também não pegaram — nenhum montava uma tela.
- **Também faltou aplicar** a melhoria que mostra o estado do ciclo na lista de solicitações
  ("aguardando o escritório" / "a caminho" / "recebido"). Ela estava num script que quebrou por
  outro motivo e eu reexecutei só parte dele, sem conferir o resultado.

### Testes
- `tests/vault-client-render.test.tsx` — monta a tela de Troco em quatro estados: cofre limpo,
  pedido aguardando o escritório, **troco a caminho** (o caso exato que quebrou) e troco já recebido.
  Se alguém repetir o erro, para aqui. 269 no total.
- Rodei também o **build de produção**, que passou — o que mostra que build passando não prova que a
  tela abre. Só o teste de renderização prova.

---

## v1.53.1 — 2026-08-21 (Teste de renderização de tela)

### Testes
- **Agora dá para testar se uma TELA monta**, não só se a regra de negócio calcula.
  `tests/commands-client-render.test.tsx` renderiza a tela de Comandas com as props que a Moreira
  produz hoje — 699 ativas, 48 baixadas, 3 em apuração, faixa de madrugada, 416 divergências
  abertas, contagem completa atrasada.
- Nasceu de uma investigação: a tela quebrou em produção com "Application error: a client-side
  exception" e eu não conseguia reproduzir sem entrar no sistema. Renderizar o componente fora do
  navegador pega exatamente essa classe de erro — o que estoura na montagem — sem precisar de
  sessão. **Os cinco casos passaram**, o que descartou o componente e apontou a investigação para
  o lado certo.
- `vitest.config.ts`: passa a incluir `.tsx` e a compilar JSX no modo automático, como o Next.

265 testes no total.

---

## v1.53.0 — 2026-08-21 (Troco: ciclo completo — solicitação, envio e confirmação)

### Novo — o ciclo ganha três etapas e três donos
`SOLICITADO` → `ENVIADO` (escritório) → `RECEBIDO` (gerente confirma) · `CANCELADO`

- **Aba do escritório** (`/modulos/troco/escritorio`, do Supervisor para cima; CEO em leitura):
  fila de **todas as unidades** com o pedido detalhado por denominação, e **relação de troco
  enviado** com filtro por unidade e período. O que chegou diferente aparece em vermelho na relação.
- **Registro do envio.** O escritório lança o que **realmente enviou** — pode ser menos do que se
  pediu, e o pedido original fica preservado ao lado. O formulário já vem preenchido com o pedido:
  o caso comum é mandar exatamente aquilo, e redigitar doze campos só criaria erro.
- **Confirmação do gerente.** Na tela de Troco aparece "chegou troco do escritório"; ele lança o que
  **realmente chegou**, por denominação.

### A regra que sustenta tudo
**O cofre só é atualizado na confirmação do recebimento**, nunca no envio. Enquanto o dinheiro está
a caminho ele não está na gaveta — se o saldo subisse no envio, o gerente conferiria o cofre contra
um número que ainda não chegou. O movimento registrado é o que **chegou**, não o que saiu.

### Recebido diferente do enviado
Vira alerta crítico para a supervisão na hora, com os dois valores e a diferença. Dinheiro que sai
do escritório e não chega na unidade é exatamente o risco que este fluxo existe para pegar — antes
ele só apareceria (ou não) no fechamento do mês, sem dono.

### Banco
`cash_change_requests` ganha os conjuntos e a autoria de **envio** e **recebimento**
(`sentJson`/`receivedJson` + quem, quando e observação), e o enum ganha `SENT` e `RECEIVED`.
Migração **aditiva**; `RESOLVED` continua existindo para os pedidos do fluxo antigo.

### Testes
`tests/cash-change-lifecycle.integration.test.ts` — 11 casos, incluindo os três que mais importam:
**o envio não mexe no cofre**, **a confirmação é que aplica**, e **o cofre recebe o que chegou, não
o que foi enviado**. Também: gerente não envia, escritório pode mandar menos, a diferença fica
registrada, não confirma duas vezes, não confirma o que não saiu, e o gerente não enxerga a fila do
escritório. 260 testes no total.

---

## v1.52.5 — 2026-08-20 (A limpeza de divergências volta a funcionar — e ganha os testes que faltavam)

### Corrigido
- **"Requisição inválida" ao apagar as divergências em lote.** A rota de exclusões tem uma guarda
  genérica que exige `id` (ou `ids`) — e esta operação é identificada por **unidade + dia**. Eu
  acrescentei o despacho e não olhei a guarda acima dele, então a chamada era recusada antes de
  chegar lá. O botão parecia quebrado e o motivo não aparecia em lugar nenhum. A guarda passou a
  reconhecer o alvo por unidade + dia, e o botão passou a enviar a ação.

### Testes — o que estava faltando
Subi uma ação **destrutiva sem nenhum teste**, e ela chegou quebrada em produção. Agora tem 9:
- só ADMIN executa · recusa data mal formada · dia sem divergência devolve zero
- **apaga só as ABERTAS, só do dia e só da unidade** — deixa intactas a que está em apuração, a
  encerrada, a de outro dia e a de outra unidade
- a exclusão fica registrada na auditoria
- e a **guarda da rota**, que virou função pura para poder ser testada: aceita o alvo por
  unidade + dia, recusa quando falta um dos dois, e mantém a exigência de `id` para as demais
  exclusões — inclusive o caso exato do defeito.

249 testes no total.

---

## v1.52.4 — 2026-08-20 (A limpeza de divergências oferece os dias em vez de pedir a data)

### Melhorado
- **O bloco de limpeza mostra um botão por dia que realmente tem divergência aberta**, com a
  contagem de cada um (ex.: `20/08/2026 · 413`). Antes era um campo de data vazio: o Admin tinha de
  **adivinhar o dia**, e o botão ficava apagado até acertar — o sistema sabia a resposta e ainda
  assim perguntava. Fricção que eu mesmo criei.
- A confirmação passa a dizer **quantas** serão apagadas naquele dia, não só a data.

---

## v1.52.3 — 2026-08-20 (Faixas sobrepostas: total certo e aviso na configuração)

### Corrigido
- **O total de comandas da unidade estava errado quando as faixas se sobrepunham.** A tela somava
  os tamanhos das faixas em vez de contar números distintos: uma unidade com `2–300` e `1–700`
  mostrava **999** comandas ativas, quando tem **700**. Número inventado — e, pior, ninguém percebia
  que as faixas se cruzavam. Agora a conta é por número distinto.
- **A tela avisa quando duas faixas se sobrepõem**, nomeando o par e o trecho em comum
  (ex.: `"Sequência 1" e "Madrugada" (2–300)`). Sobreposição não quebra a contagem — a sequência
  ativa é um conjunto —, mas confunde quem configura: a mesma comanda aparece em duas faixas e não
  fica claro qual rotina vale para ela.
- O resumo passa a separar por rotina: **quantas são conferidas na madrugada** e quantas ficam só
  para a contagem semanal. É a checagem que faltava para conferir a configuração de relance.
- O texto de ajuda agora diz explicitamente que **as faixas não devem se sobrepor**.

---

## v1.52.2 — 2026-08-20 (Indicador da última contagem completa)

### Novo
- **A tela de Comandas mostra há quantos dias foi a última contagem COMPLETA.** Ele existe por um
  motivo específico: com a contagem parcial rodando toda madrugada, a tela diria "contagem de hoje
  já registrada" todo dia — o que é verdade — enquanto as comandas fora da faixa poderiam estar sem
  conferência há semanas, sem ninguém notar.
- Uma contagem só conta como completa quando **não gravou escopo**. As contagens anteriores a esta
  funcionalidade também contam, porque antes dela toda contagem cobria a sequência inteira.
- **Passando de 8 dias, o aviso fica vermelho** e diz que as comandas fora da faixa da madrugada
  estão sem conferência desde então. 8 e não 7 porque de segunda a segunda dá exatamente 7.
- Se a unidade **nunca** teve contagem completa, o aviso diz isso — é o caso que mais importa.
- **Só aparece em unidade com faixa de madrugada.** Onde se confere tudo todo dia, "última completa"
  seria sempre "hoje" e viraria ruído.

### Testes
4 casos novos em `tests/commands-partial-count.integration.test.ts`: a parcial **não** conta como
completa · a completa é encontrada e os dias batem · passando do ritmo acusa atraso · e uma parcial
mais recente **não apaga** a completa anterior. 238 testes no total.
## v1.52.1 — 2026-08-20 (O leitor grava as bipadas · limpeza em lote de divergências)

### Corrigido — defeito meu, visível na primeira madrugada
- **A conferência por leitor não gravava quais comandas foram bipadas.** Ela mandava só a lista de
  AUSENTES, então `presentNumbers` ficava vazio sempre que houvesse ao menos uma faltante — e no dia
  seguinte a grade do gerente abria **"0 ok · 236 faltando"**, como se ninguém tivesse contado nada,
  depois de uma conferência inteira. Agora o leitor grava as bipadas e a grade abre com elas verdes.

### Novo
- **Limpeza em lote das divergências abertas de um dia** (Admin, na tela de Comandas). Aparece só
  quando há **mais de 20 divergências abertas** — volume assim é sinal de engano do SISTEMA, não de
  sumiço real: tipicamente uma conferência **parcial registrada como completa**, que abre divergência
  para tudo que ninguém se propôs a contar naquela noite.
  Apaga apenas as **abertas**, de **um dia** e de **uma unidade**, com registro em auditoria. As já
  investigadas ou encerradas não são tocadas. Escolhi apagar em vez de fechar como "recuperada":
  fechar mentiria no histórico, porque essas comandas nunca sumiram.

### Testes
2 casos novos: o leitor grava as bipadas mesmo havendo faltantes, e bipando tudo grava a faixa
inteira. 236 testes no total.

---

## v1.52.0 — 2026-08-20 (Contagem parcial da madrugada: o que não foi contado não vira extravio)

### Novo
- **Faixa de madrugada por sequência.** Em Configurações → Comandas, cada faixa ganha um botão
  **"Madrugada" / "Só na semanal"**. A rotina real da rede: o caixa confere de madrugada apenas uma
  parte (ex.: 1–300) e a **contagem completa acontece uma vez por semana**, normalmente na segunda.
- **A contagem passou a ter ESCOPO.** `submitCount` aceita `scopeNumbers`: o que está fora dele não
  é julgado — não vira faltante, não abre divergência, não alerta supervisor. Sem isso, toda noite
  as comandas que ninguém se propôs a contar seriam tratadas como extraviadas.
- **A tela do caixa avisa que é parcial**, em azul: quantas ele confere e quantas ficam de fora,
  com a frase de que as demais não serão tratadas como extraviadas. O contador "ativas" vira
  "nesta faixa". O caixa não precisa configurar nada — a faixa vem pronta.
- O escopo fica **gravado na contagem** (`scopeNumbers`), então o histórico distingue a parcial da
  completa. Contagem completa continua sem escopo e julgando tudo.
- **Nada muda em unidade sem faixa marcada**: o caixa confere todas as ativas, como sempre.

### Banco
`command_sequences.nightly` (boolean, padrão false) e `command_counts.scopeNumbers` (JSONB).
Migração **aditiva** — com o padrão `false`, nenhuma unidade muda de comportamento até alguém
marcar uma faixa.

### Testes
`tests/commands-partial-count.integration.test.ts` — 7 casos: a sequência separa madrugada de
semanal, a tela do caixa já vem no escopo, bipar a faixa inteira não deixa faltante, **as comandas
de fora não viram divergência** (o caso central), o escopo é gravado, "todas presentes" numa parcial
vale só para a faixa, e a contagem completa continua julgando tudo. 234 testes no total.

---

## v1.51.0 — 2026-08-19 (Permissão de módulo passa a valer no servidor — o Caixa só alcança a bipagem)

### Corrigido — controle de acesso
- **A matriz de perfis só escondia o item no MENU: dava para abrir qualquer tela digitando o
  endereço.** O perfil **Caixa**, que existe apenas para bipar comandas, alcançava
  `/modulos/executivo` (números da rede inteira), `/modulos/pessoas` (CPF e chave PIX) e
  `/modulos/atestados` — **CID, dado sensível de LGPD** — escrevendo a URL. Esconder no menu é
  conveniência; bloquear no servidor é controle de acesso.
- Agora existe **guarda de módulo no servidor** (`src/lib/permissions/route-guard.ts`), aplicada no
  layout autenticado: o caminho é resolvido para o módulo dono (o `nav` mais longo que o prefixa) e
  confrontado com a matriz de permissões. Quem não pode ver é mandado para uma tela que **pode**
  abrir — nunca para outra porta fechada, o que viraria laço de redirecionamento.
- O escopo por **unidade** já era verificado no servidor em cada consulta; o furo era só o de
  módulo.

### Nota
Nada muda para Admin, CEO, Gerente e Supervisor: os perfis abertos continuam com o mesmo acesso.
O que muda é que perfis restritos — Caixa hoje, e qualquer restrição que o Admin criar na matriz —
passam a ser restritos de verdade.

### Testes
14 casos novos: mapeamento caminho → módulo (incluindo `/modulos/notas/gas`, que é de NOTAS e não de
GÁS, e `/modulos/comandas-outro`, que não é de Comandas), o Caixa liberado só em Comandas e Ajuda,
bloqueado em Atestados/Pessoas/Pagamentos/Executivo/Configurações/Auditoria — inclusive nas telas
internas —, Admin e CEO inalterados, e a garantia de que o destino de cada perfil é sempre uma tela
que ele consegue abrir. 227 testes no total.

---

## v1.50.0 — 2026-08-19 (Troco, etapa 3: o pedido chega pré-preenchido pelo cofre)

### Novo
- **Botão "Sugerir pelo cofre"** no pedido de troco. A conta, em uma frase: o cofre precisa
  conseguir encher todos os baldes, então **o que falta de miúdos para cobrir a soma das metas é o
  que se pede** — pago com as notas grandes que estão sobrando. A tela mostra o cálculo em texto
  ("os baldes somam R$ 3.000 e o cofre tem R$ 800 em miúdos: faltam R$ 2.200…"), para o gerente
  julgar em vez de obedecer.
- **A composição dos miúdos vem do histórico da própria unidade.** A meta do balde é um valor total
  (R$ 500) — ela não diz quantas moedas de 0,50. Mas cada reposição de balde registra os deltas por
  denominação, ou seja, o que de fato sai do cofre para o caixa. A sugestão usa as **20 últimas
  reposições** da unidade. Sem histórico, divide igual entre os miúdos configurados — o que ao menos
  respeita quais denominações aquela unidade usa.
- **A sugestão fecha 1:1 de verdade.** A entrega é montada com as notas grandes que o cofre tem
  mesmo (da maior para a menor), e o pedido é ajustado para bater com o total resultante. Sugerir
  uma troca que o próprio formulário recusaria depois, por diferença de centavos, seria pior do que
  não sugerir.
- Quando não há o que sugerir, a tela **diz o porquê**: sem baldes com meta, miúdos suficientes, ou
  sem notas grandes para trocar.
- A sugestão **não grava nada** — preenche os campos e o gerente ajusta antes de enviar.

### Testes
`tests/cash-change-suggestion.integration.test.ts` — 7 casos, incluindo o que mais importa:
**a sugestão é aceita pelo próprio `requestChange`**. Também: não sugere sem baldes, não sugere com
miúdos sobrando, não sugere sem notas grandes, nunca entrega nota que o cofre não tem, os dois lados
fecham, e a composição segue as reposições da unidade. 213 testes no total.

---

## v1.49.1 — 2026-08-19 (A grade mostra TODOS os números, cada um com a cor do seu status)

### Melhorado
- **As comandas em apuração e as baixadas voltaram para a grade, coloridas.** Antes elas eram
  removidas: a grade pulava de 6 para 8, de 13 para 15, de 36 para 38 — e o gerente não tinha como
  saber se aquele número nunca existiu, foi baixado ou está em apuração. **Sumir não é informação.**
  Agora a grade mostra a sequência inteira, cada número com a sua cor:

  | Cor | Status |
  |---|---|
  | verde | conferida |
  | azul | em uso (com cliente) |
  | âmbar | **em apuração** — resolve no bloco Divergências |
  | cinza riscado | **baixada** (perdida, fora da sequência) |
  | sem cor | ainda não conferida |

- **Âmbar e cinza riscado não são clicáveis**, e o motivo aparece ao passar o mouse. Elas se
  resolvem no bloco de Divergências, não na contagem do dia. "Marcar todas" e "Marcar faixa"
  também as respeitam — o contador continua sendo sobre o que dá para conferir.
- Legenda das duas cores novas no topo da grade, com a contagem de cada uma.

### Acessibilidade
- A célula de baixada nasceu em `ink-400` e foi medida em **3,86:1** no tema claro e 4,25:1 no
  escuro — bem abaixo dos 7:1 exigidos para texto de 13px. Passou para `ink-500`: **7,01:1** e
  **7,02:1**. Os cinco estados foram medidos nos dois temas antes de subir.

---

## v1.49.0 — 2026-08-19 (A grade abre no status da última contagem, e "em uso" para de virar faltante)

### Corrigido — defeito sério
- **Comanda marcada "em uso" era enviada como FALTANTE.** A própria legenda da grade diz
  "2× = em uso (com cliente — **conta como presente**)", e o contador da tela tratava assim. Mas o
  envio calculava `ausentes = ativas − conferidas`, **sem descontar as em uso**: a comanda azul
  virava faltante, abria divergência e alertava o supervisor — o oposto do que o gerente lia na
  tela. O cálculo dos ausentes passou para o **servidor**, que recebe os dois conjuntos e tem uma
  definição só: ausente é o que não está nem conferido nem em uso.

### Melhorado
- **A grade abre no estado da última contagem.** Antes começava sempre vazia: mesmo com a contagem
  do dia registrada, a tela mostrava "0 ok · 648 faltando" e corrigir exigia remarcar as 648
  comandas uma a uma. Agora as conferidas voltam verdes e as em uso azuis, e registrar não limpa
  mais a grade.
- **A origem das marcas fica explícita.** Se a contagem é de hoje, aviso azul: "ajuste o que mudou e
  reenvie". Se é de um dia anterior, aviso **vermelho com a data**: "as marcas não são de hoje,
  confira a bandeja antes de confirmar". Uma grade que abre verde sem dizer de onde veio vira
  carimbo — o gerente confirma sem conferir, e o controle deixa de existir.

### Banco
- `command_counts`: colunas `presentNumbers` e `inUseNumbers` (JSONB). Migração **aditiva**.
  Contagens antigas não têm os conjuntos: nesses casos a grade abre vazia, como antes.

### Testes
4 casos novos em `tests/commands.integration.test.ts`: em uso não vira faltante (e não abre
divergência), o estado da grade é gravado, só o que não está conferido nem em uso fica faltando, e
"todas presentes" grava a sequência ativa inteira. 206 testes no total.

---

## v1.48.4 — 2026-08-19 (Só o leitor físico: sai o caminho por câmera das comandas)

### Removido
- **Tela de diagnóstico do leitor por câmera** (`/modulos/comandas/diagnostico-leitor`) e o
  componente `BarcodeDiagnostics`, além do atalho na Conferência por leitor. Decisão do Pedro: a
  conferência de comandas usa **somente o leitor físico**, que é o que está em uso no balcão.
- Nada da **calibração** foi perdido: o que a tela descobriu está gravado no parser
  (`src/lib/commands/barcode.ts`) e nos 23 testes — CODE_128 com o número em 4 dígitos, leitura
  exata para etiqueta curta, e o QR do cartão reconhecido como não-comanda. A tela era o
  instrumento de medida; a medida ficou.
- O leitor por **câmera das Notas Recebidas continua intacto** — ali a câmera lê a NFC-e e é o fluxo
  principal. O `@zxing` segue no projeto por causa dela.

### Melhorado
- Central de treinamento (`/ajuda`), guia "Conferência de comandas com leitor": explica que o cartão
  tem dois códigos e que o QR é ignorado sozinho, que a releitura do leitor apontado não é erro, e
  que a maioria dos leitores 2D permite **desativar a leitura de QR** no próprio aparelho — o que
  deixa a bipagem mais rápida.

---

## v1.48.3 — 2026-08-19 (Conferência por leitor: ignora o QR do cartão e a releitura do leitor de mão)

### Corrigido
- **O QR do Instagram impresso no cartão aparecia como erro em toda comanda bipada.** O cartão da
  rede traz, além do código de barras, um QR com
  `https://www.instagram.com/churrascariabeijaflor/` — e leitor de mão 2D lê os dois. A conferência
  registrava isso como **"código sem número", em vermelho**, como se fosse defeito. Não é defeito: é
  parte do cartão. O parser passa a reconhecer conteúdo que não é comanda (URL) e a tela **ignora em
  silêncio**, com um contador discreto no rodapé ("QR do cartão ignorado: N") — porque sumir sem
  dizer nada deixaria o operador sem entender por que o leitor bipou e a lista não mexeu.
- **Releitura imediata da mesma comanda enchia a lista de "já bipada".** Leitor de mão em modo
  contínuo relê o código enquanto está apontado para a etiqueta: a primeira leitura conferia e as
  seguintes viravam aviso, parecendo defeito. Agora a releitura **dentro de 2,5 s é ignorada**; fora
  dessa janela é o operador bipando de novo de propósito, e o aviso discreto continua útil.
  Também com contador no rodapé.
- O leitor por câmera das **Notas Recebidas** segue lendo QR de propósito — ali o QR é a NFC-e.
  A mudança vale só para a conferência de comandas.

### Testes
23 casos no parser: reconhecimento do QR do cartão como não-comanda, URL genérica, e a garantia de
que comanda não é confundida com URL. 202 testes no total.

### Como isso foi diagnosticado
Vídeo enviado da tela em operação (leitor físico, sessão do gerente). O vídeo é de **12:04** e a
v1.48.2 — que tirou o QR do leitor por **câmera** — entrou no ar às **12:07**: eram problemas
diferentes, no leitor físico, que a remoção do QR na câmera não alcançava.

---

## v1.48.2 — 2026-08-19 (Leitor de comanda calibrado: parser exato, leitura mais leve, Android consertado)

### O padrão da etiqueta, medido
Diagnóstico rodado num cartão real da rede (iPhone, 19/08/2026): formato **CODE_128**, conteúdo
**"0346"** — o número da comanda com zero à esquerda, 4 dígitos, **sem prefixo de unidade e sem
dígito verificador**. O cartão traz também um QR do Instagram, que não é comanda.

### Corrigido
- **O parser podia marcar presente a comanda ERRADA.** Ele testava janelas de dígitos e aceitava a
  primeira que existisse na sequência: "0346" gerava os palpites `[346, 34]` e **34 também é uma
  comanda válida**. Se a 346 não estivesse ativa, a conferência marcava a 34 — uma comanda que não
  está na mesa. Agora a **leitura exata tem precedência absoluta** e etiqueta de até 6 dígitos é
  lida só pelo número inteiro. As janelas continuam, mas só para códigos longos de padrão
  desconhecido, e **apenas quando apontam para UMA comanda ativa** — na ambiguidade, recusa e mostra
  o código lido. Num EAN de 13 dígitos as janelas chegavam a 1, 5 e 13 ao mesmo tempo e a primeira
  vencia; isso acabou.
- **O botão de abrir a câmera não aparecia no Android.** O efeito que inspeciona o leitor chamava
  `getSupportedFormats()` e um erro **síncrono** dela escapava do `.catch()`, derrubando o
  componente — e só onde a `BarcodeDetector` existe, que é o Android. No iPhone ela não existe, o
  `?.` curto-circuitava e nada quebrava: exatamente a assimetria relatada. Agora o efeito é
  defensivo e qualquer falha aparece como aviso na tela em vez de sumir com a página.
- **Leitura muito lenta no iPhone.** Três causas, todas medidas: decodificava o **quadro inteiro**
  (1080×1920, ~2 megapixels) a cada volta; procurava **8 formatos, incluindo QR** — o QR do
  Instagram do cartão foi lido **227 vezes** numa sessão; e rodava com `TRY_HARDER` ligado a 60
  tentativas por segundo, sem terminar uma antes de começar a próxima. Agora recorta a **faixa
  central** (92% da largura × 30% da altura — o código de barras é largo e baixo), procura **só
  formatos de barras**, desligou o `TRY_HARDER` e faz ~12 tentativas por segundo, cada uma com CPU
  inteira.
- A tela passou a mostrar **ms por tentativa** e a **área realmente decodificada**, para a próxima
  medição comparar. Leitura vazia deixou de entrar na lista.
- A faixa de indicadores virou 2 colunas no celular e os números quebram em vez de empurrar a
  página (mesma correção da v1.47.1, aplicada aqui na origem).

### Testes
20 casos no parser (eram 15): a etiqueta real "0346", sequência que passa de 600, recusa de
`1346` (não vira 346 por coincidência de sufixo), `candidateNumbers('0346')` = exatamente `[346]`,
recusa de código longo ambíguo, aceite de código longo sem ambiguidade, e precedência do exato
sobre a janela em etiqueta com muitos zeros à esquerda. 199 testes no total.

---

## v1.48.1 — 2026-08-19 (Diagnóstico do leitor de comanda — calibração antes de codar)

### Novo
- **`/modulos/comandas/diagnostico-leitor`** (Admin/Supervisão, atalho na tela de Conferência por
  leitor). Ferramenta de calibração para a conferência por câmera do celular. Responde no
  **aparelho real** as três perguntas que não dá para adivinhar de fora dele:
  1. **Qual motor de leitura o celular usa.** A `BarcodeDetector` nativa existe no Android/Chrome
     e **não existe no Safari do iPhone**, onde entra o `@zxing`. A tela diz qual entrou, antes e
     depois de abrir a câmera, e lista os formatos suportados.
  2. **Quantos códigos ele lê POR QUADRO.** A leitura nativa devolve uma lista — dá para ler várias
     comandas espalhadas na mesa de uma vez; o `@zxing` devolve uma por quadro. Com 605 comandas
     numa unidade, é isso que decide se conferir por câmera é viável.
  3. **O que a etiqueta traz REALMENTE codificado.** O cartão mostra "0346" impresso, mas o código
     pode trazer o número puro, com zeros à esquerda, com prefixo da unidade ou um EAN-13 com
     dígito verificador. A tela mostra o valor cru, o formato, o tamanho e **o que o parser
     tentaria** em cima daquela leitura.
- Bipe e vibração só em leitura **nova** (o mesmo código aparece em vários quadros seguidos),
  contador ao vivo, lanterna quando o aparelho permite, resolução pedida em 1920×1080 (a etiqueta é
  pequena e as barras finas somem num quadro de 640px) e botão que copia um resumo em texto.
- **Nada é enviado ao servidor**: a leitura fica no aparelho e o resumo é copiado à mão.

### Testes
- `tests/commands-barcode.test.ts`: casos da etiqueta real ("0346" e sequência que passa de 600) e
  um teste que **documenta a ambiguidade** do parser tolerante — dígitos extras podem casar com uma
  comanda válida errada, o que daria "presente" para uma comanda que não está na mesa. É exatamente
  o risco que a calibração elimina. 194 testes no total.

### Por que só o diagnóstico, e não a conferência por câmera inteira
Calibrar depois de construir custa retrabalho e, pior, um parser que acerta no teste e erra na
operação. O diagnóstico é a metade que não depende de palpite; a conferência por câmera vem quando
soubermos o que a etiqueta traz e quantos códigos cada aparelho lê por quadro.

---

## v1.48.0 — 2026-08-19 (Solicitação de troco por denominação, e atender já atualiza o cofre)

### Melhorado
- **O pedido de troco deixa de ser uma linha de texto.** Era um campo livre
  (`"R$ 100 em moedas de 0,50 e 0,25"`) mais um total opcional digitado à parte: o escritório lia
  prosa, nada era conferido, e o que chegava era digitado de novo na conferência do dia. Agora o
  pedido usa **as mesmas denominações da conferência**, em dois blocos — **PRECISO RECEBER**
  (moedas/miúdos) e **ENTREGO EM TROCA** (notas grandes) —, orientados pela configuração de
  denominações da unidade.
- **Os dois totais têm de fechar, e a tela mostra a diferença enquanto se digita.** É a mesma
  regra e a mesma tolerância (R$ 0,011) da troca com o escritório. O valor do pedido passa a ser a
  **soma do detalhe**: ninguém digita um total que possa divergir do que foi pedido.
- **Atender um pedido fechado aplica a troca no cofre sozinho** — entra no histórico como
  "Troca c/ escritório", com o nome de quem pediu. Antes a mesma troca era lançada duas vezes: uma
  no pedido, outra na tela do cofre. Pedido só com o lado "preciso receber" continua válido; nesse
  caso a supervisão registra à mão, como antes, e a tela avisa.
- A notificação para a supervisão passa a trazer **o detalhe por denominação**, não só o texto.
- A lista de solicitações mostra o detalhe ("precisa R$ 50,00 em 0,50 · entrega R$ 50,00 em 50")
  e marca as que estão fechadas.

### Corrigido
- **A grade de denominações estourava a largura no celular** — 50px de rolagem lateral em 375px.
  O rótulo era fixo em 160px e o `<input>` não encolhe abaixo da largura intrínseca dele sem
  `min-w-0`. Defeito **pré-existente**: atingia a **conferência diária do cofre**, não só o pedido
  novo. Verificado depois em 320/375/768/1280px, sem rolagem lateral em nenhuma.

### Banco
- `cash_change_requests`: colunas `needJson` e `giveJson` (JSONB) e `note` passa a aceitar nulo.
  Migração **aditiva**, aplicada nos dois bancos de desenvolvimento. Pedidos antigos continuam
  legíveis: sem detalhe, aparecem pelo texto que têm.

### Testes
- `tests/cash-change-request.integration.test.ts` — 10 casos: recusa pedido vazio, recusa valor que
  não é múltiplo da moeda, recusa troca desigual, aceita pedido só com "preciso", aceita a troca
  fechada, **atender aplica UM movimento no cofre** (total inalterado, composição trocada), não
  atende duas vezes, atender sem o lado da entrega não mexe no cofre, gerente não atende o próprio
  pedido, cancelar não mexe no cofre.

---

## v1.47.1 — 2026-08-19 (Conserto: rótulo literal no painel e rolagem lateral no celular)

### Corrigido
- **Painéis de Óleo e Gás mostravam o texto `{label}` no lugar do nome do indicador.** Bug meu,
  introduzido na v1.47.0 e publicado: a conversão em massa das faixas de estatística escreveu
  `<StatCard label="{label}" …/>` — com chaves DENTRO das aspas — nas duas funções auxiliares
  `Cell`. Como é uma string válida, o TypeScript aceitou, o lint aceitou e os 181 testes passaram.
- **Rolagem lateral no celular na faixa de estatística com valor em dinheiro.** Medido em 375px:
  o cartão "no mês" tem 109px de largura (75px úteis) e `R$ 128.470,50` em 24px exige **133px** —
  o número vazava e empurrava a página para 400px. Duas correções:
  o `StatCard` ganhou `min-w-0` (a coluna de grade tem `min-width: auto`, isto é, o min-content
  do texto — era isso que inflava a faixa) e `[overflow-wrap:anywhere]` no número, de modo que
  qualquer valor comprido **quebra em vez de empurrar a página**; e nas faixas com dinheiro
  (Notas, Caixa, Óleo, Gás) o cartão de valor passa a ocupar a linha inteira no celular,
  voltando a um terço a partir de 640px.
  Verificado: em 375px a página deixou de rolar de lado (excesso 25px → 0); em 768px e 1280px
  nada mudou.

### Manutenção
- **Portão novo: `scripts/check-jsx-props.cjs`**, ligado ao `lint:ds`. Falha em qualquer
  `prop="{expressao}"` — a classe de erro que passou por tsc, lint e testes e só apareceu em
  produção. Testado contra o bug real, e contra dois falsos positivos plausíveis (valor arbitrário
  do Tailwind e prop de texto normal).

---

## v1.47.0 — 2026-08-19 (Hierarquia, etapas 2 a 4: o corpo da tela cai para dois tamanhos)

### Melhorado
- **Etapa 2 — a faixa de estatística vira um componente só.** O mesmo "número em cima de um
  rótulo" estava escrito à mão em cada tela, com dez grafias diferentes. Agora 21 faixas passam
  pelo `StatCard` (Cancelamentos, Notas, Manutenção, Gás, Óleo, Supervisão, Caixa, Comissões),
  e os números que vivem em blocos próprios (anel da meta, KPI de atestados, total do cofre,
  conferência por leitor, painel da unidade, higiene, inventário) foram para o mesmo nível 24/600.
  O `StatCard` ganhou `tone` para o número vermelho de pendência e o verde de concluído —
  pela regra da escala, **cor sinaliza estado**, então isso precisava viajar junto.
- **Etapa 3 — o corpo tem dois tamanhos: 15 (conteúdo) e 13 (apoio).** 85% de todo o texto do
  sistema caía em 12px ou 14px, e o resto se espalhava por 13, 15 e 16 — seis estilos numa faixa
  de quatro pixels, que o olho não consegue ordenar. A escala foi definida no
  `tailwind.config.ts`, onde ela pertence: `text-xs` passa a valer 13/18 e `text-sm`/`text-base`
  15/20, alinhando **1430 usos em 143 arquivos de uma vez**, sem varredura cega arquivo a arquivo.
  Outras 113 grafias escritas em pixel solto (`text-[14px]`, `text-[13px]`…) foram para as
  classes da escala.
- **O peso 900 saiu do sistema.** `font-black` era o recurso de "gritar" e não existe mais em
  nenhuma tela de produção: número de painel usa 24/600, título usa negrito comum.
- **Etapa 4 — etiquetas e selos num nível só.** As cinco grafias de rótulo viraram o nível 6
  (`sgo-type-11`, 11/600 caixa alta): 85 rótulos, 39 cabeçalhos de seção (estes em tinta forte,
  para não se confundirem com rótulo de campo), o cabeçalho de tabela e o `StatusBadge` — que
  estava em 15/600, **o mesmo tamanho do nome do item que ele qualifica**.

### Manutenção
- **Portão novo: `scripts/check-type-scale.cjs`**, ligado ao `lint:ds` (que bloqueia o CI).
  Falha se voltar o peso 900, se um dado for escrito no 34px do título, se aparecer tamanho em
  pixel solto acima de 11px, ou se alguém escrever caixa alta fora do nível 6. Testado contra as
  quatro regressões antes de entrar.

### A verificar antes de liberar
As oito telas do diagnóstico **não foram remedidas** depois destas três etapas: a sessão do
navegador de desenvolvimento caiu junto com o banco no meio do trabalho. Foram conferidos por
medição a escala aplicada (13/18, 15/20, 11/14, 24/29), a ausência de peso 900, a galeria do
design system sem transbordo em 1280 e 375, além de tsc, lint, 181 testes e os 5 portões.
**Falta ver as telas com dados reais** — é uma mudança de tamanho de corpo em todas elas.

---

## v1.46.0 — 2026-08-18 (Hierarquia, etapa 1: o título da tela volta a ser o primeiro nível)

### Melhorado
- **O número dos painéis não compete mais com o nome da tela.** O `StatCard` desenhava o número
  em **34px negrito** — o mesmo tamanho e peso do título da página. Em Ocorrências isso colocava
  quatro elementos no primeiro nível (o nome da tela e os três contadores), e em Comandas outros
  quatro: tipograficamente indistinguíveis, sem nada dizendo o que é a tela e o que é dado dentro
  dela. O número passa a **24px semibold**, um degrau abaixo do título.
  Medido depois da mudança: Ocorrências, Comandas, Visão Executiva e Início agora têm
  **exatamente um elemento em 34px** — o título — contra quatro antes em duas delas.
- **Escala tipográfica ganha o nível 24** (`.sgo-type-24`, 24/29). Com ele a escala usada em
  produção fica nos seis níveis da proposta: **34 / 24 / 17 / 15 / 13 / 11**. Os níveis 28, 22, 20
  e 12 só aparecem nas páginas `/dev` e saem nas etapas seguintes.
- **Rótulo do cartão ganha o peso do nível** (11px semibold, caixa alta), e o esqueleto de
  carregamento acompanhou a nova altura para a tela não pular ao carregar.

Primeira das quatro etapas do plano de hierarquia. As próximas: unificar as dez grafias do
número-destaque, colapsar o corpo das listas em 15/13, e padronizar etiquetas e selos.

---

## v1.45.2 — 2026-08-18 (Digitar em formulário de folha para de jogar o foco no "X")

### Corrigido
- **Cadastro de fornecedor (e todas as demais folhas/janelas): cada letra digitada tirava o
  cursor do campo e o jogava no botão de fechar.** Era impossível preencher o formulário.
  A causa estava no comportamento compartilhado de diálogo (`useDialogBehavior`): o efeito
  que leva o foco para dentro da folha tinha o `onClose` na lista de dependências. Como todas
  as telas passam esse callback escrito na hora (`onClose={() => setAberto(false)}`), ele tem
  identidade nova a cada renderização — e em formulário cujo estado mora no mesmo componente,
  isso significa **uma remontagem por tecla**. A cada remontagem o efeito refazia o foco no
  primeiro elemento focável da folha, que é justamente o botão **Fechar**. Agora o `onClose`
  fica guardado numa ref: o efeito roda uma vez por abertura, e o Esc continua fechando com a
  versão mais recente do callback. Atinge de uma vez as folhas de **Fornecedores, Unidades,
  Usuários, Notas, Gás e Pagamentos**.
  Verificado no navegador: 27 teclas em dois campos do cadastro de fornecedor e 17 em Unidades,
  com o foco sempre no próprio campo e nenhuma ida ao "X"; Esc fecha e a rolagem do fundo destrava.

### Manutenção
- **Portão novo no CI: `scripts/check-dialog-focus.cjs`.** Falha se alguém devolver um callback
  (`on*`/`handle*`) para as dependências do efeito de diálogo, ou se a `onCloseRef` sumir — os
  dois jeitos de reintroduzir este bug. Testado contra o defeito real antes de entrar.
- **`check-dead-ternary` ligado ao `lint:ds`.** Ele existia desde a onda anterior mas não era
  executado por ninguém — nem no `lint:ds`, nem no CI. Portão que não roda não protege nada.

---

## v1.45.1 — 2026-08-18 (Troca de família vira link, não menu)

### Corrigido
- **O menu de troca entre módulos irmãos abria com os itens VAZIOS em produção** (visto em Comandas, no botão ao lado de Caixa). Não reproduzi em desenvolvimento — os itens apareciam certos aqui — mas achei no caminho um defeito real de HTML: o wrapper era `<span>` e o menu abre com `<div>`, aninhamento **inválido**, e cada navegador se recupera disso de um jeito.
- **A peça saiu inteira, em vez de ser remendada.** Um popover para escolher entre dois ou três irmãos não compra nada: custa um toque a mais, some da tela e traz posicionamento, recorte, foco e teclado para resolver. Agora são **links diretos**, visíveis sem clique — não há o que quebrar. Medido: contraste 9,46:1 no claro e 9,58:1 no escuro, e a página que já tinha trilho próprio (Notas) segue com **um** trilho.

> Não deixo navegação dependendo de algo que falha e eu não sei explicar.

## v1.45.0 — 2026-08-18 (Menu de 21 entradas cai para 11 · hub do celular refeito)

### Alterado
- **O menu encurtou de 21 para 11 entradas**, no celular e no desktop. Módulos irmãos passaram a morar juntos em **famílias**: **Caixa** (Comandas · Cancelamentos · Troco), **Suprimentos** (Notas Recebidas · Inventário · Pedidos), **Rotinas da unidade** (Coleta de Óleo · Higiene), **Performance** (Metas · Supervisão · Executivo), **Treinamentos** (Treinamentos + POPs, que no código já eram a mesma coisa) e **Pessoas** (Colaboradores + Controle de gerentes). Fonte única em `src/lib/nav-families.ts`, lida pela sidebar, pelo hub do celular e pelo ⌘K.
- **Desperdícios, Ocorrências, Pagamentos, Minha área e Comunicação ficaram sozinhos** de propósito: são diários e pesados, e agrupá-los só para reduzir a contagem esconderia o que mais se usa.
- **Hub do celular refeito.** Eram 21 cartões em grade de 2 colunas: **1.586px** de página (duas telas de rolagem) e cartões com **duas alturas** (98px e 118px), porque cinco rótulos quebravam em duas linhas. Virou lista agrupada de uma coluna, todas as linhas com **44px**, **866px** de página — 1,07 tela. Ganhou **busca** que ignora acento ("oleo" acha "Coleta de Óleo") e casa parcial.
- **"Treinamento da Plataforma" saiu do hub** — já é o 🎓 fixo no cabeçalho, em qualquer aparelho.

### Decisões de risco registradas
- **As rotas NÃO se moveram.** Os links de notificação ficam gravados em `Notification.link` apontando para `/modulos/*`; mover caminho quebraria todo aviso antigo (a pessoa toca na notificação e cai em 404). Link salvo e favorito continuam funcionando.
- **A família não virou trilho de abas.** Notas, Pessoas, Inventário, Pedidos e Supervisão **já têm trilho próprio**, e uma barra da família em cima recriaria os dois trilhos empilhados removidos na v1.44.0. Virou um botão ao lado do título ("Caixa ⌄"), reusando o menu de ações — um padrão só nas quinze páginas, com ou sem abas próprias.
- **O ⌘K passou a incluir os irmãos das famílias.** Sem isso, Troco, Cancelamentos, Inventário, Pedidos, POPs, Supervisão, Executivo e Controle de gerentes deixariam de ser **encontráveis na busca** — um menu curto que esconde destino é pior que um menu longo.
- **Permissões intactas:** as 30 chaves da matriz de Perfis seguem, e o botão de família só oferece irmão que o perfil pode ver.

## v1.44.0 — 2026-08-18 (Notas Recebidas reorganizado · gás salva com mensagem clara · categorias de manutenção)

### Corrigido
- **"Falha" ao salvar recebimento de gás.** A causa era **número de nota repetido**: o banco tem `@@unique([unitId, supplierId, noteNumber])`, o Prisma lançava `P2002`, **ninguém tratava**, a rota devolvia 500 sem corpo e a tela mostrava só "Falha" — sem dizer o que fazer. A restrição continua (recebimento duplicado entra na média de preço/kg e no abatimento do contrato), mas agora responde **409** dizendo o número e onde conferir.
- **Efeitos posteriores derrubavam a gravação.** Auditoria e notificação rodavam sem `try/catch` **depois** do `create`: se uma falhasse, a rota dava 500 com o recebimento **já gravado**, e o gerente lançava de novo — duplicando de verdade.
- **`REASONS[reason]` direto era armadilha, em 14 rotas.** Motivo fora do mapa dava `undefined.msg` e transformava validação conhecida em 500 sem corpo — o mesmo sintoma esperando acontecer em Desperdícios, Comandas, Ocorrências, Atestados, Óleo e Comunicação. Todas migradas para `reasonResponse()` (`src/lib/api/reason.ts`).
- **Mensagens de erro no lançamento de nota** deixaram de ser "Falha": cada faixa de código HTTP diz o que fazer (sessão expirada, sem acesso à unidade, servidor fora, anexo grande).
- **Pílula do *segmented control*, dashboard de gás e menu de ações**: números duplicados removidos (o "no filtro" repetia os cartões do Dashboard) e o item destrutivo do menu voltou a passar AAA no tema escuro (era 4,84:1, ficou 8,06:1).

### Alterado — Notas Recebidas
- **Cada nota tem um menu `···`** no lugar dos 5 botões soltos por linha. Com 147 notas eram 735 controles competindo com 147 informações. **Nenhuma ação saiu e nenhuma permissão mudou.** O valor ganhou coluna própria com dígitos alinhados.
- **Cinco abas viraram três** (Notas · Vencimentos · Análise de gás). "Registrar nota" era um formulário ocupando aba — virou o botão **Nova nota**, em folha. "Análise" era a **mesma lista** de "Notas" no código — fundiu, e o detalhe extra virou um interruptor (mesmo público de antes).
- **Análise de gás ganhou rota própria** (`/modulos/notas/gas`), acabando com os **dois trilhos de abas empilhados**. Efeito colateral relevante: a página de Notas parou de carregar dashboard, contratos e 300 recebimentos de gás **em toda visita** — 4 consultas a menos.
- **Uma barra de filtro só**, recolhida, com busca e total sempre à vista, nas quatro superfícies do módulo (eram quatro arranjos diferentes). O `FilterBar` existia desde a v1.40.0 para isso e nunca havia sido adotado.
- Histórico de gás e contratos passaram ao mesmo menu; "Novo contrato" virou folha.

### Alterado — resto do sistema
- **Formulários de cadastro saíram da frente da lista** em Unidades, Fornecedores e Usuários (viraram folha atrás de um botão). Quem entra nessas telas quase sempre vem conferir, não criar.
- Menu de ações também em **contratos de gás** e **Pagamentos** (onde dois botões usavam o mesmo ícone de lápis). A última fileira de filtro escrita à mão (Pagamentos) virou `FilterBar`.
- **Novos componentes/portões**: `ui/ds/action-menu.tsx` (não havia menu suspenso no sistema), `.sgo-control-icon` (alvo de toque quadrado de 44px em botão de ícone) e `scripts/check-row-actions.cjs`, que mede os três padrões que entulham tela.

### Adicionado
- **13 categorias padrão** para os tipos de ocorrência marcados como manutenção (Elétrica, Hidráulica e esgoto, Climatização, Exaustão e coifa, Instalação de gás, Cobertura e telhado, Estrutura e alvenaria, Piso, Pintura, Portas e fechaduras, Mobiliário, Área externa, Outros). Semeadas no boot, **só em tipo que está sem nenhuma** — quem já organizou a própria lista não é tocado. Sem categoria o sistema perde a detecção de reincidência, que compara tipo + categoria na mesma unidade em menos de 30 dias.

## v1.43.0 — 2026-08-17 (Ocorrências: destrava o registro e separa os dois eixos)

### Corrigido
- **Tipo sem categoria travava o registro.** Escolhendo um tipo sem categorias cadastradas (era o caso de "Manutenção e obras"), o campo Categoria abria **vazio** e a ocorrência era recusada sem explicação — beco sem saída. `Occurrence.categoryId` sempre foi opcional no banco; a obrigatoriedade era artificial, imposta pelo formulário e pelo `create.ts`. Agora a exigência acompanha o cadastro: tipo **com** categorias continua exigindo uma, tipo **sem** categorias registra sem ela e a tela explica por quê.
- **Os cartões do topo ignoravam a aba.** `getOccurrenceSummary` não recebia escopo, então nas abas Manutenção e TI os três números eram os da rede inteira — trocar de aba não mudava nada. Agora contam o assunto selecionado.
- **A lista cortava em 50 sem avisar.** Os cartões diziam 124 abertas e a tela mostrava 50 linhas, sem paginação e sem indicar que 74 tinham ficado de fora.
- **Reclassificar deixava categoria órfã.** Ao mover para um tipo sem escolher categoria nova, a **antiga** continuava colada — resultando em pares impossíveis como "Manutenção e obras — Atendimento". Corrigível só depois de `categoryName` aceitar nulo.
- O banner vermelho **repetia** o cartão ao lado; com 123 de 124 acima de 48h, "priorize estas antes das demais" não priorizava nada.

### Alterado
- **Os dois filtros deixaram de parecer a mesma coisa.** Eram trilhos de abas idênticos e empilhados, perguntando coisas diferentes: agora rotulados **ASSUNTO** (Geral / Manutenção / TI) e **SITUAÇÃO** (Todas / Abertas / Em andamento / Encerradas). A paginação preserva os dois ao navegar.
- **Lista paginada** (50 por página) com o rodapé dizendo o total: "Mostrando 1–50 de 124".
- **Formulário didático:** cada campo diz o que **decide** — o tipo mostra em qual aba a ocorrência vai cair, a gravidade diz quem ela avisa (Alta → supervisão; Crítica → supervisão **e** diretoria), a categoria explica que serve para detectar reincidência. O que falta aparece **antes** do clique, nomeando o campo.
- Cartão "Há mais de 48h" ganhou a proporção ("de N abertas"), que evita ler 123 como alarme quando é quase tudo o que está aberto.

### Banco
- Migração `20260817120000_ocorrencia_categoria_opcional`: `occurrences.categoryName` deixa de ser `NOT NULL`, acompanhando `categoryId`, que já era opcional. **Permissiva** (`DROP NOT NULL`), sem perda de dado e compatível com o código anterior.

## v1.42.0 — 2026-08-17 (Redesign Onda 8: a cara de iOS · seletor de tema)

> Onda visual. **Nada de funcionamento mudou**: sem alteração de banco, de rota
> ou de corpo de requisição. Roteiro do que olhar em
> `docs/roteiro-validacao-redesign.md`; detalhes técnicos em
> `docs/redesign-onda-8.md`.

### Adicionado
- **Seletor de tema em Meu Perfil → Aparência** (Claro / Escuro / Aparelho). Existia desde a Onda 0 mas estava montado **só em `/dev/ui`**: quem tinha o celular no modo escuro via o SGO escuro e **não tinha como voltar**. A escolha fica no cookie, por aparelho, e dura 1 ano.
- **Transição de página** no estilo iOS: no celular a tela entra pela direita; em ≥768px emerge com escala mínima. A fronteira é 768px porque é onde o app troca de barra inferior para barra lateral.
- **Recuo ao toque** em todo botão (encolhe na pressão, volta em mola). Linhas de lista acendem em vez de encolher.
- **Lista agrupada** (`Group`) em 13 telas: uma caixa só com fio recuado entre as linhas, em vez de cartões soltos.
- **Portões de qualidade**: `check-dead-ternary.cjs` (ternário cujos dois lados dão a mesma classe de cor), `check-palette-keys.cjs` (classe apontando para cor inexistente), `check-color-collapse.cjs` (consultivo).
- Token **`raised`** + `shadow-sgo-raised` — a única superfície que sobe acima de `sunken` nos **dois** temas.

### Alterado
- **Tema padrão volta a ser CLARO.** A Onda 7 havia posto em "seguir o aparelho"; o escuro passa a ser escolha explícita, como manda a regra de interface do projeto. O escuro continua inteiro para quem escolher.
- **Abas viraram *segmented control*** (trilho afundado + eleita em pílula elevada) em **21 telas**, no lugar de pílulas escritas à mão com a ativa em bordô sólido. Cada segmento tem a largura do seu texto e o trilho rola quando não couber — antes a largura era forçada igual e rótulos como "Lançar recebimento" vazavam em telas de 375px.
- **O acento passou a significar só "dá para tocar":** 235 títulos e nomes que usavam a cor da marca viraram tinta (`ink-900`); os 166 usos em elemento tocável ficaram. No tema escuro o bordô abre em rosa, e como a cor servia também de cor de título, cada tela lia como "rosa sobre preto".
- Item ativo do menu deixou de ser bloco cheio de acento e virou fundo tingido com texto da marca.
- Em Manutenção e Avaliação as abas perderam os ícones (o controle do iOS é texto puro **ou** ícone puro).
- Etiqueta de setor no editor de POPs virou cápsula tingida, não bloco sólido.

### Corrigido
- **Pílula do *segmented control* afundava no tema escuro.** Usava `bg-surface`, e no escuro `surface` (31 28 27) é mais escuro que o trilho `sunken` (42 38 36) — o inverso do que a elevação promete. Bug presente desde a Onda 2, em todos os usos.
- **Título de notificação não lida** havia ficado com os dois lados do ternário iguais na migração de cor, apagando a distinção lida/não lida. Achado pelo portão novo.
- Fio da lista agrupada começava a 16px enquanto as linhas usam 12px de recuo — desalinhado em relação ao texto.

## v1.41.1 — 2026-08-12 (Import de gás: CNPJ da unidade + zero à esquerda)
### Corrigido
- **Import em lote de notas de gás dava "Unidade não encontrada" em todas as linhas.** O import casa a nota à unidade **pelo CNPJ**, mas não havia como cadastrar o CNPJ da unidade (nem tela, nem RH sync, nem seed) — então `Unit.cnpj` era `null` em todas e nada batia.
  - **Cadastro de Unidades** (Configurações → Unidades) ganhou o campo **CNPJ** (criar e editar), normalizado para 14 dígitos; unidades sem CNPJ ganham um aviso de que ele é necessário para o import de gás. `createUnit`/`updateUnit`.
  - O casamento de CNPJ no import passou a **normalizar para 14 dígitos com zero à esquerda**, cobrindo o caso do Excel ler o CNPJ como número e comer o zero inicial (ex.: `05336082000163` → `5336082000163`). `src/lib/notes/gas-import.ts`.

## v1.41.0 — 2026-07-23 (Gás dentro de Notas Recebidas · vencimentos · dashboard de gás corrigido)
### Adicionado
- **Gás absorvido por Notas Recebidas**: o cadastro de fornecedor ganhou o marcador **"fornecedor de gás"**; ao escolher esse fornecedor no lançamento da nota, os campos viram os de **gás** (granel kg/preço ou botijão) + **vencimento do boleto**, e o lançamento alimenta a análise de gás. Nova aba **"Análise de gás"** dentro de Notas (dashboard, histórico, contratos e link do relatório de variação). O módulo "Recebimento de Gás" saiu da barra lateral — a rota `/modulos/gas` **redireciona** para Notas Recebidas.
- **Acompanhamento de vencimentos** (aba "Vencimentos" em Notas): lista os boletos **a vencer** (notas comuns + gás) com **filtros** (unidade, fornecedor, janela de dias, incluir vencidos) e destaque dos mais próximos. Um alerta diário avisa **a supervisão (supervisor+coordenador+admin) e o Financeiro** dos boletos que vencem em até 3 dias, sem repetir (`dueAlertedAt`). `src/lib/notes/due.ts`, `/api/notes/due`, job no scheduler.
### Corrigido
- **Dashboard de gás não variava com os filtros** — o filtro de mês nunca casava (regex sem barras) e o dashboard era montado ignorando unidade/fornecedor/mês. Agora os filtros afetam os números; adicionado o **volume comprado (kg)** por unidade e por fornecedor.
- Migração `20260723130000_gas_in_notes` (Supplier.isGas, GasReceipt.dueDate, dueAlertedAt em notas e gás).

## v1.40.0 — 2026-07-23 (Troco: solicitação + histórico + troca no caixa · busca no guia · onboarding)
### Adicionado
- **Colaboração no GitHub**: `.env.example` atualizado (VAPID/Caddy, aviso de valores de DEV) e novo **`docs/setup-dev.md`** (onboarding de colaboradores: clone → env → banco → rodar → PR).
- **Regra permanente** — "supervisor/coordenador/administrador" nas conversas = perfis **SUPERVISOR + COORDINATOR + ADMIN**. Helper `SUPERVISORY_ROLES`/`isSupervisory` + `notifySupervisory`.
- **Gestão de Troco — Solicitação de troco**: o gerente pede troco/moedas à supervisão pelo botão "Solicitar troco"; os três perfis são **notificados** e veem os pedidos abertos **destacados** ao abrir a aba (na unidade e na rede). Atender/cancelar; o solicitante é avisado quando atendido (`CashChangeRequest`).
- **Gestão de Troco — Troca no caixa**: para unidades **sem baldes** (ex.: Nova União), registra a troca de dinheiro feita direto no cofre com o caixa (movimento `REGISTER_CHANGE`, troca 1:1), com histórico.
- **Gestão de Troco — Histórico**: aba com **filtros completos** (tipo, usuário, período, valor mín/máx) e **ordenação** (data/valor), com totais de entradas/saídas.
- **Filtros padronizados**: componente `FilterBar` (compacto e responsivo) que corrige os filtros grandes/desfigurados — estreia no histórico do troco e será adotado nas demais telas.
- **Treinamento da Plataforma**: **barra de busca inteligente** (autocomplete, ignora acento, multi-termo) que filtra os guias em tempo real.

## v1.39.0 — 2026-07-22 (Conferência de comandas por leitor de código de barras)
### Adicionado
- **Perfil CAIXA** (`Role.CASHIER`, rótulo "Caixa"): login próprio criado em Configurações → Usuários. Nasce **fechado** — vê só Comandas e o Treinamento da Plataforma (novo `DEFAULT_ALLOW_ONLY` em `permissions.ts`; o Admin ainda pode liberar mais na matriz). Ao entrar, cai direto na conferência.
- **Conferência por leitor** (`/modulos/comandas/conferencia`, botão "📷 Conferir com leitor" na tela de Comandas): campo focado que recebe a bipagem (o leitor age como teclado, digita o código e dá Enter), contadores **conferidas / ativas / faltando** em tempo real, "Desfazer última", leituras repetidas sinalizadas ("já bipada") e código fora da sequência **avisado com o valor lido** em vez de aceito em silêncio. Substitui os 600+ toques da grade manual.
- Ao concluir: **faltantes = ativas − bipadas**, reaproveitando `submitCount` — mesmas divergências, mesmo alerta imediato ao supervisor, sem lógica paralela.
- **Cruzamento antifraude (itens 3 + 4)**: as faltantes são cruzadas com a **última análise de "Comandas em Aberto"** da unidade; comanda que sumiu da bandeja **E** está aberta com valor no Teknisa aparece destacada com data/hora e valor — o padrão da fraude das "2 comandas", pronto para o monitoramento buscar a câmera.
- `src/lib/commands/barcode.ts` (parser **tolerante**: número puro, zeros à esquerda, prefixos, EAN-13 com dígito verificador — só aceita palpite que exista na sequência ativa, nunca inventa comanda), `src/lib/commands/scan.ts`, `/api/commands/scan`, migração `20260722200000_cashier_role`. 12 testes novos.
- ⚠️ O parser será **calibrado** quando chegar 1 exemplo real do código de barras da comanda da rede.
### Corrigido
- **Servidor não subia com o push ligado** (pego na verificação em instância local, antes de qualquer deploy): o scheduler (`src/instrumentation.ts`) importa a Central de Notificações, que agora carrega `web-push`; o Next compila a instrumentação **também para o runtime edge**, onde `http`/`https` do Node não resolvem — o app respondia 500 em todas as telas. `next.config.mjs` passou a marcar `web-push` como externo no bundle edge (onde o `register()` já sai na primeira linha).

## v1.38.0 — 2026-07-22 (Notificações no celular — PWA + Web Push)
### Adicionado
- **App instalável (PWA)**: manifesto, ícones da marca (bordô + "BF") e service worker. No Android dá para "Instalar aplicativo"; no iPhone, "Adicionar à Tela de Início" (pré-requisito do push no iOS).
- **Notificações no celular (Web Push/VAPID)**: em **Meu Perfil → Notificações no celular**, o usuário ativa o aviso **em cada aparelho**; a notificação chega **com o app fechado** e, ao tocar, abre direto na tela do assunto. Envia teste, lista "Meus aparelhos" (com remoção) e **preferências por categoria** (Tarefas e metas, Comunicados, Ocorrências e manutenção, Operação do dia, Pessoas e escala, Gerais) — avisos **críticos ignoram a preferência**.
- O push é um **canal extra plugado na Central de Notificações**: todo aviso que já existia (`notifyUsers`/`notifyRole`/`notifyAdmins`/`notifyUnitRole`) passa a sair também no aparelho, sem mudança nos módulos. O registro no sino 🔔 continua sendo criado mesmo se o push falhar.
- Inscrições mortas (aparelho trocado/app desinstalado) são **removidas automaticamente** (404/410 do serviço de push ou 5 falhas seguidas).
- `src/lib/push/*` (send/manage/categories), `/api/push` + `/api/push/key`, models `PushSubscription`/`PushPreference`, migração `20260722190000_web_push`, `scripts/gen-vapid.mjs` e `scripts/gen-icons.mjs`. **Inerte sem as chaves** `VAPID_*` no `.env` (o sistema segue igual, só in-app). 10 testes novos.

## v1.37.0 — 2026-07-22 (Antifraude de cancelamentos + relatórios de comandas)
### Adicionado
- **Cancelamentos → Análise antifraude (PDF)** (Supervisão/Admin): sobe o **PDF** "Vendas/Itens Cancelados no Período" (Teknisa) e o SGO analisa por **caixa (terminal)**, por **autorizador (SUPERVISOR)**, por **horário** e **valor**, com **alertas automáticos** (concentração ≥50% do valor num caixa/autorizador, valor médio muito acima da mediana, cancelamentos altos, pico de horário) + maiores cancelamentos + histórico. `src/lib/cancellations/fraud-analysis.ts` (parser via pdf-parse), model `CancellationAnalysis`.
- **Comandas em aberto**: **relatório A4 dedicado para o Monitoramento** (corrige o "Imprimir" que saía desfigurado) + **Consolidado da rede para o Administrativo** (comandas a travar por unidade e data, imprimível). Histórico já existente.

## v1.36.0 — 2026-07-21 (Módulo Solicitação de Produtos — Fase 1)
### Adicionado
- **Solicitação de Produtos (Fábrica/CD)**: catálogo (`Configurações → Catálogo de Produtos`, CRUD + **import/export Excel**); **pedido mobile** com **busca inteligente** (ignora acento), agrupado por categoria e quantidade por item; ao enviar, o sistema **separa automaticamente em Fábrica e CD** (gera 1 pedido por destino). **Meus pedidos** com status (Novo→Em separação→Enviado→Recebido) e **confirmação de recebimento** pelo gerente; **visão Fábrica/CD** (Supervisão/Admin) move os status e imprime a separação. `src/lib/products.ts`, models `Product`/`ProductRequest`. Fábrica/CD por e-mail entra na fase seguinte.

## v1.35.0 — 2026-07-21 (Higiene dos banheiros — QR + notificação + análise)
### Adicionado
- **Módulo Higiene dos banheiros**: QR do banheiro aponta para uma **página pública** (`/higiene/<unidade>`, sem login) onde o cliente escolhe o banheiro, o problema e uma avaliação e envia — o **gerente é notificado na hora** (in-app). Módulo interno com **análise** (solicitações, em aberto, tempo médio de resposta, horário de pico, banheiros com mais pedidos), **resolver** solicitação, **cadastro de banheiros** e o **link do QR** por unidade. Substitui o antigo Forms→WhatsApp; **WhatsApp fica para a fase 2** (Evolution API do CEO). `src/lib/hygiene.ts`, models `HygieneLocation`/`HygieneRequest`.

## v1.34.0 — 2026-07-21 (Antifraude: análise de comandas em aberto)
### Adicionado
- **Comandas → Análise de comandas em aberto** (Supervisão/Admin): sobe o relatório do Teknisa (.xlsx/.csv) e o SGO destaca **comandas abertas com valor e data de abertura anterior ao corte** (possível fraude das "2 comandas") — nº, data/hora, dias em aberto, valor e itens; ordena pelas mais antigas; imprimível para o monitoramento buscar câmeras. Histórico das análises por unidade. `src/lib/commands/open-analysis.ts`, `OpenCommandAnalysis`.

## v1.33.0 — 2026-07-21 (Painel resumo da unidade — reunião supervisor×gerente)
### Adicionado
- **Painel da unidade** (`/modulos/painel-unidade`, Supervisão/Admin): uma tela por unidade+mês para a reunião com o gerente — **performance** (meta, uso, checklists, desperdício), **preenchimento operacional** (checklists concluídos/atrasados/não realizados, cobertura de comandas/desperdício, notas, movimentos do cofre, ocorrências) e **detalhamento da meta**. Seletor de unidade/mês + **Imprimir/PDF**. Reaproveita os números de `getUsageBoard`/`getMetaBreakdown` (sem divergência). Link na Rotina do Supervisor.

## v1.32.0 — 2026-07-21 (Comunicados em tela cheia ao abrir o app)
### Adicionado
- **Comunicados pendentes aparecem em TELA CHEIA ao abrir o app** (como um anúncio): o gerente lê e **confirma ali mesmo**. Um por vez (urgentes/fixados primeiro), com anexos e, quando exigido, campo de resposta. "Ver depois" pula sem confirmar. `/api/communications/pending` + `CommunicationInterstitial` no layout.

## v1.31.0 — 2026-07-21 (Calendário de gerentes + Resumo de checklists)
### Adicionado
- **Calendário de gerentes**: nova **grade semanal por horário** (linha de horas à esquerda) mostrando o **nome dos gerentes** em cada faixa e destacando em vermelho as **horas sem gerente**; nomes também nas células do mês; **alerta na aba** para gerentes 7+ dias sem folga (além da notificação a supervisores E admins); botão **"Todos os dias"** (gerente sem folga fixa marca a folga depois).
- **Configurações → Checklists → aba "Resumo por unidade"**: **matriz checklist × unidade** (✓ habilitado; âmbar = checklist comum faltando na unidade) + busca + filtro "só possíveis faltas" + total por unidade. Ajuda o supervisor a achar checklists faltando.

## v1.30.0 — 2026-07-21 (Pagamentos: admin/CEO podem se autoaprovar)
### Alterado
- **Autoaprovação de pagamentos** liberada para **ADMIN/CEO** (decisão do Pedro). Demais perfis seguem com a segregação de funções (quem lança não aprova o próprio). Investigação do caso Jefferson documentada em `docs/antifraude-e-automacoes.md`.

## v1.29.0 — 2026-07-21 (Troco: editar/excluir baldes)
### Adicionado
- **Gestão de Troco → baldes dos caixas**: Supervisão/Admin agora **editam o nome E o valor-alvo** (antes só o valor) e podem **excluir o balde inteiro** (o histórico de movimentos preserva o nome). Auditado.

## v1.28.0 — 2026-07-21 (pacote 20/07 — bloco 3.1: Admin cadastra horário do gerente)
### Adicionado
- **Admin/CEO cadastram o horário de qualquer gerente** direto no **Calendário de gerentes** (botão "Editar horário" em cada gerente): marca os dias + horário e salva (auditado). Antes só o próprio gerente podia; agora o admin também preenche por eles.

## v1.27.0 — 2026-07-21 (pacote 20/07 — bloco 3: Controle de gerentes)
### Adicionado
- **"Folgas da equipe" → "Controle de gerentes"** (nova nomenclatura na sidebar e no módulo).
- **Horário de trabalho do gerente** (padrão semanal): cada gerente cadastra em **Minha área → Folgas / férias** os dias que trabalha + horário.
- **Calendário de gerentes** (nova aba): visão mensal por unidade da cobertura de gerência (padrão semanal − folgas/férias). **Dias sem nenhum gerente ficam em vermelho** ("buraco de gerência") para o supervisor realocar reservas; badges de dias sem cobertura e gerentes sem horário.
- **Alerta automático ao supervisor** quando um gerente **não lança folga há 7+ dias** (scheduler diário, anti-spam de 7 dias).

## v1.26.0 — 2026-07-20 (pacote 20/07 — bloco 2: Pagamentos por dia/unidade + detalhes)
### Alterado
- **Pagamentos — todas as abas** (Minhas, Para Aprovar, Pagar, Histórico): lançamentos **agrupados por DIA e por UNIDADE** (dia mais recente primeiro, total do dia no cabeçalho) para a conferência do supervisor.
- **Clicar na solicitação abre os detalhes completos** (freelancer+PIX, cobertura de setor, dia/horário/horas, VT, motivo, beneficiário/fornecedor, observações, quem aprovou/pagou e quando, anexo) — em qualquer aba.

## v1.25.0 — 2026-07-20 (pacote 20/07 — bloco 1: Tarefas N/A + Notificações + Gás)
### Adicionado
- **Checklist: "Não se aplica" (⚪)** — 4ª opção por item, neutra (não gera ocorrência, não entra em correções).
- **Histórico de checklists recolhível** — cada dia abre/fecha (o mais recente aberto); em modo de exclusão fica aberto.
- **Notificações com filtros por tipo** — chips Todas / 💳 Pagamentos / 👥 Pessoal / 🍽️ Operação / Outros (com contagem).
- **Gás: editar lançamento** (kg + valor) por erro de digitação do gerente — Supervisão/Admin, recalcula preço/kg; **não interfere na meta** (só a edição de DATA penaliza).

## v1.24.0 — 2026-07-20 (ajustes pós-revisão do Pedro)
### Corrigido / Ajustado
- **Ocorrências (lista "Todas")**: cards agora mostram a **data/hora de criação**; unidades vêm **recolhidas** (abre ao tocar); nova **barra de busca** (nº, tipo, categoria, descrição) e **filtros no topo** (unidade + gravidade).
- **Desperdício — Lanchonete** passa a ser lançada em **UNIDADES** (não kg), com **sub-itens por tipo de salgado** somando o total. (A funcionalidade já existia desde a v1.19; faltava a categoria estar marcada como "un" — corrigido no dado + seed.)
- **Notas recebidas**: ordenação por **data de lançamento (mais recente primeiro)** confirmada no ar — antes a produção rodava uma imagem antiga.
- **Pagamentos — cobertura de setor do freelancer**: recurso confirmado no ar; o seletor aparece assim que houver **setores+valores cadastrados** para o freelancer (Configurações → Pagamentos).

## v1.23.0 — 2026-07-16 (pacote 16/07 — bloco 7: Central da Meta + Simulação do Mapa)
### Adicionado
- **Configuração da Meta centralizada** (`Metas → Configuração da Meta`; Admin edita, Supervisão visualiza): TODOS os componentes num lugar só — Checklists (peso por checklist), **NOVOS componentes diários "Desperdício" e "Comandas"** (cobertura mensal: dias preenchidos ÷ dias decorridos — sem preenchimento o % cai; **nascem com peso 0**), Comunicados, Treinamentos, Avaliações da equipe e a **penalidade por correções da supervisão** (fora do prazo).
- **Mapa de Funções — simulação salvável**: ao ver um **dia futuro** na projeção, o gerente monta uma **simulação de alocação** (quem fica em qual setor naquele dia) e **salva** — sem alterar o quadro padrão; a simulação salva reaparece ao voltar na data.

## v1.22.0 — 2026-07-16 (pacote 16/07 — bloco 6: Troco reformulado como COFRE)
### Alterado
- **Gestão de Troco reformulada** (modelo correto confirmado pelo Pedro + foto): agora é um **COFRE por unidade** com saldo **por denominação** (valor em R$ de cada nota/moeda, como a folha do gerente — 200/100/50/…/0,05 + "Outros") que alimenta os **baldes dos caixas** (valor-alvo fixado pela supervisão).
### Adicionado
- **Conferência diária**: lança a contagem completa por denominação (substitui o saldo; primeira contagem = posição inicial).
- **Reposição de balde**: registra o que **saiu** do cofre (miúdos) e o que **entrou** (notas grandes do balde) — troca 1:1 validada.
- **Troca com o escritório**: envia notas grandes, recebe moedas/miúdos (mesmo valor, validado).
- **Retirada para pagamento (PROIBIDA)**: dá para registrar em emergência, mas em **vermelho com aviso forte** — supervisão e admins avisados **na hora** (trava total virá depois, como combinado).
- **Indicador "hora de pedir troca"**: % de notas grandes no cofre (alerta ≥50%).
- Painel da rede (Supervisão): cofres e **retiradas proibidas do mês por unidade**; Visão Executiva e Painel de Uso atualizados para o novo modelo.

## v1.21.0 — 2026-07-16 (pacote 16/07 — bloco 5: Contratos de Gás)
### Adicionado
- **Gás — Contratos por unidade+fornecedor**: nova aba **Contratos** no módulo (Supervisão/Admin gerenciam): período, **quantidade (kg)** e **preço/kg acordados**, com espaço para lançar a **posição atual** de contrato que já estava andando ("já comprado"). A **baixa é automática** pelos recebimentos lançados da unidade+fornecedor dentro do período.
- **Gás — Dashboard**: **% cumprido de cada contrato vigente** (barra verde/âmbar/vermelha) + **filtros de unidade, fornecedor e mês** com o total **comprado no filtro** (kg, R$ e nº de recebimentos).
- **Gás — Histórico com filtros**: busca + unidade + fornecedor sobre todos os lançamentos.

## v1.20.0 — 2026-07-16 (pacote 16/07 — bloco 4: Checklist↔Ocorrência)
### Adicionado
- **Checklist — problema em aberto sinalizado**: quando um item "A corrigir" gera uma ocorrência, os checklists dos **dias seguintes mostram o aviso** "⚠ Problema em aberto desde DD/MM (ocorrência nº X)" naquele item, **sem criar pendência nova todo dia** — o aviso some quando a ocorrência é encerrada.
- **Ocorrências — fases de andamento**: timeline "Andamento" na ocorrência — registre cada fase (técnico acionado, peça pedida…) até o encerramento; cada registro guarda autor e horário.
- **Ocorrências — reclassificar**: mude o **tipo/categoria** de qualquer ocorrência aberta (inclusive as geradas pelo checklist) — tipos de Manutenção/TI movem a ocorrência para a sub-aba correspondente.

## v1.19.0 — 2026-07-16 (pacote 16/07 — bloco 3: Pagamentos + Desperdícios)
### Adicionado
- **Pagamentos — cobertura temporária de setor** (freelancer): o Admin cadastra no freelancer os **setores com valor por DIA** (Configurações → Pagamentos → editar freelancer); no lançamento, o gerente marca "Cobertura temporária de setor", escolhe o setor e o valor sai **automático** (valor do dia + VT opcional).
- **Pagamentos — vale-transporte na Hora Extra**: campo VT opcional que soma ao total.
- **Consolidação de freelancers — fechamento semanal**: além do mês, escolha uma data e o relatório fecha a semana **segunda → domingo** (pelo dia do trabalho), como o pagamento de segunda-feira. Excel idem.
- **Desperdícios — categoria em UNIDADES com sub-itens**: categoria pode ser **kg** ou **un** (Configurações → Desperdícios). Categorias em "un" (ex.: lanchonete) ganham **sub-itens por produto** (nome + quantidade) com **soma total automática**.

## v1.18.0 — 2026-07-16 (pacote 16/07 — bloco 2: Notas + Comandas)
### Alterado
- **Notas — aba "Notas" reformulada**: lista por **data de lançamento (mais nova → mais antiga)**, sem agrupamento por fornecedor; **filtros completos** (busca por fornecedor/nº/CNPJ/produto/obs/valor, fornecedor, unidade, status, período); **padrão últimos 60 dias** (troca no filtro: 90/180/365).
- **Notas — sem botão "Paga"**: pagamento é controlado no Teknisa; aqui fica só recebimento/**problema**/**devolução** (o status "Paga" antigo permanece como legado nos filtros).
- **Notas — fornecedor SÓ da lista de cadastrados** ao lançar (acabou a digitação livre; a tela orienta pedir cadastro ao Admin quando faltar).
- **Notas — Análise completa**: mesmos filtros da lista + totais + **campos completos** (CNPJ, emissão, produto, obs, problema) + **editar/excluir** para Supervisão/Admin + **Excel e Imprimir/PDF** (`/api/notes/export`).
- **Notas — meta**: além da correção de data, **nota lançada pela Supervisão/Admin** (gerente esqueceu) agora também desconta na meta (marcada em vermelho no card).
- **Comandas — grade com 3 estados**: toque 1× = **conferida** (verde), 2× = **em uso** (azul — com cliente, conta como presente), 3× = limpa; não marcadas viram **apuração**. Comandas **em apuração ou perdidas saem da grade** (tratadas no bloco de Divergências).

## v1.17.0 — 2026-07-16 (pacote 16/07 — bloco 1)
### Corrigido
- **Celular — módulos que não apareciam**: a página "Módulos" (navegação do celular) estava desatualizada — agora espelha o menu do computador: **Minha área, Folgas da equipe, Rotina do Supervisor, Visão Executiva, Treinamentos, Gestão de Troco e Ajuda** entraram, agrupados como no desktop e respeitando a matriz de Perfis.
- **Túnel de publicação — proteção**: criado watchdog que verifica a cada 5 minutos se o túnel Cloudflare está vivo e o religa sozinho (causa da queda de 13→14/07: o processo encerrou quando a internet caiu e nada o reiniciava). Desfazer: `schtasks /Delete /TN "sgo-tunnel-watchdog" /F`.
### Adicionado
- **Meu Perfil** (toque no seu nome/avatar no topo): o próprio usuário completa **nome completo e CPF** e **troca a própria senha** (exige a atual). Supervisor/CEO ganham **visualização dos usuários** (Configurações → Usuários, sem edição).
- **Escala — status "Atraso" (AT)** no Realizado: colaborador trabalhou mas chegou atrasado — segue aparecendo no Mapa do dia e o atraso entra automaticamente nos **Avisos ao RH** (conferência de ponto). *(Verificado também: atestado lançado já ajusta a Escala automaticamente — nenhuma correção necessária.)*

## v1.16.0 — 2026-07-08 (pacote 07/07 — parte 2: Pessoas + Integrações RH)
### Adicionado
- **Central "APIs & Integrações"** (`Configurações → APIs & Integrações`, Admin/CEO): tudo que o SGO consome e expõe — API do RH (status/chave mascarada), **endpoints de recepção RH→SGO** (URLs prontas para colar no painel do RH + token), **webhook de férias SGO→RH** (destino + token para combinar com o RH) e os **últimos eventos** de integração. Toda nova API entra aqui.
- **Recepção RH→SGO**: endpoints `/api/integracoes/rh/{inclusao|desligamento|periodo-aquisitivo|exclusao-periodo}` com token Bearer. Admissão cria/reativa colaborador (por CPF/matrícula) e vincula à unidade; desligamento inativa por CPF; períodos aquisitivos ficam registrados. **O sync automático atual continua intocado.**
- **Webhook de férias SGO→RH**: solicitar férias (planejamento) e excluir férias (cancelamento) agora avisam o RH automaticamente no endereço da doc (inerte até o token ser colado no painel do RH; disparos registrados na central).
- **CPF no cadastro**: o sync do RH agora grava o CPF do colaborador (base do casamento de eventos de desligamento).
- **Escala — Avisos ao RH**: toda variação lançada no Realizado (falta, atestado, férias…) gera um **aviso automático registrado**, com tela de **relatório por período** (`Escala → Avisos ao RH`); quando a API do RH aceitar estes eventos, passam a ser enviados na hora.
- **Avaliação do colaborador — filtro de unidade** na barra (para quem tem mais de uma unidade).
- **Comissões & Mobilidade — histórico ao lançar**: ao escolher o colaborador, aparecem os últimos lançamentos dele com a **variação de valor** (verde/vermelho).

## v1.15.0 — 2026-07-08 (pacote de ajustes 07/07 — parte 1)
### Adicionado
- **Ocorrências — segmento TI**: nova sub-aba **TI** (igual à de Manutenção): tipos marcados como "TI" em Configurações → Ocorrências aparecem separados, preparado para a futura integração com sistema de gestão de TI.
- **Lançamento fora do prazo (conta na meta)**: em **Pagamentos, Notas, Gás e Óleo**, a data da solicitação aparece no lançamento e o histórico é ordenado da mais nova para a mais antiga. **Admin/Supervisor podem corrigir a data** quando o gerente esqueceu de lançar — cada correção marca o lançamento, avisa o gerente e **desconta % na meta do mês** (padrão 2%/lançamento, ajustável pelo Admin na tela de Metas). Linha "Fora do prazo" aparece no detalhamento da meta.
- **POPs nos Treinamentos**: abrir um POP a partir de Treinamentos agora é **só visualização** (sem editor) e o botão vira "Confirmar leitura e marcar treinado" — confirma a leitura E completa o treinamento de uma vez.
### Alterado
- **Manutenção saiu da sidebar** — acesso via Ocorrências → sub-aba Manutenção (que já leva a chamados e preventivas).
- **Configurações — Checklists unificados**: Checklists das unidades, Biblioteca de modelos e Checklists de supervisor agora são **uma página com 3 abas** (menos botões nas Configurações).
### Removido
- **Unidades de teste** (Beija Flor Centro, Orla e Shopping) excluídas com todos os históricos vinculados (backup 3-2-1 feito antes; auditado). 11 unidades reais intactas.

## v1.14.0 — 2026-07-08
### Adicionado
- **Novo módulo: Visão Executiva** (`Gestão → Visão Executiva`, restrito a CEO/Admin por padrão): a rede inteira em uma tela por mês — cartões consolidados (meta média, uso do sistema, desperdício total, dias de atestado, divergências de troco, custo de manutenção, ocorrências graves, visitas de supervisão) + **tabela por unidade** ordenada pela meta, com semáforo de uso. Botão **Imprimir/PDF** para reunião de diretoria. Tudo composto do que os módulos já calculam (mesmos números das telas de origem).

## v1.13.0 — 2026-07-08
### Adicionado
- **Recorrência de visitas** (Rotina do Supervisor): defina por unidade "visitar a cada N dias" — concluir uma visita reagenda a próxima automaticamente; visita **vencida gera aviso diário** ao supervisor da unidade + Admins (0 = desliga).
- **Resumo semanal de aderência (automático)**: 1×/semana o sistema avalia os últimos 7 dias de cada unidade (dias sem desperdício/comandas, checklists < 70%) e **cobra sozinho**: supervisor da unidade recebe o alerta e os Admins um consolidado.
- **Exports Excel/CSV dos módulos novos**: Gestão de Troco (`/api/cash/export`), Comissões & Mobilidade (`/api/people/payouts/export`, com total) e Visitas do Supervisor (`/api/supervision/export`, com feedback e itens não OK) — botão "Excel do mês" nas telas.
- **+15 testes** (62 no total): cadeia do troco (divergência, um caixa por vez, fechamento transacional) e regras da avaliação na meta (peso 0 padrão, mês corrente não penaliza).

## v1.12.0 — 2026-07-07 (fecha a Onda 4 e o lote de ajustes jul/2026)
### Adicionado
- **Novo módulo: Rotina do Supervisor** (item 17, Onda 4) em `Gestão → Rotina do Supervisor` (visível por padrão para Supervisão/Admin/CEO; ajustável na matriz de Perfis):
  - **Fase A — Painel de uso dos gerentes**: consolida por unidade/mês % de checklists, cobertura de desperdício e comandas (dias com lançamento ÷ dias decorridos), ocorrências, notas, caixas de troco e meta, com **indicador de uso correto** (🟢🟡🔴) e piores primeiro.
  - **Fase B — Visitas & Feedbacks**: agenda de visitas por unidade (gerente é notificado), conclusão com **feedback obrigatório** (gerente recebe), números do mês (feitas/agendadas/atrasadas) e histórico.
  - **Fase C — Checklists de supervisor**: criados em `Configurações → Checklists de supervisor` (Admin), preenchidos na visita item a item (OK/Não + observação), resultados congelados na visita.

## v1.11.0 — 2026-07-07
### Adicionado
- **Novo módulo: Gestão de Troco** (item 16, Onda 4) em `Operação → Gestão de Troco`: **sessões de caixa em cadeia** — o fechamento de um caixa é a **abertura esperada** do próximo (o troco "pernoita" entre dias). Abertura digitada diferente do fechamento anterior gera **divergência com alerta automático** ao supervisor da unidade + Admins. Vários caixas por dia (um aberto por vez), resumo do dia, **dashboard de divergências do mês por unidade** e histórico. Admin exclui sessões (auditado). Módulo `CASH` na matriz de Perfis.

## v1.10.0 — 2026-07-07 (fecha a Onda 3 — Pessoas/RH)
### Adicionado
- **Pessoas — Comissões & Mobilidade** (item 14): Supervisão/Admin lança valores (comissão do Teknisa / mobilidade) por colaborador/mês, com **dashboard** (totais do mês, por unidade, maiores do mês, tendência 12 meses) e **histórico mensal**. Admin exclui lançamentos (auditado).
- **Pessoas — Solicitar férias ao RH** (item 11, provisório até a API do RH): na aba Férias, o gerente escolhe colaborador + período e **pede ao RH** — o pedido fica "Solicitada ao RH" e os **Admins são avisados**. Anti-duplicidade de período por colaborador.
- **Escala — Trocas → RH** (item 15): novo registro de trocas (`Escala → Trocas de escala (RH)`): só de dia, entre dois colaboradores ou troca completa, com motivo. Cada registro **notifica os Admins** para informar o RH (pronto para plugar a futura API).

## v1.9.0 — 2026-07-07
### Adicionado
- **Pessoas — Mudanças de função/setor → RH** (item 12, Onda 3): no **Mapa de Funções**, ao editar um alocado dá para trocar também a **função (cargo)**. Mudança de **setor** vale na hora no SGO e gera registro; mudança de **função** vira **solicitação ao RH** (o cadastro vem do RH — o cargo atualiza no próximo sync). Toda mudança **notifica os Admins** e entra no **registro consolidado** `Pessoas → Mudanças de função/setor (RH)` (pronto para plugar a futura API do RH).

## v1.8.0 — 2026-07-07
### Adicionado
- **Pessoas — Avaliação do colaborador** (item 13, Onda 3): nova tela (`Pessoas → Avaliação do colaborador`) com **observações do dia a dia** (texto livre, com autor e data — sem mexer no cadastro, que continua vindo do RH) e **avaliação mensal** (1 por colaborador/mês) com 4 critérios de 1–5 ★ (Pontualidade, Desempenho, Trabalho em equipe, Apresentação/higiene) + comentário, com **histórico dos últimos 12 meses**.
- **Meta — componente "Avaliações da equipe"**: as avaliações contam na meta do gerente como componente único com **peso configurável pelo Admin (padrão 0 = desligado — as notas atuais não mudam)**. Só penaliza colaborador sem avaliação em **mês já encerrado**. Peso ajustável na própria tela (Admin).
- **Admin**: pode excluir avaliações e observações lançadas (auditado), via padrão de exclusão da Operação.

## v1.7.0 — 2026-07-07
### Adicionado
- **Pessoas — Período de Experiência**: nova tela (`Pessoas → Período de Experiência`) que lista automaticamente os colaboradores com **até 90 dias de casa** (admissão vinda do RH), com barra de dias (X/90) e alerta quando faltam ≤15 dias. O gestor **aprova ou reprova** o período com **anotações**; a decisão notifica os Admins para avisar o RH. (1º bloco da Onda 3 — Pessoas/RH.)

## v1.6.0 — 2026-07-06
### Adicionado
- **Notas — aba Análise**: supervisores/admins têm uma aba de **análise/histórico** que filtra por **fornecedor, unidade e status**, com totais (nº de notas + valor).
- **Notas — devolução**: ao receber uma nota errada, dá para marcá-la como **Devolvida** (com o motivo) — novo status ao lado de Recebida/Paga/Problema.
- **Folgas/Férias — consolidado da equipe**: novo **/modulos/folgas-equipe** para gestores, com **período selecionável** e agrupamento por unidade. **Quem vê é configurável** em Configurações → Perfis de acesso (padrão: Supervisão/Admin/CEO). Atalho na aba Folgas da Minha área.

## v1.5.0 — 2026-07-06
### Adicionado
- **Comandas — seleção em lote**: na conferência em grade dá para **marcar/desmarcar uma faixa** de comandas de uma vez (ex.: sequências guardadas que não se confere todos os dias), além do "Marcar todas"/"Limpar".
- **Minha área — tarefas melhores**: agora dá para **editar e excluir** cada tarefa pessoal, e o horário do lembrete é escolhido em **passos de 30 minutos** (data + hora em lista).
- **Minha área — notas ricas**: o bloco de notas ganhou **título** (nomear a nota), **edição** e **texto formatado** (negrito, itálico, sublinhado, listas, subtítulo, link) — o mesmo editor dos POPs.
- **Pagamentos — filtros no histórico**: filtre por **tipo** (freelancer/hora extra/avulso), **unidade**, **status** e busca por **prestador/beneficiário**.
### Alterado
- **Metas — seletor de mês em lista**: a escolha do mês passou de botões para uma **lista suspensa** (mais compacta).
- **Consolidação de freelancers — filtros em lista**: mês e unidade agora são **listas suspensas** no lugar dos botões.

## v1.4.0 — 2026-07-06
### Adicionado
- **Manutenção (módulo novo)**: `/modulos/manutencao` com duas abas. **Chamados** — abra um chamado (o que precisa, equipamento, prestador, prazo) e acompanhe o status **Aberto → Em andamento → Concluído** (com custo e o que foi feito); painel com abertos, em andamento, atrasados, feitos no mês e custo do mês; supervisão avisada na abertura. **Preventiva** — planos recorrentes por equipamento (ex.: limpar a coifa a cada 30 dias); quando vencem, gerente e supervisão são avisados na Central de Notificações; "Registrar execução" agenda a próxima e guarda o histórico. Acessível também pela sub-aba Manutenção das Ocorrências. Admin exclui chamados e planos.
- **Cupons — relatório PDF/Excel**: botão "Relatório" na tela de Cancelamentos abre a visão do mês (por unidade) para exportar em **Excel** (cupons + ranking por operador) ou salvar em **PDF**.
- **Auditoria — export PDF/CSV**: botão "Relatório / Export" no Log de Auditoria, com filtro de período (7/30/90 dias) e módulo; salva em **PDF** ou baixa o **CSV** completo (com entidade, ID e IP).
- **Backup 3-2-1 agendado**: instalador `scripts/install-backup-task.ps1` registra a Tarefa Agendada `sgo-backup` (diária, 03:00) que roda o `backup-db.ps1` (dump do PostgreSQL + fotos, retenção e 2ª cópia opcional via `BACKUP_MIRROR_DIR`).
### Alterado
- **POPs — editor rico + blocos reordenáveis**: o conteúdo do POP agora é montado em **blocos** (Texto com **negrito/itálico/listas/subtítulo/link**, Checklist, Imagem e Vídeo), que podem ser **reordenados arrastando** (ou por ▲▼) e removidos individualmente.

## v1.3.3 — 2026-07-06
### Adicionado
- **Comandas — conferência em grade**: nova forma de conferir as comandas do dia direto no sistema, como no papel. O gerente vê **todas as comandas ativas em botões numerados** e vai **tocando em cada uma conferida** (fica verde). As **não marcadas** contam como faltando — ao confirmar, o sistema já **registra a contagem e alerta os supervisores** sobre as comandas ausentes (com observação obrigatória quando há falta). Tem contador ao vivo (conferidas/faltando), filtro por número e botões "Marcar todas"/"Limpar". Continua disponível o atalho "Todas presentes" e o lançamento manual de ausentes (recolhido).
### Alterado
- **Minha área para todos os usuários**: a aba **Minha área** (tarefas pessoais, notas e folgas) agora aparece para **todos os usuários** do sistema, individualmente — não só para os gerentes.
- **Notas recebidas — edição/exclusão restrita**: apenas **supervisores, administradores e CEO** podem **editar e excluir** notas já lançadas. Gerentes continuam lançando notas e marcando como Paga/Problema, mas não editam nem apagam.

## v1.3.2 — 2026-07-05
### Adicionado
- **Padrão de produtos por foto (IA)**: Admin cadastra em **Configurações → Padrão de produtos** os produtos que podem estar nas vitrines (nome + categoria + **foto de referência**). No checklist, nos itens com checagem por IA, o gerente tira a foto e o botão **"Conferir padrão de produtos (IA)"** aponta os itens **fora do padrão** da rede. Inerte sem chave de IA.

## v1.3.1 — 2026-07-05
### Adicionado
- **Desligamentos** (Pessoas): o gerente seleciona o colaborador e abre a solicitação de desligamento (tipo de aviso trabalhado/indenizado + justificativa + motivo). O sistema **puxa automaticamente** o tempo de empresa (admissão do RH) e os **atestados/dias afastados** lançados. Sobe para o **supervisor aprovar/recusar**; **relatório em PDF** para o RH. Idade é informada manualmente (o RH não fornece a data de nascimento).

## v1.3.0 — 2026-07-05
### Adicionado
- **Minha área (do gerente)**: nova aba no menu com **tarefas pessoais** (agenda simples; o sistema **lembra por notificação** na data/hora marcada), **bloco de notas** livre e **folgas/férias**. Nos dias de folga/férias, os **checklists não aparecem** na aba Tarefas do gerente (ele ainda entra no sistema).

## v1.2.3 — 2026-07-05
### Alterado
- **Fotos por item no checklist**: cada item que exige foto tem o **seu próprio botão de foto**, e na visão concluída as fotos aparecem **agrupadas sob o item** (antes ficavam todas juntas no fim, sem indicar de qual item eram). Fotos gerais (sem item) continuam numa seção "Outras fotos".

## v1.2.2 — 2026-07-05
### Adicionado
- **Recebimento de Gás por botijão (P45)**: além do granel (kg), agora dá para lançar por **botijão** — nº de botijões × kg por botijão (P45 = 45kg) + valor total, com **botijões devolvidos (troca)**. Converte para kg automaticamente, mantendo os dashboards e o alerta de variação de preço/kg.

## v1.2.1 — 2026-07-05
### Adicionado
- **Notas Recebidas — abrir/editar**: o gestor clica em "Ver/Editar" e ajusta fornecedor, CNPJ, número, datas, valor, produto e observação do lançamento.
- **Fornecedor digitado**: ao lançar uma nota com um fornecedor **não cadastrado**, sobe uma **pendência (notificação) para o supervisor/admin** cadastrarem em Fornecedores.

## v1.2.0 — 2026-07-04
### Adicionado
- **Freelancer — valor automático**: o pedido de pagamento calcula sozinho **horas × valor/hora do dia + vale transporte**. O valor/hora é cadastrado por **unidade × tipo de dia** (dia útil / fim de semana / feriado) em **Configurações → Valor do freelancer**, com **cadastro de feriados**. Campo de **vale transporte** e **observações** no pedido. Sem valor/hora cadastrado, cai no modo manual (com aviso).

## v1.1.3 — 2026-07-04
### Adicionado
- **Tolerância de tempo nos checklists** (Configurações → Checklists, Admin): concluir até N minutos após o horário-limite ainda conta **no prazo** (padrão **10 min**). Vale para todos os checklists.

## v1.1.2 — 2026-07-04
### Alterado
- **Ocorrências**: lista **agrupada por unidade** (cabeçalho por empresa) quando há mais de uma.
- **Notas Recebidas**: lista **agrupada por empresa** (fornecedor), com total por empresa.
- **Coleta de Óleo**: **filtro por unidade** no histórico (Todas + cada unidade).

## v1.1.1 — 2026-07-03
### Adicionado
- **Correções de checklist por período**: a tela de correções agora aceita um intervalo (De→Até) e **várias unidades / todas** (antes era só um dia e uma unidade).
- **Tarefas de hoje minimizáveis por unidade**: o mini-dashboard de cada unidade fica sempre visível e a lista de checklists recolhe (recolhida por padrão quando há várias unidades), para o gestor ver o resumo de todas de uma vez.

## v1.1.0 — 2026-07-03
### Alterado
- **Filtro de unidades padronizado (compacto)**: as listas largas de unidades viraram um seletor compacto. Histórico de checklists com **"Selecionar todas"** e **agrupado por unidade dentro de cada dia**; Metas, Treinamentos, Mapa de Funções, Desperdícios e Comandas com seletor compacto.

## v1.0.1 — 2026-07-03
### Corrigido
- **Treinamentos por setor**: POP não pode mais ser "inicial" e setorial ao mesmo tempo (aparecia para todos). Exclusividade reforçada; POPs de teste normalizados.
- **Mapa da unidade**: aviso claro quando há gente no quadro padrão mas sem escala (o mapa segue a Escala).
### Adicionado
- **Versão do app** no rodapé do menu e no login; `CHANGELOG.md`.

## v1.0.0 — 2026-07-02 (base em produção)
Primeira versão consolidada, já em uso pelos gerentes. Módulos entregues:

- **Dashboard** (gerente: meta/atalhos; CEO/Admin/Supervisor: semáforo/ranking/alertas).
- **Tarefas / Checklists** (geração por dia operacional, conclusão transacional, evidência fotográfica, conferência por IA, correções do dia, histórico).
- **Central de Comunicação** (leitura obrigatória, painel de leitura, conta na meta).
- **Desperdícios**, **Ocorrências**, **Comandas**, **Cancelamento de Cupons**, **Inventário** (Teknisa + Equipamentos), **Notas Recebidas** (QR/código de barras), **Recebimento de Gás**, **Coleta de Óleo**.
- **Pagamentos** (freelancer/HE/avulso, delegação, relatório de freelancers).
- **Pessoas**: Escala (planejado/realizado/comparação), Mapa de Funções (quadro padrão, mapa em tempo real/dia+hora/projeção, freelancers do dia), **Central de Atestados** (foto + IA, CID restrito ao RH, painel, relatório).
- **POPs** + **Treinamentos** (por setor, conta na meta).
- **Metas** (ranking, minha meta, histórico, export).
- **Auditoria**, **Configurações** (unidades, usuários, perfis de acesso, cadastros dos módulos, fornecedores, LGPD).
- **Central de Notificações** (sino + badges).
- **IA** (leitura de atestados e conferência de fotos de checklist) ligada em produção.
- Publicado em https://sgorestaurantesgbf.com.br (Docker + Cloudflare Tunnel), backup diário do banco.

## v1.0.1 — 2026-07-03 (correções)
### Corrigido
- **Treinamentos por setor**: POP marcado como "inicial" **e** com setor aparecia para todos os colaboradores. Agora "inicial" e "setorial" são **exclusivos** (escolher setor = não é inicial), reforçado no servidor e no editor de POP. Os 2 POPs de teste foram corrigidos para setoriais.
- **Mapa da unidade**: quando há gente no quadro padrão mas ninguém escalado, o aviso agora explica que o mapa segue a **Escala** e orienta a cadastrá-la (antes o mapa só ficava vazio sem explicação).
### Adicionado
- **Versão do app** visível no rodapé do menu e na tela de login; `CHANGELOG.md`.

## v1.1.0 — 2026-07-03 (padronização do filtro de unidades — parte 1)
### Alterado
- **Filtro de unidades compacto** no lugar das listas largas de "pills" que ocupavam a tela:
  - **Histórico de checklists**: filtro compacto com **"Selecionar todas"** (multi) e lista **agrupada por unidade dentro de cada dia**.
  - **Metas, Treinamentos, Mapa de Funções, Desperdícios, Comandas**: seletor de unidade compacto (dropdown único), preservando os demais filtros (mês/data).
- Componentes reutilizáveis: `UnitFilter` (multi + todas) e `UnitSelectNav` (único).

<!--
## v1.1.x — (em desenvolvimento)
### Próximos: Correções por período; agrupar por empresa em Ocorrências/Notas/Óleo;
### Tarefas de hoje minimizável por unidade; fotos por item no checklist.
-->
