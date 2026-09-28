import Link from 'next/link';
import { getSessionUser } from '@/lib/auth/session';
import { abasDoPerfil } from '@/lib/permissions/abas-server';
import { podeAba } from '@/lib/permissions/abas';
import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';

import { listOccurrences, getOccurrenceSummary, getOccurrenceTypes } from '@/lib/occurrences/query';
import { responsaveisDoAndamento, TRATA_OCORRENCIA } from '@/lib/occurrences/lote';
import { lerFiltrosDaLista, linkDaLista, SITUACOES, type FiltrosDaLista } from '@/lib/occurrences/contexto';
import { Button } from '@/components/ui/ds/button';
import { LargeTitle } from '@/components/layout/page-chrome';
import { StatCard } from '@/components/ui/ds/stat-card';
import { Banner } from '@/components/ui/ds/banner';
import { SegmentedNav } from '@/components/ui/ds/segmented-nav';
import { Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import { OccurrencesClient, type OccItem } from '@/components/occurrences/occurrences-client';

export const dynamic = 'force-dynamic';

const POR_PAGINA = 50;

/**
 * Dois eixos, e eles NÃO são a mesma coisa:
 *  · a visão (Geral / Manutenção / TI) diz de que assunto a ocorrência trata;
 *  · a situação (Todas / Abertas / …) diz em que ponto do fluxo ela está.
 *
 * v1.128.0 — tratamento: todo filtro (situação, assunto, página, busca,
 * unidade, gravidade, ordem) vive na URL, lido por `lerFiltrosDaLista`; é o
 * endereço que o detalhe recebe em `voltar=` e para onde o encerramento
 * devolve o supervisor. As situações mostram a contagem; Abertas/Em andamento
 * ganham seleção e lote.
 */
export default async function OcorrenciasPage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const user = (await getSessionUser())!;
  const abasOcorrencias = await abasDoPerfil(user.role, 'OCCURRENCES');
  const filtros = lerFiltrosDaLista({ get: (k) => searchParams[k] ?? null });
  const { status, view, pagina } = filtros;
  const isMaint = view === 'manutencao';
  const isIT = view === 'ti';
  const isCritico = view === 'critico';

  const escopo = {
    maintenance: isMaint ? true : undefined,
    it: isIT ? true : undefined,
    critical: isCritico ? true : undefined,
  };

  /** Link preservando os outros filtros — trocar de página/situação não perde busca, unidade, gravidade nem ordem. */
  type Troca = Omit<Partial<FiltrosDaLista>, 'view' | 'status'> & { view?: FiltrosDaLista['view'] | null; status?: FiltrosDaLista['status'] | null };
  const link = (p: Troca) => {
    const { view: v, status: st, ...resto } = p;
    return linkDaLista({
      ...filtros, ...resto,
      view: v === null ? undefined : (v ?? filtros.view),
      status: st === null ? undefined : (st ?? filtros.status),
    });
  };

  const podeTratar = TRATA_OCORRENCIA.includes(user.role);
  const [summary, lista, unidades, tipos] = await Promise.all([
    // Escopo repassado (assunto + unidade + gravidade + busca): os contadores
    // das situações dizem o que a lista mostra, não a rede inteira.
    getOccurrenceSummary(user, { ...escopo, unitId: filtros.unitId, gravity: filtros.gravity, q: filtros.q }),
    listOccurrences(user, { status, ...escopo, unitId: filtros.unitId, gravity: filtros.gravity, q: filtros.q, ordem: filtros.ordem, limit: POR_PAGINA, page: pagina }),
    prisma.unit.findMany({ where: { active: true, ...unitScopeWhere(user, 'id') }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    podeTratar ? getOccurrenceTypes() : Promise.resolve([]),
  ]);
  const andamento = await responsaveisDoAndamento(lista.items.filter((o) => o.status === 'IN_PROGRESS').map((o) => o.id));

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
    origemChecklist: Boolean(o.sourceTaskItemId),
    andamento: andamento.has(o.id) ? { nome: andamento.get(o.id)!.nome, em: andamento.get(o.id)!.em.toISOString() } : null,
  }));

  const contagem: Record<string, number> = {
    TODAS: summary.open + summary.inProgress + summary.closed,
    OPEN: summary.open,
    IN_PROGRESS: summary.inProgress,
    CLOSED: summary.closed,
  };

  const primeiro = lista.total === 0 ? 0 : (pagina - 1) * POR_PAGINA + 1;
  const ultimo = Math.min(pagina * POR_PAGINA, lista.total);
  const ondeEstou = isMaint ? 'de manutenção' : isIT ? 'de TI' : isCritico ? 'críticas' : '';

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

      {/* Eixo 1 — ASSUNTO. */}
      <div className="space-y-1.5">
        <p className="sgo-type-11 px-1 text-ink-500">ASSUNTO</p>
        <SegmentedNav
          aria-label="Assunto das ocorrências"
          value={view ?? 'geral'}
          options={[
            { value: 'geral', label: 'Geral', href: link({ view: null, pagina: 1 }) },
            { value: 'critico', label: 'Geral Crítico', href: link({ view: 'critico', pagina: 1 }) },
            { value: 'manutencao', label: 'Manutenção', href: link({ view: 'manutencao', pagina: 1 }) },
            { value: 'ti', label: 'TI', href: link({ view: 'ti', pagina: 1 }) },
          ].filter((o) => podeAba(abasOcorrencias, o.value))}
        />
      </div>

      {isCritico && (
        <Banner
          tone="warning"
          title="Ocorrências de gravidade Alta ou Crítica, de todos os assuntos"
          description="É uma lente, não uma caixa separada: o que afeta o funcionamento da unidade, a segurança ou o atendimento aparece AQUI e também na aba do assunto dele. Uma falta de energia continua sendo manutenção — quem conserta precisa continuar vendo."
        />
      )}
      {isIT && (
        <Banner tone="info" title="Ocorrências de tipos marcados como TI" description="Configuráveis em Configurações → Ocorrências. Preparado para a futura integração com o sistema de gestão de TI." />
      )}
      {isMaint && (
        <Banner
          tone="info"
          title="Chamados e planos preventivos ficam no módulo Manutenção"
          action={<Link href="/modulos/manutencao" className="text-xs font-semibold text-brand hover:underline">Abrir Manutenção →</Link>}
        />
      )}

      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Abertas" value={abertas} hint={ondeEstou ? `ocorrências ${ondeEstou}` : 'em toda a operação'} />
        <StatCard label="Críticas" value={summary.criticalOpen} hint={summary.criticalOpen > 0 ? 'exigem ação hoje' : 'nenhuma no momento'} />
        <StatCard label="Há mais de 48h" value={summary.openOver48h} hint={abertas > 0 ? `de ${abertas} abertas` : undefined} />
      </div>

      {summary.criticalOpen > 0 && (
        <Banner
          tone="danger"
          title={`${summary.criticalOpen} ocorrência(s) crítica(s) aberta(s)`}
          description="Gravidade crítica avisa a diretoria na abertura. Encerre com ação corretiva."
          action={<Link href={link({ status: 'OPEN', pagina: 1 })} className="text-xs font-semibold text-brand hover:underline">Ver abertas →</Link>}
        />
      )}

      {/* Eixo 2 — SITUAÇÃO, com a contagem do que está filtrado. */}
      <div className="space-y-1.5">
        <p className="sgo-type-11 px-1 text-ink-500">SITUAÇÃO</p>
        <SegmentedNav
          aria-label="Filtrar por situação"
          value={status ?? 'TODAS'}
          options={SITUACOES.map((s) => ({
            value: s.value,
            label: `${s.label} (${contagem[s.value]})`,
            href: link({ status: s.value === 'TODAS' ? null : s.value, pagina: 1 }),
          }))}
        />
      </div>

      <OccurrencesClient
        items={items}
        filtros={filtros}
        unidades={unidades}
        tipos={tipos.map((t) => ({ id: t.id, name: t.name, categories: t.categories.map((c) => ({ id: c.id, name: c.name })) }))}
        podeTratar={podeTratar}
        totalNaPagina={lista.items.length}
      />

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
                <Link href={link({ pagina: pagina - 1 })}><Button size="sm" variant="secondary"><ChevronLeft className="h-4 w-4" /> Anterior</Button></Link>
              ) : (
                <Button size="sm" variant="secondary" disabled><ChevronLeft className="h-4 w-4" /> Anterior</Button>
              )}
              {lista.hasMore ? (
                <Link href={link({ pagina: pagina + 1 })}><Button size="sm" variant="secondary">Próxima <ChevronRight className="h-4 w-4" /></Button></Link>
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
