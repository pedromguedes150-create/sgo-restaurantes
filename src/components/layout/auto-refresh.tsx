'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Atualiza os dados do servidor periodicamente (dashboard/tarefas — atualização
 * a cada 60s, conforme spec). Recarrega apenas os Server Components (router.refresh).
 *
 * v1.206.0 — só com a aba VISÍVEL. Cada atualização refaz todas as consultas do
 * painel; com dezenas de aparelhos deixando o SGO aberto em segundo plano, o
 * servidor passava o dia recalculando telas que ninguém estava olhando. Ao voltar
 * para a aba, atualiza na hora se já passou o intervalo.
 */
export function AutoRefresh({ seconds = 60 }: { seconds?: number }) {
  const router = useRouter();
  const ultima = useRef(Date.now());
  useEffect(() => {
    const atualizar = () => { ultima.current = Date.now(); router.refresh(); };
    const id = setInterval(() => { if (document.visibilityState === 'visible') atualizar(); }, seconds * 1000);
    const aoVoltar = () => {
      if (document.visibilityState === 'visible' && Date.now() - ultima.current >= seconds * 1000) atualizar();
    };
    document.addEventListener('visibilitychange', aoVoltar);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', aoVoltar); };
  }, [router, seconds]);
  return null;
}
