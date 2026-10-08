import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import {
  ArrowLeft, Award, BadgeCheck, Briefcase, Building2, CalendarClock, CalendarDays, Car, Clock3, FileHeart, GraduationCap,
  History, IdCard, Palmtree, Percent, Timer, UserRound, type LucideIcon,
} from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { permissaoDeRota } from '@/lib/permissions/links';
import { abasDoPerfil } from '@/lib/permissions/abas-server';
import { getPerfil360, STATUS_HE } from '@/lib/people/perfil-360';
import type { PeriodoAquisitivo } from '@/lib/people/periodo-aquisitivo';
import { LargeTitle } from '@/components/layout/page-chrome';
import { Card, CardContent, PanelHeader } from '@/components/sgo/panel';
import { HistoricoColaborador } from '@/components/people/historico-colaborador';
import { PerfilAcoes, type AcaoDoPerfil } from '@/components/people/perfil-acoes';
import { shortUnitName } from '@/lib/unit-name';

export const dynamic = 'force-dynamic';

const br = (iso: string | null | undefined) => (iso ? iso.split('-').reverse().join('/') : '—');
const real = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const mesAno = (ym: string) => `${ym.slice(5, 7)}/${ym.slice(0, 4)}`;
const iniciais = (nome: string) => nome.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
const um = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });

const SITUACAO: Record<PeriodoAquisitivo['situacao'], { txt: string; cls: string }> = {
  EM_AQUISICAO: { txt: 'Em aquisição', cls: 'sgo-tag--blue' },
  A_VENCER: { txt: 'A conceder', cls: 'sgo-tag--amber' },
  VENCIDO: { txt: 'Vencido', cls: 'sgo-tag--red' },
  QUITADO: { txt: 'Quitado', cls: 'sgo-tag--green' },
  ANTERIOR_AO_SGO: { txt: 'Anterior ao SGO', cls: 'sgo-tag--gray' },
};
const TIPO_ESCALA: Record<string, string> = { TWELVE36_ODD: '12x36 (ímpar)', TWELVE36_EVEN: '12x36 (par)', SIX_ONE: '6x1', FIVE_TWO: '5x2', CUSTOM: 'Personalizada' };

type Tom = 'brand' | 'blue' | 'green' | 'amber' | 'red' | 'sky' | 'violet' | 'gray';

/**
 * Linha de indicador (v1.162.1): cápsula de ícone + rótulo + valor + apoio,
 * numa lista compacta dentro do grupo. Substitui os cartões KPI soltos, que
 * ficavam estreitos e com buracos quando o perfil não via um dos módulos.
 */
function Indicador({ icon: Icon, tone, label, value, meta, testId }: { icon: LucideIcon; tone: Tom; label: string; value: ReactNode; meta?: ReactNode; testId?: string }) {
  return (
    <div className="flex items-start gap-3 px-4 py-2.5" data-testid={testId}>
      <span className={`sgo-kpi__ic sgo-kpi__ic--${tone} shrink-0`} aria-hidden><Icon className="h-4 w-4" /></span>
      <div className="min-w-0 flex-1">
        <p className="sgo-type-11 text-ink-500">{label}</p>
        <p className="sgo-type-15 break-words font-semibold text-ink-900">{value}</p>
        {meta && <p className="sgo-type-11 text-ink-500">{meta}</p>}
      </div>
    </div>
  );
}

/** Grupo de indicadores: painel com título e linhas separadas por fio. */
function Grupo({ title, icon, tone, children, testId }: { title: string; icon: LucideIcon; tone: Tom; children: ReactNode; testId?: string }) {
  const Icon = icon;
  return (
    <Card className="h-full" data-testid={testId}>
      <PanelHeader title={title} icon={<span className={`sgo-panel__ic sgo-panel__ic--${tone}`} aria-hidden><Icon className="h-4 w-4" /></span>} />
      <div className="divide-y divide-line">{children}</div>
    </Card>
  );
}

/**
 * PERFIL 360 (v1.153.0; layout reorganizado na v1.162.1) — tudo sobre o
 * colaborador em um só lugar. Só leitura: cada número vem do módulo de origem
 * (ver `getPerfil360`) e cada bloco só aparece se o perfil de quem abre pode
 * ver aquele módulo. Indicadores agrupados por contexto (dados profissionais,
 * jornada, desempenho, RH e benefícios); ações primárias em botões e as
 * demais num menu.
 */
export default async function Perfil360Page({ params }: { params: { id: string } }) {
  const user = (await getSessionUser())!;
  /* Mesma porta da lista de colaboradores (aba Colaboradores de Pessoas). */
  if ((await abasDoPerfil(user.role, 'PEOPLE')).col?.canView === false) notFound();
  const pode = await permissaoDeRota(user.role);
  const p = await getPerfil360(user, params.id, pode);
  if (!p) notFound();
  const c = p.colaborador;
  const f = p.ferias;
  const foco = f.foco;
  const unidadePrincipal = c.unidades[0];

  const feriasValor = f.faixa === 'SEM_ADMISSAO' ? 'Sem admissão'
    : f.emGozo ? 'Em gozo'
    : !foco ? 'Em dia'
    : foco.situacao === 'VENCIDO' ? 'Vencida'
    : foco.situacao === 'A_VENCER' ? (foco.diasParaVencer <= 30 ? 'Vence em breve' : 'A conceder')
    : 'Em aquisição';
  const feriasTom: Tom = f.faixa === 'VENCIDA' ? 'red' : f.faixa === 'ATE_30' ? 'amber' : f.faixa === 'SEM_ADMISSAO' ? 'gray' : 'green';
  const feriasMeta = f.emGozo ? `${br(f.emGozo.inicio)} a ${br(f.emGozo.fim)}`
    : !foco ? (f.faixa === 'SEM_ADMISSAO' ? 'o RH não informou a admissão' : undefined)
    : foco.situacao === 'EM_AQUISICAO' ? `completa em ${br(foco.fim)}`
    : `saldo ${foco.saldo} dias · limite ${br(foco.limite)}`;

  /* Ações: avaliar e escala são o dia a dia (botões); o resto vai para o menu. */
  const primarias: AcaoDoPerfil[] = [];
  const secundarias: AcaoDoPerfil[] = [];
  if (p.podeVer.avaliacao) primarias.push({ label: 'Avaliar', href: '/modulos/pessoas/avaliacao', icone: 'avaliar' });
  if (pode('/modulos/escala') && unidadePrincipal) primarias.push({ label: 'Escala', href: `/modulos/escala?unit=${unidadePrincipal.id}`, icone: 'escala' });
  secundarias.push({ label: 'Controle de férias', href: `/modulos/pessoas/ferias${unidadePrincipal ? `?unidade=${unidadePrincipal.id}` : ''}`, icone: 'ferias' });
  secundarias.push({ label: 'Vender dias de férias', href: `/modulos/pessoas/ferias?aba=abono${unidadePrincipal ? `&unidade=${unidadePrincipal.id}` : ''}`, icone: 'vender' });
  secundarias.push({ label: 'Corrigir férias', href: `/modulos/pessoas/ferias?aba=ajustes&colaborador=${c.id}`, icone: 'corrigir', testId: 'corrigir-ferias' });
  if (p.podeVer.horaExtra && pode('/modulos/hora-extra')) secundarias.push({ label: 'Hora extra', href: '/modulos/hora-extra', icone: 'horaExtra' });

  const mostraRh = p.podeVer.mobilidade;
  const mostraDesempenho = !!p.avaliacao || !!p.treinamentos;
  const mostraJornada = !!p.horaExtra || !!p.atestados || true;

  return (
    <div className="space-y-4" data-testid="perfil-360">
      <Link href="/modulos/pessoas" className="inline-flex items-center gap-1 text-sm font-semibold text-brand print:hidden"><ArrowLeft className="h-4 w-4" /> Colaboradores</Link>
      <LargeTitle title="Perfil 360" subtitle="Tudo sobre o colaborador em um só lugar — dados do RH e dos módulos do SGO." />

      {/* Cabeçalho do colaborador */}
      <div className="sgo-panel sgo-panel--solid p-4" data-testid="perfil-cabecalho">
        <div className="flex flex-col gap-4 md:flex-row md:items-start">
          <div className="flex min-w-0 flex-1 items-start gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-card bg-brand text-xl font-bold text-on-brand" aria-hidden>{iniciais(c.nome)}</div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="sgo-type-20 font-bold text-ink-900">{c.nome}</h2>
                <span className={`sgo-tag ${c.ativo ? 'sgo-tag--green' : 'sgo-tag--gray'}`}>{c.ativo ? 'Ativo' : 'Inativo'}</span>
                {f.emGozo && <span className="sgo-tag sgo-tag--blue">Em férias</span>}
                {p.desligamento?.status === 'PENDING' && <span className="sgo-tag sgo-tag--red">Desligamento em análise</span>}
                {p.experiencia && <span className="sgo-tag sgo-tag--amber">Em experiência</span>}
              </div>
              <p className="mt-1 sgo-type-15 font-semibold text-ink-700">
                {c.funcao ?? 'Sem função no RH'}
                <span className="font-normal text-ink-500"> · {c.unidades.map((u) => shortUnitName(u.nome)).join(', ') || 'sem unidade'}</span>
              </p>
              <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 sgo-type-11 text-ink-500">
                <div className="inline-flex items-center gap-1"><IdCard className="h-3.5 w-3.5" aria-hidden /><dt className="sr-only">Matrícula</dt><dd>Matrícula {c.matricula ?? '—'}</dd></div>
                {c.cpf && <div className="inline-flex items-center gap-1"><UserRound className="h-3.5 w-3.5" aria-hidden /><dt className="sr-only">CPF</dt><dd>CPF {c.cpf}</dd></div>}
                <div className="inline-flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" aria-hidden /><dt className="sr-only">Admissão</dt><dd>Admissão {br(c.admissao)}{c.admissaoCorrigida && <> (corrigida à mão; RH: {br(c.admissaoRh)})</>}</dd></div>
                <div className="inline-flex items-center gap-1"><Building2 className="h-3.5 w-3.5" aria-hidden /><dt className="sr-only">Origem</dt><dd>{c.origem === 'RH' ? 'Cadastro do RH' : 'Cadastro manual'}</dd></div>
              </dl>
            </div>
          </div>
          <PerfilAcoes primarias={primarias} secundarias={secundarias} nome={c.nome.split(' ')[0]} />
        </div>
      </div>

      {/* Indicadores por contexto */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4" data-testid="perfil-indicadores">
        <Grupo title="Dados profissionais" icon={Briefcase} tone="brand" testId="grupo-profissional">
          <Indicador icon={Clock3} tone="brand" label="Tempo de empresa" value={p.tempo?.texto ?? '—'} meta={c.admissao ? `desde ${br(c.admissao)}` : 'admissão não informada pelo RH'} testId="kpi-tempo" />
          <Indicador icon={Briefcase} tone="blue" label="Função atual" value={c.funcao ?? '—'} meta="cargo no RH" />
          <Indicador icon={Building2} tone="blue" label="Unidade" value={unidadePrincipal ? shortUnitName(unidadePrincipal.nome) : '—'} meta={c.unidades.length > 1 ? `+${c.unidades.length - 1}: ${c.unidades.slice(1).map((u) => shortUnitName(u.nome)).join(', ')}` : undefined} />
          {p.escala && <Indicador icon={CalendarClock} tone="gray" label="Escala vigente" value={TIPO_ESCALA[p.escala.tipo] ?? p.escala.tipo} meta={`${p.escala.horario ?? 'sem horário'} · desde ${br(p.escala.desde)}`} />}
        </Grupo>

        {mostraJornada && (
          <Grupo title="Jornada" icon={CalendarClock} tone="green" testId="grupo-jornada">
            <Indicador icon={Palmtree} tone={feriasTom} label="Férias" value={feriasValor} meta={feriasMeta} testId="kpi-ferias" />
            {p.horaExtra && <Indicador icon={Timer} tone="amber" label="Hora extra (12 meses)" value={`${um(p.horaExtra.horas)} h`} meta={`${p.horaExtra.aprovadas} aprovada(s) · ${real(p.horaExtra.valor)}${p.horaExtra.pendentes ? ` · ${p.horaExtra.pendentes} pendente(s)` : ''}`} testId="kpi-he" />}
            {p.atestados && <Indicador icon={FileHeart} tone={p.atestados.dias > 5 ? 'amber' : 'gray'} label="Atestados (12 meses)" value={`${p.atestados.dias} dia(s)`} meta={`${p.atestados.registros} atestado(s)`} />}
          </Grupo>
        )}

        {mostraDesempenho && (
          <Grupo title="Desempenho" icon={Award} tone="violet" testId="grupo-desempenho">
            {p.avaliacao && <Indicador icon={Award} tone="violet" label="Última avaliação" value={p.avaliacao.ultima ? `${um(p.avaliacao.ultima.nota)} / 5` : '—'} meta={p.avaliacao.ultima ? `${mesAno(p.avaliacao.ultima.yearMonth)} · média 12 meses ${um(p.avaliacao.media12!)}` : 'ainda não avaliado'} />}
            {p.treinamentos && <Indicador icon={GraduationCap} tone={p.treinamentos.atrasados ? 'red' : 'green'} label="Treinamentos" value={`${p.treinamentos.concluidos} concluído(s)`} meta={`${p.treinamentos.pendentes} pendente(s)${p.treinamentos.atrasados ? ` · ${p.treinamentos.atrasados} atrasado(s)` : ''}`} />}
            {p.avaliacao && <Indicador icon={History} tone="gray" label="Observações (12 meses)" value={String(p.avaliacao.observacoes)} meta="anotações do dia a dia" />}
          </Grupo>
        )}

        {mostraRh && (
          <Grupo title="RH e benefícios" icon={Car} tone="sky" testId="grupo-rh">
            <Indicador icon={Car} tone="sky" label="Mobilidade (12 meses)" value={p.mobilidade ? real(p.mobilidade.total) : '—'} meta={p.mobilidade ? `última ${mesAno(p.mobilidade.ultimo.yearMonth)} · ${p.mobilidade.registros} registro(s)` : 'sem lançamento'} />
            <Indicador icon={Percent} tone="sky" label="Última comissão" value={p.comissao ? real(p.comissao.ultimo.valor) : '—'} meta={p.comissao ? mesAno(p.comissao.ultimo.yearMonth) : 'sem lançamento'} />
            <Indicador icon={CalendarDays} tone="gray" label="Admissão" value={br(c.admissao)} meta={c.admissaoCorrigida ? `corrigida à mão · RH: ${br(c.admissaoRh)}` : (c.origem === 'RH' ? 'informada pelo RH' : 'cadastro manual')} />
          </Grupo>
        )}
      </div>

      {/* Detalhamento */}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        <Card className={p.horaExtra ? 'xl:col-span-2' : 'xl:col-span-3'}>
          <PanelHeader title="Férias — período aquisitivo" icon={<span className="sgo-panel__ic sgo-panel__ic--green" aria-hidden><Palmtree className="h-4 w-4" /></span>} />
          <CardContent className="space-y-3 pt-2">
            {f.periodos.length === 0 ? (
              <p className="text-sm text-ink-500">Sem admissão informada pelo RH — não há como calcular o período aquisitivo.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="sgo-tbl w-full text-sm" data-testid="tabela-periodos">
                  <thead><tr><th className="text-left">Período aquisitivo</th><th className="text-left">Conceder até</th><th className="text-right">Gozados</th><th className="text-right">Vendidos</th><th className="text-right">Saldo</th><th className="text-left">Situação</th></tr></thead>
                  <tbody>
                    {[...f.periodos].reverse().slice(0, 6).map((per) => (
                      <tr key={per.numero}>
                        <td className="whitespace-nowrap tabular-nums">{br(per.inicio)} a {br(per.fim)}</td>
                        <td className="whitespace-nowrap tabular-nums">{br(per.limite)}</td>
                        <td className="text-right tabular-nums">{per.situacao === 'ANTERIOR_AO_SGO' ? '—' : per.diasGozados}</td>
                        <td className="text-right tabular-nums">{per.diasVendidos || '—'}</td>
                        <td className="text-right font-semibold tabular-nums">{per.situacao === 'ANTERIOR_AO_SGO' ? '—' : per.saldo}</td>
                        <td className="whitespace-nowrap">
                          <span className={`sgo-tag ${SITUACAO[per.situacao].cls}`}>{SITUACAO[per.situacao].txt}</span>
                          {per.situacao === 'VENCIDO' && <span className="ml-1 text-xs text-danger">há {Math.abs(per.diasParaVencer)}d</span>}
                          {per.situacao === 'A_VENCER' && <span className="ml-1 text-xs text-ink-500">faltam {per.diasParaVencer}d</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {f.emGozo && <p className="sgo-aviso sgo-aviso--atencao">Em férias agora: {br(f.emGozo.inicio)} a {br(f.emGozo.fim)}.</p>}
            {(f.abonos.length > 0 || f.programadas.length > 0) && (
              <div className="grid gap-2 sm:grid-cols-2">
                {f.abonos.length > 0 && (
                  <div className="rounded-lg bg-canvas p-2.5 text-sm text-ink-700"><span className="sgo-type-11 block text-ink-500">Dias vendidos (abono)</span>{f.abonos.map((a) => `${a.dias} dia(s) do período iniciado em ${br(a.periodoInicio)}`).join(' · ')}</div>
                )}
                {f.programadas.length > 0 && (
                  <div className="rounded-lg bg-canvas p-2.5 text-sm text-ink-700"><span className="sgo-type-11 block text-ink-500">Programadas</span>{f.programadas.map((x) => `${br(x.inicio)} a ${br(x.fim)}`).join(' · ')}</div>
                )}
              </div>
            )}
            <p className="text-xs text-ink-500">
              Calculado pela <b>admissão do RH</b> (ou a corrigida à mão) (CLT: 12 meses para adquirir, 12 para conceder) e pelas férias registradas no SGO.
              Períodos que venceram antes de o SGO começar a registrar férias aparecem como “Anterior ao SGO”; os que começaram antes podem ter gozo que não consta.
            </p>
            {f.eventosRh.length > 0 && (
              <div className="rounded-lg border border-line p-2.5">
                <p className="mb-1 text-xs font-semibold text-ink-700">Enviado pelo RH (período aquisitivo) — para conferência</p>
                <ul className="space-y-1 text-xs text-ink-700">
                  {f.eventosRh.map((e, i) => (
                    <li key={i}>Recebido em {br(e.recebidoEm)}{e.evento === 'exclusao_periodo' ? ' (exclusão)' : ''}: {e.datas.length ? e.datas.map((d) => `${d.campo} ${br(d.data)}`).join(' · ') : 'sem datas reconhecidas'}</li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>

        {p.avaliacao && p.avaliacao.serie.length > 0 && (
          <Card className={p.horaExtra ? 'xl:col-span-1' : 'xl:col-span-3'}>
            <PanelHeader title="Avaliações mensais" count={p.avaliacao.serie.length} icon={<span className="sgo-panel__ic sgo-panel__ic--violet" aria-hidden><Award className="h-4 w-4" /></span>} />
            <CardContent className="pt-2">
              <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 xl:grid-cols-3">
                {p.avaliacao.serie.map((a) => (
                  <li key={a.yearMonth} className="rounded-lg border border-line bg-canvas p-2 text-center">
                    <p className="text-lg font-bold tabular-nums text-ink-900">{um(a.nota)}</p>
                    <p className="sgo-type-11 text-ink-500">{mesAno(a.yearMonth)}</p>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-ink-500">Nota final de cada mês (1 a 5). {p.avaliacao.observacoes} observação(ões) do dia a dia em 12 meses.</p>
            </CardContent>
          </Card>
        )}

        {p.horaExtra && (
          <Card className="xl:col-span-3">
            <PanelHeader title="Hora extra — últimos lançamentos" count={p.horaExtra.ultimas.length} icon={<span className="sgo-panel__ic sgo-panel__ic--amber" aria-hidden><Timer className="h-4 w-4" /></span>} />
            <CardContent className="pt-2">
              {p.horaExtra.ultimas.length === 0 ? <p className="text-sm text-ink-500">Nenhuma hora extra vinculada a este colaborador nos últimos 12 meses.</p> : (
                <div className="overflow-x-auto">
                  <table className="sgo-tbl w-full text-sm" data-testid="tabela-he">
                    <thead><tr><th className="text-left">Dia</th><th className="text-left">Período</th><th className="text-right">Horas</th><th className="text-right">Valor</th><th className="text-left">Situação</th></tr></thead>
                    <tbody>
                      {p.horaExtra.ultimas.map((h) => (
                        <tr key={h.id}>
                          <td className="whitespace-nowrap tabular-nums">{br(h.data)}</td>
                          <td className="whitespace-nowrap tabular-nums text-ink-700">{h.periodo ?? '—'}</td>
                          <td className="text-right tabular-nums">{h.horas.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}</td>
                          <td className="text-right tabular-nums">{real(h.valor)}</td>
                          <td><span className={`sgo-tag ${h.status === 'REJECTED' ? 'sgo-tag--red' : h.status === 'PENDING' ? 'sgo-tag--amber' : 'sgo-tag--green'}`}>{STATUS_HE[h.status]}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="mt-2 text-xs text-ink-500">Conta a hora extra lançada para este colaborador do RH. Lançamento antigo só com o nome digitado entra depois do vínculo em Hora extra.</p>
            </CardContent>
          </Card>
        )}
      </div>

      <Card>
        <PanelHeader title="Histórico" count={p.historico.length} icon={<span className="sgo-panel__ic sgo-panel__ic--blue" aria-hidden><History className="h-4 w-4" /></span>} />
        <CardContent className="pt-2">
          <HistoricoColaborador itens={p.historico} nome={c.nome.split(' ')[0]} />
        </CardContent>
      </Card>

      <p className="flex items-center gap-1.5 text-xs text-ink-500"><BadgeCheck className="h-3.5 w-3.5" /> Só leitura: cada número vem do módulo de origem. Para corrigir, use o módulo (Pessoas, Hora extra, Mobilidade, Avaliação, Atestados).</p>
    </div>
  );
}
