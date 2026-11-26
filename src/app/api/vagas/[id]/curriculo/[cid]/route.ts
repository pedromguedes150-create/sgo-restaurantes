import { getSessionUser } from '@/lib/auth/session';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { prisma } from '@/lib/db/prisma';
import { canAccessUnit } from '@/lib/scope/unit-scope';
import { respostaComArquivo } from '@/lib/vagas/arquivo';

export const dynamic = 'force-dynamic';

/** O arquivo do currículo: só para quem vê vagas E alcança a unidade daquela vaga. */
export async function GET(req: Request, { params }: { params: { id: string; cid: string } }) {
  const user = await getSessionUser();
  if (!user) return new Response('Não autenticado', { status: 401 });
  const negado = await guardaDaRota(user.role, req);
  if (negado) return negado;
  const c = await prisma.vagaCurriculo.findFirst({ where: { id: params.cid, vagaId: params.id }, select: { path: true, mime: true, nomeArquivo: true, vaga: { select: { unitId: true, excluidaEm: true } } } });
  if (!c || c.vaga.excluidaEm || !canAccessUnit(user, c.vaga.unitId)) return new Response('Arquivo não encontrado', { status: 404 });
  return respostaComArquivo(c.path, c.mime, c.nomeArquivo);
}
