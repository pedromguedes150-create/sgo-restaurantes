import type { DayStatus } from '@/lib/schedule/grade-filtros';

/**
 * A APARÊNCIA DE CADA STATUS DA ESCALA — uma tabela só, lida pela grade, pela
 * legenda, pela coluna de totais e pela paleta de edição (v1.173.0). Antes a
 * tabela vivia dentro de `schedule-client.tsx`; separar foi o que permitiu a
 * paleta mostrar os mesmos códigos com as mesmas cores sem copiar a lista.
 *
 * Fundo pelos tokens `-bg`, não por tinta da própria cor: a 15-25% o par
 * texto/fundo ficava em 5,57-6,63:1, abaixo do AAA. Atestado usa `info`, o
 * token do que é informativo e não é alerta.
 *
 * FOLGA (pedido do Pedro, 19/10/2026): letra em peso 800, fundo cinza-claro
 * firme, texto escuro e borda discreta — a folga precisa saltar aos olhos
 * tanto quanto o T bordô, na tela e no PDF. FÉRIAS continua verde: F e FE
 * não podem ser confundidos.
 */
export const STATUS: Record<DayStatus, { code: string; label: string; cls: string }> = {
  WORK:         { code: 'T',  label: 'Trabalho',            cls: 'bg-brand text-on-brand' },
  OFF:          { code: 'F',  label: 'Folga',               cls: 'bg-sunken text-ink-900 border border-line-strong font-extrabold' },
  FALTA_INJUST: { code: 'FI', label: 'Falta injustificada', cls: 'bg-danger-bg text-danger border border-danger/40' },
  FALTA_JUST:   { code: 'FJ', label: 'Falta justificada',   cls: 'bg-warning-bg text-warning border border-warning/50' },
  ATESTADO:     { code: 'A',  label: 'Atestado',            cls: 'bg-info-bg text-info border border-info/40' },
  FERIAS:       { code: 'FE', label: 'Férias',              cls: 'bg-success-bg text-success border border-success/40' },
  ATRASO:       { code: 'AT', label: 'Atraso',              cls: 'bg-warning-bg text-warning border border-warning/40' },
  AFASTADO:     { code: 'AF', label: 'Afastado',            cls: 'bg-sunken text-ink-700 border border-line-strong' },
};

/** A ordem em que os status aparecem na legenda e na paleta. */
export const STATUS_ORDER: DayStatus[] = ['WORK', 'ATRASO', 'OFF', 'FALTA_INJUST', 'FALTA_JUST', 'ATESTADO', 'FERIAS', 'AFASTADO'];
