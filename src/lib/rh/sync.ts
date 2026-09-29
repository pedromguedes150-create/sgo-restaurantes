import { prisma } from '@/lib/db/prisma';
import { rh, rhDisponivel, listaParaUnidade } from '@/lib/rh/transporte';
import { unwrapColaboradores, isAtivo, type RhColaborador } from '@/lib/rh/normalize';
import { audit } from '@/lib/audit';
import { notifyAdmins } from '@/lib/notifications';
import type { SessionUser } from '@/lib/auth/session';

export type SyncResult =
  | { ok: true; created: number; updated: number; total: number }
  | { ok: false; reason: 'FORBIDDEN' | 'NOT_CONFIGURED' | 'NO_RH_NAME' | 'NOT_FOUND' | 'RH_ERROR'; message?: string };

/**
 * Núcleo da sincronização de UMA unidade (sem checagem de papel — uso interno).
 * Casa pelo CNPJ da unidade (preferido, v1.132.0) ou pela razão social em
 * Unit.rhUnitName (fallback). Upsert por matrícula (externalId); vincula à
 * unidade; inativa quem saiu da lista. `actorUserId` null = sistema. `todos` é
 * a lista completa do RH já buscada — o sync de várias unidades busca uma vez.
 */
async function syncUnitCore(unitId: string, actorUserId: string | null, todos?: RhColaborador[]): Promise<SyncResult> {
  const unit = await prisma.unit.findUnique({ where: { id: unitId } });
  if (!unit) return { ok: false, reason: 'NOT_FOUND' };
  if (!unit.rhUnitName && !unit.cnpj) return { ok: false, reason: 'NO_RH_NAME' };

  let lista: RhColaborador[];
  let vinculo: 'CNPJ' | 'RAZAO_SOCIAL';
  try {
    const r = await listaParaUnidade({ cnpj: unit.cnpj, rhUnitName: unit.rhUnitName }, todos, rh);
    if (!r.ok) return { ok: false, reason: 'NO_RH_NAME' };
    lista = r.lista;
    vinculo = r.vinculo;
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
      // CPF (só dígitos) — casa os eventos de desligamento da integração RH→SGO
      cpf: c.cpf ? String(c.cpf).replace(/\D/g, '') || null : null,
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

  /**
   * GUARDA: lista vazia NÃO inativa ninguém.
   *
   * `notIn: []` não filtra nada — o Prisma descarta a condição, e o `updateMany`
   * passa a casar com TODOS os colaboradores de RH da unidade. Medido: com a
   * lista vazia, 3 de 3 ativos casavam; com uma matrícula inexistente, 0.
   *
   * Ou seja: um `200 { data: [] }` — um "Nome no RH" com um espaço a mais, uma
   * unidade que o RH devolveu vazia por um instante — apagava o quadro inteiro
   * da unidade, em silêncio, num job que roda sozinho 1×/dia.
   *
   * Zero colaboradores numa unidade que tem gente ativa nunca é uma informação
   * boa o bastante para desligar todo mundo. Pula a inativação e chama alguém.
   */
  const ativosNaUnidade = await prisma.collaborator.count({
    where: { source: 'RH', active: true, units: { some: { unitId } } },
  });
  const listaVaziaSuspeita = matriculas.length === 0 && ativosNaUnidade > 0;

  const deactivated = listaVaziaSuspeita
    ? { count: 0 }
    : await prisma.collaborator.updateMany({
      where: { source: 'RH', active: true, externalId: { notIn: matriculas }, units: { some: { unitId } } },
      data: { active: false },
    });

  await audit({
    userId: actorUserId,
    unitId,
    action: actorUserId ? 'RH_SYNC_COLLABORATORS' : 'RH_SYNC_AUTO',
    module: 'PEOPLE',
    metadata: {
      rhUnitName: unit.rhUnitName, cnpj: unit.cnpj, vinculo, total: lista.length, created, updated, deactivated: deactivated.count,
      ...(listaVaziaSuspeita ? { inativacaoPulada: ativosNaUnidade, motivo: 'RH devolveu lista vazia' } : {}),
    },
  });

  if (listaVaziaSuspeita) {
    await notifyAdmins({
      title: '⚠ RH devolveu lista vazia — sincronização incompleta',
      body: `A unidade ${unit.name} tem ${ativosNaUnidade} colaborador(es) ativo(s), mas o RH não devolveu nenhum para "${unit.rhUnitName}". Ninguém foi inativado. Confira o "Nome no RH" da unidade em Configurações → Unidades.`,
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
  if (!(await rhDisponivel())) return { ok: false, reason: 'NOT_CONFIGURED' };
  return syncUnitCore(unitId, user.id);
}

/** Unidades que têm como se ligar ao RH: CNPJ ou razão social. */
const COM_VINCULO = { active: true, OR: [{ rhUnitName: { not: null } }, { cnpj: { not: null } }] };

/**
 * A lista completa do RH, buscada UMA vez para o sync de várias unidades. Se
 * falhar, devolve undefined e cada unidade tenta pelo caminho de sempre.
 */
async function listaCompletaOuNada(): Promise<RhColaborador[] | undefined> {
  try { return unwrapColaboradores(await rh.colaboradores()); } catch { return undefined; }
}

/** Sincroniza TODAS as unidades do SGO com "Nome no RH" definido (acionado por Admin). */
export async function syncAllRegisteredUnits(user: SessionUser): Promise<SyncResult & { units?: number }> {
  if (user.role !== 'ADMIN') return { ok: false, reason: 'FORBIDDEN' };
  if (!(await rhDisponivel())) return { ok: false, reason: 'NOT_CONFIGURED' };
  const units = await prisma.unit.findMany({ where: COM_VINCULO, select: { id: true } });
  const todos = await listaCompletaOuNada();
  let created = 0, updated = 0, total = 0;
  for (const u of units) {
    const r = await syncUnitCore(u.id, user.id, todos);
    if (r.ok) { created += r.created; updated += r.updated; total += r.total; }
  }
  return { ok: true, created, updated, total, units: units.length };
}

/**
 * Sincronização AUTOMÁTICA (sistema) — chamada pelo scheduler ~1x/dia.
 * Não exige sessão; só roda se o RH estiver configurado. Idempotente.
 */
export async function runDailyRhSync(): Promise<{ ran: boolean; units?: number; created?: number; updated?: number }> {
  if (!(await rhDisponivel())) return { ran: false };
  const units = await prisma.unit.findMany({ where: COM_VINCULO, select: { id: true } });
  const todos = await listaCompletaOuNada();
  let created = 0, updated = 0;
  for (const u of units) {
    const r = await syncUnitCore(u.id, null, todos);
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
