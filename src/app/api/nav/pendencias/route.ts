import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { contarPendencias } from '@/lib/nav/pendencias';

/** Contagens de pendência da barra, por módulo (cada uma com o seu recorte). */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  return NextResponse.json(await contarPendencias(user), { headers: { 'Cache-Control': 'no-store' } });
}
