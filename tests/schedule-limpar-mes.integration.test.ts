import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { limparMesDaEscala, resumoDoMes, materializarPlanejado } from '@/lib/schedule/materializar';
import { getScheduleGrid, setActual } from '@/lib/schedule';
import type { SessionUser } from '@/lib/auth/session';

/**
 * "Limpar o mês" — apaga o Planejado congelado e o Realizado de UMA unidade em
 * UM mês.
 *
 * É uma ação destrutiva sem desfazer, então metade destes casos é sobre o que
 * ela NÃO pode levar junto: o cadastro de escala dos colaboradores, os outros
 * meses, as outras unidades e os avisos que o RH já recebeu.
 */

const sfx = `lm${process.pid.toString(36)}`;
let unitId: string;
let outraUnidade: string;
let userId: string;
let tipoId: string;
let ana = '';
/* Pessoa da OUTRA unidade: o congelado é único por colaborador+data, então o
   vizinho tem de ser outra pessoa para o cenário existir. */
let bruno = '';

const ANO = 2026;
const MES = 10;
const admin = (): SessionUser => ({ id: userId, name: 'Alan', role: 'ADMIN', unitIds: [unitId, outraUnidade], seesAllUnits: true, needsTerms: false });
const gerente = (): SessionUser => ({ id: userId, name: 'Gerente', role: 'MANAGER', unitIds: [unitId], seesAllUnits: false, needsTerms: false });
const NOME = `U Limpeza ${sfx}`;

const dia = (d: number) => new Date(Date.UTC(ANO, MES - 1, d));

beforeAll(async () => {
  unitId = (await prisma.unit.create({ data: { code: `LM-${sfx}`, name: NOME, timezone: 'America/Sao_Paulo', cutoffHour: 4 } })).id;
  outraUnidade = (await prisma.unit.create({ data: { code: `LM2-${sfx}`, name: `Outra ${sfx}`, timezone: 'America/Sao_Paulo', cutoffHour: 4 } })).id;
  userId = (await prisma.user.create({ data: { name: 'Alan', email: `${sfx}@e.com`, role: 'ADMIN', passwordHash: 'x' } })).id;
  tipoId = (await prisma.scheduleTemplate.create({ data: { name: `6x1 Limpeza ${sfx}`, workDays: 6, offDays: 1 } })).id;
  ana = (await prisma.collaborator.create({ data: { name: `ANA ${sfx}`, units: { create: { unitId } } } })).id;
  bruno = (await prisma.collaborator.create({ data: { name: `BRUNO ${sfx}`, units: { create: { unitId: outraUnidade } } } })).id;
  await prisma.employeeSchedule.create({
    data: {
      collaboratorId: ana, unitId, templateId: tipoId, scheduleType: 'SIX_ONE',
      anchorDate: dia(1), startDate: dia(1), offMode: 'FIXED_WEEKLY', weeklyOffDay: 0,
    },
  });
});

afterAll(async () => {
  await prisma.rhScheduleNotice.deleteMany({ where: { unitId: { in: [unitId, outraUnidade] } } }).catch(() => {});
  await prisma.schedulePlanFill.deleteMany({ where: { unitId: { in: [unitId, outraUnidade] } } }).catch(() => {});
  await prisma.schedulePlanOverride.deleteMany({ where: { unitId: { in: [unitId, outraUnidade] } } }).catch(() => {});
  await prisma.scheduleActual.deleteMany({ where: { unitId: { in: [unitId, outraUnidade] } } }).catch(() => {});
  await prisma.employeeSchedule.deleteMany({ where: { unitId: { in: [unitId, outraUnidade] } } }).catch(() => {});
  await prisma.collaboratorUnit.deleteMany({ where: { unitId: { in: [unitId, outraUnidade] } } }).catch(() => {});
  await prisma.collaborator.deleteMany({ where: { id: { in: [ana, bruno] } } }).catch(() => {});
  await prisma.scheduleTemplate.delete({ where: { id: tipoId } }).catch(() => {});
  await prisma.unit.deleteMany({ where: { id: { in: [unitId, outraUnidade] } } }).catch(() => {});
  await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  await prisma.$disconnect();
});

/** Deixa o mês cheio: congelado, presença marcada, avisos ao RH e mês vizinho. */
beforeEach(async () => {
  await prisma.rhScheduleNotice.deleteMany({ where: { unitId: { in: [unitId, outraUnidade] } } });
  await prisma.schedulePlanOverride.deleteMany({ where: { unitId: { in: [unitId, outraUnidade] } } });
  await prisma.scheduleActual.deleteMany({ where: { unitId: { in: [unitId, outraUnidade] } } });
  await prisma.schedulePlanFill.deleteMany({ where: { unitId: { in: [unitId, outraUnidade] } } });

  await materializarPlanejado(admin(), { unitId, year: ANO, month: MES });
  /* Pelo GRAVADOR DE VERDADE. A fixture antiga criava as datas à meia-noite e
     o app grava ao MEIO-DIA — foi essa diferença que escondeu o defeito do
     último dia do mês sobrevivendo à limpeza. */
  await setActual(admin(), { collaboratorId: ana, unitId, date: `${ANO}-10-01`, status: 'WORK' });
  await setActual(admin(), { collaboratorId: ana, unitId, date: `${ANO}-10-02`, status: 'FALTA_INJUST' }); // gera 1 aviso pendente
  await setActual(admin(), { collaboratorId: ana, unitId, date: `${ANO}-10-31`, status: 'WORK' });        // O ÚLTIMO DIA
  await prisma.rhScheduleNotice.create({
    data: { unitId, collaboratorId: ana, collaboratorName: 'ANA', date: `${ANO}-10-03`, status: 'Atestado', createdById: userId, createdByName: 'Alan', sent: true },
  });
  /* Vizinhos que não podem ser tocados: o mês seguinte e a outra unidade. */
  await prisma.schedulePlanOverride.create({ data: { collaboratorId: ana, unitId, date: new Date(Date.UTC(ANO, MES, 5)), status: 'WORK' } });
  await prisma.schedulePlanOverride.create({ data: { collaboratorId: bruno, unitId: outraUnidade, date: dia(5), status: 'WORK' } });
});

describe('O resumo diz o tamanho do estrago antes de apagar', () => {
  it('conta congelados, realizados e avisos pendentes do mês', async () => {
    const r = await resumoDoMes(unitId, ANO, MES);
    expect(r.congelados).toBe(31);
    expect(r.realizados).toBe(3);
    /* Só o não enviado: o já enviado registra o que a unidade informou. */
    expect(r.avisosPendentes).toBe(1);
  });
});

describe('A confirmação escrita é conferida no servidor', () => {
  it('sem o nome da unidade, não apaga nada', async () => {
    const r = await limparMesDaEscala(admin(), { unitId, year: ANO, month: MES, confirmacao: 'sim' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('INVALID');
    expect(await prisma.schedulePlanOverride.count({ where: { unitId } })).toBe(32);
  });

  it('o nome certo passa, com espaços e maiúsculas de qualquer jeito', async () => {
    const r = await limparMesDaEscala(admin(), { unitId, year: ANO, month: MES, confirmacao: `  ${NOME.toUpperCase()} ` });
    expect(r.ok).toBe(true);
  });
});

describe('Só o Administrador limpa', () => {
  it('o Gerente é recusado', async () => {
    const r = await limparMesDaEscala(gerente(), { unitId, year: ANO, month: MES, confirmacao: NOME });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('FORBIDDEN');
    expect(await prisma.scheduleActual.count({ where: { unitId } })).toBe(3);
  });
});

describe('O que a limpeza apaga', () => {
  it('o congelado, a presença e o registro de quem preencheu — só do mês e da unidade', async () => {
    const r = await limparMesDaEscala(admin(), { unitId, year: ANO, month: MES, confirmacao: NOME });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.apagados).toEqual({ congelados: 31, realizados: 3, avisosPendentes: 1 });

    expect(await prisma.scheduleActual.count({ where: { unitId } })).toBe(0);
    expect(await prisma.schedulePlanFill.count({ where: { unitId } })).toBe(0);
    /* Sobrou o dia do mês SEGUINTE. */
    const sobrou = await prisma.schedulePlanOverride.findMany({ where: { unitId } });
    expect(sobrou).toHaveLength(1);
    expect(sobrou[0].date.getUTCMonth()).toBe(MES); // novembro (0-indexado)
  });

  it('a outra unidade fica intacta', async () => {
    await limparMesDaEscala(admin(), { unitId, year: ANO, month: MES, confirmacao: NOME });
    expect(await prisma.schedulePlanOverride.count({ where: { unitId: outraUnidade } })).toBe(1);
  });

  it('o aviso ao RH já ENVIADO permanece; o pendente sai', async () => {
    await limparMesDaEscala(admin(), { unitId, year: ANO, month: MES, confirmacao: NOME });
    const avisos = await prisma.rhScheduleNotice.findMany({ where: { unitId } });
    expect(avisos).toHaveLength(1);
    expect(avisos[0].sent).toBe(true);
  });
});

describe('O que a limpeza NÃO pode levar junto', () => {
  it('o cadastro de escala do colaborador continua lá', async () => {
    await limparMesDaEscala(admin(), { unitId, year: ANO, month: MES, confirmacao: NOME });
    expect(await prisma.employeeSchedule.count({ where: { unitId } })).toBe(1);
  });

  it('e por isso a grade não fica vazia: volta a ser calculada', async () => {
    /* Se apagar o cadastro junto, consertar um mês obrigaria a recadastrar a
       unidade inteira — e a tela abriria com todo mundo "fora da grade". */
    await limparMesDaEscala(admin(), { unitId, year: ANO, month: MES, confirmacao: NOME });
    const g = await getScheduleGrid(unitId, ANO, MES);
    const linha = g.rows.find((r) => r.collaboratorId === ana);
    expect(linha, 'a Ana deveria continuar na grade').toBeDefined();
    expect(linha!.days.some((d) => d.planned === 'OFF')).toBe(true);
    expect(linha!.days.every((d) => d.actual === null)).toBe(true);
  });
});

describe('O ÚLTIMO dia do mês', () => {
  /* O relato: "usei o botão limpar e ficou o último dia preenchido". A faixa ia
     de `dia 1 00:00` a `último dia 00:00` e os dias são gravados às 12:00 —
     então o dia 31 caía fora e sobrevivia, sozinho, na grade. */

  it('entra na contagem do que vai ser apagado', async () => {
    const r = await resumoDoMes(unitId, ANO, MES);
    /* 31 dias congelados: se o último ficasse de fora, viriam 30. */
    expect(r.congelados).toBe(31);
  });

  it('some junto com o resto', async () => {
    const antes = await prisma.scheduleActual.findFirst({ where: { unitId, date: { gte: new Date(Date.UTC(ANO, MES - 1, 31)) } } });
    expect(antes, 'o dia 31 deveria existir antes de limpar').toBeTruthy();

    await limparMesDaEscala(admin(), { unitId, year: ANO, month: MES, confirmacao: NOME });

    expect(await prisma.scheduleActual.count({ where: { unitId } })).toBe(0);
    expect(await prisma.schedulePlanOverride.count({ where: { unitId } })).toBe(1); // só o do mês seguinte
  });

  it('e a grade fica de fato vazia no Realizado — nenhum dia sobrando', async () => {
    await limparMesDaEscala(admin(), { unitId, year: ANO, month: MES, confirmacao: NOME });
    const g = await getScheduleGrid(unitId, ANO, MES);
    const linha = g.rows.find((r) => r.collaboratorId === ana)!;
    expect(linha.days).toHaveLength(31);
    expect(linha.days.every((d) => d.actual === null), 'algum dia ficou marcado').toBe(true);
  });
});

describe('Congelado gravado à meia-noite (dados da v1.68.0)', () => {
  it('continua valendo na grade — a hora do registro não decide nada', async () => {
    /* A grade lia o mês com limites ao MEIO-DIA; uma linha à meia-noite no dia 1
       ficava fora da consulta, e o congelamento daquele dia nunca era aplicado.
       A migração normaliza o que já existe; a consulta passou a ser por mês. */
    await limparMesDaEscala(admin(), { unitId, year: ANO, month: MES, confirmacao: NOME });
    await prisma.schedulePlanOverride.create({
      data: { collaboratorId: ana, unitId, date: new Date(Date.UTC(ANO, MES - 1, 1)), status: 'OFF' }, // meia-noite, como a v1.68.0 gravava
    });

    const g = await getScheduleGrid(unitId, ANO, MES);
    const linha = g.rows.find((r) => r.collaboratorId === ana)!;
    expect(linha.days[0].planned, 'o congelado do dia 1 deveria vencer o calculado').toBe('OFF');
  });

  it('e a limpeza leva essa linha junto', async () => {
    await limparMesDaEscala(admin(), { unitId, year: ANO, month: MES, confirmacao: NOME });
    expect(await prisma.schedulePlanOverride.count({ where: { unitId, date: { lt: new Date(Date.UTC(ANO, MES, 1)) } } })).toBe(0);
  });
});
