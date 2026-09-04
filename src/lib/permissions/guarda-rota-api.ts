import { NextResponse } from 'next/server';
import { effectivePermissions, isFullAccess } from '@/lib/permissions';
import type { Role } from '@prisma/client';

/**
 * A matriz de perfis valendo nas ROTAS.
 *
 * Até a v1.66.0 ela valia no menu e na porta das telas (guarda de rota, v1.51.0),
 * mas **1 de 105 rotas de API** checava alguma coisa: "Editar" desmarcado tirava
 * o botão e a requisição continuava passando. Aqui a matriz passa a valer também
 * na gravação — e nos relatórios, que baixam dado inteiro por um GET.
 *
 * Regras que sustentam o desenho:
 * - **Rota não mapeada não é barrada.** Barrar o desconhecido derrubaria fluxo
 *   sem aviso; o teste de cobertura é que obriga a mapear (ou a declarar por que
 *   fica de fora).
 * - **`ver` × `editar`**: exportação e consulta pedem só `ver` — pedir `editar`
 *   trancaria quem tem acesso de leitura, que é justamente o caso comum.
 * - O caminho é casado por **prefixo mais longo**, como na guarda das telas, de
 *   modo que `/api/notes/export` não caia na regra de `/api/notes`.
 */

type Exigencia = 'ver' | 'editar';
interface RegraDeRota { modulo: string; exigir: Exigencia }

/** Rota → parte da matriz que manda nela. */
export const REGRAS: Record<string, RegraDeRota> = {
  '/api/admin': { modulo: 'CONFIG', exigir: 'editar' },
  '/api/admin/ops': { modulo: 'CONFIG', exigir: 'editar' },
  '/api/ai/checklist-photo': { modulo: 'TASKS', exigir: 'editar' },
  '/api/ai/product-standard-check': { modulo: 'TASKS', exigir: 'editar' },
  '/api/audit/export': { modulo: 'AUDIT', exigir: 'ver' },

  '/api/cancellations/register': { modulo: 'CANCELLATIONS', exigir: 'editar' },
  '/api/cancellations/import': { modulo: 'CANCELLATIONS', exigir: 'editar' },
  '/api/cancellations/items': { modulo: 'CANCELLATIONS_ITEMS', exigir: 'editar' },
  '/api/cancellations/analysis': { modulo: 'CANCELLATIONS_ANALYSIS', exigir: 'ver' },
  '/api/cancellations/export': { modulo: 'CANCELLATIONS_REPORT', exigir: 'ver' },

  '/api/cash': { modulo: 'CASH', exigir: 'editar' },
  '/api/cash/vault': { modulo: 'CASH', exigir: 'editar' },
  '/api/cash/vault/history': { modulo: 'CASH_TAB_HISTORY', exigir: 'ver' },
  '/api/cash/export': { modulo: 'CASH', exigir: 'ver' },
  '/api/cash/denominations': { modulo: 'CASH_CONFIG', exigir: 'editar' },

  '/api/certificates': { modulo: 'CERTIFICATES_TAB_NEW', exigir: 'editar' },
  '/api/certificates/read': { modulo: 'CERTIFICATES', exigir: 'ver' },
  '/api/certificates/export': { modulo: 'CERTIFICATES_REPORT', exigir: 'ver' },

  '/api/checklist-forms': { modulo: 'CHECKLIST_FORMS', exigir: 'editar' },
  '/api/checklist-models/import': { modulo: 'CONFIG_MODELS', exigir: 'editar' },
  '/api/checklist-models/export': { modulo: 'CONFIG_MODELS', exigir: 'ver' },

  '/api/commands/count': { modulo: 'COMMANDS', exigir: 'editar' },
  '/api/commands/divergences': { modulo: 'COMMANDS', exigir: 'editar' },
  '/api/commands/replacements': { modulo: 'COMMANDS', exigir: 'editar' },
  '/api/commands/scan': { modulo: 'COMMANDS_SCAN', exigir: 'editar' },
  '/api/commands/open-analysis': { modulo: 'COMMANDS_OPEN', exigir: 'editar' },

  '/api/communications': { modulo: 'COMMUNICATION_TAB_NEW', exigir: 'editar' },

  '/api/gas': { modulo: 'GAS', exigir: 'editar' },
  '/api/gas/contracts': { modulo: 'GAS_TAB_CONTRACTS', exigir: 'editar' },
  '/api/gas/export': { modulo: 'GAS', exigir: 'ver' },

  '/api/higiene/manage': { modulo: 'HYGIENE', exigir: 'editar' },

  '/api/inventory': { modulo: 'INVENTORY', exigir: 'editar' },
  '/api/inventory-equip': { modulo: 'INVENTORY', exigir: 'editar' },

  '/api/metas/export': { modulo: 'METAS', exigir: 'ver' },

  '/api/notes': { modulo: 'NOTES_TAB_LIST', exigir: 'editar' },
  '/api/notes/due': { modulo: 'NOTES_TAB_DUE', exigir: 'ver' },
  '/api/notes/export': { modulo: 'NOTES', exigir: 'ver' },
  '/api/notes/gas-import': { modulo: 'NOTES', exigir: 'editar' },

  '/api/occurrences': { modulo: 'OCCURRENCES_NEW', exigir: 'editar' },

  '/api/payments': { modulo: 'PAYMENTS_TAB_NEW', exigir: 'editar' },
  '/api/payments/batch': { modulo: 'PAYMENTS_TAB_PAY', exigir: 'editar' },
  '/api/payments/freelancer-calc': { modulo: 'PAYMENTS', exigir: 'ver' },
  '/api/payments/freelancer-report': { modulo: 'PAYMENTS_FREELANCER_REPORT', exigir: 'ver' },

  '/api/people/evaluation': { modulo: 'PEOPLE_EVALUATION', exigir: 'editar' },
  '/api/people/payouts': { modulo: 'PEOPLE_PAYOUTS', exigir: 'editar' },
  '/api/people/payouts/export': { modulo: 'PEOPLE_PAYOUTS', exigir: 'ver' },
  '/api/people/probation': { modulo: 'PEOPLE_PROBATION', exigir: 'editar' },
  '/api/people/vacations': { modulo: 'PEOPLE_TAB_VACATION', exigir: 'editar' },
  '/api/people/schedule': { modulo: 'SCHEDULE', exigir: 'editar' },

  '/api/pops': { modulo: 'POPS', exigir: 'editar' },
  '/api/product-standards': { modulo: 'CONFIG_PRODUCT_STANDARDS', exigir: 'editar' },
  '/api/products/import': { modulo: 'CONFIG_PRODUCTS', exigir: 'editar' },

  '/api/rh/sync': { modulo: 'CONFIG_INTEGRATIONS', exigir: 'editar' },
  '/api/rh/test': { modulo: 'CONFIG_INTEGRATIONS', exigir: 'ver' },

  '/api/schedule': { modulo: 'SCHEDULE', exigir: 'editar' },
  '/api/schedule/absence': { modulo: 'SCHEDULE_TAB_ACTUAL', exigir: 'editar' },
  '/api/schedule/export': { modulo: 'SCHEDULE', exigir: 'ver' },
  '/api/schedule-changes': { modulo: 'SCHEDULE_SWAPS', exigir: 'editar' },
  '/api/schedule-templates': { modulo: 'CONFIG_SCHEDULES', exigir: 'editar' },

  '/api/supervision': { modulo: 'SUPERVISION', exigir: 'editar' },
  '/api/supervision/export': { modulo: 'SUPERVISION', exigir: 'ver' },

  '/api/suppliers': { modulo: 'CONFIG_SUPPLIERS', exigir: 'editar' },

  '/api/tasks/generate': { modulo: 'TASKS', exigir: 'editar' },
  '/api/terminations': { modulo: 'TERMINATIONS', exigir: 'editar' },
  '/api/training': { modulo: 'TRAINING', exigir: 'editar' },

  '/api/waste': { modulo: 'WASTE', exigir: 'editar' },
  '/api/waste/export': { modulo: 'WASTE', exigir: 'ver' },
  '/api/workforce': { modulo: 'PEOPLE_MAP', exigir: 'editar' },
};

/**
 * Rotas que ficam FORA da matriz, e por quê. O teste de cobertura exige que
 * toda rota esteja aqui ou no mapa acima — é o que impede uma rota nova nascer
 * sem ninguém decidir quem pode chamá-la.
 */
export const FORA_DA_MATRIZ: Record<string, string> = {
  '/api/auth/login': 'autenticação',
  '/api/auth/logout': 'autenticação',
  '/api/auth/refresh': 'autenticação',
  '/api/health': 'monitoração (sem sessão)',
  '/api/push': 'notificação no aparelho do próprio usuário',
  '/api/push/key': 'chave pública do push',
  '/api/notifications/read': 'avisos do próprio usuário',
  '/api/profile': 'Meu Perfil — dados do próprio usuário',
  '/api/terms/accept': 'aceite do termo pelo próprio usuário',
  '/api/manager-area': 'já tem guarda por aba (v1.64.0)',
  '/api/checklists/public': 'ficha preenchida por link, sem login',
  '/api/integracoes/rh/[evento]': 'webhook do RH, autenticado por chave própria',
  '/api/lgpd/collaborator/[id]/export': 'LGPD — regra própria de Admin na função',
  '/api/entry-date': 'edição de data: regra própria (Admin/Supervisão) no caso de uso',
  '/api/oil': 'já tem guarda por aba (v1.66.0)',
  '/api/products': 'já tem guarda por aba (v1.66.0)',
  '/api/maintenance/tickets': 'já tem guarda por aba (v1.66.0)',
  '/api/maintenance/plans': 'já tem guarda por aba (v1.66.0)',
  '/api/cancellations/[id]/justify': 'justificativa do próprio operador; escopo por unidade no caso de uso',
  '/api/communications/[id]': 'ação sobre comunicado próprio; regra no caso de uso',
  '/api/communications/[id]/confirm': 'confirmação de leitura pelo próprio destinatário',
  '/api/communications/[id]/remind': 'cobrança de leitura; regra no caso de uso',
  '/api/inventory/[id]/confirm': 'confirmação da contagem agendada; regra no caso de uso',
  '/api/notes/[id]': 'edição de nota: canManageNotes no caso de uso',
  '/api/notes/[id]/status': 'mudança de status pelo lançador; regra no caso de uso',
  '/api/occurrences/[id]/close': 'encerramento: Supervisor/Admin no caso de uso',
  '/api/occurrences/[id]/progress': 'andamento da ocorrência; regra no caso de uso',
  '/api/occurrences/[id]/update': 'reclassificação: Supervisor/Admin no caso de uso',
  '/api/payments/[id]': 'aprovar/pagar: regra de aprovador no caso de uso',
  '/api/people/vacations/[id]': 'ação sobre a própria solicitação; regra no caso de uso',
  '/api/people/schedule/[id]': 'ação sobre o próprio aviso; regra no caso de uso',
  '/api/pops/[id]/read': 'confirmação de leitura do POP pelo próprio usuário',
  '/api/tasks/[id]/checklist': 'execução da tarefa do dia pelo responsável',
  '/api/tasks/[id]/complete': 'conclusão da tarefa do dia pelo responsável',
  '/api/tasks/[id]/draft': 'rascunho da tarefa do dia pelo responsável',
  '/api/commands/divergences/[id]': 'tratativa de divergência; regra no caso de uso',
  '/api/higiene': 'PÚBLICA — o QR do banheiro é lido por cliente, sem login',
  '/api/communications/pending': 'os comunicados pendentes do próprio usuário',
  '/api/products/export': 'regra própria (Admin/CEO/Supervisão) na função; handler sem req',
};

/** A regra que vale para um caminho: prefixo mais longo. */
export function regraDaRota(pathname: string): RegraDeRota | null {
  let melhor: { r: RegraDeRota; len: number } | null = null;
  for (const [rota, regra] of Object.entries(REGRAS)) {
    if (pathname === rota || pathname.startsWith(rota + '/')) {
      if (!melhor || rota.length > melhor.len) melhor = { r: regra, len: rota.length };
    }
  }
  return melhor?.r ?? null;
}

/**
 * Guarda genérica: a mesma linha em toda rota. Devolve 403 quando a matriz não
 * permite, e `null` quando pode seguir.
 */
export async function guardaDaRota(role: Role, req: Request): Promise<NextResponse | null> {
  if (isFullAccess(role)) return null;
  const regra = regraDaRota(new URL(req.url).pathname);
  if (!regra) return null;
  const perms = await effectivePermissions(role);
  const p = perms[regra.modulo];
  const ok = regra.exigir === 'ver' ? p?.canView : p?.canEdit;
  if (ok) return null;
  return NextResponse.json({ error: 'Sem permissão', reason: 'FORBIDDEN' }, { status: 403 });
}
