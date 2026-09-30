import { getSessionUser } from '@/lib/auth/session';
import { abasDoPerfil } from '@/lib/permissions/abas-server';
import { permissoesEfetivasDoRequest } from '@/lib/permissions';

import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import { resolveUnitFilter } from '@/lib/scope/unit-filter';
import { getSelectedUnitId } from '@/lib/scope/selected-unit';
import { getMyRequests, getToApprove, getToPay, getHistory, getUnitRequests, getMiscTypes, getPaymentCounts, LIMITE_DA_LISTA } from '@/lib/payments/query';
import { podePagarPorPerfil } from '@/lib/payments/aprovadores';
import { activeOvertimeRatesByUnit } from '@/lib/overtime/rates';
import { listSuppliers } from '@/lib/suppliers';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { PaymentsClient, type PayReq } from '@/components/payments/payments-client';
import { FileText } from 'lucide-react';
import type { PaymentRequest } from '@prisma/client';
import { LargeTitle } from '@/components/layout/page-chrome';

export const dynamic = 'force-dynamic';

type ReqRow = PaymentRequest & {
  unit: { name: string; code: string };
  requestedBy: { name: string } | null;
  approvedBy: { name: string } | null;
  paidBy: { name: string } | null;
  freelancer: { name: string; pixKey: string | null } | null;
  miscType: { name: string } | null;
  supplier: { name: string } | null;
  workSector: { id: string; name: string } | null;
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
    unitId: r.unitId,
    unitCode: r.unit.code,
    requestedBy: r.requestedBy?.name ?? null,
    title,
    rejectionReason: r.rejectionReason,
    divergent: r.divergent,
    recurrent: r.recurrent,
    weekCount: r.weekCount ?? null,
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
      workSectorId: r.workSectorId ?? null,
      workSectorName: r.workSector?.name ?? null,
      collaboratorId: r.collaboratorId ?? null,
      collaboratorName: r.collaboratorName ?? null,
      hourlyRate: r.hourlyRate != null ? Number(r.hourlyRate) : null,
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

export default async function PagamentosPage({ searchParams }: { searchParams: { unit?: string; unidade?: string } }) {
  const user = (await getSessionUser())!;
  /* Quem paga (v1.133.0): Coordenador, Financeiro, Admin/CEO — a lista pura de
     `aprovadores.ts`; a aba Pagar da matriz é conferida no cliente e na rota. */
  const podePagar = podePagarPorPerfil(user.role);
  const podeVerConsolidacao = podePagar || user.role === 'SUPERVISOR';
  /* A consolidação de pagamentos (Freelancer + Hora Extra, para o Financeiro)
     obedece a matriz de perfis — é o mesmo teste que a página faz para abrir. */
  const permissoes = await permissoesEfetivasDoRequest(user.role);
  const podeVerConsolidacaoPagamentos = Boolean(permissoes.PAYMENTS_CONSOLIDATION?.canView);
  /* Pagamento Extra (v1.135.0): a hora extra aprovada aqui é paga lá, na
     competência do mês seguinte — quem aprova precisa achar o caminho. */
  const podeVerPagamentoExtra = Boolean(permissoes.PEOPLE_PAYOUTS?.canView);

  /* A tela OBEDECE o seletor de unidade do cabeçalho (pedido de 04/09: "está
     tudo misturado"). Mesma regra de precedência de Tarefas e Pessoas;
     `?unit=todas` mostra a rede. O escopo de verdade segue no banco. */
  const units = await prisma.unit.findMany({ where: { active: true, ...unitScopeWhere(user, 'id') }, orderBy: { name: 'asc' }, select: { id: true, name: true } });
  const idsAcessiveis = units.map((u) => u.id);
  const filtro = resolveUnitFilter(searchParams, idsAcessiveis, getSelectedUnitId(idsAcessiveis));
  const doFiltro = filtro.all ? undefined : filtro.ids;
  const filtradoPor = filtro.all ? [] : units.filter((u) => filtro.ids.includes(u.id)).map((u) => u.name);

  /* GERENTE (v1.130.0): a tela dele é Nova · Minhas · Solicitações da unidade.
     A lista da unidade só é carregada para ele — o Supervisor segue igual. */
  const isManagerView = user.role === 'MANAGER';
  const [mine, toApprove, toPay, history, totais, miscTypes, freelancers, suppliers, sectors, vinculos, unitRequests, overtimeRatesByUnit] = await Promise.all([
    getMyRequests(user, doFiltro),
    getToApprove(user, doFiltro),
    getToPay(user, doFiltro),
    getHistory(user, doFiltro),
    /* Os TOTAIS vêm de count, não do tamanho das listas: com o teto de linhas,
       o tamanho do array é o teto, e o crachá mentiria. */
    getPaymentCounts(user, doFiltro),
    getMiscTypes(),
    prisma.freelancer.findMany({ where: { active: true }, include: { units: { select: { unitId: true } }, sectorRates: true }, orderBy: { name: 'asc' } }),
    listSuppliers({ activeOnly: true }),
    // Setores da unidade: o freelancer já nasce alocado (04/09).
    prisma.sector.findMany({ where: { active: true, ...unitScopeWhere(user, 'unitId') }, orderBy: [{ order: 'asc' }, { name: 'asc' }], select: { id: true, name: true, unitId: true } }),
    /* Hora Extra pelo colaborador do RH (v1.126.0): os colaboradores ativos de
       cada unidade do alcance — a mesma base de Pessoas, sem cadastro novo. */
    prisma.collaboratorUnit.findMany({
      where: { collaborator: { active: true }, ...unitScopeWhere(user, 'unitId') },
      select: { unitId: true, collaborator: { select: { id: true, name: true, jobTitle: true } } },
      orderBy: { collaborator: { name: 'asc' } },
    }),
    isManagerView ? getUnitRequests(user, doFiltro) : Promise.resolve([]),
    // Valores/hora AUTORIZADOS de hora extra, por unidade (só os ativos).
    activeOvertimeRatesByUnit(idsAcessiveis),
  ]);
  const collaboratorsByUnit: Record<string, { id: string; name: string; jobTitle: string | null }[]> = {};
  for (const v of vinculos) (collaboratorsByUnit[v.unitId] ??= []).push(v.collaborator);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <LargeTitle title="Pagamentos" />
        {/* A Supervisão abria a consolidação se digitasse o endereço, mas não
            tinha link — e é ela quem recebe o alerta de freelancer recorrente,
            ou seja, a primeira a precisar do consolidado. A condição passa a ser
            a mesma que a própria página usa para deixar entrar. */}
        {podeVerConsolidacao && (
          <Link href="/modulos/pagamentos/relatorio-freelancers" className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm font-semibold hover:border-brand">
            <FileText className="h-4 w-4" /> Recorrência de Freelancers
          </Link>
        )}
        {podeVerConsolidacaoPagamentos && (
          <Link href="/modulos/pagamentos/consolidacao" className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm font-semibold hover:border-brand">
            <FileText className="h-4 w-4" /> Pagamentos de Freelancers
          </Link>
        )}
        {podeVerPagamentoExtra && (
          <Link href="/modulos/pessoas/comissoes" className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm font-semibold hover:border-brand">
            <FileText className="h-4 w-4" /> Pagamento Extra
          </Link>
        )}
      </div>
      <Card>
        <CardContent className="pt-4">
          <PaymentsClient
            abas={await abasDoPerfil(user.role, 'PAYMENTS')}
            podePagar={podePagar}
            isAdmin={user.role === 'ADMIN'}
            canEditDate={user.role === 'ADMIN' || user.role === 'SUPERVISOR'}
            units={units}
            miscTypes={miscTypes.map((t) => ({ id: t.id, name: t.name }))}
            suppliers={suppliers.map((s) => ({ id: s.id, name: s.name }))}
            sectors={sectors}
            collaboratorsByUnit={collaboratorsByUnit}
            overtimeRatesByUnit={overtimeRatesByUnit}
            isManagerView={isManagerView}
            unitRequests={(unitRequests as ReqRow[]).map(toDTO)}
            filtradoPor={filtradoPor}
            freelancers={freelancers.map((f) => ({ id: f.id, name: f.name, defaultValue: Number(f.defaultValue), unitIds: f.units.map((u) => u.unitId), sectorRates: f.sectorRates.map((r) => ({ sectorName: r.sectorName, dayValue: Number(r.dayValue) })) }))}
            mine={(mine as ReqRow[]).map(toDTO)}
            toApprove={(toApprove as ReqRow[]).map(toDTO)}
            toPay={(toPay as ReqRow[]).map(toDTO)}
            history={(history as ReqRow[]).map(toDTO)}
            totais={totais}
            limite={LIMITE_DA_LISTA}
          />
        </CardContent>
      </Card>
    </div>
  );
}
