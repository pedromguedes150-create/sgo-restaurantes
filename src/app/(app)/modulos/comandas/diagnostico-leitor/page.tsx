import { notFound } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { LargeTitle } from '@/components/layout/page-chrome';
import { BarcodeDiagnostics } from '@/components/commands/barcode-diagnostics';

export const dynamic = 'force-dynamic';

/**
 * Diagnóstico do leitor de código de barras da comanda.
 *
 * Ferramenta de calibração, não tela de operação: só Admin/Supervisão entram.
 * Serve para descobrir, NO APARELHO REAL, o que a etiqueta da comanda traz
 * codificado e quantos códigos o celular lê por quadro — as duas coisas que
 * decidem se a conferência por câmera funciona, e que não dá para adivinhar
 * de fora do aparelho.
 */
export default async function DiagnosticoLeitorPage() {
  const user = (await getSessionUser())!;
  const podeVer = user.role === 'ADMIN' || user.role === 'SUPERVISOR' || user.role === 'COORDINATOR';
  if (!podeVer) notFound();

  return (
    <div className="space-y-5">
      <LargeTitle title="Diagnóstico do leitor" subtitle="Descobre o que a etiqueta da comanda traz codificado e como o celular lê." />

      <div className="rounded-card border border-line bg-surface p-4">
        <p className="sgo-type-11 font-semibold text-ink-900">Como usar</p>
        <ol className="mt-2 space-y-1 text-sm text-ink-900">
          <li>1. Abra esta tela <strong>no celular</strong> que os gerentes usam.</li>
          <li>2. Toque em <strong>Abrir câmera</strong> e bipe uma comanda.</li>
          <li>3. Para testar a leitura múltipla, espalhe várias comandas na mesa e enquadre mais de uma.</li>
          <li>4. Toque em <strong>Copiar diagnóstico</strong> e cole o texto na conversa.</li>
        </ol>
        <p className="mt-2 text-xs text-ink-500">
          Nada é enviado ao servidor: a leitura fica na tela do aparelho. Repita num Android e num iPhone —
          os dois usam motores diferentes e o resultado muda.
        </p>
      </div>

      <BarcodeDiagnostics />
    </div>
  );
}
