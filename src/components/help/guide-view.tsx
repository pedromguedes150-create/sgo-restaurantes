'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Lightbulb, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Guide { id: string; title: string; summary: string; steps: string[]; tips?: string[] }
interface Section { title: string; guides: Guide[] }

/** normaliza p/ busca: minúsculas + sem acento (busca "inteligente"/tolerante). */
const DIACRITICS = new RegExp('[\\u0300-\\u036f]', 'g');
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(DIACRITICS, '');

export function GuideView({ sections }: { sections: Section[] }) {
  const [open, setOpen] = useState<string | null>(sections[0]?.guides[0]?.id ?? null);
  const [q, setQ] = useState('');

  const query = norm(q.trim());
  const filtered = useMemo(() => {
    if (!query) return sections;
    const terms = query.split(/\s+/).filter(Boolean);
    const match = (g: Guide) => {
      const hay = norm([g.title, g.summary, ...g.steps, ...(g.tips ?? [])].join(' '));
      return terms.every((t) => hay.includes(t));
    };
    return sections
      .map((s) => ({ ...s, guides: s.guides.filter(match) }))
      .filter((s) => s.guides.length > 0);
  }, [sections, query]);

  const totalHits = filtered.reduce((n, s) => n + s.guides.length, 0);
  const searching = query.length > 0;

  if (sections.length === 0) return <p className="text-sm text-muted-foreground">Nenhum guia para o seu perfil.</p>;

  return (
    <div className="space-y-4">
      {/* Busca inteligente */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar um assunto (ex.: comanda, troco, atestado)…"
          className="h-11 w-full rounded-lg border-2 border-input bg-background pl-9 pr-9 text-base ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Buscar nos guias"
        />
        {q && (
          <button onClick={() => setQ('')} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-brand" aria-label="Limpar busca">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      {searching && <p className="text-xs text-muted-foreground">{totalHits} guia(s) encontrado(s) para “{q.trim()}”.</p>}

      {searching && totalHits === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">Nenhum guia encontrado. Tente outra palavra (ex.: “gás”, “pagamento”, “escala”).</p>
      ) : (
        <div className="space-y-5">
          {filtered.map((s) => (
            <div key={s.title}>
              <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">{s.title}</h2>
              <div className="space-y-2">
                {s.guides.map((g) => {
                  // ao buscar, tudo já vem expandido (poucos resultados); senão, acordeão normal
                  const expanded = searching || open === g.id;
                  return (
                    <div key={g.id} className="rounded-lg border bg-card">
                      <button onClick={() => setOpen(open === g.id ? null : g.id)} className="flex w-full items-center justify-between gap-2 p-3 text-left">
                        <span>
                          <span className="block font-semibold text-brand">{g.title}</span>
                          <span className="block text-xs text-muted-foreground">{g.summary}</span>
                        </span>
                        {expanded ? <ChevronDown className="h-5 w-5 shrink-0 text-accent" /> : <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />}
                      </button>
                      {expanded && (
                        <div className="space-y-3 border-t p-3">
                          <ol className="list-decimal space-y-1.5 pl-5 text-sm">
                            {g.steps.map((step, i) => <li key={i}>{step}</li>)}
                          </ol>
                          {g.tips?.map((tip, i) => (
                            <p key={i} className={cn('flex items-start gap-2 rounded-lg bg-medium/10 p-2 text-xs text-warning')}>
                              <Lightbulb className="mt-0.5 h-4 w-4 shrink-0" /> {tip}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
