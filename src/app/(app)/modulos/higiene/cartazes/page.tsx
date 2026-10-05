import Link from 'next/link';
import { headers } from 'next/headers';
import QRCode from 'qrcode';
import { ArrowLeft } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { canAccessUnit, unitScopeWhere } from '@/lib/scope/unit-scope';
import { PrintButton } from '@/components/ui/print-button';
import { shortUnitName } from '@/lib/unit-name';

export const dynamic = 'force-dynamic';

/** Endereço público do SGO a partir do próprio acesso (o mesmo domínio que o cliente vai abrir). */
function origem(): string {
  const h = headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3100';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https');
  return `${proto}://${host}`;
}

/**
 * CARTAZES DO QR DO BANHEIRO (v1.156.0) — um por banheiro (o QR já leva o
 * banheiro escolhido: o cliente só toca o motivo) e um geral da unidade.
 * Cada QR é vinculado à SUA unidade pelo endereço; nada de serviço externo:
 * o QR é desenhado aqui, em SVG. Imprimir = Ctrl+P (uma folha por cartaz).
 */
export default async function CartazesHigienePage({ searchParams }: { searchParams: { unit?: string } }) {
  const user = (await getSessionUser())!;
  const units = await prisma.unit.findMany({ where: { active: true, ...unitScopeWhere(user, 'id') }, orderBy: { name: 'asc' }, select: { id: true, name: true } });
  const unit = units.find((u) => u.id === searchParams.unit) ?? units[0];
  if (!unit || !canAccessUnit(user, unit.id)) return <p className="text-sm text-ink-500">Nenhuma unidade vinculada.</p>;
  const locais = await prisma.hygieneLocation.findMany({ where: { unitId: unit.id, active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true } });
  const base = `${origem()}/higiene/${unit.id}`;
  const cartazes = [
    ...locais.map((l) => ({ chave: l.id, banheiro: l.name, url: `${base}?loc=${l.id}` })),
    { chave: 'geral', banheiro: null as string | null, url: base },
  ];
  const svgs = await Promise.all(cartazes.map((c) => QRCode.toString(c.url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } }))); // ds-allow-hex: QR precisa de preto/branco puros para qualquer câmera ler (tema não se aplica ao papel)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Link href={`/modulos/higiene?unit=${unit.id}`} className="inline-flex items-center gap-1 text-sm font-semibold text-brand"><ArrowLeft className="h-4 w-4" /> Higiene dos banheiros</Link>
        <span className="ml-auto text-sm text-ink-700">{cartazes.length} cartaz(es) · {shortUnitName(unit.name)}</span>
        <PrintButton label="Imprimir cartazes" />
      </div>
      <p className="text-xs text-ink-500 print:hidden">Um cartaz por banheiro (o cliente já cai no banheiro certo) e um geral da unidade (o cliente escolhe o banheiro). Imprima em A4 e cole perto da pia ou da porta.</p>

      <div className="sgo-print space-y-6" data-testid="cartazes-higiene">
        {cartazes.map((c, i) => (
          <section key={c.chave} className="mx-auto max-w-xl overflow-hidden rounded-2xl border-2 border-ink-700 bg-surface print:break-after-page print:rounded-none" style={{ breakInside: 'avoid' }}>
            <div className="bg-ink-700 px-6 py-6 text-center text-on-brand">
              <p className="text-3xl font-extrabold leading-tight">ESTE LOCAL ESTÁ PRECISANDO DE HIGIENIZAÇÃO?</p>
            </div>
            <div className="space-y-4 px-6 py-5 text-center">
              <p className="text-base text-ink-700">Se perceber que este banheiro precisa de <b>limpeza</b> ou está faltando <b>papel</b> ou <b>sabonete</b>, avise a equipe Beija Flor:</p>
              <div className="mx-auto w-64 max-w-full" aria-label={`QR Code ${c.banheiro ?? 'da unidade'}`} dangerouslySetInnerHTML={{ __html: svgs[i] }} />
              <ol className="mx-auto max-w-xs space-y-0.5 text-left text-sm text-ink-700">
                <li>1. Aponte a câmera do celular para o QR Code;</li>
                <li>2. Toque no que está acontecendo;</li>
                <li>3. Pronto — a equipe é avisada na hora.</li>
              </ol>
              <p className="text-lg font-bold text-brand">{c.banheiro ? `Banheiro ${c.banheiro}` : 'Banheiros'} · {shortUnitName(unit.name)}</p>
              <p className="break-all text-xs text-ink-500">{c.url}</p>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
