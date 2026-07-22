'use client';

import { useEffect } from 'react';

/**
 * Registra o service worker em todas as telas logadas — necessário para o app
 * ser instalável (tela de início) e para o push chegar com o app fechado.
 * Não faz cache: o SW só trata push/clique (ver public/sw.js).
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    const onLoad = () => {
      navigator.serviceWorker.register('/sw.js').catch((err) => console.error('[pwa] falha ao registrar o service worker:', err));
    };
    if (document.readyState === 'complete') onLoad();
    else window.addEventListener('load', onLoad, { once: true });
    return () => window.removeEventListener('load', onLoad);
  }, []);

  return null;
}
