import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import type { SessionUser } from '@/lib/auth/session';
import {
  getGradeDeGerentes,
  definirHorarioDoGerente,
  lancarFolgaDoGerente,
  apagarFolgaDoGerente,
} from '@/lib/manager-schedule-central';

/**
 * Escala de gerentes.
 *
 * Duas coisas aqui podem estar erradas e produzir uma tela plausível: a **ordem
 * de decisão da célula** (se o padrão semanal vencesse a folga lançada, a grade
 * afirmaria cobertura que não existe) e o **escopo** (perfil certo, unidade
 * errada). São as duas que este arquivo mede.
 */

const sfx = `mgs${process.pid.toString(36)}`;
let unitA: string, unitB: string;
let anaId: string, brunoId: string, deOutraId: string;
let supId: string, supOutraId: string;

/* Setembro/2026: dia 1 é terça. Quintas: 3, 10, 17, 24. Domingos: 6, 13, 20, 27. */
const ANO = 2026, MES = 9;

const sup = (): SessionUser => ({ id: supId, name: 'Supervisor', role: 'SUPERVISOR', unitIds: [unitA], seesAllUnits: false, needsTerms: false });
const supDeOutraRegiao = (): SessionUser => ({ id: supOutraId, name: 'Supervisor B', role: 'SUPERVISOR', unitIds: [unitB], seesAllUnits: false, needsTerms: false });

vi.mock('@/lib/notifications', () => ({
  notifyUsers: async () => ({ created: 0 }),
  notifyAdmins: async () => ({ created: 0 }),
  notifyRole: async () => ({ created: 0 }),
  notifyUnitRole: async () => ({ created: 0 }),
}));

beforeAll(async () => {
  const u = async (code: string, name: string) =>
    (await prisma.unit.create({ data: { code, name, timezone: 'America/Sao_Paulo', cutoffHour: 4 } })).id;
  unitA = await u(`MGS-A-${sfx}`, 'Unidade A');
  unitB = await u(`MGS-B-${sfx}`, 'Unidade B');

  const user = async (name: string, role: 'MANAGER' | 'SUPERVISOR', unitId: string) => {
    const id = (await prisma.user.create({ data: { name, email: `${name}.${sfx}@e.com`, role, passwordHash: 'x' } })).id;
    await prisma.unitMembership.create({ data: { userId: id, unitId } });
    return id;
  };
  anaId = await user('Ana', 'MANAGER', unitA);
  brunoId = await user('Bruno', 'MANAGER', unitA);
  deOutraId = await user('Carla', 'MANAGER', unitB);
  supId = await user('Supervisor', 'SUPERVISOR', unitA);
  supOutraId = await user('SupervisorB', 'SUPERVISOR', unitB);
});

afterEach(async () => {
  const ids = [anaId, brunoId, deOutraId];
  await prisma.managerLeave.deleteMany({ where: { userId: { in: ids } } });
  await prisma.managerWorkSchedule.deleteMany({ where: { userId: { in: ids } } });
});

afterAll(async () => {
  const ids = [anaId, brunoId, deOutraId, supId, supOutraId];
  await prisma.managerLeave.deleteMany({ where: { userId: { in: ids } } }).catch(() => {});
  await prisma.managerWorkSchedule.deleteMany({ where: { userId: { in: ids } } }).catch(() => {});
  await prisma.auditLog.deleteMany({ where: { userId: { in: ids } } }).catch(() => {});
  await prisma.unitMembership.deleteMany({ where: { userId: { in: ids } } }).catch(() => {});
  await prisma.user.deleteMany({ where: { id: { in: ids } } }).catch(() => {});
  await prisma.unit.deleteMany({ where: { id: { in: [unitA, unitB] } } }).catch(() => {});
  await prisma.$disconnect();
});

/** A célula do dia `dia` (1..31) na linha de `nome`. */
async function celula(nome: string, dia: number) {
  const g = (await getGradeDeGerentes(sup(), unitA, ANO, MES))!;
  const linha = g.linhas.find((l) => l.name === nome)!;
  return linha.dias[dia - 1];
}

describe('A grade do mês', () => {
  it('sem horário cadastrado a linha inteira é "?" — o sistema não inventa presença', async () => {
    expect(await celula('Ana', 15)).toBe('SEM_HORARIO');
    const g = (await getGradeDeGerentes(sup(), unitA, ANO, MES))!;
    expect(g.semHorarioCount).toBe(2);
  });

  it('o padrão semanal decide trabalha × fora do padrão', async () => {
    /* Ana trabalha de segunda a sábado (1..6): o domingo fica fora do padrão. */
    await definirHorarioDoGerente(sup(), anaId, { weekdays: [1, 2, 3, 4, 5, 6], startTime: '10:00', endTime: '19:00' });
    expect(await celula('Ana', 3)).toBe('TRABALHA'); // quinta
    expect(await celula('Ana', 6)).toBe('FORA_DO_PADRAO'); // domingo
  });

  it('a folga LANÇADA vence o padrão — o contrário afirmaria cobertura que não existe', async () => {
    await definirHorarioDoGerente(sup(), anaId, { weekdays: [1, 2, 3, 4, 5, 6] });
    await lancarFolgaDoGerente(sup(), anaId, { kind: 'FOLGA', startDate: '2026-09-17', endDate: '2026-09-17' });
    expect(await celula('Ana', 17)).toBe('FOLGA');
    expect(await celula('Ana', 16)).toBe('TRABALHA');
  });

  it('férias pegam o período inteiro, dias fora do padrão incluídos', async () => {
    await definirHorarioDoGerente(sup(), anaId, { weekdays: [1, 2, 3, 4, 5, 6] });
    await lancarFolgaDoGerente(sup(), anaId, { kind: 'FERIAS', startDate: '2026-09-05', endDate: '2026-09-07' });
    expect(await celula('Ana', 5)).toBe('FERIAS');
    expect(await celula('Ana', 6)).toBe('FERIAS'); // domingo: férias mesmo assim
    expect(await celula('Ana', 7)).toBe('FERIAS');
    expect(await celula('Ana', 8)).toBe('TRABALHA');
  });

  it('período que atravessa o mês aparece nos dias que caem dentro dele', async () => {
    await definirHorarioDoGerente(sup(), anaId, { weekdays: [1, 2, 3, 4, 5, 6] });
    await lancarFolgaDoGerente(sup(), anaId, { kind: 'FERIAS', startDate: '2026-08-25', endDate: '2026-09-02' });
    expect(await celula('Ana', 1)).toBe('FERIAS');
    expect(await celula('Ana', 2)).toBe('FERIAS');
    expect(await celula('Ana', 3)).toBe('TRABALHA');
  });

  it('conta os dias de cada tipo por gerente', async () => {
    await definirHorarioDoGerente(sup(), anaId, { weekdays: [1, 2, 3, 4, 5, 6] });
    await lancarFolgaDoGerente(sup(), anaId, { kind: 'FOLGA', startDate: '2026-09-17', endDate: '2026-09-17' });
    const g = (await getGradeDeGerentes(sup(), unitA, ANO, MES))!;
    const ana = g.linhas.find((l) => l.name === 'Ana')!;
    /* Setembro/2026 tem 4 domingos (6, 13, 20, 27) → 26 dias no padrão, menos a
       folga do dia 17 = 25 trabalhados. */
    expect(ana.diasDeFolga).toBe(1);
    expect(ana.diasTrabalhados).toBe(25);
    expect(ana.diasDeFerias).toBe(0);
  });
});

describe('O dia sem nenhum gerente', () => {
  it('domingo de Ana coberto por Bruno não é buraco', async () => {
    await definirHorarioDoGerente(sup(), anaId, { weekdays: [1, 2, 3, 4, 5, 6] });
    await definirHorarioDoGerente(sup(), brunoId, { weekdays: [0] }); // só domingo
    const g = (await getGradeDeGerentes(sup(), unitA, ANO, MES))!;
    expect(g.diasSemGerente).toBe(0);
  });

  it('sem ninguém no domingo, os 4 domingos do mês viram buraco', async () => {
    await definirHorarioDoGerente(sup(), anaId, { weekdays: [1, 2, 3, 4, 5, 6] });
    const g = (await getGradeDeGerentes(sup(), unitA, ANO, MES))!;
    expect(g.diasSemGerente).toBe(4);
    expect(g.dias.filter((d) => d.semGerente).map((d) => d.day)).toEqual([6, 13, 20, 27]);
  });

  it('a folga do único gerente abre um buraco naquele dia', async () => {
    await definirHorarioDoGerente(sup(), anaId, { weekdays: [0, 1, 2, 3, 4, 5, 6] });
    await lancarFolgaDoGerente(sup(), anaId, { kind: 'FOLGA', startDate: '2026-09-17', endDate: '2026-09-17' });
    const g = (await getGradeDeGerentes(sup(), unitA, ANO, MES))!;
    expect(g.dias.filter((d) => d.semGerente).map((d) => d.day)).toEqual([17]);
  });

  it('unidade em que NINGUÉM tem horário não sai toda vermelha', async () => {
    /* Alerta que aparece sempre deixa de ser lido: sem nenhum horário
       cadastrado o mês não é "sem gerente", é "sem cadastro" — e é o outro
       aviso que trata disso. */
    const g = (await getGradeDeGerentes(sup(), unitA, ANO, MES))!;
    expect(g.diasSemGerente).toBe(0);
    expect(g.semHorarioCount).toBe(2);
  });
});

describe('Escopo: perfil certo não é unidade certa', () => {
  it('supervisor de outra região não lança para o gerente daqui', async () => {
    const r = await lancarFolgaDoGerente(supDeOutraRegiao(), anaId, { kind: 'FOLGA', startDate: '2026-09-10', endDate: '2026-09-10' });
    expect(r).toEqual({ ok: false, reason: 'FORBIDDEN' });
    expect(await prisma.managerLeave.count({ where: { userId: anaId } })).toBe(0);
  });

  it('nem grava o horário dele', async () => {
    const r = await definirHorarioDoGerente(supDeOutraRegiao(), anaId, { weekdays: [1, 2, 3] });
    expect(r).toEqual({ ok: false, reason: 'FORBIDDEN' });
    expect(await prisma.managerWorkSchedule.count({ where: { userId: anaId } })).toBe(0);
  });

  it('nem apaga o lançamento feito por quem podia', async () => {
    const criada = await lancarFolgaDoGerente(sup(), anaId, { kind: 'FOLGA', startDate: '2026-09-10', endDate: '2026-09-10' });
    expect(criada.ok).toBe(true);
    const r = await apagarFolgaDoGerente(supDeOutraRegiao(), criada.id!);
    expect(r).toEqual({ ok: false, reason: 'FORBIDDEN' });
    expect(await prisma.managerLeave.count({ where: { id: criada.id! } })).toBe(1);
  });

  it('a grade de unidade fora do escopo devolve nulo, não a grade de outra', async () => {
    expect(await getGradeDeGerentes(sup(), unitB, ANO, MES)).toBeNull();
  });

  it('a grade da unidade traz só os gerentes DELA', async () => {
    const g = (await getGradeDeGerentes(sup(), unitA, ANO, MES))!;
    expect(g.linhas.map((l) => l.name)).toEqual(['Ana', 'Bruno']);
  });
});

describe('Regras do lançamento', () => {
  it('período invertido é recusado', async () => {
    const r = await lancarFolgaDoGerente(sup(), anaId, { kind: 'FOLGA', startDate: '2026-09-20', endDate: '2026-09-10' });
    expect(r).toEqual({ ok: false, reason: 'INVALID' });
  });

  it('período que encosta em outro do mesmo gerente é recusado', async () => {
    await lancarFolgaDoGerente(sup(), anaId, { kind: 'FERIAS', startDate: '2026-09-10', endDate: '2026-09-20' });
    const r = await lancarFolgaDoGerente(sup(), anaId, { kind: 'FOLGA', startDate: '2026-09-20', endDate: '2026-09-21' });
    /* Sobrepor calaria um dos dois na grade sem avisar ninguém. */
    expect(r).toEqual({ ok: false, reason: 'OVERLAP' });
  });

  it('mas o mesmo período para OUTRO gerente passa', async () => {
    await lancarFolgaDoGerente(sup(), anaId, { kind: 'FOLGA', startDate: '2026-09-10', endDate: '2026-09-10' });
    const r = await lancarFolgaDoGerente(sup(), brunoId, { kind: 'FOLGA', startDate: '2026-09-10', endDate: '2026-09-10' });
    expect(r.ok).toBe(true);
  });

  it('guarda QUEM lançou — a agenda é de um e o lançamento é de outro', async () => {
    await lancarFolgaDoGerente(sup(), anaId, { kind: 'FOLGA', startDate: '2026-09-10', endDate: '2026-09-10' });
    const g = (await getGradeDeGerentes(sup(), unitA, ANO, MES))!;
    expect(g.lancamentos).toHaveLength(1);
    expect(g.lancamentos[0]).toMatchObject({ managerName: 'Ana', kind: 'FOLGA', lancadoPor: 'Supervisor' });
  });

  it('audita o lançamento e a exclusão', async () => {
    const criada = await lancarFolgaDoGerente(sup(), anaId, { kind: 'FOLGA', startDate: '2026-09-10', endDate: '2026-09-10' });
    await apagarFolgaDoGerente(sup(), criada.id!);
    const acoes = await prisma.auditLog.findMany({
      where: { userId: supId, entityId: { in: [criada.id!] } },
      select: { action: true },
    });
    expect(acoes.map((a) => a.action).sort()).toEqual(['MANAGER_LEAVE_ADD', 'MANAGER_LEAVE_DELETE']);
  });

  it('lançar para quem não é gerente é recusado', async () => {
    const r = await lancarFolgaDoGerente(sup(), supId, { kind: 'FOLGA', startDate: '2026-09-10', endDate: '2026-09-10' });
    expect(r).toEqual({ ok: false, reason: 'FORBIDDEN' });
  });
});
