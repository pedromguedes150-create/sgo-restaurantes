'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { postAdmin } from '@/lib/admin-client';
import { MOTIVO_MIN } from '@/lib/metas/vigencia-regras';

/**
 * Admin ajusta o % descontado da meta por lançamento com data editada (item 4, 07/07).
 * v1.180.0: a gravação pede MOTIVO e vale a partir do mês corrente (histórico em
 * Metas → Configuração da Meta, onde também dá para agendar para um mês futuro).
 */
export function LateEntryConfig({ current }: { current: number }) {
  const router = useRouter();
  const [v, setV] = useState(String(current).replace('.', ','));
  const [motivo, setMotivo] = useState('');
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const mudou = v.replace(',', '.') !== String(current);
  async function save() {
    setBusy(true); setErro(null);
    const r = await postAdmin({ entity: 'lateEntry', action: 'setPenalty', pct: Number(v.replace(',', '.')), reason: motivo.trim() });
    setBusy(false);
    if (r.ok) { setMotivo(''); router.refresh(); } else setErro(r.error ?? 'Falha');
  }
  return (
    <div className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed p-2 print:hidden">
      <div>
        <label className="text-xs text-ink-500">Desconto por lançamento fora do prazo (% na meta)</label>
        <Input inputMode="decimal" value={v} onChange={(e) => setV(e.target.value)} className="h-9 w-24 text-sm" aria-label="Desconto por lançamento fora do prazo" />
      </div>
      {mudou && (
        <div className="min-w-64 flex-1">
          <label className="text-xs text-ink-500">Motivo da alteração (mínimo {MOTIVO_MIN} caracteres)</label>
          <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} className="h-9 text-sm" aria-label="Motivo da alteração" placeholder="Por que o desconto muda" />
        </div>
      )}
      <Button size="sm" variant="outline" disabled={busy || !mudou || motivo.trim().length < MOTIVO_MIN} onClick={save}>Salvar</Button>
      <p className="pb-1 text-xs text-ink-500">Aplicado quando Admin/Supervisor corrige a data de Pagamentos, Notas, Gás ou Óleo. Vale a partir deste mês; o histórico fica na Configuração da Meta.</p>
      {erro && <p className="w-full text-xs font-medium text-danger">{erro}</p>}
    </div>
  );
}
