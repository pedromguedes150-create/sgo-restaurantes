import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { criarPedido, getPedido } from '@/lib/products/pedido';
import { separarItem } from '@/lib/products/separacao';
import { confirmarEnvio, conferirRecebimento, itensParaRepetir } from '@/lib/products/entrega';
import type { SessionUser } from '@/lib/auth/session';

/**
 * A ÚLTIMA PERNA: o CD dá saída, a unidade confere.
 *
 * O que se mede aqui é a discussão velha por telefone — "mandei tudo" contra
 * "chegou faltando". As duas versões passam a viver gravadas lado a lado, e
 * quando divergem o CD fica sabendo.
 */

const sfx = `${process.pid.toString(36)}${Date.now().toString(36).slice(-4)}`;
let unitId: string;
let outraUnidade: string;
let gerenteId: string;
let carlosId: string;
let setorId: string;
const prod: Record<string, string> = {};

const gerente = (): SessionUser => ({ id: gerenteId, name: 'Gerente', role: 'MANAGER', unitIds: [unitId], seesAllUnits: false, needsTerms: false });
const carlos = (): SessionUser => ({ id: carlosId, name: 'Carlos', role: 'SEPARATOR', unitIds: [], seesAllUnits: false, needsTerms: false });

beforeAll(async () => {
  unitId = (await prisma.unit.create({ data: { code: `EN-${sfx}`, name: 'Unidade Entrega', timezone: 'America/Sao_Paulo', cutoffHour: 4 } })).id;
  outraUnidade = (await prisma.unit.create({ data: { code: `EX-${sfx}`, name: 'Outra', timezone: 'America/Sao_Paulo', cutoffHour: 4 } })).id;
  gerenteId = (await prisma.user.create({ data: { name: 'Gerente EN', email: `en-g-${sfx}@t.local`, role: 'MANAGER', passwordHash: 'x' } })).id;
  await prisma.unitMembership.create({ data: { userId: gerenteId, unitId } });

  setorId = (await prisma.cdSector.create({ data: { name: `Bebidas ${sfx}` } })).id;
  carlosId = (await prisma.user.create({ data: { name: 'Carlos', email: `en-c-${sfx}@t.local`, role: 'SEPARATOR', passwordHash: 'x', cdSectorId: setorId } })).id;

  prod.coca = (await prisma.product.create({ data: { name: 'Coca-Cola 2L', origin: 'CD', category: 'Bebidas', measure: 'fardo', cdSectorId: setorId } })).id;
  prod.suco = (await prisma.product.create({ data: { name: 'Suco de uva', origin: 'CD', category: 'Bebidas', measure: 'caixa', cdSectorId: setorId } })).id;
});

beforeEach(async () => { await prisma.productRequest.deleteMany({ where: { unitId } }); });

afterAll(async () => {
  await prisma.productRequest.deleteMany({ where: { unitId: { in: [unitId, outraUnidade] } } });
  await prisma.product.deleteMany({ where: { id: { in: Object.values(prod) } } });
  await prisma.user.deleteMany({ where: { id: { in: [gerenteId, carlosId] } } });
  await prisma.cdSector.deleteMany({ where: { id: setorId } });
  await prisma.auditLog.deleteMany({ where: { unitId: { in: [unitId, outraUnidade] } } });
  await prisma.unit.deleteMany({ where: { id: { in: [unitId, outraUnidade] } } });
  await prisma.$disconnect();
});

async function pedidoNovo() {
  const r = await criarPedido(gerente(), {
    unitId, items: [{ productId: prod.coca, qty: 5 }, { productId: prod.suco, qty: 2 }],
  });
  if (!r.ok) throw new Error('não criou');
  return r.id;
}

/** Pedido com a separação inteira feita — pronto para sair. */
async function pedidoSeparado() {
  const id = await pedidoNovo();
  const itens = await prisma.productRequestItem.findMany({ where: { requestId: id } });
  for (const i of itens) await separarItem(carlos(), { itemId: i.id, qty: Number(i.qtyRequested) });
  return id;
}

const statusDo = async (id: string) =>
  (await prisma.productRequest.findUnique({ where: { id }, select: { status: true } }))!.status;
const itemPorNome = async (id: string, nome: string) =>
  (await prisma.productRequestItem.findFirst({ where: { requestId: id, name: nome } }))!;

describe('O CD dá saída na carga', () => {
  it('pedido separado sai, com quem enviou e a observação do CD', async () => {
    const id = await pedidoSeparado();
    const r = await confirmarEnvio(carlos(), id, 'Fui até a doca 2');
    expect(r.ok).toBe(true);

    const p = (await getPedido(gerente(), id))!;
    expect(p.status).toBe('ENVIADO_UNIDADE');
    expect(p.sentByName).toBe('Carlos');
    expect(p.sentAt).toBeInstanceOf(Date);
    expect(p.cdNote).toBe('Fui até a doca 2');
  });

  it('separação pela METADE não sai — a unidade conferiria contra lista inacabada', async () => {
    const id = await pedidoNovo();
    const coca = await itemPorNome(id, 'Coca-Cola 2L');
    await separarItem(carlos(), { itemId: coca.id, qty: 5 });

    const r = await confirmarEnvio(carlos(), id, null);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toBe('FORA_DE_ORDEM');
    expect(await statusDo(id)).toBe('SEPARANDO');
  });

  it('enviar duas vezes não reescreve a saída', async () => {
    const id = await pedidoSeparado();
    await confirmarEnvio(carlos(), id, null);
    const r = await confirmarEnvio(carlos(), id, 'tentando de novo');
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.detalhe).toContain('já foi enviado');
  });
});

describe('A unidade confere o que chegou', () => {
  it('tudo certo fecha como CONCLUÍDO, com quem conferiu', async () => {
    const id = await pedidoSeparado();
    await confirmarEnvio(carlos(), id, null);

    const r = await conferirRecebimento(gerente(), id, { itens: [], quality: 'BOA', packaging: 'BOA' });
    expect(r.ok).toBe(true);
    expect(r.ok && r.status).toBe('CONCLUIDO');

    const p = (await getPedido(gerente(), id))!;
    expect(p.receivedByName).toBe('Gerente');
    expect(p.receivedAt).toBeInstanceOf(Date);
  });

  it('um item apontado fecha como CONCLUÍDO COM DIVERGÊNCIA', async () => {
    const id = await pedidoSeparado();
    await confirmarEnvio(carlos(), id, null);
    const coca = await itemPorNome(id, 'Coca-Cola 2L');

    const r = await conferirRecebimento(gerente(), id, {
      itens: [{ itemId: coca.id, issue: 'AVARIADO', note: 'dois fardos estourados', photo: 'uploads/x/foto.jpg' }],
    });
    expect(r.ok && r.status).toBe('CONCLUIDO_DIVERGENCIA');

    const depois = await itemPorNome(id, 'Coca-Cola 2L');
    expect(depois.receiptIssue).toBe('AVARIADO');
    expect(depois.receiptNote).toBe('dois fardos estourados');
    expect(depois.receiptPhoto).toBe('uploads/x/foto.jpg');
  });

  it('a conferência NÃO mexe no que o CD separou', async () => {
    /* São duas leituras, lado a lado. Se a conferência corrigisse a separação,
       a divergência desapareceria justamente no momento em que foi encontrada. */
    const id = await pedidoSeparado();
    await confirmarEnvio(carlos(), id, null);
    const coca = await itemPorNome(id, 'Coca-Cola 2L');
    await conferirRecebimento(gerente(), id, { itens: [{ itemId: coca.id, issue: 'NAO_VEIO' }] });

    const depois = await itemPorNome(id, 'Coca-Cola 2L');
    expect(Number(depois.qtySeparated)).toBe(5);
    expect(depois.separatedByName).toBe('Carlos');
  });

  it('refazer a conferência LIMPA o apontamento retirado', async () => {
    const id = await pedidoSeparado();
    await confirmarEnvio(carlos(), id, null);
    const coca = await itemPorNome(id, 'Coca-Cola 2L');
    await conferirRecebimento(gerente(), id, { itens: [{ itemId: coca.id, issue: 'AVARIADO' }] });

    /* Segunda conferência sem o apontamento: a marca antiga não pode sobrar. */
    await prisma.productRequest.update({ where: { id }, data: { status: 'ENVIADO_UNIDADE' } });
    const r = await conferirRecebimento(gerente(), id, { itens: [] });
    expect(r.ok && r.status).toBe('CONCLUIDO');
    expect((await itemPorNome(id, 'Coca-Cola 2L')).receiptIssue).toBeNull();
  });

  it('não dá para conferir o que o CD ainda não enviou', async () => {
    const id = await pedidoSeparado();
    const r = await conferirRecebimento(gerente(), id, { itens: [] });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.detalhe).toContain('ainda não confirmou');
  });

  it('conferir duas vezes é recusado', async () => {
    const id = await pedidoSeparado();
    await confirmarEnvio(carlos(), id, null);
    await conferirRecebimento(gerente(), id, { itens: [] });
    const r = await conferirRecebimento(gerente(), id, { itens: [] });
    expect(r.ok === false && r.detalhe).toContain('já foi conferido');
  });

  it('gerente de OUTRA unidade não confere o pedido alheio', async () => {
    const id = await pedidoSeparado();
    await confirmarEnvio(carlos(), id, null);
    const intruso: SessionUser = { id: gerenteId, name: 'Intruso', role: 'MANAGER', unitIds: [outraUnidade], seesAllUnits: false, needsTerms: false };
    const r = await conferirRecebimento(intruso, id, { itens: [] });
    expect(r.ok === false && r.reason).toBe('FORBIDDEN');
  });

  it('item de fora do pedido é recusado, e nada é gravado', async () => {
    const outro = await pedidoSeparado();
    const alvo = await pedidoSeparado();
    await confirmarEnvio(carlos(), alvo, null);
    const forasteiro = await itemPorNome(outro, 'Coca-Cola 2L');

    const r = await conferirRecebimento(gerente(), alvo, { itens: [{ itemId: forasteiro.id, issue: 'AVARIADO' }] });
    expect(r.ok === false && r.reason).toBe('INVALID');
    expect(await statusDo(alvo)).toBe('ENVIADO_UNIDADE');
    expect((await prisma.productRequestItem.findUnique({ where: { id: forasteiro.id } }))!.receiptIssue).toBeNull();
  });

  it('motivo inventado é recusado', async () => {
    const id = await pedidoSeparado();
    await confirmarEnvio(carlos(), id, null);
    const coca = await itemPorNome(id, 'Coca-Cola 2L');
    const r = await conferirRecebimento(gerente(), id, { itens: [{ itemId: coca.id, issue: 'SUMIU_NO_CAMINHO' }] });
    expect(r.ok === false && r.reason).toBe('INVALID');
  });
});

describe('Repetir o pedido do mês passado', () => {
  it('traz os itens com as quantidades de antes', async () => {
    const id = await pedidoNovo();
    const r = await itensParaRepetir(gerente(), id);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.itens).toHaveLength(2);
    expect(r.itens.find((i) => i.productId === prod.coca)!.qty).toBe(5);
    expect(r.ignorados).toEqual([]);
  });

  it('deixa de fora o produto DESATIVADO, e diz qual foi', async () => {
    /* Repetir um produto que o CD não atende mais devolveria ao gerente um
       pedido furado — e ele só descobriria na hora de enviar. */
    const id = await pedidoNovo();
    await prisma.product.update({ where: { id: prod.suco }, data: { active: false } });
    try {
      const r = await itensParaRepetir(gerente(), id);
      if (!r.ok) throw new Error('deveria ter dado certo');
      expect(r.itens).toHaveLength(1);
      expect(r.ignorados).toEqual(['Suco de uva']);
    } finally {
      await prisma.product.update({ where: { id: prod.suco }, data: { active: true } });
    }
  });

  it('não repete pedido de unidade que a pessoa não enxerga', async () => {
    const id = await pedidoNovo();
    const intruso: SessionUser = { id: gerenteId, name: 'Intruso', role: 'MANAGER', unitIds: [outraUnidade], seesAllUnits: false, needsTerms: false };
    const r = await itensParaRepetir(intruso, id);
    expect(r.ok === false && r.reason).toBe('FORBIDDEN');
  });
});
