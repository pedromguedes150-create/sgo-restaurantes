import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { alertasDeHigiene, avaliarHygieneRequest, createHygieneRequest, getHygieneAnalytics, HYGIENE_ISSUES } from '@/lib/hygiene';
import type { SessionUser } from '@/lib/auth/session';

/**
 * QR do banheiro → alerta do gerente (v1.156.0). O que se trava:
 * - o aviso chega ao GERENTE e ao COORDENADOR da unidade como crítico (passa
 *   por cima da preferência de categoria) — outra unidade não recebe;
 * - o mesmo aviso repetido em minutos não toca o celular de novo;
 * - a avaliação depois do envio vale uma vez só;
 * - o "apito" do SGO aberto só enxerga as unidades do alcance;
 * - o horário de pico é em Brasília, não em UTC.
 */
const sfx = `hg${process.pid.toString(36)}`;
let unitA: string, unitB: string, gerA: string, coordA: string, gerB: string, locA: string;
const gerente = (id: string, unitId: string): SessionUser => ({ id, name: 'G', role: 'MANAGER', unitIds: [unitId], seesAllUnits: false, needsTerms: false });

beforeAll(async () => {
  unitA = (await prisma.unit.create({ data: { code: `A-${sfx}`, name: `Hig A ${sfx}`, timezone: 'America/Sao_Paulo', cutoffHour: 4 } })).id;
  unitB = (await prisma.unit.create({ data: { code: `B-${sfx}`, name: `Hig B ${sfx}`, timezone: 'America/Sao_Paulo', cutoffHour: 4 } })).id;
  gerA = (await prisma.user.create({ data: { name: 'Ger A', email: `ga-${sfx}@example.com`, role: 'MANAGER', passwordHash: 'x' } })).id;
  coordA = (await prisma.user.create({ data: { name: 'Coord A', email: `ca-${sfx}@example.com`, role: 'COORDINATOR', passwordHash: 'x' } })).id;
  gerB = (await prisma.user.create({ data: { name: 'Ger B', email: `gb-${sfx}@example.com`, role: 'MANAGER', passwordHash: 'x' } })).id;
  await prisma.unitMembership.createMany({ data: [{ userId: gerA, unitId: unitA }, { userId: coordA, unitId: unitA }, { userId: gerB, unitId: unitB }] });
  locA = (await prisma.hygieneLocation.create({ data: { unitId: unitA, name: `Masculino ${sfx}` } })).id;
});

afterAll(async () => {
  await prisma.notification.deleteMany({ where: { userId: { in: [gerA, coordA, gerB] } } });
  await prisma.hygieneRequest.deleteMany({ where: { unitId: { in: [unitA, unitB] } } });
  await prisma.hygieneLocation.deleteMany({ where: { unitId: { in: [unitA, unitB] } } });
  await prisma.unit.deleteMany({ where: { id: { in: [unitA, unitB] } } });
  await prisma.user.deleteMany({ where: { id: { in: [gerA, coordA, gerB] } } });
  await prisma.$disconnect();
});

describe('QR do banheiro → alerta', () => {
  it('os motivos de um toque são os do pedido', () => {
    expect(HYGIENE_ISSUES).toEqual(['Precisa de limpeza', 'Falta papel', 'Falta sabonete', 'Lixo cheio', 'Outro']);
  });

  it('avisa gerente E coordenador da unidade, como crítico; outra unidade não recebe', async () => {
    const r = await createHygieneRequest({ unitId: unitA, locationId: locA, issue: 'Falta papel' });
    expect(r).toMatchObject({ ok: true, repetido: false });
    await new Promise((x) => setTimeout(x, 300));
    const ns = await prisma.notification.findMany({ where: { userId: { in: [gerA, coordA, gerB] } }, select: { userId: true, title: true, critical: true, link: true } });
    expect(ns.map((n) => n.userId).sort()).toEqual([gerA, coordA].sort());
    expect(ns.every((n) => n.critical && n.title.includes(`Banheiro Masculino ${sfx}: Falta papel`) && n.link === '/modulos/higiene')).toBe(true);
  });

  it('o mesmo aviso repetido em minutos não vira outro alerta; outro motivo vira', async () => {
    const antes = await prisma.notification.count({ where: { userId: gerA } });
    const de_novo = await createHygieneRequest({ unitId: unitA, locationId: locA, issue: 'Falta papel' });
    expect(de_novo).toMatchObject({ ok: true, repetido: true });
    expect(await prisma.notification.count({ where: { userId: gerA } })).toBe(antes);
    const outro = await createHygieneRequest({ unitId: unitA, locationId: locA, issue: 'Falta sabonete' });
    expect(outro).toMatchObject({ ok: true, repetido: false });
    expect(await prisma.hygieneRequest.count({ where: { unitId: unitA } })).toBe(2);
  });

  it('avaliação depois do envio vale uma vez', async () => {
    const r = await createHygieneRequest({ unitId: unitA, locationId: locA, issue: 'Lixo cheio' });
    const id = r.ok ? r.id : '';
    expect((await avaliarHygieneRequest(id, 4)).ok).toBe(true);
    expect((await avaliarHygieneRequest(id, 1)).ok).toBe(false);
    expect((await avaliarHygieneRequest(id, 9)).ok).toBe(false);
    expect((await prisma.hygieneRequest.findUniqueOrThrow({ where: { id } })).rating).toBe(4);
  });

  it('o apito só enxerga as unidades do alcance e só o que está em aberto', async () => {
    const desde = new Date(Date.now() - 60_000);
    const a = await alertasDeHigiene(gerente(gerA, unitA), desde);
    expect(a.length).toBeGreaterThanOrEqual(3);
    expect(a.every((x) => x.unidade.includes('Hig A'))).toBe(true);
    expect(await alertasDeHigiene(gerente(gerB, unitB), desde)).toEqual([]);
  });

  it('horário de pico em Brasília (não UTC)', async () => {
    await prisma.hygieneRequest.create({ data: { unitId: unitB, locationName: 'X', createdAt: new Date('2026-10-01T16:30:00Z') } }); // 13:30 em Brasília
    const an = await getHygieneAnalytics({ ...gerente(gerB, unitB) }, unitB, 3650);
    expect(an?.byHour).toEqual([{ hour: 13, count: 1 }]);
  });
});
