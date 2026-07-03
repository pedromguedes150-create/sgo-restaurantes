'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';

/**
 * Seletor de unidade ÚNICO e compacto (dropdown) para telas que mostram uma
 * unidade por vez. Navega via query param (padrão `unit`), preservando os demais.
 * Substitui as listas largas de "pills" que ocupavam muito espaço.
 */
export function UnitSelectNav({
  units, selected, paramName = 'unit', className,
}: {
  units: { id: string; name: string }[];
  selected: string;
  paramName?: string;
  className?: string;
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
    <select
      value={selected}
      onChange={(e) => onChange(e.target.value)}
      className={className ?? 'h-10 w-full max-w-sm rounded-lg border-2 border-input bg-background px-3 text-sm font-medium'}
    >
      {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
    </select>
  );
}
