# Roteiro de validação do redesign (antes de publicar)

> Os 169 testes cobrem regra de negócio, não interface. O que eu verifiquei por
> leitura de código: o banco não mudou, os formulários mandam o mesmo corpo de
> antes e as regras de negócio estão intactas. O que **só você pode verificar**
> é se a tela continua servindo à rotina de quem usa.
>
> Marque conforme for. O que falhar, me diga o módulo e o passo.

## Como testar

Entre com o perfil que **mais usa** cada módulo, não com Admin. Um gerente vê
telas diferentes de um administrador, e é a tela do gerente que roda todo dia.

Teste **no celular** também, pelo menos os quatro primeiros. O sistema é
mobile-first e os alvos de toque mudaram nesta rodada.

---

## 1. As quatro mudanças de comportamento (prioridade máxima)

São as únicas alterações de funcionamento do redesign inteiro. Se algo aqui
estiver errado, é reversão de poucas linhas.

- [ ] **Pagamentos → Aprovar.** Selecione várias solicitações e aprove de uma
      vez. Confira: todas mudaram de status? O Financeiro recebeu **uma**
      notificação consolidada (não uma por pagamento)? Cada solicitante recebeu
      a sua? Os valores no aviso batem com a soma?
      *É o único acréscimo funcional do redesign — e mexe com dinheiro.*

- [ ] **Atestados → Lançar.** Escolha o início e tente pôr um fim ANTES dele.
      O calendário deve bloquear os dias anteriores.
      *Antes aceitava e o cálculo corrigia para 1 dia em silêncio.*

- [ ] **Atestados → Painel.** O seletor de mês agora lista os **últimos 12**.
      Você precisa consultar mês mais antigo que isso? Se sim, me diga — eu tiro
      a limitação.

- [ ] **Qualquer campo opcional** (fornecedor no Gás, prestador no chamado,
      setor do freelancer, turno na escala). Escolha algo e depois **volte para
      vazio**: a primeira opção da lista ("— nenhum —") tem que estar lá.
      *Isto foi um defeito que eu introduzi e corrigi; vale confirmar.*

---

## 2. Campos de escolha, data e hora (mudaram em TODO o sistema)

Não há mais nenhum campo nativo do celular. Teste em **um** módulo com calma e
depois só confira de passagem nos outros.

- [ ] Abre ao toque, fecha ao tocar fora e no Esc
- [ ] No computador dá para usar só o teclado: setas andam, Enter escolhe, Esc fecha
- [ ] O calendário abre no mês certo e "Hoje" funciona
- [ ] O relógio anda de 5 em 5 minutos (30 em 30 no lembrete da Minha Área)
- [ ] No celular o campo é fácil de acertar com o dedo

---

## 3. Por módulo — o que olhar

Em todos: os números continuam certos? É a pergunta que mais importa, porque a
cor mudou em toda tela e um erro de cor pode fazer um número parecer outro estado.

### Tarefas (checklist) — rotina diária do gerente
- [ ] Realizar um checklist ponta a ponta, com foto
- [ ] Os três estados (🟢 de acordo, 🟡 em correção, 🔴 a corrigir) se distinguem à primeira vista
- [ ] Concluir e ver que sai da lista de pendentes
- [ ] "Ver preenchimento" mostra o que foi respondido

### Comandas
- [ ] A grade de conferência: 1 toque = conferida, 2 = em uso, 3 = limpa — as três cores se distinguem?
- [ ] Seleção por faixa (de X a Y) ainda marca em lote
- [ ] O total de faltantes bate com o que você marcou

### Desperdícios
- [ ] Lançar o dia, com sub-itens
- [ ] As barras do comparativo entre unidades estão proporcionais aos números

### Escala
- [ ] A grade do Realizado: T / F / FI / FJ / A / FE / AT se distinguem por cor
- [ ] Editar uma célula pelo seletor que abre nela mesma
- [ ] Registrar ausência por período com anexo

### Pagamentos
- [ ] Solicitar, aprovar e pagar (o fluxo inteiro, uma vez)
- [ ] O alerta de divergência de valor aparece quando o valor foge do padrão

### Notas / Gás
- [ ] Ler QR e código de barras **com a câmera** (o visor ficou sempre escuro de propósito — o texto tem que estar legível sobre a imagem)
- [ ] O selo "GÁS" na lista está visível
- [ ] O alerta de variação de preço aparece

### Cofre (Troco)
- [ ] Contagem por denominação
- [ ] O fluxo vermelho de retirada proibida continua avisando

### Ocorrências
- [ ] As quatro gravidades (🟢🟡🔴⚫) se distinguem
- [ ] Anexar foto/vídeo

### Relatórios em PDF (Atestados, Desligamentos, Ocorrências)
- [ ] **Imprimir de verdade, ou ao menos ver a pré-visualização.** Estas telas
      ficam claras de propósito, mesmo com o sistema no escuro. Confirme que o
      papel sai branco com texto escuro.

---

## 4. Tema escuro (novidade desta rodada)

O padrão passou a seguir o aparelho. Quem tiver o celular no escuro vai ver o
sistema escuro pela primeira vez.

- [ ] Ponha o celular no modo escuro e abra o sistema
- [ ] Percorra os módulos que mais usa procurando algo que **sumiu** — não algo
      ilegível, mas algo que ficou da cor do fundo

> ⚠️ **Não existe seletor de tema na interface.** Eu havia escrito aqui que dava
> para forçar Claro em Meu Perfil — é falso, não conferi antes de escrever. O
> componente `ThemeToggle` existe mas só está montado em `/dev/ui` (a galeria de
> desenvolvimento). Como o padrão sem cookie é `system` (`src/lib/theme.ts`),
> **quem tiver o aparelho no escuro vê o sistema escuro e não tem como voltar** —
> o que contraria a regra 2 do CLAUDE.md ("tema claro"). Pendência aberta, a
> decidir: montar o seletor em Meu Perfil, ou voltar o padrão para `light`.

*A auditoria automática cobriu contraste de texto e elemento sumido, nos dois
temas, em ~1.500 elementos. O que ela não pega é "está feio" ou "não parece
mais o mesmo sistema" — isso é olho humano.*

---

## 5. Onda 8 — a cara de iOS

Aqui **nada de funcionamento mudou**: sem mudança de banco, de rota ou de corpo
de requisição. O que mudou é desenho e gesto, e é exatamente por isso que só
olho humano resolve. Detalhes técnicos em `docs/redesign-onda-8.md`.

**No celular (é onde a maior parte muda):**

- [ ] Navegue entre telas: a nova **entra pela direita**, como num app. Nada
      deve piscar branco nem "pular" no fim do movimento
- [ ] Aperte e segure um botão: ele **encolhe** enquanto o dedo está em cima e
      volta em mola. Em linha de lista, ela **acende** em vez de encolher
- [ ] Abra **Notas Recebidas** (é o pior caso: 5 abas com nomes longos). A
      fileira de abas **rola para o lado** com o dedo, sem barra de rolagem
      aparecendo, e nenhum nome fica cortado
- [ ] Toque numa aba do fim da fileira: ela deve **entrar no campo de visão**
      sozinha, não ficar meio escondida na borda

**Abas — o que esperar em toda tela que tem:**

- [ ] A aba escolhida é uma **pílula clara elevada sobre um trilho cinza**, não
      um bloco bordô/rosa. Se em alguma tela ainda aparecer bloco cheio de cor
      no topo, me diga qual
- [ ] Confira as 21 telas com aba pelo menos de relance: Notas, Pagamentos,
      Gás, Coleta de Óleo, Comunicação, Manutenção, Pessoas, Avaliação,
      Período de Experiência, Comissões, Rotina do Supervisor, Inventário de
      equipamentos, Pedidos de produtos, Checklists (Configurações), Histórico
      de checklists, Relatório de Auditoria, Análise de cancelamentos, Análise
      de comandas em aberto
- [ ] **Manutenção** e **Avaliação** perderam os ícones das abas (ficou só
      texto, que é o padrão do iOS). Se sentir falta, é reversível

**Tema escuro, agora que o acento foi separado:**

- [ ] No escuro, **título e nome não são mais rosa** — são quase brancos. Rosa
      deve sobrar só no que se **toca**: link, botão, aba de navegação
- [ ] Se achar rosa num texto que **não** é clicável, me diga onde: é resíduo
      da separação e a correção é de uma linha

**Duas coisas que deixei para você decidir** (não são esquecimento):

- [ ] Os segmentos das abas têm **36px** de altura. Está acima do mínimo de
      acessibilidade e é a medida do próprio controle do iOS (32pt), mas é
      menor que os 44px de um botão solto. Se o dedo errar, eu subo
- [ ] As células da grade de **Comandas** têm 26px. Levar para 44px faz a grade
      crescer de ~650px para ~1100px de altura — muda a rotina de conferência,
      então é sua chamada

---

## 6. Se algo estiver errado

Me diga o módulo e o passo. Reverter é barato: cada tela foi um commit separado,
então dá para voltar um módulo sem desfazer o resto.
