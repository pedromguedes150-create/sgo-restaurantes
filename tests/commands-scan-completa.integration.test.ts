import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { submitScanCount, getScanContext } from '@/lib/commands/scan';
import { getLastFullCount } from '@/lib/commands/full-count';
import type { SessionUser } from '@/lib/auth/session';

/**
 * A regra pedida: bipar uma comanda FORA da faixa do dia significa que o caixa
 * está fazendo a contagem da semana — e o escopo passa a ser a sequência
 * inteira.
 *
 * Antes, o leitor só aceitava os números da faixa: bipar a 350 respondia "não
 * pertence à sequência", e a contagem completa não podia ser feita por leitor.
 */

const sfx = `sc${process.pid.toString(36)}`;
let unitId: string;
let caixaId: string;

const caixa = (): SessionUser => ({ id: caixaId, name: 'Caixa', role: 'CASHIER', unitIds: [unitId], seesAllUnits: false, needsTerms: false });
const numeros = (de: number, ate: number) => Array.from({ length: ate - de + 1 }, (_, i) => de + i);

beforeAll(async () => {
  unitId = (await prisma.unit.create({ data: { code: `SC-${sfx}`, name: 'U Scan', timezone: 'America/Sao_Paulo', cutoffHour: 4 } })).id;
  caixaId = (await prisma.user.create({ data: { name: 'Caixa', email: `${sfx}@e.com`, role: 'CASHIER', passwordHash: 'x' } })).id;
  await prisma.unitMembership.create({ data: { userId: caixaId, unitId } });

  /* Faixa do dia 1–20 (madrugada) e reserva 21–40 — a "1 a 300" da vida real. */
  await prisma.commandSequence.create({ data: { unitId, name: 'Salão', rangeStart: 1, rangeEnd: 20, nightly: true, order: 0 } });
  await prisma.commandSequence.create({ data: { unitId, name: 'Reserva', rangeStart: 21, rangeEnd: 40, nightly: false, order: 1 } });
});

afterAll(async () => {
  await prisma.commandDivergence.deleteMany({ where: { unitId } }).catch(() => {});
  await prisma.commandCount.deleteMany({ where: { unitId } }).catch(() => {});
  await prisma.commandSequence.deleteMany({ where: { unitId } }).catch(() => {});
  await prisma.unitMembership.deleteMany({ where: { unitId } }).catch(() => {});
  await prisma.unit.delete({ where: { id: unitId } }).catch(() => {});
  await prisma.user.delete({ where: { id: caixaId } }).catch(() => {});
  await prisma.$disconnect();
});

describe('O contexto do leitor', () => {
  it('manda TODAS as ativas — é o que permite bipar acima da faixa', async () => {
    /* Antes vinha só a faixa, e por isso o leitor recusava a 350. */
    const r = await getScanContext(caixa(), unitId);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.ctx.activeNumbers).toHaveLength(40);
    expect(r.ctx.nightlyNumbers).toHaveLength(20);
    expect(r.ctx.partial).toBe(true);
  });
});

describe('Bipando só dentro da faixa', () => {
  it('fica PARCIAL e não zera o indicador de contagem completa', async () => {
    await prisma.commandCount.deleteMany({ where: { unitId } });
    const r = await submitScanCount(caixa(), { unitId, scannedNumbers: numeros(1, 20) });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    expect(r.completa).toBe(false);
    expect(r.foraDaFaixa).toEqual([]);
    expect(r.absent).toEqual([]);

    const c = await prisma.commandCount.findFirst({ where: { unitId } });
    /* Escopo gravado = parcial. É isso que impede as 21–40 virarem extraviadas. */
    expect(c!.scopeNumbers).toEqual(numeros(1, 20));

    const completa = await getLastFullCount(unitId, c!.operationalDate);
    expect(completa.never).toBe(true);
  });

  it('as guardadas NÃO viram divergência', async () => {
    expect(await prisma.commandDivergence.count({ where: { unitId, status: 'OPEN' } })).toBe(0);
  });
});

describe('Bipando UMA fora da faixa', () => {
  it('a conferência vira COMPLETA e julga a sequência inteira', async () => {
    /* O pedido literal: "passou qualquer comanda no leitor acima da 300,
       entende-se que quer conferir todas". */
    await prisma.commandCount.deleteMany({ where: { unitId } });
    await prisma.commandDivergence.deleteMany({ where: { unitId } });

    const r = await submitScanCount(caixa(), {
      unitId,
      scannedNumbers: [...numeros(1, 20), 25],
      note: 'contagem da semana',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    expect(r.completa).toBe(true);
    expect(r.foraDaFaixa).toEqual([25]);
    /* 21–40 menos a 25 que foi bipada = 19 faltantes de verdade. */
    expect(r.absent).toHaveLength(19);
    expect(r.absent).not.toContain(25);
  });

  it('é gravada SEM escopo — e por isso conta como contagem completa', async () => {
    const c = await prisma.commandCount.findFirst({ where: { unitId } });
    expect(c!.scopeNumbers).toBeNull();

    const completa = await getLastFullCount(unitId, c!.operationalDate);
    expect(completa.never).toBe(false);
  });

  it('a observação diz por que virou completa', async () => {
    /* Sem isso, o supervisor vê 19 divergências novas e não entende de onde
       vieram. */
    const d = await prisma.commandDivergence.findFirst({ where: { unitId, status: 'OPEN' } });
    expect(d!.observation).toContain('COMPLETA');
    expect(d!.observation).toContain('25');
  });
});

describe('Bipando todas as 40', () => {
  it('completa, sem faltante nenhum', async () => {
    await prisma.commandCount.deleteMany({ where: { unitId } });
    await prisma.commandDivergence.deleteMany({ where: { unitId } });

    const r = await submitScanCount(caixa(), { unitId, scannedNumbers: numeros(1, 40) });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.completa).toBe(true);
    expect(r.absent).toEqual([]);
    expect(r.scanned).toBe(40);
  });
});

describe('Número que não é da unidade', () => {
  it('não transforma a conferência em completa', async () => {
    /* Bipar um código estranho é erro de leitura, não decisão de contar tudo. */
    await prisma.commandCount.deleteMany({ where: { unitId } });
    const r = await submitScanCount(caixa(), { unitId, scannedNumbers: [...numeros(1, 20), 9999] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.completa).toBe(false);
    expect(r.scanned).toBe(20);
  });
});
