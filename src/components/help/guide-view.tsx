'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, Lightbulb } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Guide { id: string; title: string; summary: string; steps: string[]; tips?: string[] }
interface Section { title: string; guides: Guide[] }

export function GuideView({ sections }: { sections: Section[] }) {
  const [open, setOpen] = useState<string | null>(sections[0]?.guides[0]?.id ?? null);

  if (sections.length === 0) return <p className="text-sm text-muted-foreground">Nenhum guia para o seu perfil.</p>;

  return (
    <div className="space-y-5">
      {sections.map((s) => (
        <div key={s.title}>
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">{s.title}</h2>
          <div className="space-y-2">
            {s.guides.map((g) => {
              const expanded = open === g.id;
              return (
                <div key={g.id} className="rounded-lg border bg-card">
                  <button onClick={() => setOpen(expanded ? null : g.id)} className="flex w-full items-center justify-between gap-2 p-3 text-left">
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
                        <p key={i} className={cn('flex items-start gap-2 rounded-lg bg-medium/10 p-2 text-xs text-[#92600A]')}>
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
  );
}
