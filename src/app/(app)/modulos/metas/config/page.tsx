import Link from 'next/link';
import { ArrowLeft, LayoutGrid, SlidersHorizontal } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { getTrainingWeight } from '@/lib/training';
import { getCommunicationWeight } from '@/lib/communications/meta';
import { getEvaluationWeight } from '@/lib/people/evaluation';
import { getLateEntryPenaltyPct } from '@/lib/late-entry';
import { getWasteMetaWeight, getCommandsMetaWeight, getManagerLeaveMetaPenalty } from '@/lib/metas/config';
import { linhasPorModulo, resumirPorModulo } from '@/lib/metas/por-modulo';
import { MODULES } from '@/lib/permissions';
import { AREAS } from '@/lib/nav/areas';
import { Card, CardContent } from '@/components/ui/card';
import { SgoKpi, SgoKpis } from '@/components/sgo/sgo-kpi';
import { MetaConfigClient, type MetaComponentUI } from '@/components/metas/meta-config-client';
import { MetaPorModuloClient } from '@/components/metas/meta-por-modulo-client';
import { LargeTitle } from '@/components/layout/page-chrome';

export const dynamic = 'force-dynamic';

/**
 * Central de configuração da Meta (16/07) — Admin edita, Supervisor visualiza.
 *
 * Duas abas sobre a MESMA configuração (v1.170.0): "Componentes" (a de sempre,
 * por tipo de conta) e "Por módulo" (todos os módulos do sistema, com o
 * indicador que a meta mede em cada um — ou "sem indicador"). As duas gravam as
 * mesmas chaves; nenhuma é uma segunda conta.
 */
export default async function MetaConfigPage({ searchParams }: { searchParams: { aba?: string } }) {
  const user = (await getSessionUser())!;
  if (!['ADMIN', 'SUPERVISOR', 'CEO'].includes(user.role)) {
    return <p className="text-sm text-ink-500">Restrito à Supervisão/Administração.</p>;
  }
  const [training, communication, evaluation, penalty, waste, commands, managerLeave] = await Promise.all([
    getTrainingWeight(), getCommunicationWeight(), getEvaluationWeight(), getLateEntryPenaltyPct(), getWasteMetaWeight(), getCommandsMetaWeight(), getManagerLeaveMetaPenalty(),
  ]);

  const aba = searchParams.aba === 'modulos' ? 'modulos' : 'componentes';
  const tabs = [
    { label: 'Componentes', icon: <SlidersHorizontal className="h-3.5 w-3.5" />, href: '/modulos/metas/config', active: aba === 'componentes', testId: 'aba-componentes' },
    { label: 'Por módulo', icon: <LayoutGrid className="h-3.5 w-3.5" />, href: '/modulos/metas/config?aba=modulos', active: aba === 'modulos', testId: 'aba-modulos' },
  ];

  const components: MetaComponentUI[] = [
    { key: '', name: 'Checklists do dia', kind: 'CHECKLISTS', weight: 0, hint: 'Realizadas no prazo pontuam; não realizadas penalizam. Peso individual por checklist.' },
    { key: 'wasteMeta', name: 'Desperdício diário', kind: 'DIARIO', weight: waste, hint: 'Dias com lançamento ÷ dias decorridos do mês.' },
    { key: 'commandsMeta', name: 'Comandas diárias', kind: 'DIARIO', weight: commands, hint: 'Dias com conferência ÷ dias decorridos do mês.' },
    { key: 'communication', name: 'Comunicados', kind: 'DIARIO', weight: communication, hint: 'Confirmação de leitura no prazo pontua; vencido penaliza.' },
    { key: 'training', name: 'Treinamentos (POPs)', kind: 'GESTAO', weight: training, hint: 'Treinamentos da equipe concluídos no prazo.' },
    { key: 'evaluation', name: 'Avaliações da equipe', kind: 'GESTAO', weight: evaluation, hint: 'Avaliação mensal dos colaboradores (mês fechado sem avaliação penaliza).' },
    { key: 'lateEntry', name: 'Fora do prazo (Notas, Pagamentos, Gás, Óleo)', kind: 'PENALIDADE', weight: penalty, hint: 'Desconto por cada data corrigida OU nota lançada pela supervisão.' },
    { key: 'managerLeaveMeta', name: 'Escala de gerentes — sem folga cadastrada', kind: 'PENALIDADE', weight: managerLeave, hint: 'Desconto por cada gerente/coordenador da unidade sem folga nem férias lançada no mês.' },
  ];

  const grupos = linhasPorModulo(MODULES, AREAS, {
    wasteMeta: waste, commandsMeta: commands, communication, training, evaluation, lateEntry: penalty, managerLeaveMeta: managerLeave,
  });
  const resumo = resumirPorModulo(grupos);

  return (
    <div className="space-y-4">
      <Link href="/modulos/metas" className="inline-flex items-center gap-1 text-sm font-semibold text-brand"><ArrowLeft className="h-4 w-4" /> Metas</Link>
      <div>
        <LargeTitle
          title="Configuração da Meta"
          subtitle="Tudo que pode contar na meta do gerente, num lugar só. Pesos novos nascem em 0 (desligados) — ligue quando a equipe estiver pronta."
          tabs={tabs}
        />
      </div>
      {aba === 'modulos' ? (
        <>
          <SgoKpis>
            <SgoKpi label="Módulos do sistema" value={String(resumo.modulos)} meta="listados nesta aba" />
            <SgoKpi label="Com indicador" value={String(resumo.comIndicador)} meta="o SGO mede e pode cobrar" />
            <SgoKpi label="Contando na meta" value={String(resumo.ligados)} meta="peso ou desconto acima de 0" metaTone="up" />
            <SgoKpi label="Sem indicador" value={String(resumo.semIndicador)} meta="aparecem para a diretoria saber o que falta" />
          </SgoKpis>
          <p className="text-xs text-ink-500">
            O peso só pode ser ligado onde existe um indicador implementado — um peso gravado num módulo que ninguém mede não
            mudaria a nota de ninguém. Para pôr um módulo novo na meta, o SGO precisa primeiro medi-lo.
          </p>
          <MetaPorModuloClient grupos={grupos} canEdit={user.role === 'ADMIN'} />
        </>
      ) : (
        <Card><CardContent className="pt-4">
          <MetaConfigClient components={components} canEdit={user.role === 'ADMIN'} />
        </CardContent></Card>
      )}
    </div>
  );
}
