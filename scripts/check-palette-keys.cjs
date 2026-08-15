#!/usr/bin/env node
/**
 * Portão de PALETA (Onda 7). Confere se toda classe de cor usada em src/ aponta
 * para uma chave que existe de verdade no tailwind.config.
 *
 * Por que existe: ao remover a paleta legada, classes órfãs (`text-secondary`,
 * `border-muted`, `accent-accent`) não quebram o build nem o lint — o Tailwind
 * simplesmente não gera a regra, e o elemento cai no valor herdado. O anel de
 * progresso ficou com o trilho pintado da cor do texto por causa disso, e nada
 * acusou.
 *
 * O check-ds-tokens.cjs vizinho cuida de hex e grade de 8pt; este cuida de nome
 * de cor inexistente.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

/** Lê as chaves de cor declaradas em theme.extend.colors. */
function chavesDaPaleta() {
  const cfg = fs.readFileSync(path.join(ROOT, 'tailwind.config.ts'), 'utf8');
  const ini = cfg.indexOf('colors: {');
  const fim = cfg.indexOf('borderRadius:');
  const bloco = cfg.slice(ini, fim);
  const chaves = new Set(['transparent', 'current', 'inherit', 'white', 'black']);
  let atual = null;
  for (const linha of bloco.split('\n')) {
    const raiz = linha.match(/^\s{8}'?([a-z0-9-]+)'?:\s*(\{|'|\d)/);
    if (raiz) { atual = raiz[1]; chaves.add(atual); continue; }
    const filho = linha.match(/^\s{10}'?([A-Za-z0-9-]+)'?:\s*'/);
    if (filho && atual) chaves.add(filho[1] === 'DEFAULT' ? atual : `${atual}-${filho[1]}`);
  }
  // boxShadow tem espaço de nomes próprio, mas o utilitário também é `shadow-`.
  for (const m of cfg.matchAll(/^\s{8}'?([a-z0-9-]+)'?:\s*'var\(--sgo-[a-z-]*(?:focus|shadow)/gm)) chaves.add(m[1]);
  return chaves;
}

/** Sufixos desses utilitários que NÃO são cor (text-sm, border-2, ring-offset…). */
const NAO_COR = new Set([
  'xs', 'sm', 'base', 'lg', 'xl', '2xl', '3xl', '4xl', '5xl', '6xl', '7xl',
  'left', 'right', 'center', 'justify', 'start', 'end', 'wrap', 'nowrap',
  'balance', 'pretty', 'ellipsis', 'clip', 'top', 'bottom', 'x', 'y',
  'none', 'solid', 'dashed', 'dotted', 'double', 'hidden', 'collapse',
  'separate', 'auto', 'px', 'full', 't', 'b', 'l', 'r', 's', 'e',
  'opacity', 'inner', 'md', 'offset', 'underline', 'overline', 'through', 'no',
  'reverse', 'dotted', 'wavy', 'clone', 'slice',
]);

const UTIL = /(?<![\w-])(?:[a-z-]+:)*(text|bg|border|ring|fill|stroke|divide|from|to|via|placeholder|outline|accent|caret|decoration|shadow)-([a-z][a-z0-9-]*)(?:\/\d+)?(?![\w-])/g;

/** `border-t-2`, `ring-offset-2`, `ring-inset`: forma/medida, não cor. */
const MODIFICADOR = /^(?:[tblrxyse]-\d|offset-\d+$|inset$)/;

/** `ring-offset-<cor>` é utilitário de COR (ringOffsetColor) — tira o prefixo. */
const semOffset = (nome) => nome.replace(/^offset-/, '');

/** Comentário, inclusive o do JSX: citar uma classe ali é só texto, não uso. */
const eComentario = (linha) => /^\s*(?:\{?\/[/*]|\*)/.test(linha);

function arquivos(p) {
  const st = fs.statSync(p);
  if (st.isFile()) return /\.tsx?$/.test(p) ? [p] : [];
  return fs.readdirSync(p, { withFileTypes: true }).flatMap((e) => arquivos(path.join(p, e.name)));
}

const chaves = chavesDaPaleta();
const orfas = new Map();

for (const f of arquivos(path.join(ROOT, 'src'))) {
  const rel = path.relative(ROOT, f).replace(/\\/g, '/');
  const texto = fs.readFileSync(f, 'utf8');
  const linhas = texto.split('\n');
  linhas.forEach((linha, i) => {
    if (eComentario(linha)) return;
    UTIL.lastIndex = 0;
    let m;
    while ((m = UTIL.exec(linha))) {
      const [, util] = m;
      const nome = semOffset(m[2]);
      if (NAO_COR.has(nome) || /^\d/.test(nome) || chaves.has(nome)) continue;
      if (MODIFICADOR.test(nome)) continue;
      const chave = `${util}-${nome}`;
      if (!orfas.has(chave)) orfas.set(chave, []);
      orfas.get(chave).push(`${rel}:${i + 1}`);
    }
  });
}

if (orfas.size) {
  console.error(`\n✗ Paleta — ${orfas.size} classe(s) apontando para cor que não existe:\n`);
  for (const [chave, onde] of [...orfas].sort((a, b) => b[1].length - a[1].length)) {
    console.error(`  ${chave}  (${onde.length}×)  ${onde.slice(0, 3).join(', ')}`);
  }
  console.error('\nO Tailwind não gera regra para isso: o elemento cai no valor herdado, sem erro.\n');
  process.exit(1);
}
console.log(`✓ Paleta: toda classe de cor aponta para uma das ${chaves.size} chaves declaradas.`);
