import Link from 'next/link';
import { getSessionUser } from '@/lib/auth/session';
import { listAuditLogs, getAuditModules, canViewAudit } from '@/lib/audit-query';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollText, FileText } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function AuditoriaPage({ searchParams }: { searchParams: { module?: string } }) {
  const user = (await getSessionUser())!;
  if (!canViewAudit(user)) {
    return <p className="text-sm text-muted-foreground">Acesso restrito ao Administrador e à Diretoria.</p>;
  }

  const moduleFilter = searchParams.module;
  const [logs, modules] = await Promise.all([listAuditLogs({ module: moduleFilter, take: 150 }), getAuditModules()]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="flex items-center gap-2 text-xl font-bold text-brand"><ScrollText className="h-5 w-5 text-accent" /> Log de Auditoria</h1>
        <Link href="/auditoria/relatorio" className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm font-semibold hover:bg-muted"><FileText className="h-4 w-4" /> Relatório / Export</Link>
      </div>
      <p className="text-sm text-muted-foreground">Registro imutável de ações críticas (LGPD: acessos a dados sensíveis são auditados).</p>

      <div className="flex flex-wrap gap-2">
        <Link href="/auditoria" className={!moduleFilter ? 'rounded-full bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground' : 'rounded-full border px-3 py-1.5 text-sm font-medium'}>Todos</Link>
        {modules.map((m) => (
          <Link key={m} href={`/auditoria?module=${m}`} className={moduleFilter === m ? 'rounded-full bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground' : 'rounded-full border px-3 py-1.5 text-sm font-medium'}>{m}</Link>
        ))}
      </div>

      <Card>
        <CardContent className="divide-y p-0">
          {logs.length === 0 && <p className="p-4 text-sm text-muted-foreground">Nenhum registro.</p>}
          {logs.map((l) => (
            <div key={l.id} className="flex items-start justify-between gap-3 px-4 py-2.5 text-sm">
              <div className="min-w-0">
                <p className="font-semibold text-brand">{l.action} <span className="text-xs font-normal text-muted-foreground">· {l.module ?? '—'}</span></p>
                <p className="truncate text-xs text-muted-foreground">
                  {l.user?.name ?? 'sistema'}{l.unit?.name ? ` · ${l.unit.name}` : ''}
                </p>
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">{new Date(l.createdAt).toLocaleString('pt-BR')}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
