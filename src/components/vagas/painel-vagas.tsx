import { SgoKpi, SgoKpis } from '@/components/sgo/sgo-kpi';
import { BarrasDeParticipacao } from '@/components/shared/leitura-executiva';
import { shortUnitName } from '@/lib/unit-name';
import type { Barra, Painel } from '@/lib/vagas/painel';

const n1 = (v: number | null, sufixo: string) => (v === null ? '—' : `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} ${sufixo}`);
const itens = (bs: Barra[], rotulo: (s: string) => string = (s) => s) => bs.map((b) => ({ rotulo: rotulo(b.rotulo), valor: String(b.n), pct: b.pct }));

/** O PAINEL de vagas (sem estado): cartões, tempos, origem dos candidatos, barras e a tabela por unidade. */
export function PainelDeVagas({ p }: { p: Painel }) {
  return (
    <div className="space-y-4" data-testid="painel-de-vagas">
      <SgoKpis>
        <SgoKpi label="Solicitações" value={p.solicitacoes} meta={`${p.pessoas} pessoa(s)`} testId="painel-solicitacoes" />
        <SgoKpi label="Em aberto" value={p.emAberto} meta={p.urgentes ? `${p.urgentes} urgente(s)` : undefined} />
        <SgoKpi label="Precisam de atenção" value={p.atencao} valueColor={p.atrasadas ? 'var(--sgo-bad)' : p.atencao ? 'var(--sgo-warn)' : undefined} meta={p.atrasadas ? `${p.atrasadas} atrasada(s)` : undefined} />
        <SgoKpi label="Com o supervisor" value={p.comOSupervisor} meta={p.devolvidas ? `+ ${p.devolvidas} devolvida(s)` : undefined} />
        <SgoKpi label="No RH" value={p.noRh} />
        <SgoKpi label="Concluídas" value={p.concluidas} meta={p.canceladas ? `${p.canceladas} cancelada(s)` : undefined} />
      </SgoKpis>

      <section className="sgo-panel sgo-panel--solid grid grid-cols-1 gap-3 p-4 sm:grid-cols-3" data-testid="painel-tempos">
        <div className="rounded-card bg-sunken p-3">
          <p className="text-xs font-semibold text-ink-500">Aprovação do supervisor</p>
          <p className="sgo-type-24 font-bold tabular-nums text-ink-900">{n1(p.aprovacaoMediaH, 'h')}</p>
          <p className="text-xs text-ink-500">{p.aprovacaoNoPrazoPct === null ? 'nenhuma aprovada no período' : `${Math.round(p.aprovacaoNoPrazoPct)}% dentro de 1 dia útil`}</p>
        </div>
        <div className="rounded-card bg-sunken p-3">
          <p className="text-xs font-semibold text-ink-500">No RH até concluir</p>
          <p className="sgo-type-24 font-bold tabular-nums text-ink-900">{n1(p.rhAteConcluirDias, 'dias')}</p>
          <p className="text-xs text-ink-500">da aprovação à contratação concluída</p>
        </div>
        <div className="rounded-card bg-sunken p-3">
          <p className="text-xs font-semibold text-ink-500">Do pedido à contratação</p>
          <p className="sgo-type-24 font-bold tabular-nums text-ink-900">{n1(p.pedidoAteContratacaoDias, 'dias')}</p>
          <p className="text-xs text-ink-500">média das concluídas</p>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <BarrasDeParticipacao titulo="Origem dos candidatos" itens={itens(p.origem)} vazio="Nenhuma solicitação no período." />
        <BarrasDeParticipacao titulo="Quem trouxe o candidato aprovado" itens={itens(p.quemTrouxeOAprovado)} vazio="Nenhum candidato aprovado no período." />
        <BarrasDeParticipacao titulo="Em aberto, por etapa" itens={itens(p.porEtapa)} vazio="Nenhuma vaga em aberto." />
        <BarrasDeParticipacao titulo="Currículos por situação" itens={itens(p.curriculosPorSituacao)} vazio="Nenhum currículo no período." />
        <BarrasDeParticipacao titulo="Pessoas por motivo" itens={itens(p.pessoasPorMotivo)} vazio="Nenhuma pessoa pedida no período." />
        <BarrasDeParticipacao titulo="Pessoas por cargo" itens={itens(p.pessoasPorCargo)} vazio="Nenhuma pessoa pedida no período." />
      </div>

      {p.porUnidade.length > 0 && (
        <section className="sgo-panel sgo-panel--solid overflow-hidden" data-testid="painel-por-unidade">
          <p className="sgo-panel__title px-4 pt-3">Por unidade</p>
          <div className="overflow-x-auto">
            <table className="sgo-tbl w-full text-sm">
              <thead>
                <tr>
                  <th className="text-left">Unidade</th><th className="text-right">Solicitações</th><th className="text-right">Pessoas</th><th className="text-right">Em aberto</th>
                  <th className="text-right">Atenção</th><th className="text-right">Concluídas</th><th className="text-right">Canceladas</th><th className="text-right">Sem currículo</th><th className="text-right">Aprovação média</th>
                </tr>
              </thead>
              <tbody>
                {p.porUnidade.map((u) => (
                  <tr key={u.unitId}>
                    <td className="font-semibold text-ink-900">{shortUnitName(u.unidade)}</td>
                    <td className="text-right tabular-nums">{u.solicitacoes}</td>
                    <td className="text-right tabular-nums">{u.pessoas}</td>
                    <td className="text-right tabular-nums">{u.emAberto}</td>
                    <td className={`text-right tabular-nums ${u.atencao ? 'font-semibold text-warning' : ''}`}>{u.atencao}</td>
                    <td className="text-right tabular-nums">{u.concluidas}</td>
                    <td className="text-right tabular-nums">{u.canceladas}</td>
                    <td className="text-right tabular-nums">{Math.round(u.semCurriculoPct)}%</td>
                    <td className="text-right tabular-nums">{n1(u.aprovacaoMediaH, 'h')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
