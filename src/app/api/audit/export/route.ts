import { getSessionUser } from '@/lib/auth/session';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { canViewAudit, getAuditForExport } from '@/lib/audit-query';

export const dynamic = 'force-dynamic';

/** Export CSV do Log de Auditoria (Admin/CEO). Filtros: module, days. */
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return new Response('Não autenticado', { status: 401 });
  const negado = await guardaDaRota(user.role, req);
  if (negado) return negado;
  if (!canViewAudit(user)) return new Response('Restrito ao Administrador/Diretoria', { status: 403 });

  const url = new URL(req.url);
  const mod = url.searchParams.get('module') || undefined;
  const days = Number(url.searchParams.get('days')) || 30;

  const rows = await getAuditForExport({ module: mod, days });

  const sep = ';';
  const esc = (s: string) => `"${(s ?? '').replace(/"/g, "'")}"`;
  const lines = [['Data/hora', 'Ação', 'Módulo', 'Usuário', 'Unidade', 'Entidade', 'ID', 'IP'].join(sep)];
  for (const r of rows) {
    lines.push([
      esc(r.createdAt.toLocaleString('pt-BR')),
      esc(r.action),
      esc(r.module),
      esc(r.user),
      esc(r.unit),
      esc(r.entity),
      esc(r.entityId),
      esc(r.ip),
    ].join(sep));
  }
  const title = `Log de Auditoria - ultimos ${days} dias${mod ? ` - ${mod}` : ''}`;
  const csv = '﻿' + `"${title}"\n` + lines.join('\n');

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="auditoria-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
