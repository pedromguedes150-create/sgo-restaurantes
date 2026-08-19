#!/usr/bin/env node
/**
 * Portão: a escala tipográfica tem SEIS níveis e não pode voltar a inchar.
 *
 * O que este portão existe para impedir (medido em 18/08/2026, antes da
 * reforma de hierarquia): o sistema tinha 14 tamanhos de fonte diferentes,
 * 85% de todo o texto espremido em 12px e 14px, 693 trechos em negrito ou
 * mais pesado, e o título da página desenhado no MESMO 34px dos contadores —
 * o que punha quatro elementos no primeiro nível de Ocorrências e Comandas.
 *
 * Os seis níveis:
 *   34 título da tela · 24 número-destaque · 17 título de seção
 *   15 conteúdo       · 13 apoio           · 11 etiqueta (caixa alta)
 *
 * Regras verificadas aqui:
 *   1. `font-black` (peso 900) não existe — era o recurso de "gritar".
 *   2. `sgo-type-34` só no título da página; dado nunca usa o primeiro nível.
 *   3. Tamanho em pixel solto (`text-[NNpx]`) só até 11px, para micro-rótulo
 *      de impressão e chip. De 12 para cima, usa-se a escala.
 *   4. Caixa alta é exclusividade do nível 6 — quem escreve `uppercase` à mão
 *      recria a quinta grafia de etiqueta que foi unificada.
 *
 * As páginas /dev (galeria do design system) ficam de fora: o trabalho delas
 * é justamente mostrar todos os níveis, inclusive os que saíram das telas.
 */
const fs = require('fs');
const path = require('path');

const RAIZ = process.argv[2] || 'src';
/* Casa pelo NOME do arquivo, não pelo caminho: assim o portão funciona também
   quando rodado sobre outra raiz (é como eu testo que ele realmente falha). */
const TITULO_OFICIAL = 'page-chrome.tsx';
const PIXEL_LIVRE_ATE = 11;

const arquivos = [];
(function anda(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { if (!/node_modules|\.next/.test(p)) anda(p); }
    else if (e.name.endsWith('.tsx') && !p.includes(path.sep + 'dev' + path.sep)) arquivos.push(p);
  }
})(RAIZ);

const norm = (f) => f.split(path.sep).join('/');
const problemas = [];
const aponta = (f, i, msg, dica) =>
  problemas.push(`${norm(f)}:${i + 1}  ${msg}\n      → ${dica}`);

for (const f of arquivos) {
  const linhas = fs.readFileSync(f, 'utf8').split('\n');
  linhas.forEach((ln, i) => {
    if (/\bfont-black\b/.test(ln)) {
      aponta(f, i, 'peso 900 (font-black)', 'número de painel usa `sgo-type-24 font-semibold`; título usa `font-bold`.');
    }
    if (/\bsgo-type-34\b/.test(ln) && path.basename(f) !== TITULO_OFICIAL) {
      aponta(f, i, 'nível 1 (34px) fora do título da página', 'o primeiro nível é só o nome da tela — use `sgo-type-24` para o número.');
    }
    for (const m of ln.matchAll(/text-\[(\d+)px\]/g)) {
      const px = Number(m[1]);
      if (px > PIXEL_LIVRE_ATE) {
        aponta(f, i, `tamanho ${px}px em pixel solto`, 'use a escala: text-xs (13) · text-sm (15) · sgo-type-17 · sgo-type-24 · sgo-type-34.');
      }
    }
    if (/\buppercase\b/.test(ln) && !/\bsgo-type-11\b/.test(ln)) {
      aponta(f, i, 'caixa alta fora do nível 6', 'etiqueta é `sgo-type-11 font-semibold` — ela já traz a caixa alta e o espaçamento.');
    }
  });
}

if (problemas.length) {
  console.error('\n✗ Escala tipográfica:\n');
  for (const p of problemas) console.error('   ' + p + '\n');
  console.error(`   ${problemas.length} ponto(s) fora da escala de seis níveis.\n`);
  process.exit(1);
}
console.log(`✓ Escala tipográfica: ${arquivos.length} tela(s) nos seis níveis (34/24/17/15/13/11).`);
