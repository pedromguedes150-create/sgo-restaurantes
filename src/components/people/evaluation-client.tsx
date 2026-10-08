'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronRight, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SegmentedControl } from '@/components/ui/ds/segmented-control';
import { Input } from '@/components/ui/input';
import { SearchField, Textarea } from '@/components/ui/ds/field';
import { StatusBadge, type StatusTone } from '@/components/ui/status-badge';
import { postAdmin } from '@/lib/admin-client';
import { cn } from '@/lib/utils';
import { Select } from '@/components/ui/ds/select';
import { shortUnitName } from '@/lib/unit-name';
import { PlanosDeDesenvolvimento, RevisaoDaAvaliacao } from '@/components/people/pdi-revisao';
import {
  calcularNota, fmtNota, pesosEfetivos, validarRespostas, NOTA_BAIXA, PESO_ESPECIFICOS, PESO_GERAIS, ROTULO_CLASSIFICACAO, ROTULO_MOTIVO, ROTULO_NOTA,
  type Classificacao, type Criterio, type MotivoSemAvaliar, type Resposta, type RespostaGravada,
} from '@/lib/people/avaliacao-calculo';

export interface EvalRow {
  collaboratorId: string; name: string; jobTitle: string | null; unitId: string; unitName: string; observationCount: number;
  modelo: { id: string; name: string; managerial: boolean; version: number; criterios: Criterio[] } | null;
  permissao: { pode: boolean; motivo: MotivoSemAvaliar | null };
  ferias: boolean;
  evaluation: {
    id: string;
    nota: number | null; classificacao: Classificacao | null; respostas: RespostaGravada[];
    legado: { punctuality: number; performance: number; teamwork: number; presentation: number } | null;
    modelName: string | null; modelVersion: number | null; comments: string | null; evaluatorName: string; updatedAt: string;
    revisao: { porNome: string; em: string; motivo: string; resolvidaEm: string | null } | null;
  } | null;
  anterior: { yearMonth: string; nota: number | null; scores: Record<string, number | null> } | null;
  planos: { abertos: number; vencidos: number };
}
interface Obs { id: string; text: string; authorName: string; createdAt: string }
interface Hist { yearMonth: string; nota: number | null; classificacao: Classificacao | null; modelName: string | null; legado: unknown; comments: string | null; evaluatorName: string }
interface Evidencias {
  escala: { trabalhou: number; folgas: number; faltasInjustificadas: number; faltasJustificadas: number; atrasos: number; ferias: number } | null;
  setor: string | null;
  treinamentos: { concluidos: number; pendentes: number; atrasados: number };
  checklists: number;
  observacoes: { text: string; authorName: string; createdAt: string }[];
}

const LEGADO: { key: 'punctuality' | 'performance' | 'teamwork' | 'presentation'; label: string }[] = [
  { key: 'punctuality', label: 'Pontualidade' },
  { key: 'performance', label: 'Desempenho' },
  { key: 'teamwork', label: 'Trabalho em equipe' },
  { key: 'presentation', label: 'Apresentação/higiene' },
];
const TOM: Record<Classificacao, StatusTone> = { EXCELENTE: 'success', BOM: 'success', REGULAR: 'medium', MELHORAR: 'critical' };
const fmtMonth = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
};
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Avaliação do colaborador por FUNÇÃO (v1.161.0): 8 critérios do modelo do
 * cargo (4 gerais 40% + 4 específicos 60%), N/A com justificativa, nota ao
 * vivo pela MESMA conta do servidor (`calcularNota`). Quem pode avaliar quem
 * vem do servidor em `permissao` — a tela só mostra o motivo.
 */
export function EvaluationClient({ rows, yearMonth, months, isAdmin, weight, semCpf, podeRevisar = false, podePlanejar = false, meuNome = '' }: {
  rows: EvalRow[]; yearMonth: string; months: string[]; isAdmin: boolean; weight: number; semCpf: boolean;
  /** Supervisão: pode pedir revisão de uma avaliação (v1.162.0). */
  podeRevisar?: boolean;
  /** Quem avalia: cadastra e acompanha planos de desenvolvimento (v1.162.0). */
  podePlanejar?: boolean;
  meuNome?: string;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<'PENDING' | 'ALL'>('PENDING');
  const [unitFilter, setUnitFilter] = useState('ALL');
  const [busca, setBusca] = useState('');
  const [busy, setBusy] = useState(false);
  const [w, setW] = useState(String(weight));

  const unitOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of rows) if (r.unitId) map.set(r.unitId, r.unitName);
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'));
  }, [rows]);
  const inUnit = useMemo(() => rows.filter((r) => unitFilter === 'ALL' || r.unitId === unitFilter), [rows, unitFilter]);
  const shown = useMemo(() => {
    const q = norm(busca.trim());
    return inUnit.filter((r) => (filter === 'ALL' || !r.evaluation) && (!q || norm(r.name).includes(q) || norm(r.jobTitle ?? '').includes(q)));
  }, [inUnit, filter, busca]);
  const done = inUnit.filter((r) => r.evaluation).length;
  const semModelo = inUnit.filter((r) => !r.modelo).length;

  async function saveWeight() {
    setBusy(true);
    const r = await postAdmin({ entity: 'evaluation', action: 'setWeight', weight: Number(w) });
    setBusy(false);
    if (r.ok) router.refresh(); else alert(r.error ?? 'Falha');
  }

  return (
    <div className="space-y-3">
      {isAdmin && (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed p-2">
          <div>
            <label className="text-xs text-ink-500">Peso das Avaliações na meta (0 = não conta)</label>
            <Input inputMode="numeric" value={w} onChange={(e) => setW(e.target.value)} className="h-9 w-24 text-sm" />
          </div>
          <Button size="sm" variant="outline" disabled={busy} onClick={saveWeight}>Salvar peso</Button>
          <a href="/configuracoes/avaliacao" className="ml-auto text-xs font-semibold text-brand">Modelos por função →</a>
        </div>
      )}
      {semCpf && (
        <p className="rounded-md bg-canvas p-2 text-xs text-ink-700" data-testid="aviso-sem-cpf">
          Cadastre seu CPF em <a href="/perfil" className="font-semibold text-brand">Meu Perfil</a> para o SGO reconhecer você na lista (ninguém avalia a si próprio).
        </p>
      )}
      {semModelo > 0 && (
        <p className="rounded-md bg-warning-bg p-2 text-xs text-ink-900" data-testid="aviso-sem-modelo">
          {semModelo} colaborador(es) com função sem modelo de avaliação.{' '}
          {isAdmin ? <a href="/configuracoes/avaliacao" className="font-semibold text-brand">Vincular o cargo a um modelo →</a> : 'O Administrador vincula o cargo em Configurações → Avaliação por função.'}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="w-56">
          <Select
            aria-label="Mês" size="sm" className="capitalize" value={yearMonth}
            onValueChange={(v) => router.push(`/modulos/pessoas/avaliacao?mes=${v}`)}
            options={months.map((m) => ({ value: m, label: fmtMonth(m) }))}
          />
        </div>
        {unitOptions.length > 1 && (
          <div className="w-56">
            <Select
              aria-label="Filtrar por unidade" size="sm" value={unitFilter} onValueChange={setUnitFilter}
              options={[{ value: 'ALL', label: 'Todas as unidades' }, ...unitOptions.map(([id, name]) => ({ value: id, label: shortUnitName(name) }))]}
            />
          </div>
        )}
        <div className="w-56">
          <SearchField aria-label="Buscar colaborador" inputSize="sm" value={busca} onValueChange={setBusca} placeholder="Nome ou função…" />
        </div>
        <SegmentedControl
          aria-label="Filtro de avaliações"
          size="sm"
          value={filter}
          onValueChange={setFilter}
          options={[{ value: 'PENDING', label: 'A avaliar' }, { value: 'ALL', label: 'Todos' }]}
        />
        <span className="ml-auto text-xs text-ink-500">{done}/{inUnit.length} avaliado(s)</span>
      </div>

      {shown.length === 0 && (
        <p className="text-sm text-ink-500">{busca ? 'Ninguém com esse nome ou função.' : filter === 'PENDING' ? 'Todos os colaboradores do mês já foram avaliados. 🎉' : 'Nenhum colaborador no seu escopo.'}</p>
      )}
      <div className="space-y-2">
        {shown.map((r) => <EvalCard key={r.collaboratorId} r={r} yearMonth={yearMonth} podeRevisar={podeRevisar} podePlanejar={podePlanejar} meuNome={meuNome} />)}
      </div>
    </div>
  );
}

export function Stars({ value, onChange, disabled, size = 'md' }: { value: number; onChange?: (v: number) => void; disabled?: boolean; size?: 'sm' | 'md' }) {
  return (
    <div className="flex gap-0.5" role={onChange ? 'radiogroup' : undefined}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n} type="button" disabled={disabled || !onChange}
          onClick={() => onChange?.(n)}
          className={cn('rounded p-0.5', onChange && !disabled ? 'cursor-pointer' : 'cursor-default')}
          aria-label={`${n} de 5 — ${ROTULO_NOTA[n as 1 | 2 | 3 | 4 | 5]}`}
          title={ROTULO_NOTA[n as 1 | 2 | 3 | 4 | 5]}
        >
          <Star className={cn(size === 'sm' ? 'h-4 w-4' : 'h-6 w-6', n <= value ? 'fill-brand text-brand' : 'text-ink-400')} />
        </button>
      ))}
    </div>
  );
}

export function NotaBadge({ nota, classificacao }: { nota: number | null; classificacao: Classificacao | null }) {
  if (nota == null) return <StatusBadge tone="medium">A avaliar</StatusBadge>;
  return <StatusBadge tone={classificacao ? TOM[classificacao] : 'success'}>{fmtNota(nota)}★{classificacao ? ` · ${ROTULO_CLASSIFICACAO[classificacao]}` : ''}</StatusBadge>;
}

type Rascunho = Record<string, { score: number | null | undefined; justification: string }>;
function rascunhoInicial(r: EvalRow): Rascunho {
  const out: Rascunho = {};
  const gravadas = new Map((r.evaluation?.respostas ?? []).map((x) => [x.key, x]));
  for (const c of r.modelo?.criterios ?? []) {
    const g = gravadas.get(c.key);
    out[c.key] = { score: g ? g.score : undefined, justification: g?.justification ?? '' };
  }
  return out;
}

function EvalCard({ r, yearMonth, podeRevisar, podePlanejar, meuNome }: { r: EvalRow; yearMonth: string; podeRevisar: boolean; podePlanejar: boolean; meuNome: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'AVALIAR' | 'APOIO' | 'OBS' | 'HIST'>('AVALIAR');
  const [busy, setBusy] = useState(false);
  const [erros, setErros] = useState<string[]>([]);
  const [rascunho, setRascunho] = useState<Rascunho>(() => rascunhoInicial(r));
  const [comments, setComments] = useState(r.evaluation?.comments ?? '');
  const [obs, setObs] = useState<Obs[] | null>(null);
  const [newObs, setNewObs] = useState('');
  const [hist, setHist] = useState<Hist[] | null>(null);
  const [apoio, setApoio] = useState<Evidencias | null | 'erro'>(null);

  useEffect(() => { setRascunho(rascunhoInicial(r)); setComments(r.evaluation?.comments ?? ''); }, [r]);

  const criterios = useMemo(() => r.modelo?.criterios ?? [], [r.modelo]);
  const respostas: Resposta[] = useMemo(() => criterios.map((c) => ({ key: c.key, score: rascunho[c.key]?.score, justification: rascunho[c.key]?.justification })) as Resposta[], [criterios, rascunho]);
  const previa = useMemo(() => calcularNota(criterios, respostas.filter((x) => x.score !== undefined)), [criterios, respostas]);
  const pesos = useMemo(() => pesosEfetivos(criterios, respostas.filter((x) => x.score !== undefined)), [criterios, respostas]);
  const temNA = respostas.some((x) => x.score === null);
  const podeEditar = r.permissao.pode;

  async function loadObs() {
    const res = await fetch(`/api/people/evaluation?collaboratorId=${r.collaboratorId}`);
    if (res.ok) setObs((await res.json()).observations);
  }
  async function loadHist() {
    const res = await fetch(`/api/people/evaluation?collaboratorId=${r.collaboratorId}&view=history`);
    if (res.ok) setHist((await res.json()).history);
  }
  async function loadApoio() {
    const res = await fetch(`/api/people/evaluation?collaboratorId=${r.collaboratorId}&view=evidencias&mes=${yearMonth}`);
    if (res.ok) setApoio((await res.json()).evidencias ?? 'erro'); else setApoio('erro');
  }

  async function saveEval() {
    const v = validarRespostas(criterios, respostas);
    if (!v.ok) { setErros(v.erros); return; }
    setErros([]);
    setBusy(true);
    try {
      const res = await fetch('/api/people/evaluation', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'evaluate', collaboratorId: r.collaboratorId, yearMonth, respostas, comments }),
      });
      if (res.ok) router.refresh();
      else { const d = await res.json().catch(() => ({})); setErros(d.erros?.length ? d.erros : [d.error ?? 'Falha']); }
    } finally { setBusy(false); }
  }

  async function addObs() {
    const t = newObs.trim();
    if (!t) return;
    setBusy(true);
    try {
      const res = await fetch('/api/people/evaluation', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'observe', collaboratorId: r.collaboratorId, text: t }),
      });
      if (res.ok) { setNewObs(''); await loadObs(); router.refresh(); }
      else { const d = await res.json().catch(() => ({})); alert(d.error ?? 'Falha'); }
    } finally { setBusy(false); }
  }

  const setScore = (key: string, score: number | null) => setRascunho((s) => ({ ...s, [key]: { score, justification: s[key]?.justification ?? '' } }));
  const setJust = (key: string, justification: string) => setRascunho((s) => ({ ...s, [key]: { score: s[key]?.score, justification } }));

  return (
    <div className="rounded-lg border bg-surface" data-testid={`colab-${r.collaboratorId}`}>
      <button onClick={() => setOpen(!open)} className="flex w-full items-center justify-between gap-2 p-3 text-left">
        <span className="flex min-w-0 items-center gap-2">
          {open ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
          <span className="min-w-0">
            <span className="block truncate font-semibold text-ink-900">{r.name}</span>
            <span className="block truncate text-xs text-ink-500">{r.jobTitle || 'Sem função'} · {r.unitName}{r.modelo ? ` · modelo ${r.modelo.name}` : ''}</span>
          </span>
        </span>
        <span className="flex shrink-0 flex-wrap items-center justify-end gap-1">
          {r.ferias && <StatusBadge tone="neutral">Férias</StatusBadge>}
          {!r.modelo && <StatusBadge tone="critical">Sem modelo</StatusBadge>}
          {r.modelo?.managerial && <StatusBadge tone="neutral">Gerencial</StatusBadge>}
          {r.observationCount > 0 && <span className="text-xs text-ink-500">{r.observationCount} obs.</span>}
          {r.planos.vencidos > 0 && <StatusBadge tone="critical">Plano vencido</StatusBadge>}
          {r.planos.vencidos === 0 && r.planos.abertos > 0 && <StatusBadge tone="neutral">Plano em aberto</StatusBadge>}
          {r.evaluation?.revisao && !r.evaluation.revisao.resolvidaEm && <StatusBadge tone="medium">Revisão pedida</StatusBadge>}
          {r.evaluation ? <NotaBadge nota={r.evaluation.nota} classificacao={r.evaluation.classificacao} /> : <StatusBadge tone="medium">A avaliar</StatusBadge>}
        </span>
      </button>

      {open && (
        <div className="border-t p-3">
          <div className="mb-3">
            <SegmentedControl
              aria-label="Seções do colaborador"
              size="sm"
              value={tab}
              onValueChange={(t) => {
                setTab(t);
                if (t === 'OBS' && obs === null) void loadObs();
                if (t === 'HIST' && hist === null) void loadHist();
                if (t === 'APOIO' && apoio === null) void loadApoio();
              }}
              options={[{ value: 'AVALIAR', label: 'Avaliação' }, { value: 'APOIO', label: 'Apoio do mês' }, { value: 'OBS', label: 'Observações' }, { value: 'HIST', label: 'Histórico' }]}
            />
          </div>

          {tab === 'AVALIAR' && (
            <div className="space-y-3">
              {r.evaluation?.revisao && !r.evaluation.revisao.resolvidaEm && (
                <RevisaoDaAvaliacao evaluationId={r.evaluation.id} revisao={r.evaluation.revisao} podeRevisar={false} />
              )}
              {!podeEditar && r.permissao.motivo && (
                <p className="rounded-md bg-canvas p-2 text-xs text-ink-700" data-testid="motivo-sem-avaliar">{ROTULO_MOTIVO[r.permissao.motivo]}</p>
              )}
              {r.evaluation?.legado && (
                <div className="space-y-1 rounded-md bg-canvas p-2">
                  <p className="text-xs text-ink-500">Avaliação no formato anterior (4 critérios, sem peso). Para reavaliar pelo modelo da função, preencha os critérios abaixo.</p>
                  {LEGADO.map((c) => (
                    <div key={c.key} className="flex items-center justify-between gap-2 text-sm"><span>{c.label}</span><Stars value={r.evaluation!.legado![c.key]} size="sm" /></div>
                  ))}
                </div>
              )}
              {r.modelo && (
                <>
                  <Grupo titulo={`Critérios gerais · ${PESO_GERAIS}%`} criterios={criterios.filter((c) => c.group === 'GERAL')} rascunho={rascunho} pesos={pesos} temNA={temNA} podeEditar={podeEditar} busy={busy} setScore={setScore} setJust={setJust} />
                  <Grupo titulo={`Critérios da função (${r.modelo.name}) · ${PESO_ESPECIFICOS}%`} criterios={criterios.filter((c) => c.group === 'ESPECIFICO')} rascunho={rascunho} pesos={pesos} temNA={temNA} podeEditar={podeEditar} busy={busy} setScore={setScore} setJust={setJust} />
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-canvas p-2" data-testid="nota-previa">
                    <span className="text-sm">Nota final <span className="text-xs text-ink-500">(média ponderada{temNA ? ', pesos redistribuídos pelos N/A' : ''})</span></span>
                    <span className="flex items-center gap-2">
                      <span className="text-lg font-semibold tabular-nums text-ink-900">{fmtNota(previa.nota)}</span>
                      {previa.classificacao && <StatusBadge tone={TOM[previa.classificacao]}>{ROTULO_CLASSIFICACAO[previa.classificacao]}</StatusBadge>}
                    </span>
                  </div>
                  {previa.nota != null && previa.nota < NOTA_BAIXA && (
                    <p className="text-xs text-ink-700">Desempenho abaixo do esperado: combine com a pessoa o que melhorar e registre no comentário do mês.</p>
                  )}
                  <Input value={comments} onChange={(e) => setComments(e.target.value)} placeholder="Comentário do mês (opcional)" className="text-sm" disabled={!podeEditar || busy} maxLength={2000} />
                </>
              )}
              {erros.length > 0 && (
                <ul className="list-disc space-y-0.5 rounded-md bg-danger-bg p-2 pl-6 text-xs text-danger" data-testid="erros-avaliacao">
                  {erros.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              )}
              {r.evaluation && (
                <p className="text-xs text-ink-500">
                  Avaliado por {r.evaluation.evaluatorName} em {new Date(r.evaluation.updatedAt).toLocaleDateString('pt-BR')}
                  {r.evaluation.modelName ? ` · modelo ${r.evaluation.modelName}${r.evaluation.modelVersion ? ` v${r.evaluation.modelVersion}` : ''}` : ''}.
                </p>
              )}
              {podeEditar && r.modelo && (
                <Button size="sm" variant="gold" disabled={busy} onClick={saveEval}>{r.evaluation ? 'Atualizar avaliação' : 'Salvar avaliação'}</Button>
              )}
              {r.evaluation && (podeRevisar || r.evaluation.revisao?.resolvidaEm) && (!r.evaluation.revisao || r.evaluation.revisao.resolvidaEm) && (
                <RevisaoDaAvaliacao evaluationId={r.evaluation.id} revisao={r.evaluation.revisao} podeRevisar={podeRevisar} />
              )}
              {(podePlanejar || r.planos.abertos > 0) && r.modelo && (
                <PlanosDeDesenvolvimento
                  collaboratorId={r.collaboratorId} evaluationId={r.evaluation?.id ?? null} yearMonth={yearMonth} criterios={criterios}
                  atual={Object.fromEntries((r.evaluation?.respostas ?? []).map((x) => [x.key, x.score]))}
                  anterior={r.anterior ? { yearMonth: r.anterior.yearMonth, scores: r.anterior.scores } : null}
                  podePlanejar={podePlanejar} meuNome={meuNome}
                  sugerir={r.evaluation?.nota != null && r.evaluation.nota < NOTA_BAIXA}
                />
              )}
            </div>
          )}

          {tab === 'APOIO' && (
            <div className="space-y-2 text-sm">
              <p className="text-xs text-ink-500">O que o SGO registrou no mês, para apoiar a sua leitura. Nada aqui desconta nota: atestado, desperdício da unidade e checklist não preenchido não entram.</p>
              {apoio === null && <p className="text-xs text-ink-500">Carregando…</p>}
              {apoio === 'erro' && <p className="text-xs text-danger">Não foi possível carregar.</p>}
              {apoio && apoio !== 'erro' && (
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="rounded-md bg-canvas p-2">
                    <p className="text-xs font-semibold text-ink-700">Escala do mês</p>
                    {apoio.escala
                      ? <p>{apoio.escala.trabalhou} dia(s) trabalhado(s) · {apoio.escala.folgas} folga(s) · {apoio.escala.atrasos} atraso(s) · {apoio.escala.faltasInjustificadas} falta(s) sem justificativa · {apoio.escala.faltasJustificadas} justificada(s){apoio.escala.ferias ? ` · ${apoio.escala.ferias} dia(s) de férias` : ''}</p>
                      : <p className="text-ink-500">Sem registro no Realizado da Escala.</p>}
                  </div>
                  <div className="rounded-md bg-canvas p-2">
                    <p className="text-xs font-semibold text-ink-700">Mapa de funções</p>
                    <p>{apoio.setor ? `Setor: ${apoio.setor}` : <span className="text-ink-500">Sem setor alocado.</span>}</p>
                  </div>
                  <div className="rounded-md bg-canvas p-2">
                    <p className="text-xs font-semibold text-ink-700">Treinamentos (POPs)</p>
                    <p>{apoio.treinamentos.concluidos} concluído(s) no mês · {apoio.treinamentos.pendentes} pendente(s) · {apoio.treinamentos.atrasados} atrasado(s)</p>
                  </div>
                  <div className="rounded-md bg-canvas p-2">
                    <p className="text-xs font-semibold text-ink-700">Checklists preenchidos por ele(a)</p>
                    <p>{apoio.checklists} no mês</p>
                  </div>
                  <div className="rounded-md bg-canvas p-2 sm:col-span-2">
                    <p className="text-xs font-semibold text-ink-700">Observações do mês</p>
                    {apoio.observacoes.length === 0 && <p className="text-ink-500">Nenhuma.</p>}
                    {apoio.observacoes.map((o, i) => <p key={i}>• {o.text} <span className="text-xs text-ink-500">({o.authorName}, {new Date(o.createdAt).toLocaleDateString('pt-BR')})</span></p>)}
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === 'OBS' && (
            <div className="space-y-2">
              {r.permissao.motivo !== 'PERFIL' && (
                <div className="flex gap-1.5">
                  <Input value={newObs} onChange={(e) => setNewObs(e.target.value)} placeholder="Nova observação (ex.: chegou atrasado, ajudou no salão…)" className="text-sm" />
                  <Button size="sm" variant="outline" disabled={busy || !newObs.trim()} onClick={addObs}>Anotar</Button>
                </div>
              )}
              {obs === null && <p className="text-xs text-ink-500">Carregando…</p>}
              {obs?.length === 0 && <p className="text-sm text-ink-500">Nenhuma observação registrada.</p>}
              {obs?.map((o) => (
                <div key={o.id} className="rounded-md bg-canvas p-2">
                  <p className="text-sm">{o.text}</p>
                  <p className="mt-0.5 text-xs text-ink-500">{o.authorName} · {new Date(o.createdAt).toLocaleDateString('pt-BR')}</p>
                </div>
              ))}
            </div>
          )}

          {tab === 'HIST' && (
            <div className="space-y-1.5">
              {hist === null && <p className="text-xs text-ink-500">Carregando…</p>}
              {hist?.length === 0 && <p className="text-sm text-ink-500">Sem avaliações anteriores.</p>}
              {hist?.map((h) => (
                <div key={h.yearMonth} className="flex items-center justify-between gap-2 rounded-md bg-canvas p-2 text-sm">
                  <span className="min-w-0">
                    <span className="block capitalize">{fmtMonth(h.yearMonth)}</span>
                    <span className="block truncate text-xs text-ink-500">{h.evaluatorName}{h.modelName ? ` · ${h.modelName}` : ' · formato anterior'}{h.comments ? ` · ${h.comments}` : ''}</span>
                  </span>
                  <NotaBadge nota={h.nota} classificacao={h.classificacao} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Grupo({ titulo, criterios, rascunho, pesos, temNA, podeEditar, busy, setScore, setJust }: {
  titulo: string; criterios: Criterio[]; rascunho: Rascunho; pesos: Record<string, number>; temNA: boolean; podeEditar: boolean; busy: boolean;
  setScore: (key: string, score: number | null) => void; setJust: (key: string, j: string) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="sgo-type-11 font-semibold text-ink-500">{titulo}</p>
      {criterios.map((c) => {
        const r = rascunho[c.key] ?? { score: undefined, justification: '' };
        const na = r.score === null;
        const pedeJust = na || (typeof r.score === 'number' && r.score <= 2);
        return (
          <div key={c.key} className="space-y-1" data-testid={`criterio-${c.key}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm">
                {c.label} <span className="text-xs text-ink-500">· {c.weight}%{temNA && !na && pesos[c.key] !== c.weight ? ` → ${pesos[c.key].toLocaleString('pt-BR')}%` : ''}</span>
              </span>
              <span className="flex items-center gap-2">
                <Stars value={na ? 0 : (r.score ?? 0)} onChange={podeEditar ? (v) => setScore(c.key, v) : undefined} disabled={busy || na} />
                {podeEditar && (
                  <button type="button" disabled={busy} onClick={() => setScore(c.key, na ? undefined as unknown as number : null)}
                    className={cn('rounded-pill border px-2 py-0.5 text-xs font-semibold', na ? 'border-brand/40 bg-brand-tint text-brand' : 'border-line text-ink-500 hover:bg-canvas')}
                    aria-pressed={na} title="Não se aplica a esta pessoa neste mês">
                    N/A
                  </button>
                )}
              </span>
            </div>
            {typeof r.score === 'number' && <p className="text-xs text-ink-500">{ROTULO_NOTA[r.score as 1 | 2 | 3 | 4 | 5]}</p>}
            {pedeJust && (
              <Textarea rows={2} value={r.justification} onChange={(e) => setJust(c.key, e.target.value)} disabled={!podeEditar || busy} maxLength={500}
                placeholder={na ? 'Por que não se aplica? (obrigatório)' : 'Justifique a nota (obrigatório para 1 e 2)'} aria-label={`Justificativa: ${c.label}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}
