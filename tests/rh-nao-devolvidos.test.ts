import { describe, it, expect } from 'vitest';
import {
  situacaoNaBaseGeral, contarAusencia, travaDeSeguranca, apareceNaGrade, diaDepoisDaSaida,
  RODADAS_PARA_INATIVAR, TETO_INATIVACAO_POR_AUSENCIA, SEM_AUSENCIA, type PessoaNaBaseGeral,
} from '@/lib/rh/nao-devolvidos';
import { diaAindaConta, totaisDaLinha, type LinhaDaGrade } from '@/lib/schedule/grade-filtros';

/**
 * Quem a unidade não devolveu (v1.171.0) — a regra PURA. O ponto fixo: só o
 * STATUS do RH inativa na hora; ausência conta dias e tem teto.
 */
const desligado = (s: string | null) => /^deslig|demitid|rescis/i.test((s ?? '').trim());
const base = (xs: PessoaNaBaseGeral[]) => new Map(xs.map((p) => [p.matricula, p]));
const razoes = new Set(['CHURRASCARIA JT LTDA', 'BEIJA FLOR JT ME']);

describe('situacaoNaBaseGeral', () => {
  it('a Julia desligada na base geral → DESLIGADO_NO_RH (sai na hora)', () => {
    const b = base([{ matricula: '207119', status: 'Desligado', unidade: 'CHURRASCARIA JT LTDA' }]);
    expect(situacaoNaBaseGeral('207119', b, razoes, desligado)).toEqual({ tipo: 'DESLIGADO_NO_RH', status: 'Desligado' });
  });
  it('ativa em OUTRA razão social → TRANSFERIDO, com a razão', () => {
    const b = base([{ matricula: '1', status: 'Ativo', unidade: 'COMERCIAL ORLA LTDA' }]);
    expect(situacaoNaBaseGeral('1', b, razoes, desligado)).toEqual({ tipo: 'TRANSFERIDO', razao: 'COMERCIAL ORLA LTDA', status: 'Ativo' });
  });
  it('ativa numa razão DESTA unidade → PRESENTE (a lista da unidade é que veio incompleta)', () => {
    const b = base([{ matricula: '1', status: 'Ativo', unidade: 'BEIJA FLOR JT ME' }]);
    expect(situacaoNaBaseGeral('1', b, razoes, desligado)).toEqual({ tipo: 'PRESENTE', razao: 'BEIJA FLOR JT ME' });
  });
  it('não está em lugar nenhum → AUSENTE; ativa sem razão social também só conta', () => {
    expect(situacaoNaBaseGeral('9', base([]), razoes, desligado)).toEqual({ tipo: 'AUSENTE' });
    expect(situacaoNaBaseGeral('1', base([{ matricula: '1', status: 'Ativo', unidade: null }]), razoes, desligado)).toEqual({ tipo: 'AUSENTE' });
  });
});

describe('contarAusencia', () => {
  it('conta DIAS distintos: duas sincronizações no mesmo dia valem uma; confirma no 3º dia', () => {
    const d1 = contarAusencia(SEM_AUSENCIA, '2026-10-14');
    expect(d1).toEqual({ since: '2026-10-14', lastDay: '2026-10-14', days: 1, confirmada: false });
    const d1b = contarAusencia(d1, '2026-10-14'); // clique manual no mesmo dia
    expect(d1b.days).toBe(1);
    const d2 = contarAusencia(d1b, '2026-10-15');
    expect(d2.days).toBe(2);
    expect(d2.confirmada).toBe(false);
    const d3 = contarAusencia(d2, '2026-10-16');
    expect(d3).toEqual({ since: '2026-10-14', lastDay: '2026-10-16', days: 3, confirmada: true });
    expect(RODADAS_PARA_INATIVAR).toBe(3);
  });
  it('um buraco de dias sem sync não zera — o que zera é VOLTAR a aparecer', () => {
    const d2 = { since: '2026-10-10', lastDay: '2026-10-11', days: 2 };
    expect(contarAusencia(d2, '2026-10-20').confirmada).toBe(true);
  });
});

describe('travaDeSeguranca (30% da unidade)', () => {
  it('com 20 ativos, 6 passam e 7 travam; com 2 ativos, 1 passa e 2 travam; zero nunca trava', () => {
    expect(TETO_INATIVACAO_POR_AUSENCIA).toBe(0.3);
    expect(travaDeSeguranca(6, 20)).toBe(false);
    expect(travaDeSeguranca(7, 20)).toBe(true);
    expect(travaDeSeguranca(1, 2)).toBe(false);
    expect(travaDeSeguranca(2, 2)).toBe(true);
    expect(travaDeSeguranca(0, 0)).toBe(false);
    /* o cenário dos 49: 49 de ~60 */
    expect(travaDeSeguranca(49, 60)).toBe(true);
  });
});

describe('a grade da Escala e quem saiu', () => {
  it('quem saiu no mês aparece; quem saiu antes do mês ou sem data, não', () => {
    expect(apareceNaGrade({ active: true, inactiveSince: null }, '2026-10-01')).toBe(true);
    expect(apareceNaGrade({ active: false, inactiveSince: '2026-10-16' }, '2026-10-01')).toBe(true);
    expect(apareceNaGrade({ active: false, inactiveSince: '2026-09-30' }, '2026-10-01')).toBe(false);
    expect(apareceNaGrade({ active: false, inactiveSince: null }, '2026-10-01')).toBe(false);
    expect(diaDepoisDaSaida('2026-10-16', '2026-10-15')).toBe(false);
    expect(diaDepoisDaSaida('2026-10-16', '2026-10-16')).toBe(true);
  });
  it('os totais da linha param no dia da saída', () => {
    const dias = Array.from({ length: 31 }, () => ({ planned: 'WORK' as const, actual: 'WORK' as const }));
    const linha: LinhaDaGrade = { collaboratorId: 'c', name: 'Julia', jobTitle: null, typeLabel: '6x1', shiftLabel: null, days: dias, inactiveDay: 16 };
    expect(diaAindaConta(linha, 15)).toBe(true);
    expect(diaAindaConta(linha, 16)).toBe(false);
    expect(totaisDaLinha(linha, 'planejado').trabalho).toBe(15);
    expect(totaisDaLinha({ ...linha, inactiveDay: null }, 'planejado').trabalho).toBe(31);
  });
});
