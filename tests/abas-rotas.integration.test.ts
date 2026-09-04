import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import type { SessionUser } from '@/lib/auth/session';

/**
 * As ROTAS recusando a gravação de aba fechada.
 *
 * Esconder a aba tira o botão; quem manda a requisição direto passa por cima.
 * Estes casos chamam a rota de verdade, como o navegador chamaria.
 */

const sfx = `ab${process.pid.toString(36)}`;
let unitId: string;
let mgrId: string;
const mgr = (): SessionUser => ({ id: mgrId, name: 'Gerente', role: 'MANAGER', unitIds: [unitId], seesAllUnits: false, needsTerms: false });

vi.mock('@/lib/auth/session', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getSessionUser: async () => mgr(),
}));

async function chama(rota: string, mod: string, body: unknown) {
  const { POST } = await import(/* @vite-ignore */ mod);
  const res = await POST(new Request(`http://localhost${rota}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }));
  return res.status as number;
}

const CHAVES = ['OIL_TAB_NEW', 'CASH_TAB_VAULT', 'PRODUCTS_TAB_NEW', 'CERTIFICATES_TAB_NEW'];
async function fechar(module: string) {
  await prisma.rolePermission.upsert({
    where: { role_module: { role: 'MANAGER', module } },
    create: { role: 'MANAGER', module, canView: false, canEdit: false },
    update: { canView: false, canEdit: false },
  });
}

beforeAll(async () => {
  unitId = (await prisma.unit.create({ data: { code: `AB-${sfx}`, name: 'U Abas', timezone: 'America/Sao_Paulo', cutoffHour: 4 } })).id;
  mgrId = (await prisma.user.create({ data: { name: 'Gerente', email: `${sfx}@e.com`, role: 'MANAGER', passwordHash: 'x' } })).id;
  await prisma.unitMembership.create({ data: { userId: mgrId, unitId } });
});

afterEach(async () => { await prisma.rolePermission.deleteMany({ where: { role: 'MANAGER', module: { in: CHAVES } } }); });

afterAll(async () => {
  await prisma.rolePermission.deleteMany({ where: { role: 'MANAGER', module: { in: CHAVES } } }).catch(() => {});
  await prisma.unitMembership.deleteMany({ where: { userId: mgrId } }).catch(() => {});
  await prisma.unit.delete({ where: { id: unitId } }).catch(() => {});
  await prisma.user.delete({ where: { id: mgrId } }).catch(() => {});
  await prisma.$disconnect();
});

describe('Coleta de Óleo — aba "Lançar coleta"', () => {
  it('com a aba aberta, a rota NÃO recusa por permissão', async () => {
    const st = await chama('/api/oil', '@/app/api/oil/route', { unitId, liters: 10, pricePerLiter: 2 });
    expect(st).not.toBe(403);
  });

  it('com a aba fechada, a rota devolve 403', async () => {
    await fechar('OIL_TAB_NEW');
    const st = await chama('/api/oil', '@/app/api/oil/route', { unitId, liters: 10, pricePerLiter: 2 });
    expect(st).toBe(403);
  });
});

describe('Cofre — aba "Cofre"', () => {
  it('a contagem é recusada com a aba fechada', async () => {
    await fechar('CASH_TAB_VAULT');
    const st = await chama('/api/cash/vault', '@/app/api/cash/vault/route', { action: 'count', unitId, balances: {} });
    expect(st).toBe(403);
  });

  it('ação de LEITURA não mapeada continua passando', async () => {
    /* Regra de gravação não pode barrar rota de leitura — por isso o mapa é
       explícito, em vez de barrar tudo que não conhece. */
    await fechar('CASH_TAB_VAULT');
    const st = await chama('/api/cash/vault', '@/app/api/cash/vault/route', { action: 'suggestChange', unitId });
    expect(st).not.toBe(403);
  });
});

describe('Produtos — a aba de atendimento é separada da de pedido', () => {
  it('fechando "Nova solicitação", o pedido é recusado', async () => {
    await fechar('PRODUCTS_TAB_NEW');
    const st = await chama('/api/products', '@/app/api/products/route', { action: 'order', unitId, items: [] });
    expect(st).toBe(403);
  });

  it('e o atendimento (outra aba) segue liberado', async () => {
    await fechar('PRODUCTS_TAB_NEW');
    const st = await chama('/api/products', '@/app/api/products/route', { action: 'status', id: 'x', status: 'SENT' });
    expect(st).not.toBe(403);
  });
});

describe('Atestados — aba "Lançar"', () => {
  it('fechada, recusa o lançamento', async () => {
    await fechar('CERTIFICATES_TAB_NEW');
    const st = await chama('/api/certificates', '@/app/api/certificates/route', { unitId, collaboratorId: 'x', startDate: '2026-09-01', endDate: '2026-09-01' });
    expect(st).toBe(403);
  });
});
