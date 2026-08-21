'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Send, PackageCheck, Building2, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/ui/status-badge';

type Bal = Record<string, number>;

interface Pedido {
  id: string;
  unitId: string;
  unitName?: string;
  status: string;
  requestedByName: string;
  createdAt: string;
  note: string;
  need?: Bal;
  give?: Bal;
  needTotal?: number;
  giveTotal?: number;
  sent?: Bal;
  sentTotal?: number;
  sentByName?: string | null;
  sentAt?: string | null;
  sentNote?: string | null;
  received?: Bal;
  receivedTotal?: number;
  receivedByName?: string | null;
  receivedAt?: string | null;
  divergent?: boolean;
}

const brl = (v: number) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dt = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
const parseNum = (s: string) => parseFloat((s || '0').replace(/\./g, '').replace(',', '.')) || 0;

/** "R$ 50,00 em Moeda R$ 0,50 · R$ 20,00 em Nota R$ 20,00" */
function detalhe(b: Bal | undefined, rotulos: Record<string, string>): string {
  if (!b) return '—';
  const partes = Object.entries(b)
    .filter(([, v]) => (v || 0) > 0)
    .map(([k, v]) => `${brl(v)} em ${rotulos[k] ?? k}`);
  return partes.length ? partes.join(' · ') : '—';
}

export function OfficeChangeClient({
  units, fila, enviados, rotulos, podeEnviar, filtro,
}: {
  units: { id: string; name: string }[];
  fila: Pedido[];
  enviados: Pedido[];
  rotulos: Record<string, Record<string, string>>;
  podeEnviar: boolean;
  filtro: { unidade: string; de: string; ate: string };
}) {
  const router = useRouter();
  const [aba, setAba] = useState<'fila' | 'enviados'>('fila');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ t: 'ok' | 'err'; m: string } | null>(null);
  const [abrindo, setAbrindo] = useState<string | null>(null);
  const [valores, setValores] = useState<Record<string, string>>({});
  const [obs, setObs] = useState('');

  const aEnviar = useMemo(() => fila.filter((p) => p.status === 'OPEN'), [fila]);
  const aguardando = useMemo(() => fila.filter((p) => p.status === 'SENT'), [fila]);

  function abrirEnvio(p: Pedido) {
    setAbrindo(p.id);
    setObs('');
    /* Já vem preenchido com o que foi PEDIDO: o caso comum é enviar exatamente
       aquilo, e obrigar a redigitar doze campos só criaria erro de digitação. */
    const inicial: Record<string, string> = {};
    for (const [k, v] of Object.entries(p.need ?? {})) if ((v || 0) > 0) inicial[k] = String(v).replace('.', ',');
    setValores(inicial);
  }

  const chavesDaUnidade = (unitId: string) => Object.keys(rotulos[unitId] ?? {});
  const totalDigitado = Object.values(valores).reduce((t, v) => t + parseNum(v), 0);

  async function enviar(p: Pedido) {
    const sent: Bal = {};
    for (const k of chavesDaUnidade(p.unitId)) sent[k] = parseNum(valores[k] || '0');
    setBusy(true);
    try {
      const res = await fetch('/api/cash/vault', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sendChange', id: p.id, sent, note: obs }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg({ t: 'err', m: d.error ?? 'Falha ao registrar o envio' }); return; }
      setMsg({ t: 'ok', m: `Envio registrado. ${p.unitName} foi avisada para confirmar o recebimento.` });
      setAbrindo(null);
      router.refresh();
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant={aba === 'fila' ? 'default' : 'outline'} onClick={() => setAba('fila')}>
          <Send className="h-4 w-4" /> A enviar ({aEnviar.length}){aguardando.length > 0 && ` · aguardando ${aguardando.length}`}
        </Button>
        <Button size="sm" variant={aba === 'enviados' ? 'default' : 'outline'} onClick={() => setAba('enviados')}>
          <PackageCheck className="h-4 w-4" /> Relação de enviados ({enviados.length})
        </Button>
      </div>

      {msg && <p className={msg.t === 'ok' ? 'text-sm font-medium text-success' : 'text-sm font-medium text-danger'}>{msg.m}</p>}

      {aba === 'fila' && (
        <div className="space-y-3">
          {aEnviar.length === 0 && aguardando.length === 0 && (
            <p className="rounded-card border border-line bg-surface p-4 text-sm text-ink-500">Nenhum pedido de troco na fila. 🟢</p>
          )}

          {aEnviar.map((p) => (
            <div key={p.id} className="rounded-card border border-line bg-surface p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-ink-900">
                    <Building2 className="h-4 w-4 text-ink-500" /> {p.unitName}
                  </p>
                  <p className="text-xs text-ink-500">{p.requestedByName} · {dt(p.createdAt)}{p.note ? ` · ${p.note}` : ''}</p>
                </div>
                <StatusBadge tone="medium">a enviar</StatusBadge>
              </div>

              <div className="mt-2 space-y-1 text-sm">
                <p><span className="sgo-type-11 font-semibold text-success">precisa</span> {detalhe(p.need, rotulos[p.unitId] ?? {})} — <strong>{brl(p.needTotal ?? 0)}</strong></p>
                {(p.giveTotal ?? 0) > 0 && (
                  <p><span className="sgo-type-11 font-semibold text-danger">entrega</span> {detalhe(p.give, rotulos[p.unitId] ?? {})} — <strong>{brl(p.giveTotal ?? 0)}</strong></p>
                )}
              </div>

              {podeEnviar && abrindo !== p.id && (
                <Button size="sm" className="mt-3" onClick={() => abrirEnvio(p)}>
                  <Send className="h-4 w-4" /> Registrar envio
                </Button>
              )}

              {abrindo === p.id && (
                <div className="mt-3 space-y-2 rounded-md border border-dashed p-3">
                  <p className="sgo-type-11 font-semibold text-ink-900">O que está sendo enviado</p>
                  <p className="text-xs text-ink-500">
                    Já veio preenchido com o pedido. Ajuste se o escritório não tiver tudo — o que você registrar aqui é o que a
                    unidade vai conferir na chegada.
                  </p>
                  <div className="space-y-1">
                    {chavesDaUnidade(p.unitId).map((k) => (
                      <div key={k} className="flex items-center gap-2">
                        <span className="w-28 shrink-0 text-sm sm:w-40">{rotulos[p.unitId]?.[k] ?? k}</span>
                        <Input
                          inputMode="decimal"
                          value={valores[k] ?? ''}
                          onChange={(e) => setValores((s) => ({ ...s, [k]: e.target.value }))}
                          placeholder="0,00"
                          className="h-9 min-w-0 flex-1 text-right text-sm tabular-nums"
                        />
                      </div>
                    ))}
                    <p className="pt-1 text-right text-sm font-bold tabular-nums">Total enviado: {brl(totalDigitado)}</p>
                  </div>
                  {Math.abs(totalDigitado - (p.needTotal ?? 0)) > 0.011 && (
                    <p className="text-xs font-semibold text-warning">
                      Diferente do pedido ({brl(p.needTotal ?? 0)}). Pode enviar assim — fica registrado que saiu menos.
                    </p>
                  )}
                  <Input value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Observação (opcional) — ex.: enviado pelo malote das 14h" className="h-9 text-sm" />
                  <div className="flex justify-end gap-1.5">
                    <Button size="sm" variant="ghost" onClick={() => setAbrindo(null)}>Cancelar</Button>
                    <Button size="sm" disabled={busy || totalDigitado <= 0} onClick={() => void enviar(p)}>Confirmar envio</Button>
                  </div>
                </div>
              )}
            </div>
          ))}

          {aguardando.length > 0 && (
            <>
              <p className="sgo-type-11 font-semibold text-ink-500">Enviados, aguardando a unidade confirmar</p>
              {aguardando.map((p) => (
                <div key={p.id} className="rounded-card border border-line bg-surface p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink-900">{p.unitName} — {brl(p.sentTotal ?? 0)}</p>
                      <p className="text-xs text-ink-500">enviado por {p.sentByName} · {dt(p.sentAt)}{p.sentNote ? ` · ${p.sentNote}` : ''}</p>
                      <p className="mt-1 text-xs text-ink-500">{detalhe(p.sent, rotulos[p.unitId] ?? {})}</p>
                    </div>
                    <StatusBadge tone="neutral">a caminho</StatusBadge>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {aba === 'enviados' && (
        <div className="space-y-3">
          <form className="flex flex-wrap items-end gap-2 rounded-card border border-line bg-surface p-4" method="get">
            <div>
              <Label htmlFor="unidade" className="text-xs">Unidade</Label>
              <select
                id="unidade" name="unidade" defaultValue={filtro.unidade}
                className="mt-1 h-9 rounded-control border border-line bg-surface px-2 text-sm text-ink-900"
              >
                <option value="">Todas</option>
                {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            <div>
              <Label htmlFor="de" className="text-xs">De</Label>
              <Input id="de" name="de" type="date" defaultValue={filtro.de} className="mt-1 h-9 w-40 text-sm" />
            </div>
            <div>
              <Label htmlFor="ate" className="text-xs">Até</Label>
              <Input id="ate" name="ate" type="date" defaultValue={filtro.ate} className="mt-1 h-9 w-40 text-sm" />
            </div>
            <Button size="sm" variant="outline" type="submit"><Filter className="h-4 w-4" /> Filtrar</Button>
          </form>

          {enviados.length === 0 && (
            <p className="rounded-card border border-line bg-surface p-4 text-sm text-ink-500">Nenhum envio no período.</p>
          )}

          {enviados.map((p) => (
            <div key={p.id} className={`rounded-card border p-4 ${p.divergent ? 'border-danger/50 bg-danger/5' : 'border-line bg-surface'}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink-900">{p.unitName} — enviado {brl(p.sentTotal ?? 0)}</p>
                  <p className="text-xs text-ink-500">por {p.sentByName} · {dt(p.sentAt)}</p>
                  <p className="mt-1 text-xs text-ink-500">{detalhe(p.sent, rotulos[p.unitId] ?? {})}</p>
                </div>
                {p.status === 'RECEIVED'
                  ? <StatusBadge tone={p.divergent ? 'critical' : 'success'}>{p.divergent ? 'recebido diferente' : 'recebido'}</StatusBadge>
                  : <StatusBadge tone="neutral">a caminho</StatusBadge>}
              </div>

              {p.status === 'RECEIVED' && (
                <div className="mt-2 border-t border-line pt-2 text-sm">
                  <p>
                    Recebido <strong>{brl(p.receivedTotal ?? 0)}</strong> por {p.receivedByName} · {dt(p.receivedAt)}
                  </p>
                  {p.divergent && (
                    <p className="mt-1 font-semibold text-danger">
                      Diferença de {brl(Math.abs((p.sentTotal ?? 0) - (p.receivedTotal ?? 0)))} entre o que saiu e o que chegou.
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
