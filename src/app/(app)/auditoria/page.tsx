import Link from 'next/link';
import { getSessionUser } from '@/lib/auth/session';
import { listAuditLogs, canViewAudit } from '@/lib/audit-query';
import { LargeTitle } from '@/components/layout/page-chrome';
import { Button } from '@/components/ui/ds/button';
import { AuditClient } from '@/components/audit/audit-client';
import { FileText } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function AuditoriaPage() {
  const user = (await getSessionUser())!;
  if (!canViewAudit(user)) {
    return <p className="text-sm text-ink-500">Acesso restrito ao Administrador e à Diretoria.</p>;
  }

  // Busca e filtros acontecem no cliente sobre esta janela — resposta imediata,
  // sem ida ao servidor a cada tecla. O recorte longo fica no Relatório.
  const logs = await listAuditLogs({ take: 300 });

  return (
    <div className="space-y-4">
      <LargeTitle
        title="Log de Auditoria"
        subtitle="Registro imutável de ações críticas. Acessos a dados sensíveis também são auditados (LGPD)."
        actions={
          <Link href="/auditoria/relatorio">
            <Button size="sm" variant="secondary"><FileText className="h-4 w-4" /> Relatório / Export</Button>
          </Link>
        }
      />

      <AuditClient
        rows={logs.map((l) => ({
          id: l.id,
          action: l.action,
          module: l.module,
          userName: l.user?.name ?? null,
          unitName: l.unit?.name ?? null,
          createdAt: l.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
