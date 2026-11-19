import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Paperclip } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { getDemanda } from '@/lib/rh/demandas';
import { hojeNaOperacao } from '@/lib/controle-gerentes-dados';
import { LargeTitle } from '@/components/layout/page-chrome';
import { Card, PanelHeader } from '@/components/sgo/panel';
import { SgoTimeline, type SgoTimelineItem } from '@/components/sgo/sgo-timeline';
import { StatusBadge } from '@/components/ui/status-badge';
import { situacaoParaTela } from '@/components/people/solicitacao-situacao';
import { shortUnitName } from '@/lib/unit-name';
import { ROTULO_DA_PRIORIDADE, ROTULO_DO_TIPO, linhasDosDetalhes, pendenciaDoSolicitante, prazoVencido } from '@/lib/rh/solicitacoes-regras';

export const dynamic = 'force-dynamic';

const dataHora = (iso: string) => new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const dataBR = (iso: string) => { const [y, m, d] = iso.slice(0, 10).split('-'); return `${d}/${m}/${y}`; };
const tamanho = (b: number) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

/** Detalhe de uma solicitação ao RH (v1.217.0). Só abre o que está no alcance do usuário. */
export default async function SolicitacaoRhPage({ params, searchParams }: { params: { id: string }; searchParams: { nova?: string } }) {
  const user = (await getSessionUser())!;
  const d = await getDemanda(user, params.id);
  if (!d) notFound();

  const hoje = hojeNaOperacao();
  const situacao = situacaoParaTela(d);
  const pendencia = pendenciaDoSolicitante(d);
  const vencido = prazoVencido(d, hoje);
  const campos = linhasDosDetalhes(d.tipo, d.detalhes);

  const andamento: SgoTimelineItem[] = [
    { id: 'aberta', quando: dataHora(d.createdAt), titulo: 'Solicitação aberta', descricao: `por ${d.createdByName}`, tom: 'blue' },
  ];
  if (d.envio === 'ENVIADO') andamento.push({ id: 'recebida', quando: d.rhNumero ? `Protocolo ${d.rhNumero}` : '', titulo: 'Recebida pelo RH', descricao: d.rhPrazoAlvo ? `Prazo informado pelo RH: ${dataBR(d.rhPrazoAlvo)}` : undefined, tom: 'sky' });
  else if (d.envio === 'COM_PROBLEMA') andamento.push({ id: 'problema', quando: '', titulo: 'Envio em revisão pelo Administrador', descricao: 'A solicitação está guardada no SGO e será reenviada.', tom: 'red' });
  else andamento.push({ id: 'enviando', quando: '', titulo: 'Enviando ao RH', descricao: 'Sai sozinha em instantes.', tom: 'gray' });
  if (d.rhSituacao && d.rhSituacaoAt) andamento.push({ id: 'situacao', quando: dataHora(d.rhSituacaoAt), titulo: `Situação no RH: ${d.situacaoRotulo}`, tom: d.rhSituacao === 'concluido' ? 'green' : d.rhSituacao === 'cancelado' ? 'gray' : 'amber' });

  return (
    <div className="space-y-4" data-testid="solicitacao-rh">
      <Link href="/modulos/pessoas/demandas-rh?aba=minhas" className="inline-flex items-center gap-1 text-sm font-semibold text-brand"><ArrowLeft className="h-4 w-4" /> Solicitações ao RH</Link>
      <LargeTitle
        title={d.titulo}
        subtitle={<>{ROTULO_DO_TIPO[d.tipo]} · {shortUnitName(d.unitName)}{d.rhNumero ? <> · Protocolo <b>{d.rhNumero}</b></> : null}</>}
      />

      {searchParams.nova === '1' && (
        <p className="rounded-lg border border-line px-3 py-2 text-sm text-ink-700" data-testid="enviada">Solicitação registrada. O número e o prazo aparecem aqui assim que o RH receber.</p>
      )}
      {pendencia && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm font-semibold text-danger" data-testid="pendencia">{pendencia}.</p>}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <PanelHeader title="Solicitação" action={<StatusBadge tone={situacao.tone}>{situacao.label}</StatusBadge>} />
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 px-4 py-3 text-sm sm:grid-cols-2">
            <div><dt className="sgo-label">Tipo</dt><dd>{ROTULO_DO_TIPO[d.tipo]}</dd></div>
            <div><dt className="sgo-label">Prioridade</dt><dd>{ROTULO_DA_PRIORIDADE[d.prioridade]}{d.urgenciaMotivo ? ` — ${d.urgenciaMotivo}` : ''}</dd></div>
            {d.collaboratorName && <div><dt className="sgo-label">Colaborador</dt><dd>{d.collaboratorName}</dd></div>}
            <div><dt className="sgo-label">Aberta em</dt><dd>{dataHora(d.createdAt)} · {d.createdByName}</dd></div>
            <div><dt className="sgo-label">Prazo do RH</dt><dd className={vencido ? 'font-semibold text-danger' : undefined}>{d.rhPrazoAlvo ? `${dataBR(d.rhPrazoAlvo)}${vencido ? ' · vencido' : ''}` : 'ainda não informado'}</dd></div>
            {d.dataEvento && campos.length === 0 && <div><dt className="sgo-label">Data do evento</dt><dd>{dataBR(d.dataEvento)}</dd></div>}
            {campos.map((c) => (
              <div key={c.label} className={c.valor.length > 60 ? 'sm:col-span-2' : undefined}><dt className="sgo-label">{c.label}</dt><dd className="whitespace-pre-wrap break-words">{c.valor}</dd></div>
            ))}
            {d.descricao && <div className="sm:col-span-2"><dt className="sgo-label">Descrição</dt><dd className="whitespace-pre-wrap break-words">{d.descricao}</dd></div>}
          </dl>
          {d.arquivos.length > 0 && (
            <div className="px-4 pb-3" data-testid="anexos">
              <p className="sgo-label mb-1">Anexos</p>
              <ul className="space-y-1">
                {d.arquivos.map((a, i) => (
                  <li key={a.path}>
                    <a href={`/api/rh/demandas/${d.id}/anexo?n=${i}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm font-semibold text-brand">
                      <Paperclip className="h-4 w-4" /> <span className="break-words">{a.nome}</span> <span className="font-normal text-ink-500">{tamanho(a.tamanho)}</span>
                    </a>
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-xs text-ink-500">Os anexos ficam guardados no SGO.</p>
            </div>
          )}
        </Card>

        <Card>
          <PanelHeader title="Andamento" />
          <div className="px-4 py-3">
            <SgoTimeline grupos={[{ chave: 'andamento', rotulo: 'Do mais antigo ao mais recente', itens: andamento }]} />
          </div>
        </Card>
      </div>
    </div>
  );
}
