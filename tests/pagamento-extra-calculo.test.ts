import { describe, it, expect } from 'vitest';
import {
  competenciaDaHoraExtra, limitesDoMes, mesTrabalhadoDa, rotuloDaCompetencia, somarMeses, somarPorColaborador,
  type HoraExtraDoQuadro,
} from '@/lib/people/pagamento-extra-calculo';

/**
 * A REGRA DO PAGAMENTO EXTRA: competência = mês SEGUINTE ao dia trabalhado.
 * "O funcionário faz hora extra durante o mês e recebe no mês seguinte."
 */
describe('Competência da hora extra = mês seguinte ao trabalho', () => {
  it('trabalhou em setembro → competência outubro', () => {
    expect(competenciaDaHoraExtra('2026-09-15')).toBe('2026-10');
    expect(competenciaDaHoraExtra('2026-09-01')).toBe('2026-10');
    expect(competenciaDaHoraExtra('2026-09-30')).toBe('2026-10');
  });

  it('vira o ano: dezembro → janeiro do ano seguinte', () => {
    expect(competenciaDaHoraExtra('2026-12-31')).toBe('2027-01');
  });

  it('aceita data com hora e recusa lixo', () => {
    expect(competenciaDaHoraExtra('2026-09-15T12:00:00.000Z')).toBe('2026-10');
    expect(competenciaDaHoraExtra('')).toBeNull();
    expect(competenciaDaHoraExtra('15/09/2026')).toBeNull();
  });

  it('o inverso fecha: a competência outubro paga o mês de setembro', () => {
    expect(mesTrabalhadoDa('2026-10')).toBe('2026-09');
    expect(mesTrabalhadoDa('2027-01')).toBe('2026-12');
    expect(mesTrabalhadoDa('2026-9')).toBeNull();
  });

  it('somarMeses anda para os dois lados', () => {
    expect(somarMeses('2026-01', -1)).toBe('2025-12');
    expect(somarMeses('2026-11', 3)).toBe('2027-02');
    expect(somarMeses('2026-06', 0)).toBe('2026-06');
  });
});

describe('Limites e rótulo do mês', () => {
  it('primeiro e último dia, inclusive fevereiro bissexto', () => {
    expect(limitesDoMes('2026-09')).toEqual({ de: '2026-09-01', ate: '2026-09-30' });
    expect(limitesDoMes('2028-02')).toEqual({ de: '2028-02-01', ate: '2028-02-29' });
    expect(limitesDoMes('x')).toBeNull();
  });

  it('rótulo em português', () => {
    expect(rotuloDaCompetencia('2026-10')).toBe('outubro de 2026');
    expect(rotuloDaCompetencia('lixo')).toBe('lixo');
  });
});

const he = (over: Partial<HoraExtraDoQuadro>): HoraExtraDoQuadro => ({
  id: over.id ?? Math.random().toString(36).slice(2),
  unitId: 'u1', collaboratorId: 'c1', colaborador: 'Ana', dia: '2026-09-10',
  inicio: '18:00', fim: '21:00', horas: 3, valorHora: 15, vt: 0, valor: 45,
  status: 'APPROVED', aprovadoPor: 'Sup', aprovadoEm: new Date('2026-09-11T10:00:00Z'),
  ...over,
});

describe('Soma por colaborador — uma linha por pessoa no arquivo', () => {
  it('duas HE da mesma pessoa viram UMA linha com horas e valor somados', () => {
    const r = somarPorColaborador([he({ dia: '2026-09-10', horas: 3, valor: 45 }), he({ dia: '2026-09-12', horas: 1.5, valor: 22.5 })]);
    expect(r).toHaveLength(1);
    expect(r[0].horas).toBe(4.5);
    expect(r[0].valor).toBe(67.5);
    expect(r[0].horasExtras.map((h) => h.dia)).toEqual(['2026-09-10', '2026-09-12']);
  });

  it('a mesma pessoa em duas unidades é duas linhas (a unidade é coluna do arquivo)', () => {
    const r = somarPorColaborador([he({ unitId: 'u1' }), he({ unitId: 'u2' })]);
    expect(r).toHaveLength(2);
  });

  it('HE antiga sem colaborador do RH agrupa pelo NOME', () => {
    const r = somarPorColaborador([
      he({ collaboratorId: null, colaborador: 'João Silva' }),
      he({ collaboratorId: null, colaborador: 'joão silva ' }),
      he({ collaboratorId: null, colaborador: 'Maria' }),
    ]);
    expect(r.map((x) => x.colaborador)).toEqual(['João Silva', 'Maria']);
    expect(r[0].horasExtras).toHaveLength(2);
  });

  it('status da linha: tudo pago, tudo aprovado, ou misto', () => {
    expect(somarPorColaborador([he({ status: 'PAID' }), he({ status: 'PAID' })])[0].status).toBe('PAID');
    expect(somarPorColaborador([he({ status: 'APPROVED' })])[0].status).toBe('APPROVED');
    expect(somarPorColaborador([he({ status: 'PAID' }), he({ status: 'APPROVED' })])[0].status).toBe('MISTO');
  });

  it('a última aprovação é a "Data Cadastro" do arquivo', () => {
    const r = somarPorColaborador([
      he({ aprovadoEm: new Date('2026-09-11T10:00:00Z') }),
      he({ aprovadoEm: new Date('2026-09-20T10:00:00Z') }),
    ]);
    expect(r[0].ultimaAprovacaoEm?.toISOString()).toBe('2026-09-20T10:00:00.000Z');
  });

  it('centavos não acumulam erro de ponto flutuante', () => {
    const r = somarPorColaborador([he({ valor: 0.1 }), he({ valor: 0.2 })]);
    expect(r[0].valor).toBe(0.3);
  });
});
