#!/usr/bin/env node
/**
 * Componente cliente NÃO pode alcançar módulo de servidor.
 *
 * O que aconteceu (07/09, v1.77.0): a tela da Escala de gerentes importava duas
 * constantes de texto de um módulo que também fala com o `prisma` e com as
 * notificações. Isso arrasta o módulo inteiro para o bundle do navegador, e o
 * `next build` morre em `Can't resolve 'net'` (via web-push → https-proxy-agent).
 *
 * `tsc`, `eslint` e os testes de render passam sem piscar — nenhum deles empacota
 * nada. O erro só aparece no build de produção, ou seja: depois do merge, na
 * esteira de publicação. Este script é o que faltava para pegar antes.
 *
 * Como funciona: a partir de cada arquivo com `'use client'`, segue os imports
 * de VALOR (`import type` é apagado na compilação e não conta) pelos aliases
 * `@/...` e reclama se o caminho chegar a um módulo proibido. O relatório mostra
 * a CADEIA inteira — sem ela, "não pode importar prisma" num arquivo que não
 * importa prisma é um enigma.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');

/** Módulos que não existem no navegador. */
const PROIBIDOS = [
  '@/lib/db/prisma',
  '@prisma/client',
  'web-push',
  'bcryptjs',
  'bcrypt',
  'nodemailer',
  'node:fs',
  'node:net',
  'node:tls',
  'fs',
  'net',
  'tls',
];

/**
 * `import type` / `export type` somem na compilação: contar como aresta daria
 * alarme falso em quase toda tela, porque tipo compartilhado é justamente o que
 * a tela deve importar do servidor.
 */
const IMPORT_RE = /(?:^|\n)\s*(?:import|export)\s+(?!type\s)([\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g;
const BARE_IMPORT_RE = /(?:^|\n)\s*import\s+['"]([^'"]+)['"]/g;

function lerImports(arquivo) {
  const src = fs.readFileSync(arquivo, 'utf8');
  const out = [];
  let m;
  IMPORT_RE.lastIndex = 0;
  while ((m = IMPORT_RE.exec(src))) {
    /* `import { type A, foo }` continua sendo aresta por causa do `foo`;
       `import { type A }` não. */
    const clausula = m[1];
    const so = clausula.replace(/[{}]/g, '').split(',').map((x) => x.trim()).filter(Boolean);
    const temValor = so.length === 0 || so.some((x) => !x.startsWith('type '));
    if (temValor) out.push(m[2]);
  }
  BARE_IMPORT_RE.lastIndex = 0;
  while ((m = BARE_IMPORT_RE.exec(src))) out.push(m[1]);
  return out;
}

/** `@/x/y` → caminho real do arquivo, ou null se não for do projeto. */
function resolver(spec) {
  if (!spec.startsWith('@/')) return null;
  const base = path.join(SRC, spec.slice(2));
  for (const tent of [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts'), path.join(base, 'index.tsx')]) {
    if (fs.existsSync(tent) && fs.statSync(tent).isFile()) return tent;
  }
  return null;
}

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}

const rel = (p) => path.relative(ROOT, p).replace(/\\/g, '/');

/** Primeira cadeia que sai do arquivo e chega num módulo proibido. */
function cadeiaProibida(entrada) {
  const vistos = new Set();
  const fila = [[entrada]];
  while (fila.length > 0) {
    const cadeia = fila.shift();
    const atual = cadeia[cadeia.length - 1];
    if (vistos.has(atual)) continue;
    vistos.add(atual);
    for (const spec of lerImports(atual)) {
      const proibido = PROIBIDOS.find((p) => spec === p || spec.startsWith(`${p}/`));
      if (proibido) return { cadeia, spec: proibido };
      const alvo = resolver(spec);
      if (alvo && !vistos.has(alvo)) fila.push([...cadeia, alvo]);
    }
  }
  return null;
}

const arquivos = walk(SRC);
const clientes = arquivos.filter((f) => /^\s*['"]use client['"]/.test(fs.readFileSync(f, 'utf8')));

const violacoes = [];
for (const c of clientes) {
  const achado = cadeiaProibida(c);
  if (achado) violacoes.push({ arquivo: c, ...achado });
}

if (violacoes.length > 0) {
  console.error(`\n✗ Cliente alcançando servidor — ${violacoes.length} caso(s):\n`);
  for (const v of violacoes) {
    console.error(`  ${rel(v.arquivo)}  →  ${v.spec}`);
    console.error(`     ${v.cadeia.map(rel).join('\n       → ')}\n`);
  }
  console.error('Isso quebra o `next build` (ex.: "Can\'t resolve \'net\'"), e só lá.');
  console.error('Conserte movendo o que a tela usa para um módulo sem import de servidor,');
  console.error('ou troque por `import type` se for só tipo.\n');
  process.exit(1);
}

console.log(`✓ Cliente × servidor: ${clientes.length} componente(s) cliente sem alcançar módulo de servidor.`);
