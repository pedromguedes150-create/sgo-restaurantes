'use client';

import { useState } from 'react';
import { Activity } from 'lucide-react';
import { Button } from '@/components/ui/ds/button';
import { Input } from '@/components/ui/ds/field';
import type { ResultadoDoPing } from '@/lib/rh/v2-ping';

/**
 * Botão "Testar conexão v2" da central de Integrações. Mostra status, tempo,
 * erro e a FORMA da resposta (nomes de campos) — nunca valores.
 */
export function RhV2Ping({ configurada }: { configurada: boolean }) {
  const [path, setPath] = useState('/colaboradores');
  const [r, setR] = useState<ResultadoDoPing | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function testar() {
    setOcupado(true); setErro(null); setR(null);
    try {
      const res = await fetch(`/api/rh/v2/ping?path=${encodeURIComponent(path)}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setErro(body.error ?? 'Falha ao testar'); return; }
      setR(body as ResultadoDoPing);
    } catch {
      setErro('Sem conexão.');
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="mt-2 space-y-2 rounded-lg border border-line bg-canvas p-2.5">
      <div className="flex flex-wrap items-end gap-2">
        <Input label="Caminho (relativo à base v2)" value={path} onChange={(e) => setPath(e.target.value)} className="font-mono text-xs" />
        <Button size="sm" variant="secondary" onClick={testar} loading={ocupado} disabled={!configurada}>
          <Activity className="h-4 w-4" /> Testar conexão v2
        </Button>
      </div>
      {!configurada && <p className="text-xs text-ink-500">Sem RH_API_V2_KEY neste servidor — o teste fica desabilitado.</p>}
      {erro && <p className="text-xs text-danger">{erro}</p>}
      {r && (
        <div className="text-xs">
          <p className={r.ok ? 'font-semibold text-success' : 'font-semibold text-danger'}>
            {r.ok ? `✓ Respondeu ${r.status} em ${r.emMs} ms` : `✗ ${r.status ?? 'sem resposta'} — ${r.erro}`}
          </p>
          <p className="text-ink-500">GET {r.base}{r.path}</p>
          {r.forma && (
            <p className="mt-1 text-ink-700">
              Forma: <b>{r.forma.tipo}</b>{r.forma.itens !== null && <> · {r.forma.itens} item(ns)</>}
              {r.forma.chaves.length > 0 && <> · campos: <code>{r.forma.chaves.join(', ')}</code></>}
            </p>
          )}
          {!r.ok && r.status === 401 && (
            <p className="mt-1 text-ink-500">401 com a chave enviada em <code>x-api-key</code>: a v2 lê esse header (ela devolve <code>Vary: x-api-key</code>), então ou a chave não está liberada para a v2 no painel do RH, ou há restrição de IP. Se este teste passar em produção e falhar em desenvolvimento, é IP.</p>
          )}
        </div>
      )}
    </div>
  );
}
