import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { upsertProduct } from '@/lib/products';
import { criarPedido } from '@/lib/products/pedido';
import type { SessionUser } from '@/lib/auth/session';

/**
 * O setor do CD é o campo que divide o pedido entre as áreas do Centro de
 * Distribuição. Produto do CD sem setor cai em "Sem setor cadastrado" e NENHUM
 * separador o enxerga — some da fila de todo mundo sem avisar ninguém. Por isso
 * virou obrigatório, e por isso estes casos existem.
 */

const sfx = process.pid.toString(36);
let adminId: string;
let unitId: string;
let setorId: string;
let setorInativoId: string;

const admin = (): SessionUser => ({ id: adminId, name: 'A', role: 'ADMIN', unitIds: [], seesAllUnits: true, needsTerms: false });
const gerente = (): SessionUser => ({ id: adminId, name: 'G', role: 'MANAGER', unitIds: [unitId], seesAllUnits: false, needsTerms: false });

beforeAll(async () => {
  adminId = (await prisma.user.create({ data: { name: `A ${sfx}`, email: `pset-${sfx}@e.com`, role: 'ADMIN', passwordHash: 'x' } })).id;
  unitId = (await prisma.unit.create({ data: { code: `PSET-${sfx}`, name: 'U Pedidos', timezone: 'America/Sao_Paulo', cutoffHour: 4 } })).id;
  setorId = (await prisma.cdSector.create({ data: { name: `Secos ${sfx}` } })).id;
  setorInativoId = (await prisma.cdSector.create({ data: { name: `Fechado ${sfx}`, active: false } })).id;
});

afterAll(async () => {
  await prisma.productRequest.deleteMany({ where: { unitId } });
  await prisma.product.deleteMany({ where: { name: { contains: sfx } } });
  await prisma.cdSector.deleteMany({ where: { name: { contains: sfx } } });
  await prisma.unit.deleteMany({ where: { id: unitId } });
  await prisma.user.deleteMany({ where: { id: adminId } });
});

describe('setor é obrigatório para produto do CD', () => {
  it('produto do CD SEM setor é recusado', async () => {
    const r = await upsertProduct(admin(), { name: `Arroz ${sfx}`, origin: 'CD', category: 'Secos' });
    expect(r).toEqual({ ok: false, reason: 'SEM_SETOR' });
  });

  it('setor desativado não serve', async () => {
    const r = await upsertProduct(admin(), { name: `Feijao ${sfx}`, origin: 'CD', cdSectorId: setorInativoId });
    expect(r).toEqual({ ok: false, reason: 'SEM_SETOR' });
  });

  it('setor inexistente não serve', async () => {
    const r = await upsertProduct(admin(), { name: `Macarrao ${sfx}`, origin: 'CD', cdSectorId: 'nao-existe' });
    expect(r).toEqual({ ok: false, reason: 'SEM_SETOR' });
  });

  it('com setor válido, o produto é criado e fica vinculado', async () => {
    expect(await upsertProduct(admin(), { name: `Acucar ${sfx}`, origin: 'CD', category: 'Secos', cdSectorId: setorId })).toEqual({ ok: true });
    const p = await prisma.product.findFirst({ where: { name: `Acucar ${sfx}` }, select: { cdSectorId: true } });
    expect(p?.cdSectorId).toBe(setorId);
  });

  it('produto da Fábrica NÃO guarda setor, mesmo se mandarem um', async () => {
    expect(await upsertProduct(admin(), { name: `Pao ${sfx}`, origin: 'FABRICA', cdSectorId: setorId })).toEqual({ ok: true });
    const p = await prisma.product.findFirst({ where: { name: `Pao ${sfx}` }, select: { cdSectorId: true } });
    expect(p?.cdSectorId).toBeNull();
  });

  it('atribuir o setor a um produto do CD que já existia (o mutirão do catálogo)', async () => {
    /* Os 1.184 produtos do CD nasceram sem setor: o caminho de conserto é
       EDITAR, nunca recriar — recriar duplicaria catálogo e perderia histórico. */
    const antigo = await prisma.product.create({ data: { name: `Legado ${sfx}`, origin: 'CD', category: 'Secos', measure: 'un' } });
    expect(antigo.cdSectorId).toBeNull();
    expect(await upsertProduct(admin(), { id: antigo.id, name: antigo.name, origin: 'CD', category: antigo.category, measure: antigo.measure, cdSectorId: setorId })).toEqual({ ok: true });
    const depois = await prisma.product.findUnique({ where: { id: antigo.id }, select: { cdSectorId: true } });
    expect(depois?.cdSectorId).toBe(setorId);
  });

  it('trocar a origem de CD para Fábrica limpa o setor', async () => {
    const p = await prisma.product.findFirst({ where: { name: `Acucar ${sfx}` }, select: { id: true } });
    expect(await upsertProduct(admin(), { id: p!.id, name: `Acucar ${sfx}`, origin: 'FABRICA' })).toEqual({ ok: true });
    const depois = await prisma.product.findUnique({ where: { id: p!.id }, select: { cdSectorId: true } });
    expect(depois?.cdSectorId).toBeNull();
  });

  it('quem não cuida do catálogo não mexe', async () => {
    const r = await upsertProduct(gerente(), { name: `Proibido ${sfx}`, origin: 'CD', cdSectorId: setorId });
    expect(r).toEqual({ ok: false, reason: 'FORBIDDEN' });
  });
});

describe('o setor chega ao item do pedido', () => {
  it('o pedido carimba o setor em cada item do CD — é o que direciona a separação', async () => {
    const comSetor = await prisma.product.findFirst({ where: { name: `Legado ${sfx}` }, select: { id: true } });
    const daFabrica = await prisma.product.findFirst({ where: { name: `Pao ${sfx}` }, select: { id: true } });

    const r = await criarPedido(gerente(), {
      unitId,
      items: [
        { productId: comSetor!.id, qty: 3 },
        { productId: daFabrica!.id, qty: 2 },
      ],
    });
    expect(r.ok).toBe(true);

    const itens = await prisma.productRequestItem.findMany({
      where: { request: { unitId } },
      select: { cdSectorId: true, cdSectorName: true, qtyRequested: true },
    });
    const doCd = itens.filter((i) => i.cdSectorId);
    expect(doCd).toHaveLength(1);
    expect(doCd[0].cdSectorId).toBe(setorId);
    expect(doCd[0].cdSectorName).toContain('Secos');
  });
});

describe('a divisão por DESTINO (Fábrica × CD)', () => {
  /* O gerente monta UM carrinho e não escolhe destino: o produto já sabe de
     onde vem. Antes, o pedido inteiro herdava a origem do PRIMEIRO produto —
     um carrinho misto virava um pedido só, carimbado com uma origem e enviado
     pela esteira da outra. Cada lado via item que não era dele. */
  const doCd = () => prisma.product.findFirst({ where: { name: `Legado ${sfx}` }, select: { id: true } });
  const daFabrica = () => prisma.product.findFirst({ where: { name: `Pao ${sfx}` }, select: { id: true } });

  it('carrinho misto vira DOIS pedidos, um por destino', async () => {
    const [cd, fab] = await Promise.all([doCd(), daFabrica()]);
    const r = await criarPedido(gerente(), {
      unitId,
      items: [{ productId: cd!.id, qty: 3 }, { productId: fab!.id, qty: 2 }],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    expect(r.pedidos).toHaveLength(2);
    expect(r.pedidos.map((p) => p.origin).sort()).toEqual(['CD', 'FABRICA']);

    /* Cada pedido leva SÓ os itens da sua origem — é isso que faz a aba
       Fábrica/CD e a fila do separador mostrarem coisas diferentes. */
    for (const p of r.pedidos) {
      const itens = await prisma.productRequestItem.findMany({ where: { requestId: p.id }, select: { productId: true } });
      expect(itens).toHaveLength(1);
      expect(itens[0].productId).toBe(p.origin === 'CD' ? cd!.id : fab!.id);
    }
  });

  it('cada pedido nasce no status da SUA esteira', async () => {
    /* A Fábrica não passa pela separação por setor do CD: nascer `ENVIADO_CD`
       a colocaria numa fila que não é dela. */
    const [cd, fab] = await Promise.all([doCd(), daFabrica()]);
    const r = await criarPedido(gerente(), {
      unitId,
      items: [{ productId: fab!.id, qty: 1 }, { productId: cd!.id, qty: 1 }],
    });
    if (!r.ok) throw new Error('não criou');

    const status = Object.fromEntries(
      await Promise.all(r.pedidos.map(async (p) => [
        p.origin,
        (await prisma.productRequest.findUnique({ where: { id: p.id }, select: { status: true } }))!.status,
      ])),
    );
    expect(status.FABRICA).toBe('NEW');
    expect(status.CD).toBe('ENVIADO_CD');
  });

  it('os dois pedidos ganham números próprios e sequenciais na unidade', async () => {
    const [cd, fab] = await Promise.all([doCd(), daFabrica()]);
    const r = await criarPedido(gerente(), {
      unitId,
      items: [{ productId: cd!.id, qty: 1 }, { productId: fab!.id, qty: 1 }],
    });
    if (!r.ok) throw new Error('não criou');
    const numeros = r.pedidos.map((p) => p.number).sort((a, b) => a - b);
    expect(numeros[1]).toBe(numeros[0] + 1);
  });

  it('o setor continua carimbado dentro do pedido do CD', async () => {
    /* A divisão por destino é a de FORA; a divisão por setor, a de DENTRO.
       Uma não pode ter comido a outra. */
    const [cd, fab] = await Promise.all([doCd(), daFabrica()]);
    const r = await criarPedido(gerente(), {
      unitId,
      items: [{ productId: cd!.id, qty: 4 }, { productId: fab!.id, qty: 1 }],
    });
    if (!r.ok) throw new Error('não criou');
    const pedidoCd = r.pedidos.find((p) => p.origin === 'CD')!;
    const itens = await prisma.productRequestItem.findMany({ where: { requestId: pedidoCd.id }, select: { cdSectorId: true } });
    expect(itens.map((i) => i.cdSectorId)).toEqual([setorId]);
  });

  it('carrinho de UM destino só continua gerando UM pedido', async () => {
    const fab = await daFabrica();
    const r = await criarPedido(gerente(), { unitId, items: [{ productId: fab!.id, qty: 7 }] });
    if (!r.ok) throw new Error('não criou');
    expect(r.pedidos).toHaveLength(1);
    expect(r.pedidos[0].origin).toBe('FABRICA');
  });
});
