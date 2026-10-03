'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { StatusBadge, type StatusTone } from '@/components/ui/status-badge';
import { abaInicial, podeAba, type AcessoAbas } from '@/lib/permissions/abas';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Users, Palmtree, CalendarDays } from 'lucide-react';
import { Select } from '@/components/ui/ds/select';
import { DatePicker } from '@/components/ui/ds/date-picker';
import { Group } from '@/components/ui/ds/group';
import { Card, PanelHeader } from '@/components/sgo/panel';
import { SgoModal } from '@/components/sgo/sgo-modal';
import { LargeTitle } from '@/components/layout/page-chrome';
import { CalendarCog, Building2 } from 'lucide-react';
import { MultiSelect } from '@/components/ui/multi-select';
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

/**
 * Pessoas — Colaboradores · Férias · Escala (Fase 4 do kit, v1.146.0): o
 * cabeçalho do kit com as três abas de ESTADO; listas em painel sólido com
 * linhas; o formulário de férias num painel com cabeçalho; "Configurar
 * escala" e "Editar unidades" em modal do kit (criar/editar). Dados, ações e
 * regras: as mesmas.
 */
export function PeopleClient({
  collaborators, vacations, schedule, canRequestVacation, abas = {},
  unidades = [], tipos = [], turnos = [], configs = {}, filtradoPor = [], total = 0, limite = 0, podeConfigurar = false,
  podeEditarUnidades = false, subtitulo, ferramentas,
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
  /** Corrigir a QUAIS unidades o colaborador está ligado — só Admin (o sync só adiciona vínculo, nunca remove). */
  podeEditarUnidades?: boolean;
  /** Subtítulo do cabeçalho da página (vem da página de servidor). */
  subtitulo?: React.ReactNode;
  /** Painel com os destinos do módulo (vem da página de servidor, já filtrado pela permissão). */
  ferramentas?: React.ReactNode;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<'col' | 'fer' | 'esc'>(abaInicial(abas, 'PEOPLE', 'col') as 'col' | 'fer' | 'esc');
  const [busy, setBusy] = useState(false);
  /** Colaborador aberto na folha de configuração de escala. */
  const [aberto, setAberto] = useState<Collab | null>(null);
  /** Colaborador aberto na folha de "Editar unidades". */
  const [editandoUnidades, setEditandoUnidades] = useState<Collab | null>(null);
  const [unidadesSelecionadas, setUnidadesSelecionadas] = useState<string[]>([]);
  const [erroUnidades, setErroUnidades] = useState('');

  async function salvarUnidades() {
    if (!editandoUnidades) return;
    if (unidadesSelecionadas.length === 0) { setErroUnidades('Escolha ao menos uma unidade.'); return; }
    setBusy(true); setErroUnidades('');
    try {
      const res = await fetch('/api/admin', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entity: 'collaborator', action: 'setUnits', id: editandoUnidades.id, unitIds: unidadesSelecionadas }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setErroUnidades(d.error ?? 'Falha ao salvar.'); return; }
      setEditandoUnidades(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

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

  const abasDaTela = [
    { value: 'col' as const, label: 'Colaboradores', icon: <Users className="h-3.5 w-3.5" /> },
    { value: 'fer' as const, label: 'Férias', icon: <Palmtree className="h-3.5 w-3.5" /> },
    { value: 'esc' as const, label: 'Escala', icon: <CalendarDays className="h-3.5 w-3.5" /> },
  ].filter((o) => podeAba(abas, o.value));

  return (
    <div className="space-y-4">
      <LargeTitle
        title="Gestão de Pessoas"
        subtitle={subtitulo}
        tabs={abasDaTela.map((o) => ({ label: o.label, icon: o.icon, active: tab === o.value, testId: `aba-${o.value}`, onClick: () => setTab(o.value) }))}
      />

      {/* De qual unidade é o que está na tela. Antes a lista trazia a rede
          inteira enquanto o cabeçalho dizia uma unidade só. */}
      <p className="text-xs" style={{ color: 'var(--sgo-ink-2)' }}>
        {filtradoPor.length > 0
          ? <>Mostrando <strong style={{ color: 'var(--sgo-ink)' }}>{filtradoPor.join(', ')}</strong>. <a href="?unit=todas" className="font-semibold hover:underline" style={{ color: 'var(--sgo-accent)' }}>Ver todas as unidades</a></>
          : <>Mostrando <strong style={{ color: 'var(--sgo-ink)' }}>todas as unidades</strong> do seu acesso.</>}
        {limite > 0 && total > collaborators.length && <> · lista cortada em {limite} de {total} — refine pela unidade.</>}
      </p>

      {ferramentas}

      {/* Editar = modal do kit. O formulário de escala traz o próprio botão de salvar. */}
      {aberto && (
        <SgoModal open onClose={() => setAberto(null)} title={aberto.name} subtitle="Configuração de escala do colaborador" icon={<CalendarCog className="h-4 w-4" />} tone="brand" size="sm">
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
        </SgoModal>
      )}

      {editandoUnidades && (
        <SgoModal
          open
          onClose={() => setEditandoUnidades(null)}
          title={`Unidades de ${editandoUnidades.name}`}
          subtitle="O sync do RH só ADICIONA vínculo — nunca remove. Depois de uma transferência, a unidade antiga fica ligada até alguém tirar manualmente aqui."
          icon={<Building2 className="h-4 w-4" />}
          tone="amber"
          size="sm"
          footerLeft={<span className="text-xs" style={{ color: 'var(--sgo-bad)' }}>{erroUnidades}</span>}
          footer={
            <>
              <button type="button" className="sgo-btn" onClick={() => setEditandoUnidades(null)} disabled={busy}>Cancelar</button>
              <button type="button" className="sgo-btn sgo-btn--primary" onClick={salvarUnidades} disabled={busy}>Salvar</button>
            </>
          }
        >
          <div className="space-y-1">
            <Label>Unidades</Label>
            <MultiSelect
              options={unidades.map((u) => ({ value: u.id, label: u.name }))}
              selected={unidadesSelecionadas}
              onChange={setUnidadesSelecionadas}
              placeholder="Selecionar unidades…"
              searchable
            />
            {/* ⚠️ Se o RH continuar devolvendo a pessoa para uma unidade que
                você tirou daqui, a PRÓXIMA sincronização recria o vínculo — a
                correção só "gruda" se o RH de fato não devolver mais a pessoa
                para lá. */}
          </div>
        </SgoModal>
      )}

      {tab === 'col' && (
        <>
          {/* Estado vazio FORA do grupo: dentro, a caixa emolduraria uma frase
              e o texto ficaria sem respiro, parecendo um item da lista. */}
          {collaborators.length === 0 && <p className="text-sm" style={{ color: 'var(--sgo-ink-2)' }}>Nenhum colaborador.</p>}
          <Group>
            {collaborators.map((c) => {
              const cfg = configs[c.id];
              const linha = (
                <>
                  <p className="font-semibold" style={{ color: 'var(--sgo-ink)' }}>{c.name}</p>
                  <p className="text-xs" style={{ color: 'var(--sgo-ink-2)' }}>{c.jobTitle ?? '—'} · {c.units.join(', ')}</p>
                  {/* O que já está cadastrado aparece na própria linha: sem isso,
                      saber quem tem escala exigia abrir um por um. */}
                  {cfg ? (
                    <p className="mt-0.5 text-xs" style={{ color: 'var(--sgo-ink-2)' }}>
                      <span className="font-semibold" style={{ color: 'var(--sgo-ink)' }}>{cfg.tipo ?? 'Escala'}</span>
                      {cfg.horario ? ` · ${cfg.horario}` : ''} · {cfg.folga} · desde {cfg.desde}
                    </p>
                  ) : (
                    <p className="mt-0.5 text-xs" style={{ color: 'var(--sgo-warn)' }}>Sem escala cadastrada</p>
                  )}
                </>
              );
              if (!podeConfigurar && !podeEditarUnidades) return <div key={c.id} className="p-3">{linha}</div>;
              /* Duas ações por linha (escala + unidades) não cabem dentro de UM
                 <button> só — botão dentro de botão é HTML inválido e rouba o
                 clique um do outro. A linha virou `div`, com cada ação como seu
                 próprio botão; "Configurar escala" continua sendo a maior área
                 clicável (é a ação do dia a dia), "Editar unidades" é o ícone à
                 parte, só para o Admin. */
              return (
                <div key={c.id} className="flex w-full items-center gap-2 p-3 hover:bg-sunken">
                  {podeConfigurar ? (
                    <button type="button" title="Configurar escala" onClick={() => setAberto(c)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                      <span className="min-w-0 flex-1">{linha}</span>
                      <CalendarCog className="h-4 w-4 shrink-0" style={{ color: 'var(--sgo-ink-2)' }} />
                    </button>
                  ) : (
                    <span className="min-w-0 flex-1">{linha}</span>
                  )}
                  {podeEditarUnidades && (
                    <button
                      type="button"
                      title="Editar unidades"
                      aria-label={`Editar unidades de ${c.name}`}
                      onClick={() => { setEditandoUnidades(c); setUnidadesSelecionadas(c.unitIds); setErroUnidades(''); }}
                      className="sgo-btn sgo-btn--icon sgo-btn--ghost shrink-0"
                    >
                      <Building2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              );
            })}
          </Group>
        </>
      )}

      {tab === 'fer' && (
        <div className="space-y-3">
          {canRequestVacation && (
            <Card>
              <PanelHeader title="Solicitar férias ao RH" icon={<span className="sgo-panel__ic sgo-panel__ic--green" aria-hidden><Palmtree className="h-4 w-4" /></span>} />
              <div className="space-y-2 px-4 py-3">
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
                <p className="text-xs" style={{ color: 'var(--sgo-ink-2)' }}>O pedido avisa os Admins para levar ao RH. Quando o RH confirmar, o status muda aqui.</p>
              </div>
            </Card>
          )}
          {vacations.length === 0 && <p className="text-sm" style={{ color: 'var(--sgo-ink-2)' }}>Sem férias programadas.</p>}
          <Group>
            {vacations.map((v) => (
              <div key={v.id} className="p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold" style={{ color: 'var(--sgo-ink)' }}>{v.collaborator}</p>
                  <StatusBadge tone={VAC_ST[v.status].tone}>{VAC_ST[v.status].label}</StatusBadge>
                </div>
                <p className="text-xs" style={{ color: 'var(--sgo-ink-2)' }}>{v.unit} · {v.start} a {v.end}</p>
                {v.changeNote && <p className="mt-1 text-xs" style={{ color: 'var(--sgo-warn)' }}>Alteração: {v.changeNote}</p>}
                {v.status === 'CONFIRMED' && <button type="button" className="sgo-btn sgo-btn--sm mt-2" disabled={busy} onClick={() => vacChange(v.id)}>Solicitar alteração</button>}
              </div>
            ))}
          </Group>
        </div>
      )}

      {tab === 'esc' && (
        <div className="space-y-2">
          {schedule.length === 0 && <p className="text-sm" style={{ color: 'var(--sgo-ink-2)' }}>Sem escala importada.</p>}
          <Group>
            {schedule.map((s) => (
              <div key={s.id} className="p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold" style={{ color: 'var(--sgo-ink)' }}>{s.collaborator}</p>
                  <StatusBadge tone={s.variation === 'NONE' ? 'neutral' : 'medium'}>{VAR_LABEL[s.variation]}</StatusBadge>
                </div>
                <p className="text-xs" style={{ color: 'var(--sgo-ink-2)' }}>{s.unit} · {s.date} · planejado {s.planned}{s.note ? ` · ${s.note}` : ''}</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {(['ABSENCE', 'LATE', 'SWAP', 'NONE'] as const).map((vv) => (
                    <button key={vv} type="button" disabled={busy} onClick={() => setVar(s.id, vv)} className="sgo-btn sgo-btn--sm">{VAR_LABEL[vv]}</button>
                  ))}
                </div>
              </div>
            ))}
          </Group>
        </div>
      )}
    </div>
  );
}
