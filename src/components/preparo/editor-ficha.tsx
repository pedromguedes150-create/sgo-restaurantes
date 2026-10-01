'use client';

import * as React from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2, AlertTriangle } from 'lucide-react';
import { Button, IconButton } from '@/components/ui/ds/button';
import { Input, Textarea } from '@/components/ui/ds/field';
import { Select } from '@/components/ui/ds/select';
import { cn } from '@/lib/utils';
import { LIMITES, campoParaRevisar, type DadosDaFicha, type ItemDaFicha } from '@/lib/preparo/tipos';

/**
 * EDITOR DA FICHA — o mesmo formulário para três momentos: pré-visualização
 * da importação, "Nova ficha" e "Editar ficha". Assim o que a IA sugeriu e o
 * que o Admin digita passam pela mesma tela e pela mesma validação.
 *
 * Os valores ficam como TEXTO enquanto se edita (o usuário digita "0,5" e
 * apaga pela metade); a conversão para número é do servidor (normalizarDados).
 * `revisar` = campos que a IA não leu com segurança: ganham o selo
 * "Revisar informação" até o Admin mexer neles.
 */

export interface ItemEditavel { ingredientName: string; quantity: string; unit: string; weightGrams: string; notes: string }
export interface FichaEditavel {
  name: string; code: string; category: string; preparationMethod: string; generalNotes: string; items: ItemEditavel[];
}

const n2s = (v: number | null) => (v === null ? '' : String(v).replace('.', ','));

export function paraEditavel(d: DadosDaFicha | null): FichaEditavel {
  if (!d) return { name: '', code: '', category: '', preparationMethod: '', generalNotes: '', items: [itemVazio()] };
  return {
    name: d.name, code: d.code, category: d.category,
    preparationMethod: d.preparationMethod ?? '', generalNotes: d.generalNotes ?? '',
    items: d.items.length ? d.items.map(itemEditavel) : [itemVazio()],
  };
}

export function itemEditavel(i: ItemDaFicha): ItemEditavel {
  return { ingredientName: i.ingredientName, quantity: n2s(i.quantity), unit: i.unit ?? '', weightGrams: n2s(i.weightGrams), notes: i.notes ?? '' };
}

export const itemVazio = (): ItemEditavel => ({ ingredientName: '', quantity: '', unit: '', weightGrams: '', notes: '' });

/** O que vai para o servidor: strings mesmo — `normalizarDados` converte e valida. */
export function paraEnvio(f: FichaEditavel) {
  return {
    name: f.name, code: f.code, category: f.category,
    preparationMethod: f.preparationMethod, generalNotes: f.generalNotes,
    items: f.items.map((i) => ({ ingredientName: i.ingredientName, quantity: i.quantity, unit: i.unit, weightGrams: i.weightGrams, notes: i.notes })),
  };
}

function SeloRevisar() {
  return (
    <span className="inline-flex items-center gap-1 rounded-pill bg-warning-bg px-2 py-0.5 text-xs font-semibold text-warning">
      <AlertTriangle className="h-3 w-3" aria-hidden /> Revisar informação
    </span>
  );
}

export function EditorFicha({ valor, onChange, revisar = [], categorias, erroCampo }: {
  valor: FichaEditavel;
  onChange: (f: FichaEditavel) => void;
  /** Caminhos de campo da IA ("code", "items.1.weightGrams"). */
  revisar?: string[];
  categorias: string[];
  /** Campo apontado pelo servidor numa recusa ("items.2.quantity"). */
  erroCampo?: string | null;
}) {
  const [tocados, setTocados] = React.useState<Set<string>>(new Set());
  const marca = (campo: string) => campoParaRevisar(revisar, campo) && !tocados.has(campo);
  const toca = (campo: string) => setTocados((s) => (s.has(campo) ? s : new Set(s).add(campo)));

  const set = (patch: Partial<FichaEditavel>) => onChange({ ...valor, ...patch });
  const setItem = (i: number, patch: Partial<ItemEditavel>) => {
    const items = valor.items.map((it, k) => (k === i ? { ...it, ...patch } : it));
    onChange({ ...valor, items });
  };
  const mover = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= valor.items.length) return;
    const items = [...valor.items];
    [items[i], items[j]] = [items[j], items[i]];
    onChange({ ...valor, items });
  };
  const remover = (i: number) => onChange({ ...valor, items: valor.items.filter((_, k) => k !== i) });
  const adicionar = () => onChange({ ...valor, items: [...valor.items, itemVazio()] });

  const opcoesCategoria = React.useMemo(() => {
    const todas = new Set(categorias);
    if (valor.category) todas.add(valor.category);
    return [...todas].sort((a, b) => a.localeCompare(b, 'pt-BR')).map((c) => ({ value: c, label: c }));
  }, [categorias, valor.category]);
  const [novaCategoria, setNovaCategoria] = React.useState(false);

  const erroEm = (campo: string) => (erroCampo === campo ? 'Confira este campo.' : undefined);

  return (
    <div className="space-y-5">
      <section className="space-y-3">
        <h3 className="sgo-type-11 font-semibold text-ink-500">Dados principais</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Input label="Nome do produto" value={valor.name} maxLength={LIMITES.nome} required
              onChange={(e) => { toca('name'); set({ name: e.target.value }); }} error={erroEm('name')} />
            {marca('name') && <div className="mt-1"><SeloRevisar /></div>}
          </div>
          <div>
            <Input label="Código" value={valor.code} maxLength={LIMITES.codigo} required inputMode="numeric"
              onChange={(e) => { toca('code'); set({ code: e.target.value }); }} error={erroEm('code')} hint="Como está no Teknisa (ex.: 910000000501)." />
            {marca('code') && <div className="mt-1"><SeloRevisar /></div>}
          </div>
          <div>
            {novaCategoria || opcoesCategoria.length === 0 ? (
              <Input label="Categoria" value={valor.category} maxLength={LIMITES.categoria} placeholder="Ex.: Lanches"
                onChange={(e) => { toca('category'); set({ category: e.target.value }); }}
                hint={opcoesCategoria.length > 0 ? 'Digite uma categoria nova.' : undefined} />
            ) : (
              <Select label="Categoria" value={valor.category} searchable
                options={[...opcoesCategoria, { value: '__nova__', label: '+ Nova categoria…' }]}
                onValueChange={(v) => { toca('category'); if (v === '__nova__') { setNovaCategoria(true); set({ category: '' }); } else set({ category: v }); }} />
            )}
            {marca('category') && <div className="mt-1"><SeloRevisar /></div>}
          </div>
        </div>
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="sgo-type-11 font-semibold text-ink-500">Ingredientes</h3>
          <Button type="button" size="sm" variant="secondary" onClick={adicionar} disabled={valor.items.length >= LIMITES.itens}>
            <Plus className="h-4 w-4" /> Adicionar ingrediente
          </Button>
        </div>
        <p className="text-xs text-ink-500">Quantidade e peso em branco = a ficha não informa. Peso sempre em gramas.</p>
        <ol className="space-y-2">
          {valor.items.map((it, i) => {
            const p = (c: string) => `items.${i}.${c}`;
            return (
              <li key={i} className={cn('rounded-card border border-line bg-surface p-3', erroCampo?.startsWith(`items.${i}`) && 'border-danger')}>
                <div className="grid gap-2 sm:grid-cols-12">
                  <div className="sm:col-span-4">
                    <Input label={i === 0 ? 'Ingrediente' : undefined} aria-label="Ingrediente" value={it.ingredientName} maxLength={LIMITES.ingrediente} inputSize="sm"
                      onChange={(e) => { toca(p('ingredientName')); setItem(i, { ingredientName: e.target.value }); }} error={erroEm(p('ingredientName'))} />
                    {marca(p('ingredientName')) && <div className="mt-1"><SeloRevisar /></div>}
                  </div>
                  <div className="sm:col-span-2">
                    <Input label={i === 0 ? 'Qtd.' : undefined} aria-label="Quantidade" value={it.quantity} inputMode="decimal" inputSize="sm" placeholder="1"
                      onChange={(e) => { toca(p('quantity')); setItem(i, { quantity: e.target.value }); }} error={erroEm(p('quantity'))} />
                    {marca(p('quantity')) && <div className="mt-1"><SeloRevisar /></div>}
                  </div>
                  <div className="sm:col-span-2">
                    <Input label={i === 0 ? 'Unidade' : undefined} aria-label="Unidade" value={it.unit} maxLength={LIMITES.unidade} inputSize="sm" placeholder="Unid, fatias…"
                      onChange={(e) => { toca(p('unit')); setItem(i, { unit: e.target.value }); }} />
                    {marca(p('unit')) && <div className="mt-1"><SeloRevisar /></div>}
                  </div>
                  <div className="sm:col-span-2">
                    <Input label={i === 0 ? 'Peso (g)' : undefined} aria-label="Peso em gramas" value={it.weightGrams} inputMode="decimal" inputSize="sm" placeholder="65"
                      onChange={(e) => { toca(p('weightGrams')); setItem(i, { weightGrams: e.target.value }); }} error={erroEm(p('weightGrams'))} />
                    {marca(p('weightGrams')) && <div className="mt-1"><SeloRevisar /></div>}
                  </div>
                  <div className="flex items-end justify-end gap-1 sm:col-span-2">
                    <IconButton type="button" size="sm" variant="ghost" aria-label="Mover para cima" onClick={() => mover(i, -1)} disabled={i === 0}><ArrowUp className="h-4 w-4" /></IconButton>
                    <IconButton type="button" size="sm" variant="ghost" aria-label="Mover para baixo" onClick={() => mover(i, 1)} disabled={i === valor.items.length - 1}><ArrowDown className="h-4 w-4" /></IconButton>
                    <IconButton type="button" size="sm" variant="danger" aria-label="Remover ingrediente" onClick={() => remover(i)}><Trash2 className="h-4 w-4" /></IconButton>
                  </div>
                  <div className="sm:col-span-12">
                    <Input aria-label="Observação do ingrediente" value={it.notes} maxLength={LIMITES.observacao} inputSize="sm" placeholder="Observação (ex.: fatia na largura da espátula)"
                      onChange={(e) => { toca(p('notes')); setItem(i, { notes: e.target.value }); }} />
                    {marca(p('notes')) && <div className="mt-1"><SeloRevisar /></div>}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="space-y-3">
        <h3 className="sgo-type-11 font-semibold text-ink-500">Preparo</h3>
        <Textarea label="Modo de preparo" rows={5} value={valor.preparationMethod} maxLength={LIMITES.texto}
          placeholder="Passo a passo da montagem/preparo, se a ficha tiver."
          onChange={(e) => { toca('preparationMethod'); set({ preparationMethod: e.target.value }); }} />
        {marca('preparationMethod') && <SeloRevisar />}
        <Textarea label="Observações adicionais" rows={3} value={valor.generalNotes} maxLength={LIMITES.texto}
          onChange={(e) => { toca('generalNotes'); set({ generalNotes: e.target.value }); }} />
        {marca('generalNotes') && <SeloRevisar />}
      </section>
    </div>
  );
}
