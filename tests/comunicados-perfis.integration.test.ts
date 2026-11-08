import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { createCommunication } from '@/lib/communications/create';
import { updateCommunication } from '@/lib/communications/update';
import { getCommunicationForEdit } from '@/lib/communications/query';
import type { SessionUser } from '@/lib/auth/session';

/** COMUNICADOS POR PERFIL (v1.195.0): a unidade alcança SÓ os perfis marcados; o separador não entra por engano. */
const sfx = `cp${process.pid.toString(36)}${Date.now().toString(36).slice(-4)}`;
let unitId = ''; let adminId = ''; let gerenteId = ''; let coordId = ''; let separadorId = '';
const admin = (): SessionUser => ({ id: adminId, name: 'Adm', role: 'ADMIN', unitIds: [], seesAllUnits: true, needsTerms: false });
const ids: string[] = [];

beforeAll(async () => {
  unitId = (await prisma.unit.create({ data: { code: `CP-${sfx}`, name: `Comunicados ${sfx}`, timezone: 'America/Sao_Paulo', cutoffHour: 4 } })).id;
  const mk = async (name: string, role: 'ADMIN' | 'MANAGER' | 'COORDINATOR' | 'SEPARATOR', comUnidade = true) =>
    (await prisma.user.create({ data: { name, email: `${role.toLowerCase()}-${sfx}@teste.local`, role, passwordHash: 'x', ...(comUnidade ? { memberships: { create: { unitId } } } : {}) } })).id;
  adminId = await mk('Adm', 'ADMIN', false);
  gerenteId = await mk('Gerente', 'MANAGER');
  coordId = await mk('Coord', 'COORDINATOR');
  /* o separador de produção costuma estar SEM unidade, mas o caso que o Pedro viu é o de uma conta com vínculo: o perfil é o que decide */
  separadorId = await mk('Separador', 'SEPARATOR');
});
afterAll(async () => {
  await prisma.communication.deleteMany({ where: { id: { in: ids } } });
  await prisma.notification.deleteMany({ where: { userId: { in: [gerenteId, coordId, separadorId] } } }).catch(() => {});
  await prisma.auditLog.deleteMany({ where: { userId: adminId } });
  await prisma.user.deleteMany({ where: { id: { in: [adminId, gerenteId, coordId, separadorId] } } });
  await prisma.unit.deleteMany({ where: { id: unitId } });
});

const base = { title: 'Padrão da vitrine', body: 'Montar até 10h', dueAt: new Date(Date.now() + 86400000).toISOString(), unitIds: [] as string[] };
const destinatarios = async (id: string) => (await prisma.communicationRecipient.findMany({ where: { communicationId: id }, select: { userId: true } })).map((r) => r.userId).sort();

describe('quem recebe pela unidade', () => {
  it('sem perfis informados = só Gerente (o comportamento de sempre); o separador com vínculo NÃO recebe', async () => {
    const r = await createCommunication(admin(), { ...base, unitIds: [unitId] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    ids.push(r.id);
    expect(await destinatarios(r.id)).toEqual([gerenteId]);
    expect((await prisma.communication.findUnique({ where: { id: r.id } }))?.targetRoles).toEqual(['MANAGER']);
  });
  it('com perfis marcados, recebem exatamente eles; Admin/CEO e perfis inválidos são ignorados', async () => {
    const r = await createCommunication(admin(), { ...base, unitIds: [unitId], roles: ['COORDINATOR', 'SEPARATOR', 'ADMIN', 'x'] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    ids.push(r.id);
    expect(await destinatarios(r.id)).toEqual([coordId, separadorId].sort());
    const edit = await getCommunicationForEdit(admin(), r.id);
    expect(edit?.roles).toEqual(['COORDINATOR', 'SEPARATOR']);
    expect(edit?.extraUserIds).toEqual([]); // os dois vieram pela unidade, não como avulsos
  });
  it('editar os perfis recalcula os destinatários e grava os perfis novos', async () => {
    const r = await createCommunication(admin(), { ...base, unitIds: [unitId] });
    if (!r.ok) throw new Error(r.reason);
    ids.push(r.id);
    const u = await updateCommunication(admin(), r.id, { roles: ['MANAGER', 'COORDINATOR'], confirm: true });
    expect(u.ok && u.applied).toBe(true);
    expect(await destinatarios(r.id)).toEqual([gerenteId, coordId].sort());
    expect((await prisma.communication.findUnique({ where: { id: r.id } }))?.targetRoles).toEqual(['MANAGER', 'COORDINATOR']);
  });
});
