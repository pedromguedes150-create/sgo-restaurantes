'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarPlus, Pencil, Save, Trash2, X } from 'lucide-react';
import { Select } from '@/components/ui/ds/select';
import { DatePicker } from '@/components/ui/ds/date-picker';
import { Card, CardContent, PanelHeader } from '@/components/sgo/panel';
import { SgoModal } from '@/components/sgo/sgo-modal';

/**
 * PERÍODOS DE FÉRIAS (v1.159.0) — a aba onde se lança "de 01/10 a 30/10",
 * porque a API do RH diz só que a pessoa ESTÁ de férias, sem início nem fim.
 * O lançamento entra na mesma tabela que a Escala e o Controle de Férias já
 * leem; a lista mostra também o que o RH abriu e o que foi solicitado.
 */
const br = (iso: string) => iso.split('-').reverse().join('/');
const dias = (a: string, b: string) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86_400_000) + 1;

export interface PeriodoUI {
  id: string; collaboratorId: string; colaborador: string; unidade: string;
  inicio: string; fim: string; dias: number; origem: 'RH' | 'SGO' | 'SOLICITADA'; status: string; nota: string | null;
  emGozo: boolean; futura: boolean;
}
export interface ColabUI { id: string; nome: string; hint: string }

const ORIGEM: Record<PeriodoUI['origem'], { txt: string; cls: string; dica: string }> = {
  RH: { txt: 'Aberto pelo RH', cls: 'sgo-tag--amber', dica: 'A sincronização viu "Férias" no RH e abriu este período a partir daquele dia; o fim cresce um dia por vez. Edite para fixar o período real.' },
  SGO: { txt: 'Lançado aqui', cls: 'sgo-tag--green', dica: 'Período informado pela unidade.' },
  SOLICITADA: { txt: 'Solicitada ao RH', cls: 'sgo-tag--blue', dica: 'Pedido feito pelo gerente em Pessoas → Férias; ainda não conta na Escala.' },
};

async function enviar(body: Record<string, unknown>): Promise<{ erro: string | null; substituiuRh?: number; confirmouSolicitada?: boolean }> {
  const res = await fetch('/api/people/vacations/periodo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const d = await res.json().catch(() => ({}));
  if (res.ok) return { erro: null, substituiuRh: d.substituiuRh, confirmouSolicitada: d.confirmouSolicitada };
  return { erro: d.error ?? 'Não foi possível salvar.' };
}

const inputCls = 'h-10 w-full rounded-control border border-line bg-surface px-3 text-sm text-ink-900 outline-none focus:border-brand';

export function PeriodosFerias({ colaboradores, periodos, podeEditar, colaboradorInicial, unitId }: {
  colaboradores: ColabUI[]; periodos: PeriodoUI[]; podeEditar: boolean; colaboradorInicial?: string | null; unitId?: string | null;
}) {
  const router = useRouter();
  const [colab, setColab] = useState(colaboradorInicial && colaboradores.some((c) => c.id === colaboradorInicial) ? colaboradorInicial : '');
  const [inicio, setInicio] = useState<string | null>(null);
  const [fim, setFim] = useState<string | null>(null);
  const [nota, setNota] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [editando, setEditando] = useState<PeriodoUI | null>(null);
  const [excluindo, setExcluindo] = useState<PeriodoUI | null>(null);
  const total = inicio && fim && fim >= inicio ? dias(inicio, fim) : 0;

  async function lancar() {
    if (!colab || !inicio || !fim) { setMsg({ ok: false, t: 'Escolha o colaborador, o início e o fim.' }); return; }
    setBusy(true); setMsg(null);
    const r = await enviar({ acao: 'lancar', collaboratorId: colab, startDate: inicio, endDate: fim, note: nota, unitId });
    setBusy(false);
    if (r.erro) { setMsg({ ok: false, t: r.erro }); return; }
    const extra = r.substituiuRh ? ` O período aberto pelo RH foi substituído.` : r.confirmouSolicitada ? ' A solicitação ao RH foi confirmada com estas datas.' : '';
    setMsg({ ok: true, t: `Férias lançadas: ${br(inicio)} a ${br(fim)} (${total} dias). A Escala e o Controle de Férias já refletem.${extra}` });
    setInicio(null); setFim(null); setNota('');
    router.refresh();
  }

  async function excluir() {
    if (!excluindo) return;
    setBusy(true);
    const r = await enviar({ acao: 'excluir', id: excluindo.id });
    setBusy(false); setExcluindo(null);
    setMsg(r.erro ? { ok: false, t: r.erro } : { ok: true, t: 'Período excluído.' });
    router.refresh();
  }

  const nomeDoColab = colaboradores.find((c) => c.id === colab)?.nome;

  return (
    <div className="space-y-4" data-testid="periodos-ferias">
      {podeEditar && (
        <Card>
          <PanelHeader title="Lançar período de férias" />
          <CardContent>
            <p className="mb-3 text-sm text-ink-700">O RH informa só que a pessoa está de férias — o início e o fim você lança aqui. Entra na Escala (FE) e no Controle de Férias na hora.</p>
            <div className="grid gap-3 md:grid-cols-[1.4fr_1fr_1fr_1.4fr_auto] md:items-end">
              <div>
                <span className="sgo-label mb-1 block">Colaborador</span>
                <Select aria-label="Colaborador" searchable placeholder="Selecione…" value={colab} onValueChange={setColab}
                  options={colaboradores.map((c) => ({ value: c.id, label: c.nome, hint: c.hint }))} />
              </div>
              <DatePicker label="Início" value={inicio} onValueChange={setInicio} />
              <DatePicker label="Fim (último dia)" value={fim} onValueChange={setFim} min={inicio ?? undefined} />
              <label className="block">
                <span className="sgo-label mb-1 block">Observação (opcional)</span>
                <input value={nota} onChange={(e) => setNota(e.target.value)} maxLength={200} placeholder="Ex.: aviso de férias do RH" className={inputCls} aria-label="Observação" />
              </label>
              <button type="button" className="sgo-btn sgo-btn--primary" disabled={busy || !colab || !inicio || !fim} onClick={() => void lancar()} data-testid="lancar-ferias">
                <CalendarPlus className="h-4 w-4" /> Lançar{total ? ` ${total} dias` : ''}
              </button>
            </div>
            {nomeDoColab && total > 0 && <p className="mt-2 text-xs text-ink-500">{nomeDoColab}: {br(inicio!)} a {br(fim!)} · {total} dia(s) corridos.</p>}
            {msg && <p className={`mt-2 text-sm font-medium ${msg.ok ? 'text-success' : 'text-danger'}`} role="status" data-testid="msg-ferias">{msg.t}</p>}
            <p className="mt-2 text-xs text-ink-500">
              Se já houver um período aberto pela sincronização do RH para a pessoa, ele é substituído pelo que você lançar. Se o RH continuar dizendo
              “Férias” depois do fim lançado, a sincronização abre um período novo a partir daquele dia — nesse caso, peça ao RH para atualizar o status.
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <PanelHeader title="Períodos de férias" />
        <CardContent className="overflow-x-auto p-0">
          <p className="px-4 pt-3 text-xs text-ink-500">Últimos 12 meses e futuros, no seu alcance. Em gozo = cobre o dia de hoje.</p>
          {periodos.length === 0 ? (
            <p className="px-4 py-6 text-sm text-ink-500">Nenhum período de férias lançado no alcance.</p>
          ) : (
            <table className="sgo-tbl w-full text-sm">
              <thead>
                <tr><th>Colaborador</th><th>Unidade</th><th>Período</th><th className="text-right">Dias</th><th>Origem</th><th>Situação</th><th>Observação</th>{podeEditar && <th aria-label="Ações" />}</tr>
              </thead>
              <tbody>
                {periodos.map((p) => (
                  <tr key={p.id} data-testid={`periodo-${p.id}`}>
                    <td className="font-medium text-ink-900">{p.colaborador}</td>
                    <td className="text-ink-700">{p.unidade}</td>
                    <td className="tabular-nums">{br(p.inicio)} a {br(p.fim)}</td>
                    <td className="text-right tabular-nums">{p.dias}</td>
                    <td><span className={`sgo-tag ${ORIGEM[p.origem].cls}`} title={ORIGEM[p.origem].dica}>{ORIGEM[p.origem].txt}</span></td>
                    <td>{p.emGozo ? <span className="sgo-tag sgo-tag--green">Em gozo</span> : p.futura ? <span className="sgo-tag sgo-tag--blue">Programada</span> : <span className="text-xs text-ink-500">Encerrada</span>}</td>
                    <td className="max-w-56 truncate text-xs text-ink-700" title={p.nota ?? ''}>{p.nota ?? '—'}</td>
                    {podeEditar && (
                      <td className="whitespace-nowrap text-right">
                        <button type="button" className="sgo-btn sgo-btn--sm sgo-btn--ghost" onClick={() => setEditando(p)} aria-label={`Editar férias de ${p.colaborador}`} data-testid={`editar-${p.id}`}><Pencil className="h-3.5 w-3.5" /> Editar</button>
                        <button type="button" className="sgo-btn sgo-btn--sm sgo-btn--ghost text-danger" onClick={() => setExcluindo(p)} aria-label={`Excluir férias de ${p.colaborador}`}><Trash2 className="h-3.5 w-3.5" /></button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {editando && <EditarPeriodo p={editando} onClose={() => setEditando(null)} onSaved={(t) => { setEditando(null); setMsg({ ok: true, t }); router.refresh(); }} />}

      <SgoModal open={Boolean(excluindo)} onClose={() => setExcluindo(null)} title="Excluir período de férias" tone="red" size="sm"
        footer={<><button type="button" className="sgo-btn" onClick={() => setExcluindo(null)}>Cancelar</button><button type="button" className="sgo-btn sgo-btn--danger" disabled={busy} onClick={() => void excluir()} data-testid="confirmar-excluir">Excluir</button></>}>
        {excluindo && <p className="text-sm text-ink-700">Excluir as férias de <b>{excluindo.colaborador}</b> de {br(excluindo.inicio)} a {br(excluindo.fim)}? Os dias deixam de contar como FE na Escala e como gozados no Controle de Férias.</p>}
      </SgoModal>
    </div>
  );
}

function EditarPeriodo({ p, onClose, onSaved }: { p: PeriodoUI; onClose: () => void; onSaved: (t: string) => void }) {
  const [inicio, setInicio] = useState<string | null>(p.inicio);
  const [fim, setFim] = useState<string | null>(p.fim);
  const [nota, setNota] = useState(p.nota ?? '');
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const total = inicio && fim && fim >= inicio ? dias(inicio, fim) : 0;

  async function salvar() {
    if (!inicio || !fim) { setErro('Informe início e fim.'); return; }
    setBusy(true); setErro(null);
    const r = await enviar({ acao: 'editar', id: p.id, startDate: inicio, endDate: fim, note: nota });
    setBusy(false);
    if (r.erro) { setErro(r.erro); return; }
    onSaved(`Férias de ${p.colaborador} ajustadas: ${br(inicio)} a ${br(fim)} (${total} dias).`);
  }

  return (
    <SgoModal open onClose={onClose} title={`Editar férias — ${p.colaborador}`} subtitle={p.origem === 'RH' ? 'Período aberto pela sincronização do RH. Ao salvar, o fim fica fixo e o sync deixa de esticá-lo.' : undefined} size="md" data-testid="editar-periodo"
      footer={<><button type="button" className="sgo-btn" onClick={onClose}><X className="h-4 w-4" /> Cancelar</button><button type="button" className="sgo-btn sgo-btn--primary" disabled={busy || !inicio || !fim} onClick={() => void salvar()} data-testid="salvar-periodo"><Save className="h-4 w-4" /> Salvar{total ? ` ${total} dias` : ''}</button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <DatePicker label="Início" value={inicio} onValueChange={setInicio} />
        <DatePicker label="Fim (último dia)" value={fim} onValueChange={setFim} min={inicio ?? undefined} />
        <label className="block sm:col-span-2">
          <span className="sgo-label mb-1 block">Observação</span>
          <input value={nota} onChange={(e) => setNota(e.target.value)} maxLength={200} className={inputCls} aria-label="Observação" />
        </label>
      </div>
      {erro && <p className="mt-2 text-sm font-medium text-danger" role="alert">{erro}</p>}
    </SgoModal>
  );
}
