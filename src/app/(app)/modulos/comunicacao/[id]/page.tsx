import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import { getCommunication, getCommunicationForEdit } from '@/lib/communications/query';
import { Card, CardContent } from '@/components/ui/card';
import { StatusBadge, type StatusTone } from '@/components/ui/status-badge';
import { CommunicationConfirm } from '@/components/communications/communication-confirm';
import { CommunicationEdit } from '@/components/communications/communication-edit';
import { RemindButton } from '@/components/communications/remind-button';
import { DeleteOpButton } from '@/components/admin/delete-op-button';
import { ArrowLeft, Pin, Paperclip, LinkIcon, CheckCircle2, Clock, FileText } from 'lucide-react';

export const dynamic = 'force-dynamic';

const PRIO: Record<string, { label: string; tone: StatusTone } | null> = {
  NORMAL: null, IMPORTANT: { label: 'Importante', tone: 'medium' }, URGENT: { label: 'Urgente', tone: 'critical' },
};
function fmt(d: Date) { return new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
function isImg(mime: string) { return mime.startsWith('image/'); }

export default async function ComunicacaoDetailPage({ params }: { params: { id: string } }) {
  const user = (await getSessionUser())!;
  const data = await getCommunication(user, params.id);
  if (!data) notFound();
  const { comm, myRecipient, canManage, isAuthor } = data;
  const prio = PRIO[comm.priority];

  // Edição (apenas o autor): carrega valores atuais + unidades/pessoas do escopo.
  const editData = isAuthor ? await getCommunicationForEdit(user, comm.id) : null;
  const [editUnits, editPeople] = editData
    ? await Promise.all([
        prisma.unit.findMany({ where: { active: true, ...unitScopeWhere(user, 'id') }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
        prisma.user.findMany({
          where: { active: true, id: { not: user.id }, ...(user.seesAllUnits ? {} : { memberships: { some: { unitId: { in: user.unitIds } } } }) },
          orderBy: { name: 'asc' }, select: { id: true, name: true, role: true },
        }),
      ])
    : [[], []];
  const links = Array.isArray(comm.links) ? (comm.links as { label: string; url: string }[]) : [];

  const confirmed = comm.recipients.filter((r) => r.status === 'CONFIRMED');
  const pending = comm.recipients.filter((r) => r.status === 'PENDING');
  const pct = comm.recipients.length === 0 ? 0 : Math.round((confirmed.length / comm.recipients.length) * 100);

  return (
    <div className="space-y-4">
      <Link href="/modulos/comunicacao" className="inline-flex items-center gap-1 text-sm font-semibold text-brand"><ArrowLeft className="h-4 w-4" /> Central de Comunicação</Link>

      <Card>
        <CardContent className="space-y-3 pt-4">
          <div className="flex items-start justify-between gap-2">
            <h1 className="flex items-center gap-1.5 text-lg font-bold text-ink-900">{comm.pinned && <Pin className="h-4 w-4 text-ink-700" />}{comm.title}</h1>
            {prio && <StatusBadge tone={prio.tone}>{prio.label}</StatusBadge>}
          </div>
          <p className="text-xs text-ink-500">por {comm.author?.name ?? 'Sistema'} · publicado {fmt(comm.createdAt)} · prazo {fmt(comm.dueAt)}</p>
          <p className="whitespace-pre-wrap text-sm text-ink-900">{comm.body}</p>

          {links.length > 0 && (
            <div className="space-y-1">
              {links.map((l, i) => (
                <a key={i} href={l.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-sm font-medium text-brand hover:underline">
                  <LinkIcon className="h-4 w-4" /> {l.label || l.url}
                </a>
              ))}
            </div>
          )}

          {comm.attachments.length > 0 && (
            <div className="space-y-2">
              <p className="flex items-center gap-1 sgo-type-11 font-semibold text-ink-500"><Paperclip className="h-3.5 w-3.5" /> Anexos</p>
              <div className="flex flex-wrap gap-2">
                {comm.attachments.map((a) => isImg(a.mimeType) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <a key={a.id} href={`/${a.path}`} target="_blank" rel="noopener noreferrer"><img src={`/${a.path}`} alt={a.name ?? 'anexo'} className="h-24 w-24 rounded-lg border object-cover" /></a>
                ) : (
                  <a key={a.id} href={`/${a.path}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium text-brand hover:border-brand"><FileText className="h-4 w-4" /> {a.name ?? 'Documento PDF'}</a>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edição (apenas o autor) */}
      {editData && (
        <Card><CardContent className="pt-4">
          <CommunicationEdit id={comm.id} initial={editData} units={editUnits} people={editPeople} />
        </CardContent></Card>
      )}

      {/* Confirmação do gerente */}
      {myRecipient && (
        myRecipient.status === 'CONFIRMED' ? (
          <Card><CardContent className="flex items-center gap-2 py-3 text-sm font-semibold text-success">
            <CheckCircle2 className="h-5 w-5" /> Você confirmou em {myRecipient.confirmedAt ? fmt(myRecipient.confirmedAt) : '—'}{myRecipient.late ? ' (atrasado)' : ''}.
          </CardContent></Card>
        ) : (
          <CommunicationConfirm id={comm.id} requiresResponse={comm.requiresResponse} />
        )
      )}

      {/* Painel de confirmações (autor/supervisão/admin) */}
      {canManage && (
        <Card>
          <CardContent className="space-y-3 pt-4">
            <div className="flex items-center justify-between">
              <h2 className="sgo-type-11 font-semibold text-ink-900">Confirmações</h2>
              <span className="text-sm font-bold text-ink-900">{confirmed.length}/{comm.recipients.length}</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-sunken"><div className="h-full rounded-full bg-success" style={{ width: `${pct}%` }} /></div>

            {pending.length > 0 && (
              <div>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <p className="flex items-center gap-1 text-xs font-semibold text-warning"><Clock className="h-3.5 w-3.5" /> Pendentes ({pending.length})</p>
                  <RemindButton id={comm.id} pending={pending.length} />
                </div>
                <div className="space-y-1">
                  {pending.map((r) => (
                    <div key={r.id} className="flex items-center justify-between rounded-lg border bg-surface px-3 py-1.5 text-sm">
                      <span>{r.user.name}</span>
                      <span className="text-xs text-ink-500">{r.unit?.name ?? '—'}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <p className="mb-1 flex items-center gap-1 text-xs font-semibold text-success"><CheckCircle2 className="h-3.5 w-3.5" /> Confirmados ({confirmed.length})</p>
              <div className="space-y-1">
                {confirmed.length === 0 && <p className="text-xs text-ink-500">Ninguém confirmou ainda.</p>}
                {confirmed.map((r) => (
                  <div key={r.id} className="rounded-lg border bg-surface px-3 py-1.5 text-sm">
                    <div className="flex items-center justify-between">
                      <span>{r.user.name}</span>
                      <span className="text-xs text-ink-500">{r.confirmedAt ? fmt(r.confirmedAt) : ''}{r.late ? ' · atrasado' : ''}</span>
                    </div>
                    {(r.responseNote || r.responsePath) && (
                      <div className="mt-1 flex items-center gap-2 text-xs text-ink-500">
                        {r.responseNote && <span>“{r.responseNote}”</span>}
                        {r.responsePath && <a href={`/${r.responsePath}`} target="_blank" rel="noopener noreferrer" className="font-medium text-brand hover:underline">ver foto</a>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {user.role === 'ADMIN' && (
              <div className="border-t pt-2">
                <DeleteOpButton entity="communication" id={comm.id} label={`o comunicado "${comm.title}"`} redirectTo="/modulos/comunicacao" confirmText={`Excluir o comunicado "${comm.title}" e todas as confirmações? Registrado na Auditoria. Não pode ser desfeito.`} />
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
