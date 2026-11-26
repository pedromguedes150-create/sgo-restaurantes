import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { agruparRecorrentes } from '@/lib/payments/consolidado-executivo';
import { BarrasDiarias } from '@/components/waste/graficos';
import type { RecorrenteNaSemana } from '@/lib/payments/consolidado-tipos';

const rec = (over: Partial<RecorrenteNaSemana>): RecorrenteNaSemana => ({
  chave: Math.random().toString(36), freelancerId: 'f1', nome: 'Fulano', cpf: null, pixKey: null, unidades: ['Unidade A'],
  semanaDe: '2026-11-02', semanaAte: '2026-11-08', solicitacoes: 5, valor: 500, ...over,
});

describe('recorrentes — um cartão por pessoa (v1.225.0)', () => {
  it('junta as semanas do mesmo freelancer, soma e ordena pelo valor', () => {
    const g = agruparRecorrentes([
      rec({ semanaDe: '2026-11-09', semanaAte: '2026-11-15', solicitacoes: 6, valor: 600 }),
      rec({ semanaDe: '2026-11-02', semanaAte: '2026-11-08', solicitacoes: 5, valor: 500, unidades: ['Unidade B'] }),
      rec({ freelancerId: 'f2', nome: 'Beltrano', solicitacoes: 7, valor: 900 }),
    ]);
    expect(g.map((x) => [x.nome, x.solicitacoes, x.valor, x.semanas.length])).toEqual([['Fulano', 11, 1100, 2], ['Beltrano', 7, 900, 1]]);
    expect(g[0].semanas.map((s) => s.de)).toEqual(['2026-11-02', '2026-11-09']);
    expect(g[0].unidades).toEqual(['Unidade A', 'Unidade B']);
    expect(agruparRecorrentes([])).toEqual([]);
  });

  it('a tela usa os cartões, mantém os totais e o detalhe ao tocar', () => {
    const fonte = readFileSync('src/components/payments/consolidado-client.tsx', 'utf8');
    expect(fonte).toContain('agruparRecorrentes(dados.recorrentesNaSemana)');
    expect(fonte).toContain('data-testid="cartoes-recorrentes"');
    expect(fonte).toContain('data-testid="resumo-recorrentes"');
    expect(fonte).toContain('data-testid="evolucao-do-periodo"');
    expect(fonte).not.toContain('caption="Freelancers recorrentes na semana"');
  });
});

describe('gráfico diário do desperdício (v1.225.0)', () => {
  const pontos = [
    { date: '2026-11-01', total: 10, lancamentos: 1 }, // domingo
    { date: '2026-11-02', total: 0, lancamentos: 0 },
    { date: '2026-11-03', total: 40, lancamentos: 2 },
  ];
  it('tem altura fixa (não estica com a largura), marca o pico e a média de referência', () => {
    const h = renderToString(<BarrasDiarias pontos={pontos} referencia={20} unidade="un." rotuloReferencia="média/dia de outubro" />);
    expect(h).toContain('role="img"');
    expect(h).toContain('h-48');
    expect(h).not.toContain('<svg');
    expect(h).toContain('média/dia de outubro');
    expect(h).toContain('>40<');
    expect(h).toContain('sem lançamento');
  });
  it('mês sem dia nenhum não quebra', () => {
    expect(renderToString(<BarrasDiarias pontos={[]} referencia={null} unidade="kg" />)).toContain('ainda não começou');
  });
  it('o topo da Performance é o veredito em destaque', () => {
    const fonte = readFileSync('src/components/waste/painel-performance.tsx', 'utf8');
    expect(fonte).toContain('data-testid="hero-performance"');
    expect(fonte).toContain('data-testid="kpi-veredito"');
  });
});
