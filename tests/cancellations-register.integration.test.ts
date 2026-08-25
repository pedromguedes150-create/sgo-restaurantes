import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { registerCancellation, normalizeCouponNumber } from '@/lib/cancellations/register';
import type { SessionUser } from '@/lib/auth/session';

/**
 * Registro do cancelamento com foto do cupom (Módulo 4).
 *
 * O que estes testes protegem: o relatório do Teknisa chega no dia seguinte, e
 * a essa altura o cupom já foi para o lixo — a foto só existe se alguém a tirar
 * na hora. Mas o relatório continua sendo a fonte que garante que TODO
 * cancelamento aparece; por isso os dois têm de se ENCONTRAR, e não virar dois
 * registros do mesmo cancelamento.
 */

const sfx = `cn${process.pid.toString(36)}`;
let unitId: string;
let outraUnitId: string;
let mgrId: string;
let reasonId: string;

const mgr = (): SessionUser => ({ id: mgrId, name: 'Ger', role: 'MANAGER', unitIds: [unitId], seesAllUnits: false, needsTerms: false });

const FOTO = 'uploads/u1/canc-1.jpg';

beforeAll(async () => {
  const u = await prisma.unit.create({ data: { code: `CN-${sfx}`, name: 'U Canc', timezone: 'America/Sao_Paulo', cutoffHour: 4 } });
  unitId = u.id;
  const o = await prisma.unit.create({ data: { code: `CN2-${sfx}`, name: 'Outra', timezone: 'America/Sao_Paulo', cutoffHour: 4 } });
  outraUnitId = o.id;
  mgrId = (await prisma.user.create({ data: { name: 'Ger', email: `${sfx}@e.com`, role: 'MANAGER', passwordHash: 'x' } })).id;
  await prisma.unitMembership.create({ data: { userId: mgrId, unitId } });
  reasonId = (await prisma.cancellationReason.create({ data: { name: `Erro de digitação ${sfx}` } })).id;
});

afterAll(async () => {
  await prisma.cancellation.deleteMany({ where: { unitId: { in: [unitId, outraUnitId] } } }).catch(() => {});
  await prisma.cancellationReason.delete({ where: { id: reasonId } }).catch(() => {});
  await prisma.unitMembership.deleteMany({ where: { unitId } }).catch(() => {});
  await prisma.unit.deleteMany({ where: { id: { in: [unitId, outraUnitId] } } }).catch(() => {});
  await prisma.user.delete({ where: { id: mgrId } }).catch(() => {});
  await prisma.$disconnect();
});

describe('normalizeCouponNumber', () => {
  it('"0042" e "42" são o mesmo cupom', () => {
    /* O Teknisa exporta com zeros à esquerda e o gerente digita sem. Sem isto,
       a foto nunca encontraria o registro importado. */
    expect(normalizeCouponNumber('0042')).toBe('42');
    expect(normalizeCouponNumber(' 42 ')).toBe('42');
    expect(normalizeCouponNumber('42')).toBe('42');
  });

  it('zero continua zero', () => {
    expect(normalizeCouponNumber('0')).toBe('0');
    expect(normalizeCouponNumber('000')).toBe('0');
  });
});

describe('Registro com foto', () => {
  it('sem foto, não passa — é o ponto do recurso', async () => {
    const r = await registerCancellation(mgr(), { unitId, couponNumber: '100', value: 50, photoPath: '' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('NO_PHOTO');
  });

  it('com motivo, nasce já justificado', async () => {
    /* Exigir que o gerente volte depois para justificar o que ele mesmo acabou
       de explicar seria trabalho repetido. */
    const r = await registerCancellation(mgr(), {
      unitId, couponNumber: '101', value: 33.5, reasonId, note: 'cliente desistiu', photoPath: FOTO,
    });
    expect(r.ok).toBe(true);

    const c = await prisma.cancellation.findFirst({ where: { unitId, couponNumber: '101' } });
    expect(c!.status).toBe('JUSTIFIED');
    expect(c!.source).toBe('MANUAL');
    expect(c!.photoPath).toBe(FOTO);
    expect(c!.canceledAt).not.toBeNull();
    expect(c!.registeredById).toBe(mgrId);
  });

  it('sem motivo, fica pendente de justificativa', async () => {
    const r = await registerCancellation(mgr(), { unitId, couponNumber: '102', value: 10, photoPath: FOTO });
    expect(r.ok).toBe(true);
    const c = await prisma.cancellation.findFirst({ where: { unitId, couponNumber: '102' } });
    expect(c!.status).toBe('PENDING');
  });

  it('valor inválido é recusado', async () => {
    const r = await registerCancellation(mgr(), { unitId, couponNumber: '103', value: 0, photoPath: FOTO });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('INVALID');
  });

  it('unidade de outro gerente é recusada', async () => {
    const r = await registerCancellation(mgr(), { unitId: outraUnitId, couponNumber: '104', value: 10, photoPath: FOTO });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('FORBIDDEN');
  });

  it('o mesmo cupom duas vezes é engano, não dois cancelamentos', async () => {
    const r = await registerCancellation(mgr(), { unitId, couponNumber: '101', value: 33.5, photoPath: FOTO });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('DUPLICATE');
  });
});

describe('Encontro com o que veio do Teknisa', () => {
  it('a foto COMPLETA o registro importado, não cria outro', async () => {
    /* Duplicar contaria o mesmo cancelamento duas vezes no total do mês — e o
       valor cancelado do mês é justamente o número que a supervisão olha. */
    const hoje = new Date();
    const operationalDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(hoje);
    await prisma.cancellation.create({
      data: { unitId, operationalDate, couponNumber: '500', value: 120, status: 'PENDING', source: 'IMPORT' },
    });

    /* O gerente digita sem os zeros à esquerda que o Teknisa exporta. */
    const r = await registerCancellation(mgr(), {
      unitId, couponNumber: '00500', value: 120, reasonId, photoPath: FOTO,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.juntouAoImportado).toBe(true);

    const todos = await prisma.cancellation.findMany({ where: { unitId, couponNumber: '500' } });
    expect(todos).toHaveLength(1);
    expect(todos[0].photoPath).toBe(FOTO);
    expect(todos[0].source).toBe('IMPORT');
    expect(todos[0].status).toBe('JUSTIFIED');
  });

  it('importado que JÁ tem foto não é sobrescrito', async () => {
    const r = await registerCancellation(mgr(), { unitId, couponNumber: '500', value: 120, photoPath: 'uploads/u1/outra.jpg' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('DUPLICATE');
  });
});

describe('A hora decide o dia operacional', () => {
  it('cancelamento da madrugada pertence ao dia anterior', async () => {
    /* Corte às 04:00: 01h de hoje ainda é a operação de ontem. Usar "hoje"
       jogaria a conciliação com o Teknisa para o dia errado. */
    const ontem = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const madrugada = new Date(Date.UTC(ontem.getUTCFullYear(), ontem.getUTCMonth(), ontem.getUTCDate(), 4, 30)); // 01:30 BRT
    const r = await registerCancellation(mgr(), {
      unitId, couponNumber: '900', value: 15, canceledAt: madrugada.toISOString(), photoPath: FOTO,
    });
    expect(r.ok).toBe(true);

    const c = await prisma.cancellation.findFirst({ where: { unitId, couponNumber: '900' } });
    const diaDaHora = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(madrugada);
    expect(c!.operationalDate < diaDaHora).toBe(true);
  });

  it('hora no futuro é recusada', async () => {
    const amanha = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const r = await registerCancellation(mgr(), { unitId, couponNumber: '901', value: 15, canceledAt: amanha, photoPath: FOTO });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('INVALID');
  });
});
