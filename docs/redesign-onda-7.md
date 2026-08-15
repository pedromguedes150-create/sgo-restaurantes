# Redesign — Onda 7: migração de cores e modo escuro

> Aberta ao fim da Onda 6 (fase E). **CONCLUÍDA em 15/08/2026** — ver o resumo no fim.
> Regra permanente do redesign: trabalho em `redesign/onda-7`, nunca na `main`;
> PR só sai de rascunho com a frase literal "liberar para produção".

## Por que virou onda própria

A fase E da Onda 6 fechou o escopo do portão (`src/**`, sem lista de isentos).
O item que sobrou — "tirar o prefixo `sgo-` dos tokens" — parecia limpeza de
fim de onda e não é: **os valores do legado e do design system são diferentes**.

| Classe | Legado (fixo) | DS claro | DS escuro |
|---|---|---|---|
| `brand` | `#6E1423` | `#7c1a2b` | `#f0a7b1` |
| `surface` | `#F5F5F5` | `#ffffff` | `#1f1c1b` |
| `success` | `#16A34A` | `#0a5c34` | `#5fd39a` |
| `critical` → `danger` | `#DC2626` | `#a31515` | `#ff9a93` |
| `medium` → `warning` | `#F59E0B` | `#7a4200` | `#f0b360` |

Duas consequências que a palavra "rename" escondia:

1. **A cor renderizada muda.** Os tons do DS são mais escuros de propósito:
   foram escolhidos para o AAA ≥7:1 da regra 3, que `#16A34A` e `#F59E0B` não
   cumprem sobre branco.
2. **O app inteiro passa a reagir ao tema.** É exatamente o que bloqueia o modo
   escuro hoje — o cabeçalho de `src/styles/sgo-design-system.css` explica que o
   padrão é claro porque as cores fixas não reagem, e bordô sobre card escuro dá
   ~1,3:1. Feita a migração, o padrão pode voltar a ser `system`.

Volume medido em 14/08/2026: **~2.100 usos** de classe da paleta legada.
Os maiores: `text-muted-foreground` (748), `text-brand` (307), `text-critical`
(189), `bg-card` (158), `text-accent` (157).

## Ordem proposta

**Passo 1 — auditor de contraste, antes de migrar nada.**
Script que percorre o DOM da página renderizada, resolve a cor efetiva de cada
par texto/fundo e reprova o que ficar abaixo do limite da regra 3 (≥7:1 normal,
≥4,5:1 para ≥24px ou ≥18,66px bold). Roda nos dois temas. Serve de rede de
segurança e de critério objetivo — print não mede contraste.

**Passo 2 — mapa de tokens, decidido antes do primeiro replace.**
Cada classe legada recebe um destino explícito, incluindo os casos que não são
1:1 (`accent`, hoje um cinza de destaque, não tem equivalente direto no DS).

**Passo 3 — migração tela a tela**, um commit por tela, auditor rodando entre
cada uma (regra 11 do contrato). Telas de maior tráfego primeiro.

**Passo 4 — remover a paleta legada** do `tailwind.config.ts` e os `hsl(var(--*))`
do shadcn em `globals.css`; tirar o prefixo `sgo-`.

**Passo 5 — padrão do tema volta a `system`** e o modo escuro sai do bloqueio.

## Risco

É o item mais arriscado do redesign: mexe na cor de todas as telas de uma vez.
O maior perigo é uma regressão de contraste passar despercebida numa tela pouco
visitada — daí o auditor vir antes, e não depois.

---

## Resultado

Os cinco passos foram executados na ordem proposta. O que o plano não previa e
apareceu no caminho:

**O auditor reprovou a própria base.** Antes de qualquer migração, 8 de 36
elementos de /tarefas falhavam — todos tokens das Ondas 0-6.  passava só
sobre branco;  não tinha valor que servisse e virou token não-textual
(ícone, desabilitado); os três status caíam sobre .

**O modificador de opacidade não funcionava nos tokens do DS.** computava transparente. Migrar os 198 usos de opacidade da paleta legada teria
apagado todas as caixas tingidas do sistema — e passaria numa auditoria de
contraste, porque fundo transparente mede contra o pai. Os tokens passaram a ser
definidos em canal RGB (), que é o que permite o . De
quebra, isso consertou 6 usos invisíveis desde a Onda 0.

**Relatórios em PDF precisaram sair do tema.** Usavam  de
propósito; convertê-los a tokens sem mais nada os quebraria no escuro. Ganharam
o escopo , que repina os tokens nos valores claros.

**O mapeamento em bloco de  colidiu uma vez:** no login o quadrado BF
era  sobre , e os dois viraram a mesma cor. O auditor não
pega esse caso — o texto continua contrastando, só o quadrado some.

**Faltava  no bloco .** Quem escolhesse Escuro à
mão ficava com as barras de desfoque brancas sobre a página escura. Bug da Onda
0 que nunca apareceu porque o escuro nunca foi usado.

## Auditoria final

| Tela | Claro | Escuro |
|---|---|---|
| /tarefas | 0/26 | 0/36 |
| /modulos/pagamentos | 0/44 | 0/44 |
| /modulos/troco | 0/66 | 0/83 |
| /modulos/escala | 0/110 | 0/116 |
| /configuracoes | 0/88 | 0/88 |
| /modulos/pessoas | 0/45 | 0/45 |
| /modulos/notas | 0/53 | — |
| /login | 0/7 | — |
