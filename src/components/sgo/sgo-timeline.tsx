import type { ReactNode } from 'react';

/**
 * Linha do tempo do kit (3-componentes-sgo/SgoTimeline.tsx): grupos (por dia,
 * por etapa) com itens marcados por um ponto no tom semântico.
 */
export type SgoTimelineTom = 'blue' | 'green' | 'red' | 'amber' | 'sky' | 'violet' | 'gray';

const COR: Record<SgoTimelineTom, string> = {
  blue: 'var(--sgo-accent)',
  green: 'var(--sgo-ok)',
  red: 'var(--sgo-bad)',
  amber: 'var(--sgo-warn)',
  sky: 'var(--sgo-sky)',
  violet: 'var(--sgo-violet)',
  gray: 'var(--sgo-ink-3)',
};

export interface SgoTimelineItem {
  id: string;
  quando: string;
  titulo: string;
  descricao?: ReactNode;
  destaque?: ReactNode;
  etiqueta?: string;
  tom?: SgoTimelineTom;
  onClick?: () => void;
  testId?: string;
}

export interface SgoTimelineGrupo { chave: string; rotulo: string; itens: SgoTimelineItem[] }

export function SgoTimeline({ grupos, vazio }: { grupos: SgoTimelineGrupo[]; vazio?: ReactNode }) {
  if (grupos.length === 0 || grupos.every((g) => g.itens.length === 0)) {
    return <div className="py-8 text-center text-sm" style={{ color: 'var(--sgo-ink-3)' }}>{vazio ?? 'Nada registrado.'}</div>;
  }
  return (
    <div className="space-y-5">
      {grupos.filter((g) => g.itens.length > 0).map((g) => (
        <section key={g.chave}>
          <h3 className="sgo-label mb-1 px-1">{g.rotulo}</h3>
          <ol className="relative ml-3 border-l-2 pl-5" style={{ borderColor: 'var(--sgo-hair)' }}>
            {g.itens.map((i) => {
              const cor = COR[i.tom ?? 'blue'];
              const miolo = (
                <>
                  <span className="absolute h-3 w-3 rounded-full" style={{ left: -23, top: 9, background: cor, boxShadow: '0 0 0 3px var(--sgo-panel)' }} aria-hidden />
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[11px]" style={{ color: 'var(--sgo-ink-3)' }}>{i.quando}{i.etiqueta ? ` · ${i.etiqueta}` : ''}</div>
                      <div className="text-sm font-semibold" style={{ color: 'var(--sgo-ink)' }}>{i.titulo}</div>
                      {i.descricao && <div className="text-xs" style={{ color: 'var(--sgo-ink-2)' }}>{i.descricao}</div>}
                    </div>
                    {i.destaque !== undefined && <div className="shrink-0 text-sm font-semibold tabular-nums" style={{ color: cor }}>{i.destaque}</div>}
                  </div>
                </>
              );
              return (
                <li key={i.id} className="relative min-h-11 py-2" data-testid={i.testId}>
                  {i.onClick ? (
                    <button type="button" onClick={i.onClick} className="-mx-1 w-full rounded-md px-1 text-left hover:bg-[var(--sgo-panel-2)]">{miolo}</button>
                  ) : miolo}
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}
