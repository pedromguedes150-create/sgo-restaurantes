import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { prisma } from '@/lib/db/prisma';
import { audit } from '@/lib/audit';
import { TERMS_VERSION } from '@/lib/lgpd';

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  await prisma.user.update({ where: { id: user.id }, data: { termsAcceptedAt: new Date(), termsVersion: TERMS_VERSION } });
  await audit({ userId: user.id, action: 'TERMS_ACCEPT', module: 'LGPD', metadata: { version: TERMS_VERSION }, ...requestContext(req) });
  return NextResponse.json({ ok: true });
}
