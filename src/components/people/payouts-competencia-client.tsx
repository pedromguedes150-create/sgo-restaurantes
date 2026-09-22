'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ChevronDown, ChevronRight, Download, Lock, LockOpen, Pencil, Plus, Trash2, Truck, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/ds/select';
import { SegmentedControl } from '@/components/ui/ds/segmented-control';
import { StatCard } from '@/components/ui/ds/stat-card';
import { StatusBadge } from '@/components/ui/status-badge';
import { DatePicker } from '@/components/ui/ds/date-picker';
import { formatBRL } from '@/lib/utils';
import { formatarCpf } from '@/lib/people/payouts-export';

/**
 * COMISSÃO E MOBILIDADE — mesma tela, duas abas INDEPENDENTES.
 *
 * A independência não é só visual: cada aba tem a sua entrega, o seu
 * fechamento e o seu arquivo. Não existe botão de "exportar tudo" nesta tela —
 * misturar as duas num Excel foi o que o pedido proibiu, e a forma de garantir
 * é não oferecer o caminho.
 *
 * O agrupamento por UNIDADE é o desenho do SGO dos postos: a linha da unidade
 * responde "quanto e quantos", e só quem precisa do detalhe expande. Com
 * duzentos e setenta lançamentos, a lista corrida não responde nada.
 */

export type Tipo = 'COMMISSION' | 'MOBILITY';

export interface LinhaUI {
  id: string;
  collaboratorId: string;
  colaborador: string;
  cpf: string | null;
  valor: number;
  observacao: string | null;
  lancadoPor: string;
}
export interface GrupoUI {
  unitId: string;
  unidade: string;
  lancamentos: LinhaUI[];
  total: number;
  entregaEm: string | null;
}
export interface QuadroUI {
  competencia: string;
  grupos: GrupoUI[];
  totalGeral: number;
  totalLancamentos: number;
  fechada: boolean;
  fechadaPor: string | null;
  unidadesSemLancamento: { id: string; name: string }[];
}
export interface ColaboradorUI {
  id: string; nome: string; cpf: string | null; unitId: string; unidade: string;
}

const ROTULO: Record<Tipo, string> = { COMMISSION: 'Comissão', MOBILITY: 'Mobilidade' };

async function acao(body: Record<string, unknown>): Promise<{ ok: boolean; error?: string } & Record<string, unknown>> {
  const r = await fetch('/api/people/payouts', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  return r.json().catch(() => ({ ok: false, error: 'Falha de comunicação.' }));
}

export function PayoutsCompetenciaClient({
  competencia, meses, comissao, mobilidade, colaboradores, podeLancar, isAdmin,
}: {
  competencia: string;
  meses: string[];
  comissao: QuadroUI;
  mobilidade: QuadroUI;
  colaboradores: ColaboradorUI[];
  podeLancar: boolean;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [tipo, setTipo] = useState<Tipo>('COMMISSION');
  const quadro = tipo === 'COMMISSION' ? comissao : mobilidade;

  const trocarMes = (m: string) => router.push(`/modulos/pessoas/comissoes?mes=${m}`);

  return (
    <div className="space-y-4">
      {/* As DUAS abas, no topo: a modalidade decide tudo o que vem abaixo. */}
      <SegmentedControl
        aria-label="Modalidade"
        value={tipo}
        onValueChange={(v) => setTipo(v as Tipo)}
        options={[
          { value: 'COMMISSION', label: `Comissão (${comissao.totalLancamentos})` },
          { value: 'MOBILITY', label: `Mobilidade (${mobilidade.totalLancamentos})` },
        ]}
      />

      <Aba
        key={tipo}
        tipo={tipo}
        quadro={quadro}
        competencia={competencia}
        meses={meses}
        colaboradores={colaboradores}
        podeLancar={podeLancar}
        isAdmin={isAdmin}
        onTrocarMes={trocarMes}
        onMudou={() => router.refresh()}
      />
    </div>
  );
}

function Aba({ tipo, quadro, competencia, meses, colaboradores, podeLancar, isAdmin, onTrocarMes, onMudou }: {
  tipo: Tipo; quadro: QuadroUI; competencia: string; meses: string[];
  colaboradores: ColaboradorUI[]; podeLancar: boolean; isAdmin: boolean;
  onTrocarMes: (m: string) => void; onMudou: () => void;
}) {
  const [lancando, setLancando] = useState(false);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState('');
  const [msg, setMsg] = useState('');

  const editavel = podeLancar && !quadro.fechada;

  async function executar(body: Record<string, unknown>, sucesso?: string) {
    setBusy(true); setErro(''); setMsg('');
    const r = await acao({ tipo, competencia, ...body });
    setBusy(false);
    if (!r.ok) { setErro(String(r.error ?? 'Falha.')); return false; }
    if (sucesso) setMsg(sucesso);
    onMudou();
    return true;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="w-48">
          <Select
            label="Competência" size="sm" value={competencia} onValueChange={onTrocarMes}
            options={meses.map((m) => ({ value: m, label: rotuloDoMes(m) }))}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Um botão por aba, com o tipo no próprio rótulo: não existe
              "exportar tudo", e o nome do arquivo já diz qual é. */}
          <a
            href={`/api/people/payouts/export?tipo=${tipo}&mes=${competencia}`}
            className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm font-semibold hover:border-brand"
          >
            <Download className="h-4 w-4" /> Exportar {ROTULO[tipo]} XLSX
          </a>
          {podeLancar && !quadro.fechada && (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void executar({ action: 'fechar' }, 'Competência finalizada.')}>
              <Lock className="h-4 w-4" /> Finalizar competência
            </Button>
          )}
          {quadro.fechada && isAdmin && (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void executar({ action: 'reabrir' }, 'Competência reaberta.')}>
              <LockOpen className="h-4 w-4" /> Reabrir
            </Button>
          )}
        </div>
      </div>

      {quadro.fechada && (
        <div className="rounded-lg border border-line bg-sunken p-3">
          <p className="sgo-type-15 font-semibold text-ink-900">
            <Lock className="mr-1 inline h-4 w-4" /> Competência finalizada{quadro.fechadaPor ? ` por ${quadro.fechadaPor}` : ''}.
          </p>
          <p className="sgo-type-13 text-ink-700">
            Lançamentos desta modalidade não podem ser editados nem excluídos. {isAdmin ? 'Use "Reabrir" para alterar.' : 'Peça ao Administrador para reabrir.'}
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatCard label={`Total de ${ROTULO[tipo].toLowerCase()}`} value={formatBRL(quadro.totalGeral)} className="col-span-2 sm:col-span-1" />
        <StatCard label="Lançamentos" value={String(quadro.totalLancamentos)} />
        <StatCard label="Unidades com lançamento" value={String(quadro.grupos.length)} />
        <StatCard label="Unidades sem lançamento" value={String(quadro.unidadesSemLancamento.length)} />
      </div>

      {quadro.unidadesSemLancamento.length > 0 && (
        /* Sem esta linha, uma unidade esquecida só aparece quando a
           administradora reclama. */
        <p className="rounded-lg bg-warning/10 px-3 py-2 sgo-type-13 text-ink-900">
          <b>Ainda sem {ROTULO[tipo].toLowerCase()} nesta competência:</b>{' '}
          {quadro.unidadesSemLancamento.map((u) => u.name).join(' · ')}
        </p>
      )}

      {erro && <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm font-medium text-danger">{erro}</p>}
      {msg && <p className="rounded-lg bg-success/10 px-3 py-2 text-sm font-semibold text-success">{msg}</p>}

      {editavel && (
        <Button size="sm" onClick={() => setLancando((v) => !v)}>
          {lancando ? <><X className="h-4 w-4" /> Fechar lançamento</> : <><Plus className="h-4 w-4" /> Lançar {ROTULO[tipo].toLowerCase()}</>}
        </Button>
      )}

      {lancando && editavel && (
        <LancarEmLote
          tipo={tipo} colaboradores={colaboradores} busy={busy}
          onGravar={async (itens) => {
            const ok = await executar({ action: 'lote', itens }, `${itens.length} lançamento(s) gravado(s).`);
            if (ok) setLancando(false);
          }}
        />
      )}

      {quadro.grupos.length === 0 && <p className="text-sm text-ink-500">Nenhum lançamento de {ROTULO[tipo].toLowerCase()} nesta competência.</p>}
      {quadro.grupos.map((g) => (
        <Unidade key={g.unitId} grupo={g} tipo={tipo} editavel={editavel} busy={busy} onExecutar={executar} />
      ))}
    </div>
  );
}

/* ───────────────────────── UNIDADE (expansível) ───────────────────────── */

function Unidade({ grupo, tipo, editavel, busy, onExecutar }: {
  grupo: GrupoUI; tipo: Tipo; editavel: boolean; busy: boolean;
  onExecutar: (body: Record<string, unknown>, sucesso?: string) => Promise<boolean>;
}) {
  const [aberta, setAberta] = useState(false);
  const [editandoEntrega, setEditandoEntrega] = useState(false);
  const [entrega, setEntrega] = useState(grupo.entregaEm ?? '');

  return (
    <div className="overflow-hidden rounded-card border border-line bg-surface shadow-sgo-card">
      <button
        type="button"
        onClick={() => setAberta((v) => !v)}
        className="flex w-full items-center justify-between gap-2 p-3 text-left hover:bg-brand-tint"
      >
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {aberta ? <ChevronDown className="h-4 w-4 shrink-0 text-ink-500" /> : <ChevronRight className="h-4 w-4 shrink-0 text-ink-500" />}
          <span className="truncate sgo-type-15 font-semibold text-ink-900">{grupo.unidade}</span>
          <StatusBadge tone="neutral">{grupo.lancamentos.length} lançamento(s)</StatusBadge>
          {grupo.entregaEm
            ? <StatusBadge tone="success">Entregue: {dataBr(grupo.entregaEm)}</StatusBadge>
            : <StatusBadge tone="medium">Sem data de entrega</StatusBadge>}
        </div>
        <div className="shrink-0 text-right">
          <p className="sgo-type-11 text-ink-500">Total</p>
          <p className="sgo-type-15 font-bold text-brand">{formatBRL(grupo.total)}</p>
        </div>
      </button>

      {aberta && (
        <div className="border-t border-line">
          {editavel && (
            <div className="flex flex-wrap items-end gap-2 border-b border-line bg-sunken p-3">
              {editandoEntrega ? (
                <>
                  <div className="w-44">
                    {/* UMA data por unidade: a entrega é do lote inteiro, e
                        pedi-la em cada linha multiplicaria por cinquenta uma
                        informação que é uma só. */}
                    <DatePicker label="Data de entrega" size="sm" value={entrega || null} onValueChange={(v) => setEntrega(v ?? '')} />
                  </div>
                  <Button size="sm" disabled={busy} onClick={async () => {
                    if (await onExecutar({ action: 'entrega', unitId: grupo.unitId, entregaEm: entrega || null }, 'Entrega registrada.')) setEditandoEntrega(false);
                  }}>Salvar</Button>
                  <Button size="sm" variant="outline" onClick={() => { setEntrega(grupo.entregaEm ?? ''); setEditandoEntrega(false); }}>Cancelar</Button>
                </>
              ) : (
                <Button size="sm" variant="outline" onClick={() => setEditandoEntrega(true)}>
                  <Truck className="h-4 w-4" /> {grupo.entregaEm ? 'Alterar data de entrega' : 'Registrar data de entrega'}
                </Button>
              )}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-left">
              <thead>
                <tr className="border-b border-line sgo-type-11 uppercase text-ink-500">
                  <th className="p-2 font-semibold">Colaborador</th>
                  <th className="p-2 font-semibold">CPF</th>
                  <th className="p-2 text-right font-semibold">Valor (R$)</th>
                  <th className="p-2 font-semibold">Observação</th>
                  {editavel && <th className="p-2 font-semibold">Ações</th>}
                </tr>
              </thead>
              <tbody>
                {grupo.lancamentos.map((l) => (
                  <Lancamento key={l.id} l={l} tipo={tipo} editavel={editavel} busy={busy} onExecutar={onExecutar} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Lancamento({ l, editavel, busy, onExecutar }: {
  l: LinhaUI; tipo: Tipo; editavel: boolean; busy: boolean;
  onExecutar: (body: Record<string, unknown>, sucesso?: string) => Promise<boolean>;
}) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(String(l.valor).replace('.', ','));
  const [obs, setObs] = useState(l.observacao ?? '');

  if (editando) {
    return (
      <tr className="border-b border-line last:border-b-0 bg-brand-tint">
        <td className="p-2 sgo-type-15 font-medium text-ink-900">{l.colaborador}</td>
        <td className="p-2 sgo-type-13 tabular-nums text-ink-700">{formatarCpf(l.cpf)}</td>
        <td className="p-2"><Input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} className="h-8 w-24 text-right text-sm" /></td>
        <td className="p-2"><Input value={obs} onChange={(e) => setObs(e.target.value)} className="h-8 text-sm" /></td>
        <td className="p-2">
          <div className="flex gap-1">
            <Button size="sm" disabled={busy} onClick={async () => {
              if (await onExecutar({ action: 'editar', id: l.id, amount: Number(valor.replace(',', '.')), note: obs }, 'Lançamento alterado.')) setEditando(false);
            }}>Salvar</Button>
            <Button size="sm" variant="outline" onClick={() => setEditando(false)}>Cancelar</Button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b border-line last:border-b-0">
      <td className="p-2 sgo-type-15 font-medium text-ink-900">{l.colaborador}</td>
      <td className="p-2 sgo-type-13 tabular-nums text-ink-700">{formatarCpf(l.cpf) || '—'}</td>
      <td className="p-2 text-right sgo-type-15 tabular-nums text-ink-900">{formatBRL(l.valor)}</td>
      <td className="p-2 sgo-type-13 text-ink-500">{l.observacao || '—'}</td>
      {editavel && (
        <td className="p-2">
          <div className="flex gap-1">
            <button type="button" aria-label={`Editar ${l.colaborador}`} className="rounded-lg p-1.5 text-ink-500 hover:bg-brand-tint hover:text-brand" onClick={() => setEditando(true)}>
              <Pencil className="h-4 w-4" />
            </button>
            <button
              type="button" aria-label={`Excluir ${l.colaborador}`} disabled={busy}
              className="rounded-lg p-1.5 text-danger hover:bg-danger/10"
              onClick={() => {
                if (!confirm(`Excluir o lançamento de ${l.colaborador}? A ação fica registrada na Auditoria.`)) return;
                void onExecutar({ action: 'excluir', id: l.id }, 'Lançamento excluído.');
              }}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </td>
      )}
    </tr>
  );
}

/* ───────────────────────── LANÇAMENTO EM LOTE ───────────────────────── */

/**
 * O caso real é "a mesma unidade, o mesmo valor para quase todos".
 *
 * Por isso: filtra a unidade, marca vários, aplica um valor em todos — e ainda
 * dá para ajustar linha a linha antes de gravar, que é o que resolve os poucos
 * que fogem da regra sem obrigar a lançar um por um.
 */
function LancarEmLote({ tipo, colaboradores, busy, onGravar }: {
  tipo: Tipo;
  colaboradores: ColaboradorUI[];
  busy: boolean;
  onGravar: (itens: { collaboratorId: string; amount: number }[]) => void;
}) {
  const [q, setQ] = useState('');
  const [unidade, setUnidade] = useState('');
  const [valorPadrao, setValorPadrao] = useState('');
  const [valores, setValores] = useState<Record<string, string>>({});

  const unidades = useMemo(
    () => [...new Map(colaboradores.map((c) => [c.unitId, c.unidade])).entries()].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR')),
    [colaboradores],
  );

  const visiveis = useMemo(() => {
    const t = q.trim().toLowerCase();
    const digitos = t.replace(/\D/g, '');
    return colaboradores.filter((c) => {
      if (unidade && c.unitId !== unidade) return false;
      if (!t) return true;
      /* Busca por nome OU por CPF — quem confere lista de benefício costuma ter
         o CPF na mão, não o nome exato. */
      return c.nome.toLowerCase().includes(t) || (digitos.length >= 3 && (c.cpf ?? '').includes(digitos));
    });
  }, [colaboradores, q, unidade]);

  const marcados = visiveis.filter((c) => valores[c.id]?.trim());
  const total = marcados.reduce((s, c) => s + (Number(valores[c.id].replace(',', '.')) || 0), 0);

  function aplicarEmTodos() {
    const v = valorPadrao.trim();
    if (!v) return;
    setValores((atual) => {
      const novo = { ...atual };
      for (const c of visiveis) novo[c.id] = v;
      return novo;
    });
  }

  return (
    <div className="space-y-3 rounded-lg border border-brand/30 bg-brand-tint p-3">
      <p className="sgo-type-15 font-semibold text-ink-900">Lançar {ROTULO[tipo].toLowerCase()} — colaboradores do cadastro</p>
      <p className="sgo-type-11 text-ink-500">
        A lista vem do cadastro de colaboradores do SGO. Nome, CPF e unidade são os do cadastro; não se cria colaborador aqui.
      </p>

      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[10rem] flex-1">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Procurar por nome ou CPF" />
        </div>
        <div className="w-52">
          <Select
            label="Unidade" size="sm" value={unidade} onValueChange={setUnidade}
            options={[{ value: '', label: 'Todas as unidades' }, ...unidades.map(([id, nome]) => ({ value: id, label: nome }))]}
          />
        </div>
        <div className="w-32">
          <Input inputMode="decimal" value={valorPadrao} onChange={(e) => setValorPadrao(e.target.value)} placeholder="Valor" />
        </div>
        <Button size="sm" variant="outline" disabled={!valorPadrao.trim() || visiveis.length === 0} onClick={aplicarEmTodos}>
          Aplicar aos {visiveis.length} da lista
        </Button>
      </div>

      <div className="max-h-80 overflow-y-auto rounded-lg border border-line bg-surface">
        {visiveis.length === 0 && <p className="p-3 text-sm text-ink-500">Nenhum colaborador encontrado.</p>}
        {visiveis.map((c) => (
          <div key={c.id} className="flex items-center gap-2 border-b border-line p-2 last:border-b-0">
            <div className="min-w-0 flex-1">
              <p className="truncate sgo-type-15 font-medium text-ink-900">{c.nome}</p>
              <p className="sgo-type-11 tabular-nums text-ink-500">{formatarCpf(c.cpf) || 'sem CPF'} · {c.unidade}</p>
            </div>
            <Input
              inputMode="decimal" className="h-8 w-24 text-right text-sm"
              value={valores[c.id] ?? ''} placeholder="—"
              onChange={(e) => setValores((v) => ({ ...v, [c.id]: e.target.value }))}
            />
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="sgo-type-13 text-ink-700">
          <b>{marcados.length}</b> com valor · total <b className="text-brand">{formatBRL(total)}</b>
          {/* Quem fica com o campo vazio simplesmente não é lançado — é assim
              que se pula alguém sem ter de desmarcar nada. */}
        </p>
        <Button
          size="sm" disabled={busy || marcados.length === 0}
          onClick={() => onGravar(marcados.map((c) => ({ collaboratorId: c.id, amount: Number(valores[c.id].replace(',', '.')) })))}
        >
          <Plus className="h-4 w-4" /> Gravar {marcados.length} lançamento(s)
        </Button>
      </div>
    </div>
  );
}

/* ───────────────────────── auxiliares de formato ───────────────────────── */

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
function rotuloDoMes(m: string): string {
  const [y, mm] = m.split('-');
  return `${MESES[Number(mm) - 1]} de ${y}`;
}
function dataBr(iso: string): string {
  const [y, m, d] = iso.split('-');
  return d ? `${d}/${m}/${y}` : iso;
}
