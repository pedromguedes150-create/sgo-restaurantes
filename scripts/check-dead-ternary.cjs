#!/usr/bin/env node
/**
 * Ternário morto: os dois lados produzem a MESMA classe de cor.
 * Sobra do colapso accent→brand da Onda 7. Não quebra build, tipo nem lint —
 * a distinção visual morre em silêncio (ex.: FERIAS vs resto, futuro vs passado).
 */
const fs = require('fs');
const path = require('path');

const arquivos = [];
(function varrer(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) varrer(p);
    else if (/\.tsx$/.test(e.name)) arquivos.push(p);
  }
})('src');

const COR = /(?:text|bg|border|ring|fill|stroke)-[a-z][a-z0-9-]*/;
// ? 'algo' : 'algo'  — aspas simples ou duplas, em qualquer ordem
const TERNARIO = /\?\s*(['"])((?:(?!\1).)*)\1\s*:\s*(['"])((?:(?!\3).)*)\3/g;

let achados = 0;
for (const arquivo of arquivos) {
  const linhas = fs.readFileSync(arquivo, 'utf8').split('\n');
  linhas.forEach((linha, i) => {
    TERNARIO.lastIndex = 0;
    let m;
    while ((m = TERNARIO.exec(linha))) {
      const a = m[2].trim();
      const b = m[4].trim();
      if (a !== b || !COR.test(a)) continue;
      achados++;
      console.log(`${arquivo.replace(/\\/g, '/')}:${i + 1}\n    ${a}`);
    }
  });
}

console.log(
  achados === 0
    ? `\n✓ Ternários: nenhum com os dois lados iguais (${arquivos.length} .tsx varridos).`
    : `\n✗ ${achados} ternário(s) morto(s).`,
);
process.exit(achados === 0 ? 0 : 1);
