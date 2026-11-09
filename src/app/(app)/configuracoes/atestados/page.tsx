import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { LargeTitle } from '@/components/layout/page-chrome';
import { ConfigNomenclaturasClient } from '@/components/certificates/config-nomenclaturas-client';
import { listarConfigDasNomenclaturas } from '@/lib/certificates/config-nomenclaturas';

export const dynamic = 'force-dynamic';

/** Configurações → Atestados e afins: a correspondência SGO ↔ RH por nomenclatura e as regras (v1.198.0). */
export default async function ConfigAtestadosPage() {
  const user = (await getSessionUser())!;
  const itens = await listarConfigDasNomenclaturas();
  return (
    <div className="space-y-4">
      <Link href="/modulos/atestados" className="inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-900"><ArrowLeft className="h-4 w-4" /> Central de Atestados e Afins</Link>
      <LargeTitle title="Atestados e afins — nomenclaturas e regras" subtitle="Os 25 tipos do catálogo em 4 grupos, sem código. Aqui o Administrador define como cada um se chama no sistema do RH, se está ativo e, quando a convenção coletiva manda, a duração que vence a tabela legal." />
      <ConfigNomenclaturasClient itens={itens} podeEditar={['ADMIN', 'CEO'].includes(user.role)} />
    </div>
  );
}
