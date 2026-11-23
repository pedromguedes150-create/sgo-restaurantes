'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Select } from '@/components/ui/ds/select';
import { Input } from '@/components/ui/input';

/**
 * Filtros do Histórico de conferências (v1.222.0) — uma linha de caixas no
 * lugar das quatro fileiras de pílulas. Tudo na URL: voltar do detalhe mantém
 * o recorte.
 */
export function FiltrosDeConferencias({ unidades, valores }: {
  unidades: { id: string; nome: string }[];
  valores: { unit: string; tipo: string; metodo: string; status: string; de: string; ate: string };
}) {
  const router = useRouter();
  function ir(mudanca: Partial<typeof valores>) {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...valores, ...mudanca })) if (v) q.set(k, v);
    const s = q.toString();
    router.push(`/modulos/comandas/conferencias${s ? `?${s}` : ''}`);
  }
  const algum = Object.values(valores).some(Boolean);
  return (
    <div className="sgo-filtros -mx-4 px-4" data-testid="filtros-conferencias">
      <div className="grid w-full grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {unidades.length > 1 && (
          <Select label="Unidade" value={valores.unit} onValueChange={(v) => ir({ unit: v })} searchable
            options={[{ value: '', label: 'Todas' }, ...unidades.map((u) => ({ value: u.id, label: u.nome }))]} />
        )}
        <Select label="Tipo" value={valores.tipo} onValueChange={(v) => ir({ tipo: v })}
          options={[{ value: '', label: 'Todos' }, { value: 'FAIXA_DO_DIA', label: 'Parcial' }, { value: 'COMPLETA', label: 'Completa' }]} />
        <Select label="Situação" value={valores.status} onValueChange={(v) => ir({ status: v })}
          options={[{ value: '', label: 'Todas' }, { value: 'EM_ANDAMENTO', label: 'Em andamento' }, { value: 'CONCLUIDA', label: 'Concluída' }, { value: 'CANCELADA', label: 'Cancelada' }]} />
        <Select label="Como foi feita" value={valores.metodo} onValueChange={(v) => ir({ metodo: v })}
          options={[{ value: '', label: 'Todas' }, { value: 'MISTO', label: 'Leitor + Manual' }, { value: 'LEITOR', label: 'Só leitor (antigas)' }, { value: 'MANUAL', label: 'Só manual (antigas)' }]} />
        <label className="block text-xs text-ink-500">De
          <Input type="date" value={valores.de} onChange={(e) => ir({ de: e.target.value })} className="mt-1 h-10 text-sm" />
        </label>
        <label className="block text-xs text-ink-500">Até
          <Input type="date" value={valores.ate} onChange={(e) => ir({ ate: e.target.value })} className="mt-1 h-10 text-sm" />
        </label>
      </div>
      {algum && <Link href="/modulos/comandas/conferencias" className="mt-2 inline-block text-xs font-semibold text-brand" data-testid="limpar-filtros">Limpar filtros</Link>}
    </div>
  );
}
