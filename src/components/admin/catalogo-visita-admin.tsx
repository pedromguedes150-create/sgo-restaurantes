'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Plus, Save, X } from 'lucide-react';
import type { ItemDoCatalogo, Modo, TipoUnidade } from '@/lib/supervisor/operacional-calculo';

const TIPOS: [TipoUnidade, string][] = [['RESTAURANTE', 'Restaurante'], ['LANCHONETE', 'Lanchonete'], ['CD', 'CD'], ['FABRICA', 'Fábrica']];
const MODOS: [Modo, string][] = [['SIMPLES', 'Conforme / Não / N/A'], ['AMOSTRAGEM', 'Amostragem'], ['TEMPERATURA', 'Temperatura']];
const vazio: Omit<ItemDoCatalogo, 'id'> = { section: '', text: '', order: 0, level: 'COMPLEMENTAR', mode: 'SIMPLES', unitTypes: [], requiresPizzeria: false, active: true, photoOnNc: false, noteOnNc: false, tempMin: null, tempMax: null };

function Editor({ inicial, id, onFim }: { inicial: Omit<ItemDoCatalogo, 'id'>; id: string | null; onFim: () => void }) {
  const router = useRouter();
  const [i, setI] = useState(inicial);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const campo = 'h-10 w-full rounded-control border border-line bg-surface px-3 text-sm';
  async function salvar() {
    setBusy(true); setErro(null);
    const r = await fetch('/api/admin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entity: 'visitAuditItem', action: 'save', id, item: i }) });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setErro(d.error ?? 'Dados inválidos (seção, texto; faixa mínima ≤ máxima).'); return; }
    onFim(); router.refresh();
  }
  return (
    <div className="space-y-2 rounded-card border border-brand/30 bg-brand/5 p-3">
      <div className="grid gap-2 md:grid-cols-[14rem_minmax(0,1fr)_6rem]">
        <label className="block"><span className="sgo-label mb-1 block">Seção</span><input className={campo} value={i.section} onChange={(e) => setI({ ...i, section: e.target.value })} placeholder="Ex.: Higiene e segurança dos alimentos" /></label>
        <label className="block"><span className="sgo-label mb-1 block">Item</span><input className={campo} value={i.text} onChange={(e) => setI({ ...i, text: e.target.value })} /></label>
        <label className="block"><span className="sgo-label mb-1 block">Ordem</span><input className={campo} inputMode="numeric" value={i.order} onChange={(e) => setI({ ...i, order: Number(e.target.value.replace(/\D/g, '') || 0) })} /></label>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="sgo-label">Nível</span>
        {(['PRIMORDIAL', 'COMPLEMENTAR'] as const).map((n) => <button key={n} type="button" className={`sgo-btn sgo-btn--sm ${i.level === n ? 'sgo-btn--primary' : ''}`} onClick={() => setI({ ...i, level: n })}>{n === 'PRIMORDIAL' ? 'Primordial' : 'Complementar'}</button>)}
        <span className="sgo-label ml-2">Resposta</span>
        {MODOS.map(([m, t]) => <button key={m} type="button" className={`sgo-btn sgo-btn--sm ${i.mode === m ? 'sgo-btn--primary' : ''}`} onClick={() => setI({ ...i, mode: m })}>{t}</button>)}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="sgo-label">Aplica-se a</span>
        {TIPOS.map(([t, r]) => {
          const on = i.unitTypes.includes(t);
          return <button key={t} type="button" className={`sgo-btn sgo-btn--sm ${on ? 'sgo-btn--primary' : ''}`} aria-pressed={on} onClick={() => setI({ ...i, unitTypes: on ? i.unitTypes.filter((x) => x !== t) : [...i.unitTypes, t] })}>{r}</button>;
        })}
        <span className="text-xs text-ink-500">{i.unitTypes.length ? '' : '(nenhum marcado = todas)'}</span>
        <label className="ml-2 inline-flex items-center gap-1.5 text-sm"><input type="checkbox" checked={i.requiresPizzeria} onChange={(e) => setI({ ...i, requiresPizzeria: e.target.checked })} /> só com pizzaria</label>
      </div>
      {i.mode === 'TEMPERATURA' && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="block"><span className="sgo-label mb-1 block">Mínima (°C)</span><input className={`${campo} w-28`} inputMode="decimal" value={i.tempMin ?? ''} onChange={(e) => setI({ ...i, tempMin: e.target.value === '' ? null : Number(e.target.value.replace(',', '.')) })} /></label>
          <label className="block"><span className="sgo-label mb-1 block">Máxima (°C)</span><input className={`${campo} w-28`} inputMode="decimal" value={i.tempMax ?? ''} onChange={(e) => setI({ ...i, tempMax: e.target.value === '' ? null : Number(e.target.value.replace(',', '.')) })} /></label>
          <span className="pb-2 text-xs text-ink-500">Defina pela orientação do POP/nutricionista. Sem faixa, o supervisor marca conforme ou não.</span>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={i.photoOnNc} onChange={(e) => setI({ ...i, photoOnNc: e.target.checked })} /> pedir foto na não conformidade</label>
        <label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={i.noteOnNc} onChange={(e) => setI({ ...i, noteOnNc: e.target.checked })} /> pedir observação</label>
        <label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={i.active} onChange={(e) => setI({ ...i, active: e.target.checked })} /> ativo</label>
      </div>
      {erro && <p className="text-sm text-danger" role="alert">{erro}</p>}
      <div className="flex gap-2">
        <button type="button" className="sgo-btn sgo-btn--primary" disabled={busy || !i.section.trim() || !i.text.trim()} onClick={() => void salvar()}><Save className="h-4 w-4" /> Salvar</button>
        <button type="button" className="sgo-btn" onClick={onFim}><X className="h-4 w-4" /> Cancelar</button>
      </div>
    </div>
  );
}

/**
 * Catálogo de itens da VISITA OPERACIONAL (v1.155.0). Ativar/desativar, ordem,
 * nível (primordial/complementar), tipos de unidade, modo de resposta, faixa
 * de temperatura (sem número fixo no código) e o que pedir na não conformidade.
 * Editar o catálogo não reescreve visitas já feitas (o texto vai congelado).
 */
export function CatalogoVisitaAdmin({ itens }: { itens: ItemDoCatalogo[] }) {
  const [editando, setEditando] = useState<string | 'novo' | null>(null);
  const [mostrarInativos, setMostrarInativos] = useState(false);
  const secoes = useMemo(() => {
    const vis = itens.filter((i) => mostrarInativos || i.active);
    return [...new Set(vis.map((i) => i.section))].map((s) => ({ s, itens: vis.filter((i) => i.section === s) }));
  }, [itens, mostrarInativos]);
  const tipoTxt = (t: TipoUnidade[]) => (t.length ? t.map((x) => TIPOS.find((y) => y[0] === x)?.[1]).join(', ') : 'todas');

  return (
    <div className="space-y-3" data-testid="catalogo-visita">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="sgo-btn sgo-btn--primary" onClick={() => setEditando('novo')}><Plus className="h-4 w-4" /> Novo item</button>
        <label className="inline-flex items-center gap-1.5 text-sm"><input type="checkbox" checked={mostrarInativos} onChange={(e) => setMostrarInativos(e.target.checked)} /> mostrar inativos</label>
        <span className="text-xs text-ink-500">{itens.filter((i) => i.active).length} ativos · {itens.length} no total</span>
      </div>
      {editando === 'novo' && <Editor inicial={vazio} id={null} onFim={() => setEditando(null)} />}
      {secoes.map(({ s, itens: lista }) => (
        <div key={s} className="sgo-panel overflow-hidden">
          <div className="sgo-panel__hdr"><div className="sgo-panel__title">{s}</div><span className="sgo-count">{lista.length}</span></div>
          <ul className="divide-y divide-line">
            {lista.map((i) => (
              <li key={i.id} className="p-3">
                {editando === i.id ? <Editor inicial={i} id={i.id} onFim={() => setEditando(null)} /> : (
                  <div className="flex flex-wrap items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm ${i.active ? 'text-ink-900' : 'text-ink-500 line-through'}`}>{i.text}</p>
                      <p className="text-xs text-ink-500">
                        {i.level === 'PRIMORDIAL' ? 'Primordial' : 'Complementar'} · {MODOS.find((m) => m[0] === i.mode)?.[1]} · {tipoTxt(i.unitTypes)}{i.requiresPizzeria ? ' · só com pizzaria' : ''}
                        {i.mode === 'TEMPERATURA' ? ` · faixa ${i.tempMin ?? '—'} a ${i.tempMax ?? '—'} °C` : ''}{i.photoOnNc ? ' · pede foto' : ''}
                      </p>
                    </div>
                    <button type="button" className="sgo-btn sgo-btn--sm" onClick={() => setEditando(i.id)} aria-label={`Editar ${i.text}`}><Pencil className="h-3.5 w-3.5" /> Editar</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
