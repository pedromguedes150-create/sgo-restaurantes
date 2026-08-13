'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Camera, Save, Plus, X } from 'lucide-react';
import { Button, IconButton } from '@/components/ui/ds/button';
import { Input } from '@/components/ui/ds/field';
import { Banner } from '@/components/ui/ds/banner';

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

  // Agrupa por UNIDADE DE MEDIDA: pesagem (kg) e contagem (un) são gestos
  // diferentes — misturá-las obrigava o gerente a trocar de raciocínio a cada campo.
  const kgCats = categories.filter((c) => c.measure !== 'un');
  const unCats = categories.filter((c) => c.measure === 'un');

  return (
    <div className="space-y-6">
      {kgCats.length > 0 && (
        <section>
          <h3 className="sgo-type-11 mb-2 text-ink-400">Pesagem (kg)</h3>
          {/* 2 colunas a partir de sm: o formulário deixa de ser uma coluna longa. */}
          <div className="grid gap-3 sm:grid-cols-2">
            {kgCats.map((c) => (
              <Input
                key={c.id}
                label={c.name}
                inputMode="decimal"
                placeholder="0,000"
                className="text-right tabular-nums"
                value={kg[c.id] ?? ''}
                onChange={(e) => setKg((s) => ({ ...s, [c.id]: e.target.value }))}
              />
            ))}
          </div>
        </section>
      )}

      {unCats.length > 0 && (
        <section>
          <h3 className="sgo-type-11 mb-2 text-ink-400">Contagem (unidades)</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {unCats.map((c) => (
              <div key={c.id} className="rounded-card border border-line p-3">
                <div className="mb-2 flex items-baseline justify-between gap-2">
                  <span className="text-[13px] font-medium text-ink-700">{c.name}</span>
                  <span className="text-[13px] font-semibold tabular-nums text-ink-900">Total: {subTotal(c.id)} un</span>
                </div>
                <div className="space-y-2">
                  {(subs[c.id] ?? []).map((si, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <Input
                        aria-label={`Produto ${i + 1} de ${c.name}`}
                        value={si.name}
                        onChange={(e) => setSubs((s) => ({ ...s, [c.id]: s[c.id].map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) }))}
                        placeholder="Produto (ex.: coxinha)"
                        className="flex-1"
                      />
                      <Input
                        aria-label={`Quantidade do produto ${i + 1} de ${c.name}`}
                        inputMode="numeric"
                        value={si.qty}
                        // Só dígitos (antes o regex era /D/ — a LETRA D — e não filtrava nada).
                        onChange={(e) => setSubs((s) => ({ ...s, [c.id]: s[c.id].map((x, j) => (j === i ? { ...x, qty: e.target.value.replace(/\D/g, '') } : x)) }))}
                        placeholder="qtd"
                        className="w-20 text-right tabular-nums"
                      />
                      <IconButton
                        variant="danger"
                        aria-label={`Remover produto ${i + 1}`}
                        onClick={() => setSubs((s) => ({ ...s, [c.id]: s[c.id].length > 1 ? s[c.id].filter((_, j) => j !== i) : s[c.id] }))}
                      >
                        <X className="h-4 w-4" />
                      </IconButton>
                    </div>
                  ))}
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="mt-2"
                  onClick={() => setSubs((s) => ({ ...s, [c.id]: [...(s[c.id] ?? []), { name: '', qty: '' }] }))}
                >
                  <Plus className="h-4 w-4" /> Adicionar produto
                </Button>
              </div>
            ))}
          </div>
        </section>
      )}

      <Input label="Observação (opcional)" value={observation} onChange={(e) => setObservation(e.target.value)} />

      {requiresEvidence && (
        <Banner
          tone="info"
          title={hasEvidence && !file ? 'Foto da balança já anexada' : 'Esta tarefa exige a foto do visor da balança'}
          description={file ? `Selecionada: ${file.name}` : hasEvidence && !file ? 'Envie outra para substituir.' : undefined}
        />
      )}

      {msg && (
        <Banner
          tone={msg.type === 'ok' ? 'success' : msg.type === 'alert' ? 'warning' : 'danger'}
          title={msg.text}
        />
      )}

      {/* Único primário da tela. */}
      <Button onClick={save} loading={loading} size="lg" className="w-full">
        {loading ? 'Salvando…' : requiresEvidence && !file && !hasEvidence ? (
          <><Camera className="h-5 w-5" /> Tirar foto da balança</>
        ) : (
          <><Save className="h-5 w-5" /> Salvar lançamento</>
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
