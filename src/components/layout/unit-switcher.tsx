'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Check, ChevronsUpDown, Building2, Globe, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { shortUnitName } from '@/lib/unit-name';
import { UNIT_COOKIE, UNIT_PARAM, TODA_A_REDE } from '@/lib/scope/unit-context';

export interface UnitOption { id: string; name: string }

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * SELETOR GLOBAL — a rede inteira ou uma unidade.
 *
 * O que faltava: não havia como dizer "toda a rede". O seletor só listava
 * unidades e o servidor, sem cookie, caía na PRIMEIRA — então quem responde
 * pela rede abria o sistema vendo uma unidade só, escolhida em ordem
 * alfabética, e não tinha como sair disso a não ser por links que já traziam
 * `?unit=todas`. Agora "Toda a Rede" é a primeira opção e um valor de verdade
 * (`TODA_A_REDE`), que fica no cookie e atravessa a navegação.
 *
 * Com UMA unidade no alcance o seletor continua sendo um rótulo: oferecer
 * "toda a rede" a quem tem uma unidade é oferecer a mesma coisa duas vezes.
 */
export function UnitSwitcher({ units, selectedId }: { units: UnitOption[]; selectedId: string | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);
  const [busca, setBusca] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  useEffect(() => { if (!open) setBusca(''); }, [open]);

  const filtradas = useMemo(() => {
    const t = norm(busca.trim());
    return t ? units.filter((u) => norm(u.name).includes(t)) : units;
  }, [units, busca]);

  if (units.length === 0) return null;

  const naRede = selectedId === TODA_A_REDE;
  const unidade = units.find((u) => u.id === selectedId);

  // Uma unidade só: rótulo estático, sem dropdown.
  if (units.length === 1) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-control px-2 text-xs font-medium text-ink-700" title={units[0].name}>
        <Building2 className="h-4 w-4 shrink-0 text-ink-400" />
        <span className="max-w-[10rem] truncate">{shortUnitName(units[0].name)}</span>
      </span>
    );
  }

  function choose(id: string) {
    setOpen(false);
    if (id === selectedId) return;
    document.cookie = `${UNIT_COOKIE}=${id}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    const next = new URLSearchParams(Array.from(params.entries()));
    next.set(UNIT_PARAM, id);
    /* `?unit=` é o filtro EXPLÍCITO das telas e vence o seletor. Um atalho do
       painel deixa `?unit=<id>` na URL; sem tirá-lo, trocar de unidade aqui em
       cima não mudaria nada na lista logo abaixo — e o chip passaria a mentir. */
    next.delete('unit');
    router.replace(`${pathname}?${next.toString()}`);
    router.refresh();
  }

  const rotulo = naRede ? 'Toda a Rede' : shortUnitName((unidade ?? units[0]).name);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          'inline-flex h-9 min-w-0 max-w-full items-center gap-1.5 rounded-control border px-2.5 text-xs font-semibold outline-none transition-colors duration-sgo-1 ease-sgo-std hover:bg-sunken focus-visible:shadow-sgo-focus',
          naRede ? 'border-brand/40 bg-brand-tint text-brand' : 'border-line-strong bg-surface text-ink-900',
        )}
      >
        {naRede ? <Globe className="h-4 w-4 shrink-0 text-brand" /> : <Building2 className="h-4 w-4 shrink-0 text-ink-400" />}
        <span className="min-w-0 truncate">{rotulo}</span>
        <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-ink-400" />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-40 mt-1 w-72 overflow-hidden rounded-card border border-line bg-surface shadow-lg">
          {/* A busca aparece a partir de seis unidades: com três, procurar o
              campo custa mais do que ler a lista. */}
          {units.length >= 6 && (
            <div className="flex items-center gap-2 border-b border-line px-2.5">
              <Search className="h-4 w-4 shrink-0 text-ink-400" aria-hidden />
              <input
                autoFocus
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar unidade…"
                aria-label="Buscar unidade"
                className="h-10 w-full bg-transparent text-sm text-ink-900 outline-none placeholder:text-ink-500"
              />
            </div>
          )}
          <ul role="listbox" className="max-h-[60vh] overflow-auto p-1">
            <li>
              <button
                type="button"
                role="option"
                aria-selected={naRede}
                onClick={() => choose(TODA_A_REDE)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-control px-2 py-2 text-left text-sm outline-none transition-colors duration-sgo-1 ease-sgo-std focus-visible:shadow-sgo-focus',
                  naRede ? 'bg-brand-tint text-brand' : 'text-ink-700 hover:bg-sunken',
                )}
              >
                <Check className={cn('h-4 w-4 shrink-0', naRede ? 'text-brand' : 'text-transparent')} />
                <Globe className="h-4 w-4 shrink-0 text-ink-400" aria-hidden />
                <span className="flex-1">
                  <span className="block font-semibold">Toda a Rede</span>
                  <span className="block text-[11px] text-ink-500">{units.length} unidades</span>
                </span>
              </button>
            </li>
            <li className="my-1 border-t border-line" aria-hidden />
            {filtradas.length === 0 && <li className="px-3 py-3 text-center text-sm text-ink-500">Nenhuma unidade com esse nome.</li>}
            {filtradas.map((u) => {
              const active = !naRede && u.id === (unidade ?? units[0]).id;
              return (
                <li key={u.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => choose(u.id)}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-control px-2 py-2 text-left text-sm outline-none transition-colors duration-sgo-1 ease-sgo-std focus-visible:shadow-sgo-focus',
                      active ? 'bg-brand-tint text-brand' : 'text-ink-700 hover:bg-sunken',
                    )}
                  >
                    <Check className={cn('h-4 w-4 shrink-0', active ? 'text-brand' : 'text-transparent')} />
                    <Building2 className="h-4 w-4 shrink-0 text-ink-400" aria-hidden />
                    <span className="flex-1">
                      <span className="block font-medium">{shortUnitName(u.name)}</span>
                      <span className="block text-[11px] text-ink-500">{u.name}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
