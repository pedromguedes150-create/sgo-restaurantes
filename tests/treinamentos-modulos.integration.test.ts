import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { createPop, updatePop, getPop } from '@/lib/pops';
import { completeTraining, getTrainingBoard } from '@/lib/training';
import { getPainelTreinamentos } from '@/lib/treinamentos/painel';
import type { SessionUser } from '@/lib/auth/session';

/**
 * UM POP, VÁRIOS MÓDULOS, PÚBLICOS DIFERENTES (v1.124.0).
 *
 * O exemplo do pedido: "POP Operacional" com Desperdício (Cozinheiro, Aux.
 * Cozinha), Conferência (Gerente + Carlos por vínculo) e Manuseio (Cozinheiro,
 * Aux. Cozinha, Atendente). João, Auxiliar de Cozinha, recebe Desperdício e
 * Manuseio — NUNCA Conferência —; concluiu Desperdício → 1 de 2 = 50%.
 * Editar um módulo re-treina só ele; remover um módulo mantém o histórico.
 */

const sfx = `${process.pid.toString(36)}${Date.now().toString(36).slice(-4)}`;
let unit: string;
let adminId: string;
let joao: string;   // Auxiliar de Cozinha
let carlos: string; // Churrasqueiro — Conferência por vínculo
let paula: string;  // Gerente
let popId: string;
let mods: { id: string; name: string }[] = [];

const admin = (): SessionUser => ({ id: adminId, name: 'Admin', role: 'ADMIN', unitIds: [], seesAllUnits: true, needsTerms: false });
const colab = async (name: string, jobTitle: string) => (await prisma.collaborator.create({ data: { name: `${name} ${sfx}`, jobTitle, units: { create: [{ unitId: unit }] } } })).id;

beforeAll(async () => {
  unit = (await prisma.unit.create({ data: { code: `TM-${sfx}`, name: `Jardim Teresópolis ${sfx}`, timezone: 'America/Sao_Paulo', cutoffHour: 4 } })).id;
  adminId = (await prisma.user.create({ data: { name: 'Admin', email: `tm-${sfx}@t.local`, role: 'ADMIN', passwordHash: 'x' } })).id;
  joao = await colab('João', 'Auxiliar de Cozinha');
  carlos = await colab('Carlos', 'Churrasqueiro');
  paula = await colab('Paula', 'Gerente');
});

afterAll(async () => {
  if (popId) await prisma.pop.delete({ where: { id: popId } }).catch(() => {});
  await prisma.collaborator.deleteMany({ where: { id: { in: [joao, carlos, paula] } } });
  await prisma.unit.delete({ where: { id: unit } }).catch(() => {});
  await prisma.user.delete({ where: { id: adminId } }).catch(() => {});
  await prisma.$disconnect();
});

const registros = () => prisma.trainingRecord.findMany({ where: { popId }, select: { collaboratorId: true, moduleName: true, origin: true, status: true, moduleVersion: true } });

describe('POP Operacional com três módulos', () => {
  it('cada colaborador recebe SÓ os módulos aplicáveis a ele', async () => {
    const r = await createPop(admin(), {
      title: `POP Operacional ${sfx}`,
      category: 'Processo',
      unitIds: [unit],
      modules: [
        { name: 'Desperdício', jobTitles: ['Cozinheiro', 'Auxiliar de Cozinha'], blocks: [{ type: 'text', text: 'Controle de desperdício' }] },
        { name: 'Conferência', jobTitles: ['Gerente'], collaboratorIds: [carlos], blocks: [{ type: 'checklist', items: ['Conferir'] }] },
        { name: 'Manuseio', jobTitles: ['Cozinheiro', 'Auxiliar de Cozinha', 'Atendente'], blocks: [{ type: 'text', text: 'Manuseio correto' }] },
      ],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    popId = r.id;
    const pop = await getPop(admin(), popId);
    mods = pop!.modules.map((m) => ({ id: m.id, name: m.name }));
    expect(mods.map((m) => m.name)).toEqual(['Desperdício', 'Conferência', 'Manuseio']);

    const regs = await registros();
    const de = (c: string) => regs.filter((x) => x.collaboratorId === c).map((x) => x.moduleName).sort();
    expect(de(joao)).toEqual(['Desperdício', 'Manuseio']);           // não Conferência
    expect(de(paula)).toEqual(['Conferência']);                       // gerente: só Conferência
    expect(de(carlos)).toEqual(['Conferência']);                      // churrasqueiro: só por vínculo
    expect(regs.find((x) => x.collaboratorId === carlos)?.origin).toBe('INDIVIDUAL');
    expect(regs).toHaveLength(4);
  });

  it('João conclui Desperdício → 1 de 2 = 50% (nunca 1 de 3); Manuseio → POP concluído', async () => {
    const desp = await prisma.trainingRecord.findFirstOrThrow({ where: { popId, collaboratorId: joao, moduleName: 'Desperdício' } });
    await completeTraining(admin(), desp.id);

    let { painel } = await getPainelTreinamentos(admin(), { unitId: unit, collaboratorId: joao });
    let p = painel.porColaborador[0].pops.find((x) => x.popId === popId)!;
    expect(p).toMatchObject({ aplicaveis: 2, concluidos: 1, pct: 50, concluido: false });

    const man = await prisma.trainingRecord.findFirstOrThrow({ where: { popId, collaboratorId: joao, moduleName: 'Manuseio' } });
    await completeTraining(admin(), man.id);
    ({ painel } = await getPainelTreinamentos(admin(), { unitId: unit, collaboratorId: joao }));
    p = painel.porColaborador[0].pops.find((x) => x.popId === popId)!;
    expect(p).toMatchObject({ aplicaveis: 2, concluidos: 2, pct: 100, concluido: true });
  });

  it('o painel por módulo diz quem deve cada um; a pendência NÃO lista Conferência para o João', async () => {
    const { painel } = await getPainelTreinamentos(admin(), { unitId: unit, popId });
    const porNome = new Map(painel.porModulo.map((m) => [m.moduleName, m]));
    expect(porNome.get('Desperdício')).toMatchObject({ previstos: 1, concluidos: 1 });
    expect(porNome.get('Conferência')).toMatchObject({ previstos: 2, concluidos: 0 });
    expect(porNome.get('Manuseio')).toMatchObject({ previstos: 1, concluidos: 1 });
    expect(painel.pendencias.map((l) => `${l.collaboratorId === joao ? 'joao' : 'outro'}:${l.moduleName}`)).not.toContain('joao:Conferência');
    expect(painel.porTreinamento[0]).toMatchObject({ modulos: 3, previstos: 4, concluidos: 2 });
  });

  it('editar o conteúdo de UM módulo sobe só a versão dele e re-treina só ele', async () => {
    const antes = await prisma.popModule.findMany({ where: { popId }, select: { name: true, version: true } });
    expect(antes.every((m) => m.version === 1)).toBe(true);

    const r = await updatePop(admin(), popId, {
      title: `POP Operacional ${sfx}`, category: 'Processo', unitIds: [unit],
      modules: [
        { id: mods[0].id, name: 'Desperdício', jobTitles: ['Cozinheiro', 'Auxiliar de Cozinha'], blocks: [{ type: 'text', text: 'Controle de desperdício — REVISADO' }] },
        { id: mods[1].id, name: 'Conferência', jobTitles: ['Gerente'], collaboratorIds: [carlos], blocks: [{ type: 'checklist', items: ['Conferir'] }] },
        { id: mods[2].id, name: 'Manuseio', jobTitles: ['Cozinheiro', 'Auxiliar de Cozinha', 'Atendente'], blocks: [{ type: 'text', text: 'Manuseio correto' }] },
      ],
    });
    expect(r.ok).toBe(true);
    const depois = new Map((await prisma.popModule.findMany({ where: { popId }, select: { name: true, version: true } })).map((m) => [m.name, m.version]));
    expect(depois.get('Desperdício')).toBe(2);
    expect(depois.get('Conferência')).toBe(1);
    expect(depois.get('Manuseio')).toBe(1);

    // João: Desperdício V1 (DONE, histórico) + Desperdício V2 (PENDING, re-treino) + Manuseio V1 (DONE)
    const doJoao = (await registros()).filter((x) => x.collaboratorId === joao);
    expect(doJoao.map((x) => `${x.moduleName}:V${x.moduleVersion}:${x.status}`).sort()).toEqual(['Desperdício:V1:DONE', 'Desperdício:V2:PENDING', 'Manuseio:V1:DONE']);
  });

  it('remover um módulo INATIVA: a pendência some, o concluído fica no histórico', async () => {
    const r = await updatePop(admin(), popId, {
      title: `POP Operacional ${sfx}`, category: 'Processo', unitIds: [unit],
      modules: [
        { id: mods[1].id, name: 'Conferência', jobTitles: ['Gerente'], collaboratorIds: [carlos], blocks: [{ type: 'checklist', items: ['Conferir'] }] },
        { id: mods[2].id, name: 'Manuseio', jobTitles: ['Cozinheiro', 'Auxiliar de Cozinha', 'Atendente'], blocks: [{ type: 'text', text: 'Manuseio correto' }] },
      ],
    });
    expect(r.ok).toBe(true);
    const desp = await prisma.popModule.findUniqueOrThrow({ where: { id: mods[0].id } });
    expect(desp.active).toBe(false);
    const doJoao = (await registros()).filter((x) => x.collaboratorId === joao);
    expect(doJoao.map((x) => `${x.moduleName}:V${x.moduleVersion}:${x.status}`).sort()).toEqual(['Desperdício:V1:DONE', 'Manuseio:V1:DONE']); // V2 pendente saiu; V1 concluído ficou
    // e o módulo inativo não aparece mais no vigente nem no quadro
    const board = await getTrainingBoard(unit);
    const itens = board.flatMap((g) => g.collaborators.flatMap((c) => c.items.map((i) => i.moduleName)));
    expect(itens).not.toContain('Desperdício');
  });
});
