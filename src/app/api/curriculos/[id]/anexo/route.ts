import { getSessionUser } from '@/lib/auth/session';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { getCurriculo } from '@/lib/curriculos/curriculos';
import { respostaComCurriculo } from '@/lib/curriculos/arquivo';

export const dynamic = 'force-dynamic';

/**
 * O arquivo do currículo para a tela. Diferente de `/uploads/…` (que serve a
 * qualquer logado), aqui passa a matriz E o escopo por unidade.
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user) return new Response('Não autenticado', { status: 401 });
  const negado = await guardaDaRota(user.role, req);
  if (negado) return negado;
  const c = await getCurriculo(user, params.id);
  if (!c) return new Response('Currículo não encontrado', { status: 404 });
  return respostaComCurriculo(c.attachmentPath, c.attachmentMime, `curriculo-${c.candidateName}`);
}
