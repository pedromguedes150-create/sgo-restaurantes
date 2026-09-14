import Link from 'next/link';
import { ArrowLeft, ClipboardList } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import { listarConferencias, TIPO_LABEL, METODO_LABEL, STATUS_LABEL } from '@/lib/commands/sessao';
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

      <LargeTitle title="Histórico de conferências" subtitle="Cada conferência é um registro próprio — concluída, nunca é sobrescrita." />

      <div className="space-y-2">
        {units.length > 1 && pilulas('unit', units.map((u) => ({ valor: u.id, label: shortUnitName(u.name) })))}
        {pilulas('tipo', [{ valor: 'FAIXA_DO_DIA', label: 'Faixa do dia' }, { valor: 'COMPLETA', label: 'Completa' }])}
        {pilulas('metodo', [{ valor: 'MANUAL', label: 'Manual' }, { valor: 'LEITOR', label: 'Leitor' }, { valor: 'MISTO', label: 'Manual + Leitor' }])}
        {pilulas('status', [{ valor: 'EM_ANDAMENTO', label: 'Em andamento' }, { valor: 'CONCLUIDA', label: 'Concluída' }, { valor: 'CANCELADA', label: 'Cancelada' }])}
      </div>

      {linhas.length === 0 ? (
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
                <th className="px-2 py-1.5 font-semibold text-ink-700">Data / hora</th>
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
              {linhas.map((l) => (
                <tr key={l.id} className="border-b border-line">
                  <td className="whitespace-nowrap px-2 py-1.5 tabular-nums text-ink-900">{hora(l.startedAt)}</td>
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
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
