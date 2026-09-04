import { getSessionUser } from '@/lib/auth/session';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import type { NoteStatus } from '@prisma/client';

const ST = { RECEIVED: 'Recebida', PAID: 'Paga', PROBLEM: 'Com problema', RETURNED: 'Devolvida' } as const;
const d = (v: Date | null) => (v ? v.toISOString().slice(0, 10).split('-').reverse().join('/') : '');

/** Exporta notas recebidas em CSV. ?dias=60&unidade=&fornecedor=&status= */
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return new Response('Não autenticado', { status: 401 });
  const negado = await guardaDaRota(user.role, req);
  if (negado) return negado;
  const url = new URL(req.url);
  const dias = [60, 90, 180, 365].includes(Number(url.searchParams.get('dias'))) ? Number(url.searchParams.get('dias')) : 60;
  const unidade = url.searchParams.get('unidade') ?? '';
  const fornecedor = url.searchParams.get('fornecedor') ?? '';
  const status = url.searchParams.get('status') as NoteStatus | null;
  const since = new Date(Date.now() - dias * 24 * 60 * 60 * 1000);

  const rows = await prisma.receivedNote.findMany({
    where: {
      ...unitScopeWhere(user, 'unitId'),
      createdAt: { gte: since },
      ...(fornecedor ? { supplierName: fornecedor } : {}),
      ...(status && ['RECEIVED', 'PAID', 'PROBLEM', 'RETURNED'].includes(status) ? { status } : {}),
      ...(unidade ? { unit: { name: unidade } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 2000,
    include: { unit: { select: { name: true } }, createdBy: { select: { name: true } } },
  });

  const sep = ';';
  const lines = [['Lançada em', 'Unidade', 'Fornecedor', 'CNPJ', 'Número', 'Emissão', 'Vencimento', 'Valor (R$)', 'Produto', 'Status', 'Problema/Devolução', 'Observação', 'Lançada por', 'Fora do prazo'].join(sep)];
  for (const n of rows) {
    lines.push([
      n.createdAt.toLocaleDateString('pt-BR'), `"${n.unit.name}"`, `"${n.supplierName}"`, `"${n.supplierCnpj ?? ''}"`, `"${n.number ?? ''}"`,
      d(n.issueDate), d(n.dueDate), String(Number(n.totalValue)).replace('.', ','), `"${n.productType ?? ''}"`, ST[n.status],
      `"${(n.problemNote ?? '').replace(/"/g, "'")}"`, `"${(n.observation ?? '').replace(/"/g, "'")}"`, `"${n.createdBy?.name ?? ''}"`,
      n.dateEdited ? 'Data corrigida' : n.supervisorLaunched ? 'Lançada pela supervisão' : '',
    ].join(sep));
  }
  const csv = '﻿' + `"Notas Recebidas — últimos ${dias} dias"\n` + lines.join('\n');
  return new Response(csv, {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="notas-${new Date().toISOString().slice(0, 10)}.csv"` },
  });
}
