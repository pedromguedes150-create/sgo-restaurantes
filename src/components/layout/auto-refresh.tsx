'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Atualiza os dados do servidor periodicamente (dashboard/tarefas — atualização
 * a cada 60s, conforme spec). Recarrega apenas os Server Components (router.refresh).
 */
export function AutoRefresh({ seconds = 60 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);
  return null;
}
