import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

/**
 * Cabeçalho das telas do link interno da pizzaria (sem login). Bordô, nome da
 * unidade e, fora da home, o caminho de volta — o funcionário não navega por
 * menu nenhum aqui, então a volta precisa estar sempre à vista.
 */
export function CabecalhoPublico({ titulo, unidade, voltarPara }: { titulo: string; unidade: string; voltarPara?: string }) {
  return (
    <div className="mb-4 rounded-card bg-brand p-5 text-center text-on-brand">
      {voltarPara && (
        <Link href={voltarPara} className="mb-1 inline-flex items-center gap-1 text-xs font-semibold opacity-90 hover:opacity-100">
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Início
        </Link>
      )}
      <p className="sgo-type-11 font-semibold opacity-90">Beija Flor</p>
      <h1 className="text-xl font-bold">{titulo}</h1>
      <p className="mt-1 text-sm opacity-90">{unidade}</p>
    </div>
  );
}

export function LinkInvalido() {
  return (
    <div className="mx-auto max-w-md p-6 text-center">
      <p className="text-lg font-bold text-ink-900">Link inválido</p>
      <p className="text-sm text-ink-500">Confira o endereço com o gerente da unidade.</p>
    </div>
  );
}
