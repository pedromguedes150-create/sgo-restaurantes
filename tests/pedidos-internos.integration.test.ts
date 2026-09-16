import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { criarPedido, getPedido, listarPedidosDaUnidade, listarParaSeparacao } from '@/lib/products/pedido';
import type { SessionUser } from '@/lib/auth/session';

/**
 * PEDIDOS INTERNOS — a base.
 *
 * O que muda de estrutural: **o item virou linha**. Com os itens dentro de um
 * campo JSON único, quatro setores mexendo no mesmo pedido ao mesmo tempo
 * sobrescreviam o trabalho uns dos outros — em silêncio, sem erro nenhum.
 *
 * Os casos abaixo cercam, nesta ordem: a divisão automática por setor (o
 * gerente faz UM pedido e não escolhe setor), o produto com cadastro incompleto
 * (que não pode derrubar o pedido inteiro), e o separador enxergando SÓ o setor
 * dele.
 */

const sfx = `${process.pid.toString(36)}${Date.now().toString(36).slice(-4)}`;
let unitId: string;
let gerenteId: string;
let sepBebidasId: string;
let setorBebidas: string;
let setorSecos: string;
const prod: Record<string, string> = {};

const gerente = (): SessionUser => ({ id: gerenteId, name: 'Gerente', role: 'MANAGER', unitIds: [unitId], seesAllUnits: false, needsTerms: false });
const separadorBebidas = (): SessionUser => ({ id: sepBebidasId, name: 'Carlos', role: 'SEPARATOR', unitIds: [], seesAllUnits: false, needsTerms: false });

beforeAll(async () => {
  unitId = (await prisma.unit.create({ data: { code: `PI-${sfx}`, name: 'Unidade Pedidos', timezone: 'America/Sao_Paulo', cutoffHour: 4 } })).id;
  gerenteId = (await prisma.user.create({ data: { name: 'Gerente PI', email: `pi-g-${sfx}@t.local`, role: 'MANAGER', passwordHash: 'x' } })).id;
  await prisma.unitMembership.create({ data: { userId: gerenteId, unitId } });

  setorBebidas = (await prisma.cdSector.create({ data: { name: `Bebidas ${sfx}`, order: 1 } })).id;
  setorSecos = (await prisma.cdSector.create({ data: { name: `Secos ${sfx}`, order: 2 } })).id;

  /* O separador tem UM setor no cadastro. Ele não escolhe ao entrar. */
  sepBebidasId = (await prisma.user.create({
    data: { name: 'Carlos', email: `pi-s-${sfx}@t.local`, role: 'SEPARATOR', passwordHash: 'x', cdSectorId: setorBebidas },
  })).id;

  prod.coca = (await prisma.product.create({ data: { name: 'Coca-Cola 2L', origin: 'CD', category: 'Bebidas', measure: 'fardo', cdSectorId: setorBebidas } })).id;
  prod.suco = (await prisma.product.create({ data: { name: 'Suco de uva', origin: 'CD', category: 'Bebidas', measure: 'caixa', cdSectorId: setorBebidas } })).id;
  prod.arroz = (await prisma.product.create({ data: { name: 'Arroz 5kg', origin: 'CD', category: 'Secos', measure: 'fardo', cdSectorId: setorSecos } })).id;
  /* Produto SEM setor: cadastro incompleto do CD, que acontece. */
  prod.orfao = (await prisma.product.create({ data: { name: 'Produto sem setor', origin: 'CD', category: 'Geral', measure: 'un' } })).id;
});

beforeEach(async () => {
  await prisma.productRequest.deleteMany({ where: { unitId } });
});

afterAll(async () => {
  await prisma.productRequest.deleteMany({ where: { unitId } });
  await prisma.product.deleteMany({ where: { id: { in: Object.values(prod) } } });
  await prisma.user.deleteMany({ where: { id: { in: [gerenteId, sepBebidasId] } } });
  await prisma.cdSector.deleteMany({ where: { id: { in: [setorBebidas, setorSecos] } } });
  await prisma.auditLog.deleteMany({ where: { unitId } });
  await prisma.unit.delete({ where: { id: unitId } }).catch(() => {});
  await prisma.$disconnect();
});

const pedir = (items: { productId: string; qty: number }[], note?: string) =>
  criarPedido(gerente(), { unitId, items, note });

describe('O item virou LINHA', () => {
  it('cada produto do pedido vira um registro próprio', async () => {
    const r = await pedir([{ productId: prod.coca, qty: 5 }, { productId: prod.arroz, qty: 3 }]);
    expect(r.ok).toBe(true);

    const itens = await prisma.productRequestItem.findMany({ where: { request: { unitId } }, orderBy: { name: 'asc' } });
    expect(itens).toHaveLength(2);
    expect(itens.map((i) => `${i.name}=${Number(i.qtyRequested)}`)).toEqual(['Arroz 5kg=3', 'Coca-Cola 2L=5']);
  });

  it('o item guarda o SNAPSHOT do nome — renomear o produto não reescreve o histórico', async () => {
    const r = await pedir([{ productId: prod.coca, qty: 1 }]);
    await prisma.product.update({ where: { id: prod.coca }, data: { name: 'Coca-Cola 2L NOVO NOME' } });

    const p = (await getPedido(gerente(), r.ok ? r.pedidos[0].id : ''))!;
    expect(p.setores[0].itens[0].name).toBe('Coca-Cola 2L');
    await prisma.product.update({ where: { id: prod.coca }, data: { name: 'Coca-Cola 2L' } });
  });

  it('o JSON legado continua sendo gravado — telas antigas ainda o leem', async () => {
    const r = await pedir([{ productId: prod.coca, qty: 5 }]);
    const bruto = await prisma.productRequest.findUnique({ where: { id: r.ok ? r.pedidos[0].id : '' }, select: { items: true } });
    expect(Array.isArray(bruto?.items)).toBe(true);
    expect((bruto?.items as { name: string }[])[0].name).toBe('Coca-Cola 2L');
  });
});

describe('A divisão entre os setores do CD', () => {
  it('o gerente faz UM pedido e o sistema divide sozinho', async () => {
    const r = await pedir([
      { productId: prod.coca, qty: 5 },
      { productId: prod.suco, qty: 2 },
      { productId: prod.arroz, qty: 3 },
    ]);
    const p = (await getPedido(gerente(), r.ok ? r.pedidos[0].id : ''))!;

    const porSetor = Object.fromEntries(p.setores.map((s) => [s.cdSectorName, s.total]));
    expect(porSetor[`Bebidas ${sfx}`]).toBe(2);
    expect(porSetor[`Secos ${sfx}`]).toBe(1);
    expect(p.totalItens).toBe(3);
  });

  it('o setor é CONGELADO no item — mudar o produto de setor depois não move o pedido antigo', async () => {
    const r = await pedir([{ productId: prod.coca, qty: 5 }]);
    await prisma.product.update({ where: { id: prod.coca }, data: { cdSectorId: setorSecos } });

    const p = (await getPedido(gerente(), r.ok ? r.pedidos[0].id : ''))!;
    expect(p.setores[0].cdSectorName).toBe(`Bebidas ${sfx}`);
    await prisma.product.update({ where: { id: prod.coca }, data: { cdSectorId: setorBebidas } });
  });

  it('produto SEM setor não derruba o pedido: entra num balde à parte', async () => {
    /* Recusar o pedido inteiro por um cadastro incompleto do CD puniria a
       unidade por um problema que não é dela. */
    const r = await pedir([{ productId: prod.coca, qty: 1 }, { productId: prod.orfao, qty: 2 }]);
    expect(r.ok).toBe(true);
    expect(r.ok === true && r.semSetor).toBe(1);

    const p = (await getPedido(gerente(), r.ok ? r.pedidos[0].id : ''))!;
    const orfao = p.setores.find((s) => s.cdSectorId === null);
    expect(orfao?.cdSectorName).toBe('Sem setor cadastrado');
    expect(orfao?.total).toBe(1);
  });
});

describe('A situação de cada setor', () => {
  it('nasce AGUARDANDO', async () => {
    const r = await pedir([{ productId: prod.coca, qty: 5 }, { productId: prod.suco, qty: 2 }]);
    const p = (await getPedido(gerente(), r.ok ? r.pedidos[0].id : ''))!;
    expect(p.setores[0].status).toBe('AGUARDANDO');
  });

  it('com parte separada, fica EM SEPARAÇÃO', async () => {
    const r = await pedir([{ productId: prod.coca, qty: 5 }, { productId: prod.suco, qty: 2 }]);
    const p1 = (await getPedido(gerente(), r.ok ? r.pedidos[0].id : ''))!;
    await prisma.productRequestItem.update({ where: { id: p1.setores[0].itens[0].id }, data: { qtySeparated: 5 } });

    const p2 = (await getPedido(gerente(), r.ok ? r.pedidos[0].id : ''))!;
    expect(p2.setores[0].status).toBe('SEPARANDO');
    expect(p2.setores[0].separados).toBe(1);
  });

  it('tudo separado na quantidade pedida = CONCLUÍDO', async () => {
    const r = await pedir([{ productId: prod.coca, qty: 5 }]);
    const p1 = (await getPedido(gerente(), r.ok ? r.pedidos[0].id : ''))!;
    await prisma.productRequestItem.update({ where: { id: p1.setores[0].itens[0].id }, data: { qtySeparated: 5 } });
    expect((await getPedido(gerente(), r.ok ? r.pedidos[0].id : ''))!.setores[0].status).toBe('CONCLUIDO');
  });

  it('separando MENOS do que foi pedido = CONCLUÍDO COM FALTA', async () => {
    /* A falta não impede concluir o setor — mas não pode sumir do rótulo. */
    const r = await pedir([{ productId: prod.coca, qty: 5 }]);
    const p1 = (await getPedido(gerente(), r.ok ? r.pedidos[0].id : ''))!;
    await prisma.productRequestItem.update({
      where: { id: p1.setores[0].itens[0].id },
      data: { qtySeparated: 2, missingReason: 'sem estoque' },
    });
    expect((await getPedido(gerente(), r.ok ? r.pedidos[0].id : ''))!.setores[0].status).toBe('CONCLUIDO_COM_FALTA');
  });
});

describe('O que o SEPARADOR enxerga', () => {
  it('só os itens do setor DELE, sem escolher nada', async () => {
    await pedir([
      { productId: prod.coca, qty: 5 },
      { productId: prod.suco, qty: 2 },
      { productId: prod.arroz, qty: 3 },
    ]);

    const visao = await listarParaSeparacao(separadorBebidas());
    expect(visao.setorNome).toBe(`Bebidas ${sfx}`);
    expect(visao.pedidos).toHaveLength(1);
    /* 2 itens, não 3: o arroz é de outro setor. */
    expect(visao.pedidos[0].total).toBe(2);
  });

  it('pedido SEM item do setor dele não aparece', async () => {
    await pedir([{ productId: prod.arroz, qty: 3 }]);
    expect((await listarParaSeparacao(separadorBebidas())).pedidos).toHaveLength(0);
  });

  it('separador sem setor no cadastro não vê pedido nenhum', async () => {
    await pedir([{ productId: prod.coca, qty: 5 }]);
    const semSetor: SessionUser = { id: 'zzz', name: 'Sem setor', role: 'SEPARATOR', unitIds: [], seesAllUnits: false, needsTerms: false };
    const v = await listarParaSeparacao(semSetor);
    expect(v.setorId).toBeNull();
    expect(v.pedidos).toEqual([]);
  });
});

describe('Escopo e recusas', () => {
  it('pedido vazio é recusado', async () => {
    const r = await pedir([]);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.detalhe).toContain('vazio');
  });

  it('quantidade zero ou negativa não entra', async () => {
    const r = await pedir([{ productId: prod.coca, qty: 0 }, { productId: prod.suco, qty: -1 }]);
    expect(r.ok).toBe(false);
  });

  it('quem não enxerga a unidade não pede nem lê', async () => {
    const forasteiro: SessionUser = { id: 'z', name: 'Outro', role: 'MANAGER', unitIds: ['outra'], seesAllUnits: false, needsTerms: false };
    const r = await criarPedido(forasteiro, { unitId, items: [{ productId: prod.coca, qty: 1 }] });
    expect(r.ok === false && r.reason).toBe('FORBIDDEN');

    const meu = await pedir([{ productId: prod.coca, qty: 1 }]);
    expect(await getPedido(forasteiro, meu.ok ? meu.pedidos[0].id : '')).toBeNull();
    expect(await listarPedidosDaUnidade(forasteiro, unitId)).toEqual([]);
  });
});

describe('O número do pedido', () => {
  it('é sequencial por unidade', async () => {
    const a = await pedir([{ productId: prod.coca, qty: 1 }]);
    const b = await pedir([{ productId: prod.coca, qty: 1 }]);
    expect(b.ok === true && a.ok === true && b.pedidos[0].number).toBe((a.ok === true ? a.pedidos[0].number : 0) + 1);
  });

  it('a lista traz o mais recente primeiro', async () => {
    await pedir([{ productId: prod.coca, qty: 1 }]);
    await pedir([{ productId: prod.arroz, qty: 1 }]);
    const lista = await listarPedidosDaUnidade(gerente(), unitId);
    expect(lista).toHaveLength(2);
    expect(lista[0].number).toBeGreaterThan(lista[1].number);
    expect(lista[0].statusLabel).toBe('Enviado ao CD');
  });
});
