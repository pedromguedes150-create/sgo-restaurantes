import { prisma } from '@/lib/db/prisma';
import { audit } from '@/lib/audit';
import type { SessionUser } from '@/lib/auth/session';

export type TemplateResult =
  | { ok: true; id?: string }
  | { ok: false; reason: 'FORBIDDEN' | 'INVALID' | 'DUPLICATE' | 'IN_USE'; message?: string };

export interface ScheduleTemplateInput {
  id?: string;
  name: string;
  workDays: number;
  offDays: number;
  startTime?: string | null;
  breakTime?: string | null;
  endTime?: string | null;
}

function isAdmin(user: SessionUser): boolean {
  return user.role === 'ADMIN';
}

/** "14:00" — vazio vira null; formato inválido é recusado pelo chamador. */
export function normalizarHora(bruto: unknown): string | null {
  const s = String(bruto ?? '').trim();
  if (!s) return null;
  const m = s.match(/^(\d{1,2}):?(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

/** Vazio é permitido (horário opcional); preenchido e inválido, não. */
function horaValida(bruto: unknown): boolean {
  const s = String(bruto ?? '').trim();
  return !s || normalizarHora(s) !== null;
}

/**
 * Rótulo do ciclo: 6 e 1 viram "6x1".
 *
 * O 12x36 aparece como "1x1" porque em dias de calendário é isso — dia sim,
 * dia não. O nome que a operação lê é o do cadastro ("12x36 Noturno"); o ciclo
 * é o que o gerador usa.
 */
export function rotuloDoCiclo(workDays: number, offDays: number): string {
  return `${workDays}x${offDays}`;
}

/** Ciclo fecha em uma semana? Só aí faz sentido falar em "dia fixo de folga". */
export function cicloSemanal(workDays: number, offDays: number): boolean {
  return workDays + offDays === 7;
}

export const CICLO_MAXIMO = 60;

/**
 * Tipos que a CLT torna comuns na rede. Semente da primeira abertura da tela.
 *
 * Sem horários de propósito: o mesmo 6x1 é de manhã numa unidade e à tarde na
 * outra, e chutar um horário que ninguém confere é pior do que deixar vazio.
 */
export const TIPOS_PADRAO: { name: string; workDays: number; offDays: number }[] = [
  { name: '6x1', workDays: 6, offDays: 1 },
  { name: '5x2', workDays: 5, offDays: 2 },
  { name: '5x1', workDays: 5, offDays: 1 },
  { name: '4x2', workDays: 4, offDays: 2 },
  { name: '12x36', workDays: 1, offDays: 1 },
];

/** Cria os tipos padrão só com a tabela vazia (um tipo apagado não volta). */
export async function ensureDefaultScheduleTemplates(): Promise<void> {
  const existe = await prisma.scheduleTemplate.count();
  if (existe > 0) return;
  await prisma.scheduleTemplate.createMany({
    data: TIPOS_PADRAO.map((t, i) => ({ ...t, order: i })),
  });
}

export async function listScheduleTemplates() {
  await ensureDefaultScheduleTemplates();
  return prisma.scheduleTemplate.findMany({ orderBy: [{ active: 'desc' }, { order: 'asc' }, { name: 'asc' }] });
}

export async function upsertScheduleTemplate(
  user: SessionUser,
  input: ScheduleTemplateInput,
  ctx: { ip?: string | null; userAgent?: string | null } = {},
): Promise<TemplateResult> {
  if (!isAdmin(user)) return { ok: false, reason: 'FORBIDDEN' };

  const name = (input.name ?? '').trim();
  if (!name) return { ok: false, reason: 'INVALID', message: 'Dê um nome ao tipo de escala (ex.: "6x1 Tarde").' };

  const workDays = Math.trunc(Number(input.workDays));
  const offDays = Math.trunc(Number(input.offDays));
  if (!Number.isFinite(workDays) || workDays < 1) {
    return { ok: false, reason: 'INVALID', message: 'O ciclo precisa ter pelo menos 1 dia de trabalho.' };
  }
  if (!Number.isFinite(offDays) || offDays < 0) {
    return { ok: false, reason: 'INVALID', message: 'Dias de folga não pode ser negativo.' };
  }
  /* Ciclo sem folga nenhuma gera escala que nunca descansa — quase sempre é
     engano de digitação, e o Planejado sairia com o mês inteiro em "T". */
  if (offDays === 0) {
    return { ok: false, reason: 'INVALID', message: 'Um ciclo sem folga marcaria o mês inteiro como trabalho. Informe ao menos 1 dia de folga.' };
  }
  if (workDays + offDays > CICLO_MAXIMO) {
    return { ok: false, reason: 'INVALID', message: `Ciclo muito longo (máximo ${CICLO_MAXIMO} dias).` };
  }

  for (const [rotulo, valor] of [['entrada', input.startTime], ['intervalo', input.breakTime], ['saída', input.endTime]] as const) {
    if (!horaValida(valor)) return { ok: false, reason: 'INVALID', message: `Horário de ${rotulo} inválido — use HH:MM (ex.: 14:00).` };
  }

  const data = {
    name,
    workDays,
    offDays,
    startTime: normalizarHora(input.startTime),
    breakTime: normalizarHora(input.breakTime),
    endTime: normalizarHora(input.endTime),
  };

  /* Nome repetido confundiria na hora de escolher o tipo do colaborador — que
     é o único lugar onde ele aparece. */
  const mesmoNome = await prisma.scheduleTemplate.findFirst({ where: { name }, select: { id: true } });
  if (mesmoNome && mesmoNome.id !== input.id) {
    return { ok: false, reason: 'DUPLICATE', message: `Já existe um tipo de escala chamado "${name}".` };
  }

  if (input.id) {
    await prisma.scheduleTemplate.update({ where: { id: input.id }, data });
    await audit({ userId: user.id, action: 'SCHEDULE_TEMPLATE_UPDATE', module: 'CONFIG', entity: 'schedule_template', entityId: input.id, metadata: data, ...ctx });
    return { ok: true, id: input.id };
  }

  const ultimo = await prisma.scheduleTemplate.findFirst({ orderBy: { order: 'desc' }, select: { order: true } });
  const criado = await prisma.scheduleTemplate.create({ data: { ...data, order: (ultimo?.order ?? -1) + 1 }, select: { id: true } });
  await audit({ userId: user.id, action: 'SCHEDULE_TEMPLATE_CREATE', module: 'CONFIG', entity: 'schedule_template', entityId: criado.id, metadata: data, ...ctx });
  return { ok: true, id: criado.id };
}

export async function toggleScheduleTemplate(user: SessionUser, id: string, active: boolean): Promise<TemplateResult> {
  if (!isAdmin(user)) return { ok: false, reason: 'FORBIDDEN' };
  await prisma.scheduleTemplate.update({ where: { id }, data: { active } }).catch(() => {});
  await audit({ userId: user.id, action: 'SCHEDULE_TEMPLATE_TOGGLE', module: 'CONFIG', entity: 'schedule_template', entityId: id, metadata: { active } });
  return { ok: true };
}

export async function deleteScheduleTemplate(user: SessionUser, id: string): Promise<TemplateResult> {
  if (!isAdmin(user)) return { ok: false, reason: 'FORBIDDEN' };
  /* Quando a parte 2 ligar os colaboradores a um tipo, apagar um tipo em uso
     deixaria escalas órfãs. O caminho é INATIVAR — some da escolha e o
     histórico continua explicável. */
  await prisma.scheduleTemplate.delete({ where: { id } }).catch(() => {});
  await audit({ userId: user.id, action: 'SCHEDULE_TEMPLATE_DELETE', module: 'CONFIG', entity: 'schedule_template', entityId: id });
  return { ok: true };
}
