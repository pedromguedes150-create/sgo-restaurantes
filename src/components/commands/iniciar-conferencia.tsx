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

type Etapa = 'FECHADO' | 'TIPO';

/**
 * "+ Iniciar nova conferência" — e o que aparece antes dela.
 *
 * UMA pergunta: o tipo. O método deixou de ser escolha na v1.192.0 (decisão do
 * Pedro): toda conferência é Leitor + Manual — bipa o que dá e marca na grade o
 * resto, na mesma conferência. Três opções obrigavam a decidir antes de saber
 * se o leitor ia pegar tudo.
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
  programacao,
}: {
  unitId: string;
  ultima: UltimaConferencia | null;
  emAndamento: EmAndamento | null;
  /** Números da faixa combinada para a conferência diária. Vazio = sem faixa cadastrada. */
  faixaDoDia: number[];
  /** v1.201.0: o que a programação da unidade manda para hoje (a tela só mostra e destaca; o servidor não depende disto). */
  programacao?: { texto: string; tipo: 'FAIXA_DO_DIA' | 'COMPLETA' | null; semConferencia: boolean; origem: 'EXCECAO' | 'PROGRAMACAO' | 'PADRAO'; concorrentes: string[] };
}) {
  const router = useRouter();
  const [etapa, setEtapa] = useState<Etapa>('FECHADO');
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function comecar(tipo: 'FAIXA_DO_DIA' | 'COMPLETA') {
    setBusy(true); setErro(null);
    try {
      const res = await fetch('/api/commands/session', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'iniciar', unitId, type: tipo, method: 'MISTO',
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

      {programacao && programacao.origem !== 'PADRAO' && (
        <div className={`rounded-lg border p-3 ${programacao.semConferencia ? 'bg-sunken' : 'border-brand/40 bg-brand-tint'}`} data-testid="programacao-do-dia">
          <p className="text-xs font-semibold text-ink-500">Programação de hoje</p>
          <p className="text-sm font-semibold text-ink-900">{programacao.texto}</p>
          {programacao.concorrentes.length > 0 && <p className="text-xs text-ink-500">Também valiam: {programacao.concorrentes.join(', ')} — esta venceu pela prioridade.</p>}
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
        <Sheet open onClose={() => setEtapa('FECHADO')} title="Qual conferência deseja realizar?" description="Leitor + Manual: bipe o que der e marque na grade o que o leitor não pegou, na mesma conferência.">
          <div className="space-y-2">
            <button
              type="button"
              disabled={faixaDoDia.length === 0 || busy}
              onClick={() => void comecar('FAIXA_DO_DIA')}
              className="w-full rounded-lg border p-3 text-left disabled:opacity-50"
              data-testid="tipo-faixa"
            >
              <p className="text-sm font-semibold text-ink-900">Faixa do dia{programacao?.tipo === 'FAIXA_DO_DIA' ? ' · programada para hoje' : ''}</p>
              <p className="text-xs text-ink-700">
                {faixaDoDia.length > 0
                  ? `Conferir somente as ${faixaDoDia.length} comandas definidas para a conferência diária.`
                  : 'Nenhuma faixa marcada para a conferência diária em Configurações → Comandas.'}
              </p>
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void comecar('COMPLETA')}
              className="w-full rounded-lg border p-3 text-left disabled:opacity-60"
              data-testid="tipo-completa"
            >
              <p className="text-sm font-semibold text-ink-900">Completa{programacao?.tipo === 'COMPLETA' ? ' · programada para hoje' : ''}</p>
              <p className="text-xs text-ink-700">Conferir todas as comandas ativas da unidade.</p>
            </button>
            {busy && <p className="text-xs text-ink-500">Iniciando…</p>}
            {erro && <p className="text-sm font-medium text-danger">{erro}</p>}
          </div>
        </Sheet>
      )}
    </div>
  );
}
