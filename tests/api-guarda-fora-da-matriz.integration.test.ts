import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import type { SessionUser } from '@/lib/auth/session';

/**
 * Auditoria de 04/09 das rotas que estavam FORA da matriz "por regra própria".
 *
 * Seis delas só perguntavam "tem vínculo com a unidade?" — nenhuma checava
 * perfil. O CAIXA tem vínculo (precisa, para a conferência de comandas) e a
 * matriz diz que ele só vê Comandas; mesmo assim ele justificava cancelamento,
 * confirmava inventário, marcava nota como paga, registrava andamento de
 * ocorrência e mexia em férias e escala. Agora as seis estão no mapa e este
 * teste é o que impede voltar.
 */

const sfx = `fm${process.pid.toString(36)}`;
let unitId: string;
let mgrId: string;
let papel: SessionUser['role'] = 'MANAGER';
const user = (): SessionUser => ({ id: mgrId, name: 'Gerente', role: papel, unitIds: [unitId], seesAllUnits: false, needsTerms: false });

vi.mock('@/lib/auth/session', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getSessionUser: async () => user(),
}));

async function post(mod: string, rota: string, body: unknown, id = 'nao-existe') {
  const { POST } = await import(/* @vite-ignore */ mod);
  const res = await POST(new Request(`http://localhost${rota}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }), { params: { id } });
  return res.status as number;
}

async function fechar(module: string) {
  await prisma.rolePermission.upsert({
    where: { role_module: { role: 'MANAGER', module } },
    create: { role: 'MANAGER', module, canView: true, canEdit: false },
    update: { canView: true, canEdit: false },
  });
}

const MODULOS = ['CANCELLATIONS', 'INVENTORY', 'NOTES_TAB_LIST', 'OCCURRENCES', 'PEOPLE_TAB_VACATION', 'SCHEDULE', 'PAYMENTS_TAB_APPROVE'];

/** rota → módulo que manda nela → arquivo e caminho reais */
const CASOS: { rota: string; mod: string; modulo: string; body: unknown }[] = [
  { rota: '/api/cancellations/x/justify', mod: '@/app/api/cancellations/[id]/justify/route', modulo: 'CANCELLATIONS', body: { reasonId: 'r' } },
  { rota: '/api/inventory/x/confirm', mod: '@/app/api/inventory/[id]/confirm/route', modulo: 'INVENTORY', body: {} },
  { rota: '/api/notes/x/status', mod: '@/app/api/notes/[id]/status/route', modulo: 'NOTES_TAB_LIST', body: { status: 'PAID' } },
  { rota: '/api/occurrences/x/update', mod: '@/app/api/occurrences/[id]/update/route', modulo: 'OCCURRENCES', body: { action: 'addUpdate', text: 'x' } },
  { rota: '/api/people/vacations/x', mod: '@/app/api/people/vacations/[id]/route', modulo: 'PEOPLE_TAB_VACATION', body: { note: 'x' } },
  { rota: '/api/people/schedule/x', mod: '@/app/api/people/schedule/[id]/route', modulo: 'SCHEDULE', body: { variation: 'LATE' } },
];

beforeAll(async () => {
  unitId = (await prisma.unit.create({ data: { code: `FM-${sfx}`, name: 'U Fora', timezone: 'America/Sao_Paulo', cutoffHour: 4 } })).id;
  mgrId = (await prisma.user.create({ data: { name: 'Gerente', email: `${sfx}@e.com`, role: 'MANAGER', passwordHash: 'x' } })).id;
  await prisma.unitMembership.create({ data: { userId: mgrId, unitId } });
});

afterEach(async () => {
  papel = 'MANAGER';
  await prisma.rolePermission.deleteMany({ where: { role: 'MANAGER', module: { in: MODULOS } } });
});

afterAll(async () => {
  await prisma.rolePermission.deleteMany({ where: { role: 'MANAGER', module: { in: MODULOS } } }).catch(() => {});
  await prisma.occurrenceUpdate.deleteMany({ where: { occurrence: { unitId } } }).catch(() => {});
  await prisma.occurrence.deleteMany({ where: { unitId } }).catch(() => {});
  await prisma.occurrenceType.deleteMany({ where: { code: { startsWith: `T-${sfx}` } } }).catch(() => {});
  await prisma.unitMembership.deleteMany({ where: { userId: mgrId } }).catch(() => {});
  await prisma.unit.delete({ where: { id: unitId } }).catch(() => {});
  await prisma.user.delete({ where: { id: mgrId } }).catch(() => {});
  await prisma.$disconnect();
});

describe('As seis rotas que só olhavam a unidade agora olham a matriz', () => {
  for (const c of CASOS) {
    it(`${c.rota}: "Editar" desmarcado em ${c.modulo} recusa`, async () => {
      await fechar(c.modulo);
      expect(await post(c.mod, c.rota, c.body)).toBe(403);
    });

    it(`${c.rota}: sem ninguém mexer, o gerente segue (a rota responde 404, não 403)`, async () => {
      expect(await post(c.mod, c.rota, c.body)).toBe(404);
    });

    it(`${c.rota}: o CAIXA é barrado sem precisar de linha na matriz`, async () => {
      /* DEFAULT_ALLOW_ONLY: o caixa só tem Comandas e Ajuda. Antes ele passava aqui. */
      papel = 'CASHIER';
      expect(await post(c.mod, c.rota, c.body)).toBe(403);
    });
  }
});

describe('Reclassificar ocorrência é de Supervisor/Admin/CEO', () => {
  let occId: string;
  let typeId: string;

  beforeAll(async () => {
    typeId = (await prisma.occurrenceType.create({ data: { code: `T-${sfx}`, name: 'Tipo teste' } })).id;
    occId = (await prisma.occurrence.create({
      data: { unitId, number: 1, operationalDate: '2026-09-04', typeName: 'Antigo', gravity: 'LOW', description: 'x' },
    })).id;
  });

  it('o gerente registra andamento, mas não reclassifica', async () => {
    const mod = '@/app/api/occurrences/[id]/update/route';
    expect(await post(mod, `/api/occurrences/${occId}/update`, { action: 'addUpdate', text: 'técnico acionado' }, occId)).toBe(200);
    expect(await post(mod, `/api/occurrences/${occId}/update`, { action: 'reclassify', typeId }, occId)).toBe(403);
  });

  it('o supervisor reclassifica', async () => {
    papel = 'SUPERVISOR';
    const mod = '@/app/api/occurrences/[id]/update/route';
    expect(await post(mod, `/api/occurrences/${occId}/update`, { action: 'reclassify', typeId }, occId)).toBe(200);
    const occ = await prisma.occurrence.findUnique({ where: { id: occId }, select: { typeName: true } });
    expect(occ?.typeName).toBe('Tipo teste');
  });
});

describe('Pagamentos: fechar a aba "Aprovar" passa a valer na rota', () => {
  const mod = '@/app/api/payments/[id]/route';

  it('aprovar com a aba fechada recusa antes de procurar o pagamento', async () => {
    await fechar('PAYMENTS_TAB_APPROVE');
    expect(await post(mod, '/api/payments/x', { action: 'approve' })).toBe(403);
    expect(await post(mod, '/api/payments/x', { action: 'approverEdit', amount: 1 })).toBe(403);
  });

  it('com a aba aberta, a rota segue até a regra de aprovador (404 para id inexistente)', async () => {
    expect(await post(mod, '/api/payments/x', { action: 'approve' })).toBe(404);
  });
});
