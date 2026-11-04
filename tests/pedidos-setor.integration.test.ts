import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import type { SessionUser } from '@/lib/auth/session';
import { effectivePermissions } from '@/lib/permissions';
import { enviarPedido, getPedido, listarPedidosDaUnidade, listarRecebidos, marcarSecao } from '@/lib/pedidos/pedidos';
import { criarSetorDoCd, definirDestinoDoSetor, listarSetoresDoCd } from '@/lib/products/setores';

/**
 * PEDIDOS POR SETOR (v1.185.0 · v1.187.0) contra o banco: enviar (só setores
 * com linha, cada bloco com o DESTINO do setor congelado), quem vê o quê
 * (unidade × separador do setor × Admin, filtro por destino), receber/atender
 * por bloco com a situação do pedido derivada, os avisos e a matriz do Separador.
 */
const sfx = `ped${process.pid.toString(36)}`;
let unitId = ''; let outraUnit = ''; let setorA = ''; let setorB = ''; let setorC = ''; let setorD = '';
let gerente: SessionUser; let outroGerente: SessionUser; let sepA: SessionUser; let sepB: SessionUser; let admin: SessionUser;
const ids = { pedido: '' };

beforeAll(async () => {
  unitId = (await prisma.unit.create({ data: { code: `PED-${sfx}`, name: `Pedidos ${sfx}`, timezone: 'America/Sao_Paulo', cutoffHour: 4 } })).id;
  outraUnit = (await prisma.unit.create({ data: { code: `PED-O-${sfx}`, name: `Outra ${sfx}`, timezone: 'America/Sao_Paulo', cutoffHour: 4 } })).id;
  setorA = (await prisma.cdSector.create({ data: { name: `CÂMARAS ${sfx}`, order: 1, destination: 'FABRICA' } })).id;
  setorB = (await prisma.cdSector.create({ data: { name: `BEBIDAS ${sfx}`, order: 2, destination: 'CD' } })).id;
  setorC = (await prisma.cdSector.create({ data: { name: `SECOS ${sfx}`, order: 3, destination: 'CD' } })).id;
  setorD = (await prisma.cdSector.create({ data: { name: `ALMOX ${sfx}`, order: 4, destination: 'ALMOXARIFADO' } })).id;
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
  await prisma.cdSector.deleteMany({ where: { name: { endsWith: sfx } } });
  await prisma.unit.deleteMany({ where: { id: { in: [unitId, outraUnit] } } });
});

describe('enviar', () => {
  it('o separador não envia; outra unidade é barrada; o pedido nasce com os blocos dos setores que têm linha, cada um com o seu destino', async () => {
    const textos = { [setorA]: '2 requeijão moedense balcão\n10 mussarela fatiado', [setorB]: '6 cx coca', [setorD]: '1 vassoura', [setorC]: '   \n' };
    expect(await enviarPedido(sepA, { unitId, textos })).toMatchObject({ ok: false, reason: 'FORBIDDEN' });
    expect(await enviarPedido(outroGerente, { unitId, textos })).toMatchObject({ ok: false, reason: 'FORBIDDEN' });
    const r = await enviarPedido(gerente, { unitId, textos, observacao: 'entregar até sexta' });
    expect(r.ok).toBe(true);
    ids.pedido = (r as { id: string }).id;
    const p = await getPedido(gerente, ids.pedido);
    expect(p?.status).toBe('ENVIADO');
    expect(p?.note).toBe('entregar até sexta');
    expect(p?.destinos).toEqual(['FABRICA', 'CD', 'ALMOXARIFADO']);
    expect(p?.secoes.map((s) => [s.sectorName, s.destination, s.lines.length, s.status])).toEqual([
      [`CÂMARAS ${sfx}`, 'FABRICA', 2, 'ENVIADO'], [`BEBIDAS ${sfx}`, 'CD', 1, 'ENVIADO'], [`ALMOX ${sfx}`, 'ALMOXARIFADO', 1, 'ENVIADO'],
    ]);
    const numero = (r as { number: number }).number;
    expect(numero).toBeGreaterThan(0);
    /* avisos: os separadores dos setores envolvidos (A e B); o Almox não tem separador → os Admins */
    expect(await prisma.notification.count({ where: { userId: sepA.id, title: { contains: `Pedido nº ${numero}` } } })).toBe(1);
    expect(await prisma.notification.count({ where: { userId: sepB.id, title: { contains: `Pedido nº ${numero}` } } })).toBe(1);
    expect(await prisma.notification.count({ where: { userId: admin.id, title: { contains: `Pedido nº ${numero}` } } })).toBe(1);
  });

  it('v1.187.0: nada é obrigatório — o pedido vai só com a observação, e quem é avisado são os Admins', async () => {
    const r = await enviarPedido(gerente, { unitId, textos: { [setorC]: '\n  ' }, observacao: 'só a observação' });
    expect(r.ok).toBe(true);
    const p = await getPedido(gerente, (r as { id: string }).id);
    expect(p?.secoes).toEqual([]);
    expect(p?.destinos).toEqual([]);
    expect(await prisma.notification.count({ where: { userId: admin.id, title: { contains: `Pedido nº ${(r as { number: number }).number}` } } })).toBe(1);
    expect(await prisma.notification.count({ where: { userId: sepA.id, title: { contains: `Pedido nº ${(r as { number: number }).number}` } } })).toBe(0);
    expect((await listarRecebidos(admin, { abertos: true })).map((x) => x.id)).toContain((r as { id: string }).id); // o Admin vê (sem filtro)
    expect((await listarRecebidos(admin, { abertos: true, destino: 'CD' })).map((x) => x.id)).not.toContain((r as { id: string }).id);
    expect((await listarRecebidos(sepA, { abertos: true })).map((x) => x.id)).not.toContain((r as { id: string }).id);
    await prisma.sectorOrder.delete({ where: { id: (r as { id: string }).id } });
  });

  it('quem vê o quê: a unidade vê o pedido inteiro; o separador vê só o bloco do seu setor; o Admin filtra por destino; outra unidade não vê', async () => {
    expect((await listarPedidosDaUnidade(gerente)).map((p) => p.id)).toContain(ids.pedido);
    expect((await listarPedidosDaUnidade(outroGerente)).map((p) => p.id)).not.toContain(ids.pedido);
    expect(await getPedido(outroGerente, ids.pedido)).toBeNull();
    expect((await getPedido(sepA, ids.pedido))?.secoes).toHaveLength(3); // abrir o pedido mostra inteiro (o separador foi avisado dele)
    const caixaA = await listarRecebidos(sepA, { abertos: true });
    expect(caixaA.find((p) => p.id === ids.pedido)!.secoes.map((s) => s.sectorId)).toEqual([setorA]); // na caixa de entrada, só o bloco dele
    expect((await listarRecebidos(admin, { abertos: true })).find((p) => p.id === ids.pedido)?.secoes).toHaveLength(3);
    const soCd = (await listarRecebidos(admin, { abertos: true, destino: 'CD' })).find((p) => p.id === ids.pedido)!;
    expect(soCd.secoes.map((s) => s.destination)).toEqual(['CD']);
    const soAlmox = (await listarRecebidos(admin, { abertos: true, destino: 'ALMOXARIFADO' })).find((p) => p.id === ids.pedido)!;
    expect(soAlmox.secoes.map((s) => s.sectorId)).toEqual([setorD]);
    expect(await listarRecebidos(gerente)).toEqual([]); // gerente não atende
  });
});

describe('receber e atender', () => {
  it('o separador só marca o próprio setor; receber → Recebido; atender → Atendido; o pedido fica Atendido quando TODOS os blocos atenderam', async () => {
    const p = (await getPedido(admin, ids.pedido))!;
    const blocoA = p.secoes.find((s) => s.sectorId === setorA)!;
    const blocoB = p.secoes.find((s) => s.sectorId === setorB)!;
    const blocoD = p.secoes.find((s) => s.sectorId === setorD)!;
    expect(await marcarSecao(gerente, blocoA.id, 'receber')).toMatchObject({ ok: false, reason: 'FORBIDDEN' });
    expect(await marcarSecao(sepB, blocoA.id, 'receber')).toMatchObject({ ok: false, reason: 'FORBIDDEN' });
    expect(await marcarSecao(sepA, blocoA.id, 'receber')).toMatchObject({ ok: true });
    expect(await marcarSecao(sepA, blocoA.id, 'receber')).toMatchObject({ ok: false, reason: 'ESTADO' });
    let depois = (await getPedido(admin, ids.pedido))!;
    expect(depois.status).toBe('RECEBIDO');
    expect(depois.secoes.find((s) => s.id === blocoA.id)).toMatchObject({ status: 'RECEBIDO', receivedByName: sepA.name });

    expect(await marcarSecao(sepA, blocoA.id, 'atender')).toMatchObject({ ok: true });
    depois = (await getPedido(admin, ids.pedido))!;
    expect(depois.status).toBe('RECEBIDO'); // B e D ainda abertos
    expect(depois.attendedAt).toBeNull();
    expect((await listarRecebidos(sepA, { abertos: true })).map((x) => x.id)).not.toContain(ids.pedido);
    expect((await listarRecebidos(sepA, { abertos: false })).map((x) => x.id)).toContain(ids.pedido);
    /* quem enviou é avisado do setor atendido, com o destino */
    expect(await prisma.notification.count({ where: { userId: gerente.id, title: { contains: 'atendido' }, body: { contains: 'Fábrica' } } })).toBe(1);

    /* o Admin atende B e D direto de Enviado (recebido e atendido ao mesmo tempo) → pedido inteiro Atendido */
    expect(await marcarSecao(admin, blocoB.id, 'atender')).toMatchObject({ ok: true });
    expect(await marcarSecao(admin, blocoD.id, 'atender')).toMatchObject({ ok: true });
    depois = (await getPedido(admin, ids.pedido))!;
    expect(depois.status).toBe('ATENDIDO');
    expect(depois.attendedAt).not.toBeNull();
    expect(depois.secoes.find((s) => s.id === blocoB.id)).toMatchObject({ status: 'ATENDIDO', receivedByName: admin.name, attendedByName: admin.name });
    expect(await marcarSecao(admin, blocoB.id, 'atender')).toMatchObject({ ok: false, reason: 'ESTADO' });
    expect(await prisma.notification.count({ where: { userId: gerente.id, title: `Pedido nº ${depois.number} atendido` } })).toBe(1);
  });

  it('retrato: mudar o destino do setor vale para os pedidos NOVOS; o bloco já enviado guarda o destino do dia', async () => {
    expect(await definirDestinoDoSetor(gerente, { id: setorB, destination: 'FABRICA' })).toMatchObject({ ok: false, reason: 'FORBIDDEN' });
    expect(await definirDestinoDoSetor(admin, { id: setorB, destination: 'XPTO' })).toMatchObject({ ok: false, reason: 'INVALID' });
    expect(await definirDestinoDoSetor(admin, { id: setorB, destination: 'FABRICA' })).toEqual({ ok: true });
    expect((await listarSetoresDoCd()).find((s) => s.id === setorB)?.destination).toBe('FABRICA');
    const antigo = (await getPedido(admin, ids.pedido))!;
    expect(antigo.secoes.find((s) => s.sectorId === setorB)?.destination).toBe('CD');
    const r = await enviarPedido(gerente, { unitId, textos: { [setorB]: '1 cx guaraná' } });
    expect(r.ok).toBe(true);
    const novo = (await getPedido(admin, (r as { id: string }).id))!;
    expect(novo.secoes[0].destination).toBe('FABRICA');
    expect(novo.destinos).toEqual(['FABRICA']);
    expect(await prisma.auditLog.count({ where: { action: 'CD_SECTOR_DESTINATION', entityId: setorB } })).toBe(1);
  });

  it('setor criado sem destino nasce com o que o nome sugere; com destino informado, obedece', async () => {
    const carnes = await criarSetorDoCd(admin, `Carnes ${sfx}`);
    const papel = await criarSetorDoCd(admin, `Papelaria ${sfx}`, {}, 'ALMOXARIFADO');
    expect(carnes.ok && papel.ok).toBe(true);
    const lista = await listarSetoresDoCd();
    expect(lista.find((s) => s.name === `Carnes ${sfx}`)?.destination).toBe('FABRICA');
    expect(lista.find((s) => s.name === `Papelaria ${sfx}`)?.destination).toBe('ALMOXARIFADO');
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
