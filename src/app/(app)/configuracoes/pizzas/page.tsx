import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { Card, CardContent } from '@/components/ui/card';
import { LargeTitle } from '@/components/layout/page-chrome';
import { UnitSelectNav } from '@/components/ui/unit-select-nav';
import { Banner } from '@/components/ui/ds/banner';
import { unidadesComPizzaria } from '@/lib/pizzas/acesso';
import { listarSabores } from '@/lib/pizzas/catalogo';
import { PizzaFlavorsAdmin } from '@/components/pizzas/pizza-flavors-admin';

export const dynamic = 'force-dynamic';

export default async function ConfigPizzasPage({ searchParams }: { searchParams: { unit?: string } }) {
  const user = (await getSessionUser())!;
  const unidades = await unidadesComPizzaria(user);
  const unidade = unidades.find((u) => u.id === searchParams.unit) ?? unidades[0] ?? null;
  const sabores = unidade ? await listarSabores(user, unidade.id) : [];

  return (
    <div className="space-y-4">
      <Link href="/configuracoes" className="inline-flex items-center gap-1 text-sm font-semibold text-brand">
        <ArrowLeft className="h-4 w-4" /> Configurações
      </Link>
      <LargeTitle
        title="Pizzas (sabores)"
        subtitle="O cardápio que aparece no link de fechamento. É cadastro, e não texto digitado, para o consumo de insumos poder ser somado por sabor mais adiante."
      />

      {!unidade ? (
        /* Sem unidade marcada não há catálogo possível, e o caminho é outra
           tela — dizer onde poupa uma caça ao tesouro em Configurações. */
        <Banner
          tone="info"
          title="Nenhuma unidade está marcada como tendo pizzaria"
          description="Marque a unidade em Configurações → Unidades: abra a edição dela e use “Esta unidade tem pizzaria”. Só então o catálogo e o módulo passam a existir."
        />
      ) : (
        <>
          {unidades.length > 1 && (
            <UnitSelectNav units={unidades.map((u) => ({ id: u.id, name: u.name }))} selected={unidade.id} />
          )}
          <Card>
            <CardContent className="pt-4">
              <PizzaFlavorsAdmin unitId={unidade.id} sabores={sabores} />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
