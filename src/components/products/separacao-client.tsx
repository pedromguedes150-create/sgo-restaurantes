'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Minus, Check, TriangleAlert, Undo2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet } from '@/components/ui/ds/sheet';
import { MOTIVOS_DE_FALTA } from '@/lib/products/separacao-motivos';

export interface ItemNaSeparacao {
  id: string;
  name: string;
  category: string;
  measure: string;
  qtyRequested: number;
  qtySeparated: number | null;
  missingLabel: string | null;
  separadoPor: string | null;
  faltando: number;
}

/** O conflito devolvido pelo servidor, já pronto para a pergunta na tela. */
interface Conflito {
  itemId: string;
  porQuem: string;
  quantidade: number | null;
  quando: string | null;
  /* O que a pessoa tentou gravar — guardado para o "Sobrescrever" repetir. */
  qty: number;
  missingReason: string | null;
}

/**
 * A TELA DO SEPARADOR.
 *
 * Quem usa está de pé, no corredor do CD, com uma mão no celular e a outra na
 * caixa. Por isso: um item por cartão, botões grandes, e **cada confirmação vai
 * para o servidor na hora** — não existe "salvar no fim". Se a página fechar,
 * o que já foi conferido está gravado.
 *
 * E quando o servidor responde 409, a tela não engole nem repete: ela mostra
 * quem separou, quanto, e deixa a decisão com quem está ali.
 */
export function SeparacaoClient({
  itens,
  bloqueado,
}: {
  itens: ItemNaSeparacao[];
  /** Pedido já enviado à unidade: histórico, não se mexe mais. */
  bloqueado: boolean;
}) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [conflito, setConflito] = useState<Conflito | null>(null);
  /* Quantidade em edição por item. Fora daqui, vale a do pedido. */
  const [rascunho, setRascunho] = useState<Record<string, number>>({});
  /* Item com o painel de falta aberto. */
  const [falta, setFalta] = useState<{ id: string; qty: number; motivo: string } | null>(null);

  const qtyDe = (i: ItemNaSeparacao) => rascunho[i.id] ?? i.qtySeparated ?? i.qtyRequested;

  async function enviar(itemId: string, qty: number, missingReason: string | null, sobrescrever = false) {
    setOcupado(itemId);
    setErro(null);
    try {
      const res = await fetch('/api/products/separacao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'separar', itemId, qty, missingReason, sobrescrever }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.status === 409 && data.reason === 'CONFLITO') {
        setConflito({
          itemId, porQuem: data.porQuem, quantidade: data.quantidade,
          quando: data.quando ? new Date(data.quando).toLocaleString('pt-BR') : null,
          qty, missingReason,
        });
        return;
      }
      if (!res.ok) { setErro(data.error ?? 'Não foi possível registrar.'); return; }

      setRascunho((r) => { const n = { ...r }; delete n[itemId]; return n; });
      setFalta(null);
      setConflito(null);
      router.refresh();
    } catch {
      setErro('Sem conexão. O item NÃO foi registrado — tente de novo.');
    } finally {
      setOcupado(null);
    }
  }

  async function desfazer(itemId: string) {
    setOcupado(itemId);
    setErro(null);
    try {
      const res = await fetch('/api/products/separacao', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'desfazer', itemId }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setErro(d.error ?? 'Não foi possível desfazer.'); return; }
      router.refresh();
    } finally {
      setOcupado(null);
    }
  }

  function somar(i: ItemNaSeparacao, delta: number) {
    const atual = qtyDe(i);
    const novo = Math.min(i.qtyRequested, Math.max(0, Math.round((atual + delta) * 1000) / 1000));
    setRascunho((r) => ({ ...r, [i.id]: novo }));
  }

  return (
    <div className="space-y-3">
      {erro && <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{erro}</p>}

      {itens.map((i) => {
        const qty = qtyDe(i);
        const feito = i.qtySeparated !== null;
        const completo = feito && i.faltando === 0;
        const trabalhando = ocupado === i.id;

        return (
          <div
            key={i.id}
            className={`rounded-lg border p-3 ${completo ? 'border-success bg-success-bg' : feito ? 'border-warning bg-warning-bg' : 'border-line bg-surface'}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-medium text-ink-900">{i.name}</p>
                <p className="text-xs text-ink-500">{i.category}</p>
              </div>
              <p className="shrink-0 text-right text-sm text-ink-700">
                <b className="text-base text-ink-900">{i.qtyRequested}</b> {i.measure}
              </p>
            </div>

            {feito ? (
              <div className="mt-2 flex items-center justify-between gap-2">
                <p className="text-sm text-ink-700">
                  {completo
                    ? <><Check className="mr-1 inline h-4 w-4 text-success" />Separado: <b>{i.qtySeparated} {i.measure}</b></>
                    : <><TriangleAlert className="mr-1 inline h-4 w-4 text-warning" />Separado <b>{i.qtySeparated}</b> de {i.qtyRequested} — faltaram <b>{i.faltando}</b>{i.missingLabel ? ` (${i.missingLabel})` : ''}</>}
                  {i.separadoPor && <span className="block text-xs text-ink-500">por {i.separadoPor}</span>}
                </p>
                {!bloqueado && (
                  <Button variant="outline" size="sm" onClick={() => desfazer(i.id)} disabled={trabalhando}>
                    {trabalhando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4" />}
                    <span className="ml-1">Refazer</span>
                  </Button>
                )}
              </div>
            ) : bloqueado ? (
              <p className="mt-2 text-sm text-ink-500">Não separado.</p>
            ) : (
              <>
                <div className="mt-3 flex items-center gap-2">
                  <Button variant="outline" size="icon" onClick={() => somar(i, -1)} aria-label="Menos um"><Minus className="h-4 w-4" /></Button>
                  <span className="min-w-14 text-center text-lg font-semibold text-ink-900">{qty}</span>
                  <Button variant="outline" size="icon" onClick={() => somar(i, 1)} aria-label="Mais um"><Plus className="h-4 w-4" /></Button>
                  <span className="text-sm text-ink-500">{i.measure}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    className="flex-1"
                    onClick={() => (qty < i.qtyRequested ? setFalta({ id: i.id, qty, motivo: '' }) : enviar(i.id, qty, null))}
                    disabled={trabalhando}
                  >
                    {trabalhando ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Check className="mr-1 h-4 w-4" />}
                    Confirmar separado
                  </Button>
                  <Button variant="outline" onClick={() => setFalta({ id: i.id, qty: 0, motivo: '' })} disabled={trabalhando}>
                    <TriangleAlert className="mr-1 h-4 w-4" />
                    Informar falta
                  </Button>
                </div>
              </>
            )}
          </div>
        );
      })}

      {/* ── Falta: quanto saiu e por quê ── */}
      <Sheet open={!!falta} onClose={() => setFalta(null)} title="Informar falta">
        {falta && (() => {
          const item = itens.find((x) => x.id === falta.id);
          if (!item) return null;
          return (
            <div className="space-y-4 p-4">
              <p className="text-sm text-ink-700">
                <b>{item.name}</b> — pedido de {item.qtyRequested} {item.measure}.
              </p>
              <div>
                <Label htmlFor="qtd-saiu">Quanto saiu de verdade</Label>
                <Input
                  id="qtd-saiu" type="number" min={0} max={item.qtyRequested} value={falta.qty}
                  onChange={(e) => setFalta({ ...falta, qty: Math.min(item.qtyRequested, Math.max(0, Number(e.target.value))) })}
                />
              </div>
              <div>
                <Label htmlFor="motivo">Motivo da falta</Label>
                <select
                  id="motivo"
                  className="h-10 w-full rounded-md border border-line bg-surface px-3 text-sm text-ink-900"
                  value={falta.motivo}
                  onChange={(e) => setFalta({ ...falta, motivo: e.target.value })}
                >
                  <option value="">Escolha…</option>
                  {MOTIVOS_DE_FALTA.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                </select>
              </div>
              <p className="text-xs text-ink-500">
                A falta não impede concluir a separação — ela segue registrada no pedido, e a unidade vê
                exatamente o que não veio e por quê.
              </p>
              <Button
                className="w-full"
                disabled={!falta.motivo || ocupado === falta.id}
                onClick={() => enviar(falta.id, falta.qty, falta.motivo)}
              >
                Registrar
              </Button>
            </div>
          );
        })()}
      </Sheet>

      {/* ── Conflito: alguém já mexeu neste item ── */}
      <Sheet open={!!conflito} onClose={() => setConflito(null)} title="Outra pessoa já separou este item">
        {conflito && (
          <div className="space-y-4 p-4">
            <p className="text-sm text-ink-700">
              <b>{conflito.porQuem}</b> registrou{' '}
              {conflito.quantidade === null ? 'este item' : <b>{conflito.quantidade}</b>}
              {conflito.quando ? ` em ${conflito.quando}` : ''}.
            </p>
            <p className="text-sm text-ink-700">
              Se você conferiu a mesma caixa, mantenha o que já está lá. Se conferiu de novo e chegou a outro
              número, pode sobrescrever — fica registrado que foi você.
            </p>
            <div className="flex flex-col gap-2">
              <Button variant="outline" onClick={() => { setConflito(null); router.refresh(); }}>
                Manter o que já está
              </Button>
              <Button onClick={() => enviar(conflito.itemId, conflito.qty, conflito.missingReason, true)}>
                Sobrescrever com {conflito.qty}
              </Button>
            </div>
          </div>
        )}
      </Sheet>
    </div>
  );
}
