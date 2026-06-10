import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

export const dynamic = 'force-dynamic';

/**
 * Health check (Fase 0.5 / 0.6). Usado pelo Docker HEALTHCHECK e pelo monitor
 * externo (UptimeRobot). Retorna 200 se o app e o banco respondem.
 */
export async function GET() {
  const startedAt = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({
      status: 'ok',
      db: 'up',
      uptimeMs: Math.round(process.uptime() * 1000),
      latencyMs: Date.now() - startedAt,
      time: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json(
      { status: 'degraded', db: 'down', time: new Date().toISOString() },
      { status: 503 },
    );
  }
}
