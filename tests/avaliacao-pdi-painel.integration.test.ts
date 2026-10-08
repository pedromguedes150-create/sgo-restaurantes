import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { saveEvaluation, listEvaluationBoard } from '@/lib/people/evaluation';
import { ensureModelosIniciais, criarModelo, modeloParaCargo } from '@/lib/people/avaliacao-modelos';
import { criarPlano, atualizarPlano, listarPlanos, solicitarRevisao } from '@/lib/people/pdi';
import { getPainelAvaliacao } from '@/lib/people/avaliacao-painel';
import type { SessionUser } from '@/lib/auth/session';

/**
 * PR B da avaliação (v1.162.0): plano de desenvolvimento com evolução,
 * revisão pedida pela Supervisão (resolvida ao salvar de novo) e o painel
 * com escopo por unidade. Modelo PRÓPRIO do teste (não mexe nos semeados).
 */
const sfx = `pdi${process.pid.toString(36)}`;
const CARGO = `Cargo PDI ${sfx}`;
let unitA: string; let unitB: string; let gerId: string; let supId: string; let outroGerId: string; let adminId: string;
let colab: string; let colabB: string;
const gerente = (): SessionUser => ({ id: gerId, name: 'Ger', role: 'MANAGER', unitIds: [unitA], seesAllUnits: false, needsTerms: false });
const gerenteB = (): SessionUser => ({ id: outroGerId, name: 'Ger B', role: 'MANAGER', unitIds: [unitB], seesAllUnits: false, needsTerms: false });
const supervisor = (): SessionUser => ({ id: supId, name: 'Sup', role: 'SUPERVISOR', unitIds: [unitA, unitB], seesAllUnits: false, needsTerms: false });
const admin = (): SessionUser => ({ id: adminId, name: 'Adm', role: 'ADMIN', unitIds: [], seesAllUnits: true, needsTerms: false });

function ym(offset: number): string { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + offset); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }
const CURRENT = ym(0); const PAST = ym(-1);
async function respostas(n: number, extra: Record<string, { score: number | null; justification?: string }> = {}) {
  const m = await modeloParaCargo(CARGO);
  return m!.criterios.map((c) => ({ key: c.key, justification: 'j', ...(extra[c.key] ?? { score: n }) }));
}

beforeAll(async () => {
  unitA = (await prisma.unit.create({ data: { code: `PA-${sfx}`, name: `PDI A ${sfx}`, timezone: 'America/Sao_Paulo', cutoffHour: 4 } })).id;
  unitB = (await prisma.unit.create({ data: { code: `PB-${sfx}`, name: `PDI B ${sfx}`, timezone: 'America/Sao_Paulo', cutoffHour: 4 } })).id;
  gerId = (await prisma.user.create({ data: { name: 'Ger', email: `g-${sfx}@example.com`, role: 'MANAGER', passwordHash: 'x' } })).id;
  outroGerId = (await prisma.user.create({ data: { name: 'Ger B', email: `gb-${sfx}@example.com`, role: 'MANAGER', passwordHash: 'x' } })).id;
  supId = (await prisma.user.create({ data: { name: 'Sup', email: `s-${sfx}@example.com`, role: 'SUPERVISOR', passwordHash: 'x' } })).id;
  adminId = (await prisma.user.create({ data: { name: 'Adm', email: `a-${sfx}@example.com`, role: 'ADMIN', passwordHash: 'x' } })).id;
  await prisma.unitMembership.createMany({ data: [{ userId: gerId, unitId: unitA }, { userId: outroGerId, unitId: unitB }, { userId: supId, unitId: unitA }, { userId: supId, unitId: unitB }] });
  await ensureModelosIniciais();
  const m = await criarModelo(admin(), { name: `Modelo PDI ${sfx}`, especificos: [{ label: 'A', weight: 20 }, { label: 'B', weight: 15 }, { label: 'C', weight: 15 }, { label: 'D', weight: 10 }], cargos: [CARGO] });
  if (!m.ok) throw new Error('modelo');
  colab = (await prisma.collaborator.create({ data: { name: `Ana ${sfx}`, jobTitle: CARGO, active: true, units: { create: [{ unitId: unitA }] } } })).id;
  colabB = (await prisma.collaborator.create({ data: { name: `Bia ${sfx}`, jobTitle: CARGO, active: true, units: { create: [{ unitId: unitB }] } } })).id;
});

afterAll(async () => {
  await prisma.developmentPlan.deleteMany({ where: { unitId: { in: [unitA, unitB] } } }).catch(() => {});
  await prisma.collaboratorEvaluation.deleteMany({ where: { unitId: { in: [unitA, unitB] } } }).catch(() => {});
  await prisma.evaluationModelJobTitle.deleteMany({ where: { jobTitle: { contains: sfx } } }).catch(() => {});
  await prisma.evaluationModel.deleteMany({ where: { name: { contains: sfx } } }).catch(() => {});
  await prisma.collaborator.deleteMany({ where: { id: { in: [colab, colabB] } } }).catch(() => {});
  await prisma.notification.deleteMany({ where: { userId: { in: [gerId, outroGerId, supId, adminId] } } }).catch(() => {});
  await prisma.auditLog.deleteMany({ where: { unitId: { in: [unitA, unitB] } } }).catch(() => {});
  await prisma.unit.deleteMany({ where: { id: { in: [unitA, unitB] } } }).catch(() => {});
  await prisma.user.deleteMany({ where: { id: { in: [gerId, outroGerId, supId, adminId] } } }).catch(() => {});
  await prisma.$disconnect();
});

describe('plano de desenvolvimento', () => {
  it('nasce da avaliação baixa, com responsável avisado, e a evolução aparece na avaliação seguinte', async () => {
    // mês passado: pontualidade 1 (nota baixa)
    expect(await saveEvaluation(gerente(), colab, PAST, { respostas: await respostas(2, { pontualidade: { score: 1, justification: 'faltas' } }) })).toEqual({ ok: true });
    const e = await prisma.collaboratorEvaluation.findUnique({ where: { collaboratorId_yearMonth: { collaboratorId: colab, yearMonth: PAST } } });
    const r = await criarPlano(gerente(), { collaboratorId: colab, evaluationId: e!.id, yearMonth: PAST, criterionKey: 'pontualidade', criterionLabel: 'Pontualidade e assiduidade', action: 'Conversa + acompanhamento de ponto por 30 dias', responsibleId: supId, dueDate: '2030-01-31' });
    expect(r.ok).toBe(true);
    const avisos = await prisma.notification.findMany({ where: { userId: supId, title: { contains: 'Plano de desenvolvimento' } } });
    expect(avisos).toHaveLength(1);
    const planos = await listarPlanos(gerente(), colab);
    expect(planos).toHaveLength(1);
    expect(planos[0]).toMatchObject({ criterionLabel: 'Pontualidade e assiduidade', responsibleName: 'Sup', status: 'PENDING', situacao: 'PENDING', dueDate: '2030-01-31' });
    // quadro do mês corrente: a anterior traz a nota do critério para a evolução, e o plano conta como aberto
    const board = await listEvaluationBoard(gerente(), CURRENT);
    const linha = board.find((x) => x.collaboratorId === colab)!;
    expect(linha.anterior).toMatchObject({ yearMonth: PAST, scores: expect.objectContaining({ pontualidade: 1 }) });
    expect(linha.planos).toEqual({ abertos: 1, vencidos: 0 });
  });

  it('status muda (concluído carimba a data); vencido é derivado; fora do alcance e sem perfil são recusados', async () => {
    const [p] = await listarPlanos(gerente(), colab);
    expect(await atualizarPlano(gerente(), p.id, { status: 'IN_PROGRESS' })).toMatchObject({ ok: true });
    expect(await atualizarPlano(gerenteB(), p.id, { status: 'DONE' })).toEqual({ ok: false, reason: 'FORBIDDEN' });
    expect(await atualizarPlano(gerente(), p.id, { status: 'DONE' })).toMatchObject({ ok: true });
    expect((await prisma.developmentPlan.findUnique({ where: { id: p.id } }))?.completedAt).not.toBeNull();
    const vencido = await criarPlano(gerente(), { collaboratorId: colab, yearMonth: PAST, criterionLabel: 'Equipe', action: 'x', dueDate: '2020-01-01' });
    expect(vencido.ok).toBe(true);
    const lista = await listarPlanos(gerente(), colab);
    expect(lista.find((x) => x.id === (vencido.ok ? vencido.id : ''))?.situacao).toBe('VENCIDO');
    expect(lista.find((x) => x.id === p.id)?.situacao).toBe('DONE');
    // o responsável sem id cai em quem cadastrou
    expect(lista.find((x) => x.id === (vencido.ok ? vencido.id : ''))?.responsibleName).toBe('Ger');
    const fin: SessionUser = { ...gerente(), role: 'FINANCE' };
    expect(await criarPlano(fin, { collaboratorId: colab, yearMonth: PAST, criterionLabel: 'x', action: 'y', dueDate: '2030-01-01' })).toEqual({ ok: false, reason: 'FORBIDDEN' });
    expect(await criarPlano(gerente(), { collaboratorId: colabB, yearMonth: PAST, criterionLabel: 'x', action: 'y', dueDate: '2030-01-01' })).toEqual({ ok: false, reason: 'NOT_FOUND' });
    expect(await criarPlano(gerente(), { collaboratorId: colab, yearMonth: PAST, criterionLabel: 'x', action: '', dueDate: '2030-01-01' })).toMatchObject({ ok: false, reason: 'INVALID' });
    expect(await listarPlanos(gerenteB(), colab)).toEqual([]);
  });
});

describe('revisão pela Supervisão', () => {
  it('só a Supervisão pede, com motivo; o avaliador é avisado; salvar de novo resolve; não abre duas', async () => {
    const e = await prisma.collaboratorEvaluation.findUnique({ where: { collaboratorId_yearMonth: { collaboratorId: colab, yearMonth: PAST } } });
    expect(await solicitarRevisao(gerente(), e!.id, 'motivo')).toEqual({ ok: false, reason: 'FORBIDDEN' });
    expect(await solicitarRevisao(supervisor(), e!.id, '  ')).toMatchObject({ ok: false, reason: 'INVALID' });
    expect(await solicitarRevisao(supervisor(), e!.id, 'A nota de pontualidade não bate com a Escala.')).toMatchObject({ ok: true });
    expect(await solicitarRevisao(supervisor(), e!.id, 'de novo')).toMatchObject({ ok: false, reason: 'JA_ABERTA' });
    const aviso = await prisma.notification.findFirst({ where: { userId: gerId, title: { contains: 'Revisão pedida' } } });
    expect(aviso?.level).toBe('IMPORTANTE');
    const board = await listEvaluationBoard(gerente(), PAST);
    expect(board.find((x) => x.collaboratorId === colab)!.evaluation?.revisao).toMatchObject({ porNome: 'Sup', motivo: 'A nota de pontualidade não bate com a Escala.', resolvidaEm: null });
    const painelAntes = await getPainelAvaliacao(supervisor(), { de: PAST, ate: CURRENT, unitId: null, funcao: null, colaborador: null });
    expect(painelAntes.painel.resumo.revisoesAbertas).toBe(1);
    // o avaliador revê e salva: a revisão fica resolvida, com rastro
    expect(await saveEvaluation(gerente(), colab, PAST, { respostas: await respostas(3) })).toEqual({ ok: true });
    const depois = await prisma.collaboratorEvaluation.findUnique({ where: { id: e!.id } });
    expect(depois?.reviewResolvedAt).not.toBeNull();
    expect(depois?.reviewRequestedByName).toBe('Sup');
    const audit = await prisma.auditLog.findFirst({ where: { action: 'EVALUATION_SAVED', entityId: colab }, orderBy: { createdAt: 'desc' } });
    expect((audit?.metadata as { revisaoResolvida?: boolean })?.revisaoResolvida).toBe(true);
  });
});

describe('painel', () => {
  it('respeita o escopo (gerente só a sua unidade; unidade da URL fora do alcance é ignorada) e filtra por função', async () => {
    expect(await saveEvaluation(gerenteB(), colabB, CURRENT, { respostas: await respostas(5) })).toEqual({ ok: true });
    const f = { de: PAST, ate: CURRENT, unitId: null, funcao: null, colaborador: null };
    const doGerente = await getPainelAvaliacao(gerente(), f);
    expect(doGerente.unidades.map((u) => u.id)).toEqual([unitA]);
    expect(doGerente.painel.resumo.avaliacoes).toBe(1);
    expect(doGerente.painel.porUnidade).toHaveLength(1);
    const doSup = await getPainelAvaliacao(supervisor(), f);
    expect(doSup.painel.resumo.avaliacoes).toBe(2);
    expect(doSup.painel.porFuncao[0]).toMatchObject({ funcao: `Modelo PDI ${sfx}`, avaliacoes: 2, colaboradores: 2, media: 4 });
    expect(doSup.painel.planos.lista).toHaveLength(2);
    // unidade B pedida pelo gerente de A: ignorada (fica só A)
    const forcado = await getPainelAvaliacao(gerente(), { ...f, unitId: unitB });
    expect(forcado.painel.resumo.avaliacoes).toBe(1);
    expect(forcado.painel.porUnidade.map((u) => u.unitId)).toEqual([unitA]);
    // filtro por função que não existe → nada
    expect((await getPainelAvaliacao(supervisor(), { ...f, funcao: 'Nada' })).painel.resumo.avaliacoes).toBe(0);
    expect((await getPainelAvaliacao(supervisor(), { ...f, colaborador: `bia ${sfx}` })).painel.resumo.avaliacoes).toBe(1);
  });
});
