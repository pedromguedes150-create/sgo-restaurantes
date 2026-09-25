import Link from 'next/link';
import { ArrowLeft, FileText, Users, ClipboardList, CheckCircle2, Clock, AlertTriangle, Percent } from 'lucide-react';
import { FamilyTabs } from '@/components/layout/family-tabs';
import { LargeTitle } from '@/components/layout/page-chrome';
import { getSessionUser } from '@/lib/auth/session';
import { getPainelTreinamentos, filtrosDaUrl, urlDosFiltros } from '@/lib/treinamentos/painel';
import { emData, emPercentual, statusEfetivo, type LinhaTreinamento, type StatusTreino } from '@/lib/treinamentos/agregacao';
import { ORIGEM_LABEL } from '@/lib/treinamentos/aplicabilidade';
import { PainelFiltros } from '@/components/training/painel-filtros';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatCard } from '@/components/ui/ds/stat-card';
import { StatusBadge } from '@/components/ui/status-badge';

export const dynamic = 'force-dynamic';

type Visao = 'unidades' | 'treinamentos' | 'funcoes' | 'colaboradores' | 'detalhado';
const VISOES: { id: Visao; label: string }[] = [
  { id: 'unidades', label: 'Por unidade' },
  { id: 'treinamentos', label: 'Por treinamento' },
  { id: 'funcoes', label: 'Por função' },
  { id: 'colaboradores', label: 'Por colaborador' },
  { id: 'detalhado', label: 'Relatório detalhado' },
];

const ST: Record<StatusTreino, { tone: 'success' | 'medium' | 'critical'; label: string }> = {
  DONE: { tone: 'success', label: 'Concluído' },
  PENDING: { tone: 'medium', label: 'Pendente' },
  MISSED: { tone: 'critical', label: 'Atrasado' },
};

/**
 * TREINAMENTOS — ACOMPANHAMENTO (Supervisor/Admin/CEO).
 *
 * A base de todo número é "o que se aplica a cada pessoa" (geral da unidade +
 * função + vínculo individual), nunca "todos os POPs do sistema": João com 8
 * aplicáveis e 6 feitos está em 75%, não em 6/30. Navegação por drill-down:
 * rede → unidade → função → colaborador → treinamento, e rede → treinamento →
 * colaboradores aplicáveis. Tudo por URL, para o link e o PDF baterem com a tela.
 */
export default async function AcompanhamentoPage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const user = (await getSessionUser())!;
  const filtros = filtrosDaUrl(searchParams);
  const visao: Visao = (VISOES.find((v) => v.id === searchParams.visao)?.id) ?? 'unidades';
  const { painel, opcoes, hoje, mesAtual, historicoDoColaborador } = await getPainelTreinamentos(user, filtros);
  const { resumo } = painel;

  const link = (patch: Record<string, string | undefined>, v: Visao = visao) => `/modulos/treinamentos/acompanhamento${urlDosFiltros(filtros, { ...patch, visao: v })}`;
  const linkPdf = `/modulos/treinamentos/acompanhamento/relatorio${urlDosFiltros(filtros, { imprimir: '1' })}`;

  const periodoTexto = filtros.de || filtros.ate
    ? `Prazo de ${filtros.de ? emData(filtros.de) : 'início'} até ${filtros.ate ? emData(filtros.ate) : 'hoje'}`
    : `Ciclo vigente (${mesAtual.slice(5)}/${mesAtual.slice(0, 4)})`;

  const colaboradorAberto = filtros.collaboratorId ? painel.porColaborador.find((c) => c.collaboratorId === filtros.collaboratorId) ?? null : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href="/modulos/treinamentos" className="inline-flex items-center gap-1 text-sm font-semibold text-brand"><ArrowLeft className="h-4 w-4" /> Treinamentos da unidade</Link>
        <a href={linkPdf} target="_blank" rel="noreferrer" className="sgo-control inline-flex items-center gap-1 rounded-control bg-brand px-3 py-1.5 text-sm font-semibold text-on-brand hover:bg-brand-hover">
          <FileText className="h-4 w-4" /> Gerar Relatório PDF
        </a>
      </div>
      <LargeTitle title="Treinamentos — Acompanhamento" />
      <FamilyTabs active="/modulos/treinamentos/acompanhamento" />
      <p className="text-sm text-ink-500">
        Cada colaborador é medido só pelos treinamentos que realmente deveria realizar: os gerais da unidade, os da sua função e os atribuídos a ele. {periodoTexto}.
      </p>

      <PainelFiltros filtros={filtros} opcoes={opcoes} visao={visao} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Colaboradores" value={resumo.colaboradores} hint="com treinamentos aplicáveis" icon={Users} />
        <StatCard label="Previstos" value={resumo.previstos} hint="atribuições aplicáveis" icon={ClipboardList} />
        <StatCard label="Concluídos" value={resumo.concluidos} tone="success" icon={CheckCircle2} />
        <StatCard label="Pendentes" value={resumo.pendentes} tone={resumo.pendentes > 0 ? 'warning' : 'default'} hint="no prazo" icon={Clock} />
        <StatCard label="Atrasados" value={resumo.atrasados} tone={resumo.atrasados > 0 ? 'danger' : 'default'} hint="prazo vencido" icon={AlertTriangle} />
        <StatCard label="Conclusão" value={emPercentual(resumo.taxa)} hint={filtros.unitId || filtros.jobTitle || filtros.popId || filtros.collaboratorId ? 'do recorte' : 'da rede'} icon={Percent} />
      </div>

      <nav aria-label="Visão" className="sgo-sem-barra flex gap-1 overflow-x-auto rounded-pill bg-sunken p-1">
        {VISOES.map((v) => (
          <Link
            key={v.id}
            href={link({}, v.id)}
            className={`whitespace-nowrap rounded-pill px-3 py-1.5 text-sm font-semibold ${visao === v.id ? 'bg-surface text-brand shadow-sgo-card' : 'text-ink-700 hover:text-ink-900'}`}
          >
            {v.label}
          </Link>
        ))}
      </nav>

      {visao === 'unidades' && (
        <Card>
          <CardHeader><CardTitle>Resultado por unidade</CardTitle></CardHeader>
          <CardContent>
            <p className="mb-2 text-xs text-ink-500">Clique na unidade para ver quem forma a pendência. Menor conclusão primeiro.</p>
            <Tabela
              cabecalho={['Unidade', 'Previstos', 'Concluídos', 'Pendentes', 'Atrasados', 'Conclusão']}
              linhas={painel.porUnidade.map((u) => ({
                key: u.unitId,
                href: link({ unit: u.unitId }, 'colaboradores'),
                celulas: [u.unitName, u.previstos, u.concluidos, <Num key="p" n={u.pendentes} tone="warning" />, <Num key="a" n={u.atrasados} tone="danger" />, emPercentual(u.taxa)],
              }))}
              vazio="Nenhuma atribuição no recorte."
            />
          </CardContent>
        </Card>
      )}

      {visao === 'treinamentos' && (
        <Card>
          <CardHeader><CardTitle>Resultado por treinamento</CardTitle></CardHeader>
          <CardContent>
            <p className="mb-2 text-xs text-ink-500">Clique no treinamento para ver exatamente quem ainda não realizou.</p>
            <Tabela
              cabecalho={['Treinamento', 'Aplicáveis', 'Concluídos', 'Pendentes', 'Atrasados', 'Conclusão']}
              linhas={painel.porTreinamento.map((t) => ({
                key: t.popId,
                href: link({ pop: t.popId }, 'detalhado'),
                celulas: [t.popTitle, t.previstos, t.concluidos, <Num key="p" n={t.pendentes} tone="warning" />, <Num key="a" n={t.atrasados} tone="danger" />, emPercentual(t.taxa)],
              }))}
              vazio="Nenhum treinamento no recorte."
            />
          </CardContent>
        </Card>
      )}

      {visao === 'funcoes' && (
        <Card>
          <CardHeader><CardTitle>Resultado por função</CardTitle></CardHeader>
          <CardContent>
            <Tabela
              cabecalho={['Função', 'Colaboradores', 'Previstos', 'Concluídos', 'Pendentes', 'Atrasados', 'Conclusão']}
              linhas={painel.porFuncao.map((f) => ({
                key: f.jobTitle,
                href: link({ funcao: f.jobTitle === 'Sem função cadastrada' ? undefined : f.jobTitle }, 'colaboradores'),
                celulas: [f.jobTitle, f.colaboradores, f.previstos, f.concluidos, <Num key="p" n={f.pendentes} tone="warning" />, <Num key="a" n={f.atrasados} tone="danger" />, emPercentual(f.taxa)],
              }))}
              vazio="Nenhuma função no recorte."
            />
          </CardContent>
        </Card>
      )}

      {visao === 'colaboradores' && !colaboradorAberto && (
        <Card>
          <CardHeader><CardTitle>Por colaborador</CardTitle></CardHeader>
          <CardContent>
            <p className="mb-2 text-xs text-ink-500">Clique para abrir o histórico com a origem de cada atribuição.</p>
            <Tabela
              cabecalho={['Colaborador', 'Função', 'Unidade', 'Aplicáveis', 'Concluídos', 'Pendentes', 'Atrasados', 'Conclusão']}
              linhas={painel.porColaborador.map((c) => ({
                key: `${c.collaboratorId}|${c.unitId}`,
                href: link({ colab: c.collaboratorId }),
                celulas: [c.name, c.jobTitle ?? '—', c.unitName, c.previstos, c.concluidos, <Num key="p" n={c.pendentes} tone="warning" />, <Num key="a" n={c.atrasados} tone="danger" />, emPercentual(c.taxa)],
              }))}
              vazio="Nenhum colaborador no recorte."
            />
          </CardContent>
        </Card>
      )}

      {visao === 'colaboradores' && colaboradorAberto && (
        <Card>
          <CardHeader>
            <CardTitle>{colaboradorAberto.name}</CardTitle>
            <p className="text-sm text-ink-500">{colaboradorAberto.jobTitle ?? 'Sem função cadastrada'} · {colaboradorAberto.unitName}</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard label="Aplicáveis" value={colaboradorAberto.previstos} />
              <StatCard label="Concluídos" value={colaboradorAberto.concluidos} tone="success" />
              <StatCard label="Pendentes" value={colaboradorAberto.pendentes + colaboradorAberto.atrasados} tone={colaboradorAberto.pendentes + colaboradorAberto.atrasados > 0 ? 'warning' : 'default'} hint={colaboradorAberto.atrasados > 0 ? `${colaboradorAberto.atrasados} atrasado(s)` : undefined} />
              <StatCard label="Conclusão" value={emPercentual(colaboradorAberto.taxa)} />
            </div>
            <ul className="divide-y divide-line">
              {colaboradorAberto.itens.map((it) => <ItemDoColaborador key={it.recordId} it={it} hoje={hoje} />)}
            </ul>
            {historicoDoColaborador.filter((h) => !colaboradorAberto.itens.some((i) => i.recordId === h.recordId)).length > 0 && (
              <div>
                <p className="sgo-type-11 mb-1 font-semibold text-ink-500">Histórico (ciclos anteriores)</p>
                <p className="mb-2 text-xs text-ink-500">O que foi realizado e quando, mesmo que a função tenha mudado depois. Nada é apagado.</p>
                <ul className="divide-y divide-line">
                  {historicoDoColaborador
                    .filter((h) => !colaboradorAberto.itens.some((i) => i.recordId === h.recordId))
                    .map((it) => <ItemDoColaborador key={it.recordId} it={it} hoje={hoje} ciclo />)}
                </ul>
              </div>
            )}
            <Link href={link({ colab: undefined })} className="text-sm font-semibold text-brand">← Todos os colaboradores</Link>
          </CardContent>
        </Card>
      )}

      {visao === 'detalhado' && (
        <Card>
          <CardHeader><CardTitle>Relatório detalhado</CardTitle></CardHeader>
          <CardContent>
            <p className="mb-2 text-xs text-ink-500">{painel.detalhado.length} atribuição(ões) no recorte.</p>
            <Tabela
              cabecalho={['Colaborador', 'Função', 'Unidade', 'Treinamento', 'Origem', 'Status', 'Data da conclusão']}
              linhas={painel.detalhado.map((l) => {
                const s = statusEfetivo(l, hoje);
                return {
                  key: l.recordId,
                  href: link({ colab: l.collaboratorId }, 'colaboradores'),
                  celulas: [l.collaboratorName, l.jobTitle ?? '—', l.unitName, l.popTitle, ORIGEM_LABEL[l.origin], <StatusBadge key="s" tone={ST[s].tone}>{ST[s].label}</StatusBadge>, emData(l.completedAt)],
                };
              })}
              vazio="Nenhuma atribuição no recorte."
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Num({ n, tone }: { n: number; tone: 'warning' | 'danger' }) {
  if (n === 0) return <span className="text-ink-400">0</span>;
  return <span className={`font-semibold ${tone === 'warning' ? 'text-warning' : 'text-danger'}`}>{n}</span>;
}

function ItemDoColaborador({ it, hoje, ciclo }: { it: LinhaTreinamento; hoje: string; ciclo?: boolean }) {
  const s = statusEfetivo(it, hoje);
  return (
    <li className="flex items-center justify-between gap-2 py-2">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-ink-900">{it.popTitle}{ciclo ? <span className="text-xs text-ink-500"> · {it.recurrence === 'MONTHLY' ? `${it.periodKey.slice(5)}/${it.periodKey.slice(0, 4)}` : `v${it.popVersion}`}</span> : null}</p>
        <p className="text-xs text-ink-500">Origem: {ORIGEM_LABEL[it.origin]} · prazo {emData(it.dueDate)}{it.completedAt ? ` · concluído em ${emData(it.completedAt)}` : ''}</p>
      </div>
      <StatusBadge tone={ST[s].tone}>{ST[s].label}</StatusBadge>
    </li>
  );
}

function Tabela({ cabecalho, linhas, vazio }: {
  cabecalho: string[];
  linhas: { key: string; href?: string; celulas: React.ReactNode[] }[];
  vazio: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left sgo-type-11 text-ink-500">
            {cabecalho.map((h, i) => <th key={h} className={`py-1.5 pr-2 font-semibold ${i > 0 ? 'text-right' : ''}`}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {linhas.length === 0 && <tr><td colSpan={cabecalho.length} className="py-3 text-ink-500">{vazio}</td></tr>}
          {linhas.map((l) => (
            <tr key={l.key} className="border-b border-line hover:bg-sunken">
              {l.celulas.map((c, i) => (
                <td key={i} className={`py-1.5 pr-2 tabular-nums ${i > 0 ? 'text-right' : 'font-medium text-ink-900'}`}>
                  {l.href && i === 0 ? <Link href={l.href} className="text-brand hover:underline">{c}</Link> : c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
