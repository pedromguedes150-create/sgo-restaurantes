import { getSessionUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import { getMyRequests, getToApprove, getToPay, getHistory, getMiscTypes } from '@/lib/payments/query';
import { listSuppliers } from '@/lib/suppliers';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { PaymentsClient, type PayReq } from '@/components/payments/payments-client';
import { FileText } from 'lucide-react';
import type { PaymentRequest } from '@prisma/client';

export const dynamic = 'force-dynamic';

type ReqRow = PaymentRequest & {
  unit: { name: string; code: string };
  requestedBy: { name: string } | null;
  approvedBy: { name: string } | null;
  paidBy: { name: string } | null;
  freelancer: { name: string; pixKey: string | null } | null;
  miscType: { name: string } | null;
  supplier: { name: string } | null;
};

function toDTO(r: ReqRow): PayReq {
  const title =
    r.type === 'FREELANCER'
      ? r.freelancer?.name ?? 'Freelancer'
      : r.type === 'OVERTIME'
        ? r.collaboratorName ?? 'Hora extra'
        : `${r.miscType?.name ?? 'Avulso'}${r.beneficiary ? ` — ${r.beneficiary}` : ''}`;
  // Dia de referência para agrupamento: data efetiva/trabalho quando houver, senão a solicitação
  const day = (r.entryDate ?? r.workDate ?? r.createdAt).toISOString().slice(0, 10);
  return {
    id: r.id,
    type: r.type,
    status: r.status,
    amount: Number(r.amount),
    unit: r.unit.name,
    unitCode: r.unit.code,
    requestedBy: r.requestedBy?.name ?? null,
    title,
    rejectionReason: r.rejectionReason,
    divergent: r.divergent,
    standardValue: r.standardValue !== null && r.standardValue !== undefined ? Number(r.standardValue) : null,
    requestedAt: r.createdAt.toISOString(),
    entryDate: r.entryDate ? r.entryDate.toISOString() : null,
    dateEdited: r.dateEdited,
    dateEditedByName: r.dateEditedByName,
    day,
    // Detalhes para conferência (expandir no card)
    detail: {
      workDate: r.workDate ? r.workDate.toISOString().slice(0, 10) : null,
      shift: r.shift ?? null,
      workStartTime: r.workStartTime ?? null,
      workEndTime: r.workEndTime ?? null,
      hours: r.hours ?? null,
      transportValue: r.transportValue != null ? Number(r.transportValue) : null,
      coverageSector: r.coverageSector ?? null,
      collaboratorName: r.collaboratorName ?? null,
      reason: r.reason ?? null,
      beneficiary: r.beneficiary ?? null,
      description: r.description ?? null,
      pixKey: r.freelancer?.pixKey ?? null,
      supplierName: r.supplier?.name ?? null,
      miscTypeName: r.miscType?.name ?? null,
      approvedBy: r.approvedBy?.name ?? null,
      approvedAt: r.approvedAt ? r.approvedAt.toISOString() : null,
      paidBy: r.paidBy?.name ?? null,
      paidAt: r.paidAt ? r.paidAt.toISOString() : null,
      hasAttachment: Boolean(r.attachmentPath),
      attachmentPath: r.attachmentPath ?? null,
    },
  };
}

export default async function PagamentosPage() {
  const user = (await getSessionUser())!;
  const isFinanceView = user.role === 'FINANCE' || user.role === 'ADMIN' || user.role === 'CEO';

  const [mine, toApprove, toPay, history, units, miscTypes, freelancers, suppliers] = await Promise.all([
    getMyRequests(user),
    getToApprove(user),
    getToPay(user),
    getHistory(user),
    prisma.unit.findMany({ where: { active: true, ...unitScopeWhere(user, 'id') }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    getMiscTypes(),
    prisma.freelancer.findMany({ where: { active: true }, include: { units: { select: { unitId: true } }, sectorRates: true }, orderBy: { name: 'asc' } }),
    listSuppliers({ activeOnly: true }),
  ]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-sgo-brand">Pagamentos</h1>
        {isFinanceView && (
          <Link href="/modulos/pagamentos/relatorio-freelancers" className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm font-semibold hover:border-sgo-brand">
            <FileText className="h-4 w-4" /> Consolidação de freelancers
          </Link>
        )}
      </div>
      <Card>
        <CardContent className="pt-4">
          <PaymentsClient
            isFinanceView={isFinanceView}
            isAdmin={user.role === 'ADMIN'}
            canEditDate={user.role === 'ADMIN' || user.role === 'SUPERVISOR'}
            units={units}
            miscTypes={miscTypes.map((t) => ({ id: t.id, name: t.name }))}
            suppliers={suppliers.map((s) => ({ id: s.id, name: s.name }))}
            freelancers={freelancers.map((f) => ({ id: f.id, name: f.name, defaultValue: Number(f.defaultValue), unitIds: f.units.map((u) => u.unitId), sectorRates: f.sectorRates.map((r) => ({ sectorName: r.sectorName, dayValue: Number(r.dayValue) })) }))}
            mine={(mine as ReqRow[]).map(toDTO)}
            toApprove={(toApprove as ReqRow[]).map(toDTO)}
            toPay={(toPay as ReqRow[]).map(toDTO)}
            history={(history as ReqRow[]).map(toDTO)}
          />
        </CardContent>
      </Card>
    </div>
  );
}
