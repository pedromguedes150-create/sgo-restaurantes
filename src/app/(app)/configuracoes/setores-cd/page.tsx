import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { LargeTitle } from '@/components/layout/page-chrome';
import { listarSetoresDoCd } from '@/lib/products/setores';
import { ensureSetoresDoRomaneio } from '@/lib/products/setores-padrao';
import { CdSectorsAdmin } from '@/components/products/cd-sectors-admin';

export const dynamic = 'force-dynamic';

export default async function ConfigSetoresCdPage() {
  /* Cria os setores do romaneio do CD que ainda não têm equivalente — mesmo
     padrão de `ensureDefaultModels()`. Só o que FALTA: a conferência é por
     conceito, então "Secos" já cobre a despensa e nada é duplicado. */
  await ensureSetoresDoRomaneio().catch(() => {});
  const setores = await listarSetoresDoCd();

  return (
    <div className="space-y-4">
      <Link href="/configuracoes" className="inline-flex items-center gap-1 text-sm font-semibold text-brand">
        <ArrowLeft className="h-4 w-4" /> Configurações
      </Link>
      <LargeTitle
        title="Setores do CD"
        subtitle="As áreas do Centro de Distribuição que separam os pedidos. Cada produto pertence a um setor, e cada Separador CD enxerga apenas o setor dele."
      />
      <Card>
        <CardContent className="pt-4">
          <CdSectorsAdmin setores={setores} />
        </CardContent>
      </Card>
    </div>
  );
}
