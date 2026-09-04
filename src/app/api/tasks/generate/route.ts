import { NextResponse } from 'next/server';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { getSessionUser } from '@/lib/auth/session';
import { generateTodayForAllUnits } from '@/lib/tasks/generate';
import { markMissedTasks } from '@/lib/tasks/maintenance';
import { audit } from '@/lib/audit';
import { requestContext } from '@/lib/auth/service';

/**
 * Geração das tarefas do dia + marcação de "não realizadas".
 * Restrito a ADMIN/CEO. Substituirá o job/cron até a Fase de infra de agendamento.
 */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const negado = await guardaDaRota(user.role, req);
  if (negado) return negado;
  if (user.role !== 'ADMIN' && user.role !== 'CEO') {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
  }

  const missed = await markMissedTasks();
  const created = await generateTodayForAllUnits();

  await audit({
    userId: user.id,
    action: 'GENERATE_TASKS',
    module: 'TASKS',
    metadata: { created, missed },
    ...requestContext(req),
  });

  return NextResponse.json({ created, missed });
}
