'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';

/**
 * "Chrome" da página (Onda 1): coordena o título grande (34px) do conteúdo com
 * o header persistente. Ao rolar, o título grande sai de cena e o header mostra
 * o título inline (17px); a barra só ganha borda depois de 28px de scroll.
 *
 * Context com default não-lançável: o header funciona mesmo sem provider
 * (degradado — mostra o rótulo do breadcrumb sempre, como as telas legadas).
 */
interface PageChromeValue {
  title: string | null;
  setTitle: (t: string | null) => void;
  scrolled: boolean; // > 28px → borda no header
  collapsed: boolean; // > 72px → título inline no header
}

const PageChromeContext = createContext<PageChromeValue>({ title: null, setTitle: () => {}, scrolled: false, collapsed: false });
export const usePageChrome = () => useContext(PageChromeContext);

const SCROLL_BORDER = 28;
const SCROLL_COLLAPSE = 72;

export function PageChromeProvider({ children }: { children: React.ReactNode }) {
  const [title, setTitle] = useState<string | null>(null);
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    const onScroll = () => setScrollY(window.scrollY);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const setTitleCb = useCallback((t: string | null) => setTitle(t), []);

  return (
    <PageChromeContext.Provider value={{ title, setTitle: setTitleCb, scrolled: scrollY > SCROLL_BORDER, collapsed: scrollY > SCROLL_COLLAPSE }}>
      {children}
    </PageChromeContext.Provider>
  );
}

/**
 * Título grande da página (34px). Registra o título no chrome para o header
 * poder colapsá-lo ao rolar. Use no topo do conteúdo de cada tela redesenhada.
 */
export function LargeTitle({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  const { setTitle } = usePageChrome();
  useEffect(() => {
    setTitle(title);
    return () => setTitle(null);
  }, [title, setTitle]);

  return (
    <div className="mb-6 flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="sgo-type-34 font-bold text-ink-900">{title}</h1>
        {subtitle && <p className="sgo-body mt-1 text-ink-500">{subtitle}</p>}
      </div>
      {actions && <div className="shrink-0">{actions}</div>}
    </div>
  );
}
