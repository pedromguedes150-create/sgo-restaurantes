'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Save, Send, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/ds/button';
import { Select } from '@/components/ui/ds/select';
import { Banner } from '@/components/ui/ds/banner';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/ds/field';
import { SgoModal } from '@/components/sgo/sgo-modal';
import { normalizarQuantidade, totalDeUtensilios } from '@/lib/utensilios/regras';

/**
 * A FOLHA DE CONTAGEM do gerente: um utensílio por linha, campo numérico
 * grande (celular), "+ Adicionar outro utensílio", observações, Salvar
 * rascunho e Enviar (com confirmação). Campo vazio = não conferido; zero é
 * zero — o envio exige todos preenchidos e a tela diz quais faltam.
 */

export interface ItemUI { id: string; name: string; quantity: number | null; custom: boolean; note: string | null }
export interface ContagemUI {
  id: string; unidade: string; status: 'RASCUNHO' | 'EM_CORRECAO';
  managerId: string; notes: string | null; returnReason: string | null; items: ItemUI[];
}
interface Novo { tempId: string; name: string; quantity: string; note: string }

async function acao(body: Record<string, unknown>) {
  const r = await fetch('/api/utensilios', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { ok: r.ok, body: await r.json().catch(() => ({})) as { error?: string; faltam?: string[]; status?: string } };
}

export function ContagemClient({ inventario, responsaveis }: { inventario: ContagemUI; responsaveis: { id: string; name: string }[] }) {
  const router = useRouter();
  const [qtd, setQtd] = useState<Record<string, string>>(() => Object.fromEntries(inventario.items.map((i) => [i.id, i.quantity === null ? '' : String(i.quantity)])));
  const [notas, setNotas] = useState(inventario.notes ?? '');
  const [managerId, setManagerId] = useState(inventario.managerId);
  const [novos, setNovos] = useState<Novo[]>([]);
  const [remover, setRemover] = useState<Set<string>>(new Set());
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [faltam, setFaltam] = useState<string[]>([]);
  const [ocupado, setOcupado] = useState<'salvar' | 'enviar' | null>(null);
  const [confirmando, setConfirmando] = useState(false);

  const padrao = inventario.items.filter((i) => !i.custom);
  const personalizados = inventario.items.filter((i) => i.custom && !remover.has(i.id));

  const invalidos = useMemo(() => {
    const out = new Set<string>();
    for (const [id, v] of Object.entries(qtd)) if (!normalizarQuantidade(v).ok) out.add(id);
    for (const n of novos) if (!normalizarQuantidade(n.quantity).ok) out.add(n.tempId);
    return out;
  }, [qtd, novos]);

  const semPreencher = useMemo(() => {
    const nomes: string[] = [];
    for (const i of [...padrao, ...personalizados]) if ((qtd[i.id] ?? '').trim() === '') nomes.push(i.name);
    for (const n of novos) if (n.quantity.trim() === '') nomes.push(n.name || 'utensílio sem nome');
    return nomes;
  }, [padrao, personalizados, novos, qtd]);

  const total = useMemo(() => totalDeUtensilios([
    ...[...padrao, ...personalizados].map((i) => ({ quantity: normalizarQuantidade(qtd[i.id]).ok ? (normalizarQuantidade(qtd[i.id]) as { valor: number | null }).valor : null })),
    ...novos.map((n) => ({ quantity: normalizarQuantidade(n.quantity).ok ? (normalizarQuantidade(n.quantity) as { valor: number | null }).valor : null })),
  ]), [padrao, personalizados, novos, qtd]);

  function corpo() {
    return {
      id: inventario.id, managerId, notes: notas,
      itens: [...padrao, ...personalizados].map((i) => ({ id: i.id, quantity: qtd[i.id] ?? '' })),
      novos: novos.filter((n) => n.name.trim()).map((n) => ({ name: n.name, quantity: n.quantity, note: n.note || null })),
      remover: [...remover],
    };
  }

  async function salvar() {
    if (invalidos.size) { setErro('Há quantidade inválida: use só números inteiros, de 0 em diante.'); return; }
    setOcupado('salvar'); setErro(null); setAviso(null);
    const r = await acao({ acao: 'salvar', ...corpo() });
    setOcupado(null);
    if (!r.ok) { setErro(r.body.error ?? 'Não foi possível salvar.'); return; }
    setAviso('Rascunho salvo. Você pode continuar depois.');
    setNovos([]); setRemover(new Set());
    router.refresh();
  }

  async function enviar() {
    setOcupado('enviar'); setErro(null); setAviso(null); setConfirmando(false);
    const r = await acao({ acao: 'enviar', ...corpo() });
    setOcupado(null);
    if (!r.ok) { setErro(r.body.error ?? 'Não foi possível enviar.'); setFaltam(r.body.faltam ?? []); return; }
    router.refresh();
  }

  const podeEnviar = semPreencher.length === 0 && invalidos.size === 0;

  return (
    <div className="space-y-4" data-testid="contagem-utensilios">
      {inventario.status === 'EM_CORRECAO' && inventario.returnReason && (
        <Banner tone="danger" title="Devolvido para correção" description={inventario.returnReason} />
      )}
      {erro && <Banner tone="danger" title={erro} description={faltam.length ? `Faltam: ${faltam.join(', ')}.` : undefined} />}
      {aviso && <Banner tone="success" title={aviso} />}

      <section className="sgo-panel sgo-panel--solid p-3 sm:p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium text-ink-500">Unidade</p>
            <p className="text-sm font-semibold text-ink-900">{inventario.unidade}</p>
          </div>
          <Select
            label="Gerente responsável" value={managerId} onValueChange={setManagerId}
            options={responsaveis.map((r) => ({ value: r.id, label: r.name }))}
            hint={responsaveis.length === 0 ? 'Nenhum gerente vinculado a esta unidade.' : undefined}
          />
        </div>
      </section>

      <section className="sgo-panel sgo-panel--solid overflow-hidden">
        <p className="sgo-panel__title px-3 pt-3 sm:px-4">Utensílios</p>
        <ul className="divide-y divide-line">
          {[...padrao, ...personalizados].map((i) => (
            <li key={i.id} className="flex items-center justify-between gap-3 px-3 py-2.5 sm:px-4" data-testid={`item-${i.custom ? 'extra' : 'padrao'}`}>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink-900">{i.name}{i.custom && <span className="ml-2 text-xs font-normal text-ink-500">adicionado</span>}</p>
                {(qtd[i.id] ?? '') === '' && <p className="text-xs text-ink-500">Não conferido</p>}
              </div>
              <Input
                inputMode="numeric" pattern="[0-9]*" aria-label={`Quantidade de ${i.name}`} placeholder="—"
                value={qtd[i.id] ?? ''} onChange={(e) => setQtd((s) => ({ ...s, [i.id]: e.target.value }))}
                className={`h-12 w-24 text-right text-base tabular-nums ${invalidos.has(i.id) ? 'border-danger' : ''}`}
              />
              {i.custom && (
                <button type="button" aria-label={`Remover ${i.name}`} className="rounded-control p-2 text-ink-500 hover:text-danger" onClick={() => setRemover((s) => new Set(s).add(i.id))}><Trash2 className="h-4 w-4" /></button>
              )}
            </li>
          ))}
          {novos.map((n) => (
            <li key={n.tempId} className="space-y-2 bg-sunken/40 px-3 py-2.5 sm:px-4" data-testid="item-novo">
              <div className="flex items-center gap-2">
                <Input aria-label="Nome do utensílio" placeholder="Nome do utensílio" value={n.name} onChange={(e) => setNovos((xs) => xs.map((x) => x.tempId === n.tempId ? { ...x, name: e.target.value } : x))} className="h-11 flex-1 text-sm" />
                <Input inputMode="numeric" pattern="[0-9]*" aria-label="Quantidade do novo utensílio" placeholder="—" value={n.quantity} onChange={(e) => setNovos((xs) => xs.map((x) => x.tempId === n.tempId ? { ...x, quantity: e.target.value } : x))} className={`h-11 w-24 text-right text-base tabular-nums ${invalidos.has(n.tempId) ? 'border-danger' : ''}`} />
                <button type="button" aria-label="Remover utensílio novo" className="rounded-control p-2 text-ink-500 hover:text-danger" onClick={() => setNovos((xs) => xs.filter((x) => x.tempId !== n.tempId))}><Trash2 className="h-4 w-4" /></button>
              </div>
              <Input aria-label="Observação do novo utensílio" placeholder="Observação (opcional)" value={n.note} onChange={(e) => setNovos((xs) => xs.map((x) => x.tempId === n.tempId ? { ...x, note: e.target.value } : x))} className="h-10 text-sm" />
            </li>
          ))}
        </ul>
        <div className="flex items-center justify-between gap-2 px-3 py-3 sm:px-4">
          <Button variant="secondary" size="sm" onClick={() => setNovos((xs) => [...xs, { tempId: `n${Date.now()}${xs.length}`, name: '', quantity: '', note: '' }])}>
            <Plus className="h-4 w-4" /> Adicionar outro utensílio
          </Button>
          <p className="text-sm text-ink-700">Total: <b className="tabular-nums text-ink-900">{total.toLocaleString('pt-BR')}</b></p>
        </div>
      </section>

      <section className="sgo-panel sgo-panel--solid p-3 sm:p-4">
        <Textarea
          label="Observações do gerente" value={notas} onChange={(e) => setNotas(e.target.value)} rows={3} maxLength={2000}
          placeholder="Ex.: necessária reposição de pratos; utensílios danificados; garfos insuficientes."
        />
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="lg" onClick={() => void salvar()} loading={ocupado === 'salvar'}><Save className="h-5 w-5" /> Salvar rascunho</Button>
        <Button size="lg" onClick={() => { if (!podeEnviar) { setErro(semPreencher.length ? `Preencha a quantidade de: ${semPreencher.join(', ')}.` : 'Há quantidade inválida.'); return; } setConfirmando(true); }} loading={ocupado === 'enviar'}>
          <Send className="h-5 w-5" /> {inventario.status === 'EM_CORRECAO' ? 'Reenviar inventário' : 'Enviar inventário'}
        </Button>
        {semPreencher.length > 0 && <span className="text-xs text-ink-500">{semPreencher.length} item(ns) sem quantidade.</span>}
      </div>

      <SgoModal open={confirmando} onClose={() => setConfirmando(false)} title="Enviar inventário para auditoria?"
        footer={<><Button variant="secondary" onClick={() => setConfirmando(false)}>Voltar</Button><Button onClick={() => void enviar()} loading={ocupado === 'enviar'}><Send className="h-4 w-4" /> Confirmar envio</Button></>}>
        <p className="text-sm text-ink-700">{inventario.unidade} · {padrao.length + personalizados.length + novos.length} utensílios · total <b className="tabular-nums">{total.toLocaleString('pt-BR')}</b>. Depois de enviado, a contagem fica bloqueada até o supervisor aprovar ou devolver.</p>
      </SgoModal>
    </div>
  );
}
