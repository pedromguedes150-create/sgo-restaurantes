'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { AreaMontada } from '@/lib/nav/areas';
import {
  STORAGE_KEY, abrir, ativar, estadoInicial, fechar, lerArmazenadas, navegou, retitular, vizinha,
  type AbaDeTrabalho, type EstadoDasAbas,
} from '@/lib/nav/workspace-tabs';

/**
 * Estado das abas de trabalho (kit de layout, 2-moldura/TabsContext.tsx),
 * adaptado ao App Router: `usePathname` + `useSearchParams` no lugar do
 * `useLocation` do wouter; o estado nasce VAZIO e é hidratado num efeito
 * (ler localStorage no inicializador do useState quebraria a hidratação).
 */
interface TabsValue {
  tabs: AbaDeTrabalho[];
  activeTabId: string | null;
  pronto: boolean;
  activateTab: (id: string) => void;
  closeTab: (id: string) => void;
  openNewTab: (route?: string) => void;
  nextTab: () => void;
  prevTab: () => void;
  closeCurrentTab: () => void;
}

const TabsContext = createContext<TabsValue | null>(null);

export function TabsProvider({ areas, children }: { areas: AreaMontada[]; children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname() ?? '/';
  const params = useSearchParams();
  const rota = useMemo(() => { const q = params?.toString(); return q ? `${pathname}?${q}` : pathname; }, [pathname, params]);

  const [estado, setEstado] = useState<EstadoDasAbas>({ tabs: [], activeTabId: null });
  const [pronto, setPronto] = useState(false);
  /* Evita que ativar/fechar/abrir — que já apontam a rota da aba — sejam
     lidos como "navegação comum" e sobrescrevam a aba recém-ativada. */
  const trocando = useRef(false);

  useEffect(() => {
    let raw: string | null = null;
    try { raw = window.localStorage.getItem(STORAGE_KEY); } catch { raw = null; }
    const guardado = lerArmazenadas(raw);
    setEstado(guardado ? navegou(retitular(guardado, areas), rota, areas) : estadoInicial(rota, areas));
    setPronto(true);
    // só na montagem: a rota atual entra como aba ativa (ou atualiza a guardada)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!pronto) return;
    if (trocando.current) { trocando.current = false; return; }
    setEstado((e) => navegou(e, rota, areas));
  }, [rota, pronto, areas]);

  useEffect(() => {
    if (!pronto) return;
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(estado)); } catch { /* sem armazenamento: as abas vivem só nesta sessão */ }
  }, [estado, pronto]);

  const irPara = useCallback((route: string) => { trocando.current = true; router.push(route); }, [router]);

  const activateTab = useCallback((id: string) => {
    setEstado((e) => {
      const alvo = e.tabs.find((t) => t.id === id);
      if (!alvo) return e;
      if (alvo.route !== rota) irPara(alvo.route);
      return ativar(e, id);
    });
  }, [irPara, rota]);

  const closeTab = useCallback((id: string) => {
    setEstado((e) => {
      const novo = fechar(e, id);
      if (novo !== e && novo.activeTabId !== e.activeTabId) {
        const alvo = novo.tabs.find((t) => t.id === novo.activeTabId);
        if (alvo) irPara(alvo.route);
      }
      return novo;
    });
  }, [irPara]);

  const openNewTab = useCallback((route = '/dashboard') => {
    setEstado((e) => { const novo = abrir(e, route, areas); irPara(novo.tabs[novo.tabs.length - 1].route); return novo; });
  }, [areas, irPara]);

  const nextTab = useCallback(() => setEstado((e) => { const id = vizinha(e, 1); if (id) { const t = e.tabs.find((x) => x.id === id)!; irPara(t.route); return ativar(e, id); } return e; }), [irPara]);
  const prevTab = useCallback(() => setEstado((e) => { const id = vizinha(e, -1); if (id) { const t = e.tabs.find((x) => x.id === id)!; irPara(t.route); return ativar(e, id); } return e; }), [irPara]);
  const closeCurrentTab = useCallback(() => { if (estado.activeTabId) closeTab(estado.activeTabId); }, [closeTab, estado.activeTabId]);

  const value = useMemo<TabsValue>(() => ({
    tabs: estado.tabs, activeTabId: estado.activeTabId, pronto, activateTab, closeTab, openNewTab, nextTab, prevTab, closeCurrentTab,
  }), [estado, pronto, activateTab, closeTab, openNewTab, nextTab, prevTab, closeCurrentTab]);

  return <TabsContext.Provider value={value}>{children}</TabsContext.Provider>;
}

export function useTabs(): TabsValue {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error('useTabs deve ser usado dentro de <TabsProvider>.');
  return ctx;
}
