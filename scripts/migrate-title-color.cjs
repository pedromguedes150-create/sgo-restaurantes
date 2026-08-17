#!/usr/bin/env node
/**
 * Título deixa de ser cor de marca e passa a ser tinta (Onda 8).
 *
 * O QUE ESTAVA ERRADO
 * Na Onda 7 eu mapeei `text-brand` para o token de marca sem olhar o PAPEL que
 * ele cumpria. No claro, o bordô escuro funcionava como cor de título e ninguém
 * notou. No escuro a marca vira rosa claro — e a tela passou a ter rosa em todo
 * título, todo nome de item, todo rótulo de seção. Lê como "rosa sobre preto".
 *
 * O MODELO DO iOS
 * Título e nome usam a cor de RÓTULO (quase preto no claro, quase branco no
 * escuro). A cor de destaque é reservada ao que é TOCÁVEL: link, botão, aba
 * ativa. É o que faz a interface parecer calma e o toque parecer óbvio.
 *
 * O QUE ELE NÃO TOCA
 *  - linha com <a>, <button>, <Link>, href ou onClick: ali a marca É a
 *    afordância de toque e tem que ficar;
 *  - `bg-brand` e `border-brand`: preenchimento e borda não são texto;
 *  - text-brand dentro de <b>/<strong> solto em frase — é ênfase, não título.
 *
 * Uso: node scripts/migrate-title-color.cjs [--dry]
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const dry = process.argv.includes('--dry');

function arquivos(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? arquivos(p) : /\.tsx$/.test(e.name) ? [p] : [];
  });
}

/** A linha é de algo tocável? Então a marca fica. */
const INTERATIVO = /<(?:a|button|Link|IconButton|Button)\b|href=|onClick=|role=["']button/;
/** Alvos: título e nome. `<b>`/`<strong>` ficam de fora (ênfase em frase). */
const ALVO = /<(?:h[1-3]|p|span|div|td|th)\b[^>]*\btext-brand\b/;

let trocas = 0;
const tocados = [];
const pulados = [];

for (const abs of [...arquivos(path.join(ROOT, 'src/app')), ...arquivos(path.join(ROOT, 'src/components'))]) {
  const rel = path.relative(ROOT, abs).replace(/\\/g, '/');
  const linhas = fs.readFileSync(abs, 'utf8').split('\n');
  let mudou = false;

  for (let i = 0; i < linhas.length; i++) {
    if (!/\btext-brand\b/.test(linhas[i])) continue;
    if (INTERATIVO.test(linhas[i])) { pulados.push(`${rel}:${i + 1}`); continue; }
    if (!ALVO.test(linhas[i])) { pulados.push(`${rel}:${i + 1}`); continue; }
    const antes = linhas[i];
    linhas[i] = linhas[i].replace(/\btext-brand\b/g, 'text-ink-900');
    if (linhas[i] !== antes) { trocas++; mudou = true; }
  }

  if (mudou) {
    tocados.push(rel);
    if (!dry) fs.writeFileSync(abs, linhas.join('\n'));
  }
}

console.log(`${dry ? '[simulação] ' : ''}${trocas} título(s)/nome(s) → text-ink-900, em ${tocados.length} arquivo(s).`);
console.log(`${pulados.length} uso(s) de text-brand mantido(s) — tocáveis ou ênfase em frase.`);
