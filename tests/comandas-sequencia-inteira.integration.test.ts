import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { getActiveSequence } from '@/lib/commands/active';
import { submitCount } from '@/lib/commands/count';
import { closeDivergence } from '@/lib/commands/lifecycle';
import { getScanContext, submitScanCount } from '@/lib/commands/scan';
import { iniciarConferencia, marcarComanda, marcarComandas, getSessao, finalizarConferencia, cancelarConferencia, listarConferencias } from '@/lib/commands/sessao';
import type { SessionUser } from '@/lib/auth/session';

/**
 * SEQUÊNCIA INTEIRA (v1.193.0) — decisão do Pedro (06/11/2026): "se a unidade
 * tem de 1 a 700, deixe a sequência 1, 2, 3… e não 1, 2, 4, 5, 6, 7, 9". A
 * comanda dada como ausente numa conferência pode ter sido recuperada na
 * seguinte: ela fica na grade, e marcá-la presente a recupera — fecha a
 * apuração ou desfaz a baixa. O que não for marcado segue como estava.
 */
const sfx = `sq${process.pid.toString(36)}${Date.now().toString(36).slice(-4)}`;
let unitId = ''; let mgrId = ''; let supId = '';
const mgr = (): SessionUser => ({ id: mgrId, name: 'Gerente', role: 'MANAGER', unitIds: [unitId], seesAllUnits: false, needsTerms: false });
const sup = (): SessionUser => ({ id: supId, name: 'Sup', role: 'SUPERVISOR', unitIds: [unitId], seesAllUnits: false, needsTerms: false });
const todas = (de: number, ate: number) => Array.from({ length: ate - de + 1 }, (_, i) => de + i);

beforeAll(async () => {
  unitId = (await prisma.unit.create({ data: { code: `SQ-${sfx}`, name: `Sequência ${sfx}`, timezone: 'America/Sao_Paulo', cutoffHour: 4 } })).id;
  mgrId = (await prisma.user.create({ data: { name: 'Ger', email: `sq-g-${sfx}@teste.local`, role: 'MANAGER', passwordHash: 'x', memberships: { create: { unitId } } } })).id;
  supId = (await prisma.user.create({ data: { name: 'Sup', email: `sq-s-${sfx}@teste.local`, role: 'SUPERVISOR', passwordHash: 'x', memberships: { create: { unitId } } } })).id;
  await prisma.commandSequence.create({ data: { unitId, rangeStart: 1, rangeEnd: 10, active: true } });
});
afterAll(async () => {
  await prisma.commandCountSession.deleteMany({ where: { unitId } });
  await prisma.commandCount.deleteMany({ where: { unitId } });
  await prisma.commandDivergence.deleteMany({ where: { unitId } });
  await prisma.commandSequence.deleteMany({ where: { unitId } });
  await prisma.notification.deleteMany({ where: { userId: { in: [mgrId, supId] } } }).catch(() => {});
  await prisma.auditLog.deleteMany({ where: { unitId } });
  await prisma.user.deleteMany({ where: { id: { in: [mgrId, supId] } } });
  await prisma.unit.deleteMany({ where: { id: unitId } });
});

describe('a sequência nunca perde número', () => {
  it('baixada SAI da julgada (active) mas FICA na sequência (all); o leitor e a sessão veem as 10', async () => {
    const r1 = await submitCount(mgr(), { unitId, operationalDate: '2026-11-01', allPresent: false, presentNumbers: todas(1, 10).filter((n) => n !== 3 && n !== 7), inUseNumbers: [], observation: 'sumiram' });
    expect(r1.ok && r1.newDivergences).toBe(2);
    const d3 = await prisma.commandDivergence.findFirst({ where: { unitId, number: 3, status: 'OPEN' } });
    expect((await closeDivergence(sup(), d3!.id, 'LOST')).ok).toBe(true);

    const seq = await getActiveSequence(unitId);
    expect([...seq.all].sort((a, b) => a - b)).toEqual(todas(1, 10));
    expect(seq.active.has(3)).toBe(false);
    expect(seq.lost.has(3)).toBe(true);
    expect(seq.active.has(7)).toBe(true); // em apuração continua julgada

    const scan = await getScanContext(mgr(), unitId);
    expect(scan.ok && scan.ctx.activeNumbers).toEqual(todas(1, 10));

    const s = await iniciarConferencia(mgr(), { unitId, type: 'COMPLETA' });
    if (!s.ok) throw new Error(s.reason);
    const p = await getSessao(mgr(), s.sessionId);
    expect(p?.escopo).toEqual(todas(1, 10));
    expect(p?.baixadas).toEqual([3]);
    expect(p?.emApuracao).toEqual([7]);
    /* v1.193.1: a baixada fica na grade mas NÃO conta — esperadas 9, e ela não é faltante */
    expect(p?.expected).toBe(9);
    expect(p?.faltando).toEqual(todas(1, 10).filter((n) => n !== 3));
    /* marcada, passa a contar: 1 vista de 10 */
    await marcarComanda(mgr(), { sessionId: s.sessionId, number: 3, state: 'CONFERIDA', method: 'MANUAL' });
    const p2 = await getSessao(mgr(), s.sessionId);
    expect(p2?.expected).toBe(10);
    expect(p2?.pct).toBe(10);
    await cancelarConferencia(mgr(), s.sessionId);
  });

  it('sem marcar, nada muda: baixada não vira faltante, em apuração não abre divergência nova — e NÃO pede observação de novo', async () => {
    /* v1.193.1: a única ausente (7) já está em apuração → sem observação passa */
    const r = await submitCount(mgr(), { unitId, operationalDate: '2026-11-02', allPresent: false, presentNumbers: todas(1, 10).filter((n) => n !== 3 && n !== 7), inUseNumbers: [] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.absent).toEqual([7]); // a 3 (baixada) não é julgada
    expect(r.jaEmApuracao).toEqual([7]);
    expect(r.newDivergences).toBe(0); // a 7 já tem divergência aberta
    expect(r.recovered).toEqual([]);
    /* ausente NOVA continua exigindo observação */
    const semObs = await submitCount(mgr(), { unitId, operationalDate: '2026-11-02', allPresent: false, presentNumbers: todas(1, 10).filter((n) => n !== 3 && n !== 7 && n !== 9), inUseNumbers: [] });
    expect(semObs).toMatchObject({ ok: false, reason: 'OBSERVATION_REQUIRED' });
  });

  it('o histórico nunca escapa do alcance: pedir a unidade de outro pelo filtro devolve vazio', async () => {
    const outro: SessionUser = { id: supId, name: 'Fora', role: 'SUPERVISOR', unitIds: ['unidade-inexistente'], seesAllUnits: false, needsTerms: false };
    expect(await listarConferencias(outro, { unitId })).toEqual([]);
    expect((await listarConferencias(mgr(), { unitId })).length).toBeGreaterThanOrEqual(1);
  });

  it('marcar presente a que estava EM APURAÇÃO fecha a divergência como RECUPERADA (por quem conferiu)', async () => {
    const r = await submitCount(mgr(), { unitId, operationalDate: '2026-11-03', allPresent: false, presentNumbers: todas(1, 10).filter((n) => n !== 3), inUseNumbers: [], observation: 'x' });
    expect(r.ok && r.recovered).toEqual([7]);
    const d7 = await prisma.commandDivergence.findFirst({ where: { unitId, number: 7 }, orderBy: { createdAt: 'desc' } });
    expect(d7).toMatchObject({ status: 'CLOSED', outcome: 'RECOVERED', resolvedById: mgrId });
    expect(await prisma.commandDivergence.count({ where: { unitId, number: 7, status: { in: ['OPEN', 'INVESTIGATING'] } } })).toBe(0);
    expect(await prisma.auditLog.count({ where: { unitId, action: 'COMMAND_DIV_RECOVERED' } })).toBeGreaterThanOrEqual(1);
  });

  it('marcar presente a BAIXADA desfaz a baixa: volta à julgada, sem reescrever a divergência da baixa', async () => {
    const antes = await prisma.commandDivergence.findFirst({ where: { unitId, number: 3, outcome: 'LOST' } });
    const r = await submitCount(mgr(), { unitId, operationalDate: '2026-11-04', allPresent: false, presentNumbers: [], inUseNumbers: [3], observation: 'achamos a 3; o resto não contamos' });
    expect(r.ok && r.recovered).toEqual([3]);
    const seq = await getActiveSequence(unitId);
    expect(seq.active.has(3)).toBe(true);
    expect(seq.lost.has(3)).toBe(false);
    expect((await prisma.commandDivergence.findUnique({ where: { id: antes!.id } }))?.outcome).toBe('LOST'); // história intacta
    expect(await prisma.commandDivergence.count({ where: { unitId, number: 3, outcome: 'RECOVERED' } })).toBe(1);
  });

  it('o leitor: bipar a baixada a recupera; a sessão: lote em uma chamada e finalizar recupera também', async () => {
    const d5 = (await submitCount(mgr(), { unitId, operationalDate: '2026-11-05', allPresent: false, presentNumbers: todas(1, 10).filter((n) => n !== 5), inUseNumbers: [], observation: 'sumiu a 5' })).ok
      ? await prisma.commandDivergence.findFirst({ where: { unitId, number: 5, status: 'OPEN' } }) : null;
    expect((await closeDivergence(sup(), d5!.id, 'LOST')).ok).toBe(true);
    expect((await getActiveSequence(unitId)).lost.has(5)).toBe(true);

    const scan = await submitScanCount(mgr(), { unitId, scannedNumbers: todas(1, 10) });
    expect(scan.ok && scan.absent).toEqual([]);
    expect((await getActiveSequence(unitId)).lost.has(5)).toBe(false);

    /* de novo baixada, agora recuperada pela SESSÃO (Leitor + Manual) */
    await submitCount(mgr(), { unitId, operationalDate: '2026-11-06', allPresent: false, presentNumbers: todas(1, 10).filter((n) => n !== 5), inUseNumbers: [], observation: 'sumiu de novo' });
    const d5b = await prisma.commandDivergence.findFirst({ where: { unitId, number: 5, status: 'OPEN' } });
    await closeDivergence(sup(), d5b!.id, 'LOST');
    const s = await iniciarConferencia(mgr(), { unitId, type: 'COMPLETA' });
    if (!s.ok) throw new Error(s.reason);
    const lote = await marcarComandas(mgr(), { sessionId: s.sessionId, numbers: [...todas(1, 10), 99], state: 'CONFERIDA', method: 'MANUAL' });
    expect(lote).toMatchObject({ ok: true, marcadas: 10, ignoradas: [99], total: 10 });
    const fim = await finalizarConferencia(mgr(), { sessionId: s.sessionId });
    expect(fim.ok && fim.faltando).toEqual([]);
    expect((await getActiveSequence(unitId)).lost.has(5)).toBe(false);
  });
});
