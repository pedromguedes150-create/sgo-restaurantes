import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import type { SessionUser } from '@/lib/auth/session';
import {
  abrirContagem, salvarRascunho, enviarInventario, registrarConferencia, aprovarInventario, devolverInventario,
  listarInventarios, indicadoresDeAuditoria, getInventario, getUtensilsCoverage, emAbertoDaUnidade,
} from '@/lib/utensilios/inventario';
import { ensureUtensiliosPadrao, listarCatalogo, adicionarUtensilio, renomearUtensilio, ativarUtensilio } from '@/lib/utensilios/catalogo';

/**
 * INVENTÁRIO DE UTENSÍLIOS (v1.177.0) — o fluxo contra o banco: um em aberto
 * por unidade; vazio ≠ zero; envio idempotente; enviado bloqueia; devolver
 * exige motivo e reabre; aprovado é imutável; escopo por unidade; a lista
 * padrão não reescreve inventários já feitos; cobertura da meta por envio.
 */

const sfx = `ut${process.pid.toString(36)}`;
let unitA = ''; let unitB = ''; let gerenteAId = ''; let supAId = ''; let coordAId = ''; let gerenteBId = ''; let adminId = '';
let catalogoNovoId: string | undefined;

const u = (id: string, role: SessionUser['role'], units: string[], seesAll = false): SessionUser => ({ id, name: `${role} ${sfx}`, role, unitIds: units, seesAllUnits: seesAll, needsTerms: false });
const gerenteA = () => u(gerenteAId, 'MANAGER', [unitA]);
const supA = () => u(supAId, 'SUPERVISOR', [unitA]);
const coordA = () => u(coordAId, 'COORDINATOR', [unitA]);
const gerenteB = () => u(gerenteBId, 'MANAGER', [unitB]);
const admin = () => u(adminId, 'ADMIN', [], true);

beforeAll(async () => {
  const unit = async (code: string, name: string) => (await prisma.unit.create({ data: { code, name, timezone: 'America/Sao_Paulo', cutoffHour: 4 } })).id;
  unitA = await unit(`UT-A-${sfx}`, `Centro ${sfx}`);
  unitB = await unit(`UT-B-${sfx}`, `Orla ${sfx}`);
  const user = async (name: string, role: SessionUser['role'], unitId?: string) => {
    const id = (await prisma.user.create({ data: { name: `${name} ${sfx}`, email: `${name.toLowerCase()}.${sfx}@e.com`, role, passwordHash: 'x' } })).id;
    if (unitId) await prisma.unitMembership.create({ data: { userId: id, unitId } });
    return id;
  };
  gerenteAId = await user('Gerente', 'MANAGER', unitA);
  supAId = await user('Sup', 'SUPERVISOR', unitA);
  coordAId = await user('Coord', 'COORDINATOR', unitA);
  gerenteBId = await user('GerenteB', 'MANAGER', unitB);
  adminId = await user('Admin', 'ADMIN');
  await ensureUtensiliosPadrao();
});

afterAll(async () => {
  await prisma.utensilInventory.deleteMany({ where: { unitId: { in: [unitA, unitB] } } });
  if (catalogoNovoId) await prisma.utensilCatalogItem.delete({ where: { id: catalogoNovoId } }).catch(() => {});
  const ids = [gerenteAId, supAId, coordAId, gerenteBId, adminId];
  await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
  await prisma.auditLog.deleteMany({ where: { userId: { in: ids } } });
  await prisma.unitMembership.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.unit.deleteMany({ where: { id: { in: [unitA, unitB] } } });
});

describe('fluxo completo', () => {
  let invId = '';
  let itens: { id: string; name: string; custom: boolean }[] = [];

  it('abrir cria o rascunho com a lista ATIVA, com o gerente como responsável; abrir de novo retoma o MESMO', async () => {
    const r = await abrirContagem(gerenteA(), unitA);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    invId = r.id;
    expect(r.status).toBe('RASCUNHO');
    const inv = (await getInventario(gerenteA(), invId))!;
    const ativos = await listarCatalogo(true);
    expect(inv.items.length).toBe(ativos.length);
    expect(inv.items.length).toBeGreaterThanOrEqual(15);
    expect(inv.items.every((i) => i.quantity === null)).toBe(true); // nada nasce zero
    expect(inv.managerId).toBe(gerenteAId);
    expect(inv.events.map((e) => e.kind)).toEqual(['CRIADO']);
    const r2 = await abrirContagem(gerenteA(), unitA);
    expect(r2.ok && r2.id).toBe(invId);
    itens = inv.items.map((i) => ({ id: i.id, name: i.name, custom: i.custom }));
  });

  it('gerente de OUTRA unidade não abre nem lê a contagem desta', async () => {
    const r = await abrirContagem(gerenteB(), unitA);
    expect(r.ok === false && r.reason).toBe('FORBIDDEN');
    expect(await getInventario(gerenteB(), invId)).toBeNull();
    const s = await salvarRascunho(gerenteB(), invId, { itens: [{ id: itens[0].id, quantity: 1 }] });
    expect(s.ok === false && s.reason).toBe('FORBIDDEN');
  });

  it('salvar rascunho: zero é zero, personalizado entra; quantidade inválida e nome repetido são recusados', async () => {
    const r = await salvarRascunho(gerenteA(), invId, {
      itens: [{ id: itens[0].id, quantity: '120' }, { id: itens[1].id, quantity: 0 }],
      novos: [{ name: 'Travessas', quantity: 4, note: 'inox' }], notes: 'Faltam garfos',
    });
    expect(r.ok).toBe(true);
    const inv = (await getInventario(gerenteA(), invId))!;
    expect(inv.items.find((i) => i.id === itens[0].id)?.quantity).toBe(120);
    expect(inv.items.find((i) => i.id === itens[1].id)?.quantity).toBe(0);
    const trav = inv.items.find((i) => i.custom)!;
    expect(trav.name).toBe('Travessas'); expect(trav.quantity).toBe(4); expect(trav.note).toBe('inox');
    expect(inv.notes).toBe('Faltam garfos');
    const bad = await salvarRascunho(gerenteA(), invId, { itens: [{ id: itens[2].id, quantity: '-3' }] });
    expect(bad.ok === false && bad.reason).toBe('INVALID');
    const dup = await salvarRascunho(gerenteA(), invId, { novos: [{ name: 'travessas', quantity: 1 }] });
    expect(dup.ok === false && dup.reason).toBe('INVALID');
    const remove = await salvarRascunho(gerenteA(), invId, { remover: [itens[0].id] });
    expect(remove.ok === false && remove.reason).toBe('INVALID'); // só o adicionado sai
  });

  it('enviar com item vazio é recusado e NOMEIA o que falta (zero não falta)', async () => {
    const r = await enviarInventario(gerenteA(), invId, {});
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('INCOMPLETO');
    expect(r.faltam).toHaveLength(itens.length - 2);
    expect(r.faltam).not.toContain(itens[0].name);
    expect(r.faltam).not.toContain(itens[1].name);
    expect((await getInventario(gerenteA(), invId))!.status).toBe('RASCUNHO');
  });

  it('enviar completo → PENDENTE, evento ENVIADO com o retrato, aviso à Supervisão; 2º envio e salvar depois são recusados', async () => {
    const r = await enviarInventario(gerenteA(), invId, { itens: itens.slice(2).map((i) => ({ id: i.id, quantity: 7 })) });
    expect(r.ok && r.status).toBe('PENDENTE');
    const inv = (await getInventario(gerenteA(), invId))!;
    expect(inv.sentAt).not.toBeNull(); expect(inv.firstSentAt).not.toBeNull();
    expect(inv.total).toBe(120 + 0 + 7 * (itens.length - 2) + 4);
    const ev = inv.events.find((e) => e.kind === 'ENVIADO')!;
    expect((ev.snapshot as Record<string, number | null>)['Travessas (adicionado)']).toBe(4);
    expect((ev.snapshot as Record<string, number | null>)[itens[0].name]).toBe(120);
    const avisos = await prisma.notification.findMany({ where: { userId: { in: [supAId, coordAId] }, title: { contains: 'enviado' } } });
    expect(avisos.length).toBe(2);
    const again = await enviarInventario(gerenteA(), invId, {});
    expect(again.ok === false && again.reason).toBe('STATE');
    const salvar = await salvarRascunho(gerenteA(), invId, { notes: 'x' });
    expect(salvar.ok === false && salvar.reason).toBe('STATE');
    expect(await emAbertoDaUnidade(unitA)).toMatchObject({ id: invId, status: 'PENDENTE' });
  });

  it('gerente não audita; devolver sem motivo é recusado; o Coordenador devolve com motivo → EM_CORRECAO e o gerente é avisado (crítico)', async () => {
    const g = await aprovarInventario(gerenteA(), invId, null);
    expect(g.ok === false && g.reason).toBe('FORBIDDEN');
    const sem = await devolverInventario(coordA(), invId, 'ok');
    expect(sem.ok === false && sem.reason).toBe('INVALID');
    const r = await devolverInventario(coordA(), invId, 'Faltou contar as cubas da cozinha');
    expect(r.ok && r.status).toBe('EM_CORRECAO');
    const inv = (await getInventario(gerenteA(), invId))!;
    expect(inv.returnReason).toBe('Faltou contar as cubas da cozinha');
    expect(inv.auditorId).toBe(coordAId);
    const aviso = await prisma.notification.findFirst({ where: { userId: gerenteAId, title: { contains: 'devolvido' } } });
    expect(aviso?.critical).toBe(true);
    expect(aviso?.body).toBe('Faltou contar as cubas da cozinha');
    const outra = await devolverInventario(coordA(), invId, 'de novo não pode');
    expect(outra.ok === false && outra.reason).toBe('STATE');
  });

  it('o gerente corrige e reenvia → PENDENTE de novo, evento REENVIADO; o envio original fica no histórico', async () => {
    const r = await enviarInventario(gerenteA(), invId, { itens: [{ id: itens[3].id, quantity: 9 }] });
    expect(r.ok && r.status).toBe('PENDENTE');
    const inv = (await getInventario(gerenteA(), invId))!;
    expect(inv.returnReason).toBeNull();
    expect(inv.events.map((e) => e.kind)).toEqual(['CRIADO', 'ENVIADO', 'DEVOLVIDO', 'REENVIADO']);
    expect((inv.events[1].snapshot as Record<string, number | null>)[itens[3].name]).toBe(7); // o retrato do 1º envio
    expect((inv.events[3].snapshot as Record<string, number | null>)[itens[3].name]).toBe(9);
    expect(inv.firstSentAt?.getTime()).toBeLessThanOrEqual(inv.sentAt!.getTime());
  });

  it('o Supervisor registra a conferência (opcional) e aprova → APROVADO, imutável; o gerente é avisado', async () => {
    const c = await registrarConferencia(supA(), invId, { auditadas: { [itens[0].id]: '118' }, observacao: 'Dois pratos a menos' });
    expect(c.ok).toBe(true);
    const inv1 = (await getInventario(supA(), invId))!;
    expect(inv1.items.find((i) => i.id === itens[0].id)?.auditedQuantity).toBe(118);
    expect(inv1.auditNotes).toBe('Dois pratos a menos');
    expect(inv1.status).toBe('PENDENTE'); // conferir não muda o status
    const bad = await registrarConferencia(supA(), invId, { auditadas: { [itens[0].id]: '1.5' } });
    expect(bad.ok === false && bad.reason).toBe('INVALID');
    const r = await aprovarInventario(supA(), invId, undefined);
    expect(r.ok && r.status).toBe('APROVADO');
    const inv = (await getInventario(supA(), invId))!;
    expect(inv.approvedAt).not.toBeNull(); expect(inv.auditorName).toBe(`SUPERVISOR ${sfx}`);
    expect(inv.events.at(-1)?.kind).toBe('APROVADO');
    expect((await aprovarInventario(supA(), invId, null)).ok).toBe(false);
    expect((await devolverInventario(supA(), invId, 'tarde demais')).ok).toBe(false);
    expect((await salvarRascunho(gerenteA(), invId, { notes: 'x' })).ok).toBe(false);
    expect((await registrarConferencia(supA(), invId, { auditadas: {} })).ok).toBe(false);
    const aviso = await prisma.notification.findFirst({ where: { userId: gerenteAId, title: { contains: 'aprovado' } } });
    expect(aviso).not.toBeNull();
    expect(await emAbertoDaUnidade(unitA)).toBeNull();
  });

  it('listas e indicadores respeitam o escopo; a cobertura da meta é por ENVIO no mês', async () => {
    const doSup = await listarInventarios(supA(), {});
    expect(doSup.map((x) => x.id)).toContain(invId);
    expect(doSup.find((x) => x.id === invId)).toMatchObject({ status: 'APROVADO', divergentes: 1, managerName: `Gerente ${sfx}` });
    expect((await listarInventarios(gerenteB(), {})).map((x) => x.id)).not.toContain(invId);
    expect((await listarInventarios(supA(), { status: 'PENDENTE' })).map((x) => x.id)).not.toContain(invId);
    const hoje = new Date().toISOString().slice(0, 10);
    const ind = await indicadoresDeAuditoria(supA(), `${hoje.slice(0, 4)}-01-01`, hoje);
    expect(ind.aprovados).toBeGreaterThanOrEqual(1);
    const indB = await indicadoresDeAuditoria(gerenteB(), `${hoje.slice(0, 4)}-01-01`, hoje);
    expect(indB.aprovados).toBe(0);
    const mes = hoje.slice(0, 7);
    expect(await getUtensilsCoverage(unitA, mes)).toEqual({ done: 1, missed: 0 });
    expect(await getUtensilsCoverage(unitB, mes)).toEqual({ done: 0, missed: 1 });
  });

  it('depois de aprovado, abrir cria uma contagem NOVA (ciclo seguinte), e a lista padrão só vale para ela', async () => {
    catalogoNovoId = (await adicionarUtensilio(admin(), `Bandejas ${sfx}`) as { ok: true; id?: string }).id;
    expect(catalogoNovoId).toBeTruthy();
    expect((await adicionarUtensilio(gerenteA(), 'Qualquer coisa')).ok).toBe(false);
    const r = await abrirContagem(gerenteA(), unitA);
    expect(r.ok && r.id !== invId).toBe(true);
    if (!r.ok) return;
    const novo = (await getInventario(gerenteA(), r.id))!;
    expect(novo.items.some((i) => i.name === `Bandejas ${sfx}`)).toBe(true);
    const antigo = (await getInventario(gerenteA(), invId))!;
    expect(antigo.items.some((i) => i.name === `Bandejas ${sfx}`)).toBe(false);
    expect(antigo.items.length).toBe(itens.length + 1); // 15 padrão + Travessas; nada entrou depois
    /* renomear/desativar na lista padrão não reescreve o que já foi contado */
    await renomearUtensilio(admin(), catalogoNovoId!, `Bandejas grandes ${sfx}`);
    await ativarUtensilio(admin(), catalogoNovoId!, false);
    expect((await getInventario(gerenteA(), r.id))!.items.some((i) => i.name === `Bandejas ${sfx}`)).toBe(true);
    const outro = await abrirContagem(gerenteA(), unitB);
    expect(outro.ok === false && outro.reason).toBe('FORBIDDEN');
  });
});
