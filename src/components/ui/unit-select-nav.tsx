'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Select } from '@/components/ui/ds/select';

/**
 * Seletor ÚNICO e compacto (dropdown) para telas que mostram uma unidade — ou
 * um mês — por vez. Navega via query param (padrão `unit`), preservando os demais.
 *
 * Onda 5: era um <select> NATIVO, o último do sistema (regra 6). Passou a usar
 * o Select do design system, o que corrige de uma vez todas as telas que o
 * consomem (Comandas, Metas, Desperdícios, Troco, Inventário…).
 */
export function UnitSelectNav({
  units, selected, paramName = 'unit', className, label,
}: {
  units: { id: string; name: string }[];
  selected: string;
  paramName?: string;
  className?: string;
  /** Nome acessível do controle; o rótulo fica invisível por ser compacto. */
  label?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  function onChange(id: string) {
    const p = new URLSearchParams(sp?.toString() ?? '');
    p.set(paramName, id);
    router.push(`${pathname}?${p.toString()}`);
  }

  return (
    <div className={className ?? 'w-full max-w-sm'}>
      <Select
        aria-label={label ?? (paramName === 'month' ? 'Mês de referência' : 'Unidade')}
        options={units.map((u) => ({ value: u.id, label: u.name }))}
        value={selected}
        onValueChange={onChange}
      />
    </div>
  );
}
