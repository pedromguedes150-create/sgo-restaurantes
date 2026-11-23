import Link from 'next/link';
import { ArrowLeft, ClipboardList } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import { listarConferencias, listarContagensDiretas, TIPO_LABEL, METODO_LABEL, STATUS_LABEL } from '@/lib/commands/sessao';
import { LargeTitle } from '@/components/layout/page-chrome';
import { SgoKpi, SgoKpis } from '@/components/sgo/sgo-kpi';
import { FiltrosDeConferencias } from '@/components/commands/filtros-conferencias';
import { StatusBadge } from '@/components/ui/ds/status-badge';
import { EmptyState } from '@/components/ui/ds/empty-state';
import { shortUnitName } from '@/lib/unit-name';
import type { CommandSessionType, CommandSessionMethod } from '@prisma/client';

export const dynamic = 'force-dynamic';

const hora = (d: Date) => d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });

const TOM: Record<string, 'success' | 'warning' | 'neutral'> = {
  CONCLUIDA: 'success',
  EM_ANDAMENTO: 'warning',
  CANCELADA: 'neutral',
};

/**
 * Histórico de conferências — o que não existia.
 *
 * Antes havia uma contagem por dia e ela era sobrescrita: não dava para
 * responder "quando foi a última", "o que foi conferido" nem "quem conferiu".
 */
export default async function HistoricoDeConferenciasPage({
  searchParams,
}: {
  searchParams: { unit?: string; de?: string; ate?: string; tipo?: string; metodo?: string; status?: string };
}) {
  const user = (await getSessionUser())!;
  const units = await prisma.unit.findMany({
    where: { active: true, ...unitScopeWhere(user, 'id') },
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  });

  const linhas = await listarConferencias(user, {
    unitId: searchParams.unit || undefined,
    de: /^\d{4}-\d{2}-\d{2}$/.test(searchParams.de ?? '') ? searchParams.de : undefined,
    ate: /^\d{4}-\d{2}-\d{2}$/.test(searchParams.ate ?? '') ? searchParams.ate : undefined,
    type: (searchParams.tipo as CommandSessionType) || undefined,
    method: (searchParams.metodo as CommandSessionMethod) || undefined,
    status: searchParams.status || undefined,
  });

  /* v1.220.0: as contagens feitas pela tela antiga (sem conferência) entram no histórico — só quando o
     filtro não pede algo que elas não têm (método, ou uma situação que não seja "Concluída"). */
  const mostraDiretas = !searchParams.metodo && (!searchParams.status || searchParams.status === 'CONCLUIDA');
  const diretas = mostraDiretas
    ? (await listarContagensDiretas(user, {
        unitId: searchParams.unit || undefined,
        de: /^\d{4}-\d{2}-\d{2}$/.test(searchParams.de ?? '') ? searchParams.de : undefined,
        ate: /^\d{4}-\d{2}-\d{2}$/.test(searchParams.ate ?? '') ? searchParams.ate : undefined,
      })).filter((c) => !searchParams.tipo || (searchParams.tipo === 'FAIXA_DO_DIA') === c.parcial)
    : [];
  const dia = (iso: string) => iso.split('-').reverse().join('/');
  type Linha = { chave: string; ordem: string; sessao?: (typeof linhas)[number]; direta?: (typeof diretas)[number] };
  const tudo: Linha[] = [
    ...linhas.map((l) => ({ chave: l.id, ordem: `${l.operationalDate} ${l.startedAt.toISOString()}`, sessao: l })),
    ...diretas.map((c) => ({ chave: `c-${c.id}`, ordem: `${c.operationalDate} ${c.registradaEm.toISOString()}`, direta: c })),
  ].sort((a, b) => (a.ordem < b.ordem ? 1 : -1));

  /* v1.222.0 — os números do recorte, antes da lista. */
  const sessoes = tudo.filter((t) => t.sessao).map((t) => t.sessao!);
  const concluidas = sessoes.filter((s) => s.status === 'CONCLUIDA').length + diretas.length;
  const emAndamento = sessoes.filter((s) => s.status === 'EM_ANDAMENTO').length;
  const comDivergencia = sessoes.filter((s) => s.divergencias > 0).length + diretas.filter((c) => c.ausentes > 0).length;
  const temFiltro = Object.values(searchParams).some(Boolean);
  const mostrarUnidade = units.length > 1 && !searchParams.unit;

  return (
    <div className="space-y-4" data-testid="historico-de-conferencias">
      <Link href="/modulos/comandas" className="inline-flex items-center gap-1 text-sm font-semibold text-brand">
        <ArrowLeft className="h-4 w-4" /> Comandas
      </Link>

      <LargeTitle
        title="Histórico de conferências"
        subtitle="Todas as conferências de comandas, da mais recente para a mais antiga."
        actions={<Link href={searchParams.unit ? `/modulos/comandas?unit=${searchParams.unit}` : '/modulos/comandas'} className="sgo-btn sgo-btn--sm"><ClipboardList className="h-4 w-4" /> Nova conferência</Link>}
      />

      <FiltrosDeConferencias
        unidades={units.map((u) => ({ id: u.id, nome: shortUnitName(u.name) }))}
        valores={{ unit: searchParams.unit ?? '', tipo: searchParams.tipo ?? '', metodo: searchParams.metodo ?? '', status: searchParams.status ?? '', de: searchParams.de ?? '', ate: searchParams.ate ?? '' }}
      />

      <SgoKpis>
        <SgoKpi label="Conferências" value={tudo.length} meta={temFiltro ? 'no filtro' : 'as mais recentes'} testId="kpi-total" />
        <SgoKpi label="Concluídas" value={concluidas} testId="kpi-concluidas" />
        <SgoKpi label="Em andamento" value={emAndamento} valueColor={emAndamento > 0 ? 'var(--sgo-warn)' : undefined} meta={emAndamento > 0 ? 'falta finalizar' : undefined} testId="kpi-andamento" />
        <SgoKpi label="Com comanda faltando" value={comDivergencia} valueColor={comDivergencia > 0 ? 'var(--sgo-bad)' : undefined} testId="kpi-divergencia" />
      </SgoKpis>

      <section className="sgo-panel sgo-panel--solid overflow-hidden">
        <p className="sgo-panel__title px-3 pt-3 sm:px-4">Conferências · {tudo.length}</p>
        {tudo.length === 0 ? (
          <div className="px-3 pb-4 sm:px-4">
            <EmptyState
              icon={ClipboardList}
              title={temFiltro ? 'Nenhuma conferência com esses filtros' : 'Nenhuma conferência registrada ainda'}
              description={temFiltro ? 'Mude ou limpe os filtros acima.' : 'Inicie a primeira na tela de Comandas, em "Iniciar nova conferência".'}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="sgo-tbl w-full text-sm">
              <thead>
                <tr>
                  <th className="text-left">Dia</th>
                  {mostrarUnidade && <th className="text-left">Unidade</th>}
                  <th className="text-left">Tipo</th>
                  <th className="text-left">Responsável</th>
                  <th className="text-right">Conferidas</th>
                  <th className="text-right">Faltando</th>
                  <th className="text-left">Situação</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {tudo.map(({ chave, sessao: l, direta: c }) => l ? (
                  <tr key={chave} data-testid="linha-conferencia">
                    <td>
                      <span className="font-semibold tabular-nums text-ink-900">{dia(l.operationalDate)}</span>
                      <span className="block text-xs tabular-nums text-ink-500">iniciada {hora(l.startedAt)}</span>
                    </td>
                    {mostrarUnidade && <td>{shortUnitName(l.unitName)}</td>}
                    <td>
                      {TIPO_LABEL[l.type]}
                      <span className="block text-xs text-ink-500">{METODO_LABEL[l.method]}</span>
                    </td>
                    <td>{l.responsavel ?? '—'}</td>
                    <td className="text-right tabular-nums">{l.conferidas} de {l.expected}</td>
                    <td className={`text-right tabular-nums ${l.divergencias > 0 ? 'font-semibold text-danger' : 'text-ink-500'}`}>{l.divergencias > 0 ? l.divergencias : '—'}</td>
                    <td><StatusBadge tone={TOM[l.status] ?? 'neutral'} dot>{STATUS_LABEL[l.status]}</StatusBadge></td>
                    <td className="text-right">
                      <Link href={`/modulos/comandas/conferencias/${l.id}`} className="sgo-btn sgo-btn--sm">{l.status === 'EM_ANDAMENTO' ? 'Continuar' : 'Abrir'}</Link>
                    </td>
                  </tr>
                ) : c ? (
                  <tr key={chave} data-testid="linha-contagem-direta">
                    <td>
                      <span className="font-semibold tabular-nums text-ink-900">{dia(c.operationalDate)}</span>
                      <span className="block text-xs tabular-nums text-ink-500">registrada {hora(c.registradaEm)}</span>
                    </td>
                    {mostrarUnidade && <td>{shortUnitName(c.unitName)}</td>}
                    <td>
                      {c.parcial ? 'Parcial' : 'Completa'}
                      <span className="block text-xs text-ink-500">Tela antiga (sem conferência)</span>
                    </td>
                    <td>{c.responsavel ?? '—'}</td>
                    <td className="text-right text-ink-500">—</td>
                    <td className={`text-right tabular-nums ${c.ausentes > 0 ? 'font-semibold text-danger' : 'text-ink-500'}`}>{c.ausentes > 0 ? c.ausentes : '—'}</td>
                    <td><StatusBadge tone="success" dot>Concluída</StatusBadge></td>
                    <td />
                  </tr>
                ) : null)}
              </tbody>
            </table>
          </div>
        )}
        {diretas.length > 0 && <p className="px-3 pb-3 pt-2 text-xs text-ink-500 sm:px-4">&quot;Tela antiga&quot; são contagens feitas pelo leitor ou pela grade antigos, antes de a conferência virar um caminho só.</p>}
      </section>
    </div>
  );
}
