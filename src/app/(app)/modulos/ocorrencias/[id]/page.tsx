import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { getOccurrence } from '@/lib/occurrences/query';
import { GRAVITY_META, STATUS_META } from '@/lib/occurrences/labels';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import { CloseForm } from '@/components/occurrences/close-form';
import { ProgressButton } from '@/components/occurrences/progress-button';
import { DeleteOpButton } from '@/components/admin/delete-op-button';
import { ArrowLeft, Paperclip } from 'lucide-react';

export const dynamic = 'force-dynamic';

function fmt(d: Date | null) {
  return d ? new Date(d).toLocaleString('pt-BR') : '—';
}

export default async function OcorrenciaDetailPage({ params }: { params: { id: string } }) {
  const user = (await getSessionUser())!;
  const o = await getOccurrence(user, params.id);
  if (!o) notFound();

  const canClose =
    (user.role === 'SUPERVISOR' || user.role === 'ADMIN' || user.role === 'CEO') && o.status !== 'CLOSED';
  const isAdmin = user.role === 'ADMIN';

  return (
    <div className="space-y-4">
      <Link href="/modulos/ocorrencias" className="inline-flex items-center gap-1 text-sm font-semibold text-accent">
        <ArrowLeft className="h-4 w-4" /> Voltar
      </Link>

      <div className="flex items-start justify-between gap-3">
        <h1 className="text-xl font-bold text-brand">
          #{o.unit.code}-{String(o.number).padStart(4, '0')}
        </h1>
        <StatusBadge tone={STATUS_META[o.status].tone}>{STATUS_META[o.status].label}</StatusBadge>
      </div>

      <Card>
        <CardContent className="space-y-2 py-4 text-sm">
          <Row label="Unidade" value={o.unit.name} />
          <Row label="Tipo / Categoria" value={`${o.typeName} — ${o.categoryName}`} />
          <Row label="Gravidade" value={`${GRAVITY_META[o.gravity].emoji} ${GRAVITY_META[o.gravity].label}`} />
          {o.isRecurrence && <Row label="Reincidência" value="♻ Sim (mesmo tipo+categoria em <30 dias)" />}
          <Row label="Ocorrido em" value={fmt(o.occurredAt)} />
          <Row label="Registrado por" value={o.reportedBy?.name ?? '—'} />
          {o.customerName && <Row label="Cliente" value={o.customerName} />}
          <div className="pt-1">
            <p className="font-semibold text-muted-foreground">Descrição</p>
            <p className="whitespace-pre-wrap">{o.description}</p>
          </div>
          {o.attachments.length > 0 && (
            <div className="pt-1">
              <p className="font-semibold text-muted-foreground">Anexos</p>
              <ul className="space-y-1">
                {o.attachments.map((a) => (
                  <li key={a.id} className="inline-flex items-center gap-1 text-muted-foreground">
                    <Paperclip className="h-3.5 w-3.5" /> {a.mimeType}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      {o.status === 'CLOSED' && (
        <Card className="border-success/40">
          <CardHeader>
            <CardTitle className="text-success">Encerramento</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 py-2 text-sm">
            <Row label="Encerrada por" value={o.closedBy?.name ?? '—'} />
            <Row label="Em" value={fmt(o.closedAt)} />
            <Row label="Revisão prevista" value={fmt(o.reviewDate)} />
            <div className="pt-1">
              <p className="font-semibold text-muted-foreground">Justificativa</p>
              <p className="whitespace-pre-wrap">{o.closureJustification}</p>
            </div>
            <div className="pt-1">
              <p className="font-semibold text-muted-foreground">Ação corretiva</p>
              <p className="whitespace-pre-wrap">{o.correctiveAction}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {canClose && o.status === 'OPEN' && <ProgressButton occurrenceId={o.id} />}

      {canClose && (
        <Card>
          <CardHeader>
            <CardTitle>Encerrar ocorrência</CardTitle>
          </CardHeader>
          <CardContent>
            <CloseForm occurrenceId={o.id} />
          </CardContent>
        </Card>
      )}

      {isAdmin && (
        <Card className="border-critical/30">
          <CardHeader>
            <CardTitle className="text-critical">Excluir (admin)</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">Remove a ocorrência e seus anexos. Registrado na Auditoria.</p>
            <DeleteOpButton entity="occurrence" id={o.id} label={`a ocorrência #${o.number}`} redirectTo="/modulos/ocorrencias" />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}
