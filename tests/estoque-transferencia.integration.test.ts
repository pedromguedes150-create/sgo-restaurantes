import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { lancarEntrada, tratarLote } from '@/lib/stock/lotes';
import { transferirLote } from '@/lib/stock/transferencia';
import { itensParaEstoque, recebimentosPendentesDeEstoque } from '@/lib/stock/recebimento';
import { quantidadeSugerida } from '@/lib/stock/embalagem';
import { getEstoqueDaUnidade } from '@/lib/stock/query';
import type { SessionUser } from '@/lib/auth/session';

/**
 * ETAPA 2 DO ESTOQUE: transferência entre unidades e o gancho com o pedido.
 *
 * O que se prova: a mercadoria que sai de uma prateleira ENTRA na outra, no
 * mesmo lote e com a mesma validade, em dois movimentos casados; a tratativa
 * "Transferido" passou a exigir destino; e o item recebido do CD vira lote UMA
 * vez só — o segundo toque é recusado, inclusive em disputa.
 */

const sfx = `${process.pid.toString(36)}${Date.now().toString(36).slice(-4)}`;
let origem: string; let destino: string; let terceira: string;
let gerenteId: string; let gerenteBId: string;

const gerente = (): SessionUser => ({ id: gerenteId, name: 'Gerente A', role: 'MANAGER', unitIds: [origem], seesAllUnits: false, needsTerms: false });
const gerenteB = (): SessionUser => ({ id: gerenteBId, name: 'Gerente B', role: 'MANAGER', unitIds: [destino], seesAllUnits: false, needsTerms: false });

function emDias(n: number): string {
  const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
}

async function criarProduto(nome: string, over: Record<string, unknown> = {}) {
  return prisma.product.create({ data: { name: `TRF-${sfx} ${nome}`, origin: 'LOCAL', category: 'Geral', measure: 'un', packType: 'UN', ...over } });
}

beforeAll(async () => {
  origem = (await prisma.unit.create({ data: { code: `TA-${sfx}`, name: `Transf A ${sfx}` } })).id;
  destino = (await prisma.unit.create({ data: { code: `TB-${sfx}`, name: `Transf B ${sfx}` } })).id;
  terceira = (await prisma.unit.create({ data: { code: `TC-${sfx}`, name: `Transf C ${sfx}`, active: false } })).id;
  gerenteId = (await prisma.user.create({ data: { name: 'Gerente A', email: `trf-a-${sfx}@t.local`, role: 'MANAGER', passwordHash: 'x' } })).id;
  gerenteBId = (await prisma.user.create({ data: { name: 'Gerente B', email: `trf-b-${sfx}@t.local`, role: 'MANAGER', passwordHash: 'x' } })).id;
  await prisma.unitMembership.createMany({ data: [{ userId: gerenteId, unitId: origem }, { userId: gerenteBId, unitId: destino }] });
});

beforeEach(async () => {
  await prisma.stockLot.deleteMany({ where: { unitId: { in: [origem, destino] } } });
  await prisma.productRequest.deleteMany({ where: { unitId: { in: [origem, destino] } } });
  await prisma.product.deleteMany({ where: { name: { startsWith: `TRF-${sfx}` } } });
});

afterAll(async () => {
  await prisma.stockLot.deleteMany({ where: { unitId: { in: [origem, destino] } } });
  await prisma.productRequest.deleteMany({ where: { unitId: { in: [origem, destino] } } });
  await prisma.product.deleteMany({ where: { name: { startsWith: `TRF-${sfx}` } } });
  await prisma.notification.deleteMany({ where: { userId: { in: [gerenteId, gerenteBId] } } });
  await prisma.auditLog.deleteMany({ where: { unitId: { in: [origem, destino] } } });
  await prisma.unitMembership.deleteMany({ where: { unitId: { in: [origem, destino] } } });
  await prisma.unit.deleteMany({ where: { id: { in: [origem, destino, terceira] } } });
  await prisma.user.deleteMany({ where: { id: { in: [gerenteId, gerenteBId] } } });
});

describe('transferirLote', () => {
  it('parcial: a origem baixa, o destino nasce com o MESMO lote e validade, e os dois movimentos apontam um para o outro', async () => {
    const p = await criarProduto('Molho', { packType: 'FARDO', packSize: 12, trackExpiry: true });
    const e = await lancarEntrada(gerente(), { unitId: origem, productId: p.id, quantidade: 5, lotCode: 'L1', expiresAt: emDias(40) });
    if (!e.ok) throw new Error('entrada');

    const r = await transferirLote(gerente(), { lotId: e.lotId, paraUnitId: destino, quantidade: 2, note: 'foi no carro do Zé' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.unidades).toBe(24);
    expect(r.origemEncerrada).toBe(false);

    const orig = await prisma.stockLot.findUniqueOrThrow({ where: { id: e.lotId } });
    expect(Number(orig.qtyOnHand)).toBe(36);
    expect(orig.status).toBe('OPEN');

    const dest = await prisma.stockLot.findUniqueOrThrow({ where: { id: r.destinoLotId } });
    expect(dest.unitId).toBe(destino);
    expect(dest.productId).toBe(p.id);
    expect(dest.lotCode).toBe('L1');
    expect(dest.expiresAt).toBe(emDias(40));
    /* Embalagem congelada VEM da origem — não do cadastro na hora. */
    expect(dest.packType).toBe('FARDO');
    expect(dest.unitsPerPack).toBe(12);
    expect(Number(dest.qtyOnHand)).toBe(24);
    expect(Number(dest.qtyReceived)).toBe(24);

    const saida = await prisma.stockMovement.findFirstOrThrow({ where: { lotId: e.lotId, type: 'TRANSFER_OUT' } });
    expect(Number(saida.qty)).toBe(-24);
    expect(Number(saida.qtyAfter)).toBe(36);
    expect(saida.counterpartUnitId).toBe(destino);
    expect(saida.counterpartLotId).toBe(r.destinoLotId);
    const entrada = await prisma.stockMovement.findFirstOrThrow({ where: { lotId: r.destinoLotId, type: 'TRANSFER_IN' } });
    expect(Number(entrada.qty)).toBe(24);
    expect(entrada.counterpartLotId).toBe(e.lotId);
    expect(entrada.note).toBe('foi no carro do Zé');

    /* O destino é avisado; a origem, não (quem transferiu já sabe). */
    const aviso = await prisma.notification.findFirst({ where: { userId: gerenteBId, title: { contains: 'outra unidade' } } });
    expect(aviso?.body).toContain('2 fardos');
  });

  it('total (sem quantidade): a origem encerra como TRANSFERRED e some do estoque dela; aparece no do destino', async () => {
    const p = await criarProduto('Arroz');
    const e = await lancarEntrada(gerente(), { unitId: origem, productId: p.id, quantidade: 10 });
    if (!e.ok) throw new Error('entrada');
    const r = await transferirLote(gerente(), { lotId: e.lotId, paraUnitId: destino });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.origemEncerrada).toBe(true);
    const orig = await prisma.stockLot.findUniqueOrThrow({ where: { id: e.lotId } });
    expect(orig.status).toBe('TRANSFERRED');
    expect(Number(orig.qtyOnHand)).toBe(0);
    expect(orig.closedByName).toBe('Gerente A');

    expect((await getEstoqueDaUnidade(gerente(), { unitId: origem })).linhas).toHaveLength(0);
    const deB = await getEstoqueDaUnidade(gerenteB(), { unitId: destino });
    expect(deB.linhas.map((l) => l.unidades)).toEqual([10]);
  });

  it('no destino, a MESMA pilha (produto + lote + validade) SOMA em vez de abrir segunda linha', async () => {
    const p = await criarProduto('Feijão', { trackExpiry: true });
    const ja = await lancarEntrada(gerenteB(), { unitId: destino, productId: p.id, quantidade: 3, lotCode: 'X', expiresAt: emDias(60) });
    const e = await lancarEntrada(gerente(), { unitId: origem, productId: p.id, quantidade: 7, lotCode: 'X', expiresAt: emDias(60) });
    if (!ja.ok || !e.ok) throw new Error('entrada');
    const r = await transferirLote(gerente(), { lotId: e.lotId, paraUnitId: destino, quantidade: 4 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.destinoLotId).toBe(ja.lotId);
    expect(Number((await prisma.stockLot.findUniqueOrThrow({ where: { id: ja.lotId } })).qtyOnHand)).toBe(7);
    expect(await prisma.stockLot.count({ where: { unitId: destino, productId: p.id } })).toBe(1);
  });

  it('recusa: mais do que há, mesma unidade, unidade inativa, sem acesso à origem, lote encerrado', async () => {
    const p = await criarProduto('Óleo');
    const e = await lancarEntrada(gerente(), { unitId: origem, productId: p.id, quantidade: 5 });
    if (!e.ok) throw new Error('entrada');

    const demais = await transferirLote(gerente(), { lotId: e.lotId, paraUnitId: destino, quantidade: 6 });
    expect(demais).toMatchObject({ ok: false, reason: 'SALDO_INSUFICIENTE' });
    if (!demais.ok) expect(demais.message).toContain('5 un');

    expect(await transferirLote(gerente(), { lotId: e.lotId, paraUnitId: origem, quantidade: 1 })).toMatchObject({ ok: false, reason: 'DESTINO_INVALIDO' });
    expect(await transferirLote(gerente(), { lotId: e.lotId, paraUnitId: terceira, quantidade: 1 })).toMatchObject({ ok: false, reason: 'DESTINO_INVALIDO' });
    expect(await transferirLote(gerente(), { lotId: e.lotId, paraUnitId: destino, quantidade: 0 })).toMatchObject({ ok: false, reason: 'INVALID' });
    /* O gerente de B não manda na prateleira de A. */
    expect(await transferirLote(gerenteB(), { lotId: e.lotId, paraUnitId: destino, quantidade: 1 })).toMatchObject({ ok: false, reason: 'FORBIDDEN' });

    /* Nada disso mexeu no saldo. */
    expect(Number((await prisma.stockLot.findUniqueOrThrow({ where: { id: e.lotId } })).qtyOnHand)).toBe(5);

    await tratarLote(gerente(), e.lotId, 'FINALIZADO');
    expect(await transferirLote(gerente(), { lotId: e.lotId, paraUnitId: destino })).toMatchObject({ ok: false, reason: 'ENCERRADO' });
  });
});

describe('tratativa "Transferido"', () => {
  it('sem destino é recusada; com destino, o lote inteiro vai para lá e a pergunta não volta', async () => {
    const p = await criarProduto('Iogurte', { trackExpiry: true, alertDays: 30 });
    const e = await lancarEntrada(gerente(), { unitId: origem, productId: p.id, quantidade: 8, expiresAt: emDias(5) });
    if (!e.ok) throw new Error('entrada');
    expect((await getEstoqueDaUnidade(gerente(), { unitId: origem })).pendencias).toHaveLength(1);

    const sem = await tratarLote(gerente(), e.lotId, 'TRANSFERIDO');
    expect(sem).toMatchObject({ ok: false, reason: 'INVALID' });

    const com = await tratarLote(gerente(), e.lotId, 'TRANSFERIDO', { paraUnitId: destino });
    expect(com).toEqual({ ok: true, status: 'TRANSFERRED', saldo: 0 });
    const orig = await prisma.stockLot.findUniqueOrThrow({ where: { id: e.lotId } });
    expect(orig.status).toBe('TRANSFERRED');
    expect(orig.lastReviewBand).not.toBeNull();
    expect((await getEstoqueDaUnidade(gerente(), { unitId: origem })).pendencias).toHaveLength(0);
    /* Em B o lote chegou vencendo em 5 dias — e por isso já pede resposta LÁ. */
    const deB = await getEstoqueDaUnidade(gerenteB(), { unitId: destino });
    expect(deB.linhas).toHaveLength(1);
    expect(deB.pendencias).toHaveLength(1);
  });
});

describe('gancho com o pedido recebido', () => {
  async function pedidoRecebido(itens: { productId: string; qty: number; sep?: number | null; packUnit?: 'UN' | 'FARDO' | 'DISPLAY' | 'CAIXA' }[], status = 'CONCLUIDO') {
    return prisma.productRequest.create({
      data: {
        unitId: origem, origin: 'CD', number: Math.floor(Math.random() * 1_000_000), status, createdById: gerenteId, createdByName: 'Gerente A', items: [],
        receivedAt: status.startsWith('CONCLUIDO') ? new Date() : null,
        requestItems: { create: itens.map((i) => ({ productId: i.productId, name: `Item ${i.productId.slice(-4)}`, category: 'Geral', measure: 'un', qtyRequested: i.qty, qtySeparated: i.sep === undefined ? i.qty : i.sep, packUnit: i.packUnit ?? 'UN' })) },
      },
      include: { requestItems: true },
    });
  }

  it('quantidadeSugerida só quando a embalagem pedida é a do estoque', () => {
    expect(quantidadeSugerida('FARDO', 'FARDO', 2)).toBe(2);
    expect(quantidadeSugerida('UN', 'UN', 12)).toBe(12);
    expect(quantidadeSugerida('UN', 'FARDO', 12)).toBeNull();
    expect(quantidadeSugerida('CAIXA', 'UN', 3)).toBeNull();
    expect(quantidadeSugerida('FARDO', 'FARDO', 0)).toBeNull();
    expect(quantidadeSugerida('FARDO', 'FARDO', null)).toBeNull();
  });

  it('lista o que foi recebido (falta total fica fora), com sugestão, validade exigida e o que já foi lançado', async () => {
    const fardo = await criarProduto('Coca', { packType: 'FARDO', packSize: 6 });
    const comValidade = await criarProduto('Queijo', { trackExpiry: true });
    const faltou = await criarProduto('Faltou');
    const ped = await pedidoRecebido([
      { productId: fardo.id, qty: 3, packUnit: 'FARDO' },
      { productId: comValidade.id, qty: 10, sep: 8 },
      { productId: faltou.id, qty: 4, sep: 0 },
    ]);
    const r = (await itensParaEstoque(gerente(), ped.id))!;
    expect(r.itens.map((i) => i.nome).length).toBe(2);
    const c = r.itens.find((i) => i.productId === fardo.id)!;
    expect(c.recebido).toBe('3 fardos');
    expect(c.quantidadeSugerida).toBe(3);
    expect(c.rotuloDoEstoque).toBe('fardos');
    expect(c.exigeValidade).toBe(false);
    const q = r.itens.find((i) => i.productId === comValidade.id)!;
    expect(q.recebido).toBe('8 un');
    expect(q.quantidadeSugerida).toBe(8);
    expect(q.exigeValidade).toBe(true);
    expect(r.pendentes).toBe(2);

    /* Pedido ainda em trânsito não oferece nada; gerente de outra unidade não vê. */
    const emTransito = await pedidoRecebido([{ productId: fardo.id, qty: 1 }], 'ENVIADO_UNIDADE');
    expect(await itensParaEstoque(gerente(), emTransito.id)).toBeNull();
    expect(await itensParaEstoque(gerenteB(), ped.id)).toBeNull();

    /* A cobrança na tela do Estoque conta os itens ainda não lançados. */
    const pend = await recebimentosPendentesDeEstoque(gerente(), origem);
    expect(pend.find((p) => p.requestId === ped.id)?.itensPendentes).toBe(2);
  });

  it('lançar marca o item UMA vez: o segundo toque é recusado e não cria segundo lote', async () => {
    const p = await criarProduto('Leite', { trackExpiry: true });
    const ped = await pedidoRecebido([{ productId: p.id, qty: 12 }]);
    const item = ped.requestItems[0];

    const semValidade = await lancarEntrada(gerente(), { unitId: origem, productId: p.id, quantidade: 12, requestItemId: item.id });
    expect(semValidade).toMatchObject({ ok: false, reason: 'SEM_VALIDADE' });

    const ok = await lancarEntrada(gerente(), { unitId: origem, productId: p.id, quantidade: 12, expiresAt: emDias(20), requestItemId: item.id });
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    const marcado = await prisma.productRequestItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(marcado.stockLotId).toBe(ok.lotId);
    expect(marcado.stockedAt).not.toBeNull();

    const denovo = await lancarEntrada(gerente(), { unitId: origem, productId: p.id, quantidade: 12, expiresAt: emDias(20), requestItemId: item.id });
    expect(denovo).toMatchObject({ ok: false, reason: 'JA_LANCADO' });
    expect(await prisma.stockLot.count({ where: { unitId: origem, productId: p.id } })).toBe(1);

    const r = (await itensParaEstoque(gerente(), ped.id))!;
    expect(r.pendentes).toBe(0);
    expect(r.itens[0].lancadoEm).not.toBeNull();
    expect((await recebimentosPendentesDeEstoque(gerente(), origem)).find((x) => x.requestId === ped.id)).toBeUndefined();
  });

  it('em DISPUTA (dois lançamentos simultâneos do mesmo item) só um vence e só um lote existe', async () => {
    const p = await criarProduto('Manteiga');
    const ped = await pedidoRecebido([{ productId: p.id, qty: 5 }]);
    const item = ped.requestItems[0];
    const [a, b] = await Promise.all([
      lancarEntrada(gerente(), { unitId: origem, productId: p.id, quantidade: 5, requestItemId: item.id }),
      lancarEntrada(gerente(), { unitId: origem, productId: p.id, quantidade: 5, requestItemId: item.id }),
    ]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    const perdedor = [a, b].find((r) => !r.ok);
    expect(perdedor).toMatchObject({ ok: false, reason: 'JA_LANCADO' });
    /* O lote do perdedor foi desfeito com a transação: UMA entrada, saldo 5. */
    const lotes = await prisma.stockLot.findMany({ where: { unitId: origem, productId: p.id } });
    expect(lotes).toHaveLength(1);
    expect(Number(lotes[0].qtyOnHand)).toBe(5);
  });

  it('recusa item de outra unidade, de outro produto e de pedido não recebido — cada um com o seu motivo', async () => {
    const p = await criarProduto('Sal');
    const outro = await criarProduto('Açúcar');
    const ped = await pedidoRecebido([{ productId: p.id, qty: 2 }]);
    const item = ped.requestItems[0];
    const outroProduto = await lancarEntrada(gerente(), { unitId: origem, productId: outro.id, quantidade: 2, requestItemId: item.id });
    expect(outroProduto).toMatchObject({ ok: false, reason: 'INVALID' });
    if (!outroProduto.ok) expect(outroProduto.message).toContain('outro produto');

    const aberto = await pedidoRecebido([{ productId: p.id, qty: 2 }], 'ENVIADO_UNIDADE');
    const naoRecebido = await lancarEntrada(gerente(), { unitId: origem, productId: p.id, quantidade: 2, requestItemId: aberto.requestItems[0].id });
    expect(naoRecebido).toMatchObject({ ok: false, reason: 'INVALID' });
    if (!naoRecebido.ok) expect(naoRecebido.message).toContain('ainda não foi recebido');

    /* Item de A lançado no estoque de B: B não tem esse pedido. */
    const outraUnidade = await lancarEntrada(gerenteB(), { unitId: destino, productId: p.id, quantidade: 2, requestItemId: item.id });
    expect(outraUnidade).toMatchObject({ ok: false, reason: 'INVALID' });

    expect(await lancarEntrada(gerente(), { unitId: origem, productId: p.id, quantidade: 2, requestItemId: 'nao-existe' })).toMatchObject({ ok: false, reason: 'NAO_ENCONTRADO' });
    /* Nenhuma das recusas criou lote. */
    expect(await prisma.stockLot.count({ where: { unitId: { in: [origem, destino] } } })).toBe(0);
  });
});
