'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/ds/field';
import { Select } from '@/components/ui/ds/select';
import { DatePicker } from '@/components/ui/ds/date-picker';
import { StatusBadge, type StatusTone } from '@/components/ui/status-badge';
import type { Criterio } from '@/lib/people/avaliacao-calculo';
import { evolucaoDoCriterio, ROTULO_PLANO, ROTULO_TENDENCIA, type SituacaoPlano, type StatusPlano } from '@/lib/people/avaliacao-painel-calculo';

export interface PlanoUi {
  id: string; yearMonth: string; criterionKey: string | null; criterionLabel: string; action: string; responsibleName: string; dueDate: string;
  status: StatusPlano; situacao: SituacaoPlano; note: string | null; createdByName: string; completedAt: string | null;
}
const TOM: Record<SituacaoPlano, StatusTone> = { PENDING: 'medium', IN_PROGRESS: 'neutral', DONE: 'success', VENCIDO: 'critical' };
const br = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');

/**
 * PLANO DE DESENVOLVIMENTO INDIVIDUAL (v1.162.0) dentro do cartão do
 * colaborador: lista os planos com a situação (vencido é derivado), a
 * EVOLUÇÃO do critério entre a avaliação anterior e a atual, troca de status
 * na linha e o formulário de novo plano (critério do modelo, ação,
 * responsável, prazo).
 */
export function PlanosDeDesenvolvimento({ collaboratorId, evaluationId, yearMonth, criterios, atual, anterior, podePlanejar, meuNome, sugerir }: {
  collaboratorId: string; evaluationId: string | null; yearMonth: string; criterios: Criterio[];
  atual: Record<string, number | null>; anterior: { yearMonth: string; scores: Record<string, number | null> } | null;
  podePlanejar: boolean; meuNome: string; sugerir: boolean;
}) {
  const router = useRouter();
  const [planos, setPlanos] = useState<PlanoUi[] | null>(null);
  const [novo, setNovo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [form, setForm] = useState({ criterionKey: '', action: '', responsibleName: meuNome, dueDate: '', note: '' });

  async function load() {
    const res = await fetch(`/api/people/evaluation/pdi?collaboratorId=${collaboratorId}`);
    if (res.ok) setPlanos((await res.json()).planos);
  }
  useEffect(() => { void load(); }, [collaboratorId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function post(body: Record<string, unknown>): Promise<boolean> {
    setBusy(true); setErro(null);
    try {
      const res = await fetch('/api/people/evaluation/pdi', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setErro(d.error ?? 'Falha'); return false; }
      await load(); router.refresh(); return true;
    } finally { setBusy(false); }
  }

  async function criar() {
    const c = criterios.find((x) => x.key === form.criterionKey);
    if (!c) { setErro('Escolha o critério a melhorar.'); return; }
    const ok = await post({ acao: 'criar', collaboratorId, evaluationId, yearMonth, criterionKey: c.key, criterionLabel: c.label, action: form.action, responsibleName: form.responsibleName, dueDate: form.dueDate, note: form.note });
    if (ok) { setNovo(false); setForm({ criterionKey: '', action: '', responsibleName: meuNome, dueDate: '', note: '' }); }
  }

  return (
    <div className="space-y-2 rounded-md border border-line p-2" data-testid="pdi">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-ink-900">Plano de desenvolvimento</p>
        {podePlanejar && <Button size="sm" variant="outline" disabled={busy} onClick={() => setNovo((v) => !v)}>{novo ? 'Cancelar' : 'Novo plano'}</Button>}
      </div>
      {sugerir && (planos?.length ?? 0) === 0 && !novo && (
        <p className="text-xs text-ink-700">Nota abaixo do esperado: cadastre o que precisa melhorar, a ação ou treinamento, quem acompanha e o prazo. Na avaliação seguinte o SGO mostra se evoluiu.</p>
      )}
      {planos === null && <p className="text-xs text-ink-500">Carregando…</p>}
      {planos?.length === 0 && !sugerir && !novo && <p className="text-xs text-ink-500">Nenhum plano cadastrado.</p>}
      {planos?.map((p) => {
        const ev = evolucaoDoCriterio(p.criterionKey ? anterior?.scores[p.criterionKey] : null, p.criterionKey ? atual[p.criterionKey] : null);
        return (
          <div key={p.id} className="space-y-1 rounded-md bg-canvas p-2 text-sm" data-testid={`plano-${p.id}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold">{p.criterionLabel} <span className="text-xs font-normal text-ink-500">· avaliação {br(p.yearMonth + '-01').slice(3)}</span></span>
              <StatusBadge tone={TOM[p.situacao]}>{ROTULO_PLANO[p.situacao]}</StatusBadge>
            </div>
            <p>{p.action}</p>
            <p className="text-xs text-ink-500">Responsável: {p.responsibleName} · Prazo: {br(p.dueDate)}{p.completedAt ? ` · concluído em ${br(p.completedAt)}` : ''}{p.note ? ` · ${p.note}` : ''}</p>
            {ev.tendencia && (
              <p className="text-xs" data-testid="evolucao">
                Evolução no critério: {ev.antes}★ ({anterior ? br(anterior.yearMonth + '-01').slice(3) : ''}) → {ev.depois}★ (este mês) ·{' '}
                <span className={ev.tendencia === 'MELHOROU' ? 'font-semibold text-success' : ev.tendencia === 'PIOROU' ? 'font-semibold text-danger' : 'text-ink-700'}>{ROTULO_TENDENCIA[ev.tendencia]}</span>
              </p>
            )}
            {!ev.tendencia && anterior && p.criterionKey && atual[p.criterionKey] == null && <p className="text-xs text-ink-500">Evolução aparece quando este mês for avaliado.</p>}
            {podePlanejar && (
              <div className="w-48">
                <Select aria-label="Situação do plano" size="sm" value={p.status} disabled={busy}
                  onValueChange={(v) => post({ acao: 'atualizar', id: p.id, status: v })}
                  options={[{ value: 'PENDING', label: 'Pendente' }, { value: 'IN_PROGRESS', label: 'Em andamento' }, { value: 'DONE', label: 'Concluído' }]} />
              </div>
            )}
          </div>
        );
      })}
      {novo && (
        <div className="space-y-2 rounded-md bg-canvas p-2" data-testid="pdi-form">
          <Select label="Critério que precisa melhorar" size="sm" value={form.criterionKey} onValueChange={(v) => setForm((f) => ({ ...f, criterionKey: v }))} placeholder="Escolher…"
            options={criterios.map((c) => ({ value: c.key, label: `${c.label}${atual[c.key] != null ? ` · ${atual[c.key]}★` : ''}` }))} />
          <Textarea label="Ação corretiva ou treinamento" rows={2} value={form.action} onChange={(e) => setForm((f) => ({ ...f, action: e.target.value }))} maxLength={1000} placeholder="ex.: acompanhar o preparo com o cozinheiro-chefe por 2 semanas; refazer o POP de porcionamento" />
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <label className="text-xs text-ink-500">Responsável pelo acompanhamento</label>
              <Input value={form.responsibleName} onChange={(e) => setForm((f) => ({ ...f, responsibleName: e.target.value }))} className="h-9 text-sm" maxLength={120} />
            </div>
            <DatePicker label="Prazo" size="sm" value={form.dueDate || null} onValueChange={(v) => setForm((f) => ({ ...f, dueDate: v ?? '' }))} />
          </div>
          <Input value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} className="h-9 text-sm" placeholder="Observação (opcional)" maxLength={1000} />
          <Button size="sm" variant="gold" disabled={busy} onClick={criar}>Salvar plano</Button>
        </div>
      )}
      {erro && <p className="text-xs text-danger" data-testid="pdi-erro">{erro}</p>}
    </div>
  );
}

/** A Supervisão pede revisão; o avaliador vê o motivo até salvar de novo. */
export function RevisaoDaAvaliacao({ evaluationId, revisao, podeRevisar }: {
  evaluationId: string; revisao: { porNome: string; em: string; motivo: string; resolvidaEm: string | null } | null; podeRevisar: boolean;
}) {
  const router = useRouter();
  const [abrir, setAbrir] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const aberta = !!revisao && !revisao.resolvidaEm;

  async function pedir() {
    setBusy(true); setErro(null);
    try {
      const res = await fetch('/api/people/evaluation/revisao', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ evaluationId, reason: motivo }) });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setErro(d.error ?? 'Falha'); return; }
      setAbrir(false); setMotivo(''); router.refresh();
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-1" data-testid="revisao">
      {aberta && (
        <p className="rounded-md bg-warning-bg p-2 text-xs text-ink-900" data-testid="revisao-aberta">
          <b>Revisão pedida por {revisao!.porNome}</b> em {br(revisao!.em)}: {revisao!.motivo}. Reveja as notas e salve de novo para encerrar a revisão.
        </p>
      )}
      {revisao?.resolvidaEm && <p className="text-xs text-ink-500">Revisão de {revisao.porNome} ({br(revisao.em)}) atendida em {br(revisao.resolvidaEm)}.</p>}
      {podeRevisar && !aberta && !abrir && <Button size="sm" variant="outline" onClick={() => setAbrir(true)}>Solicitar revisão</Button>}
      {abrir && (
        <div className="space-y-1 rounded-md bg-canvas p-2">
          <Textarea rows={2} label="Motivo da revisão" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={500} placeholder="ex.: a nota de pontualidade não bate com as faltas registradas na Escala" />
          <div className="flex gap-1.5">
            <Button size="sm" variant="gold" disabled={busy || !motivo.trim()} onClick={pedir}>Enviar ao avaliador</Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => setAbrir(false)}>Cancelar</Button>
          </div>
          {erro && <p className="text-xs text-danger">{erro}</p>}
        </div>
      )}
    </div>
  );
}
