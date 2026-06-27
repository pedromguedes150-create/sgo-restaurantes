import { getSessionUser } from '@/lib/auth/session';
import { listCertificates } from '@/lib/certificates/query';
import { canSeeCid, certTypeLabel } from '@/lib/certificates/labels';

function daysInMonth(ym: string): number { const [y, m] = ym.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); }

/** Exporta os atestados do mês em CSV (abre no Excel). ?mes=yyyy-mm */
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return new Response('Não autenticado', { status: 401 });
  const url = new URL(req.url);
  const now = new Date();
  const ym = /^\d{4}-\d{2}$/.test(url.searchParams.get('mes') ?? '') ? url.searchParams.get('mes')! : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const from = `${ym}-01`, to = `${ym}-${String(daysInMonth(ym)).padStart(2, '0')}`;
  const showCid = canSeeCid(user.role);

  const rows = await listCertificates(user, { from, to });

  const sep = ';';
  const header = ['Unidade', 'Colaborador', 'Tipo', 'Início', 'Fim', 'Dias', 'Horas', 'Médico', 'CRM'];
  if (showCid) header.push('CID', 'CID (descrição)');
  header.push('Lançado por');
  const lines = [header.join(sep)];
  for (const r of rows) {
    const cols = [
      `"${r.unitName}"`, `"${r.collaboratorName}"`, `"${certTypeLabel(r.type)}"`,
      r.startDate, r.type === 'HOURS' ? '' : r.endDate, r.type === 'HOURS' ? '' : String(r.days),
      r.hours != null ? String(r.hours).replace('.', ',') : '', `"${r.doctorName ?? ''}"`, `"${r.doctorCrm ?? ''}"`,
    ];
    if (showCid) cols.push(`"${r.cid ?? ''}"`, `"${r.cidDescription ?? ''}"`);
    cols.push(`"${r.by ?? ''}"`);
    lines.push(cols.join(sep));
  }
  const csv = '﻿' + `"Atestados - ${ym}"\n` + lines.join('\n');
  return new Response(csv, {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="atestados-${ym}.csv"` },
  });
}
