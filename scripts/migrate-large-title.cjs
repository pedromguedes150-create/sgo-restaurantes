#!/usr/bin/env node
/**
 * Migra os <h1> escritos à mão para o LargeTitle do design system (Onda 8).
 *
 * POR QUE
 * O título grande que encolhe ao rolar é a assinatura visual mais reconhecível
 * do iOS, e o mecanismo já existe aqui desde a Onda 1 (PageChromeProvider +
 * LargeTitle). Só que 11 telas o usam e 71 têm <h1> próprio — ou seja, 87% do
 * sistema não tem o comportamento.
 *
 * O ÍCONE SAI
 * O padrão dominante é `<h1><Icon /> Título</h1>`. Título grande do iOS é
 * texto puro; o ícone vive na barra de navegação ou na linha da lista, não no
 * título. Quem quiser manter o ícone numa tela específica, faz à mão depois.
 *
 * O QUE ELE NÃO FAZ
 * Título com interpolação (`{unit.name}`) é pulado e listado: virar atributo
 * exige julgar cada caso, e o script não adivinha.
 *
 * Uso: node scripts/migrate-large-title.cjs [--dry]
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const dry = process.argv.includes('--dry');

function arquivos(p) {
  const st = fs.statSync(p);
  if (st.isFile()) return /\.tsx$/.test(p) ? [p] : [];
  return fs.readdirSync(p, { withFileTypes: true }).flatMap((e) => arquivos(path.join(p, e.name)));
}

/** `<h1 …>…</h1>` numa linha só — é como o projeto inteiro escreve. */
const H1 = /^(\s*)<h1 className="([^"]*)">([\s\S]*?)<\/h1>\s*$/;
/** Ícone lucide dentro do título: `<Nome className="…" />`. */
const ICONE = /<[A-Z][\w]*\s+className="[^"]*"\s*\/>/g;
/** Subtítulo logo abaixo, o `<p>` cinza. */
const SUB = /^\s*<p className="text-sm text-ink-500">([^<{]*)<\/p>\s*$/;

const escapa = (s) => s.replace(/"/g, '&quot;');

const migrados = [];
const pulados = [];

/**
 * Fora do alcance:
 *  - `relatorio/` e `imprimir/`: são folhas de papel. Título que encolhe ao
 *    rolar não significa nada impresso, e o escopo .sgo-print já as tira do tema.
 *  - fora de `(app)`: as telas públicas (ficha por link, higiene por QR, login)
 *    não têm o PageChromeProvider. O contexto tem padrão seguro e não quebraria,
 *    mas o título ficaria registrado num cabeçalho que não existe ali.
 */
const FORA = /\/(relatorio|imprimir)\/|src\/app\/(?!\(app\))/;

for (const abs of arquivos(path.join(ROOT, 'src/app'))) {
  const rel = path.relative(ROOT, abs).replace(/\\/g, '/');
  if (FORA.test(rel)) continue;
  const linhas = fs.readFileSync(abs, 'utf8').split('\n');
  let mudou = false;

  for (let i = 0; i < linhas.length; i++) {
    const m = linhas[i].match(H1);
    if (!m) continue;
    const [, indent, , miolo] = m;

    const texto = miolo.replace(ICONE, '').replace(/\s+/g, ' ').trim();
    if (!texto || /[{}]/.test(texto)) {
      pulados.push(`${rel}:${i + 1}  ${texto.slice(0, 60) || '(vazio)'}`);
      continue;
    }

    // Subtítulo na linha seguinte vira prop; a linha some.
    const sub = (linhas[i + 1] || '').match(SUB);
    const props = sub
      ? `title="${escapa(texto)}" subtitle="${escapa(sub[1].trim())}"`
      : `title="${escapa(texto)}"`;

    linhas[i] = `${indent}<LargeTitle ${props} />`;
    if (sub) linhas.splice(i + 1, 1);
    mudou = true;
    migrados.push(`${rel}  ${texto.slice(0, 50)}`);
  }

  if (!mudou) continue;

  // Import, se ainda não houver.
  let texto = linhas.join('\n');
  if (!/from '@\/components\/layout\/page-chrome'/.test(texto)) {
    const ultimoImport = linhas.reduce((acc, l, i) => (/^import /.test(l) ? i : acc), -1);
    linhas.splice(ultimoImport + 1, 0, "import { LargeTitle } from '@/components/layout/page-chrome';");
    texto = linhas.join('\n');
  }
  if (!dry) fs.writeFileSync(abs, texto);
}

console.log(`${dry ? '[simulação] ' : ''}${migrados.length} título(s) migrado(s):`);
for (const m of migrados.slice(0, 12)) console.log('  ' + m);
if (migrados.length > 12) console.log(`  … e mais ${migrados.length - 12}`);
if (pulados.length) {
  console.log(`\n⚠ ${pulados.length} pulado(s) — têm interpolação, decidir à mão:`);
  for (const p of pulados.slice(0, 10)) console.log('  ' + p);
}
