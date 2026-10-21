'use client';

import { useRouter } from 'next/navigation';
import { Select } from '@/components/ui/ds/select';
import { Input } from '@/components/ui/input';
import { ROTULO_STATUS } from '@/lib/utensilios/regras';

/** Filtros do Histórico — tudo na URL (voltar da folha mantém o recorte). */
export function FiltrosHistorico({ de, ate, status, gerente, gerentes, base }: {
  de: string; ate: string; status: string; gerente: string; gerentes: { id: string; name: string }[]; base: string;
}) {
  const router = useRouter();
  function ir(mudanca: Record<string, string>) {
    const url = new URL(base, 'http://x');
    const atual = { de, ate, status, gerente, ...mudanca };
    for (const [k, v] of Object.entries(atual)) { if (v) url.searchParams.set(k, v); else url.searchParams.delete(k); }
    router.push(url.pathname + url.search);
  }
  return (
    <div className="sgo-filtros -mx-4 grid gap-2 px-4 sm:grid-cols-4" data-testid="filtros-historico">
      <label className="block text-xs text-ink-500">De<Input type="date" value={de} onChange={(e) => ir({ de: e.target.value })} className="mt-1 h-10 text-sm" /></label>
      <label className="block text-xs text-ink-500">Até<Input type="date" value={ate} onChange={(e) => ir({ ate: e.target.value })} className="mt-1 h-10 text-sm" /></label>
      <Select label="Situação" value={status} onValueChange={(v) => ir({ status: v })} options={[{ value: '', label: 'Todas' }, ...Object.entries(ROTULO_STATUS).map(([value, label]) => ({ value, label }))]} />
      <Select label="Gerente" value={gerente} onValueChange={(v) => ir({ gerente: v })} searchable options={[{ value: '', label: 'Todos' }, ...gerentes.map((g) => ({ value: g.id, label: g.name }))]} />
    </div>
  );
}
