import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { iniciarConferencia, cancelarConferencia, getSessao, sessaoEmAndamento } from '@/lib/commands/sessao';
import type { SessionUser } from '@/lib/auth/session';

/** v1.192.0: toda conferência nasce Leitor + Manual, mande o cliente o que mandar; cancelada libera uma nova. */
const sfx = `mu${process.pid.toString(36)}${Date.now().toString(36).slice(-4)}`;
let unitId = ''; let userId = '';
const user = (): SessionUser => ({ id: userId, name: 'Caixa', role: 'CASHIER', unitIds: [unitId], seesAllUnits: false, needsTerms: false });

beforeAll(async () => {
  unitId = (await prisma.unit.create({ data: { code: `MU-${sfx}`, name: `Método único ${sfx}`, timezone: 'America/Sao_Paulo', cutoffHour: 4 } })).id;
  userId = (await prisma.user.create({ data: { name: 'Caixa', email: `mu-${sfx}@teste.local`, role: 'CASHIER', passwordHash: 'x', memberships: { create: { unitId } } } })).id;
  await prisma.commandSequence.create({ data: { unitId, rangeStart: 1, rangeEnd: 20, active: true } });
});
afterAll(async () => {
  await prisma.commandCountSession.deleteMany({ where: { unitId } });
  await prisma.commandSequence.deleteMany({ where: { unitId } });
  await prisma.auditLog.deleteMany({ where: { unitId } });
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.unit.deleteMany({ where: { id: unitId } });
});

describe('método único', () => {
  it('pedir MANUAL ou LEITOR grava MISTO; sem método também', async () => {
    for (const method of ['MANUAL', 'LEITOR', undefined] as const) {
      const r = await iniciarConferencia(user(), { unitId, type: 'COMPLETA', method });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect((await getSessao(user(), r.sessionId))?.method).toBe('MISTO');
      expect((await cancelarConferencia(user(), r.sessionId)).ok).toBe(true);
    }
  });
  it('cancelada deixa de ser "em andamento" e uma nova pode começar; cancelar de novo é JA_CONCLUIDA', async () => {
    const a = await iniciarConferencia(user(), { unitId, type: 'COMPLETA' });
    if (!a.ok) throw new Error(a.reason);
    expect((await cancelarConferencia(user(), a.sessionId)).ok).toBe(true);
    expect(await sessaoEmAndamento(user(), unitId)).toBeNull();
    expect(await cancelarConferencia(user(), a.sessionId)).toMatchObject({ ok: false, reason: 'JA_CONCLUIDA' });
    const b = await iniciarConferencia(user(), { unitId, type: 'COMPLETA' });
    expect(b.ok).toBe(true);
    if (b.ok) await cancelarConferencia(user(), b.sessionId);
  });
});
