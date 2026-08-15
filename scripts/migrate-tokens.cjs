#!/usr/bin/env node
/**
 * Migração da paleta legada para os tokens do design system (Onda 7).
 * Mapa e justificativas em docs/redesign-mapa-tokens.md.
 *
 * Uso:  node scripts/migrate-tokens.cjs <caminho> [--dry]
 *
 * Só troca o que é 1:1 e seguro. `accent` fica DE FORA de propósito: no legado
 * ele acumulava destaque interativo e grafite de texto secundário, e a escolha
 * depende de ler cada uso. O script avisa quantos sobraram.
 */
const fs = require('fs');
const path = require('path');

/** Ordem importa: o mais específico primeiro (`-foreground` antes da raiz). */
const MAPA = [
  // Texto sobre preenchimento colorido — no escuro os preenchimentos clareiam
  // e `on-brand` acompanha (vira tinta escura), então serve para todos.
  ['text-primary-foreground', 'text-on-brand'],
  ['text-secondary-foreground', 'text-sgo-brand'],
  ['text-destructive-foreground', 'text-on-brand'],
  ['text-accent-foreground', 'text-on-brand'],
  ['text-card-foreground', 'text-ink-900'],
  ['text-muted-foreground', 'text-ink-500'],

  ['text-brand-light', 'text-sgo-brand-hover'],
  ['text-brand-dark', 'text-sgo-brand'],
  ['text-gold-light', 'text-ink-500'],
  ['text-gold-dark', 'text-ink-900'],
  ['text-brand', 'text-sgo-brand'],
  ['text-gold', 'text-ink-700'],
  ['text-critical', 'text-danger'],
  ['text-medium', 'text-warning'],
  ['text-success', 'text-sgo-success'],
  ['text-foreground', 'text-ink-900'],
  ['text-primary', 'text-sgo-brand'],
  ['text-destructive', 'text-danger'],

  // ATENÇÃO: bg-surface NÃO é bg-sgo-surface. Ver o mapa — os nomes colidem e
  // significam o oposto (página × cartão).
  ['bg-surface', 'bg-canvas'],
  ['bg-background', 'bg-sgo-surface'],
  ['bg-card', 'bg-sgo-surface'],
  ['bg-muted', 'bg-sunken'],
  ['bg-secondary', 'bg-sunken'],
  ['bg-brand-light', 'bg-sgo-brand-hover'],
  ['bg-brand-dark', 'bg-sgo-brand'],
  ['bg-gold-light', 'bg-ink-500'],
  ['bg-gold-dark', 'bg-ink-900'],
  ['bg-brand', 'bg-sgo-brand'],
  ['bg-gold', 'bg-ink-700'],
  ['bg-critical', 'bg-danger'],
  ['bg-medium', 'bg-warning'],
  ['bg-success', 'bg-sgo-success'],
  ['bg-primary', 'bg-sgo-brand'],
  ['bg-destructive', 'bg-danger'],

  ['border-input', 'border-line-strong'],
  ['border-border', 'border-line'],
  ['border-brand', 'border-sgo-brand'],
  ['border-critical', 'border-danger'],
  ['border-medium', 'border-warning'],
  ['border-success', 'border-sgo-success'],
  ['border-primary', 'border-sgo-brand'],
  ['border-destructive', 'border-danger'],

  ['ring-ring', 'ring-sgo-brand'],
  ['ring-medium', 'ring-warning'],
  ['ring-critical', 'ring-danger'],
  ['ring-brand', 'ring-sgo-brand'],

  ['divide-border', 'divide-line'],
  ['placeholder-muted-foreground', 'placeholder-ink-500'],
];

/**
 * Casa a classe inteira, deixando passar prefixos de variante (`hover:`,
 * `sm:`, `group-hover:`) e o sufixo de opacidade (`/10`). O lookahead impede
 * que `text-brand` case dentro de `text-brand-light`.
 */
const regexDe = (cls) => new RegExp(`(?<![\\w-])${cls}(?![\\w-])`, 'g');

const alvo = process.argv[2];
const dry = process.argv.includes('--dry');
if (!alvo) {
  console.error('uso: node scripts/migrate-tokens.cjs <arquivo|pasta> [--dry]');
  process.exit(1);
}

function arquivos(p) {
  const st = fs.statSync(p);
  if (st.isFile()) return /\.tsx?$/.test(p) ? [p] : [];
  return fs.readdirSync(p, { withFileTypes: true }).flatMap((e) =>
    arquivos(path.join(p, e.name)),
  );
}

let trocas = 0;
const tocados = [];
for (const f of arquivos(alvo)) {
  const antes = fs.readFileSync(f, 'utf8');
  let depois = antes;
  for (const [de, para] of MAPA) depois = depois.replace(regexDe(de), para);
  if (depois !== antes) {
    const n = antes.split('\n').filter((l, i) => l !== depois.split('\n')[i]).length;
    trocas += n;
    tocados.push(`${n.toString().padStart(3)} ${f}`);
    if (!dry) fs.writeFileSync(f, depois);
  }
}

const sobrouAccent = arquivos(alvo).reduce((acc, f) => {
  const m = fs.readFileSync(f, 'utf8').match(/(?<![\w-])(?:text|bg|border|ring)-accent(?![\w-])/g);
  return acc + (m ? m.length : 0);
}, 0);

console.log(`${dry ? '[simulação] ' : ''}${trocas} linha(s) em ${tocados.length} arquivo(s)`);
for (const t of tocados) console.log('  ' + t);
if (sobrouAccent) console.log(`\n⚠ ${sobrouAccent} uso(s) de \`accent\` — decidir a mão (ver o mapa).`);
