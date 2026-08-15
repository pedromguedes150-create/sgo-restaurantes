#!/usr/bin/env node
/**
 * Detector de COLAPSO de cor (Onda 7) — comparação com a onda anterior.
 *
 * A migração juntou nomes que eram cores DIFERENTES no mesmo destino
 * (`accent` e `brand` viraram `brand`; `critical` e `destructive` viraram
 * `danger`). Onde os dois conviviam na mesma linha carregando significados
 * distintos, a distinção morreu em silêncio:
 *   · `l.kind === 'FERIAS' ? 'text-accent' : 'text-brand'` virou um ternário
 *     com os dois lados iguais;
 *   · o quadrado "BF" do login (bg-accent) sumiu dentro do bg-brand.
 * Nenhum desses casos quebra build, tipo, lint ou auditoria de contraste.
 *
 * Uso: node scripts/check-color-collapse.cjs [ref-anterior]
 */
const { execSync } = require('child_process');

const REF = process.argv[2] || 'redesign/onda-6';

/** Nome antigo → destino na Onda 7. Só o que colapsou interessa. */
const DESTINO = {
  brand: 'brand', accent: 'brand', primary: 'brand', 'brand-dark': 'brand', 'brand-light': 'brand',
  gold: 'ink-700', 'gold-dark': 'ink-900', 'gold-light': 'ink-500',
  critical: 'danger', destructive: 'danger',
  medium: 'warning',
  'muted-foreground': 'ink-500', foreground: 'ink-900', 'card-foreground': 'ink-900',
  background: 'surface', card: 'surface', surface: 'canvas',
  muted: 'sunken', secondary: 'sunken',
};

const UTIL = /(?:text|bg|border|ring|fill|stroke)-([a-z][a-z0-9-]*)/g;

let arquivos;
try {
  arquivos = execSync(`git diff --name-only ${REF} -- "src/**/*.tsx"`, { encoding: 'utf8' })
    .trim().split('\n').filter(Boolean);
} catch (e) {
  console.error(`Não consegui comparar com "${REF}". Passe outra referência como argumento.`);
  process.exit(2);
}

const achados = [];
for (const arquivo of arquivos) {
  const caminho = arquivo.replace(/\\/g, '/');
  let antes;
  try {
    antes = execSync(`git show ${REF}:"${caminho}"`, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  } catch { continue; }

  antes.split('\n').forEach((linha, i) => {
    const nomes = [...linha.matchAll(UTIL)].map((m) => m[1]).filter((n) => DESTINO[n]);
    if (nomes.length < 2) return;
    const porDestino = new Map();
    for (const n of nomes) {
      if (!porDestino.has(DESTINO[n])) porDestino.set(DESTINO[n], new Set());
      porDestino.get(DESTINO[n]).add(n);
    }
    for (const [destino, origens] of porDestino) {
      if (origens.size < 2) continue;
      achados.push({ onde: `${caminho}:${i + 1}`, origens: [...origens], destino, linha: linha.trim().slice(0, 140) });
    }
  });
}

if (!achados.length) {
  console.log(`✓ Nenhum colapso de cor em relação a ${REF}.`);
  process.exit(0);
}

console.log(`\n⚠ ${achados.length} linha(s) onde cores distintas viraram a MESMA (vs ${REF}).`);
console.log('   Nem toda ocorrência é defeito: título + ícone na mesma cor é coerente.');
console.log('   O que precisa de olho é condicional e elemento sobre elemento.\n');
for (const a of achados) {
  console.log(`  ${a.onde}  [${a.origens.join(' + ')}] → ${a.destino}`);
  console.log(`     ${a.linha}`);
}
