import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { adicionarCodigo, alterarEmLote, atualizarProduto, getFicha, removerCodigo, revisarCodigo, transferirCodigo } from '@/lib/products/ficha';
import { pendenciasDeCadastro } from '@/lib/products/pendencias';
import { paresDuplicados } from '@/lib/products/similaridade';
import { cadastrarProvisorio } from '@/lib/products/cadastro-provisorio';
import type { SessionUser } from '@/lib/auth/session';

/**
 * A ficha do produto: corrigir o vínculo errado (transferir), com histórico
 * nos dois lados; nada de pedido já gravado muda; lote ignora e conta o que
 * não pode; pendências contam o que espera alguém.
 */

const sfx = `${process.pid.toString(36)}${Date.now().toString(36).slice(-4)}`;
let adminId: string; let coordId: string; let gerenteId: string; let caixaId: string;
let setor: string;
let cristal: string; let refinado: string;
const criados: string[] = [];

const admin = (): SessionUser => ({ id: adminId, name: 'Admin F', role: 'ADMIN', unitIds: [], seesAllUnits: true, needsTerms: false });
const coord = (): SessionUser => ({ id: coordId, name: 'Coord F', role: 'COORDINATOR', unitIds: [], seesAllUnits: false, needsTerms: false });
const gerente = (): SessionUser => ({ id: gerenteId, name: 'Gerente F', role: 'MANAGER', unitIds: [], seesAllUnits: false, needsTerms: false });
const caixa = (): SessionUser => ({ id: caixaId, name: 'Caixa F', role: 'CASHIER', unitIds: [], seesAllUnits: false, needsTerms: false });
const cod = (n: number) => `788${sfx.replace(/\D/g, '').padEnd(6, '3').slice(0, 6)}${String(n).padStart(4, '0')}`;

beforeAll(async () => {
  adminId = (await prisma.user.create({ data: { name: 'Admin F', email: `pf-a-${sfx}@t.local`, role: 'ADMIN', passwordHash: 'x' } })).id;
  coordId = (await prisma.user.create({ data: { name: 'Coord F', email: `pf-c-${sfx}@t.local`, role: 'COORDINATOR', passwordHash: 'x' } })).id;
  gerenteId = (await prisma.user.create({ data: { name: 'Gerente F', email: `pf-g-${sfx}@t.local`, role: 'MANAGER', passwordHash: 'x' } })).id;
  caixaId = (await prisma.user.create({ data: { name: 'Caixa F', email: `pf-x-${sfx}@t.local`, role: 'CASHIER', passwordHash: 'x' } })).id;
  setor = (await prisma.cdSector.create({ data: { name: `Secos F ${sfx}` } })).id;
  cristal = (await prisma.product.create({ data: { name: `Açúcar Cristal KG ${sfx}`, origin: 'CD', category: 'Secos', measure: 'kg', cdSectorId: setor, barcode: cod(1), barcodes: { create: { code: cod(1), reviewedAt: new Date() } } } })).id;
  refinado = (await prisma.product.create({ data: { name: `Açúcar Refinado 1kg ${sfx}`, origin: 'CD', category: 'Secos', measure: 'kg', cdSectorId: setor } })).id;
  criados.push(cristal, refinado);
});

afterAll(async () => {
  await prisma.productBarcodeChange.deleteMany({ where: { OR: [{ fromProductId: { in: criados } }, { toProductId: { in: criados } }] } });
  await prisma.product.deleteMany({ where: { id: { in: criados } } });
  await prisma.product.deleteMany({ where: { createdById: gerenteId } });
  await prisma.cdSector.deleteMany({ where: { id: setor } });
  await prisma.notification.deleteMany({ where: { userId: { in: [adminId, coordId] } } });
  await prisma.auditLog.deleteMany({ where: { userId: { in: [adminId, coordId, gerenteId] } } });
  await prisma.user.deleteMany({ where: { id: { in: [adminId, coordId, gerenteId, caixaId] } } });
});

describe('ficha: abrir e editar', () => {
  it('abre com códigos, principal marcado, e só para quem mantém o catálogo', async () => {
    const f = await getFicha(coord(), cristal);
    expect(f?.codigos.map((c) => [c.code, c.principal])).toEqual([[cod(1), true]]);
    expect(await getFicha(gerente(), cristal)).toBeNull();
  });

  it('salva só o que mudou e audita antes/depois; CD validado não fica sem setor', async () => {
    const r = await atualizarProduto(admin(), cristal, { category: 'Mercearia', packType: 'FARDO', packSize: 10 });
    expect(r).toEqual({ ok: true });
    const log = await prisma.auditLog.findFirst({ where: { action: 'PRODUCT_UPDATE', entityId: cristal }, orderBy: { createdAt: 'desc' } });
    const m = log?.metadata as { antes: Record<string, unknown>; depois: Record<string, unknown> };
    expect(m.antes).toMatchObject({ category: 'Secos', packType: 'UN' });
    expect(m.depois).toMatchObject({ category: 'Mercearia', packType: 'FARDO', packSize: 10 });
    expect(Object.keys(m.antes)).not.toContain('name'); // nome não mudou: não entra no diff

    expect(await atualizarProduto(admin(), cristal, { cdSectorId: null })).toEqual({ ok: false, reason: 'SEM_SETOR' });
    expect(await atualizarProduto(admin(), cristal, { packType: 'DISPLAY', packSize: null })).toMatchObject({ ok: false, reason: 'INVALID' });
    expect(await atualizarProduto(caixa(), cristal, { name: 'x' })).toEqual({ ok: false, reason: 'FORBIDDEN' });
  });

  it('trocar a origem para Fábrica limpa o setor em vez de deixar dado órfão', async () => {
    const f = (await prisma.product.create({ data: { name: `Pão de queijo ${sfx}`, origin: 'CD', category: 'Congelados', measure: 'kg', cdSectorId: setor } })).id;
    criados.push(f);
    expect(await atualizarProduto(admin(), f, { origin: 'FABRICA' })).toEqual({ ok: true });
    const p = await prisma.product.findUniqueOrThrow({ where: { id: f } });
    expect(p.origin).toBe('FABRICA');
    expect(p.cdSectorId).toBeNull();
  });
});

describe('códigos: adicionar, transferir, remover — com histórico', () => {
  it('o gerente vinculou ao cristal o código que era do refinado; o Admin TRANSFERE, e fica no histórico dos dois', async () => {
    /* O vínculo errado, como acontece: pelo pedido. */
    await prisma.productBarcode.create({ data: { productId: cristal, code: cod(2), createdById: gerenteId } });

    const r = await transferirCodigo(admin(), cod(2), refinado, 'código era do refinado, gerente vinculou no cristal');
    expect(r).toEqual({ ok: true });

    const dono = await prisma.productBarcode.findUnique({ where: { code: cod(2) } });
    expect(dono?.productId).toBe(refinado);
    expect(dono?.reviewedAt).not.toBeNull(); // quem transfere já revisou
    const ref = await prisma.product.findUniqueOrThrow({ where: { id: refinado } });
    expect(ref.barcode).toBe(cod(2)); // virou o principal do destino, que não tinha

    const [fCristal, fRefinado] = await Promise.all([getFicha(admin(), cristal), getFicha(admin(), refinado)]);
    expect(fCristal?.historico[0]).toMatchObject({ code: cod(2), action: 'TRANSFER', fromProductName: expect.stringContaining('Cristal'), toProductName: expect.stringContaining('Refinado'), userName: 'Admin F', reason: 'código era do refinado, gerente vinculou no cristal' });
    expect(fRefinado?.historico[0]).toMatchObject({ code: cod(2), action: 'TRANSFER' });
    expect(fCristal?.codigos.map((c) => c.code)).toEqual([cod(1)]);
  });

  it('adicionar recusa código de OUTRO produto e diz de quem é; tornar principal funciona', async () => {
    const r = await adicionarCodigo(coord(), cristal, cod(2));
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.reason).toBe('JA_USADO'); expect(r.message).toContain('Refinado'); }

    expect(await adicionarCodigo(coord(), cristal, cod(3))).toEqual({ ok: true });
    expect(await adicionarCodigo(coord(), cristal, cod(3), { principal: true })).toEqual({ ok: true });
    const p = await prisma.product.findUniqueOrThrow({ where: { id: cristal } });
    expect(p.barcode).toBe(cod(3));
    expect(await adicionarCodigo(coord(), cristal, '123')).toMatchObject({ ok: false, reason: 'INVALID' });
  });

  it('remover o principal promove o próximo código; remover código que não é dele é recusado', async () => {
    expect(await removerCodigo(admin(), cristal, cod(3))).toEqual({ ok: true });
    const p = await prisma.product.findUniqueOrThrow({ where: { id: cristal } });
    expect(p.barcode).toBe(cod(1));
    expect(await removerCodigo(admin(), cristal, cod(2))).toMatchObject({ ok: false, reason: 'NAO_ENCONTRADO' });
    const f = await getFicha(admin(), cristal);
    expect(f?.historico.some((h) => h.action === 'REMOVE' && h.code === cod(3))).toBe(true);
  });

  it('transferir código que não existe manda usar Adicionar; para o mesmo produto é idempotente', async () => {
    expect(await transferirCodigo(admin(), cod(9), refinado)).toMatchObject({ ok: false, reason: 'NAO_ENCONTRADO' });
    expect(await transferirCodigo(admin(), cod(2), refinado)).toEqual({ ok: true });
  });
});

describe('pendências de cadastro', () => {
  it('conta provisórios, códigos novos (não revisados), sem setor, duplicidades e embalagem indefinida', async () => {
    const prov = await cadastrarProvisorio(gerente(), { name: `Biscoito Água e Sal ${sfx}`, codigo: cod(5), packType: 'FARDO', packSize: 20 });
    expect(prov.ok).toBe(true);
    const dup = (await prisma.product.create({ data: { name: `Acucar Cristal 1 KG ${sfx}`, origin: 'CD', category: 'Secos', measure: 'kg', cdSectorId: setor } })).id;
    const semQtd = (await prisma.product.create({ data: { name: `Guardanapo ${sfx}`, origin: 'CD', category: 'Descartáveis', measure: 'un', cdSectorId: setor, packType: 'DISPLAY', packSize: null } })).id;
    criados.push(dup, semQtd);

    const p = await pendenciasDeCadastro();
    expect(p.novos.some((n) => n.name.includes('Biscoito Água'))).toBe(true);
    expect(p.codigosNovos.some((c) => c.code === cod(5) && c.createdByName === 'Gerente F')).toBe(true);
    expect(p.semSetor).toBeGreaterThanOrEqual(1);
    expect(p.duplicidades.some((d) => [d.aName, d.bName].join(' ').includes('Cristal'))).toBe(true);
    expect(p.embalagemIndefinida.some((e) => e.id === semQtd)).toBe(true);

    /* Revisar tira o código da fila. */
    expect(await revisarCodigo(coord(), cod(5))).toEqual({ ok: true });
    const depois = await pendenciasDeCadastro();
    expect(depois.codigosNovos.some((c) => c.code === cod(5))).toBe(false);
  });

  it('paresDuplicados é simétrico: "Arroz" NÃO é par de "Arroz Tio João 5kg"', () => {
    const pares = paresDuplicados([{ id: '1', name: 'Arroz' }, { id: '2', name: 'Arroz Tio João 5kg' }, { id: '3', name: 'Arroz Tio Joao 5 kg' }]);
    expect(pares.map((p) => [p.a.id, p.b.id])).toEqual([['2', '3']]);
  });
});

describe('alteração em lote', () => {
  it('aplica setor/origem/ativo a vários; ignora e CONTA o que não pode (CD validado sem setor)', async () => {
    const a = (await prisma.product.create({ data: { name: `Lote A ${sfx}`, origin: 'FABRICA', category: 'Geral', measure: 'un' } })).id;
    const b = (await prisma.product.create({ data: { name: `Lote B ${sfx}`, origin: 'FABRICA', category: 'Geral', measure: 'un' } })).id;
    criados.push(a, b);

    /* Virar CD SEM setor: nenhum pode (validados) — 0 aplicados, 2 ignorados. */
    expect(await alterarEmLote(admin(), [a, b], { origin: 'CD' })).toEqual({ ok: true, aplicados: 0, ignorados: 2 });
    /* Virar CD COM setor: os dois. */
    expect(await alterarEmLote(admin(), [a, b], { origin: 'CD', cdSectorId: setor })).toEqual({ ok: true, aplicados: 2, ignorados: 0 });
    const pa = await prisma.product.findUniqueOrThrow({ where: { id: a } });
    expect(pa.origin).toBe('CD'); expect(pa.cdSectorId).toBe(setor);
    /* Desativar em lote. */
    expect(await alterarEmLote(coord(), [a, b], { active: false })).toEqual({ ok: true, aplicados: 2, ignorados: 0 });
    expect((await prisma.product.findUniqueOrThrow({ where: { id: b } })).active).toBe(false);

    expect(await alterarEmLote(admin(), [a], {})).toEqual({ ok: false, reason: 'INVALID' });
    expect(await alterarEmLote(admin(), [a], { cdSectorId: 'nao-existe' })).toEqual({ ok: false, reason: 'INVALID' });
    expect(await alterarEmLote(gerente(), [a], { active: true })).toEqual({ ok: false, reason: 'FORBIDDEN' });
    const log = await prisma.auditLog.findFirst({ where: { action: 'PRODUCT_BULK_UPDATE', userId: adminId }, orderBy: { createdAt: 'desc' } });
    expect(log).not.toBeNull();
  });
});
