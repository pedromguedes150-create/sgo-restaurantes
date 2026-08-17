import { prisma } from '@/lib/db/prisma';
import { assertUnitAccess, UnitScopeError } from '@/lib/scope/unit-scope';
import { currentOperationalDate } from '@/lib/date/operational';
import { audit } from '@/lib/audit';
import { notifyUnitRole, notifyRole } from '@/lib/notifications';
import { subDays } from 'date-fns';
import type { SessionUser } from '@/lib/auth/session';
import type { OccurrenceGravity, Prisma } from '@prisma/client';

export interface CreateOccurrenceInput {
  unitId: string;
  typeId: string;
  /** Opcional: exigida só quando o tipo escolhido tem categorias cadastradas. */
  categoryId?: string;
  gravity: OccurrenceGravity;
  description: string;
  customerName?: string;
  occurredAt?: Date;
  attachments?: { path: string; mimeType: string }[];
}

export type CreateOccurrenceResult =
  | { ok: true; id: string; number: number; isRecurrence: boolean; gravity: OccurrenceGravity }
  | { ok: false; reason: 'FORBIDDEN' | 'INVALID' };

/** Cria uma ocorrência (Módulo 6) com nº sequencial por unidade e reincidência. */
export async function createOccurrence(
  user: SessionUser,
  input: CreateOccurrenceInput,
  ctx: { ip?: string | null; userAgent?: string | null } = {},
): Promise<CreateOccurrenceResult> {
  try {
    assertUnitAccess(user, input.unitId);
  } catch (e) {
    if (e instanceof UnitScopeError) return { ok: false, reason: 'FORBIDDEN' };
    throw e;
  }

  const GRAVITIES: OccurrenceGravity[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
  if (!input.description?.trim() || !input.typeId || !GRAVITIES.includes(input.gravity)) {
    return { ok: false, reason: 'INVALID' };
  }

  const unit = await prisma.unit.findUnique({ where: { id: input.unitId } });
  const type = await prisma.occurrenceType.findUnique({ where: { id: input.typeId } });
  if (!unit || !type) return { ok: false, reason: 'INVALID' };

  /**
   * Categoria é exigida SÓ quando o tipo tem alguma cadastrada.
   *
   * Antes era obrigatória sempre, e `Occurrence.categoryId` é opcional no banco
   * — a exigência era só daqui. O efeito: um tipo sem categoria (era o caso de
   * "Manutenção e obras") virava beco sem saída, com o campo aberto vazio e o
   * registro recusado sem explicação. Quem cadastra os tipos em Configurações
   * não tem como saber que deixar um sem categoria trava o formulário.
   */
  const disponiveis = await prisma.occurrenceCategory.count({
    where: { typeId: type.id, active: true },
  });
  let category: { id: string; typeId: string; name: string } | null = null;
  if (input.categoryId) {
    category = await prisma.occurrenceCategory.findUnique({
      where: { id: input.categoryId },
      select: { id: true, typeId: true, name: true },
    });
    // Categoria informada tem de pertencer ao tipo — isso continua valendo.
    if (!category || category.typeId !== type.id) return { ok: false, reason: 'INVALID' };
  } else if (disponiveis > 0) {
    // O tipo TEM categorias: escolher uma continua obrigatório.
    return { ok: false, reason: 'INVALID' };
  }

  /** Rótulo das notificações. Sem categoria, mostra só o tipo — em vez de um
   *  "Manutenção e obras — undefined" chegando no celular do supervisor. */
  const classificacao = category ? `${type.name} — ${category.name}` : type.name;

  const occurredAt = input.occurredAt ?? new Date();
  const operationalDate = currentOperationalDate(
    { timezone: unit.timezone, cutoffHour: unit.cutoffHour },
    occurredAt,
  );

  // Reincidência: mesmo tipo+categoria na mesma unidade em < 30 dias,
  // comparando pela data do FATO (occurredAt), não pela data de registro.
  // Sem categoria, a reincidência é por TIPO — senão `categoryId: null` casaria
  // com qualquer outra sem categoria daquele tipo, o que é o que queremos, mas
  // deixado explícito para não parecer descuido.
  const recurrence = await prisma.occurrence.findFirst({
    where: {
      unitId: unit.id,
      typeId: type.id,
      categoryId: category ? category.id : null,
      occurredAt: { gte: subDays(occurredAt, 30), lt: occurredAt },
    },
    select: { id: true },
  });
  const isRecurrence = Boolean(recurrence);

  // Nº sequencial por unidade (com retry contra corrida)
  let created: { id: string; number: number } | null = null;
  for (let attempt = 0; attempt < 5 && !created; attempt++) {
    const last = await prisma.occurrence.findFirst({
      where: { unitId: unit.id },
      orderBy: { number: 'desc' },
      select: { number: true },
    });
    const number = (last?.number ?? 0) + 1;
    try {
      const occ = await prisma.occurrence.create({
        data: {
          unitId: unit.id,
          number,
          occurredAt,
          operationalDate,
          reportedById: user.id,
          typeId: type.id,
          categoryId: category?.id ?? null,
          typeName: type.name,
          categoryName: category?.name ?? null,
          gravity: input.gravity,
          customerName: input.customerName?.trim() || null,
          description: input.description.trim(),
          isRecurrence,
          attachments: input.attachments?.length
            ? { create: input.attachments.map((a) => ({ path: a.path, mimeType: a.mimeType })) }
            : undefined,
        },
        select: { id: true, number: true },
      });
      created = occ;
    } catch (e) {
      // P2002 = colisão do nº sequencial → tenta o próximo
      if ((e as Prisma.PrismaClientKnownRequestError).code === 'P2002') continue;
      throw e;
    }
  }
  if (!created) return { ok: false, reason: 'INVALID' };

  // Conclui a tarefa "Registro de Ocorrências" do dia (idempotente)
  await prisma.taskInstance.updateMany({
    where: { unitId: unit.id, operationalDate, status: 'PENDING', template: { module: 'OCCURRENCES' } },
    data: { status: 'DONE', completedById: user.id, completedAt: new Date() },
  });

  await audit({
    userId: user.id,
    unitId: unit.id,
    action: 'OCC_CREATE',
    module: 'OCCURRENCES',
    entity: 'occurrence',
    entityId: created.id,
    metadata: { number: created.number, gravity: input.gravity, isRecurrence },
    ...ctx,
  });

  // Alertas por gravidade: 🔴 Alta → Supervisor · ⚫ Crítica → Supervisor + CEO
  if (input.gravity === 'HIGH' || input.gravity === 'CRITICAL') {
    await audit({
      userId: user.id,
      unitId: unit.id,
      action: input.gravity === 'CRITICAL' ? 'OCC_ALERT_CRITICAL' : 'OCC_ALERT_HIGH',
      module: 'OCCURRENCES',
      entity: 'occurrence',
      entityId: created.id,
      metadata: { number: created.number, isRecurrence, notify: input.gravity === 'CRITICAL' ? ['SUPERVISOR', 'CEO'] : ['SUPERVISOR'] },
      ...ctx,
    });
    const critical = input.gravity === 'CRITICAL';
    const payload = {
      title: critical ? '⚫ Ocorrência CRÍTICA' : '🔴 Ocorrência de gravidade alta',
      body: `${unit.name} #${created.number}: ${classificacao}${isRecurrence ? ' (reincidência <30d)' : ''}.`,
      link: `/modulos/ocorrencias/${created.id}`,
      module: 'OCCURRENCES',
      critical,
    };
    await notifyUnitRole(unit.id, 'SUPERVISOR', payload);
    if (critical) await notifyRole('CEO', payload);
  }
  // Reincidência também alerta CEO e Supervisor (spec Módulo 6), mesmo fora de HIGH/CRITICAL
  if (isRecurrence && input.gravity !== 'HIGH' && input.gravity !== 'CRITICAL') {
    const payload = {
      title: '♻ Reincidência de ocorrência',
      body: `${unit.name} #${created.number}: ${classificacao} se repetiu em menos de 30 dias.`,
      link: `/modulos/ocorrencias/${created.id}`,
      module: 'OCCURRENCES',
    };
    await notifyUnitRole(unit.id, 'SUPERVISOR', payload);
    await notifyRole('CEO', payload);
  }

  return { ok: true, id: created.id, number: created.number, isRecurrence, gravity: input.gravity };
}
