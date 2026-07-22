import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { listDevices, getPreferences, subscribeDevice, unsubscribeDevice, removeDeviceById, setPreference, sendTestPush } from '@/lib/push/manage';
import { pushConfigured } from '@/lib/push/send';

export const dynamic = 'force-dynamic';

/** GET — estado do push do próprio usuário (aparelhos + preferências). */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const [devices, prefs] = await Promise.all([listDevices(user), getPreferences(user)]);
  return NextResponse.json({ configured: pushConfigured(), devices, prefs });
}

/** POST { action: 'subscribe' | 'unsubscribe' | 'remove' | 'pref' | 'test' }. */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const b = await req.json().catch(() => null);
  if (!b?.action) return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 });

  if (b.action === 'test') {
    const r = await sendTestPush(user);
    return NextResponse.json(r, { status: r.ok ? 200 : 400 });
  }

  let r;
  if (b.action === 'subscribe') r = await subscribeDevice(user, b.subscription, req.headers.get('user-agent'));
  else if (b.action === 'unsubscribe') r = await unsubscribeDevice(user, String(b.endpoint ?? ''));
  else if (b.action === 'remove') r = await removeDeviceById(user, String(b.id ?? ''));
  else if (b.action === 'pref') r = await setPreference(user, String(b.category ?? ''), Boolean(b.enabled));
  else return NextResponse.json({ error: 'Ação desconhecida' }, { status: 400 });

  if (!r.ok) return NextResponse.json({ error: r.detail }, { status: 400 });
  return NextResponse.json({ ok: true });
}
