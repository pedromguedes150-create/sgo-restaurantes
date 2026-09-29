import { prisma } from '@/lib/db/prisma';
import { rh, rhConfigured } from '@/lib/rh/client';
import { unwrapColaboradores, isAtivo } from '@/lib/rh/normalize';
import { audit } from '@/lib/audit';
import { notifyAdmins } from '@/lib/notifications';
import type { SessionUser } from '@/lib/auth/session';

export type SyncResult =
  | { ok: true; created: number; updated: number; total: number }
  | { ok: false; reason: 'FORBIDDEN' | 'NOT_CONFIGURED' | 'NO_RH_NAME' | 'NOT_FOUND' | 'RH_ERROR'; message?: string };

/**
 * Núcleo da sincronização de UMA unidade (sem checagem de papel — uso interno).
 * Casa pela razão social em Unit.rhUnitName. Upsert por matrícula (externalId);
 * vincula à unidade. `actorUserId` null = sistema.
 *
 * REGRA DE INATIVAÇÃO (v1.132.2 — a única coisa preservada da v1.132.1):
 * ausência na resposta do RH NUNCA inativa. Só muda `active` para `false` quem
 * o PRÓPRIO RH devolve, pela matrícula, com status reconhecido como desligamento
 * (`isAtivo` no upsert). Lista vazia, resposta parcial, transferência entre
 * empresas, timeout ou erro da API não tocam em ninguém: o erro aborta a
 * unidade antes de qualquer escrita, e quem não veio na lista é apenas CONTADO
 * na auditoria (`naoRetornados`). A regra antiga "quem não veio é inativado"
 * marcou 49 pessoas inativas em 29/09/2026 sem que tivessem sido desligadas.
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
  let inativadosPorStatus = 0;
  for (const c of lista) {
    if (!c.matricula) continue;
    const data = {
      name: c.nome?.trim() || `Matrícula ${c.matricula}`,
      jobTitle: c.cargo?.trim() || null,
      active: isAtivo(c.status),
      source: 'RH' as const,
      externalId: String(c.matricula),
      hireDate: c.admissao && /^\d{4}-\d{2}-\d{2}$/.test(c.admissao) ? c.admissao : null,
      // CPF (só dígitos) — casa os eventos de desligamento da integração RH→SGO
      cpf: c.cpf ? String(c.cpf).replace(/\D/g, '') || null : null,
    };
    const existing = await prisma.collaborator.findFirst({ where: { externalId: data.externalId } });
    let collaboratorId: string;
    if (existing) {
      if (existing.active && !data.active) inativadosPorStatus++;
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

  /**
   * Quem está ativo na unidade e NÃO veio na resposta é só contado — nunca
   * inativado. Lista vazia com gente ativa continua avisando os Admins (é sinal
   * de "Nome no RH" errado ou de resposta incompleta), mas sem agir.
   */
  const matriculas = new Set(lista.filter((c) => c.matricula).map((c) => String(c.matricula)));
  const ativosDaUnidade = await prisma.collaborator.findMany({
    where: { source: 'RH', active: true, units: { some: { unitId } } },
    select: { externalId: true },
  });
  const naoRetornados = ativosDaUnidade.filter((c) => !c.externalId || !matriculas.has(c.externalId)).length;
  const listaVaziaSuspeita = matriculas.size === 0 && ativosDaUnidade.length > 0;

  await audit({
    userId: actorUserId,
    unitId,
    action: actorUserId ? 'RH_SYNC_COLLABORATORS' : 'RH_SYNC_AUTO',
    module: 'PEOPLE',
    metadata: {
      rhUnitName: unit.rhUnitName, total: lista.length, created, updated,
      /** só por status de desligamento devolvido pelo RH — ausência não conta */
      deactivated: inativadosPorStatus,
      naoRetornados,
      ...(listaVaziaSuspeita ? { motivo: 'RH devolveu lista vazia' } : {}),
    },
  });

  if (listaVaziaSuspeita) {
    await notifyAdmins({
      title: '⚠ RH devolveu lista vazia — sincronização incompleta',
      body: `A unidade ${unit.name} tem ${ativosDaUnidade.length} colaborador(es) ativo(s), mas o RH não devolveu nenhum para "${unit.rhUnitName}". Ninguém foi inativado. Confira o "Nome no RH" da unidade em Configurações → Unidades.`,
      link: '/configuracoes/integracoes',
      module: 'PEOPLE',
    }).catch(() => {});
  }

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
