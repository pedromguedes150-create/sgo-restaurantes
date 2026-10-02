import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { createPaymentRequest } from '@/lib/payments/create';
import { getHorasExtras, lerFiltroHE, linhasSintetico } from '@/lib/hora-extra/query';
import { listarSemVinculo, vincularAutomaticamente, vincularManual } from '@/lib/hora-extra/vinculo';
import { addOvertimeReason, toggleOvertimeReason, deleteOvertimeReason, activeOvertimeReasons } from '@/lib/overtime/reasons';
import { getQuadroDaCompetencia } from '@/lib/people/payouts-competencia';
import type { SessionUser } from '@/lib/auth/session';
import { motivoHE } from './helpers/motivo-he';

/**
 * HORA EXTRA, do banco até o painel (v1.142.0).
 *
 * O que se prova: a HE antiga (só nome) é vinculada SOZINHA quando o nome
 * bate com UM colaborador da unidade, e vai para a fila quando há dúvida;
 * depois do vínculo, matrícula e CPF saem do cadastro e a Vera vira UMA linha;
 * o motivo precisa vir do catálogo; o escopo por unidade vale no servidor.
 */

const sfx = `${process.pid.toString(36)}${Date.now().toString(36).slice(-4)}`;
let unitA: string;
let unitB: string;
let adminId: string;
let gerId: string;
let veraA: string; // "Vera Lúcia dos Anjos" na unidade A
let veraB1: string; // duas "Vera Lucia" na unidade B → ambiguidade
let veraB2: string;
let motivoId: string;

const admin = (): SessionUser => ({ id: adminId, name: 'Admin HE', role: 'ADMIN', unitIds: [unitA, unitB], seesAllUnits: false, needsTerms: false });
const gerenteA = (): SessionUser => ({ id: gerId, name: 'Ger HE', role: 'MANAGER', unitIds: [unitA], seesAllUnits: false, needsTerms: false });
const filtro = (over: Record<string, string> = {}) => lerFiltroHE(new URLSearchParams({ periodo: 'personalizado', de: '2026-09-01', ate: '2026-09-30', ...over }));

async function heAntiga(over: { unitId?: string; nome: string; dia?: string; amount?: number }) {
  return prisma.paymentRequest.create({
    data: {
      type: 'OVERTIME', unitId: over.unitId ?? unitA, status: 'APPROVED', amount: over.amount ?? 45, hours: 3, hourlyRate: 15,
      workDate: new Date(`${over.dia ?? '2026-09-15'}T12:00:00Z`), workStartTime: '18:00', workEndTime: '21:00',
      collaboratorId: null, collaboratorName: over.nome, reason: 'texto antigo', requestedById: gerId, approvedById: adminId, approvedAt: new Date('2026-09-16T10:00:00Z'),
    },
  });
}

beforeAll(async () => {
  unitA = (await prisma.unit.create({ data: { code: `HEA-${sfx}`, name: `HE A ${sfx}` } })).id;
  unitB = (await prisma.unit.create({ data: { code: `HEB-${sfx}`, name: `HE B ${sfx}` } })).id;
  adminId = (await prisma.user.create({ data: { name: 'Admin HE', email: `he-${sfx}@t.local`, role: 'ADMIN', passwordHash: 'x' } })).id;
  gerId = (await prisma.user.create({ data: { name: 'Ger HE', email: `he-ger-${sfx}@t.local`, role: 'MANAGER', passwordHash: 'x' } })).id;
  await prisma.unitMembership.create({ data: { userId: gerId, unitId: unitA } });
  veraA = (await prisma.collaborator.create({ data: { name: `Vera Lúcia dos Anjos ${sfx}`, cpf: '09494305604', externalId: `M-${sfx}-1`, units: { create: { unitId: unitA } } } })).id;
  veraB1 = (await prisma.collaborator.create({ data: { name: `Vera Lucia ${sfx}`, cpf: '13849372693', externalId: `M-${sfx}-2`, units: { create: { unitId: unitB } } } })).id;
  veraB2 = (await prisma.collaborator.create({ data: { name: `Vera Lúcia ${sfx}`, cpf: '11144477735', externalId: `M-${sfx}-3`, units: { create: { unitId: unitB } } } })).id;
  await prisma.overtimeHourlyRate.create({ data: { unitId: unitA, value: 15 } });
  motivoId = await motivoHE();
});

beforeEach(async () => {
  await prisma.paymentRequest.deleteMany({ where: { unitId: { in: [unitA, unitB] } } });
});

afterAll(async () => {
  await prisma.paymentRequest.deleteMany({ where: { unitId: { in: [unitA, unitB] } } });
  await prisma.overtimeHourlyRate.deleteMany({ where: { unitId: { in: [unitA, unitB] } } });
  await prisma.collaborator.deleteMany({ where: { id: { in: [veraA, veraB1, veraB2].filter(Boolean) } } });
  await prisma.notification.deleteMany({ where: { userId: { in: [gerId, adminId] } } }).catch(() => {});
  await prisma.unitMembership.deleteMany({ where: { userId: gerId } }).catch(() => {});
  await prisma.unit.deleteMany({ where: { id: { in: [unitA, unitB] } } });
  await prisma.user.deleteMany({ where: { id: { in: [adminId, gerId] } } });
  await prisma.$disconnect();
});

describe('vínculo da HE antiga com o RH', () => {
  it('nome que bate com UM colaborador da unidade: vincula sozinho e a Auditoria registra; dois iguais: fica na fila', async () => {
    const a = await heAntiga({ nome: `vera lucia dos anjos ${sfx}` }); // sem acento, caixa diferente
    const b = await heAntiga({ nome: `Vera Lucia ${sfx}`, unitId: unitB }); // duas no cadastro de B
    const c = await heAntiga({ nome: `Fulano ${sfx}` }); // ninguém
    const r = await vincularAutomaticamente(admin());
    expect(r).toEqual({ vinculadas: 1, pendentes: 2 });
    expect((await prisma.paymentRequest.findUnique({ where: { id: a.id } }))!.collaboratorId).toBe(veraA);
    expect((await prisma.paymentRequest.findUnique({ where: { id: b.id } }))!.collaboratorId).toBeNull();
    expect((await prisma.paymentRequest.findUnique({ where: { id: c.id } }))!.collaboratorId).toBeNull();
    const log = await prisma.auditLog.findFirst({ where: { action: 'PAYMENT_HE_VINCULO_RH', entityId: a.id } });
    expect(log?.metadata).toMatchObject({ auto: true, collaboratorId: veraA });

    const fila = await listarSemVinculo(admin());
    const deB = fila.find((f) => f.id === b.id)!;
    expect(deB.sugestoes.map((s) => s.id).sort()).toEqual([veraB1, veraB2].sort());
    expect(fila.find((f) => f.id === c.id)!.sugestoes).toEqual([]);
    /* Idempotente: rodar de novo não muda nada. */
    expect(await vincularAutomaticamente(admin())).toEqual({ vinculadas: 0, pendentes: 2 });
  });

  it('manual: o Admin escolhe; colaborador de outra unidade é recusado; já vinculada não muda', async () => {
    const b = await heAntiga({ nome: `Vera Lucia ${sfx}`, unitId: unitB });
    const errado = await vincularManual(admin(), b.id, veraA); // Vera A não é da unidade B
    expect(errado.ok).toBe(false);
    const ok = await vincularManual(admin(), b.id, veraB2);
    expect(ok.ok).toBe(true);
    const again = await vincularManual(admin(), b.id, veraB1);
    expect(again).toMatchObject({ ok: false, reason: 'STATE' });
    const row = await prisma.paymentRequest.findUnique({ where: { id: b.id } });
    expect(row!.collaboratorId).toBe(veraB2);
    expect(row!.collaboratorName).toBe(`Vera Lucia ${sfx}`); // o nome congelado NÃO é reescrito
    /* O gerente da unidade A não vincula nada em B. */
    const c = await heAntiga({ nome: `Outra ${sfx}`, unitId: unitB });
    expect((await vincularManual(gerenteA(), c.id, veraB1)).ok).toBe(false);
  });

  it('depois do vínculo, a Vera com três grafias vira UMA linha com matrícula e CPF do cadastro — no painel E no Fechamento', async () => {
    await heAntiga({ nome: `Vera Lucia dos Anjos ${sfx}`, dia: '2026-09-10', amount: 45 });
    await heAntiga({ nome: `VERA LÚCIA DOS ANJOS ${sfx}`, dia: '2026-09-12', amount: 22.5 });
    const antes = await getHorasExtras(admin(), filtro({ unidade: unitA }));
    expect(antes.resumo.colaboradores).toBe(1); // mesmo nome normalizado já agrupa
    expect(antes.hes.every((h) => h.matricula === null && h.cpf === null)).toBe(true);

    await vincularAutomaticamente(admin());
    const depois = await getHorasExtras(admin(), filtro({ unidade: unitA }));
    expect(depois.hes.every((h) => h.collaboratorId === veraA && h.matricula === `M-${sfx}-1` && h.cpf === '09494305604')).toBe(true);
    expect(depois.hes[0].colaborador).toBe(`Vera Lúcia dos Anjos ${sfx}`); // nome do CADASTRO
    const sint = linhasSintetico(depois.hes);
    expect(sint).toHaveLength(3); // cabeçalho + Vera + TOTAL
    expect(sint[1].slice(0, 3)).toEqual([`M-${sfx}-1`, '094.943.056-04', `Vera Lúcia dos Anjos ${sfx}`]);
    expect(sint[1][6]).toBe(67.5);

    const q = await getQuadroDaCompetencia(admin(), '2026-10', 'EXTRA');
    const g = q.grupos.find((x) => x.unitId === unitA)!;
    expect(g.lancamentos).toHaveLength(1);
    expect(g.lancamentos[0]).toMatchObject({ colaborador: `Vera Lúcia dos Anjos ${sfx}`, cpf: '09494305604', valor: 67.5 });
  });
});

describe('motivo do catálogo', () => {
  const nova = (over: Record<string, unknown> = {}) => createPaymentRequest(gerenteA(), {
    type: 'OVERTIME', unitId: unitA, amount: 0, collaboratorId: veraA, workDate: '2026-09-20', workStartTime: '18:00', workEndTime: '20:00', hourlyRate: 15, overtimeReasonId: motivoId, reason: 'faltou o Carlos', ...over,
  });

  it('sem motivo, com id inventado ou com motivo DESATIVADO não lança; com motivo ativo grava o id e o detalhe', async () => {
    expect((await nova({ overtimeReasonId: undefined })).ok).toBe(false);
    expect((await nova({ overtimeReasonId: 'nao-existe' })).ok).toBe(false);
    await addOvertimeReason(admin(), `Temporário ${sfx}`);
    const temp = (await activeOvertimeReasons()).find((m) => m.name === `Temporário ${sfx}`)!;
    await toggleOvertimeReason(admin(), temp.id, false);
    expect((await nova({ overtimeReasonId: temp.id })).ok).toBe(false);
    await deleteOvertimeReason(admin(), temp.id);

    const r = await nova();
    expect(r.ok).toBe(true);
    const painel = await getHorasExtras(admin(), filtro({ unidade: unitA }));
    const h = painel.hes.find((x) => x.id === (r as { id: string }).id)!;
    expect(h.motivoId).toBe(motivoId);
    expect(h.detalhe).toBe('faltou o Carlos');
    expect(painel.motivos[0]).toMatchObject({ motivoId, qtd: 1, valor: 30, pct: 100 });
  });

  it('a HE antiga (texto livre) cai em "Outro" e o filtro ?motivo=outro acha só ela; motivo em uso não se exclui', async () => {
    await heAntiga({ nome: `Vera Lucia dos Anjos ${sfx}` });
    await nova();
    const todos = await getHorasExtras(admin(), filtro({ unidade: unitA }));
    expect(todos.motivos.map((m) => m.motivo).sort()).toEqual(['Outro', (await activeOvertimeReasons()).find((m) => m.id === motivoId)!.name].sort());
    const outro = await getHorasExtras(admin(), filtro({ unidade: unitA, motivo: 'outro' }));
    expect(outro.hes).toHaveLength(1);
    expect(outro.hes[0]).toMatchObject({ motivo: 'Outro', detalhe: 'texto antigo', motivoId: null });
    const soMotivo = await getHorasExtras(admin(), filtro({ unidade: unitA, motivo: motivoId }));
    expect(soMotivo.hes).toHaveLength(1);
    const del = await deleteOvertimeReason(admin(), motivoId);
    expect(del.ok).toBe(false);
  });
});

describe('escopo e filtros no servidor', () => {
  it('o gerente da unidade A não vê B nem pedindo pelo id; status e busca filtram', async () => {
    await heAntiga({ nome: `Alvo ${sfx}`, unitId: unitB, amount: 99 });
    await heAntiga({ nome: `Vera Lucia dos Anjos ${sfx}`, amount: 45 });
    const g = await getHorasExtras(gerenteA(), filtro({ unidade: unitB }));
    expect(g.hes.map((h) => h.unitId)).toEqual([unitA]);
    expect(g.filtro.unitId).toBeUndefined();
    expect((await getHorasExtras(admin(), filtro({ status: 'PENDING' }))).hes.filter((h) => [unitA, unitB].includes(h.unitId))).toHaveLength(0);
    expect((await getHorasExtras(admin(), filtro({ q: `alvo ${sfx}` }))).hes.map((h) => h.valor)).toEqual([99]);
  });
});
