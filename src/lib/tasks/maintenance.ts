import { prisma } from '@/lib/db/prisma';
import { currentOperationalDate } from '@/lib/date/operational';
import { generateDailyTasksForUnit } from '@/lib/tasks/generate';
import { subDays, format } from 'date-fns';

/**
 * Marca como "Não realizada" (MISSED) toda tarefa PENDENTE de um dia operacional
 * já encerrado (passou da hora de corte — regra do Módulo 1). MISSED entra na meta.
 *
 * Idempotente e seguro para rodar por job agendado a cada hora de corte.
 */
export async function markMissedTasks(now: Date = new Date()): Promise<number> {
  const units = await prisma.unit.findMany({ where: { active: true } });
  let total = 0;

  for (const u of units) {
    const current = currentOperationalDate({ timezone: u.timezone, cutoffHour: u.cutoffHour }, now);
    const res = await prisma.taskInstance.updateMany({
      where: { unitId: u.id, status: 'PENDING', operationalDate: { lt: current } },
      data: { status: 'MISSED' },
    });
    total += res.count;
  }

  return total;
}

/**
 * Quantos dias para trás garantimos a existência das instâncias (backfill).
 * = 1 (somente o dia operacional atual). Como a geração é idempotente, qualquer
 * janela maior RECRIARIA execuções que o Admin excluiu do histórico (era o bug
 * "checklists do dia anterior voltam após excluir"). O servidor roda contínuo e
 * gera o dia atual a cada ~10-30 min, então 1 dia basta.
 */
const BACKFILL_DAYS = 1;

/** Intervalo mínimo entre execuções da manutenção (evita custo por request). */
const MAINTENANCE_INTERVAL_MS = 10 * 60 * 1000;

let lastMaintenanceAt = 0;
let maintenanceRunning = false;

/**
 * Manutenção automática das tarefas (corrige o bug "dias sem acesso somem da
 * meta" e "PENDING para sempre"):
 *  1. Gera instâncias dos últimos BACKFILL_DAYS dias operacionais de cada
 *     unidade (idempotente — constraint única + skipDuplicates), cobrindo dias
 *     em que ninguém abriu o sistema.
 *  2. Marca como MISSED tudo que ficou pendente em dias já encerrados.
 *
 * Com throttle: roda no máximo a cada 10 min (chamada nos carregamentos do
 * dashboard/tarefas e pelo scheduler do servidor). `force` ignora o throttle.
 */
export async function ensureTaskMaintenance(force = false, now: Date = new Date()): Promise<void> {
  if (maintenanceRunning) return;
  if (!force && Date.now() - lastMaintenanceAt < MAINTENANCE_INTERVAL_MS) return;
  maintenanceRunning = true;
  try {
    const units = await prisma.unit.findMany({ where: { active: true } });
    for (const u of units) {
      const cfg = { timezone: u.timezone, cutoffHour: u.cutoffHour };
      const today = currentOperationalDate(cfg, now);
      const base = new Date(`${today}T12:00:00`);
      for (let d = 0; d < BACKFILL_DAYS; d++) {
        const opDate = format(subDays(base, d), 'yyyy-MM-dd');
        await generateDailyTasksForUnit(u, opDate);
      }
    }
    await markMissedTasks(now);
    lastMaintenanceAt = Date.now();
  } catch (err) {
    console.error('[tasks] manutenção automática falhou:', err);
  } finally {
    maintenanceRunning = false;
  }
}
