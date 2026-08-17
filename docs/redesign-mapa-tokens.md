# Mapa de tokens — paleta legada → design system (Onda 7)

> Decidido **antes** do primeiro replace, como manda o passo 2 do plano.
> Números medidos com `src/lib/ds/contrast.ts`; a regra é a §3 do contrato
> (AAA ≥7:1 texto normal, ≥4,5:1 para ≥24px ou ≥18,66px bold).

## Texto

| Classe legada | Vira | Por quê |
|---|---|---|
| `text-brand` | `text-sgo-brand` | mesmo papel (marca). Passa a reagir ao tema |
| `text-gold` | `text-ink-700` | o "gold" já era grafite `#3F3F46`; no DS isso é tinta, não marca |
| `text-accent` | `text-ink-700` | idem — `accent` legado é o mesmo grafite |
| `text-critical` | `text-danger` | |
| `text-medium` | `text-warning` | |
| `text-success` | `text-sgo-success` | |
| `text-muted-foreground` | `text-ink-500` | maior volume (748 usos) |
| `text-foreground` | `text-ink-900` | |
| `text-primary` | `text-sgo-brand` | `--primary` do shadcn é o mesmo bordô |

## Fundo

| Classe legada | Vira |
|---|---|
| `bg-background` | `bg-sgo-surface` |
| `bg-card` | `bg-sgo-surface` |
| `bg-surface` | `bg-canvas` |
| `bg-muted` / `bg-secondary` | `bg-sunken` |
| `bg-primary` | `bg-sgo-brand` (texto `text-on-brand`) |
| `bg-critical` | `bg-danger` |
| `bg-medium` | `bg-warning` |
| `bg-success` | `bg-sgo-success` |
| `border-input` / `border-border` | `border-line-strong` / `border-line` |

## O que NÃO é 1:1

**`bg-surface` não vira `bg-sgo-surface`.** Os nomes colidem e significam
coisas opostas: `surface` legado é o cinza `#F5F5F5` (fundo de página), e
`--sgo-surface` é `#ffffff` (fundo de cartão). O equivalente do legado é
`--sgo-canvas` (`#f7f5f3`). Trocar pelo nome parecido inverteria a hierarquia
de profundidade da tela inteira.

**`accent` não tem par direto.** No legado ele acumulava dois papéis: cor de
destaque (links, ícones) e grafite de texto secundário. No DS o destaque é a
marca e o texto secundário é tinta. Cada uso precisa ser lido antes de trocar —
é o único item da lista que não dá para automatizar.

**Fundos com texto branco por cima.** `bg-critical text-white` e afins precisam
virar `bg-danger text-on-brand` (ou manter branco, se passar). Conferir com o
auditor, não presumir.

## Ajustes feitos nos tokens do DS

Antes de migrar, o auditor reprovou a própria base:

- `ink-500` `#5e5751` → `#524c46` (claro) e `#b5ada7` → `#b8b0ab` (escuro):
  passava só sobre branco (7,10) e reprovava sobre canvas (6,53) e sunken (5,88).
- `ink-400`: virou token **não-textual** (ícone, desabilitado, decoração). Não
  tem valor que sirva — a 7:1 ele vira o `ink-500`.
- `success` `#0a5c34` → `#0a5832`, `warning` `#7a4200` → `#753f00`,
  `danger` `#a31515` → `#991414`: passavam sobre a tinta própria e sobre branco,
  mas caíam para 6,50–6,71 sobre `sunken`.

## Sequência

Telas de maior tráfego primeiro (Tarefas, Dashboard, Pagamentos, Notas), um
commit por tela, auditor entre cada uma. Só depois de tudo migrado é que a
paleta legada sai do `tailwind.config.ts`, o prefixo `sgo-` cai e o padrão do
tema volta a ser `system`.
