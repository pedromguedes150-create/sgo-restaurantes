'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Trash2, X, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/ui/ds/status-badge';

export interface TemplateRow {
  id: string;
  name: string;
  workDays: number;
  offDays: number;
  startTime: string | null;
  breakTime: string | null;
  endTime: string | null;
  active: boolean;
}

/** "trabalha 6, folga 1 · 7 dias de ciclo" — o que o gerador vai fazer. */
function resumoDoCiclo(work: number, off: number): string {
  const ciclo = work + off;
  const semanal = ciclo === 7 ? ' · fecha na semana' : '';
  return `trabalha ${work}, folga ${off} · ciclo de ${ciclo} dia(s)${semanal}`;
}

function resumoDosHorarios(t: TemplateRow): string | null {
  if (!t.startTime && !t.endTime && !t.breakTime) return null;
  const faixa = t.startTime && t.endTime ? `${t.startTime}–${t.endTime}` : (t.startTime ?? t.endTime ?? '');
  return t.breakTime ? `${faixa} (intervalo ${t.breakTime})` : faixa;
}

export function ScheduleTemplatesAdmin({ templates }: { templates: TemplateRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [editando, setEditando] = useState<string | null>(null);

  async function post(body: Record<string, unknown>, depois?: () => void) {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch('/api/schedule-templates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg(d.error ?? 'Falha'); return false; }
      depois?.(); router.refresh(); return true;
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-4">
      {/* O AVISO VEM PRIMEIRO. Quem chega aqui procurando o dia da folga não o
          encontra — ele é de cada pessoa, e mora em outra tela. Sem dizer onde,
          a pessoa conclui que o recurso não existe. */}
      <div className="rounded-lg border-2 border-info/40 bg-info/5 p-3">
        <p className="text-sm font-semibold text-ink-900">Procurando o dia da folga? Não é aqui.</p>
        <p className="mt-1 text-sm text-ink-700">
          Esta tela define o <b>ciclo</b> (6x1, 12x36) e os horários padrão, que valem para a rede toda. O{' '}
          <b>dia da folga é de cada colaborador</b> e fica em{' '}
          <Link href="/modulos/escala" className="font-semibold text-brand underline">
            Escala → &quot;Cadastrar escala&quot;
          </Link>
          , no bloco <b>&quot;Configuração de escala do colaborador&quot;</b>.
        </p>
      </div>

      <p className="text-sm text-ink-500">
        Quase toda escala é <b>&quot;trabalha X dias, folga Y&quot;</b> — 6x1, 5x2, 4x2. O <b>12x36</b> entra como
        <b> 1 × 1</b>: em dias de calendário é dia sim, dia não. Os horários aqui são o <b>padrão do tipo</b>; cada
        colaborador pode ter os seus na configuração da escala dele.
      </p>

      {msg && <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm font-medium text-danger">{msg}</p>}

      <FormularioDoTipo onSalvar={(dados) => post({ action: 'upsert', ...dados })} busy={busy} />

      <div className="space-y-1.5">
        {templates.length === 0 && <p className="text-sm text-ink-500">Nenhum tipo de escala cadastrado.</p>}
        {templates.map((t) =>
          editando === t.id ? (
            <div key={t.id} className="rounded-lg border-2 border-brand/40 bg-surface p-2.5">
              <FormularioDoTipo
                inicial={t}
                busy={busy}
                onCancelar={() => setEditando(null)}
                onSalvar={async (dados) => { const ok = await post({ action: 'upsert', id: t.id, ...dados }); if (ok) setEditando(null); return ok; }}
              />
            </div>
          ) : (
            <div key={t.id} className={`flex items-center justify-between gap-2 rounded-lg border p-2.5 ${t.active ? 'bg-surface' : 'bg-canvas opacity-60'}`}>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink-900">{t.name}</p>
                <p className="text-[11px] text-ink-500">
                  {resumoDoCiclo(t.workDays, t.offDays)}
                  {resumoDosHorarios(t) ? ` · ${resumoDosHorarios(t)}` : ''}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {!t.active && <StatusBadge tone="neutral">Inativo</StatusBadge>}
                <Button size="sm" variant="ghost" onClick={() => setEditando(t.id)} aria-label={`Editar ${t.name}`}><Pencil className="h-4 w-4" /></Button>
                <button onClick={() => post({ action: 'toggle', id: t.id, active: !t.active })} disabled={busy} className="text-xs text-brand underline">
                  {t.active ? 'inativar' : 'ativar'}
                </button>
                <button
                  onClick={() => { if (confirm(`Excluir o tipo "${t.name}"?\n\nSe ele já estiver em uso por algum colaborador, prefira INATIVAR.`)) void post({ action: 'delete', id: t.id }); }}
                  disabled={busy}
                  className="text-danger"
                  aria-label={`Excluir ${t.name}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ),
        )}
      </div>
    </div>
  );
}

function FormularioDoTipo({
  inicial,
  busy,
  onSalvar,
  onCancelar,
}: {
  inicial?: TemplateRow;
  busy: boolean;
  onSalvar: (dados: Record<string, unknown>) => Promise<boolean | undefined>;
  onCancelar?: () => void;
}) {
  const [name, setName] = useState(inicial?.name ?? '');
  const [work, setWork] = useState(String(inicial?.workDays ?? 6));
  const [off, setOff] = useState(String(inicial?.offDays ?? 1));
  const [start, setStart] = useState(inicial?.startTime ?? '');
  const [pausa, setPausa] = useState(inicial?.breakTime ?? '');
  const [fim, setFim] = useState(inicial?.endTime ?? '');

  const w = Number(work) || 0;
  const o = Number(off) || 0;

  async function salvar() {
    const ok = await onSalvar({ name, workDays: w, offDays: o, startTime: start || null, breakTime: pausa || null, endTime: fim || null });
    if (ok && !inicial) { setName(''); setStart(''); setPausa(''); setFim(''); }
  }

  return (
    <div className={inicial ? 'space-y-2' : 'space-y-2 rounded-lg border border-dashed p-3'}>
      {!inicial && <p className="sgo-type-11 font-semibold text-ink-500">NOVO TIPO DE ESCALA</p>}
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[10rem] flex-1">
          <Label className="text-xs">Nome</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="ex.: 6x1 Tarde" className="h-9 text-sm" />
        </div>
        <div className="w-24">
          <Label className="text-xs">Trabalha</Label>
          <Input inputMode="numeric" value={work} onChange={(e) => setWork(e.target.value)} className="h-9 text-sm" />
        </div>
        <div className="w-24">
          <Label className="text-xs">Folga</Label>
          <Input inputMode="numeric" value={off} onChange={(e) => setOff(e.target.value)} className="h-9 text-sm" />
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="w-28"><Label className="text-xs">Entrada</Label><Input value={start} onChange={(e) => setStart(e.target.value)} placeholder="14:00" className="h-9 text-sm" /></div>
        <div className="w-28"><Label className="text-xs">Intervalo</Label><Input value={pausa} onChange={(e) => setPausa(e.target.value)} placeholder="19:00" className="h-9 text-sm" /></div>
        <div className="w-28"><Label className="text-xs">Saída</Label><Input value={fim} onChange={(e) => setFim(e.target.value)} placeholder="22:17" className="h-9 text-sm" /></div>
        <div className="flex items-center gap-1">
          <Button size="sm" disabled={busy || !name.trim()} onClick={salvar}>
            {inicial ? <><Save className="h-4 w-4" /> Salvar</> : <><Plus className="h-4 w-4" /> Adicionar</>}
          </Button>
          {onCancelar && <Button size="sm" variant="ghost" onClick={onCancelar} aria-label="Cancelar"><X className="h-4 w-4" /></Button>}
        </div>
      </div>

      {/* O resumo mostra o que o gerador VAI fazer, antes de salvar — número de
          ciclo é abstrato, e ver "ciclo de 7 dias" evita o 6x2 digitado sem querer. */}
      <p className="text-[11px] text-ink-500">{resumoDoCiclo(w, o)}</p>
    </div>
  );
}
