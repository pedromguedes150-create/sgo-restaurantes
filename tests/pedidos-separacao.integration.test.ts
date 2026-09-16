import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { criarPedido, getPedido } from '@/lib/products/pedido';
import { separarItem, desfazerItem, getPedidoParaSeparar } from '@/lib/products/separacao';
import type { SessionUser } from '@/lib/auth/session';
import { numeroDoPedido } from '@/lib/products/numero-do-pedido';

/**
 * A SEPARAÇÃO no CD.
 *
 * Duas promessas desta entrega, e os casos abaixo existem para elas:
 *
 * 1. **Cada item é gravado na hora** — fechar a página, perder o sinal ou
 *    bloquear o celular não pode custar meia hora de trabalho.
 * 2. **Ninguém sobrescreve ninguém em silêncio** — dois separadores do mesmo
 *    setor abrindo o mesmo pedido é rotina, e o segundo gravando por cima faria
 *    o trabalho do primeiro sumir sem erro nenhum.
 */

const sfx = `${process.pid.toString(36)}${Date.now().toString(36).slice(-4)}`;
let unitId: string;
let gerenteId: string;
let carlosId: string;
let mariaId: string;
let setorBebidas: string;
let setorSecos: string;
const prod: Record<string, string> = {};

const gerente = (): SessionUser => ({ id: gerenteId, name: 'Gerente', role: 'MANAGER', unitIds: [unitId], seesAllUnits: false, needsTerms: false });
const carlos = (): SessionUser => ({ id: carlosId, name: 'Carlos', role: 'SEPARATOR', unitIds: [], seesAllUnits: false, needsTerms: false });
const maria = (): SessionUser => ({ id: mariaId, name: 'Maria', role: 'SEPARATOR', unitIds: [], seesAllUnits: false, needsTerms: false });

beforeAll(async () => {
  unitId = (await prisma.unit.create({ data: { code: `SP-${sfx}`, name: 'Unidade Separação', timezone: 'America/Sao_Paulo', cutoffHour: 4 } })).id;
  gerenteId = (await prisma.user.create({ data: { name: 'Gerente SP', email: `sp-g-${sfx}@t.local`, role: 'MANAGER', passwordHash: 'x' } })).id;
  await prisma.unitMembership.create({ data: { userId: gerenteId, unitId } });

  setorBebidas = (await prisma.cdSector.create({ data: { name: `Bebidas ${sfx}` } })).id;
  setorSecos = (await prisma.cdSector.create({ data: { name: `Secos ${sfx}` } })).id;

  /* Carlos e Maria no MESMO setor: é o cenário da sobrescrita. */
  carlosId = (await prisma.user.create({ data: { name: 'Carlos', email: `sp-c-${sfx}@t.local`, role: 'SEPARATOR', passwordHash: 'x', cdSectorId: setorBebidas } })).id;
  mariaId = (await prisma.user.create({ data: { name: 'Maria', email: `sp-m-${sfx}@t.local`, role: 'SEPARATOR', passwordHash: 'x', cdSectorId: setorBebidas } })).id;

  prod.coca = (await prisma.product.create({ data: { name: 'Coca-Cola 2L', origin: 'CD', category: 'Bebidas', measure: 'fardo', cdSectorId: setorBebidas } })).id;
  prod.suco = (await prisma.product.create({ data: { name: 'Suco de uva', origin: 'CD', category: 'Bebidas', measure: 'caixa', cdSectorId: setorBebidas } })).id;
  prod.arroz = (await prisma.product.create({ data: { name: 'Arroz 5kg', origin: 'CD', category: 'Secos', measure: 'fardo', cdSectorId: setorSecos } })).id;
});

beforeEach(async () => {
  await prisma.productRequest.deleteMany({ where: { unitId } });
  await prisma.notification.deleteMany({ where: { userId: { in: [gerenteId, carlosId, mariaId] } } });
});

afterAll(async () => {
  await prisma.productRequest.deleteMany({ where: { unitId } });
  await prisma.product.deleteMany({ where: { id: { in: Object.values(prod) } } });
  await prisma.user.deleteMany({ where: { id: { in: [gerenteId, carlosId, mariaId] } } });
  await prisma.cdSector.deleteMany({ where: { id: { in: [setorBebidas, setorSecos] } } });
  await prisma.notification.deleteMany({ where: { userId: { in: [gerenteId, carlosId, mariaId] } } });
  await prisma.auditLog.deleteMany({ where: { unitId } });
  await prisma.unit.delete({ where: { id: unitId } }).catch(() => {});
  await prisma.$disconnect();
});

/** Um pedido com 2 itens de Bebidas e 1 de Secos. */
async function pedidoPadrao() {
  const r = await criarPedido(gerente(), {
    unitId,
    items: [{ productId: prod.coca, qty: 5 }, { productId: prod.suco, qty: 2 }, { productId: prod.arroz, qty: 3 }],
  });
  if (!r.ok) throw new Error('não criou');
  return r.id;
}

const itensDoCarlos = async (id: string) => (await getPedidoParaSeparar(carlos(), id))!.itens;
const statusDoPedido = async (id: string) =>
  (await prisma.productRequest.findUnique({ where: { id }, select: { status: true } }))!.status;

describe('O separador vê só o setor dele', () => {
  it('2 itens de Bebidas, e não os 3 do pedido', async () => {
    const id = await pedidoPadrao();
    const p = (await getPedidoParaSeparar(carlos(), id))!;
    expect(p.total).toBe(2);
    expect(p.itens.map((i) => i.name).sort()).toEqual(['Coca-Cola 2L', 'Suco de uva']);
    expect(p.setorNome).toBe(`Bebidas ${sfx}`);
  });

  it('não consegue separar item de outro setor', async () => {
    const id = await pedidoPadrao();
    const todos = (await getPedido(gerente(), id))!;
    const arroz = todos.setores.flatMap((s) => s.itens).find((i) => i.name === 'Arroz 5kg')!;

    const r = await separarItem(carlos(), { itemId: arroz.id, qty: 3 });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toBe('FORBIDDEN');
  });
});

describe('Cada item é gravado na hora', () => {
  it('separar um item já fica no banco — sem "salvar" no fim', async () => {
    const id = await pedidoPadrao();
    const [coca] = await itensDoCarlos(id);
    expect((await separarItem(carlos(), { itemId: coca.id, qty: 5 })).ok).toBe(true);

    /* Lido de novo do banco: é o que prova que fechar a página não perde nada. */
    const depois = (await itensDoCarlos(id)).find((i) => i.id === coca.id)!;
    expect(depois.qtySeparated).toBe(5);
    expect(depois.separadoPor).toBe('Carlos');
    expect(depois.separadoEm).toBeInstanceOf(Date);
  });

  it('o progresso do setor acompanha item a item', async () => {
    const id = await pedidoPadrao();
    const itens = await itensDoCarlos(id);
    await separarItem(carlos(), { itemId: itens[0].id, qty: itens[0].qtyRequested });

    const p = (await getPedidoParaSeparar(carlos(), id))!;
    expect(p.separados).toBe(1);
    expect(p.total).toBe(2);
  });

  it('desfazer volta o item para "não separado"', async () => {
    const id = await pedidoPadrao();
    const [coca] = await itensDoCarlos(id);
    await separarItem(carlos(), { itemId: coca.id, qty: 5 });
    expect((await desfazerItem(carlos(), coca.id)).ok).toBe(true);

    const depois = (await itensDoCarlos(id)).find((i) => i.id === coca.id)!;
    expect(depois.qtySeparated).toBeNull();
    expect(depois.separadoPor).toBeNull();
  });
});

describe('Falta e separação parcial', () => {
  it('separar MENOS registra o que faltou e o motivo', async () => {
    const id = await pedidoPadrao();
    const coca = (await itensDoCarlos(id)).find((i) => i.name === 'Coca-Cola 2L')!;

    const r = await separarItem(carlos(), { itemId: coca.id, qty: 2, missingReason: 'SEM_ESTOQUE' });
    expect(r.ok).toBe(true);

    const depois = (await itensDoCarlos(id)).find((i) => i.id === coca.id)!;
    expect(depois.qtySeparated).toBe(2);
    expect(depois.faltando).toBe(3);
    expect(depois.missingLabel).toBe('Sem estoque');
  });

  it('separar menos SEM motivo é recusado', async () => {
    const id = await pedidoPadrao();
    const [coca] = await itensDoCarlos(id);
    const r = await separarItem(carlos(), { itemId: coca.id, qty: 2 });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason !== 'CONFLITO' && r.detalhe).toContain('motivo');
  });

  it('zero com motivo é o item que não saiu', async () => {
    const id = await pedidoPadrao();
    const [coca] = await itensDoCarlos(id);
    expect((await separarItem(carlos(), { itemId: coca.id, qty: 0, missingReason: 'SEM_ESTOQUE' })).ok).toBe(true);
    const depois = (await itensDoCarlos(id)).find((i) => i.id === coca.id)!;
    expect(depois.qtySeparated).toBe(0);
    expect(depois.faltando).toBe(depois.qtyRequested);
  });

  it('separar MAIS do que foi pedido é recusado, dizendo o quanto era', async () => {
    const id = await pedidoPadrao();
    const coca = (await itensDoCarlos(id)).find((i) => i.name === 'Coca-Cola 2L')!;
    const r = await separarItem(carlos(), { itemId: coca.id, qty: 9 });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason !== 'CONFLITO' && r.detalhe).toContain('5');
  });

  it('a falta NÃO impede o setor de concluir', async () => {
    const id = await pedidoPadrao();
    const itens = await itensDoCarlos(id);
    await separarItem(carlos(), { itemId: itens[0].id, qty: 0, missingReason: 'SEM_ESTOQUE' });
    await separarItem(carlos(), { itemId: itens[1].id, qty: itens[1].qtyRequested });

    const p = (await getPedidoParaSeparar(carlos(), id))!;
    expect(p.separados).toBe(p.total);

    const visaoDoGerente = (await getPedido(gerente(), id))!;
    const bebidas = visaoDoGerente.setores.find((s) => s.cdSectorName === `Bebidas ${sfx}`)!;
    expect(bebidas.status).toBe('CONCLUIDO_COM_FALTA');
  });
});

describe('Ninguém sobrescreve ninguém em silêncio', () => {
  it('a segunda gravação PARA e diz quem já mexeu', async () => {
    const id = await pedidoPadrao();
    const [coca] = await itensDoCarlos(id);
    await separarItem(carlos(), { itemId: coca.id, qty: 5 });

    const r = await separarItem(maria(), { itemId: coca.id, qty: 2, missingReason: 'SEM_ESTOQUE' });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toBe('CONFLITO');
    expect(r.ok === false && r.reason === 'CONFLITO' && r.porQuem).toBe('Carlos');
    expect(r.ok === false && r.reason === 'CONFLITO' && r.quantidade).toBe(5);

    /* E o que o Carlos separou continua lá, intacto. */
    const depois = (await itensDoCarlos(id)).find((i) => i.id === coca.id)!;
    expect(depois.qtySeparated).toBe(5);
  });

  it('com a decisão tomada na tela, a sobrescrita passa', async () => {
    const id = await pedidoPadrao();
    const [coca] = await itensDoCarlos(id);
    await separarItem(carlos(), { itemId: coca.id, qty: 5 });

    const r = await separarItem(maria(), { itemId: coca.id, qty: 2, missingReason: 'SEM_ESTOQUE', sobrescrever: true });
    expect(r.ok).toBe(true);

    const depois = (await itensDoCarlos(id)).find((i) => i.id === coca.id)!;
    expect(depois.qtySeparated).toBe(2);
    expect(depois.separadoPor).toBe('Maria');
  });

  it('corrigir o PRÓPRIO lançamento não pede confirmação', async () => {
    const id = await pedidoPadrao();
    const [coca] = await itensDoCarlos(id);
    await separarItem(carlos(), { itemId: coca.id, qty: 5 });
    expect((await separarItem(carlos(), { itemId: coca.id, qty: 4, missingReason: 'AVARIADO' })).ok).toBe(true);
  });
});

describe('O status do pedido segue os itens', () => {
  it('nasce ENVIADO_CD e vira SEPARANDO no primeiro item', async () => {
    const id = await pedidoPadrao();
    expect(await statusDoPedido(id)).toBe('ENVIADO_CD');

    const [coca] = await itensDoCarlos(id);
    await separarItem(carlos(), { itemId: coca.id, qty: 5 });
    expect(await statusDoPedido(id)).toBe('SEPARANDO');
  });

  it('só fica PRONTO PARA ENVIO quando TODOS os setores terminam', async () => {
    const id = await pedidoPadrao();
    for (const i of await itensDoCarlos(id)) await separarItem(carlos(), { itemId: i.id, qty: i.qtyRequested });

    /* Bebidas terminou, mas o arroz (Secos) não — ainda não está pronto. */
    expect(await statusDoPedido(id)).toBe('SEPARANDO');

    const arroz = (await getPedido(gerente(), id))!.setores.flatMap((s) => s.itens).find((i) => i.name === 'Arroz 5kg')!;
    const admin: SessionUser = { id: gerenteId, name: 'Admin', role: 'ADMIN', unitIds: [], seesAllUnits: true, needsTerms: false };
    await separarItem(admin, { itemId: arroz.id, qty: 3 });

    expect(await statusDoPedido(id)).toBe('PRONTO_ENVIO');
  });

  it('pedido de UM setor só não espera os outros', async () => {
    /* "Se determinado pedido não possuir produtos de um dos setores, não
       aguardar esse setor" — a conta é sobre os itens que existem. */
    const r = await criarPedido(gerente(), { unitId, items: [{ productId: prod.coca, qty: 5 }] });
    const id = r.ok ? r.id : '';
    const [coca] = await itensDoCarlos(id);
    await separarItem(carlos(), { itemId: coca.id, qty: 5 });
    expect(await statusDoPedido(id)).toBe('PRONTO_ENVIO');
  });

  it('desfazer o último item tira o pedido de PRONTO PARA ENVIO', async () => {
    const r = await criarPedido(gerente(), { unitId, items: [{ productId: prod.coca, qty: 5 }] });
    const id = r.ok ? r.id : '';
    const [coca] = await itensDoCarlos(id);
    await separarItem(carlos(), { itemId: coca.id, qty: 5 });
    await desfazerItem(carlos(), coca.id);
    expect(await statusDoPedido(id)).toBe('ENVIADO_CD');
  });
});

describe('O gerente fica sabendo da falta', () => {
  /* Antes, a única notícia que o gerente recebia do CD era "começou a separar".
     A falta ele descobria quando a carga chegava — tarde demais para comprar
     fora ou pedir a outra unidade. */
  const avisos = () => prisma.notification.findMany({ where: { userId: gerenteId }, orderBy: { createdAt: 'desc' } });

  it('avisa quando o SETOR termina com falta, não a cada item', async () => {
    const id = await pedidoPadrao();
    const itens = await itensDoCarlos(id);
    /* Primeiro item com falta: o setor ainda não acabou, ninguém é avisado. */
    await separarItem(carlos(), { itemId: itens[0].id, qty: 0, missingReason: 'SEM_ESTOQUE' });
    expect((await avisos()).filter((n) => n.title.includes('Falta'))).toHaveLength(0);

    /* Segundo item fecha o setor: UMA notificação, com as faltas juntas. */
    await separarItem(carlos(), { itemId: itens[1].id, qty: itens[1].qtyRequested });
    const falta = (await avisos()).filter((n) => n.title.includes('Falta'));
    expect(falta).toHaveLength(1);
    expect(falta[0].body).toContain('uma falta');
  });

  it('duas faltas no mesmo setor viram UM aviso, não dois', async () => {
    const id = await pedidoPadrao();
    for (const i of await itensDoCarlos(id)) {
      await separarItem(carlos(), { itemId: i.id, qty: 0, missingReason: 'SEM_ESTOQUE' });
    }
    const falta = (await avisos()).filter((n) => n.title.includes('Falta'));
    expect(falta).toHaveLength(1);
    expect(falta[0].body).toContain('2 faltas');
    /* E diz de QUAL setor, porque quatro trabalham no mesmo pedido. */
    expect(falta[0].body).toContain('Bebidas');
  });

  it('setor que fecha SEM falta não incomoda ninguém', async () => {
    const id = await pedidoPadrao();
    for (const i of await itensDoCarlos(id)) {
      await separarItem(carlos(), { itemId: i.id, qty: i.qtyRequested });
    }
    expect((await avisos()).filter((n) => n.title.includes('Falta'))).toHaveLength(0);
  });

  it('corrigir um item de setor JÁ pronto não avisa de novo', async () => {
    /* Senão, cada correção de digitação tocaria o sino do gerente. */
    const id = await pedidoPadrao();
    const itens = await itensDoCarlos(id);
    for (const i of itens) await separarItem(carlos(), { itemId: i.id, qty: 0, missingReason: 'SEM_ESTOQUE' });
    const antes = (await avisos()).filter((n) => n.title.includes('Falta')).length;

    await separarItem(carlos(), { itemId: itens[0].id, qty: 1, missingReason: 'QTD_INSUFICIENTE' });
    expect((await avisos()).filter((n) => n.title.includes('Falta'))).toHaveLength(antes);
  });

  it('o aviso traz a etiqueta do pedido', async () => {
    const id = await pedidoPadrao();
    for (const i of await itensDoCarlos(id)) {
      await separarItem(carlos(), { itemId: i.id, qty: 0, missingReason: 'SEM_ESTOQUE' });
    }
    const p = (await prisma.productRequest.findUnique({ where: { id } }))!;
    const [falta] = (await avisos()).filter((n) => n.title.includes('Falta'));
    expect(falta.title).toContain(numeroDoPedido(p.number, p.createdAt));
  });
});
