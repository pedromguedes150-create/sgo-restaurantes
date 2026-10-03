import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { deleteNotification, listNotificationsPage } from '@/lib/notifications';
import type { SessionUser } from '@/lib/auth/session';

/**
 * O MENU SUSPENSO DE NOTIFICAÇÕES (kit, Fase 3): lista paginada por cursor,
 * contagem de não lidos, e apagar SÓ o próprio aviso.
 */
const sfx = `${process.pid.toString(36)}${Date.now().toString(36).slice(-4)}`;
let euId: string;
let outroId: string;
const eu = (): SessionUser => ({ id: euId, name: 'Eu', role: 'MANAGER', unitIds: [], seesAllUnits: false, needsTerms: false });

beforeAll(async () => {
  euId = (await prisma.user.create({ data: { name: 'Eu N', email: `n-eu-${sfx}@t.local`, role: 'MANAGER', passwordHash: 'x' } })).id;
  outroId = (await prisma.user.create({ data: { name: 'Outro N', email: `n-outro-${sfx}@t.local`, role: 'MANAGER', passwordHash: 'x' } })).id;
  const base = Date.parse('2026-10-03T10:00:00Z');
  for (let i = 0; i < 25; i++) {
    await prisma.notification.create({ data: { userId: euId, title: `Aviso ${i}`, body: null, read: i % 5 === 0, createdAt: new Date(base + i * 60_000) } });
  }
  await prisma.notification.create({ data: { userId: outroId, title: 'Do outro', read: false } });
});

afterAll(async () => {
  await prisma.notification.deleteMany({ where: { userId: { in: [euId, outroId] } } });
  await prisma.user.deleteMany({ where: { id: { in: [euId, outroId] } } });
  await prisma.$disconnect();
});

describe('listNotificationsPage', () => {
  it('mais recentes primeiro, 20 por página, cursor leva ao resto; não lidos contados', async () => {
    const p1 = await listNotificationsPage(eu(), { limit: 20 });
    expect(p1.itens).toHaveLength(20);
    expect(p1.itens[0].title).toBe('Aviso 24');
    expect(p1.temMais).toBe(true);
    expect(p1.naoLidas).toBe(20); // 25 − 5 lidos (i % 5 === 0)
    const p2 = await listNotificationsPage(eu(), { limit: 20, cursor: p1.proximoCursor });
    expect(p2.itens.map((n) => n.title)).toEqual(['Aviso 4', 'Aviso 3', 'Aviso 2', 'Aviso 1', 'Aviso 0']);
    expect(p2.temMais).toBe(false);
    expect(p2.proximoCursor).toBeNull();
    /* Teto e piso do limite. */
    expect((await listNotificationsPage(eu(), { limit: 500 })).itens.length).toBeLessThanOrEqual(50);
    expect((await listNotificationsPage(eu(), { limit: 0 })).itens).toHaveLength(1);
  });

  it('só vê os próprios avisos', async () => {
    const p = await listNotificationsPage(eu(), { limit: 50 });
    expect(p.itens.some((n) => n.title === 'Do outro')).toBe(false);
  });
});

describe('deleteNotification', () => {
  it('apaga o próprio; o do outro usuário "não existe" (false, e continua lá)', async () => {
    const meu = await prisma.notification.findFirst({ where: { userId: euId, title: 'Aviso 7' } });
    expect(await deleteNotification(eu(), meu!.id)).toBe(true);
    expect(await prisma.notification.findUnique({ where: { id: meu!.id } })).toBeNull();
    const doOutro = await prisma.notification.findFirst({ where: { userId: outroId } });
    expect(await deleteNotification(eu(), doOutro!.id)).toBe(false);
    expect(await prisma.notification.findUnique({ where: { id: doOutro!.id } })).not.toBeNull();
  });
});
