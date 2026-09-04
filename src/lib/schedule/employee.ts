import { prisma } from '@/lib/db/prisma';
import { canAccessUnit } from '@/lib/scope/unit-scope';
import { audit } from '@/lib/audit';
import { ancoraParaFolgaFixa, diaAnterior, soData, DOMINGO_A_CADA_PADRAO, SEMANAS_NO_MES, type ModoDeFolga } from './vigencia';
import { cicloSemanal, normalizarHora } from './templates';
import type { SessionUser } from '@/lib/auth/session';
import type { ScheduleType } from '@prisma/client';

export type EscalaResult =
  | { ok: true; id: string; substituiu: boolean }
  | { ok: false; reason: 'FORBIDDEN' | 'INVALID'; message?: string };

export interface EscalaInput {
  collaboratorId: string;
  unitId: string;
  /** Tipo cadastrado em Configurações → Tipos de escala. */
  templateId: string;
  /** A partir de quando esta escala vale (YYYY-MM-DD). */
  startDate: string;
  /** Como a folga funciona: fixa, fixa+domingo em ciclo, ou só ciclo. */
  offMode?: ModoDeFolga;
  /** 0=domingo … 6=sábado. Só aceito quando o ciclo fecha em 7 dias. */
  weeklyOffDay?: number | null;
  /** Modo fixa+domingo: de quantas em quantas semanas a folga vai ao domingo. */
  sundayEveryWeeks?: number | null;
  /** Quando o ciclo NÃO fecha na semana, é a âncora que posiciona o ciclo. */
  anchorDate?: string | null;
  shiftId?: string | null;
  startTime?: string | null;
  breakTime?: string | null;
  endTime?: string | null;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function dataUTC(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/**
 * O ciclo cadastrado vira um `ScheduleType` para o gerador atual continuar
 * funcionando enquanto a parte 3 não chega.
 *
 * 6x1 e 5x2 já têm tipo próprio; qualquer outro ciclo vira CUSTOM com a máscara
 * correspondente ("TTTTFF" para 4x2), que o gerador já sabe ler. Assim a parte
 * 2 entra sem quebrar nada, e a parte 3 troca o motor por baixo.
 */
export function tipoEMascaraDoCiclo(workDays: number, offDays: number): { scheduleType: ScheduleType; customMask: string | null } {
  if (workDays === 6 && offDays === 1) return { scheduleType: 'SIX_ONE', customMask: null };
  if (workDays === 5 && offDays === 2) return { scheduleType: 'FIVE_TWO', customMask: null };
  return { scheduleType: 'CUSTOM', customMask: 'T'.repeat(workDays) + 'F'.repeat(offDays) };
}

/**
 * Grava uma escala do colaborador ABRINDO UMA VIGÊNCIA.
 *
 * A regra que dá sentido a tudo: a versão anterior é **fechada na véspera**, em
 * vez de sobrescrita. Sem isso, mudar a folga de alguém em maio faria a grade
 * de março passar a mostrar a folga nova — e o histórico deixaria de ser
 * histórico.
 */
export async function salvarEscalaDoColaborador(
  user: SessionUser,
  input: EscalaInput,
  ctx: { ip?: string | null; userAgent?: string | null } = {},
): Promise<EscalaResult> {
  if (!canAccessUnit(user, input.unitId)) return { ok: false, reason: 'FORBIDDEN' };
  if (!input.collaboratorId) return { ok: false, reason: 'INVALID', message: 'Selecione o colaborador.' };
  if (!ISO.test(input.startDate ?? '')) return { ok: false, reason: 'INVALID', message: 'Informe a partir de quando esta escala vale.' };

  const template = await prisma.scheduleTemplate.findUnique({ where: { id: input.templateId } });
  if (!template) return { ok: false, reason: 'INVALID', message: 'Tipo de escala não encontrado.' };
  if (!template.active) return { ok: false, reason: 'INVALID', message: `O tipo "${template.name}" está inativo.` };

  const inicio = dataUTC(input.startDate);
  const semanal = cicloSemanal(template.workDays, template.offDays);

  /* Dia fixo de folga só existe em ciclo que fecha na semana. Aceitar em
     ciclo de outro tamanho gravaria uma promessa que o gerador não cumpre. */
  /* Ciclo que não fecha na semana não tem dia fixo — então o modo é sempre
     "só ciclo", independentemente do que a tela mandar. Aceitar outro valor
     gravaria uma promessa que o gerador não cumpre. */
  const modo: ModoDeFolga = semanal ? (input.offMode ?? 'FIXED_WEEKLY') : 'CYCLE_ONLY';

  let sundayEveryWeeks: number | null = null;
  if (modo === 'FIXED_PLUS_SUNDAY') {
    const n = Math.trunc(Number(input.sundayEveryWeeks ?? DOMINGO_A_CADA_PADRAO));
    if (!Number.isFinite(n) || n < 1 || n > SEMANAS_NO_MES) {
      /* A conta e por MES: um mes nao tem 52 semanas, e aceitar 52 so produzia
         um numero que nunca acontece. */
      return { ok: false, reason: 'INVALID', message: `Informe de quantas em quantas semanas do mes a folga cai no domingo (1 a ${SEMANAS_NO_MES}).` };
    }
    sundayEveryWeeks = n;
  }

  let weeklyOffDay: number | null = null;
  let ancora: Date;
  if (semanal) {
    const dia = input.weeklyOffDay;
    if (dia === null || dia === undefined || !Number.isInteger(Number(dia)) || Number(dia) < 0 || Number(dia) > 6) {
      return { ok: false, reason: 'INVALID', message: 'Escolha o dia fixo de folga (o ciclo desta escala fecha na semana).' };
    }
    weeklyOffDay = Number(dia);
    /* A âncora continua sendo gravada porque o gerador antigo ainda a usa nas
       linhas sem tipo cadastrado; para as novas, quem manda é o dia da semana. */
    ancora = ancoraParaFolgaFixa(weeklyOffDay, template.workDays, inicio);
  } else {
    if (!ISO.test(input.anchorDate ?? '')) {
      return { ok: false, reason: 'INVALID', message: 'Este ciclo não fecha na semana — informe o dia de início do ciclo.' };
    }
    ancora = dataUTC(input.anchorDate!);
  }

  for (const [rotulo, valor] of [['entrada', input.startTime], ['intervalo', input.breakTime], ['saída', input.endTime]] as const) {
    const s = String(valor ?? '').trim();
    if (s && normalizarHora(s) === null) {
      return { ok: false, reason: 'INVALID', message: `Horário de ${rotulo} inválido — use HH:MM (ex.: 14:00).` };
    }
  }

  const { scheduleType, customMask } = tipoEMascaraDoCiclo(template.workDays, template.offDays);
  const dados = {
    templateId: template.id,
    scheduleType,
    customMask,
    anchorDate: ancora,
    offMode: modo,
    weeklyOffDay,
    sundayEveryWeeks,
    shiftId: input.shiftId || null,
    startTime: normalizarHora(input.startTime),
    breakTime: normalizarHora(input.breakTime),
    endTime: normalizarHora(input.endTime),
    startDate: inicio,
    endDate: null,
    active: true,
  };

  const existentes = await prisma.employeeSchedule.findMany({
    where: { collaboratorId: input.collaboratorId, unitId: input.unitId },
    orderBy: { startDate: 'desc' },
    select: { id: true, startDate: true, endDate: true },
  });

  /* Mesma data de início = correção do que acabou de ser cadastrado, não uma
     vigência nova. Criar outra deixaria duas versões disputando o mesmo dia. */
  const mesmoDia = existentes.find((v) => soData(v.startDate) === soData(inicio));

  const salvo = await prisma.$transaction(async (tx) => {
    /* Fecha na VÉSPERA quem ainda estava aberta e começou antes. Fechar no
       próprio dia deixaria as duas valendo ao mesmo tempo. */
    const vespera = diaAnterior(inicio);
    for (const v of existentes) {
      if (mesmoDia && v.id === mesmoDia.id) continue;
      if (soData(v.startDate) >= soData(inicio)) continue;
      if (v.endDate !== null && soData(v.endDate) < soData(vespera)) continue;
      await tx.employeeSchedule.update({ where: { id: v.id }, data: { endDate: vespera } });
    }

    if (mesmoDia) {
      await tx.employeeSchedule.update({ where: { id: mesmoDia.id }, data: dados });
      return { id: mesmoDia.id, substituiu: true };
    }
    const criado = await tx.employeeSchedule.create({
      data: { collaboratorId: input.collaboratorId, unitId: input.unitId, ...dados },
      select: { id: true },
    });
    return { id: criado.id, substituiu: false };
  });

  await audit({
    userId: user.id, unitId: input.unitId, action: 'SCHEDULE_PATTERN_SAVE', module: 'SCHEDULE',
    entity: 'employee_schedule', entityId: salvo.id,
    metadata: { tipo: template.name, ciclo: `${template.workDays}x${template.offDays}`, modo, folga: weeklyOffDay, domingoACada: sundayEveryWeeks, vale_de: input.startDate },
    ...ctx,
  });

  return { ok: true, id: salvo.id, substituiu: salvo.substituiu };
}

/** Todas as vigências do colaborador na unidade, da mais recente para a antiga. */
export async function historicoDeEscala(collaboratorId: string, unitId: string) {
  return prisma.employeeSchedule.findMany({
    where: { collaboratorId, unitId },
    orderBy: { startDate: 'desc' },
    include: { template: { select: { name: true, workDays: true, offDays: true } } },
  });
}

/** Encerra a escala do colaborador a partir de uma data, sem apagar o passado. */
export async function encerrarEscala(
  user: SessionUser,
  collaboratorId: string,
  unitId: string,
  ultimoDia: string,
  ctx: { ip?: string | null; userAgent?: string | null } = {},
): Promise<EscalaResult> {
  if (!canAccessUnit(user, unitId)) return { ok: false, reason: 'FORBIDDEN' };
  if (!ISO.test(ultimoDia ?? '')) return { ok: false, reason: 'INVALID', message: 'Informe o último dia em que a escala valeu.' };

  const fim = dataUTC(ultimoDia);
  const abertas = await prisma.employeeSchedule.findMany({
    where: { collaboratorId, unitId, endDate: null },
    select: { id: true },
  });
  for (const v of abertas) await prisma.employeeSchedule.update({ where: { id: v.id }, data: { endDate: fim } });

  await audit({
    userId: user.id, unitId, action: 'SCHEDULE_PATTERN_END', module: 'SCHEDULE',
    entity: 'employee_schedule', entityId: collaboratorId, metadata: { ultimoDia }, ...ctx,
  });
  return { ok: true, id: collaboratorId, substituiu: false };
}
