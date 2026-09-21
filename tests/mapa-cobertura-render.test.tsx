import { describe, it, expect, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/modulos/pessoas/mapa',
}));

import { renderToString } from 'react-dom/server';
import React from 'react';
import { CoberturaClient, type SetorNaTela, type DiaNaTela } from '@/components/people/cobertura-client';
import { NecessidadePorSetor, CorpoDaNecessidade, type FaixaNaTela } from '@/components/people/faixas-do-setor';

/**
 * A TELA da cobertura.
 *
 * O card tem de explicar a própria cor: mostrar "🟡 2/3" sem dizer de qual
 * faixa veio o 3 devolve ao gestor a pergunta que ele foi ali fazer.
 */

function setor(over: Partial<SetorNaTela> = {}): SetorNaTela {
  return {
    sectorId: 's1', sectorName: 'Cozinha',
    necessario: 3, presentes: 3, status: 'COBERTO', excedente: 0,
    faixaAtual: '06:00–14:00',
    pessoas: [
      { id: 'p1', name: 'Ana', kind: 'STAFF', horario: '06:00-14:00' },
      { id: 'p2', name: 'Carlos', kind: 'STAFF', horario: '06:00-14:00' },
      { id: 'p3', name: 'João', kind: 'STAFF', horario: '06:00-14:00' },
    ],
    ...over,
  };
}

const render = (p: {
  setores: SetorNaTela[];
  abaixoDoMinimo?: SetorNaTela[];
  comExcedente?: SetorNaTela[];
  dia?: DiaNaTela[];
}) =>
  renderToString(React.createElement(CoberturaClient, {
    horaLabel: '10:30',
    setores: p.setores,
    abaixoDoMinimo: p.abaixoDoMinimo ?? [],
    comExcedente: p.comExcedente ?? [],
    dia: p.dia ?? [],
  })).split('<!-- -->').join('');

describe('O card do setor', () => {
  it('mostra o horário analisado, o setor e a conta', () => {
    const html = render({ setores: [setor()] });
    expect(html).toContain('Cobertura às 10:30');
    expect(html).toContain('Cozinha');
    expect(html).toContain('3 / 3');
    expect(html).toContain('Coberto');
  });

  it('EXPLICA de onde veio o número — a faixa e a necessidade', () => {
    const html = render({ setores: [setor()] });
    expect(html).toContain('Faixa atual:');
    expect(html).toContain('06:00–14:00');
  });

  it('lista quem está no setor', () => {
    const html = render({ setores: [setor()] });
    for (const nome of ['Ana', 'Carlos', 'João']) expect(html, nome).toContain(nome);
  });

  it('parcial e sem cobertura aparecem com o rótulo certo', () => {
    expect(render({ setores: [setor({ presentes: 2, status: 'PARCIAL' })] })).toContain('Parcial');
    const zero = render({ setores: [setor({ presentes: 0, status: 'SEM_COBERTURA', pessoas: [] })] });
    expect(zero).toContain('Sem cobertura');
    expect(zero).toContain('Ninguém alocado neste horário');
  });

  it('SEM EXIGÊNCIA não mostra "x/0" nem parece problema', () => {
    /* O caso "Salada às 04:00": necessidade zero é a unidade não operando ali,
       e mostrar 0/0 em vermelho seria cobrar por algo que ninguém combinou.
       Desde a correção do 24 horas, o setor sai dos cards em vez de aparecer
       cinza no meio dos outros — o contador fica no botão. */
    const html = render({ setores: [setor({ necessario: 0, presentes: 0, status: 'SEM_EXIGENCIA', pessoas: [], faixaAtual: null })] });
    expect(html).not.toContain('0 / 0');
    expect(html).not.toContain('Sem cobertura');
    expect(html).toContain('Mostrar funções fora do horário (1)');
    expect(html).toContain('Nenhum setor tem necessidade cadastrada');
  });

  it('o excedente aparece, para o gestor ver quem pode ser deslocado', () => {
    const html = render({ setores: [setor({ necessario: 2, presentes: 4, excedente: 2 })] });
    expect(html).toContain('+2 acima do mínimo');
  });
});

describe('Os alertas', () => {
  it('listam o que está abaixo do mínimo com o necessário e o escalado', () => {
    const falta = setor({ sectorName: 'Pratos', necessario: 2, presentes: 1, status: 'PARCIAL' });
    const html = render({ setores: [falta], abaixoDoMinimo: [falta] });
    expect(html).toContain('Abaixo do mínimo agora');
    expect(html).toContain('Pratos');
    expect(html).toContain('necessário 2, escalado 1');
  });

  it('não aparecem quando está tudo coberto', () => {
    expect(render({ setores: [setor()] })).not.toContain('Abaixo do mínimo agora');
  });
});

describe('A sugestão de realocação', () => {
  it('só existe quando há sobra E falta ao mesmo tempo', () => {
    const sobra = setor({ sectorId: 'a', sectorName: 'Setor A', necessario: 2, presentes: 4, excedente: 2 });
    const falta = setor({ sectorId: 'b', sectorName: 'Setor B', necessario: 2, presentes: 1, status: 'PARCIAL' });

    const html = render({ setores: [sobra, falta], abaixoDoMinimo: [falta], comExcedente: [sobra] });
    expect(html).toContain('Possível realocação');
    expect(html).toContain('Setor A');
    expect(html).toContain('Setor B');
    /* A decisão continua sendo do gestor. */
    expect(html).toContain('Nada é movido automaticamente');
  });

  it('só com sobra, sem falta, não sugere nada', () => {
    const sobra = setor({ necessario: 2, presentes: 4, excedente: 2 });
    expect(render({ setores: [sobra], comExcedente: [sobra] })).not.toContain('Possível realocação');
  });
});

const render2 = (faixas: { id: string; startTime: string; endTime: string; minPeople: number; rotulo: string; diaInteiro?: boolean }[], podeEditar = true) =>
    renderToString(React.createElement(NecessidadePorSetor, {
      setores: [{ id: 's1', name: 'Cozinha', faixas: faixas.map((f) => ({ ...f, diaInteiro: f.diaInteiro ?? false })) }],
      podeEditar,
    })).split('<!-- -->').join('');

describe('O cadastro das faixas', () => {
  it('o resumo diz quantas faixas existem, em vez do antigo "mín. 1"', () => {
    const html = render2([
      { id: '1', startTime: '06:00', endTime: '14:00', minPeople: 3, rotulo: '06:00–14:00' },
      { id: '2', startTime: '14:00', endTime: '22:00', minPeople: 2, rotulo: '14:00–22:00' },
      { id: '3', startTime: '22:00', endTime: '06:00', minPeople: 1, rotulo: '22:00–06:00' },
    ]);
    expect(html).toContain('3 faixas configuradas');
    expect(html).not.toContain('mín. 1');
  });

  it('setor sem faixa diz que fica sem exigência, não que está errado', () => {
    expect(render2([])).toContain('sem necessidade configurada');
  });

  it('deixa claro que o turno não cria exigência — era o defeito', () => {
    expect(render2([])).toContain('não</b> cria');
  });

  it('quem não pode editar não vê o botão de adicionar', () => {
    expect(render2([], false)).not.toContain('Adicionar faixa de horário');
  });
});

/**
 * FUNÇÃO FORA DO HORÁRIO não polui o painel.
 *
 * Às 2h, a cozinha de uma unidade 24 horas não tem necessidade cadastrada. Ela
 * ao lado dos setores que importam ensina a varrer a tela — e é assim que o
 * cartão de fato vermelho passa despercebido.
 */
describe('Funções sem necessidade no horário', () => {
  const semExigencia = setor({
    sectorId: 's2', sectorName: 'Auxiliar Cozinha',
    necessario: 0, presentes: 0, status: 'SEM_EXIGENCIA', faixaAtual: null, pessoas: [],
  });

  it('o setor sem exigência fica fora dos cards por padrão', () => {
    const html = render({ setores: [setor(), semExigencia] });
    expect(html).toContain('Cozinha');
    expect(html).not.toContain('Auxiliar Cozinha');
  });

  it('o botão diz quantas estão escondidas', () => {
    expect(render({ setores: [setor(), semExigencia] })).toContain('Mostrar funções fora do horário (1)');
  });

  it('sem nenhuma fora do horário, o botão não aparece', () => {
    expect(render({ setores: [setor()] })).not.toContain('funções fora do horário');
  });

  it('o card fora do horário NÃO mostra "0 / 1" — não há mínimo a cobrar', () => {
    /* Renderizado só para conferir o texto do rodapé do card: com o botão
       ligado ele aparece, e precisa dizer o motivo em vez de um denominador. */
    const html = render({ setores: [semExigencia] });
    expect(html).toContain('Nenhum setor tem necessidade cadastrada');
  });
});

/** O acordeão nasce fechado; o miolo é renderizado direto. */
const corpo = (faixas: FaixaNaTela[], podeEditar = true) =>
  renderToString(React.createElement(CorpoDaNecessidade, { sectorId: 's1', sectorName: 'Cozinha', faixas, podeEditar })).split('<!-- -->').join('');

describe('A caixa "Necessário 24 horas"', () => {
  const vinteQuatro = { id: '1', startTime: '00:00', endTime: '00:00', minPeople: 2, rotulo: '00:00–24:00', diaInteiro: true };

  it('o resumo do setor diz 24 horas em vez de "1 faixa configurada"', () => {
    expect(render2([vinteQuatro])).toContain('24 horas · mínimo 2');
  });

  it('com 24 horas marcado, a tela explica como cadastrar horários específicos', () => {
    expect(corpo([vinteQuatro])).toContain('desmarque');
  });

  it('a caixa existe mesmo quando o setor não tem faixa nenhuma', () => {
    expect(corpo([])).toContain('Necessário 24 horas');
  });

  it('a dica diz que faixas podem encostar — era o que parecia proibido', () => {
    expect(corpo([])).toContain('começar onde a outra termina');
  });
});
