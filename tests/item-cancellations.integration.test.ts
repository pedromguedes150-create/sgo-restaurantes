import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { registerItemCancellation, getItemCancelSummary, getItemReasons, MOTIVOS_PADRAO_ITEM } from '@/lib/cancellations/items';
import type { SessionUser } from '@/lib/auth/session';

/**
 * Cancelamento de ITEM no pedido em aberto (antes de virar cupom).
 *
 * O furo: o garçom lança, o cliente desiste, o item sai da comanda. Se o
 * produto JÁ TINHA SAÍDO da cozinha, alguém consumiu e nada foi pago — por isso
 * `delivered` é o campo que separa desistência de perda, e por isso a foto só é
 * cobrada nesse caso.
 */

const sfx = `ic${process.pid.toString(36)}`;
let unitId: string;
let outraId: string;
let mgrId: string;
let reasonId: string;

const mgr = (): SessionUser => ({ id: mgrId, name: 'Ger', role: 'MANAGER', unitIds: [unitId], seesAllUnits: false, needsTerms: false });
const mes = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date()).slice(0, 7);

beforeAll(async () => {
  const u = await prisma.unit.create({ data: { code: `IC-${sfx}`, name: 'U Itens', timezone: 'America/Sao_Paulo', cutoffHour: 4 } });
  unitId = u.id;
  const o = await prisma.unit.create({ data: { code: `IC2-${sfx}`, name: 'Outra', timezone: 'America/Sao_Paulo', cutoffHour: 4 } });
  outraId = o.id;
  mgrId = (await prisma.user.create({ data: { name: 'Ger', email: `${sfx}@e.com`, role: 'MANAGER', passwordHash: 'x' } })).id;
  await prisma.unitMembership.create({ data: { userId: mgrId, unitId } });
  /* A semente ANTES do motivo do teste: `ensureDefaultItemReasons` só planta
     com a tabela vazia (senão um motivo que o Admin apagou voltaria sozinho), e
     criar o motivo do teste primeiro impediria a semente de rodar. */
  await getItemReasons();
  reasonId = (await prisma.itemCancellationReason.create({ data: { name: `Erro de lançamento ${sfx}`, order: 99 } })).id;
});

afterAll(async () => {
  await prisma.itemCancellation.deleteMany({ where: { unitId: { in: [unitId, outraId] } } }).catch(() => {});
  await prisma.itemCancellationReason.delete({ where: { id: reasonId } }).catch(() => {});
  await prisma.unitMembership.deleteMany({ where: { unitId } }).catch(() => {});
  await prisma.unit.deleteMany({ where: { id: { in: [unitId, outraId] } } }).catch(() => {});
  await prisma.user.delete({ where: { id: mgrId } }).catch(() => {});
  await prisma.$disconnect();
});

const base = () => ({ unitId, productName: 'Coca-Cola lata', quantity: 1, value: 8, delivered: false });

describe('A foto é cobrada só quando o produto saiu', () => {
  it('não saiu da cozinha: passa sem foto', async () => {
    /* Exigir foto de uma desistência que nunca virou produto seria burocracia
       sem prova nenhuma — e burocracia inútil faz o gerente parar de registrar. */
    const r = await registerItemCancellation(mgr(), { ...base(), reasonId, waiterName: 'João' });
    expect(r.ok).toBe(true);
  });

  it('já tinha saído e SEM foto: recusado', async () => {
    const r = await registerItemCancellation(mgr(), { ...base(), delivered: true, value: 12 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('PHOTO_REQUIRED');
  });

  it('já tinha saído e COM foto: registra e fica marcado como entregue', async () => {
    const r = await registerItemCancellation(mgr(), {
      ...base(), productName: 'Picanha', delivered: true, value: 90, photoPath: 'uploads/u/i1.jpg', waiterName: 'João',
    });
    expect(r.ok).toBe(true);
    const row = await prisma.itemCancellation.findFirst({ where: { unitId, productName: 'Picanha' } });
    expect(row!.delivered).toBe(true);
    expect(row!.photoPath).toBe('uploads/u/i1.jpg');
    expect(row!.authorizedById).toBe(mgrId);
  });
});

describe('Validações', () => {
  it('produto vazio é recusado', async () => {
    const r = await registerItemCancellation(mgr(), { ...base(), productName: '   ' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('INVALID');
  });

  it('quantidade zero é recusada', async () => {
    const r = await registerItemCancellation(mgr(), { ...base(), quantity: 0 });
    expect(r.ok).toBe(false);
  });

  it('unidade de outro gerente é recusada', async () => {
    const r = await registerItemCancellation(mgr(), { ...base(), unitId: outraId });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('FORBIDDEN');
  });

  it('hora no futuro é recusada', async () => {
    const amanha = new Date(Date.now() + 86400000).toISOString();
    const r = await registerItemCancellation(mgr(), { ...base(), canceledAt: amanha });
    expect(r.ok).toBe(false);
  });
});

describe('Os números do mês', () => {
  it('separa o que já tinha saído do que não saiu', async () => {
    /* Somar os dois num total só esconderia a parte que dói: cancelar antes de
       o produto sair custa zero. */
    const s = await getItemCancelSummary(mgr(), mes(), unitId);
    expect(s.total).toBe(2); // a Coca (não saiu) e a Picanha (saiu)
    expect(s.value).toBe(98);
    expect(s.deliveredCount).toBe(1);
    expect(s.deliveredValue).toBe(90);
  });

  it('agrupa por garçom, do maior valor para o menor', async () => {
    await registerItemCancellation(mgr(), { ...base(), productName: 'Água', value: 5, waiterName: 'Maria' });
    const s = await getItemCancelSummary(mgr(), mes(), unitId);
    expect(s.byWaiter[0].name).toBe('João');
    expect(s.byWaiter[0].count).toBe(2);
    expect(s.byWaiter.find((w) => w.name === 'Maria')?.value).toBe(5);
  });

  it('sem garçom informado, não some do painel', async () => {
    await registerItemCancellation(mgr(), { ...base(), productName: 'Suco', value: 7 });
    const s = await getItemCancelSummary(mgr(), mes(), unitId);
    expect(s.byWaiter.some((w) => w.name === 'não informado')).toBe(true);
  });
});

describe('Motivos padrão', () => {
  it('a lista NÃO oferece "cliente mudou de ideia"', async () => {
    /* Para isso existe a TROCA no Teknisa, que mantém a venda. Oferecer esse
       motivo aqui ensinaria a cancelar onde bastava trocar. */
    const texto = MOTIVOS_PADRAO_ITEM.join(' | ').toLowerCase();
    expect(texto).not.toContain('mudou de ideia');
    expect(texto).not.toContain('trocou');
  });

  it('os motivos padrão nascem sozinhos', async () => {
    const lista = await getItemReasons();
    expect(lista.length).toBeGreaterThanOrEqual(MOTIVOS_PADRAO_ITEM.length);
  });
});
