'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { postAdmin, ROLE_OPTIONS } from '@/lib/admin-client';

type Perm = { canView: boolean; canEdit: boolean };
type Matrix = Record<string, Record<string, Perm>>;

const EDITABLE_ROLES = ['SUPERVISOR', 'COORDINATOR', 'MANAGER', 'FINANCE'];

export function PermissionsAdmin({ modules, matrix }: { modules: { key: string; label: string }[]; matrix: Matrix }) {
  const router = useRouter();
  const [state, setState] = useState<Matrix>(matrix);
  const [busy, setBusy] = useState(false);
  const [role, setRole] = useState('MANAGER');
  const roleLabel = (r: string) => ROLE_OPTIONS.find((o) => o.value === r)?.label ?? r;

  async function set(moduleKey: string, patch: Partial<Perm>) {
    const cur = state[role]?.[moduleKey] ?? { canView: true, canEdit: true };
    const next = { ...cur, ...patch };
    if (!next.canView) next.canEdit = false; // sem ver, não edita
    setState((s) => ({ ...s, [role]: { ...s[role], [moduleKey]: next } }));
    setBusy(true);
    const r = await postAdmin({ entity: 'permission', action: 'set', role, module: moduleKey, canView: next.canView, canEdit: next.canEdit });
    setBusy(false);
    if (!r.ok) { alert(r.error ?? 'Falha'); router.refresh(); return; }
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs font-medium text-muted-foreground">Perfil</label>
        <select className="ml-2 h-10 rounded-lg border-2 border-input bg-background px-3 text-sm" value={role} onChange={(e) => setRole(e.target.value)}>
          {EDITABLE_ROLES.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}
        </select>
        <p className="mt-1 text-xs text-muted-foreground">CEO e Administrador têm acesso total e não podem ser restringidos. Sem marcar “Ver”, o módulo some do menu do perfil.</p>
      </div>

      <div className="overflow-hidden rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-secondary text-xs uppercase tracking-wide text-muted-foreground">
            <tr><th className="px-3 py-2 text-left">Módulo</th><th className="px-3 py-2 w-20 text-center">Ver</th><th className="px-3 py-2 w-20 text-center">Editar</th></tr>
          </thead>
          <tbody>
            {modules.map((m) => {
              const p = state[role]?.[m.key] ?? { canView: true, canEdit: true };
              return (
                <tr key={m.key} className="border-t">
                  <td className="px-3 py-2 font-medium text-brand">{m.label}</td>
                  <td className="px-3 py-2 text-center"><input type="checkbox" className="h-4 w-4" disabled={busy} checked={p.canView} onChange={(e) => set(m.key, { canView: e.target.checked })} /></td>
                  <td className="px-3 py-2 text-center"><input type="checkbox" className="h-4 w-4" disabled={busy || !p.canView} checked={p.canEdit} onChange={(e) => set(m.key, { canEdit: e.target.checked })} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
