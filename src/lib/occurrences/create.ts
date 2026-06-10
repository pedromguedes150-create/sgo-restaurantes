import { prisma } from '@/lib/db/prisma';
import { assertUnitAccess, UnitScopeError } from '@/lib/scope/unit-scope';
import { currentOperationalDate } from '@/lib/date/operational';
import { audit } from '@/lib/audit';
import { subDays } from 'date-fns';
import type { SessionUser } from '@/lib/auth/session';
import type { OccurrenceGravity, Prisma } from '@prisma/client';

export interface CreateOccurrenceInput {
  unitId: string;
  typeId: string;
  categoryId: string;
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

  if (!input.description?.trim() || !input.typeId || !input.categoryId || !input.gravity) {
    return { ok: false, reason: 'INVALID' };
  }

  const unit = await prisma.unit.findUnique({ where: { id: input.unitId } });
  const type = await prisma.occurrenceType.findUnique({ where: { id: input.typeId } });
  const category = await prisma.occurrenceCategory.findUnique({ where: { id: input.categoryId } });
  if (!unit || !type || !category || category.typeId !== type.id) {
    return { ok: false, reason: 'INVALID' };
  }

  const occurredAt = input.occurredAt ?? new Date();
  const operationalDate = currentOperationalDate(
    { timezone: unit.timezone, cutoffHour: unit.cutoffHour },
    occurredAt,
  );

  // Reincidência: mesmo tipo+categoria na mesma unidade em < 30 dias
  const recurrence = await prisma.occurrence.findFirst({
    where: {
      unitId: unit.id,
      typeId: type.id,
      categoryId: category.id,
      createdAt: { gte: subDays(new Date(), 30) },
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
          categoryId: category.id,
          typeName: type.name,
          categoryName: category.name,
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

  // Alertas por gravidade (Central de Notificações entra em fase futura)
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
  }

  return { ok: true, id: created.id, number: created.number, isRecurrence, gravity: input.gravity };
}
