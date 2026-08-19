import Link from 'next/link';
import { getSessionUser } from '@/lib/auth/session';
import { listOccurrences, getOccurrenceSummary } from '@/lib/occurrences/query';
import { Button } from '@/components/ui/ds/button';
import { LargeTitle } from '@/components/layout/page-chrome';
import { StatCard } from '@/components/ui/ds/stat-card';
import { Banner } from '@/components/ui/ds/banner';
import { SegmentedNav } from '@/components/ui/ds/segmented-nav';
import { Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import { OccurrencesClient, type OccItem } from '@/components/occurrences/occurrences-client';
import type { OccurrenceStatus } from '@prisma/client';

export const dynamic = 'force-dynamic';

const POR_PAGINA = 50;

/**
 * Dois eixos, e eles NÃO são a mesma coisa:
 *  · a visão (Geral / Manutenção / TI) diz de que assunto a ocorrência trata;
 *  · a situação (Todas / Abertas / …) diz em que ponto do fluxo ela está.
 * Antes os dois eram trilhos de abas idênticos, empilhados e sem rótulo — nada
 * na tela dizia que eram perguntas diferentes. Daí a sensação de "misturado".
 */
export default async function OcorrenciasPage({
  searchParams,
}: {
  searchParams: { status?: string; view?: string; pagina?: string };
}) {
  const user = (await getSessionUser())!;
  const status = (['OPEN', 'IN_PROGRESS', 'CLOSED'].includes(searchParams.status ?? '')
    ? searchParams.status
    : undefined) as OccurrenceStatus | undefined;
  const isMaint = searchParams.view === 'manutencao';
  const isIT = searchParams.view === 'ti';
  const pagina = Math.max(Number(searchParams.pagina) || 1, 1);

  const escopo = { maintenance: isMaint ? true : undefined, it: isIT ? true : undefined };

  /** Monta um link preservando os outros filtros — sem isso, trocar de página
   *  perdia a visão e a situação escolhidas. */
  const link = (p: { view?: string | null; status?: string | null; pagina?: number | null }) => {
    const sp = new URLSearchParams();
    const view = p.view === undefined ? searchParams.view : p.view;
    const st = p.status === undefined ? status : p.status;
    const pg = p.pagina === undefined ? pagina : p.pagina;
    if (view) sp.set('view', view);
    if (st) sp.set('status', st);
    if (pg && pg > 1) sp.set('pagina', String(pg));
    const qs = sp.toString();
    return `/modulos/ocorrencias${qs ? `?${qs}` : ''}`;
  };

  const [summary, lista] = await Promise.all([
    // Escopo repassado: sem isto os cartões contavam a rede inteira dentro das
    // abas Manutenção e TI, e trocar de aba não mudava número nenhum.
    getOccurrenceSummary(user, escopo),
    listOccurrences(user, { status, ...escopo, limit: POR_PAGINA, page: pagina }),
  ]);

  const abertas = summary.open + summary.inProgress;
  const items: OccItem[] = lista.items.map((o) => ({
    id: o.id,
    number: o.number,
    unitName: o.unit.name,
    unitCode: o.unit.code,
    typeName: o.typeName,
    categoryName: o.categoryName,
    description: o.description,
    gravity: o.gravity,
    status: o.status,
    isRecurrence: o.isRecurrence,
    attachments: o._count.attachments,
    createdAt: o.createdAt.toISOString(),
  }));

  const primeiro = lista.total === 0 ? 0 : (pagina - 1) * POR_PAGINA + 1;
  const ultimo = Math.min(pagina * POR_PAGINA, lista.total);
  const ondeEstou = isMaint ? 'de manutenção' : isIT ? 'de TI' : '';

  return (
    <div className="space-y-5">
      <LargeTitle
        title="Ocorrências"
        subtitle="Registre o que saiu do padrão na operação. A supervisão acompanha e encerra com ação corretiva."
        actions={
          <Link href="/modulos/ocorrencias/nova">
            <Button size="sm"><Plus className="h-4 w-4" /> Nova</Button>
          </Link>
        }
      />

      {/* Eixo 1 — ASSUNTO. Rotulado, para não parecer o mesmo que a situação. */}
      <div className="space-y-1.5">
        <p className="sgo-type-11 px-1 text-ink-500">ASSUNTO</p>
        <SegmentedNav
          aria-label="Assunto das ocorrências"
          value={isMaint ? 'manutencao' : isIT ? 'ti' : 'geral'}
          options={[
            { value: 'geral', label: 'Geral', href: link({ view: null, pagina: 1 }) },
            { value: 'manutencao', label: 'Manutenção', href: link({ view: 'manutencao', pagina: 1 }) },
            { value: 'ti', label: 'TI', href: link({ view: 'ti', pagina: 1 }) },
          ]}
        />
      </div>

      {isIT && (
        <Banner
          tone="info"
          title="Ocorrências de tipos marcados como TI"
          description="Configuráveis em Configurações → Ocorrências. Preparado para a futura integração com o sistema de gestão de TI."
        />
      )}

      {isMaint && (
        <Banner
          tone="info"
          title="Chamados e planos preventivos ficam no módulo Manutenção"
          action={<Link href="/modulos/manutencao" className="text-xs font-semibold text-brand hover:underline">Abrir Manutenção →</Link>}
        />
      )}

      {/* Resumo — agora do assunto selecionado, e cada cartão se explica. */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard
          label="Abertas"
          value={abertas}
          hint={ondeEstou ? `ocorrências ${ondeEstou}` : 'em toda a operação'}
        />
        <StatCard
          label="Críticas"
          value={summary.criticalOpen}
          hint={summary.criticalOpen > 0 ? 'exigem ação hoje' : 'nenhuma no momento'}
        />
        <StatCard
          label="Há mais de 48h"
          value={summary.openOver48h}
          // O "de N abertas" evita a leitura errada de antes: 123 sozinho
          // parecia alarme, quando na verdade é quase tudo o que está aberto.
          hint={abertas > 0 ? `de ${abertas} abertas` : undefined}
        />
      </div>

      {/* Alerta só para o que é REALMENTE urgente. O banner de antes repetia o
          cartão "há mais de 48h" com outras palavras, e com 123 de 124 nessa
          situação o "priorize estas" não priorizava nada. */}
      {summary.criticalOpen > 0 && (
        <Banner
          tone="danger"
          title={`${summary.criticalOpen} ocorrência(s) crítica(s) aberta(s)`}
          description="Gravidade crítica avisa a diretoria na abertura. Encerre com ação corretiva."
          action={<Link href={link({ status: 'OPEN', pagina: 1 })} className="text-xs font-semibold text-brand hover:underline">Ver abertas →</Link>}
        />
      )}

      {/* Eixo 2 — SITUAÇÃO, rotulada e colada na lista, onde filtro pertence. */}
      <div className="space-y-1.5">
        <p className="sgo-type-11 px-1 text-ink-500">SITUAÇÃO</p>
        <SegmentedNav
          aria-label="Filtrar por situação"
          value={status ?? 'TODAS'}
          options={[
            { value: 'TODAS', label: 'Todas', href: link({ status: null, pagina: 1 }) },
            { value: 'OPEN', label: 'Abertas', href: link({ status: 'OPEN', pagina: 1 }) },
            { value: 'IN_PROGRESS', label: 'Em andamento', href: link({ status: 'IN_PROGRESS', pagina: 1 }) },
            { value: 'CLOSED', label: 'Encerradas', href: link({ status: 'CLOSED', pagina: 1 }) },
          ]}
        />
      </div>

      {/* Lista — busca, filtros (unidade/gravidade) e unidades recolhidas */}
      <OccurrencesClient items={items} />

      {/* Paginação. Antes a lista era cortada em 50 SEM AVISO: os cartões diziam
          124 abertas e a tela mostrava cinquenta linhas, sem nada indicando que
          74 tinham ficado de fora. */}
      {lista.total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-line bg-surface px-3 py-2">
          <p className="sgo-type-13 text-ink-500">
            Mostrando <span className="font-semibold text-ink-900">{primeiro}–{ultimo}</span> de{' '}
            <span className="font-semibold text-ink-900">{lista.total}</span>
            {lista.total > POR_PAGINA ? ' — use as setas para ver o resto' : ''}
          </p>
          {lista.total > POR_PAGINA && (
            <div className="flex items-center gap-2">
              {pagina > 1 ? (
                <Link href={link({ pagina: pagina - 1 })}>
                  <Button size="sm" variant="secondary"><ChevronLeft className="h-4 w-4" /> Anterior</Button>
                </Link>
              ) : (
                <Button size="sm" variant="secondary" disabled><ChevronLeft className="h-4 w-4" /> Anterior</Button>
              )}
              {lista.hasMore ? (
                <Link href={link({ pagina: pagina + 1 })}>
                  <Button size="sm" variant="secondary">Próxima <ChevronRight className="h-4 w-4" /></Button>
                </Link>
              ) : (
                <Button size="sm" variant="secondary" disabled>Próxima <ChevronRight className="h-4 w-4" /></Button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
