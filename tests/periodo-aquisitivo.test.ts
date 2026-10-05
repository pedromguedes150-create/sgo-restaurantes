import { describe, it, expect } from 'vitest';
import {
  datasDoEvento, faixaDeFerias, MAX_DIAS_ABONO, periodoEmFoco, periodosAquisitivos, tempoDeEmpresa,
} from '@/lib/people/periodo-aquisitivo';

/**
 * Período aquisitivo (v1.153.0) — derivado da admissão do RH pela CLT.
 * O que se trava: as datas dos períodos, o gozo abatendo do mais antigo, a
 * venda de até 10 dias (tirou 20 e vendeu 10 = quitado), e que período
 * anterior ao SGO NÃO vira "vencido" (o SGO não tem as férias de antes).
 */
const CONTROLE = '2026-06-12';

describe('períodos pela admissão', () => {
  it('12 meses para adquirir e 12 para conceder', () => {
    const [p1, p2] = periodosAquisitivos('2025-03-10', [], '2026-10-05', CONTROLE);
    expect(p1).toMatchObject({ numero: 1, inicio: '2025-03-10', fim: '2026-03-09', limite: '2027-03-09', situacao: 'A_VENCER', saldo: 30 });
    expect(p2).toMatchObject({ inicio: '2026-03-10', fim: '2027-03-09', situacao: 'EM_AQUISICAO' });
  });
  it('sem admissão (ou admissão no futuro) não há período', () => {
    expect(periodosAquisitivos(null, [], '2026-10-05')).toEqual([]);
    expect(periodosAquisitivos('2027-01-01', [], '2026-10-05')).toEqual([]);
  });
  it('29/02 cai em 28/02 no ano comum', () => {
    const [p1] = periodosAquisitivos('2024-02-29', [], '2026-10-05', CONTROLE);
    expect(p1.fim).toBe('2025-02-27');
  });
});

describe('vencidas e o que o SGO não sabe', () => {
  it('passou do limite sem gozo = VENCIDO', () => {
    const [p1] = periodosAquisitivos('2024-08-20', [], '2026-10-05', CONTROLE);
    expect(p1.situacao).toBe('VENCIDO');
    expect(p1.diasParaVencer).toBeLessThan(0);
    expect(faixaDeFerias(periodoEmFoco([p1]), true)).toBe('VENCIDA');
  });
  it('período que venceu ANTES de o SGO registrar férias não é julgado', () => {
    const ps = periodosAquisitivos('2020-01-15', [], '2026-10-05', CONTROLE);
    expect(ps.filter((p) => p.limite < CONTROLE).every((p) => p.situacao === 'ANTERIOR_AO_SGO')).toBe(true);
    expect(ps.some((p) => p.situacao === 'VENCIDO')).toBe(false);
  });
  it('o gozo de hoje não é abatido de período anterior ao SGO', () => {
    const ps = periodosAquisitivos('2022-04-06', [{ inicio: '2026-07-01', fim: '2026-07-20' }], '2026-10-05', CONTROLE);
    const atual = ps.find((p) => p.inicio === '2025-04-06')!;
    expect(atual.diasGozados).toBe(20);
    expect(atual.saldo).toBe(10);
    expect(ps.find((p) => p.inicio === '2022-04-06')!.diasGozados).toBe(0);
  });
});

describe('gozo e venda (abono pecuniário)', () => {
  it('tirou 20 e vendeu 10 = período QUITADO', () => {
    const ps = periodosAquisitivos('2024-11-01', [{ inicio: '2026-07-01', fim: '2026-07-20' }], '2026-10-05', CONTROLE, [{ periodoInicio: '2024-11-01', dias: 10 }]);
    expect(ps[0]).toMatchObject({ diasGozados: 20, diasVendidos: 10, saldo: 0, situacao: 'QUITADO' });
  });
  it('a venda nunca passa de 1/3 (10 dias)', () => {
    expect(MAX_DIAS_ABONO).toBe(10);
    const [p] = periodosAquisitivos('2024-11-01', [], '2026-10-05', CONTROLE, [{ periodoInicio: '2024-11-01', dias: 15 }]);
    expect(p.diasVendidos).toBe(10);
    expect(p.saldo).toBe(20);
  });
  it('férias programadas no futuro não quitam ainda', () => {
    const [p] = periodosAquisitivos('2024-11-01', [{ inicio: '2026-12-01', fim: '2026-12-30' }], '2026-10-05', CONTROLE);
    expect(p.saldo).toBe(30);
  });
  it('gozo em andamento conta só até hoje', () => {
    const [p] = periodosAquisitivos('2024-11-01', [{ inicio: '2026-10-01', fim: '2026-10-30' }], '2026-10-05', CONTROLE);
    expect(p.diasGozados).toBe(5);
  });
  it('gozo abate do período mais antigo primeiro', () => {
    const ps = periodosAquisitivos('2023-11-01', [{ inicio: '2026-07-01', fim: '2026-07-30' }, { inicio: '2026-09-01', fim: '2026-09-10' }], '2026-10-05', CONTROLE);
    // 2023-11: o concessivo acabou em 31/10/2025, antes do SGO — não recebe gozo
    expect(ps[0]).toMatchObject({ situacao: 'ANTERIOR_AO_SGO', diasGozados: 0 });
    expect(ps[1]).toMatchObject({ inicio: '2024-11-01', diasGozados: 30, saldo: 0, situacao: 'QUITADO' });
    expect(ps[2]).toMatchObject({ inicio: '2025-11-01', diasGozados: 10, saldo: 20 }); // os 10 de setembro sobram para o seguinte
  });
});

describe('faixa e foco', () => {
  it('a vencer em até 30/60/90 dias', () => {
    const p = (dias: number) => ({ situacao: 'A_VENCER' as const, diasParaVencer: dias }) as never;
    expect(faixaDeFerias(p(10), true)).toBe('ATE_30');
    expect(faixaDeFerias(p(45), true)).toBe('ATE_60');
    expect(faixaDeFerias(p(80), true)).toBe('ATE_90');
    expect(faixaDeFerias(p(200), true)).toBe('EM_DIA');
    expect(faixaDeFerias(null, false)).toBe('SEM_ADMISSAO');
  });
  it('o foco é o vencido mais antigo antes do a vencer', () => {
    const ps = periodosAquisitivos('2024-08-20', [], '2026-10-05', CONTROLE);
    expect(periodoEmFoco(ps)?.situacao).toBe('VENCIDO');
  });
});

describe('tempo de empresa e eventos do RH', () => {
  it('anos e meses até hoje', () => {
    expect(tempoDeEmpresa('2022-04-06', '2026-10-05')?.texto).toBe('4 anos e 5 meses');
    expect(tempoDeEmpresa('2026-09-20', '2026-10-05')?.texto).toBe('0 meses');
    expect(tempoDeEmpresa('2025-10-05', '2026-10-05')?.texto).toBe('1 ano');
  });
  it('lê datas do evento do RH sem conhecer o formato', () => {
    const datas = datasDoEvento({ cpf: '123', periodo: { inicio: '2025-04-06', fim: '05/04/2026' }, nome: 'X' });
    expect(datas).toEqual([{ campo: 'periodo.inicio', data: '2025-04-06' }, { campo: 'periodo.fim', data: '2026-04-05' }]);
  });
});

describe('dias informados à mão (v1.154.0)', () => {
  it('período anterior ao SGO com dias informados passa a ser julgado', () => {
    const [p1] = periodosAquisitivos('2022-03-01', [], '2026-10-05', CONTROLE, [], [{ periodoInicio: '2022-03-01', diasGozados: 20 }]);
    expect(p1).toMatchObject({ informado: true, diasInformados: 20, saldo: 10, situacao: 'VENCIDO' });
  });
  it('30 dias informados quitam; sem informação o anterior segue fora da conta', () => {
    const ps = periodosAquisitivos('2022-03-01', [], '2026-10-05', CONTROLE, [], [{ periodoInicio: '2022-03-01', diasGozados: 30 }]);
    expect(ps[0].situacao).toBe('QUITADO');
    expect(ps[1].situacao).toBe('ANTERIOR_AO_SGO');
  });
  it('informado + vendido nunca passa de 30', () => {
    const [p] = periodosAquisitivos('2024-11-01', [], '2026-10-05', CONTROLE, [{ periodoInicio: '2024-11-01', dias: 10 }], [{ periodoInicio: '2024-11-01', diasGozados: 30 }]);
    expect(p).toMatchObject({ diasVendidos: 10, diasInformados: 20, saldo: 0 });
  });
  it('período informado também recebe gozo do SGO (não é pulado como anterior)', () => {
    const ps = periodosAquisitivos('2022-03-01', [{ inicio: '2026-07-01', fim: '2026-07-10' }], '2026-10-05', CONTROLE, [], [{ periodoInicio: '2022-03-01', diasGozados: 20 }]);
    expect(ps[0]).toMatchObject({ diasGozados: 30, saldo: 0, situacao: 'QUITADO' });
  });
});
