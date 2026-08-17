'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import * as XLSX from 'xlsx';
import { X, Upload, FileSpreadsheet, Download, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatusBadge, type StatusTone } from '@/components/ui/status-badge';

interface RowResult {
  line: number; status: 'OK' | 'DUPLICADA' | 'ERRO'; motivo?: string; aviso?: string;
  preview: { empresa: string; cnpj: string; fornecedor: string; numero: string; emissao: string; quantidade: string; preco: string; forma: string };
}
interface Summary { total: number; ok: number; duplicadas: number; erros: number }

const TONE: Record<RowResult['status'], StatusTone> = { OK: 'success', DUPLICADA: 'neutral', ERRO: 'critical' };
const STLABEL: Record<RowResult['status'], string> = { OK: 'OK', DUPLICADA: 'Duplicada', ERRO: 'Erro' };
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Lê o .xlsx: aba "Modelo" (senão a 1ª que não seja "Instruções"); linha 1 = cabeçalho. */
function parseWorkbook(file: File): Promise<Record<string, unknown>[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Falha ao ler o arquivo.'));
    reader.onload = () => {
      try {
        const wb = XLSX.read(new Uint8Array(reader.result as ArrayBuffer), { type: 'array' });
        let name = wb.SheetNames.find((n) => norm(n) === 'modelo');
        if (!name) name = wb.SheetNames.find((n) => norm(n) !== 'instrucoes') ?? wb.SheetNames[0];
        const ws = wb.Sheets[name];
        resolve(XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { raw: true, defval: null }));
      } catch { reject(new Error('Não foi possível ler a planilha (.xlsx).')); }
    };
    reader.readAsArrayBuffer(file);
  });
}

export function GasImportModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [phase, setPhase] = useState<'idle' | 'parsing' | 'preview' | 'committing' | 'done'>('idle');
  const [fileName, setFileName] = useState('');
  const [parsedRows, setParsedRows] = useState<Record<string, unknown>[]>([]);
  const [rows, setRows] = useState<RowResult[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [committed, setCommitted] = useState<{ imported: number; duplicadas: number; erros: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function onFile(file: File) {
    setErr(null); setCommitted(null); setPhase('parsing'); setFileName(file.name);
    let parsed: Record<string, unknown>[];
    try { parsed = await parseWorkbook(file); } catch (e) { setErr((e as Error).message); setPhase('idle'); return; }
    if (parsed.length === 0) { setErr('A planilha não tem linhas de dados.'); setPhase('idle'); return; }
    setParsedRows(parsed);
    const res = await fetch('/api/notes/gas-import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'dry', rows: parsed }) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) { setErr(d.error ?? 'Falha na validação.'); setPhase('idle'); return; }
    setRows(d.rows); setSummary(d.summary); setPhase('preview');
  }

  async function confirm() {
    setPhase('committing'); setErr(null);
    const res = await fetch('/api/notes/gas-import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'commit', rows: parsedRows }) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) { setErr(d.error ?? 'Falha ao gravar.'); setPhase('preview'); return; }
    setRows(d.rows); setCommitted({ imported: d.imported, duplicadas: d.duplicadas, erros: d.erros }); setPhase('done');
    router.refresh();
  }

  function downloadErrors() {
    const bad = rows.filter((r) => r.status !== 'OK');
    if (bad.length === 0) return;
    const data = bad.map((r) => ({ ...parsedRows[r.line - 2], Motivo: r.motivo ?? r.aviso ?? '' }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Erros');
    XLSX.writeFile(wb, 'relatorio_erros_import_gas.xlsx');
  }

  const reset = () => { setPhase('idle'); setRows([]); setSummary(null); setParsedRows([]); setCommitted(null); setErr(null); setFileName(''); };
  const errosOuDup = rows.filter((r) => r.status !== 'OK').length;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-3 print:hidden" onClick={onClose}>
      <div className="my-4 w-full max-w-3xl rounded-2xl border bg-surface p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-bold text-ink-900"><FileSpreadsheet className="h-5 w-5 text-ink-900" /> Importar notas de gás em lote (XLSX)</h2>
          <button onClick={onClose} aria-label="Fechar" className="rounded-md p-1 text-ink-500 hover:bg-sunken"><X className="h-5 w-5" /></button>
        </div>

        {(phase === 'idle' || phase === 'parsing') && (
          <div className="space-y-3">
            <p className="text-sm text-ink-500">Envie o arquivo <strong>.xlsx</strong> no layout do modelo. Nada é gravado antes da sua confirmação na prévia.</p>
            <a href="/Modelo_Importacao_Notas_Gas_SGO.xlsx" download className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand hover:underline"><Download className="h-4 w-4" /> Baixar modelo</a>
            <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed p-6 text-center hover:border-brand">
              {phase === 'parsing' ? <Loader2 className="h-6 w-6 animate-spin text-brand" /> : <Upload className="h-6 w-6 text-brand" />}
              <span className="text-sm font-semibold text-ink-900">{phase === 'parsing' ? `Lendo ${fileName}…` : 'Clique para escolher o arquivo .xlsx'}</span>
              <input type="file" accept=".xlsx" className="hidden" disabled={phase === 'parsing'} onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); e.currentTarget.value = ''; }} />
            </label>
            {err && <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm font-medium text-danger">{err}</p>}
          </div>
        )}

        {(phase === 'preview' || phase === 'committing' || phase === 'done') && summary && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-ink-500">{fileName} · {summary.total} linha(s):</span>
              <StatusBadge tone="success">{committed ? committed.imported : summary.ok} {committed ? 'importadas' : 'OK'}</StatusBadge>
              <StatusBadge tone="neutral">{committed ? committed.duplicadas : summary.duplicadas} duplicada(s)</StatusBadge>
              <StatusBadge tone="critical">{committed ? committed.erros : summary.erros} erro(s)</StatusBadge>
            </div>

            {phase === 'done' && committed && (
              <p className="rounded-lg bg-success/10 px-3 py-2 text-sm font-semibold text-success">
                <CheckCircle2 className="mr-1 inline h-4 w-4" /> {committed.imported} nota(s) importada(s). {committed.duplicadas} ignorada(s) (duplicadas), {committed.erros} com erro.
              </p>
            )}

            <div className="max-h-[46vh] overflow-auto rounded-lg border">
              <table className="w-full text-left text-xs tabular-nums">
                <thead className="sticky top-0 bg-sunken text-ink-500">
                  <tr>
                    <th className="px-2 py-1.5">Linha</th><th className="px-2 py-1.5">Status</th><th className="px-2 py-1.5">Empresa</th>
                    <th className="px-2 py-1.5">Nº</th><th className="px-2 py-1.5">Emissão</th><th className="px-2 py-1.5 text-right">Qtd</th>
                    <th className="px-2 py-1.5 text-right">Preço</th><th className="px-2 py-1.5">Motivo / Aviso</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.line} className="border-t">
                      <td className="px-2 py-1 text-ink-500">{r.line}</td>
                      <td className="px-2 py-1"><StatusBadge tone={TONE[r.status]}>{STLABEL[r.status]}</StatusBadge></td>
                      <td className="px-2 py-1 max-w-[10rem] truncate">{r.preview.empresa}</td>
                      <td className="px-2 py-1">{r.preview.numero}</td>
                      <td className="px-2 py-1">{r.preview.emissao ? String(r.preview.emissao).split('-').reverse().join('/') : ''}</td>
                      <td className="px-2 py-1 text-right">{r.preview.quantidade}</td>
                      <td className="px-2 py-1 text-right">{r.preview.preco}</td>
                      <td className="px-2 py-1 text-ink-500">{r.motivo ?? (r.aviso ? `⚠ ${r.aviso}` : '')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {err && <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm font-medium text-danger">{err}</p>}

            <div className="flex flex-wrap justify-end gap-2">
              {errosOuDup > 0 && <Button size="sm" variant="outline" onClick={downloadErrors}><Download className="h-4 w-4" /> Relatório de erros (XLSX)</Button>}
              {phase !== 'done' && <Button size="sm" variant="ghost" onClick={reset}>Escolher outro arquivo</Button>}
              {phase === 'done' ? (
                <Button size="sm" onClick={onClose}>Fechar</Button>
              ) : (
                <Button size="sm" variant="gold" disabled={phase === 'committing' || summary.ok === 0} onClick={confirm}>
                  {phase === 'committing' ? <><Loader2 className="mr-1 h-4 w-4 animate-spin" /> Gravando…</> : `Confirmar importação (${summary.ok})`}
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
