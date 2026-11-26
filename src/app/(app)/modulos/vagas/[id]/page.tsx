import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Check, FileText } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { LargeTitle } from '@/components/layout/page-chrome';
import { StatusBadge } from '@/components/ui/ds/status-badge';
import { AcoesDaVaga, AcoesDoCurriculo } from '@/components/vagas/acoes-da-vaga';
import { SelosDeAlerta } from '@/components/vagas/andamento';
import { getVaga, papelNaVaga, permissoesDeVagas } from '@/lib/vagas/dados';
import { acoesDaVaga, ROTULO_DO_MOTIVO, ROTULO_DO_STATUS, type Motivo } from '@/lib/vagas/regras';
import { alertasDaVaga, caminhoDaVaga, duracao, explicacaoDoEvento, foraDoPrazo, posicaoDaVaga, semCurriculo } from '@/lib/vagas/acompanhamento';
import { resumoDosCurriculos, seloDoCurriculo } from '@/lib/vagas/curriculo-situacao';
import { quemTrouxe } from '@/lib/vagas/painel';
import { shortUnitName } from '@/lib/unit-name';

export const dynamic = 'force-dynamic';

const dia = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');
const dataHora = (iso: string) => new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const TOM_DO_STATUS = { PENDENTE_APROVACAO: 'warning', DEVOLVIDA: 'danger', APROVADA: 'info', CONCLUIDA: 'success', CANCELADA: 'neutral' } as const;

/** O DETALHE da vaga: situação, resumo, cada pessoa, currículos, o caminho (11 etapas) e o histórico. */
export default async function VagaPage({ params }: { params: { id: string } }) {
  const user = (await getSessionUser())!;
  const perm = await permissoesDeVagas(user);
  const v = perm.ver ? await getVaga(user, params.id) : null;
  if (!v) notFound();

  const agora = new Date();
  const papel = papelNaVaga(user, perm, v.unitId);
  const acoes = acoesDaVaga(v.status, papel);
  const pos = posicaoDaVaga(v);
  const alertas = alertasDaVaga(v, agora);
  const { passos, notas } = caminhoDaVaga(v);
  const cvs = v.curriculos.filter((c) => !c.removido);
  const resumoCv = resumoDosCurriculos(v.curriculos, v);
  const inicios = [...new Set(v.posicoes.map((p) => p.inicioDesejado))].sort();
  const trouxe = quemTrouxe(v);
  const podeReenviar = papel.aprovador && (v.rhEnvioSituacao === 'ERRO' || v.rhEnvioSituacao === 'FALHA');
  const atrasada = v.status === 'PENDENTE_APROVACAO' && foraDoPrazo(new Date(v.enviadoParaAprovacaoEm), agora);

  return (
    <div className="space-y-4" data-testid="detalhe-da-vaga">
      <Link href="/modulos/vagas" className="inline-flex items-center gap-1 text-sm font-semibold text-brand print:hidden"><ArrowLeft className="h-4 w-4" /> Solicitação de Vagas</Link>
      <LargeTitle title={`${v.codigo} · ${v.cargoResumo}`} subtitle={<span className="flex flex-wrap items-center gap-2"><StatusBadge tone={TOM_DO_STATUS[v.status]} dot>{ROTULO_DO_STATUS[v.status]}</StatusBadge>{v.codigoRh && <span>Nº no RH: <b>{v.codigoRh}</b></span>}{v.prioridade === 'URGENTE' && <StatusBadge tone="danger">Urgente</StatusBadge>}</span>} />

      {/* ── Faixas de situação ── */}
      {v.status === 'PENDENTE_APROVACAO' && (
        <p className={`rounded-card border p-3 text-sm ${atrasada ? 'border-danger bg-danger-bg text-danger' : 'border-warning bg-warning-bg text-ink-900'}`} data-testid="faixa-aguardando">
          <b>Aguardando o supervisor</b> desde {dataHora(v.enviadoParaAprovacaoEm)}{atrasada ? ' — fora do prazo de 1 dia útil.' : ' — prazo de 1 dia útil.'}
        </p>
      )}
      {v.status === 'DEVOLVIDA' && <p className="rounded-card border border-danger bg-danger-bg p-3 text-sm text-ink-900" data-testid="faixa-devolvida"><b>Devolvida por {v.decididoPorNome ?? 'supervisor'}</b>{v.decididoEm ? ` em ${dataHora(v.decididoEm)}` : ''}: {v.motivoDevolucao}</p>}
      {v.status === 'CANCELADA' && <p className="rounded-card border border-line bg-sunken p-3 text-sm text-ink-900" data-testid="faixa-cancelada"><b>Cancelada por {v.canceladoPorNome ?? '—'}</b>{v.canceladoEm ? ` em ${dataHora(v.canceladoEm)}` : ''}: {v.motivoCancelamento}</p>}
      {(v.status === 'APROVADA' || v.status === 'CONCLUIDA') && (
        <p className={`rounded-card border p-3 text-sm ${v.rhEnvioSituacao === 'ERRO' ? 'border-danger bg-danger-bg text-ink-900' : 'border-line bg-sunken text-ink-900'}`} data-testid="faixa-rh">
          {v.rhChegouEm ? <><b>Entregue ao RH</b> em {dataHora(v.rhChegouEm)}.</> : v.rhEnvioSituacao === 'ERRO' ? <><b>Não chegou ao RH:</b> {v.rhEnvioMotivo}</> : <><b>Indo para o RH</b>{v.rhEnvioMotivo ? ` — ${v.rhEnvioMotivo}` : ' — na fila de envio.'}</>}
          {v.rhChegouEm && v.rhEnvioSituacao === 'ERRO' && <> <b>A última alteração não chegou:</b> {v.rhEnvioMotivo}</>}
          {v.rhCandidato && <> Candidato: <b>{v.rhCandidato}</b>.</>}
          {v.rhObservacao && <> {v.rhObservacao}</>}
        </p>
      )}
      <SelosDeAlerta alertas={alertas} />

      {/* ── Resumo ── */}
      <section className="sgo-panel sgo-panel--solid p-4">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3 lg:grid-cols-6">
          <div><dt className="text-xs text-ink-500">Unidade</dt><dd className="font-semibold text-ink-900">{shortUnitName(v.unitName)}</dd></div>
          <div><dt className="text-xs text-ink-500">Pessoas</dt><dd className="font-semibold text-ink-900">{v.quantidade}</dd></div>
          <div><dt className="text-xs text-ink-500">Início desejado</dt><dd className="font-semibold text-ink-900">{dia(inicios[0] ?? v.inicioDesejado)}{inicios.length > 1 ? ` + ${inicios.length - 1} data(s)` : ''}</dd></div>
          <div><dt className="text-xs text-ink-500">Prioridade</dt><dd className="font-semibold text-ink-900">{v.prioridade === 'URGENTE' ? 'Urgente' : 'Normal'}</dd></div>
          <div><dt className="text-xs text-ink-500">Solicitado por</dt><dd className="font-semibold text-ink-900">{v.createdByName}<span className="block text-xs font-normal text-ink-500">{dataHora(v.createdAt)}</span></dd></div>
          <div><dt className="text-xs text-ink-500">Candidatos</dt><dd className="font-semibold text-ink-900">{trouxe ? `Aprovado veio ${trouxe === 'CapacitaRH' ? 'da CapacitaRH' : 'de um currículo do gerente'}` : semCurriculo(v) ? 'Sem currículo — captação CapacitaRH' : 'Com currículo do gerente'}</dd></div>
        </dl>
      </section>

      {/* ── Cada pessoa ── */}
      <section className="sgo-panel sgo-panel--solid overflow-hidden" data-testid="cada-pessoa">
        <p className="sgo-panel__title px-4 pt-3">Cada pessoa</p>
        <div className="overflow-x-auto">
          <table className="sgo-tbl w-full text-sm">
            <thead><tr><th className="text-left">#</th><th className="text-left">Cargo</th><th className="text-left">Motivo</th><th className="text-left">Substitui</th><th className="text-left">Escala</th><th className="text-left">Horário</th><th className="text-left">Início</th></tr></thead>
            <tbody>
              {v.posicoes.map((p) => (
                <tr key={p.ordem}>
                  <td>{p.ordem}</td><td className="font-semibold text-ink-900">{p.cargo}</td><td>{ROTULO_DO_MOTIVO[p.motivo as Motivo] ?? (p.motivo || '—')}</td>
                  <td className="whitespace-normal">{p.substituiNome ?? '—'}</td><td>{p.escala || '—'}</td><td className="whitespace-normal">{p.horario || '—'}</td><td className="tabular-nums">{dia(p.inicioDesejado)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {v.posicoes.some((p) => p.requisitos || p.observacao) && (
          <ul className="space-y-2 px-4 pb-4 pt-2 text-sm">
            {v.posicoes.filter((p) => p.requisitos || p.observacao).map((p) => (
              <li key={p.ordem} className="rounded-lg bg-sunken p-2">
                <b className="text-ink-900">Pessoa {p.ordem} ({p.cargo})</b>
                {p.requisitos && <p className="whitespace-pre-line text-ink-900"><span className="text-ink-500">Obrigatório: </span>{p.requisitos}</p>}
                {p.observacao && <p className="whitespace-pre-line text-ink-900"><span className="text-ink-500">Observação: </span>{p.observacao}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Currículos ── */}
      <section className="sgo-panel sgo-panel--solid space-y-2 p-4" data-testid="curriculos">
        <p className="text-sm font-bold text-ink-900">{resumoCv.texto}</p>
        {cvs.length === 0 ? <p className="text-sm text-ink-500">Nenhum currículo anexado — o RH capta os candidatos pela CapacitaRH.</p> : (
          <ul className="divide-y divide-line">
            {cvs.map((c) => {
              const s = seloDoCurriculo(c, v);
              const antesDaAprovacao = c.fluxo === null && (v.status === 'PENDENTE_APROVACAO' || v.status === 'DEVOLVIDA');
              return (
                <li key={c.id} className="flex flex-wrap items-start gap-x-3 gap-y-1 py-2" data-testid="curriculo-da-vaga">
                  <FileText className="mt-0.5 h-4 w-4 shrink-0 text-ink-500" />
                  <div className="min-w-[10rem] flex-1">
                    <a href={`/api/vagas/${v.id}/curriculo/${c.id}`} target="_blank" rel="noreferrer" className="break-words text-sm font-semibold text-brand hover:underline">{c.nomeArquivo}</a>
                    <p className="text-xs text-ink-500">{c.fluxo === null ? 'Com a solicitação' : 'Enviado depois'} · por {c.enviadoPorNome} em {dia(c.enviadoEm)}{c.indicadoPor ? ` · indicado por ${c.indicadoPor}` : ''}</p>
                    <p className="text-xs text-ink-700">{s.frase}{s.observacao ? ` — ${s.observacao}` : ''}</p>
                  </div>
                  <span className="flex flex-col items-end gap-1">
                    <StatusBadge tone={s.tom} dot>{s.rotulo}</StatusBadge>
                    {s.quando && <span className="text-xs text-ink-500">{dia(s.quando)}</span>}
                    <AcoesDoCurriculo vagaId={v.id} curriculoId={c.id} nome={c.nomeArquivo}
                      podeAvaliar={acoes.includes('avaliarCurriculo') && c.fluxo === 'AGUARDANDO_SUPERVISOR'}
                      podeRemover={(papel.dono || papel.aprovador) && (antesDaAprovacao || c.fluxo === 'AGUARDANDO_SUPERVISOR')} />
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ── Caminho da vaga ── */}
      <section className="sgo-panel sgo-panel--solid space-y-3 p-4" data-testid="caminho-da-vaga">
        <p className="text-sm text-ink-900"><b>Agora: {pos.estado === 'cancelada' ? 'Cancelada' : pos.estado === 'concluida' ? 'Contratação concluída' : pos.nome}</b> · há {duracao(agora.getTime() - new Date(pos.desde).getTime())} nesta etapa{pos.aguardando ? <> · Aguardando — <b>{pos.aguardando.quem}</b>: {pos.aguardando.oQue}</> : null}</p>
        <ol className="space-y-2">
          {passos.map((p) => (
            <li key={p.n} className="flex gap-3" data-situacao={p.situacao}>
              <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-pill text-xs font-bold ${p.situacao === 'feita' ? 'bg-success text-on-brand' : p.situacao === 'atual' ? 'bg-brand text-on-brand' : p.situacao === 'parada' ? 'bg-danger text-on-brand' : 'bg-sunken text-ink-500'}`}>{p.situacao === 'feita' ? <Check className="h-3.5 w-3.5" /> : p.n}</span>
              <div className="min-w-0 flex-1">
                <p className={`text-sm ${p.situacao === 'pendente' ? 'text-ink-500' : 'font-semibold text-ink-900'}`}>{p.nome} <span className="font-normal text-ink-500">· {p.quem}</span></p>
                <p className="text-xs text-ink-500">{p.oQue}{p.quando ? ` · ${dataHora(p.quando)}` : ''}{p.porQuem ? ` · ${p.porQuem}` : ''}</p>
              </div>
            </li>
          ))}
        </ol>
        {notas.length > 0 && <p className="text-xs font-semibold text-ink-700">{notas.join(' · ')}</p>}
      </section>

      {/* ── Histórico detalhado ── */}
      <section className="sgo-panel sgo-panel--solid p-4" data-testid="historico-da-vaga">
        <p className="mb-2 text-sm font-bold text-ink-900">Histórico detalhado</p>
        <ol className="space-y-3">
          {v.eventos.map((e, i) => {
            const antes = i > 0 ? new Date(v.eventos[i - 1].createdAt).getTime() : null;
            const exp = explicacaoDoEvento(e.tipo);
            return (
              <li key={e.id} className="border-l-2 border-line pl-3">
                <p className="text-xs text-ink-500"><span className="tabular-nums">{dataHora(e.createdAt)}</span> · <b className={e.origem === 'RH' ? 'text-brand' : 'text-ink-700'}>{e.origem}</b>{e.usuarioNome && e.usuarioNome !== 'RH' ? ` · ${e.usuarioNome}` : ''}{antes !== null ? ` · ${duracao(new Date(e.createdAt).getTime() - antes)} depois` : ''}</p>
                <p className="break-words text-sm text-ink-900">{e.descricao}</p>
                {exp && <p className="text-xs text-ink-500">{exp}</p>}
              </li>
            );
          })}
        </ol>
      </section>

      <AcoesDaVaga id={v.id} acoes={acoes} podeReenviar={podeReenviar} noRh={v.status === 'APROVADA'} aprovador={papel.aprovador} />
    </div>
  );
}
