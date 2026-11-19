import { getSessionUser } from '@/lib/auth/session';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { getDemanda } from '@/lib/rh/demandas';
import { respostaComAnexo } from '@/lib/rh/demanda-arquivo';

export const dynamic = 'force-dynamic';

/**
 * Um anexo da solicitação ao RH (`?n=` = posição, a partir de 0). Passa a
 * matriz E o escopo por unidade — `getDemanda` só devolve o que é do alcance.
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user) return new Response('Não autenticado', { status: 401 });
  const negado = await guardaDaRota(user.role, req);
  if (negado) return negado;
  const d = await getDemanda(user, params.id);
  if (!d) return new Response('Solicitação não encontrada', { status: 404 });
  const n = Number(new URL(req.url).searchParams.get('n') ?? '0');
  const anexo = Number.isInteger(n) ? d.arquivos[n] : undefined;
  if (!anexo) return new Response('Anexo não encontrado', { status: 404 });
  return respostaComAnexo(anexo);
}
