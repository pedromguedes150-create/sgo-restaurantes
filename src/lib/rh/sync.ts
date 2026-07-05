import { prisma } from '@/lib/db/prisma';
import { rh, rhConfigured } from '@/lib/rh/client';
import { unwrapColaboradores, isAtivo } from '@/lib/rh/normalize';
import { audit } from '@/lib/audit';
import type { SessionUser } from '@/lib/auth/session';

export type SyncResult =
  | { ok: true; created: number; updated: number; total: number }
  | { ok: false; reason: 'FORBIDDEN' | 'NOT_CONFIGURED' | 'NO_RH_NAME' | 'NOT_FOUND' | 'RH_ERROR'; message?: string };

/**
 * Núcleo da sincronização de UMA unidade (sem checagem de papel — uso interno).
 * Casa pela razão social em Unit.rhUnitName. Upsert por matrícula (externalId);
 * vincula à unidade; inativa quem saiu da lista. `actorUserId` null = sistema.
 */
async function syncUnitCore(unitId: string, actorUserId: string | null): Promise<SyncResult> {
  const unit = await prisma.unit.findUnique({ where: { id: unitId } });
  if (!unit) return { ok: false, reason: 'NOT_FOUND' };
  if (!unit.rhUnitName) return { ok: false, reason: 'NO_RH_NAME' };

  let lista;
  try {
    lista = unwrapColaboradores(await rh.colaboradoresDaUnidade(unit.rhUnitName));
  } catch (e) {
    return { ok: false, reason: 'RH_ERROR', message: e instanceof Error ? e.message : String(e) };
  }

  let created = 0;
  let updated = 0;
  for (const c of lista) {
    if (!c.matricula) continue;
    const data = {
      name: c.nome?.trim() || `Matrícula ${c.matricula}`,
      jobTitle: c.cargo?.trim() || null,
      active: isAtivo(c.status),
      source: 'RH' as const,
      externalId: String(c.matricula),
      hireDate: c.admissao && /^\d{4}-\d{2}-\d{2}$/.test(c.admissao) ? c.admissao : null,
    };
    const existing = await prisma.collaborator.findFirst({ where: { externalId: data.externalId } });
    let collaboratorId: string;
    if (existing) {
      await prisma.collaborator.update({ where: { id: existing.id }, data });
      collaboratorId = existing.id;
      updated++;
    } else {
      const c2 = await prisma.collaborator.create({ data });
      collaboratorId = c2.id;
      created++;
    }
    await prisma.collaboratorUnit.upsert({
      where: { collaboratorId_unitId: { collaboratorId, unitId } },
      create: { collaboratorId, unitId },
      update: {},
    });
  }

  // Quem veio do RH antes mas NÃO está mais na lista (demissão/transferência) é inativado.
  const matriculas = lista.filter((c) => c.matricula).map((c) => String(c.matricula));
  const deactivated = await prisma.collaborator.updateMany({
    where: { source: 'RH', active: true, externalId: { notIn: matriculas }, units: { some: { unitId } } },
    data: { active: false },
  });

  await audit({
    userId: actorUserId,
    unitId,
    action: actorUserId ? 'RH_SYNC_COLLABORATORS' : 'RH_SYNC_AUTO',
    module: 'PEOPLE',
    metadata: { rhUnitName: unit.rhUnitName, total: lista.length, created, updated, deactivated: deactivated.count },
  });

  // novos colaboradores → gera treinamentos iniciais (e setoriais quando alocados)
  try {
    const { reconcileTrainingForUnit } = await import('@/lib/training');
    await reconcileTrainingForUnit(unitId);
  } catch { /* não bloqueia o sync */ }

  return { ok: true, created, updated, total: lista.length };
}

/** Sincroniza os colaboradores de UMA unidade (acionado por Admin). */
export async function syncCollaboratorsForUnit(user: SessionUser, unitId: string): Promise<SyncResult> {
  if (user.role !== 'ADMIN') return { ok: false, reason: 'FORBIDDEN' };
  if (!rhConfigured()) return { ok: false, reason: 'NOT_CONFIGURED' };
  return syncUnitCore(unitId, user.id);
}

/** Sincroniza TODAS as unidades do SGO com "Nome no RH" definido (acionado por Admin). */
export async function syncAllRegisteredUnits(user: SessionUser): Promise<SyncResult & { units?: number }> {
  if (user.role !== 'ADMIN') return { ok: false, reason: 'FORBIDDEN' };
  if (!rhConfigured()) return { ok: false, reason: 'NOT_CONFIGURED' };
  const units = await prisma.unit.findMany({ where: { active: true, rhUnitName: { not: null } }, select: { id: true } });
  let created = 0, updated = 0, total = 0;
  for (const u of units) {
    const r = await syncUnitCore(u.id, user.id);
    if (r.ok) { created += r.created; updated += r.updated; total += r.total; }
  }
  return { ok: true, created, updated, total, units: units.length };
}

/**
 * Sincronização AUTOMÁTICA (sistema) — chamada pelo scheduler ~1x/dia.
 * Não exige sessão; só roda se o RH estiver configurado. Idempotente.
 */
export async function runDailyRhSync(): Promise<{ ran: boolean; units?: number; created?: number; updated?: number }> {
  if (!rhConfigured()) return { ran: false };
  const units = await prisma.unit.findMany({ where: { active: true, rhUnitName: { not: null } }, select: { id: true } });
  let created = 0, updated = 0;
  for (const u of units) {
    const r = await syncUnitCore(u.id, null);
    if (r.ok) { created += r.created; updated += r.updated; }
  }
  return { ran: true, units: units.length, created, updated };
}

/** True se já houve uma sincronização automática nas últimas `hours` horas. */
export async function recentlyAutoSynced(hours = 23): Promise<boolean> {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);
  const last = await prisma.auditLog.findFirst({
    where: { action: 'RH_SYNC_AUTO', createdAt: { gte: since } },
    select: { id: true },
  });
  return Boolean(last);
}
