import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { cadastrarProvisorio, duplicadosProvaveis, pendentesDeValidacao, validarProduto, vincularCodigoPeloPedido } from '@/lib/products/cadastro-provisorio';
import { criarPedido } from '@/lib/products/pedido';
import type { SessionUser } from '@/lib/auth/session';

/**
 * O gerente ensina o catálogo pelo pedido: vincula código PERMANENTEMENTE,
 * cadastra provisório que já entra no pedido, e a Administração valida depois.
 */

const sfx = `${process.pid.toString(36)}${Date.now().toString(36).slice(-4)}`;
let unitId: string;
let gerenteId: string;
let adminId: string;
let coordId: string;
let caixaId: string;
let setorBebidas: string;
let coca: string;
let acucar: string;
const criados: string[] = [];

const gerente = (): SessionUser => ({ id: gerenteId, name: 'Gerente P', role: 'MANAGER', unitIds: [unitId], seesAllUnits: false, needsTerms: false });
const admin = (): SessionUser => ({ id: adminId, name: 'Admin P', role: 'ADMIN', unitIds: [], seesAllUnits: true, needsTerms: false });
const coordenador = (): SessionUser => ({ id: coordId, name: 'Coord P', role: 'COORDINATOR', unitIds: [unitId], seesAllUnits: false, needsTerms: false });
const caixa = (): SessionUser => ({ id: caixaId, name: 'Caixa P', role: 'CASHIER', unitIds: [unitId], seesAllUnits: false, needsTerms: false });

const cod = (n: number) => `789${sfx.replace(/\D/g, '').padEnd(6, '7').slice(0, 6)}${String(n).padStart(4, '0')}`;

beforeAll(async () => {
  unitId = (await prisma.unit.create({ data: { code: `PV-${sfx}`, name: 'U Provisório', timezone: 'America/Sao_Paulo', cutoffHour: 4 } })).id;
  gerenteId = (await prisma.user.create({ data: { name: 'Gerente P', email: `pv-g-${sfx}@t.local`, role: 'MANAGER', passwordHash: 'x' } })).id;
  adminId = (await prisma.user.create({ data: { name: 'Admin P', email: `pv-a-${sfx}@t.local`, role: 'ADMIN', passwordHash: 'x' } })).id;
  coordId = (await prisma.user.create({ data: { name: 'Coord P', email: `pv-c-${sfx}@t.local`, role: 'COORDINATOR', passwordHash: 'x' } })).id;
  caixaId = (await prisma.user.create({ data: { name: 'Caixa P', email: `pv-x-${sfx}@t.local`, role: 'CASHIER', passwordHash: 'x' } })).id;
  await prisma.unitMembership.create({ data: { userId: gerenteId, unitId } });
  setorBebidas = (await prisma.cdSector.create({ data: { name: `Bebidas PV ${sfx}` } })).id;
  coca = (await prisma.product.create({ data: { name: `Coca-Cola PET 2 L ${sfx}`, origin: 'CD', category: 'Bebidas', measure: 'un', cdSectorId: setorBebidas, barcode: cod(1), barcodes: { create: { code: cod(1) } } } })).id;
  acucar = (await prisma.product.create({ data: { name: `Açúcar Cristal KG ${sfx}`, origin: 'CD', category: 'Secos', measure: 'kg', cdSectorId: setorBebidas } })).id;
  criados.push(coca, acucar);
});

afterAll(async () => {
  await prisma.productRequest.deleteMany({ where: { unitId } });
  await prisma.product.deleteMany({ where: { id: { in: criados } } });
  await prisma.product.deleteMany({ where: { createdById: gerenteId } });
  await prisma.cdSector.deleteMany({ where: { id: setorBebidas } });
  await prisma.notification.deleteMany({ where: { userId: { in: [adminId, coordId] } } });
  await prisma.auditLog.deleteMany({ where: { userId: { in: [gerenteId, adminId, coordId] } } });
  await prisma.unitMembership.deleteMany({ where: { unitId } });
  await prisma.unit.delete({ where: { id: unitId } });
  await prisma.user.deleteMany({ where: { id: { in: [gerenteId, adminId, coordId, caixaId] } } });
});

describe('vincular código pelo pedido — permanente, pelo GERENTE', () => {
  it('o gerente vincula um código novo ao açúcar e o produto passa a responder por ele', async () => {
    const r = await vincularCodigoPeloPedido(gerente(), acucar, cod(2));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.jaExistia).toBe(false);
      expect(r.produto.barcodes).toContain(cod(2));
    }
    const dono = await prisma.productBarcode.findUnique({ where: { code: cod(2) }, select: { productId: true, createdById: true } });
    expect(dono?.productId).toBe(acucar);
    expect(dono?.createdById).toBe(gerenteId);
  });

  it('vincular de novo o mesmo código ao mesmo produto é idempotente', async () => {
    const r = await vincularCodigoPeloPedido(gerente(), acucar, cod(2));
    expect(r).toMatchObject({ ok: true, jaExistia: true });
  });

  it('um código responde por UM produto: o da Coca não vai para o açúcar, e a recusa diz de quem é', async () => {
    const r = await vincularCodigoPeloPedido(gerente(), acucar, cod(1));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe('JA_USADO');
      expect(r.message).toContain('Coca-Cola');
    }
  });

  it('código curto e produto inexistente são recusados; CAIXA não vincula', async () => {
    expect(await vincularCodigoPeloPedido(gerente(), acucar, '123')).toMatchObject({ ok: false, reason: 'INVALID' });
    expect(await vincularCodigoPeloPedido(gerente(), 'nao-existe', cod(3))).toMatchObject({ ok: false, reason: 'NAO_ENCONTRADO' });
    expect(await vincularCodigoPeloPedido(caixa(), acucar, cod(3))).toMatchObject({ ok: false, reason: 'FORBIDDEN' });
  });

  it('o vínculo entra na Auditoria com a origem "pedido"', async () => {
    const log = await prisma.auditLog.findFirst({ where: { userId: gerenteId, action: 'PRODUCT_BARCODE_ADD', entityId: acucar } });
    expect(log).not.toBeNull();
    expect((log?.metadata as { origem?: string })?.origem).toBe('pedido');
  });
});

describe('possíveis duplicados', () => {
  it('"COCA COLA 2L" acha a Coca-Cola PET 2 L já cadastrada', async () => {
    const d = await duplicadosProvaveis(`COCA COLA 2L ${sfx}`);
    expect(d[0]?.produto.id).toBe(coca);
  });

  it('nome sem parecido devolve vazio', async () => {
    /* Tokens que não existem em produto nenhum: o catálogo de dev é
       compartilhado, e um nome "normal" pode casar com o que outra pessoa
       cadastrou ontem. */
    expect(await duplicadosProvaveis(`qzxv${sfx} plmk${sfx} wrtn${sfx}`)).toEqual([]);
  });
});

describe('cadastro PROVISÓRIO pelo gerente', () => {
  let biscoito: string;

  it('nasce PENDENTE, do CD, SEM setor, com o código já vinculado e quem criou', async () => {
    const r = await cadastrarProvisorio(gerente(), { name: `Biscoito XYZ 400g ${sfx}`, codigo: cod(4), packType: 'FARDO', packSize: 20 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    biscoito = r.produto.id;
    criados.push(biscoito);
    expect(r.produto.validation).toBe('PENDENTE');
    expect(r.produto.origin).toBe('CD');
    expect(r.produto.barcodes).toContain(cod(4));
    const p = await prisma.product.findUniqueOrThrow({ where: { id: biscoito } });
    expect(p.cdSectorId).toBeNull();
    expect(p.createdById).toBe(gerenteId);
    expect(p.createdByName).toBe('Gerente P');
    expect(p.packType).toBe('FARDO');
    expect(p.packSize).toBe(20);
  });

  it('o código já responde pelo provisório: cadastrar de novo com o mesmo código é recusado apontando o dono', async () => {
    const r = await cadastrarProvisorio(gerente(), { name: `Outro nome ${sfx}`, codigo: cod(4) });
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.reason).toBe('JA_VINCULADO'); expect(r.message).toContain('Biscoito'); }
  });

  it('fardo sem "unidades por fardo" e nome curto são recusados', async () => {
    expect(await cadastrarProvisorio(gerente(), { name: `Massa Pronta ${sfx}`, packType: 'FARDO', packSize: null })).toMatchObject({ ok: false, reason: 'INVALID' });
    expect(await cadastrarProvisorio(gerente(), { name: 'ab' })).toMatchObject({ ok: false, reason: 'INVALID' });
  });

  it('o provisório JÁ entra no pedido — sem setor, contado em semSetor', async () => {
    const r = await criarPedido(gerente(), { unitId, items: [{ productId: biscoito, qty: 2, packUnit: 'FARDO' }, { productId: coca, qty: 1 }] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.semSetor).toBe(1);
    const itens = await prisma.productRequestItem.findMany({ where: { requestId: r.pedidos[0].id } });
    const doBiscoito = itens.find((i) => i.productId === biscoito);
    expect(doBiscoito?.cdSectorId).toBeNull();
    expect(doBiscoito?.packUnit).toBe('FARDO');
  });

  it('Admin e Coordenação são avisados; a Auditoria registra a criação', async () => {
    const [a, c] = await Promise.all([
      prisma.notification.findFirst({ where: { userId: adminId, title: 'Novo produto aguardando validação' } }),
      prisma.notification.findFirst({ where: { userId: coordId, title: 'Novo produto aguardando validação' } }),
    ]);
    expect(a?.body).toContain('Biscoito');
    expect(c?.body).toContain('Gerente P');
    const log = await prisma.auditLog.findFirst({ where: { action: 'PRODUCT_PROVISIONAL_CREATE', entityId: biscoito } });
    expect(log?.userId).toBe(gerenteId);
    expect(await pendentesDeValidacao()).toBeGreaterThanOrEqual(1);
  });

  it('validar SEM setor é recusado (SEM_SETOR); com setor, o Coordenador valida e fica registrado', async () => {
    expect(await validarProduto(coordenador(), biscoito)).toEqual({ ok: false, reason: 'SEM_SETOR' });
    await prisma.product.update({ where: { id: biscoito }, data: { cdSectorId: setorBebidas } });
    expect(await validarProduto(caixa(), biscoito)).toEqual({ ok: false, reason: 'FORBIDDEN' });
    expect(await validarProduto(coordenador(), biscoito)).toEqual({ ok: true });
    const p = await prisma.product.findUniqueOrThrow({ where: { id: biscoito } });
    expect(p.validation).toBe('VALIDADO');
    expect(p.validatedById).toBe(coordId);
    expect(p.validatedAt).not.toBeNull();
    /* Validar de novo é idempotente. */
    expect(await validarProduto(admin(), biscoito)).toEqual({ ok: true });
    expect(await validarProduto(admin(), 'nao-existe')).toEqual({ ok: false, reason: 'NAO_ENCONTRADO' });
  });
});
