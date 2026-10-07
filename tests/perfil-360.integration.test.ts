import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { getControleDeFerias, getPerfil360 } from '@/lib/people/perfil-360';
import { excluirAbono, registrarAbono } from '@/lib/people/abono';
import type { SessionUser } from '@/lib/auth/session';

/**
 * Perfil 360 e Controle de Férias (v1.153.0) com banco:
 *  - o perfil compõe o que os módulos já gravam (HE vinculada, mobilidade,
 *    férias) e respeita o escopo por unidade;
 *  - bloco de módulo que o perfil não pode ver não vem (sem porta dos fundos);
 *  - abono: até 10 dias, dentro do saldo, um por período, auditável.
 */
const sfx = `p360${process.pid.toString(36)}`;
let unitA: string, unitB: string, gerA: string, adminId: string, colab: string, colabB: string;
const pode = () => true;
const nada = () => false;
const gerente = (): SessionUser => ({ id: gerA, name: 'Ger A', role: 'MANAGER', unitIds: [unitA], seesAllUnits: false, needsTerms: false });
const admin = (): SessionUser => ({ id: adminId, name: 'Adm', role: 'ADMIN', unitIds: [unitA, unitB], seesAllUnits: false, needsTerms: false });

beforeAll(async () => {
  unitA = (await prisma.unit.create({ data: { code: `A-${sfx}`, name: `P360 A ${sfx}`, timezone: 'America/Sao_Paulo', cutoffHour: 4 } })).id;
  unitB = (await prisma.unit.create({ data: { code: `B-${sfx}`, name: `P360 B ${sfx}`, timezone: 'America/Sao_Paulo', cutoffHour: 4 } })).id;
  gerA = (await prisma.user.create({ data: { name: 'Ger A', email: `ga-${sfx}@example.com`, role: 'MANAGER', passwordHash: 'x' } })).id;
  adminId = (await prisma.user.create({ data: { name: 'Adm', email: `ad-${sfx}@example.com`, role: 'ADMIN', passwordHash: 'x' } })).id;
  await prisma.unitMembership.create({ data: { userId: gerA, unitId: unitA } });
  colab = (await prisma.collaborator.create({ data: { name: 'João Frentista', jobTitle: 'Garçom', hireDate: '2024-11-01', cpf: '86978984558', source: 'RH', externalId: `M${sfx}`, units: { create: [{ unitId: unitA }] } } })).id;
  colabB = (await prisma.collaborator.create({ data: { name: 'Maria Outra', hireDate: '2024-08-20', units: { create: [{ unitId: unitB }] } } })).id;
  // 20 dias de férias já gozados no período 2024-11-01 → 2025-10-31
  await prisma.vacation.create({ data: { collaboratorId: colab, unitId: unitA, startDate: new Date('2026-07-01T00:00:00Z'), endDate: new Date('2026-07-20T00:00:00Z'), status: 'CONFIRMED' } });
  // hora extra vinculada e mobilidade
  const req = await prisma.user.findUniqueOrThrow({ where: { id: gerA } });
  await prisma.paymentRequest.create({ data: { type: 'OVERTIME', unitId: unitA, status: 'APPROVED', amount: 110, hours: 4, workDate: new Date(), collaboratorId: colab, collaboratorName: 'João Frentista', requestedById: req.id, approverRole: 'SUPERVISOR' } as never });
  await prisma.collaboratorPayout.create({ data: { collaboratorId: colab, collaboratorName: 'João Frentista', unitId: unitA, type: 'MOBILITY', yearMonth: new Date().toISOString().slice(0, 7), amount: 300, createdById: adminId, createdByName: 'Adm' } });
});

afterAll(async () => {
  await prisma.vacationAbono.deleteMany({ where: { collaboratorId: { in: [colab, colabB] } } });
  await prisma.paymentRequest.deleteMany({ where: { unitId: { in: [unitA, unitB] } } });
  await prisma.collaboratorPayout.deleteMany({ where: { collaboratorId: colab } });
  await prisma.collaborator.deleteMany({ where: { id: { in: [colab, colabB] } } });
  await prisma.unit.deleteMany({ where: { id: { in: [unitA, unitB] } } });
  await prisma.user.deleteMany({ where: { id: { in: [gerA, adminId] } } });
  await prisma.$disconnect();
});

describe('Perfil 360', () => {
  it('compõe tempo de empresa, férias, hora extra e mobilidade', async () => {
    const p = (await getPerfil360(admin(), colab, pode))!;
    expect(p.colaborador.funcao).toBe('Garçom');
    expect(p.colaborador.cpf).toBe('869.789.845-58');
    expect(p.tempo?.anos).toBeGreaterThanOrEqual(1);
    const per = p.ferias.periodos.find((x) => x.inicio === '2024-11-01')!;
    expect(per).toMatchObject({ diasGozados: 20, saldo: 10 });
    expect(p.horaExtra).toMatchObject({ horas: 4, valor: 110, aprovadas: 1 });
    expect(p.mobilidade?.total).toBe(300);
    expect(p.historico.some((h) => h.tipo === 'Admissão')).toBe(true);
  });

  it('o gerente vê CPF mascarado; fora do alcance não abre', async () => {
    const p = (await getPerfil360(gerente(), colab, pode))!;
    expect(p.colaborador.cpf).toBe('***.***.845-58');
    expect(await getPerfil360(gerente(), colabB, pode)).toBeNull();
  });

  it('bloco de módulo fechado na matriz não é montado', async () => {
    const p = (await getPerfil360(admin(), colab, nada))!;
    expect(p.horaExtra).toBeNull();
    expect(p.mobilidade).toBeNull();
    expect(p.avaliacao).toBeNull();
    expect(p.historico.some((h) => h.tipo === 'Hora extra')).toBe(false);
  });
});

describe('Abono pecuniário (venda de dias)', () => {
  it('recusa mais de 30 dias e mais que o saldo', async () => {
    expect(await registrarAbono(gerente(), { collaboratorId: colab, periodoInicio: '2024-11-01', dias: 31 })).toEqual({ ok: false, reason: 'DIAS' });
    // saldo do período é 10 (gozou 20) — vender 10 cabe; o período inexistente não
    expect(await registrarAbono(gerente(), { collaboratorId: colab, periodoInicio: '2024-11-02', dias: 5 })).toEqual({ ok: false, reason: 'PERIODO' });
  });

  it('tirou 20 e vendeu 10: período quitado; segundo abono no mesmo período é recusado', async () => {
    const r = await registrarAbono(gerente(), { collaboratorId: colab, periodoInicio: '2024-11-01', dias: 10, observacao: 'junto com as férias' });
    expect(r.ok).toBe(true);
    const p = (await getPerfil360(admin(), colab, pode))!;
    expect(p.ferias.periodos.find((x) => x.inicio === '2024-11-01')).toMatchObject({ diasVendidos: 10, saldo: 0, situacao: 'QUITADO' });
    expect(await registrarAbono(gerente(), { collaboratorId: colab, periodoInicio: '2024-11-01', dias: 1 })).toEqual({ ok: false, reason: 'JA_EXISTE' });
    const audit = await prisma.auditLog.findFirst({ where: { action: 'VACATION_ABONO_CREATE', entityId: r.ok ? r.id : '' } });
    expect(audit).toBeTruthy();
  });

  it('fora do alcance não registra; outro gerente não exclui, Admin exclui', async () => {
    expect(await registrarAbono(gerente(), { collaboratorId: colabB, periodoInicio: '2024-08-20', dias: 5 })).toEqual({ ok: false, reason: 'FORBIDDEN' });
    const a = await prisma.vacationAbono.findFirstOrThrow({ where: { collaboratorId: colab } });
    const outro: SessionUser = { id: adminId, name: 'X', role: 'MANAGER', unitIds: [unitA], seesAllUnits: false, needsTerms: false };
    expect(await excluirAbono(outro, a.id)).toEqual({ ok: false, reason: 'FORBIDDEN' });
    expect((await excluirAbono(admin(), a.id)).ok).toBe(true);
  });
});

describe('Controle de Férias', () => {
  it('lista os ativos do alcance com a faixa; filtro de unidade é AND com o escopo', async () => {
    const c = await getControleDeFerias(admin());
    const maria = c.linhas.find((l) => l.id === colabB)!;
    expect(maria.faixa).toBe('VENCIDA'); // admitida em 08/2024, sem gozo, limite 19/08/2026
    const soA = await getControleDeFerias(gerente(), unitB);
    expect(soA.linhas).toHaveLength(0);
  });
});
