# Onda 8 — o sistema com cara de iOS

> Branch `redesign/onda-8`. **Nada publicado**: sem PR, sem merge, `main` intacta.
> Continuação de [[redesign-onda-7]] (a migração de cor que destravou o tema escuro).

O pedido foi: *"todo sistema tem que ser muito parecido ou idêntico ao iOS"* — transições,
botões, compacidade. E, depois dos primeiros prints: *"ainda não gostei do visual, quero mais
parecido com iOS"*, seguido de *"isso, é essa a cara, migra o resto"* quando a lista agrupada
apareceu.

## O que mudou

### 1. Transição de página
`src/app/(app)/template.tsx` em duas camadas: um contêiner que **recorta** (`overflow-x: clip`)
e, dentro, o que se move. As duas precisam ser separadas — se o mesmo elemento recortasse e
transformasse, `position: fixed` dos descendentes quebraria.

No celular a página **entra pela direita** (`sgo-page-push`), como um push de navegação do iOS.
Em ≥768px ela **emerge** com uma escala mínima (`sgo-page-emerge`): a fronteira é 768px porque é
onde o próprio app troca de barra inferior para barra lateral — animar diferente em outro ponto
deixaria uma faixa de larguras com metade da tela parada.

### 2. Recuo ao toque
Regra global: todo `button` encolhe para `scale(0.96)` na pressão, ida rápida (80ms) e volta em
mola. É o que faz um botão "parecer iOS" — não o raio da borda. Antes só trocava de cor, e no
celular o dedo cobre justamente a área que mudaria.

Escape: `.sgo-no-press` para onde o recuo atrapalha. Linhas de lista **acendem** em vez de
encolher (uma linha larga encolhendo parece defeito).

### 3. Lista agrupada
`src/components/ui/ds/group.tsx` — uma caixa só, com fio recuado entre as linhas, em vez de
cartões soltos com vão. É a silhueta do iOS e ganhou 13 telas.

Dois detalhes que só apareceram no uso:
- **Lista vazia não desenha caixa.** `<Group>{itens.map(…)}</Group>` com zero itens deixava um
  retângulo vazio na tela. A guarda ficou no componente, não em cada chamada.
- **O fio começa a 12px, não 16px.** Copiei o número do iOS direto, mas as linhas usam `p-3`
  (12px), então o fio nascia 4px depois do texto — desalinhado justo onde mais se olha.

### 4. Segmented control (o maior alcance)
As abas eram pílulas escritas à mão, repetidas em **21 lugares**, com a ativa em `bg-brand`
sólido. Duas coisas erradas: o iOS usa trilho **afundado** com a eleita em pílula **elevada**; e
no tema escuro o bordô abre em rosa claro, então cada tela abria com um bloco pastel no topo.

Já existia um `SegmentedControl` no DS (Onda 2), usado em só 3 lugares — e com um bug de tema que
ninguém tinha visto: a pílula usava `bg-surface`, e no escuro `surface` (31 28 27) é **mais
escuro** que o trilho `sunken` (42 38 36). A pílula eleita **afundava** em vez de subir, o
inverso do que a elevação promete. Daí o token novo **`raised`**, o único que sobe nos dois temas.

Também caiu a amarra de largura igual (`translateX(índice * 100%)` + `flex-1`). Os rótulos aqui
são frases — "Lançar recebimento", "Painel & Histórico" — e há telas com cinco abas: em 375px dá
75px por segmento e o texto vaza. Agora cada segmento tem a largura do seu texto e o trilho
**rola** quando não couber, sem barra visível.

O deslize da pílula virou transição de cor, de propósito — ver "O que não fiz" abaixo.

### 5. Acento só para o que é tocável
Herança da Onda 7: `text-brand` acumulava dois papéis, cor de link **e** cor de título. No claro
os dois passavam (bordô sobre branco lê como tinta escura); no escuro o mesmo token abre em rosa
e cada título virou acento. **235 títulos e nomes** passaram a `text-ink-900`; os **166** usos em
elemento tocável ficaram. O item ativo do menu deixou de ser bloco cheio e virou tinta.

## Portões novos

| Script | Pega o quê |
|---|---|
| `scripts/check-dead-ternary.cjs` | ternário cujos dois lados dão a **mesma** classe de cor — não quebra build, tipo nem lint; a distinção visual morre calada |
| `scripts/check-palette-keys.cjs` | classe de cor apontando para chave que não existe (órfã) |
| `scripts/check-color-collapse.cjs` | onde a Onda 7 juntou duas cores diferentes no mesmo destino (consultivo, lista de revisão) |

O detector de ternário achou um caso que **eu mesmo** criei: o título da notificação não-lida era
bordô e o migrador achatou os dois lados. Testei os detectores com um caso plantado antes de
confiar neles — a lição do `grep -E` com lookbehind, que na Onda 7 me deu um "tudo limpo"
impossível de falhar.

## Medições (não é olhômetro)

Contraste AAA nos **dois temas**, com repintado forçado antes de cada leitura:

| Tela | Claro | Escuro |
|---|---|---|
| `/dashboard` | 0/47 | 0/47 |
| `/modulos/supervisao` | 0/64 | 0/64 |
| `/modulos/pessoas` | 0/41 | 0/41 |
| `/modulos/pagamentos` | 0/28 | 0/28 |
| `/dev/ui` | 0/30 | 0/30 |

Segmented control: texto ativo **17,96:1** no claro e **8,86:1** no escuro; inativo 7,01 e 7,02.
Pílula vs trilho fica em **1,2:1 de propósito** — a separação vem da sombra e do peso do texto,
como no iOS.

Menu ativo: **8,41:1** no claro, **7,42:1** no escuro.

Em 375px, na tela de pior caso (Notas, 5 abas): trilho a 44px em ponteiro grosso, rola sem barra,
nenhum rótulo estoura o segmento, aba clicada entra no campo de visão.

## O que não fiz, e por quê

**A pílula não desliza.** Implementei a versão que mede o segmento
(`offsetLeft`/`offsetWidth` + `ResizeObserver`) — é o que libera largura variável mantendo o
deslize — e **não consegui provar que ela pousa no lugar**: o navegador desta sessão não aplica
estilo inline neste elemento (o atributo diz `width: 77px`, o computado insiste em 67px, e
escrever o mesmo valor à mão via CSSOM também não pega). Sem prova, não espalho por 21 telas.
Pintar o botão ativo não tem o que dar errado, e em repouso — que é o que se olha — o desenho é
o mesmo. **Se for validado num navegador de verdade, a versão medida está no histórico do
`git`** e vale trazer de volta.

**Alvos de toque abaixo de 44px** continuam em dois lugares e são **decisão sua**, porque o custo
não é meu:
- segmentos do segmented control ficam em 36px — acima do mínimo AA (24px) e igual ao próprio
  controle do iOS, que é 32pt;
- células da grade de Comandas em 26px. Corrigir para 44px faz a grade crescer de ~650px para
  ~1100px de altura, o que muda a rotina de conferência.

## Três artefatos do navegador que me enganaram

Registrados porque custaram tempo e vão reaparecer:

1. **Painel oculto congela animação.** `documentVisibility: "hidden"` → o browser trava a
   animação em `currentTime: 0`, e `sgo-page-push` fica no quadro inicial `translate3d(100%,0,0)`.
   Medi a página 343px fora da tela e quase reportei bug. O `overflow-x: clip` provou que estava
   contida (`document.scrollWidth` = 375 = viewport). Cheguei a tirar o `both` do `fill-mode`
   achando que resolvia; medi de novo, **não resolve** (na fase ativa vale o quadro inicial;
   `fill-mode` só age fora dela) e revertí.
2. **Estilo inline não aplicado** — descrito acima.
3. **Trocar o tema sem repintar** falseia a primeira leitura. Sem
   `display:none; void offsetHeight; display:''`, o auditor reprovou 6 itens do menu que estavam
   corretos (1,21:1 fantasma). Toda medição de tema aqui precisa do repintado forçado.

Regra que tirei disso: **cor e classe** este painel lê de forma confiável; **animação, transição
e estilo inline**, não.

## Antes de publicar: um conflito conhecido

O `origin/main` andou **1 commit** depois que esta branch saiu: `be18871`
(*fix(gas-import): CNPJ da unidade no cadastro*, PR #17). Calculei o merge com
`git merge-tree` (que não altera nada) e há **um** conflito:

- `src/components/admin/units-admin.tsx` — **conflita**
- `src/app/(app)/configuracoes/unidades/page.tsx` — resolve sozinho

Os dois lados não se contradizem: o meu é só renomeação de token de cor, o
deles é a feature de CNPJ. A resolução é **ficar com a feature de CNPJ** e
aplicar os renomes nas linhas novas dela, que nasceram com os nomes antigos:

| Nas linhas novas do PR #17 | passa a ser |
|---|---|
| `text-muted-foreground` | `text-ink-500` |
| `text-critical` | `text-danger` |

Se alguém esquecer, `node scripts/check-palette-keys.cjs` reprova — é
exatamente o caso que esse portão existe para pegar. **Não fiz o merge**:
mudar a base da branch é decisão do Pedro, não minha.

## Risco de reversão

Baixo e uniforme: a onda é visual. **Zero mudança de schema, zero mudança de rota, zero mudança
de payload.** Reverter é `git revert` dos commits da branch — nada a desfazer em banco.

O que um revert derrubaria junto: os três portões novos e as duas correções de bug real que
apareceram no caminho (a pílula invertida no escuro e o título de notificação achatado).
