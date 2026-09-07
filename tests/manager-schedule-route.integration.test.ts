import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import type { SessionUser } from '@/lib/auth/session';
import type { Role } from '@prisma/client';

/**
 * A ROTA da Escala de gerentes.
 *
 * A matriz decide o perfil e a função decide o escopo — mas isso só vale se a
 * rota realmente chamar as duas coisas. Aqui a requisição passa pela porta, não
 * pela função: é a diferença entre "restrito" e "restrito na tela".
 */

const sfx = `mgr${process.pid.toString(36)}`;
let unitId: string, anaId: string, atorId: string;
let papelDoAtor: Role = 'SUPERVISOR';

const ator = (): SessionUser => ({ id: atorId, name: 'Ator', role: papelDoAtor, unitIds: [unitId], seesAllUnits: false, needsTerms: false });

vi.mock('@/lib/auth/session', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getSessionUser: async () => ator(),
}));
vi.mock('@/lib/notifications', () => ({
  notifyUsers: async () => ({ created: 0 }),
  notifyAdmins: async () => ({ created: 0 }),
  notifyRole: async () => ({ created: 0 }),
  notifyUnitRole: async () => ({ created: 0 }),
}));

async function post(body: unknown) {
  const { POST } = await import('@/app/api/manager-schedule/route');
  const res = await POST(new Request('http://localhost/api/manager-schedule', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }));
  return { status: res.status, data: await res.json() as Record<string, unknown> };
}

beforeAll(async () => {
  unitId = (await prisma.unit.create({ data: { code: `MGR-${sfx}`, name: 'U Escala Gerentes', timezone: 'America/Sao_Paulo', cutoffHour: 4 } })).id;
  const user = async (name: string, role: Role) => {
    const id = (await prisma.user.create({ data: { name, email: `${name}.${sfx}@e.com`, role, passwordHash: 'x' } })).id;
    await prisma.unitMembership.create({ data: { userId: id, unitId } });
    return id;
  };
  anaId = await user('Ana', 'MANAGER');
  atorId = await user('Ator', 'SUPERVISOR');
});

afterEach(async () => {
  papelDoAtor = 'SUPERVISOR';
  await prisma.managerLeave.deleteMany({ where: { userId: anaId } });
  await prisma.managerWorkSchedule.deleteMany({ where: { userId: anaId } });
  await prisma.rolePermission.deleteMany({ where: { module: 'MANAGER_SCHEDULE' } });
});

afterAll(async () => {
  const ids = [anaId, atorId];
  await prisma.rolePermission.deleteMany({ where: { module: 'MANAGER_SCHEDULE' } }).catch(() => {});
  await prisma.managerLeave.deleteMany({ where: { userId: { in: ids } } }).catch(() => {});
  await prisma.managerWorkSchedule.deleteMany({ where: { userId: { in: ids } } }).catch(() => {});
  await prisma.auditLog.deleteMany({ where: { userId: { in: ids } } }).catch(() => {});
  await prisma.unitMembership.deleteMany({ where: { userId: { in: ids } } }).catch(() => {});
  await prisma.user.deleteMany({ where: { id: { in: ids } } }).catch(() => {});
  await prisma.unit.delete({ where: { id: unitId } }).catch(() => {});
  await prisma.$disconnect();
});

describe('Supervisão lança pela rota', () => {
  it('grava o horário do gerente', async () => {
    const r = await post({ action: 'setHorario', userId: anaId, weekdays: [1, 2, 3, 4, 5, 6], startTime: '10:00', endTime: '19:00' });
    expect(r.status).toBe(200);
    const s = await prisma.managerWorkSchedule.findUnique({ where: { userId: anaId } });
    expect(s?.weekdays).toEqual([1, 2, 3, 4, 5, 6]);
    expect(s?.startTime).toBe('10:00');
  });

  it('lança a folga e registra quem lançou', async () => {
    const r = await post({ action: 'addFolga', userId: anaId, kind: 'FOLGA', startDate: '2026-09-17', endDate: '2026-09-17' });
    expect(r.status).toBe(200);
    const l = await prisma.managerLeave.findFirst({ where: { userId: anaId } });
    expect(l?.createdById).toBe(atorId);
  });

  it('apaga o lançamento', async () => {
    const criada = await post({ action: 'addFolga', userId: anaId, kind: 'FOLGA', startDate: '2026-09-17', endDate: '2026-09-17' });
    expect((await post({ action: 'deleteFolga', id: criada.data.id })).status).toBe(200);
    expect(await prisma.managerLeave.count({ where: { userId: anaId } })).toBe(0);
  });

  it('período sobreposto devolve 409, não grava dois', async () => {
    await post({ action: 'addFolga', userId: anaId, kind: 'FERIAS', startDate: '2026-09-10', endDate: '2026-09-20' });
    const r = await post({ action: 'addFolga', userId: anaId, kind: 'FOLGA', startDate: '2026-09-20', endDate: '2026-09-21' });
    expect(r.status).toBe(409);
    expect(await prisma.managerLeave.count({ where: { userId: anaId } })).toBe(1);
  });
});

describe('A matriz vale na rota', () => {
  it('o GERENTE não lança: o módulo nasce restrito à Supervisão', async () => {
    papelDoAtor = 'MANAGER';
    const r = await post({ action: 'addFolga', userId: anaId, kind: 'FOLGA', startDate: '2026-09-17', endDate: '2026-09-17' });
    expect(r.status).toBe(403);
    expect(await prisma.managerLeave.count({ where: { userId: anaId } })).toBe(0);
  });

  it('fechando "Editar" da Supervisão, a rota recusa — não só o botão sai', async () => {
    await prisma.rolePermission.create({ data: { role: 'SUPERVISOR', module: 'MANAGER_SCHEDULE', canView: true, canEdit: false } });
    const r = await post({ action: 'setHorario', userId: anaId, weekdays: [1, 2, 3] });
    expect(r.status).toBe(403);
    expect(await prisma.managerWorkSchedule.count({ where: { userId: anaId } })).toBe(0);
  });

  it('ação desconhecida não vira gravação silenciosa', async () => {
    expect((await post({ action: 'apagarTudo' })).status).toBe(400);
  });
});
