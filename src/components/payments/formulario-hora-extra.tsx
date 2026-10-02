'use client';

import { useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select as DsSelect } from '@/components/ui/ds/select';
import { DatePicker } from '@/components/ui/ds/date-picker';
import { TimePicker } from '@/components/ui/ds/time-picker';
import { formatBRL } from '@/lib/utils';
import { shortUnitName } from '@/lib/unit-name';
import { calcularHoraExtra, textoHoras } from '@/lib/overtime/calculo';
import { competenciaDaHoraExtra, rotuloDaCompetencia } from '@/lib/people/pagamento-extra-calculo';

/**
 * O FORMULÁRIO DA HORA EXTRA — um só, usado em dois lugares (v1.142.0).
 *
 * Vive em Pagamentos → Nova solicitação (tipo Hora Extra) e na tela Hora extra
 * ("+ Nova solicitação"). Extraído de `payments-client.tsx` sem mudar a regra:
 * colaborador do RH da unidade, data, período, valor/hora ESCOLHIDO entre os
 * autorizados, motivo do CATÁLOGO (novo), detalhe em texto, VT; a prévia usa a
 * MESMA `calcularHoraExtra` que o servidor grava. O envio vai para
 * `POST /api/payments` — a solicitação nasce no mesmo fluxo de aprovação.
 */

export interface UnidadeOpt { id: string; name: string }
export interface ColaboradorOpt { id: string; name: string; jobTitle: string | null }
export interface MotivoOpt { id: string; name: string }

export function FormularioHoraExtra({
  units, collaboratorsByUnit, overtimeRatesByUnit, motivos, unitId: unitIdControlado, onDone, compacto = false,
}: {
  units: UnidadeOpt[];
  collaboratorsByUnit: Record<string, ColaboradorOpt[]>;
  overtimeRatesByUnit: Record<string, number[]>;
  motivos: MotivoOpt[];
  /** Quando a tela de fora já escolheu a unidade (Pagamentos), o seletor some. */
  unitId?: string;
  onDone: () => void;
  /** Sem a explicação longa do cálculo (a tela de fora já diz). */
  compacto?: boolean;
}) {
  const [unitIdLocal, setUnitIdLocal] = useState(unitIdControlado ?? units[0]?.id ?? '');
  const unitId = unitIdControlado ?? unitIdLocal;
  const [collaboratorId, setCollaboratorId] = useState('');
  const [workDate, setWorkDate] = useState('');
  const [workStartTime, setWorkStartTime] = useState('');
  const [workEndTime, setWorkEndTime] = useState('');
  const [hourlyRate, setHourlyRate] = useState('');
  const [motivoId, setMotivoId] = useState('');
  const [reason, setReason] = useState('');
  const [transportValue, setTransportValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const unitCollabs = useMemo(() => collaboratorsByUnit[unitId] ?? [], [collaboratorsByUnit, unitId]);
  const unitRates = useMemo(() => overtimeRatesByUnit[unitId] ?? [], [overtimeRatesByUnit, unitId]);
  // Trocou a unidade: o colaborador e o valor/hora eram da outra.
  useEffect(() => { setCollaboratorId(''); setHourlyRate(''); }, [unitId]);

  const heCalc = useMemo(() => {
    if (!workStartTime || !workEndTime || !hourlyRate) return null;
    const c = calcularHoraExtra({ inicio: workStartTime, fim: workEndTime, valorHora: Number(hourlyRate), vt: parseFloat((transportValue || '0').replace(',', '.')) || 0 });
    return c.horas > 0 ? c : null;
  }, [workStartTime, workEndTime, hourlyRate, transportValue]);

  async function submit() {
    setErr(null);
    if (!unitId) { setErr('Escolha a unidade.'); return; }
    if (!collaboratorId) { setErr('Escolha o colaborador na lista.'); return; }
    if (!workDate) { setErr('Informe a data da hora extra.'); return; }
    if (!workStartTime || !workEndTime) { setErr('Informe hora início e hora fim.'); return; }
    if (!hourlyRate) { setErr(unitRates.length ? 'Escolha o valor da hora.' : 'Esta unidade não tem valor/hora de Hora Extra cadastrado. Peça ao Admin (Configurações → Valor da hora extra).'); return; }
    if (!heCalc) { setErr('O período precisa ter pelo menos alguns minutos.'); return; }
    if (!motivoId) { setErr('Escolha o motivo da hora extra.'); return; }
    setBusy(true);
    try {
      const body = {
        type: 'OVERTIME', unitId, amount: heCalc.total, description: '',
        collaboratorId, workDate, workStartTime, workEndTime, hourlyRate: Number(hourlyRate),
        overtimeReasonId: motivoId, reason,
        transportValue: transportValue ? parseFloat(transportValue.replace(',', '.')) : undefined,
      };
      const res = await fetch('/api/payments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(data.error ?? 'Falha'); return; }
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3" data-testid="form-hora-extra">
      {unitIdControlado == null && units.length > 1 && (
        <DsSelect label="Unidade" value={unitId} onValueChange={setUnitIdLocal} options={units.map((u) => ({ value: u.id, label: shortUnitName(u.name) }))} />
      )}
      <DsSelect
        label="Colaborador"
        required
        searchable
        searchPlaceholder="Pesquisar colaborador…"
        placeholder={unitCollabs.length ? 'Pesquisar ou selecionar…' : 'Nenhum colaborador do RH nesta unidade'}
        value={collaboratorId}
        onValueChange={setCollaboratorId}
        disabled={unitCollabs.length === 0}
        options={unitCollabs.map((c) => ({ value: c.id, label: c.name, hint: c.jobTitle ?? undefined }))}
        hint={unitCollabs.length ? 'Colaboradores do RH desta unidade.' : 'Sincronize a unidade em Pessoas → Colaboradores para a lista aparecer.'}
      />
      <DatePicker label="Data" required value={workDate || null} onValueChange={(v) => setWorkDate(v ?? '')} />
      {workDate && competenciaDaHoraExtra(workDate) && (
        <p className="sgo-type-11 text-ink-500">
          Depois de aprovada, entra no Fechamento da competência <b>{rotuloDaCompetencia(competenciaDaHoraExtra(workDate)!)}</b> — paga no mês seguinte ao trabalho.
        </p>
      )}
      <div className="grid grid-cols-2 gap-2">
        <TimePicker label="Hora início" value={workStartTime || null} onValueChange={(v) => setWorkStartTime(v ?? '')} />
        <TimePicker label="Hora fim" value={workEndTime || null} onValueChange={(v) => setWorkEndTime(v ?? '')} />
      </div>
      <DsSelect
        label="Valor da hora (R$/h)"
        required
        placeholder={unitRates.length ? 'Escolha o valor autorizado…' : 'Sem valor cadastrado nesta unidade'}
        value={hourlyRate}
        onValueChange={setHourlyRate}
        disabled={unitRates.length === 0}
        options={unitRates.map((v) => ({ value: String(v), label: `${formatBRL(v)}/h` }))}
        hint={unitRates.length ? 'Só os valores autorizados pelo Admin para esta unidade.' : 'O Admin cadastra em Configurações → Valor da hora extra (por hora).'}
      />
      {unitRates.length === 0 && (
        <p className="rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning">Esta unidade ainda não tem valor/hora de Hora Extra cadastrado — não é possível lançar até o Admin cadastrar.</p>
      )}
      <DsSelect
        label="Motivo"
        required
        placeholder={motivos.length ? 'Escolha o motivo…' : 'Sem motivos cadastrados'}
        value={motivoId}
        onValueChange={setMotivoId}
        disabled={motivos.length === 0}
        options={motivos.map((m) => ({ value: m.id, label: m.name }))}
        hint="Lista do Admin (Configurações → Pagamentos). É por este motivo que o painel compara."
      />
      <div><Label>Detalhe (opcional)</Label><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="ex: faltou o Carlos no jantar" /></div>
      <div><Label>Vale transporte (R$, opcional — soma ao total)</Label><Input inputMode="decimal" value={transportValue} onChange={(e) => setTransportValue(e.target.value)} placeholder="0,00" /></div>
      {heCalc && (
        <div className="rounded-lg border-2 border-brand/40 bg-brand/5 p-3" data-testid="he-previa">
          <p className="text-xs text-ink-500">Valor calculado</p>
          <p className="sgo-type-24 font-semibold text-ink-900">{formatBRL(heCalc.total)}</p>
          <p className="text-xs text-ink-500">{textoHoras(heCalc.horas)} × {formatBRL(heCalc.valorHora)}/h{heCalc.vt > 0 ? ` + ${formatBRL(heCalc.vt)} de vale-transporte` : ''}</p>
        </div>
      )}
      {!compacto && <p className="text-xs text-ink-500">Horas, subtotal e total são calculados pelo sistema (fim − início; passa da meia-noite: 22:00 → 02:00 = 4h). O cálculo final da folha (50%/100%, reflexos) é do RH.</p>}
      {err && <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm font-medium text-danger">{err}</p>}
      <Button onClick={submit} disabled={busy} size="lg" className="w-full"><Plus className="h-5 w-5" /> Enviar solicitação</Button>
    </div>
  );
}
