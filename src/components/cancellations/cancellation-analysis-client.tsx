'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Upload, Printer, ChevronDown, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatBRL } from '@/lib/utils';
import type { CancelAnalysisData, CancelGroup } from '@/lib/cancellations/fraud-analysis';

interface Analysis { id: string; filial: string | null; period: string | null; fileName: string | null; createdByName: string; createdAt: string; totalCount: number; totalValue: number; data: CancelAnalysisData }

export function CancellationAnalysisClient({ unitId, analyses }: { unitId: string; analyses: Analysis[] }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(analyses[0]?.id ?? null);

  async function upload(file: File) {
    setBusy(true); setMsg(null);
    try {
      const fd = new FormData(); fd.set('unitId', unitId); fd.set('file', file);
      const res = await fetch('/api/cancellations/analysis', { method: 'POST', body: fd });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg(d.error ?? 'Falha'); return; }
      setMsg(`Análise concluída: ${d.flags} sinal(is) de alerta.`); router.refresh();
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Button disabled={busy} onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4" /> {busy ? 'Analisando…' : 'Subir PDF do relatório'}</Button>
        <input ref={fileRef} type="file" accept=".pdf,application/pdf" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ''; }} />
        <span className="text-xs text-muted-foreground">Relatório &quot;Vendas/Itens Cancelados no Período&quot; (PDF)</span>
      </div>
      {msg && <p className="rounded-lg bg-accent/10 px-3 py-2 text-sm font-medium text-accent print:hidden">{msg}</p>}

      {analyses.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma análise ainda. Suba o PDF de cancelamentos do Teknisa.</p>}

      {analyses.map((a) => (
        <div key={a.id} className="rounded-lg border bg-card">
          <button onClick={() => setOpen(open === a.id ? null : a.id)} className="flex w-full items-center justify-between gap-2 p-3 text-left print:hidden">
            <span>
              <span className="block text-sm font-bold text-brand">{a.totalCount} cancelamentos · {formatBRL(a.totalValue)} · {a.data.flags.length} alerta(s)</span>
              <span className="block text-xs text-muted-foreground">{a.period ?? ''}{a.filial ? ` · ${a.filial}` : ''} · por {a.createdByName} em {new Date(a.createdAt).toLocaleString('pt-BR')}</span>
            </span>
            <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open === a.id ? 'rotate-180' : ''}`} />
          </button>

          {open === a.id && (
            <div className="space-y-4 border-t p-3">
              <div className="flex items-center justify-between print:mb-2">
                <p className="text-sm font-bold text-brand">Relatório de cancelamentos {a.period ? `· ${a.period}` : ''}</p>
                <Button size="sm" variant="outline" onClick={() => window.print()} className="print:hidden"><Printer className="h-4 w-4" /> Imprimir</Button>
              </div>

              {/* Alertas */}
              {a.data.flags.length > 0 && (
                <div className="space-y-1.5">
                  {a.data.flags.map((f, i) => (
                    <p key={i} className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm font-medium ${f.level === 'high' ? 'bg-critical/10 text-critical' : 'bg-medium/20 text-warning'}`}>
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {f.text}
                    </p>
                  ))}
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <GroupTable title="Por autorizador (SUPERVISOR)" rows={a.data.bySupervisor} highlight />
                <GroupTable title="Por caixa (terminal)" rows={a.data.byCaixa} />
              </div>
              {a.data.byOperador.length > 0 && <GroupTable title="Por operador (quando informado)" rows={a.data.byOperador} />}

              {/* Por hora */}
              <div>
                <p className="mb-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">Cancelamentos por horário</p>
                <div className="flex items-end gap-0.5" style={{ height: 60 }}>
                  {a.data.byHour.map((h) => { const max = Math.max(1, ...a.data.byHour.map((x) => x.count)); return (
                    <div key={h.hour} className="flex flex-1 flex-col items-center justify-end" title={`${h.hour}h · ${h.count}× · ${formatBRL(h.value)}`}>
                      <div className="w-full rounded-t bg-brand" style={{ height: `${(h.count / max) * 100}%` }} />
                      <span className="mt-0.5 text-[8px] text-muted-foreground">{h.hour}</span>
                    </div>
                  ); })}
                </div>
              </div>

              {/* Top valor */}
              <div>
                <p className="mb-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">Maiores cancelamentos</p>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-xs">
                    <thead><tr className="border-b text-left text-muted-foreground"><th className="p-1.5">Data</th><th className="p-1.5 text-right">Valor</th><th className="p-1.5">Caixa</th><th className="p-1.5">Autorizador</th><th className="p-1.5">Item</th></tr></thead>
                    <tbody>
                      {a.data.topValue.map((r, i) => (
                        <tr key={i} className={`border-b ${r.value >= 100 ? 'bg-critical/5' : ''}`}>
                          <td className="whitespace-nowrap p-1.5">{r.dt}</td>
                          <td className="p-1.5 text-right font-bold">{formatBRL(r.value)}</td>
                          <td className="p-1.5">{r.caixa}</td>
                          <td className="p-1.5">{(r.supervisor ?? '—').replace(/^\d+\s*-\s*/, '')}</td>
                          <td className="p-1.5 text-muted-foreground">{(r.produto ?? '').slice(0, 40)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function GroupTable({ title, rows, highlight }: { title: string; rows: CancelGroup[]; highlight?: boolean }) {
  return (
    <div>
      <p className="mb-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">{title}</p>
      <table className="w-full border-collapse text-xs">
        <thead><tr className="border-b text-left text-muted-foreground"><th className="p-1">Nome</th><th className="p-1 text-center">Qtd</th><th className="p-1 text-right">Valor</th><th className="p-1 text-right">%</th></tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={`border-b ${highlight && i === 0 && r.pct >= 50 ? 'bg-critical/10 font-semibold' : ''}`}>
              <td className="p-1">{r.name.replace(/^\d+\s*-\s*/, '')}</td>
              <td className="p-1 text-center">{r.count}</td>
              <td className="p-1 text-right font-semibold">{formatBRL(r.value)}</td>
              <td className="p-1 text-right">{r.pct}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
