import { NextResponse } from 'next/server';
import { comApiKey } from '@/lib/api-global/guarda';
import { prisma } from '@/lib/db/prisma';
import { respostaComCurriculo } from '@/lib/curriculos/arquivo';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/curriculos/{id}/anexo — o arquivo do currículo (PDF/JPG/PNG) para
 * o sistema do RH. Mesma trava da lista: chave com a leitura liberada.
 * A PRIMEIRA leitura fica marcada no currículo (`rhReadAt`) e na linha do
 * tempo — é o que mostra ao gerente que o RH já abriu o arquivo.
 */
export const GET = comApiKey(async (req, cliente) => {
  const k = await prisma.apiClient.findUnique({ where: { id: cliente.id }, select: { canReadResumes: true } });
  if (!k?.canReadResumes) return NextResponse.json({ error: 'Sem acesso', detail: 'Esta chave não tem a leitura de currículos liberada.' }, { status: 403 });
  const id = new URL(req.url).pathname.split('/').filter(Boolean)[3] ?? '';
  const c = await prisma.candidateResume.findUnique({ where: { id }, select: { id: true, attachmentPath: true, attachmentMime: true, rhReadAt: true } });
  if (!c) return new Response('Currículo não encontrado', { status: 404 });
  const res = await respostaComCurriculo(c.attachmentPath, c.attachmentMime, `curriculo-${c.id}`);
  if (res.status === 200 && !c.rhReadAt) {
    const marcou = await prisma.candidateResume.updateMany({ where: { id: c.id, rhReadAt: null }, data: { rhReadAt: new Date() } }).catch(() => ({ count: 0 }));
    if (marcou.count === 1) {
      await prisma.candidateResumeEvent.create({ data: { resumeId: c.id, kind: 'LEITURA_RH', origem: 'RH', actorName: cliente.name } }).catch(() => {});
    }
  }
  return res;
});
