'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Upload, Printer, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatBRL } from '@/lib/utils';
import { DatePicker } from '@/components/ui/ds/date-picker';



interface Suspect { number: string; openedAt: string | null; openedDate: string | null; value: number; daysOpen: number; items: { name: string; qty: number; value: number }[] }
interface Analysis { id: string; cutDate: string; fileName: string | null; createdByName: string; createdAt: string; totalCommands: number; suspectCount: number; suspectValue: number; suspects: Suspect[] }

function fmtDT(iso: string | null): string {
  if (!iso) return '—';
  if (iso.length <= 10) { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; }
  const [date, time] = iso.split('T'); const [y, m, d] = date.split('-');
  return `${d}/${m}/${y} ${(time ?? '').slice(0, 5)}`;
}

export function OpenCommandAnalysisClient({ unitId, unitName, today, analyses }: { unitId: string; unitName: string; today: string; analyses: Analysis[] }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [cutDate, setCutDate] = useState(today);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(analyses[0]?.id ?? null);

  async function upload(file: File) {
    setBusy(true); setMsg(null);
    try {
      const fd = new FormData();
      fd.set('unitId', unitId); fd.set('cutDate', cutDate); fd.set('file', file);
      const res = await fetch('/api/commands/open-analysis', { method: 'POST', body: fd });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg(d.error ?? 'Falha'); return; }
      setMsg(`Análise concluída: ${d.suspectCount} comanda(s) suspeita(s).`);
      router.refresh();
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-4">
      {/* Upload */}
      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed p-3 print:hidden">
        <div>
          <DatePicker
            label="Data de corte" max={today} value={cutDate || null} onValueChange={(v) => setCutDate(v ?? '')}
            hint="comandas abertas antes desta data = suspeitas"
          />
        </div>
        <Button disabled={busy} onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4" /> {busy ? 'Analisando…' : 'Subir relatório (.xlsx/.csv)'}</Button>
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ''; }} />
        <a href="/modulos/comandas/analise-aberto/consolidado" className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm font-semibold hover:border-brand">📄 Consolidado da rede (Administrativo)</a>
      </div>
      {msg && <p className="rounded-lg bg-brand/10 px-3 py-2 text-sm font-medium text-ink-900 print:hidden">{msg}</p>}

      {analyses.length === 0 && <p className="text-sm text-ink-500">Nenhuma análise ainda. Suba o relatório de comandas em aberto do Teknisa.</p>}

      {analyses.map((a) => (
        <div key={a.id} className="rounded-lg border bg-surface">
          <button onClick={() => setOpen(open === a.id ? null : a.id)} className="flex w-full items-center justify-between gap-2 p-3 text-left print:hidden">
            <span>
              <span className="block text-sm font-bold text-ink-900">{a.suspectCount} suspeita(s) · {formatBRL(a.suspectValue)}</span>
              <span className="block text-xs text-ink-500">corte {fmtDT(a.cutDate)} · {a.totalCommands} comandas no relatório · por {a.createdByName} em {new Date(a.createdAt).toLocaleString('pt-BR')}</span>
            </span>
            <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open === a.id ? 'rotate-180' : ''}`} />
          </button>

          {open === a.id && (
            <div className="border-t p-3">
              <div className="mb-2 flex items-center justify-between print:mb-4">
                <div>
                  <p className="text-sm font-bold text-ink-900">Comandas suspeitas — {unitName}</p>
                  <p className="text-xs text-ink-500">Abertas com valor e data anterior a {fmtDT(a.cutDate)}. Para o monitoramento buscar câmeras por data/hora.</p>
                </div>
                <a href={`/modulos/comandas/analise-aberto/${a.id}/relatorio`} className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm font-semibold hover:border-brand print:hidden"><Printer className="h-4 w-4" /> Relatório p/ monitoramento</a>
              </div>
              {a.suspects.length === 0 ? <p className="text-sm text-success">Nenhuma comanda suspeita 🎉</p> : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-xs">
                    <thead><tr className="border-b text-left text-ink-500">
                      <th className="p-1.5">Comanda</th><th className="p-1.5">Aberta em</th><th className="p-1.5 text-center">Dias</th><th className="p-1.5 text-right">Valor</th><th className="p-1.5">Itens</th>
                    </tr></thead>
                    <tbody>
                      {a.suspects.map((s, i) => (
                        <tr key={i} className={`border-b align-top ${s.daysOpen >= 2 ? 'bg-danger/5' : ''}`}>
                          <td className="p-1.5 font-mono font-semibold">{s.number}</td>
                          <td className="p-1.5 whitespace-nowrap">{fmtDT(s.openedAt)}</td>
                          <td className={`p-1.5 text-center font-bold ${s.daysOpen >= 2 ? 'text-danger' : 'text-warning'}`}>{s.daysOpen}</td>
                          <td className="p-1.5 text-right font-semibold">{formatBRL(s.value)}</td>
                          <td className="p-1.5 text-ink-500">{s.items.map((it) => `${it.qty}× ${it.name}`).join('; ')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
