import Link from 'next/link';
import { ArrowLeft, ClipboardList } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import { listarConferencias, listarContagensDiretas, TIPO_LABEL, METODO_LABEL, STATUS_LABEL } from '@/lib/commands/sessao';
import { LargeTitle } from '@/components/layout/page-chrome';
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

  const filtro = (chave: string, valor: string | null) => {
    const q = new URLSearchParams(Object.entries(searchParams).filter(([, v]) => v) as [string, string][]);
    if (valor === null) q.delete(chave); else q.set(chave, valor);
    return `/modulos/comandas/conferencias?${q.toString()}`;
  };

  const pilulas = (chave: string, opcoes: { valor: string; label: string }[]) => (
    <div className="flex flex-wrap gap-1.5">
      <Link href={filtro(chave, null)} className={`rounded-full border px-3 py-1 text-xs font-semibold ${!searchParams[chave as keyof typeof searchParams] ? 'border-brand bg-brand text-on-brand' : 'text-ink-700'}`}>
        Todos
      </Link>
      {opcoes.map((o) => (
        <Link key={o.valor} href={filtro(chave, o.valor)} className={`rounded-full border px-3 py-1 text-xs font-semibold ${searchParams[chave as keyof typeof searchParams] === o.valor ? 'border-brand bg-brand text-on-brand' : 'text-ink-700'}`}>
          {o.label}
        </Link>
      ))}
    </div>
  );

  return (
    <div className="space-y-4">
      <Link href="/modulos/comandas" className="inline-flex items-center gap-1 text-sm font-semibold text-brand">
        <ArrowLeft className="h-4 w-4" /> Comandas
      </Link>

      <LargeTitle title="Histórico de conferências" subtitle="Todas as conferências, por dia. As linhas marcadas como tela antiga são contagens feitas antes da unificação, pelo leitor ou pela grade antigos." />

      <div className="space-y-2">
        {units.length > 1 && pilulas('unit', units.map((u) => ({ valor: u.id, label: shortUnitName(u.name) })))}
        {pilulas('tipo', [{ valor: 'FAIXA_DO_DIA', label: 'Parcial' }, { valor: 'COMPLETA', label: 'Completa' }])}
        {pilulas('metodo', [{ valor: 'MANUAL', label: 'Manual' }, { valor: 'LEITOR', label: 'Leitor' }, { valor: 'MISTO', label: 'Manual + Leitor' }])}
        {pilulas('status', [{ valor: 'EM_ANDAMENTO', label: 'Em andamento' }, { valor: 'CONCLUIDA', label: 'Concluída' }, { valor: 'CANCELADA', label: 'Cancelada' }])}
      </div>

      {tudo.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="Nenhuma conferência no filtro"
          description="Troque os filtros acima, ou inicie uma nova conferência na tela de Comandas."
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-line">
                <th className="px-2 py-1.5 font-semibold text-ink-700">Dia</th>
                <th className="px-2 py-1.5 font-semibold text-ink-700">Iniciada em</th>
                <th className="px-2 py-1.5 font-semibold text-ink-700">Unidade</th>
                <th className="px-2 py-1.5 font-semibold text-ink-700">Tipo</th>
                <th className="px-2 py-1.5 font-semibold text-ink-700">Método</th>
                <th className="px-2 py-1.5 font-semibold text-ink-700">Responsável</th>
                <th className="px-2 py-1.5 font-semibold text-ink-700">Resultado</th>
                <th className="px-2 py-1.5 font-semibold text-ink-700">Divergências</th>
                <th className="px-2 py-1.5 font-semibold text-ink-700">Status</th>
                <th className="px-2 py-1.5" />
              </tr>
            </thead>
            <tbody>
              {tudo.map(({ chave, sessao: l, direta: c }) => l ? (
                <tr key={chave} className="border-b border-line" data-testid="linha-conferencia">
                  <td className="whitespace-nowrap px-2 py-1.5 font-semibold tabular-nums text-ink-900">{dia(l.operationalDate)}</td>
                  <td className="whitespace-nowrap px-2 py-1.5 tabular-nums text-ink-700">{hora(l.startedAt)}</td>
                  <td className="px-2 py-1.5 text-ink-700">{shortUnitName(l.unitName)}</td>
                  <td className="px-2 py-1.5 text-ink-700">{TIPO_LABEL[l.type]}</td>
                  <td className="px-2 py-1.5 text-ink-700">{METODO_LABEL[l.method]}</td>
                  <td className="px-2 py-1.5 text-ink-700">{l.responsavel ?? '—'}</td>
                  <td className="px-2 py-1.5 tabular-nums text-ink-700">{l.conferidas}/{l.expected}</td>
                  <td className={`px-2 py-1.5 tabular-nums ${l.divergencias > 0 ? 'font-semibold text-danger' : 'text-ink-700'}`}>{l.divergencias}</td>
                  <td className="px-2 py-1.5"><StatusBadge tone={TOM[l.status] ?? 'neutral'} dot>{STATUS_LABEL[l.status]}</StatusBadge></td>
                  <td className="px-2 py-1.5">
                    <Link href={`/modulos/comandas/conferencias/${l.id}`} className="font-semibold text-brand">Ver detalhes</Link>
                  </td>
                </tr>
              ) : c ? (
                <tr key={chave} className="border-b border-line" data-testid="linha-contagem-direta">
                  <td className="whitespace-nowrap px-2 py-1.5 font-semibold tabular-nums text-ink-900">{dia(c.operationalDate)}</td>
                  <td className="whitespace-nowrap px-2 py-1.5 tabular-nums text-ink-700">{hora(c.registradaEm)}</td>
                  <td className="px-2 py-1.5 text-ink-700">{shortUnitName(c.unitName)}</td>
                  <td className="px-2 py-1.5 text-ink-700">{c.parcial ? 'Parcial' : 'Completa'}</td>
                  <td className="px-2 py-1.5 text-ink-500">Tela antiga (sem conferência)</td>
                  <td className="px-2 py-1.5 text-ink-700">{c.responsavel ?? '—'}</td>
                  <td className="px-2 py-1.5 tabular-nums text-ink-700">{c.ausentes === 0 ? 'todas presentes' : `${c.ausentes} ausente(s)`}</td>
                  <td className="px-2 py-1.5 text-ink-500">—</td>
                  <td className="px-2 py-1.5"><StatusBadge tone="success" dot>Concluída</StatusBadge></td>
                  <td className="px-2 py-1.5" />
                </tr>
              ) : null)}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
