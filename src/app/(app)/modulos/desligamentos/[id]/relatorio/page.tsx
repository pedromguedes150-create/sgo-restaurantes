import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { getTermination, TIPOS_DESLIGAMENTO, MODALIDADES_AVISO, MOTIVOS_DESLIGAMENTO } from '@/lib/terminations';
import { rotuloDaSituacao } from '@/lib/rh/saida/regras';
import { PrintButton } from '@/components/ui/print-button';
import { ArrowLeft } from 'lucide-react';

export const dynamic = 'force-dynamic';

const NOTICE = { WORKED: 'Aviso trabalhado', INDEMNIFIED: 'Aviso indenizado' } as const;
const STAT = { PENDING: 'Aguardando aprovação do supervisor', APPROVED: 'Aprovado', REJECTED: 'Recusado' } as const;
function fmt(d: Date | null) { return d ? new Date(d).toLocaleString('pt-BR') : '—'; }
function dataBR(iso: string) { const [y, m, d] = iso.slice(0, 10).split('-'); return `${d}/${m}/${y}`; }
function rotulo<T extends string>(lista: { value: T; label: string }[], v: T): string { return lista.find((o) => o.value === v)?.label ?? v; }

export default async function TerminationReportPage({ params }: { params: { id: string } }) {
  const user = (await getSessionUser())!;
  const t = await getTermination(user, params.id);
  if (!t) notFound();

  return (
    <div className="sgo-print mx-auto max-w-3xl space-y-4 bg-surface p-2 text-ink-900 print:p-0">
      <div className="flex items-center justify-between gap-2 print:hidden">
        <Link href="/modulos/desligamentos" className="inline-flex items-center gap-1 text-sm font-semibold text-brand"><ArrowLeft className="h-4 w-4" /> Voltar</Link>
        <PrintButton />
      </div>

      <div className="border-b-2 border-brand pb-3">
        <p className="sgo-type-11 font-semibold text-ink-900">Solicitação de Desligamento — SGO Beija Flor</p>
        <h1 className="text-2xl font-bold text-ink-900">{t.collaboratorName}</h1>
        <p className="text-sm text-ink-500">{t.unit.name} · {STAT[t.status]}</p>
      </div>

      <table className="w-full text-sm">
        <tbody>
          <Row k="Empresa" v={t.unit.name} />
          <Row k="Colaborador" v={t.collaboratorName} />
          <Row k="Solicitante (gerente)" v={t.requestedBy?.name ?? '—'} />
          {t.terminationKind ? <Row k="Tipo do desligamento" v={rotulo(TIPOS_DESLIGAMENTO, t.terminationKind).replace(' (carta obrigatória)', '')} /> : null}
          {t.terminationDate ? <Row k="Data do desligamento" v={dataBR(t.terminationDate)} /> : null}
          {t.reasonCode ? <Row k="Motivo" v={rotulo(MOTIVOS_DESLIGAMENTO, t.reasonCode).replace(' (justificar)', '')} /> : null}
          <Row k="Aviso prévio" v={t.noticeMode ? rotulo(MODALIDADES_AVISO, t.noticeMode) : t.noticeType ? NOTICE[t.noticeType] : t.terminationKind ? 'Não se aplica a este tipo' : '—'} />
          {t.noticeJustification ? <Row k="Justificativa do aviso" v={t.noticeJustification} /> : null}
          {t.letterPath ? <Row k="Carta de pedido de demissão" v="Anexada (PDF)" /> : null}
          <Row k="Idade" v={t.ageYears ? `${t.ageYears} anos` : '—'} />
          <Row k="Tempo de empresa" v={t.tenureText ?? '—'} />
          <Row k="Atestados no sistema" v={`${t.certCount} atestado(s) · ${t.certDays} dia(s) afastado(s)`} />
          <Row k="Data da solicitação" v={fmt(t.createdAt)} />
        </tbody>
      </table>

      <div>
        <p className="sgo-type-11 font-semibold text-ink-500">Motivo do desligamento</p>
        <p className="whitespace-pre-wrap text-sm">{t.reason}</p>
      </div>

      <div className="rounded border border-line-strong p-2">
        <p className="sgo-type-11 font-semibold text-ink-500">Parecer do supervisor</p>
        <p className="text-sm">{t.status === 'PENDING' ? 'Aguardando.' : `${STAT[t.status]} por ${t.approvedBy?.name ?? '—'} em ${fmt(t.approvedAt)}.`}</p>
        {t.rejectionReason && <p className="mt-1 text-sm"><b>Motivo da recusa:</b> {t.rejectionReason}</p>}
      </div>

      {t.status === 'APPROVED' && t.terminationKind && (
        <div className="rounded border border-line-strong p-2">
          <p className="sgo-type-11 font-semibold text-ink-500">Andamento no RH (GBF-RH)</p>
          <p className="text-sm">
            {t.rhProcesso ? <>Processo <b>{t.rhProcesso}</b> · </> : null}
            Situação: <b>{t.rhSituacao ? rotuloDaSituacao(t.rhSituacao) : 'aguardando envio automático'}</b>
            {t.rhPrazoLegal ? <> · prazo legal {dataBR(t.rhPrazoLegal)}</> : null}
            {t.rhSituacaoAt ? <> · atualizado em {fmt(t.rhSituacaoAt)}</> : null}
          </p>
        </div>
      )}

      <p className="pt-4 text-center text-[10px] text-ink-500">Gerado pelo SGO Beija Flor · {fmt(new Date())} · Encaminhar ao RH após aprovação.</p>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return <tr className="border-b border-line"><td className="py-1 pr-4 align-top font-semibold text-ink-500">{k}</td><td className="py-1 align-top">{v}</td></tr>;
}
