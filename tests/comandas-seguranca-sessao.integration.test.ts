import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import {
  iniciarConferencia, marcarComanda, getSessao, finalizarConferencia, ampliarEscopo,
} from '@/lib/commands/sessao';
import { submitCount } from '@/lib/commands/count';
import type { SessionUser } from '@/lib/auth/session';

/**
 * v1.200.0 — segurança da sessão de conferência (B2, B3, B6, C5, C6, C10)
 * e a regra de baixa definitiva encontrada.
 */

const sfx = `sg${process.pid.toString(36)}${Date.now().toString(36).slice(-4)}`;
let unitId: string;
let gerenteId: string;
let supId: string;

const gerente = (): SessionUser => ({ id: gerenteId, name: 'Gerente', role: 'MANAGER', unitIds: [unitId], seesAllUnits: false, needsTerms: false });
const sup = (): SessionUser => ({ id: supId, name: 'Sup', role: 'SUPERVISOR', unitIds: [unitId], seesAllUnits: false, needsTerms: false });

beforeAll(async () => {
  unitId = (await prisma.unit.create({ data: { code: `SG-${sfx}`, name: 'U Seg', timezone: 'America/Sao_Paulo', cutoffHour: 4 } })).id;
  gerenteId = (await prisma.user.create({ data: { name: 'G', email: `g-${sfx}@t.local`, role: 'MANAGER', passwordHash: 'x' } })).id;
  supId = (await prisma.user.create({ data: { name: 'S', email: `s-${sfx}@t.local`, role: 'SUPERVISOR', passwordHash: 'x' } })).id;
  await prisma.unitMembership.createMany({ data: [{ userId: gerenteId, unitId }, { userId: supId, unitId }] });
  /* Faixa do dia 1–5 (nightly) e reserva 6–10. */
  await prisma.commandSequence.create({ data: { unitId, name: 'Salão', rangeStart: 1, rangeEnd: 5, nightly: true, order: 0 } });
  await prisma.commandSequence.create({ data: { unitId, name: 'Reserva', rangeStart: 6, rangeEnd: 10, nightly: false, order: 1 } });
});

async function limpar() {
  await prisma.commandCountSession.deleteMany({ where: { unitId } });
  await prisma.commandDivergence.deleteMany({ where: { unitId } });
  await prisma.commandCount.deleteMany({ where: { unitId } });
}
beforeEach(limpar);

afterAll(async () => {
  await limpar();
  await prisma.commandSequence.deleteMany({ where: { unitId } });
  await prisma.auditLog.deleteMany({ where: { unitId } });
  await prisma.unitMembership.deleteMany({ where: { unitId } });
  await prisma.unit.delete({ where: { id: unitId } }).catch(() => {});
  await prisma.user.deleteMany({ where: { id: { in: [gerenteId, supId] } } }).catch(() => {});
  await prisma.$disconnect();
});

const iniciar = () => iniciarConferencia(gerente(), { unitId, type: 'FAIXA_DO_DIA', method: 'MISTO', scopeNumbers: [1, 2, 3, 4, 5] });
const marcar = (sessionId: string, number: number) => marcarComanda(gerente(), { sessionId, number, state: 'CONFERIDA', method: 'MANUAL' });

describe('C5 — início concorrente', () => {
  it('três inícios simultâneos criam UMA sessão', async () => {
    const rs = await Promise.all([iniciar(), iniciar(), iniciar()]);
    expect(rs.filter((r) => r.ok)).toHaveLength(1);
    expect(rs.filter((r) => !r.ok && r.reason === 'JA_EXISTE')).toHaveLength(2);
    expect(await prisma.commandCountSession.count({ where: { unitId, status: 'EM_ANDAMENTO' } })).toBe(1);
  });
});

describe('C6 + B2 — finalização única e resultado congelado', () => {
  it('duas finalizações simultâneas: uma vence, divergências não dobram', async () => {
    const i = await iniciar();
    if (!i.ok || !i.sessionId) throw new Error('inicio');
    for (const n of [1, 2, 3]) await marcar(i.sessionId, n);
    const obs = 'faltaram 4 e 5';
    const rs = await Promise.all([
      finalizarConferencia(gerente(), { sessionId: i.sessionId, observation: obs }),
      finalizarConferencia(gerente(), { sessionId: i.sessionId, observation: obs }),
    ]);
    expect(rs.filter((r) => r.ok)).toHaveLength(1);
    expect(await prisma.commandDivergence.count({ where: { unitId } })).toBe(2);
  });

  it('o resultado fica congelado: mudar a sequência depois não muda a sessão encerrada', async () => {
    const i = await iniciar();
    if (!i.ok || !i.sessionId) throw new Error('inicio');
    for (const n of [1, 2, 3, 4, 5]) await marcar(i.sessionId, n);
    const f = await finalizarConferencia(gerente(), { sessionId: i.sessionId });
    expect(f.ok).toBe(true);
    const antes = await getSessao(gerente(), i.sessionId);
    expect(antes?.congelada).toBe(true);
    expect(antes?.expected).toBe(5);

    await prisma.commandSequence.create({ data: { unitId, name: 'Nova', rangeStart: 100, rangeEnd: 150, nightly: true, order: 2 } });
    const depois = await getSessao(gerente(), i.sessionId);
    expect(depois?.expected).toBe(5);
    expect(depois?.escopo).toEqual([1, 2, 3, 4, 5]);
    await prisma.commandSequence.deleteMany({ where: { unitId, name: 'Nova' } });
  });

  it('marcar depois de encerrada é recusado', async () => {
    const i = await iniciar();
    if (!i.ok || !i.sessionId) throw new Error('inicio');
    await finalizarConferencia(gerente(), { sessionId: i.sessionId, observation: 'nada conferido' });
    const m = await marcar(i.sessionId, 1);
    expect(m.ok).toBe(false);
  });
});

describe('B6 — a grade/atalho não sobrescreve a sessão', () => {
  it('contagem sem sessão é recusada com sessão em andamento e depois de concluída', async () => {
    const i = await iniciar();
    if (!i.ok || !i.sessionId) throw new Error('inicio');
    const durante = await submitCount(gerente(), { unitId, allPresent: true });
    expect(durante.ok).toBe(false);
    if (!durante.ok) expect(durante.reason).toBe('CONFLITO_COM_SESSAO');

    for (const n of [1, 2, 3, 4, 5]) await marcar(i.sessionId, n);
    await finalizarConferencia(gerente(), { sessionId: i.sessionId });
    const depois = await submitCount(gerente(), { unitId, allPresent: true });
    expect(depois.ok).toBe(false);
    if (!depois.ok) expect(depois.reason).toBe('CONFLITO_COM_SESSAO');
  });
});

describe('C10 — escopo vazio', () => {
  it('escopo pedido e sem nenhum número da unidade é INVALID, não a sequência inteira', async () => {
    const r = await submitCount(gerente(), { unitId, allPresent: false, scopeNumbers: [9999], absentNumbers: [] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('INVALID');
  });
});

describe('Mudança de escopo com autorização', () => {
  it('gerente não autoriza; supervisor autoriza com motivo e fica registrado', async () => {
    const i = await iniciar();
    if (!i.ok || !i.sessionId) throw new Error('inicio');
    const g = await ampliarEscopo(gerente(), { sessionId: i.sessionId, motivo: 'contagem da semana' });
    expect(g.ok).toBe(false);
    if (!g.ok) expect(g.reason).toBe('SEM_AUTORIZACAO');

    const semMotivo = await ampliarEscopo(sup(), { sessionId: i.sessionId, motivo: 'a' });
    expect(semMotivo.ok).toBe(false);

    const s = await ampliarEscopo(sup(), { sessionId: i.sessionId, motivo: 'contagem completa da semana' });
    expect(s.ok).toBe(true);
    const row = await prisma.commandCountSession.findUnique({ where: { id: i.sessionId } });
    expect(row?.type).toBe('COMPLETA');
    expect(row?.scopeChangedById).toBe(supId);
    expect(row?.scopeChangeReason).toBe('contagem completa da semana');
    const p = await getSessao(gerente(), i.sessionId);
    expect(p?.escopo).toHaveLength(10);
  });
});

describe('Baixa definitiva encontrada', () => {
  it('não volta sozinha: vira divergência em validação', async () => {
    /* Baixa a 3 (perda definitiva). */
    await prisma.commandDivergence.create({
      data: { unitId, number: 3, status: 'CLOSED', outcome: 'LOST', createdById: gerenteId, resolvedById: supId, resolvedAt: new Date() },
    });
    const r = await submitCount(gerente(), { unitId, allPresent: false, scopeNumbers: [1, 2, 3, 4, 5], presentNumbers: [1, 2, 3, 4, 5] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.aguardandoValidacao).toEqual([3]);
    const d = await prisma.commandDivergence.findFirst({ where: { unitId, number: 3, needsValidation: true } });
    expect(d?.status).toBe('INVESTIGATING');
    expect(r.recovered).not.toContain(3);
  });
});
