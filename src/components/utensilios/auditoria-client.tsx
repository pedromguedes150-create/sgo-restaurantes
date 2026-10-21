'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, RotateCcw, Save } from 'lucide-react';
import { Button } from '@/components/ui/ds/button';
import { Banner } from '@/components/ui/ds/banner';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/ds/field';
import { SgoModal } from '@/components/sgo/sgo-modal';
import { diferenca, MOTIVO_MIN, normalizarQuantidade } from '@/lib/utensilios/regras';

/**
 * A AUDITORIA do supervisor/coordenador: a relação item a item com a
 * quantidade informada, uma coluna OPCIONAL de conferência (a diferença se
 * destaca sozinha), observação de auditoria, e as duas saídas — Aprovar ou
 * Devolver com motivo obrigatório. A conferência nunca é exigida para aprovar.
 */

export interface ItemAuditoriaUI { id: string; name: string; quantity: number | null; auditedQuantity: number | null; custom: boolean; note: string | null }

async function acao(body: Record<string, unknown>) {
  const r = await fetch('/api/utensilios', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { ok: r.ok, body: await r.json().catch(() => ({})) as { error?: string } };
}

export function AuditoriaClient({ inventarioId, itens, observacaoAtual }: { inventarioId: string; itens: ItemAuditoriaUI[]; observacaoAtual: string | null }) {
  const router = useRouter();
  const [aud, setAud] = useState<Record<string, string>>(() => Object.fromEntries(itens.map((i) => [i.id, i.auditedQuantity === null ? '' : String(i.auditedQuantity)])));
  const [obs, setObs] = useState(observacaoAtual ?? '');
  const [motivo, setMotivo] = useState('');
  const [devolvendo, setDevolvendo] = useState(false);
  const [aprovando, setAprovando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const invalidos = useMemo(() => new Set(Object.entries(aud).filter(([, v]) => !normalizarQuantidade(v).ok).map(([k]) => k)), [aud]);
  const divergentes = useMemo(() => itens.filter((i) => { const q = normalizarQuantidade(aud[i.id]); return q.ok && diferenca(i.quantity, q.valor) !== null && diferenca(i.quantity, q.valor) !== 0; }).length, [itens, aud]);

  async function conferir() {
    if (invalidos.size) { setErro('Quantidade auditada inválida: só inteiros de 0 em diante.'); return; }
    setOcupado('conferir'); setErro(null); setAviso(null);
    const r = await acao({ acao: 'conferir', id: inventarioId, auditadas: aud, observacao: obs });
    setOcupado(null);
    if (!r.ok) { setErro(r.body.error ?? 'Não foi possível registrar.'); return; }
    setAviso('Conferência registrada.'); router.refresh();
  }
  async function aprovar() {
    setOcupado('aprovar'); setErro(null); setAprovando(false);
    if (Object.values(aud).some((v) => v !== '') || obs.trim()) { const c = await acao({ acao: 'conferir', id: inventarioId, auditadas: aud, observacao: obs }); if (!c.ok) { setOcupado(null); setErro(c.body.error ?? 'Não foi possível registrar a conferência.'); return; } }
    const r = await acao({ acao: 'aprovar', id: inventarioId, observacao: obs });
    setOcupado(null);
    if (!r.ok) { setErro(r.body.error ?? 'Não foi possível aprovar.'); return; }
    router.refresh();
  }
  async function devolver() {
    if (motivo.trim().length < MOTIVO_MIN) { setErro(`Informe o motivo da devolução (mínimo ${MOTIVO_MIN} caracteres).`); return; }
    setOcupado('devolver'); setErro(null); setDevolvendo(false);
    if (Object.values(aud).some((v) => v !== '') || obs.trim()) await acao({ acao: 'conferir', id: inventarioId, auditadas: aud, observacao: obs });
    const r = await acao({ acao: 'devolver', id: inventarioId, motivo });
    setOcupado(null);
    if (!r.ok) { setErro(r.body.error ?? 'Não foi possível devolver.'); return; }
    router.refresh();
  }

  return (
    <div className="space-y-4" data-testid="auditoria-utensilios">
      {erro && <Banner tone="danger" title={erro} />}
      {aviso && <Banner tone="success" title={aviso} />}
      <section className="sgo-panel sgo-panel--solid overflow-hidden">
        <p className="sgo-panel__title px-3 pt-3 sm:px-4">Itens informados pelo gerente</p>
        <p className="px-3 pb-2 text-xs text-ink-500 sm:px-4">A coluna &ldquo;Conferido&rdquo; é opcional: preencha só se você contou. A diferença aparece sozinha.</p>
        <div className="overflow-x-auto">
          <table className="sgo-tbl w-full text-sm">
            <thead><tr><th className="text-left">Utensílio</th><th className="text-right">Informado</th><th className="text-right">Conferido</th><th className="text-right">Diferença</th></tr></thead>
            <tbody>
              {itens.map((i) => {
                const q = normalizarQuantidade(aud[i.id]);
                const d = q.ok ? diferenca(i.quantity, q.valor) : null;
                return (
                  <tr key={i.id}>
                    <td className="whitespace-normal font-medium text-ink-900">{i.name}{i.custom && <span className="ml-2 text-xs font-normal text-ink-500">adicionado</span>}{i.note && <span className="block text-xs font-normal text-ink-500">{i.note}</span>}</td>
                    <td className="text-right tabular-nums">{i.quantity === null ? '—' : i.quantity.toLocaleString('pt-BR')}</td>
                    <td className="text-right"><Input inputMode="numeric" pattern="[0-9]*" aria-label={`Conferido de ${i.name}`} placeholder="—" value={aud[i.id] ?? ''} onChange={(e) => setAud((s) => ({ ...s, [i.id]: e.target.value }))} className={`h-10 w-24 text-right text-sm tabular-nums ${invalidos.has(i.id) ? 'border-danger' : ''}`} /></td>
                    <td className={`text-right tabular-nums font-semibold ${d === null ? 'text-ink-400' : d === 0 ? 'text-success' : 'text-danger'}`}>{d === null ? '—' : d > 0 ? `+${d}` : String(d)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {divergentes > 0 && <p className="px-3 pb-3 text-xs text-danger sm:px-4">{divergentes} item(ns) com diferença entre o informado e o conferido.</p>}
      </section>

      <section className="sgo-panel sgo-panel--solid p-3 sm:p-4">
        <Textarea label="Observação de auditoria" value={obs} onChange={(e) => setObs(e.target.value)} rows={3} maxLength={2000} placeholder="Problemas identificados, orientações…" />
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" onClick={() => void conferir()} loading={ocupado === 'conferir'}><Save className="h-4 w-4" /> Registrar conferência</Button>
        <Button variant="secondary" onClick={() => setDevolvendo(true)} loading={ocupado === 'devolver'}><RotateCcw className="h-4 w-4" /> Devolver para correção</Button>
        <Button onClick={() => setAprovando(true)} loading={ocupado === 'aprovar'}><Check className="h-4 w-4" /> Aprovar inventário</Button>
      </div>

      <SgoModal open={devolvendo} onClose={() => setDevolvendo(false)} title="Devolver para correção"
        footer={<><Button variant="secondary" onClick={() => setDevolvendo(false)}>Voltar</Button><Button onClick={() => void devolver()} disabled={motivo.trim().length < MOTIVO_MIN}><RotateCcw className="h-4 w-4" /> Devolver</Button></>}>
        <Textarea label="Motivo (obrigatório) — o gerente recebe este texto" value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} maxLength={1000} autoFocus required hint={`Mínimo ${MOTIVO_MIN} caracteres.`} />
      </SgoModal>
      <SgoModal open={aprovando} onClose={() => setAprovando(false)} title="Aprovar este inventário?"
        footer={<><Button variant="secondary" onClick={() => setAprovando(false)}>Voltar</Button><Button onClick={() => void aprovar()}><Check className="h-4 w-4" /> Aprovar</Button></>}>
        <p className="text-sm text-ink-700">Aprovado, o inventário fica fechado e vai para o histórico. {divergentes > 0 ? `Há ${divergentes} item(ns) com diferença registrada — eles ficam gravados assim.` : ''}</p>
      </SgoModal>
    </div>
  );
}
