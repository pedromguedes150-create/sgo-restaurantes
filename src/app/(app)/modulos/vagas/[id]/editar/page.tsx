import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { LargeTitle } from '@/components/layout/page-chrome';
import { FormularioVaga } from '@/components/vagas/formulario-vaga';
import { apoioDoFormulario, getVaga, papelNaVaga, permissoesDeVagas } from '@/lib/vagas/dados';
import { acoesDaVaga } from '@/lib/vagas/regras';
import { diaBR } from '@/lib/vagas/acompanhamento';

export const dynamic = 'force-dynamic';

/** O mesmo formulário para duas portas: o gerente CORRIGE a devolvida; quem aprova EDITA (a situação não muda). */
export default async function EditarVagaPage({ params }: { params: { id: string } }) {
  const user = (await getSessionUser())!;
  const vaga = await getVaga(user, params.id);
  if (!vaga) notFound();
  const acoes = acoesDaVaga(vaga.status, papelNaVaga(user, await permissoesDeVagas(user), vaga.unitId));
  const modo = acoes.includes('corrigir') ? 'corrigir' : acoes.includes('editar') ? 'editar' : null;
  const hoje = diaBR(new Date());
  return (
    <div className="space-y-4">
      <Link href={`/modulos/vagas/${vaga.id}`} className="inline-flex items-center gap-1 text-sm font-semibold text-brand"><ArrowLeft className="h-4 w-4" /> {vaga.codigo}</Link>
      <LargeTitle title={modo === 'corrigir' ? `Corrigir ${vaga.codigo}` : `Editar ${vaga.codigo}`} subtitle={modo === 'editar' ? 'A situação da vaga não muda. O que for alterado vira registro na linha do tempo e o gerente é avisado.' : 'Ajuste o que o supervisor pediu e reenvie.'} />
      {modo
        ? <FormularioVaga modo={modo} apoio={await apoioDoFormulario(user, hoje)} hoje={hoje} vaga={vaga} />
        : <p className="text-sm text-ink-500">Esta vaga não pode ser alterada na situação atual.</p>}
    </div>
  );
}
