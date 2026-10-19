import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import type { SessionUser } from '@/lib/auth/session';
import { createPrepStandard, updatePrepStandard } from '@/lib/preparo/write';
import { getPrepStandard, listPrepStandards, listPrepCategories, vizinhosDaFicha } from '@/lib/preparo/query';

/**
 * PADRONIZAÇÃO — aba RESTAURANTE no banco (v1.172.0): guia sem código grava
 * e dois guias sem código não colidem; cada aba lista só o seu; os vizinhos
 * não saltam de aba; editar nunca muda a ficha de aba; a lanchonete segue
 * exigindo código único.
 */

const sfx = `pr${process.pid.toString(36)}${Date.now().toString(36).slice(-3)}`;
let adminId: string;
const admin = (): SessionUser => ({ id: adminId, name: 'Daniel Admin', role: 'ADMIN', unitIds: [], seesAllUnits: true, needsTerms: false });

const guia = (n: number, over: Record<string, unknown> = {}) => ({
  name: `Guia ${sfx}-${n}`, code: '', category: `Preparações ${sfx}`, segment: 'RESTAURANTE',
  ovenMode: 'Ar Seco', temperature: '200°C', cookTime: '15 Min', preparationMethod: null, generalNotes: 'Aquecer antes.',
  items: [{ ingredientName: 'Escondidinho' }, { ingredientName: 'Lasanha' }],
  ...over,
});
const ficha = (n: number) => ({
  name: `Ficha ${sfx}-${n}`, code: `${sfx}-${n}`, category: `Lanches ${sfx}`, preparationMethod: null, generalNotes: null,
  items: [{ ingredientName: 'Pão', quantity: 1, unit: 'Unid', weightGrams: 65, notes: null }],
});

beforeAll(async () => {
  adminId = (await prisma.user.create({ data: { name: 'Daniel Admin', email: `${sfx}-a@e.com`, role: 'ADMIN', passwordHash: 'x' } })).id;
});

afterAll(async () => {
  await prisma.prepStandard.deleteMany({ where: { OR: [{ name: { contains: sfx } }, { code: { startsWith: `${sfx}-` } }] } });
  await prisma.auditLog.deleteMany({ where: { userId: adminId } });
  await prisma.user.deleteMany({ where: { id: adminId } });
  await prisma.$disconnect();
});

describe('Guia do restaurante', () => {
  it('grava sem código, com função/temperatura/tempo e as preparações; o segundo sem código NÃO é CODIGO_EXISTE', async () => {
    const a = await createPrepStandard(admin(), { dados: guia(1), sourceFilePath: 'uploads/preparo/fonte-cubas.pdf' });
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    const b = await createPrepStandard(admin(), { dados: guia(2) });
    expect(b.ok).toBe(true);
    const f = await getPrepStandard(admin(), a.id);
    expect(f).toMatchObject({ segment: 'RESTAURANTE', code: '', ovenMode: 'Ar Seco', temperature: '200°C', cookTime: '15 Min', sourceFilePath: 'uploads/preparo/fonte-cubas.pdf' });
    expect(f?.items.map((i) => i.ingredientName)).toEqual(['Escondidinho', 'Lasanha']);
    const audit = await prisma.auditLog.findFirst({ where: { action: 'PREP_STANDARD_CREATE', entityId: a.id } });
    expect((audit?.metadata as { segment?: string })?.segment).toBe('RESTAURANTE');
  });

  it('cada aba lista só o seu; categorias por aba; Anterior/Próximo não saltam para a outra aba', async () => {
    const g1 = await createPrepStandard(admin(), { dados: guia(3) });
    const g2 = await createPrepStandard(admin(), { dados: guia(4) });
    const l1 = await createPrepStandard(admin(), { dados: ficha(5) });
    if (!g1.ok || !g2.ok || !l1.ok) throw new Error('não criou');

    const rest = await listPrepStandards(admin(), { segment: 'RESTAURANTE' });
    const lanch = await listPrepStandards(admin(), { segment: 'LANCHONETE' });
    expect(rest.map((f) => f.id)).toEqual(expect.arrayContaining([g1.id, g2.id]));
    expect(rest.some((f) => f.id === l1.id)).toBe(false);
    expect(lanch.some((f) => f.id === l1.id)).toBe(true);
    expect(lanch.some((f) => f.id === g1.id)).toBe(false);
    const resumo = rest.find((f) => f.id === g1.id)!;
    expect(resumo).toMatchObject({ segment: 'RESTAURANTE', ovenMode: 'Ar Seco', temperature: '200°C', cookTime: '15 Min', ingredientes: ['Escondidinho', 'Lasanha'] });

    expect(await listPrepCategories('RESTAURANTE')).toContain(`Preparações ${sfx}`);
    expect(await listPrepCategories('RESTAURANTE')).not.toContain(`Lanches ${sfx}`);
    expect(await listPrepCategories('LANCHONETE')).toContain(`Lanches ${sfx}`);

    /* Os vizinhos de um guia, dentro da aba, são só guias. */
    const idsRest = (await prisma.prepStandard.findMany({ where: { status: 'ACTIVE', segment: 'RESTAURANTE' }, select: { id: true } })).map((r) => r.id);
    const v = await vizinhosDaFicha(g1.id, 'RESTAURANTE');
    expect(v.total).toBe(idsRest.length);
    for (const id of [v.prevId, v.nextId]) if (id) expect(idsRest).toContain(id);
  });

  it('editar não muda a aba: guia editado segue RESTAURANTE; ficha da lanchonete editada com campos do forno os ignora', async () => {
    const g = await createPrepStandard(admin(), { dados: guia(6) });
    const l = await createPrepStandard(admin(), { dados: ficha(7) });
    if (!g.ok || !l.ok) throw new Error('não criou');

    const u1 = await updatePrepStandard(admin(), g.id, guia(6, { segment: 'LANCHONETE', temperature: '180°C', code: '' }));
    expect(u1.ok).toBe(true);
    const fg = await getPrepStandard(admin(), g.id);
    expect(fg).toMatchObject({ segment: 'RESTAURANTE', temperature: '180°C', code: '' });

    const u2 = await updatePrepStandard(admin(), l.id, { ...ficha(7), segment: 'RESTAURANTE', ovenMode: 'Vapor' });
    expect(u2.ok).toBe(true);
    const fl = await getPrepStandard(admin(), l.id);
    expect(fl).toMatchObject({ segment: 'LANCHONETE', ovenMode: null, code: `${sfx}-7` });
  });

  it('a lanchonete continua como era: sem código é INVALID e código repetido é CODIGO_EXISTE', async () => {
    expect(await createPrepStandard(admin(), { dados: { ...ficha(8), code: '' } })).toMatchObject({ ok: false, reason: 'INVALID' });
    const a = await createPrepStandard(admin(), { dados: ficha(9) });
    expect(a.ok).toBe(true);
    expect(await createPrepStandard(admin(), { dados: ficha(9) })).toMatchObject({ ok: false, reason: 'CODIGO_EXISTE' });
  });
});
