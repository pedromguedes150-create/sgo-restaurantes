import { prisma } from '@/lib/db/prisma';
import { rh, rhConfigured } from '@/lib/rh/client';
import { unwrapColaboradores, isAtivo, classificarStatus } from '@/lib/rh/normalize';
import { audit } from '@/lib/audit';
import { notifyAdmins } from '@/lib/notifications';
import { dayUTC } from '@/lib/schedule';
import { currentOperationalDate } from '@/lib/date/operational';
import type { SessionUser } from '@/lib/auth/session';

export const FERIAS_ORIGEM_RH = 'RH_SYNC';
/** A marcação diária que o sync grava em `schedule_actuals` — é a evidência que o backfill lê. */
export const MOTIVO_FE_DO_RH = 'RH: em férias';
/**
 * Dias sem sincronização que NÃO quebram o período (v1.142.2). O status
 * "Férias" não some por um dia e volta: um buraco de 1–3 dias entre duas
 * leituras é o scheduler que não rodou (deploy, reinício), não a pessoa que
 * voltou ao trabalho. Acima disso, é outro período.
 */
export const TOLERANCIA_DIAS_SEM_SYNC = 3;

const DIA_MS = 86_400_000;

/**
 * O primeiro dia de evidência contígua de férias do RH antes de `hoje`: a
 * marcação diária em `schedule_actuals` (`MOTIVO_FE_DO_RH`) que o código de
 * antes da v1.142.1 gravava — um dia por sincronização. Anda para trás
 * enquanto houver marcação, tolerando buracos de até TOLERANCIA_DIAS_SEM_SYNC.
 * Sem evidência, o início é hoje (nada é adivinhado).
 */
async function inicioPelaEvidencia(collaboratorId: string, hoje: Date): Promise<Date> {
  const marcas = await prisma.scheduleActual.findMany({
    where: { collaboratorId, status: 'FERIAS', reason: MOTIVO_FE_DO_RH, date: { lt: hoje, gte: new Date(hoje.getTime() - 120 * DIA_MS) } },
    select: { date: true }, orderBy: { date: 'desc' },
  });
  let inicio = hoje;
  for (const m of marcas) {
    const dias = Math.round((inicio.getTime() - m.date.getTime()) / DIA_MS);
    if (dias > TOLERANCIA_DIAS_SEM_SYNC + 1) break;
    inicio = m.date;
  }
  return inicio;
}

/**
 * Abre ou estende o período de férias de origem RH para o dia `hoje` (v1.142.1).
 * Contíguo = o período RH_SYNC que terminou há no máximo TOLERANCIA_DIAS_SEM_SYNC
 * dias; existe → endDate vira hoje (o buraco de sync fica coberto). Ao ABRIR,
 * o início recua até a primeira evidência contígua (v1.142.2). Qualquer
 * período (de qualquer origem) que já cubra hoje é respeitado e não duplicado.
 */
export async function estenderFeriasDoRh(collaboratorId: string, unitId: string, hoje: Date): Promise<'ABERTO' | 'ESTENDIDO' | 'JA_COBERTO'> {
  const limite = new Date(hoje.getTime() - TOLERANCIA_DIAS_SEM_SYNC * DIA_MS);
  const cobre = await prisma.vacation.findFirst({ where: { collaboratorId, startDate: { lte: hoje }, endDate: { gte: hoje } }, select: { id: true } });
  if (cobre) return 'JA_COBERTO';
  const contiguo = await prisma.vacation.findFirst({
    where: { collaboratorId, source: FERIAS_ORIGEM_RH, endDate: { gte: limite, lt: hoje } },
    orderBy: { endDate: 'desc' }, select: { id: true },
  });
  if (contiguo) {
    await prisma.vacation.update({ where: { id: contiguo.id }, data: { endDate: hoje } });
    return 'ESTENDIDO';
  }
  const inicio = await inicioPelaEvidencia(collaboratorId, hoje);
  await prisma.vacation.create({ data: { collaboratorId, unitId, startDate: inicio, endDate: hoje, status: 'CONFIRMED', source: FERIAS_ORIGEM_RH, changeNote: 'Aberto pela sincronização do RH (status "Férias")' } });
  return 'ABERTO';
}

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
 *
 * FÉRIAS → ESCALA (30/09/2026): quando o RH diz que alguém está de férias, o
 * dia OPERACIONAL de hoje da unidade vira FE em `schedule_actuals` — pelo
 * MESMO caminho que uma ausência lançada à mão (`ScheduleActual.upsert`,
 * status `FERIAS`, auditoria `SCHEDULE_ABSENCE`), só que sem passar por
 * `registerAbsence`: aquela função exige um `SessionUser` de verdade (o FK de
 * `createdById` rejeitaria um ator inventado para o sync automático), e aqui
 * o ator É o `actorUserId` que a própria função já recebe — `null` no
 * automático, o Admin no manual; ambos são válidos porque a coluna aceita
 * nulo. **Só o dia de hoje**: o RH não manda data de início/fim, então não há
 * como adivinhar quando a férias começou nem quando volta — dias antes desta
 * sincronização (se ela atrasou) e o dia da volta não são preenchidos
 * sozinhos. Repetir a marcação no mesmo dia é idempotente (upsert pela chave
 * `collaboratorId+date`).
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
  const feriasMarcadas: string[] = [];
  const hoje = currentOperationalDate({ timezone: unit.timezone, cutoffHour: unit.cutoffHour });
  const [hy, hm, hd] = hoje.split('-').map(Number);
  const hojeDate = dayUTC(hy, hm, hd);

  for (const c of lista) {
    if (!c.matricula) continue;
    const classe = classificarStatus(c.status);
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

    if (classe === 'FERIAS') {
      /* O PERÍODO (v1.142.1): o RH só diz "Férias", sem início nem fim. Em
         vez de ficar só com a marcação do dia, o sync abre um período de
         férias de origem RH_SYNC começando hoje e o ESTENDE a cada
         sincronização enquanto o status persistir — a Escala deriva o FE
         desse período (Planejado e Realizado), e nada além do observado é
         inventado: quando o RH volta a "Ativo", o período para de crescer.
         A marcação do dia em schedule_actuals continua (histórico/aviso). */
      await estenderFeriasDoRh(collaboratorId, unitId, hojeDate);
      await prisma.scheduleActual.upsert({
        where: { collaboratorId_date: { collaboratorId, date: hojeDate } },
        create: { collaboratorId, unitId, date: hojeDate, status: 'FERIAS', reason: MOTIVO_FE_DO_RH, createdById: actorUserId },
        update: { status: 'FERIAS', reason: MOTIVO_FE_DO_RH, createdById: actorUserId },
      });
      await audit({
        userId: actorUserId, unitId, action: 'SCHEDULE_ABSENCE', module: 'SCHEDULE',
        entity: 'collaborator', entityId: collaboratorId,
        metadata: { status: 'FERIAS', start: hoje, end: hoje, origem: 'RH_SYNC' },
      });
      feriasMarcadas.push(data.name);
    }
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
      feriasMarcadas: feriasMarcadas.length,
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

  /* Visível, não calado: quem marcou o dia como FE precisa de rastro fácil de
     achar, já que é um efeito novo de um clique em "Sincronizar" (ou do
     scheduler) que ninguém pediu tela por tela. */
  if (feriasMarcadas.length > 0) {
    await notifyAdmins({
      title: `🏖️ ${feriasMarcadas.length} colaborador(es) marcado(s) de férias hoje — ${unit.name}`,
      body: `Conforme o RH: ${feriasMarcadas.join(', ')}. O período de férias (Pessoas → Férias) foi aberto/estendido até hoje (${hoje}) e a Escala mostra FE nesses dias. O RH não manda início/fim: dias ANTES da primeira sincronização não são adivinhados — ajuste o período em Pessoas → Férias se precisar.`,
      link: `/modulos/escala?unit=${unitId}`,
      module: 'SCHEDULE',
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
/**
 * REATIVADA em 30/09/2026, a pedido direto do Pedro — depois de conferidos os
 * 49 colaboradores inativados em 29/09/2026 e do período em SUSPENSO (v1.132.2).
 *
 * O que causou o incidente NÃO volta: era um `updateMany({ externalId: {
 * notIn: matriculas } }, { active: false })` — quem não voltasse na lista do
 * RH numa chamada era inativado, e uma resposta vazia/parcial derrubava a
 * unidade inteira calada. Esse trecho foi REMOVIDO do código (não é uma flag
 * que liga/desliga um comportamento perigoso — o comportamento perigoso não
 * existe mais): hoje `syncUnitCore` só inativa quem o PRÓPRIO RH devolve, pela
 * matrícula, com status de desligamento; ausência, lista vazia, formato
 * inesperado ou falha de transporte apenas CONTAM (`naoRetornados`) e nunca
 * escrevem `active: false`. A MESMA função roda para o botão manual e para o
 * automático — não há um caminho "rápido" separado para o automático que
 * pudesse reintroduzir o atalho perigoso.
 *
 * Coberto em `tests/rh-sync.integration.test.ts` (lista vazia, formato
 * inesperado, falha de transporte, período de experiência, férias — nenhum
 * inativa ninguém) e `tests/rh-sync-automatico.integration.test.ts` (o
 * caminho automático, ator nulo, com a mesma garantia).
 */
export const RH_AUTO_SYNC_SUSPENSO = false;

export async function runDailyRhSync(): Promise<{ ran: boolean; motivo?: 'SUSPENSO' | 'NAO_CONFIGURADO'; units?: number; created?: number; updated?: number }> {
  if (RH_AUTO_SYNC_SUSPENSO) return { ran: false, motivo: 'SUSPENSO' };
  if (!rhConfigured()) return { ran: false, motivo: 'NAO_CONFIGURADO' };
  const units = await prisma.unit.findMany({ where: { active: true, rhUnitName: { not: null } }, select: { id: true } });
  let created = 0, updated = 0;
  for (const u of units) {
    const r = await syncUnitCore(u.id, null);
    if (r.ok) { created += r.created; updated += r.updated; }
  }
  return { ran: true, units: units.length, created, updated };
}

/**
 * A hora (em Brasília) a partir da qual o sync automático do dia pode rodar
 * (v1.142.2). Antes de amanhecer a operação não abriu; depois disso, o FE de
 * quem está de férias precisa estar na Escala ANTES de o gerente olhar o dia.
 */
export const HORA_MINIMA_SYNC_BRT = 5;

/** 'AAAA-MM-DD' e a hora em Brasília de um instante. */
export function emBrasilia(now: Date = new Date()): { dia: string; hora: number } {
  const partes = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false }).formatToParts(now);
  const v = (t: string) => partes.find((p) => p.type === t)?.value ?? '00';
  return { dia: `${v('year')}-${v('month')}-${v('day')}`, hora: Number(v('hour')) % 24 };
}

/**
 * Já houve sincronização automática HOJE (dia de Brasília)? v1.142.2: o
 * critério antigo era "nas últimas 23h", que escorregava — rodava às 13h num
 * dia, às 12h no outro, e um reinício na hora errada deixava um dia sem FE.
 * Por dia civil, o sync acontece UMA vez por dia e sempre no mesmo dia.
 */
export async function autoSyncFeitaHoje(now: Date = new Date()): Promise<boolean> {
  const { dia } = emBrasilia(now);
  const inicioDoDia = new Date(`${dia}T00:00:00-03:00`);
  const last = await prisma.auditLog.findFirst({ where: { action: 'RH_SYNC_AUTO', createdAt: { gte: inicioDoDia, lte: now } }, select: { id: true } });
  return Boolean(last);
}

/**
 * Deve rodar agora? Uma vez por dia de Brasília, a partir das
 * HORA_MINIMA_SYNC_BRT — no boot também, se o dia ainda não teve (um deploy
 * às 13h não pode deixar o dia sem sincronização).
 */
export async function deveRodarSyncAutomatico(now: Date = new Date(), boot = false): Promise<boolean> {
  if (RH_AUTO_SYNC_SUSPENSO) return false;
  const { hora } = emBrasilia(now);
  if (!boot && hora < HORA_MINIMA_SYNC_BRT) return false;
  return !(await autoSyncFeitaHoje(now));
}
