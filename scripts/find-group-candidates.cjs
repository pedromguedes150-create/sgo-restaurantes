#!/usr/bin/env node
/**
 * Acha as pilhas de cartão que podem virar Group (Onda 8).
 *
 * O padrão migrável é específico: um contêiner `space-y-*` cujo conteúdo é um
 * `.map()` produzindo cartão PLANO (`rounded-lg border bg-surface p-*`). Só isso
 * é lista. Fica de fora:
 *  - cartão único com linhas dentro (é painel, não pilha);
 *  - cartão com borda de ESTADO (`border-2 border-danger/60`) — é destaque;
 *  - pilha de coisas heterogêneas (filtro + itens + rodapé).
 *
 * Uso: node scripts/find-group-candidates.cjs
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function arquivos(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? arquivos(p) : /\.tsx$/.test(e.name) ? [p] : [];
  });
}

const PILHA = /className="space-y-(?:1\.5|2|3)"/;
const CARTAO_PLANO = /rounded-lg border bg-surface p-[\d.]+/;
const JA_MIGRADO = /<Group>|<ListGroup>/;

const achados = [];
for (const abs of arquivos(path.join(ROOT, 'src/components'))) {
  const rel = path.relative(ROOT, abs).replace(/\\/g, '/');
  const texto = fs.readFileSync(abs, 'utf8');
  const linhas = texto.split('\n');
  const migrado = JA_MIGRADO.test(texto);

  for (let i = 0; i < linhas.length - 1; i++) {
    if (!PILHA.test(linhas[i])) continue;
    // O cartão pode estar 1 a 3 linhas abaixo (o map costuma vir no meio).
    const janela = linhas.slice(i + 1, i + 4).join(' ');
    if (!/\.map\(/.test(janela) || !CARTAO_PLANO.test(janela)) continue;
    achados.push({ onde: `${rel}:${i + 1}`, migrado });
  }
}

const pendentes = achados.filter((a) => !a.migrado);
console.log(`${achados.length} pilha(s) com o padrão migrável — ${pendentes.length} em arquivo ainda não tocado:\n`);
for (const a of achados) console.log(`  ${a.migrado ? '(arquivo já tem Group) ' : ''}${a.onde}`);
