import { describe, it, expect } from 'vitest';
import {
  filtrarLinhas, opcoesDosFiltros, resumoDaGrade, totaisDaLinha, detalheDasAusencias, linhaDivergente,
  SEM_SETOR, type LinhaDaGrade, type DayStatus,
} from '@/lib/schedule/grade-filtros';

/**
 * Os filtros, os quatro blocos e os totais da grade (Escala — fase 2).
 *
 * Nenhuma regra de escala mora aqui: as linhas já vêm montadas. O que se prova
 * é que a conta é SOBRE O QUE ESTÁ NA TELA, que "Sem setor" é filtro legítimo,
 * e que a divergência só existe onde há realizado diferente do planejado.
 */

const dias = (plan: string, real?: string): { planned: DayStatus; actual: DayStatus | null }[] => {
  const mapa: Record<string, DayStatus> = { T: 'WORK', F: 'OFF', I: 'FALTA_INJUST', J: 'FALTA_JUST', A: 'ATESTADO', E: 'FERIAS', R: 'ATRASO' };
  return [...plan].map((p, i) => ({ planned: mapa[p], actual: real && real[i] !== '.' ? mapa[real[i]] : null }));
};

const linha = (over: Partial<LinhaDaGrade> & { plan: string; real?: string }): LinhaDaGrade => ({
  collaboratorId: over.collaboratorId ?? over.name ?? 'x',
  name: over.name ?? 'ALGUÉM',
  jobTitle: over.jobTitle ?? null,
  typeLabel: over.typeLabel ?? '6x1',
  shiftLabel: over.shiftLabel ?? null,
  setores: over.setores,
  days: dias(over.plan, over.real),
});

const ana = linha({ name: 'ANA PAULA', jobTitle: 'Cozinheira', typeLabel: '6x1 Tarde', shiftLabel: '14:00–22:00', setores: ['Cozinha'], plan: 'TTTTTFT', real: 'TTTITFT' });
const bruno = linha({ name: 'BRUNO', jobTitle: 'Churrasqueiro', typeLabel: '12x36 Par', shiftLabel: '06:00–18:00', setores: ['Churrasqueira', 'Salão'], plan: 'TFTFTFT', real: 'TFTFTFT' });
const carla = linha({ name: 'CARLA', jobTitle: 'Aux. de Cozinha', typeLabel: '6x1 Tarde', shiftLabel: '14:00–22:00', plan: 'TTTTTTF', real: 'TTAA...' });

describe('filtrarLinhas', () => {
  it('vazio não filtra nada', () => {
    expect(filtrarLinhas([ana, bruno, carla], {}, 'realizado')).toHaveLength(3);
  });

  it('nome ignora acento e caixa, e também casa pela função', () => {
    expect(filtrarLinhas([ana, bruno, carla], { nome: 'paula' }, 'realizado').map((l) => l.name)).toEqual(['ANA PAULA']);
    expect(filtrarLinhas([ana, bruno, carla], { nome: 'cozinh' }, 'realizado').map((l) => l.name)).toEqual(['ANA PAULA', 'CARLA']);
  });

  it('tipo de escala e horário são exatos', () => {
    expect(filtrarLinhas([ana, bruno, carla], { tipo: '6x1 Tarde' }, 'planejado')).toHaveLength(2);
    expect(filtrarLinhas([ana, bruno, carla], { horario: '06:00–18:00' }, 'planejado').map((l) => l.name)).toEqual(['BRUNO']);
  });

  it('setor casa em QUALQUER dos setores da pessoa, e "Sem setor" acha quem não está alocado', () => {
    /* Bruno está em dois setores: filtrar por Salão tem de trazê-lo — é o caso
       de quem cobre dois postos, e sumir de um deles esconderia a cobertura. */
    expect(filtrarLinhas([ana, bruno, carla], { setor: 'Salão' }, 'planejado').map((l) => l.name)).toEqual(['BRUNO']);
    expect(filtrarLinhas([ana, bruno, carla], { setor: SEM_SETOR }, 'planejado').map((l) => l.name)).toEqual(['CARLA']);
  });

  it('"só divergentes" vale só na Comparação e esconde quem bateu com o planejado', () => {
    const f = { soDivergentes: true };
    expect(filtrarLinhas([ana, bruno, carla], f, 'comparacao').map((l) => l.name)).toEqual(['ANA PAULA', 'CARLA']);
    /* No Realizado o mesmo filtro não pode esconder ninguém: lá não há
       comparação a fazer. */
    expect(filtrarLinhas([ana, bruno, carla], f, 'realizado')).toHaveLength(3);
  });
});

describe('opcoesDosFiltros', () => {
  it('tira as opções da própria grade, em ordem, com "Sem setor" por último', () => {
    const o = opcoesDosFiltros([ana, bruno, carla]);
    expect(o.tipos).toEqual(['12x36 Par', '6x1 Tarde']);
    expect(o.setores).toEqual(['Churrasqueira', 'Cozinha', 'Salão', SEM_SETOR]);
    expect(o.horarios).toEqual(['06:00–18:00', '14:00–22:00']);
  });

  it('sem ninguém sem setor, "Sem setor" não aparece', () => {
    expect(opcoesDosFiltros([ana, bruno]).setores).not.toContain(SEM_SETOR);
  });
});

describe('totaisDaLinha', () => {
  it('no Realizado conta o que foi marcado e deixa o vazio à parte', () => {
    /* Carla: T T A A . . . → 2 trabalho, 2 ausências (atestado), 3 vazios. */
    expect(totaisDaLinha(carla, 'realizado')).toEqual({ trabalho: 2, folgas: 0, ausencias: 2, divergencias: 2, vazios: 3 });
  });

  it('no Planejado o vazio não existe e atraso conta como trabalho', () => {
    const l = linha({ plan: 'TRFTTTT' });
    expect(totaisDaLinha(l, 'planejado')).toMatchObject({ trabalho: 6, folgas: 1, ausencias: 0, vazios: 0 });
  });

  it('divergência é realizado DIFERENTE do planejado; célula vazia não diverge', () => {
    expect(totaisDaLinha(ana, 'comparacao').divergencias).toBe(1); // dia 4: planejado T, realizado FI
    expect(totaisDaLinha(bruno, 'comparacao').divergencias).toBe(0);
    expect(linhaDivergente(bruno)).toBe(false);
  });
});

describe('resumoDaGrade — os quatro blocos', () => {
  it('soma as linhas VISÍVEIS, não a unidade', () => {
    const todas = resumoDaGrade([ana, bruno, carla], 'realizado');
    expect(todas.pessoas).toBe(3);
    expect(todas.ausencias).toBe(3); // FI da Ana + 2 atestados da Carla
    expect(todas.porAusencia).toEqual({ FALTA_INJUST: 1, FALTA_JUST: 0, ATESTADO: 2, FERIAS: 0 });
    expect(detalheDasAusencias(todas)).toBe('FI 1 · A 2');

    const soCozinha = resumoDaGrade(filtrarLinhas([ana, bruno, carla], { setor: 'Cozinha' }, 'realizado'), 'realizado');
    expect(soCozinha.pessoas).toBe(1);
    expect(soCozinha.ausencias).toBe(1);
  });

  it('na Comparação conta dias e PESSOAS divergentes', () => {
    const r = resumoDaGrade([ana, bruno, carla], 'comparacao');
    expect(r.divergencias).toBe(3);
    expect(r.pessoasDivergentes).toBe(2);
  });

  it('sem ausência, o detalhe é vazio (o bloco não escreve "FI 0")', () => {
    expect(detalheDasAusencias(resumoDaGrade([bruno], 'realizado'))).toBe('');
  });
});
