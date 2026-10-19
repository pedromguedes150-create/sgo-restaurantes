import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

/**
 * Quem a unidade não devolveu é conferido na BASE INTEIRA do RH (v1.171.0).
 *
 * O ponto fixo de sempre (v1.132.2) continua: a lista da unidade sozinha nunca
 * inativa. O que muda é que o sync passa a PERGUNTAR à base geral — e só age
 * pelo que ela DIZ: desligado → inativa; outra razão social → transfere;
 * ausente em todo lugar → conta dias e inativa no 3º, com teto de 30%.
 */
let listaDaUnidade: unknown = { data: [] };
let baseGeral: unknown = { data: [] };
let baseGeralFalha: Error | null = null;

vi.mock('@/lib/rh/client', () => ({
  rhConfigured: () => true,
  RhApiError: class RhApiError extends Error {},
  rh: {
    colaboradoresDaUnidade: async () => listaDaUnidade,
    colaboradores: async () => { if (baseGeralFalha) throw baseGeralFalha; return baseGeral; },
    unidades: async () => ({ data: [] }),
  },
}));
vi.mock('@/lib/notifications', () => ({
  notifyUsers: async () => undefined,
  notifyAdmins: async () => undefined,
  notifyRole: async () => undefined,
  notifyUnitRole: async () => undefined,
  notifySupervisory: async () => undefined,
}));

import { prisma } from '@/lib/db/prisma';
import { syncCollaboratorsForUnit } from '@/lib/rh/sync';
import { getScheduleGrid } from '@/lib/schedule';
import { diagnosticarUnidade } from '@/lib/rh/diagnostico';
import type { SessionUser } from '@/lib/auth/session';

const sfx = `nd${process.pid.toString(36)}${Date.now().toString(36).slice(-3)}`;
const RAZAO_A = `CHURRASCARIA A ${sfx}`;
const RAZAO_B = `CHURRASCARIA B ${sfx}`;
let unitA: string, unitB: string;
let admin: SessionUser;
const mat = (n: number) => `${sfx}-${n}`;

const pessoa = (n: number, nome: string, status = 'Ativo', unidade = RAZAO_A) =>
  ({ matricula: mat(n), nome, cpf: null, status, unidade, cargo: 'Atendente', admissao: null });

async function colab(n: number) {
  return prisma.collaborator.findFirst({ where: { externalId: mat(n) }, include: { units: true } });
}
async function limpar() {
  const ids = (await prisma.collaborator.findMany({ where: { externalId: { startsWith: `${sfx}-` } }, select: { id: true } })).map((c) => c.id);
  if (ids.length) {
    await prisma.scheduleActual.deleteMany({ where: { collaboratorId: { in: ids } } });
    await prisma.employeeSchedule.deleteMany({ where: { collaboratorId: { in: ids } } });
    await prisma.collaboratorUnit.deleteMany({ where: { collaboratorId: { in: ids } } });
    await prisma.collaborator.deleteMany({ where: { id: { in: ids } } });
  }
}

beforeAll(async () => {
  unitA = (await prisma.unit.create({ data: { code: `ND-A-${sfx}`, name: `Unidade A ${sfx}`, timezone: 'America/Sao_Paulo', cutoffHour: 4, rhUnitName: RAZAO_A } })).id;
  unitB = (await prisma.unit.create({ data: { code: `ND-B-${sfx}`, name: `Unidade B ${sfx}`, timezone: 'America/Sao_Paulo', cutoffHour: 4, rhUnitName: RAZAO_B } })).id;
  const u = await prisma.user.create({ data: { name: 'Admin ND', email: `admin-${sfx}@t.local`, passwordHash: 'x', role: 'ADMIN' } });
  admin = { id: u.id, name: u.name, role: 'ADMIN', unitIds: [], seesAllUnits: true, needsTerms: false };
});

beforeEach(async () => {
  baseGeralFalha = null;
  await limpar();
  /* ponto de partida: quatro pessoas ativas na unidade A, vindas da lista da unidade */
  listaDaUnidade = { data: [pessoa(1, 'ANA'), pessoa(2, 'BRUNO'), pessoa(3, 'CARLA'), pessoa(4, 'DANI')] };
  baseGeral = { data: [pessoa(1, 'ANA'), pessoa(2, 'BRUNO'), pessoa(3, 'CARLA'), pessoa(4, 'DANI')] };
  const r = await syncCollaboratorsForUnit(admin, unitA);
  if (!r.ok) throw new Error(`setup: ${r.reason}`);
});

afterAll(async () => {
  await limpar();
  await prisma.auditLog.deleteMany({ where: { unitId: { in: [unitA, unitB] } } }).catch(() => {});
  await prisma.unit.deleteMany({ where: { id: { in: [unitA, unitB] } } }).catch(() => {});
  await prisma.user.delete({ where: { id: admin.id } }).catch(() => {});
  await prisma.$disconnect();
});

describe('a Julia: a unidade parou de devolver, a base geral diz DESLIGADO', () => {
  it('inativa na hora, com data e motivo, e a auditoria diz de onde veio', async () => {
    listaDaUnidade = { data: [pessoa(2, 'BRUNO'), pessoa(3, 'CARLA'), pessoa(4, 'DANI')] };
    baseGeral = { data: [pessoa(1, 'ANA', 'Desligado'), pessoa(2, 'BRUNO'), pessoa(3, 'CARLA'), pessoa(4, 'DANI')] };
    const r = await syncCollaboratorsForUnit(admin, unitA);
    expect(r.ok && r.baseGeral?.desligadosNoRh).toEqual(['ANA']);
    const ana = await colab(1);
    expect(ana?.active).toBe(false);
    expect(ana?.inactiveReason).toBe('RH_STATUS_BASE_GERAL');
    expect(ana?.inactiveSince).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const log = await prisma.auditLog.findFirst({ where: { action: 'RH_DEACTIVATED', entityId: ana!.id } });
    expect((log?.metadata as Record<string, unknown>)?.origem).toBe('BASE_GERAL');
  });
});

describe('transferida: ativa em OUTRA razão social', () => {
  it('sai do vínculo da unidade A e entra na B (a razão social é da B); segue ativa', async () => {
    listaDaUnidade = { data: [pessoa(1, 'ANA'), pessoa(3, 'CARLA'), pessoa(4, 'DANI')] };
    baseGeral = { data: [pessoa(1, 'ANA'), pessoa(2, 'BRUNO', 'Ativo', RAZAO_B), pessoa(3, 'CARLA'), pessoa(4, 'DANI')] };
    const r = await syncCollaboratorsForUnit(admin, unitA);
    expect(r.ok && r.baseGeral?.transferidos.length).toBe(1);
    const bruno = await colab(2);
    expect(bruno?.active).toBe(true);
    expect(bruno?.units.map((u) => u.unitId)).toEqual([unitB]);
    /* some da grade da A sem virar inativo */
    const grade = await getScheduleGrid(unitA, 2026, 10);
    expect(grade.rows.some((l) => l.collaboratorId === bruno!.id)).toBe(false);
    expect(grade.withoutSchedule.some((w) => w.id === bruno!.id)).toBe(false);
  });
});

describe('sumiu da base inteira: conta dias e inativa no 3º', () => {
  it('1ª rodada só conta (dia 1 de 3); a mesma rodada repetida no dia não avança; no 3º dia inativa', async () => {
    listaDaUnidade = { data: [pessoa(1, 'ANA'), pessoa(2, 'BRUNO'), pessoa(3, 'CARLA')] };
    baseGeral = { data: [pessoa(1, 'ANA'), pessoa(2, 'BRUNO'), pessoa(3, 'CARLA')] };
    let r = await syncCollaboratorsForUnit(admin, unitA);
    expect(r.ok && r.baseGeral?.ausentesContando).toBe(1);
    let dani = await colab(4);
    expect(dani?.active).toBe(true);
    expect(dani?.rhMissingDays).toBe(1);
    expect(dani?.rhMissingSince).toBe(dani?.rhMissingLastDay);

    r = await syncCollaboratorsForUnit(admin, unitA); // segundo clique no mesmo dia
    dani = await colab(4);
    expect(dani?.rhMissingDays).toBe(1);

    /* simula que os dois dias anteriores já contaram */
    await prisma.collaborator.update({ where: { id: dani!.id }, data: { rhMissingSince: '2026-10-14', rhMissingLastDay: '2026-10-15', rhMissingDays: 2 } });
    r = await syncCollaboratorsForUnit(admin, unitA);
    expect(r.ok && r.baseGeral?.ausentesConfirmados).toEqual(['DANI']);
    dani = await colab(4);
    expect(dani?.active).toBe(false);
    expect(dani?.inactiveReason).toBe('RH_AUSENTE_CONFIRMADO');
    expect(dani?.rhMissingDays).toBe(0);
  });

  it('voltou a aparecer na lista da unidade → a contagem zera', async () => {
    const dani = await colab(4);
    await prisma.collaborator.update({ where: { id: dani!.id }, data: { rhMissingSince: '2026-10-14', rhMissingLastDay: '2026-10-15', rhMissingDays: 2 } });
    await syncCollaboratorsForUnit(admin, unitA); // lista completa de novo
    const d = await colab(4);
    expect(d?.active).toBe(true);
    expect(d?.rhMissingDays).toBe(0);
    expect(d?.rhMissingSince).toBeNull();
  });

  it('base geral que FALHA ou vem VAZIA não conta o dia nem toca em ninguém', async () => {
    listaDaUnidade = { data: [pessoa(1, 'ANA'), pessoa(2, 'BRUNO'), pessoa(3, 'CARLA')] };
    baseGeralFalha = new Error('RH fora do ar');
    let r = await syncCollaboratorsForUnit(admin, unitA);
    expect(r.ok && r.baseGeral?.baseGeralValida).toBe(false);
    expect((await colab(4))?.rhMissingDays).toBe(0);
    baseGeralFalha = null;
    baseGeral = { data: [] };
    r = await syncCollaboratorsForUnit(admin, unitA);
    expect(r.ok && r.baseGeral?.baseGeralValida).toBe(false);
    expect((await colab(4))?.active).toBe(true);
    expect((await colab(4))?.rhMissingDays).toBe(0);
  });

  it('a lista da unidade sozinha continua NÃO inativando (v1.132.2): a base geral diz que está lá', async () => {
    listaDaUnidade = { data: [pessoa(1, 'ANA')] }; // resposta incompleta
    const r = await syncCollaboratorsForUnit(admin, unitA); // base geral completa, todos em RAZAO_A
    expect(r.ok).toBe(true);
    const ativos = await prisma.collaborator.count({ where: { externalId: { startsWith: `${sfx}-` }, active: true } });
    expect(ativos).toBe(4);
    expect((await colab(2))?.rhMissingDays).toBe(0); // PRESENTE na base geral: nem conta
  });
});

describe('trava de 30%', () => {
  it('3 de 4 ativos confirmados ausentes → ninguém inativado, auditoria RH_ABSENCE_CAP', async () => {
    listaDaUnidade = { data: [pessoa(1, 'ANA')] };
    baseGeral = { data: [pessoa(1, 'ANA')] };
    for (const n of [2, 3, 4]) {
      const c = await colab(n);
      await prisma.collaborator.update({ where: { id: c!.id }, data: { rhMissingSince: '2026-10-14', rhMissingLastDay: '2026-10-15', rhMissingDays: 2 } });
    }
    const r = await syncCollaboratorsForUnit(admin, unitA);
    expect(r.ok && r.baseGeral?.travaDisparou).toBe(true);
    expect(r.ok && r.baseGeral?.ausentesConfirmados).toEqual([]);
    const ativos = await prisma.collaborator.count({ where: { externalId: { startsWith: `${sfx}-` }, active: true } });
    expect(ativos).toBe(4);
    expect(await prisma.auditLog.count({ where: { action: 'RH_ABSENCE_CAP', unitId: unitA } })).toBeGreaterThanOrEqual(1);
  });

  it('1 de 4 passa (teto = ⌈1,2⌉ = 2)', async () => {
    listaDaUnidade = { data: [pessoa(1, 'ANA'), pessoa(2, 'BRUNO'), pessoa(3, 'CARLA')] };
    baseGeral = { data: [pessoa(1, 'ANA'), pessoa(2, 'BRUNO'), pessoa(3, 'CARLA')] };
    const c = await colab(4);
    await prisma.collaborator.update({ where: { id: c!.id }, data: { rhMissingSince: '2026-10-14', rhMissingLastDay: '2026-10-15', rhMissingDays: 2 } });
    const r = await syncCollaboratorsForUnit(admin, unitA);
    expect(r.ok && r.baseGeral?.travaDisparou).toBe(false);
    expect((await colab(4))?.active).toBe(false);
  });
});

describe('a grade da Escala: quem o RH desligou sai da grade inteira (v1.171.1)', () => {
  it('inativada no dia 16, com escala cadastrada: não aparece em outubro nem em novembro; reativada, volta', async () => {
    const ana = await colab(1);
    await prisma.employeeSchedule.create({ data: { collaboratorId: ana!.id, unitId: unitA, scheduleType: 'SIX_ONE', anchorDate: new Date(Date.UTC(2026, 9, 1, 12)), startDate: new Date(Date.UTC(2026, 9, 1, 12)), active: true } });
    expect((await getScheduleGrid(unitA, 2026, 10)).rows.some((l) => l.collaboratorId === ana!.id)).toBe(true);
    await prisma.collaborator.update({ where: { id: ana!.id }, data: { active: false, inactiveSince: '2026-10-16', inactiveReason: 'RH_STATUS_BASE_GERAL' } });
    const out = await getScheduleGrid(unitA, 2026, 10);
    expect(out.rows.some((l) => l.collaboratorId === ana!.id)).toBe(false);
    expect(out.withoutSchedule.some((w) => w.id === ana!.id)).toBe(false);
    expect((await getScheduleGrid(unitA, 2026, 11)).rows.some((l) => l.collaboratorId === ana!.id)).toBe(false);
    await prisma.collaborator.update({ where: { id: ana!.id }, data: { active: true, inactiveSince: null, inactiveReason: null } });
    expect((await getScheduleGrid(unitA, 2026, 10)).rows.some((l) => l.collaboratorId === ana!.id)).toBe(true);
  });
});

describe('o Diagnóstico mostra o que a base geral diz', () => {
  it('desligado · outra unidade · ausente dia N de 3', async () => {
    listaDaUnidade = { data: [pessoa(1, 'ANA')] };
    baseGeral = { data: [pessoa(1, 'ANA'), pessoa(2, 'BRUNO', 'Desligado'), pessoa(3, 'CARLA', 'Ativo', RAZAO_B)] };
    const dani = await colab(4);
    await prisma.collaborator.update({ where: { id: dani!.id }, data: { rhMissingSince: '2026-10-14', rhMissingLastDay: '2026-10-14', rhMissingDays: 1 } });
    const d = await diagnosticarUnidade(admin, unitA);
    expect(d?.baseGeralLida).toBe(true);
    const por = new Map(d!.soNoSgo.map((c) => [c.externalId, c]));
    expect(por.get(mat(2))?.naBaseGeral?.tipo).toBe('DESLIGADO_NO_RH');
    expect(por.get(mat(3))?.naBaseGeral).toEqual({ tipo: 'TRANSFERIDO', razao: RAZAO_B, status: 'Ativo' });
    expect(por.get(mat(4))?.naBaseGeral?.tipo).toBe('AUSENTE');
    expect(por.get(mat(4))?.ausenteDias).toBe(1);
  });
});
