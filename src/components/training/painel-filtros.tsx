'use client';

import { useRouter } from 'next/navigation';
import { Select } from '@/components/ui/ds/select';
import { Input } from '@/components/ui/ds/field';
import { Button } from '@/components/ui/ds/button';
import type { OpcoesDeFiltro } from '@/lib/treinamentos/painel';
import type { FiltrosPainel } from '@/lib/treinamentos/agregacao';

/**
 * Filtros do painel de treinamentos. Vivem na URL: o link que o supervisor
 * manda já abre filtrado, e o PDF gera exatamente o que está na tela.
 */
const TODAS = '*';

export function PainelFiltros({ filtros, opcoes, visao }: { filtros: FiltrosPainel; opcoes: OpcoesDeFiltro; visao: string }) {
  const router = useRouter();

  function ir(patch: Partial<Record<'unit' | 'funcao' | 'colab' | 'pop' | 'status' | 'start' | 'end', string | undefined>>) {
    const atual: Record<string, string | undefined> = {
      unit: filtros.unitId, funcao: filtros.jobTitle, colab: filtros.collaboratorId, pop: filtros.popId,
      status: filtros.status && filtros.status !== 'todos' ? filtros.status : undefined,
      start: filtros.de, end: filtros.ate,
    };
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...atual, ...patch })) if (v && v !== TODAS) p.set(k, v);
    p.set('visao', visao);
    router.push(`/modulos/treinamentos/acompanhamento?${p.toString()}`);
  }

  const temFiltro = Boolean(filtros.unitId || filtros.jobTitle || filtros.collaboratorId || filtros.popId || (filtros.status && filtros.status !== 'todos') || filtros.de || filtros.ate);

  return (
    <div className="space-y-2 rounded-card border border-line bg-surface p-3 print:hidden">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <Select
          label="Unidade" size="sm" value={filtros.unitId ?? TODAS} onValueChange={(v) => ir({ unit: v })}
          options={[{ value: TODAS, label: 'Todas as unidades' }, ...opcoes.unidades.map((u) => ({ value: u.id, label: u.name }))]}
        />
        <Select
          label="Função" size="sm" value={filtros.jobTitle ?? TODAS} onValueChange={(v) => ir({ funcao: v })}
          options={[{ value: TODAS, label: 'Todas as funções' }, ...opcoes.funcoes.map((f) => ({ value: f, label: f }))]}
        />
        <Select
          label="Colaborador" size="sm" value={filtros.collaboratorId ?? TODAS} onValueChange={(v) => ir({ colab: v })}
          options={[{ value: TODAS, label: 'Todos' }, ...opcoes.colaboradores.map((c) => ({ value: c.id, label: c.name, hint: c.unitName }))]}
        />
        <Select
          label="Treinamento / POP" size="sm" value={filtros.popId ?? TODAS} onValueChange={(v) => ir({ pop: v })}
          options={[{ value: TODAS, label: 'Todos' }, ...opcoes.treinamentos.map((t) => ({ value: t.id, label: t.title }))]}
        />
        <Select
          label="Status" size="sm" value={filtros.status ?? 'todos'} onValueChange={(v) => ir({ status: v === 'todos' ? undefined : v })}
          options={[
            { value: 'todos', label: 'Todos' },
            { value: 'concluido', label: 'Concluído' },
            { value: 'pendente', label: 'Pendente' },
            { value: 'atrasado', label: 'Atrasado' },
          ]}
        />
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <Input label="Prazo de" type="date" value={filtros.de ?? ''} onChange={(e) => ir({ start: e.target.value || undefined })} className="w-40" />
        <Input label="até" type="date" value={filtros.ate ?? ''} onChange={(e) => ir({ end: e.target.value || undefined })} className="w-40" />
        <p className="pb-2 text-xs text-ink-500">
          {filtros.de || filtros.ate ? 'Ciclos com prazo no período.' : 'Sem período: ciclo vigente (mês atual para os mensais; versão atual para os únicos).'}
        </p>
        {temFiltro && (
          <Button size="sm" variant="ghost" onClick={() => router.push(`/modulos/treinamentos/acompanhamento?visao=${visao}`)}>Limpar filtros</Button>
        )}
      </div>
    </div>
  );
}
