import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'fs';
import { prisma } from '@/lib/db/prisma';
import { notifyUsers, avisosDesde } from '@/lib/notifications';
import {
  nivelAoGravar, nivelDoAviso, avisoComSom, somDoAviso, avisosNovos, deveAvisarNaAba,
} from '@/lib/notifications/nivel';
import type { SessionUser } from '@/lib/auth/session';

/**
 * Aviso ao vivo (v1.158.0) — notificações "como no WhatsApp", sem mudar regra
 * de módulo. Decisões do Pedro: só a higiene toca som por enquanto; o alerta é
 * chamativo sem ser alarmante; o mesmo aviso nunca toca duas vezes.
 */
describe('regra pura', () => {
  it('nível: critical vence; IMPORTANTE só quando pedido; o resto é NORMAL', () => {
    expect(nivelAoGravar({ critical: true, nivel: 'IMPORTANTE' })).toBe('CRITICO');
    expect(nivelAoGravar({ nivel: 'IMPORTANTE' })).toBe('IMPORTANTE');
    expect(nivelAoGravar({})).toBe('NORMAL');
    // linha antiga, gravada antes da coluna: só tinha critical
    expect(nivelDoAviso({ critical: true, level: 'NORMAL' })).toBe('CRITICO');
    expect(nivelDoAviso({ critical: false, level: 'IMPORTANTE' })).toBe('IMPORTANTE');
  });

  it('só a higiene toca som', () => {
    expect(avisoComSom({ link: '/modulos/higiene' })).toBe(true);
    expect(avisoComSom({ alerta: 'higiene' })).toBe(true);
    expect(avisoComSom({ link: '/modulos/pagamentos' })).toBe(false);
    expect(avisoComSom({ link: null })).toBe(false);
  });

  it('o som não é sirene: notas curtas, subindo, sem repetir mais de duas vezes', () => {
    const { notas, volume } = somDoAviso();
    expect(notas).toHaveLength(6);
    expect(notas.every((n) => n.duracao <= 0.35)).toBe(true);
    // dentro de cada repetição a altura só sobe (nada de vai-e-vem)
    expect(notas.slice(0, 3).map((n) => n.freq)).toEqual([1047, 1319, 1568]);
    expect(volume).toBeLessThanOrEqual(0.35);
  });

  it('sem duplicidade: o já mostrado e o lido não voltam; mais antigo primeiro', () => {
    const chegaram = [
      { id: 'b', createdAt: '2026-10-07T10:02:00Z' },
      { id: 'a', createdAt: '2026-10-07T10:01:00Z' },
      { id: 'c', createdAt: '2026-10-07T10:03:00Z', read: true },
    ];
    expect(avisosNovos(chegaram, new Set(['b'])).map((x) => x.id)).toEqual(['a']);
    expect(avisosNovos(chegaram, new Set()).map((x) => x.id)).toEqual(['a', 'b']);
  });

  it('aba escondida num aparelho com push fica calada (o sistema avisa)', () => {
    expect(deveAvisarNaAba(true, true)).toBe(true);
    expect(deveAvisarNaAba(false, true)).toBe(false);
    expect(deveAvisarNaAba(false, false)).toBe(true);
  });
});

describe('service worker: primeiro × segundo plano', () => {
  const sw = readFileSync('public/sw.js', 'utf8');
  it('com aba do SGO visível entrega à página e NÃO mostra a notificação do sistema', () => {
    expect(sw).toMatch(/visibilityState === 'visible'/);
    expect(sw).toMatch(/if \(visiveis\.length && !SAFARI\) \{\s*visiveis\.forEach\(\(c\) => c\.postMessage\(msg\)\);\s*return undefined;/);
    expect(sw).toContain('return self.registration.showNotification(title, options);');
  });
  it('Safari sempre mostra (senão revoga a inscrição) e a página não toca de novo', () => {
    expect(sw).toContain('msg.sistemaMostrou = true;');
  });
});

const sfx = `av${process.pid.toString(36)}`;
let uId: string, outroId: string;
const eu = (): SessionUser => ({ id: uId, name: 'G', role: 'MANAGER', unitIds: [], seesAllUnits: false, needsTerms: false });

beforeAll(async () => {
  uId = (await prisma.user.create({ data: { name: 'Ger AV', email: `g-${sfx}@example.com`, role: 'MANAGER', passwordHash: 'x' } })).id;
  outroId = (await prisma.user.create({ data: { name: 'Outro AV', email: `o-${sfx}@example.com`, role: 'MANAGER', passwordHash: 'x' } })).id;
});
afterAll(async () => {
  await prisma.notification.deleteMany({ where: { userId: { in: [uId, outroId] } } });
  await prisma.user.deleteMany({ where: { id: { in: [uId, outroId] } } });
  await prisma.$disconnect();
});

describe('gravação e leitura', () => {
  it('o nível é gravado junto do aviso', async () => {
    await notifyUsers([uId], { title: `Normal ${sfx}` });
    await notifyUsers([uId], { title: `Importante ${sfx}`, nivel: 'IMPORTANTE' });
    await notifyUsers([uId], { title: `Crítico ${sfx}`, critical: true, link: '/modulos/higiene' });
    const rows = await prisma.notification.findMany({ where: { userId: uId }, orderBy: { createdAt: 'asc' }, select: { title: true, level: true, critical: true } });
    expect(rows.map((r) => r.level)).toEqual(['NORMAL', 'IMPORTANTE', 'CRITICO']);
  });

  it('novos desde X: só os meus, só não lidos', async () => {
    const desde = new Date(Date.now() - 60_000);
    await notifyUsers([outroId], { title: `De outro ${sfx}` });
    const lido = await prisma.notification.findFirstOrThrow({ where: { userId: uId, title: `Normal ${sfx}` } });
    await prisma.notification.update({ where: { id: lido.id }, data: { read: true } });
    const novos = await avisosDesde(eu(), desde);
    expect(novos.map((n) => n.title).sort()).toEqual([`Crítico ${sfx}`, `Importante ${sfx}`]);
    expect(await avisosDesde(eu(), new Date(Date.now() + 1000))).toEqual([]);
  });
});
