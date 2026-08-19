'use client';

import { useMemo, useState } from 'react';
import { ScrollText } from 'lucide-react';
import { List, ListRow } from '@/components/ui/ds/list-row';
import { SearchField } from '@/components/ui/ds/field';
import { Select } from '@/components/ui/ds/select';
import { EmptyState } from '@/components/ui/ds/empty-state';
import { StatusBadge } from '@/components/ui/ds/status-badge';
import { moduleLabel, describeAction, VERB_GROUPS, type VerbGroup } from '@/lib/audit-labels';
import { shortUnitName } from '@/lib/unit-name';

export interface AuditRow {
  id: string;
  action: string;
  module: string | null;
  userName: string | null;
  unitName: string | null;
  createdAt: string;
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Log de Auditoria (Onda 5). Antes: 22 chips com o nome do módulo em inglês e
 * o código cru da ação ("PAYMENT_APPROVE"). Agora: uma busca e dois filtros em
 * PT-BR — quem audita procura por pessoa ou por assunto, não por enum.
 */
export function AuditClient({ rows }: { rows: AuditRow[] }) {
  const [q, setQ] = useState('');
  const [mod, setMod] = useState<string>('TODOS');
  const [grupo, setGrupo] = useState<string>('TODOS');

  const enriched = useMemo(
    () => rows.map((r) => ({ ...r, info: describeAction(r.action), modLabel: moduleLabel(r.module) })),
    [rows],
  );

  const modules = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of enriched) if (r.module) seen.set(r.module, r.modLabel);
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'));
  }, [enriched]);

  const filtered = useMemo(() => {
    const term = norm(q.trim());
    return enriched.filter((r) => {
      if (mod !== 'TODOS' && r.module !== mod) return false;
      if (grupo !== 'TODOS' && r.info.group !== grupo) return false;
      if (!term) return true;
      return [r.info.label, r.modLabel, r.userName, r.unitName, r.action]
        .filter(Boolean)
        .some((v) => norm(String(v)).includes(term));
    });
  }, [enriched, q, mod, grupo]);

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <SearchField value={q} onValueChange={setQ} placeholder="Buscar por pessoa, ação ou unidade…" label="Busca" />
        <Select
          label="Módulo"
          value={mod}
          onValueChange={setMod}
          options={[{ value: 'TODOS', label: 'Todos os módulos' }, ...modules.map(([v, l]) => ({ value: v, label: l }))]}
        />
        <Select
          label="Tipo de ação"
          value={grupo}
          onValueChange={setGrupo}
          options={[
            { value: 'TODOS', label: 'Todos os tipos' },
            ...(Object.entries(VERB_GROUPS) as [VerbGroup, string][]).map(([v, l]) => ({ value: v, label: l })),
          ]}
        />
      </div>

      <p className="text-xs tabular-nums text-ink-500">
        {filtered.length} de {rows.length} registro(s).
      </p>

      {filtered.length === 0 ? (
        <EmptyState icon={ScrollText} title="Nenhum registro com esses filtros" description="Limpe a busca ou escolha outro módulo." />
      ) : (
        <List>
          {filtered.map((r) => (
            <ListRow
              key={r.id}
              title={r.info.label}
              subtitle={[r.userName ?? 'sistema', r.unitName ? shortUnitName(r.unitName) : null].filter(Boolean).join(' · ')}
              trailing={
                <>
                  <StatusBadge tone="neutral">{r.modLabel}</StatusBadge>
                  <span className="hidden text-xs tabular-nums text-ink-500 sm:inline">
                    {new Date(r.createdAt).toLocaleString('pt-BR')}
                  </span>
                </>
              }
            />
          ))}
        </List>
      )}
    </div>
  );
}
