/**
 * Monta src/styles/sgo-kit.css a partir do kit-layout-sgo.
 *
 * ESTRUTURA do kit, IDENTIDADE do Restaurante: todo azul de marca vira token
 * bordô (--sgo-brand*) e os neutros do kit viram os neutros do Restaurante.
 */
const fs = require('fs');
const path = require('path');

const KIT = process.argv[2];
const OUT = process.argv[3];
const ds = fs.readFileSync(path.join(KIT, '1-estilos/sgo-design-system.css'), 'utf8').split('\n');
const idx = fs.readFileSync(path.join(KIT, '1-estilos/index.css'), 'utf8').split('\n');

/* Seções do kit que NÃO entram (1-based, inclusivas): */
const cortes = [
  [457, 506],   // 11b ponte do DataTable dos postos
  [528, 545],   // 15 chips de bandeira de combustível
  /* 20a-ter: só as VARIANTES (?bg=a/b/c). O bloco html.dark que define o
     vidro escuro dos cartões (--sgo-card-glass*) e as regras do .sgo-ambient
     vêm logo depois, dentro da mesma seção, e FICAM — o corte até 1069 os
     levava junto: no tema escuro o painel era vidro branco com texto claro
     (achado na Fase 4, ao migrar o Dashboard). */
  [945, 1036],  // 20a-ter variantes temporárias do papel de parede
  [1282, 1609], // 21 tela de login dos postos
];
const fora = (n) => cortes.some(([a, b]) => n >= a && n <= b);
let linhas = ds.filter((_, i) => !fora(i + 1));

/* Bloco do dock de abas (index.css), sem o subnav legado. */
const dock = idx.slice(756 - 1, 1267); // linhas 756..1267

const TOKENS = {
  'bg': 'var(--sgo-canvas)',
  'panel': 'var(--sgo-surface)',
  'panel-2': 'var(--sgo-sunken)',
  'ink': 'var(--sgo-ink-900)',
  'ink-2': 'var(--sgo-ink-500)',
  'ink-3': 'var(--sgo-ink-400)',
  'accent': 'var(--sgo-brand)',
  'accent-soft': 'rgb(var(--sgo-brand-rgb) / 0.10)',
  'ok': 'var(--sgo-success)',
  'ok-soft': 'rgb(var(--sgo-success-rgb) / 0.10)',
  'warn': 'var(--sgo-warning)',
  'warn-soft': 'rgb(var(--sgo-warning-rgb) / 0.11)',
  'bad': 'var(--sgo-danger)',
  'bad-soft': 'rgb(var(--sgo-danger-rgb) / 0.09)',
  'hair': 'var(--sgo-line)',
  'hair-2': 'var(--sgo-line-strong)',
  'royal': 'var(--sgo-brand)',
  'royal-2': 'var(--sgo-brand-hover)',
  'navy': 'var(--sgo-brand-active)',
  'blue-500': 'var(--sgo-brand-hover)',
  'blue-600': 'var(--sgo-brand)',
  'blue-700': 'var(--sgo-brand-active)',
  'red-500': 'var(--sgo-danger)',
  'sky': 'var(--sgo-info)',
  'sky-soft': 'rgb(var(--sgo-info-rgb) / 0.11)',
  'plumage-a': 'var(--sgo-brand-hover)',
  'plumage-b': 'var(--sgo-brand)',
  'plumage-c': 'var(--sgo-ink-700)',
  'irid': 'linear-gradient(115deg, var(--sgo-brand-hover), var(--sgo-brand) 55%, var(--sgo-ink-700))',
  'wallpaper-mark': 'var(--sgo-brand)',
  'glass': null, // colide com o token do Restaurante — sai
  'font': null,  // idem: a fonte é a do Restaurante (Inter via next/font)
};

function mapearTokens(s) {
  return s.map((ln) => {
    const m = ln.match(/^(\s*)--sgo-([a-z0-9-]+)\s*:\s*(.+?);\s*(\/\*.*\*\/)?\s*$/);
    if (!m) return ln;
    const nome = m[2];
    if (!(nome in TOKENS)) return ln;
    const valor = TOKENS[nome];
    if (valor === null) return null;
    return `${m[1]}--sgo-${nome}: ${valor};`;
  }).filter((l) => l !== null);
}

/* Literais de azul espalhados pelo CSS (fora das declarações de token). */
const LITERAIS = [
  [/#0A4DA8/gi, 'var(--sgo-brand)'],
  [/#1159BD/gi, 'var(--sgo-brand-hover)'],
  [/#003068/gi, 'var(--sgo-brand-active)'],
  [/#2E7CD6/gi, 'var(--sgo-brand-hover)'],
  [/#1B5FA8/gi, 'var(--sgo-brand)'],
  [/#144B86/gi, 'var(--sgo-brand-active)'],
  [/#5B9BF0/gi, 'var(--sgo-brand)'],
  [/#7FB3F5/gi, 'var(--sgo-brand-hover)'],
  [/#3D7FE0/gi, 'var(--sgo-brand)'],
  [/#2B66C6/gi, 'var(--sgo-brand-active)'],
  [/#0B3B8C/gi, 'var(--sgo-brand)'],
  [/#93C5FD/gi, 'var(--sgo-brand)'],
  [/#0f4c81/gi, 'var(--sgo-brand)'],
  [/#78B0D0/gi, 'var(--sgo-brand-hover)'],
  [/#6888B8/gi, 'var(--sgo-brand)'],
  [/#5B55A4/gi, 'var(--sgo-ink-700)'],
  [/#3E7DB8/gi, 'var(--sgo-brand-hover)'],
  [/#5F7EC0/gi, 'var(--sgo-brand)'],
  [/#2a72df/gi, 'var(--sgo-brand)'],
  [/#40cefe/gi, 'var(--sgo-brand-hover)'],
  // neutros frios do kit → neutros do Restaurante
  [/#3F4A5C/gi, 'var(--sgo-ink-700)'],
  [/#404852/gi, 'var(--sgo-ink-500)'],
  [/#0F172A/gi, 'var(--sgo-ink-900)'],
  [/#111114/gi, 'var(--sgo-ink-900)'],
  [/#6E6E76/gi, 'var(--sgo-ink-500)'],
  [/#9C9CA4/gi, 'var(--sgo-ink-400)'],
  [/#F2F2F5/gi, 'var(--sgo-ink-900)'],
  [/#CBD5E1/gi, 'var(--sgo-ink-700)'],
  [/#94a3b8/gi, 'var(--sgo-ink-400)'],
  [/#64748B/gi, 'var(--sgo-ink-400)'],
  [/#475569/gi, 'var(--sgo-ink-700)'],
  [/#697586/gi, 'var(--sgo-ink-500)'],
  // rgba azuis → tinta da marca com a mesma opacidade
  [/rgba\((?:10,77,168|46,124,214|27,95,168|91,155,240|15,76,129|37,99,170|11,59,140|91,85,164|127,168,224|157,188,232),\s*(\.?\d*\.?\d+)\)/g, (_, a) => `rgb(var(--sgo-brand-rgb) / ${a})`],
  // vidros ESCUROS do kit (azul-marinho quase preto) → superfície do tema, mesma opacidade
  [/rgba\((?:20,32,54|16,22,34|32,36,46|38,43,55|18,28,48|26,36,54|20,24,32),\s*(\.?\d*\.?\d+)\)/g, (_, a) => `rgb(var(--sgo-surface-rgb) / ${a})`],
  // sombras e insets azulados de baixa opacidade → tinta escura do tema
  [/rgba\((?:20,40,80|16,24,40|15,23,42),\s*(\.?\d*\.?\d+)\)/g, (_, a) => `rgb(var(--sgo-ink-900-rgb) / ${a})`],
  // vidro escuro do kit (azul-marinho) → superfície do tema
  [/rgba\((?:30,41,59),\s*(\.?\d*\.?\d+)\)/g, (_, a) => `rgb(var(--sgo-surface-rgb) / ${a})`],
  [/rgba\((?:226,232,240),\s*(\.?\d*\.?\d+)\)/g, (_, a) => `rgb(var(--sgo-sunken-rgb) / ${a})`],
  [/rgba\((?:148,163,184),\s*(\.?\d*\.?\d+)\)/g, (_, a) => `rgb(var(--sgo-ink-400-rgb) / ${a})`],
  // papel de parede claro/escuro: a geometria é do kit, a tinta é bordô
  [/linear-gradient\(175deg,#BFD4F0 0%,#D6E3F6 52%,#E8EFF9 100%\)/g, 'linear-gradient(175deg, rgb(var(--sgo-brand-rgb) / 0.14) 0%, rgb(var(--sgo-brand-rgb) / 0.07) 52%, rgb(var(--sgo-brand-rgb) / 0.03) 100%)'],
  [/#CFDEF3/gi, 'var(--sgo-canvas)'],
  [/linear-gradient\(175deg,#0B1728 0%,#101F38 100%\)/g, 'linear-gradient(175deg, rgb(var(--sgo-brand-rgb) / 0.10) 0%, rgb(var(--sgo-brand-rgb) / 0.03) 100%)'],
  [/#0D1B2E/gi, 'var(--sgo-canvas)'],
  [/#F3F6FA|#EDF1F6|#E9EDF3|#14161B|#111319|#0D0F14/gi, 'var(--sgo-canvas)'],
  // brancos de vidro e texto sobre cor cheia
  [/#FFFFFF/gi, 'var(--sgo-surface)'],
  [/#fff\b/g, 'var(--sgo-surface)'],
  [/#F7F7FA/gi, 'var(--sgo-sunken)'],
  [/#F3F4F8/gi, 'var(--sgo-canvas)'],
];

function mapearLiterais(texto) {
  /* index.css escreve `rgba(20, 32, 54, 0.55)` com espaços; o DS, sem. Normaliza
     antes de casar, para o mesmo azul não escapar por causa de um espaço. */
  let t = texto.replace(/rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*/g, 'rgba($1,$2,$3,');
  for (const [re, sub] of LITERAIS) t = t.replace(re, sub);
  return t;
}

let corpo = mapearTokens(linhas).join('\n');
corpo = mapearLiterais(corpo);
let dockCss = mapearLiterais(dock.join('\n'));
/* O dock usa `.dark` (index.css) e o kit `html.dark`: os dois valem com a classe no <html>. */

const cabecalho = `/* =============================================================================
   SGO — KIT DE LAYOUT (estrutura do SGO dos Postos, identidade do Restaurante)
   Gerado de kit-layout-sgo/1-estilos por scripts/build-kit-css.cjs — NÃO edite
   à mão o miolo; mude o script e gere de novo.

   O que é do KIT: classes .sgo-* (navbar, trilho, cabeçalho, KPI, painel,
   tabela, selo, botão, campo, modal, drawer, chip, vidro, fundo), dimensões,
   raios, sombras, grades, breakpoints, tema escuro (html.dark).
   O que é do RESTAURANTE: toda cor. Os tokens de marca do kit (--sgo-royal,
   --sgo-accent, --sgo-blue-*) apontam para --sgo-brand*; os neutros
   (--sgo-ink*, --sgo-panel*, --sgo-bg, --sgo-hair*) apontam para os tokens
   do sgo-design-system.css, que já mudam por tema. Por isso os blocos
   html.dark do kit continuam, mas só carregam o que é de VIDRO/moldura.

   Carregado DEPOIS de sgo-design-system.css (os tokens de lá precisam existir).
   ========================================================================== */

/* Tokens que o kit lê e o Restaurante ainda não tinha. */
:root {
  --sgo-font-mono: var(--font-roboto-mono), ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  --sgo-on-strong: var(--sgo-on-brand);
}
`;

const rodape = `
/* ---------- IMPRESSÃO (do Restaurante) ----------
   O kit não tem @media print. Na folha impressa não há fundo contínuo, barra
   flutuante nem dock de abas; os vidros viram superfície opaca. */
@media print {
  .sgo-ambient, .sgo-navbar, .workspace-dock, .workspace-mobile-fab, .workspace-sheet, .workspace-sheet-backdrop { display: none !important; }
  .sgo-panel, .sgo-kpi, .sgo-glass, .sgo-phdr__tabs, .sgo-trilho { background: var(--sgo-surface) !important; backdrop-filter: none !important; box-shadow: none !important; }
  .sgo-shell__main { padding-top: 0 !important; }
  body { background: var(--sgo-surface) !important; }
}
`;

fs.writeFileSync(OUT, cabecalho + corpo + '\n\n/* ---------- 25. DOCK DE ABAS DE TRABALHO (WorkspaceTabs) — index.css do kit ---------- */\n' + dockCss + '\n' + rodape);

/* Relatório: o que sobrou de hex. */
const sobras = {};
for (const m of (cabecalho + corpo + dockCss).matchAll(/#[0-9A-Fa-f]{3,8}\b/g)) sobras[m[0].toUpperCase()] = (sobras[m[0].toUpperCase()] || 0) + 1;
console.log('hex restantes:', JSON.stringify(sobras));
console.log('linhas:', (cabecalho + corpo + dockCss + rodape).split('\n').length);
