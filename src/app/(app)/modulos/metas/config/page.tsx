import Link from 'next/link';
import { ArrowLeft, History, ShieldAlert } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { linhasPorModulo, resumirPorModulo, type StatusDoComponente } from '@/lib/metas/por-modulo';
import { carregarConfigDaMeta, correcoesDaSupervisao, historicoDeConfiguracoes, mesAtual } from '@/lib/metas/vigencia';
import { COMPONENTES_DA_META } from '@/lib/metas/vigencia-regras';
import { MODULES } from '@/lib/permissions';
import { AREAS } from '@/lib/nav/areas';
import { SgoKpi, SgoKpis } from '@/components/sgo/sgo-kpi';
import { Card, PanelHeader } from '@/components/sgo/panel';
import { MetaPorModuloClient } from '@/components/metas/meta-por-modulo-client';
import { HistoricoDeConfiguracoes, CorrecoesDaSupervisao } from '@/components/metas/historico-config';
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
 *
 * v1.180.0: os valores mostrados são os VIGENTES NO MÊS CORRENTE (uma leitura
 * só, `carregarConfigDaMeta`); cada componente tem STATUS independente do peso;
 * e a tela ganhou o histórico das alterações (quem, quando, de → para,
 * vigência, motivo) e as correções de data da supervisão do mês.
 */
export default async function MetaConfigPage() {
  const user = (await getSessionUser())!;
  if (!['ADMIN', 'SUPERVISOR', 'CEO'].includes(user.role)) {
    return <p className="text-sm text-ink-500">Restrito à Supervisão/Administração.</p>;
  }
  const ym = mesAtual();
  const [vig, historico, correcoes] = await Promise.all([carregarConfigDaMeta(ym), historicoDeConfiguracoes(), correcoesDaSupervisao(ym)]);

  const valores: Record<string, number> = {
    tasksMeta: vig.peso('TASKS'), wasteMeta: vig.peso('WASTE'), commandsMeta: vig.peso('COMMANDS'), communication: vig.peso('COMMUNICATION'),
    training: vig.peso('TRAINING'), evaluation: vig.peso('PEOPLE_EVALUATION'), lateEntry: vig.descontoForaDoPrazo, managerLeaveMeta: vig.descontoEscalaGerentes,
    cashMeta: vig.peso('CASH'), scheduleMeta: vig.peso('SCHEDULE'), cancellationsMeta: vig.peso('CANCELLATIONS'), stockMeta: vig.peso('STOCK'),
    inventoryMeta: vig.peso('INVENTORY'), utensilsMeta: vig.peso('UTENSILS'),
  };
  const status: Record<string, StatusDoComponente> = Object.fromEntries(COMPONENTES_DA_META.map((c) => [c.key, vig.status(c.key)]));
  const grupos = linhasPorModulo(MODULES, AREAS, valores, status);
  const resumo = resumirPorModulo(grupos);
  const futuras = historico.filter((h) => h.futura);

  return (
    <div className="space-y-4">
      <Link href="/modulos/metas" className="inline-flex items-center gap-1 text-sm font-semibold text-brand"><ArrowLeft className="h-4 w-4" /> Metas</Link>
      <div>
        <LargeTitle
          title="Configuração da Meta"
          subtitle="Tudo que conta na meta do gerente, módulo por módulo. Cada componente tem um STATUS (só Ativo entra na nota) e um peso; toda alteração pede motivo e vale a partir de um mês — meses encerrados não mudam."
        />
      </div>
      <SgoKpis>
        <SgoKpi label="Módulos do sistema" value={String(resumo.modulos)} meta="listados nesta tela" />
        <SgoKpi label="Com indicador" value={String(resumo.comIndicador)} meta="o SGO mede e pode cobrar" />
        <SgoKpi label="Contando na meta" value={String(resumo.ligados)} meta="status Ativo e peso/desconto acima de 0" metaTone="up" />
        <SgoKpi label="Em observação" value={String(resumo.emObservacao)} meta="homologação ou monitoramento: medidos, fora da nota" />
      </SgoKpis>
      <p className="text-xs text-ink-500">
        Status e peso são independentes: o peso diz quanto o componente vale, o status diz se ele entra na bonificação. Um módulo em
        homologação ou monitoramento aparece na composição da unidade como &quot;em observação&quot;, com o % medido (e, em homologação, a nota
        que a unidade teria se contasse) — sem mudar a nota de ninguém. Componente com peso 0, ou sem nada a fazer no mês, fica fora da conta daquele mês.
        {futuras.length > 0 && <> <b>{futuras.length} alteração(ões) agendada(s)</b> para meses futuros — veja o histórico abaixo.</>}
      </p>
      <MetaPorModuloClient grupos={grupos} canEdit={user.role === 'ADMIN'} mesAtual={ym} />

      <Card>
        <PanelHeader title="Histórico de configurações" count={historico.length} icon={<span className="sgo-panel__ic sgo-panel__ic--blue" aria-hidden><History className="h-4 w-4" /></span>} />
        <div className="overflow-x-auto p-2">
          <HistoricoDeConfiguracoes linhas={historico} />
        </div>
        <p className="px-4 pb-3 text-xs text-ink-500">Cada gravação de peso, status ou desconto: quem, quando, de → para, a partir de que mês e o motivo. A nota de um mês usa os valores vigentes naquele mês.</p>
      </Card>

      <Card>
        <PanelHeader title="Correções da supervisão no mês" count={correcoes.length} icon={<span className="sgo-panel__ic sgo-panel__ic--amber" aria-hidden><ShieldAlert className="h-4 w-4" /></span>} />
        <div className="overflow-x-auto p-2">
          <CorrecoesDaSupervisao linhas={correcoes} />
        </div>
        <p className="px-4 pb-3 text-xs text-ink-500">Datas de lançamento corrigidas por Admin/Supervisor em Pagamentos, Notas, Gás e Óleo — cada uma desconta &quot;Fora do prazo&quot; na meta da unidade.</p>
      </Card>
    </div>
  );
}
