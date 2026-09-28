import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { createCertificate } from '@/lib/certificates/save';
import { getScheduleGrid, fillActualFromPlan, dayUTC } from '@/lib/schedule';
import { deleteMedicalCertificate } from '@/lib/admin-ops';
import type { SessionUser } from '@/lib/auth/session';

/**
 * ATESTADO NA ESCALA É DERIVADO DA CENTRAL DE ATESTADOS (v1.130.1).
 *
 * Relato de produção: atestados lançados na Central e a Escala mostrando "T"
 * nos mesmos dias. A gravação única em schedule_actuals era desfeita por
 * "Puxar Realizado = Planejado", ficava invisível quando lançada pelo vínculo
 * da outra unidade da mesma pessoa, e falhava calada. Agora a grade pergunta
 * ao documento: enquanto o atestado existir, o dia é "A".
 */

const sfx = `ae${process.pid.toString(36)}`;
let unitA: string; let unitB: string; let userId: string; let tipoId: string;
let ana = ''; let bia = '';

const admin = (): SessionUser => ({ id: userId, name: 'Adm', role: 'ADMIN', unitIds: [unitA, unitB], seesAllUnits: true, needsTerms: false });
const ANO = 2026; const MES = 10;
const grade = (unitId = unitA) => getScheduleGrid(unitId, ANO, MES);
const dias = (rows: Awaited<ReturnType<typeof grade>>['rows'], id: string, de: number, ate: number) => {
  const row = rows.find((r) => r.collaboratorId === id)!;
  return Array.from({ length: ate - de + 1 }, (_, i) => row.days[de - 1 + i].actual);
};

beforeAll(async () => {
  unitA = (await prisma.unit.create({ data: { code: `AE-A-${sfx}`, name: 'U Atestado A', timezone: 'America/Sao_Paulo', cutoffHour: 4 } })).id;
  unitB = (await prisma.unit.create({ data: { code: `AE-B-${sfx}`, name: 'U Atestado B', timezone: 'America/Sao_Paulo', cutoffHour: 4 } })).id;
  userId = (await prisma.user.create({ data: { name: 'Adm', email: `${sfx}@e.com`, role: 'ADMIN', passwordHash: 'x' } })).id;
  tipoId = (await prisma.scheduleTemplate.create({ data: { name: `6x1 AE ${sfx}`, workDays: 6, offDays: 1, startTime: '08:00', endTime: '16:00' } })).id;
  // Ana está nas DUAS unidades (o RH sincroniza razões sociais distintas como unidades distintas)
  ana = (await prisma.collaborator.create({ data: { name: `ANA ${sfx}`, jobTitle: 'Cozinha', units: { create: [{ unitId: unitA }, { unitId: unitB }] } } })).id;
  bia = (await prisma.collaborator.create({ data: { name: `BIA ${sfx}`, jobTitle: 'Salão', units: { create: { unitId: unitA } } } })).id;
  for (const c of [ana, bia]) {
    await prisma.employeeSchedule.create({
      data: { collaboratorId: c, unitId: unitA, templateId: tipoId, scheduleType: 'SIX_ONE', anchorDate: new Date(Date.UTC(2026, 9, 1)), startDate: new Date(Date.UTC(2026, 9, 1)), offMode: 'FIXED_WEEKLY', weeklyOffDay: 0 },
    });
  }
});

afterAll(async () => {
  await prisma.medicalCertificate.deleteMany({ where: { collaboratorId: { in: [ana, bia] } } }).catch(() => {});
  await prisma.rhScheduleNotice.deleteMany({ where: { unitId: { in: [unitA, unitB] } } }).catch(() => {});
  await prisma.scheduleActual.deleteMany({ where: { collaboratorId: { in: [ana, bia] } } }).catch(() => {});
  await prisma.employeeSchedule.deleteMany({ where: { unitId: unitA } }).catch(() => {});
  await prisma.collaboratorUnit.deleteMany({ where: { unitId: { in: [unitA, unitB] } } }).catch(() => {});
  await prisma.collaborator.deleteMany({ where: { id: { in: [ana, bia] } } }).catch(() => {});
  await prisma.scheduleTemplate.delete({ where: { id: tipoId } }).catch(() => {});
  await prisma.unit.deleteMany({ where: { id: { in: [unitA, unitB] } } }).catch(() => {});
  await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  await prisma.$disconnect();
});

describe('Atestado na Escala — derivado da Central', () => {
  it('lançar o atestado marca "A" nos dias do período (e só neles)', async () => {
    const r = await createCertificate(admin(), { unitId: unitA, collaboratorId: bia, startDate: '2026-10-06', endDate: '2026-10-08' });
    expect(r.ok).toBe(true);
    const g = await grade();
    expect(dias(g.rows, bia, 6, 8)).toEqual(['ATESTADO', 'ATESTADO', 'ATESTADO']);
    expect(dias(g.rows, bia, 5, 5)).toEqual([null]);
    expect(dias(g.rows, bia, 9, 9)).toEqual([null]);
  });

  it('"Puxar Realizado = Planejado" (modo all) NÃO pisa no atestado — nem na grade, nem no banco', async () => {
    const f = await fillActualFromPlan(admin(), { unitId: unitA, year: ANO, month: MES, mode: 'all' });
    expect(f.ok).toBe(true);
    const g = await grade();
    expect(dias(g.rows, bia, 6, 8)).toEqual(['ATESTADO', 'ATESTADO', 'ATESTADO']);
    expect(dias(g.rows, bia, 9, 9)).toEqual(['WORK']);
    const gravado = await prisma.scheduleActual.findUnique({ where: { collaboratorId_date: { collaboratorId: bia, date: dayUTC(ANO, MES, 7) } } });
    expect(gravado?.status).toBe('ATESTADO');
  });

  it('linha do Realizado sobrescrita ou apagada por fora: a grade continua dizendo "A" (o documento manda)', async () => {
    await prisma.scheduleActual.update({ where: { collaboratorId_date: { collaboratorId: bia, date: dayUTC(ANO, MES, 6) } }, data: { status: 'WORK' } });
    await prisma.scheduleActual.delete({ where: { collaboratorId_date: { collaboratorId: bia, date: dayUTC(ANO, MES, 7) } } });
    const g = await grade();
    expect(dias(g.rows, bia, 6, 8)).toEqual(['ATESTADO', 'ATESTADO', 'ATESTADO']);
  });

  it('atestado lançado pelo vínculo da OUTRA unidade da mesma pessoa aparece na Escala desta', async () => {
    const r = await createCertificate(admin(), { unitId: unitB, collaboratorId: ana, startDate: '2026-10-13', endDate: '2026-10-14' });
    expect(r.ok).toBe(true);
    const g = await grade(unitA);
    expect(dias(g.rows, ana, 13, 14)).toEqual(['ATESTADO', 'ATESTADO']);
    // e "Completar dias vazios" não o troca por T
    const f = await fillActualFromPlan(admin(), { unitId: unitA, year: ANO, month: MES, mode: 'empty' });
    expect(f.ok).toBe(true);
    const gravado = await prisma.scheduleActual.findUnique({ where: { collaboratorId_date: { collaboratorId: ana, date: dayUTC(ANO, MES, 13) } } });
    expect(gravado?.status).toBe('ATESTADO');
    expect(dias((await grade(unitA)).rows, ana, 13, 14)).toEqual(['ATESTADO', 'ATESTADO']);
  });

  it('atestado de HORAS (consulta) não afasta o dia', async () => {
    const r = await createCertificate(admin(), { unitId: unitA, collaboratorId: ana, type: 'HOURS', startDate: '2026-10-20', endDate: '2026-10-20', hours: 2 });
    expect(r.ok).toBe(true);
    expect(dias((await grade()).rows, ana, 20, 20)).not.toEqual(['ATESTADO']);
  });

  it('atestado que cruza a virada do mês entra só nos dias deste mês', async () => {
    const r = await createCertificate(admin(), { unitId: unitA, collaboratorId: ana, startDate: '2026-10-30', endDate: '2026-11-02' });
    expect(r.ok).toBe(true);
    expect(dias((await grade()).rows, ana, 30, 31)).toEqual(['ATESTADO', 'ATESTADO']);
    const nov = await getScheduleGrid(unitA, 2026, 11);
    expect(dias(nov.rows, ana, 1, 3)).toEqual(['ATESTADO', 'ATESTADO', null]);
  });

  it('excluir o atestado (Admin) tira o "A" — inclusive do ÚLTIMO dia, que a exclusão antiga deixava marcado', async () => {
    const cert = await prisma.medicalCertificate.findFirst({ where: { collaboratorId: bia, startDate: '2026-10-06' }, select: { id: true } });
    const d = await deleteMedicalCertificate(admin(), cert!.id);
    expect(d.ok).toBe(true);
    const g = await grade();
    expect(dias(g.rows, bia, 6, 8).every((s) => s !== 'ATESTADO')).toBe(true);
    const ultimo = await prisma.scheduleActual.findUnique({ where: { collaboratorId_date: { collaboratorId: bia, date: dayUTC(ANO, MES, 8) } } });
    expect(ultimo).toBeNull();
  });
});
