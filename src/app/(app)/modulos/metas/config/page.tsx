import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { getTrainingWeight } from '@/lib/training';
import { getCommunicationWeight } from '@/lib/communications/meta';
import { getEvaluationWeight } from '@/lib/people/evaluation';
import { getLateEntryPenaltyPct } from '@/lib/late-entry';
import {
  getWasteMetaWeight, getCommandsMetaWeight, getManagerLeaveMetaPenalty, getTasksMetaWeight,
  getCashMetaWeight, getScheduleMetaWeight, getCancellationsMetaWeight, getStockMetaWeight, getInventoryMetaWeight,
} from '@/lib/metas/config';
import { linhasPorModulo, resumirPorModulo } from '@/lib/metas/por-modulo';
import { MODULES } from '@/lib/permissions';
import { AREAS } from '@/lib/nav/areas';
import { SgoKpi, SgoKpis } from '@/components/sgo/sgo-kpi';
import { MetaPorModuloClient } from '@/components/metas/meta-por-modulo-client';
import { LargeTitle } from '@/components/layout/page-chrome';

export const dynamic = 'force-dynamic';

/**
 * Central de configuração da Meta (16/07) — Admin edita, Supervisor visualiza.
 *
 * Desde a v1.174.0 é UMA tela só, por módulo: todos os módulos do sistema, com
 * o indicador que a meta mede em cada um (ou "sem indicador") e o peso/desconto
 * editável ali. A aba "Componentes" saiu — era a mesma configuração vista de
 * outro jeito, e duas telas para a mesma coisa é como uma envelhece sozinha.
 * Os checklists do dia têm um peso ÚNICO (nasce em 100); o peso individual por
 * checklist deixou de existir.
 */
export default async function MetaConfigPage() {
  const user = (await getSessionUser())!;
  if (!['ADMIN', 'SUPERVISOR', 'CEO'].includes(user.role)) {
    return <p className="text-sm text-ink-500">Restrito à Supervisão/Administração.</p>;
  }
  const [training, communication, evaluation, penalty, waste, commands, managerLeave, tasks, cash, schedule, cancellations, stock, inventory] = await Promise.all([
    getTrainingWeight(), getCommunicationWeight(), getEvaluationWeight(), getLateEntryPenaltyPct(), getWasteMetaWeight(), getCommandsMetaWeight(), getManagerLeaveMetaPenalty(),
    getTasksMetaWeight(), getCashMetaWeight(), getScheduleMetaWeight(), getCancellationsMetaWeight(), getStockMetaWeight(), getInventoryMetaWeight(),
  ]);

  const grupos = linhasPorModulo(MODULES, AREAS, {
    tasksMeta: tasks, wasteMeta: waste, commandsMeta: commands, communication, training, evaluation, lateEntry: penalty, managerLeaveMeta: managerLeave,
    cashMeta: cash, scheduleMeta: schedule, cancellationsMeta: cancellations, stockMeta: stock, inventoryMeta: inventory,
  });
  const resumo = resumirPorModulo(grupos);

  return (
    <div className="space-y-4">
      <Link href="/modulos/metas" className="inline-flex items-center gap-1 text-sm font-semibold text-brand"><ArrowLeft className="h-4 w-4" /> Metas</Link>
      <div>
        <LargeTitle
          title="Configuração da Meta"
          subtitle="Tudo que conta na meta do gerente, módulo por módulo. Pesos novos nascem em 0 (desligados) — ligue quando a equipe estiver pronta; os checklists do dia nascem com peso 100."
        />
      </div>
      <SgoKpis>
        <SgoKpi label="Módulos do sistema" value={String(resumo.modulos)} meta="listados nesta tela" />
        <SgoKpi label="Com indicador" value={String(resumo.comIndicador)} meta="o SGO mede e pode cobrar" />
        <SgoKpi label="Contando na meta" value={String(resumo.ligados)} meta="peso ou desconto acima de 0" metaTone="up" />
        <SgoKpi label="Sem indicador" value={String(resumo.semIndicador)} meta="não dependem do gerente, ou ainda não são medidos" />
      </SgoKpis>
      <p className="text-xs text-ink-500">
        O peso só pode ser ligado onde existe um indicador implementado — um peso gravado num módulo que ninguém mede não
        mudaria a nota de ninguém. Componente com peso 0, ou sem nada a fazer no mês (mês sem cancelamento, sem lote em faixa,
        sem agendamento), fica fora da conta daquele mês.
      </p>
      <MetaPorModuloClient grupos={grupos} canEdit={user.role === 'ADMIN'} />
    </div>
  );
}
