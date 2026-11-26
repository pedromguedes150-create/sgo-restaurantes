import type { ReactNode } from 'react';
import { Download, FileText, Lightbulb } from 'lucide-react';

/**
 * Peças dos relatórios executivos (v1.224.0). Sem estado e sem "use client":
 * servem à página de servidor e ao componente cliente.
 */

/** As frases que respondem antes de qualquer tabela. */
export function LeituraExecutiva({ titulo = 'Leitura executiva', frases, testId = 'leitura-executiva' }: { titulo?: string; frases: string[]; testId?: string }) {
  if (frases.length === 0) return null;
  return (
    <section className="sgo-panel sgo-panel--solid p-4" data-testid={testId}>
      <h2 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-ink-900"><Lightbulb className="h-4 w-4 text-brand" aria-hidden /> {titulo}</h2>
      <ul className="space-y-1.5">
        {frases.map((f) => (
          <li key={f} className="flex gap-2 text-sm text-ink-900">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-pill bg-brand" aria-hidden />
            <span className="min-w-0 break-words">{f}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export interface ItemDaBarra { rotulo: string; valor: string; pct: number; apoio?: string; destaque?: boolean }

/** Participação em barras: cada linha com o número, a fatia e a barra proporcional. */
export function BarrasDeParticipacao({ titulo, itens, vazio = 'Sem dados no recorte.', nota, testId }: { titulo: string; itens: ItemDaBarra[]; vazio?: string; nota?: ReactNode; testId?: string }) {
  const maior = Math.max(1, ...itens.map((i) => i.pct));
  return (
    <section className="sgo-panel sgo-panel--solid p-4" data-testid={testId}>
      <h2 className="mb-2 text-sm font-bold text-ink-900">{titulo}</h2>
      {itens.length === 0 ? <p className="text-sm text-ink-500">{vazio}</p> : (
        <ul className="space-y-2">
          {itens.map((i) => (
            <li key={i.rotulo}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className={`min-w-0 break-words text-sm ${i.destaque ? 'font-bold text-ink-900' : 'text-ink-900'}`}>{i.rotulo}{i.apoio && <span className="text-xs text-ink-500"> · {i.apoio}</span>}</span>
                <span className="whitespace-nowrap text-sm tabular-nums text-ink-700"><b className="text-ink-900">{i.valor}</b> · {i.pct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%</span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-pill bg-sunken" aria-hidden>
                <div className="h-full rounded-pill bg-brand" style={{ width: `${Math.max(1, (i.pct / maior) * 100)}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
      {nota && <p className="mt-2 text-xs text-ink-500">{nota}</p>}
    </section>
  );
}

/** Os dois caminhos de saída de todo relatório: planilha e PDF. */
export function BaixarRelatorio({ excelHref, pdfHref, pdfOnClick }: { excelHref: string; pdfHref?: string; pdfOnClick?: () => void }) {
  return (
    <div className="flex flex-wrap gap-2 print:hidden" data-testid="baixar-relatorio">
      <a href={excelHref} className="sgo-btn sgo-btn--sm" data-testid="baixar-excel"><Download className="h-4 w-4" /> Excel</a>
      {pdfHref
        ? <a href={pdfHref} target="_blank" rel="noreferrer" className="sgo-btn sgo-btn--sm" data-testid="baixar-pdf"><FileText className="h-4 w-4" /> PDF</a>
        : <button type="button" onClick={pdfOnClick} className="sgo-btn sgo-btn--sm" data-testid="baixar-pdf"><FileText className="h-4 w-4" /> PDF</button>}
    </div>
  );
}
