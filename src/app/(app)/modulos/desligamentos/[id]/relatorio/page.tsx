import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { getTermination } from '@/lib/terminations';
import { PrintButton } from '@/components/ui/print-button';
import { ArrowLeft } from 'lucide-react';

export const dynamic = 'force-dynamic';

const NOTICE = { WORKED: 'Aviso trabalhado', INDEMNIFIED: 'Aviso indenizado' } as const;
const STAT = { PENDING: 'Aguardando aprovação do supervisor', APPROVED: 'Aprovado', REJECTED: 'Recusado' } as const;
function fmt(d: Date | null) { return d ? new Date(d).toLocaleString('pt-BR') : '—'; }

export default async function TerminationReportPage({ params }: { params: { id: string } }) {
  const user = (await getSessionUser())!;
  const t = await getTermination(user, params.id);
  if (!t) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-4 bg-white p-2 text-black print:p-0">
      <div className="flex items-center justify-between gap-2 print:hidden">
        <Link href="/modulos/desligamentos" className="inline-flex items-center gap-1 text-sm font-semibold text-accent"><ArrowLeft className="h-4 w-4" /> Voltar</Link>
        <PrintButton />
      </div>

      <div className="border-b-2 border-brand pb-3">
        <p className="text-xs font-bold uppercase tracking-wide text-brand">Solicitação de Desligamento — SGO Beija Flor</p>
        <h1 className="text-2xl font-black text-brand">{t.collaboratorName}</h1>
        <p className="text-sm text-gray-600">{t.unit.name} · {STAT[t.status]}</p>
      </div>

      <table className="w-full text-sm">
        <tbody>
          <Row k="Empresa" v={t.unit.name} />
          <Row k="Colaborador" v={t.collaboratorName} />
          <Row k="Solicitante (gerente)" v={t.requestedBy?.name ?? '—'} />
          <Row k="Tipo de aviso" v={NOTICE[t.noticeType]} />
          {t.noticeJustification ? <Row k="Justificativa do aviso" v={t.noticeJustification} /> : null}
          <Row k="Idade" v={t.ageYears ? `${t.ageYears} anos` : '—'} />
          <Row k="Tempo de empresa" v={t.tenureText ?? '—'} />
          <Row k="Atestados no sistema" v={`${t.certCount} atestado(s) · ${t.certDays} dia(s) afastado(s)`} />
          <Row k="Data da solicitação" v={fmt(t.createdAt)} />
        </tbody>
      </table>

      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Motivo do desligamento</p>
        <p className="whitespace-pre-wrap text-sm">{t.reason}</p>
      </div>

      <div className="rounded border border-gray-300 p-2">
        <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Parecer do supervisor</p>
        <p className="text-sm">{t.status === 'PENDING' ? 'Aguardando.' : `${STAT[t.status]} por ${t.approvedBy?.name ?? '—'} em ${fmt(t.approvedAt)}.`}</p>
        {t.rejectionReason && <p className="mt-1 text-sm"><b>Motivo da recusa:</b> {t.rejectionReason}</p>}
      </div>

      <p className="pt-4 text-center text-[10px] text-gray-400">Gerado pelo SGO Beija Flor · {fmt(new Date())} · Encaminhar ao RH após aprovação.</p>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return <tr className="border-b border-gray-200"><td className="py-1 pr-4 align-top font-semibold text-gray-600">{k}</td><td className="py-1 align-top">{v}</td></tr>;
}
