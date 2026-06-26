import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { parseBRNumber, parseCancellationsCsv, importCancellations } from '@/lib/cancellations/import';
import { justifyCancellation } from '@/lib/cancellations/justify';
import type { SessionUser } from '@/lib/auth/session';

describe('parser de valores e CSV (puro)', () => {
  it('parseBRNumber lida com formato BR', () => {
    expect(parseBRNumber('47,90')).toBe(47.9);
    expect(parseBRNumber('1.234,56')).toBe(1234.56);
    expect(parseBRNumber('R$ 89,00')).toBe(89);
    expect(parseBRNumber('1234.56')).toBe(1234.56);
  });

  it('parseCancellationsCsv mapeia colunas PT e ignora linhas sem cupom', () => {
    const csv = 'Cupom;Operador;Valor\n100245;Caixa 01;47,90\n100247;Caixa 02;1.234,56\n;Caixa 03;10,00';
    const { rows, mapped } = parseCancellationsCsv(csv);
    expect(mapped).toBe(true);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ couponNumber: '100245', cashOperator: 'Caixa 01', value: 47.9 });
    expect(rows[1].value).toBe(1234.56);
  });

  it('retorna mapped=false sem colunas reconhecíveis', () => {
    expect(parseCancellationsCsv('a;b;c\n1;2;3').mapped).toBe(false);
  });
});

const sfx = process.pid.toString(36);
let unitId: string;
let admId: string;
let mgrId: string;
let reasonId: string;
const adm = (): SessionUser => ({ id: admId, name: 'A', role: 'ADMIN', unitIds: [], seesAllUnits: true, needsTerms: false });
const mgr = (): SessionUser => ({ id: mgrId, name: 'M', role: 'MANAGER', unitIds: [unitId], seesAllUnits: false, needsTerms: false });

beforeAll(async () => {
  const unit = await prisma.unit.create({ data: { code: `CNC-${sfx}`, name: 'U Canc', timezone: 'America/Sao_Paulo', cutoffHour: 4 } });
  unitId = unit.id;
  admId = (await prisma.user.create({ data: { name: 'A', email: `cna-${sfx}@e.com`, role: 'ADMIN', passwordHash: 'x' } })).id;
  mgrId = (await prisma.user.create({ data: { name: 'M', email: `cnm-${sfx}@e.com`, role: 'MANAGER', passwordHash: 'x' } })).id;
  await prisma.unitMembership.create({ data: { userId: mgrId, unitId } });
  reasonId = (await prisma.cancellationReason.create({ data: { name: `Motivo ${sfx}`, order: 99 } })).id;
});

afterAll(async () => {
  await prisma.unit.delete({ where: { id: unitId } }).catch(() => {});
  await prisma.user.deleteMany({ where: { id: { in: [admId, mgrId] } } }).catch(() => {});
  await prisma.cancellationReason.delete({ where: { id: reasonId } }).catch(() => {});
  await prisma.$disconnect();
});

describe('Cancelamentos (Módulo 4) — integração', () => {
  const csv = 'Cupom;Operador;Valor\n900001;Caixa 01;10,00\n900002;Caixa 02;20,00';

  it('admin importa e cria pendências; não-admin é negado', async () => {
    const rows = parseCancellationsCsv(csv).rows;
    const denied = await importCancellations(mgr(), { unitId, fileName: 'x.csv', rows });
    expect(denied.ok).toBe(false);

    const r = await importCancellations(adm(), { unitId, operationalDate: '2026-06-01', fileName: 'x.csv', rows });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.created).toBe(2);

    const count = await prisma.cancellation.count({ where: { unitId, status: 'PENDING' } });
    expect(count).toBe(2);
  });

  it('gerente justifica; segunda vez retorna ALREADY', async () => {
    const c = await prisma.cancellation.findFirst({ where: { unitId, status: 'PENDING' } });
    const ok = await justifyCancellation(mgr(), c!.id, { reasonId, note: 'ok' });
    expect(ok.ok).toBe(true);
    const again = await justifyCancellation(mgr(), c!.id, { reasonId });
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.reason).toBe('ALREADY');
  });
});
