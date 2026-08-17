#!/usr/bin/env node
/**
 * Converte pilha de cartões em Group (Onda 8).
 *
 * COMO ACHA O FECHAMENTO
 * Não conta profundidade de JSX — conta INDENTAÇÃO. O código é formatado pelo
 * prettier, então o `</div>` que fecha a pilha está exatamente na mesma coluna
 * da `<div className="space-y-*">` que a abriu. Contar tags daria errado com
 * auto-fechadas e fragmentos; a coluna não.
 *
 * O QUE FAZ EM CADA PILHA
 *  1. troca o invólucro por <Group>…</Group>;
 *  2. tira do cartão a borda/fundo/arredondamento — quem desenha a caixa agora
 *     é o Group. Mantém o padding, que vira o respiro da linha.
 *
 * O QUE NÃO TOCA
 * Cartão com borda de ESTADO (border-2 border-danger/60 e afins) fica intacto:
 * é destaque, não linha de lista, e perderia o sinal.
 *
 * Uso: node scripts/migrate-to-group.cjs <arquivo> <linha-da-pilha> [--dry]
 */
const fs = require('fs');

const [arquivo, linhaStr] = process.argv.slice(2);
const dry = process.argv.includes('--dry');
if (!arquivo || !linhaStr) {
  console.error('uso: node scripts/migrate-to-group.cjs <arquivo> <linha> [--dry]');
  process.exit(1);
}

const alvo = Number(linhaStr) - 1; // 0-indexed
const linhas = fs.readFileSync(arquivo, 'utf8').split('\n');

const abre = linhas[alvo];
const m = abre && abre.match(/^(\s*)<div className="space-y-(?:1\.5|2|3)">\s*$/);
if (!m) {
  console.error(`linha ${linhaStr} não é uma pilha simples:\n  ${abre}`);
  process.exit(1);
}
const indent = m[1];

// Fechamento = primeiro </div> na MESMA coluna.
let fecha = -1;
for (let i = alvo + 1; i < linhas.length; i++) {
  if (linhas[i] === `${indent}</div>`) { fecha = i; break; }
}
if (fecha < 0) {
  console.error('não achei o </div> na mesma indentação — feche à mão.');
  process.exit(1);
}

// Tira a caixa do cartão plano dentro da faixa. Borda de estado passa batido
// porque o padrão exige `border ` seguido de `bg-surface`, sem cor no meio.
let cartoes = 0;
for (let i = alvo + 1; i < fecha; i++) {
  const antes = linhas[i];
  linhas[i] = linhas[i].replace(/rounded-lg border bg-surface (p-[\d.]+)/g, '$1');
  if (linhas[i] !== antes) cartoes++;
}
if (cartoes === 0) {
  console.error('nenhum cartão plano na faixa — nada a fazer (talvez seja painel, não lista).');
  process.exit(1);
}

linhas[alvo] = `${indent}<Group>`;
linhas[fecha] = `${indent}</Group>`;

let texto = linhas.join('\n');
if (!/from '@\/components\/ui\/ds\/group'/.test(texto)) {
  // Apelida se o arquivo já usa o nome Group para outra coisa (tipo/interface).
  const colide = /\b(?:interface|type)\s+Group\b/.test(texto);
  const nome = colide ? 'Group as ListGroup' : 'Group';
  if (colide) texto = texto.replace(/<Group>/g, '<ListGroup>').replace(/<\/Group>/g, '</ListGroup>');
  const l = texto.split('\n');
  let ultimo = -1;
  for (let i = 0; i < Math.min(l.length, 40); i++) if (/^import /.test(l[i])) ultimo = i;
  l.splice(ultimo + 1, 0, `import { ${nome} } from '@/components/ui/ds/group';`);
  texto = l.join('\n');
}

if (dry) {
  console.log(`[simulação] ${arquivo}: pilha na linha ${linhaStr}, fecha em ${fecha + 1}, ${cartoes} cartão(ões) achatado(s)`);
} else {
  fs.writeFileSync(arquivo, texto);
  console.log(`${arquivo}: pilha ${linhaStr}→${fecha + 1}, ${cartoes} cartão(ões) achatado(s)`);
}
