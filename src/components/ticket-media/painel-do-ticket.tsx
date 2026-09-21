'use client';

import Link from 'next/link';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { AlertTriangle, Upload } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { StatCard } from '@/components/ui/ds/stat-card';
import { Select } from '@/components/ui/ds/select';
import { Banner } from '@/components/ui/ds/banner';
import { EmptyState } from '@/components/ui/ds/empty-state';
import { Table, type Column } from '@/components/ui/ds/table';
import {
  emNumero, emPercentual, emReal, rotuloDaCompetencia, type Competencia,
} from '@/lib/ticket-media/calculo';
import type { LinhaDaUnidade, PainelDoTicket } from '@/lib/ticket-media/query';

/**
 * A tela do Ticket Médio.
 *
 * A ordem responde à pergunta do coordenador na ordem em que ele a faz: o mês
 * está fechado? → quanto deu? → quem puxou para cima ou para baixo? → como foi
 * a evolução. O status vem ANTES dos números de propósito: ler "R$ 58,05" sem
 * saber que falta uma unidade é ler um número que vai mudar.
 */

export function PainelDoTicketClient({
  painel,
  unidades,
  unitId,
  podeImportar,
  competencia,
}: {
  painel: PainelDoTicket;
  /** Só as participantes na competência — CD e lanchonete não aparecem aqui. */
  unidades: { id: string; name: string }[];
  unitId: string | null;
  podeImportar: boolean;
  competencia: Competencia;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const consolidado = !unitId;

  function trocarUnidade(v: string) {
    const p = new URLSearchParams(params.toString());
    if (v === 'consolidado') p.delete('unidade');
    else p.set('unidade', v);
    router.push(`${pathname}?${p.toString()}`, { scroll: false });
  }

  const colunas: Column<LinhaDaUnidade>[] = [
    {
      key: 'unidade', header: 'Unidade',
      cell: (l) => (
        <span className="flex items-center gap-2">
          <span className={l.importado ? 'text-ink-900' : 'text-ink-500'}>{l.name}</span>
          {!l.importado && <span className="sgo-type-11 rounded-pill bg-warning-bg px-1.5 py-0.5 font-semibold text-warning">Pendente</span>}
          {l.substituicoes > 0 && (
            <span className="sgo-type-11 text-ink-400" title={`Importação substituída ${l.substituicoes}×`}>
              substituída {l.substituicoes}×
            </span>
          )}
        </span>
      ),
    },
    { key: 'cupons', header: 'Cupons', numeric: true, cell: (l) => (l.importado ? emNumero(l.coupons) : null) },
    { key: 'venda', header: 'Vr. Venda', numeric: true, hideOnMobile: true, cell: (l) => (l.importado ? emReal(l.grossSales) : null) },
    { key: 'desc', header: 'Vr. Desc.', numeric: true, hideOnMobile: true, cell: (l) => (l.importado ? emReal(l.discounts) : null) },
    { key: 'receita', header: 'Receita', numeric: true, cell: (l) => (l.importado ? emReal(l.receita) : null) },
    {
      key: 'ticket', header: 'Ticket Médio', numeric: true,
      cell: (l) => (l.importado
        ? (
          <span className="inline-flex items-baseline gap-1.5">
            <b className="text-ink-900">{emReal(l.ticket)}</b>
            <Variacao v={l.variacaoTicket} />
          </span>
        )
        : null),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <Select
          label="Unidade"
          className="w-full sm:w-72"
          value={unitId ?? 'consolidado'}
          onValueChange={trocarUnidade}
          options={[
            /* "Consolidado das churrascarias", e NÃO "Toda a Rede": a rede tem
               CD, lanchonete e produtos, que não entram neste indicador. Usar a
               mesma palavra do seletor global faria o número parecer incluir
               tudo. */
            { value: 'consolidado', label: 'Consolidado das churrascarias' },
            ...unidades.map((u) => ({ value: u.id, label: u.name })),
          ]}
        />
        {podeImportar && (
          <Link
            href={`/modulos/ticket-medio/importar?competencia=${competencia}`}
            className="sgo-control inline-flex h-10 items-center gap-1.5 rounded-control bg-brand px-3 text-sm font-semibold text-on-brand hover:bg-brand-hover"
          >
            <Upload className="h-4 w-4" /> Importar planilha
          </Link>
        )}
      </div>

      <StatusDoFechamento painel={painel} competencia={competencia} consolidado={consolidado} />

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Ticket Médio" value={emReal(painel.total.ticket)} delta={painel.comparacao.ticket} hint={`vs. ${rotuloDaCompetencia(painel.anterior)}`} />
        <StatCard label="Receita" value={emReal(painel.total.receita)} delta={painel.comparacao.receita} hint="venda − desconto" />
        <StatCard label="Cupons" value={emNumero(painel.total.coupons)} delta={painel.comparacao.coupons} />
        <StatCard label="Vendas" value={emReal(painel.total.grossSales)} delta={painel.comparacao.grossSales} />
        <StatCard label="Descontos" value={emReal(painel.total.discounts)} delta={painel.comparacao.discounts} invertDelta />
        <StatCard
          label="Importações"
          value={`${painel.importadas}/${painel.participantes}`}
          hint={painel.completo ? 'completo' : 'parcial'}
          tone={painel.completo ? 'success' : 'warning'}
        />
      </div>

      {painel.linhas.length === 0 ? (
        <EmptyState
          icon={AlertTriangle}
          title="Nenhuma unidade participante nesta competência"
          description="O Ticket Médio só considera as unidades marcadas em Configurações → Ticket Médio (unidades participantes). Unidade nova não entra sozinha."
        />
      ) : (
        <Card>
          <CardContent className="pt-4">
            <p className="sgo-type-11 mb-2 font-semibold text-ink-900">
              {consolidado ? 'Unidades participantes' : 'Unidade'}
            </p>
            <Table rows={painel.linhas} columns={colunas} getRowKey={(l) => l.unitId} />
            {consolidado && painel.importadas > 0 && (
              <div className="mt-3 border-t border-line pt-3">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <span className="sgo-type-11 font-semibold text-ink-900">Consolidado</span>
                  <span className="text-sm text-ink-500">
                    {emNumero(painel.total.coupons)} cupons · vendas {emReal(painel.total.grossSales)} · descontos {emReal(painel.total.discounts)}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-4">
                  <span className="text-sm text-ink-700">
                    Receita <b className="tabular-nums text-ink-900">{emReal(painel.total.receita)}</b>
                  </span>
                  <span className="text-sm text-ink-700">
                    Ticket Médio consolidado <b className="sgo-type-17 tabular-nums text-brand">{emReal(painel.total.ticket)}</b>
                  </span>
                </div>
                {/* Por que isto está escrito na tela: a média simples dos
                    tickets é o erro clássico da planilha, e sai parecida. */}
                <p className="mt-1 text-xs text-ink-500">
                  Receita total ÷ cupons totais — não é a média dos tickets das unidades.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Evolucao painel={painel} />
    </div>
  );
}

function Variacao({ v }: { v: number | null }) {
  if (v == null) return <span className="text-xs text-ink-400">—</span>;
  const tom = v > 0 ? 'text-success' : v < 0 ? 'text-danger' : 'text-ink-400';
  const seta = v > 0 ? '↑' : v < 0 ? '↓' : '—';
  return <span className={`text-xs ${tom}`}>{seta} {emPercentual(v)}</span>;
}

/**
 * O bloco de status. Parcial é AVISO, nunca resultado fechado: apresentar 6 de
 * 7 unidades como se fosse o mês inteiro é a forma mais fácil de alguém levar
 * um número errado para a reunião.
 */
function StatusDoFechamento({ painel, competencia, consolidado }: { painel: PainelDoTicket; competencia: Competencia; consolidado: boolean }) {
  if (painel.participantes === 0) return null;

  if (painel.completo) {
    return (
      <Banner
        tone="success"
        title={`Consolidado completo — ${painel.importadas} de ${painel.participantes} ${painel.participantes === 1 ? 'unidade importada' : 'unidades importadas'}`}
        description={`Todas as unidades participantes já lançaram ${rotuloDaCompetencia(competencia)}.`}
      />
    );
  }

  return (
    <Banner
      tone="warning"
      title={`Consolidado parcial — ${painel.importadas} de ${painel.participantes} unidades importadas`}
      description={
        painel.pendentes.length > 0
          ? `Ainda falta${painel.pendentes.length > 1 ? 'm' : ''}: ${painel.pendentes.map((p) => p.name).join(', ')} — ${rotuloDaCompetencia(competencia)} ${painel.pendentes.length > 1 ? 'não foram importadas' : 'não foi importada'}. Os números abaixo ainda não representam o fechamento${consolidado ? ' da rede' : ''}.`
          : undefined
      }
    />
  );
}

/**
 * Evolução do ticket consolidado. Barras, não linha: uma linha em SVG exigiria
 * escala, eixos e um componente de gráfico que o SGO não tem — e a pergunta
 * aqui é "subiu ou desceu", que a barra responde igual.
 */
function Evolucao({ painel }: { painel: PainelDoTicket }) {
  const comDado = painel.evolucao.filter((e) => e.ticket != null);
  if (comDado.length < 2) return null;
  const maior = Math.max(...comDado.map((e) => e.ticket!));

  return (
    <Card>
      <CardContent className="pt-4">
        <p className="sgo-type-11 mb-1 font-semibold text-ink-900">Evolução do Ticket Médio</p>
        <p className="mb-3 text-xs text-ink-500">Últimos meses com lançamento, do mais antigo para o mais recente.</p>
        <div className="flex items-end gap-1.5 overflow-x-auto pb-1">
          {painel.evolucao.map((e) => (
            <div key={e.competencia} className="flex min-w-10 flex-1 flex-col items-center gap-1">
              <span className="sgo-type-11 tabular-nums text-ink-700">{e.ticket == null ? '' : emReal(e.ticket).replace('R$', '').trim()}</span>
              <div className="flex h-24 w-full items-end">
                <div
                  className={`w-full rounded-t ${e.competencia === painel.competencia ? 'bg-brand' : 'bg-ink-400'}`}
                  style={{ height: `${e.ticket == null ? 2 : Math.max(4, (e.ticket / maior) * 100)}%` }}
                  title={e.ticket == null ? 'sem lançamento' : emReal(e.ticket)}
                />
              </div>
              <span className="sgo-type-11 text-ink-500">{e.competencia.slice(5)}/{e.competencia.slice(2, 4)}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
