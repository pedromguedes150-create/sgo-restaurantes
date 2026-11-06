import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { completeChecklist } from '@/lib/tasks/complete';
import type { SessionUser } from '@/lib/auth/session';

/**
 * FOTO OBRIGATÓRIA NO ITEM (v1.191.0): o SERVIDOR recusa concluir um checklist
 * cujo item "Exige foto" veio sem foto ligada a ele — a tela trava antes, mas
 * por fora da tela ninguém passa. Foto geral ou no item errado não vale.
 */
const sfx = `fo${process.pid.toString(36)}${Date.now().toString(36).slice(-4)}`;
let unitId = ''; let userId = ''; let tplId = ''; let itemFoto = ''; let itemSem = '';
const user = (): SessionUser => ({ id: userId, name: 'Gerente', role: 'MANAGER', unitIds: [unitId], seesAllUnits: false, needsTerms: false });

beforeAll(async () => {
  unitId = (await prisma.unit.create({ data: { code: `FO-${sfx}`, name: `Foto ${sfx}`, timezone: 'America/Sao_Paulo', cutoffHour: 4 } })).id;
  userId = (await prisma.user.create({ data: { name: 'Ger', email: `fo-${sfx}@teste.local`, role: 'MANAGER', passwordHash: 'x', memberships: { create: { unitId } } } })).id;
  const tpl = await prisma.taskTemplate.create({
    data: {
      unitId, name: 'Abertura com foto', requiresEvidence: false, limitTime: '23:00',
      items: { create: [
        { text: 'Ligar as luzes', order: 0, requiresPhoto: false },
        { text: 'Vitrine montada', order: 1, requiresPhoto: true },
      ] },
    },
    include: { items: { orderBy: { order: 'asc' } } },
  });
  tplId = tpl.id; itemSem = tpl.items[0].id; itemFoto = tpl.items[1].id;
});
afterAll(async () => {
  await prisma.taskInstance.deleteMany({ where: { unitId } });
  await prisma.taskTemplate.deleteMany({ where: { id: tplId } });
  await prisma.auditLog.deleteMany({ where: { unitId } });
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.unit.deleteMany({ where: { id: unitId } });
});

const instancia = () => prisma.taskInstance.create({ data: { templateId: tplId, unitId, operationalDate: '2026-11-06', dueAt: new Date(Date.now() + 86400000) } });
const respostas = () => [
  { itemId: itemSem, itemText: 'Ligar as luzes', status: 'OK' as const, note: '' },
  { itemId: itemFoto, itemText: 'Vitrine montada', status: 'OK' as const, note: '' },
];

describe('concluir com item "Exige foto"', () => {
  it('sem foto nenhuma → ITEM_PHOTO_REQUIRED nomeando o item, e a tarefa segue pendente', async () => {
    const inst = await instancia();
    const r = await completeChecklist(inst.id, user(), { items: respostas(), photos: [] });
    expect(r).toEqual({ ok: false, reason: 'ITEM_PHOTO_REQUIRED', item: 'Vitrine montada' });
    expect((await prisma.taskInstance.findUnique({ where: { id: inst.id } }))?.status).toBe('PENDING');
  });
  it('foto GERAL ou ligada a OUTRO item não vale', async () => {
    const inst = await instancia();
    expect((await completeChecklist(inst.id, user(), { items: respostas(), photos: [{ path: 'uploads/x/geral.jpg', itemId: null }] })).ok).toBe(false);
    expect((await completeChecklist(inst.id, user(), { items: respostas(), photos: [{ path: 'uploads/x/outro.jpg', itemId: itemSem }] })).ok).toBe(false);
  });
  it('"Não se aplica" não dispensa a foto: a regra é do item, não do status', async () => {
    const inst = await instancia();
    const r = await completeChecklist(inst.id, user(), { items: respostas().map((x) => (x.itemId === itemFoto ? { ...x, status: 'NAO_SE_APLICA' as const } : x)), photos: [] });
    expect(r.ok).toBe(false);
  });
  it('com a foto ligada ao item → conclui e a foto fica gravada no item', async () => {
    const inst = await instancia();
    const r = await completeChecklist(inst.id, user(), { items: respostas(), photos: [{ path: 'uploads/x/vitrine.jpg', itemId: itemFoto }] });
    expect(r).toEqual({ ok: true });
    expect((await prisma.taskInstance.findUnique({ where: { id: inst.id } }))?.status).toBe('DONE');
    expect(await prisma.taskPhoto.findMany({ where: { instanceId: inst.id } })).toMatchObject([{ itemId: itemFoto, path: 'uploads/x/vitrine.jpg' }]);
  });
});
