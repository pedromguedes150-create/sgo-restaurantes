import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import type { SessionUser } from '@/lib/auth/session';
import { effectivePermissions } from '@/lib/permissions';
import { editarPedido, enviarPedido, getPedido, listarPedidosDaUnidade, listarRecebidos, marcarSecao, moverLinha } from '@/lib/pedidos/pedidos';
import { createUser, updateUser } from '@/lib/admin';
import { criarSetorDoCd, definirDestinoDoSetor, listarSetoresDoCd } from '@/lib/products/setores';

/**
 * PEDIDOS POR SETOR (v1.185.0 → v1.189.0) contra o banco: enviar (só setores com
 * linha, cada bloco com o DESTINO do setor congelado), quem vê o quê (unidade ×
 * separador do(s) setor(es) × Admin, filtro por destino e situação), a EDIÇÃO
 * pelo gerente até o primeiro bloco entrar em separação, separar/atender por
 * bloco, MOVER um item para outro setor, o separador em VÁRIOS setores, os
 * avisos e a matriz do Separador.
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
  /* v1.189.0: o separador A separa CÂMARAS (principal) E SECOS (adicional) */
  const a = await prisma.user.create({ data: { name: `Sep A ${sfx}`, email: `sa-${sfx}@e.com`, role: 'SEPARATOR', passwordHash: 'x', cdSectorId: setorA, cdSectors: { create: { sectorId: setorC } } } });
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
  await prisma.user.deleteMany({ where: { email: { endsWith: `-${sfx}@e.com` } } });
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
    const id = (r as { id: string }).id;
    const p = await getPedido(gerente, id);
    expect(p?.secoes).toEqual([]);
    expect(p?.destinos).toEqual([]);
    expect(await prisma.notification.count({ where: { userId: admin.id, title: { contains: `Pedido nº ${(r as { number: number }).number}` } } })).toBe(1);
    expect(await prisma.notification.count({ where: { userId: sepA.id, title: { contains: `Pedido nº ${(r as { number: number }).number}` } } })).toBe(0);
    expect((await listarRecebidos(admin, { situacao: 'abertos' })).map((x) => x.id)).toContain(id); // o Admin vê (sem filtro)
    expect((await listarRecebidos(admin, { situacao: 'todos' })).map((x) => x.id)).toContain(id);
    expect((await listarRecebidos(admin, { situacao: 'atendidos' })).map((x) => x.id)).not.toContain(id);
    expect((await listarRecebidos(admin, { situacao: 'abertos', destino: 'CD' })).map((x) => x.id)).not.toContain(id);
    expect((await listarRecebidos(sepA, { situacao: 'abertos' })).map((x) => x.id)).not.toContain(id);
    await prisma.sectorOrder.delete({ where: { id } });
  });

  it('quem vê o quê: a unidade vê o pedido inteiro; o separador vê só os blocos dos SEUS setores; o Admin filtra por destino; outra unidade não vê', async () => {
    expect((await listarPedidosDaUnidade(gerente)).map((p) => p.id)).toContain(ids.pedido);
    expect((await listarPedidosDaUnidade(outroGerente)).map((p) => p.id)).not.toContain(ids.pedido);
    expect(await getPedido(outroGerente, ids.pedido)).toBeNull();
    expect((await getPedido(sepA, ids.pedido))?.secoes).toHaveLength(3); // abrir o pedido mostra inteiro (o separador foi avisado dele)
    const caixaA = await listarRecebidos(sepA); // padrão: todos
    expect(caixaA.find((p) => p.id === ids.pedido)!.secoes.map((s) => s.sectorId)).toEqual([setorA]); // na caixa de entrada, só os blocos dele (SECOS ainda não tem linha)
    expect((await listarRecebidos(admin, { situacao: 'abertos' })).find((p) => p.id === ids.pedido)?.secoes).toHaveLength(3);
    const soCd = (await listarRecebidos(admin, { situacao: 'abertos', destino: 'CD' })).find((p) => p.id === ids.pedido)!;
    expect(soCd.secoes.map((s) => s.destination)).toEqual(['CD']);
    const soAlmox = (await listarRecebidos(admin, { situacao: 'abertos', destino: 'ALMOXARIFADO' })).find((p) => p.id === ids.pedido)!;
    expect(soAlmox.secoes.map((s) => s.sectorId)).toEqual([setorD]);
    expect(await listarRecebidos(gerente)).toEqual([]); // gerente não atende
  });
});

describe('editar, mover, separar e atender', () => {
  it('o gerente edita o pedido enviado: altera, retira e acrescenta setor; outra unidade e o separador não editam', async () => {
    expect(await editarPedido(sepA, { id: ids.pedido, textos: {} })).toMatchObject({ ok: false, reason: 'FORBIDDEN' });
    expect(await editarPedido(outroGerente, { id: ids.pedido, textos: {} })).toMatchObject({ ok: false, reason: 'FORBIDDEN' });
    expect(await editarPedido(gerente, { id: 'nao-existe', textos: {} })).toMatchObject({ ok: false, reason: 'NOT_FOUND' });
    const r = await editarPedido(gerente, { id: ids.pedido, textos: { [setorA]: '2 requeijão moedense balcão\n10 mussarela fatiado\n5 presunto', [setorB]: '6 cx coca\n1 cx guaraná', [setorD]: '', [setorC]: '3 sacos de arroz' }, observacao: 'entregar até quinta' });
    expect(r).toMatchObject({ ok: true, id: ids.pedido });
    const p = (await getPedido(gerente, ids.pedido))!;
    expect(p.note).toBe('entregar até quinta');
    expect(p.secoes.map((s) => [s.sectorName, s.lines.length])).toEqual([[`CÂMARAS ${sfx}`, 3], [`BEBIDAS ${sfx}`, 2], [`SECOS ${sfx}`, 1]]); // Almox saiu, Secos entrou no fim
    expect(p.destinos).toEqual(['FABRICA', 'CD']);
    /* aviso só para os setores tocados: A (alterado) e Secos (novo) — os dois do separador A (principal + adicional); B foi alterado também */
    expect(await prisma.notification.count({ where: { userId: sepA.id, body: { contains: 'alterou' } } })).toBe(1);
    expect(await prisma.notification.count({ where: { userId: sepB.id, body: { contains: 'alterou' } } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: 'ORDER_EDITED', entityId: ids.pedido } })).toBe(1);
    /* v1.189.0: o separador A agora enxerga os dois blocos dele (CÂMARAS e SECOS) na caixa de entrada */
    expect((await listarRecebidos(sepA)).find((x) => x.id === ids.pedido)!.secoes.map((s) => s.sectorId).sort()).toEqual([setorA, setorC].sort());
  });

  it('v1.189.0: o item escrito no setor errado é MOVIDO por quem separa; o separador do setor certo é avisado', async () => {
    const p = (await getPedido(admin, ids.pedido))!;
    const blocoB = p.secoes.find((s) => s.sectorId === setorB)!;
    const idxGuarana = blocoB.lines.indexOf('1 cx guaraná');
    expect(await moverLinha(gerente, { sectionId: blocoB.id, linha: idxGuarana, paraSectorId: setorC })).toMatchObject({ ok: false, reason: 'FORBIDDEN' });
    expect(await moverLinha(sepA, { sectionId: blocoB.id, linha: idxGuarana, paraSectorId: setorC })).toMatchObject({ ok: false, reason: 'FORBIDDEN' }); // A não é do setor de origem (BEBIDAS)
    expect(await moverLinha(sepB, { sectionId: blocoB.id, linha: 9, paraSectorId: setorC })).toMatchObject({ ok: false, reason: 'INVALID' });
    expect(await moverLinha(sepB, { sectionId: blocoB.id, linha: idxGuarana, paraSectorId: setorB })).toMatchObject({ ok: false, reason: 'INVALID' });
    /* o separador B move "1 cx guaraná" de BEBIDAS para SECOS (bloco que já existe) */
    expect(await moverLinha(sepB, { sectionId: blocoB.id, linha: idxGuarana, paraSectorId: setorC })).toMatchObject({ ok: true, id: ids.pedido });
    let depois = (await getPedido(admin, ids.pedido))!;
    expect(depois.secoes.find((s) => s.sectorId === setorB)?.lines).toEqual(['6 cx coca']);
    expect(depois.secoes.find((s) => s.sectorId === setorC)?.lines).toEqual(['3 sacos de arroz', '1 cx guaraná']);
    expect(await prisma.notification.count({ where: { userId: sepA.id, title: { contains: 'item movido para' } } })).toBe(1); // A separa SECOS (adicional)
    expect(await prisma.notification.count({ where: { userId: gerente.id, title: { contains: 'item movido para' } } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: 'ORDER_LINE_MOVED', entityId: ids.pedido } })).toBe(1);
    /* o Admin move o único item de BEBIDAS para ALMOX (bloco novo, nasce com o destino do setor; BEBIDAS some) */
    const blocoB2 = depois.secoes.find((s) => s.sectorId === setorB)!;
    expect(await moverLinha(admin, { sectionId: blocoB2.id, linha: 0, paraSectorId: setorD })).toMatchObject({ ok: true });
    depois = (await getPedido(admin, ids.pedido))!;
    expect(depois.secoes.find((s) => s.sectorId === setorB)).toBeUndefined();
    expect(depois.secoes.find((s) => s.sectorId === setorD)).toMatchObject({ destination: 'ALMOXARIFADO', lines: ['6 cx coca'], status: 'ENVIADO' });
    expect(depois.destinos).toEqual(['FABRICA', 'CD', 'ALMOXARIFADO']);
    expect(await prisma.notification.count({ where: { userId: admin.id, title: { contains: 'item movido para' } } })).toBe(1); // Almox sem separador → Admins
  });

  it('o separador só marca os próprios setores; separar → Em separação FECHA o pedido para o gerente; atender → Atendido; o pedido fica Atendido quando TODOS os blocos atenderam', async () => {
    const p = (await getPedido(admin, ids.pedido))!;
    const blocoA = p.secoes.find((s) => s.sectorId === setorA)!;
    const blocoC = p.secoes.find((s) => s.sectorId === setorC)!;
    const blocoD = p.secoes.find((s) => s.sectorId === setorD)!;
    expect(await marcarSecao(gerente, blocoA.id, 'separar')).toMatchObject({ ok: false, reason: 'FORBIDDEN' });
    expect(await marcarSecao(sepB, blocoA.id, 'separar')).toMatchObject({ ok: false, reason: 'FORBIDDEN' });
    expect(await marcarSecao(sepA, blocoA.id, 'separar')).toMatchObject({ ok: true });
    expect(await marcarSecao(sepA, blocoA.id, 'separar')).toMatchObject({ ok: false, reason: 'ESTADO' });
    let depois = (await getPedido(admin, ids.pedido))!;
    expect(depois.status).toBe('EM_SEPARACAO');
    expect(depois.secoes.find((s) => s.id === blocoA.id)).toMatchObject({ status: 'EM_SEPARACAO', receivedByName: sepA.name });

    /* v1.189.0: no primeiro "Em separação" o pedido INTEIRO fecha para o gerente — até o bloco que ninguém pegou */
    const recusa = await editarPedido(gerente, { id: ids.pedido, textos: { [setorC]: '4 sacos de arroz' } });
    expect(recusa).toMatchObject({ ok: false, reason: 'ESTADO' });
    expect((recusa as { message: string }).message).toContain('em separação');
    expect((await getPedido(admin, ids.pedido))!.secoes.find((s) => s.sectorId === setorC)?.lines).toEqual(['3 sacos de arroz', '1 cx guaraná']);

    /* o separador A também atende SECOS (setor adicional) */
    expect(await marcarSecao(sepA, blocoC.id, 'atender')).toMatchObject({ ok: true });
    expect(await marcarSecao(sepA, blocoA.id, 'atender')).toMatchObject({ ok: true });
    /* bloco atendido não deixa mover item dele */
    expect(await moverLinha(sepA, { sectionId: blocoA.id, linha: 0, paraSectorId: setorC })).toMatchObject({ ok: false, reason: 'ESTADO' });
    depois = (await getPedido(admin, ids.pedido))!;
    expect(depois.status).toBe('EM_SEPARACAO'); // D ainda aberto
    expect(depois.attendedAt).toBeNull();
    /* o pedido atendido pelo setor dele NÃO some da caixa (padrão todos); sai só de "abertos" */
    expect((await listarRecebidos(sepA)).map((x) => x.id)).toContain(ids.pedido);
    expect((await listarRecebidos(sepA, { situacao: 'abertos' })).map((x) => x.id)).not.toContain(ids.pedido);
    expect((await listarRecebidos(sepA, { situacao: 'atendidos' })).map((x) => x.id)).toContain(ids.pedido);
    expect(await prisma.notification.count({ where: { userId: gerente.id, title: { contains: 'atendido' }, body: { contains: 'Fábrica' } } })).toBe(1);

    /* o Admin atende D direto de Enviado (em separação e atendido ao mesmo tempo) → pedido inteiro Atendido */
    expect(await marcarSecao(admin, blocoD.id, 'atender')).toMatchObject({ ok: true });
    depois = (await getPedido(admin, ids.pedido))!;
    expect(depois.status).toBe('ATENDIDO');
    expect(depois.attendedAt).not.toBeNull();
    expect(depois.secoes.find((s) => s.id === blocoD.id)).toMatchObject({ status: 'ATENDIDO', receivedByName: admin.name, attendedByName: admin.name });
    expect(await marcarSecao(admin, blocoD.id, 'atender')).toMatchObject({ ok: false, reason: 'ESTADO' });
    expect(await prisma.notification.count({ where: { userId: gerente.id, title: `Pedido nº ${depois.number} atendido` } })).toBe(1);
    expect(await editarPedido(gerente, { id: ids.pedido, textos: {}, observacao: 'tarde demais' })).toMatchObject({ ok: false, reason: 'ESTADO' });
  });

  it('v1.189.0: mover para um bloco já ATENDIDO reabre o bloco em separação, e o pedido deixa de estar Atendido', async () => {
    const r = await enviarPedido(gerente, { unitId, textos: { [setorA]: '1 cx picanha', [setorB]: '2 cx coca' } });
    const id = (r as { id: string }).id;
    const p = (await getPedido(admin, id))!;
    const blocoA = p.secoes.find((s) => s.sectorId === setorA)!;
    const blocoB = p.secoes.find((s) => s.sectorId === setorB)!;
    expect(await marcarSecao(sepA, blocoA.id, 'atender')).toMatchObject({ ok: true });
    expect(await moverLinha(sepB, { sectionId: blocoB.id, linha: 0, paraSectorId: setorA })).toMatchObject({ ok: true });
    const depois = (await getPedido(admin, id))!;
    expect(depois.secoes.find((s) => s.sectorId === setorB)).toBeUndefined();
    expect(depois.secoes.find((s) => s.sectorId === setorA)).toMatchObject({ status: 'EM_SEPARACAO', lines: ['1 cx picanha', '2 cx coca'], attendedByName: null });
    expect(depois.status).toBe('EM_SEPARACAO');
  });

  it('retrato: mudar o destino do setor vale para os pedidos NOVOS; o bloco já enviado guarda o destino do dia', async () => {
    expect(await definirDestinoDoSetor(gerente, { id: setorB, destination: 'FABRICA' })).toMatchObject({ ok: false, reason: 'FORBIDDEN' });
    expect(await definirDestinoDoSetor(admin, { id: setorB, destination: 'XPTO' })).toMatchObject({ ok: false, reason: 'INVALID' });
    expect(await definirDestinoDoSetor(admin, { id: setorB, destination: 'FABRICA' })).toEqual({ ok: true });
    expect((await listarSetoresDoCd()).find((s) => s.id === setorB)?.destination).toBe('FABRICA');
    const r = await enviarPedido(gerente, { unitId, textos: { [setorB]: '1 cx guaraná' } });
    expect(r.ok).toBe(true);
    const novo = (await getPedido(admin, (r as { id: string }).id))!;
    expect(novo.secoes[0].destination).toBe('FABRICA');
    expect(novo.destinos).toEqual(['FABRICA']);
    expect(await prisma.auditLog.count({ where: { action: 'CD_SECTOR_DESTINATION', entityId: setorB } })).toBe(1);
  });

  it('setor criado sem destino nasce com o que o nome sugere; com destino informado, obedece; setor com separador ADICIONAL conta como vinculado', async () => {
    const carnes = await criarSetorDoCd(admin, `Carnes ${sfx}`);
    const papel = await criarSetorDoCd(admin, `Papelaria ${sfx}`, {}, 'ALMOXARIFADO');
    expect(carnes.ok && papel.ok).toBe(true);
    const lista = await listarSetoresDoCd();
    expect(lista.find((s) => s.name === `Carnes ${sfx}`)?.destination).toBe('FABRICA');
    expect(lista.find((s) => s.name === `Papelaria ${sfx}`)?.destination).toBe('ALMOXARIFADO');
    expect(lista.find((s) => s.id === setorC)?.separadores).toBe(1); // o A, pelo vínculo adicional
  });

  it('v1.189.0: o cadastro de Usuários grava os setores adicionais do separador (só ativos, sem repetir o principal); deixar de ser separador limpa', async () => {
    const r = await createUser(admin, { name: `Sep C ${sfx}`, email: `sc-${sfx}@e.com`, role: 'SEPARATOR', password: 'segredo1', cdSectorId: setorB, cdSectorIds: [setorC, setorB, setorD] });
    expect(r.ok).toBe(true);
    const id = (r as { id: string }).id;
    const lido = async () => (await prisma.user.findUnique({ where: { id }, select: { cdSectorId: true, cdSectors: { select: { sectorId: true } } } }))!;
    expect((await lido()).cdSectors.map((s) => s.sectorId).sort()).toEqual([setorC, setorD].sort());
    const sepC: SessionUser = { id, name: `Sep C ${sfx}`, role: 'SEPARATOR', unitIds: [], seesAllUnits: false, needsTerms: false };
    const caixa = await listarRecebidos(sepC);
    expect(caixa.find((x) => x.id === ids.pedido)!.secoes.map((s) => s.sectorId).sort()).toEqual([setorC, setorD].sort()); // BEBIDAS saiu do pedido; SECOS e ALMOX são dele
    expect(await updateUser(admin, id, { cdSectorIds: ['setor-que-nao-existe'] })).toMatchObject({ ok: false, reason: 'INVALID' });
    expect(await updateUser(admin, id, { cdSectorIds: [setorD] })).toMatchObject({ ok: true });
    expect((await lido()).cdSectors.map((s) => s.sectorId)).toEqual([setorD]);
    expect(await updateUser(admin, id, { role: 'MANAGER' })).toMatchObject({ ok: true });
    expect(await lido()).toMatchObject({ cdSectorId: null, cdSectors: [] });
  });

  it('matriz: o Separador nasce com a caixa de entrada e sem a tela de pedir; o gerente perdeu os Pedidos Internos (inativo)', async () => {
    const sep = await effectivePermissions('SEPARATOR');
    expect(sep.ORDERS_INBOX).toEqual({ canView: true, canEdit: true });
    expect(sep.ORDERS.canView).toBe(false);
    expect(sep.PRODUCT_SEPARATION.canView).toBe(false); // v1.195.1 — a fila antiga por produto está inativa
    const ger = await effectivePermissions('MANAGER');
    expect(ger.ORDERS).toEqual({ canView: true, canEdit: true });
    expect(ger.ORDERS_INBOX.canView).toBe(false);
    expect(ger.PRODUCTS).toEqual({ canView: false, canEdit: false });
  });
});
