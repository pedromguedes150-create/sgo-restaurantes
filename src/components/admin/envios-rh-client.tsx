'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw, RotateCcw, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';
import { Group } from '@/components/ui/ds/group';
import type { EventoDaTela } from '@/lib/rh/saida/fila';
import type { RhOutboundStatus } from '@prisma/client';

const ST: Record<RhOutboundStatus, { label: string; tone: 'neutral' | 'medium' | 'success' | 'critical' | 'black' }> = {
  PENDENTE: { label: 'Pendente', tone: 'medium' },
  ENVIANDO: { label: 'Enviando', tone: 'medium' },
  ENVIADO: { label: 'Enviado', tone: 'success' },
  ERRO: { label: 'Erro de dados', tone: 'critical' },
  ESGOTADO: { label: 'Esgotado (10 tentativas)', tone: 'critical' },
  PARADO: { label: 'Parado (token)', tone: 'black' },
};
const TIPO: Record<EventoDaTela['tipo'], string> = { ATESTADO: 'Atestado', DESLIGAMENTO: 'Desligamento', DEMANDA: 'Demanda' };
const REENVIAVEL = new Set<RhOutboundStatus>(['ERRO', 'ESGOTADO', 'PARADO', 'PENDENTE']);

function quando(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
}

/**
 * Fila de envios SGO→RH (v1.168.0): o Admin vê cada evento, o que o RH
 * respondeu (CPF mascarado, sem anexo), reenvia o que falhou e pode processar
 * a fila na hora. Erros de dados (400/422/409) ficam separados dos temporários
 * e dos esgotados — cada um pede uma ação diferente.
 */
export function EnviosRhClient({ eventos, configurado }: { eventos: EventoDaTela[]; configurado: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState('');
  const [aberto, setAberto] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function post(body: Record<string, unknown>, id = 'fila'): Promise<Record<string, unknown> | null> {
    setBusy(id); setMsg(null);
    try {
      const res = await fetch('/api/rh/saida', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg(d.error ?? 'Falha'); return null; }
      router.refresh();
      return d;
    } finally { setBusy(''); }
  }
  async function despachar() {
    const d = await post({ acao: 'despachar' });
    if (!d) return;
    if (d.semToken) { setMsg('Sem RH_WEBHOOK_TOKEN no servidor: nada foi enviado; os eventos continuam pendentes.'); return; }
    setMsg(`Processados ${d.processados}: ${d.enviados} enviado(s), ${d.erros} erro(s) de dados, ${d.adiados} adiado(s), ${d.esgotados} esgotado(s)${d.parado ? ' — PARADO por token recusado (401)' : ''}.`);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="gold" disabled={busy !== '' || !configurado} onClick={despachar} data-testid="processar-fila"><RefreshCw className="h-4 w-4" /> Processar fila agora</Button>
        {!configurado && <span className="text-xs text-ink-500">Configure <code>RH_WEBHOOK_TOKEN</code> no servidor para o despacho rodar.</span>}
      </div>
      {msg && <p className="rounded-lg bg-canvas px-3 py-2 text-sm text-ink-700">{msg}</p>}
      {eventos.length === 0 && <p className="text-sm text-ink-500">Nenhum evento neste filtro.</p>}
      <Group>
        {eventos.map((e) => {
          const st = ST[e.status];
          const abertoAqui = aberto === e.id;
          return (
            <div key={e.id} className="p-3" data-testid={`evento-${e.id}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink-900">{TIPO[e.tipo]} · {e.acao}{e.unitName ? ` · ${e.unitName}` : ''}</p>
                  <p className="truncate text-xs text-ink-500">{e.resumo || '—'}</p>
                  <p className="text-xs text-ink-500">criado {quando(e.criadoEm)}{e.enviadoEm ? ` · enviado ${quando(e.enviadoEm)}` : ''} · tentativas {e.tentativas}{e.status === 'PENDENTE' ? ` · próxima ${quando(e.proximaTentativaEm)}` : ''}{e.rhId ? ` · id no RH ${e.rhId}` : ''}</p>
                </div>
                <StatusBadge tone={st.tone}>{st.label}</StatusBadge>
              </div>
              {e.ultimoErro && <p className="mt-1 text-xs font-medium text-danger">{e.ultimoErro}</p>}
              {e.observacao && <p className="mt-1 text-xs text-warning">{e.observacao}</p>}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {REENVIAVEL.has(e.status) && (
                  <Button size="sm" variant="outline" disabled={busy !== ''} onClick={() => post({ acao: 'reenviar', id: e.id }, e.id)} data-testid={`reenviar-${e.id}`}><RotateCcw className="h-4 w-4" /> Reenviar</Button>
                )}
                <button type="button" className="inline-flex items-center gap-1 text-xs font-semibold text-brand" onClick={() => setAberto(abertoAqui ? null : e.id)}>
                  {abertoAqui ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />} {abertoAqui ? 'Ocultar detalhe' : 'Ver detalhe'}
                </button>
              </div>
              {abertoAqui && (
                <div className="mt-2 space-y-1 rounded-lg bg-canvas p-2 text-xs">
                  <p><span className="text-ink-500">sgoEventId</span> <span className="font-mono">{e.sgoEventId}</span></p>
                  <p><span className="text-ink-500">registro no SGO</span> <span className="font-mono">{e.referenceId}</span>{e.temAnexo ? ' · com anexo (não exibido)' : ''}</p>
                  {e.httpStatus != null && <p><span className="text-ink-500">HTTP</span> {e.httpStatus}</p>}
                  {e.resposta != null && <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-[11px] text-ink-900">{typeof e.resposta === 'string' ? e.resposta : JSON.stringify(e.resposta, null, 2)}</pre>}
                </div>
              )}
            </div>
          );
        })}
      </Group>
    </div>
  );
}
