import { AlertTriangle, Layers } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { StatCard } from '@/components/ui/ds/stat-card';
import { StatusBadge } from '@/components/ui/ds/status-badge';
import { Banner } from '@/components/ui/ds/banner';
import { EmptyState } from '@/components/ui/ds/empty-state';
import { emBR } from '@/lib/pizzas/tipos';
import { ROTULO_SITUACAO, rotuloDaFaixa, type FaixaDeValidade, type SituacaoDoDia } from '@/lib/pizzas/massas-tipos';
import type { PainelDeMassas } from '@/lib/pizzas/massas';
import { MassasGestao } from '@/components/pizzas/massas-gestao';

/**
 * Aba MASSAS do Controle de Pizzas — indicadores, histórico diário, lotes e o
 * histórico de alterações. Todo número sai do motor puro (`massas-calculo.ts`),
 * o mesmo que o link usa: painel e operação nunca discordam.
 */

const TOM_SITUACAO: Record<SituacaoDoDia, 'neutral' | 'success' | 'warning' | 'danger'> = {
  SEM_CONTAGEM: 'neutral', CONFERIDO: 'success', DIVERGENTE: 'danger', RETROATIVO: 'warning',
};
const TOM_FAIXA: Record<FaixaDeValidade, 'danger' | 'warning' | 'neutral'> = {
  VENCIDO: 'danger', VENCE_HOJE: 'danger', PROXIMO: 'warning', OK: 'neutral',
};

export function MassasPainel({ painel, unitId, hoje, dias, podeCorrigir }: { painel: PainelDeMassas; unitId: string; hoje: string; dias: number; podeCorrigir: boolean }) {
  const r = painel.resumo;
  const vencidos = painel.lotes.lotes.filter((l) => l.faixa === 'VENCIDO');
  const vencendo = painel.lotes.lotes.filter((l) => l.faixa === 'VENCE_HOJE' || l.faixa === 'PROXIMO');

  return (
    <div className="space-y-4">
      {vencidos.length > 0 && (
        <Banner
          tone="danger"
          title={`${vencidos.reduce((s, l) => s + l.disponivel, 0)} massa(s) em lote VENCIDO ainda constam na câmara`}
          description="Se foram descartadas, registre o desperdício por validade apontando o lote; se não, o estoque está superestimado."
        />
      )}
      {vencendo.length > 0 && (
        <Banner
          tone="warning"
          title={`${vencendo.length} lote(s) vencendo em até 2 dias`}
          description={vencendo.map((l) => `${l.disponivel} massas · ${rotuloDaFaixa(l.faixa, l.diasRestantes).toLowerCase()} (${emBR(l.validade)})`).join(' · ')}
        />
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Estoque atual de massas" value={r.estoqueAtual} hint="Contagem de hoje, ou o esperado" />
        <StatCard label={`Recebidas em ${dias} dias`} value={r.recebidas} />
        <StatCard label="Utilizadas nas pizzas" value={r.utilizadas} hint="1 pizza = 1 massa" />
        <StatCard label="Total desperdiçado" value={r.desperdicadas} tone={r.desperdicadas > 0 ? 'warning' : 'default'} />
        <StatCard label="% de desperdício" value={`${r.pctDesperdicio.toLocaleString('pt-BR')}%`} hint="sobre o que saiu da câmara" tone={r.pctDesperdicio >= 5 ? 'danger' : 'default'} />
        <StatCard label="Perdas por validade" value={r.perdaValidade} tone={r.perdaValidade > 0 ? 'danger' : 'default'} />
        <StatCard label="Perdas de produção" value={r.perdaProducao} tone={r.perdaProducao > 0 ? 'warning' : 'default'} />
        <StatCard label="Divergências de estoque" value={r.divergencias} hint={`em ${r.diasContados} dia(s) contado(s)`} tone={r.divergencias > 0 ? 'danger' : 'success'} />
        <StatCard label="Lotes próximos do vencimento" value={r.lotesProximosDoVencimento} tone={r.lotesProximosDoVencimento > 0 ? 'warning' : 'default'} />
        <StatCard label="Sem lote identificado" value={painel.lotes.semLote} hint="contadas além dos recebimentos" />
      </div>

      <Card>
        <CardContent className="pt-4">
          <p className="sgo-type-11 mb-2 font-semibold text-ink-900">Lotes na câmara</p>
          <p className="mb-2 text-xs text-ink-500">Saldo por lote é ESTIMADO: o sistema sabe quantas saíram, não de qual lote — assume que a validade mais antiga sai primeiro. O descarte por validade abate o lote apontado.</p>
          {painel.lotes.lotes.length === 0 ? (
            <p className="text-sm text-ink-500">Nenhum lote com saldo.</p>
          ) : (
            <div className="divide-y divide-line">
              {painel.lotes.lotes.map((l) => (
                <div key={l.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <span className="min-w-0 text-ink-700">
                    <b className="tabular-nums text-ink-900">{l.disponivel}</b> de {l.quantidade} · recebido {emBR(l.recebidoEm)} · vence <b className="text-ink-900">{emBR(l.validade)}</b>{l.lotCode ? ` · ${l.lotCode}` : ''}
                  </span>
                  <StatusBadge tone={TOM_FAIXA[l.faixa]} dot={l.faixa !== 'OK'}>{rotuloDaFaixa(l.faixa, l.diasRestantes)}</StatusBadge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4">
          <p className="sgo-type-11 mb-2 font-semibold text-ink-900">Histórico diário</p>
          <p className="mb-2 text-xs text-ink-500">Inicial + entradas − pizzas − desperdícios = esperado × físico. O esperado é recalculado sempre; a contagem física nunca é alterada pelo recálculo.</p>
          {painel.dias.length === 0 ? (
            <EmptyState icon={Layers} title="Nenhum movimento de massas no período" description="Recebimentos, desperdícios e fechamentos feitos pelo link aparecem aqui." size="sm" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-ink-500">
                    <th className="py-1 pr-2 font-semibold">Dia</th>
                    <th className="py-1 pr-2 text-right font-semibold">Inicial</th>
                    <th className="py-1 pr-2 text-right font-semibold">+ Entradas</th>
                    <th className="py-1 pr-2 text-right font-semibold">− Pizzas</th>
                    <th className="py-1 pr-2 text-right font-semibold">− Desp.</th>
                    <th className="py-1 pr-2 text-right font-semibold">= Esperado</th>
                    <th className="py-1 pr-2 text-right font-semibold">Físico</th>
                    <th className="py-1 font-semibold">Situação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {painel.dias.map((d) => (
                    <tr key={d.data}>
                      <td className="py-1.5 pr-2 whitespace-nowrap text-ink-700">{emBR(d.data)}{d.data === hoje && <span className="ml-1 text-xs text-brand">hoje</span>}</td>
                      <td className="py-1.5 pr-2 text-right tabular-nums text-ink-700">{d.inicial}</td>
                      <td className="py-1.5 pr-2 text-right tabular-nums text-ink-700">{d.recebidas || '–'}</td>
                      <td className="py-1.5 pr-2 text-right tabular-nums text-ink-700">{d.vendidas || '–'}</td>
                      <td className="py-1.5 pr-2 text-right tabular-nums text-ink-700">
                        {d.desperdicadas || '–'}
                        {d.desperdicadas > 0 && <span className="block text-[10px] text-ink-500">val. {d.perdaValidade} · prod. {d.perdaProducao}</span>}
                      </td>
                      <td className="py-1.5 pr-2 text-right font-semibold tabular-nums text-ink-900">{d.esperado}</td>
                      <td className="py-1.5 pr-2 text-right tabular-nums text-ink-900">
                        {d.fisico ?? '–'}
                        {d.divergencia !== null && d.divergencia !== 0 && <span className="block text-[10px] text-danger">{d.divergencia > 0 ? '+' : ''}{d.divergencia}</span>}
                      </td>
                      <td className="py-1.5">
                        <StatusBadge tone={TOM_SITUACAO[d.situacao]} dot={d.situacao !== 'SEM_CONTAGEM'}>
                          {d.situacao === 'RETROATIVO' && <AlertTriangle className="h-3 w-3" aria-hidden />}
                          {ROTULO_SITUACAO[d.situacao]}
                        </StatusBadge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {podeCorrigir && (
        <Card>
          <CardContent className="pt-4">
            <p className="sgo-type-11 mb-1 font-semibold text-ink-900">Consultar e corrigir lançamentos</p>
            <p className="mb-3 text-xs text-ink-500">A mesma tela do link. Correção de dia anterior pede o motivo e recalcula os dias seguintes — a contagem física já feita não muda; se deixar de bater, o dia é sinalizado como divergência gerada por alteração retroativa.</p>
            <MassasGestao unitId={unitId} hoje={hoje} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="pt-4">
          <p className="sgo-type-11 mb-2 font-semibold text-ink-900">Histórico de alterações</p>
          {painel.alteracoes.length === 0 ? (
            <p className="text-sm text-ink-500">Nenhuma alteração no período.</p>
          ) : (
            <div className="divide-y divide-line">
              {painel.alteracoes.map((a) => (
                <div key={a.id} className="py-2 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-ink-900">{a.antes === null ? 'Lançado' : a.depois === null ? 'Excluído' : 'Alterado'} · {rotuloEntidade(a.entidade)}</span>
                    <span className="text-xs text-ink-500">dia {emBR(a.data)} · por {a.por} · {new Date(a.em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span>
                    {a.retroativa && <StatusBadge tone="warning">Retroativa</StatusBadge>}
                  </div>
                  <p className="text-xs text-ink-700">
                    {a.antes !== null && <>Original: <code className="text-ink-500">{resumo(a.antes)}</code>{' → '}</>}
                    {a.depois !== null
                      ? <>{a.antes === null ? 'Lançado' : 'Corrigido'}: <code className="text-ink-900">{resumo(a.depois)}</code></>
                      : <span className="text-danger">removido</span>}
                  </p>
                  {a.motivo && <p className="text-xs text-ink-500">Motivo: {a.motivo}</p>}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function rotuloEntidade(e: string): string {
  return e === 'recebimento' ? 'recebimento' : e === 'desperdicio' ? 'desperdício' : 'contagem física';
}

function resumo(v: unknown): string {
  if (!v || typeof v !== 'object') return String(v ?? '');
  return Object.entries(v as Record<string, unknown>)
    .filter(([, x]) => x !== null && x !== undefined && x !== '')
    .map(([k, x]) => `${k} ${typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) ? emBR(x) : String(x)}`)
    .join(' · ');
}
