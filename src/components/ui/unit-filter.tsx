'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { MultiSelect } from '@/components/ui/multi-select';

/**
 * Filtro de unidade padronizado (compacto). Usa MultiSelect + "Selecionar todas".
 * Navega via query param (padrão `unit`, separado por vírgula). Vazio/todas = sem
 * filtro (todas as unidades acessíveis). Preserva os demais parâmetros da URL.
 */
export function UnitFilter({
  units, selected, paramName = 'unit', searchable = true, className,
}: {
  units: { id: string; name: string }[];
  selected: string[]; // ids atualmente filtrados (vazio = todas)
  paramName?: string;
  searchable?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  function onChange(next: string[]) {
    const p = new URLSearchParams(sp?.toString() ?? '');
    if (next.length === 0 || next.length === units.length) p.delete(paramName); // todas = sem filtro
    else p.set(paramName, next.join(','));
    const qs = p.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <div className={className ?? 'w-full max-w-sm'}>
      <MultiSelect
        options={units.map((u) => ({ value: u.id, label: u.name }))}
        selected={selected}
        onChange={onChange}
        searchable={searchable && units.length > 6}
        placeholder="Todas as unidades"
        allLabel="todas as unidades"
      />
    </div>
  );
}
