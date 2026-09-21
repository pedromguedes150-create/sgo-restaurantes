'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Select } from '@/components/ui/ds/select';
import { MESES, montarCompetencia, partesDaCompetencia, type Competencia } from '@/lib/ticket-media/calculo';

/**
 * Mês + ano na URL.
 *
 * A competência vive no endereço, e não no estado do componente, porque a tela
 * inteira é servidor: assim o link que o coordenador manda no WhatsApp abre no
 * mesmo mês que ele estava vendo.
 */
export function SeletorDeCompetencia({
  competencia,
  anos,
  className,
}: {
  competencia: Competencia;
  /** Anos oferecidos — vêm de quem já tem dado, mais o ano corrente. */
  anos: number[];
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { ano, mes } = partesDaCompetencia(competencia);

  function ir(nova: Competencia) {
    const p = new URLSearchParams(params.toString());
    p.set('competencia', nova);
    router.push(`${pathname}?${p.toString()}`, { scroll: false });
  }

  return (
    <div className={`flex flex-wrap items-end gap-2 ${className ?? ''}`}>
      <Select
        label="Competência"
        className="w-40"
        value={String(mes)}
        onValueChange={(v) => ir(montarCompetencia(ano, Number(v)))}
        options={MESES.map((m, i) => ({ value: String(i + 1), label: m }))}
      />
      <Select
        aria-label="Ano da competência"
        className="w-28"
        value={String(ano)}
        onValueChange={(v) => ir(montarCompetencia(Number(v), mes))}
        options={anos.map((a) => ({ value: String(a), label: String(a) }))}
      />
    </div>
  );
}
