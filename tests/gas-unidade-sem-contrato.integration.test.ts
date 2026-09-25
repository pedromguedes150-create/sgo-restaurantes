import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { listUnitsWithReceiptsWithoutActiveContract } from '@/lib/gas/contracts';
import type { SessionUser } from '@/lib/auth/session';

/**
 * A UNIDADE QUE RECEBE GÁS E SOME DO PAINEL DE CONTRATOS.
 *
 * O caso da Nova União: notas ligadas à unidade por ID, no histórico, mas
 * ausentes de "% cumprido". O painel mostra só contratos ativos e não vencidos;
 * uma unidade cujo contrato venceu, foi inativado, ou nunca existiu, some sem
 * dizer nada. Este levantamento faz a unidade aparecer com o motivo — por ID,
 * sem tocar em quem tem contrato vigente.
 */

const sfx = `${process.pid.toString(36)}${Date.now().toString(36).slice(-4)}`;
let uNova: string;   // recebe, contrato vencido
let uVigente: string; // recebe, contrato vigente (não deve aparecer aqui)
let uSem: string;     // recebe, nunca teve contrato
let uInativo: string; // recebe, contrato dentro do período mas inativado
let uAntiga: string;  // último recebimento fora da janela de 180 dias
let ultragaz: string;
let userId: string;

const admin = (): SessionUser => ({ id: userId, name: 'Admin', role: 'ADMIN', unitIds: [], seesAllUnits: true, needsTerms: false });

function iso(offsetDays: number): string {
  return new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);
}

const nota = (unitId: string, data: string, kg: number) =>
  prisma.gasReceipt.create({ data: { unitId, supplierId: ultragaz, operationalDate: data, quantityKg: kg, totalValue: kg * 5, pricePerKg: 5 } });

beforeAll(async () => {
  ultragaz = (await prisma.supplier.create({ data: { name: `ULTRAGAZ ${sfx}`, isGas: true } })).id;
  userId = (await prisma.user.create({ data: { name: 'Admin', email: `usc-${sfx}@t.local`, role: 'ADMIN', passwordHash: 'x' } })).id;
  for (const [key, code] of [['uNova', 'UN'], ['uVigente', 'UV'], ['uSem', 'US'], ['uInativo', 'UI'], ['uAntiga', 'UA']] as const) {
    const u = await prisma.unit.create({ data: { code: `${code}-${sfx}`, name: `${code} ${sfx}` } });
    if (key === 'uNova') uNova = u.id; else if (key === 'uVigente') uVigente = u.id; else if (key === 'uSem') uSem = u.id; else if (key === 'uInativo') uInativo = u.id; else uAntiga = u.id;
  }
});

beforeEach(async () => {
  const ids = [uNova, uVigente, uSem, uInativo, uAntiga];
  await prisma.gasReceipt.deleteMany({ where: { unitId: { in: ids } } });
  await prisma.gasContract.deleteMany({ where: { unitId: { in: ids } } });
});

afterAll(async () => {
  const ids = [uNova, uVigente, uSem, uInativo, uAntiga];
  await prisma.gasReceipt.deleteMany({ where: { unitId: { in: ids } } });
  await prisma.gasContract.deleteMany({ where: { unitId: { in: ids } } });
  await prisma.unit.deleteMany({ where: { id: { in: ids } } });
  await prisma.supplier.delete({ where: { id: ultragaz } }).catch(() => {});
  await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  await prisma.$disconnect();
});

async function levantar() {
  const todos = await listUnitsWithReceiptsWithoutActiveContract(admin());
  return new Map(todos.map((u) => [u.unitId, u]));
}

describe('o caso da Nova União', () => {
  it('unidade com recebimento e contrato vencido aparece com motivo CONTRATO_VENCIDO', async () => {
    await nota(uNova, iso(-10), 6612 / 2);
    await nota(uNova, iso(-5), 6612 / 2);
    await prisma.gasContract.create({ data: { unitId: uNova, supplierId: ultragaz, startDate: iso(-400), endDate: iso(-30), quantityKg: 10000, pricePerKg: 5 } });

    const m = await levantar();
    const nova = m.get(uNova);
    expect(nova).toBeDefined();
    expect(nova!.motivo).toBe('CONTRATO_VENCIDO');
    expect(nova!.receiptsKg).toBe(6612);
    expect(nova!.receiptsCount).toBe(2);
    expect(nova!.ultimoContrato?.endDate).toBe(iso(-30));
  });
});

describe('cada motivo, e quem NÃO deve aparecer', () => {
  it('contrato vigente: a unidade NÃO entra (já está em % cumprido)', async () => {
    await nota(uVigente, iso(-3), 500);
    await prisma.gasContract.create({ data: { unitId: uVigente, supplierId: ultragaz, startDate: iso(-30), endDate: iso(+30), quantityKg: 10000, pricePerKg: 5 } });
    const m = await levantar();
    expect(m.has(uVigente)).toBe(false);
  });

  it('nunca teve contrato: SEM_CONTRATO, sem detalhe de contrato', async () => {
    await nota(uSem, iso(-2), 300);
    const m = await levantar();
    expect(m.get(uSem)?.motivo).toBe('SEM_CONTRATO');
    expect(m.get(uSem)?.ultimoContrato).toBeUndefined();
  });

  it('contrato dentro do período mas inativado: CONTRATO_INATIVO', async () => {
    await nota(uInativo, iso(-1), 200);
    await prisma.gasContract.create({ data: { unitId: uInativo, supplierId: ultragaz, startDate: iso(-30), endDate: iso(+30), quantityKg: 10000, pricePerKg: 5, active: false } });
    const m = await levantar();
    expect(m.get(uInativo)?.motivo).toBe('CONTRATO_INATIVO');
    expect(m.get(uInativo)?.ultimoContrato?.active).toBe(false);
  });

  it('último recebimento fora da janela de 180 dias NÃO nag', async () => {
    await nota(uAntiga, iso(-200), 400);
    const m = await levantar();
    expect(m.has(uAntiga)).toBe(false);
  });
});

describe('escopo por unidade', () => {
  it('gerente só vê as suas unidades', async () => {
    await nota(uSem, iso(-2), 300);
    await nota(uNova, iso(-2), 300);
    const gerente: SessionUser = { id: userId, name: 'G', role: 'MANAGER', unitIds: [uSem], seesAllUnits: false, needsTerms: false };
    const lista = await listUnitsWithReceiptsWithoutActiveContract(gerente);
    expect(lista.map((u) => u.unitId)).toEqual([uSem]);
  });
});
