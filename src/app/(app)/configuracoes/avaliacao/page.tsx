import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { ensureModelosIniciais, listarModelos, funcoesSemModelo, cargosDoRh, podeConfigurarAvaliacao } from '@/lib/people/avaliacao-modelos';
import { Card, CardContent } from '@/components/ui/card';
import { AvaliacaoModelosConfig } from '@/components/admin/avaliacao-modelos-config';
import { LargeTitle } from '@/components/layout/page-chrome';

export const dynamic = 'force-dynamic';

/** Modelos de avaliação por função (v1.161.0): critérios, pesos e vínculo com os cargos do RH. Só Admin/CEO. */
export default async function AvaliacaoConfigPage() {
  const user = (await getSessionUser())!;
  if (!podeConfigurarAvaliacao(user.role)) return <p className="text-sm text-ink-500">Restrito ao Administrador.</p>;
  await ensureModelosIniciais();
  const [modelos, semModelo, cargos] = await Promise.all([listarModelos(), funcoesSemModelo(), cargosDoRh()]);

  return (
    <div className="space-y-4">
      <Link href="/configuracoes" className="inline-flex items-center gap-1 text-sm font-semibold text-brand"><ArrowLeft className="h-4 w-4" /> Configurações</Link>
      <LargeTitle
        title="Avaliação por função"
        subtitle="Cada cargo do RH aponta para um modelo: 4 critérios gerais (40%) iguais para todos + 4 específicos da função (60%). Mudar critério ou peso cria uma versão nova — as avaliações já feitas guardam a versão usada."
      />
      <Card><CardContent className="pt-4">
        <AvaliacaoModelosConfig modelos={modelos} semModelo={semModelo} cargos={cargos} />
      </CardContent></Card>
    </div>
  );
}
