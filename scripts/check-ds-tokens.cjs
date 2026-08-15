#!/usr/bin/env node
/**
 * Guard de tokens em JSX (Onda 0+). O stylelint não enxerga classes do Tailwind
 * (ex.: `bg-[#fff]`) nem `style={{}}` inline, então esta camada varre os .ts/.tsx
 * do escopo ativo e falha o build em:
 *   1) hex literal de cor  — deve vir de var(--sgo-*) / classe de token;
 *   2) espaçamento arbitrário fora da grade 8pt — ex.: p-[7px], gap-[12px]
 *      (permitidos: múltiplos de 8 e a meia-parada 4).
 * Escopo em scripts/ds-scope.cjs — cresce por onda.
 */
const fs = require('fs');
const path = require('path');
const { TSX_SCOPE_DIRS, TOKENS_FILE, ALLOW_MARK } = require('./ds-scope.cjs');

const ROOT = path.resolve(__dirname, '..');
const HEX = /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/;
const SPACE_PROPS =
  'p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|gap|gap-x|gap-y|space-x|space-y|inset|inset-x|inset-y|top|right|bottom|left|w|h|min-w|min-h|max-w|max-h';
const SPACE_ARB = new RegExp(`\\b(?:${SPACE_PROPS})-\\[(\\d+)px\\]`, 'g');

function walk(dir) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return [];
  const out = [];
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = path.join(dir, entry.name).replace(/\\/g, '/');
    if (entry.isDirectory()) out.push(...walk(rel));
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(rel);
  }
  return out;
}

const files = [...new Set(TSX_SCOPE_DIRS.flatMap(walk))].filter((f) => f !== TOKENS_FILE);

/**
 * Dispensa por LINHA, não por arquivo: a linha traz `ds-allow-hex: <motivo>`.
 * Isentar o arquivo inteiro (como era até a Onda 6) deixava o resto dele sem
 * proteção nenhuma — bastava alguém acrescentar um hex ali embaixo. Aqui a
 * dispensa fica visível no ponto de uso e o motivo é obrigatório: sem texto
 * depois dos dois-pontos, a linha continua sendo violação.
 */
const ALLOW_RE = new RegExp(ALLOW_MARK + ':\\s*\\S');
const allowed = (line) => ALLOW_RE.test(line);

const violations = [];
for (const file of files) {
  const lines = fs.readFileSync(path.join(ROOT, file), 'utf8').split('\n');
  lines.forEach((line, i) => {
    const hex = line.match(HEX);
    if (hex && !allowed(line))
      violations.push({ file, line: i + 1, msg: `hex literal ${hex[0]} — use var(--sgo-*) ou justifique com ${ALLOW_MARK}: <motivo>` });
    let m;
    SPACE_ARB.lastIndex = 0;
    while ((m = SPACE_ARB.exec(line))) {
      const n = Number(m[1]);
      if (n !== 4 && n % 8 !== 0)
        violations.push({ file, line: i + 1, msg: `espaçamento ${m[0]} fora da grade 8pt` });
    }
  });
}

if (violations.length) {
  console.error(`\n✗ Design system — ${violations.length} violação(ões) de token no escopo ativo:\n`);
  for (const v of violations) console.error(`  ${v.file}:${v.line}  ${v.msg}`);
  console.error('\nEscopo em scripts/ds-scope.cjs (cresce por onda).\n');
  process.exit(1);
}
console.log(`✓ Design system: ${files.length} arquivo(s) do escopo ativo sem hex/spacing fora de token.`);
