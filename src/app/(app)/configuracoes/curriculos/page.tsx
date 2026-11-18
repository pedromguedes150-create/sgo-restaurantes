import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { LargeTitle } from '@/components/layout/page-chrome';
import { CargosAdmin } from '@/components/curriculos/cargos-admin';
import { listarCargos } from '@/lib/curriculos/cargos';

export const dynamic = 'force-dynamic';

/** Configurações → Currículos: os cargos do encaminhamento (Admin/CEO). */
export default async function ConfigCurriculosPage() {
  const user = (await getSessionUser())!;
  const cargos = await listarCargos();
  return (
    <div className="space-y-4">
      <Link href="/modulos/curriculos" className="inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-900"><ArrowLeft className="h-4 w-4" /> Central de Currículos</Link>
      <LargeTitle title="Currículos — cargos" subtitle="A lista que o gerente vê em “Cargo pretendido” ao encaminhar um currículo." />
      <CargosAdmin cargos={cargos.map((c) => ({ id: c.id, name: c.name, active: c.active }))} podeEditar={['ADMIN', 'CEO'].includes(user.role)} />
    </div>
  );
}
