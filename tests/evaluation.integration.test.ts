import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { saveEvaluation, addObservation, listObservations, getEvaluationMonthStats, getEvaluationWeight, listEvaluationBoard, listEvaluationHistory, evidenciasDoMes } from '@/lib/people/evaluation';
import { ensureModelosIniciais, editarModelo, vincularCargos, criarModelo, funcoesSemModelo, modeloParaCargo } from '@/lib/people/avaliacao-modelos';
import { getPerfil360 } from '@/lib/people/perfil-360';
import type { SessionUser } from '@/lib/auth/session';

/**
 * Avaliação do colaborador — formato POR FUNÇÃO (v1.161.0) + as regras da meta
 * de sempre. Cenário: unidade com um cozinheiro (modelo PRÓPRIO do teste, com
 * os pesos 20/15/15/10), um encarregado (modelo gerencial semeado, só lido),
 * um cargo do RH sem modelo e uma avaliação antiga de 4 critérios que precisa
 * continuar legível.
 *
 * ⚠️ Os modelos semeados são GLOBAIS no banco de dev: o teste só os LÊ. Editar
 * pesos acontece no modelo criado aqui — editar o "Cozinheiro" semeado deixava
 * versão nova para trás e quebrava a própria execução seguinte.
 */
const sfx = `evl${process.pid.toString(36)}`;
const CARGO_TESTE = `Cozinha Teste ${sfx}`;
let unitId: string; let userId: string; let supId: string; let adminId: string; let modeloTeste: string;
let cozinheiro: string; let encarregado: string; let semModelo: string; let euMesmo: string;
const gerente = (): SessionUser => ({ id: userId, name: 'Ger', role: 'MANAGER', unitIds: [unitId], seesAllUnits: false, needsTerms: false });
const supervisor = (): SessionUser => ({ id: supId, name: 'Sup', role: 'SUPERVISOR', unitIds: [unitId], seesAllUnits: false, needsTerms: false });
const admin = (): SessionUser => ({ id: adminId, name: 'Adm', role: 'ADMIN', unitIds: [], seesAllUnits: true, needsTerms: false });

function ym(offsetMonths: number): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + offsetMonths);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
const CURRENT = ym(0);
const PAST = ym(-1);
const ESPECIFICOS = [{ label: 'Qualidade do preparo', weight: 20 }, { label: 'Produtividade', weight: 15 }, { label: 'Cumprimento de POPs', weight: 15 }, { label: 'Controle de desperdícios', weight: 10 }];

/** Respostas completas para o modelo da função (nota n em tudo). */
async function respostas(jobTitle: string, n: number, extra: Record<string, { score: number | null; justification?: string }> = {}) {
  const m = await modeloParaCargo(jobTitle);
  if (!m) throw new Error('sem modelo para ' + jobTitle);
  return m.criterios.map((c) => ({ key: c.key, justification: '', ...(extra[c.key] ?? { score: n }) }));
}

beforeAll(async () => {
  const unit = await prisma.unit.create({ data: { code: `EVL-${sfx}`, name: `Unidade Aval ${sfx}`, timezone: 'America/Sao_Paulo', cutoffHour: 4 } });
  unitId = unit.id;
  userId = (await prisma.user.create({ data: { name: 'Ger', email: `${sfx}@example.com`, role: 'MANAGER', passwordHash: 'x', cpf: '11122233344' } })).id;
  supId = (await prisma.user.create({ data: { name: 'Sup', email: `s-${sfx}@example.com`, role: 'SUPERVISOR', passwordHash: 'x' } })).id;
  adminId = (await prisma.user.create({ data: { name: 'Adm', email: `a-${sfx}@example.com`, role: 'ADMIN', passwordHash: 'x' } })).id;
  await prisma.unitMembership.createMany({ data: [{ userId, unitId }, { userId: supId, unitId }] });
  await ensureModelosIniciais();
  const criado = await criarModelo(admin(), { name: `Cozinheiro ${sfx}`, especificos: ESPECIFICOS, cargos: [CARGO_TESTE] });
  if (!criado.ok) throw new Error('modelo de teste');
  modeloTeste = criado.id;
  const mk = async (name: string, jobTitle: string | null, cpf?: string) =>
    (await prisma.collaborator.create({ data: { name: `${name} ${sfx}`, jobTitle, cpf, active: true, units: { create: [{ unitId }] } } })).id;
  cozinheiro = await mk('Cozinheiro', CARGO_TESTE.toUpperCase());
  encarregado = await mk('Encarregado', 'ENCARREGADO DE RESTAURANTE');
  semModelo = await mk('Sem Modelo', `Cargo Inexistente ${sfx}`);
  euMesmo = await mk('Eu Mesmo', 'Garçom', '111.222.333-44');
});

afterAll(async () => {
  await prisma.collaboratorEvaluation.deleteMany({ where: { unitId } }).catch(() => {});
  await prisma.collaboratorObservation.deleteMany({ where: { unitId } }).catch(() => {});
  await prisma.evaluationModelJobTitle.deleteMany({ where: { jobTitle: { contains: sfx } } }).catch(() => {});
  await prisma.evaluationModel.deleteMany({ where: { name: { contains: sfx } } }).catch(() => {});
  await prisma.collaborator.deleteMany({ where: { id: { in: [cozinheiro, encarregado, semModelo, euMesmo] } } }).catch(() => {});
  await prisma.auditLog.deleteMany({ where: { unitId } }).catch(() => {});
  await prisma.unit.delete({ where: { id: unitId } }).catch(() => {});
  await prisma.user.deleteMany({ where: { id: { in: [userId, supId, adminId] } } }).catch(() => {});
  await prisma.$disconnect();
});

describe('modelos iniciais e vínculo com o cargo do RH', () => {
  it('a semeadura é idempotente e casa o cargo do RH normalizado', async () => {
    const antes = await prisma.evaluationModel.count({ where: { seedKey: { not: null } } });
    await ensureModelosIniciais();
    expect(await prisma.evaluationModel.count({ where: { seedKey: { not: null } } })).toBe(antes);
    expect(antes).toBe(10);
    const m = await modeloParaCargo('COZINHEIRO(A)');
    expect(m).toMatchObject({ name: 'Cozinheiro', managerial: false });
    expect(m!.criterios).toHaveLength(8);
    expect((await modeloParaCargo('ENCARREGADO DE RESTAURANTE'))?.managerial).toBe(true);
    // o cargo do teste casa em caixa alta porque a chave é normalizada
    expect((await modeloParaCargo(CARGO_TESTE.toUpperCase()))?.id).toBe(modeloTeste);
    expect(await modeloParaCargo(`Cargo Inexistente ${sfx}`)).toBeNull();
  });

  it('o quadro diz quem tem modelo, quem é gerencial e quem o gerente pode avaliar (inclusive ele mesmo pelo CPF)', async () => {
    const board = await listEvaluationBoard(gerente(), CURRENT);
    const por = (id: string) => board.find((r) => r.collaboratorId === id)!;
    expect(por(cozinheiro).permissao).toEqual({ pode: true, motivo: null });
    expect(por(cozinheiro).modelo?.id).toBe(modeloTeste);
    expect(por(encarregado).permissao).toEqual({ pode: false, motivo: 'GERENCIAL' });
    expect(por(semModelo).modelo).toBeNull();
    expect(por(semModelo).permissao).toEqual({ pode: false, motivo: 'SEM_MODELO' });
    expect(por(euMesmo).permissao).toEqual({ pode: false, motivo: 'PROPRIO' });
    const sup = await listEvaluationBoard(supervisor(), CURRENT);
    expect(sup.find((r) => r.collaboratorId === encarregado)!.permissao.pode).toBe(true);
    const faltam = await funcoesSemModelo();
    expect(faltam.cargos.map((c) => c.jobTitle)).toContain(`Cargo Inexistente ${sfx}`);
  });
});

describe('salvar a avaliação pelo modelo da função', () => {
  it('nota ponderada e classificação CONGELADAS com a versão do modelo; upsert por mês', async () => {
    const r1 = await saveEvaluation(gerente(), cozinheiro, CURRENT, { respostas: await respostas(CARGO_TESTE, 4) });
    expect(r1).toEqual({ ok: true });
    const r2 = await saveEvaluation(gerente(), cozinheiro, CURRENT, { respostas: await respostas(CARGO_TESTE, 5), comments: 'melhorou' });
    expect(r2).toEqual({ ok: true });
    const rows = await prisma.collaboratorEvaluation.findMany({ where: { collaboratorId: cozinheiro, yearMonth: CURRENT }, include: { modelVersion: true } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ finalScore: 5, classification: 'EXCELENTE', modelName: `Cozinheiro ${sfx}`, jobTitle: CARGO_TESTE.toUpperCase(), punctuality: null, comments: 'melhorou' });
    expect(rows[0].modelVersion?.version).toBe(1);
    expect(Array.isArray(rows[0].scores) && (rows[0].scores as unknown[]).length).toBe(8);
  });

  it('N/A com justificativa redistribui; nota 2 sem justificativa é recusada com o erro nomeado', async () => {
    const semJust = await saveEvaluation(gerente(), cozinheiro, PAST, { respostas: await respostas(CARGO_TESTE, 4, { pontualidade: { score: 2 } }) });
    expect(semJust).toMatchObject({ ok: false, reason: 'INVALID', erros: ['"Pontualidade e assiduidade": nota 2 exige justificativa.'] });
    const comNa = await saveEvaluation(gerente(), cozinheiro, PAST, { respostas: await respostas(CARGO_TESTE, 4, { 'controle-de-desperdicios': { score: null, justification: 'não lançou desperdício no mês' }, pontualidade: { score: 2, justification: 'atrasou 4x' } }) });
    expect(comNa).toEqual({ ok: true });
    const e = await prisma.collaboratorEvaluation.findUnique({ where: { collaboratorId_yearMonth: { collaboratorId: cozinheiro, yearMonth: PAST } } });
    // (2×10 + 4×80) / 90 = 3,78
    expect(e?.finalScore).toBe(3.78);
    expect(e?.classification).toBe('BOM');
  });

  it('função sem modelo, gerencial pelo gerente, a si próprio, FINANCE e mês futuro são recusados', async () => {
    expect(await saveEvaluation(gerente(), semModelo, CURRENT, { respostas: [] })).toEqual({ ok: false, reason: 'SEM_MODELO' });
    expect(await saveEvaluation(gerente(), encarregado, CURRENT, { respostas: await respostas('ENCARREGADO DE RESTAURANTE', 4) })).toEqual({ ok: false, reason: 'GERENCIAL' });
    expect(await saveEvaluation(gerente(), euMesmo, CURRENT, { respostas: await respostas('Garçom', 4) })).toEqual({ ok: false, reason: 'PROPRIO' });
    const fin: SessionUser = { id: userId, name: 'F', role: 'FINANCE', unitIds: [unitId], seesAllUnits: false, needsTerms: false };
    expect(await saveEvaluation(fin, cozinheiro, CURRENT, { respostas: await respostas(CARGO_TESTE, 3) })).toEqual({ ok: false, reason: 'FORBIDDEN' });
    expect((await saveEvaluation(gerente(), cozinheiro, ym(1), { respostas: await respostas(CARGO_TESTE, 3) })).ok).toBe(false);
    // o Supervisor avalia o encarregado
    expect(await saveEvaluation(supervisor(), encarregado, CURRENT, { respostas: await respostas('ENCARREGADO DE RESTAURANTE', 4) })).toEqual({ ok: true });
  });

  it('mudar os pesos cria versão nova e NÃO recalcula a avaliação já gravada', async () => {
    const r = await editarModelo(admin(), modeloTeste, { especificos: [{ label: 'Qualidade do preparo', weight: 30 }, { label: 'Produtividade', weight: 10 }, { label: 'Cumprimento de POPs', weight: 10 }, { label: 'Controle de desperdícios', weight: 10 }] });
    expect(r).toMatchObject({ ok: true, novaVersao: 2 });
    expect((await modeloParaCargo(CARGO_TESTE))?.version).toBe(2);
    const antiga = await prisma.collaboratorEvaluation.findUnique({ where: { collaboratorId_yearMonth: { collaboratorId: cozinheiro, yearMonth: PAST } }, include: { modelVersion: true } });
    expect(antiga?.finalScore).toBe(3.78);
    expect(antiga?.modelVersion?.version).toBe(1);
    // mesma edição de novo = sem versão nova; só o nome = sem versão nova
    expect(await editarModelo(admin(), modeloTeste, { especificos: [{ label: 'Qualidade do preparo', weight: 30 }, { label: 'Produtividade', weight: 10 }, { label: 'Cumprimento de POPs', weight: 10 }, { label: 'Controle de desperdícios', weight: 10 }] })).toMatchObject({ ok: true, novaVersao: undefined });
    expect(await editarModelo(admin(), modeloTeste, { name: `Cozinheiro ${sfx}` })).toMatchObject({ ok: true, novaVersao: undefined });
    // a avaliação NOVA usa a versão vigente (v2) — a de ontem segue em v1
    expect(await saveEvaluation(gerente(), cozinheiro, CURRENT, { respostas: await respostas(CARGO_TESTE, 5) })).toEqual({ ok: true });
    const nova = await prisma.collaboratorEvaluation.findUnique({ where: { collaboratorId_yearMonth: { collaboratorId: cozinheiro, yearMonth: CURRENT } }, include: { modelVersion: true } });
    expect(nova?.modelVersion?.version).toBe(2);
    expect(await editarModelo(gerente(), modeloTeste, { name: 'x' })).toEqual({ ok: false, reason: 'FORBIDDEN' });
  });

  it('o Admin vincula o cargo sem modelo (e pode mover um cargo de modelo); peso que não soma 60 é recusado', async () => {
    const novo = await criarModelo(admin(), { name: `Modelo Teste ${sfx}`, especificos: [{ label: 'A', weight: 20 }, { label: 'B', weight: 20 }, { label: 'C', weight: 10 }, { label: 'D', weight: 10 }], cargos: [`Cargo Inexistente ${sfx}`] });
    expect(novo.ok).toBe(true);
    const novoId = novo.ok ? novo.id : '';
    expect((await modeloParaCargo(`Cargo Inexistente ${sfx}`))?.name).toBe(`Modelo Teste ${sfx}`);
    expect((await funcoesSemModelo()).cargos.map((c) => c.jobTitle)).not.toContain(`Cargo Inexistente ${sfx}`);
    expect(await criarModelo(admin(), { name: 'x', especificos: [{ label: 'A', weight: 20 }, { label: 'B', weight: 20 }, { label: 'C', weight: 20 }, { label: 'D', weight: 20 }] })).toMatchObject({ ok: false, reason: 'INVALID' });
    // mover: o cargo do modelo do teste passa para o novo e a resposta nomeia o movido
    const mov = await vincularCargos(admin(), novoId, [`Cargo Inexistente ${sfx}`, CARGO_TESTE]);
    expect(mov).toMatchObject({ ok: true, movidos: [CARGO_TESTE] });
    expect((await modeloParaCargo(CARGO_TESTE))?.id).toBe(novoId);
    // e volta
    expect(await vincularCargos(admin(), modeloTeste, [CARGO_TESTE])).toMatchObject({ ok: true, movidos: [CARGO_TESTE] });
    expect((await modeloParaCargo(CARGO_TESTE))?.id).toBe(modeloTeste);
    expect((await modeloParaCargo('Garçom'))?.name).toBe('Garçom / Atendente'); // o semeado não foi tocado
    // desativar o modelo faz o cargo voltar a "sem modelo"
    await editarModelo(admin(), novoId, { active: false });
    expect(await modeloParaCargo(`Cargo Inexistente ${sfx}`)).toBeNull();
    expect((await funcoesSemModelo()).cargos.find((c) => c.jobTitle === `Cargo Inexistente ${sfx}`)?.modeloInativo).toBe(`Modelo Teste ${sfx}`);
    expect(await saveEvaluation(gerente(), semModelo, CURRENT, { respostas: [] })).toEqual({ ok: false, reason: 'SEM_MODELO' });
  });
});

describe('avaliação antiga (4 critérios) continua legível', () => {
  it('histórico e Perfil 360 leem a média dos 4; a reavaliação pelo modelo substitui no mesmo mês', async () => {
    const ANTIGO = ym(-2);
    await prisma.collaboratorEvaluation.create({ data: { collaboratorId: cozinheiro, collaboratorName: 'x', unitId, yearMonth: ANTIGO, punctuality: 4, performance: 5, teamwork: 4, presentation: 5, evaluatorId: userId, evaluatorName: 'Ger' } });
    const hist = await listEvaluationHistory(gerente(), cozinheiro);
    const h = hist.find((x) => x.yearMonth === ANTIGO)!;
    expect(h).toMatchObject({ nota: 4.5, classificacao: null, modelName: null, legado: { punctuality: 4, performance: 5, teamwork: 4, presentation: 5 } });
    expect(hist.find((x) => x.yearMonth === CURRENT)).toMatchObject({ nota: 5, classificacao: 'EXCELENTE', modelName: `Cozinheiro ${sfx}`, legado: null });
    const board = await listEvaluationBoard(gerente(), ANTIGO);
    expect(board.find((r) => r.collaboratorId === cozinheiro)!.evaluation).toMatchObject({ nota: 4.5, legado: { punctuality: 4 } });
    const perfil = await getPerfil360(gerente(), cozinheiro, () => true);
    expect(perfil?.avaliacao?.serie.find((s) => s.yearMonth === ANTIGO)?.nota).toBe(4.5);
    expect(perfil?.avaliacao?.serie.find((s) => s.yearMonth === CURRENT)?.nota).toBe(5);
    // reavaliar o mês antigo pelo modelo: a linha é a mesma, agora com nota ponderada
    expect(await saveEvaluation(gerente(), cozinheiro, ANTIGO, { respostas: await respostas(CARGO_TESTE, 3) })).toEqual({ ok: true });
    const e = await prisma.collaboratorEvaluation.findMany({ where: { collaboratorId: cozinheiro, yearMonth: ANTIGO } });
    expect(e).toHaveLength(1);
    expect(e[0]).toMatchObject({ finalScore: 3, punctuality: null });
  });
});

describe('apoio ao avaliador e regras da meta (como sempre)', () => {
  it('evidências do mês: só leitura, sem atestado, fora do escopo = null', async () => {
    const ev = await evidenciasDoMes(gerente(), cozinheiro, CURRENT);
    expect(ev).toMatchObject({ yearMonth: CURRENT, checklists: 0, treinamentos: { concluidos: 0, pendentes: 0, atrasados: 0 } });
    expect(ev && 'atestados' in ev).toBe(false);
    const outra: SessionUser = { id: supId, name: 'S', role: 'SUPERVISOR', unitIds: ['nao-existe'], seesAllUnits: false, needsTerms: false };
    expect(await evidenciasDoMes(outra, cozinheiro, CURRENT)).toBeNull();
  });
  it('peso padrão 0; mês corrente nunca penaliza; mês encerrado conta ativos sem avaliação', async () => {
    expect(await getEvaluationWeight()).toBe(0);
    await prisma.collaboratorEvaluation.deleteMany({ where: { unitId, yearMonth: CURRENT } });
    expect(await getEvaluationMonthStats(unitId, CURRENT)).toEqual({ done: 0, missed: 0 });
    const s = await getEvaluationMonthStats(unitId, PAST);
    expect(s.done).toBe(1); // o cozinheiro (N/A) foi avaliado em PAST
    expect(s.missed).toBe(3); // encarregado, sem modelo e eu mesmo
  });
  it('observação não altera o cadastro e fica listada com autor', async () => {
    expect(await addObservation(gerente(), cozinheiro, 'Chegou 10 min atrasado')).toEqual({ ok: true });
    const list = await listObservations(gerente(), cozinheiro);
    expect(list).toHaveLength(1);
    expect(list[0].authorName).toBe('Ger');
  });
});
