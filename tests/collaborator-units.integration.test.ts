import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { setCollaboratorUnits } from '@/lib/admin';
import type { SessionUser } from '@/lib/auth/session';

/**
 * Corrigir as unidades de um colaborador do RH (30/09/2026).
 *
 * O caso real: o sync (`src/lib/rh/sync.ts`) só ADICIONA vínculo — nunca
 * remove. Um colaborador transferido de unidade no RH fica ligado às DUAS no
 * SGO para sempre, porque nada tira o vínculo antigo. A correção é manual,
 * pelo Admin — nunca automática, porque "remover um vínculo por ausência numa
 * resposta do RH" é exatamente o padrão que inativou 49 colaboradores em
 * 29/09/2026.
 */

const sfx = `cu${Date.now().toString(36)}`;
let unitA: string; let unitB: string; let unitC: string; let collaboratorId: string;
let adminId: string; let supId: string;

/* Usuário DE VERDADE no banco, não um id inventado: `audit()` engole
   qualquer erro de propósito, e um `userId` sem `User` correspondente
   morre na chave estrangeira SEM BARULHO — o teste da auditoria passaria a
   medir o vazio (lição já registrada em tests/rh-sync.integration.test.ts). */
const admin = (): SessionUser => ({ id: adminId, name: 'Admin', role: 'ADMIN', unitIds: [], seesAllUnits: true, needsTerms: false });
const supervisor = (): SessionUser => ({ id: supId, name: 'Sup', role: 'SUPERVISOR', unitIds: [], seesAllUnits: true, needsTerms: false });

beforeAll(async () => {
  unitA = (await prisma.unit.create({ data: { code: `CUA-${sfx}`, name: `Unidade A ${sfx}` } })).id;
  unitB = (await prisma.unit.create({ data: { code: `CUB-${sfx}`, name: `Unidade B ${sfx}` } })).id;
  unitC = (await prisma.unit.create({ data: { code: `CUC-${sfx}`, name: `Unidade C ${sfx}` } })).id;
  adminId = (await prisma.user.create({ data: { name: 'Admin CU', email: `cu-admin-${sfx}@t.local`, role: 'ADMIN', passwordHash: 'x' } })).id;
  supId = (await prisma.user.create({ data: { name: 'Sup CU', email: `cu-sup-${sfx}@t.local`, role: 'SUPERVISOR', passwordHash: 'x' } })).id;
  const c = await prisma.collaborator.create({
    data: { name: `CU-${sfx} Bruno`, source: 'RH', externalId: `CU-${sfx}-1`, units: { create: [{ unitId: unitA }, { unitId: unitB }] } },
  });
  collaboratorId = c.id;
});

afterAll(async () => {
  await prisma.collaboratorUnit.deleteMany({ where: { collaboratorId } });
  await prisma.auditLog.deleteMany({ where: { entityId: collaboratorId } });
  await prisma.collaborator.delete({ where: { id: collaboratorId } }).catch(() => {});
  await prisma.unit.deleteMany({ where: { id: { in: [unitA, unitB, unitC] } } });
  await prisma.user.deleteMany({ where: { id: { in: [adminId, supId] } } });
  await prisma.$disconnect();
});

const unidadesDoColaborador = async () =>
  (await prisma.collaboratorUnit.findMany({ where: { collaboratorId }, select: { unitId: true } })).map((u) => u.unitId).sort();

describe('Corrigir unidades do colaborador (stale link do RH)', () => {
  it('nasce ligado às duas (o caso do bug: sync só adiciona)', async () => {
    expect(await unidadesDoColaborador()).toEqual([unitA, unitB].sort());
  });

  it('o Admin tira a unidade antiga — só a nova fica', async () => {
    const r = await setCollaboratorUnits(admin(), collaboratorId, [unitB]);
    expect(r.ok).toBe(true);
    expect(await unidadesDoColaborador()).toEqual([unitB]);
  });

  it('pode trocar para um conjunto totalmente diferente', async () => {
    await setCollaboratorUnits(admin(), collaboratorId, [unitA, unitB]);
    const r = await setCollaboratorUnits(admin(), collaboratorId, [unitC]);
    expect(r.ok).toBe(true);
    expect(await unidadesDoColaborador()).toEqual([unitC]);
  });

  it('recusa lista vazia — colaborador sem nenhuma unidade não é uma correção válida', async () => {
    const r = await setCollaboratorUnits(admin(), collaboratorId, []);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('INVALID');
    expect(await unidadesDoColaborador()).toEqual([unitC]); // não mudou nada
  });

  it('recusa unidade inexistente', async () => {
    const r = await setCollaboratorUnits(admin(), collaboratorId, [unitC, 'unidade-que-nao-existe']);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('INVALID');
  });

  it('só o Admin corrige — Supervisor não, mesmo com acesso à rede toda', async () => {
    const r = await setCollaboratorUnits(supervisor(), collaboratorId, [unitA]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('FORBIDDEN');
    expect(await unidadesDoColaborador()).toEqual([unitC]); // intocado
  });

  it('fica na Auditoria com o antes e o depois', async () => {
    await setCollaboratorUnits(admin(), collaboratorId, [unitA, unitB]);
    const log = await prisma.auditLog.findFirst({ where: { action: 'COLLABORATOR_UNITS', entityId: collaboratorId }, orderBy: { createdAt: 'desc' } });
    expect(log).not.toBeNull();
    const meta = log?.metadata as { antes?: string[]; depois?: string[] };
    expect(meta.antes).toEqual(['Unidade C ' + sfx]);
    expect(meta.depois?.sort()).toEqual([`Unidade A ${sfx}`, `Unidade B ${sfx}`].sort());
  });

  it('repetir a mesma unidade na lista não duplica o vínculo', async () => {
    const r = await setCollaboratorUnits(admin(), collaboratorId, [unitA, unitA, unitB]);
    expect(r.ok).toBe(true);
    expect(await unidadesDoColaborador()).toEqual([unitA, unitB].sort());
  });
});
