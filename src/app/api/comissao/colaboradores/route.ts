import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getSessionUser } from '@/lib/auth/session';
import { canAccessUnit } from '@/lib/scope/unit-scope';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';

/** Colaboradores ATIVOS de uma unidade — a lista para vincular um vendedor da planilha. Só nome e id. */
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const barrado = await guardaDaRota(user.role, req);
  if (barrado) return barrado;
  const unitId = new URL(req.url).searchParams.get('unitId') ?? '';
  if (!unitId || !canAccessUnit(user, unitId)) return NextResponse.json({ error: 'Unidade fora do seu acesso.' }, { status: 403 });
  const colaboradores = await prisma.collaborator.findMany({
    where: { active: true, units: { some: { unitId } } },
    select: { id: true, name: true, jobTitle: true },
    orderBy: { name: 'asc' },
  });
  return NextResponse.json({ colaboradores: colaboradores.map((c) => ({ id: c.id, name: c.jobTitle ? `${c.name} · ${c.jobTitle}` : c.name })) });
}
