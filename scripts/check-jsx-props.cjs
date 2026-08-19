#!/usr/bin/env node
/**
 * Portão: propriedade JSX com chave DENTRO de aspas é texto literal, não valor.
 *
 * O bug que este portão existe para impedir (v1.47.0, foi para produção):
 * na conversão em massa das faixas de estatística, o script gerou
 * `<StatCard label="{label}" ... />` dentro de duas funções auxiliares. O
 * TypeScript aceita — é uma string válida —, o lint aceita, os testes passam, e
 * o painel de Óleo e o de Gás foram para o ar mostrando o texto "{label}" no
 * lugar do nome do indicador. Só apareceu quando eu li o arquivo por outro
 * motivo.
 *
 * Custa uma varredura e pega uma classe inteira de erro de escrita automática.
 */
const fs = require('fs');
const path = require('path');

const RAIZ = process.argv[2] || 'src';
const arquivos = [];
(function anda(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { if (!/node_modules|\.next/.test(p)) anda(p); }
    else if (/\.tsx$/.test(e.name)) arquivos.push(p);
  }
})(RAIZ);

/* `algo="{expressao}"` — abre aspas, abre chave, e fecha as duas. Não confundir
   com classes que legitimamente contêm chaves em valor arbitrário do Tailwind
   (ex.: className="[overflow-wrap:anywhere]"), que não começam com `{`. */
const SUSPEITA = /\b([a-zA-Z][a-zA-Z0-9]*)="\{([^"}]+)\}"/g;

const problemas = [];
for (const f of arquivos) {
  fs.readFileSync(f, 'utf8').split('\n').forEach((ln, i) => {
    for (const m of ln.matchAll(SUSPEITA)) {
      problemas.push(
        `${f.split(path.sep).join('/')}:${i + 1}  ${m[1]}="{${m[2]}}" é o TEXTO "{${m[2]}}", não o valor\n` +
        `      → tire as aspas: ${m[1]}={${m[2]}}`,
      );
    }
  });
}

if (problemas.length) {
  console.error('\n✗ Propriedades JSX:\n');
  for (const p of problemas) console.error('   ' + p + '\n');
  process.exit(1);
}
console.log(`✓ Propriedades JSX: ${arquivos.length} arquivo(s) sem expressão presa em aspas.`);
