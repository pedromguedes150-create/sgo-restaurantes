'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronDown, SlidersHorizontal, Search, Tags, X, CheckSquare, AlertTriangle } from 'lucide-react';
import { SearchField } from '@/components/ui/ds/field';
import { Select } from '@/components/ui/ds/select';
import { EmptyState } from '@/components/ui/ds/empty-state';
import { SgoModal } from '@/components/sgo/sgo-modal';
import { Button } from '@/components/ui/ds/button';
import { ToastProvider, useToast } from '@/components/ui/ds/toast';
import { shortUnitName } from '@/lib/unit-name';
import { StatusBadge } from '@/components/ui/status-badge';
import { GRAVITY_META, STATUS_META } from '@/lib/occurrences/labels';
import { ORDENS, linkDaLista, type FiltrosDaLista } from '@/lib/occurrences/contexto';
import type { OccurrenceGravity, OccurrenceStatus } from '@prisma/client';

export interface OccItem {
  id: string;
  number: number;
  unitName: string;
  unitCode: string;
  typeName: string;
  categoryName: string | null;
  description: string;
  gravity: OccurrenceGravity;
  status: OccurrenceStatus;
  isRecurrence: boolean;
  attachments: number;
  createdAt: string; // ISO
  /** Veio de um item de checklist. */
  origemChecklist: boolean;
  /** Quem marcou "Em andamento" e quando (da Auditoria); só para IN_PROGRESS. */
  andamento?: { nome: string; em: string } | null;
}

export interface TypeOpt { id: string; name: string; categories: { id: string; name: string }[] }

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

const numero = (o: OccItem) => `#${o.unitCode}-${String(o.number).padStart(4, '0')}`;

/**
 * Lista de ocorrências (v1.128.0 — tratamento em lote).
 *
 * Todo filtro mora na URL (`filtros`): trocar unidade, gravidade, busca ou ordem
 * navega, o servidor refaz a lista, e o link de cada cartão carrega `voltar=`
 * com este endereço — encerrar uma ocorrência devolve o supervisor a ESTA
 * lista, com os mesmos filtros, e não a "Todas".
 *
 * Seleção e lote só nas situações Abertas/Em andamento e só para quem trata
 * (Supervisor/Admin/CEO). Encerrar continua individual, dentro da ocorrência.
 */
interface Props {
  items: OccItem[];
  filtros: FiltrosDaLista;
  unidades: { id: string; name: string }[];
  tipos: TypeOpt[];
  podeTratar: boolean;
  /** Quantas vieram do servidor nesta página (para "N de M" quando a busca corta). */
  totalNaPagina: number;
}

/* O layout do app não monta o ToastProvider; a lista traz o seu. */
export function OccurrencesClient(props: Props) {
  return <ToastProvider><Lista {...props} /></ToastProvider>;
}

function Lista({ items, filtros, unidades, tipos, podeTratar, totalNaPagina }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [q, setQ] = useState(filtros.q ?? '');
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  const [confirmar, setConfirmar] = useState<'progress' | 'reclassify' | null>(null);
  const [busy, setBusy] = useState(false);
  const [typeId, setTypeId] = useState('');
  const [categoryId, setCategoryId] = useState('');

  const ir = (mudar: Partial<FiltrosDaLista>) => router.push(linkDaLista({ ...filtros, pagina: 1, ...mudar }));

  /* Busca: digita → espera 400ms → navega. Um push por tecla seria uma ida ao
     servidor por letra. */
  const primeira = useRef(true);
  useEffect(() => {
    if (primeira.current) { primeira.current = false; return; }
    if ((q.trim() || undefined) === filtros.q) return;
    const t = setTimeout(() => ir({ q: q.trim() || undefined }), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  // A lista mudou (navegação): o que estava marcado pode ter saído da tela.
  useEffect(() => { setSelecionadas(new Set()); }, [items]);

  const emLote = podeTratar && (filtros.status === 'OPEN' || filtros.status === 'IN_PROGRESS');
  const voltar = linkDaLista(filtros);

  const groups = useMemo(() => {
    const m = new Map<string, OccItem[]>();
    for (const o of items) { const arr = m.get(o.unitName) ?? []; arr.push(o); m.set(o.unitName, arr); }
    // A ordem escolhida vale DENTRO de cada unidade; os grupos seguem por nome.
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'));
  }, [items]);

  const visiveisIds = items.map((o) => o.id);
  const todasVisiveis = visiveisIds.length > 0 && visiveisIds.every((id) => selecionadas.has(id));
  const alternar = (id: string) => setSelecionadas((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const selecionarVisiveis = () => setSelecionadas(todasVisiveis ? new Set() : new Set(visiveisIds));

  async function executar(acao: 'progress' | 'reclassify', ids: string[]) {
    setBusy(true);
    try {
      const body: Record<string, unknown> = { action: acao, ids };
      if (acao === 'reclassify') Object.assign(body, { typeId, categoryId: categoryId || undefined });
      const res = await fetch('/api/occurrences/batch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { toast({ tone: 'danger', title: d.error ?? 'Não foi possível aplicar' }); return; }
      const n = d.feitas?.length ?? 0;
      const puladas = d.puladas?.length ?? 0;
      toast({
        tone: puladas ? 'warning' : 'success',
        title: acao === 'progress' ? `${n} ocorrência(s) marcada(s) como Em andamento.` : `${n} ocorrência(s) reclassificada(s).`,
        description: puladas ? `${puladas} não mudou(aram): já encerrada(s), já em andamento ou fora do seu alcance.` : undefined,
      });
      setConfirmar(null);
      setSelecionadas(new Set());
      router.refresh();
    } finally { setBusy(false); }
  }

  const tipo = tipos.find((t) => t.id === typeId);
  const qtd = selecionadas.size;

  const card = (o: OccItem) => {
    const marcada = selecionadas.has(o.id);
    return (
      <div key={o.id} className={`sgo-panel sgo-panel--solid transition-colors ${marcada ? 'bg-brand-tint/30' : ''}`} style={marcada ? { borderColor: 'var(--sgo-accent)' } : undefined}>
        <div className="flex items-start gap-2 px-3 py-2.5">
          {emLote && (
            <input
              type="checkbox"
              aria-label={`Selecionar ${numero(o)}`}
              checked={marcada}
              onChange={() => alternar(o.id)}
              className="mt-1 h-4 w-4 shrink-0 accent-brand"
            />
          )}
          <div className="min-w-0 flex-1">
            <Link href={`/modulos/ocorrencias/${o.id}?voltar=${encodeURIComponent(voltar)}`} className="block">
              <p className="font-semibold text-ink-900">{numero(o)} <span className="font-normal text-ink-500">· {o.typeName}{o.categoryName ? ` — ${o.categoryName}` : ''}</span></p>
              <p className="truncate text-sm text-ink-700">{o.description}</p>
              <p className="mt-0.5 text-xs text-ink-500">
                {`Origem: ${o.origemChecklist ? 'Checklist' : 'Manual'} · ${fmtDateTime(o.createdAt)}`}
                {o.isRecurrence && ' · ♻ reincidência'}
                {o.attachments > 0 && ` · ${o.attachments} anexo(s)`}
              </p>
            </Link>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-ink-700">{GRAVITY_META[o.gravity].emoji} {GRAVITY_META[o.gravity].label}</span>
              <StatusBadge tone={STATUS_META[o.status].tone}>{STATUS_META[o.status].label}</StatusBadge>
              {o.status === 'IN_PROGRESS' && o.andamento && (
                <span className="text-xs text-ink-500">Responsável: <b className="text-ink-700">{o.andamento.nome}</b> · Desde: {fmtDateTime(o.andamento.em)}</span>
              )}
              <span className="ml-auto flex items-center gap-1">
                <Link href={`/modulos/ocorrencias/${o.id}?voltar=${encodeURIComponent(voltar)}`} className="sgo-btn sgo-btn--sm">Ver detalhes</Link>
                {podeTratar && o.status === 'OPEN' && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => { setSelecionadas(new Set([o.id])); setConfirmar('progress'); }}
                    className="sgo-btn sgo-btn--sm"
                    style={{ color: 'var(--sgo-accent)' }}
                  >
                    Marcar em andamento
                  </button>
                )}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-3">
      {/* Barra superior: busca + filtros (todos na URL) */}
      <div className="sgo-panel sgo-panel--solid space-y-2 p-3">
        <SearchField value={q} onValueChange={setQ} placeholder="Buscar por nº, tipo, categoria, descrição…" label="Busca" />
        <div className="flex flex-wrap items-end gap-2">
          {unidades.length > 1 && (
            <div className="min-w-[10rem] flex-1">
              <Select
                label="Unidade" size="sm" value={filtros.unitId ?? 'ALL'}
                onValueChange={(v) => ir({ unitId: v === 'ALL' ? undefined : v })}
                options={[{ value: 'ALL', label: 'Todas as unidades' }, ...unidades.map((u) => ({ value: u.id, label: shortUnitName(u.name) }))]}
              />
            </div>
          )}
          <div className="min-w-[10rem] flex-1">
            <Select
              label="Gravidade" size="sm" value={filtros.gravity ?? 'ALL'}
              onValueChange={(v) => ir({ gravity: v === 'ALL' ? undefined : (v as OccurrenceGravity) })}
              options={[
                { value: 'ALL', label: 'Todas as gravidades' },
                { value: 'LOW', label: 'Baixa' }, { value: 'MEDIUM', label: 'Média' }, { value: 'HIGH', label: 'Alta' }, { value: 'CRITICAL', label: 'Crítica' },
              ]}
            />
          </div>
          {filtros.status !== 'CLOSED' && (
            <div className="min-w-[10rem] flex-1">
              <Select label="Ordenar" size="sm" value={filtros.ordem} onValueChange={(v) => ir({ ordem: v as FiltrosDaLista['ordem'] })} options={[...ORDENS]} />
            </div>
          )}
          <span className="ml-auto pb-2 text-xs tabular-nums text-ink-500">{items.length} ocorrência(s){items.length !== totalNaPagina ? ` de ${totalNaPagina}` : ''}</span>
        </div>
      </div>

      {/* Selecionar visíveis: só o que está NA TELA depois dos filtros. */}
      {emLote && items.length > 0 && (
        <label className="flex items-center gap-2 px-1 text-sm text-ink-700">
          <input type="checkbox" checked={todasVisiveis} onChange={selecionarVisiveis} className="h-4 w-4 accent-brand" aria-label="Selecionar visíveis" />
          Selecionar visíveis <span className="text-xs text-ink-500">({items.length} nesta página — o que os filtros escondem não entra)</span>
        </label>
      )}

      {/* Barra de ações em lote */}
      {emLote && qtd > 0 && (
        <div className="sgo-panel sticky top-20 z-20 flex flex-wrap items-center gap-2 px-3 py-2" style={{ borderColor: 'var(--sgo-accent)' }}>
          <span className="inline-flex items-center gap-1 text-sm font-semibold text-ink-900"><CheckSquare className="h-4 w-4 text-brand" /> {qtd} ocorrência(s) selecionada(s)</span>
          <span className="ml-auto flex flex-wrap gap-1.5">
            {filtros.status === 'OPEN' && (
              <Button size="sm" onClick={() => setConfirmar('progress')} disabled={busy}><Search className="h-4 w-4" /> Marcar em andamento</Button>
            )}
            <Button size="sm" variant="secondary" onClick={() => { setTypeId(''); setCategoryId(''); setConfirmar('reclassify'); }} disabled={busy}><Tags className="h-4 w-4" /> Reclassificar</Button>
            <Button size="sm" variant="ghost" onClick={() => setSelecionadas(new Set())} disabled={busy}><X className="h-4 w-4" /> Limpar seleção</Button>
          </span>
        </div>
      )}

      {items.length === 0 && (
        <EmptyState icon={SlidersHorizontal} title="Nenhuma ocorrência encontrada" description="Limpe a busca ou troque os filtros." />
      )}

      {groups.length === 1 && <div className="space-y-2">{groups[0][1].map(card)}</div>}
      {groups.length > 1 && (
        <div className="space-y-2">
          {groups.map(([unitName, list]) => (
            <details key={unitName} className="group sgo-panel sgo-panel--solid" open={emLote || undefined}>
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5">
                <span className="sgo-type-11 font-semibold text-ink-900">
                  {unitName} <span className="font-normal">({list.length})</span>
                </span>
                <ChevronDown className="h-4 w-4 shrink-0 text-ink-500 transition-transform group-open:rotate-180" />
              </summary>
              <div className="space-y-2 p-2" style={{ borderTop: '1px solid var(--sgo-hair)' }}>{list.map(card)}</div>
            </details>
          ))}
        </div>
      )}

      {/* Confirmação: marcar em andamento */}
      <SgoModal
        open={confirmar === 'progress'}
        onClose={() => !busy && setConfirmar(null)}
        title={`Marcar ${qtd} ocorrência(s) como Em andamento?`}
        subtitle="Fica registrado quem marcou, a data e a hora, na Auditoria. Só as selecionadas mudam."
        icon={<Search className="h-4 w-4" />}
        tone="blue"
        size="sm"
        footer={<>
          <Button variant="secondary" onClick={() => setConfirmar(null)} disabled={busy}>Cancelar</Button>
          <Button onClick={() => executar('progress', [...selecionadas])} loading={busy}>Confirmar</Button>
        </>}
      >
        <p className="text-sm" style={{ color: 'var(--sgo-ink-2)' }}>As selecionadas passam a <b>Em andamento</b>; encerrar continua individual, dentro de cada ocorrência.</p>
      </SgoModal>

      {/* Reclassificar em lote */}
      <SgoModal
        open={confirmar === 'reclassify'}
        onClose={() => !busy && setConfirmar(null)}
        title={`Reclassificar ${qtd} ocorrência(s)`}
        subtitle="Todas as selecionadas passam para o tipo/categoria escolhidos. Tipos marcados como Manutenção/TI movem para a aba correspondente. Fica na Auditoria."
        icon={<AlertTriangle className="h-4 w-4" />}
        tone="amber"
        size="sm"
        footer={<>
          <Button variant="secondary" onClick={() => setConfirmar(null)} disabled={busy}>Cancelar</Button>
          <Button onClick={() => executar('reclassify', [...selecionadas])} loading={busy} disabled={!typeId || (Boolean(tipo?.categories.length) && !categoryId)}>Confirmar</Button>
        </>}
      >
        <div className="space-y-2">
          <Select label="Novo tipo" placeholder="Selecione…" value={typeId} onValueChange={(v) => { setTypeId(v); setCategoryId(''); }} options={tipos.map((t) => ({ value: t.id, label: t.name }))} />
          {tipo && tipo.categories.length > 0 && (
            <Select label="Categoria" required placeholder="Selecione…" value={categoryId} onValueChange={setCategoryId} options={tipo.categories.map((c) => ({ value: c.id, label: c.name }))} />
          )}
        </div>
      </SgoModal>
    </div>
  );
}
