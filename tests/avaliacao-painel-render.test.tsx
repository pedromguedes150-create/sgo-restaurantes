import { describe, it, expect, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/modulos/pessoas/avaliacao',
}));

import { renderToString } from 'react-dom/server';
import React from 'react';
import { PainelAvaliacaoClient } from '@/components/people/painel-avaliacao-client';
import { RevisaoDaAvaliacao } from '@/components/people/pdi-revisao';
import { montarPainel } from '@/lib/people/avaliacao-painel-calculo';

/** Painel + revisão (v1.162.0): o que a tela diz antes de qualquer clique. */
const semSeparadores = (html: string) => html.replace(/<!--[\s\S]*?-->/g, '');

describe('Painel de avaliação', () => {
  it('indicadores, tabelas, Excel e PDF com o mesmo filtro', () => {
    const painel = montarPainel(
      [{ id: 'e1', collaboratorId: 'c1', collaboratorName: 'Ana Cozinheira', unitId: 'u1', unitName: 'Centro', yearMonth: '2026-10', nota: 2.1, classificacao: 'MELHORAR', funcao: 'Cozinheiro', evaluatorName: 'Ger', respostas: [{ key: 'pontualidade', label: 'Pontualidade e assiduidade', score: 1 }], revisaoAberta: true }],
      [{ unitId: 'u1', unitName: 'Centro', ativos: 4 }],
      [{ id: 'p1', collaboratorId: 'c1', collaboratorName: 'Ana Cozinheira', unitId: 'u1', unitName: 'Centro', yearMonth: '2026-10', criterionLabel: 'Pontualidade e assiduidade', action: 'Acompanhar o ponto', responsibleName: 'Sup', dueDate: '2026-09-01', status: 'PENDING', completedAt: null }],
      ['2026-09', '2026-10'], '2026-10-08',
    );
    const filtro = { de: '2026-09', ate: '2026-10', unitId: null, funcao: null, colaborador: null };
    const html = semSeparadores(renderToString(<PainelAvaliacaoClient painel={painel} filtro={filtro} unidades={[{ id: 'u1', name: 'Centro' }]} funcoes={['Cozinheiro']} meses={['2026-10', '2026-09']} />));
    expect(html).toContain('data-testid="kpi-abaixo"');
    expect(html).toContain('Ana Cozinheira');
    expect(html).toContain('Pontualidade e assiduidade');
    expect(html).toContain('Vencido');
    expect(html).toContain('/api/people/evaluation/painel/export?de=2026-09&amp;ate=2026-10');
    expect(html).toContain('/modulos/pessoas/avaliacao/relatorio?de=2026-09&amp;ate=2026-10&amp;imprimir=1');
    expect(html).toContain('12,5%'); // cobertura: 1 ÷ (4 × 2)
  });
});

describe('Revisão da avaliação', () => {
  it('a Supervisão vê o botão; o avaliador vê o motivo enquanto estiver aberta', () => {
    const sup = semSeparadores(renderToString(<RevisaoDaAvaliacao evaluationId="e1" revisao={null} podeRevisar />));
    expect(sup).toContain('Solicitar revisão');
    const aberta = semSeparadores(renderToString(<RevisaoDaAvaliacao evaluationId="e1" revisao={{ porNome: 'Sup', em: '2026-10-08T10:00:00Z', motivo: 'Não bate com a Escala', resolvidaEm: null }} podeRevisar={false} />));
    expect(aberta).toContain('data-testid="revisao-aberta"');
    expect(aberta).toContain('Não bate com a Escala');
    expect(aberta).not.toContain('Solicitar revisão');
    const resolvida = semSeparadores(renderToString(<RevisaoDaAvaliacao evaluationId="e1" revisao={{ porNome: 'Sup', em: '2026-10-08T10:00:00Z', motivo: 'x', resolvidaEm: '2026-10-09T10:00:00Z' }} podeRevisar />));
    expect(resolvida).toContain('atendida em 09/10/2026');
    expect(resolvida).toContain('Solicitar revisão');
  });
});
