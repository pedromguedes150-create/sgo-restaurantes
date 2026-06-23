import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { getOccurrence } from '@/lib/occurrences/query';
import { GRAVITY_META, STATUS_META } from '@/lib/occurrences/labels';
import { PrintButton } from '@/components/ui/print-button';
import { ArrowLeft } from 'lucide-react';

export const dynamic = 'force-dynamic';

function fmt(d: Date | null) { return d ? new Date(d).toLocaleString('pt-BR') : '—'; }

export default async function OcorrenciaRelatorioPage({ params }: { params: { id: string } }) {
  const user = (await getSessionUser())!;
  const o = await getOccurrence(user, params.id);
  if (!o) notFound();

  const images = o.attachments.filter((a) => a.mimeType.startsWith('image/'));

  return (
    <div className="mx-auto max-w-3xl space-y-4 bg-white p-2 print:p-0 text-black">
      <div className="flex items-center justify-between gap-2 print:hidden">
        <Link href={`/modulos/ocorrencias/${o.id}`} className="inline-flex items-center gap-1 text-sm font-semibold text-accent"><ArrowLeft className="h-4 w-4" /> Voltar</Link>
        <PrintButton />
      </div>

      {/* Cabeçalho do relatório */}
      <div className="border-b-2 border-brand pb-3">
        <p className="text-xs font-bold uppercase tracking-wide text-brand">Relatório de Ocorrência — SGO Beija Flor</p>
        <h1 className="text-2xl font-black text-brand">#{o.unit.code}-{String(o.number).padStart(4, '0')} · {o.typeName}</h1>
        <p className="text-sm text-gray-600">{o.unit.name} · {GRAVITY_META[o.gravity].emoji} {GRAVITY_META[o.gravity].label} · {STATUS_META[o.status].label}</p>
      </div>

      <table className="w-full text-sm">
        <tbody>
          <Row k="Tipo / Categoria" v={`${o.typeName} — ${o.categoryName}`} />
          <Row k="Gravidade" v={`${GRAVITY_META[o.gravity].emoji} ${GRAVITY_META[o.gravity].label}`} />
          <Row k="Ocorrido em" v={fmt(o.occurredAt)} />
          <Row k="Registrado por" v={o.reportedBy?.name ?? '—'} />
          {o.customerName ? <Row k="Cliente" v={o.customerName} /> : null}
          {o.isRecurrence ? <Row k="Reincidência" v="Sim (mesmo tipo+categoria em <30 dias)" /> : null}
        </tbody>
      </table>

      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Descrição</p>
        <p className="whitespace-pre-wrap text-sm">{o.description}</p>
      </div>

      {o.status === 'CLOSED' && (
        <div className="rounded border border-gray-300 p-2">
          <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Encerramento</p>
          <p className="text-sm">Por {o.closedBy?.name ?? '—'} em {fmt(o.closedAt)} · Revisão: {fmt(o.reviewDate)}</p>
          <p className="mt-1 text-sm"><b>Justificativa:</b> {o.closureJustification}</p>
          <p className="text-sm"><b>Ação corretiva:</b> {o.correctiveAction}</p>
        </div>
      )}

      {images.length > 0 && (
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Anexos</p>
          <div className="flex flex-wrap gap-2">
            {images.map((a) => <img key={a.id} src={`/${a.path}`} alt="" className="max-h-64 rounded border" />)}
          </div>
        </div>
      )}

      <p className="pt-4 text-center text-[10px] text-gray-400">Gerado pelo SGO Beija Flor · {fmt(new Date())}</p>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <tr className="border-b border-gray-200">
      <td className="py-1 pr-4 align-top font-semibold text-gray-600">{k}</td>
      <td className="py-1 align-top">{v}</td>
    </tr>
  );
}
