import { PrismaClient } from '@prisma/client';

/**
 * Singleton do Prisma — evita esgotar conexões em hot-reload (Next dev).
 *
 * v1.206.0 — POOL: o padrão do Prisma é (nº de CPUs × 2 + 1) = 5 conexões no
 * servidor de 2 vCPUs. Com várias unidades usando ao mesmo tempo, as consultas
 * faziam FILA esperando conexão (a tela "trava" sem o banco estar ocupado). Em
 * produção o pool sobe para 20 (o Postgres aceita 100), a menos que a própria
 * DATABASE_URL já diga outro valor.
 */
export function urlComPool(url: string | undefined, producao: boolean): string | undefined {
  if (!url || !producao || /[?&]connection_limit=/.test(url)) return url;
  return url + (url.includes('?') ? '&' : '?') + 'connection_limit=20&pool_timeout=20';
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const url = urlComPool(process.env.DATABASE_URL, process.env.NODE_ENV === 'production');

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    ...(url ? { datasources: { db: { url } } } : {}),
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
