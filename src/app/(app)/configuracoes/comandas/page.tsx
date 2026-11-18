import Link from 'next/link';
import { getSessionUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { Card, CardContent } from '@/components/ui/card';
import { CommandsConfigAdmin } from '@/components/admin/commands-config-admin';
import { ProgramacaoConferenciaAdmin } from '@/components/admin/programacao-conferencia-admin';
import { ArrowLeft } from 'lucide-react';
import { LargeTitle } from '@/components/layout/page-chrome';

export const dynamic = 'force-dynamic';

export default async function ComandasConfigPage() {
  const user = (await getSessionUser())!;
  if (user.role !== 'ADMIN') return <p className="text-sm text-ink-500">Restrito ao Administrador.</p>;

  const [units, sequences, programacoes, excecoes] = await Promise.all([
    prisma.unit.findMany({ where: { active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    prisma.commandSequence.findMany({ orderBy: [{ order: 'asc' }, { rangeStart: 'asc' }], select: { id: true, unitId: true, name: true, rangeStart: true, rangeEnd: true, active: true, nightly: true } }),
    prisma.commandSchedule.count(),
    prisma.commandScheduleException.count(),
  ]);
  const temProgramacao = programacoes + excecoes > 0;

  return (
    <div className="space-y-4">
      <Link href="/configuracoes" className="inline-flex items-center gap-1 text-sm font-semibold text-brand"><ArrowLeft className="h-4 w-4" /> Configurações</Link>
      <LargeTitle title="Comandas — sequências por unidade" />
      <Card><CardContent className="pt-4">
        <CommandsConfigAdmin units={units} sequences={sequences} />
      </CardContent></Card>
      {/* v1.213.0 — avançado e opcional: nasce fechado, salvo se alguma unidade já programa. */}
      <Card><CardContent className="pt-4">
        <details open={temProgramacao} data-testid="programacao-avancada">
          <summary className="cursor-pointer text-sm font-semibold text-ink-900">Avançado — programar a conferência por dia da semana (opcional)</summary>
          <p className="mt-1 text-xs text-ink-500">Não é necessário: sem programação, o gerente escolhe parcial ou completa ao iniciar a conferência.</p>
          <div className="mt-3"><ProgramacaoConferenciaAdmin units={units} /></div>
        </details>
      </CardContent></Card>
    </div>
  );
}
