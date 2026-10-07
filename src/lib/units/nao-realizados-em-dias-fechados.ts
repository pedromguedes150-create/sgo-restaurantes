import { prisma } from '@/lib/db/prisma';
import { audit } from '@/lib/audit';
import type { SessionUser } from '@/lib/auth/session';
import { diaDaSemana, diasFechados } from '@/lib/units/dias-de-funcionamento';

/**
 * Checklists "não realizados" (ou ainda pendentes) gerados em dias em que a
 * unidade NÃO funciona (v1.157.0). Antes do cadastro dos dias de funcionamento
 * o SGO gerava os checklists de todos os dias — na unidade Produtos, cada sábado
 * e domingo virava "não realizado" e derrubava a meta.
 *
 * Só entra o que NINGUÉM tocou: status MISSED/PENDING, sem conclusão, sem
 * resposta de item e sem foto. Concluído (DONE/LATE) nunca é apagado — se alguém
 * trabalhou no domingo, o registro fica.
 */
async function candidatos(unitId: string) {
  const unit = await prisma.unit.findUnique({ where: { id: unitId }, select: { operatingDays: true } });
  if (!unit) return null;
  const fechados = diasFechados(unit.operatingDays);
  if (fechados.length === 0) return [];
  const rows = await prisma.taskInstance.findMany({
    where: {
      unitId,
      status: { in: ['MISSED', 'PENDING'] },
      completedAt: null,
      itemResponses: { none: {} },
      photos: { none: {} },
    },
    select: { id: true, operationalDate: true },
  });
  return rows.filter((r) => fechados.includes(diaDaSemana(r.operationalDate)));
}

export async function contarNaoRealizadosEmDiasFechados(unitId: string): Promise<number> {
  return (await candidatos(unitId))?.length ?? 0;
}

export type ResultadoLimpeza = { ok: true; removidos: number } | { ok: false; reason: 'FORBIDDEN' | 'NOT_FOUND' };

/** Apaga os candidatos acima (só ADMIN), com uma linha de Auditoria com a contagem e os dias. */
export async function limparNaoRealizadosEmDiasFechados(user: SessionUser, unitId: string, ctx: { ip?: string | null; userAgent?: string | null } = {}): Promise<ResultadoLimpeza> {
  if (user.role !== 'ADMIN') return { ok: false, reason: 'FORBIDDEN' };
  const lista = await candidatos(unitId);
  if (lista === null) return { ok: false, reason: 'NOT_FOUND' };
  if (lista.length === 0) return { ok: true, removidos: 0 };
  const ids = lista.map((r) => r.id);
  // Confere de novo o "ninguém tocou" na própria exclusão: entre contar e apagar
  // alguém pode ter concluído um deles.
  const r = await prisma.taskInstance.deleteMany({
    where: { id: { in: ids }, status: { in: ['MISSED', 'PENDING'] }, completedAt: null, itemResponses: { none: {} }, photos: { none: {} } },
  });
  const datas = Array.from(new Set(lista.map((x) => x.operationalDate))).sort();
  await audit({
    userId: user.id, unitId, action: 'TASKS_CLOSED_DAYS_CLEANUP', module: 'TASKS', entity: 'unit', entityId: unitId,
    metadata: { removidos: r.count, de: datas[0], ate: datas[datas.length - 1], dias: datas.length },
    ...ctx,
  });
  return { ok: true, removidos: r.count };
}
