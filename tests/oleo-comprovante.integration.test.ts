import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { createOilCollection } from '@/lib/oil/create';
import { listOilCollections, janelaValida, desdeISO } from '@/lib/oil/query';
import { currentOperationalDate } from '@/lib/date/operational';
import type { SessionUser } from '@/lib/auth/session';
import path from 'node:path';
import { existsSync } from 'node:fs';

/**
 * A coleta de óleo é a única movimentação em que sai mercadoria da unidade e
 * entra dinheiro por fora do caixa. Sem o recibo ao lado do número, "80 litros
 * no papel, 100 no sistema" é indistinguível de erro de digitação — e sem o
 * responsável gravado, não há a quem perguntar. Estes casos existem para que o
 * comprovante e a autoria não voltem a ser opcionais.
 */

const sfx = process.pid.toString(36);
const RECIBO = `uploads/teste/recibo-${sfx}.jpg`;

let userId: string;
let outroId: string;
let unitId: string;
let supplierId: string;
let hoje: string;

const gerente = (): SessionUser => ({ id: userId, name: 'Gerente Teste', role: 'MANAGER', unitIds: [unitId], seesAllUnits: false, needsTerms: false });
const forasteiro = (): SessionUser => ({ id: outroId, name: 'Outro', role: 'MANAGER', unitIds: ['nao-e-minha'], seesAllUnits: false, needsTerms: false });

/** O lançamento completo — cada teste remove SÓ a peça que quer provar. */
const base = () => ({ unitId, liters: 80, pricePerLiter: 1.5, supplierId, receiptPath: RECIBO });

beforeAll(async () => {
  userId = (await prisma.user.create({ data: { name: `Gerente ${sfx}`, email: `oleo-${sfx}@e.com`, role: 'MANAGER', passwordHash: 'x' } })).id;
  outroId = (await prisma.user.create({ data: { name: `Outro ${sfx}`, email: `oleo2-${sfx}@e.com`, role: 'MANAGER', passwordHash: 'x' } })).id;
  const unit = await prisma.unit.create({ data: { code: `OLEO-${sfx}`, name: 'U Óleo', timezone: 'America/Sao_Paulo', cutoffHour: 4 } });
  unitId = unit.id;
  supplierId = (await prisma.supplier.create({ data: { name: `Coletora ${sfx}` } })).id;
  hoje = currentOperationalDate({ timezone: unit.timezone, cutoffHour: unit.cutoffHour });
});

afterAll(async () => {
  await prisma.oilCollection.deleteMany({ where: { unitId } });
  await prisma.supplier.deleteMany({ where: { id: supplierId } });
  await prisma.unit.deleteMany({ where: { id: unitId } });
  await prisma.user.deleteMany({ where: { id: { in: [userId, outroId] } } });
});

/** Dias somados a uma data ISO, sem depender do fuso de quem roda o teste. */
function maisDias(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

describe('o comprovante trava o lançamento', () => {
  it('sem a foto do recibo, a coleta NÃO é registrada', async () => {
    const r = await createOilCollection(gerente(), { ...base(), receiptPath: undefined });
    expect(r).toEqual({ ok: false, reason: 'SEM_COMPROVANTE' });
    expect(await prisma.oilCollection.count({ where: { unitId } })).toBe(0);
  });

  it('caminho em branco não passa por comprovante', async () => {
    /* String vazia é o que um formulário manda quando o campo existe e ninguém
       preencheu — não pode valer como anexo. */
    const r = await createOilCollection(gerente(), { ...base(), receiptPath: '   ' });
    expect(r).toEqual({ ok: false, reason: 'SEM_COMPROVANTE' });
  });

  it('com a foto, registra e guarda o caminho no registro', async () => {
    const r = await createOilCollection(gerente(), base());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const rec = await prisma.oilCollection.findUnique({ where: { id: r.id }, select: { receiptPath: true } });
    expect(rec?.receiptPath).toBe(RECIBO);
  });
});

describe('quem coletou e quem lançou', () => {
  it('sem fornecedor E sem nome digitado, não registra', async () => {
    const r = await createOilCollection(gerente(), { ...base(), supplierId: undefined, collectorName: undefined });
    expect(r).toEqual({ ok: false, reason: 'SEM_COLETOR' });
  });

  it('o nome digitado basta quando a empresa não está no cadastro', async () => {
    const r = await createOilCollection(gerente(), { ...base(), supplierId: undefined, collectorName: 'Zé do Óleo' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const rec = await prisma.oilCollection.findUnique({ where: { id: r.id }, select: { collectorName: true, supplierId: true } });
    expect(rec?.collectorName).toBe('Zé do Óleo');
    expect(rec?.supplierId).toBeNull();
  });

  it('o responsável pelo lançamento é a SESSÃO, com data e hora', async () => {
    /* O campo é a rastreabilidade: quem digitou os 100 litros. Se viesse do
       corpo do request, daria para lançar em nome de outra pessoa. */
    const antes = Date.now();
    const r = await createOilCollection(gerente(), base());
    if (!r.ok) throw new Error('não registrou');
    const rec = await prisma.oilCollection.findUnique({ where: { id: r.id }, select: { createdById: true, createdAt: true } });
    expect(rec?.createdById).toBe(userId);
    expect(rec!.createdAt.getTime()).toBeGreaterThanOrEqual(antes - 1000);
  });

  it('quem não enxerga a unidade não lança nela', async () => {
    const r = await createOilCollection(forasteiro(), base());
    expect(r).toEqual({ ok: false, reason: 'FORBIDDEN' });
  });

  it('litros zerados não entram, mesmo com tudo o mais preenchido', async () => {
    const r = await createOilCollection(gerente(), { ...base(), liters: 0 });
    expect(r).toEqual({ ok: false, reason: 'INVALID' });
  });
});

describe('a data da coleta', () => {
  it('sem data informada, assume o dia operacional de hoje', async () => {
    const r = await createOilCollection(gerente(), base());
    if (!r.ok) throw new Error('não registrou');
    const rec = await prisma.oilCollection.findUnique({ where: { id: r.id }, select: { operationalDate: true } });
    expect(rec?.operationalDate).toBe(hoje);
  });

  it('aceita dia anterior — o recibo nem sempre chega no mesmo dia', async () => {
    const ontem = maisDias(hoje, -3);
    const r = await createOilCollection(gerente(), { ...base(), operationalDate: ontem });
    if (!r.ok) throw new Error('não registrou');
    const rec = await prisma.oilCollection.findUnique({ where: { id: r.id }, select: { operationalDate: true } });
    expect(rec?.operationalDate).toBe(ontem);
  });

  it('recusa data futura', async () => {
    /* Coleta que ainda não aconteceu não tem recibo: se há foto anexada, ela é
       de outra coisa. */
    const r = await createOilCollection(gerente(), { ...base(), operationalDate: maisDias(hoje, 1) });
    expect(r).toEqual({ ok: false, reason: 'DATA_FUTURA' });
  });
});

describe('o histórico corta por período no BANCO', () => {
  it('coleta antiga some da janela curta e volta em "todo o histórico"', async () => {
    /* Filtrar por período dentro de um bolo já cortado responderia "nenhuma
       coleta" a quem tem coletas fora do corte — pior que uma lista longa,
       porque parece resposta. */
    const antiga = maisDias(hoje, -200);
    await createOilCollection(gerente(), { ...base(), operationalDate: antiga, liters: 7 });

    const em30 = await listOilCollections(gerente(), { dias: 30 });
    expect(em30.some((r) => r.operationalDate === antiga)).toBe(false);

    const tudo = await listOilCollections(gerente(), { dias: 0 });
    expect(tudo.some((r) => r.operationalDate === antiga)).toBe(true);
  });

  it('o histórico de uma unidade não vaza para quem não a enxerga', async () => {
    expect(await listOilCollections(forasteiro(), { dias: 0 })).toEqual([]);
  });
});

describe('as janelas do filtro', () => {
  it('só aceita as janelas conhecidas; o resto cai no padrão de 90 dias', () => {
    expect(janelaValida('30')).toBe(30);
    expect(janelaValida('0')).toBe(0);
    expect(janelaValida('7')).toBe(90);
    expect(janelaValida(undefined)).toBe(90);
    expect(janelaValida('; drop table')).toBe(90);
  });

  it('"todo o histórico" não tem data de corte', () => {
    expect(desdeISO(0)).toBeNull();
    expect(desdeISO(30, new Date('2026-03-31T12:00:00Z'))).toBe('2026-03-01');
  });
});

describe('o anexo de uma tentativa recusada não fica no volume', () => {
  it('removeUpload apaga o arquivo salvo e ignora caminho de fora da pasta', async () => {
    /* A foto é gravada ANTES de a regra decidir — sem ela o lançamento nem
       chega a ser avaliado. Recusado o lançamento, o arquivo não pertence a
       registro nenhum. */
    const { saveEvidence, removeUpload } = await import('@/lib/uploads');
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    const file = new File([png], 'recibo.png', { type: 'image/png' });

    const rel = await saveEvidence(file, unitId, `oil-teste-${sfx}`);
    const full = path.join(process.cwd(), ...rel.split('/'));
    expect(existsSync(full)).toBe(true);

    await removeUpload(rel);
    expect(existsSync(full)).toBe(false);

    /* Caminho com ".." não sai da pasta de uploads — e não explode. */
    await expect(removeUpload('uploads/../../package.json')).resolves.toBeUndefined();
    expect(existsSync(path.join(process.cwd(), 'package.json'))).toBe(true);
  });
});
