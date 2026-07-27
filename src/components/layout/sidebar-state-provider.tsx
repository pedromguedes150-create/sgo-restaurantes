'use client';

import { createContext, useContext, useState } from 'react';
import { sidebarCookieValue } from '@/lib/sidebar-state';

/**
 * Estado de recolhimento compartilhado entre o header (onde fica o botão) e a
 * sidebar (que muda de largura). Vive num contexto porque o `layout.tsx` é
 * server component e não pode segurar `useState`.
 *
 * A persistência continua no cookie `sgo_sidebar`: o servidor lê e injeta em
 * `defaultCollapsed`, então o HTML já chega na largura certa (sem piscar), e o
 * clique reescreve o cookie sem round-trip.
 */

interface SidebarStateValue {
  collapsed: boolean;
  toggle: () => void;
}

const SidebarStateContext = createContext<SidebarStateValue | null>(null);

export function SidebarStateProvider({
  defaultCollapsed = false,
  children,
}: {
  defaultCollapsed?: boolean;
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = sidebarCookieValue(next);
  };

  return <SidebarStateContext.Provider value={{ collapsed, toggle }}>{children}</SidebarStateContext.Provider>;
}

export function useSidebarState(): SidebarStateValue {
  const ctx = useContext(SidebarStateContext);
  if (!ctx) throw new Error('useSidebarState precisa estar dentro de <SidebarStateProvider>.');
  return ctx;
}
