import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { revokeRefresh, requestContext } from '@/lib/auth/service';
import { readAccessPayload, ACCESS_COOKIE, REFRESH_COOKIE } from '@/lib/auth/session';

export async function POST(req: Request) {
  const refresh = cookies().get(REFRESH_COOKIE)?.value;
  const payload = readAccessPayload();

  if (refresh) {
    await revokeRefresh(refresh, payload?.sub, requestContext(req));
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.delete(ACCESS_COOKIE);
  res.cookies.delete(REFRESH_COOKIE);
  return res;
}
