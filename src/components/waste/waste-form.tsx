'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Camera, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface Category {
  id: string;
  name: string;
  /// 'kg' (padrão) ou 'un' — categorias em unidades (ex.: lanchonete) têm sub-itens (16/07)
  measure?: 'kg' | 'un';
}
interface SubItem { name: string; qty: string }

export function WasteForm({
  unitId,
  operationalDate,
  categories,
  initialKg,
  initialObservation,
  requiresEvidence,
  hasEvidence,
}: {
  unitId: string;
  operationalDate: string;
  categories: Category[];
  initialKg: Record<string, number>;
  initialObservation: string | null;
  requiresEvidence: boolean;
  hasEvidence: boolean;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [kg, setKg] = useState<Record<string, string>>(
    Object.fromEntries(categories.map((c) => [c.id, initialKg[c.id]?.toString() ?? ''])),
  );
  const [observation, setObservation] = useState(initialObservation ?? '');
  // Sub-itens por categoria em 'un' (produtos diferentes; o total soma sozinho)
  const [subs, setSubs] = useState<Record<string, SubItem[]>>(
    Object.fromEntries(categories.filter((c) => c.measure === 'un').map((c) => [c.id, [{ name: '', qty: '' }]])),
  );
  const subTotal = (cid: string) => (subs[cid] ?? []).reduce((t, si) => t + (parseInt(si.qty, 10) || 0), 0);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err' | 'alert'; text: string } | null>(null);

  async function save() {
    setMsg(null);
    // evidência obrigatória se a tarefa exige e ainda não há foto salva
    if (requiresEvidence && !file && !hasEvidence) {
      fileRef.current?.click();
      return;
    }
    setLoading(true);
    try {
      const items = categories.map((c) => {
        if (c.measure === 'un') {
          const list = (subs[c.id] ?? []).filter((si) => si.name.trim() && (parseInt(si.qty, 10) || 0) > 0);
          return { categoryId: c.id, kg: list.reduce((t, si) => t + (parseInt(si.qty, 10) || 0), 0), subItems: list.map((si) => ({ name: si.name.trim(), qty: parseInt(si.qty, 10) || 0 })) };
        }
        return { categoryId: c.id, kg: parseFloat((kg[c.id] || '0').replace(',', '.')) || 0 };
      });

      let res: Response;
      if (file) {
        const fd = new FormData();
        fd.append('unitId', unitId);
        fd.append('operationalDate', operationalDate);
        fd.append('observation', observation);
        fd.append('items', JSON.stringify(items));
        fd.append('evidence', file);
        res = await fetch('/api/waste', { method: 'POST', body: fd });
      } else {
        res = await fetch('/api/waste', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ unitId, operationalDate, observation, items }),
        });
      }

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg({ type: 'err', text: data.error ?? 'Não foi possível salvar' });
        return;
      }
      if (data.alerts?.length) {
        const a = data.alerts
          .map((x: { categoryName: string; increasePct: number }) => `${x.categoryName} +${x.increasePct}%`)
          .join(', ');
        setMsg({ type: 'alert', text: `Salvo. Alerta: ${a} acima da média de 7 dias.` });
      } else {
        setMsg({ type: 'ok', text: 'Lançamento salvo e tarefa concluída ✓' });
      }
      setFile(null);
      router.refresh();
    } catch {
      setMsg({ type: 'err', text: 'Falha de conexão' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      {categories.map((c) => c.measure === 'un' ? (
        <div key={c.id} className="space-y-1.5 rounded-lg border border-dashed p-2">
          <div className="flex items-center justify-between">
            <Label>{c.name} (UNIDADES)</Label>
            <span className="text-xs font-bold tabular-nums">Total: {subTotal(c.id)} un</span>
          </div>
          {(subs[c.id] ?? []).map((si, i) => (
            <div key={i} className="flex gap-1.5">
              <Input value={si.name} onChange={(e) => setSubs((s) => ({ ...s, [c.id]: s[c.id].map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) }))} placeholder="Produto (ex.: coxinha)" className="h-10 flex-1 text-sm" />
              <Input inputMode="numeric" value={si.qty} onChange={(e) => setSubs((s) => ({ ...s, [c.id]: s[c.id].map((x, j) => (j === i ? { ...x, qty: e.target.value.replace(/D/g, '') } : x)) }))} placeholder="qtd" className="h-10 w-20 text-sm" />
              <button type="button" onClick={() => setSubs((s) => ({ ...s, [c.id]: s[c.id].length > 1 ? s[c.id].filter((_, j) => j !== i) : s[c.id] }))} className="px-1 text-critical" aria-label="Remover">×</button>
            </div>
          ))}
          <button type="button" onClick={() => setSubs((s) => ({ ...s, [c.id]: [...(s[c.id] ?? []), { name: '', qty: '' }] }))} className="rounded-full border px-3 py-1 text-xs font-semibold">+ Adicionar produto</button>
        </div>
      ) : (
        <div key={c.id} className="space-y-1.5">
          <Label htmlFor={`kg-${c.id}`}>{c.name} (KG)</Label>
          <Input
            id={`kg-${c.id}`}
            type="text"
            inputMode="decimal"
            placeholder="0,000"
            value={kg[c.id] ?? ''}
            onChange={(e) => setKg((s) => ({ ...s, [c.id]: e.target.value }))}
          />
        </div>
      ))}

      <div className="space-y-1.5">
        <Label htmlFor="obs">Observação (opcional)</Label>
        <Input id="obs" value={observation} onChange={(e) => setObservation(e.target.value)} />
      </div>

      {requiresEvidence && (
        <p className="text-xs text-gold-dark">
          <Camera className="mr-1 inline h-3.5 w-3.5" />
          {hasEvidence && !file
            ? 'Foto da balança já anexada (envie outra para substituir).'
            : 'Esta tarefa exige a foto do visor da balança.'}
          {file && ` Selecionada: ${file.name}`}
        </p>
      )}

      {msg && (
        <p
          className={
            msg.type === 'ok'
              ? 'rounded-lg bg-success/10 px-3 py-2 text-sm font-medium text-success'
              : msg.type === 'alert'
                ? 'rounded-lg bg-medium/10 px-3 py-2 text-sm font-medium text-[#92600A]'
                : 'rounded-lg bg-critical/10 px-3 py-2 text-sm font-medium text-critical'
          }
        >
          {msg.text}
        </p>
      )}

      <Button onClick={save} disabled={loading} size="lg" className="w-full" variant={requiresEvidence ? 'gold' : 'default'}>
        {loading ? (
          'Salvando…'
        ) : requiresEvidence && !file && !hasEvidence ? (
          <>
            <Camera className="h-5 w-5" /> Tirar foto da balança
          </>
        ) : (
          <>
            <Save className="h-5 w-5" /> Salvar lançamento
          </>
        )}
      </Button>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0] ?? null;
          setFile(f);
          e.target.value = '';
        }}
      />
    </div>
  );
}
