'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { OPEN_COMMAND_EVENT } from '@/components/layout/command-palette';
import type { AreaMontada } from '@/lib/nav/areas';

/** Sem acento e em minúscula: ninguém digita "óleo" com acento no celular. */
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

interface Achado { href: string; label: string; area: string; coluna: string }

/**
 * BUSCA GLOBAL da barra (kit de layout, 2-moldura/GlobalSearch.tsx): fechada
 * é o botão "Buscar... Ctrl K" (`.sgo-navsearch`); aberta vira um campo com a
 * lista de resultados logo abaixo (8, setas ↑/↓, Enter navega, Esc fecha,
 * clique fora fecha). Busca TELAS, não dados — o catálogo inteiro do menu,
 * ordenado "usar antes de configurar" (regra do Restaurante desde a v1.98.0).
 *
 * Só a partir de `sm`: no celular a busca é o ⌘K em tela cheia (barra de
 * baixo), e o Ctrl+K daqui o abre lá quando este campo está escondido.
 */
export function NavSearch({ areas }: { areas: AreaMontada[] }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [q, setQ] = useState('');
  const [ativo, setAtivo] = useState(0);
  const raiz = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  const catalogo = useMemo<Achado[]>(
    () => areas.flatMap((a) => a.colunas.flatMap((c) => c.itens.map((i) => ({ href: i.href, label: i.label, area: a.titulo, coluna: c.titulo })))),
    [areas],
  );
  const achados = useMemo(() => {
    const t = norm(q.trim());
    if (!t) return [];
    const peso = (c: Achado) => (c.area === 'Administrativo' ? 0 : 4) + (norm(c.label).startsWith(t) ? 1 : 0);
    return catalogo
      .filter((c) => norm(c.label).includes(t) || norm(c.area).includes(t) || norm(c.coluna).includes(t))
      .sort((a, b) => peso(b) - peso(a) || a.label.localeCompare(b.label, 'pt-BR'))
      .slice(0, 8);
  }, [catalogo, q]);

  useEffect(() => { setAtivo(0); }, [q]);
  useEffect(() => { if (aberto) window.setTimeout(() => input.current?.focus(), 50); }, [aberto]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        /* Campo escondido (celular): a busca é o palette em tela cheia. */
        if (raiz.current && raiz.current.offsetParent === null) { window.dispatchEvent(new Event(OPEN_COMMAND_EVENT)); return; }
        setAberto(true);
      }
      if (e.key === 'Escape') { setAberto(false); setQ(''); }
    };
    const onDown = (e: MouseEvent) => { if (raiz.current && !raiz.current.contains(e.target as Node)) { setAberto(false); setQ(''); } };
    window.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => { window.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onDown); };
  }, []);

  const ir = (href: string) => { router.push(href); setAberto(false); setQ(''); };

  return (
    <div ref={raiz} className="relative hidden sm:block" data-testid="nav-search">
      {!aberto ? (
        <button type="button" className="sgo-navsearch hidden sm:inline-flex" onClick={() => setAberto(true)} data-testid="button-global-search">
          <Search className="h-3.5 w-3.5" />
          <span>Buscar...</span>
          <kbd className="sgo-navsearch__kbd">Ctrl K</kbd>
        </button>
      ) : (
        <div className="flex items-center gap-1">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2" style={{ color: 'var(--sgo-ink-3)' }} />
            <input
              ref={input}
              className="sgo-input h-8 w-44 pl-8 pr-8 text-xs lg:w-48"
              placeholder="Buscar no sistema..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') { e.preventDefault(); setAtivo((i) => Math.min(i + 1, Math.max(0, achados.length - 1))); }
                else if (e.key === 'ArrowUp') { e.preventDefault(); setAtivo((i) => Math.max(0, i - 1)); }
                else if (e.key === 'Enter' && achados[ativo]) { e.preventDefault(); ir(achados[ativo].href); }
              }}
              aria-label="Buscar no sistema"
              aria-expanded={achados.length > 0}
              aria-controls="nav-search-resultados"
            />
            <button type="button" onClick={() => { if (q) setQ(''); else setAberto(false); }} aria-label={q ? 'Limpar' : 'Fechar busca'} className="absolute right-2 top-1/2 -translate-y-1/2" style={{ color: 'var(--sgo-ink-3)' }}>
              <X className="h-3 w-3" />
            </button>
          </div>
          {q.trim() && (
            <div id="nav-search-resultados" role="listbox" className="sgo-panel sgo-panel--solid sgo-navpanel-enter absolute left-0 top-full mt-1 w-72 overflow-hidden" style={{ zIndex: 'var(--sgo-z-dropdown)' as unknown as number, boxShadow: 'var(--sgo-sh-pop)', color: 'var(--sgo-ink)' }}>
              {achados.length === 0 ? (
                <div className="p-3 text-xs" style={{ color: 'var(--sgo-ink-2)' }}>Nenhum resultado encontrado</div>
              ) : achados.map((a, i) => (
                <button
                  key={a.href}
                  type="button"
                  role="option"
                  aria-selected={i === ativo}
                  onMouseEnter={() => setAtivo(i)}
                  onClick={() => ir(a.href)}
                  className={cn('flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs', i === ativo ? 'bg-[var(--sgo-accent-soft)] text-[var(--sgo-accent)]' : 'hover:bg-[var(--sgo-panel-2)]')}
                >
                  <span className="truncate font-medium">{a.label}</span>
                  <span className="shrink-0 text-[10px]" style={{ color: 'var(--sgo-ink-3)' }}>{a.area} › {a.coluna}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
