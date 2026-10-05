'use client';

import { useState } from 'react';
import { Check, Loader2, Star } from 'lucide-react';

/**
 * Página do QR do banheiro (v1.156.0) — o cliente toca UMA vez e o gerente é
 * avisado. Pedido do Pedro: "o banheiro está precisando de limpeza ou está
 * faltando sabonete e papel". O QR de cada banheiro já vem com ele escolhido
 * (`?loc=`); o QR geral da unidade pergunta qual banheiro antes.
 * A avaliação ficou DEPOIS do envio e é opcional — antes ela estava no caminho.
 */
const MOTIVOS: { issue: string; emoji: string; rotulo: string }[] = [
  { issue: 'Precisa de limpeza', emoji: '🧽', rotulo: 'Precisa de limpeza' },
  { issue: 'Falta papel', emoji: '🧻', rotulo: 'Falta papel' },
  { issue: 'Falta sabonete', emoji: '🧼', rotulo: 'Falta sabonete' },
  { issue: 'Lixo cheio', emoji: '🗑️', rotulo: 'Lixo cheio' },
];

export function HygienePublicForm({ unitId, locations, preselect }: { unitId: string; locations: { id: string; name: string }[]; preselect: string | null }) {
  const inicial = preselect && locations.some((l) => l.id === preselect) ? preselect : locations.length === 1 ? locations[0].id : null;
  const [locationId, setLocationId] = useState<string | null>(inicial);
  const [enviando, setEnviando] = useState<string | null>(null);
  const [outro, setOutro] = useState(false);
  const [comment, setComment] = useState('');
  const [enviado, setEnviado] = useState<{ id: string; issue: string } | null>(null);
  const [rating, setRating] = useState(0);
  const [avaliado, setAvaliado] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const banheiro = locations.find((l) => l.id === locationId) ?? null;
  const precisaEscolher = locations.length > 0 && !locationId;

  async function enviar(issue: string) {
    setErr(null);
    if (precisaEscolher) { setErr('Toque primeiro no banheiro.'); return; }
    setEnviando(issue);
    try {
      const res = await fetch('/api/higiene', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ unitId, locationId, issue, comment: issue === 'Outro' ? comment : null }) });
      const d = await res.json().catch(() => ({}));
      if (res.ok) setEnviado({ id: d.id, issue }); else setErr(d.error ?? 'Falha ao enviar. Tente de novo.');
    } catch { setErr('Sem conexão. Tente de novo.'); } finally { setEnviando(null); }
  }

  async function avaliar(n: number) {
    if (!enviado || avaliado) return;
    setRating(n);
    const r = await fetch('/api/higiene', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acao: 'avaliar', id: enviado.id, rating: n }) }).catch(() => null);
    if (r?.ok) setAvaliado(true);
  }

  if (enviado) {
    return (
      <div className="space-y-4 rounded-2xl bg-surface p-6 text-center" data-testid="higiene-enviado">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success/15"><Check className="h-9 w-9 text-success" /></div>
        <div>
          <p className="text-lg font-bold text-ink-900">Obrigado! A equipe já foi avisada.</p>
          <p className="text-sm text-ink-500">{banheiro ? `${banheiro.name} · ` : ''}{enviado.issue}</p>
        </div>
        <div>
          <p className="mb-2 text-sm font-semibold text-ink-900">{avaliado ? 'Avaliação registrada. Obrigado!' : 'Quer avaliar este banheiro? (opcional)'}</p>
          <div className="flex justify-center gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" disabled={avaliado} onClick={() => void avaliar(n)} aria-label={`${n} estrela${n > 1 ? 's' : ''}`} className="p-1">
                <Star className={`h-9 w-9 ${n <= rating ? 'fill-warning text-warning' : 'text-ink-400'}`} />
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-2xl bg-surface p-4">
      {locations.length > 1 && (
        <div>
          <p className="mb-2 text-sm font-semibold text-ink-900">{banheiro ? 'Banheiro' : 'Qual banheiro?'}</p>
          <div className="grid grid-cols-2 gap-2">
            {locations.map((l) => (
              <button key={l.id} type="button" onClick={() => setLocationId(l.id)} aria-pressed={locationId === l.id}
                className={`min-h-12 rounded-xl border-2 px-3 text-base font-bold ${locationId === l.id ? 'border-brand bg-brand text-on-brand' : 'border-line bg-surface text-ink-900'}`}>{l.name}</button>
            ))}
          </div>
        </div>
      )}

      <div>
        <p className="mb-2 text-base font-semibold text-ink-900">O que está acontecendo?</p>
        <div className="grid grid-cols-1 gap-2">
          {MOTIVOS.map((m) => (
            <button key={m.issue} type="button" disabled={Boolean(enviando)} onClick={() => void enviar(m.issue)} data-testid={`motivo-${m.issue}`}
              className="flex min-h-16 items-center gap-3 rounded-xl border-2 border-line bg-surface px-4 text-left text-lg font-bold text-ink-900 transition active:scale-[0.99] disabled:opacity-60">
              <span className="text-3xl" aria-hidden>{m.emoji}</span>
              <span className="flex-1">{m.rotulo}</span>
              {enviando === m.issue && <Loader2 className="h-5 w-5 animate-spin text-brand" />}
            </button>
          ))}
          {!outro ? (
            <button type="button" onClick={() => setOutro(true)} className="min-h-12 rounded-xl border-2 border-dashed border-line px-4 text-base font-semibold text-ink-700">Outro problema</button>
          ) : (
            <div className="space-y-2 rounded-xl border-2 border-line p-3">
              <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} maxLength={300} placeholder="Conte rapidamente o que aconteceu" className="w-full rounded-lg border border-line-strong bg-surface p-2 text-base" />
              <button type="button" disabled={Boolean(enviando) || !comment.trim()} onClick={() => void enviar('Outro')} className="w-full rounded-xl bg-brand py-3 text-base font-bold text-on-brand disabled:opacity-60">{enviando === 'Outro' ? 'Enviando…' : 'Avisar a equipe'}</button>
            </div>
          )}
        </div>
      </div>
      {err && <p className="text-sm font-medium text-danger" role="alert">{err}</p>}
      <p className="text-center text-xs text-ink-500">Um toque já avisa a equipe. Não precisa se identificar.</p>
    </div>
  );
}
