'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, CalendarOff, TriangleAlert, UserX, Users, CalendarDays, Palmtree, FileText } from 'lucide-react';
import { Select } from '@/components/ui/ds/select';
import { SegmentedControl } from '@/components/ui/ds/segmented-control';
import { StatCard } from '@/components/ui/ds/stat-card';
import { EmptyState } from '@/components/ui/ds/empty-state';
import { Button } from '@/components/ui/ds/button';
import { cn } from '@/lib/utils';
/* Do núcleo PURO (sem import): a mesma conta da tela, do PDF e da visão da rede. */
import {
  DIA_ABREV, DIA_CURTO, DIA_LONGO, MESES, ROTULO, SIGLA, PERIODOS,
  ausenciasPorDia, ddmm, ddmmaaaa, intervaloDoPeriodo, mesAnterior, mesSeguinte, montarGrade,
  resumoDaUnidade, semFolgaHa7Dias,
  type DiaComAusencias, type GerenteCru, type MarcaDoDia, type Periodo, type TipoDeAusencia,
} from '@/lib/controle-gerentes';

/* A cor diz o mesmo que a sigla: bordô para folga (a marca), azul para férias. */
const MARCA_CLASSE: Record<TipoDeAusencia, string> = {
  FOLGA: 'bg-brand/15 text-brand',
  FERIAS: 'bg-info/15 text-info',
};

interface Props {
  units: { id: string; name: string }[];
  unitId: string;
  unitName: string;
  year: number;
  month: number;
  hoje: string;
  /** Gerentes DESTA unidade, com as ausências do mês e da semana de hoje/próxima. */
  gerentes: GerenteCru[];
}

export function ControleGerentesClient({ units, unitId, unitName, year, month, hoje, gerentes }: Props) {
  const router = useRouter();
  const [periodo, setPeriodo] = useState<Periodo>('semana');
  const [modo, setModo] = useState<'grade' | 'calendario'>('grade');
  const [diaAberto, setDiaAberto] = useState<string | null>(null);

  const grade = useMemo(() => montarGrade(gerentes, year, month), [gerentes, year, month]);
  const resumo = useMemo(() => resumoDaUnidade(gerentes, year, month, hoje), [gerentes, year, month, hoje]);
  const semFolga = useMemo(() => semFolgaHa7Dias(gerentes, hoje), [gerentes, hoje]);
  const intervalo = intervaloDoPeriodo(periodo, hoje, year, month);
  const diasDoPeriodo = useMemo(() => ausenciasPorDia(gerentes, intervalo.de, intervalo.ate), [gerentes, intervalo.de, intervalo.ate]);
  const diasDoMes = useMemo(() => ausenciasPorDia(gerentes, grade.dias[0].iso, grade.dias[grade.dias.length - 1].iso), [gerentes, grade.dias]);
  const diasSemGerente = grade.dias.filter((d) => d.semGerente).length;
  const semHorario = gerentes.filter((g) => g.weekdays.length === 0).length;

  const ant = mesAnterior(year, month);
  const seg = mesSeguinte(year, month);

  function irPara(p: { unit?: string; year?: number; month?: number }) {
    const q = new URLSearchParams({ unit: p.unit ?? unitId, ano: String(p.year ?? year), mes: String(p.month ?? month) });
    setDiaAberto(null);
    router.push(`/modulos/folgas-equipe?${q.toString()}`);
  }

  /* Mês/ano num seletor só: 12 meses para trás e 6 para frente cobrem conferir o
     passado e planejar o próximo trimestre. */
  const opcoesDeMes = useMemo(() => {
    const out: { value: string; label: string }[] = [];
    let cur = { year, month };
    for (let i = 0; i < 12; i++) cur = mesAnterior(cur.year, cur.month);
    for (let i = 0; i < 19; i++) {
      out.push({ value: `${cur.year}-${cur.month}`, label: `${MESES[cur.month - 1]}/${cur.year}` });
      cur = mesSeguinte(cur.year, cur.month);
    }
    return out;
  }, [year, month]);

  const diaSelecionado = diaAberto ? diasDoMes.find((d) => d.iso === diaAberto) ?? null : null;

  return (
    <div className="space-y-4">
      {/* ── Unidade + mês ── */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">
        <Select
          label="Unidade" size="sm" value={unitId}
          onValueChange={(v) => irPara({ unit: v })}
          options={units.map((u) => ({ value: u.id, label: u.name }))}
        />
        <div className="flex items-end gap-1">
          <Button size="sm" variant="secondary" aria-label={`Mês anterior (${MESES[ant.month - 1]})`} onClick={() => irPara(ant)}>
            <ChevronLeft className="h-4 w-4" /> <span className="hidden sm:inline">{MESES[ant.month - 1]}</span>
          </Button>
          <Select
            label="Mês/Ano" size="sm" value={`${year}-${month}`}
            onValueChange={(v) => { const [a, m] = v.split('-').map(Number); irPara({ year: a, month: m }); }}
            options={opcoesDeMes}
            className="min-w-40"
          />
          <Button size="sm" variant="secondary" aria-label={`Próximo mês (${MESES[seg.month - 1]})`} onClick={() => irPara(seg)}>
            <span className="hidden sm:inline">{MESES[seg.month - 1]}</span> <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <p className="sgo-type-17 font-semibold text-ink-900">{unitName} · <span className="capitalize">{MESES[month - 1]}</span>/{year}</p>

      {/* ── Resumo ── */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatCard label="Gerentes ativos" value={resumo.gerentesAtivos} icon={Users} />
        <StatCard label="Folgas no mês" value={resumo.folgasNoMes} hint="dias de folga" icon={CalendarDays} />
        <StatCard label="Folgas nesta semana" value={resumo.folgasNaSemana} hint="seg a dom" icon={CalendarOff} />
        <StatCard label="Férias" value={resumo.gerentesDeFerias} hint="gerente(s) no mês" icon={Palmtree} />
      </div>

      {/* ── Avisos que mudam a leitura (mesmas regras de sempre) ── */}
      {diasSemGerente > 0 && (
        <p className="flex items-start gap-2 rounded-lg border border-danger/40 bg-danger/10 p-2 text-sm text-danger">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span><b>{diasSemGerente} dia(s) sem nenhum gerente</b> nesta unidade no mês — marcados em vermelho na grade e no calendário.</span>
        </p>
      )}
      {semFolga.length > 0 && (
        <p className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning-bg p-2 text-sm text-warning">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Sem folga lançada nos últimos 7 dias: <b>{semFolga.join(', ')}</b>.</span>
        </p>
      )}
      {semHorario > 0 && (
        <p className="flex items-start gap-2 rounded-lg border border-line-strong bg-sunken p-2 text-xs text-ink-700">
          <UserX className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{semHorario} gerente(s) sem horário cadastrado — não entram na conta de “dia sem gerente”. O horário é lançado na Escala de gerentes.</span>
        </p>
      )}

      {gerentes.length === 0 ? (
        <EmptyState
          icon={UserX}
          title="Nenhum gerente nesta unidade"
          description="Vincule um usuário com perfil Gerente ou Coordenador à unidade em Configurações → Usuários."
        />
      ) : (
        <>
          {/* ── Quem está de folga ── */}
          <section className="space-y-2 rounded-card border border-line bg-surface p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="sgo-type-13 font-semibold text-ink-900">Quem está de folga</p>
              <SegmentedControl<Periodo> aria-label="Período" size="sm" value={periodo} onValueChange={setPeriodo} options={PERIODOS} />
            </div>
            <ListaPorDia dias={diasDoPeriodo} soComAusencia={periodo === 'mes'} hoje={hoje} />
          </section>

          {/* ── Escala do mês ── */}
          <section className="space-y-3 rounded-card border border-line bg-surface p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="sgo-type-13 font-semibold text-ink-900">Escala do mês</p>
              <SegmentedControl<'grade' | 'calendario'>
                aria-label="Formato" size="sm" value={modo} onValueChange={(v) => { setModo(v); setDiaAberto(null); }}
                options={[{ value: 'grade', label: 'Grade' }, { value: 'calendario', label: 'Calendário' }]}
              />
            </div>
            <Legenda />
            {modo === 'grade'
              ? <GradeMensal grade={grade} hoje={hoje} />
              : <CalendarioMensal dias={diasDoMes} year={year} month={month} hoje={hoje} aberto={diaAberto} onAbrir={setDiaAberto} />}
            {modo === 'calendario' && diaSelecionado && <DetalheDoDia dia={diaSelecionado} unitName={unitName} />}
            {modo === 'calendario' && <CoberturaPorHorario gerentes={gerentes} />}
          </section>
        </>
      )}

      <RelatorioPdf units={units} unitId={unitId} year={year} month={month} />
    </div>
  );
}

function Legenda() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-700">
      {(['FOLGA', 'FERIAS'] as TipoDeAusencia[]).map((k) => (
        <span key={k} className="flex items-center gap-1.5">
          <i className={cn('inline-flex h-5 w-6 items-center justify-center rounded text-[11px] font-bold not-italic', MARCA_CLASSE[k])}>{SIGLA[k]}</i>
          {ROTULO[k]}
        </span>
      ))}
      <span className="flex items-center gap-1.5"><i className="inline-flex h-5 w-6 items-center justify-center rounded text-[11px] not-italic text-ink-400">–</i> Sem folga</span>
      <span className="flex items-center gap-1.5"><i className="inline-block h-3 w-3 rounded bg-danger/30" /> Dia sem gerente</span>
    </div>
  );
}

/** A principal ferramenta de conferência: um gerente por linha, um dia por coluna. */
function GradeMensal({ grade, hoje }: { grade: ReturnType<typeof montarGrade>; hoje: string }) {
  return (
    /* A grade rola SOZINHA na horizontal: 31 colunas não cabem no celular, e a
       página inteira rolando para o lado esconderia o resto da tela. */
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-center text-xs">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-surface px-2 py-1 text-left font-semibold text-ink-700">Gerente</th>
            {grade.dias.map((d) => (
              <th
                key={d.iso}
                title={d.semGerente ? 'Nenhum gerente neste dia' : undefined}
                className={cn(
                  'min-w-7 px-0.5 py-1 font-semibold',
                  d.semGerente ? 'bg-danger/15 text-danger' : d.weekday === 0 || d.weekday === 6 ? 'text-ink-700' : 'text-ink-500',
                  d.iso === hoje && 'ring-2 ring-inset ring-brand',
                )}
              >
                <span className="block tabular-nums">{String(d.day).padStart(2, '0')}</span>
                <span className="block text-[10px] font-normal">{DIA_CURTO[d.weekday]}</span>
              </th>
            ))}
            <th className="whitespace-nowrap px-2 py-1 font-semibold text-ink-700" title="Folgas / Férias no mês">F / FE</th>
          </tr>
        </thead>
        <tbody>
          {grade.linhas.map((l) => (
            <tr key={l.userId} className="border-t border-line">
              <th scope="row" className="sticky left-0 z-10 max-w-44 truncate bg-surface px-2 py-1 text-left font-medium text-ink-900">
                {l.name}
                <span className="block truncate text-[10px] font-normal text-ink-500">{l.horario}</span>
              </th>
              {l.dias.map((m, i) => <Celula key={i} marca={m} titulo={`${l.name} — ${ddmmaaaa(grade.dias[i].iso)}`} />)}
              <td className="whitespace-nowrap px-2 py-1 tabular-nums text-ink-700">{l.folgas} / {l.ferias}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Celula({ marca, titulo }: { marca: MarcaDoDia; titulo: string }) {
  return (
    <td className="px-0.5 py-1">
      <span
        title={marca ? `${ROTULO[marca]} — ${titulo}` : titulo}
        className={cn('inline-flex h-6 w-6 items-center justify-center rounded font-bold', marca ? MARCA_CLASSE[marca] : 'font-normal text-ink-400')}
      >
        {marca ? SIGLA[marca] : '–'}
      </span>
    </td>
  );
}

/** Dia a dia, compacto: "SEG 28 · Grazieli — Folga". */
function ListaPorDia({ dias, soComAusencia, hoje }: { dias: DiaComAusencias[]; soComAusencia: boolean; hoje: string }) {
  const lista = soComAusencia ? dias.filter((d) => d.ausentes.length > 0) : dias;
  if (lista.length === 0) return <p className="text-sm text-ink-500">Nenhuma folga ou férias no mês.</p>;
  return (
    <ul className="divide-y divide-line">
      {lista.map((d) => (
        <li key={d.iso} className="flex items-start gap-3 py-1.5">
          <span className={cn('w-16 shrink-0 text-xs font-semibold tabular-nums', d.iso === hoje ? 'text-brand' : 'text-ink-700')}>
            {DIA_ABREV[d.weekday]} {ddmm(d.iso)}
            {d.iso === hoje && <span className="block text-[10px] font-normal">hoje</span>}
          </span>
          <span className="flex min-w-0 flex-1 flex-wrap gap-1">
            {d.ausentes.length === 0 && <span className="text-sm text-ink-500">Nenhuma folga</span>}
            {d.ausentes.map((a) => (
              <span key={a.userId} className={cn('rounded-pill px-2 py-0.5 text-xs font-semibold', MARCA_CLASSE[a.kind])} title={a.note ?? undefined}>
                {a.name} — {ROTULO[a.kind]}
              </span>
            ))}
            {d.semGerente && <span className="rounded-pill bg-danger/10 px-2 py-0.5 text-xs font-semibold text-danger">sem gerente</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

function primeiroNome(n: string) { return n.trim().split(/\s+/)[0]; }

/** Calendário do mês: clique no dia para ver quem está de folga. */
function CalendarioMensal({ dias, year, month, hoje, aberto, onAbrir }: {
  dias: DiaComAusencias[]; year: number; month: number; hoje: string; aberto: string | null; onAbrir: (iso: string | null) => void;
}) {
  const brancos = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  return (
    <div className="grid grid-cols-7 gap-1 text-center">
      {DIA_CURTO.map((w, i) => <div key={i} className="sgo-type-11 font-semibold text-ink-500">{w}</div>)}
      {Array.from({ length: brancos }).map((_, i) => <div key={`b${i}`} />)}
      {dias.map((d) => (
        <button
          key={d.iso}
          type="button"
          aria-pressed={aberto === d.iso}
          aria-label={`${ddmmaaaa(d.iso)}: ${d.ausentes.length ? d.ausentes.map((a) => `${a.name} ${ROTULO[a.kind]}`).join(', ') : 'nenhuma folga'}`}
          onClick={() => onAbrir(aberto === d.iso ? null : d.iso)}
          className={cn(
            'min-h-12 rounded border px-0.5 py-0.5 text-left text-xs transition-colors hover:border-brand',
            d.semGerente ? 'border-danger/50 bg-danger/10' : 'border-line bg-canvas',
            aberto === d.iso && 'ring-2 ring-brand',
          )}
        >
          <span className={cn('block px-0.5 font-semibold tabular-nums', d.iso === hoje ? 'text-brand' : 'text-ink-700')}>{d.day}</span>
          {d.ausentes.slice(0, 3).map((a) => (
            <span key={a.userId} className={cn('mt-0.5 block truncate rounded px-0.5 text-[10px] font-semibold leading-tight', MARCA_CLASSE[a.kind])}>
              {primeiroNome(a.name)}
            </span>
          ))}
          {d.ausentes.length > 3 && <span className="block px-0.5 text-[10px] text-ink-500">+{d.ausentes.length - 3}</span>}
        </button>
      ))}
    </div>
  );
}

function DetalheDoDia({ dia, unitName }: { dia: DiaComAusencias; unitName: string }) {
  return (
    <div className="rounded-lg border border-brand/30 bg-brand/5 p-3 text-sm">
      <p className="font-semibold text-ink-900">{DIA_LONGO[dia.weekday]}, {ddmmaaaa(dia.iso)} · {unitName}</p>
      {dia.ausentes.length === 0 && <p className="mt-1 text-ink-500">Nenhum gerente de folga ou férias neste dia.</p>}
      <ul className="mt-1 space-y-0.5">
        {dia.ausentes.map((a) => (
          <li key={a.userId}>
            <b className="text-ink-900">{a.name}</b> — Status: <span className={a.kind === 'FERIAS' ? 'text-info' : 'text-brand'}>{ROTULO[a.kind]}</span>
            {a.note && <span className="text-xs text-ink-500"> · {a.note}</span>}
          </li>
        ))}
      </ul>
      {dia.semGerente && <p className="mt-1 font-semibold text-danger">Nenhum gerente trabalhando nesta unidade neste dia.</p>}
    </div>
  );
}

function hora(t: string | null): number | null { if (!t) return null; const m = /^(\d{1,2}):/.exec(t); return m ? Number(m[1]) : null; }

/**
 * Cobertura por horário no padrão semanal — a grade que já existia no
 * calendário antigo, mantida recolhida para não pesar a tela.
 */
function CoberturaPorHorario({ gerentes }: { gerentes: GerenteCru[] }) {
  const comHorario = gerentes.filter((g) => g.weekdays.length > 0);
  if (comHorario.length === 0) return null;
  let min = 24; let max = 0; let diaTodo = false;
  for (const g of comHorario) {
    const s = hora(g.startTime); const e = hora(g.endTime);
    if (s == null || e == null) { diaTodo = true; continue; }
    min = Math.min(min, s); max = Math.max(max, e);
  }
  if (diaTodo || min >= max) { min = Math.min(min === 24 ? 8 : min, 8); max = Math.max(max, 23); }
  const horas = Array.from({ length: max - min }, (_, i) => min + i);
  const quem = (wd: number, h: number) => comHorario
    .filter((g) => g.weekdays.includes(wd) && (() => { const s = hora(g.startTime); const e = hora(g.endTime); return s == null || e == null || (h >= s && h < e); })())
    .map((g) => primeiroNome(g.name));
  return (
    <details className="rounded-lg border border-line p-2">
      <summary className="cursor-pointer text-xs font-semibold text-brand">Cobertura por horário (padrão semanal)</summary>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full border-collapse text-center text-[10px]">
          <thead>
            <tr>
              <th className="sticky left-0 bg-surface p-1 text-ink-500">hora</th>
              {DIA_ABREV.map((w, i) => <th key={i} className="p-1 font-semibold text-ink-500">{w}</th>)}
            </tr>
          </thead>
          <tbody>
            {horas.map((h) => (
              <tr key={h}>
                <td className="sticky left-0 bg-surface p-1 font-mono text-ink-500">{String(h).padStart(2, '0')}h</td>
                {DIA_ABREV.map((_, wd) => {
                  const nomes = quem(wd, h);
                  return <td key={wd} className={cn('border border-line p-1', nomes.length ? 'bg-success/15 text-success' : 'bg-danger/10 text-danger')}>{nomes.length ? nomes.join(', ') : '—'}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

/** Escala mensal em PDF para a diretoria: uma unidade ou todas, cada uma no seu quadro. */
function RelatorioPdf({ units, unitId, year, month }: { units: { id: string; name: string }[]; unitId: string; year: number; month: number }) {
  const [alvo, setAlvo] = useState<string>(unitId);
  const href = `/modulos/folgas-equipe/relatorio?ano=${year}&mes=${month}&unit=${encodeURIComponent(alvo)}&imprimir=1`;
  return (
    <section className="flex flex-wrap items-end gap-2 rounded-card border border-dashed border-line-strong p-3">
      <div className="min-w-56 flex-1">
        <Select
          label={`Escala mensal em PDF — ${MESES[month - 1]}/${year}`} size="sm" value={alvo} onValueChange={setAlvo}
          options={[{ value: 'todas', label: 'Todas as unidades (um quadro por unidade)' }, ...units.map((u) => ({ value: u.id, label: u.name }))]}
        />
      </div>
      <a href={href} target="_blank" rel="noreferrer" className="sgo-control inline-flex h-9 items-center gap-1 rounded-control bg-brand px-3 text-sm font-semibold text-on-brand hover:bg-brand-hover">
        <FileText className="h-4 w-4" /> Gerar escala mensal PDF
      </a>
    </section>
  );
}
