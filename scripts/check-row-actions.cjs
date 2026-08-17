#!/usr/bin/env node
/**
 * Localiza os três padrões que entulham as telas do SGO.
 *
 * 1. FILEIRA DE AÇÕES NA LINHA — três ou mais botões soltos num contêiner de
 *    ação dentro de uma lista. É o que fazia 735 controles disputarem espaço
 *    com 147 notas. O certo é a linha mostrar conteúdo e as ações irem para o
 *    menu "···" (ui/ds/action-menu).
 * 2. FORMULÁRIO SEMPRE ABERTO — bloco "border-dashed" com campos, tipicamente
 *    plantado ACIMA da lista que a pessoa veio ler. O certo é uma folha atrás
 *    de um botão.
 * 3. FILEIRA DE FILTRO À MÃO — o arranjo copiado de tela em tela em vez do
 *    componente FilterBar, que existe desde a v1.40.0 para isso.
 *
 * Relatório, não portão: sai 0 sempre. Serve para medir cobertura antes e
 * depois de uma varredura, e para achar o que sobrou.
 */
const fs = require('fs');
const path = require('path');

const arquivos = [];
(function varrer(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.next') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) varrer(p);
    else if (/\.tsx$/.test(e.name)) arquivos.push(p);
  }
})('src');

/** Botão de ação com rótulo — o que aparece solto nas linhas. */
const BOTAO = /<(?:Button|DeleteOpButton)\b[^>]*|<button\b[^>]*>/g;
const ROTULO_ACAO = /Editar|Excluir|Remover|Devolver|Problema|Ver\/|Reclassificar|Encerrar|Aprovar|Rejeitar|Pagar|Cancelar|Concluir|Registrar execu|Reavaliar|Solicitar altera/i;

const fileiras = [];
const formularios = [];
const filtros = [];

for (const arquivo of arquivos) {
  const rel = arquivo.replace(/\\/g, '/');
  if (/\/ui\/ds\/|\/dev\/ui\//.test(rel)) continue; // o DS e a galeria não contam
  const linhas = fs.readFileSync(arquivo, 'utf8').split('\n');

  linhas.forEach((linha, i) => {
    // 3 — fileira de filtro copiada à mão
    if (/flex flex-wrap items-end gap-2 rounded-card border border-line bg-surface p-3/.test(linha)) {
      filtros.push(`${rel}:${i + 1}`);
    }
    // 2 — formulário sempre aberto
    if (/border-dashed/.test(linha) && /<div/.test(linha)) {
      const janela = linhas.slice(i, i + 14).join(' ');
      if (/<Input|<Select|<DatePicker|<Label/.test(janela)) formularios.push(`${rel}:${i + 1}`);
    }
  });

  // 1 — fileira de ações: conta botões com rótulo de ação numa janela curta
  for (let i = 0; i < linhas.length; i++) {
    const janela = linhas.slice(i, i + 8).join('\n');
    if (!/flex[^"']*(?:gap|justify)/.test(linhas[i])) continue;
    const botoes = (janela.match(BOTAO) || []).filter((b) => ROTULO_ACAO.test(janela.slice(janela.indexOf(b), janela.indexOf(b) + 160)));
    if (botoes.length >= 3) {
      fileiras.push(`${rel}:${i + 1}  (${botoes.length} botões)`);
      i += 8;
    }
  }
}

const bloco = (titulo, itens) => {
  console.log(`\n${titulo} — ${itens.length}`);
  for (const x of [...new Set(itens)]) console.log(`  ${x}`);
};

bloco('1. Fileiras de ação na linha (→ ActionMenu)', fileiras);
bloco('2. Formulários sempre abertos (→ Sheet)', formularios);
bloco('3. Fileiras de filtro à mão (→ FilterBar)', filtros);
console.log('\n(relatório — não bloqueia)');
