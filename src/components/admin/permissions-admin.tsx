'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Select } from '@/components/ui/ds/select';
import { postAdmin, ROLE_OPTIONS } from '@/lib/admin-client';

type Perm = { canView: boolean; canEdit: boolean };
type Matrix = Record<string, Record<string, Perm>>;

const EDITABLE_ROLES = ['SUPERVISOR', 'COORDINATOR', 'MANAGER', 'FINANCE'];

export function PermissionsAdmin({ modules, matrix }: { modules: { key: string; label: string; parent?: string }[]; matrix: Matrix }) {
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
      <div className="max-w-xs">
        <Select
          label="Perfil" value={role} onValueChange={setRole}
          hint="CEO e Administrador têm acesso total e não podem ser restringidos. Sem marcar “Ver”, o módulo some do menu do perfil. As linhas recuadas são partes de dentro de um módulo (abas): dá para fechar uma sem fechar o módulo inteiro."
          options={EDITABLE_ROLES.map((r) => ({ value: r, label: roleLabel(r) }))}
        />
      </div>

      <div className="overflow-hidden rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-sunken sgo-type-11 font-semibold text-ink-500">
            <tr><th className="px-3 py-2 text-left">Módulo</th><th className="px-3 py-2 w-20 text-center">Ver</th><th className="px-3 py-2 w-20 text-center">Editar</th></tr>
          </thead>
          <tbody>
            {modules.map((m) => {
              const p = state[role]?.[m.key] ?? { canView: true, canEdit: true };
              /* O pai é o teto: fechando o módulo, as abas dele caem juntas —
                 é assim que o servidor calcula, e a tela precisa dizer o mesmo. */
              const paiAberto = !m.parent || (state[role]?.[m.parent]?.canView ?? true);
              const ver = p.canView && paiAberto;
              const editar = p.canEdit && ver;
              return (
                <tr key={m.key} className="border-t">
                  <td className={m.parent ? 'py-1.5 pl-9 pr-3 text-ink-500' : 'px-3 py-2 font-medium text-ink-900'}>
                    {m.parent && <span className="mr-1 text-ink-400">↳</span>}{m.label}
                  </td>
                  <td className="px-3 py-2 text-center"><input type="checkbox" className="h-4 w-4" disabled={busy || !paiAberto} checked={ver} onChange={(e) => set(m.key, { canView: e.target.checked })} /></td>
                  <td className="px-3 py-2 text-center"><input type="checkbox" className="h-4 w-4" disabled={busy || !ver} checked={editar} onChange={(e) => set(m.key, { canEdit: e.target.checked })} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
