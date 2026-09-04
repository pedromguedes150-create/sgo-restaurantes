import Link from 'next/link';
import { StatCard } from '@/components/ui/ds/stat-card';
import { FamilyTabs } from '@/components/layout/family-tabs';
import { FileText } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { permissaoDeRota } from '@/lib/permissions/links';

import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import { listCancellations, getReasons, getCancellationSummary } from '@/lib/cancellations/query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CancellationsClient } from '@/components/cancellations/cancellations-client';
import { DeleteOpButton } from '@/components/admin/delete-op-button';
import { formatBRL } from '@/lib/utils';
import { LargeTitle } from '@/components/layout/page-chrome';

export const dynamic = 'force-dynamic';

export default async function CancelamentosPage() {
  const user = (await getSessionUser())!;
  const podeVer = await permissaoDeRota(user.role);
  const yearMonth = new Date().toISOString().slice(0, 7);

  const [pending, reasons, summary, units] = await Promise.all([
    listCancellations(user, { status: 'PENDING' }),
    getReasons(),
    getCancellationSummary(user, yearMonth),
    prisma.unit.findMany({ where: { active: true, ...unitScopeWhere(user, 'id') }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
  ]);

  const isAdmin = user.role === 'ADMIN';
  const [recentCanc, imports] = isAdmin
    ? await Promise.all([
        prisma.cancellation.findMany({ where: { ...unitScopeWhere(user, 'unitId') }, orderBy: { createdAt: 'desc' }, take: 50, include: { unit: { select: { name: true } } } }),
        prisma.cancellationImport.findMany({ where: { ...unitScopeWhere(user, 'unitId') }, orderBy: { createdAt: 'desc' }, take: 20, include: { unit: { select: { name: true } }, _count: { select: { cancellations: true } } } }),
      ])
    : [[], []];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <LargeTitle title="Cancelamento de Cupons" />
        <FamilyTabs active="/modulos/cancelamentos" />
        <div className="flex flex-wrap gap-2">
          {['ADMIN', 'CEO', 'SUPERVISOR'].includes(user.role) && podeVer('/modulos/cancelamentos/analise') && <Link href="/modulos/cancelamentos/analise" className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm font-semibold hover:border-brand">🛡️ Análise antifraude (PDF)</Link>}
          {/* Cancelamento de ITEM (antes de virar cupom) mora ao lado: e o mesmo
              assunto visto antes do fechamento da conta. */}
          {podeVer('/modulos/cancelamentos/itens') && <Link href="/modulos/cancelamentos/itens" className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm font-semibold hover:border-brand">🍽️ Cancelamento de itens</Link>}
          {podeVer('/modulos/cancelamentos/relatorio') && <Link href="/modulos/cancelamentos/relatorio" className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm font-semibold hover:bg-sunken"><FileText className="h-4 w-4" /> Relatório</Link>}
        </div>
      </div>

      {/* Resumo do mês */}
      <div className="grid grid-cols-3 gap-2">
        <StatCard label="no mês" value={summary.monthTotal} />
        <StatCard label="justificados" value={`${summary.justifiedPct}%`} tone="success" />
        <StatCard label="pendentes" value={summary.pending} tone="danger" />
      </div>

      <Card>
        <CardContent className="pt-4">
          <CancellationsClient
            isAdmin={user.role === 'ADMIN'}
            units={units}
            reasons={reasons.map((r) => ({ id: r.id, name: r.name }))}
            pending={pending.map((c) => ({
              id: c.id, unit: c.unit.name, coupon: c.couponNumber, operator: c.cashOperator, value: Number(c.value),
              /* Foto e hora: uma foto que ninguém vê não controla nada, e sem a
                 hora não dá para cruzar com o movimento do caixa. */
              photo: c.photoPath ?? null,
              canceledAt: c.canceledAt ? c.canceledAt.toISOString() : null,
            }))}
          />
        </CardContent>
      </Card>

      {isAdmin && (
        <Card>
          <CardHeader><CardTitle>Gerenciar lançamentos (admin)</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="mb-1 sgo-type-11 font-semibold text-ink-500">Importações</p>
              {imports.length === 0 && <p className="text-sm text-ink-500">Nenhuma importação.</p>}
              {imports.map((imp) => (
                <div key={imp.id} className="flex items-center justify-between rounded-lg border bg-surface p-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink-900">{imp.fileName}</p>
                    <p className="text-xs text-ink-500">{imp.unit.name} · {imp.operationalDate} · {imp._count.cancellations} cupom(ns)</p>
                  </div>
                  <DeleteOpButton entity="cancellationImport" id={imp.id} label={`a importação "${imp.fileName}" e seus cupons`} />
                </div>
              ))}
            </div>
            <div>
              <p className="mb-1 sgo-type-11 font-semibold text-ink-500">Cupons (recentes)</p>
              {recentCanc.length === 0 && <p className="text-sm text-ink-500">Nenhum cupom.</p>}
              {recentCanc.map((c) => (
                <div key={c.id} className="flex items-center justify-between rounded-lg border bg-surface p-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink-900">Cupom {c.couponNumber} · {formatBRL(Number(c.value))}</p>
                    <p className="text-xs text-ink-500">{c.unit.name} · {c.operationalDate} · {c.status}{c.cashOperator ? ` · ${c.cashOperator}` : ''}</p>
                  </div>
                  <DeleteOpButton entity="cancellation" id={c.id} label={`o cupom ${c.couponNumber}`} />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {summary.byOperator.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Ranking por operador (mês)</CardTitle></CardHeader>
          <CardContent className="space-y-1">
            {summary.byOperator.map((o, i) => (
              <div key={o.operator} className="flex justify-between text-sm">
                <span>{i + 1}. {o.operator}</span>
                <span className="font-semibold text-ink-900">{o.count}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
