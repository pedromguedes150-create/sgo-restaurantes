import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ArrowLeft, Award, BadgeCheck, Briefcase, Building2, CalendarClock, CalendarDays, Car, Clock3, FileHeart, GraduationCap,
  HandCoins, History, IdCard, Palmtree, PencilLine, Percent, Timer,
} from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { permissaoDeRota } from '@/lib/permissions/links';
import { abasDoPerfil } from '@/lib/permissions/abas-server';
import { getPerfil360, STATUS_HE } from '@/lib/people/perfil-360';
import type { PeriodoAquisitivo } from '@/lib/people/periodo-aquisitivo';
import { LargeTitle } from '@/components/layout/page-chrome';
import { Card, CardContent, PanelHeader } from '@/components/sgo/panel';
import { SgoKpi, SgoKpis } from '@/components/sgo/sgo-kpi';
import { HistoricoColaborador } from '@/components/people/historico-colaborador';
import { shortUnitName } from '@/lib/unit-name';

export const dynamic = 'force-dynamic';

const br = (iso: string | null | undefined) => (iso ? iso.split('-').reverse().join('/') : '—');
const real = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const mesAno = (ym: string) => `${ym.slice(5, 7)}/${ym.slice(0, 4)}`;
const iniciais = (nome: string) => nome.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();

const SITUACAO: Record<PeriodoAquisitivo['situacao'], { txt: string; cls: string }> = {
  EM_AQUISICAO: { txt: 'Em aquisição', cls: 'sgo-tag--blue' },
  A_VENCER: { txt: 'A conceder', cls: 'sgo-tag--amber' },
  VENCIDO: { txt: 'Vencido', cls: 'sgo-tag--red' },
  QUITADO: { txt: 'Quitado', cls: 'sgo-tag--green' },
  ANTERIOR_AO_SGO: { txt: 'Anterior ao SGO', cls: 'sgo-tag--gray' },
};
const TIPO_ESCALA: Record<string, string> = { TWELVE36_ODD: '12x36 (ímpar)', TWELVE36_EVEN: '12x36 (par)', SIX_ONE: '6x1', FIVE_TWO: '5x2', CUSTOM: 'Personalizada' };

/**
 * PERFIL 360 (v1.153.0) — tudo sobre o colaborador em um só lugar. Só leitura:
 * cada número vem do módulo de origem (ver `getPerfil360`) e cada bloco só
 * aparece se o perfil de quem abre pode ver aquele módulo.
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
  const feriasTom = f.faixa === 'VENCIDA' ? 'red' : f.faixa === 'ATE_30' ? 'amber' : f.faixa === 'SEM_ADMISSAO' ? 'gray' : 'green';
  const feriasMeta = !foco ? (f.faixa === 'SEM_ADMISSAO' ? 'o RH não informou a admissão' : undefined)
    : foco.situacao === 'EM_AQUISICAO' ? `completa em ${br(foco.fim)}`
    : `saldo ${foco.saldo} dias · limite ${br(foco.limite)}`;

  return (
    <div className="space-y-4" data-testid="perfil-360">
      <Link href="/modulos/pessoas" className="inline-flex items-center gap-1 text-sm font-semibold text-brand print:hidden"><ArrowLeft className="h-4 w-4" /> Colaboradores</Link>
      <LargeTitle title="Perfil 360" subtitle="Tudo sobre o colaborador em um só lugar — dados do RH e dos módulos do SGO." />

      {/* Identificação */}
      <div className="sgo-panel sgo-panel--solid flex flex-wrap items-center gap-4 p-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-card bg-brand text-xl font-bold text-on-brand" aria-hidden>{iniciais(c.nome)}</div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="sgo-type-20 font-bold text-ink-900">{c.nome}</h2>
            <span className={`sgo-tag ${c.ativo ? 'sgo-tag--green' : 'sgo-tag--gray'}`}>{c.ativo ? 'Ativo' : 'Inativo'}</span>
            {p.desligamento?.status === 'PENDING' && <span className="sgo-tag sgo-tag--red">Desligamento em análise</span>}
            {p.experiencia && <span className="sgo-tag sgo-tag--amber">Em experiência</span>}
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-700">
            <span className="inline-flex items-center gap-1"><Briefcase className="h-3.5 w-3.5" /> {c.funcao ?? 'Sem função no RH'}</span>
            <span className="inline-flex items-center gap-1"><Building2 className="h-3.5 w-3.5" /> {c.unidades.map((u) => shortUnitName(u.nome)).join(', ') || '—'}</span>
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-500">
            {c.cpf && <span className="inline-flex items-center gap-1"><IdCard className="h-3.5 w-3.5" /> {c.cpf}</span>}
            {c.matricula && <span>Matrícula {c.matricula}</span>}
            <span className="inline-flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" /> Adm. {br(c.admissao)}{c.admissaoCorrigida && <> (corrigida à mão; RH: {br(c.admissaoRh)})</>}</span>
            <span>{c.origem === 'RH' ? 'Cadastro do RH' : 'Cadastro manual'}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          {pode('/modulos/escala') && unidadePrincipal && <Link className="sgo-btn sgo-btn--sm" href={`/modulos/escala?unit=${unidadePrincipal.id}`}><CalendarClock className="h-3.5 w-3.5" /> Escala</Link>}
          <Link className="sgo-btn sgo-btn--sm" href={`/modulos/pessoas/ferias${unidadePrincipal ? `?unidade=${unidadePrincipal.id}` : ''}`}><Palmtree className="h-3.5 w-3.5" /> Controle de férias</Link>
          <Link className="sgo-btn sgo-btn--sm" href={`/modulos/pessoas/ferias?aba=abono${unidadePrincipal ? `&unidade=${unidadePrincipal.id}` : ''}`}><HandCoins className="h-3.5 w-3.5" /> Vender dias</Link>
          <Link className="sgo-btn sgo-btn--sm" href={`/modulos/pessoas/ferias?aba=ajustes&colaborador=${c.id}`} data-testid="corrigir-ferias"><PencilLine className="h-3.5 w-3.5" /> Corrigir férias</Link>
          {p.podeVer.horaExtra && pode('/modulos/hora-extra') && <Link className="sgo-btn sgo-btn--sm" href="/modulos/hora-extra"><Timer className="h-3.5 w-3.5" /> Hora extra</Link>}
          {p.podeVer.avaliacao && <Link className="sgo-btn sgo-btn--sm" href="/modulos/pessoas/avaliacao"><Award className="h-3.5 w-3.5" /> Avaliar</Link>}
        </div>
      </div>

      <SgoKpis>
        <SgoKpi label="Tempo de empresa" value={p.tempo?.texto ?? '—'} icon={Clock3} tone="brand" meta={c.admissao ? `desde ${br(c.admissao)}` : 'admissão não informada pelo RH'} testId="kpi-tempo" />
        <SgoKpi label="Função atual" value={c.funcao ?? '—'} icon={Briefcase} tone="blue" meta="cargo no RH" />
        <SgoKpi label="Unidade" value={unidadePrincipal ? shortUnitName(unidadePrincipal.nome) : '—'} icon={Building2} tone="blue" meta={c.unidades.length > 1 ? `+${c.unidades.length - 1} unidade(s)` : undefined} />
        <SgoKpi label="Férias" value={feriasValor} icon={Palmtree} tone={feriasTom} meta={feriasMeta} testId="kpi-ferias" />
        {p.horaExtra && <SgoKpi label="Hora extra (12 meses)" value={`${p.horaExtra.horas.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} h`} icon={Timer} tone="amber" meta={`${p.horaExtra.aprovadas} aprovada(s) · ${real(p.horaExtra.valor)}${p.horaExtra.pendentes ? ` · ${p.horaExtra.pendentes} pendente(s)` : ''}`} testId="kpi-he" />}
        {p.podeVer.mobilidade && <SgoKpi label="Mobilidade (12 meses)" value={p.mobilidade ? real(p.mobilidade.total) : '—'} icon={Car} tone="sky" meta={p.mobilidade ? `última ${mesAno(p.mobilidade.ultimo.yearMonth)} · ${p.mobilidade.registros} registro(s)` : 'sem lançamento'} />}
        {p.podeVer.mobilidade && p.comissao && <SgoKpi label="Última comissão" value={real(p.comissao.ultimo.valor)} icon={Percent} tone="sky" meta={mesAno(p.comissao.ultimo.yearMonth)} />}
        {p.avaliacao && <SgoKpi label="Última avaliação" value={p.avaliacao.ultima ? `${p.avaliacao.ultima.nota.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} / 5` : '—'} icon={Award} tone="violet" meta={p.avaliacao.ultima ? `${mesAno(p.avaliacao.ultima.yearMonth)} · média 12m ${p.avaliacao.media12!.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}` : 'ainda não avaliado'} />}
        {p.atestados && <SgoKpi label="Atestados (12 meses)" value={`${p.atestados.dias} dia(s)`} icon={FileHeart} tone={p.atestados.dias > 5 ? 'amber' : 'gray'} meta={`${p.atestados.registros} atestado(s)`} />}
        {p.treinamentos && <SgoKpi label="Treinamentos" value={`${p.treinamentos.concluidos} concluído(s)`} icon={GraduationCap} tone={p.treinamentos.atrasados ? 'red' : 'green'} meta={`${p.treinamentos.pendentes} pendente(s)${p.treinamentos.atrasados ? ` · ${p.treinamentos.atrasados} atrasado(s)` : ''}`} />}
        {p.escala && <SgoKpi label="Escala vigente" value={TIPO_ESCALA[p.escala.tipo] ?? p.escala.tipo} icon={CalendarClock} tone="gray" meta={`${p.escala.horario ?? 'sem horário'} · desde ${br(p.escala.desde)}`} />}
      </SgoKpis>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Card>
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
                        <td className="tabular-nums">{br(per.inicio)} a {br(per.fim)}</td>
                        <td className="tabular-nums">{br(per.limite)}</td>
                        <td className="text-right tabular-nums">{per.situacao === 'ANTERIOR_AO_SGO' ? '—' : per.diasGozados}</td>
                        <td className="text-right tabular-nums">{per.diasVendidos || '—'}</td>
                        <td className="text-right font-semibold tabular-nums">{per.situacao === 'ANTERIOR_AO_SGO' ? '—' : per.saldo}</td>
                        <td>
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
            {f.abonos.length > 0 && <p className="text-sm text-ink-700">Vendeu férias (abono): {f.abonos.map((a) => `${a.dias} dia(s) do período iniciado em ${br(a.periodoInicio)}`).join(' · ')}.</p>}
            {f.programadas.length > 0 && <p className="text-sm text-ink-700">Programadas: {f.programadas.map((x) => `${br(x.inicio)} a ${br(x.fim)}`).join(' · ')}</p>}
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

        {p.horaExtra && (
          <Card>
            <PanelHeader title="Hora extra — últimos lançamentos" count={p.horaExtra.ultimas.length} icon={<span className="sgo-panel__ic sgo-panel__ic--amber" aria-hidden><Timer className="h-4 w-4" /></span>} />
            <CardContent className="pt-2">
              {p.horaExtra.ultimas.length === 0 ? <p className="text-sm text-ink-500">Nenhuma hora extra vinculada a este colaborador nos últimos 12 meses.</p> : (
                <div className="overflow-x-auto">
                  <table className="sgo-tbl w-full text-sm" data-testid="tabela-he">
                    <thead><tr><th className="text-left">Dia</th><th className="text-left">Período</th><th className="text-right">Horas</th><th className="text-right">Valor</th><th className="text-left">Situação</th></tr></thead>
                    <tbody>
                      {p.horaExtra.ultimas.map((h) => (
                        <tr key={h.id}>
                          <td className="tabular-nums">{br(h.data)}</td>
                          <td className="tabular-nums text-ink-700">{h.periodo ?? '—'}</td>
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

        {p.avaliacao && p.avaliacao.serie.length > 0 && (
          <Card>
            <PanelHeader title="Avaliações mensais" icon={<span className="sgo-panel__ic sgo-panel__ic--violet" aria-hidden><Award className="h-4 w-4" /></span>} />
            <CardContent className="pt-2">
              <ul className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                {p.avaliacao.serie.map((a) => (
                  <li key={a.yearMonth} className="rounded-lg border border-line p-2 text-center">
                    <p className="text-lg font-bold tabular-nums text-ink-900">{a.nota.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}</p>
                    <p className="sgo-type-11 text-ink-500">{mesAno(a.yearMonth)}</p>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-ink-500">Nota = média de pontualidade, desempenho, trabalho em equipe e apresentação (1 a 5). {p.avaliacao.observacoes} observação(ões) do dia a dia em 12 meses.</p>
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
