'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarPlus, Clock, Trash2, TriangleAlert, UserX } from 'lucide-react';
import { Select } from '@/components/ui/ds/select';
import { DatePicker } from '@/components/ui/ds/date-picker';
import { TimePicker } from '@/components/ui/ds/time-picker';
import { Sheet } from '@/components/ui/ds/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EmptyState } from '@/components/ui/ds/empty-state';
import { StatusBadge } from '@/components/ui/ds/status-badge';
import { CELULA_SIGLA, CELULA_TITULO, type GradeDeGerentes, type CelulaDoGerente, type LinhaDaGrade } from '@/lib/manager-schedule-central';

const WD_CURTO = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const WD_LONGO = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

const fmtBR = (iso: string) => iso.split('-').reverse().join('/');

/* A cor diz o mesmo que a sigla — quem lê a grade de longe enxerga o padrão
   antes de ler letra por letra. */
const CELULA_CLASSE: Record<CelulaDoGerente, string> = {
  TRABALHA: 'bg-success/15 text-success',
  FOLGA: 'bg-brand/20 text-brand',
  FERIAS: 'bg-info/20 text-info',
  FORA_DO_PADRAO: 'text-ink-400',
  SEM_HORARIO: 'bg-sunken text-ink-400',
};

export function ManagerScheduleClient({
  grade,
  units,
  podeEditar,
}: {
  grade: GradeDeGerentes;
  units: { id: string; name: string }[];
  /** Só a Supervisão/Administração lança. Sem isto, a tela é de consulta. */
  podeEditar: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [horarioDe, setHorarioDe] = useState<LinhaDaGrade | null>(null);
  const [folgaDe, setFolgaDe] = useState<LinhaDaGrade | null>(null);

  function irPara(p: { unit?: string; ano?: number; mes?: number }) {
    const q = new URLSearchParams({
      unit: p.unit ?? grade.unitId,
      ano: String(p.ano ?? grade.year),
      mes: String(p.mes ?? grade.month),
    });
    router.push(`/modulos/escala-gerentes?${q.toString()}`);
  }

  async function post(body: Record<string, unknown>): Promise<boolean> {
    setBusy(true); setErro(null);
    try {
      const res = await fetch('/api/manager-schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) { router.refresh(); return true; }
      const d = await res.json().catch(() => ({}));
      setErro(d.error ?? 'Não foi possível gravar.');
      return false;
    } finally { setBusy(false); }
  }

  const anos = [grade.year - 1, grade.year, grade.year + 1];

  return (
    <div className="space-y-4">
      {/* ── Filtros ── */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 print:hidden">
        <Select
          label="Unidade" size="sm" value={grade.unitId}
          onValueChange={(v) => irPara({ unit: v })}
          options={units.map((u) => ({ value: u.id, label: u.name }))}
        />
        <Select
          label="Mês" size="sm" value={String(grade.month)}
          onValueChange={(v) => irPara({ mes: Number(v) })}
          options={MESES.map((m, i) => ({ value: String(i + 1), label: m }))}
        />
        <Select
          label="Ano" size="sm" value={String(grade.year)}
          onValueChange={(v) => irPara({ ano: Number(v) })}
          options={anos.map((a) => ({ value: String(a), label: String(a) }))}
        />
      </div>

      {/* ── Avisos que mudam a leitura da grade ── */}
      {grade.diasSemGerente > 0 && (
        <p className="flex items-start gap-2 rounded-lg border border-danger/40 bg-danger/10 p-2 text-sm text-danger">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <b>{grade.diasSemGerente} dia(s) sem nenhum gerente</b> em {grade.unitName} neste mês — as colunas em vermelho.
            Realoque um reserva ou ajuste uma folga.
          </span>
        </p>
      )}
      {grade.semHorarioCount > 0 && (
        <p className="flex items-start gap-2 rounded-lg border border-line-strong bg-sunken p-2 text-sm text-ink-700">
          <UserX className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {grade.semHorarioCount} gerente(s) <b>sem horário cadastrado</b>. Enquanto o horário não for lançado, o sistema
            não conta essa pessoa como cobertura — a linha fica com <b>?</b> e o dia pode aparecer como sem gerente.
          </span>
        </p>
      )}

      {/* ── Legenda ── */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 rounded-lg border border-dashed p-2 text-xs text-ink-700">
        {(['TRABALHA', 'FOLGA', 'FERIAS', 'FORA_DO_PADRAO', 'SEM_HORARIO'] as CelulaDoGerente[]).map((c) => (
          <span key={c} className="flex items-center gap-1.5">
            <i className={`inline-flex h-5 w-6 items-center justify-center rounded text-[11px] font-bold ${CELULA_CLASSE[c]}`}>{CELULA_SIGLA[c]}</i>
            {CELULA_TITULO[c]}
          </span>
        ))}
      </div>

      {/* ── A grade ── */}
      {grade.linhas.length === 0 ? (
        <EmptyState
          icon={UserX}
          title="Nenhum gerente nesta unidade"
          description="Vincule um usuário com perfil Gerente ou Coordenador à unidade em Configurações → Usuários."
        />
      ) : (
        /* A grade rola SOZINHA na horizontal: um mês de 31 colunas não cabe no
           celular, e deixar a página inteira rolar para o lado esconde os
           filtros e o aviso de dia sem gerente. */
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-center text-xs">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-surface px-2 py-1 text-left font-semibold text-ink-700">Gerente</th>
                {grade.dias.map((d) => (
                  <th
                    key={d.iso}
                    title={d.semGerente ? 'Nenhum gerente neste dia' : undefined}
                    className={`min-w-7 px-0.5 py-1 font-semibold ${d.semGerente ? 'bg-danger/15 text-danger' : 'text-ink-500'}`}
                  >
                    <span className="block tabular-nums">{d.day}</span>
                    <span className="block text-[10px] font-normal">{WD_CURTO[d.weekday]}</span>
                  </th>
                ))}
                <th className="px-2 py-1 font-semibold text-ink-700">T/F/FE</th>
              </tr>
            </thead>
            <tbody>
              {grade.linhas.map((l) => (
                <tr key={l.userId} className="border-t border-line">
                  <th scope="row" className="sticky left-0 z-10 max-w-44 truncate bg-surface px-2 py-1 text-left font-medium text-ink-900">
                    {l.name}
                    <span className="block text-[10px] font-normal text-ink-500">
                      {l.temHorario
                        ? `${l.weekdays.map((w) => WD_CURTO[w]).join('')}${l.startTime || l.endTime ? ` · ${l.startTime ?? ''}–${l.endTime ?? ''}` : ''}`
                        : 'sem horário'}
                    </span>
                  </th>
                  {l.dias.map((c, i) => (
                    <td key={i} className="px-0.5 py-1">
                      <span
                        title={`${CELULA_TITULO[c]} — ${fmtBR(grade.dias[i].iso)}`}
                        className={`inline-flex h-6 w-6 items-center justify-center rounded font-bold ${CELULA_CLASSE[c]}`}
                      >
                        {CELULA_SIGLA[c]}
                      </span>
                    </td>
                  ))}
                  <td className="whitespace-nowrap px-2 py-1 tabular-nums text-ink-700">
                    {l.diasTrabalhados}/{l.diasDeFolga}/{l.diasDeFerias}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Cadastro (só quem pode lançar) ── */}
      {podeEditar && grade.linhas.length > 0 && (
        <div className="space-y-2 print:hidden">
          <p className="text-sm font-semibold text-ink-900">Cadastro</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {grade.linhas.map((l) => (
              <div key={l.userId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-surface p-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink-900">{l.name}</p>
                  <p className="text-[11px] text-ink-500">
                    {l.temHorario ? l.weekdays.map((w) => WD_LONGO[w].slice(0, 3)).join(', ') : 'Sem horário cadastrado'}
                    {l.startTime || l.endTime ? ` · ${l.startTime ?? ''}–${l.endTime ?? ''}` : ''}
                  </p>
                </div>
                <div className="flex gap-1.5">
                  <Button size="sm" variant="outline" onClick={() => { setErro(null); setHorarioDe(l); }}>
                    <Clock className="h-4 w-4" /> Horário
                  </Button>
                  <Button size="sm" onClick={() => { setErro(null); setFolgaDe(l); }}>
                    <CalendarPlus className="h-4 w-4" /> Folga / férias
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Lançamentos do mês ── */}
      <div className="space-y-2">
        <p className="text-sm font-semibold text-ink-900">Folgas e férias lançadas em {MESES[grade.month - 1]}</p>
        {grade.lancamentos.length === 0 ? (
          <p className="text-sm text-ink-500">Nenhum lançamento neste mês.</p>
        ) : (
          <ul className="divide-y divide-line rounded-lg border">
            {grade.lancamentos.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink-900">
                    {l.managerName}{' '}
                    <StatusBadge tone={l.kind === 'FERIAS' ? 'info' : 'neutral'} dot>
                      {l.kind === 'FERIAS' ? 'Férias' : 'Folga'}
                    </StatusBadge>
                  </p>
                  <p className="text-[11px] text-ink-500">
                    {l.startDate === l.endDate ? fmtBR(l.startDate) : `${fmtBR(l.startDate)} a ${fmtBR(l.endDate)}`}
                    {l.note ? ` · ${l.note}` : ''}
                    {/* Quem lançou importa: a agenda é de um e o lançamento é de
                        outro, e sem o nome ninguém consegue conferir. */}
                    {l.lancadoPor ? ` · lançado por ${l.lancadoPor}` : ' · lançado pelo próprio gerente'}
                  </p>
                </div>
                {podeEditar && (
                  <Button
                    size="sm" variant="outline" disabled={busy}
                    onClick={() => { if (confirm(`Apagar ${l.kind === 'FERIAS' ? 'as férias' : 'a folga'} de ${l.managerName}?`)) void post({ action: 'deleteFolga', id: l.id }); }}
                  >
                    <Trash2 className="h-4 w-4" /> Apagar
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {erro && !horarioDe && !folgaDe && <p className="text-sm font-medium text-danger">{erro}</p>}

      {horarioDe && (
        <FolhaDeHorario
          linha={horarioDe} busy={busy} erro={erro}
          onFechar={() => setHorarioDe(null)}
          onSalvar={async (p) => { if (await post({ action: 'setHorario', userId: horarioDe.userId, ...p })) setHorarioDe(null); }}
        />
      )}
      {folgaDe && (
        <FolhaDeFolga
          linha={folgaDe} busy={busy} erro={erro}
          onFechar={() => setFolgaDe(null)}
          onSalvar={async (p) => { if (await post({ action: 'addFolga', userId: folgaDe.userId, ...p })) setFolgaDe(null); }}
        />
      )}
    </div>
  );
}

/** Padrão semanal de trabalho de um gerente. */
function FolhaDeHorario({
  linha, busy, erro, onFechar, onSalvar,
}: {
  linha: LinhaDaGrade; busy: boolean; erro: string | null;
  onFechar: () => void;
  onSalvar: (p: { weekdays: number[]; startTime: string | null; endTime: string | null; note: string | null }) => void;
}) {
  const [dias, setDias] = useState<number[]>(linha.weekdays);
  const [inicio, setInicio] = useState(linha.startTime ?? '');
  const [fim, setFim] = useState(linha.endTime ?? '');
  const [obs, setObs] = useState(linha.note ?? '');
  const alterna = (d: number) => setDias((s) => (s.includes(d) ? s.filter((x) => x !== d) : [...s, d].sort((a, b) => a - b)));

  return (
    <Sheet
      open onClose={onFechar}
      title={`Horário de ${linha.name}`}
      description="Os dias marcados são os que ele trabalha. Os demais aparecem na grade como fora do padrão."
      footer={
        <div className="space-y-2">
          {erro && <p className="text-sm font-medium text-danger">{erro}</p>}
          <Button size="sm" disabled={busy} onClick={() => onSalvar({ weekdays: dias, startTime: inicio || null, endTime: fim || null, note: obs || null })}>
            {busy ? 'Salvando…' : 'Salvar horário'}
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <div>
          <Label className="text-xs">Dias de trabalho</Label>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            {WD_LONGO.map((w, i) => (
              <button
                key={i} type="button" onClick={() => alterna(i)}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${dias.includes(i) ? 'border-brand bg-brand text-on-brand' : 'text-ink-500'}`}
              >
                {w.slice(0, 3)}
              </button>
            ))}
            <button type="button" onClick={() => setDias([0, 1, 2, 3, 4, 5, 6])} className="rounded-full border border-dashed px-3 py-1.5 text-xs font-semibold text-brand">
              Todos os dias
            </button>
          </div>
          {dias.length === 0 && (
            <p className="mt-1 text-[11px] text-ink-500">
              Sem nenhum dia marcado o gerente sai da conta de cobertura e a grade dele fica com <b>?</b>.
            </p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <TimePicker label="Entrada" size="sm" value={inicio || null} onValueChange={(v) => setInicio(v ?? '')} />
          <TimePicker label="Saída" size="sm" value={fim || null} onValueChange={(v) => setFim(v ?? '')} />
        </div>
        <div>
          <Label className="text-xs">Observação (opcional)</Label>
          <Input value={obs} onChange={(e) => setObs(e.target.value)} className="h-9 text-sm" />
        </div>
      </div>
    </Sheet>
  );
}

/** Lançamento de folga ou férias para um gerente. */
function FolhaDeFolga({
  linha, busy, erro, onFechar, onSalvar,
}: {
  linha: LinhaDaGrade; busy: boolean; erro: string | null;
  onFechar: () => void;
  onSalvar: (p: { kind: string; startDate: string; endDate: string; note: string | null }) => void;
}) {
  const [tipo, setTipo] = useState('FOLGA');
  const [inicio, setInicio] = useState<string | null>(null);
  const [fim, setFim] = useState<string | null>(null);
  const [obs, setObs] = useState('');
  const [local, setLocal] = useState<string | null>(null);

  function salvar() {
    setLocal(null);
    if (!inicio) { setLocal('Informe o dia de início.'); return; }
    const ate = fim ?? inicio;
    if (ate < inicio) { setLocal('O fim não pode ser antes do início.'); return; }
    onSalvar({ kind: tipo, startDate: inicio, endDate: ate, note: obs || null });
  }

  return (
    <Sheet
      open onClose={onFechar}
      title={`Folga / férias de ${linha.name}`}
      description="O gerente é avisado do lançamento. Nesses dias os checklists somem da tela dele."
      footer={
        <div className="space-y-2">
          {(local ?? erro) && <p className="text-sm font-medium text-danger">{local ?? erro}</p>}
          <Button size="sm" disabled={busy} onClick={salvar}>{busy ? 'Lançando…' : 'Lançar'}</Button>
        </div>
      }
    >
      <div className="space-y-3">
        <Select
          label="Tipo" size="sm" value={tipo} onValueChange={setTipo}
          options={[{ value: 'FOLGA', label: 'Folga' }, { value: 'FERIAS', label: 'Férias' }]}
        />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <DatePicker label="Início" size="sm" value={inicio} onValueChange={setInicio} />
          {/* Um dia só é o caso comum: deixar o fim em branco repete o início em
              vez de obrigar a digitar a mesma data duas vezes. */}
          <DatePicker label="Fim (vazio = um dia só)" size="sm" value={fim} onValueChange={setFim} min={inicio ?? undefined} />
        </div>
        <div>
          <Label className="text-xs">Observação (opcional)</Label>
          <Input value={obs} onChange={(e) => setObs(e.target.value)} className="h-9 text-sm" />
        </div>
      </div>
    </Sheet>
  );
}
