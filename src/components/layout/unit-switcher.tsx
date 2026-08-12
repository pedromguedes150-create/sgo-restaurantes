'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Check, ChevronsUpDown, Building2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { shortUnitName } from '@/lib/unit-name';
import { UNIT_COOKIE, UNIT_PARAM } from '@/lib/scope/unit-context';

export interface UnitOption { id: string; name: string }

export function UnitSwitcher({ units, selectedId }: { units: UnitOption[]; selectedId: string | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  if (units.length === 0) return null;
  const selected = units.find((u) => u.id === selectedId) ?? units[0];

  // Uma unidade só: rótulo estático, sem dropdown.
  if (units.length === 1) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-control px-2 text-[13px] font-medium text-ink-700" title={selected.name}>
        <Building2 className="h-4 w-4 shrink-0 text-ink-400" />
        <span className="max-w-[10rem] truncate">{shortUnitName(selected.name)}</span>
      </span>
    );
  }

  function choose(id: string) {
    setOpen(false);
    if (id === selectedId) return;
    document.cookie = `${UNIT_COOKIE}=${id}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    const next = new URLSearchParams(Array.from(params.entries()));
    next.set(UNIT_PARAM, id);
    router.replace(`${pathname}?${next.toString()}`);
    router.refresh();
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="inline-flex h-9 items-center gap-1.5 rounded-control border border-line-strong bg-sgo-surface px-2.5 text-[13px] font-medium text-ink-900 outline-none transition-colors duration-sgo-1 ease-sgo-std hover:bg-sunken focus-visible:shadow-sgo-focus"
      >
        <Building2 className="h-4 w-4 shrink-0 text-ink-400" />
        <span className="max-w-[9rem] truncate">{shortUnitName(selected.name)}</span>
        <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-ink-400" />
      </button>

      {open && (
        <ul
          role="listbox"
          className="absolute left-0 top-full z-40 mt-1 max-h-[60vh] w-64 overflow-auto rounded-card border border-line bg-sgo-surface p-1 shadow-lg"
        >
          {units.map((u) => {
            const active = u.id === selected.id;
            return (
              <li key={u.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => choose(u.id)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-control px-2 py-2 text-left text-[14px] outline-none transition-colors duration-sgo-1 ease-sgo-std focus-visible:shadow-sgo-focus',
                    active ? 'bg-sgo-brand-tint text-sgo-brand' : 'text-ink-700 hover:bg-sunken',
                  )}
                >
                  <Check className={cn('h-4 w-4 shrink-0', active ? 'text-sgo-brand' : 'text-transparent')} />
                  <span className="flex-1">
                    <span className="block font-medium">{shortUnitName(u.name)}</span>
                    <span className="block text-[11px] text-ink-400">{u.name}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
