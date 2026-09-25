import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { createPop, updatePop } from '@/lib/pops';
import { reconcileTrainingForUnit, completeTraining, getTrainingBoard } from '@/lib/training';
import { getPainelTreinamentos } from '@/lib/treinamentos/painel';
import { opcoesDePublico } from '@/lib/treinamentos/publico';
import type { SessionUser } from '@/lib/auth/session';

/**
 * TREINAMENTO FUNCIONAL — o POP direcionado por FUNÇÃO + colaboradores
 * adicionais, materializado pela reconciliação e lido pelo painel.
 * (Desde a v1.124.0 o público mora no MÓDULO; aqui cada POP tem um módulo só —
 * a regra por função é a mesma. Vários módulos: `treinamentos-modulos`.)
 */

const sfx = `${process.pid.toString(36)}${Date.now().toString(36).slice(-4)}`;
let unitA: string;
let unitB: string;
let adminId: string;
let joao: string;    // Churrasqueiro (unidade A) — vínculo individual
let maria: string;   // Atendente (unidade A)
let carlos: string;  // Auxiliar de Cozinha (unidade A) — função E vínculo
let pedro: string;   // Atendente (unidade B, fora do POP)
let popPq: string;
const popsCriados: string[] = [];

const admin = (): SessionUser => ({ id: adminId, name: 'Admin', role: 'ADMIN', unitIds: [], seesAllUnits: true, needsTerms: false });

async function colab(name: string, jobTitle: string, unitId: string) {
  return (await prisma.collaborator.create({ data: { name: `${name} ${sfx}`, jobTitle, units: { create: [{ unitId }] } } })).id;
}
const umModulo = (m: { name?: string; allPublic?: boolean; jobTitles?: string[]; collaboratorIds?: string[]; blocks?: { type: 'text'; text: string }[] }) => [
  { name: m.name ?? 'Treinamento', allPublic: m.allPublic ?? false, jobTitles: m.jobTitles ?? [], collaboratorIds: m.collaboratorIds ?? [], sectorNames: [], blocks: m.blocks ?? [] },
];

beforeAll(async () => {
  unitA = (await prisma.unit.create({ data: { code: `TA-${sfx}`, name: `Moreira ${sfx}`, timezone: 'America/Sao_Paulo', cutoffHour: 4 } })).id;
  unitB = (await prisma.unit.create({ data: { code: `TB-${sfx}`, name: `KM13 ${sfx}`, timezone: 'America/Sao_Paulo', cutoffHour: 4 } })).id;
  adminId = (await prisma.user.create({ data: { name: 'Admin Trein', email: `trein-${sfx}@t.local`, role: 'ADMIN', passwordHash: 'x' } })).id;
  joao = await colab('João', 'Churrasqueiro', unitA);
  maria = await colab('Maria', 'ATENDENTE', unitA);
  carlos = await colab('Carlos', 'Auxiliar de Cozinha', unitA);
  pedro = await colab('Pedro', 'Atendente', unitB);
});

afterAll(async () => {
  await prisma.pop.deleteMany({ where: { id: { in: popsCriados } } });
  await prisma.collaborator.deleteMany({ where: { id: { in: [joao, maria, carlos, pedro] } } });
  await prisma.unit.deleteMany({ where: { id: { in: [unitA, unitB] } } });
  await prisma.user.deleteMany({ where: { id: adminId } });
  await prisma.$disconnect();
});

async function registrosDe(popId: string) {
  return prisma.trainingRecord.findMany({ where: { popId }, select: { collaboratorId: true, origin: true, status: true, unitId: true } });
}
async function moduloDe(popId: string) {
  return (await prisma.popModule.findFirstOrThrow({ where: { popId, active: true }, select: { id: true, version: true } }));
}

describe('POP direcionado por função + colaborador adicional', () => {
  it('gera pendência para a função nas unidades do POP, o vínculo individual entra, e o de fora fica de fora', async () => {
    const r = await createPop(admin(), {
      title: `Assar Pão de Queijo ${sfx}`,
      unitIds: [unitA],
      modules: umModulo({ jobTitles: ['Atendente', 'auxiliar de cozinha'], collaboratorIds: [joao, carlos], blocks: [{ type: 'text', text: 'Como assar' }] }),
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    popPq = r.id;
    popsCriados.push(popPq);

    const regs = await registrosDe(popPq);
    const porColab = new Map(regs.map((x) => [x.collaboratorId, x]));
    expect(porColab.get(maria)?.origin).toBe('JOB_TITLE');   // grafia diferente, mesma função
    expect(porColab.get(joao)?.origin).toBe('INDIVIDUAL');   // churrasqueiro que assa pão de queijo
    expect(porColab.has(pedro)).toBe(false);                 // Atendente, mas da unidade B
    expect(regs.filter((x) => x.collaboratorId === carlos)).toHaveLength(1); // função E vínculo → UM registro
    expect(porColab.get(carlos)?.origin).toBe('JOB_TITLE');
    expect(regs).toHaveLength(3);
  });

  it('o quadro da unidade agrupa por origem e traz módulo e origem em cada item', async () => {
    const board = await getTrainingBoard(unitA);
    const grupos = board.map((g) => g.sector);
    expect(grupos).toContain('Função: ATENDENTE');
    expect(grupos).toContain('Atribuição individual');
    const individual = board.find((g) => g.sector === 'Atribuição individual')!;
    expect(individual.collaborators.map((c) => c.collaboratorId)).toEqual([joao]);
    expect(individual.collaborators[0].items[0]).toMatchObject({ origin: 'INDIVIDUAL', moduleName: 'Treinamento' });
  });

  it('mudança de função: a pendência da função antiga some, a nova aparece, e o concluído FICA', async () => {
    const recMaria = await prisma.trainingRecord.findFirst({ where: { popId: popPq, collaboratorId: maria } });
    expect(recMaria).not.toBeNull();
    await completeTraining(admin(), recMaria!.id);

    const r2 = await createPop(admin(), { title: `Ponto da Carne ${sfx}`, unitIds: [unitA], modules: umModulo({ jobTitles: ['Churrasqueiro'] }) });
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    popsCriados.push(r2.id);
    expect((await registrosDe(r2.id)).map((x) => x.collaboratorId)).toEqual([joao]);

    await prisma.collaborator.update({ where: { id: maria }, data: { jobTitle: 'Churrasqueiro' } });
    await reconcileTrainingForUnit(unitA);

    const carne = await registrosDe(r2.id);
    expect(carne.map((x) => x.collaboratorId).sort()).toEqual([joao, maria].sort());
    const pq = await registrosDe(popPq);
    expect(pq.find((x) => x.collaboratorId === maria)?.status).toBe('DONE'); // histórico preservado
  });

  it('trocar só o PÚBLICO não sobe a versão do módulo (o JSONB devolve as chaves em outra ordem)', async () => {
    const antes = await moduloDe(popPq);
    const r = await updatePop(admin(), popPq, {
      title: `Assar Pão de Queijo ${sfx}`,
      unitIds: [unitA],
      modules: [{ id: antes.id, name: 'Treinamento', jobTitles: ['Atendente', 'Auxiliar de Cozinha'], collaboratorIds: [joao, carlos], sectorNames: [], blocks: [{ type: 'text', text: 'Como assar' }] }],
    });
    expect(r.ok).toBe(true);
    const depois = await moduloDe(popPq);
    expect(depois.id).toBe(antes.id);
    expect(depois.version).toBe(antes.version);
    expect((await registrosDe(popPq)).find((x) => x.collaboratorId === maria)?.status).toBe('DONE');
  });

  it('tirar o vínculo individual apaga só a pendência dele', async () => {
    const m = await moduloDe(popPq);
    const r = await updatePop(admin(), popPq, {
      title: `Assar Pão de Queijo ${sfx}`,
      unitIds: [unitA],
      modules: [{ id: m.id, name: 'Treinamento', jobTitles: ['Atendente', 'Auxiliar de Cozinha'], collaboratorIds: [], sectorNames: [], blocks: [{ type: 'text', text: 'Como assar' }] }],
    });
    expect(r.ok).toBe(true);
    const regs = await registrosDe(popPq);
    expect(regs.some((x) => x.collaboratorId === joao)).toBe(false);
    expect(regs.find((x) => x.collaboratorId === carlos)?.status).toBe('PENDING');
    expect(regs.find((x) => x.collaboratorId === maria)?.status).toBe('DONE');
  });

  it('módulo GERAL limpa o direcionamento e vale para todos da unidade', async () => {
    const r = await createPop(admin(), { title: `Abertura ${sfx}`, unitIds: [unitA], modules: umModulo({ allPublic: true, jobTitles: ['Atendente'] }) });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    popsCriados.push(r.id);
    const mod = await prisma.popModule.findFirstOrThrow({ where: { popId: r.id }, include: { jobTitles: true } });
    expect(mod.allPublic).toBe(true);
    expect(mod.jobTitles).toHaveLength(0);
    const regs = await registrosDe(r.id);
    expect(regs.map((x) => x.collaboratorId).sort()).toEqual([joao, maria, carlos].sort());
    expect(regs.every((x) => x.origin === 'GENERAL')).toBe(true);
  });
});

describe('painel de acompanhamento', () => {
  it('conta só os aplicáveis de cada pessoa e a taxa sai sobre eles', async () => {
    const { painel, opcoes } = await getPainelTreinamentos(admin(), { unitId: unitA });
    const c = painel.porColaborador.find((x) => x.collaboratorId === carlos)!;
    expect(c.previstos).toBe(2);
    expect(c.itens.map((i) => i.origin).sort()).toEqual(['GENERAL', 'JOB_TITLE']);
    const m = painel.porColaborador.find((x) => x.collaboratorId === maria)!;
    expect(m).toMatchObject({ previstos: 3, concluidos: 1, taxa: 33.3 });
    expect(painel.porColaborador.some((x) => x.collaboratorId === pedro)).toBe(false);
    expect(opcoes.unidades.some((u) => u.id === unitA)).toBe(true);
    const pq = painel.porTreinamento.find((t) => t.popId === popPq)!;
    expect(pq).toMatchObject({ previstos: 2, concluidos: 1, pendentes: 1, modulos: 1 });
    expect(painel.pendencias.filter((l) => l.popId === popPq).map((l) => l.collaboratorId)).toEqual([carlos]);
  });

  it('as funções oferecidas ao editor vêm do cadastro, uma por grafia normalizada', async () => {
    const { funcoes, colaboradores } = await opcoesDePublico(admin());
    expect(funcoes.filter((f) => f.toLowerCase() === 'churrasqueiro')).toHaveLength(1);
    expect(colaboradores.find((x) => x.id === joao)!.unitIds).toEqual([unitA]);
  });
});
