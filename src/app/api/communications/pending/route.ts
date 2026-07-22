import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { getPendingInterstitials } from '@/lib/communications/query';

/** Comunicados pendentes do usuário — para o interstitial de abertura do app (20/07). */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ items: [] });
  const items = await getPendingInterstitials(user);
  return NextResponse.json({ items });
}
