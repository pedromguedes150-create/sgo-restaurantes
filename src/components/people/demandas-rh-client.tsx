'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, ListChecks, Send } from 'lucide-react';
import { LargeTitle } from '@/components/layout/page-chrome';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/ds/select';
import { DatePicker } from '@/components/ui/ds/date-picker';
import { StatusBadge } from '@/components/ui/status-badge';
import { Group } from '@/components/ui/ds/group';
import { shortUnitName } from '@/lib/unit-name';
import type { DemandaDaLista } from '@/lib/rh/demandas';

type Opcao = { value: string; label: string };

/** O gerente vê o estado do envio sem o detalhe técnico (que é da tela do Admin). */
const ENVIO: Record<DemandaDaLista['envio'], { label: string; tone: 'neutral' | 'medium' | 'success' | 'critical' }> = {
  NAO_ENVIADO: { label: 'Não enviado', tone: 'neutral' },
  AGUARDANDO: { label: 'Enviando ao RH…', tone: 'medium' },
  ENVIADO: { label: 'Recebido pelo RH', tone: 'success' },
  COM_PROBLEMA: { label: 'Envio em revisão pelo Administrador', tone: 'critical' },
};
const PRIORIDADE_TONE: Record<string, 'neutral' | 'medium' | 'critical'> = { NORMAL: 'neutral', ALTA: 'medium', URGENTE: 'critical' };

function dataBR(iso: string | null): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

export function DemandasRhClient({ canCreate, units, collaboratorsByUnit, rows, tipos, prioridades }: {
  canCreate: boolean;
  units: { id: string; name: string }[];
  collaboratorsByUnit: Record<string, { id: string; name: string }[]>;
  rows: DemandaDaLista[];
  tipos: Opcao[]; prioridades: Opcao[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<'nova' | 'lista'>(canCreate ? 'nova' : 'lista');
  return (
    <div className="space-y-4">
      <LargeTitle
        title="Demandas ao RH"
        subtitle="Pedido ou dúvida do gerente enviado ao GBF-RH. O número, o prazo e a situação que o RH devolve aparecem aqui."
        tabs={[
          ...(canCreate ? [{ value: 'nova' as const, label: 'Nova demanda', icon: <Plus className="h-3.5 w-3.5" /> }] : []),
          { value: 'lista' as const, label: 'Minhas demandas', icon: <ListChecks className="h-3.5 w-3.5" /> },
        ].map((o) => ({ label: o.label, icon: o.icon, active: tab === o.value, testId: `aba-${o.value}`, onClick: () => setTab(o.value) }))}
      />
      {tab === 'nova' && canCreate && <Form units={units} collaboratorsByUnit={collaboratorsByUnit} tipos={tipos} prioridades={prioridades} onDone={() => { setTab('lista'); router.refresh(); }} />}
      {tab === 'lista' && <Lista rows={rows} />}
    </div>
  );
}

function Form({ units, collaboratorsByUnit, tipos, prioridades, onDone }: {
  units: { id: string; name: string }[]; collaboratorsByUnit: Record<string, { id: string; name: string }[]>; tipos: Opcao[]; prioridades: Opcao[]; onDone: () => void;
}) {
  const [unitId, setUnitId] = useState(units[0]?.id ?? '');
  const [tipo, setTipo] = useState('');
  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [collaboratorId, setCollaboratorId] = useState('');
  const [dataEvento, setDataEvento] = useState<string | null>(null);
  const [prioridade, setPrioridade] = useState('NORMAL');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const collabs = collaboratorsByUnit[unitId] ?? [];

  async function submit() {
    setErr(null);
    if (!tipo) { setErr('Escolha o tipo da demanda.'); return; }
    if (!titulo.trim()) { setErr('Escreva um resumo.'); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/rh/demandas', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unitId, tipo, titulo, descricao, collaboratorId: collaboratorId || null, dataEvento, prioridade }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(d.error ?? 'Falha'); return; }
      onDone();
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Select label="Empresa" value={unitId} onValueChange={(v) => { setUnitId(v); setCollaboratorId(''); }} options={units.map((u) => ({ value: u.id, label: shortUnitName(u.name) }))} />
        <Select label="Tipo" placeholder="Selecione…" value={tipo} onValueChange={setTipo} options={tipos} />
      </div>
      <div><Label>Resumo (até 200 caracteres)</Label><Input value={titulo} maxLength={200} onChange={(e) => setTitulo(e.target.value)} placeholder="ex.: Dúvida sobre banco de horas do Carlos" /></div>
      <div className="grid grid-cols-2 gap-2">
        <Select label="Colaborador (opcional)" placeholder="Nenhum" value={collaboratorId} onValueChange={setCollaboratorId} options={[{ value: '', label: 'Nenhum' }, ...collabs.map((c) => ({ value: c.id, label: c.name }))]} searchable />
        <DatePicker label="Data do evento (opcional)" value={dataEvento} onValueChange={setDataEvento} />
      </div>
      <Select label="Prioridade" value={prioridade} onValueChange={setPrioridade} options={prioridades} />
      <div>
        <Label>Descrição (opcional, até 5.000 caracteres)</Label>
        <textarea value={descricao} maxLength={5000} onChange={(e) => setDescricao(e.target.value)} rows={4} className="w-full rounded-lg border-2 border-line-strong bg-surface p-2 text-sm" placeholder="detalhe o pedido" />
      </div>
      {err && <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm font-medium text-danger">{err}</p>}
      <Button onClick={submit} disabled={busy} size="lg" className="w-full"><Send className="h-5 w-5" /> Enviar ao RH</Button>
    </div>
  );
}

function Lista({ rows }: { rows: DemandaDaLista[] }) {
  if (rows.length === 0) return <p className="text-sm text-ink-500">Nenhuma demanda registrada.</p>;
  return (
    <Group>
      {rows.map((r) => {
        const envio = ENVIO[r.envio];
        return (
          <div key={r.id} className="p-3" data-testid={`demanda-${r.id}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink-900">{r.titulo}</p>
                <p className="text-xs text-ink-500">{r.unitName} · {r.tipo.replace(/_/g, ' ').toLowerCase()}{r.collaboratorName ? ` · ${r.collaboratorName}` : ''} · {r.createdByName} · {new Date(r.createdAt).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</p>
              </div>
              <StatusBadge tone={PRIORIDADE_TONE[r.prioridade] ?? 'neutral'}>{r.prioridade.toLowerCase()}</StatusBadge>
            </div>
            {r.descricao && <p className="mt-1 whitespace-pre-wrap text-sm">{r.descricao}</p>}
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs" data-testid="andamento-rh">
              <StatusBadge tone={envio.tone}>{envio.label}</StatusBadge>
              {r.envio === 'ENVIADO' && (
                <span className="text-ink-700">
                  {r.rhNumero ? <>Nº <b>{r.rhNumero}</b> · </> : null}
                  Situação: <b>{r.situacaoRotulo}</b>
                  {r.rhPrazoAlvo ? <> · prazo {dataBR(r.rhPrazoAlvo)}</> : null}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </Group>
  );
}
