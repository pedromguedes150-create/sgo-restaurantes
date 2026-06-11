import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { prisma } from '@/lib/db/prisma';
import { audit } from '@/lib/audit';

/** LGPD: exporta os dados de um colaborador (Admin). Direito do titular. */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (user.role !== 'ADMIN' && user.role !== 'CEO') return NextResponse.json({ error: 'Apenas Admin' }, { status: 403 });

  const collaborator = await prisma.collaborator.findUnique({
    where: { id: params.id },
    include: { units: { include: { unit: { select: { name: true } } } }, vacations: true, schedule: true },
  });
  if (!collaborator) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });

  await audit({ userId: user.id, action: 'LGPD_EXPORT', module: 'LGPD', entity: 'collaborator', entityId: params.id, ...requestContext(req) });
  return NextResponse.json({ exportedAt: new Date().toISOString(), collaborator });
}
