import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import type { SessionUser } from '@/lib/auth/session';

/**
 * A matriz valendo na rota, de verdade.
 *
 * "Editar" desmarcado passa a recusar a gravação; e a exportação — que baixa o
 * dado inteiro por um GET — passa a exigir "Ver". Os dois lados importam: se a
 * exportação exigisse "Editar", quem tem acesso só de leitura perderia o
 * relatório que sempre teve.
 */

const sfx = `gr${process.pid.toString(36)}`;
let unitId: string;
let mgrId: string;
let papel: SessionUser['role'] = 'MANAGER';
const user = (): SessionUser => ({ id: mgrId, name: 'Gerente', role: papel, unitIds: [unitId], seesAllUnits: false, needsTerms: false });

vi.mock('@/lib/auth/session', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getSessionUser: async () => user(),
}));

async function post(mod: string, rota: string, body: unknown) {
  const { POST } = await import(/* @vite-ignore */ mod);
  const res = await POST(new Request(`http://localhost${rota}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }));
  return res.status as number;
}
async function get(mod: string, rota: string) {
  const { GET } = await import(/* @vite-ignore */ mod);
  const res = await GET(new Request(`http://localhost${rota}`));
  return res.status as number;
}

async function definir(module: string, canView: boolean, canEdit: boolean) {
  await prisma.rolePermission.upsert({
    where: { role_module: { role: 'MANAGER', module } },
    create: { role: 'MANAGER', module, canView, canEdit },
    update: { canView, canEdit },
  });
}

beforeAll(async () => {
  unitId = (await prisma.unit.create({ data: { code: `GR-${sfx}`, name: 'U Guarda', timezone: 'America/Sao_Paulo', cutoffHour: 4 } })).id;
  mgrId = (await prisma.user.create({ data: { name: 'Gerente', email: `${sfx}@e.com`, role: 'MANAGER', passwordHash: 'x' } })).id;
  await prisma.unitMembership.create({ data: { userId: mgrId, unitId } });
});

afterEach(async () => { papel = 'MANAGER'; await prisma.rolePermission.deleteMany({ where: { role: 'MANAGER', module: { in: ['WASTE', 'TRAINING'] } } }); });

afterAll(async () => {
  await prisma.rolePermission.deleteMany({ where: { role: 'MANAGER', module: { in: ['WASTE', 'TRAINING'] } } }).catch(() => {});
  await prisma.unitMembership.deleteMany({ where: { userId: mgrId } }).catch(() => {});
  await prisma.unit.delete({ where: { id: unitId } }).catch(() => {});
  await prisma.user.delete({ where: { id: mgrId } }).catch(() => {});
  await prisma.$disconnect();
});

describe('Desperdícios com "Editar" desmarcado', () => {
  it('a gravação é recusada', async () => {
    await definir('WASTE', true, false);
    expect(await post('@/app/api/waste/route', '/api/waste', { unitId, items: [] })).toBe(403);
  });

  it('mas a exportação continua, porque ela pede só "Ver"', async () => {
    await definir('WASTE', true, false);
    const st = await get('@/app/api/waste/export/route', `/api/waste/export?unit=${unitId}&year=2026&month=9`);
    expect(st).not.toBe(403);
  });
});

describe('Módulo fechado por completo', () => {
  it('a exportação também é recusada', async () => {
    await definir('WASTE', false, false);
    const st = await get('@/app/api/waste/export/route', `/api/waste/export?unit=${unitId}&year=2026&month=9`);
    expect(st).toBe(403);
  });
});

describe('Sem ninguém mexer, nada muda', () => {
  it('o Gerente grava desperdício como sempre', async () => {
    expect(await post('@/app/api/waste/route', '/api/waste', { unitId, items: [] })).not.toBe(403);
  });

  it('e a exportação responde', async () => {
    const st = await get('@/app/api/waste/export/route', `/api/waste/export?unit=${unitId}&year=2026&month=9`);
    expect(st).not.toBe(403);
  });
});

describe('Admin e CEO não são barrados', () => {
  it('mesmo com a linha da matriz fechada', async () => {
    /* isFullAccess corta antes de consultar: o Admin não pode se trancar. */
    await definir('WASTE', false, false);
    papel = 'ADMIN';
    expect(await post('@/app/api/waste/route', '/api/waste', { unitId, items: [] })).not.toBe(403);
  });
});
