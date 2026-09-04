'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { StatusBadge, type StatusTone } from '@/components/ui/status-badge';
import { abaInicial, podeAba, type AcessoAbas } from '@/lib/permissions/abas';
import { SegmentedControl } from '@/components/ui/ds/segmented-control';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus } from 'lucide-react';
import { Select } from '@/components/ui/ds/select';
import { DatePicker } from '@/components/ui/ds/date-picker';
import { Group } from '@/components/ui/ds/group';
import { Sheet } from '@/components/ui/ds/sheet';
import { CalendarCog } from 'lucide-react';
import { EmployeeScheduleForm, type TipoDeEscala, type Turno, type EscalaAtual } from '@/components/schedule/employee-schedule-form';

export interface Collab { id: string; name: string; jobTitle: string | null; units: string[]; unitIds: string[] }
/** A escala vigente da pessoa, para a linha dizer o que já está cadastrado. */
export interface ConfigDaPessoa {
  tipo: string | null; folga: string; desde: string; horario: string | null;
  /** O que a folha precisa para abrir preenchida com o que já vale. */
  atual: EscalaAtual;
}
export interface UnidadeOpt { id: string; name: string }
export interface Vac { id: string; collaborator: string; unit: string; start: string; end: string; status: 'CONFIRMED' | 'CHANGE_REQUESTED' | 'APPROVED' | 'REQUESTED'; changeNote: string | null }
export interface Sched { id: string; collaborator: string; unit: string; date: string; planned: string; variation: 'NONE' | 'ABSENCE' | 'LATE' | 'SWAP'; note: string | null }

const VAC_ST: Record<Vac['status'], { label: string; tone: StatusTone }> = {
  CONFIRMED: { label: 'Confirmada', tone: 'success' },
  CHANGE_REQUESTED: { label: 'Alteração solicitada', tone: 'medium' },
  APPROVED: { label: 'Aprovada', tone: 'success' },
  REQUESTED: { label: 'Solicitada ao RH', tone: 'medium' },
};
const VAR_LABEL = { NONE: 'OK', ABSENCE: 'Falta', LATE: 'Atraso', SWAP: 'Troca' } as const;

export function PeopleClient({
  collaborators, vacations, schedule, canRequestVacation, abas = {},
  unidades = [], tipos = [], turnos = [], configs = {}, filtradoPor = [], total = 0, limite = 0, podeConfigurar = false,
}: {
  collaborators: Collab[]; vacations: Vac[]; schedule: Sched[]; canRequestVacation?: boolean; abas?: AcessoAbas;
  unidades?: UnidadeOpt[];
  tipos?: TipoDeEscala[];
  turnos?: Turno[];
  /** Escala vigente por colaborador (id → resumo). */
  configs?: Record<string, ConfigDaPessoa>;
  /** Nomes das unidades que o filtro deixou passar (vazio = todas). */
  filtradoPor?: string[];
  total?: number;
  limite?: number;
  podeConfigurar?: boolean;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<'col' | 'fer' | 'esc'>(abaInicial(abas, 'PEOPLE', 'col') as 'col' | 'fer' | 'esc');
  const [busy, setBusy] = useState(false);
  /** Colaborador aberto na folha de configuração de escala. */
  const [aberto, setAberto] = useState<Collab | null>(null);
  // Solicitar férias ao RH (item 11 — provisório até a API do RH)
  const [vCollab, setVCollab] = useState('');
  const [vStart, setVStart] = useState('');
  const [vEnd, setVEnd] = useState('');
  const [vNote, setVNote] = useState('');

  async function vacChange(id: string) {
    const note = prompt('O que precisa ser alterado nas férias?'); if (!note) return;
    setBusy(true);
    try { const r = await fetch(`/api/people/vacations/${id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note }) }); if (r.ok) router.refresh(); } finally { setBusy(false); }
  }

  async function vacRequest() {
    setBusy(true);
    try {
      const r = await fetch('/api/people/vacations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ collaboratorId: vCollab, startDate: vStart, endDate: vEnd, note: vNote }) });
      if (r.ok) { setVCollab(''); setVStart(''); setVEnd(''); setVNote(''); router.refresh(); }
      else { const d = await r.json().catch(() => ({})); alert(d.error ?? 'Falha'); }
    } finally { setBusy(false); }
  }
  async function setVar(id: string, variation: string) {
    const note = variation === 'NONE' ? '' : (prompt('Observação (opcional):') ?? '');
    setBusy(true);
    try { const r = await fetch(`/api/people/schedule/${id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ variation, note }) }); if (r.ok) router.refresh(); } finally { setBusy(false); }
  }

  return (
    <div className="space-y-4">
      <SegmentedControl
        aria-label="Seções de Pessoas"
        value={tab}
        onValueChange={(v) => setTab(v as typeof tab)}
        options={[{ value: 'col', label: 'Colaboradores' }, { value: 'fer', label: 'Férias' }, { value: 'esc', label: 'Escala' }].filter((o) => podeAba(abas, o.value))}
      />

      {/* De qual unidade é o que está na tela. Antes a lista trazia a rede
          inteira enquanto o cabeçalho dizia uma unidade só. */}
      <p className="text-xs text-ink-500">
        {filtradoPor.length > 0
          ? <>Mostrando <strong className="text-ink-900">{filtradoPor.join(', ')}</strong>. <a href="?unit=todas" className="font-semibold text-brand hover:underline">Ver todas as unidades</a></>
          : <>Mostrando <strong className="text-ink-900">todas as unidades</strong> do seu acesso.</>}
        {limite > 0 && total > collaborators.length && <> · lista cortada em {limite} de {total} — refine pela unidade.</>}
      </p>

      {aberto && (
        <Sheet open onClose={() => setAberto(null)} title={aberto.name} description="Configuração de escala do colaborador">
          <EmployeeScheduleForm
            unitId={aberto.unitIds[0] ?? ''}
            unidades={unidades.filter((u) => aberto.unitIds.includes(u.id))}
            pessoaFixa={{ id: aberto.id, name: aberto.name }}
            atual={configs[aberto.id]?.atual ?? null}
            pessoas={[{ id: aberto.id, name: aberto.name }]}
            tipos={tipos}
            turnos={turnos}
            busy={busy}
            post={async (p) => {
              setBusy(true);
              try {
                const r = await fetch('/api/schedule', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) });
                if (!r.ok) { const d = await r.json().catch(() => ({})); alert(d.error ?? 'Falha'); return false; }
                setAberto(null); router.refresh(); return true;
              } finally { setBusy(false); }
            }}
          />
        </Sheet>
      )}

      {tab === 'col' && (
        <>
          {/* Estado vazio FORA do grupo: dentro, a caixa emolduraria uma frase
              e o texto ficaria sem respiro, parecendo um item da lista. */}
          {collaborators.length === 0 && <p className="text-sm text-ink-500">Nenhum colaborador.</p>}
          <Group>
            {collaborators.map((c) => {
              const cfg = configs[c.id];
              const linha = (
                <>
                  <p className="font-semibold text-ink-900">{c.name}</p>
                  <p className="text-xs text-ink-500">{c.jobTitle ?? '—'} · {c.units.join(', ')}</p>
                  {/* O que já está cadastrado aparece na própria linha: sem isso,
                      saber quem tem escala exigia abrir um por um. */}
                  {cfg ? (
                    <p className="mt-0.5 text-xs text-ink-500">
                      <span className="font-semibold text-ink-900">{cfg.tipo ?? 'Escala'}</span>
                      {cfg.horario ? ` · ${cfg.horario}` : ''} · {cfg.folga} · desde {cfg.desde}
                    </p>
                  ) : (
                    <p className="mt-0.5 text-xs text-warning">Sem escala cadastrada</p>
                  )}
                </>
              );
              if (!podeConfigurar) return <div key={c.id} className="p-3">{linha}</div>;
              return (
                <button key={c.id} type="button" onClick={() => setAberto(c)} className="flex w-full items-center gap-2 p-3 text-left hover:bg-sunken">
                  <span className="min-w-0 flex-1">{linha}</span>
                  <CalendarCog className="h-4 w-4 shrink-0 text-ink-500" />
                </button>
              );
            })}
          </Group>
        </>
      )}

      {tab === 'fer' && (
        <div className="space-y-2">
          {canRequestVacation && (
            <div className="rounded-lg border border-dashed p-3">
              <p className="mb-2 sgo-type-11 font-semibold text-ink-500">Solicitar férias ao RH</p>
              <div className="space-y-2">
                <Select
                  aria-label="Colaborador" placeholder="Selecione o colaborador…" value={vCollab} onValueChange={setVCollab}
                  options={collaborators.map((c) => ({ value: c.id, label: c.name, hint: c.jobTitle ?? undefined }))}
                />
                <div className="grid grid-cols-2 gap-2">
                  <DatePicker label="Início" value={vStart || null} onValueChange={(v) => setVStart(v ?? '')} />
                  <DatePicker label="Fim" min={vStart || undefined} value={vEnd || null} onValueChange={(v) => setVEnd(v ?? '')} />
                </div>
                <Input value={vNote} onChange={(e) => setVNote(e.target.value)} placeholder="Observação (opcional)" className="h-10 text-sm" />
                <Button className="w-full" disabled={busy || !vCollab || !vStart || !vEnd} onClick={vacRequest}><Plus className="h-4 w-4" /> Pedir ao RH</Button>
                <p className="text-xs text-ink-500">O pedido avisa os Admins para levar ao RH. Quando o RH confirmar, o status muda aqui.</p>
              </div>
            </div>
          )}
          {vacations.length === 0 && <p className="text-sm text-ink-500">Sem férias programadas.</p>}
          {vacations.map((v) => (
            <div key={v.id} className="rounded-lg border bg-surface p-3">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-ink-900">{v.collaborator}</p>
                <StatusBadge tone={VAC_ST[v.status].tone}>{VAC_ST[v.status].label}</StatusBadge>
              </div>
              <p className="text-xs text-ink-500">{v.unit} · {v.start} a {v.end}</p>
              {v.changeNote && <p className="mt-1 text-xs text-warning">Alteração: {v.changeNote}</p>}
              {v.status === 'CONFIRMED' && <Button size="sm" variant="outline" className="mt-2" disabled={busy} onClick={() => vacChange(v.id)}>Solicitar alteração</Button>}
            </div>
          ))}
        </div>
      )}

      {tab === 'esc' && (
        <div className="space-y-2">
          {schedule.length === 0 && <p className="text-sm text-ink-500">Sem escala importada.</p>}
          {schedule.map((s) => (
            <div key={s.id} className="rounded-lg border bg-surface p-3">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-ink-900">{s.collaborator}</p>
                <StatusBadge tone={s.variation === 'NONE' ? 'neutral' : 'medium'}>{VAR_LABEL[s.variation]}</StatusBadge>
              </div>
              <p className="text-xs text-ink-500">{s.unit} · {s.date} · planejado {s.planned}{s.note ? ` · ${s.note}` : ''}</p>
              <div className="mt-2 flex flex-wrap gap-1">
                {(['ABSENCE', 'LATE', 'SWAP', 'NONE'] as const).map((vv) => (
                  <button key={vv} disabled={busy} onClick={() => setVar(s.id, vv)} className="rounded border px-2 py-1 text-xs">{VAR_LABEL[vv]}</button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
