'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Pause, Play, Link2 } from 'lucide-react';
import { Button } from '@/components/ui/ds/button';
import { Input } from '@/components/ui/ds/field';
import { Group } from '@/components/ui/ds/group';
import { Select } from '@/components/ui/ds/select';
import { MultiSelect } from '@/components/ui/multi-select';
import { StatusBadge } from '@/components/ui/status-badge';
import { SgoModal } from '@/components/sgo/sgo-modal';
import { CRITERIOS_GERAIS, PESO_ESPECIFICOS, PESOS_ESPECIFICOS_PADRAO, type Criterio } from '@/lib/people/avaliacao-calculo';

export interface ModeloUi {
  id: string; name: string; managerial: boolean; active: boolean; seedKey: string | null;
  versao: { id: string; version: number; criterios: Criterio[] } | null;
  cargos: { jobTitle: string; jobTitleKey: string; colaboradores: number }[];
  avaliacoes: number;
}
export interface CargoUi { jobTitle: string; jobTitleKey: string; colaboradores: number }
interface SemModelo { cargos: (CargoUi & { modeloInativo: string | null })[]; semCargo: number }

type Esp = { label: string; weight: string; key?: string };
const espVazios = (): Esp[] => PESOS_ESPECIFICOS_PADRAO.map((w) => ({ label: '', weight: String(w) }));

/**
 * Configurações → Avaliação por função (v1.161.0). Lista os modelos com os
 * cargos do RH vinculados, as funções ainda SEM modelo (com atalho para
 * vincular) e o editor: nome, gerencial, 4 critérios específicos cujos pesos
 * precisam somar 60. O servidor decide se a edição vira versão nova.
 */
export function AvaliacaoModelosConfig({ modelos, semModelo, cargos }: { modelos: ModeloUi[]; semModelo: SemModelo; cargos: CargoUi[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [editando, setEditando] = useState<ModeloUi | 'novo' | null>(null);
  const [vinculo, setVinculo] = useState<Record<string, string>>({});

  async function post(body: Record<string, unknown>): Promise<Record<string, unknown> | null> {
    setBusy(true);
    try {
      const res = await fetch('/api/people/evaluation/modelos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { alert(d.error ?? 'Falha'); return null; }
      router.refresh();
      return d;
    } finally { setBusy(false); }
  }

  const opcoesModelo = modelos.filter((m) => m.active).map((m) => ({ value: m.id, label: m.name }));

  async function vincularRapido(c: CargoUi) {
    const id = vinculo[c.jobTitleKey];
    const m = modelos.find((x) => x.id === id);
    if (!m) { alert('Escolha o modelo.'); return; }
    await post({ acao: 'vincular', id: m.id, cargos: [...m.cargos.map((x) => x.jobTitle), c.jobTitle] });
  }

  return (
    <div className="space-y-4">
      {(semModelo.cargos.length > 0 || semModelo.semCargo > 0) && (
        <div className="rounded-lg border border-warning bg-warning-bg p-3" data-testid="funcoes-sem-modelo">
          <p className="text-sm font-semibold text-ink-900">Funções do RH sem modelo ({semModelo.cargos.length})</p>
          <p className="mb-2 text-xs text-ink-700">Quem tem um desses cargos não pode ser avaliado até você vincular. Nada é escolhido sozinho: vincule aqui ou edite o modelo.{semModelo.semCargo > 0 ? ` ${semModelo.semCargo} colaborador(es) estão sem cargo no RH.` : ''}</p>
          <div className="space-y-1.5">
            {semModelo.cargos.map((c) => (
              <div key={c.jobTitleKey} className="flex flex-wrap items-center gap-2 rounded-md bg-surface p-2">
                <span className="min-w-0 flex-1 text-sm"><b>{c.jobTitle}</b> <span className="text-xs text-ink-500">· {c.colaboradores} colaborador(es){c.modeloInativo ? ` · modelo "${c.modeloInativo}" está inativo` : ''}</span></span>
                <div className="w-56">
                  <Select aria-label={`Modelo para ${c.jobTitle}`} size="sm" placeholder="Vincular ao modelo…" value={vinculo[c.jobTitleKey] ?? ''} onValueChange={(v) => setVinculo((s) => ({ ...s, [c.jobTitleKey]: v }))} options={opcoesModelo} />
                </div>
                <Button size="sm" variant="secondary" disabled={busy || !vinculo[c.jobTitleKey]} onClick={() => vincularRapido(c)}><Link2 className="h-3.5 w-3.5" /> Vincular</Button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-ink-500">Critérios gerais (iguais em todo modelo): {CRITERIOS_GERAIS.map((c) => `${c.label} ${c.weight}%`).join(' · ')}.</p>
        <Button size="sm" onClick={() => setEditando('novo')} disabled={busy}><Plus className="h-4 w-4" /> Novo modelo</Button>
      </div>

      <Group>
        {modelos.map((m) => (
          <div key={m.id} className="p-3" data-testid={`modelo-${m.seedKey ?? m.id}`}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-ink-900">{m.name}</span>
              {m.managerial && <StatusBadge tone="neutral">Gerencial · avaliado pela Supervisão</StatusBadge>}
              {!m.active && <StatusBadge tone="critical">Inativo</StatusBadge>}
              {m.versao && <span className="text-xs text-ink-500">v{m.versao.version}</span>}
              <span className="text-xs text-ink-500">· {m.avaliacoes} avaliação(ões)</span>
              <span className="ml-auto flex gap-1">
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => setEditando(m)} aria-label={`Editar ${m.name}`}><Pencil className="h-3.5 w-3.5" /> Editar</Button>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => post({ acao: 'editar', id: m.id, active: !m.active })} aria-label={m.active ? `Desativar ${m.name}` : `Ativar ${m.name}`}>
                  {m.active ? <><Pause className="h-3.5 w-3.5" /> Desativar</> : <><Play className="h-3.5 w-3.5" /> Ativar</>}
                </Button>
              </span>
            </div>
            <p className="mt-1 text-xs text-ink-700">
              {m.versao ? m.versao.criterios.filter((c) => c.group === 'ESPECIFICO').map((c) => `${c.label} ${c.weight}%`).join(' · ') : 'Sem critérios'}
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {m.cargos.length === 0 && <span className="text-xs text-warning">Nenhum cargo vinculado — ninguém cai neste modelo.</span>}
              {m.cargos.map((c) => (
                <span key={c.jobTitleKey} className="inline-flex items-center gap-1 rounded-pill border border-line bg-canvas px-2 py-0.5 text-xs">
                  {c.jobTitle}{c.colaboradores > 0 && <span className="text-ink-500">· {c.colaboradores}</span>}
                </span>
              ))}
            </div>
          </div>
        ))}
      </Group>

      {editando && (
        <EditorModelo
          modelo={editando === 'novo' ? null : editando}
          cargosRh={cargos}
          onClose={() => setEditando(null)}
          onSave={async (dados) => {
            const r = editando === 'novo'
              ? await post({ acao: 'criar', ...dados })
              : await post({ acao: 'editar', id: editando.id, name: dados.name, managerial: dados.managerial, especificos: dados.especificos });
            if (!r) return;
            if (editando !== 'novo') await post({ acao: 'vincular', id: editando.id, cargos: dados.cargos });
            if (editando !== 'novo' && typeof r.novaVersao === 'number') alert(`Critérios alterados: o modelo passou para a versão ${r.novaVersao}. As avaliações já feitas continuam na versão anterior.`);
            setEditando(null);
          }}
        />
      )}
    </div>
  );
}

function EditorModelo({ modelo, cargosRh, onClose, onSave }: {
  modelo: ModeloUi | null; cargosRh: CargoUi[]; onClose: () => void;
  onSave: (d: { name: string; managerial: boolean; especificos: { label: string; weight: number; key?: string }[]; cargos: string[] }) => Promise<void>;
}) {
  const [name, setName] = useState(modelo?.name ?? '');
  const [managerial, setManagerial] = useState(modelo?.managerial ?? false);
  const [esp, setEsp] = useState<Esp[]>(() => {
    const atuais = modelo?.versao?.criterios.filter((c) => c.group === 'ESPECIFICO') ?? [];
    return atuais.length === 4 ? atuais.map((c) => ({ label: c.label, weight: String(c.weight), key: c.key })) : espVazios();
  });
  const [cargos, setCargos] = useState<string[]>(modelo?.cargos.map((c) => c.jobTitle) ?? []);
  const [salvando, setSalvando] = useState(false);
  const soma = esp.reduce((s, e) => s + (Number(e.weight) || 0), 0);

  /* Opções = cargos do RH + os já vinculados (um cargo pode ter saído do RH e seguir vinculado). */
  const opcoes = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of cargosRh) map.set(c.jobTitle, `${c.jobTitle} (${c.colaboradores})`);
    for (const c of cargos) if (!map.has(c)) map.set(c, c);
    return [...map.entries()].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
  }, [cargosRh, cargos]);

  return (
    <SgoModal
      open onClose={onClose} tone="brand" size="lg"
      title={modelo ? `Editar modelo: ${modelo.name}` : 'Novo modelo de avaliação'}
      subtitle={`Critérios gerais (${CRITERIOS_GERAIS.reduce((s, c) => s + c.weight, 0)}%) são fixos. Os 4 específicos precisam somar ${PESO_ESPECIFICOS}%.`}
      onSubmit={async (e) => {
        e.preventDefault();
        if (soma !== PESO_ESPECIFICOS) { alert(`Os pesos específicos somam ${soma}%; precisam somar ${PESO_ESPECIFICOS}%.`); return; }
        setSalvando(true);
        try { await onSave({ name, managerial, especificos: esp.map((x) => ({ label: x.label, weight: Number(x.weight), key: x.key })), cargos }); } finally { setSalvando(false); }
      }}
      footer={<><Button type="button" variant="secondary" onClick={onClose} disabled={salvando}>Cancelar</Button><Button type="submit" loading={salvando}>Salvar</Button></>}
    >
      <div className="space-y-3">
        <Input label="Nome do modelo" value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} placeholder="ex.: Cozinheiro" />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={managerial} onChange={(e) => setManagerial(e.target.checked)} />
          Função gerencial (Gerente/Encarregado) — avaliada pela Supervisão, não pelo gerente da unidade
        </label>
        <div>
          <p className="mb-1 text-xs font-semibold text-ink-700">Critérios específicos da função</p>
          <div className="space-y-2">
            {esp.map((x, i) => (
              <div key={i} className="flex items-end gap-2">
                <div className="flex-1"><Input label={i === 0 ? 'Critério' : undefined} inputSize="sm" value={x.label} onChange={(e) => setEsp((s) => s.map((y, j) => (j === i ? { ...y, label: e.target.value } : y)))} required maxLength={80} placeholder={`Critério ${i + 1}`} /></div>
                <div className="w-24"><Input label={i === 0 ? 'Peso %' : undefined} inputSize="sm" inputMode="numeric" value={x.weight} onChange={(e) => setEsp((s) => s.map((y, j) => (j === i ? { ...y, weight: e.target.value } : y)))} required /></div>
              </div>
            ))}
          </div>
          <p className={`mt-1 text-xs ${soma === PESO_ESPECIFICOS ? 'text-ink-500' : 'text-danger'}`} data-testid="soma-pesos">Soma dos específicos: {soma}% (precisa ser {PESO_ESPECIFICOS}%)</p>
        </div>
        <div>
          <p className="mb-1 text-xs font-semibold text-ink-700">Cargos do RH que usam este modelo</p>
          <MultiSelect options={opcoes} selected={cargos} onChange={setCargos} searchable placeholder="Escolher cargos…" allLabel="todos" emptyLabel="Nenhum cargo no RH" />
          <p className="mt-1 text-xs text-ink-500">Cargo que já estava em outro modelo passa para este. A comparação ignora maiúsculas e acentos.</p>
        </div>
      </div>
    </SgoModal>
  );
}
