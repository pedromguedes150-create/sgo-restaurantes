import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { createGasReceipt } from '@/lib/gas/create';
import type { SessionUser } from '@/lib/auth/session';

const sfx = process.pid.toString(36);
let unitId: string;
let unit2Id: string;
let userId: string;
let supplierId: string;
let supplier2Id: string;

const mgr = (): SessionUser => ({ id: userId, name: 'Ger', role: 'MANAGER', unitIds: [unitId, unit2Id], seesAllUnits: false, needsTerms: false });

beforeAll(async () => {
  unitId = (await prisma.unit.create({ data: { code: `GR-${sfx}`, name: 'U Gas', timezone: 'America/Sao_Paulo', cutoffHour: 4 } })).id;
  unit2Id = (await prisma.unit.create({ data: { code: `GR2-${sfx}`, name: 'U Gas 2', timezone: 'America/Sao_Paulo', cutoffHour: 4 } })).id;
  userId = (await prisma.user.create({ data: { name: 'G', email: `gas-${sfx}@e.com`, role: 'MANAGER', passwordHash: 'x' } })).id;
  await prisma.unitMembership.createMany({ data: [{ userId, unitId }, { userId, unitId: unit2Id }] });
  supplierId = (await prisma.supplier.create({ data: { name: `Gás A ${sfx}`, isGas: true } })).id;
  supplier2Id = (await prisma.supplier.create({ data: { name: `Gás B ${sfx}`, isGas: true } })).id;
});

afterAll(async () => {
  await prisma.gasReceipt.deleteMany({ where: { unitId: { in: [unitId, unit2Id] } } }).catch(() => {});
  await prisma.unit.deleteMany({ where: { id: { in: [unitId, unit2Id] } } }).catch(() => {});
  await prisma.supplier.deleteMany({ where: { id: { in: [supplierId, supplier2Id] } } }).catch(() => {});
  await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  await prisma.$disconnect();
});

describe('Recebimento de gás (Módulo 16)', () => {
  it('grava granel calculando preço/kg a partir de kg × valor unitário', async () => {
    const r = await createGasReceipt(mgr(), { unitId, supplierId, noteNumber: `A-${sfx}`, quantityKg: 238, pricePerKg: 7.34 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.pricePerKg).toBe(7.34);
      const fresh = await prisma.gasReceipt.findUnique({ where: { id: r.id } });
      expect(Number(fresh?.totalValue)).toBe(1746.92);
    }
  });

  /**
   * O bug que travou o Pedro no balcão: o banco tem
   * `@@unique([unitId, supplierId, noteNumber])`, o Prisma lançava P2002,
   * ninguém pegava, a rota devolvia 500 sem corpo e a tela dizia só "Falha" —
   * sem dizer que o número estava repetido nem o que fazer.
   */
  it('recusa o MESMO número do mesmo fornecedor na mesma unidade, com mensagem que diz o número', async () => {
    const num = `DUP-${sfx}`;
    const primeiro = await createGasReceipt(mgr(), { unitId, supplierId, noteNumber: num, quantityKg: 100, pricePerKg: 7 });
    expect(primeiro.ok).toBe(true);

    const repetido = await createGasReceipt(mgr(), { unitId, supplierId, noteNumber: num, quantityKg: 100, pricePerKg: 7 });
    expect(repetido.ok).toBe(false);
    if (!repetido.ok) {
      expect(repetido.reason).toBe('DUPLICATE');
      // A mensagem tem de CITAR o número — é o que torna o erro acionável.
      expect(repetido.message).toContain(num);
    }
  });

  it('o mesmo número passa em OUTRA unidade e com OUTRO fornecedor', async () => {
    const num = `MULTI-${sfx}`;
    expect((await createGasReceipt(mgr(), { unitId, supplierId, noteNumber: num, quantityKg: 50, pricePerKg: 7 })).ok).toBe(true);
    // outra unidade, mesmo fornecedor e número
    expect((await createGasReceipt(mgr(), { unitId: unit2Id, supplierId, noteNumber: num, quantityKg: 50, pricePerKg: 7 })).ok).toBe(true);
    // mesma unidade, outro fornecedor, mesmo número
    expect((await createGasReceipt(mgr(), { unitId, supplierId: supplier2Id, noteNumber: num, quantityKg: 50, pricePerKg: 7 })).ok).toBe(true);
  });

  it('sem número da nota, vários recebimentos convivem (nada a duplicar)', async () => {
    const a = await createGasReceipt(mgr(), { unitId, supplierId, quantityKg: 10, pricePerKg: 7 });
    const b = await createGasReceipt(mgr(), { unitId, supplierId, quantityKg: 10, pricePerKg: 7 });
    expect(a.ok && b.ok).toBe(true);
  });

  it('nega lançamento fora do escopo de unidade', async () => {
    const fora: SessionUser = { id: userId, name: 'X', role: 'MANAGER', unitIds: ['outra'], seesAllUnits: false, needsTerms: false };
    const r = await createGasReceipt(fora, { unitId, supplierId, quantityKg: 10, pricePerKg: 7 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('FORBIDDEN');
  });

  it('recusa quantidade ou valor inválidos', async () => {
    const r = await createGasReceipt(mgr(), { unitId, supplierId, quantityKg: 0, pricePerKg: 7 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('INVALID');
  });
});
