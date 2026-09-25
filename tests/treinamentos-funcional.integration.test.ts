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
 *
 * O que estes casos travam, com banco:
 *  - POP por função gera pendência só para quem tem a função nas unidades do POP;
 *  - o colaborador adicional entra por VÍNCULO INDIVIDUAL sem mudar a função dele;
 *  - função E vínculo = UM registro (chave única), origem JOB_TITLE;
 *  - mudança de função: pendência antiga some, a nova aparece, o CONCLUÍDO fica;
 *  - tirar o vínculo individual apaga a pendência (e só ela);
 *  - o painel conta só os aplicáveis (6/8 = 75%, não 6/30).
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

describe('POP direcionado por função + colaborador adicional', () => {
  it('gera pendência para a função nas unidades do POP, o vínculo individual entra, e o de fora fica de fora', async () => {
    const r = await createPop(admin(), {
      title: `Assar Pão de Queijo ${sfx}`,
      blocks: [{ type: 'text', text: 'Como assar' }],
      unitIds: [unitA],
      jobTitles: ['Atendente', 'auxiliar de cozinha'],
      collaboratorIds: [joao, carlos],
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
    // Carlos: função E vínculo → UM registro, origem FUNÇÃO
    expect(regs.filter((x) => x.collaboratorId === carlos)).toHaveLength(1);
    expect(porColab.get(carlos)?.origin).toBe('JOB_TITLE');
    expect(regs).toHaveLength(3);
  });

  it('o quadro da unidade agrupa por origem e traz a origem em cada item', async () => {
    const board = await getTrainingBoard(unitA);
    const grupos = board.map((g) => g.sector);
    expect(grupos).toContain('Função: ATENDENTE');
    expect(grupos).toContain('Atribuição individual');
    const individual = board.find((g) => g.sector === 'Atribuição individual')!;
    expect(individual.collaborators.map((c) => c.collaboratorId)).toEqual([joao]);
    expect(individual.collaborators[0].items[0].origin).toBe('INDIVIDUAL');
  });

  it('mudança de função: a pendência da função antiga some, a nova aparece, e o concluído FICA', async () => {
    // Maria conclui o pão de queijo antes de mudar de função
    const recMaria = await prisma.trainingRecord.findFirst({ where: { popId: popPq, collaboratorId: maria } });
    expect(recMaria).not.toBeNull();
    await completeTraining(admin(), recMaria!.id);

    // POP só para Churrasqueiro
    const r2 = await createPop(admin(), { title: `Ponto da Carne ${sfx}`, blocks: [], unitIds: [unitA], jobTitles: ['Churrasqueiro'] });
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    popsCriados.push(r2.id);
    expect((await registrosDe(r2.id)).map((x) => x.collaboratorId)).toEqual([joao]);

    // Maria vira Churrasqueira (como o RH faria) e a unidade é reconciliada
    await prisma.collaborator.update({ where: { id: maria }, data: { jobTitle: 'Churrasqueiro' } });
    await reconcileTrainingForUnit(unitA);

    const carne = await registrosDe(r2.id);
    expect(carne.map((x) => x.collaboratorId).sort()).toEqual([joao, maria].sort()); // nova função → novo aplicável
    const pq = await registrosDe(popPq);
    const deMaria = pq.find((x) => x.collaboratorId === maria);
    expect(deMaria?.status).toBe('DONE'); // histórico preservado, mesmo sem a função
  });

  it('trocar só o PÚBLICO não sobe a versão (o JSONB devolve as chaves em outra ordem — comparava sempre "mudou")', async () => {
    const antes = await prisma.pop.findUnique({ where: { id: popPq }, select: { version: true } });
    const r = await updatePop(admin(), popPq, {
      title: `Assar Pão de Queijo ${sfx}`,
      blocks: [{ type: 'text', text: 'Como assar' }], // o MESMO conteúdo
      unitIds: [unitA],
      jobTitles: ['Atendente', 'Auxiliar de Cozinha'],
      collaboratorIds: [joao, carlos],
    });
    expect(r.ok && r.version).toBe(antes?.version);
    // e os concluídos continuam concluídos — ninguém refaz treinamento por causa de um ajuste de público
    expect((await registrosDe(popPq)).find((x) => x.collaboratorId === maria)?.status).toBe('DONE');
  });

  it('tirar o vínculo individual apaga só a pendência dele', async () => {
    const r = await updatePop(admin(), popPq, {
      title: `Assar Pão de Queijo ${sfx}`,
      blocks: [{ type: 'text', text: 'Como assar' }],
      unitIds: [unitA],
      jobTitles: ['Atendente', 'Auxiliar de Cozinha'],
      collaboratorIds: [], // João sai
    });
    expect(r.ok).toBe(true);
    const regs = await registrosDe(popPq);
    expect(regs.some((x) => x.collaboratorId === joao)).toBe(false);
    expect(regs.find((x) => x.collaboratorId === carlos)?.status).toBe('PENDING');
    expect(regs.find((x) => x.collaboratorId === maria)?.status).toBe('DONE');
  });

  it('POP GERAL limpa o direcionamento e vale para todos da unidade', async () => {
    const r = await createPop(admin(), { title: `Abertura ${sfx}`, blocks: [], unitIds: [unitA], isInitial: true, jobTitles: ['Atendente'] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    popsCriados.push(r.id);
    const pop = await prisma.pop.findUnique({ where: { id: r.id }, include: { jobTitles: true } });
    expect(pop?.isInitial).toBe(true);
    expect(pop?.jobTitles).toHaveLength(0); // geral e direcionado são exclusivos
    const regs = await registrosDe(r.id);
    expect(regs.map((x) => x.collaboratorId).sort()).toEqual([joao, maria, carlos].sort());
    expect(regs.every((x) => x.origin === 'GENERAL')).toBe(true);
  });
});

describe('painel de acompanhamento', () => {
  it('conta só os aplicáveis de cada pessoa e a taxa sai sobre eles', async () => {
    const { painel, opcoes } = await getPainelTreinamentos(admin(), { unitId: unitA });
    // Carlos: pão de queijo (função) + abertura (geral) = 2 aplicáveis, 0 concluídos
    const c = painel.porColaborador.find((x) => x.collaboratorId === carlos)!;
    expect(c.previstos).toBe(2);
    expect(c.itens.map((i) => i.origin).sort()).toEqual(['GENERAL', 'JOB_TITLE']);
    // Maria: pão de queijo (DONE) + carne + abertura = 3 aplicáveis, 1 concluído → 33,3%
    const m = painel.porColaborador.find((x) => x.collaboratorId === maria)!;
    expect(m).toMatchObject({ previstos: 3, concluidos: 1, taxa: 33.3 });
    // Pedro (unidade B) não aparece no recorte da unidade A
    expect(painel.porColaborador.some((x) => x.collaboratorId === pedro)).toBe(false);
    expect(opcoes.unidades.some((u) => u.id === unitA)).toBe(true);
    // por treinamento: quem ainda não fez o pão de queijo é exatamente Carlos
    const pq = painel.porTreinamento.find((t) => t.popId === popPq)!;
    expect(pq).toMatchObject({ previstos: 2, concluidos: 1, pendentes: 1 });
    const pend = painel.pendencias.filter((l) => l.popId === popPq).map((l) => l.collaboratorId);
    expect(pend).toEqual([carlos]);
  });

  it('as funções oferecidas ao editor vêm do cadastro, uma por grafia normalizada', async () => {
    const { funcoes, colaboradores } = await opcoesDePublico(admin());
    const churr = funcoes.filter((f) => f.toLowerCase() === 'churrasqueiro');
    expect(churr).toHaveLength(1);
    const c = colaboradores.find((x) => x.id === joao)!;
    expect(c.unitIds).toEqual([unitA]);
  });
});
