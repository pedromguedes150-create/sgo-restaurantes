import { describe, it, expect, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/modulos/pessoas/comissoes',
}));

import { renderToString } from 'react-dom/server';
import React from 'react';
import { PayoutsCompetenciaClient, type QuadroUI } from '@/components/people/payouts-competencia-client';

/**
 * A TELA DE COMISSÃO E MOBILIDADE.
 *
 * O risco desta tela é um só e é grave: comissão e mobilidade se misturarem. O
 * arquivo vai para a administradora, e um valor de comissão na planilha de
 * mobilidade não é um erro de tela — é um pagamento errado.
 */

const semSeparadores = (html: string) => html.replace(/<!--[\s\S]*?-->/g, '');

function quadro(over: Partial<QuadroUI> = {}): QuadroUI {
  return {
    competencia: '2026-09',
    totalGeral: 400,
    totalLancamentos: 2,
    fechada: false,
    fechadaPor: null,
    unidadesSemLancamento: [],
    grupos: [{
      unitId: 'u1', unidade: 'Beija Flor Centro', total: 400, entregaEm: '2026-08-26',
      lancamentos: [
        { id: 'l1', collaboratorId: 'c1', colaborador: 'Ana Souza', cpf: '09494305604', valor: 150, observacao: null, lancadoPor: 'Sup' },
        { id: 'l2', collaboratorId: 'c2', colaborador: 'Bruno Lima', cpf: '13849372693', valor: 250, observacao: 'ajuste', lancadoPor: 'Sup' },
      ],
    }],
    ...over,
  };
}

const tela = (props: Partial<React.ComponentProps<typeof PayoutsCompetenciaClient>> = {}) =>
  semSeparadores(renderToString(
    <PayoutsCompetenciaClient
      competencia="2026-09"
      meses={['2026-09', '2026-08']}
      comissao={quadro()}
      mobilidade={quadro({ totalGeral: 900, totalLancamentos: 5 })}
      colaboradores={[{ id: 'c1', nome: 'Ana Souza', cpf: '09494305604', unitId: 'u1', unidade: 'Beija Flor Centro' }]}
      podeLancar
      isAdmin
      {...props}
    />,
  ));

describe('Duas abas, e nunca um arquivo misto', () => {
  it('as duas modalidades aparecem como abas, com as suas contagens', () => {
    const h = tela();
    expect(h).toContain('Comissão (2)');
    expect(h).toContain('Mobilidade (5)');
  });

  it('o botão de exportar leva o TIPO no rótulo e no endereço', () => {
    /* Um botão por aba. Não existe "exportar tudo": a forma de garantir que
       comissão e mobilidade não se misturem é não oferecer o caminho. */
    const h = tela();
    expect(h).toContain('Exportar Comissão XLSX');
    expect(h).toContain('tipo=COMMISSION&amp;mes=2026-09');
    expect(h).not.toContain('Exportar tudo');
  });
});

describe('Agrupado por unidade', () => {
  const h = tela();

  it('a linha da unidade responde "quanto e quantos" sem expandir', () => {
    /* Com 279 lançamentos, a lista corrida não responde nada. */
    expect(h).toContain('Beija Flor Centro');
    expect(h).toContain('2 lançamento(s)');
  });

  it('mostra a data de entrega da unidade', () => {
    expect(h).toContain('Entregue: 26/08/2026');
  });

  it('unidade sem data de entrega é sinalizada', () => {
    const semEntrega = tela({ comissao: quadro({ grupos: [{ ...quadro().grupos[0], entregaEm: null }] }) });
    expect(semEntrega).toContain('Sem data de entrega');
  });

  it('o detalhe só aparece ao expandir — a tabela nasce fechada', () => {
    expect(h).not.toContain('094.943.056-04');
  });
});

describe('O que ainda falta lançar', () => {
  it('nomeia as unidades sem lançamento', () => {
    /* Sem esta linha, uma unidade esquecida só aparece quando a administradora
       reclama. */
    const h = tela({ comissao: quadro({ unidadesSemLancamento: [{ id: 'u2', name: 'Beija Flor Orla' }] }) });
    expect(h).toContain('Ainda sem comissão nesta competência');
    expect(h).toContain('Beija Flor Orla');
  });
});

describe('Competência finalizada', () => {
  const fechada = () => tela({ comissao: quadro({ fechada: true, fechadaPor: 'Marcelo' }) });

  it('avisa quem finalizou e some com o botão de lançar', () => {
    const h = fechada();
    expect(h).toContain('Competência finalizada por Marcelo');
    expect(h).not.toContain('Lançar comissão');
  });

  it('mas o EXPORTAR continua — o arquivo é justamente o que se faz depois', () => {
    expect(fechada()).toContain('Exportar Comissão XLSX');
  });

  it('só o Admin vê "Reabrir"; os demais leem para quem pedir', () => {
    expect(fechada()).toContain('Reabrir');
    const sup = tela({ comissao: quadro({ fechada: true, fechadaPor: 'Marcelo' }), isAdmin: false });
    expect(sup).not.toContain('Reabrir');
    expect(sup).toContain('Peça ao Administrador');
  });
});

describe('Quem não pode lançar', () => {
  it('não vê o botão de lançar nem o de finalizar, mas exporta', () => {
    const h = tela({ podeLancar: false });
    expect(h).not.toContain('Lançar comissão');
    expect(h).not.toContain('Finalizar competência');
    expect(h).toContain('Exportar Comissão XLSX');
  });
});
