import { prisma } from '@/lib/db/prisma';
import { assertUnitAccess, UnitScopeError } from '@/lib/scope/unit-scope';
import { currentOperationalDate } from '@/lib/date/operational';
import { getActiveSequence } from '@/lib/commands/active';
import { audit } from '@/lib/audit';
import type { SessionUser } from '@/lib/auth/session';

export type SubmitCountResult =
  | { ok: true; absent: number[]; newDivergences: number }
  | { ok: false; reason: 'FORBIDDEN' | 'NO_CONFIG' | 'OBSERVATION_REQUIRED' | 'INVALID' };

/**
 * Registra a contagem diária de comandas (Módulo 3).
 * O gerente informa apenas as AUSENTES (ou "todas presentes"). Cada ausente vira
 * uma divergência (se ainda não houver uma aberta) + alerta ao Supervisor.
 * Observação é obrigatória quando há ausentes.
 */
export async function submitCount(
  user: SessionUser,
  input: { unitId: string; operationalDate?: string; allPresent: boolean; absentNumbers?: number[]; observation?: string },
  ctx: { ip?: string | null; userAgent?: string | null } = {},
): Promise<SubmitCountResult> {
  try {
    assertUnitAccess(user, input.unitId);
  } catch (e) {
    if (e instanceof UnitScopeError) return { ok: false, reason: 'FORBIDDEN' };
    throw e;
  }

  const unit = await prisma.unit.findUnique({ where: { id: input.unitId } });
  if (!unit) return { ok: false, reason: 'INVALID' };

  const seq = await getActiveSequence(unit.id);
  if (!seq.config) return { ok: false, reason: 'NO_CONFIG' };

  const operationalDate =
    input.operationalDate ?? currentOperationalDate({ timezone: unit.timezone, cutoffHour: unit.cutoffHour });

  // normaliza ausentes: somente números que pertencem à sequência ativa
  const absent = input.allPresent
    ? []
    : Array.from(new Set((input.absentNumbers ?? []).filter((n) => Number.isInteger(n) && seq.active.has(n))));

  if (!input.allPresent && absent.length > 0 && !input.observation?.trim()) {
    return { ok: false, reason: 'OBSERVATION_REQUIRED' };
  }

  // registra/atualiza a contagem do dia
  await prisma.commandCount.upsert({
    where: { unitId_operationalDate: { unitId: unit.id, operationalDate } },
    create: { unitId: unit.id, operationalDate, allPresent: input.allPresent, absentCount: absent.length, createdById: user.id },
    update: { allPresent: input.allPresent, absentCount: absent.length, createdById: user.id },
  });

  // cria divergências para ausentes sem divergência aberta
  let newDivergences = 0;
  for (const number of absent) {
    const existing = await prisma.commandDivergence.findFirst({
      where: { unitId: unit.id, number, status: { in: ['OPEN', 'INVESTIGATING'] } },
      select: { id: true },
    });
    if (existing) continue;
    await prisma.commandDivergence.create({
      data: { unitId: unit.id, number, observation: input.observation?.trim() || null, createdById: user.id },
    });
    newDivergences++;
  }

  // conclui a tarefa "Contagem de Comandas" do dia (idempotente)
  await prisma.taskInstance.updateMany({
    where: { unitId: unit.id, operationalDate, status: 'PENDING', template: { module: 'COMMANDS' } },
    data: { status: 'DONE', completedById: user.id, completedAt: new Date() },
  });

  await audit({
    userId: user.id,
    unitId: unit.id,
    action: 'COMMAND_COUNT',
    module: 'COMMANDS',
    metadata: { operationalDate, allPresent: input.allPresent, absent: absent.length, newDivergences },
    ...ctx,
  });
  if (newDivergences > 0) {
    await audit({
      userId: user.id,
      unitId: unit.id,
      action: 'COMMAND_DIVERGENCE_ALERT',
      module: 'COMMANDS',
      metadata: { numbers: absent, notify: ['SUPERVISOR'] },
      ...ctx,
    });
  }

  return { ok: true, absent, newDivergences };
}
