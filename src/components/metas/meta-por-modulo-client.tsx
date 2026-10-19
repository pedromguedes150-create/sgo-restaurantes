'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/ds/status-badge';
import { postAdmin } from '@/lib/admin-client';
import type { GrupoPorModulo, LinhaPorModulo } from '@/lib/metas/por-modulo';

/**
 * Meta POR MÓDULO (v1.170.0): todos os módulos do sistema, um por linha, com o
 * indicador que a meta mede e o campo de peso/desconto onde há indicador.
 * Grava pelas entidades `*Meta` do `/api/admin`. Desde a v1.174.0 é a ÚNICA
 * tela de pesos (a aba Componentes saiu) e os checklists têm um peso só.
 */
export function MetaPorModuloClient({ grupos, canEdit }: { grupos: GrupoPorModulo[]; canEdit: boolean }) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    for (const g of grupos) for (const l of g.linhas) if (l.indicador?.entity) out[l.indicador.entity] = String(l.valor ?? 0).replace('.', ',');
    return out;
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar(l: LinhaPorModulo) {
    const ind = l.indicador;
    if (!ind?.entity) return;
    setBusy(ind.entity); setErro(null);
    const v = Number((values[ind.entity] ?? '0').replace(',', '.'));
    const payload = ind.tipo === 'DESCONTO'
      ? { entity: ind.entity, action: 'setPenalty', pct: v }
      : { entity: ind.entity, action: 'setWeight', weight: v };
    const r = await postAdmin(payload);
    setBusy(null);
    if (r.ok) router.refresh(); else setErro(r.error ?? 'Falha ao gravar.');
  }

  return (
    <div className="space-y-4">
      {erro && <p className="text-sm font-medium text-danger">{erro}</p>}
      {grupos.map((g) => (
        <section key={g.area} className="sgo-panel sgo-panel--solid overflow-hidden">
          <p className="sgo-panel__title px-3 pt-3">{g.area}</p>
          <div className="overflow-x-auto">
            <table className="sgo-tbl w-full text-sm">
              <thead>
                <tr>
                  <th className="text-left">Módulo</th>
                  <th className="text-left">Indicador da meta</th>
                  <th className="text-left">Como entra na nota</th>
                  <th className="text-right">Peso / desconto</th>
                </tr>
              </thead>
              <tbody>
                {g.linhas.map((l) => {
                  const ind = l.indicador;
                  const ligado = ind && (l.valor ?? 0) > 0;
                  return (
                    <tr key={l.key} data-testid={`meta-modulo-${l.key}`}>
                      <td className="whitespace-nowrap font-medium text-ink-900">
                        {l.label}
                        <span className="block">
                          {ind
                            ? <StatusBadge tone={ligado ? 'success' : 'neutral'} dot>{ligado ? 'Conta na meta' : 'Desligado (0)'}</StatusBadge>
                            : <StatusBadge tone="neutral">Sem indicador</StatusBadge>}
                        </span>
                      </td>
                      <td className="min-w-56 max-w-xs whitespace-normal text-ink-900">
                        {ind ? ind.indicador : <span className="text-ink-500">Ainda sem indicador de meta — o SGO não mede este módulo para a bonificação.</span>}
                      </td>
                      <td className="min-w-64 max-w-md whitespace-normal text-xs text-ink-700">
                        {ind?.como ?? '—'}
                        {l.compartilhadoCom.length > 0 && (
                          <span className="block text-ink-500">Mesmo ajuste de: {l.compartilhadoCom.join(', ')}.</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap text-right">
                        {ind?.entity ? (
                          <span className="inline-flex items-center justify-end gap-1.5">
                            <Input
                              inputMode="decimal"
                              aria-label={`${ind.tipo === 'DESCONTO' ? 'Desconto' : 'Peso'} de ${l.label}`}
                              value={values[ind.entity] ?? ''}
                              onChange={(e) => setValues((s) => ({ ...s, [ind.entity]: e.target.value }))}
                              disabled={!canEdit}
                              className="h-9 w-20 text-right text-sm tabular-nums"
                            />
                            <span className="w-16 text-left text-xs text-ink-500">{ind.tipo === 'DESCONTO' ? '% cada' : 'peso'}</span>
                            {canEdit && (
                              <Button size="sm" variant="outline" disabled={busy === ind.entity} onClick={() => void salvar(l)} aria-label={`Salvar ${l.label}`}>
                                <Save className="h-4 w-4" />
                              </Button>
                            )}
                          </span>
                        ) : (
                          <span className="text-ink-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ))}
      {!canEdit && <p className="text-xs text-ink-500">Visualização — a edição dos pesos é do Administrador.</p>}
    </div>
  );
}
