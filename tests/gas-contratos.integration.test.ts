import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { listGasContracts } from '@/lib/gas/contracts';
import type { SessionUser } from '@/lib/auth/session';

/**
 * O CONTRATO PRECISA EXPLICAR O PRÓPRIO NÚMERO.
 *
 * O relato: o contrato mostrava 39.385,6 kg e a soma das notas dava 39.814,6 —
 * diferença exata de uma nota de 429 kg, de 08/09/2023.
 *
 * A causa da CLASSE está no modelo: **não existe FK** entre `GasReceipt` e
 * `GasContract`. O vínculo é inferido por unidade + fornecedor + janela de
 * datas, e qualquer uma das três exclui uma nota em silêncio. Enquanto não há
 * FK, o contrato passa a dizer o que deixou de fora e por quê — que é o que
 * transforma uma divergência muda em algo corrigível.
 */

const sfx = `${process.pid.toString(36)}${Date.now().toString(36).slice(-4)}`;
let unidade: string;
let ultragaz: string;
let nacional: string;
let userId: string;
let contrato: string;

const admin = (): SessionUser => ({ id: userId, name: 'Admin', role: 'ADMIN', unitIds: [], seesAllUnits: true, needsTerms: false });

const INICIO = '2023-09-10';
const FIM = '2024-09-09';

beforeAll(async () => {
  unidade = (await prisma.unit.create({ data: { code: `GC-${sfx}`, name: `Contrato Unidade ${sfx}` } })).id;
  ultragaz = (await prisma.supplier.create({ data: { name: `ULTRAGAZ ${sfx}`, isGas: true } })).id;
  nacional = (await prisma.supplier.create({ data: { name: `NACIONAL ${sfx}`, isGas: true } })).id;
  userId = (await prisma.user.create({ data: { name: 'Admin', email: `gc-${sfx}@t.local`, role: 'ADMIN', passwordHash: 'x' } })).id;
});

beforeEach(async () => {
  await prisma.gasReceipt.deleteMany({ where: { unitId: unidade } });
  await prisma.gasContract.deleteMany({ where: { unitId: unidade } });
  contrato = (await prisma.gasContract.create({
    data: { unitId: unidade, supplierId: ultragaz, startDate: INICIO, endDate: FIM, quantityKg: 39600, pricePerKg: 5.03 },
  })).id;
});

afterAll(async () => {
  await prisma.gasReceipt.deleteMany({ where: { unitId: unidade } });
  await prisma.gasContract.deleteMany({ where: { unitId: unidade } });
  await prisma.unit.delete({ where: { id: unidade } }).catch(() => {});
  await prisma.supplier.deleteMany({ where: { id: { in: [ultragaz, nacional] } } });
  await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  await prisma.$disconnect();
});

const nota = (data: string, kg: number, supplierId: string | null = ultragaz, extra: Record<string, unknown> = {}) =>
  prisma.gasReceipt.create({
    data: { unitId: unidade, supplierId, operationalDate: data, quantityKg: kg, totalValue: kg * 5.03, pricePerKg: 5.03, ...extra },
  });

const meu = async () => (await listGasContracts(admin())).find((c) => c.id === contrato)!;

describe('O caso relatado: a nota que sumiu', () => {
  it('soma o que está dentro e NOMEIA os 429 kg que ficaram de fora', async () => {
    await nota('2023-09-25', 600);
    await nota('2023-10-06', 410);
    /* A nota do print: 429 kg em 08/09/2023, dois dias ANTES do início. */
    await nota('2023-09-08', 429);

    const c = await meu();
    expect(c.purchasedKg).toBe(1010);
    expect(c.foraDoContratoKg).toBe(429);
    expect(c.foraDoContrato).toHaveLength(1);
    expect(c.foraDoContrato[0].date).toBe('2023-09-08');
    expect(c.foraDoContrato[0].motivo).toBe('FORA_DO_PERIODO');
  });

  it('"Data corrigida" NÃO é o motivo — nota editada dentro do período conta', async () => {
    /* O Pedro apontou isso e estava certo: o cálculo nunca olhou `dateEdited`.
       Outras notas com o mesmo aviso entraram normalmente. */
    await nota('2023-10-06', 300, ultragaz, { dateEdited: true, dateEditedByName: 'Daniel Soares' });
    const c = await meu();
    expect(c.purchasedKg).toBe(300);
    expect(c.foraDoContrato).toHaveLength(0);
  });

  it('e uma nota editada para FORA do período aparece no aviso, não some', async () => {
    /* Este é o encontro dos dois: corrigir a data pode mover a nota para fora
       da janela, e antes ninguém era avisado. */
    await nota('2023-09-08', 429, ultragaz, { dateEdited: true, dateEditedByName: 'Daniel Soares' });
    const c = await meu();
    expect(c.purchasedKg).toBe(0);
    expect(c.foraDoContratoKg).toBe(429);
  });
});

describe('Os três motivos de exclusão', () => {
  it('fora do período — antes e depois', async () => {
    await nota('2023-09-09', 100);
    await nota('2024-09-10', 200);
    const c = await meu();
    expect(c.purchasedKg).toBe(0);
    expect(c.foraDoContrato.map((f) => f.motivo)).toEqual(['FORA_DO_PERIODO', 'FORA_DO_PERIODO']);
  });

  it('outro fornecedor, dentro do período', async () => {
    await nota('2023-10-01', 150, nacional);
    const c = await meu();
    expect(c.purchasedKg).toBe(0);
    expect(c.foraDoContrato[0].motivo).toBe('OUTRO_FORNECEDOR');
    expect(c.foraDoContrato[0].supplierName).toContain('NACIONAL');
  });

  it('sem fornecedor é caso À PARTE — o conserto é preencher, não discutir', async () => {
    await nota('2023-10-01', 120, null);
    const c = await meu();
    expect(c.foraDoContrato[0].motivo).toBe('SEM_FORNECEDOR');
    expect(c.foraDoContrato[0].supplierName).toBe('Sem fornecedor');
  });

  it('fora do período E de outro fornecedor NÃO entra no aviso', async () => {
    /* Ela não diz nada sobre este contrato; listá-la encheria a tela de ruído.
       Só aparece o que QUASE entrou. */
    await nota('2020-01-01', 999, nacional);
    const c = await meu();
    expect(c.foraDoContrato).toHaveLength(0);
  });
});

describe('As bordas da janela são inclusivas', () => {
  it('o primeiro e o último dia do contrato contam', async () => {
    await nota(INICIO, 10);
    await nota(FIM, 20);
    const c = await meu();
    expect(c.purchasedKg).toBe(30);
    expect(c.foraDoContrato).toHaveLength(0);
  });
});

describe('O contrato limpo não mostra aviso nenhum', () => {
  it('sem sobras, nada é exibido', async () => {
    await nota('2023-10-01', 500);
    const c = await meu();
    expect(c.foraDoContrato).toEqual([]);
    expect(c.foraDoContratoKg).toBe(0);
  });
});

describe('A conta do progresso continua a mesma', () => {
  it('usado = posição inicial + comprado no período', async () => {
    await prisma.gasContract.update({ where: { id: contrato }, data: { initialUsedKg: 1000 } });
    await nota('2023-10-01', 500);
    const c = await meu();
    expect(c.usedKg).toBe(1500);
    expect(c.remainingKg).toBe(38100);
    expect(c.progressPct).toBe(4);
  });
});
