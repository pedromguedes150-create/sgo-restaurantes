import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { criarPedido, getPedido, listarParaSeparacao, PENDENTES_DE_CLASSIFICACAO } from '@/lib/products/pedido';
import { separarItem, romaneioPorSetor } from '@/lib/products/separacao';
import { conferirCarga, confirmarEnvio } from '@/lib/products/entrega';
import { classificarProduto, pendentesDeClassificacao } from '@/lib/products/classificacao';
import { propagarSetorParaItensAbertos } from '@/lib/products/propagar-setor';
import { montarTimeline } from '@/lib/products/entrega-tela';
import type { SessionUser } from '@/lib/auth/session';

/**
 * PR C: o item sem setor não some do pedido (pendente de classificação), o
 * setor definido depois o leva para a fila certa; romaneio POR SETOR soma as
 * unidades; a conferência da carga entra entre Separado e Em trânsito.
 */

const sfx = `${process.pid.toString(36)}${Date.now().toString(36).slice(-4)}`;
let unitA: string; let unitB: string;
let gerenteId: string; let adminId: string; let carlosId: string; let mariaId: string;
let setorBebidas: string; let setorFrios: string;
let coca: string; let tilapia: string; let biscoito: string;

const gerente = (): SessionUser => ({ id: gerenteId, name: 'Gerente C', role: 'MANAGER', unitIds: [unitA, unitB], seesAllUnits: false, needsTerms: false });
const admin = (): SessionUser => ({ id: adminId, name: 'Admin C', role: 'ADMIN', unitIds: [], seesAllUnits: true, needsTerms: false });
const carlos = (): SessionUser => ({ id: carlosId, name: 'Carlos', role: 'SEPARATOR', unitIds: [], seesAllUnits: false, needsTerms: false }); // Bebidas
const maria = (): SessionUser => ({ id: mariaId, name: 'Maria', role: 'SEPARATOR', unitIds: [], seesAllUnits: false, needsTerms: false }); // Frios

beforeAll(async () => {
  unitA = (await prisma.unit.create({ data: { code: `CA-${sfx}`, name: 'Jardim Teresópolis C', timezone: 'America/Sao_Paulo', cutoffHour: 4 } })).id;
  unitB = (await prisma.unit.create({ data: { code: `CB-${sfx}`, name: 'Centro C', timezone: 'America/Sao_Paulo', cutoffHour: 4 } })).id;
  gerenteId = (await prisma.user.create({ data: { name: 'Gerente C', email: `pc-g-${sfx}@t.local`, role: 'MANAGER', passwordHash: 'x' } })).id;
  await prisma.unitMembership.createMany({ data: [{ userId: gerenteId, unitId: unitA }, { userId: gerenteId, unitId: unitB }] });
  adminId = (await prisma.user.create({ data: { name: 'Admin C', email: `pc-a-${sfx}@t.local`, role: 'ADMIN', passwordHash: 'x' } })).id;
  setorBebidas = (await prisma.cdSector.create({ data: { name: `Bebidas C ${sfx}` } })).id;
  setorFrios = (await prisma.cdSector.create({ data: { name: `Câmaras Frias C ${sfx}` } })).id;
  carlosId = (await prisma.user.create({ data: { name: 'Carlos', email: `pc-c-${sfx}@t.local`, role: 'SEPARATOR', passwordHash: 'x', cdSectorId: setorBebidas } })).id;
  mariaId = (await prisma.user.create({ data: { name: 'Maria', email: `pc-m-${sfx}@t.local`, role: 'SEPARATOR', passwordHash: 'x', cdSectorId: setorFrios } })).id;
  coca = (await prisma.product.create({ data: { name: `Coca-Cola 2L ${sfx}`, origin: 'CD', category: 'Bebidas', measure: 'un', cdSectorId: setorBebidas } })).id;
  tilapia = (await prisma.product.create({ data: { name: `Filé de tilápia ${sfx}`, origin: 'CD', category: 'Peixes', measure: 'kg', cdSectorId: setorFrios } })).id;
  /* O provisório do gerente: CD SEM setor, validação pendente. */
  biscoito = (await prisma.product.create({ data: { name: `Biscoito Novo ${sfx}`, origin: 'CD', category: 'Geral', measure: 'un', cdSectorId: null, validation: 'PENDENTE', createdById: gerenteId, createdByName: 'Gerente C' } })).id;
});

afterAll(async () => {
  await prisma.productRequest.deleteMany({ where: { unitId: { in: [unitA, unitB] } } });
  await prisma.product.deleteMany({ where: { id: { in: [coca, tilapia, biscoito] } } });
  await prisma.cdSector.deleteMany({ where: { id: { in: [setorBebidas, setorFrios] } } });
  await prisma.notification.deleteMany({ where: { userId: { in: [gerenteId, carlosId, mariaId] } } });
  await prisma.auditLog.deleteMany({ where: { OR: [{ unitId: { in: [unitA, unitB] } }, { entityId: biscoito }] } });
  await prisma.unitMembership.deleteMany({ where: { unitId: { in: [unitA, unitB] } } });
  await prisma.unit.deleteMany({ where: { id: { in: [unitA, unitB] } } });
  await prisma.user.deleteMany({ where: { id: { in: [gerenteId, adminId, carlosId, mariaId] } } });
});

let pedidoA: string; let pedidoB: string;

describe('pendentes de classificação', () => {
  it('o provisório entra no pedido no balde "Pendentes de classificação", por último, e ninguém do CD o vê', async () => {
    const r = await criarPedido(gerente(), { unitId: unitA, items: [{ productId: coca, qty: 3, packUnit: 'FARDO' }, { productId: tilapia, qty: 5 }, { productId: biscoito, qty: 2, packUnit: 'FARDO' }] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    pedidoA = r.pedidos[0].id;
    const p = (await getPedido(gerente(), pedidoA))!;
    expect(p.pendentesDeClassificacao).toBe(1);
    expect(p.setores[p.setores.length - 1].cdSectorName).toBe(PENDENTES_DE_CLASSIFICACAO);
    /* Carlos (Bebidas) não vê o biscoito; Maria (Frios) tampouco. */
    const deCarlos = await listarParaSeparacao(carlos());
    expect(deCarlos.pedidos[0]?.total).toBe(1);
    const pend = await pendentesDeClassificacao();
    expect(pend.some((x) => x.productId === biscoito && x.pedidos === 1 && x.unidades.includes('Jardim Teresópolis C'))).toBe(true);
  });

  it('o Admin define o setor: o cadastro muda E o item do pedido aberto entra na fila do setor — Carlos passa a vê-lo e é avisado', async () => {
    const r = await classificarProduto(admin(), biscoito, setorBebidas);
    expect(r).toEqual({ ok: true, itensAtualizados: 1 });
    const item = await prisma.productRequestItem.findFirstOrThrow({ where: { requestId: pedidoA, productId: biscoito } });
    expect(item.cdSectorId).toBe(setorBebidas);
    expect(item.cdSectorName).toContain('Bebidas');
    const deCarlos = await listarParaSeparacao(carlos());
    expect(deCarlos.pedidos[0]?.total).toBe(2);
    expect((await getPedido(gerente(), pedidoA))!.pendentesDeClassificacao).toBe(0);
    const n = await prisma.notification.findFirst({ where: { userId: carlosId, title: '📦 Itens entraram na sua fila' } });
    expect(n).not.toBeNull();
    /* Só o produto DESTE teste: a lista é global e outros arquivos da suíte
       (e o banco de dev) têm itens sem setor legítimos em pedidos abertos. */
    expect((await pendentesDeClassificacao()).some((x) => x.productId === biscoito)).toBe(false);
  });

  it('a propagação NÃO toca pedido já enviado (retrato do dia) e é idempotente', async () => {
    /* Um item sem setor num pedido já em trânsito: fica como está. */
    const fechado = await prisma.productRequest.create({
      data: {
        unitId: unitB, origin: 'CD', number: 9001, status: 'ENVIADO_UNIDADE', createdById: gerenteId, createdByName: 'Gerente C', items: [],
        requestItems: { create: [{ productId: biscoito, name: 'Biscoito Novo', category: 'Geral', measure: 'un', qtyRequested: 1 }] },
      },
    });
    expect(await propagarSetorParaItensAbertos([biscoito])).toBe(0);
    const item = await prisma.productRequestItem.findFirstOrThrow({ where: { requestId: fechado.id } });
    expect(item.cdSectorId).toBeNull();
    expect(await propagarSetorParaItensAbertos(['nao-existe', ''])).toBe(0);
  });
});

describe('romaneio por setor', () => {
  it('soma o mesmo produto de duas unidades e separa por embalagem pedida', async () => {
    const r = await criarPedido(gerente(), { unitId: unitB, items: [{ productId: tilapia, qty: 8 }, { productId: coca, qty: 6, packUnit: 'UN' }] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    pedidoB = r.pedidos[0].id;

    const frios = (await romaneioPorSetor(maria(), setorFrios))!;
    expect(frios.setorNome).toContain('Câmaras Frias');
    expect(frios.pedidos.map((p) => p.unitName).sort()).toEqual(['Centro C', 'Jardim Teresópolis C']);
    const tot = frios.totais.find((t) => t.name.includes('tilápia'))!;
    expect(tot.qtyRequested).toBe(13); // 5 + 8
    expect(tot.unidades).toBe(2);

    const bebidas = (await romaneioPorSetor(admin(), setorBebidas))!;
    /* Coca em FARDO (3) e em UN (6) são DUAS linhas: o SGO não converte. */
    const cocas = bebidas.totais.filter((t) => t.name.includes('Coca'));
    expect(cocas.map((c) => [c.packUnit, c.qtyRequested]).sort()).toEqual([['FARDO', 3], ['UN', 6]]);
  });

  it('o separador só imprime o romaneio do SEU setor; Admin imprime qualquer; setor inexistente é null', async () => {
    expect(await romaneioPorSetor(carlos(), setorFrios)).toBeNull();
    expect((await romaneioPorSetor(carlos(), setorBebidas))?.setorId).toBe(setorBebidas);
    expect(await romaneioPorSetor(admin(), 'nao-existe')).toBeNull();
  });
});

describe('conferência da carga (CONFERIDO)', () => {
  it('só depois de tudo separado; travando a separação; o envio sai de Conferido', async () => {
    expect(await conferirCarga(admin(), pedidoB)).toMatchObject({ ok: false, reason: 'FORA_DE_ORDEM' });

    const itens = await prisma.productRequestItem.findMany({ where: { requestId: pedidoB } });
    for (const i of itens) {
      const quem = i.cdSectorId === setorFrios ? maria() : carlos();
      expect((await separarItem(quem, { itemId: i.id, qty: Number(i.qtyRequested) })).ok).toBe(true);
    }
    expect((await prisma.productRequest.findUniqueOrThrow({ where: { id: pedidoB } })).status).toBe('PRONTO_ENVIO');

    const c = await conferirCarga(carlos(), pedidoB);
    expect(c).toEqual({ ok: true, status: 'CONFERIDO' });
    const pedido = await prisma.productRequest.findUniqueOrThrow({ where: { id: pedidoB } });
    expect(pedido.checkedByName).toBe('Carlos');
    expect(pedido.checkedAt).not.toBeNull();

    /* Depois de conferido, mexer num item é recusado com o motivo certo. */
    const bloqueio = await separarItem(carlos(), { itemId: itens.find((i) => i.cdSectorId === setorBebidas)!.id, qty: 1, missingReason: 'SEM_ESTOQUE', sobrescrever: true });
    expect(bloqueio).toMatchObject({ ok: false, reason: 'JA_ENVIADO' });
    if (!bloqueio.ok && bloqueio.reason === 'JA_ENVIADO') expect(bloqueio.detalhe).toContain('conferida');

    /* Conferir de novo é idempotente; a lista do CD ainda mostra o pedido. */
    expect(await conferirCarga(admin(), pedidoB)).toEqual({ ok: true, status: 'CONFERIDO' });
    expect((await listarParaSeparacao(carlos())).pedidos.some((p) => p.id === pedidoB)).toBe(true);

    /* A timeline mostra a conferência feita; o envio sai de CONFERIDO. */
    const det = (await getPedido(gerente(), pedidoB))!;
    const t = montarTimeline(det);
    expect(t.find((e) => e.chave === 'CONFERENCIA')).toMatchObject({ feito: true, quem: 'Carlos' });
    expect(await confirmarEnvio(carlos(), pedidoB, null)).toEqual({ ok: true, status: 'ENVIADO_UNIDADE' });
  });

  it('o envio continua liberado direto de Separado (a conferência é opcional) e a timeline diz que saiu sem conferência', async () => {
    const itens = await prisma.productRequestItem.findMany({ where: { requestId: pedidoA } });
    for (const i of itens) {
      const quem = i.cdSectorId === setorFrios ? maria() : carlos();
      expect((await separarItem(quem, { itemId: i.id, qty: Number(i.qtyRequested) })).ok).toBe(true);
    }
    expect(await confirmarEnvio(admin(), pedidoA, 'sem conferência hoje')).toEqual({ ok: true, status: 'ENVIADO_UNIDADE' });
    const det = (await getPedido(gerente(), pedidoA))!;
    expect(det.statusLabel).toBe('Em trânsito');
    const conf = montarTimeline(det).find((e) => e.chave === 'CONFERENCIA')!;
    expect(conf.feito).toBe(false);
    expect(conf.detalhe).toBe('Saiu sem conferência registrada');
  });
});
