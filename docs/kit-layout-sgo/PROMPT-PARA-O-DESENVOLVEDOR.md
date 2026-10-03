# Padronização visual: o SGO Restaurante passa a usar o layout do SGO (postos), idêntico

## Objetivo

Os sistemas do Grupo Beija-Flor vão ter **um único layout**. O SGO Restaurante deve ficar
**visualmente idêntico ao SGO dos postos**: mesma moldura, mesmo fundo, mesmas fontes, mesmos
tamanhos, mesma hierarquia de títulos e menus, mesmas cores, mesmos botões, cartões, tabelas,
selos, formulários e modais, e o mesmo comportamento em tema claro e escuro e no celular.

A regra é **copiar, não reinterpretar**. Junto com este prompt vai o kit `kit-layout-sgo` com os
**arquivos originais** do SGO. Use os arquivos como estão. Só troque o que é **dado do
restaurante**: itens do menu, rotas, permissões e consultas à API. **Nada de cor, tamanho,
espaçamento, raio, sombra ou fonte deve ser "ajustado ao gosto".** Se algo parecer estranho,
pergunte antes de mudar.

Escopo: **somente layout e visual**. Não mude regra de negócio, banco de dados nem API do
restaurante.

---

## O que vem no kit

| Pasta | Conteúdo | O que fazer |
|---|---|---|
| `1-estilos/` | `sgo-design-system.css` (o design system inteiro: tokens, claro/escuro, todos os componentes `.sgo-*`), `index.css` (base global e ponte com Tailwind/shadcn), `tailwind.config.ts`, `components.json` (shadcn), `index.html` (fontes e meta) | Copiar **inteiros**. O `index.css` importa o `sgo-design-system.css` na primeira linha. |
| `2-moldura/` | `TopNav.tsx` (barra de navegação global), `MobileNav.tsx` (menu no celular), `WorkspaceTabs.tsx` + `TabsContext.tsx` (abas de trabalho flutuantes no rodapé), `SubnavPortalContext.tsx`, `ThemeContext.tsx` + `ThemeToggle.tsx` (claro/escuro), `GlobalSearch.tsx`, `NotificationsDropdown.tsx`, `App-layout-raiz.trecho.tsx` (como a moldura é montada no `App.tsx`) | Copiar e ligar aos dados do restaurante, mantendo **todas** as classes e a estrutura de elementos. |
| `3-componentes-sgo/` | `AmbientBackground` (fundo contínuo), `ModuleShell` (trilho de seções do módulo), `SgoPageHeader` (cabeçalho de página), `SgoModal`, `SgoDrawer`, `SgoKpi`, `panel`, `SgoBar`, `SgoTimeline`, `NavBadge`, `NavIcons`, `BandeiraTag`, `tones` | Copiar **sem alterar**. |
| `4-exemplos-de-tela/` | Telas reais do SGO: `Dashboard` (painel com KPIs), `CentralTarefas` (cabeçalho com sub-abas), `FolhaCaixaAdministrativo` (módulo com trilho), `LogisticaCte` (filtros, cartões, tabela densa, modal) | **Referência** de como as peças se combinam. Não copiar a regra de negócio. |
| `5-imagens/` | Beija-flor (`sgo-bird-only.png`, usado no logo e na marca d'água do fundo), logos, favicon | Colocar em `client/public/` com **os mesmos nomes**: o CSS referencia `/sgo-bird-only.png`. |
| `6-referencia/` | `menuArvore.ts` e `menuConfig.ts` do SGO | Modelo da **estrutura** do menu (seção → itens → sub-itens, ícone, permissão). Os itens do restaurante são outros; a forma do registro é a mesma. |

Stack do SGO: React 18 + Vite + TypeScript + Tailwind + shadcn/ui (Radix) + `lucide-react` (ícones) +
`wouter` (rotas) + TanStack Query v5 + `framer-motion`. Se o restaurante usa outra coisa (por exemplo
react-router no lugar de wouter), adapte **só a camada de rota/dados**; o HTML gerado e as classes têm
de ficar iguais.

---

## Fundação visual (já está nos arquivos — aqui é para conferência)

**Fontes.** Interface: `-apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", "Segoe UI", sans-serif`
(`--sgo-font`). Números e códigos: **Roboto Mono**. As duas carregadas do Google Fonts no `index.html`
(Inter 400/500/600/700 e Roboto Mono 400/500). Base: **13px**, line-height 1.45, letter-spacing −0,006em,
antialiasing ligado.

**Cores (tema claro).**
- **Marca:** royal `#0A4DA8`, royal-2 `#1159BD`, marinho `#003068`, azuis `#2E7CD6` / `#1B5FA8` / `#144B86`.
- **Texto:** `#111114` (principal), `#6E6E76` (secundário), `#9C9CA4` (terciário).
- **Superfícies:** fundo `#F3F4F8`, painel `#FFFFFF`, painel-2 `#F7F7FA`.
- **Estados:** ok `#1D9A50`, alerta `#B26A00`, ruim `#D0342C`, cada um com a versão "soft" de fundo; auxiliares sky `#2E7BA6` e violeta `#514BA0`.

O tema escuro redefine os mesmos tokens em `html.dark`. **Regra: nenhuma cor fixa em tela — só `var(--sgo-…)`.**

**Raios e sombras.** 8 / 12 / 16 px; cartões de vidro com 18 px; sombras `--sgo-sh-panel` e `--sgo-sh-pop`; grade de 8 pt.

**Fundo contínuo (o "papel de parede").** O `<AmbientBackground />` é montado **uma única vez**, na raiz
do app, atrás de tudo. Ele traz o gradiente azul-claro, as manchas de luz e a marca d'água do beija-flor
(máscara do PNG). As telas **não** pintam fundo próprio: painéis, KPIs e a barra são **vidro translúcido**
sobre esse fundo. Modal é a exceção: é opaco.

---

## Hierarquia da tela — do topo para baixo (igual ao SGO)

1. **Barra global flutuante** (`.sgo-navbar`)
   - **Forma:** vidro fosco, fixa no topo, recuada 16 px das laterais, raio 14 px, altura de 68 px.
   - **À esquerda:** o logo, que é o beija-flor branco dentro de um quadrado arredondado de 27 px em gradiente azul, mais a palavra **"SGO"** em 14 px, peso 800. Ao passar o mouse, mostra versão e data da atualização.
   - **No meio:** um divisor e os **módulos como barra de abas**. Cada item tem o ícone de 20 px em cima e o nome em 12 px embaixo. O item ativo fica numa pílula clara com texto azul `#1B5FA8`, peso 600. As pendências aparecem num **selo vermelho** no canto do ícone (`NavBadge`), que é o mesmo componente em todo o sistema.
   - **À direita:** busca global, sino de notificações, alternância de tema, engrenagem de configurações e avatar com as iniciais do usuário.
   - **Para o restaurante:** os nomes da barra podem ser outros, mas o desenho é este.
2. **Trilho do módulo** (`ModuleShell`, `.sgo-trilho`): as seções do módulo logo abaixo da barra.
   - **Forma:** segmented control de vidro; itens de 30 px de altura com ícone de 14 px e texto de 12,5 px.
   - **Item ativo:** branco, com texto azul.
   - **Muitas seções:** o trilho **quebra linha**, nunca rola na horizontal.
3. **Cabeçalho da página** (`SgoPageHeader`, `.sgo-phdr`): uma linha com [título + subtítulo] — [sub-abas] — [ações].
   - **Título:** 20 px, peso 600, cor `#0F172A`.
   - **Subtítulo:** 12,5 px, cor `#404852`.
   - **Telas simples:** `.sgo-h1` / `.sgo-sub`, com os mesmos valores.
4. **Filtros**
   - **Campos:** cada campo tem o **rótulo em cima** (`.sgo-label`: 10,5 px, peso 650, MAIÚSCULAS, espaçamento 0,05em, cor terciária).
   - **Chips:** os chips de filtro ficam numa linha (`.sgo-filtros`).
5. **Cartões de indicador** (`.sgo-kpis` / `.sgo-kpi`)
   - **Grade:** colunas automáticas, mínimo de 185 px, espaço de 14 px.
   - **Cartão:** vidro com raio 18 px, cápsula de ícone colorida, valor grande e rótulo embaixo; sobe 2 px no hover.
6. **Conteúdo**
   - **Painéis:** `.sgo-panel`, vidro.
   - **Tabelas:** `.sgo-tbl`; nas telas cheias, `.sgo-dense`.
   - **Selos de status:** `.sgo-tag` + `--green/--amber/--red/--blue/--sky/--violet/--gray`; 10,5 px, peso 650, pílula com bolinha.
   - **Listas:** `.sgo-row`.
7. **Abas de trabalho** (`WorkspaceTabs`): barra flutuante no rodapé com as telas abertas, que se fecham pelo "×".
8. **Rodapé:** uma linha mínima com a versão, em 8 px.

**Botões** (`.sgo-btn`): 30 px de altura, raio 8, texto de 12,5 px peso 500.
- **Variantes:** `--primary` (gradiente azul com sombra), `--ghost`, `--danger`, `--sm` (26 px) e `--icon` (quadrado).
- **Uso:** só uma ação primária por área.

**Modal** (`SgoModal`): cabeçalho com cápsula de ícone + título + subtítulo, corpo, rodapé com
Cancelar à esquerda da ação primária. **Painel lateral** de detalhe: `SgoDrawer`.

**Celular:** abaixo de 1024 px a barra vira o `MobileNav`. O trilho e o cabeçalho quebram linha. Nada
de rolagem horizontal na página.

---

## Passo a passo

1. Instalar as dependências que faltarem: `lucide-react`, `framer-motion`, `wouter` (ou adaptar), `@tanstack/react-query`, componentes shadcn usados (`tooltip`, `dropdown-menu`, `dialog`, `select`, `table`, `toast`).
2. Copiar `1-estilos/*` sobre os arquivos equivalentes do restaurante. O `index.css` precisa ser o primeiro CSS carregado (`import "./index.css"` no `main.tsx`), e o `index.html` precisa das tags de fonte.
3. Copiar `5-imagens/*` para `client/public/`.
4. Copiar `3-componentes-sgo/*` para `client/src/components/sgo/`.
5. Copiar `2-moldura/*` e montar a raiz como no `App-layout-raiz.trecho.tsx`:
   `ThemeProvider` → `TooltipProvider` → `<AmbientBackground />` → layout (`<header className="sgo-app sgo-navbar">` + `<main className="sgo-shell__main …">` + `<WorkspaceTabs />` + rodapé).
6. Criar o registro de menu do restaurante **no mesmo formato** do `menuArvore.ts`/`menuConfig.ts` (seção, ícone `lucide`, rótulo curto, rota, permissão, sub-itens) e ligar à `TopNav`, ao `MobileNav` e ao `ModuleShell`.
7. Ligar às APIs do restaurante o que a moldura consulta: contagem de pendências dos selos, notificações, usuário logado e permissões, busca global. Sem a API equivalente, o selo simplesmente não aparece; **não remova o componente**.
8. Migrar cada tela para a hierarquia acima, usando os exemplos da pasta `4-exemplos-de-tela`: `SgoPageHeader` (ou `ModuleShell`) → filtros → `.sgo-kpis` → `.sgo-panel` com `.sgo-tbl` → `SgoModal` para criar/editar.
9. Remover estilos antigos do restaurante que conflitem (cores fixas, fontes próprias, sombras próprias).

---

## Critérios de aceite (conferência lado a lado com o SGO dos postos)

- [ ] **Fundo:** mesmo fundo contínuo azul-claro com a marca d'água do beija-flor; nenhuma tela com fundo chapado próprio.
- [ ] **Barra global:**
  - flutuante de vidro, 68 px, recuada 16 px, raio 14 px;
  - logo em squircle azul + "SGO" peso 800;
  - módulos com ícone em cima e nome embaixo, pílula no ativo, selo vermelho de pendência;
  - à direita, busca, sino, tema, engrenagem e avatar.
- [ ] **Abaixo da barra:** trilho do módulo em vidro, que quebra linha em vez de rolar.
- [ ] **Título e subtítulo:**
  - título de página 20 px / 600, subtítulo 12,5 px `#404852`;
  - rótulos de campo em MAIÚSCULAS 10,5 px.
- [ ] **Componentes:**
  - KPIs, painéis, tabelas, selos, botões, campos e modais com as classes `.sgo-*` e **os mesmos valores** do `sgo-design-system.css`;
  - nenhum `#hex` solto em tela.
- [ ] **Tema e celular:**
  - tema escuro pela classe `dark` no `<html>`, com a mesma aparência do SGO no escuro;
  - no celular (375 px), menu móvel e nenhuma rolagem horizontal.
- [ ] **Abas de trabalho:** flutuantes no rodapé, funcionando.
- [ ] **Conferência visual:** prints do restaurante ao lado dos prints do SGO, nas mesmas telas equivalentes (painel, lista com filtros, formulário em modal) e nos dois temas, sem diferença visível de cor, fonte, tamanho ou espaçamento.

Ao terminar, envie os prints lado a lado e a lista do que **não** ficou idêntico, com o motivo.
