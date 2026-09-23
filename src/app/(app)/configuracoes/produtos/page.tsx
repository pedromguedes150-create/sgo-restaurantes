import Link from 'next/link';
import { getSessionUser } from '@/lib/auth/session';
import { listAllProducts } from '@/lib/products';
import { setoresAtivosDoCd } from '@/lib/products/setores';
import { ensureSetoresDoRomaneio } from '@/lib/products/setores-padrao';
import { pendenciasDeCadastro } from '@/lib/products/pendencias';
import { listarPropostasPendentes } from '@/lib/products/propostas-setor';
import { Card, CardContent } from '@/components/ui/card';
import { ProductCatalogAdmin } from '@/components/products/product-catalog-admin';
import { ArrowLeft } from 'lucide-react';
import { LargeTitle } from '@/components/layout/page-chrome';

export const dynamic = 'force-dynamic';

export default async function ProdutosConfigPage({ searchParams }: { searchParams: { pendentes?: string } }) {
  const user = (await getSessionUser())!;
  /* Coordenação entrou em 23/09/2026: valida e mantém o catálogo (decisão do Pedro). */
  if (!['ADMIN', 'CEO', 'SUPERVISOR', 'COORDINATOR'].includes(user.role)) return <p className="text-sm text-ink-500">Restrito à Supervisão/Coordenação/Administração.</p>;
  /* O mutirão de setores vive nesta tela e só consegue propor para setor que
     EXISTA — daí garantir os do romaneio aqui também, e não só na tela de
     setores, que a pessoa pode nunca abrir. */
  await ensureSetoresDoRomaneio().catch(() => {});
  const [products, setores, pendencias, propostas] = await Promise.all([listAllProducts(), setoresAtivosDoCd(), pendenciasDeCadastro(), listarPropostasPendentes()]);
  return (
    <div className="space-y-4">
      <Link href="/configuracoes" className="inline-flex items-center gap-1 text-sm font-semibold text-brand"><ArrowLeft className="h-4 w-4" /> Configurações</Link>
      <div>
        <LargeTitle title="Catálogo de Produtos" />
        <p className="text-sm text-ink-500">Produtos da <b>Fábrica</b> e do <b>CD</b> que os gerentes podem pedir. Importe sua lista por Excel.</p>
      </div>
      <Card><CardContent className="pt-4">
        <ProductCatalogAdmin
          products={products.map((p) => ({
            id: p.id, name: p.name, origin: p.origin, category: p.category, measure: p.measure, packSize: p.packSize, barcode: p.barcode, active: p.active,
            cdSectorId: p.cdSectorId, cdSectorName: p.cdSector?.name ?? null, validation: p.validation, createdByName: p.createdByName, packType: p.packType,
            codigos: [...new Set([p.barcode, ...p.barcodes.map((b) => b.code)].filter((c): c is string => Boolean(c)))],
            codigosNovos: p.barcodes.filter((b) => !b.reviewedAt).length,
          }))}
          setores={setores}
          pendencias={pendencias}
          propostas={propostas}
          filtroInicial={searchParams.pendentes === '1' ? 'novos' : null}
        />
      </CardContent></Card>
    </div>
  );
}
