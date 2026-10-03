import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import { getToApproveCount } from '@/lib/payments/query';
import { getInboxPendingCount } from '@/lib/communications/query';
import { getOccurrenceSummary } from '@/lib/occurrences/query';
import type { SessionUser } from '@/lib/auth/session';

/**
 * SELOS DE PENDÊNCIA da barra (kit de layout, Fase 3).
 *
 * No SGO dos Postos cada item do menu tem um `badgeKey` e a barra soma os
 * filhos por seção. Aqui a chave é a do MÓDULO (`MODULES[].key`), e o selo da
 * área é a soma dos módulos que a área contém — a mesma composição que o
 * catálogo já faz para o menu, então módulo novo com contagem aparece no selo
 * certo sem mapa paralelo.
 *
 * O que conta é "precisa da SUA ação", não "existe": pagamento na sua fila de
 * aprovação, comunicado que você ainda não confirmou, tarefa da sua unidade
 * com prazo vencido, ocorrência crítica aberta no seu alcance. Cada contagem
 * reusa a função do módulo (mesmo recorte de perfil e unidade). Consultado
 * pela barra a cada 2 minutos, como no kit — não no render do layout.
 */
export { badgesPorArea, type Pendencias } from '@/lib/nav/pendencias-puro';
import type { Pendencias } from '@/lib/nav/pendencias-puro';

export async function contarPendencias(user: SessionUser, now = new Date()): Promise<Pendencias> {
  const [tarefas, pagamentos, comunicados, ocorrencias] = await Promise.all([
    prisma.taskInstance.count({ where: { status: 'PENDING', dueAt: { lt: now }, ...unitScopeWhere(user, 'unitId') } }),
    getToApproveCount(user),
    getInboxPendingCount(user),
    getOccurrenceSummary(user).then((s) => s.criticalOpen).catch(() => 0),
  ]);
  const out: Pendencias = {};
  if (tarefas > 0) out.TASKS = tarefas;
  if (pagamentos > 0) out.PAYMENTS = pagamentos;
  if (comunicados > 0) out.COMMUNICATION = comunicados;
  if (ocorrencias > 0) out.OCCURRENCES = ocorrencias;
  return out;
}

