import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { Card, CardContent } from '@/components/ui/card';
import { LargeTitle } from '@/components/layout/page-chrome';
import { listScheduleTemplates } from '@/lib/schedule/templates';
import { ScheduleTemplatesAdmin } from '@/components/admin/schedule-templates-admin';

export const dynamic = 'force-dynamic';

export default async function TiposDeEscalaPage() {
  const user = (await getSessionUser())!;
  if (user.role !== 'ADMIN') return <p className="text-sm text-ink-500">Restrito ao Administrador.</p>;

  const templates = await listScheduleTemplates();

  return (
    <div className="space-y-4">
      <Link href="/configuracoes" className="inline-flex items-center gap-1 text-sm font-semibold text-brand">
        <ArrowLeft className="h-4 w-4" /> Configurações
      </Link>
      <LargeTitle title="Tipos de escala" subtitle="O ciclo e os horários que geram o Planejado" />
      <Card><CardContent className="pt-4">
        <ScheduleTemplatesAdmin
          templates={templates.map((t) => ({
            id: t.id, name: t.name, workDays: t.workDays, offDays: t.offDays,
            startTime: t.startTime, breakTime: t.breakTime, endTime: t.endTime, active: t.active,
          }))}
        />
      </CardContent></Card>
    </div>
  );
}
