import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { completeChecklist } from '@/lib/tasks/complete';
import { createOccurrence } from '@/lib/occurrences/create';
import { ocorrenciasAbertasDosItens, destinoDoTipo } from '@/lib/occurrences/do-checklist';
import type { SessionUser } from '@/lib/auth/session';

/**
 * A separação entre CHECKLIST e OCORRÊNCIAS.
 *
 * Regra combinada: *checklist é acompanhamento da rotina; ocorrência é problema
 * que pede ação*. Até a v1.78.1 todo item marcado "A corrigir" virava ocorrência
 * **sozinho** — a aba enchia de rotina de checklist misturada com o que de fato
 * precisava de outro setor, e a ocorrência nascia sempre "Checklist / MÉDIA",
 * sem destino, porque o automático tinha de inventar esses campos.
 *
 * Metade dos casos aqui prova o que NÃO acontece mais; a outra metade prova que
 * o caminho manual funciona e não duplica.
 */

const sfx = `${process.pid.toString(36)}${Date.now().toString(36).slice(-4)}`;
let unitId: string;
let userId: string;
let tipoManutencao: string;
let tipoTI: string;
let tipoGeral: string;

const user = (): SessionUser => ({ id: userId, name: 'Gerente', role: 'MANAGER', unitIds: [unitId], seesAllUnits: false, needsTerms: false });

beforeAll(async () => {
  const unit = await prisma.unit.create({
    data: { code: `OC-${sfx}`, name: 'Unidade Ocorrência', timezone: 'America/Sao_Paulo', cutoffHour: 4 },
  });
  unitId = unit.id;
  const u = await prisma.user.create({
    data: { name: 'Gerente Oc', email: `oc-${sfx}@teste.local`, role: 'MANAGER', passwordHash: 'x' },
  });
  userId = u.id;
  await prisma.unitMembership.create({ data: { userId, unitId } });

  tipoManutencao = (await prisma.occurrenceType.create({ data: { code: `MNT-${sfx}`, name: 'Manutenção', isMaintenance: true } })).id;
  tipoTI = (await prisma.occurrenceType.create({ data: { code: `TI-${sfx}`, name: 'T.I.', isIT: true } })).id;
  tipoGeral = (await prisma.occurrenceType.create({ data: { code: `GER-${sfx}`, name: 'Geral', } })).id;
});

beforeEach(async () => {
  await prisma.occurrence.deleteMany({ where: { unitId } });
});

afterAll(async () => {
  await prisma.occurrence.deleteMany({ where: { unitId } });
  await prisma.occurrenceType.deleteMany({ where: { id: { in: [tipoManutencao, tipoTI, tipoGeral] } } });
  await prisma.taskInstance.deleteMany({ where: { unitId } });
  await prisma.taskTemplate.deleteMany({ where: { unitId } });
  await prisma.auditLog.deleteMany({ where: { unitId } });
  await prisma.unitMembership.deleteMany({ where: { userId } });
  await prisma.unit.delete({ where: { id: unitId } }).catch(() => {});
  await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  await prisma.$disconnect();
});

async function instancia() {
  const tpl = await prisma.taskTemplate.create({
    data: { unitId, name: 'Abertura do salão', requiresEvidence: false, limitTime: '23:00' },
  });
  return prisma.taskInstance.create({
    data: { templateId: tpl.id, unitId, operationalDate: '2026-09-14', dueAt: new Date(Date.now() + 86400000) },
  });
}

const quantasOcorrencias = () => prisma.occurrence.count({ where: { unitId } });

describe('Concluir o checklist NÃO abre ocorrência — nenhum status abre', () => {
  it('"A corrigir" não abre mais (era o comportamento até a v1.78.1)', async () => {
    const inst = await instancia();
    const r = await completeChecklist(inst.id, user(), {
      items: [{ itemId: 'item-1', itemText: 'Luz da produção queimada', status: 'A_CORRIGIR', note: 'lâmpada do fundo' }],
      photos: [],
    });
    expect(r.ok).toBe(true);
    /* ANTES desta mudança: 1. */
    expect(await quantasOcorrencias()).toBe(0);
  });

  it('"Não realizado" também não — é registro de rotina, não problema de outro setor', async () => {
    const inst = await instancia();
    await completeChecklist(inst.id, user(), {
      items: [{ itemId: 'item-2', itemText: 'Conferir estoque', status: 'NAO_REALIZADO' }],
      photos: [],
    });
    expect(await quantasOcorrencias()).toBe(0);
  });

  it('"Em correção" idem — a unidade está tratando internamente', async () => {
    const inst = await instancia();
    await completeChecklist(inst.id, user(), {
      items: [{ itemId: 'item-3', itemText: 'Ajustar vitrine', status: 'EM_CORRECAO', note: 'refazendo agora' }],
      photos: [],
    });
    expect(await quantasOcorrencias()).toBe(0);
  });

  it('e o checklist continua guardando os status — é lá que eles vivem', async () => {
    const inst = await instancia();
    await completeChecklist(inst.id, user(), {
      items: [
        { itemId: 'i-a', itemText: 'Item ok', status: 'OK' },
        { itemId: 'i-b', itemText: 'Item não feito', status: 'NAO_REALIZADO' },
        { itemId: 'i-c', itemText: 'Item a corrigir', status: 'A_CORRIGIR' },
      ],
      photos: [],
    });
    const respostas = await prisma.taskItemResponse.findMany({
      where: { instanceId: inst.id }, orderBy: { itemId: 'asc' }, select: { status: true },
    });
    expect(respostas.map((r) => r.status)).toEqual(['OK', 'NAO_REALIZADO', 'A_CORRIGIR']);
  });
});

describe('Abrir ocorrência a partir do item — o caminho manual', () => {
  it('nasce vinculada ao item, com o tipo e a gravidade escolhidos', async () => {
    const r = await createOccurrence(user(), {
      unitId, typeId: tipoManutencao, gravity: 'HIGH',
      description: 'Lâmpada da área de produção queimada.',
      sourceTaskItemId: 'item-luz',
    });
    expect(r.ok).toBe(true);

    const occ = await prisma.occurrence.findFirst({ where: { unitId, sourceTaskItemId: 'item-luz' } });
    expect(occ?.gravity).toBe('HIGH');
    expect(occ?.typeName).toBe('Manutenção');
  });

  it('a segunda para o MESMO item é recusada, com o número da que existe', async () => {
    const primeira = await createOccurrence(user(), {
      unitId, typeId: tipoManutencao, gravity: 'MEDIUM', description: 'Torneira pingando', sourceTaskItemId: 'item-hidro',
    });
    expect(primeira.ok).toBe(true);

    const segunda = await createOccurrence(user(), {
      unitId, typeId: tipoManutencao, gravity: 'MEDIUM', description: 'Torneira pingando de novo', sourceTaskItemId: 'item-hidro',
    });
    expect(segunda.ok).toBe(false);
    expect(segunda.ok === false && segunda.reason).toBe('JA_EXISTE');
    /* O NÚMERO é o que permite à tela oferecer "deseja visualizar?" em vez de
       só recusar — recusa sem saída é o que faz a pessoa tentar de novo. */
    expect(segunda.ok === false && segunda.reason === 'JA_EXISTE' && segunda.existente.number)
      .toBe(primeira.ok === true ? primeira.number : -1);
    expect(await quantasOcorrencias()).toBe(1);
  });

  it('itens DIFERENTES abrem ocorrências diferentes — a trava é por item', async () => {
    await createOccurrence(user(), { unitId, typeId: tipoManutencao, gravity: 'LOW', description: 'a', sourceTaskItemId: 'i1' });
    await createOccurrence(user(), { unitId, typeId: tipoManutencao, gravity: 'LOW', description: 'b', sourceTaskItemId: 'i2' });
    expect(await quantasOcorrencias()).toBe(2);
  });

  it('encerrada a primeira, o item pode abrir outra — o problema voltou', async () => {
    await createOccurrence(user(), { unitId, typeId: tipoManutencao, gravity: 'LOW', description: 'a', sourceTaskItemId: 'i-volta' });
    await prisma.occurrence.updateMany({ where: { unitId, sourceTaskItemId: 'i-volta' }, data: { status: 'CLOSED' } });

    const outra = await createOccurrence(user(), { unitId, typeId: tipoManutencao, gravity: 'LOW', description: 'voltou', sourceTaskItemId: 'i-volta' });
    expect(outra.ok).toBe(true);
    expect(await quantasOcorrencias()).toBe(2);
  });

  it('ocorrência SEM origem no checklist não é afetada pela trava', async () => {
    await createOccurrence(user(), { unitId, typeId: tipoGeral, gravity: 'LOW', description: 'uma' });
    await createOccurrence(user(), { unitId, typeId: tipoGeral, gravity: 'LOW', description: 'outra' });
    expect(await quantasOcorrencias()).toBe(2);
  });
});

describe('O direcionamento por categoria', () => {
  it('o tipo decide a aba de destino', () => {
    expect(destinoDoTipo({ isMaintenance: true })).toBe('MANUTENCAO');
    expect(destinoDoTipo({ isIT: true })).toBe('TI');
    expect(destinoDoTipo({})).toBe('GERAL');
    expect(destinoDoTipo(null)).toBe('GERAL');
  });

  it('o checklist recebe o destino e o link, não só o número', async () => {
    await createOccurrence(user(), { unitId, typeId: tipoTI, gravity: 'HIGH', description: 'Computador do caixa não inicia', sourceTaskItemId: 'item-pdv' });

    const abertas = await ocorrenciasAbertasDosItens(unitId, ['item-pdv', 'item-inexistente']);
    expect(abertas['item-pdv'].destinoLabel).toBe('T.I.');
    expect(abertas['item-pdv'].href).toContain('/modulos/ocorrencias/');
    expect(abertas['item-inexistente']).toBeUndefined();
  });

  it('ocorrência ENCERRADA some do checklist', async () => {
    await createOccurrence(user(), { unitId, typeId: tipoManutencao, gravity: 'LOW', description: 'x', sourceTaskItemId: 'item-some' });
    expect(Object.keys(await ocorrenciasAbertasDosItens(unitId, ['item-some']))).toHaveLength(1);

    await prisma.occurrence.updateMany({ where: { unitId, sourceTaskItemId: 'item-some' }, data: { status: 'CLOSED' } });
    expect(Object.keys(await ocorrenciasAbertasDosItens(unitId, ['item-some']))).toHaveLength(0);
  });

  it('sem item nenhum, não consulta o banco à toa', async () => {
    expect(await ocorrenciasAbertasDosItens(unitId, [])).toEqual({});
  });
});
