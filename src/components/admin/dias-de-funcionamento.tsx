'use client';

import { useEffect, useState } from 'react';
import { CalendarCheck, Trash2 } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { postAdmin } from '@/lib/admin-client';
import { NOMES_DOS_DIAS, SIGLAS_DOS_DIAS, TODOS_OS_DIAS, diasFechados, rotuloDosDias } from '@/lib/units/dias-de-funcionamento';

/**
 * Dias de funcionamento da unidade (v1.157.0), dentro da edição em
 * Configurações → Unidades. Cada toque grava na hora (como o tipo de operação).
 * Dia desmarcado = o SGO não gera checklist nesse dia, logo nada vira
 * "não realizado". Os "não realizados" que JÁ foram gerados em dias fechados
 * aparecem contados, com um botão para removê-los (Admin, auditado).
 */
export function DiasDeFuncionamento({ unitId, dias, onChange }: { unitId: string; dias: number[]; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [pendentes, setPendentes] = useState<number | null>(null);
  const atuais = dias.length ? dias : [...TODOS_OS_DIAS];
  const temFechado = diasFechados(atuais).length > 0;

  async function contar() {
    if (!temFechado) { setPendentes(0); return; }
    try {
      const r = await fetch('/api/admin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entity: 'unit', action: 'contarDiasFechados', id: unitId }) });
      const d = await r.json().catch(() => ({}));
      setPendentes(r.ok ? Number(d.total ?? 0) : null);
    } catch { setPendentes(null); }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void contar(); }, [unitId, atuais.join(',')]);

  async function alternar(d: number) {
    const novos = atuais.includes(d) ? atuais.filter((x) => x !== d) : [...atuais, d].sort((a, b) => a - b);
    if (novos.length === 0) { setMsg('A unidade precisa funcionar em pelo menos um dia.'); return; }
    setBusy(true); setMsg(null);
    const r = await postAdmin({ entity: 'unit', action: 'update', id: unitId, operatingDays: novos });
    setBusy(false);
    if (!r.ok) { setMsg(r.error ?? 'Falha'); return; }
    onChange();
  }

  async function limpar() {
    if (!confirm(`Remover ${pendentes} checklist(s) "não realizado(s)" gerado(s) em dias em que a unidade não funciona? Concluídos e itens já respondidos não são tocados.`)) return;
    setBusy(true); setMsg(null);
    try {
      const r = await fetch('/api/admin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entity: 'unit', action: 'limparDiasFechados', id: unitId }) });
      const d = await r.json().catch(() => ({}));
      setMsg(r.ok ? `${d.removidos} checklist(s) removido(s). A meta passa a desconsiderá-los.` : (d.error ?? 'Falha'));
      await contar();
    } finally { setBusy(false); }
  }

  return (
    <div className="col-span-2 rounded-lg border border-line bg-surface p-2" data-testid="dias-de-funcionamento">
      <Label className="text-xs">Dias de funcionamento <span className="font-normal text-ink-500">· {rotuloDosDias(atuais)}</span></Label>
      <p className="mt-0.5 text-xs text-ink-500">
        Nos dias desmarcados o SGO não gera checklist para esta unidade — e por isso nada aparece como “não realizado”.
        Padrão: todos os dias.
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Dias de funcionamento">
        {TODOS_OS_DIAS.map((d) => {
          const on = atuais.includes(d);
          return (
            <button key={d} type="button" aria-pressed={on} aria-label={NOMES_DOS_DIAS[d]} title={NOMES_DOS_DIAS[d]} disabled={busy}
              onClick={() => void alternar(d)} data-testid={`dia-${d}`}
              className={`sgo-btn sgo-btn--sm ${on ? 'sgo-btn--primary' : ''}`}>
              {SIGLAS_DOS_DIAS[d]}
            </button>
          );
        })}
      </div>
      {temFechado && pendentes !== null && pendentes > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-warning-bg p-2 text-xs text-ink-700" data-testid="nao-realizados-fechados">
          <CalendarCheck className="h-4 w-4 shrink-0 text-warning" aria-hidden />
          <span className="min-w-0 flex-1">{pendentes} checklist(s) “não realizado(s)” já gerado(s) em dias em que a unidade não funciona.</span>
          <button type="button" className="sgo-btn sgo-btn--sm" disabled={busy} onClick={() => void limpar()} data-testid="limpar-fechados">
            <Trash2 className="h-3.5 w-3.5" /> Remover
          </button>
        </div>
      )}
      {msg && <p className="mt-1 text-xs font-medium text-ink-500">{msg}</p>}
    </div>
  );
}
