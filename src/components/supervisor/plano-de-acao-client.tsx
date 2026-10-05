'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, PlayCircle } from 'lucide-react';
import { urlDoUpload } from '@/lib/waste/foto-regra';

export interface AcaoDaUnidade {
  id: string; unidade: string; problem: string; category: string; responsibleName: string | null; dueDate: string | null;
  gravity: string; situacao: string; status: string; photoPath: string | null; note: string | null; unitNote: string | null;
  createdByName: string; createdAt: string; validatedByName: string | null; validatedAt: string | null; occurrenceId: string | null;
}

const br = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—');
const SIT: Record<string, { t: string; c: string }> = {
  ABERTO: { t: 'Aberto', c: 'sgo-tag--gray' }, EM_ANDAMENTO: { t: 'Em andamento', c: 'sgo-tag--blue' },
  AGUARDANDO_VALIDACAO: { t: 'Aguardando validação do supervisor', c: 'sgo-tag--amber' }, RESOLVIDO: { t: 'Resolvido (validado)', c: 'sgo-tag--green' }, VENCIDO: { t: 'Vencido', c: 'sgo-tag--red' },
};

/**
 * PLANO DE AÇÃO da unidade (v1.155.0): o que o supervisor apontou na visita.
 * A unidade informa "Em andamento" ou "Resolvido" — que fica AGUARDANDO
 * VALIDAÇÃO até o supervisor conferir no local, na visita seguinte.
 */
export function PlanoDeAcaoClient({ acoes, podeAtualizar, varias }: { acoes: AcaoDaUnidade[]; podeAtualizar: boolean; varias: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [nota, setNota] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<'abertas' | 'todas'>('abertas');
  const lista = acoes.filter((a) => (filtro === 'todas' ? true : a.status !== 'RESOLVIDO'));

  async function atualizar(id: string, status: 'EM_ANDAMENTO' | 'AGUARDANDO_VALIDACAO') {
    setBusy(id); setErro(null);
    const r = await fetch('/api/plano-de-acao', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ actionId: id, status, nota: nota[id] ?? '' }) });
    const d = await r.json().catch(() => ({}));
    setBusy(null);
    if (!r.ok) setErro(d.error ?? 'Não foi possível salvar.'); else router.refresh();
  }

  return (
    <div className="space-y-3" data-testid="plano-de-acao">
      <div className="flex gap-2">
        <button type="button" className={`sgo-btn sgo-btn--sm ${filtro === 'abertas' ? 'sgo-btn--primary' : ''}`} onClick={() => setFiltro('abertas')}>Em aberto ({acoes.filter((a) => a.status !== 'RESOLVIDO').length})</button>
        <button type="button" className={`sgo-btn sgo-btn--sm ${filtro === 'todas' ? 'sgo-btn--primary' : ''}`} onClick={() => setFiltro('todas')}>Todas ({acoes.length})</button>
      </div>
      {erro && <p className="text-sm text-danger" role="alert">{erro}</p>}
      {lista.length === 0 && <p className="sgo-panel p-4 text-sm text-ink-500">Nenhuma ação {filtro === 'abertas' ? 'em aberto' : 'registrada'}.</p>}
      <ul className="space-y-2">
        {lista.map((a) => (
          <li key={a.id} className="sgo-panel sgo-panel--solid space-y-2 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-ink-900">{a.problem}</span>
              <span className={`sgo-tag ${SIT[a.situacao]?.c ?? 'sgo-tag--gray'}`}>{SIT[a.situacao]?.t ?? a.situacao}</span>
              {(a.gravity === 'CRITICA' || a.gravity === 'ALTA') && <span className="sgo-tag sgo-tag--red">{a.gravity === 'CRITICA' ? 'Crítica' : 'Alta'}</span>}
            </div>
            <p className="text-xs text-ink-500">
              {varias ? `${a.unidade} · ` : ''}{a.category} · aberta por {a.createdByName} em {br(a.createdAt)}{a.responsibleName ? ` · responsável: ${a.responsibleName}` : ''}{a.dueDate ? ` · prazo ${br(a.dueDate)}` : ''}{a.occurrenceId ? ' · ocorrência aberta' : ''}
            </p>
            {a.note && <p className="text-sm text-ink-700">{a.note}</p>}
            {a.photoPath && (
              // eslint-disable-next-line @next/next/no-img-element
              <a href={urlDoUpload(a.photoPath)} target="_blank" rel="noreferrer"><img src={urlDoUpload(a.photoPath)} alt="Foto da visita" className="h-20 w-20 rounded-control border border-line object-cover" /></a>
            )}
            {a.unitNote && <p className="text-xs text-ink-700">Unidade: {a.unitNote}</p>}
            {a.validatedAt && <p className="flex items-center gap-1 text-xs text-success"><CheckCircle2 className="h-3.5 w-3.5" /> Validado por {a.validatedByName} em {br(a.validatedAt)}</p>}
            {podeAtualizar && a.status !== 'RESOLVIDO' && (
              <div className="space-y-2">
                <input value={nota[a.id] ?? ''} onChange={(e) => setNota((n) => ({ ...n, [a.id]: e.target.value }))} maxLength={300} placeholder="O que foi feito (opcional)"
                  className="h-11 w-full rounded-control border border-line bg-surface px-3 text-sm" aria-label="O que foi feito" />
                <div className="flex flex-wrap gap-2">
                  {a.status !== 'EM_ANDAMENTO' && a.status !== 'AGUARDANDO_VALIDACAO' && <button type="button" className="sgo-btn" disabled={busy === a.id} onClick={() => void atualizar(a.id, 'EM_ANDAMENTO')}><PlayCircle className="h-4 w-4" /> Em andamento</button>}
                  {a.status !== 'AGUARDANDO_VALIDACAO' && <button type="button" className="sgo-btn sgo-btn--primary" disabled={busy === a.id} onClick={() => void atualizar(a.id, 'AGUARDANDO_VALIDACAO')} data-testid="marcar-resolvido"><CheckCircle2 className="h-4 w-4" /> Resolvido pela unidade</button>}
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
