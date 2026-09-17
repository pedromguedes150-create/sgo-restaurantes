'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, CornerDownLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AreaMontada } from '@/lib/nav/areas';

/** Sem acento e em minúscula: ninguém digita "óleo" com acento no celular. */
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

interface Achado { href: string; label: string; area: string; coluna: string }

/**
 * BUSCA GLOBAL — sempre visível no cabeçalho, no desktop.
 *
 * Era um botão que abria o ⌘K. Botão exige saber que a busca existe; um campo
 * com o cursor piscando convida a digitar. E o que ele varre agora é o CATÁLOGO
 * INTEIRO (`src/lib/nav/areas.ts`), não a lista curta da sidebar: quem digita
 * "troco", "setor", "recorrente" ou "diagnóstico" chega ao destino sem saber em
 * qual menu ele mora — que é justamente o que se pede a uma busca.
 *
 * Cada resultado mostra ONDE ele vive ("Operação › Conferências"). Achar sem
 * aprender o caminho condena a pessoa a buscar de novo amanhã.
 */
export function GlobalSearch({ areas, className }: { areas: AreaMontada[]; className?: string }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [aberto, setAberto] = useState(false);
  const [ativo, setAtivo] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const catalogo = useMemo<Achado[]>(
    () => areas.flatMap((a) => a.colunas.flatMap((c) => c.itens.map((i) => ({ href: i.href, label: i.label, area: a.titulo, coluna: c.titulo })))),
    [areas],
  );

  const achados = useMemo(() => {
    const t = norm(q.trim());
    if (!t) return [];
    const casa = catalogo.filter((c) => norm(c.label).includes(t) || norm(c.area).includes(t) || norm(c.coluna).includes(t));
    /**
     * A ordem é USAR antes de CONFIGURAR, e só depois a semelhança do texto.
     *
     * Parece invertido e não é: digitar "troco" trazia "Troco (denominações)"
     * no topo, porque o rótulo começa com a palavra — mas quem digita "troco"
     * está indo trabalhar, não mexer nas denominações. O mesmo com "pizza"
     * ("Pizzas (sabores)" × "Controle de Pizzas"). A tela de configuração é
     * visitada uma vez por semestre; a operacional, todo dia.
     *
     * Dentro do mesmo tipo, quem COMEÇA com o termo vem antes de quem só o
     * contém.
     */
    const peso = (c: Achado) => (c.area === 'Administrativo' ? 0 : 4) + (norm(c.label).startsWith(t) ? 1 : 0);
    return casa
      .sort((a, b) => peso(b) - peso(a) || a.label.localeCompare(b.label, 'pt-BR'))
      .slice(0, 8);
  }, [catalogo, q]);

  useEffect(() => { setAtivo(0); }, [q]);

  useEffect(() => {
    if (!aberto) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [aberto]);

  function ir(a: Achado) {
    setAberto(false);
    setQ('');
    inputRef.current?.blur();
    router.push(a.href);
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { setAberto(false); inputRef.current?.blur(); return; }
    if (achados.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setAtivo((i) => Math.min(i + 1, achados.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setAtivo((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); const a = achados[ativo]; if (a) ir(a); }
  }

  const mostrar = aberto && q.trim().length > 0;

  return (
    <div ref={ref} className={cn('relative', className)}>
      <div className="flex h-9 items-center gap-2 rounded-control border border-line-strong bg-surface pl-2.5 pr-2 focus-within:border-brand">
        <Search className="h-4 w-4 shrink-0 text-ink-400" aria-hidden />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => { setQ(e.target.value); setAberto(true); }}
          onFocus={() => setAberto(true)}
          onKeyDown={onKey}
          placeholder="Buscar ferramenta…"
          aria-label="Buscar ferramenta ou módulo"
          aria-expanded={mostrar}
          role="combobox"
          aria-controls="busca-global-resultados"
          className="h-full w-full bg-transparent text-sm text-ink-900 outline-none placeholder:text-ink-500"
        />
      </div>

      {mostrar && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-sheet border border-line bg-surface shadow-xl">
          {achados.length === 0 ? (
            <p className="px-3 py-4 text-center text-sm text-ink-500">Nada encontrado para “{q.trim()}”.</p>
          ) : (
            <ul id="busca-global-resultados" role="listbox" className="max-h-80 overflow-auto p-1">
              {achados.map((a, i) => (
                <li key={a.href} role="option" aria-selected={i === ativo}>
                  <button
                    type="button"
                    onMouseMove={() => setAtivo(i)}
                    onClick={() => ir(a)}
                    className={cn('flex w-full items-center gap-2 rounded-control px-2.5 py-2 text-left outline-none', i === ativo && 'bg-brand-tint')}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink-900">{a.label}</span>
                      <span className="block truncate text-xs text-ink-500">{a.area} › {a.coluna}</span>
                    </span>
                    {i === ativo && <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-ink-400" aria-hidden />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
