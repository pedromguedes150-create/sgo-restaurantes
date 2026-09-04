import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import type { SessionUser } from '@/lib/auth/session';

/**
 * A ROTA da Minha área com a aba fechada.
 *
 * Esconder a aba na tela é conveniência. Se a rota continuar aceitando, o
 * "restrito" não existe — basta a requisição. A lição da conferência em grade
 * (v1.54.1) foi essa: o teste tem de passar pela rota, não pela função.
 */

const sfx = `ma${process.pid.toString(36)}`;
let unitId: string;
let mgrId: string;

const mgr = (): SessionUser => ({ id: mgrId, name: 'Gerente', role: 'MANAGER', unitIds: [unitId], seesAllUnits: false, needsTerms: false });

vi.mock('@/lib/auth/session', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getSessionUser: async () => mgr(),
}));

async function post(body: unknown) {
  const { POST } = await import('@/app/api/manager-area/route');
  const res = await POST(new Request('http://localhost/api/manager-area', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }));
  return { status: res.status, data: await res.json() as Record<string, unknown> };
}

const MODULOS = ['MANAGER_AREA', 'MANAGER_AREA_TASKS', 'MANAGER_AREA_NOTES', 'MANAGER_AREA_LEAVES'];
async function fechar(module: string, canView = false, canEdit = false) {
  await prisma.rolePermission.upsert({
    where: { role_module: { role: 'MANAGER', module } },
    create: { role: 'MANAGER', module, canView, canEdit },
    update: { canView, canEdit },
  });
}

beforeAll(async () => {
  unitId = (await prisma.unit.create({ data: { code: `MA-${sfx}`, name: 'U Minha Área', timezone: 'America/Sao_Paulo', cutoffHour: 4 } })).id;
  mgrId = (await prisma.user.create({ data: { name: 'Gerente', email: `${sfx}@e.com`, role: 'MANAGER', passwordHash: 'x' } })).id;
  await prisma.unitMembership.create({ data: { userId: mgrId, unitId } });
});

afterEach(async () => { await prisma.rolePermission.deleteMany({ where: { role: 'MANAGER', module: { in: MODULOS } } }); });

afterAll(async () => {
  await prisma.rolePermission.deleteMany({ where: { role: 'MANAGER', module: { in: MODULOS } } }).catch(() => {});
  await prisma.managerTask.deleteMany({ where: { userId: mgrId } }).catch(() => {});
  await prisma.managerNote.deleteMany({ where: { userId: mgrId } }).catch(() => {});
  await prisma.managerLeave.deleteMany({ where: { userId: mgrId } }).catch(() => {});
  await prisma.unitMembership.deleteMany({ where: { userId: mgrId } }).catch(() => {});
  await prisma.unit.delete({ where: { id: unitId } }).catch(() => {});
  await prisma.user.delete({ where: { id: mgrId } }).catch(() => {});
  await prisma.$disconnect();
});

describe('Com a matriz intocada, tudo funciona como sempre', () => {
  it('cria tarefa, nota e folga', async () => {
    expect((await post({ entity: 'task', action: 'create', title: 'ligar para o fornecedor' })).status).toBe(200);
    expect((await post({ entity: 'note', action: 'add', content: '<p>lembrete</p>' })).status).toBe(200);
    expect((await post({ entity: 'leave', action: 'add', kind: 'FOLGA', startDate: '2026-09-20', endDate: '2026-09-20' })).status).toBe(200);
  });
});

describe('Aba de folgas fechada para o Gerente', () => {
  it('agendar folga é RECUSADO pelo servidor', async () => {
    await fechar('MANAGER_AREA_LEAVES');
    const r = await post({ entity: 'leave', action: 'add', kind: 'FOLGA', startDate: '2026-09-21', endDate: '2026-09-21' });
    expect(r.status).toBe(403);
    expect(r.data.reason).toBe('FORBIDDEN');
    expect(await prisma.managerLeave.count({ where: { userId: mgrId, startDate: '2026-09-21' } })).toBe(0);
  });

  it('excluir folga também é recusado', async () => {
    const criada = await post({ entity: 'leave', action: 'add', kind: 'FOLGA', startDate: '2026-09-22', endDate: '2026-09-22' });
    await fechar('MANAGER_AREA_LEAVES');
    const r = await post({ entity: 'leave', action: 'delete', id: criada.data.id });
    expect(r.status).toBe(403);
    expect(await prisma.managerLeave.count({ where: { id: String(criada.data.id) } })).toBe(1);
  });

  it('o horário semanal cai junto — ele mora nessa aba', async () => {
    await fechar('MANAGER_AREA_LEAVES');
    const r = await post({ entity: 'workSchedule', action: 'set', weekdays: [1, 2, 3], startTime: '10:00', endTime: '19:00' });
    expect(r.status).toBe(403);
  });

  it('mas tarefas e notas continuam gravando', async () => {
    await fechar('MANAGER_AREA_LEAVES');
    expect((await post({ entity: 'task', action: 'create', title: 'segue valendo' })).status).toBe(200);
    expect((await post({ entity: 'note', action: 'add', content: '<p>segue valendo</p>' })).status).toBe(200);
  });
});

describe('Aba aberta só para leitura', () => {
  it('ver sem editar não grava', async () => {
    await fechar('MANAGER_AREA_NOTES', true, false);
    const r = await post({ entity: 'note', action: 'add', content: '<p>não deve gravar</p>' });
    expect(r.status).toBe(403);
  });
});

describe('Módulo inteiro fechado', () => {
  it('nenhuma das três grava', async () => {
    await fechar('MANAGER_AREA');
    expect((await post({ entity: 'task', action: 'create', title: 'x' })).status).toBe(403);
    expect((await post({ entity: 'note', action: 'add', content: '<p>x</p>' })).status).toBe(403);
    expect((await post({ entity: 'leave', action: 'add', kind: 'FOLGA', startDate: '2026-09-23', endDate: '2026-09-23' })).status).toBe(403);
  });
});
