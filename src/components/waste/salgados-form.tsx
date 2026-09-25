'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, X, Camera, RotateCcw, CheckCircle2 } from 'lucide-react';
import { Button, IconButton } from '@/components/ui/ds/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/ds/select';

/**
 * SOBRAS SALGADOS — a folha do gerente, em UNIDADES.
 * Uma linha por (tipo, motivo); "Adicionar salgado" abre outra; o total do dia
 * soma ao vivo. Gravar substitui o dia inteiro.
 *
 * Evidência: UMA FOTO GERAL do recipiente de resíduo orgânico é obrigatória
 * quando o total descartado > 0. Câmera obrigatória — galeria não permitida.
 */

interface Opcao { id: string; name: string }
interface Linha { typeId: string; reasonId: string; qty: string }

export function SalgadosForm({ unitId, operationalDate, tipos, motivos, initialRows, initialEvidencePath }: {
  unitId: string;
  operationalDate: string;
  tipos: Opcao[];
  motivos: Opcao[];
  initialRows: { typeId: string; reasonId: string; quantity: number }[];
  /** Path da foto geral já salva no banco (null = não tem). */
  initialEvidencePath: string | null;
}) {
  const router = useRouter();
  const [linhas, setLinhas] = useState<Linha[]>(
    initialRows.length ? initialRows.map((r) => ({ typeId: r.typeId, reasonId: r.reasonId, qty: String(r.quantity) })) : [{ typeId: '', reasonId: '', qty: '' }],
  );
  const [foto, setFoto] = useState<File | null>(null);
  const fotoRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);

  const total = linhas.reduce((s, l) => s + (parseInt(l.qty, 10) || 0), 0);
  const set = (i: number, patch: Partial<Linha>) => setLinhas((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const fotoExistente = initialEvidencePath !== null;
  const temFoto = foto !== null || fotoExistente;

  function abrirCamera() {
    if (fotoRef.current) fotoRef.current.value = '';
    fotoRef.current?.click();
  }

  async function salvar() {
    setMsg(null);

    // Valida foto quando há descarte.
    if (total > 0 && !temFoto) {
      setMsg({ tipo: 'erro', texto: 'É necessário tirar a foto do recipiente de resíduo orgânico para concluir o lançamento.' });
      return;
    }

    setBusy(true);
    try {
      const rows = linhas
        .filter((l) => l.typeId && l.reasonId && (parseInt(l.qty, 10) || 0) > 0)
        .map((l) => ({ typeId: l.typeId, reasonId: l.reasonId, quantity: parseInt(l.qty, 10) }));

      let res: Response;
      if (foto) {
        // Multipart quando há nova foto.
        const fd = new FormData();
        fd.append('action', 'salvar');
        fd.append('unitId', unitId);
        fd.append('operationalDate', operationalDate);
        fd.append('rows', JSON.stringify(rows));
        fd.append('evidence', foto);
        res = await fetch('/api/waste/salgados', { method: 'POST', body: fd });
      } else {
        res = await fetch('/api/waste/salgados', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'salvar', unitId, operationalDate, rows }),
        });
      }
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg({ tipo: 'erro', texto: d.error ?? 'Não foi possível salvar' }); return; }
      setMsg({ tipo: 'ok', texto: `Salvo: ${d.total} salgado(s) descartado(s) no dia.` });
      setFoto(null);
      router.refresh();
    } catch {
      setMsg({ tipo: 'erro', texto: 'Falha de conexão' });
    } finally { setBusy(false); }
  }

  if (tipos.length === 0 || motivos.length === 0) {
    return <p className="rounded-lg bg-warning/10 px-3 py-2 text-sm text-warning">Sem tipos ou motivos de salgado cadastrados. Peça ao Admin para cadastrar em Configurações → Desperdícios.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {linhas.map((l, i) => (
          <div key={i} className="grid grid-cols-[1fr_auto] gap-2 rounded-card border border-line p-2 sm:grid-cols-[1fr_1fr_5rem_auto] sm:items-end">
            <Select aria-label={`Tipo do salgado ${i + 1}`} label={i === 0 ? 'Tipo do salgado' : undefined} size="sm" value={l.typeId || null} placeholder="Escolha…" onValueChange={(v) => set(i, { typeId: v })} options={tipos.map((t) => ({ value: t.id, label: t.name }))} className="col-span-2 sm:col-span-1" />
            <Select aria-label={`Motivo ${i + 1}`} label={i === 0 ? 'Motivo' : undefined} size="sm" value={l.reasonId || null} placeholder="Escolha…" onValueChange={(v) => set(i, { reasonId: v })} options={motivos.map((m) => ({ value: m.id, label: m.name }))} />
            <div className="flex items-end gap-1.5">
              <div className="flex flex-col gap-1">
                {i === 0 && <span className="sgo-type-11 text-ink-500">Qtd</span>}
                <Input aria-label={`Quantidade ${i + 1}`} inputMode="numeric" placeholder="0" value={l.qty} onChange={(e) => set(i, { qty: e.target.value.replace(/\D/g, '') })} className="w-20 text-right tabular-nums" />
              </div>
              <IconButton variant="danger" aria-label={`Remover linha ${i + 1}`} onClick={() => setLinhas((ls) => (ls.length > 1 ? ls.filter((_, j) => j !== i) : [{ typeId: '', reasonId: '', qty: '' }]))}>
                <X className="h-4 w-4" />
              </IconButton>
            </div>
          </div>
        ))}
      </div>

      <Button size="sm" variant="ghost" onClick={() => setLinhas((ls) => [...ls, { typeId: '', reasonId: '', qty: '' }])}>
        <Plus className="h-4 w-4" /> Adicionar salgado
      </Button>

      <div className="flex items-baseline justify-between rounded-card border-2 border-brand/30 bg-brand/5 p-3">
        <span className="sgo-type-13 font-semibold text-brand">TOTAL DE SALGADOS DESCARTADOS NO DIA</span>
        <span className="sgo-type-24 font-bold tabular-nums text-brand">{total} un.</span>
      </div>

      {/* Foto geral do recipiente — obrigatória quando total > 0. */}
      {total > 0 && (
        <div className={`rounded-lg border px-3 py-2.5 ${temFoto ? 'border-success/40 bg-success/5' : 'border-warning/40 bg-warning/5'}`}>
          <p className="mb-2 text-xs font-semibold text-ink-700">Foto geral do descarte no recipiente de resíduo orgânico</p>
          {foto ? (
            <div className="flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={URL.createObjectURL(foto)} alt="Preview" className="h-14 w-14 rounded object-cover" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-success">Foto capturada</p>
                <p className="truncate text-[11px] text-ink-500">{foto.name}</p>
              </div>
              <IconButton size="sm" variant="ghost" aria-label="Refazer foto" onClick={abrirCamera}>
                <RotateCcw className="h-3.5 w-3.5" />
              </IconButton>
            </div>
          ) : fotoExistente ? (
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
                <p className="text-xs text-ink-700">Foto já registrada</p>
              </div>
              <Button size="sm" variant="ghost" onClick={abrirCamera}>
                <Camera className="h-3.5 w-3.5" /> Substituir
              </Button>
            </div>
          ) : (
            <Button size="sm" variant="ghost" onClick={abrirCamera} className="w-full justify-center">
              <Camera className="h-4 w-4" /> Tirar foto do recipiente
            </Button>
          )}
        </div>
      )}

      {msg && <p className={`rounded-lg px-3 py-2 text-sm font-medium ${msg.tipo === 'ok' ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`}>{msg.texto}</p>}

      <Button className="w-full sm:w-auto" disabled={busy} onClick={() => void salvar()}>
        {busy ? 'Salvando…' : 'Salvar sobras de salgados'}
      </Button>

      {/* Input oculto — somente câmera, sem galeria (capture="environment"). */}
      <input
        ref={fotoRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => { setFoto(e.target.files?.[0] ?? null); e.target.value = ''; }}
      />
    </div>
  );
}
