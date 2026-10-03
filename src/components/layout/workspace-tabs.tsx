'use client';

import { useEffect, useRef, useState } from 'react';
import { AppWindow, ChevronRight, Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTabs } from '@/components/layout/tabs-context';
import { ICONES_DE_AREA } from '@/components/layout/icones-de-area';
import { MAX_ABAS, iconeDaRota } from '@/lib/nav/workspace-tabs';
import type { AreaMontada } from '@/lib/nav/areas';

/**
 * Abas de trabalho (kit de layout, 2-moldura/WorkspaceTabs.tsx): dock de
 * vidro no rodapé no desktop; no celular, um botão flutuante que abre uma
 * folha com as janelas abertas. Classes e estrutura são as do kit
 * (sgo-kit.css, seção 25); o ícone de cada aba sai da ÁREA dona da rota.
 *
 * Atalhos Ctrl+Tab / Ctrl+W / Ctrl+T / Ctrl+1..9 como no kit — no navegador
 * comum o Chrome reserva esses atalhos; valem no PWA instalado.
 */
export function WorkspaceTabs({ areas }: { areas: AreaMontada[] }) {
  const { tabs, activeTabId, pronto, activateTab, closeTab, openNewTab, nextTab, prevTab, closeCurrentTab } = useTabs();
  const [mobileOpen, setMobileOpen] = useState(false);
  const activeTabRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = activeTabRef.current; const c = scrollRef.current;
    if (!el || !c) return;
    const l = el.offsetLeft, r = l + el.offsetWidth, cl = c.scrollLeft, cr = cl + c.offsetWidth;
    if (l < cl) c.scrollTo({ left: l - 8, behavior: 'smooth' });
    else if (r > cr) c.scrollTo({ left: r - c.offsetWidth + 8, behavior: 'smooth' });
  }, [activeTabId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey) return;
      const a = document.activeElement;
      const emCampo = a instanceof HTMLInputElement || a instanceof HTMLTextAreaElement || a instanceof HTMLSelectElement;
      if (e.key === 'Tab') { e.preventDefault(); if (e.shiftKey) prevTab(); else nextTab(); return; }
      if ((e.key === 'w' || e.key === 'W') && !emCampo) { e.preventDefault(); closeCurrentTab(); return; }
      if ((e.key === 't' || e.key === 'T') && !emCampo) { e.preventDefault(); openNewTab(); return; }
      const n = parseInt(e.key, 10);
      if (!Number.isNaN(n) && n >= 1 && n <= 9 && tabs[n - 1]) { e.preventDefault(); activateTab(tabs[n - 1].id); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [nextTab, prevTab, closeCurrentTab, openNewTab, tabs, activateTab]);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMobileOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobileOpen]);

  if (!pronto || tabs.length === 0) return null;

  const Icone = (route: string) => ICONES_DE_AREA[iconeDaRota(route, areas) ?? ''] ?? ChevronRight;

  return (
    <>
      <div className="workspace-dock print:hidden" data-testid="workspace-tabs-bar" role="tablist" aria-label="Abas abertas">
        <div ref={scrollRef} className="workspace-dock-scroll">
          {tabs.map((tab, idx) => {
            const ativa = tab.id === activeTabId;
            const I = Icone(tab.route);
            const dica = `${tab.fullTitle ?? tab.title}${idx < 9 ? ` — Ctrl+${idx + 1}` : ''}`;
            return (
              <div key={tab.id} ref={ativa ? activeTabRef : null} role="tab" aria-selected={ativa} className={cn('workspace-dock-tab', ativa && 'active')} title={dica}>
                <button type="button" onClick={() => activateTab(tab.id)} className="workspace-dock-tab-btn">
                  <I className="workspace-dock-tab-icon" aria-hidden="true" />
                  <span className="workspace-dock-tab-label">{tab.title}</span>
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
                  disabled={tabs.length <= 1}
                  className={cn('workspace-dock-tab-close', tabs.length <= 1 && 'invisible')}
                  title="Fechar (Ctrl+W)"
                  aria-label={`Fechar ${tab.title}`}
                >
                  <X style={{ width: 9, height: 9 }} />
                </button>
              </div>
            );
          })}
        </div>
        {tabs.length < MAX_ABAS && (
          <button type="button" className="workspace-dock-new-tab" onClick={() => openNewTab()} title="Nova aba (Ctrl+T)" aria-label="Abrir nova aba">
            <Plus style={{ width: 11, height: 11 }} />
          </button>
        )}
      </div>

      <button type="button" className="workspace-mobile-fab print:hidden" onClick={() => setMobileOpen(true)} aria-label={`${tabs.length} janela(s) aberta(s)`}>
        <AppWindow className="workspace-mobile-fab-icon" aria-hidden="true" />
        <span className="workspace-mobile-fab-count">{tabs.length}</span>
      </button>

      {mobileOpen && (
        <>
          <div className="workspace-sheet-backdrop" onClick={() => setMobileOpen(false)} aria-hidden="true" />
          <div className="workspace-sheet" role="dialog" aria-modal="true" aria-label="Janelas abertas">
            <div className="workspace-sheet-handle" />
            <div className="workspace-sheet-header">
              <span className="workspace-sheet-title">Janelas abertas</span>
              <span className="workspace-sheet-badge">{tabs.length}</span>
              <button type="button" className="workspace-sheet-close-btn" onClick={() => setMobileOpen(false)} aria-label="Fechar"><X className="h-4 w-4" /></button>
            </div>
            <div className="workspace-sheet-list">
              {tabs.map((tab) => {
                const ativa = tab.id === activeTabId;
                const I = Icone(tab.route);
                return (
                  <div key={tab.id} className={cn('workspace-sheet-item', ativa && 'active')}>
                    <button type="button" className="workspace-sheet-item-btn" onClick={() => { activateTab(tab.id); setMobileOpen(false); }}>
                      <span className="workspace-sheet-item-icon-wrap"><I className="workspace-sheet-item-icon" aria-hidden="true" /></span>
                      <span className="workspace-sheet-item-text">
                        <span className="workspace-sheet-item-title">{tab.title}</span>
                        {tab.fullTitle && <span className="workspace-sheet-item-sub">{tab.fullTitle}</span>}
                      </span>
                      {ativa && <span className="workspace-sheet-item-active-dot" aria-hidden="true" />}
                    </button>
                    <button type="button" className="workspace-sheet-item-close" onClick={() => closeTab(tab.id)} disabled={tabs.length <= 1} aria-label={`Fechar ${tab.title}`}>
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </>
  );
}
