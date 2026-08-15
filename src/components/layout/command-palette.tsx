'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Search, Building2, CornerDownLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NAV_GROUPS, HEADER_DESTINATIONS, type IconType } from '@/components/layout/nav-data';
import { shortUnitName } from '@/lib/unit-name';
import { UNIT_COOKIE, UNIT_PARAM } from '@/lib/scope/unit-context';
import type { UnitOption } from '@/components/layout/unit-switcher';

export const OPEN_COMMAND_EVENT = 'sgo:open-command';

interface Cmd { id: string; label: string; group: string; icon: IconType; href?: string; unitId?: string }
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function CommandPalette({ units = [], viewable, isAdmin = false }: { units?: UnitOption[]; viewable?: string[]; isAdmin?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const canSee = useCallback((href: string) => !viewable || viewable.includes(href), [viewable]);

  const commands = useMemo<Cmd[]>(() => {
    const nav: Cmd[] = NAV_GROUPS.flatMap((g) =>
      g.items
        .filter((it) => (!it.adminOnly || isAdmin) && canSee(it.href))
        .map((it) => ({ id: `nav:${it.href}`, label: it.label, group: g.title, icon: it.icon, href: it.href })),
    );
    const header: Cmd[] = HEADER_DESTINATIONS.map((d) => ({ id: `hdr:${d.href}`, label: d.label, group: 'Atalhos', icon: d.icon, href: d.href }));
    const unitCmds: Cmd[] = units.length > 1
      ? units.map((u) => ({ id: `unit:${u.id}`, label: shortUnitName(u.name), group: 'Trocar unidade', icon: Building2, unitId: u.id }))
      : [];
    return [...nav, ...header, ...unitCmds];
  }, [units, isAdmin, canSee]);

  const filtered = useMemo(() => {
    const q = norm(query.trim());
    if (!q) return commands;
    return commands.filter((c) => norm(c.label).includes(q) || norm(c.group).includes(q));
  }, [commands, query]);

  useEffect(() => { setActive(0); }, [query]);

  // Atalho global ⌘K / Ctrl+K + evento do botão de busca no header.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen((v) => !v); }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener(OPEN_COMMAND_EVENT, onOpen);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener(OPEN_COMMAND_EVENT, onOpen); };
  }, []);

  useEffect(() => {
    if (open) { setQuery(''); setActive(0); setTimeout(() => inputRef.current?.focus(), 0); }
  }, [open]);

  const run = useCallback((c: Cmd) => {
    setOpen(false);
    if (c.href) { router.push(c.href); return; }
    if (c.unitId) {
      document.cookie = `${UNIT_COOKIE}=${c.unitId}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
      const next = new URLSearchParams(Array.from(params.entries()));
      next.set(UNIT_PARAM, c.unitId);
      router.replace(`${pathname}?${next.toString()}`);
      router.refresh();
    }
  }, [router, pathname, params]);

  function onListKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); const c = filtered[active]; if (c) run(c); }
    else if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
  }

  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[12vh]" onClick={() => setOpen(false)} role="dialog" aria-modal="true" aria-label="Buscar e navegar">
      <div className="w-full max-w-xl overflow-hidden rounded-sheet border border-line bg-sgo-surface shadow-2xl" onClick={(e) => e.stopPropagation()} onKeyDown={onListKey}>
        <div className="flex items-center gap-2 border-b border-line px-3">
          <Search className="h-4 w-4 shrink-0 text-ink-400" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar módulo, atalho ou unidade…"
            className="h-12 w-full bg-transparent text-[15px] text-ink-900 outline-none placeholder:text-ink-500"
            aria-label="Buscar"
          />
          <kbd className="hidden rounded-control border border-line-strong px-1.5 py-0.5 text-[11px] font-medium text-ink-500 sm:inline">Esc</kbd>
        </div>

        <ul ref={listRef} className="max-h-[52vh] overflow-auto p-1.5" role="listbox">
          {filtered.length === 0 && <li className="px-3 py-6 text-center text-[14px] text-ink-500">Nada encontrado.</li>}
          {filtered.map((c, i) => {
            const Icon = c.icon;
            const isActive = i === active;
            return (
              <li key={c.id} data-idx={i} role="option" aria-selected={isActive}>
                <button
                  type="button"
                  onClick={() => run(c)}
                  onMouseMove={() => setActive(i)}
                  className={cn('flex w-full items-center gap-2.5 rounded-control px-2.5 py-2 text-left outline-none', isActive ? 'bg-sgo-brand-tint' : '')}
                >
                  <Icon className={cn('h-4 w-4 shrink-0', isActive ? 'text-sgo-brand' : 'text-ink-400')} />
                  <span className={cn('flex-1 text-[14px]', isActive ? 'font-medium text-sgo-brand' : 'text-ink-700')}>{c.label}</span>
                  <span className="text-[11px] text-ink-500">{c.group}</span>
                  {isActive && <CornerDownLeft className="h-3.5 w-3.5 text-ink-400" />}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
