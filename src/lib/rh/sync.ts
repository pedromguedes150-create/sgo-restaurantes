import { prisma } from '@/lib/db/prisma';
import { rh, rhConfigured } from '@/lib/rh/client';
import { unwrapColaboradores, isAtivo } from '@/lib/rh/normalize';
import { audit } from '@/lib/audit';
import type { SessionUser } from '@/lib/auth/session';

export type SyncResult =
  | { ok: true; created: number; updated: number; total: number }
  | { ok: false; reason: 'FORBIDDEN' | 'NOT_CONFIGURED' | 'NO_RH_NAME' | 'NOT_FOUND' | 'RH_ERROR'; message?: string };

/**
 * Sincroniza os colaboradores de UMA unidade do SGO a partir do RH.
 * Casa pela razão social configurada em Unit.rhUnitName (decisão: por nome).
 * Upsert por matrícula (externalId); vincula à unidade; inativa quem não está "Ativo".
 */
export async function syncCollaboratorsForUnit(user: SessionUser, unitId: string): Promise<SyncResult> {
  if (user.role !== 'ADMIN') return { ok: false, reason: 'FORBIDDEN' };
  if (!rhConfigured()) return { ok: false, reason: 'NOT_CONFIGURED' };

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
    // garante o vínculo com a unidade
    await prisma.collaboratorUnit.upsert({
      where: { collaboratorId_unitId: { collaboratorId, unitId } },
      create: { collaboratorId, unitId },
      update: {},
    });
  }

  await audit({
    userId: user.id,
    unitId,
    action: 'RH_SYNC_COLLABORATORS',
    module: 'PEOPLE',
    metadata: { rhUnitName: unit.rhUnitName, total: lista.length, created, updated },
  });

  return { ok: true, created, updated, total: lista.length };
}

/**
 * Sincroniza TODAS as unidades do SGO que têm "Nome no RH" definido.
 * Garante que só entram colaboradores das unidades cadastradas no SGO
 * (segmentos não-restaurante do RH nunca aparecem).
 */
export async function syncAllRegisteredUnits(user: SessionUser): Promise<SyncResult & { units?: number }> {
  if (user.role !== 'ADMIN') return { ok: false, reason: 'FORBIDDEN' };
  if (!rhConfigured()) return { ok: false, reason: 'NOT_CONFIGURED' };
  const units = await prisma.unit.findMany({ where: { active: true, rhUnitName: { not: null } }, select: { id: true } });
  let created = 0, updated = 0, total = 0;
  for (const u of units) {
    const r = await syncCollaboratorsForUnit(user, u.id);
    if (r.ok) { created += r.created; updated += r.updated; total += r.total; }
  }
  return { ok: true, created, updated, total, units: units.length };
}
