import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { effectivePermissions, setRolePermission, MODULES, temAcessoFixo, ACESSO_FIXO } from '@/lib/permissions';
import { canOpenPath } from '@/lib/permissions/route-guard';
import { normalizarPerfis, PERFIS_DESTINATARIOS } from '@/lib/communications/publico';
import { createCommunication } from '@/lib/communications/create';
import type { SessionUser } from '@/lib/auth/session';

/**
 * v1.203.0 — o perfil Caixa só confere comandas: nenhuma outra aba, nem
 * comunicados, nem com linha gravada na matriz.
 */

const sfx = `cx${process.pid.toString(36)}${Date.now().toString(36).slice(-4)}`;
let unitId: string;
let adminId: string;
let caixaId: string;
let gerenteId: string;

const admin = (): SessionUser => ({ id: adminId, name: 'Adm', role: 'ADMIN', unitIds: [], seesAllUnits: true, needsTerms: false });

beforeAll(async () => {
  unitId = (await prisma.unit.create({ data: { code: `CX-${sfx}`, name: 'U Caixa', timezone: 'America/Sao_Paulo', cutoffHour: 4 } })).id;
  adminId = (await prisma.user.create({ data: { name: 'A', email: `a-${sfx}@t.local`, role: 'ADMIN', passwordHash: 'x' } })).id;
  caixaId = (await prisma.user.create({ data: { name: 'C', email: `c-${sfx}@t.local`, role: 'CASHIER', passwordHash: 'x' } })).id;
  gerenteId = (await prisma.user.create({ data: { name: 'G', email: `g-${sfx}@t.local`, role: 'MANAGER', passwordHash: 'x' } })).id;
  await prisma.unitMembership.createMany({ data: [{ userId: caixaId, unitId }, { userId: gerenteId, unitId }] });
});
afterAll(async () => {
  /* tira a linha forçada abaixo, se sobrou */
  await prisma.rolePermission.deleteMany({ where: { role: 'CASHIER', module: { in: ['COMMUNICATION', 'NOTES', 'HELP'] } } });
  const comms = await prisma.communication.findMany({ where: { authorId: adminId }, select: { id: true } });
  await prisma.communicationRecipient.deleteMany({ where: { communicationId: { in: comms.map((c) => c.id) } } }).catch(() => {});
  await prisma.communicationUnit.deleteMany({ where: { communicationId: { in: comms.map((c) => c.id) } } }).catch(() => {});
  await prisma.communication.deleteMany({ where: { authorId: adminId } }).catch(() => {});
  await prisma.auditLog.deleteMany({ where: { OR: [{ unitId }, { userId: adminId }] } }).catch(() => {});
  await prisma.unitMembership.deleteMany({ where: { unitId } });
  await prisma.unit.delete({ where: { id: unitId } }).catch(() => {});
  await prisma.user.deleteMany({ where: { id: { in: [adminId, caixaId, gerenteId] } } }).catch(() => {});
  await prisma.$disconnect();
});

describe('o Caixa só confere comandas', () => {
  it('só os módulos da conferência ficam abertos', async () => {
    const perms = await effectivePermissions('CASHIER');
    const abertos = MODULES.filter((m) => perms[m.key]?.canView).map((m) => m.key).sort();
    expect(abertos).toEqual([...ACESSO_FIXO.CASHIER!].sort());
    expect(perms.COMMUNICATION.canView).toBe(false);
    expect(perms.HELP.canView).toBe(false);
    expect(perms.COMMANDS_OPEN.canView).toBe(false); // antes herdava o pai
    expect(perms.COMMANDS.canEdit).toBe(true);
  });

  it('uma linha gravada na matriz NÃO reabre nada', async () => {
    for (const modulo of ['COMMUNICATION', 'NOTES', 'HELP']) {
      await prisma.rolePermission.upsert({
        where: { role_module: { role: 'CASHIER', module: modulo } },
        create: { role: 'CASHIER', module: modulo, canView: true, canEdit: true },
        update: { canView: true, canEdit: true },
      });
    }
    const perms = await effectivePermissions('CASHIER');
    expect(perms.COMMUNICATION.canView).toBe(false);
    expect(perms.NOTES.canView).toBe(false);
    expect(await canOpenPath('CASHIER', '/modulos/comunicacao')).toBe(false);
    expect(await canOpenPath('CASHIER', '/modulos/notas')).toBe(false);
    expect(await canOpenPath('CASHIER', '/modulos/comandas/conferencia')).toBe(true);
    expect(await canOpenPath('CASHIER', '/modulos/comandas/analise-aberto')).toBe(false);
  });

  it('o Admin não consegue configurar o Caixa na matriz', async () => {
    expect(temAcessoFixo('CASHIER')).toBe(true);
    expect(temAcessoFixo('MANAGER')).toBe(false);
    const r = await setRolePermission(admin(), { role: 'CASHIER', module: 'COMMUNICATION', canView: true, canEdit: true });
    expect(r.ok).toBe(false);
  });
});

describe('o Caixa não recebe comunicados', () => {
  it('Caixa não é opção de perfil destinatário e é descartado se vier', () => {
    expect(PERFIS_DESTINATARIOS).not.toContain('CASHIER');
    expect(normalizarPerfis(['CASHIER'])).toEqual(['MANAGER']); // inválido → o padrão
  });

  it('comunicado para a unidade e para o caixa avulso alcança só o gerente', async () => {
    const r = await createCommunication(admin(), {
      title: `Aviso ${sfx}`, body: 'texto', unitIds: [unitId], roles: ['MANAGER', 'CASHIER'], extraUserIds: [caixaId],
      priority: 'NORMAL', dueAt: new Date(Date.now() + 86400000).toISOString(),
    } as never);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const dest = await prisma.communicationRecipient.findMany({ where: { communicationId: (r as { id: string }).id }, select: { userId: true } });
    expect(dest.map((d) => d.userId)).toEqual([gerenteId]);
  });
});
