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
export interface ColabUI { id: string; nome: string; hint: string; vendaveis: { inicio: string; fim: string; saldo: number }[] }
/** Venda de dias já registrada (v1.159.2: a aba Abono saiu; as vendas vivem aqui). */
export interface VendaUI { id: string; colaborador: string; unidade: string; periodoInicio: string; dias: number; observacao: string | null; por: string; em: string; podeExcluir: boolean }

const ORIGEM: Record<PeriodoUI['origem'], { txt: string; cls: string; dica: string }> = {
  RH: { txt: 'Aberto pelo RH', cls: 'sgo-tag--amber', dica: 'A sincronização viu "Férias" no RH e abriu este período a partir daquele dia; o fim cresce um dia por vez. Edite para fixar o período real.' },
  SGO: { txt: 'Lançado aqui', cls: 'sgo-tag--green', dica: 'Período informado pela unidade.' },
  SOLICITADA: { txt: 'Solicitada ao RH', cls: 'sgo-tag--blue', dica: 'Pedido feito pelo gerente em Pessoas → Férias; ainda não conta na Escala.' },
};

type AbonoResp = { ok: true; dias: number; periodoInicio: string } | { ok: false; erro: string };
async function enviar(body: Record<string, unknown>): Promise<{ erro: string | null; substituiuRh?: number; confirmouSolicitada?: boolean; abono?: AbonoResp }> {
  const res = await fetch('/api/people/vacations/periodo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const d = await res.json().catch(() => ({}));
  if (res.ok) return { erro: null, substituiuRh: d.substituiuRh, confirmouSolicitada: d.confirmouSolicitada, abono: d.abono };
  return { erro: d.error ?? 'Não foi possível salvar.' };
}

const inputCls = 'h-10 w-full rounded-control border border-line bg-surface px-3 text-sm text-ink-900 outline-none focus:border-brand';

export function PeriodosFerias({ colaboradores, periodos, vendas, podeEditar, colaboradorInicial, unitId, maxDias }: {
  colaboradores: ColabUI[]; periodos: PeriodoUI[]; vendas: VendaUI[]; podeEditar: boolean; colaboradorInicial?: string | null; unitId?: string | null; maxDias: number;
}) {
  const router = useRouter();
  const [colab, setColabState] = useState(colaboradorInicial && colaboradores.some((c) => c.id === colaboradorInicial) ? colaboradorInicial : '');
  const [inicio, setInicio] = useState<string | null>(null);
  const [fim, setFim] = useState<string | null>(null);
  const [nota, setNota] = useState('');
  /* Venda de dias junto do lançamento (v1.159.1): "saiu 20 dias e vendeu 10". O
     período aquisitivo vem pré-escolhido (o mais antigo com saldo), como na aba Abono. */
  const [vendidos, setVendidos] = useState('');
  const [periodoVenda, setPeriodoVenda] = useState('');
  const vendaveis = colaboradores.find((c) => c.id === colab)?.vendaveis ?? [];
  function setColab(id: string) { setColabState(id); setPeriodoVenda(colaboradores.find((c) => c.id === id)?.vendaveis[0]?.inicio ?? ''); }
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [editando, setEditando] = useState<PeriodoUI | null>(null);
  const [excluindo, setExcluindo] = useState<PeriodoUI | null>(null);
  const [excluindoVenda, setExcluindoVenda] = useState<VendaUI | null>(null);
  const total = inicio && fim && fim >= inicio ? dias(inicio, fim) : 0;

  async function lancar() {
    if (!colab || !inicio || !fim) { setMsg({ ok: false, t: 'Escolha o colaborador, o início e o fim.' }); return; }
    const nVend = Number(vendidos || 0);
    if (nVend > 0 && !periodoVenda) { setMsg({ ok: false, t: 'Escolha de qual período aquisitivo os dias foram vendidos.' }); return; }
    setBusy(true); setMsg(null);
    const r = await enviar({ acao: 'lancar', collaboratorId: colab, startDate: inicio, endDate: fim, note: nota, unitId, diasVendidos: nVend, periodoInicio: nVend > 0 ? periodoVenda : null });
    setBusy(false);
    if (r.erro) { setMsg({ ok: false, t: r.erro }); return; }
    const extra = r.substituiuRh ? ` O período aberto pelo RH foi substituído.` : r.confirmouSolicitada ? ' A solicitação ao RH foi confirmada com estas datas.' : '';
    const venda = r.abono ? (r.abono.ok ? ` ${r.abono.dias} dia(s) vendido(s) do período de ${br(r.abono.periodoInicio)}.` : ` ATENÇÃO: a venda de dias NÃO entrou — ${r.abono.erro}. Registre na aba Abono.`) : '';
    setMsg({ ok: !r.abono || r.abono.ok, t: `Férias lançadas: ${br(inicio)} a ${br(fim)} (${total} dias). A Escala e o Controle de Férias já refletem.${extra}${venda}` });
    setInicio(null); setFim(null); setNota(''); setVendidos('');
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

  async function excluirVenda() {
    if (!excluindoVenda) return;
    setBusy(true);
    const res = await fetch('/api/people/vacations/abono', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acao: 'excluir', id: excluindoVenda.id }) });
    const d = await res.json().catch(() => ({}));
    setBusy(false); setExcluindoVenda(null);
    setMsg(res.ok ? { ok: true, t: 'Venda de dias excluída; o saldo do período volta.' } : { ok: false, t: d.error ?? 'Não foi possível excluir.' });
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
            <div className="grid gap-3 md:grid-cols-[1.6fr_1fr_1fr_auto] md:items-end">
              <div>
                <span className="sgo-label mb-1 block">Colaborador</span>
                <Select aria-label="Colaborador" searchable placeholder="Selecione…" value={colab} onValueChange={setColab}
                  options={colaboradores.map((c) => ({ value: c.id, label: c.nome, hint: c.hint }))} />
              </div>
              <DatePicker label="Início" value={inicio} onValueChange={setInicio} />
              <DatePicker label="Fim (último dia)" value={fim} onValueChange={setFim} min={inicio ?? undefined} />
              <button type="button" className="sgo-btn sgo-btn--primary" disabled={busy || !colab || !inicio || !fim} onClick={() => void lancar()} data-testid="lancar-ferias">
                <CalendarPlus className="h-4 w-4" /> Lançar{total ? ` ${total} dias` : ''}
              </button>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-[1fr_1.6fr_2fr] md:items-end">
              <label className="block">
                <span className="sgo-label mb-1 block">Dias vendidos (abono)</span>
                <input type="number" min={0} max={maxDias} value={vendidos} onChange={(e) => setVendidos(e.target.value.replace(/\D/g, ''))} placeholder="0"
                  disabled={!colab || vendaveis.length === 0} className={`${inputCls} text-right tabular-nums`} aria-label="Dias vendidos" data-testid="dias-vendidos" />
              </label>
              <div>
                <span className="sgo-label mb-1 block">Do período aquisitivo</span>
                <Select aria-label="Período aquisitivo da venda" placeholder={!colab ? 'Escolha o colaborador' : vendaveis.length ? 'Selecione…' : 'Sem saldo para vender'} value={periodoVenda} onValueChange={setPeriodoVenda}
                  options={vendaveis.map((p) => ({ value: p.inicio, label: `${br(p.inicio)} a ${br(p.fim)}`, hint: `saldo ${p.saldo} dias` }))} />
              </div>
              <label className="block">
                <span className="sgo-label mb-1 block">Observação (opcional)</span>
                <input value={nota} onChange={(e) => setNota(e.target.value)} maxLength={200} placeholder="Ex.: aviso de férias do RH" className={inputCls} aria-label="Observação" />
              </label>
            </div>
            {nomeDoColab && total > 0 && <p className="mt-2 text-xs text-ink-500">{nomeDoColab}: {br(inicio!)} a {br(fim!)} · {total} dia(s) corridos{Number(vendidos || 0) > 0 ? ` + ${Number(vendidos)} dia(s) vendido(s)` : ''}.</p>}
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

      <Card>
        <PanelHeader title="Vendas de dias registradas" count={vendas.length} />
        <CardContent className="overflow-x-auto p-0">
          <p className="px-4 pt-3 text-xs text-ink-500">Dias vendidos (abono) abatem o saldo do período aquisitivo. Registre junto do lançamento ou do Editar acima.</p>
          {vendas.length === 0 ? (
            <p className="px-4 py-6 text-sm text-ink-500">Nenhuma venda de dias registrada no alcance.</p>
          ) : (
            <table className="sgo-tbl w-full text-sm" data-testid="vendas-registradas">
              <thead>
                <tr><th>Colaborador</th><th>Unidade</th><th>Período aquisitivo</th><th className="text-right">Dias</th><th>Observação</th><th>Registrado por</th>{podeEditar && <th aria-label="Ações" />}</tr>
              </thead>
              <tbody>
                {vendas.map((v) => (
                  <tr key={v.id}>
                    <td className="font-medium text-ink-900">{v.colaborador}</td>
                    <td className="text-ink-700">{v.unidade}</td>
                    <td className="tabular-nums">desde {br(v.periodoInicio)}</td>
                    <td className="text-right tabular-nums">{v.dias}</td>
                    <td className="max-w-56 truncate text-xs text-ink-700" title={v.observacao ?? ''}>{v.observacao ?? '—'}</td>
                    <td className="text-xs text-ink-500">{v.por} · {br(v.em)}</td>
                    {podeEditar && (
                      <td className="text-right">
                        {v.podeExcluir && <button type="button" className="sgo-btn sgo-btn--sm sgo-btn--ghost text-danger" onClick={() => setExcluindoVenda(v)} aria-label={`Excluir venda de ${v.colaborador}`}><Trash2 className="h-3.5 w-3.5" /></button>}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <SgoModal open={Boolean(excluindoVenda)} onClose={() => setExcluindoVenda(null)} title="Excluir venda de dias" tone="red" size="sm"
        footer={<><button type="button" className="sgo-btn" onClick={() => setExcluindoVenda(null)}>Cancelar</button><button type="button" className="sgo-btn sgo-btn--danger" disabled={busy} onClick={() => void excluirVenda()}>Excluir</button></>}>
        {excluindoVenda && <p className="text-sm text-ink-700">Excluir a venda de <b>{excluindoVenda.dias} dia(s)</b> de <b>{excluindoVenda.colaborador}</b> (período desde {br(excluindoVenda.periodoInicio)})? O saldo do período volta.</p>}
      </SgoModal>

      {editando && <EditarPeriodo p={editando} vendaveis={colaboradores.find((c) => c.id === editando.collaboratorId)?.vendaveis ?? []} maxDias={maxDias} onClose={() => setEditando(null)} onSaved={(ok, t) => { setEditando(null); setMsg({ ok, t }); router.refresh(); }} />}

      <SgoModal open={Boolean(excluindo)} onClose={() => setExcluindo(null)} title="Excluir período de férias" tone="red" size="sm"
        footer={<><button type="button" className="sgo-btn" onClick={() => setExcluindo(null)}>Cancelar</button><button type="button" className="sgo-btn sgo-btn--danger" disabled={busy} onClick={() => void excluir()} data-testid="confirmar-excluir">Excluir</button></>}>
        {excluindo && <p className="text-sm text-ink-700">Excluir as férias de <b>{excluindo.colaborador}</b> de {br(excluindo.inicio)} a {br(excluindo.fim)}? Os dias deixam de contar como FE na Escala e como gozados no Controle de Férias.</p>}
      </SgoModal>
    </div>
  );
}

function EditarPeriodo({ p, vendaveis, maxDias, onClose, onSaved }: { p: PeriodoUI; vendaveis: ColabUI['vendaveis']; maxDias: number; onClose: () => void; onSaved: (ok: boolean, t: string) => void }) {
  const [inicio, setInicio] = useState<string | null>(p.inicio);
  const [fim, setFim] = useState<string | null>(p.fim);
  const [nota, setNota] = useState(p.nota ?? '');
  /* Venda de dias também no Editar (v1.159.2): o período aberto pelo RH é o que a
     pessoa ajusta para "01/10 a 20/10 e vendeu 10" — sem isto, teria de ir à aba Abono. */
  const [vendidos, setVendidos] = useState('');
  const [periodoVenda, setPeriodoVenda] = useState(vendaveis[0]?.inicio ?? '');
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const total = inicio && fim && fim >= inicio ? dias(inicio, fim) : 0;

  async function salvar() {
    if (!inicio || !fim) { setErro('Informe início e fim.'); return; }
    const nVend = Number(vendidos || 0);
    if (nVend > 0 && !periodoVenda) { setErro('Escolha de qual período aquisitivo os dias foram vendidos.'); return; }
    setBusy(true); setErro(null);
    const r = await enviar({ acao: 'editar', id: p.id, startDate: inicio, endDate: fim, note: nota, diasVendidos: nVend, periodoInicio: nVend > 0 ? periodoVenda : null });
    setBusy(false);
    if (r.erro) { setErro(r.erro); return; }
    const venda = r.abono ? (r.abono.ok ? ` ${r.abono.dias} dia(s) vendido(s) do período de ${br(r.abono.periodoInicio)}.` : ` ATENÇÃO: a venda de dias NÃO entrou — ${r.abono.erro}. Registre na aba Abono.`) : '';
    onSaved(!r.abono || r.abono.ok, `Férias de ${p.colaborador} ajustadas: ${br(inicio)} a ${br(fim)} (${total} dias).${venda}`);
  }

  return (
    <SgoModal open onClose={onClose} title={`Editar férias — ${p.colaborador}`} subtitle={p.origem === 'RH' ? 'Período aberto pela sincronização do RH. Ao salvar, o fim fica fixo e o sync deixa de esticá-lo.' : undefined} size="md" data-testid="editar-periodo"
      footer={<><button type="button" className="sgo-btn" onClick={onClose}><X className="h-4 w-4" /> Cancelar</button><button type="button" className="sgo-btn sgo-btn--primary" disabled={busy || !inicio || !fim} onClick={() => void salvar()} data-testid="salvar-periodo"><Save className="h-4 w-4" /> Salvar{total ? ` ${total} dias` : ''}</button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <DatePicker label="Início" value={inicio} onValueChange={setInicio} />
        <DatePicker label="Fim (último dia)" value={fim} onValueChange={setFim} min={inicio ?? undefined} />
        <label className="block">
          <span className="sgo-label mb-1 block">Dias vendidos (abono)</span>
          <input type="number" min={0} max={maxDias} value={vendidos} onChange={(e) => setVendidos(e.target.value.replace(/\D/g, ''))} placeholder="0"
            disabled={vendaveis.length === 0} className={`${inputCls} text-right tabular-nums`} aria-label="Dias vendidos" data-testid="editar-dias-vendidos" />
        </label>
        <div>
          <span className="sgo-label mb-1 block">Do período aquisitivo</span>
          <Select aria-label="Período aquisitivo da venda" placeholder={vendaveis.length ? 'Selecione…' : 'Sem saldo para vender'} value={periodoVenda} onValueChange={setPeriodoVenda}
            options={vendaveis.map((x) => ({ value: x.inicio, label: `${br(x.inicio)} a ${br(x.fim)}`, hint: `saldo ${x.saldo} dias` }))} />
        </div>
        <label className="block sm:col-span-2">
          <span className="sgo-label mb-1 block">Observação</span>
          <input value={nota} onChange={(e) => setNota(e.target.value)} maxLength={200} className={inputCls} aria-label="Observação" />
        </label>
      </div>
      {vendaveis.length === 0 && <p className="mt-2 text-xs text-ink-500">Sem período aquisitivo com saldo para vender dias (ou a venda já foi registrada na aba Abono).</p>}
      {erro && <p className="mt-2 text-sm font-medium text-danger" role="alert">{erro}</p>}
    </SgoModal>
  );
}
