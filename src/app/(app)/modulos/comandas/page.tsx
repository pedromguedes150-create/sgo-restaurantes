import Link from 'next/link';
import { FamilyTabs } from '@/components/layout/family-tabs';
import { getSessionUser } from '@/lib/auth/session';
import { permissaoDeRota } from '@/lib/permissions/links';

import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import { currentOperationalDate } from '@/lib/date/operational';
import { getUnitCommandState } from '@/lib/commands/query';
import { getActiveSequence } from '@/lib/commands/active';
import { getLastFullCount } from '@/lib/commands/full-count';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LargeTitle } from '@/components/layout/page-chrome';
import { Button } from '@/components/ui/ds/button';
import { StatCard } from '@/components/ui/ds/stat-card';
import { StatusBadge } from '@/components/ui/ds/status-badge';
import { List, ListRow } from '@/components/ui/ds/list-row';
import { EmptyState } from '@/components/ui/ds/empty-state';
import { shortUnitName } from '@/lib/unit-name';
import { ScanLine, ShieldAlert, ClipboardList } from 'lucide-react';
import { CommandsClient } from '@/components/commands/commands-client';
import { conferidasDaUltimaContagem } from '@/lib/commands/grid';
import { DeleteOpButton } from '@/components/admin/delete-op-button';
import { UnitSelectNav } from '@/components/ui/unit-select-nav';

export const dynamic = 'force-dynamic';

export default async function ComandasPage({ searchParams }: { searchParams: { unit?: string } }) {
  const user = (await getSessionUser())!;
  const podeVer = await permissaoDeRota(user.role);
  const now = new Date();

  const units = await prisma.unit.findMany({
    where: { active: true, ...unitScopeWhere(user, 'id') },
    orderBy: { name: 'asc' },
  });
  if (units.length === 0) return <p className="text-sm text-ink-500">Nenhuma unidade vinculada.</p>;

  const selected = units.find((u) => u.id === searchParams.unit) ?? units[0];
  const operationalDate = currentOperationalDate({ timezone: selected.timezone, cutoffHour: selected.cutoffHour }, now);
  const state = await getUnitCommandState(selected.id, operationalDate);
  const seq = await getActiveSequence(selected.id);
  /* A parcial roda toda madrugada e diria "contagem de hoje registrada" todo
     dia — verdade que esconde a completa não acontecer há semanas. */
  const ultimaCompleta = await getLastFullCount(selected.id, operationalDate);
  const activeNumbers = [...seq.active].sort((a, b) => a - b);

  /* Última contagem da unidade, com o estado em que a grade foi deixada.
     Sem isso a grade reabria em branco e corrigir uma contagem de 648 comandas
     exigia remarcar as 648 de novo. */
  const ultimaContagem = await prisma.commandCount.findFirst({
    where: { unitId: selected.id },
    orderBy: { operationalDate: 'desc' },
    select: {
      operationalDate: true, presentNumbers: true, inUseNumbers: true, allPresent: true,
      /* QUANDO e POR QUEM: é a prova de que o reenvio funcionou. Sem hora, uma
         segunda confirmação no mesmo dia não muda nada na tela — e quem clica
         conclui, com razão, que o botão não confirmou. */
      updatedAt: true, scopeNumbers: true, createdBy: { select: { name: true } },
    },
  });
  const numeros = (v: unknown): number[] => (Array.isArray(v) ? v.filter((n): n is number => Number.isInteger(n)) : []);

  /* Em que dias as divergências abertas foram criadas. Sem isto o Admin tinha
     de adivinhar a data no campo — e o botão ficava apagado até ele acertar. */
  const abertasPorDia = user.role === 'ADMIN'
    ? await prisma.commandDivergence.findMany({
        where: { unitId: selected.id, status: 'OPEN' },
        select: { createdAt: true },
      }).then((rows) => {
        const mapa = new Map<string, number>();
        for (const r of rows) {
          const dia = r.createdAt.toISOString().slice(0, 10);
          mapa.set(dia, (mapa.get(dia) ?? 0) + 1);
        }
        return [...mapa.entries()]
          .map(([date, count]) => ({ date, count }))
          .sort((a, b) => (a.date < b.date ? 1 : -1));
      })
    : [];

  const canResolve = user.role === 'SUPERVISOR' || user.role === 'ADMIN' || user.role === 'CEO';

  const isAdmin = user.role === 'ADMIN';
  const [recentCounts, recentDivs] = isAdmin
    ? await Promise.all([
        prisma.commandCount.findMany({ where: { unitId: selected.id }, orderBy: { operationalDate: 'desc' }, take: 20, include: { createdBy: { select: { name: true } } } }),
        prisma.commandDivergence.findMany({ where: { unitId: selected.id }, orderBy: { createdAt: 'desc' }, take: 20 }),
      ])
    : [[], []];

  return (
    <div className="space-y-5">
      <LargeTitle
        title="Contagem de Comandas"
        subtitle={`Dia operacional ${operationalDate}`}
        actions={
          <div className="flex flex-wrap gap-2">
            {podeVer('/modulos/comandas/conferencia') && <Link href={`/modulos/comandas/conferencia?unit=${selected.id}`}>
              <Button size="sm" variant="secondary"><ScanLine className="h-4 w-4" /> Conferir com leitor</Button>
            </Link>}
            {canResolve && podeVer('/modulos/comandas/analise-aberto') && (
              <Link href="/modulos/comandas/analise-aberto">
                <Button size="sm" variant="secondary"><ShieldAlert className="h-4 w-4" /> Análise de comandas em aberto</Button>
              </Link>
            )}
          </div>
        }
      />
      <FamilyTabs active="/modulos/comandas" />

      {units.length > 1 && <UnitSelectNav units={units.map((u) => ({ id: u.id, name: u.name }))} selected={selected.id} />}

      {state.config && (
        <div className="grid grid-cols-3 gap-3">
          <StatCard label="Ativas" value={state.activeCount} />
          <StatCard label="Reposições" value={state.replacementCount} />
          <StatCard label="Baixas" value={state.lostCount} />
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{shortUnitName(selected.name)}</CardTitle>
        </CardHeader>
        <CardContent>
          <CommandsClient
            unitId={selected.id}
            canResolve={canResolve}
            isAdmin={user.role === 'ADMIN'}
            hasConfig={Boolean(state.config)}
            todayDone={Boolean(state.todayCount)}
            ultimaCompleta={ultimaCompleta}
            temFaixaMadrugada={seq.hasNightly}
            activeNumbers={activeNumbers}
            nightlyNumbers={[...seq.nightly].sort((a, b) => a - b)}
            lostNumbers={[...seq.lost].sort((a, b) => a - b)}
            ultimaContagem={ultimaContagem ? {
              data: ultimaContagem.operationalDate,
              deHoje: ultimaContagem.operationalDate === operationalDate,
              /* "Todas presentes" numa PARCIAL vale só para o escopo dela — usar
                 a sequência inteira aqui reabriria a grade com as guardadas
                 marcadas de verde, dizendo que foram conferidas. */
              conferidas: conferidasDaUltimaContagem(
                ultimaContagem.allPresent,
                numeros(ultimaContagem.scopeNumbers),
                numeros(ultimaContagem.presentNumbers),
                activeNumbers,
              ),
              emUso: numeros(ultimaContagem.inUseNumbers),
              registradaEm: ultimaContagem.updatedAt.toISOString(),
              porQuem: ultimaContagem.createdBy?.name ?? null,
              parcial: numeros(ultimaContagem.scopeNumbers).length > 0,
            } : null}
            abertasPorDia={abertasPorDia}
            openDivergences={state.openDivergences.map((d) => ({
              id: d.id,
              number: d.number,
              status: d.status as 'OPEN' | 'INVESTIGATING' | 'CLOSED',
              observation: d.observation,
              reporter: d.reporter?.name ?? null,
            }))}
          />
        </CardContent>
      </Card>

      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>Lançamentos (admin)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="sgo-type-11 mb-2 text-ink-500">Contagens diárias</p>
              {recentCounts.length === 0 ? (
                <EmptyState size="sm" icon={ClipboardList} title="Nenhuma contagem" />
              ) : (
                <List>
                  {recentCounts.map((c) => (
                    <ListRow
                      key={c.id}
                      title={c.operationalDate}
                      subtitle={`${c.allPresent ? 'todas presentes' : `${c.absentCount} ausente(s)`}${c.createdBy ? ` · ${c.createdBy.name}` : ''}`}
                      trailing={<DeleteOpButton entity="commandCount" id={c.id} label={`a contagem de ${c.operationalDate}`} />}
                    />
                  ))}
                </List>
              )}
            </div>
            <div>
              <p className="sgo-type-11 mb-2 text-ink-500">Divergências</p>
              {recentDivs.length === 0 ? (
                <EmptyState size="sm" icon={ClipboardList} title="Nenhuma divergência" />
              ) : (
                <List>
                  {recentDivs.map((d) => (
                    <ListRow
                      key={d.id}
                      title={`Comanda nº ${d.number}`}
                      subtitle={d.observation ?? undefined}
                      trailing={
                        <>
                          <StatusBadge tone={d.status === 'CLOSED' ? 'success' : d.status === 'INVESTIGATING' ? 'warning' : 'danger'} dot>
                            {d.status === 'CLOSED' ? 'Encerrada' : d.status === 'INVESTIGATING' ? 'Em apuração' : 'Aberta'}
                          </StatusBadge>
                          <DeleteOpButton entity="commandDivergence" id={d.id} label={`a divergência da comanda ${d.number}`} />
                        </>
                      }
                    />
                  ))}
                </List>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
