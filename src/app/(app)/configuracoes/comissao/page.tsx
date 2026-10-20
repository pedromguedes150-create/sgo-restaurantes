import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { LargeTitle } from '@/components/layout/page-chrome';
import { ConfigComissaoClient } from '@/components/comissao/config-comissao-client';
import { getPercentuais, quadroDeFuncoes, PODE_CONFIGURAR_FUNCOES } from '@/lib/comissao/config';

export const dynamic = 'force-dynamic';

/** Configurações → Comissão: percentuais (Admin) e funções da cozinha (Admin/CEO/Coordenador). */
export default async function ConfigComissaoPage() {
  const user = (await getSessionUser())!;
  const [percentuais, funcoes] = await Promise.all([getPercentuais(), quadroDeFuncoes()]);
  return (
    <div className="space-y-4">
      <Link href="/modulos/comissao" className="inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-900"><ArrowLeft className="h-4 w-4" /> Comissão</Link>
      <LargeTitle title="Comissão — percentuais e funções da cozinha" subtitle="O que a apuração da planilha do Teknisa usa: o % do vendedor, o % do GRUPO BEIJA FLOR e quais funções dividem a parte da cozinha." />
      <ConfigComissaoClient percentuais={percentuais} funcoes={funcoes} podeEditarPct={user.role === 'ADMIN'} podeEditarFuncoes={PODE_CONFIGURAR_FUNCOES.has(user.role)} />
    </div>
  );
}
