import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import type { SessionUser } from '@/lib/auth/session';
import { effectivePermissions } from '@/lib/permissions';
import { enviarPedido, getPedido, listarPedidosDaUnidade, listarRecebidos, marcarSecao } from '@/lib/pedidos/pedidos';

/**
 * PEDIDOS POR SETOR (v1.185.0) contra o banco: enviar (só setores com linha),
 * quem vê o quê (unidade × separador do setor × Admin), receber/atender por
 * bloco com a situação do pedido derivada, os avisos e a matriz do Separador.
 */
const sfx = `ped${process.pid.toString(36)}`;
let unitId = ''; let outraUnit = ''; let setorA = ''; let setorB = ''; let setorC = '';
let gerente: SessionUser; let outroGerente: SessionUser; let sepA: SessionUser; let sepB: SessionUser; let admin: SessionUser;
const ids = { pedido: '' };

beforeAll(async () => {
  unitId = (await prisma.unit.create({ data: { code: `PED-${sfx}`, name: `Pedidos ${sfx}`, timezone: 'America/Sao_Paulo', cutoffHour: 4 } })).id;
  outraUnit = (await prisma.unit.create({ data: { code: `PED-O-${sfx}`, name: `Outra ${sfx}`, timezone: 'America/Sao_Paulo', cutoffHour: 4 } })).id;
  setorA = (await prisma.cdSector.create({ data: { name: `CÂMARAS ${sfx}`, order: 1 } })).id;
  setorB = (await prisma.cdSector.create({ data: { name: `SALGADOS ${sfx}`, order: 2 } })).id;
  setorC = (await prisma.cdSector.create({ data: { name: `BEBIDAS ${sfx}`, order: 3 } })).id;
  const g = await prisma.user.create({ data: { name: `Ger ${sfx}`, email: `g-${sfx}@e.com`, role: 'MANAGER', passwordHash: 'x', memberships: { create: { unitId } } } });
  const og = await prisma.user.create({ data: { name: `Ger outra ${sfx}`, email: `og-${sfx}@e.com`, role: 'MANAGER', passwordHash: 'x', memberships: { create: { unitId: outraUnit } } } });
  const a = await prisma.user.create({ data: { name: `Sep A ${sfx}`, email: `sa-${sfx}@e.com`, role: 'SEPARATOR', passwordHash: 'x', cdSectorId: setorA } });
  const b = await prisma.user.create({ data: { name: `Sep B ${sfx}`, email: `sb-${sfx}@e.com`, role: 'SEPARATOR', passwordHash: 'x', cdSectorId: setorB } });
  const ad = await prisma.user.create({ data: { name: `Adm ${sfx}`, email: `ad-${sfx}@e.com`, role: 'ADMIN', passwordHash: 'x' } });
  gerente = { id: g.id, name: g.name, role: 'MANAGER', unitIds: [unitId], seesAllUnits: false, needsTerms: false };
  outroGerente = { id: og.id, name: og.name, role: 'MANAGER', unitIds: [outraUnit], seesAllUnits: false, needsTerms: false };
  sepA = { id: a.id, name: a.name, role: 'SEPARATOR', unitIds: [], seesAllUnits: false, needsTerms: false };
  sepB = { id: b.id, name: b.name, role: 'SEPARATOR', unitIds: [], seesAllUnits: false, needsTerms: false };
  admin = { id: ad.id, name: ad.name, role: 'ADMIN', unitIds: [], seesAllUnits: true, needsTerms: false };
});
afterAll(async () => {
  await prisma.sectorOrder.deleteMany({ where: { unitId: { in: [unitId, outraUnit] } } });
  await prisma.auditLog.deleteMany({ where: { unitId: { in: [unitId, outraUnit] } } });
  await prisma.notification.deleteMany({ where: { userId: { in: [gerente.id, outroGerente.id, sepA.id, sepB.id, admin.id] } } });
  await prisma.user.deleteMany({ where: { id: { in: [gerente.id, outroGerente.id, sepA.id, sepB.id, admin.id] } } });
  await prisma.cdSector.deleteMany({ where: { id: { in: [setorA, setorB, setorC] } } });
  await prisma.unit.deleteMany({ where: { id: { in: [unitId, outraUnit] } } });
});

describe('enviar', () => {
  it('o separador não envia; outra unidade é barrada; sem linha nenhuma é inválido; o pedido nasce com os blocos dos setores que têm linha', async () => {
    const textos = { [setorA]: '2 requeijão moedense balcão\n10 mussarela fatiado', [setorB]: '1 cx coxinha camarão', [setorC]: '   \n' };
    expect(await enviarPedido(sepA, { unitId, destino: 'CD', textos })).toMatchObject({ ok: false, reason: 'FORBIDDEN' });
    expect(await enviarPedido(outroGerente, { unitId, destino: 'CD', textos })).toMatchObject({ ok: false, reason: 'FORBIDDEN' });
    expect(await enviarPedido(gerente, { unitId, destino: 'XPTO', textos })).toMatchObject({ ok: false, reason: 'INVALID' });
    expect(await enviarPedido(gerente, { unitId, destino: 'CD', textos: { [setorC]: '\n  ' } })).toMatchObject({ ok: false, reason: 'INVALID' });
    const r = await enviarPedido(gerente, { unitId, destino: 'CD', textos, observacao: 'entregar até sexta' });
    expect(r.ok).toBe(true);
    ids.pedido = (r as { id: string }).id;
    const p = await getPedido(gerente, ids.pedido);
    expect(p?.status).toBe('ENVIADO');
    expect(p?.note).toBe('entregar até sexta');
    expect(p?.secoes.map((s) => [s.sectorName, s.lines.length, s.status])).toEqual([[`CÂMARAS ${sfx}`, 2, 'ENVIADO'], [`SALGADOS ${sfx}`, 1, 'ENVIADO']]);
    expect((r as { number: number }).number).toBeGreaterThan(0);
    /* avisos: os dois separadores dos setores envolvidos; o do setor C (sem linha) não */
    expect(await prisma.notification.count({ where: { userId: sepA.id, title: { contains: `Pedido nº ${(r as { number: number }).number}` } } })).toBe(1);
    expect(await prisma.notification.count({ where: { userId: sepB.id, title: { contains: `Pedido nº ${(r as { number: number }).number}` } } })).toBe(1);
  });

  it('quem vê o quê: a unidade vê o pedido inteiro; o separador vê só o bloco do seu setor; outra unidade não vê', async () => {
    expect((await listarPedidosDaUnidade(gerente)).map((p) => p.id)).toContain(ids.pedido);
    expect((await listarPedidosDaUnidade(outroGerente)).map((p) => p.id)).not.toContain(ids.pedido);
    expect(await getPedido(outroGerente, ids.pedido)).toBeNull();
    expect((await getPedido(sepA, ids.pedido))?.secoes).toHaveLength(2); // abrir o pedido mostra inteiro (o separador foi avisado dele)
    const caixaA = await listarRecebidos(sepA, { abertos: true });
    const meu = caixaA.find((p) => p.id === ids.pedido)!;
    expect(meu.secoes.map((s) => s.sectorId)).toEqual([setorA]); // na caixa de entrada, só o bloco dele
    const caixaAdmin = await listarRecebidos(admin, { abertos: true });
    expect(caixaAdmin.find((p) => p.id === ids.pedido)?.secoes).toHaveLength(2);
    expect(await listarRecebidos(gerente)).toEqual([]); // gerente não atende
  });
});

describe('receber e atender', () => {
  it('o separador só marca o próprio setor; receber → Recebido; atender → Atendido; o pedido fica Atendido quando TODOS os blocos atenderam', async () => {
    const p = (await getPedido(admin, ids.pedido))!;
    const blocoA = p.secoes.find((s) => s.sectorId === setorA)!;
    const blocoB = p.secoes.find((s) => s.sectorId === setorB)!;
    expect(await marcarSecao(gerente, blocoA.id, 'receber')).toMatchObject({ ok: false, reason: 'FORBIDDEN' });
    expect(await marcarSecao(sepB, blocoA.id, 'receber')).toMatchObject({ ok: false, reason: 'FORBIDDEN' });
    expect(await marcarSecao(sepA, blocoA.id, 'receber')).toMatchObject({ ok: true });
    expect(await marcarSecao(sepA, blocoA.id, 'receber')).toMatchObject({ ok: false, reason: 'ESTADO' });
    let depois = (await getPedido(admin, ids.pedido))!;
    expect(depois.status).toBe('RECEBIDO');
    expect(depois.secoes.find((s) => s.id === blocoA.id)).toMatchObject({ status: 'RECEBIDO', receivedByName: sepA.name });

    expect(await marcarSecao(sepA, blocoA.id, 'atender')).toMatchObject({ ok: true });
    depois = (await getPedido(admin, ids.pedido))!;
    expect(depois.status).toBe('RECEBIDO'); // o B ainda está aberto
    expect(depois.attendedAt).toBeNull();
    expect((await listarRecebidos(sepA, { abertos: true })).map((x) => x.id)).not.toContain(ids.pedido);
    expect((await listarRecebidos(sepA, { abertos: false })).map((x) => x.id)).toContain(ids.pedido);
    /* quem enviou é avisado do setor atendido */
    expect(await prisma.notification.count({ where: { userId: gerente.id, title: { contains: 'atendido' } } })).toBe(1);

    /* o Admin atende o B direto de Enviado (recebido e atendido ao mesmo tempo) → pedido inteiro Atendido */
    expect(await marcarSecao(admin, blocoB.id, 'atender')).toMatchObject({ ok: true });
    depois = (await getPedido(admin, ids.pedido))!;
    expect(depois.status).toBe('ATENDIDO');
    expect(depois.attendedAt).not.toBeNull();
    expect(depois.secoes.find((s) => s.id === blocoB.id)).toMatchObject({ status: 'ATENDIDO', receivedByName: admin.name, attendedByName: admin.name });
    expect(await marcarSecao(admin, blocoB.id, 'atender')).toMatchObject({ ok: false, reason: 'ESTADO' });
    expect(await prisma.notification.count({ where: { userId: gerente.id, title: `Pedido nº ${depois.number} atendido` } })).toBe(1);
  });

  it('destino Fábrica: ninguém do CD é avisado, os Admins são', async () => {
    const r = await enviarPedido(gerente, { unitId, destino: 'FABRICA', textos: { [setorA]: '1 cx picanha' } });
    expect(r.ok).toBe(true);
    const numero = (r as { number: number }).number;
    expect(await prisma.notification.count({ where: { userId: sepA.id, title: { contains: `Pedido nº ${numero}` } } })).toBe(0);
    expect(await prisma.notification.count({ where: { userId: admin.id, title: { contains: `Pedido nº ${numero}` } } })).toBe(1);
    expect((await listarRecebidos(admin, { abertos: true, destino: 'FABRICA' })).map((p) => p.id)).toContain((r as { id: string }).id);
    expect((await listarRecebidos(admin, { abertos: true, destino: 'CD' })).map((p) => p.id)).not.toContain((r as { id: string }).id);
  });

  it('matriz: o Separador nasce com a caixa de entrada e sem a tela de pedir; o gerente perdeu os Pedidos Internos (inativo)', async () => {
    const sep = await effectivePermissions('SEPARATOR');
    expect(sep.ORDERS_INBOX).toEqual({ canView: true, canEdit: true });
    expect(sep.ORDERS.canView).toBe(false);
    expect(sep.PRODUCT_SEPARATION.canView).toBe(true);
    const ger = await effectivePermissions('MANAGER');
    expect(ger.ORDERS).toEqual({ canView: true, canEdit: true });
    expect(ger.ORDERS_INBOX.canView).toBe(false);
    expect(ger.PRODUCTS).toEqual({ canView: false, canEdit: false });
  });
});
