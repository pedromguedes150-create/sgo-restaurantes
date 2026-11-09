'use client';

import Link from 'next/link';
import { Download, Settings2, ClipboardList } from 'lucide-react';
import { StatusBadge, type StatusTone } from '@/components/ui/status-badge';
import { SITUACOES, GRUPOS } from '@/lib/certificates/catalogo';
import { ORDEM_DAS_PENDENCIAS, ROTULO_DA_PENDENCIA, type TipoDePendencia } from '@/lib/certificates/painel-rh-calculo';
import type { PainelDoRh } from '@/lib/certificates/painel-rh';

/**
 * Aba "Painel do RH" (v1.199.0): pendências por prioridade, situação dos
 * lançamentos, por nomenclatura, estado da configuração e o Excel do RH.
 * Admin/CEO por padrão (aba `CERTIFICATES_TAB_RH` na matriz).
 */
const TOM: Record<'danger' | 'warning' | 'info', StatusTone> = { danger: 'critical', warning: 'medium', info: 'neutral' };
const TOM_SIT: Record<(typeof SITUACOES)[keyof typeof SITUACOES]['tom'], StatusTone> = { neutral: 'neutral', info: 'neutral', warning: 'medium', success: 'success', danger: 'critical' };
function fmt(iso: string) { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; }

export function PainelRhClient({ painel, unitFiltro }: { painel: PainelDoRh; unitFiltro?: string }) {
  const totalPend = ORDEM_DAS_PENDENCIAS.reduce((s, t) => s + painel.resumo[t], 0);
  return (
    <div className="space-y-4" data-testid="painel-rh">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink-500">{painel.total} documento(s) no alcance · {totalPend} pendência(s) · hoje {fmt(painel.hoje)}</p>
        <div className="flex flex-wrap gap-2">
          <a href={`/api/certificates/rh/export${unitFiltro ? `?unit=${unitFiltro}` : ''}`} className="sgo-btn sgo-btn--sm"><Download className="h-4 w-4" /> Excel do RH</a>
          <Link href="/configuracoes/atestados" className="sgo-btn sgo-btn--sm"><Settings2 className="h-4 w-4" /> Nomenclaturas e regras</Link>
          <Link href="/configuracoes/integracoes/envios-rh" className="sgo-btn sgo-btn--sm"><ClipboardList className="h-4 w-4" /> Envios ao RH</Link>
        </div>
      </div>

      {/* Resumo das pendências */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6" data-testid="resumo-pendencias">
        {ORDEM_DAS_PENDENCIAS.map((t) => (
          <div key={t} className={`rounded-lg border bg-surface p-3 ${painel.resumo[t] > 0 && ROTULO_DA_PENDENCIA[t].tom === 'danger' ? 'border-danger/40' : ''}`}>
            <p className="sgo-type-11 font-semibold text-ink-500">{ROTULO_DA_PENDENCIA[t].titulo}</p>
            <p className={`sgo-type-24 mt-1 font-semibold ${painel.resumo[t] > 0 && ROTULO_DA_PENDENCIA[t].tom !== 'info' ? 'text-danger' : 'text-ink-900'}`}>{painel.resumo[t]}</p>
          </div>
        ))}
      </div>

      {/* Pendências por tipo */}
      {painel.pendencias.length === 0 ? (
        <p className="rounded-lg border bg-surface p-3 text-sm text-ink-500">Nenhuma pendência: nada aguardando correção, sem envio com erro, sem documento parado no RH.</p>
      ) : ORDEM_DAS_PENDENCIAS.filter((t) => painel.resumo[t] > 0).map((t) => (
        <section key={t} className="rounded-lg border bg-surface" data-testid={`pendencia-${t}`}>
          <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2">
            <h3 className="flex items-center gap-2 text-sm font-bold text-ink-900"><StatusBadge tone={TOM[ROTULO_DA_PENDENCIA[t].tom]}>{painel.resumo[t]}</StatusBadge> {ROTULO_DA_PENDENCIA[t].titulo}</h3>
            <p className="text-xs text-ink-500">{ROTULO_DA_PENDENCIA[t].explicacao}</p>
          </header>
          <ul className="divide-y divide-line">
            {painel.pendencias.filter((p) => p.tipo === t).map((p) => (
              <li key={`${t}-${p.doc.id}`} className="flex flex-wrap items-start justify-between gap-2 px-3 py-2 text-sm">
                <div className="min-w-[12rem] flex-1">
                  <p className="font-semibold text-ink-900">{p.doc.collaboratorName} <span className="font-normal text-ink-500">· {p.doc.unitName}</span></p>
                  <p className="text-xs text-ink-900">{p.doc.rotulo} · {fmt(p.doc.startDate)}{p.doc.endDate !== p.doc.startDate ? ` → ${fmt(p.doc.endDate)}` : ''} · {SITUACOES[p.doc.status].rotulo}</p>
                  <p className="text-xs text-ink-500">{p.detalhe}</p>
                </div>
                <Link href={`/modulos/atestados?aba=historico&doc=${p.doc.id}`} className="text-xs font-semibold text-brand underline">Abrir</Link>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {/* Situação e nomenclaturas */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="rounded-lg border bg-surface p-3">
          <h3 className="mb-2 text-sm font-bold text-ink-900">Situação dos lançamentos</h3>
          <div className="flex flex-wrap gap-2">
            {painel.porSituacao.map((s) => <StatusBadge key={s.status} tone={TOM_SIT[SITUACOES[s.status].tom]}>{SITUACOES[s.status].rotulo} · {s.count}</StatusBadge>)}
          </div>
        </div>
        <div className="rounded-lg border bg-surface p-3">
          <h3 className="mb-2 text-sm font-bold text-ink-900">Nomenclaturas e regras</h3>
          <p className="text-sm text-ink-900">{painel.nomenclaturas.total} tipos no catálogo · {painel.nomenclaturas.comNomeNoRh} com nome próprio no RH · {painel.nomenclaturas.inativas} inativa(s)</p>
          <ul className="mt-2 space-y-0.5 text-xs">
            {painel.porNomenclatura.slice(0, 8).map((n) => <li key={n.rotulo} className="flex justify-between"><span className="text-ink-900">{GRUPOS[n.grupo].rotulo} · {n.rotulo}</span><span className="text-ink-500">{n.count} · {n.days} dia(s)</span></li>)}
          </ul>
        </div>
      </div>
    </div>
  );
}

export type { TipoDePendencia };
