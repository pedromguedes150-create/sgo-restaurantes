import type { OccurrenceGravity, OccurrenceStatus } from '@prisma/client';

/**
 * O CONTEXTO da lista de ocorrências — puro, sem import de servidor (a lista
 * é componente cliente e a página é de servidor; os dois leem daqui).
 *
 * Todo filtro mora na URL (v1.128.0): situação, assunto, página, busca,
 * unidade, gravidade e ordem. É o que permite VOLTAR ao mesmo ponto depois de
 * encerrar uma ocorrência — antes busca/unidade/gravidade eram estado do
 * componente e morriam na navegação, e o encerramento caía em "Todas".
 */

export const ORDENS = [
  { value: 'recentes', label: 'Mais recentes' },
  { value: 'antigas', label: 'Mais antigas' },
  { value: 'gravidade', label: 'Maior gravidade' },
  { value: 'unidade', label: 'Unidade' },
] as const;
export type OrdemDaLista = (typeof ORDENS)[number]['value'];

export const SITUACOES: { value: OccurrenceStatus | 'TODAS'; label: string }[] = [
  { value: 'TODAS', label: 'Todas' },
  { value: 'OPEN', label: 'Abertas' },
  { value: 'IN_PROGRESS', label: 'Em andamento' },
  { value: 'CLOSED', label: 'Encerradas' },
];

export interface FiltrosDaLista {
  status?: OccurrenceStatus;
  view?: 'critico' | 'manutencao' | 'ti';
  pagina: number;
  q?: string;
  unitId?: string;
  gravity?: OccurrenceGravity;
  ordem: OrdemDaLista;
}

const um = <T extends string>(v: string | undefined | null, validos: readonly T[]): T | undefined =>
  (validos as readonly string[]).includes(v ?? '') ? (v as T) : undefined;

export function lerFiltrosDaLista(sp: { get(k: string): string | null }): FiltrosDaLista {
  const q = (sp.get('q') ?? '').trim().slice(0, 120);
  return {
    status: um<OccurrenceStatus>(sp.get('status'), ['OPEN', 'IN_PROGRESS', 'CLOSED']),
    view: um(sp.get('view'), ['critico', 'manutencao', 'ti'] as const),
    pagina: Math.max(Number(sp.get('pagina')) || 1, 1),
    q: q || undefined,
    unitId: sp.get('unidade') || undefined,
    gravity: um<OccurrenceGravity>(sp.get('gravidade'), ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
    ordem: um<OrdemDaLista>(sp.get('ordem'), ORDENS.map((o) => o.value)) ?? 'recentes',
  };
}

/** O inverso de `lerFiltrosDaLista`: o endereço da lista com estes filtros. */
export function linkDaLista(f: Partial<FiltrosDaLista>): string {
  const sp = new URLSearchParams();
  if (f.view) sp.set('view', f.view);
  if (f.status) sp.set('status', f.status);
  if (f.q) sp.set('q', f.q);
  if (f.unitId) sp.set('unidade', f.unitId);
  if (f.gravity) sp.set('gravidade', f.gravity);
  if (f.ordem && f.ordem !== 'recentes') sp.set('ordem', f.ordem);
  if (f.pagina && f.pagina > 1) sp.set('pagina', String(f.pagina));
  const qs = sp.toString();
  return `/modulos/ocorrencias${qs ? `?${qs}` : ''}`;
}

/**
 * Para onde "Voltar" e o encerramento levam. Só aceita um endereço INTERNO da
 * própria lista de ocorrências: o valor vem da URL, e um `voltar=https://…`
 * ou `//outro-site` viraria redirecionamento aberto.
 */
export function voltarSeguro(v: string | undefined | null): string | null {
  if (!v) return null;
  if (!v.startsWith('/modulos/ocorrencias')) return null;
  if (v.startsWith('//') || v.includes('://') || /[\r\n]/.test(v)) return null;
  return v;
}

/** Como o banco ordena cada escolha. A gravidade segue a ordem do enum (LOW→CRITICAL). */
export function ordenacaoDaLista(ordem: OrdemDaLista): ({ createdAt: 'asc' | 'desc' } | { gravity: 'desc' } | { unit: { name: 'asc' } })[] {
  switch (ordem) {
    case 'antigas': return [{ createdAt: 'asc' }];
    case 'gravidade': return [{ gravity: 'desc' }, { createdAt: 'desc' }];
    case 'unidade': return [{ unit: { name: 'asc' } }, { createdAt: 'desc' }];
    default: return [{ createdAt: 'desc' }];
  }
}
