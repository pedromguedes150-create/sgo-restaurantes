import { describe, it, expect } from 'vitest';
import {
  candidatosDeVinculo, evolucaoMensal, lerFiltroHE, linhasAnalitico, linhasSintetico, mesesDoPeriodo, porMotivo, porStatus,
  queryDoFiltroHE, resolverPeriodoHE, resumirHE, sintetico, COLUNAS_ANALITICO, COLUNAS_SINTETICO, type HoraExtra,
} from '@/lib/hora-extra/calculo';

/**
 * HORA EXTRA — a conta, sem banco.
 *
 * O pedido do Pedro: a planilha duplicava a Vera ("Vera Lucia", "Vera Lúcia",
 * "Vera dos Anjos") e saía sem CPF e matrícula. O sintético agrupa pelo
 * CADASTRO quando há vínculo; sem vínculo, pelo nome — e a coluna "Vínculo RH"
 * aponta quem ainda está assim.
 */

const he = (over: Partial<HoraExtra> = {}): HoraExtra => ({
  id: 'h1', unitId: 'u1', unidade: 'Beija Flor Centro', collaboratorId: 'c-vera', colaborador: 'Vera Lúcia dos Anjos',
  matricula: '1234', cpf: '09494305604', dia: '2026-09-15', inicio: '18:00', fim: '21:00', horas: 3, valorHora: 15, vt: 0, valor: 45,
  motivoId: 'm-escala', motivo: 'Escala incompleta', detalhe: null, status: 'APPROVED', solicitante: 'Ger', aprovador: 'Sup',
  motivoReprovacao: null, criadoEm: '2026-09-16T10:00:00.000Z', ...over,
});

describe('período', () => {
  it('"Mês atual" vai do dia 1 ao ÚLTIMO dia do mês; "3 meses" começa no dia 1 de dois meses atrás', () => {
    expect(resolverPeriodoHE({ periodo: 'mes' }, '2026-10-02')).toMatchObject({ de: '2026-10-01', ate: '2026-10-31' });
    expect(resolverPeriodoHE({ periodo: '3m' }, '2026-10-02')).toMatchObject({ de: '2026-08-01', ate: '2026-10-31' });
    expect(resolverPeriodoHE({ periodo: '6m' }, '2026-02-10')).toMatchObject({ de: '2025-09-01', ate: '2026-02-28' });
    expect(resolverPeriodoHE({ periodo: 'ano' }, '2026-10-02')).toMatchObject({ de: '2026-01-01', ate: '2026-12-31' });
  });

  it('personalizado: fim antes do início vira o próprio início; sem fim, o fim do mês de hoje', () => {
    expect(resolverPeriodoHE({ periodo: 'personalizado', de: '2026-09-10', ate: '2026-09-01' }, '2026-10-02')).toMatchObject({ de: '2026-09-10', ate: '2026-09-10' });
    expect(resolverPeriodoHE({ periodo: 'personalizado', de: '2026-09-10' }, '2026-10-02')).toMatchObject({ de: '2026-09-10', ate: '2026-10-31' });
    expect(mesesDoPeriodo({ de: '2026-08-01', ate: '2026-10-31' })).toEqual(['2026-08', '2026-09', '2026-10']);
  });

  it('o filtro vai e volta pela URL sem perder nada', () => {
    const q = queryDoFiltroHE({ aba: 'solicitacoes', periodo: 'personalizado', de: '2026-09-01', ate: '2026-09-30', unitId: 'u1', status: 'PAID', motivo: 'outro', q: 'vera' });
    const f = lerFiltroHE(new URLSearchParams(q));
    expect(f).toEqual({ aba: 'solicitacoes', periodo: 'personalizado', de: '2026-09-01', ate: '2026-09-30', unitId: 'u1', status: 'PAID', motivo: 'outro', q: 'vera', mes: undefined });
    expect(lerFiltroHE(new URLSearchParams('periodo=x&status=y&aba=z')).periodo).toBe('mes');
    expect(queryDoFiltroHE({ periodo: 'mes', status: 'TODOS', motivo: '', q: '' })).toBe('');
  });
});

describe('KPIs', () => {
  it('reprovada fica fora de tudo; pendente conta no total e no aviso; ticket/hora = valor ÷ horas', () => {
    const r = resumirHE([
      he({ id: '1', status: 'PAID', valor: 45, horas: 3 }),
      he({ id: '2', status: 'APPROVED', valor: 30, horas: 2 }),
      he({ id: '3', status: 'PENDING', valor: 15, horas: 1 }),
      he({ id: '4', status: 'REJECTED', valor: 999, horas: 9 }),
    ]);
    expect(r).toMatchObject({ valorTotal: 90, totalPago: 45, aPagar: 30, horas: 6, solicitacoes: 3, reprovadas: 1, mediaPorSolicitacao: 30, valorPorHora: 15, pendentes: { qtd: 1, valor: 15 }, colaboradores: 1, semVinculo: 0 });
    expect(resumirHE([]).valorPorHora).toBeNull();
  });

  it('comparativo por motivo: HE antiga sem catálogo cai em "Outro" mantendo o texto; ordem por valor; % fecha', () => {
    const m = porMotivo([
      he({ id: '1', valor: 45 }),
      he({ id: '2', valor: 30, motivoId: 'm-janta', motivo: 'Hora de janta' }),
      he({ id: '3', valor: 25, motivoId: null, motivo: 'Outro', detalhe: 'cobriu o Carlos' }),
      he({ id: '4', valor: 500, status: 'REJECTED' }),
    ]);
    expect(m.map((x) => [x.motivo, x.valor, x.pct])).toEqual([['Escala incompleta', 45, 45], ['Hora de janta', 30, 30], ['Outro', 25, 25]]);
    expect(m[2].motivoId).toBeNull();
  });

  it('status conta TODAS, inclusive reprovadas; evolução tem um ponto por mês do período (zero, não buraco)', () => {
    const xs = [he({ id: '1', status: 'PAID' }), he({ id: '2', status: 'REJECTED', dia: '2026-08-02' }), he({ id: '3', status: 'PENDING', dia: '2026-10-01', valor: 10 })];
    expect(porStatus(xs).map((s) => [s.status, s.qtd])).toEqual([['APPROVED', 0], ['PAID', 1], ['PENDING', 1], ['REJECTED', 1]]);
    const ev = evolucaoMensal(xs, ['2026-08', '2026-09', '2026-10']);
    expect(ev.map((e) => [e.rotulo, e.valor, e.qtd])).toEqual([['ago/26', 0, 0], ['set/26', 45, 1], ['out/26', 10, 1]]);
  });
});

describe('o arquivo: Analítico + Sintético', () => {
  const vera3 = [
    he({ id: '1', dia: '2026-09-10', valor: 45, horas: 3, status: 'PAID' }),
    he({ id: '2', dia: '2026-09-12', valor: 22.5, horas: 1.5 }),
    he({ id: '3', dia: '2026-09-20', valor: 30, horas: 2, unitId: 'u2', unidade: 'Beija Flor Orla', status: 'PENDING' }),
  ];

  it('a Vera fez 3: o analítico tem as 3 linhas com matrícula e CPF; o sintético tem UMA, com a soma e as unidades', () => {
    const a = linhasAnalitico(vera3);
    expect(a[0]).toEqual([...COLUNAS_ANALITICO]);
    expect(a).toHaveLength(4);
    expect(a[1].slice(0, 6)).toEqual([1, '1234', '094.943.056-04', 'Vera Lúcia dos Anjos', 'Beija Flor Centro', '10/09/2026']);
    expect(a[1][17]).toBe('2026-10'); // competência = mês seguinte ao trabalho
    expect(a[1][18]).toBe('Sim');

    const s = sintetico(vera3);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ matricula: '1234', colaborador: 'Vera Lúcia dos Anjos', unidades: ['Beija Flor Centro', 'Beija Flor Orla'], qtd: 3, horas: 6.5, valor: 97.5, pago: 45, aPagar: 22.5, pendente: 30 });
    const linhas = linhasSintetico(vera3);
    expect(linhas[0]).toEqual([...COLUNAS_SINTETICO]);
    expect(linhas.at(-1)).toEqual(['', '', 'TOTAL', '', 3, 6.5, 97.5, 45, 22.5, 30, '']);
  });

  it('SEM vínculo, "Vera Lucia" e "Vera Lúcia" são a mesma linha (nome normalizado) mas "Vera dos Anjos" é outra — e a coluna diz "Não"', () => {
    const s = sintetico([
      he({ id: '1', collaboratorId: null, matricula: null, cpf: null, colaborador: 'Vera Lucia' }),
      he({ id: '2', collaboratorId: null, matricula: null, cpf: null, colaborador: 'Vera Lúcia ' }),
      he({ id: '3', collaboratorId: null, matricula: null, cpf: null, colaborador: 'Vera dos Anjos' }),
      he({ id: '4', status: 'REJECTED' }),
    ]);
    expect(s.map((l) => [l.colaborador, l.qtd, l.collaboratorId])).toEqual([['Vera dos Anjos', 1, null], ['Vera Lucia', 2, null]]);
    const linhas = linhasSintetico(s.length ? [he({ id: '1', collaboratorId: null, matricula: null, cpf: null, colaborador: 'Vera Lucia' })] : []);
    expect(linhas[1][0]).toBe('');
    expect(linhas[1].at(-1)).toBe('Não');
  });
});

describe('vínculo com o RH', () => {
  const cadastro = [
    { id: 'a', name: 'Vera Lúcia dos Anjos' },
    { id: 'b', name: 'Vera Lucia' },
    { id: 'c', name: 'Alessandra Cruz' },
    { id: 'd', name: 'ALESSANDRA' },
  ];

  it('EXATO só com o nome inteiro igual (sem acento/caixa); PARECIDO quando todos os tokens digitados estão no cadastro', () => {
    expect(candidatosDeVinculo('vera lúcia', cadastro)).toEqual({ exatos: [cadastro[1]], parecidos: [cadastro[0]] });
    expect(candidatosDeVinculo('Alessandra', cadastro).exatos).toEqual([cadastro[3]]);
    expect(candidatosDeVinculo('Alessandra', cadastro).parecidos).toEqual([cadastro[2]]);
    expect(candidatosDeVinculo('Vera dos Anjos', cadastro)).toEqual({ exatos: [], parecidos: [cadastro[0]] });
    expect(candidatosDeVinculo('', cadastro)).toEqual({ exatos: [], parecidos: [] });
  });

  it('dois exatos = ambiguidade (o automático não decide)', () => {
    const r = candidatosDeVinculo('Vera Lucia', [...cadastro, { id: 'e', name: 'Vera Lúcia' }]);
    expect(r.exatos.map((c) => c.id)).toEqual(['b', 'e']);
  });
});
