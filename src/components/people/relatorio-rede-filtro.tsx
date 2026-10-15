'use client';

import { useRouter } from 'next/navigation';
import { Select } from '@/components/ui/ds/select';
import { MESES } from '@/lib/controle-gerentes';

/** Mês/ano do relatório da rede — troca na URL, a página refaz a leitura. */
export function RelatorioRedeFiltro({ year, month }: { year: number; month: number }) {
  const router = useRouter();
  const ir = (y: number, m: number) => router.push(`/modulos/escala-gerentes/relatorio-rede?ano=${y}&mes=${m}`);
  const anos = [year - 1, year, year + 1];
  return (
    <div className="grid grid-cols-2 gap-2 sm:max-w-sm">
      <Select label="Mês" size="sm" value={String(month)} onValueChange={(v) => ir(year, Number(v))} options={MESES.map((m, i) => ({ value: String(i + 1), label: m }))} />
      <Select label="Ano" size="sm" value={String(year)} onValueChange={(v) => ir(Number(v), month)} options={anos.map((a) => ({ value: String(a), label: String(a) }))} />
    </div>
  );
}
