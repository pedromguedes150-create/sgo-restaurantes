import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { LargeTitle } from '@/components/layout/page-chrome';
import { FormularioVaga } from '@/components/vagas/formulario-vaga';
import { apoioDoFormulario, permissoesDeVagas } from '@/lib/vagas/dados';
import { diaBR } from '@/lib/vagas/acompanhamento';

export const dynamic = 'force-dynamic';

export default async function NovaVagaPage() {
  const user = (await getSessionUser())!;
  const perm = await permissoesDeVagas(user);
  if (!perm.pedir) return <p className="text-sm text-ink-500">Você não tem permissão para pedir vaga.</p>;
  const hoje = diaBR(new Date());
  const apoio = await apoioDoFormulario(user, hoje);
  return (
    <div className="space-y-4">
      <Link href="/modulos/vagas" className="inline-flex items-center gap-1 text-sm font-semibold text-brand"><ArrowLeft className="h-4 w-4" /> Solicitação de Vagas</Link>
      <LargeTitle title="Nova vaga" subtitle="Uma linha por pessoa. O supervisor aprova em até 1 dia útil e o SGO envia ao RH." />
      {apoio.unidades.length === 0
        ? <p className="text-sm text-ink-500">Você não está vinculado a nenhuma unidade ativa.</p>
        : <FormularioVaga modo="nova" apoio={apoio} hoje={hoje} />}
    </div>
  );
}
