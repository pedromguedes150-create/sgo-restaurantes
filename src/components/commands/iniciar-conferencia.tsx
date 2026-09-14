'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Plus, Play } from 'lucide-react';
import { Sheet } from '@/components/ui/ds/sheet';
import { Button } from '@/components/ui/button';

export interface UltimaConferencia {
  id: string;
  quando: string;
  tipo: string;
  metodo: string;
  responsavel: string | null;
  conferidas: number;
  expected: number;
  divergencias: number;
}

export interface EmAndamento {
  id: string;
  quando: string;
  vistas: number;
  total: number;
}

type Etapa = 'FECHADO' | 'TIPO' | 'METODO';

/**
 * "+ Iniciar nova conferência" — e o que aparece antes dela.
 *
 * Duas perguntas, uma de cada vez (tipo, depois método), porque é a decisão que
 * o caixa toma no início do turno e ela precisa caber numa tela de celular.
 *
 * Se existe conferência em andamento, o botão de começar **sai de cena**: o que
 * aparece é retomar. Começar outra por cima era exatamente o que produzia o
 * "as marcas são da contagem de 03/09".
 */
export function IniciarConferencia({
  unitId,
  ultima,
  emAndamento,
  faixaDoDia,
}: {
  unitId: string;
  ultima: UltimaConferencia | null;
  emAndamento: EmAndamento | null;
  /** Números da faixa combinada para a conferência diária. Vazio = sem faixa cadastrada. */
  faixaDoDia: number[];
}) {
  const router = useRouter();
  const [etapa, setEtapa] = useState<Etapa>('FECHADO');
  const [tipo, setTipo] = useState<'FAIXA_DO_DIA' | 'COMPLETA'>('COMPLETA');
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function comecar(metodo: 'MANUAL' | 'LEITOR' | 'MISTO') {
    setBusy(true); setErro(null);
    try {
      const res = await fetch('/api/commands/session', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'iniciar', unitId, type: tipo, method: metodo,
          ...(tipo === 'FAIXA_DO_DIA' ? { scopeNumbers: faixaDoDia } : {}),
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) { router.push(`/modulos/comandas/conferencias/${d.sessionId}`); return; }
      /* "Já existe uma em andamento" oferece retomá-la, em vez de só barrar. */
      if (d.reason === 'JA_EXISTE' && d.sessionId) { router.push(`/modulos/comandas/conferencias/${d.sessionId}`); return; }
      setErro(d.error ?? 'Não foi possível iniciar.');
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-3">
      {/* ── Retomar o que ficou pela metade ── */}
      {emAndamento && (
        <div className="rounded-lg border-2 border-warning bg-warning-bg p-3">
          <p className="text-sm font-semibold text-warning">
            Existe uma conferência iniciada em {emAndamento.quando} com {emAndamento.vistas} de {emAndamento.total} comandas verificadas.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Link href={`/modulos/comandas/conferencias/${emAndamento.id}`} className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-on-brand">
              <Play className="h-4 w-4" /> Continuar conferência
            </Link>
          </div>
        </div>
      )}

      {/* ── A última, concluída ── */}
      {ultima && (
        <div className="rounded-lg border bg-surface p-3">
          <p className="text-sm font-bold text-ink-900">Última conferência</p>
          <dl className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-ink-700 sm:grid-cols-3">
            <div><dt className="inline text-ink-500">Quando: </dt><dd className="inline">{ultima.quando}</dd></div>
            <div><dt className="inline text-ink-500">Tipo: </dt><dd className="inline">{ultima.tipo}</dd></div>
            <div><dt className="inline text-ink-500">Método: </dt><dd className="inline">{ultima.metodo}</dd></div>
            <div><dt className="inline text-ink-500">Responsável: </dt><dd className="inline">{ultima.responsavel ?? '—'}</dd></div>
            <div><dt className="inline text-ink-500">Resultado: </dt><dd className="inline tabular-nums">{ultima.conferidas}/{ultima.expected} verificadas</dd></div>
            <div>
              <dt className="inline text-ink-500">Divergências: </dt>
              <dd className={`inline tabular-nums ${ultima.divergencias > 0 ? 'font-semibold text-danger' : ''}`}>{ultima.divergencias}</dd>
            </div>
          </dl>
          <Link href={`/modulos/comandas/conferencias/${ultima.id}`} className="mt-2 inline-block text-xs font-semibold text-brand">
            Ver detalhes
          </Link>
        </div>
      )}

      {!emAndamento && (
        <Button size="sm" onClick={() => { setErro(null); setEtapa('TIPO'); }}>
          <Plus className="h-4 w-4" /> Iniciar nova conferência
        </Button>
      )}
      <Link href="/modulos/comandas/conferencias" className="ml-2 text-xs font-semibold text-brand">
        Histórico de conferências
      </Link>

      {erro && <p className="text-sm font-medium text-danger">{erro}</p>}

      {etapa === 'TIPO' && (
        <Sheet open onClose={() => setEtapa('FECHADO')} title="Qual conferência deseja realizar?">
          <div className="space-y-2">
            <button
              type="button"
              disabled={faixaDoDia.length === 0}
              onClick={() => { setTipo('FAIXA_DO_DIA'); setEtapa('METODO'); }}
              className="w-full rounded-lg border p-3 text-left disabled:opacity-50"
            >
              <p className="text-sm font-semibold text-ink-900">Faixa do dia</p>
              <p className="text-xs text-ink-700">
                {faixaDoDia.length > 0
                  ? `Conferir somente as ${faixaDoDia.length} comandas definidas para a conferência diária.`
                  : 'Nenhuma faixa marcada para a conferência diária em Configurações → Comandas.'}
              </p>
            </button>
            <button
              type="button"
              onClick={() => { setTipo('COMPLETA'); setEtapa('METODO'); }}
              className="w-full rounded-lg border p-3 text-left"
            >
              <p className="text-sm font-semibold text-ink-900">Completa</p>
              <p className="text-xs text-ink-700">Conferir todas as comandas ativas da unidade.</p>
            </button>
          </div>
        </Sheet>
      )}

      {etapa === 'METODO' && (
        <Sheet open onClose={() => setEtapa('FECHADO')} title="Como deseja realizar a conferência?" description={tipo === 'FAIXA_DO_DIA' ? 'Faixa do dia' : 'Completa'}>
          <div className="space-y-2">
            {([
              { v: 'MANUAL' as const, t: 'Manual', d: 'Você marca as comandas direto na grade.' },
              { v: 'LEITOR' as const, t: 'Leitor', d: 'As comandas entram pelo leitor de código de barras.' },
              { v: 'MISTO' as const, t: 'Manual + Leitor', d: 'Ler com o leitor e ajustar na mão, na mesma conferência.' },
            ]).map((o) => (
              <button
                key={o.v}
                type="button"
                disabled={busy}
                onClick={() => void comecar(o.v)}
                className="w-full rounded-lg border p-3 text-left disabled:opacity-60"
              >
                <p className="text-sm font-semibold text-ink-900">{o.t}</p>
                <p className="text-xs text-ink-700">{o.d}</p>
              </button>
            ))}
            {erro && <p className="text-sm font-medium text-danger">{erro}</p>}
          </div>
        </Sheet>
      )}
    </div>
  );
}
