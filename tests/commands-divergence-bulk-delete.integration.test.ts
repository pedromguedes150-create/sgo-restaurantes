import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { deleteOpenDivergencesOfDay, opHasTarget } from '@/lib/admin-ops';
import type { SessionUser } from '@/lib/auth/session';

/**
 * Exclusão em LOTE de divergências abertas.
 *
 * Subi esta ação sem teste nenhum e ela chegou quebrada em produção
 * ("Requisição inválida"): a guarda genérica da rota exigia `id`, e esta
 * operação é identificada por unidade + dia. Ação destrutiva sem teste é
 * exatamente o que não pode existir — estes casos cobrem o alcance dela.
 */

const sfx = `blk${process.pid.toString(36)}`;
let unitId: string;
let outraUnitId: string;
let admId: string;
let mgrId: string;

const adm = (): SessionUser => ({ id: admId, name: 'Adm', role: 'ADMIN', unitIds: [], seesAllUnits: true, needsTerms: false });
const mgr = (): SessionUser => ({ id: mgrId, name: 'Ger', role: 'MANAGER', unitIds: [unitId], seesAllUnits: false, needsTerms: false });

const emDia = (dia: string) => new Date(dia + 'T12:00:00.000Z');

beforeAll(async () => {
  unitId = (await prisma.unit.create({ data: { code: `BLK-${sfx}`, name: 'U Lote', timezone: 'America/Sao_Paulo', cutoffHour: 4 } })).id;
  outraUnitId = (await prisma.unit.create({ data: { code: `BLK2-${sfx}`, name: 'U Outra', timezone: 'America/Sao_Paulo', cutoffHour: 4 } })).id;
  admId = (await prisma.user.create({ data: { name: 'Adm', email: `a${sfx}@e.com`, role: 'ADMIN', passwordHash: 'x' } })).id;
  mgrId = (await prisma.user.create({ data: { name: 'Ger', email: `g${sfx}@e.com`, role: 'MANAGER', passwordHash: 'x' } })).id;

  await prisma.commandDivergence.createMany({
    data: [
      // 3 abertas no dia alvo, na unidade alvo
      { unitId, number: 10, status: 'OPEN', createdAt: emDia('2026-08-20') },
      { unitId, number: 11, status: 'OPEN', createdAt: emDia('2026-08-20') },
      { unitId, number: 12, status: 'OPEN', createdAt: emDia('2026-08-20') },
      // já investigada no mesmo dia — NÃO pode ser tocada
      { unitId, number: 13, status: 'INVESTIGATING', createdAt: emDia('2026-08-20') },
      // encerrada no mesmo dia — NÃO pode ser tocada
      { unitId, number: 14, status: 'CLOSED', outcome: 'RECOVERED', createdAt: emDia('2026-08-20') },
      // aberta em OUTRO dia — fora do alvo
      { unitId, number: 15, status: 'OPEN', createdAt: emDia('2026-08-19') },
      // aberta no dia alvo mas em OUTRA unidade — fora do alvo
      { unitId: outraUnitId, number: 16, status: 'OPEN', createdAt: emDia('2026-08-20') },
    ],
  });
});

afterAll(async () => {
  await prisma.commandDivergence.deleteMany({ where: { unitId: { in: [unitId, outraUnitId] } } }).catch(() => {});
  await prisma.unit.deleteMany({ where: { id: { in: [unitId, outraUnitId] } } }).catch(() => {});
  await prisma.user.deleteMany({ where: { id: { in: [admId, mgrId] } } }).catch(() => {});
  await prisma.$disconnect();
});

describe('Exclusão em lote de divergências abertas', () => {
  it('só ADMIN executa', async () => {
    const r = await deleteOpenDivergencesOfDay(mgr(), unitId, '2026-08-20');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('FORBIDDEN');
  });

  it('recusa data mal formada', async () => {
    const r = await deleteOpenDivergencesOfDay(adm(), unitId, '20/08/2026');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('INVALID');
  });

  it('dia sem divergência aberta devolve zero, sem erro', async () => {
    const r = await deleteOpenDivergencesOfDay(adm(), unitId, '2026-01-01');
    expect(r.ok).toBe(true);
    expect(r.deleted).toBe(0);
  });

  it('apaga SÓ as abertas, SÓ do dia e SÓ da unidade', async () => {
    const r = await deleteOpenDivergencesOfDay(adm(), unitId, '2026-08-20');
    expect(r.ok).toBe(true);
    expect(r.deleted).toBe(3);
    expect(r.numbers).toEqual([10, 11, 12]);

    const restantes = await prisma.commandDivergence.findMany({
      where: { unitId: { in: [unitId, outraUnitId] } },
      select: { number: true, status: true },
      orderBy: { number: 'asc' },
    });
    // 13 investigando, 14 encerrada, 15 de outro dia, 16 de outra unidade
    expect(restantes.map((d) => d.number)).toEqual([13, 14, 15, 16]);
  });

  it('a exclusão fica registrada na auditoria', async () => {
    const log = await prisma.auditLog.findFirst({
      where: { unitId, action: 'COMMAND_DIVERGENCE_BULK_DELETE' },
      orderBy: { createdAt: 'desc' },
    });
    expect(log).toBeTruthy();
    const meta = log?.metadata as { deleted?: number } | null;
    expect(meta?.deleted).toBe(3);
  });
});

describe('A guarda da rota (foi ela que quebrou em produção)', () => {
  it('aceita a exclusão em lote com unidade + dia, SEM id', () => {
    expect(opHasTarget({ entity: 'commandDivergencesOfDay', unitId: 'u1', date: '2026-08-20' })).toBe(true);
  });

  it('recusa a exclusão em lote sem unidade ou sem dia', () => {
    expect(opHasTarget({ entity: 'commandDivergencesOfDay', unitId: 'u1' })).toBe(false);
    expect(opHasTarget({ entity: 'commandDivergencesOfDay', date: '2026-08-20' })).toBe(false);
  });

  it('as demais exclusões continuam exigindo id ou ids', () => {
    expect(opHasTarget({ entity: 'waste', id: 'x' })).toBe(true);
    expect(opHasTarget({ entity: 'taskInstance', ids: ['a', 'b'] })).toBe(true);
    expect(opHasTarget({ entity: 'waste' })).toBe(false);
    /* o caso exato do defeito: sem id, uma entidade comum tem de ser recusada
       mesmo que traga unitId e date */
    expect(opHasTarget({ entity: 'waste', unitId: 'u1', date: '2026-08-20' })).toBe(false);
  });

  it('corpo vazio ou nulo é recusado', () => {
    expect(opHasTarget(null)).toBe(false);
    expect(opHasTarget({})).toBe(false);
  });
});
