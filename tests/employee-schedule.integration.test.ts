import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { salvarEscalaDoColaborador, historicoDeEscala, encerrarEscala } from '@/lib/schedule/employee';
import { vigenciaNaData } from '@/lib/schedule/vigencia';
import type { SessionUser } from '@/lib/auth/session';

/**
 * Escala do colaborador COM VIGÊNCIA (parte 2).
 *
 * A regra que dá sentido ao módulo: gravar uma escala nova não sobrescreve a
 * anterior — fecha na véspera. Sem isso, mudar a folga de alguém em maio faria
 * a grade de março passar a mostrar a folga nova, e o histórico deixaria de ser
 * histórico.
 */

const sfx = `es${process.pid.toString(36)}`;
let unitId: string;
let outraId: string;
let colabId: string;
let mgrId: string;
let tipo6x1 = '';
let tipo12x36 = '';

const mgr = (): SessionUser => ({ id: mgrId, name: 'G', role: 'MANAGER', unitIds: [unitId], seesAllUnits: false, needsTerms: false });
const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

beforeAll(async () => {
  const u = await prisma.unit.create({ data: { code: `ES-${sfx}`, name: 'U Escala', timezone: 'America/Sao_Paulo', cutoffHour: 4 } });
  unitId = u.id;
  outraId = (await prisma.unit.create({ data: { code: `ES2-${sfx}`, name: 'Outra', timezone: 'America/Sao_Paulo', cutoffHour: 4 } })).id;
  mgrId = (await prisma.user.create({ data: { name: 'G', email: `${sfx}@e.com`, role: 'MANAGER', passwordHash: 'x' } })).id;
  await prisma.unitMembership.create({ data: { userId: mgrId, unitId } });
  const c = await prisma.collaborator.create({ data: { name: `Colab ${sfx}`, active: true } });
  colabId = c.id;
  await prisma.collaboratorUnit.create({ data: { collaboratorId: colabId, unitId } }).catch(() => {});
  tipo6x1 = (await prisma.scheduleTemplate.create({ data: { name: `6x1 ${sfx}`, workDays: 6, offDays: 1 } })).id;
  tipo12x36 = (await prisma.scheduleTemplate.create({ data: { name: `12x36 ${sfx}`, workDays: 1, offDays: 1 } })).id;
});

afterAll(async () => {
  await prisma.employeeSchedule.deleteMany({ where: { collaboratorId: colabId } }).catch(() => {});
  await prisma.scheduleTemplate.deleteMany({ where: { name: { contains: sfx } } }).catch(() => {});
  await prisma.collaboratorUnit.deleteMany({ where: { collaboratorId: colabId } }).catch(() => {});
  await prisma.collaborator.delete({ where: { id: colabId } }).catch(() => {});
  await prisma.unitMembership.deleteMany({ where: { unitId } }).catch(() => {});
  await prisma.unit.deleteMany({ where: { id: { in: [unitId, outraId] } } }).catch(() => {});
  await prisma.user.delete({ where: { id: mgrId } }).catch(() => {});
  await prisma.$disconnect();
});

describe('Gravar a escala', () => {
  it('exige o dia de folga quando o ciclo fecha na semana', async () => {
    const r = await salvarEscalaDoColaborador(mgr(), { collaboratorId: colabId, unitId, templateId: tipo6x1, startDate: '2026-05-04' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain('dia fixo de folga');
  });

  it('grava 6x1 com folga no domingo', async () => {
    const r = await salvarEscalaDoColaborador(mgr(), {
      collaboratorId: colabId, unitId, templateId: tipo6x1, startDate: '2026-05-04', weeklyOffDay: 0,
      startTime: '14:00', breakTime: '19:00', endTime: '22:17',
    });
    expect(r.ok).toBe(true);
    const v = await prisma.employeeSchedule.findFirst({ where: { collaboratorId: colabId, unitId } });
    expect(v!.weeklyOffDay).toBe(0);
    expect(v!.offMode).toBe('FIXED_WEEKLY');
    expect(v!.startTime).toBe('14:00');
    expect(v!.endDate).toBeNull();
  });

  it('ciclo que não fecha na semana exige o início do ciclo', async () => {
    const r = await salvarEscalaDoColaborador(mgr(), { collaboratorId: colabId, unitId, templateId: tipo12x36, startDate: '2026-06-01' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain('início do ciclo');
  });

  it('unidade de outro gerente é recusada', async () => {
    const r = await salvarEscalaDoColaborador(mgr(), { collaboratorId: colabId, unitId: outraId, templateId: tipo6x1, startDate: '2026-05-04', weeklyOffDay: 0 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('FORBIDDEN');
  });

  it('tipo inexistente é recusado', async () => {
    const r = await salvarEscalaDoColaborador(mgr(), { collaboratorId: colabId, unitId, templateId: 'nao-existe', startDate: '2026-05-04', weeklyOffDay: 0 });
    expect(r.ok).toBe(false);
  });
});

describe('A VIGÊNCIA — o passado não muda', () => {
  it('a escala nova fecha a anterior na véspera', async () => {
    const r = await salvarEscalaDoColaborador(mgr(), {
      collaboratorId: colabId, unitId, templateId: tipo6x1, startDate: '2026-08-01', weeklyOffDay: 3,
    });
    expect(r.ok).toBe(true);

    const hist = await historicoDeEscala(colabId, unitId);
    expect(hist).toHaveLength(2);

    const antiga = hist.find((v) => v.weeklyOffDay === 0)!;
    expect(antiga.endDate?.toISOString().slice(0, 10)).toBe('2026-07-31');
  });

  it('cada dia enxerga a versão que valia NELE', async () => {
    const hist = await historicoDeEscala(colabId, unitId);
    /* Julho ainda folga no domingo; agosto já folga na quarta. */
    expect(vigenciaNaData(hist, d('2026-07-15'))?.weeklyOffDay).toBe(0);
    expect(vigenciaNaData(hist, d('2026-08-15'))?.weeklyOffDay).toBe(3);
  });

  it('regravar na MESMA data corrige, não cria outra vigência', async () => {
    /* Senão duas versões disputariam o mesmo dia, e a grade escolheria uma
       delas sem critério. */
    const antes = (await historicoDeEscala(colabId, unitId)).length;
    const r = await salvarEscalaDoColaborador(mgr(), {
      collaboratorId: colabId, unitId, templateId: tipo6x1, startDate: '2026-08-01', weeklyOffDay: 5,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.substituiu).toBe(true);

    const hist = await historicoDeEscala(colabId, unitId);
    expect(hist).toHaveLength(antes);
    expect(vigenciaNaData(hist, d('2026-08-15'))?.weeklyOffDay).toBe(5);
  });

  it('nenhum dia fica com duas vigências abertas', async () => {
    const hist = await historicoDeEscala(colabId, unitId);
    const abertas = hist.filter((v) => v.endDate === null);
    expect(abertas).toHaveLength(1);
  });
});

describe('Modo fixa + domingo em ciclo', () => {
  it('grava de quantas em quantas semanas o domingo entra', async () => {
    const r = await salvarEscalaDoColaborador(mgr(), {
      collaboratorId: colabId, unitId, templateId: tipo6x1, startDate: '2026-09-01',
      offMode: 'FIXED_PLUS_SUNDAY', weeklyOffDay: 2, sundayEveryWeeks: 4,
    });
    expect(r.ok).toBe(true);
    const v = await prisma.employeeSchedule.findFirst({ where: { collaboratorId: colabId, unitId, startDate: d('2026-09-01') } });
    expect(v!.offMode).toBe('FIXED_PLUS_SUNDAY');
    expect(v!.sundayEveryWeeks).toBe(4);
  });

  it('número de semanas fora da faixa é recusado', async () => {
    const r = await salvarEscalaDoColaborador(mgr(), {
      collaboratorId: colabId, unitId, templateId: tipo6x1, startDate: '2026-10-01',
      offMode: 'FIXED_PLUS_SUNDAY', weeklyOffDay: 2, sundayEveryWeeks: 0,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain('semanas');
  });
});

describe('Encerrar a escala', () => {
  it('fecha a vigente sem apagar o passado', async () => {
    const antes = (await historicoDeEscala(colabId, unitId)).length;
    const r = await encerrarEscala(mgr(), colabId, unitId, '2026-12-31');
    expect(r.ok).toBe(true);

    const hist = await historicoDeEscala(colabId, unitId);
    expect(hist).toHaveLength(antes);
    expect(hist.every((v) => v.endDate !== null)).toBe(true);
  });
});
