'use client';

import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';

export interface ItemDoHistoricoUI { data: string; tipo: string; titulo: string; detalhe?: string }

const TOM: Record<string, string> = {
  Admissão: 'sgo-tag--blue', Férias: 'sgo-tag--green', 'Hora extra': 'sgo-tag--amber', Mobilidade: 'sgo-tag--sky',
  Comissão: 'sgo-tag--sky', 'Pagamento extra': 'sgo-tag--sky', Avaliação: 'sgo-tag--violet', Atestado: 'sgo-tag--red',
  Mudança: 'sgo-tag--gray', Treinamento: 'sgo-tag--green', Desligamento: 'sgo-tag--red',
};
const sem = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Linha do tempo do Perfil 360 com busca (v1.153.0). A busca ignora acento e
 * caixa e olha título, tipo e detalhe; os tipos viram chips para filtrar.
 */
export function HistoricoColaborador({ itens, nome }: { itens: ItemDoHistoricoUI[]; nome: string }) {
  const [q, setQ] = useState('');
  const [tipo, setTipo] = useState<string | null>(null);
  const tipos = useMemo(() => [...new Set(itens.map((i) => i.tipo))], [itens]);
  const visiveis = useMemo(() => {
    const t = sem(q.trim());
    return itens.filter((i) => (!tipo || i.tipo === tipo) && (!t || sem(`${i.tipo} ${i.titulo} ${i.detalhe ?? ''}`).includes(t)));
  }, [itens, q, tipo]);

  return (
    <div className="space-y-3">
      <label className="relative block">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" aria-hidden />
        <input
          type="search" value={q} onChange={(e) => setQ(e.target.value)}
          placeholder={`Buscar no histórico de ${nome}`}
          aria-label="Buscar no histórico"
          className="h-10 w-full rounded-control border border-line bg-surface pl-9 pr-3 text-sm text-ink-900 outline-none focus:border-brand"
          data-testid="busca-historico"
        />
      </label>
      {tipos.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          <button type="button" onClick={() => setTipo(null)} className={`sgo-btn sgo-btn--sm ${tipo === null ? 'sgo-btn--primary' : ''}`}>Tudo ({itens.length})</button>
          {tipos.map((t) => (
            <button key={t} type="button" onClick={() => setTipo(tipo === t ? null : t)} className={`sgo-btn sgo-btn--sm ${tipo === t ? 'sgo-btn--primary' : ''}`}>
              {t} ({itens.filter((i) => i.tipo === t).length})
            </button>
          ))}
        </div>
      )}
      {visiveis.length === 0 ? (
        <p className="text-sm text-ink-500">Nada encontrado.</p>
      ) : (
        <ol className="divide-y divide-line" data-testid="lista-historico">
          {visiveis.slice(0, 120).map((i, idx) => (
            <li key={`${i.data}-${idx}`} className="flex items-start gap-3 py-2">
              <span className="w-20 shrink-0 pt-0.5 text-xs tabular-nums text-ink-500">{i.data.split('-').reverse().join('/')}</span>
              <span className={`sgo-tag ${TOM[i.tipo] ?? 'sgo-tag--gray'} shrink-0`}>{i.tipo}</span>
              <span className="min-w-0">
                <span className="block text-sm text-ink-900">{i.titulo}</span>
                {i.detalhe && <span className="block text-xs text-ink-500">{i.detalhe}</span>}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
