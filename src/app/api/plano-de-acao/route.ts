import { NextResponse } from 'next/server';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { atualizarAcaoPelaUnidade } from '@/lib/supervisor/operacional';

/**
 * A unidade atualiza a própria ação do plano (v1.155.0): "Em andamento" ou
 * "Resolvido pela unidade" (→ aguardando validação do supervisor na visita).
 * Validar NÃO é por aqui: é presencial, na visita seguinte.
 */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const negado = await guardaDaRota(user.role, req);
  if (negado) return negado;
  const b = await req.json().catch(() => null);
  if (!b?.actionId || !b?.status) return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 });
  const r = await atualizarAcaoPelaUnidade(user, { actionId: String(b.actionId), status: b.status, nota: b.nota ? String(b.nota) : null }, requestContext(req));
  if (!r.ok) {
    const st = r.reason === 'FORBIDDEN' ? 403 : r.reason === 'NAO_ENCONTRADO' ? 404 : r.reason === 'ENCERRADA' ? 409 : 400;
    const msg = r.reason === 'ENCERRADA' ? 'Esta ação já foi validada como resolvida.' : r.reason === 'FORBIDDEN' ? 'Sem permissão para esta unidade.' : 'Dados inválidos.';
    return NextResponse.json({ error: msg }, { status: st });
  }
  return NextResponse.json({ ok: true });
}
