#!/usr/bin/env node
/**
 * Portão: o efeito de foco do diálogo NÃO pode depender de callback do chamador.
 *
 * O defeito que este portão existe para impedir (v1.45.1, cadastro de fornecedor):
 * `useDialogBehavior` tinha `onClose` na lista de dependências do efeito. Como
 * praticamente todo chamador passa `onClose={() => setX(false)}` — identidade nova
 * a cada renderização —, o efeito era remontado A CADA TECLA nos formulários cujo
 * estado vive no mesmo componente, e o `focusFirst()` jogava o cursor do campo
 * para o primeiro elemento focável: o botão de FECHAR. Digitar ficava impossível.
 *
 * Regra: dentro de useDialogBehavior, nenhum array de dependências pode conter
 * um callback. Callbacks vão para ref (onCloseRef) e são lidos no evento.
 */
const fs = require('fs');

const FILE = process.argv[2] || 'src/components/ui/ds/modal.tsx';
const src = fs.readFileSync(FILE, 'utf8');

const inicio = src.indexOf('export function useDialogBehavior');
if (inicio === -1) {
  console.error(`✗ ${FILE}: useDialogBehavior não encontrado — o portão perdeu o alvo.`);
  process.exit(1);
}
// Vai até a próxima declaração de topo (o hook é seguido por `export interface`).
const resto = src.slice(inicio + 1);
const fim = resto.search(/\nexport (interface|function|const)/);
const corpo = resto.slice(0, fim === -1 ? undefined : fim);

const problemas = [];

// 1) Nenhum array de dependências pode listar um callback (on*, handle*).
for (const m of corpo.matchAll(/\}, \[([^\]]*)\]\);/g)) {
  const deps = m[1].split(',').map((d) => d.trim()).filter(Boolean);
  const callbacks = deps.filter((d) => /^(on[A-Z]|handle[A-Z])/.test(d));
  if (callbacks.length) {
    const linha = src.slice(0, inicio + 1 + m.index).split('\n').length;
    problemas.push(
      `${FILE}:${linha}  dependência instável no efeito do diálogo: ${callbacks.join(', ')}\n` +
      `      → o efeito remonta a cada renderização do pai e o foco pula para o botão Fechar.\n` +
      `      → guarde em ref (ex.: onCloseRef) e tire da lista de dependências.`,
    );
  }
}

// 2) A ref precisa existir de fato — senão o Esc para de fechar sem ninguém ver.
if (!/onCloseRef/.test(corpo)) {
  problemas.push(`${FILE}  useDialogBehavior perdeu a onCloseRef — Esc não fecha mais o diálogo.`);
}

if (problemas.length) {
  console.error('\n✗ Foco de diálogo:\n');
  for (const p of problemas) console.error('   ' + p + '\n');
  process.exit(1);
}
console.log('✓ Foco de diálogo: efeito não depende de callback do chamador; onCloseRef presente.');
