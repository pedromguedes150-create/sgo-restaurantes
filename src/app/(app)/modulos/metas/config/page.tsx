import Link from 'next/link';
import { ArrowLeft, SlidersHorizontal } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { getTrainingWeight } from '@/lib/training';
import { getCommunicationWeight } from '@/lib/communications/meta';
import { getEvaluationWeight } from '@/lib/people/evaluation';
import { getLateEntryPenaltyPct } from '@/lib/late-entry';
import { getWasteMetaWeight, getCommandsMetaWeight } from '@/lib/metas/config';
import { Card, CardContent } from '@/components/ui/card';
import { MetaConfigClient, type MetaComponentUI } from '@/components/metas/meta-config-client';

export const dynamic = 'force-dynamic';

/** Central de configuração da Meta (16/07) — Admin edita, Supervisor visualiza. */
export default async function MetaConfigPage() {
  const user = (await getSessionUser())!;
  if (!['ADMIN', 'SUPERVISOR', 'CEO'].includes(user.role)) {
    return <p className="text-sm text-muted-foreground">Restrito à Supervisão/Administração.</p>;
  }
  const [training, communication, evaluation, penalty, waste, commands] = await Promise.all([
    getTrainingWeight(), getCommunicationWeight(), getEvaluationWeight(), getLateEntryPenaltyPct(), getWasteMetaWeight(), getCommandsMetaWeight(),
  ]);

  const components: MetaComponentUI[] = [
    { key: '', name: 'Checklists do dia', kind: 'CHECKLISTS', weight: 0, hint: 'Realizadas no prazo pontuam; não realizadas penalizam. Peso individual por checklist.' },
    { key: 'wasteMeta', name: 'Desperdício diário', kind: 'DIARIO', weight: waste, hint: 'Dias com lançamento ÷ dias decorridos do mês.' },
    { key: 'commandsMeta', name: 'Comandas diárias', kind: 'DIARIO', weight: commands, hint: 'Dias com conferência ÷ dias decorridos do mês.' },
    { key: 'communication', name: 'Comunicados', kind: 'DIARIO', weight: communication, hint: 'Confirmação de leitura no prazo pontua; vencido penaliza.' },
    { key: 'training', name: 'Treinamentos (POPs)', kind: 'GESTAO', weight: training, hint: 'Treinamentos da equipe concluídos no prazo.' },
    { key: 'evaluation', name: 'Avaliações da equipe', kind: 'GESTAO', weight: evaluation, hint: 'Avaliação mensal dos colaboradores (mês fechado sem avaliação penaliza).' },
    { key: 'lateEntry', name: 'Fora do prazo (Notas, Pagamentos, Gás, Óleo)', kind: 'PENALIDADE', weight: penalty, hint: 'Desconto por cada data corrigida OU nota lançada pela supervisão.' },
  ];

  return (
    <div className="space-y-4">
      <Link href="/modulos/metas" className="inline-flex items-center gap-1 text-sm font-semibold text-accent"><ArrowLeft className="h-4 w-4" /> Metas</Link>
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-brand"><SlidersHorizontal className="h-5 w-5 text-accent" /> Configuração da Meta</h1>
        <p className="text-sm text-muted-foreground">Tudo que pode contar na meta do gerente, num lugar só. Pesos novos nascem em 0 (desligados) — ligue quando a equipe estiver pronta.</p>
      </div>
      <Card><CardContent className="pt-4">
        <MetaConfigClient components={components} canEdit={user.role === 'ADMIN'} />
      </CardContent></Card>
    </div>
  );
}
