import { NextResponse } from 'next/server';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { recusaSeAbaFechada } from '@/lib/permissions/guarda-abas';
import { reasonResponse } from '@/lib/api/reason';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { corrigirDocumento } from '@/lib/certificates/corrigir';

const REASONS: Record<string, { msg: string; status: number }> = {
  FORBIDDEN: { msg: 'Sem acesso a este documento', status: 403 },
  NOT_FOUND: { msg: 'Documento não encontrado', status: 404 },
  ESTADO: { msg: 'Só é possível corrigir um documento com correção solicitada pelo RH', status: 409 },
  INVALID: { msg: 'Dados inválidos — confira as datas', status: 400 },
  NO_LINK: { msg: 'Este colaborador não está vinculado a esta unidade', status: 400 },
  NADA_MUDOU: { msg: 'Nada foi alterado — troque o arquivo, as datas ou o colaborador antes de reenviar', status: 400 },
};

/**
 * v1.197.0 — correção de um documento com "Correção solicitada" pelo RH.
 * POST { acao: 'corrigir', attachmentPath?, startDate?, endDate?, collaboratorId?, observation?, aiExtracted? }
 * O arquivo novo sobe antes por /api/certificates/read (que também o lê por IA).
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const negadoRota = await guardaDaRota(user.role, req);
  if (negadoRota) return negadoRota;
  const negado = await recusaSeAbaFechada(user.role, 'CERTIFICATES_TAB_NEW');
  if (negado) return negado;
  const b = await req.json().catch(() => null);
  if (!b || b.acao !== 'corrigir') return NextResponse.json({ error: 'Ação inválida' }, { status: 400 });

  const r = await corrigirDocumento(user, params.id, {
    attachmentPath: typeof b.attachmentPath === 'string' ? b.attachmentPath : undefined,
    startDate: typeof b.startDate === 'string' ? b.startDate : undefined,
    endDate: typeof b.endDate === 'string' ? b.endDate : undefined,
    collaboratorId: typeof b.collaboratorId === 'string' ? b.collaboratorId : undefined,
    observation: typeof b.observation === 'string' ? b.observation : undefined,
    aiExtracted: b.aiExtracted ?? undefined,
  }, requestContext(req));
  if (!r.ok) return reasonResponse(REASONS, r.reason);
  return NextResponse.json({ ok: true, id: r.id, status: r.status, reenviadoAoRh: r.reenviadoAoRh, reenvio: r.reenvio });
}
