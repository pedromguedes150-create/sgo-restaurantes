import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { createPaymentRequest } from '@/lib/payments/create';
import { approverEditRequest } from '@/lib/payments/approve';
import { getConsolidacaoPagamentos, type FiltroConsolidacao } from '@/lib/payments/consolidacao';
import type { SessionUser } from '@/lib/auth/session';

/**
 * HORA EXTRA pelo colaborador do RH + CONSOLIDAÇÃO DE PAGAMENTOS (v1.126.0).
 *
 * 30/09/2026 é quarta: "esta semana" = 28/09 a 04/10.
 */

const sfx = `cpg${process.pid.toString(36)}${Date.now().toString(36).slice(-4)}`;
const HOJE = '2026-09-30';
let unitA: string, unitB: string, mgrA: string, supA: string, joao: string, maria: string, deB: string, inativo: string;

const gerenteA = (): SessionUser => ({ id: mgrA, name: 'Gerente A', role: 'MANAGER', unitIds: [unitA], seesAllUnits: false, needsTerms: false });
const supervisorA = (): SessionUser => ({ id: supA, name: 'Sup A', role: 'SUPERVISOR', unitIds: [unitA], seesAllUnits: false, needsTerms: false });
/** As DUAS unidades do teste — com a rede inteira, lançamentos de dev de outras unidades entrariam na conta. */
const rede = (): SessionUser => ({ id: supA, name: 'Sup Rede', role: 'SUPERVISOR', unitIds: [unitA, unitB], seesAllUnits: false, needsTerms: false });
const filtro = (p: Partial<FiltroConsolidacao> = {}): FiltroConsolidacao => ({ periodo: 'semana', tipo: 'TODOS', status: 'TODOS', ...p });

beforeAll(async () => {
  const u = async (code: string, name: string) => (await prisma.unit.create({ data: { code, name, timezone: 'America/Sao_Paulo', cutoffHour: 4 } })).id;
  unitA = await u(`CPG-A-${sfx}`, `Moreira ${sfx}`);
  unitB = await u(`CPG-B-${sfx}`, `KM13 ${sfx}`);
  mgrA = (await prisma.user.create({ data: { name: 'Gerente A', email: `ga.${sfx}@e.com`, role: 'MANAGER', passwordHash: 'x' } })).id;
  supA = (await prisma.user.create({ data: { name: 'Sup A', email: `sa.${sfx}@e.com`, role: 'SUPERVISOR', passwordHash: 'x' } })).id;
  await prisma.unitMembership.createMany({ data: [{ userId: mgrA, unitId: unitA }, { userId: supA, unitId: unitA }] });
  const colab = async (name: string, unitId: string, active = true) =>
    (await prisma.collaborator.create({ data: { name: `${name} ${sfx}`, active, source: 'RH', units: { create: { unitId } } } })).id;
  joao = await colab('João Silva', unitA);
  maria = await colab('Maria Souza', unitA);
  deB = await colab('Carlos Lima', unitB);
  inativo = await colab('Desligado', unitA, false);
});

afterAll(async () => {
  await prisma.paymentRequest.deleteMany({ where: { unitId: { in: [unitA, unitB] } } });
  await prisma.collaborator.deleteMany({ where: { id: { in: [joao, maria, deB, inativo] } } });
  await prisma.unitMembership.deleteMany({ where: { userId: { in: [mgrA, supA] } } });
  await prisma.user.deleteMany({ where: { id: { in: [mgrA, supA] } } });
  await prisma.unit.deleteMany({ where: { id: { in: [unitA, unitB] } } });
  await prisma.$disconnect();
});

const he = (p: { collaboratorId?: string; workDate?: string; amount?: number; unitId?: string }) =>
  createPaymentRequest(gerenteA(), { type: 'OVERTIME', unitId: p.unitId ?? unitA, amount: p.amount ?? 45, hours: 2, reason: 'Evento', collaboratorId: p.collaboratorId, workDate: p.workDate });

describe('Hora Extra escolhe o colaborador do RH', () => {
  it('grava o vínculo e CONGELA o nome do cadastro — nunca o nome digitado', async () => {
    const r = await createPaymentRequest(gerenteA(), { type: 'OVERTIME', unitId: unitA, amount: 45, hours: 2, collaboratorId: joao, collaboratorName: 'joao digitado errado', workDate: '2026-09-28' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const row = await prisma.paymentRequest.findUniqueOrThrow({ where: { id: r.id } });
    expect(row.collaboratorId).toBe(joao);
    expect(row.collaboratorName).toBe(`João Silva ${sfx}`);
  });

  it('sem colaborador, de outra unidade ou desligado: recusa', async () => {
    const semNada = await he({});
    expect(semNada).toMatchObject({ ok: false, reason: 'INVALID', detail: 'Escolha o colaborador na lista.' });
    expect(await he({ collaboratorId: deB })).toMatchObject({ ok: false, reason: 'INVALID' });
    expect(await he({ collaboratorId: inativo })).toMatchObject({ ok: false, reason: 'INVALID' });
  });

  it('o aprovador troca o colaborador pela lista — e só por um da unidade', async () => {
    const r = await he({ collaboratorId: joao, workDate: '2026-09-29' });
    if (!r.ok) throw new Error('setup');
    expect((await approverEditRequest(supervisorA(), r.id, { collaboratorId: deB })).ok).toBe(false);
    expect((await approverEditRequest(supervisorA(), r.id, { collaboratorId: maria })).ok).toBe(true);
    const row = await prisma.paymentRequest.findUniqueOrThrow({ where: { id: r.id } });
    expect(row.collaboratorId).toBe(maria);
    expect(row.collaboratorName).toBe(`Maria Souza ${sfx}`);
    expect(row.status).toBe('PENDING'); // corrigir não aprova
  });
});

describe('Consolidação de pagamentos', () => {
  it('filtra pela DATA DO SERVIÇO, não pela data de criação', async () => {
    await prisma.paymentRequest.deleteMany({ where: { unitId: { in: [unitA, unitB] } } });
    // Criada hoje, mas o serviço foi na semana passada → não é "esta semana".
    await he({ collaboratorId: joao, workDate: '2026-09-22', amount: 10 });
    await he({ collaboratorId: joao, workDate: '2026-09-28', amount: 50 });
    await he({ collaboratorId: joao, workDate: '2026-10-01', amount: 75 });
    const c = await getConsolidacaoPagamentos(rede(), filtro(), HOJE);
    expect(c.lancamentos.map((l) => l.valor).sort((a, b) => a - b)).toEqual([50, 75]);
    const passada = await getConsolidacaoPagamentos(rede(), filtro({ periodo: 'semana-passada' }), HOJE);
    expect(passada.lancamentos.map((l) => l.valor)).toEqual([10]);
  });

  it('mesmo colaborador em dias diferentes = lançamentos separados; por colaborador soma sem fundir', async () => {
    const c = await getConsolidacaoPagamentos(rede(), filtro(), HOJE);
    const p = c.porColaborador.find((x) => x.chave === `C:${joao}`)!;
    expect(p.total).toBe(125);
    expect(p.lancamentos).toHaveLength(2);
  });

  it('rejeitada fica fora do total; o escopo do gerente não enxerga a outra unidade', async () => {
    const rej = await he({ collaboratorId: maria, workDate: '2026-09-29', amount: 999 });
    if (!rej.ok) throw new Error('setup');
    await prisma.paymentRequest.update({ where: { id: rej.id }, data: { status: 'REJECTED' } });
    await prisma.paymentRequest.create({ data: { type: 'FREELANCER', unitId: unitB, amount: 150, transportValue: 12, workDate: new Date('2026-09-29T00:00:00Z'), status: 'APPROVED' } });

    const c = await getConsolidacaoPagamentos(rede(), filtro(), HOJE);
    expect(c.resumo.total).toBe(50 + 75 + 150);
    expect(c.resumo.fora).toEqual({ qtd: 1, valor: 999 });
    expect(c.resumo.vt).toBe(12);
    expect(c.porUnidade.map((u) => u.unidade)).toEqual([`KM13 ${sfx}`, `Moreira ${sfx}`]);

    const doGerente = await getConsolidacaoPagamentos(gerenteA(), filtro(), HOJE);
    expect(doGerente.lancamentos.every((l) => l.unitId === unitA)).toBe(true);
    // Pedir a unidade de fora do alcance não a obedece.
    const forcando = await getConsolidacaoPagamentos(gerenteA(), filtro({ unitId: unitB }), HOJE);
    expect(forcando.lancamentos.some((l) => l.unitId === unitB)).toBe(false);
  });

  it('filtros de tipo, status e colaborador', async () => {
    expect((await getConsolidacaoPagamentos(rede(), filtro({ tipo: 'FREELANCER' }), HOJE)).lancamentos).toHaveLength(1);
    const rejeitadas = await getConsolidacaoPagamentos(rede(), filtro({ status: 'REJECTED' }), HOJE);
    expect(rejeitadas.resumo.total).toBe(999); // pediu Rejeitado: soma
    const soJoao = await getConsolidacaoPagamentos(rede(), filtro({ pessoa: `C:${joao}` }), HOJE);
    expect(soJoao.lancamentos.every((l) => l.pessoa === `João Silva ${sfx}`)).toBe(true);
    // O seletor oferece quem aparece no período, mesmo com um colaborador escolhido.
    expect(soJoao.pessoas.length).toBeGreaterThan(1);
  });

  it('consultar não muda status de nada', async () => {
    const antes = await prisma.paymentRequest.findMany({ where: { unitId: { in: [unitA, unitB] } }, select: { id: true, status: true, updatedAt: true }, orderBy: { id: 'asc' } });
    await getConsolidacaoPagamentos(rede(), filtro({ status: 'APPROVED' }), HOJE);
    const depois = await prisma.paymentRequest.findMany({ where: { unitId: { in: [unitA, unitB] } }, select: { id: true, status: true, updatedAt: true }, orderBy: { id: 'asc' } });
    expect(depois).toEqual(antes);
  });
});

describe('v1.127.0 — Hora Extra na consolidação e recorrência com total', () => {
  let frRec: string, frNao: string;
  beforeAll(async () => {
    frRec = (await prisma.freelancer.create({ data: { name: `Vinícius ${sfx}`, defaultValue: 100 } })).id;
    frNao = (await prisma.freelancer.create({ data: { name: `Felipe ${sfx}`, defaultValue: 100 } })).id;
  });
  afterAll(async () => {
    await prisma.paymentRequest.deleteMany({ where: { freelancerId: { in: [frRec, frNao] } } });
    await prisma.freelancer.deleteMany({ where: { id: { in: [frRec, frNao] } } });
  });

  const dia = (iso: string) => new Date(`${iso}T00:00:00Z`);
  const fl = (freelancerId: string, unitId: string, iso: string, amount: number, status: 'PENDING' | 'APPROVED' | 'REJECTED' = 'APPROVED') =>
    prisma.paymentRequest.create({ data: { type: 'FREELANCER', unitId, freelancerId, amount, workDate: dia(iso), status } });
  const periodo = (de: string, ate: string, p: Partial<FiltroConsolidacao> = {}) => filtro({ periodo: 'personalizado', de, ate, ...p });

  it('Hora Extra feita em 25/09 e lançada depois aparece em 25/09 — e nos filtros de tipo certos', async () => {
    await prisma.paymentRequest.deleteMany({ where: { unitId: { in: [unitA, unitB] } } });
    const r = await he({ collaboratorId: joao, workDate: '2026-09-25', amount: 80 });
    expect(r.ok).toBe(true);
    await fl(frNao, unitA, '2026-09-25', 150);

    const todos = await getConsolidacaoPagamentos(rede(), periodo('2026-09-25', '2026-09-25'), HOJE);
    expect(todos.lancamentos.map((l) => l.tipo).sort()).toEqual(['FREELANCER', 'OVERTIME']);
    expect(todos.resumo).toMatchObject({ solicitacoes: 2, valorHoraExtra: 80, valorFreelancer: 150, total: 230 });
    expect((await getConsolidacaoPagamentos(rede(), periodo('2026-09-25', '2026-09-25', { tipo: 'OVERTIME' }), HOJE)).lancamentos.map((l) => l.tipo)).toEqual(['OVERTIME']);
    expect((await getConsolidacaoPagamentos(rede(), periodo('2026-09-25', '2026-09-25', { tipo: 'FREELANCER' }), HOJE)).lancamentos.map((l) => l.tipo)).toEqual(['FREELANCER']);
    // No dia em que foi LANÇADA (hoje), não aparece: o período é o do serviço.
    expect((await getConsolidacaoPagamentos(rede(), filtro({ periodo: 'hoje', tipo: 'OVERTIME' }), HOJE)).lancamentos).toHaveLength(0);
  });

  it('Hora Extra sem data do serviço cai na data efetiva do lançamento, sem sumir', async () => {
    await prisma.paymentRequest.create({ data: { type: 'OVERTIME', unitId: unitA, amount: 60, collaboratorName: 'Antigo', entryDate: dia('2026-09-24'), status: 'APPROVED' } });
    const c = await getConsolidacaoPagamentos(rede(), periodo('2026-09-24', '2026-09-24', { tipo: 'OVERTIME' }), HOJE);
    expect(c.lancamentos.map((l) => [l.pessoa, l.semVinculoRh])).toEqual([['Antigo', true]]);
  });

  it('recorrência: a MESMA regra do consolidado de freelancers, com os totais somados', async () => {
    const { getConsolidadoFreelancers } = await import('@/lib/payments/consolidado');
    const { getRecorrenciaFreelancers } = await import('@/lib/payments/consolidacao');
    const base = await getRecorrenciaFreelancers(rede(), periodo('2026-09-21', '2026-09-27'), HOJE);
    const limite = base.limiteSemanal;
    // Vinícius: limite+1 na semana, em DUAS unidades → recorrente. Felipe: no limite → não.
    // Uma rejeitada a mais do Vinícius não entra na conta (regra de sempre).
    for (let i = 0; i <= limite; i++) await fl(frRec, i % 2 ? unitB : unitA, `2026-09-2${1 + i}`, 100 + i);
    await fl(frRec, unitA, '2026-09-27', 500, 'REJECTED');
    await prisma.paymentRequest.deleteMany({ where: { freelancerId: frNao } });
    for (let i = 0; i < limite; i++) await fl(frNao, unitA, `2026-09-2${1 + i}`, 90);

    const rc = await getRecorrenciaFreelancers(rede(), periodo('2026-09-21', '2026-09-27'), HOJE);
    expect(rc.linhas.map((g) => g.freelancerId)).toEqual([frRec]);
    const esperado = Array.from({ length: limite + 1 }, (_, i) => 100 + i).reduce((a, b) => a + b, 0);
    expect(rc.totais).toEqual({ freelancers: 1, semanas: 1, solicitacoes: limite + 1, valor: esperado });
    expect(rc.linhas[0].unidades.sort()).toEqual([`KM13 ${sfx}`, `Moreira ${sfx}`].sort());

    // Nenhuma segunda conta: bate com o consolidado de freelancers de sempre.
    const antigo = await getConsolidadoFreelancers(rede(), { periodo: 'personalizado', de: '2026-09-21', ate: '2026-09-27', tipo: 'FREELANCER', status: 'TODOS', recorrencia: 'todos' });
    expect(antigo.recorrentesNaSemana.map((g) => [g.freelancerId, g.solicitacoes, g.valor])).toEqual(rc.linhas.map((g) => [g.freelancerId, g.solicitacoes, g.valor]));
  });
});
