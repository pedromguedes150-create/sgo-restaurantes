import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { assertUnitAccess, UnitScopeError } from '@/lib/scope/unit-scope';
import { currentOperationalDate } from '@/lib/date/operational';
import { getActiveSequence } from '@/lib/commands/active';
import { audit } from '@/lib/audit';
import { notifyUnitRole } from '@/lib/notifications';
import type { SessionUser } from '@/lib/auth/session';

export type SubmitCountResult =
  | { ok: true; absent: number[]; newDivergences: number; rejected: number[] }
  | { ok: false; reason: 'FORBIDDEN' | 'NO_CONFIG' | 'OBSERVATION_REQUIRED' | 'INVALID' };

/**
 * Registra a contagem diária de comandas (Módulo 3).
 * O gerente informa apenas as AUSENTES (ou "todas presentes"). Cada ausente vira
 * uma divergência (se ainda não houver uma aberta) + alerta ao Supervisor.
 * Observação é obrigatória quando há ausentes.
 */
export async function submitCount(
  user: SessionUser,
  input: {
    unitId: string;
    operationalDate?: string;
    allPresent: boolean;
    absentNumbers?: number[];
    /** Marcadas na grade como CONFERIDA. Quando vem, o servidor calcula os
     *  ausentes (é a fonte de verdade) e guarda o estado para a grade reabrir. */
    presentNumbers?: number[];
    /** Marcadas como EM USO (com cliente). Contam como PRESENTES. */
    inUseNumbers?: number[];
    observation?: string;
  },
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

  // Data operacional: se vier do cliente, valida formato e não permite futuro
  const today = currentOperationalDate({ timezone: unit.timezone, cutoffHour: unit.cutoffHour });
  let operationalDate = today;
  if (input.operationalDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.operationalDate) || input.operationalDate > today) {
      return { ok: false, reason: 'INVALID' };
    }
    operationalDate = input.operationalDate;
  }

  const inteiros = (v: number[] | undefined) => Array.from(new Set((v ?? []).filter((n) => Number.isInteger(n))));
  const present = inteiros(input.presentNumbers).filter((n) => seq.active.has(n));
  const inUse = inteiros(input.inUseNumbers).filter((n) => seq.active.has(n));

  /* AUSENTES SÃO CALCULADOS AQUI quando a grade manda o que está marcado.
     Antes a tela mandava a lista de ausentes que ela mesma calculava como
     "ativas − conferidas", esquecendo as marcadas EM USO — e a tela dizia, na
     própria legenda, que "em uso" CONTA COMO PRESENTE. Resultado: comanda azul
     virava faltante, abria divergência e alertava o supervisor, contrariando o
     que o gerente via na tela. Com o cálculo no servidor existe uma definição
     só: ausente é o que não está nem conferido nem em uso. */
  const marcouGrade = input.presentNumbers !== undefined || input.inUseNumbers !== undefined;
  const requested = input.allPresent
    ? []
    : marcouGrade
      ? [...seq.active].filter((n) => !present.includes(n) && !inUse.includes(n))
      : inteiros(input.absentNumbers);
  const absent = requested.filter((n) => seq.active.has(n));
  const rejected = requested.filter((n) => !seq.active.has(n));

  if (!input.allPresent && absent.length > 0 && !input.observation?.trim()) {
    return { ok: false, reason: 'OBSERVATION_REQUIRED' };
  }

  // registra/atualiza a contagem do dia
  /* Guarda o estado da grade: é o que permite reabrir para corrigir sem
     remarcar tudo. "Todas presentes" grava a sequência ativa inteira. */
  const presentSalvo = input.allPresent ? [...seq.active] : present;
  await prisma.commandCount.upsert({
    where: { unitId_operationalDate: { unitId: unit.id, operationalDate } },
    create: {
      unitId: unit.id, operationalDate, allPresent: input.allPresent, absentCount: absent.length, createdById: user.id,
      presentNumbers: presentSalvo as unknown as Prisma.InputJsonValue,
      inUseNumbers: inUse as unknown as Prisma.InputJsonValue,
    },
    update: {
      allPresent: input.allPresent, absentCount: absent.length, createdById: user.id,
      presentNumbers: presentSalvo as unknown as Prisma.InputJsonValue,
      inUseNumbers: inUse as unknown as Prisma.InputJsonValue,
    },
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
    // Alerta imediato ao Supervisor da unidade (spec Módulo 3)
    await notifyUnitRole(unit.id, 'SUPERVISOR', {
      title: 'Divergência de comandas',
      body: `${unit.name}: comanda(s) ausente(s) ${absent.join(', ')} — registrado por ${user.name} (${operationalDate}).`,
      link: '/modulos/comandas',
      module: 'COMMANDS',
    });
  }

  return { ok: true, absent, newDivergences, rejected };
}
