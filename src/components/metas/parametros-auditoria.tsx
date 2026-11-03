'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/ds/select';
import { SgoModal, SgoField } from '@/components/sgo/sgo-modal';
import { postAdmin } from '@/lib/admin-client';
import { MOTIVO_MIN, mesesDeVigencia } from '@/lib/metas/vigencia-regras';

/**
 * Parâmetros da auditoria de atestados (v1.181.0): prazo em horas úteis e as
 * três faixas de penalização sobre o peso. Mesma gravação dos pesos
 * (`metaParametro/set` → `gravarConfigDaMeta`): vigência por mês e motivo.
 */
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const rotuloDoMes = (ym: string) => { const [y, m] = ym.split('-').map(Number); return `${MESES[m - 1]}/${y}`; };

export interface ParametroDaAuditoria { key: string; rotulo: string; valor: number; teto?: number }

export function ParametrosDaAuditoria({ parametros, canEdit, mesAtual }: { parametros: ParametroDaAuditoria[]; canEdit: boolean; mesAtual: string }) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(parametros.map((p) => [p.key, String(p.valor).replace('.', ',')])));
  const [pendente, setPendente] = useState<ParametroDaAuditoria | null>(null);
  const [validFrom, setValidFrom] = useState(mesAtual);
  const [motivo, setMotivo] = useState('');
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const opcoesDeMes = mesesDeVigencia(mesAtual).map((m) => ({ value: m, label: m === mesAtual ? `${rotuloDoMes(m)} (mês corrente)` : rotuloDoMes(m) }));

  async function confirmar() {
    if (!pendente) return;
    setBusy(true); setErro(null);
    const r = await postAdmin({ entity: 'metaParametro', action: 'set', key: pendente.key, value: Number((values[pendente.key] ?? '0').replace(',', '.')), reason: motivo.trim(), validFrom });
    setBusy(false);
    if (r.ok) { setPendente(null); router.refresh(); } else setErro(r.error ?? 'Falha ao gravar.');
  }

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2" data-testid="parametros-auditoria">
      {parametros.map((p) => (
        <div key={p.key} className="flex items-end justify-between gap-2 rounded-lg border border-line p-3">
          <label className="text-sm text-ink-900">{p.rotulo}</label>
          <span className="inline-flex items-center gap-1.5">
            <Input inputMode="decimal" aria-label={p.rotulo} value={values[p.key] ?? ''} onChange={(e) => setValues((s) => ({ ...s, [p.key]: e.target.value }))} disabled={!canEdit} className="h-9 w-20 text-right text-sm tabular-nums" />
            {canEdit && (
              <Button size="sm" variant="outline" disabled={busy} onClick={() => { setPendente(p); setValidFrom(mesAtual); setMotivo(''); setErro(null); }} aria-label={`Salvar ${p.rotulo}`}>
                <Save className="h-4 w-4" />
              </Button>
            )}
          </span>
        </div>
      ))}
      <SgoModal
        open={!!pendente}
        onClose={() => (busy ? undefined : setPendente(null))}
        title={pendente ? `Alterar — ${pendente.rotulo}` : ''}
        subtitle="Vale a partir do mês escolhido; meses encerrados não mudam."
        tone="brand" size="sm"
        onSubmit={(e) => { e.preventDefault(); if (motivo.trim().length >= MOTIVO_MIN && !busy) void confirmar(); }}
        footer={<><Button type="button" variant="outline" disabled={busy} onClick={() => setPendente(null)}>Cancelar</Button><Button type="submit" disabled={busy || motivo.trim().length < MOTIVO_MIN}>{busy ? 'Gravando…' : 'Confirmar'}</Button></>}
      >
        {pendente && (
          <div className="space-y-3">
            <p className="text-sm text-ink-900">Novo valor: <b>{values[pendente.key]}</b></p>
            <SgoField label="Vale a partir de" required><Select aria-label="Vigência" value={validFrom} onValueChange={setValidFrom} options={opcoesDeMes} /></SgoField>
            <SgoField label="Motivo da alteração" required hint={`Mínimo ${MOTIVO_MIN} caracteres — fica no histórico e na Auditoria.`}>
              <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} aria-label="Motivo da alteração" />
            </SgoField>
            {erro && <p className="text-sm font-medium text-danger">{erro}</p>}
          </div>
        )}
      </SgoModal>
    </div>
  );
}
