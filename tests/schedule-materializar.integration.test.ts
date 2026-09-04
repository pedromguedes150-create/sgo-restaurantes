import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { materializarPlanejado, preenchimentoDoMes } from '@/lib/schedule/materializar';
import { getScheduleGrid } from '@/lib/schedule';
import type { SessionUser } from '@/lib/auth/session';

/**
 * "Preencher automaticamente" — o Planejado do mês deixa de ser recalculado a
 * cada visita e passa a ser o que foi montado no momento do clique.
 *
 * O caso que dá sentido a tudo é o terceiro: mudar a configuração DEPOIS de
 * preencher não pode mexer no mês já montado. Enquanto o Planejado era
 * calculado, mudar a folga de alguém reescrevia a grade que a unidade já tinha
 * visto — e ninguém ficava sabendo.
 */

const sfx = `mz${process.pid.toString(36)}`;
let unitId: string;
let userId: string;
let tipoId: string;
let ana = '';
let bruno = '';

const user = (): SessionUser => ({ id: userId, name: 'Alan', role: 'ADMIN', unitIds: [unitId], seesAllUnits: true, needsTerms: false });

const ANO = 2026;
const MES = 10; // outubro/2026 tem 31 dias e começa numa quinta

beforeAll(async () => {
  unitId = (await prisma.unit.create({ data: { code: `MZ-${sfx}`, name: 'U Materializar', timezone: 'America/Sao_Paulo', cutoffHour: 4 } })).id;
  userId = (await prisma.user.create({ data: { name: 'Alan', email: `${sfx}@e.com`, role: 'ADMIN', passwordHash: 'x' } })).id;
  tipoId = (await prisma.scheduleTemplate.create({ data: { name: `6x1 Teste ${sfx}`, workDays: 6, offDays: 1, startTime: '14:00', endTime: '22:00' } })).id;

  ana = (await prisma.collaborator.create({ data: { name: `ANA ${sfx}`, jobTitle: 'Cozinha', units: { create: { unitId } } } })).id;
  bruno = (await prisma.collaborator.create({ data: { name: `BRUNO ${sfx}`, jobTitle: 'Salão', units: { create: { unitId } } } })).id;

  /* Só a Ana tem escala: o Bruno é quem prova que a tela precisa dizer quem
     ficou de fora. Folga no domingo (0). */
  await prisma.employeeSchedule.create({
    data: {
      collaboratorId: ana, unitId, templateId: tipoId, scheduleType: 'SIX_ONE',
      anchorDate: new Date(Date.UTC(2026, 9, 1)), startDate: new Date(Date.UTC(2026, 9, 1)),
      offMode: 'FIXED_WEEKLY', weeklyOffDay: 0,
    },
  });
});

afterAll(async () => {
  await prisma.schedulePlanFill.deleteMany({ where: { unitId } }).catch(() => {});
  await prisma.schedulePlanOverride.deleteMany({ where: { unitId } }).catch(() => {});
  await prisma.employeeSchedule.deleteMany({ where: { unitId } }).catch(() => {});
  await prisma.collaboratorUnit.deleteMany({ where: { unitId } }).catch(() => {});
  await prisma.collaborator.deleteMany({ where: { id: { in: [ana, bruno] } } }).catch(() => {});
  await prisma.scheduleTemplate.delete({ where: { id: tipoId } }).catch(() => {});
  await prisma.unit.delete({ where: { id: unitId } }).catch(() => {});
  await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  await prisma.$disconnect();
});

describe('Antes de preencher', () => {
  it('o mês não tem registro de preenchimento', async () => {
    expect(await preenchimentoDoMes(unitId, ANO, MES)).toBeNull();
  });

  it('a grade já mostra o Planejado — calculado na hora', async () => {
    const g = await getScheduleGrid(unitId, ANO, MES);
    const linha = g.rows.find((r) => r.collaboratorId === ana);
    expect(linha, 'a Ana deveria aparecer').toBeDefined();
    expect(linha!.days[0].planned).toBeTruthy();
    /* Quem não tem escala não vira linha da grade — aparece na lista de fora. */
    expect(g.withoutSchedule.some((w) => w.id === bruno)).toBe(true);
  });
});

describe('Preenchendo o mês', () => {
  it('conta quem entrou e NOMEIA quem ficou de fora', async () => {
    const r = await materializarPlanejado(user(), { unitId, year: ANO, month: MES });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.resumo.preenchidos).toBe(1);
    expect(r.resumo.dias).toBe(31);
    expect(r.resumo.semConfiguracao).toHaveLength(1);
    expect(r.resumo.semConfiguracao[0]).toContain('BRUNO');
    expect(r.resumo.primeiraVez).toBe(true);
  });

  it('gravou um dia por linha, e o mês inteiro', async () => {
    const n = await prisma.schedulePlanOverride.count({ where: { unitId } });
    expect(n).toBe(31);
  });

  it('registra quem preencheu e quando', async () => {
    const f = await preenchimentoDoMes(unitId, ANO, MES);
    expect(f?.filledByName).toBe('Alan');
    expect(f?.collaborators).toBe(1);
  });

  it('a grade continua mostrando a mesma coisa — congelar não muda o desenho', async () => {
    const g = await getScheduleGrid(unitId, ANO, MES);
    const linha = g.rows.find((r) => r.collaboratorId === ana)!;
    /* Domingo é folga: 4/10/2026 é um domingo. */
    expect(linha.days[3].planned).toBe('OFF');
    expect(linha.days[0].planned).toBe('WORK');
  });
});

describe('O que dá sentido a congelar', () => {
  it('mudar a configuração DEPOIS não mexe no mês já montado', async () => {
    const antes = (await getScheduleGrid(unitId, ANO, MES)).rows.find((r) => r.collaboratorId === ana)!.days.map((d) => d.planned);

    /* A Ana passa a folgar na quarta, valendo do dia 1 — sem o congelamento,
       isto reescreveria o mês inteiro que a unidade já tinha visto. */
    await prisma.employeeSchedule.updateMany({ where: { collaboratorId: ana, unitId }, data: { weeklyOffDay: 3 } });

    const depois = (await getScheduleGrid(unitId, ANO, MES)).rows.find((r) => r.collaboratorId === ana)!.days.map((d) => d.planned);
    expect(depois).toEqual(antes);
  });

  it('e apertar de novo REFAZ o mês com a configuração nova', async () => {
    const r = await materializarPlanejado(user(), { unitId, year: ANO, month: MES });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.resumo.primeiraVez).toBe(false);

    const g = await getScheduleGrid(unitId, ANO, MES);
    const dias = g.rows.find((r) => r.collaboratorId === ana)!.days;
    /* Agora a folga é quarta: 7/10/2026 é quarta-feira; o domingo 4 virou trabalho. */
    expect(dias[6].planned).toBe('OFF');
    expect(dias[3].planned).toBe('WORK');
    expect(await prisma.schedulePlanOverride.count({ where: { unitId } })).toBe(31);
  });

  it('o primeiro preenchimento não é reescrito pelo segundo', async () => {
    const f = await preenchimentoDoMes(unitId, ANO, MES);
    expect(f!.filledAt.getTime()).toBeGreaterThanOrEqual(f!.firstFilledAt.getTime());
  });
});

describe('Quem pode preencher', () => {
  it('recusa unidade fora do alcance', async () => {
    const forasteiro: SessionUser = { id: userId, name: 'Gerente', role: 'MANAGER', unitIds: [], seesAllUnits: false, needsTerms: false };
    const r = await materializarPlanejado(forasteiro, { unitId, year: ANO, month: MES });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('FORBIDDEN');
  });

  it('recusa mês inválido', async () => {
    const r = await materializarPlanejado(user(), { unitId, year: ANO, month: 13 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('INVALID');
  });
});
