import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { subDays, format } from 'date-fns';
import { prisma } from '@/lib/db/prisma';
import { saveWasteEntry } from '@/lib/waste/save';
import { getWastePhotoRequired, setWastePhotoRequired } from '@/lib/waste/foto-config';
import { getConferencia, getPerformance } from '@/lib/waste/painel';
import type { SessionUser } from '@/lib/auth/session';

/**
 * Painel de desperdício (v1.152.0) — com banco:
 *  - foto do Restaurante OPCIONAL por padrão e obrigatória por procedimento
 *    quando o Admin liga a chave (a mesma regra que a tela confere);
 *  - Conferência devolve cada lançamento com as fotos, no endereço que o
 *    servidor serve (/uploads/…), recortada pelo escopo do usuário;
 *  - Performance compara pela média por dia lançado.
 */
const sfx = `pnl${process.pid.toString(36)}`;
let unitA: string, unitB: string, userId: string, adminId: string;
let catAlmoco: string, catJantar: string;
let chaveAntes: boolean;

const OP = format(subDays(new Date(), 1), 'yyyy-MM-dd');
const ym = OP.slice(0, 7);
const [Y, M] = [Number(OP.slice(0, 4)), Number(OP.slice(5, 7))];
const gerente = (): SessionUser => ({ id: userId, name: 'Ger', role: 'MANAGER', unitIds: [unitA], seesAllUnits: false, needsTerms: false });
const admin = (): SessionUser => ({ id: adminId, name: 'Adm', role: 'ADMIN', unitIds: [unitA, unitB], seesAllUnits: false, needsTerms: false });

beforeAll(async () => {
  chaveAntes = await getWastePhotoRequired();
  unitA = (await prisma.unit.create({ data: { code: `PA-${sfx}`, name: `Painel A ${sfx}`, timezone: 'America/Sao_Paulo', cutoffHour: 4 } })).id;
  unitB = (await prisma.unit.create({ data: { code: `PB-${sfx}`, name: `Painel B ${sfx}`, timezone: 'America/Sao_Paulo', cutoffHour: 4 } })).id;
  userId = (await prisma.user.create({ data: { name: 'Ger', email: `ger-${sfx}@example.com`, role: 'MANAGER', passwordHash: 'x' } })).id;
  adminId = (await prisma.user.create({ data: { name: 'Adm', email: `adm-${sfx}@example.com`, role: 'ADMIN', passwordHash: 'x' } })).id;
  await prisma.unitMembership.create({ data: { userId, unitId: unitA } });
  /* As categorias fixas existem uma vez só no banco (código único): reusa se já houver. */
  const cat = async (code: string, name: string) => (await prisma.wasteCategory.findFirst({ where: { code } }))?.id
    ?? (await prisma.wasteCategory.create({ data: { code, name, order: 10 } })).id;
  catAlmoco = await cat('SS_ALMOCO', 'Sobra Limpa (Self-Service) — Almoço');
  catJantar = await cat('PROD_JANTAR', 'Sobra de Produção — Jantar');
});

afterAll(async () => {
  await prisma.appSetting.upsert({ where: { key: 'WASTE_PHOTO_REQUIRED' }, create: { key: 'WASTE_PHOTO_REQUIRED', value: String(chaveAntes) }, update: { value: String(chaveAntes) } });
  await prisma.unit.deleteMany({ where: { id: { in: [unitA, unitB] } } }).catch(() => {});
  await prisma.user.deleteMany({ where: { id: { in: [userId, adminId] } } }).catch(() => {});
  await prisma.$disconnect();
});

describe('foto do Restaurante pela chave WASTE_PHOTO_REQUIRED', () => {
  it('desligada (padrão): salva sem foto nenhuma, mesmo com checklist que exigia evidência', async () => {
    await setWastePhotoRequired(admin(), false);
    const tpl = await prisma.taskTemplate.create({ data: { unitId: unitA, name: 'Perdas', module: 'WASTE', requiresEvidence: true, limitTime: '23:00' } });
    await prisma.taskInstance.create({ data: { templateId: tpl.id, unitId: unitA, operationalDate: OP, dueAt: new Date(`${OP}T23:00:00Z`) } });
    const r = await saveWasteEntry(gerente(), { unitId: unitA, operationalDate: OP, items: [{ categoryId: catAlmoco, kg: 4 }] });
    expect(r.ok).toBe(true);
  });

  it('ligada: cada procedimento com peso precisa da SUA foto; a já gravada conta', async () => {
    await setWastePhotoRequired(admin(), true);
    const falta = await saveWasteEntry(gerente(), {
      unitId: unitA, operationalDate: OP,
      items: [{ categoryId: catAlmoco, kg: 4 }, { categoryId: catJantar, kg: 2 }],
      entryPhotos: [{ typeCode: 'SS_ALMOCO', path: `uploads/${unitA}/a.jpg` }],
    });
    expect(falta.ok).toBe(false);
    if (!falta.ok) expect(falta.reason).toBe('EVIDENCE_REQUIRED');

    const ok = await saveWasteEntry(gerente(), {
      unitId: unitA, operationalDate: OP,
      items: [{ categoryId: catAlmoco, kg: 4 }, { categoryId: catJantar, kg: 2 }],
      entryPhotos: [{ typeCode: 'SS_ALMOCO', path: `uploads/${unitA}/a.jpg` }, { typeCode: 'PROD_JANTAR', path: `uploads/${unitA}/j.jpg` }],
    });
    expect(ok.ok).toBe(true);

    // corrigir só o peso depois: as fotos já gravadas no dia satisfazem a regra
    const correcao = await saveWasteEntry(gerente(), { unitId: unitA, operationalDate: OP, items: [{ categoryId: catAlmoco, kg: 5 }, { categoryId: catJantar, kg: 2 }] });
    expect(correcao.ok).toBe(true);
  });

  it('só o Admin liga ou desliga', async () => {
    const r = await setWastePhotoRequired(gerente(), false);
    expect(r.ok).toBe(false);
    await setWastePhotoRequired(admin(), false);
    expect(await getWastePhotoRequired()).toBe(false);
  });
});

describe('Conferência', () => {
  it('traz o lançamento com as fotos no endereço servido e a situação da foto', async () => {
    const c = await getConferencia(admin(), 'restaurante', Y, M, unitA);
    const l = c.lancamentos.find((x) => x.unitId === unitA && x.date === OP)!;
    expect(l).toBeTruthy();
    expect(l.total).toBe(7);
    expect(l.fotos.map((f) => f.path).sort()).toEqual([`uploads/${unitA}/a.jpg`, `uploads/${unitA}/j.jpg`]);
    expect(l.foto).toBe('completa');
    expect(l.registradoPor).toBe('Ger');
    expect(c.mapa).toHaveLength(1); // filtro de unidade aplicado
  });

  it('salgados: foto do recipiente e "sem foto" quando não há', async () => {
    const tipo = await prisma.wasteSnackOption.create({ data: { kind: 'TIPO', name: `Coxinha ${sfx}` } });
    const motivo = await prisma.wasteSnackOption.create({ data: { kind: 'MOTIVO', name: `Sobra ${sfx}` } });
    await prisma.wasteSnackDiscard.create({ data: { unitId: unitA, operationalDate: OP, typeId: tipo.id, typeName: tipo.name, reasonId: motivo.id, reasonName: motivo.name, quantity: 6, createdById: userId } });
    await prisma.wasteSnackDayEvidence.create({ data: { unitId: unitA, operationalDate: OP, path: `uploads/${unitA}/snack.jpg` } });
    await prisma.wasteSnackDiscard.create({ data: { unitId: unitB, operationalDate: OP, typeId: tipo.id, typeName: tipo.name, reasonId: motivo.id, reasonName: motivo.name, quantity: 3 } });

    const c = await getConferencia(admin(), 'salgados', Y, M);
    const a = c.lancamentos.find((x) => x.unitId === unitA && x.date === OP)!;
    const b = c.lancamentos.find((x) => x.unitId === unitB && x.date === OP)!;
    expect(a.foto).toBe('completa');
    expect(a.fotos[0].path).toBe(`uploads/${unitA}/snack.jpg`);
    expect(b.foto).toBe('sem-foto');
    expect(c.resumo.fotoFaltando).toBeGreaterThanOrEqual(1);

    await prisma.wasteSnackDiscard.deleteMany({ where: { typeId: tipo.id } });
    await prisma.wasteSnackOption.deleteMany({ where: { id: { in: [tipo.id, motivo.id] } } });
  });

  it('escopo: o gerente da unidade A não vê a B, nem pedindo pelo id', async () => {
    const c = await getConferencia(gerente(), 'salgados', Y, M, unitB);
    expect(c.lancamentos.every((l) => l.unitId === unitA)).toBe(true);
    expect(c.unidades.map((u) => u.id)).toEqual([unitA]);
  });
});

describe('Performance', () => {
  it('compara pela média por dia lançado do recorte pedido', async () => {
    const p = await getPerformance(admin(), 'restaurante', Y, M, unitA);
    expect(p.resumo.atual.lancamentos).toBe(1);
    expect(p.resumo.atual.media).toBe(7);
    expect(p.serie.find((s) => s.date === OP)?.total).toBe(7);
    expect(p.partes.map((x) => x.chave).sort()).toEqual(['PROD_JANTAR', 'SS_ALMOCO']);
    expect(p.tendencia[p.tendencia.length - 1].ym).toBe(ym);
  });
});
