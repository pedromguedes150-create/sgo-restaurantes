import { describe, it, expect } from 'vitest';
import {
  ancoraAntesDe, calcularDia, calcularDias, diaAnterior, estoqueAtual, estoqueInicial, posicaoDosLotes, resumoDoPeriodo,
  type SerieDeMassas,
} from '@/lib/pizzas/massas-calculo';
import {
  contagemValida, diasRestantes, faixaDeValidade, quantidadeDeMassas, rotuloDaFaixa, rotuloDoMotivo, textoLimpo, tipoDePerda,
} from '@/lib/pizzas/massas-tipos';

/**
 * O motor é PURO: estas contas são as que o link, a rota e o painel mostram.
 * O cenário central é o do pedido — segunda recebe 30 e usa 10, terça usa 7,
 * depois se descobre que segunda recebeu 32.
 */

const serie = (p: Partial<SerieDeMassas> = {}): SerieDeMassas => ({
  lotes: [], desperdicios: [], contagens: [], vendasPorDia: new Map(), ...p,
});

describe('vocabulário (puro)', () => {
  it('quantidade de massas é inteiro POSITIVO; contagem física aceita zero', () => {
    expect(quantidadeDeMassas(1)).toBe(true);
    expect(quantidadeDeMassas(0)).toBe(false);
    expect(quantidadeDeMassas(-1)).toBe(false);
    expect(quantidadeDeMassas(2.5)).toBe(false);
    expect(quantidadeDeMassas('3')).toBe(false);
    expect(contagemValida(0)).toBe(true);
    expect(contagemValida(-1)).toBe(false);
  });

  it('só "massa vencida" é perda por VALIDADE; o resto é PRODUÇÃO', () => {
    expect(tipoDePerda('EXPIRED')).toBe('VALIDADE');
    for (const m of ['BURNED', 'WRONG_INGREDIENT', 'DAMAGED', 'PRODUCTION_ERROR', 'OTHER'] as const) {
      expect(tipoDePerda(m), m).toBe('PRODUCAO');
    }
    expect(rotuloDoMotivo('BURNED')).toBe('Pizza queimada');
  });

  it('dias restantes e faixa de validade', () => {
    expect(diasRestantes('2026-09-23', '2026-09-27')).toBe(4);
    expect(diasRestantes('2026-09-23', '2026-09-23')).toBe(0);
    expect(diasRestantes('2026-09-23', '2026-09-21')).toBe(-2);
    expect(faixaDeValidade(-1)).toBe('VENCIDO');
    expect(faixaDeValidade(0)).toBe('VENCE_HOJE');
    expect(faixaDeValidade(2)).toBe('PROXIMO');
    expect(faixaDeValidade(3)).toBe('OK');
    expect(rotuloDaFaixa('PROXIMO', 1)).toBe('Vence amanhã');
    expect(rotuloDaFaixa('VENCIDO', -3)).toBe('Venceu há 3 dias');
  });

  it('texto livre é aparado e vazio vira null', () => {
    expect(textoLimpo('  ok  ')).toBe('ok');
    expect(textoLimpo('   ')).toBeNull();
    expect(textoLimpo(42)).toBeNull();
  });

  it('dia anterior atravessa o mês', () => {
    expect(diaAnterior('2026-10-01')).toBe('2026-09-30');
  });
});

describe('o exemplo do pedido: recebimento, uso e correção retroativa', () => {
  const segunda = '2026-09-21';
  const terca = '2026-09-22';

  const base = (): SerieDeMassas => serie({
    lotes: [{ id: 'L1', data: segunda, quantidade: 30, validade: '2026-09-27', lotCode: null }],
    vendasPorDia: new Map([[segunda, 10], [terca, 7]]),
  });

  it('segunda: 0 + 30 − 10 = 20; terça: 20 − 7 = 13', () => {
    const s = base();
    const seg = calcularDia(s, segunda);
    expect(seg.inicial).toBe(0);
    expect(seg.recebidas).toBe(30);
    expect(seg.vendidas).toBe(10);
    expect(seg.esperado).toBe(20);

    const ter = calcularDia(s, terca);
    expect(ter.inicial).toBe(20);
    expect(ter.esperado).toBe(13);
    expect(ter.situacao).toBe('SEM_CONTAGEM');
  });

  it('a contagem física bate → "Estoque conferido"; e vira o estoque inicial do dia seguinte', () => {
    const s = base();
    s.contagens.push({ data: segunda, fisico: 20, esperadoNoFechamento: 20 });
    expect(calcularDia(s, segunda).situacao).toBe('CONFERIDO');
    expect(estoqueInicial(s, terca)).toBe(20);
  });

  it('a contagem física NÃO bate → "Divergência de estoque", e o dia seguinte parte do FÍSICO, não do esperado', () => {
    const s = base();
    /* Contou 18 onde se esperavam 20: faltam 2. Terça começa com 18 — o que
       está na câmara é o que existe, não o que a conta dizia. */
    s.contagens.push({ data: segunda, fisico: 18, esperadoNoFechamento: 20 });
    const seg = calcularDia(s, segunda);
    expect(seg.situacao).toBe('DIVERGENTE');
    expect(seg.divergencia).toBe(-2);
    expect(estoqueInicial(s, terca)).toBe(18);
    expect(calcularDia(s, terca).esperado).toBe(11);
  });

  it('corrigir segunda para 32 recalcula a sequência inteira SEM tocar na contagem física', () => {
    const s = base();
    s.contagens.push({ data: segunda, fisico: 20, esperadoNoFechamento: 20 });
    s.contagens.push({ data: terca, fisico: 13, esperadoNoFechamento: 13 });
    expect(calcularDia(s, terca).situacao).toBe('CONFERIDO');

    /* O gerente descobre: segunda recebeu 32. */
    s.lotes[0].quantidade = 32;

    const seg = calcularDia(s, segunda);
    expect(seg.esperado).toBe(22);
    expect(seg.fisico).toBe(20); // a contagem continua a mesma
    expect(seg.divergencia).toBe(-2);
    expect(seg.alteradoDepois).toBe(true);
    /* Batia no fechamento (20 = 20) e deixou de bater por causa da correção:
       é a "DIVERGÊNCIA GERADA POR ALTERAÇÃO RETROATIVA" do pedido. */
    expect(seg.situacao).toBe('RETROATIVO');

    /* Terça parte da CONTAGEM de segunda (20), então segue conferida: a âncora
       física protege os dias seguintes de herdarem a diferença. */
    const ter = calcularDia(s, terca);
    expect(ter.inicial).toBe(20);
    expect(ter.situacao).toBe('CONFERIDO');
  });

  it('dia que já era divergente no fechamento continua DIVERGENTE depois de uma correção — a natureza não muda', () => {
    const s = base();
    s.contagens.push({ data: segunda, fisico: 17, esperadoNoFechamento: 20 });
    s.lotes[0].quantidade = 32;
    const seg = calcularDia(s, segunda);
    expect(seg.situacao).toBe('DIVERGENTE');
    expect(seg.alteradoDepois).toBe(true);
    expect(seg.divergenciaNoFechamento).toBe(-3);
    expect(seg.divergencia).toBe(-5);
  });

  it('dia SEM fechamento no meio não quebra a corrente: a âncora anterior soma tudo até o dia pedido', () => {
    const s = base();
    s.contagens.push({ data: segunda, fisico: 20, esperadoNoFechamento: 20 });
    /* Terça sem contagem; quarta vende 5. Quarta começa em 13 (20 − 7). */
    const quarta = '2026-09-23';
    s.vendasPorDia.set(quarta, 5);
    expect(estoqueInicial(s, quarta)).toBe(13);
    expect(calcularDia(s, quarta).esperado).toBe(8);
  });

  it('a âncora é a contagem mais recente ANTES do dia, nunca a do próprio dia nem uma futura', () => {
    const s = base();
    s.contagens.push({ data: segunda, fisico: 20, esperadoNoFechamento: 20 });
    s.contagens.push({ data: terca, fisico: 13, esperadoNoFechamento: 13 });
    expect(ancoraAntesDe(s.contagens, terca)?.data).toBe(segunda);
    expect(ancoraAntesDe(s.contagens, segunda)).toBeNull();
  });
});

describe('o caso do print da Nova União: venda antes do recebimento, estoque negativo e a 1ª contagem', () => {
  /* Reprodução do relato: a pizzaria vendeu vários dias SEM registrar
     recebimento de massa, então o estoque esperado ficou NEGATIVO (é o modelo
     declarado: sem entrada lançada, a saída joga o saldo abaixo de zero). Depois
     veio um recebimento grande e a primeira contagem física — que reconcilia com
     uma divergência POSITIVA. A conta está certa; o negativo é dado que faltou,
     não erro de cálculo. */
  const d18 = '2026-09-18';
  const d20 = '2026-09-20';
  const d22 = '2026-09-22';
  const d23 = '2026-09-23';
  const d24 = '2026-09-24';

  const base = (): SerieDeMassas => serie({
    // Só em 23/09 se registra recebimento (78+40+40 = 158), nada antes.
    lotes: [
      { id: 'A', data: d23, quantidade: 78, validade: '2026-09-26', lotCode: null },
      { id: 'B', data: d23, quantidade: 40, validade: '2026-09-26', lotCode: null },
      { id: 'C', data: d23, quantidade: 40, validade: '2026-09-29', lotCode: null },
    ],
    // Vendas nos dias anteriores, sem estoque lançado → saldo negativo.
    vendasPorDia: new Map([[d18, 19], [d20, 18], [d22, 7], [d23, 12], [d24, 12]]),
    // Desperdício por validade em 24/09.
    desperdicios: [{ id: 'w', data: d24, quantidade: 28, motivo: 'EXPIRED', loteId: 'A' }],
    // Primeira contagem física em 24/09: a câmara tinha 79.
    contagens: [{ data: d24, fisico: 79, esperadoNoFechamento: 36 }],
  });

  it('o esperado fica negativo enquanto não há recebimento — e a aritmética de cada dia fecha', () => {
    const s = base();
    // 18/09: 0 − 19 = −19 (nada antes dele nesta série).
    expect(calcularDia(s, d18).esperado).toBe(-19);
    // 20/09 parte de −19: −19 − 18 = −37.
    expect(calcularDia(s, d20).inicial).toBe(-19);
    expect(calcularDia(s, d20).esperado).toBe(-37);
    // 22/09: −37 − 7 = −44.
    expect(calcularDia(s, d22).esperado).toBe(-44);
    // 23/09: −44 + 158 − 12 = 102.
    const dia23 = calcularDia(s, d23);
    expect(dia23.inicial).toBe(-44);
    expect(dia23.recebidas).toBe(158);
    expect(dia23.esperado).toBe(102);
  });

  it('24/09: 102 − 12 pizzas − 28 desperdício = 62 esperado; contou 79 → divergência +17, DIVERGENTE', () => {
    const s = base();
    const dia24 = calcularDia(s, d24);
    expect(dia24.inicial).toBe(102);
    expect(dia24.vendidas).toBe(12);
    expect(dia24.desperdicadas).toBe(28);
    expect(dia24.perdaValidade).toBe(28);
    expect(dia24.esperado).toBe(62);
    expect(dia24.fisico).toBe(79);
    expect(dia24.divergencia).toBe(17);
    expect(dia24.situacao).toBe('DIVERGENTE');
  });

  it('depois da contagem de 24/09, o estoque de hoje parte do FÍSICO, não do esperado', () => {
    const s = base();
    // 25/09 sem movimento: estoque atual = a contagem de 24/09 (79), não o esperado.
    expect(estoqueAtual(s, '2026-09-25')).toBe(79);
  });

  it('% de desperdício é sobre o que SAIU da câmara (pizzas + desperdício), não sobre o estoque', () => {
    const s = base();
    const dias = calcularDias(s, d18, d24);
    const r = resumoDoPeriodo(dias, posicaoDosLotes(s, d24, '2026-09-25'), estoqueAtual(s, '2026-09-25'));
    // utilizadas = 19+18+7+12+12 = 68; desperdício = 28; consumo = 96.
    expect(r.utilizadas).toBe(68);
    expect(r.desperdicadas).toBe(28);
    expect(r.recebidas).toBe(158);
    // 28 / (68 + 28) = 29,2%.
    expect(r.pctDesperdicio).toBe(29.2);
    // uma contagem, e ela diverge → 1 divergência.
    expect(r.divergencias).toBe(1);
  });
});

describe('desperdício', () => {
  const dia = '2026-09-21';

  it('desconta do estoque e separa validade de produção', () => {
    const s = serie({
      lotes: [{ id: 'L1', data: dia, quantidade: 30, validade: '2026-09-27', lotCode: null }],
      desperdicios: [
        { id: 'w1', data: dia, quantidade: 2, motivo: 'EXPIRED', loteId: 'L1' },
        { id: 'w2', data: dia, quantidade: 1, motivo: 'BURNED', loteId: null },
      ],
      vendasPorDia: new Map([[dia, 10]]),
    });
    const d = calcularDia(s, dia);
    expect(d.perdaValidade).toBe(2);
    expect(d.perdaProducao).toBe(1);
    expect(d.desperdicadas).toBe(3);
    expect(d.esperado).toBe(17);
  });
});

describe('estoque atual', () => {
  it('sem contagem hoje, vale o esperado; com contagem, vale o que a pessoa viu na câmara', () => {
    const hoje = '2026-09-23';
    const s = serie({
      lotes: [{ id: 'L1', data: hoje, quantidade: 30, validade: '2026-09-27', lotCode: null }],
      vendasPorDia: new Map([[hoje, 4]]),
    });
    expect(estoqueAtual(s, hoje)).toBe(26);
    s.contagens.push({ data: hoje, fisico: 25, esperadoNoFechamento: 26 });
    expect(estoqueAtual(s, hoje)).toBe(25);
  });
});

describe('lotes: validades não se misturam', () => {
  const hoje = '2026-09-23';

  it('o exemplo do pedido: 13 do lote antigo (24/09) e 30 do novo (27/09), separados', () => {
    const s = serie({
      lotes: [
        { id: 'antigo', data: '2026-09-20', quantidade: 13, validade: '2026-09-24', lotCode: null },
        { id: 'novo', data: hoje, quantidade: 30, validade: '2026-09-27', lotCode: 'AB12' },
      ],
    });
    const p = posicaoDosLotes(s, hoje, hoje);
    expect(p.total).toBe(43);
    expect(p.lotes.map((l) => [l.id, l.disponivel, l.diasRestantes])).toEqual([['antigo', 13, 1], ['novo', 30, 4]]);
    expect(p.lotes[0].faixa).toBe('PROXIMO');
    expect(p.lotes[1].lotCode).toBe('AB12');
  });

  it('o consumo sai do lote com validade MAIS ANTIGA primeiro (FIFO por validade)', () => {
    const s = serie({
      lotes: [
        { id: 'antigo', data: '2026-09-20', quantidade: 13, validade: '2026-09-24', lotCode: null },
        { id: 'novo', data: hoje, quantidade: 30, validade: '2026-09-27', lotCode: null },
      ],
      vendasPorDia: new Map([[hoje, 15]]),
    });
    const p = posicaoDosLotes(s, hoje, hoje);
    /* 15 saem: 13 zeram o antigo (que some da lista) e 2 saem do novo. */
    expect(p.lotes.map((l) => [l.id, l.disponivel])).toEqual([['novo', 28]]);
    expect(p.total).toBe(28);
  });

  it('descarte por validade abate exatamente o lote apontado', () => {
    const s = serie({
      lotes: [
        { id: 'antigo', data: '2026-09-20', quantidade: 13, validade: '2026-09-24', lotCode: null },
        { id: 'novo', data: hoje, quantidade: 30, validade: '2026-09-27', lotCode: null },
      ],
      desperdicios: [{ id: 'w', data: hoje, quantidade: 5, motivo: 'EXPIRED', loteId: 'novo' }],
    });
    const p = posicaoDosLotes(s, hoje, hoje);
    expect(p.lotes.map((l) => [l.id, l.disponivel])).toEqual([['antigo', 13], ['novo', 25]]);
  });

  it('a contagem física reconcilia: sobra some do mais antigo; excesso vira "sem lote"', () => {
    const s = serie({
      lotes: [
        { id: 'antigo', data: '2026-09-20', quantidade: 13, validade: '2026-09-24', lotCode: null },
        { id: 'novo', data: hoje, quantidade: 30, validade: '2026-09-27', lotCode: null },
      ],
      contagens: [{ data: hoje, fisico: 40, esperadoNoFechamento: 43 }],
    });
    const p1 = posicaoDosLotes(s, hoje, hoje);
    expect(p1.lotes.map((l) => [l.id, l.disponivel])).toEqual([['antigo', 10], ['novo', 30]]);
    expect(p1.total).toBe(40);

    s.contagens[0].fisico = 45;
    const p2 = posicaoDosLotes(s, hoje, hoje);
    expect(p2.semLote).toBe(2);
    expect(p2.total).toBe(45);
  });

  it('lote vencido com saldo aparece como VENCIDO — é o que o alerta cobra', () => {
    const s = serie({ lotes: [{ id: 'v', data: '2026-09-15', quantidade: 4, validade: '2026-09-21', lotCode: null }] });
    const p = posicaoDosLotes(s, hoje, hoje);
    expect(p.lotes[0].faixa).toBe('VENCIDO');
    expect(p.lotes[0].diasRestantes).toBe(-2);
  });
});

describe('resumo do período', () => {
  it('soma os dias e calcula o % de desperdício sobre o que saiu da câmara', () => {
    const d1 = '2026-09-21'; const d2 = '2026-09-22';
    const s = serie({
      lotes: [{ id: 'L1', data: d1, quantidade: 50, validade: '2026-09-30', lotCode: null }],
      desperdicios: [
        { id: 'w1', data: d1, quantidade: 2, motivo: 'EXPIRED', loteId: null },
        { id: 'w2', data: d2, quantidade: 3, motivo: 'BURNED', loteId: null },
      ],
      contagens: [{ data: d1, fisico: 37, esperadoNoFechamento: 38 }],
      vendasPorDia: new Map([[d1, 10], [d2, 5]]),
    });
    const dias = calcularDias(s, d1, d2);
    expect(dias.map((d) => d.data)).toEqual([d2, d1]); // mais recente primeiro
    const r = resumoDoPeriodo(dias, posicaoDosLotes(s, d2, d2), estoqueAtual(s, d2));
    expect(r.recebidas).toBe(50);
    expect(r.utilizadas).toBe(15);
    expect(r.perdaValidade).toBe(2);
    expect(r.perdaProducao).toBe(3);
    expect(r.desperdicadas).toBe(5);
    expect(r.divergencias).toBe(1);
    expect(r.diasContados).toBe(1);
    /* 5 ÷ (15 + 5) = 25% */
    expect(r.pctDesperdicio).toBe(25);
    /* estoque atual: 37 (contagem de d1) − 5 vendas − 3 queimadas = 29 */
    expect(r.estoqueAtual).toBe(29);
  });

  it('período sem movimento não divide por zero', () => {
    const s = serie();
    const r = resumoDoPeriodo(calcularDias(s, '2026-09-21', '2026-09-22'), posicaoDosLotes(s, '2026-09-22', '2026-09-22'), 0);
    expect(r.pctDesperdicio).toBe(0);
    expect(r.estoqueAtual).toBe(0);
  });
});
