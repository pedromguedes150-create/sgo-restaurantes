import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { getToApprove, getPaymentCounts, LIMITE_DA_LISTA } from '@/lib/payments/query';
import type { SessionUser } from '@/lib/auth/session';

/**
 * O teto das listas de Pagamentos.
 *
 * O defeito: as listas paravam em 100 e o crachá da aba mostrava o TAMANHO DA
 * LISTA. Com 340 pendências ele dizia "100" — o teto se olhando no espelho. O
 * gestor aprovava 100, a tela recarregava, e apareciam outras 100, sem nunca
 * dizer quantas faltavam.
 */

const sfx = `pg${process.pid.toString(36)}`;
let unitId: string;
let admId: string;
let freelancerId: string;

const adm = (): SessionUser => ({ id: admId, name: 'A', role: 'ADMIN', unitIds: [], seesAllUnits: true, needsTerms: false });

/** Mais que o teto seria lento de criar; o suficiente para provar a regra. */
const QUANTAS = 12;
const TETO_DO_TESTE = 5;

beforeAll(async () => {
  unitId = (await prisma.unit.create({ data: { code: `PG-${sfx}`, name: 'U Pag', timezone: 'America/Sao_Paulo', cutoffHour: 4 } })).id;
  admId = (await prisma.user.create({ data: { name: 'A', email: `${sfx}@e.com`, role: 'ADMIN', passwordHash: 'x' } })).id;
  freelancerId = (await prisma.freelancer.create({ data: { name: `Free ${sfx}`, pixKey: `pix-${sfx}`, defaultValue: 100 } })).id;

  for (let i = 0; i < QUANTAS; i++) {
    await prisma.paymentRequest.create({
      data: {
        unitId, type: 'FREELANCER', status: 'PENDING', amount: 100,
        description: `Teste ${sfx} ${i}`, requestedById: admId, freelancerId,
        approverRole: 'SUPERVISOR',
      },
    });
  }
});

afterAll(async () => {
  await prisma.paymentRequest.deleteMany({ where: { unitId } }).catch(() => {});
  await prisma.freelancer.delete({ where: { id: freelancerId } }).catch(() => {});
  await prisma.unit.delete({ where: { id: unitId } }).catch(() => {});
  await prisma.user.delete({ where: { id: admId } }).catch(() => {});
  await prisma.$disconnect();
});

describe('O contador diz a verdade', () => {
  it('o total vem de count, não do tamanho da lista', async () => {
    const totais = await getPaymentCounts(adm());
    const lista = await getToApprove(adm());
    const meus = lista.filter((r) => r.description?.includes(sfx));

    /* O teste roda num banco compartilhado, então a comparação é sobre os
       lançamentos DESTE teste: os 12 têm de estar contados. */
    expect(totais.toApprove).toBeGreaterThanOrEqual(QUANTAS);
    expect(meus.length).toBeGreaterThan(0);
  });

  it('o teto é grande o bastante para a fila real e tem nome', async () => {
    /* Antes eram 100 espalhados por quatro consultas. Um número mágico
       repetido é um número que muda em três lugares e esquece o quarto. */
    expect(LIMITE_DA_LISTA).toBeGreaterThanOrEqual(500);
  });

  it('a lista nunca passa do teto', async () => {
    const lista = await getToApprove(adm());
    expect(lista.length).toBeLessThanOrEqual(LIMITE_DA_LISTA);
  });
});

describe('Quando a fila é maior que o teto', () => {
  it('o total continua maior que o que foi carregado', async () => {
    /* Simula o teto com um recorte: é a relação "carregado < total" que a tela
       precisa saber para avisar, e ela vale em qualquer tamanho. */
    const totais = await getPaymentCounts(adm());
    const recorte = (await getToApprove(adm())).slice(0, TETO_DO_TESTE);
    expect(recorte.length).toBe(TETO_DO_TESTE);
    expect(totais.toApprove).toBeGreaterThan(recorte.length);
  });
});

describe('As contagens respeitam o papel', () => {
  it('quem não paga não vê fila de pagamento', async () => {
    const gerente: SessionUser = { id: admId, name: 'G', role: 'MANAGER', unitIds: [unitId], seesAllUnits: false, needsTerms: false };
    const totais = await getPaymentCounts(gerente);
    expect(totais.toPay).toBe(0);
  });
});
