import { describe, it, expect, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/modulos/hora-extra',
}));

import { renderToString } from 'react-dom/server';
import React from 'react';
import { PayoutsCompetenciaClient, type QuadroUI } from '@/components/people/payouts-competencia-client';

/**
 * A TELA DE PAGAMENTO EXTRA E MOBILIDADE.
 *
 * O risco desta tela é um só e é grave: as duas modalidades se misturarem. O
 * arquivo vai para a administradora, e um valor na planilha errada não é um
 * erro de tela — é um pagamento errado. E, no Pagamento Extra, o segundo risco
 * é oferecer edição de algo que se corrige em outro lugar.
 */

const semSeparadores = (html: string) => html.replace(/<!--[\s\S]*?-->/g, '');

function mobilidade(over: Partial<QuadroUI> = {}): QuadroUI {
  return {
    competencia: '2026-10',
    totalGeral: 400,
    totalLancamentos: 2,
    fechada: false,
    fechadaPor: null,
    unidadesSemLancamento: [],
    grupos: [{
      unitId: 'u1', unidade: 'Beija Flor Centro', total: 400, entregaEm: '2026-09-26',
      lancamentos: [
        { id: 'l1', collaboratorId: 'c1', colaborador: 'Ana Souza', cpf: '09494305604', valor: 150, observacao: null, lancadoPor: 'Sup' },
        { id: 'l2', collaboratorId: 'c2', colaborador: 'Bruno Lima', cpf: '13849372693', valor: 250, observacao: 'ajuste', lancadoPor: 'Sup' },
      ],
    }],
    ...over,
  };
}

function extra(over: Partial<QuadroUI> = {}): QuadroUI {
  return {
    competencia: '2026-10',
    totalGeral: 67.5,
    totalLancamentos: 2,
    fechada: false,
    fechadaPor: null,
    unidadesSemLancamento: [],
    grupos: [{
      unitId: 'u1', unidade: 'Beija Flor Centro', total: 67.5, entregaEm: null,
      lancamentos: [{
        id: 'u1|c1', collaboratorId: 'c1', colaborador: 'Ana Souza', cpf: '09494305604', valor: 67.5, observacao: null, lancadoPor: 'Pagamentos',
        horas: 4.5, status: 'APPROVED',
        horasExtras: [
          { id: 'h1', dia: '2026-09-10', inicio: '18:00', fim: '21:00', horas: 3, valorHora: 15, vt: 0, valor: 45, status: 'APPROVED', aprovadoPor: 'Sup' },
          { id: 'h2', dia: '2026-09-12', inicio: '18:00', fim: '19:30', horas: 1.5, valorHora: 15, vt: 0, valor: 22.5, status: 'APPROVED', aprovadoPor: 'Sup' },
        ],
      }],
    }],
    extra: {
      mesTrabalhado: '2026-09', rotuloMesTrabalhado: 'setembro de 2026', colaboradores: 1,
      pendentes: { qtd: 0, valor: 0 }, aposFechamento: { qtd: 0, valor: 0, linhas: [] },
    },
    ...over,
  };
}

/* Desde a v1.142.0 cada modalidade tem a sua tela: o componente recebe UM tipo
   e UM quadro, e `basePath` diz para onde a troca de mês navega. */
const tela = (props: Partial<React.ComponentProps<typeof PayoutsCompetenciaClient>> = {}) =>
  semSeparadores(renderToString(
    <PayoutsCompetenciaClient
      tipo="EXTRA"
      quadro={extra()}
      basePath="/modulos/hora-extra?aba=fechamento"
      competencia="2026-10"
      meses={['2026-11', '2026-10', '2026-09']}
      colaboradores={[{ id: 'c1', nome: 'Ana Souza', cpf: '09494305604', unitId: 'u1', unidade: 'Beija Flor Centro' }]}
      podeLancar
      podeFecharExtra
      isAdmin
      {...props}
    />,
  ));

describe('Uma modalidade por tela, e nunca um arquivo misto', () => {
  it('Comissão não existe mais; cada tela exporta só o seu tipo', () => {
    /* Não existe "exportar tudo": a forma de garantir que as modalidades não
       se misturem é não oferecer o caminho. */
    const h = tela();
    expect(h).not.toContain('Comissão');
    expect(h).toContain('Arquivo da administradora (XLSX)');
    expect(h).toContain('tipo=EXTRA&amp;mes=2026-10');
    expect(h).not.toContain('Exportar tudo');
    expect(h).not.toContain('tipo=MOBILITY');
    const m = tela({ tipo: 'MOBILITY', quadro: mobilidade() });
    expect(m).toContain('Exportar Mobilidade XLSX');
    expect(m).toContain('tipo=MOBILITY&amp;mes=2026-10');
    expect(m).not.toContain('tipo=EXTRA');
  });
});

describe('Fechamento da Hora extra: derivado das horas extras, sem lançamento aqui', () => {
  it('diz de que mês são as horas e que a correção é em Pagamentos', () => {
    const h = tela();
    expect(h).toContain('setembro de 2026');
    expect(h).toContain('aprovadas em Pagamentos');
  });

  it('NUNCA oferece "Lançar", mesmo para quem lança mobilidade', () => {
    expect(tela()).not.toContain('Lançar pagamento extra');
    expect(tela({ podeLancar: true })).not.toContain('Lançar ');
  });

  it('a linha da unidade conta horas extras E colaboradores', () => {
    const h = tela();
    expect(h).toContain('2 hora(s) extra(s)');
    expect(h).toContain('1 colaborador(es)');
  });

  it('o detalhe (CPF, HE por dia) só aparece ao expandir — a tabela nasce fechada', () => {
    expect(tela()).not.toContain('094.943.056-04');
  });

  it('finalizar diz que MARCA PAGAS, e só para Admin/CEO/Financeiro', () => {
    expect(tela()).toContain('Finalizar competência e marcar pagas');
    const sup = tela({ podeFecharExtra: false });
    expect(sup).not.toContain('Finalizar competência');
    expect(sup).toContain('Admin, CEO ou Financeiro');
  });

  it('pendentes de aprovação aparecem como aviso, com valor, e link para Pagamentos', () => {
    const h = tela({ quadro: extra({ extra: { ...extra().extra!, pendentes: { qtd: 3, valor: 120 } } }) });
    expect(h).toContain('3 hora(s) extra(s) ainda aguardando aprovação');
    expect(h).toMatch(/R\$\s120,00/);
    expect(h).toContain('/modulos/pagamentos');
  });

  it('aprovada DEPOIS do fechamento: bloco à parte, nomeada, com o caminho (reabrir)', () => {
    const h = tela({ quadro: extra({
      fechada: true, fechadaPor: 'Marcelo',
      extra: { ...extra().extra!, aposFechamento: { qtd: 1, valor: 30, linhas: [{ id: 'h9', dia: '2026-09-20', inicio: null, fim: null, horas: 2, valorHora: 15, vt: 0, valor: 30, status: 'APPROVED', aprovadoPor: 'Sup', colaborador: 'Carla Dias' }] } },
    }) });
    expect(h).toContain('aprovada(s) DEPOIS do fechamento');
    expect(h).toContain('Carla Dias');
    expect(h).toContain('20/09/2026');
    expect(h).toContain('Reabra e finalize de novo');
  });

  it('fechada: avisa que as HE foram marcadas como pagas', () => {
    const h = tela({ quadro: extra({ fechada: true, fechadaPor: 'Marcelo' }) });
    expect(h).toContain('Competência finalizada por Marcelo');
    expect(h).toContain('marcadas como pagas');
    expect(h).toContain('Reabrir');
  });

  it('nomeia as unidades sem hora extra', () => {
    const h = tela({ quadro: extra({ unidadesSemLancamento: [{ id: 'u2', name: 'Beija Flor Orla' }] }) });
    expect(h).toContain('Ainda sem hora extra nesta competência');
    expect(h).toContain('Beija Flor Orla');
  });
});

describe('Mobilidade: intocada', () => {
  const m = (props: Partial<React.ComponentProps<typeof PayoutsCompetenciaClient>> = {}) => tela({ tipo: 'MOBILITY', quadro: mobilidade(), basePath: '/modulos/mobilidade', ...props });

  it('a linha da unidade responde "quanto e quantos" sem expandir, com a entrega', () => {
    const h = m();
    expect(h).toContain('Beija Flor Centro');
    expect(h).toContain('2 lançamento(s)');
    expect(h).toContain('Entregue: 26/09/2026');
  });

  it('quem lança vê "Lançar mobilidade"; competência fechada some com ele', () => {
    expect(m()).toContain('Lançar mobilidade');
    const f = m({ quadro: mobilidade({ fechada: true, fechadaPor: 'Marcelo' }) });
    expect(f).toContain('Competência finalizada por Marcelo');
    expect(f).not.toContain('Lançar mobilidade');
    expect(f).toContain('Exportar Mobilidade XLSX');
  });

  it('só o Admin vê "Reabrir"; os demais leem para quem pedir', () => {
    const sup = m({ quadro: mobilidade({ fechada: true, fechadaPor: 'Marcelo' }), isAdmin: false });
    expect(sup).not.toContain('Reabrir');
    expect(sup).toContain('Peça ao Administrador');
  });

  it('quem não pode lançar não vê lançar nem finalizar, mas exporta', () => {
    const h = m({ podeLancar: false });
    expect(h).not.toContain('Lançar mobilidade');
    expect(h).not.toContain('Finalizar competência');
    expect(h).toContain('Exportar Mobilidade XLSX');
  });

  it('nomeia as unidades sem lançamento', () => {
    const h = m({ quadro: mobilidade({ unidadesSemLancamento: [{ id: 'u2', name: 'Beija Flor Orla' }] }) });
    expect(h).toContain('Ainda sem mobilidade nesta competência');
  });
});
