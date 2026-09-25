import { describe, it, expect } from 'vitest';
import { montarPainel, filtrarLinhas, resumoDe, statusEfetivo, cicloVigente, emPercentual, type LinhaTreinamento } from '@/lib/treinamentos/agregacao';

/**
 * A CONTA do painel — sem banco.
 *
 *  - taxa sobre os APLICÁVEIS de cada pessoa (6/8 = 75%), nunca sobre todos os POPs;
 *  - ciclo vigente: agosto concluído não faz setembro concluído;
 *  - prazo vencido é atrasado, mesmo que o scheduler ainda não tenha marcado;
 *  - filtros combinam; previstos = concluídos + pendentes + atrasados.
 */

const HOJE = '2026-09-25';
const MES = '2026-09';

let seq = 0;
function linha(p: Partial<LinhaTreinamento>): LinhaTreinamento {
  seq++;
  return {
    recordId: `r${seq}`, popId: 'pop', popTitle: 'Assar Pão de Queijo', popVersion: 1, popCurrentVersion: 1, recurrence: 'ONCE',
    collaboratorId: 'joao', collaboratorName: 'João Silva', jobTitle: 'Auxiliar de Cozinha',
    unitId: 'jt', unitName: 'Jardim Teresópolis', origin: 'JOB_TITLE', status: 'PENDING', periodKey: 'V1',
    dueDate: '2026-10-02', completedAt: null,
    ...p,
  };
}

describe('resumo e taxa', () => {
  it('João: 8 aplicáveis, 6 concluídos → 75%, e os 22 POPs dos outros não entram', () => {
    const doJoao = [
      ...Array.from({ length: 6 }, (_, i) => linha({ popId: `p${i}`, status: 'DONE', completedAt: '2026-09-20T10:00:00.000Z' })),
      linha({ popId: 'p6' }),
      linha({ popId: 'p7' }),
    ];
    const r = resumoDe(doJoao, HOJE);
    expect(r).toEqual({ colaboradores: 1, previstos: 8, concluidos: 6, pendentes: 2, atrasados: 0, taxa: 75 });
    expect(emPercentual(r.taxa)).toBe('75,0%');
  });

  it('sem previstos a taxa é null (mostra "–", não 0%)', () => {
    expect(resumoDe([], HOJE).taxa).toBeNull();
    expect(emPercentual(null)).toBe('–');
  });

  it('previstos = concluídos + pendentes + atrasados', () => {
    const r = resumoDe([
      linha({ status: 'DONE' }), linha({ status: 'PENDING' }), linha({ status: 'MISSED' }),
      linha({ status: 'PENDING', dueDate: '2026-09-01' }), // vencida, ainda não marcada
    ], HOJE);
    expect(r.previstos).toBe(4);
    expect(r.concluidos + r.pendentes + r.atrasados).toBe(4);
    expect(r.atrasados).toBe(2);
  });
});

describe('status efetivo e ciclo vigente', () => {
  it('pendente com prazo vencido é ATRASADO na tela, sem esperar o scheduler', () => {
    expect(statusEfetivo(linha({ status: 'PENDING', dueDate: '2026-09-24' }), HOJE)).toBe('MISSED');
    expect(statusEfetivo(linha({ status: 'PENDING', dueDate: '2026-09-25' }), HOJE)).toBe('PENDING');
    expect(statusEfetivo(linha({ status: 'DONE', dueDate: '2026-01-01' }), HOJE)).toBe('DONE');
  });

  it('mensal: agosto concluído NÃO faz setembro concluído — cada mês é um ciclo', () => {
    const agosto = linha({ recurrence: 'MONTHLY', periodKey: '2026-08', status: 'DONE', dueDate: '2026-08-31', completedAt: '2026-08-20T12:00:00.000Z' });
    const setembro = linha({ recurrence: 'MONTHLY', periodKey: '2026-09', status: 'PENDING', dueDate: '2026-09-30' });
    expect(cicloVigente(agosto, MES)).toBe(false);
    expect(cicloVigente(setembro, MES)).toBe(true);
    const painel = montarPainel([agosto, setembro], {}, MES, HOJE);
    expect(painel.resumo).toMatchObject({ previstos: 1, concluidos: 0, pendentes: 1 });
    // com período cobrindo agosto, o histórico aparece
    const comAgosto = montarPainel([agosto, setembro], { de: '2026-08-01', ate: '2026-08-31' }, MES, HOJE);
    expect(comAgosto.resumo).toMatchObject({ previstos: 1, concluidos: 1 });
  });

  it('único: só a versão atual do POP é vigente; a versão antiga concluída fica no histórico', () => {
    const v1 = linha({ popVersion: 1, popCurrentVersion: 2, periodKey: 'V1', status: 'DONE' });
    const v2 = linha({ popVersion: 2, popCurrentVersion: 2, periodKey: 'V2', status: 'PENDING' });
    expect(filtrarLinhas([v1, v2], {}, MES, HOJE).map((l) => l.periodKey)).toEqual(['V2']);
  });
});

describe('filtros combinados', () => {
  const base = [
    linha({ unitId: 'jt', unitName: 'Jardim Teresópolis', collaboratorId: 'joao', collaboratorName: 'João', status: 'DONE', completedAt: '2026-09-22T00:00:00.000Z' }),
    linha({ unitId: 'mo', unitName: 'Moreira', collaboratorId: 'maria', collaboratorName: 'Maria', jobTitle: 'Atendente', status: 'PENDING' }),
    linha({ unitId: 'mo', unitName: 'Moreira', collaboratorId: 'carlos', collaboratorName: 'Carlos', jobTitle: 'Churrasqueiro', origin: 'INDIVIDUAL', status: 'DONE', completedAt: '2026-09-24T00:00:00.000Z' }),
    linha({ unitId: 'jt', unitName: 'Jardim Teresópolis', collaboratorId: 'ana', collaboratorName: 'Ana', popId: 'salao', popTitle: 'Abertura do Salão', status: 'PENDING' }),
  ];

  it('Unidade + Treinamento + Status pendente → só quem deveria fazer e ainda não fez', () => {
    const r = filtrarLinhas(base, { unitId: 'mo', popId: 'pop', status: 'pendente' }, MES, HOJE);
    expect(r.map((l) => l.collaboratorName)).toEqual(['Maria']);
  });

  it('por unidade soma certo e ordena a pior primeiro', () => {
    const p = montarPainel(base, {}, MES, HOJE);
    expect(p.porUnidade.map((u) => `${u.unitName}:${u.concluidos}/${u.previstos}`)).toEqual(['Jardim Teresópolis:1/2', 'Moreira:1/2']);
    expect(p.porTreinamento.find((t) => t.popId === 'pop')).toMatchObject({ previstos: 3, concluidos: 2, pendentes: 1, taxa: 66.7 });
  });

  it('por colaborador traz a origem de cada item e as pendências saem só com o que falta', () => {
    const p = montarPainel(base, {}, MES, HOJE);
    const carlos = p.porColaborador.find((c) => c.collaboratorId === 'carlos')!;
    expect(carlos.itens[0].origin).toBe('INDIVIDUAL');
    expect(p.pendencias.map((l) => l.collaboratorName)).toEqual(['Ana', 'Maria']);
  });
});
