'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { SgoPageHeader } from '@/components/sgo/sgo-page-header';

/**
 * "Chrome" da página: o título registrado aqui alimenta quem precisar dele
 * (abas de trabalho, `document.title`). O cabeçalho persistente que colapsava
 * o título saiu com o kit de layout (v1.143.0): a barra flutuante do kit não
 * tem migalha nem título inline — o título da tela vive no `SgoPageHeader`.
 */
interface PageChromeValue {
  title: string | null;
  setTitle: (t: string | null) => void;
}

const PageChromeContext = createContext<PageChromeValue>({ title: null, setTitle: () => {} });
export const usePageChrome = () => useContext(PageChromeContext);

export function PageChromeProvider({ children }: { children: React.ReactNode }) {
  const [title, setTitle] = useState<string | null>(null);
  const setTitleCb = useCallback((t: string | null) => setTitle(t), []);
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.title = title ? `${title} · SGO Beija Flor` : 'SGO Beija Flor';
  }, [title]);
  return <PageChromeContext.Provider value={{ title, setTitle: setTitleCb }}>{children}</PageChromeContext.Provider>;
}

/**
 * Título de página — desde a v1.143.0 é o cabeçalho do kit de layout
 * (`SgoPageHeader`: 20px/600 + subtítulo 12,5px + ações à direita). A
 * assinatura não mudou de propósito: as ~190 telas que o chamam ganham o
 * cabeçalho novo sem reescrita. A margem negativa cancela o `px-4` do <main>,
 * porque no kit o cabeçalho vai de borda a borda e o conteúdo é que recua.
 */
export function LargeTitle({ title, subtitle, actions }: { title: string; subtitle?: React.ReactNode; actions?: React.ReactNode }) {
  const { setTitle } = usePageChrome();
  useEffect(() => {
    setTitle(title);
    return () => setTitle(null);
  }, [title, setTitle]);

  return (
    <div className="-mx-4 mb-2">
      <SgoPageHeader title={title} subtitle={subtitle} actions={actions} />
    </div>
  );
}
