import { NextResponse } from 'next/server';
import { pushPublicKey } from '@/lib/push/send';

export const dynamic = 'force-dynamic';

/** Chave pública VAPID (pode ser pública por definição). Vazia = push desligado. */
export async function GET() {
  return NextResponse.json({ key: pushPublicKey() });
}
