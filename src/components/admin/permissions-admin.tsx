'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { Select } from '@/components/ui/ds/select';
import { postAdmin, ROLE_OPTIONS } from '@/lib/admin-client';

type Perm = { canView: boolean; canEdit: boolean };
type Matrix = Record<string, Record<string, Perm>>;
type Mod = { key: string; label: string; parent?: string; soVer?: boolean };

const EDITABLE_ROLES = ['SUPERVISOR', 'COORDINATOR', 'MANAGER', 'FINANCE'];

export function PermissionsAdmin({ modules, matrix }: { modules: Mod[]; matrix: Matrix }) {
  const router = useRouter();
  const [state, setState] = useState<Matrix>(matrix);
  const [busy, setBusy] = useState(false);
  const [role, setRole] = useState('MANAGER');
  const [abertos, setAbertos] = useState<Record<string, boolean>>({});
  const roleLabel = (r: string) => ROLE_OPTIONS.find((o) => o.value === r)?.label ?? r;

  /* Quem é filho de quem, e a que profundidade — a lista já vem com o filho
     depois do pai, então uma passada basta. */
  const { filhos, profundidade } = useMemo(() => {
    const filhos: Record<string, Mod[]> = {};
    const profundidade: Record<string, number> = {};
    for (const m of modules) {
      profundidade[m.key] = m.parent ? (profundidade[m.parent] ?? 0) + 1 : 0;
      if (m.parent) (filhos[m.parent] ??= []).push(m);
    }
    return { filhos, profundidade };
  }, [modules]);

  const perm = (key: string): Perm => state[role]?.[key] ?? { canView: true, canEdit: true };

  /** Alguma parte de dentro está diferente do módulo? É o que não pode passar despercebido. */
  function partesFechadas(key: string): number {
    let n = 0;
    for (const f of filhos[key] ?? []) {
      if (!perm(f.key).canView) n++;
      n += partesFechadas(f.key);
    }
    return n;
  }
  function totalPartes(key: string): number {
    let n = 0;
    for (const f of filhos[key] ?? []) n += 1 + totalPartes(f.key);
    return n;
  }

  async function set(moduleKey: string, patch: Partial<Perm>) {
    const cur = perm(moduleKey);
    const next = { ...cur, ...patch };
    if (!next.canView) next.canEdit = false; // sem ver, não edita
    setState((s) => ({ ...s, [role]: { ...s[role], [moduleKey]: next } }));
    setBusy(true);
    const r = await postAdmin({ entity: 'permission', action: 'set', role, module: moduleKey, canView: next.canView, canEdit: next.canEdit });
    setBusy(false);
    if (!r.ok) { alert(r.error ?? 'Falha'); router.refresh(); return; }
  }

  /** As linhas visíveis: um filho só aparece com todos os pais expandidos. */
  const visiveis = modules.filter((m) => {
    let p = m.parent;
    while (p) {
      if (!abertos[p]) return false;
      p = modules.find((x) => x.key === p)?.parent;
    }
    return true;
  });

  return (
    <div className="space-y-3">
      <div className="max-w-xs">
        <Select
          label="Perfil" value={role} onValueChange={setRole}
          hint="CEO e Administrador têm acesso total e não podem ser restringidos. Sem marcar “Ver”, o módulo some do menu do perfil."
          options={EDITABLE_ROLES.map((r) => ({ value: r, label: roleLabel(r) }))}
        />
      </div>

      <p className="rounded-md bg-info-bg p-2 text-xs text-info">
        Módulo com <strong>partes</strong> tem uma seta: toque para abrir e liberar/fechar cada tela e cada aba de dentro
        (ex.: em Minha área dá para fechar só “Folgas / férias”). Fechar o módulo fecha as partes dele junto.
      </p>

      <div className="overflow-hidden rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-sunken sgo-type-11 font-semibold text-ink-500">
            <tr><th className="px-3 py-2 text-left">Módulo</th><th className="px-3 py-2 w-20 text-center">Ver</th><th className="px-3 py-2 w-20 text-center">Editar</th></tr>
          </thead>
          <tbody>
            {visiveis.map((m) => {
              const p = perm(m.key);
              /* O pai é o teto: fechando o módulo, as partes dele caem juntas —
                 é assim que o servidor calcula, e a tela precisa dizer o mesmo. */
              const paiAberto = !m.parent || perm(m.parent).canView;
              const ver = p.canView && paiAberto;
              const editar = p.canEdit && ver;
              const nivel = profundidade[m.key] ?? 0;
              const nPartes = totalPartes(m.key);
              const nFechadas = partesFechadas(m.key);
              const expandido = Boolean(abertos[m.key]);
              return (
                <tr key={m.key} className="border-t">
                  <td className="py-2 pr-3 text-ink-900" style={{ paddingLeft: `${12 + nivel * 22}px` }}>
                    {nPartes > 0 ? (
                      <button
                        type="button"
                        onClick={() => setAbertos((s) => ({ ...s, [m.key]: !s[m.key] }))}
                        className="inline-flex items-center gap-1 text-left font-medium hover:text-brand"
                      >
                        {expandido ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                        {m.label}
                        <span className="ml-1 rounded-full bg-sunken px-1.5 py-0.5 text-[11px] font-semibold text-ink-500">
                          {nPartes} {nPartes === 1 ? 'parte' : 'partes'}
                        </span>
                        {nFechadas > 0 && (
                          <span className="rounded-full bg-warning-bg px-1.5 py-0.5 text-[11px] font-semibold text-warning">
                            {nFechadas} fechada{nFechadas === 1 ? '' : 's'}
                          </span>
                        )}
                      </button>
                    ) : (
                      <span className={nivel > 0 ? 'text-ink-500' : 'font-medium'}>
                        {nivel > 0 && <span className="mr-1 text-ink-400">↳</span>}{m.label}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center"><input type="checkbox" className="h-4 w-4" disabled={busy || !paiAberto} checked={ver} onChange={(e) => set(m.key, { canView: e.target.checked })} /></td>
                  <td className="px-3 py-2 text-center">
                    {m.soVer
                      ? <span title="Parte de consulta: não há o que editar" className="text-ink-400">—</span>
                      : <input type="checkbox" className="h-4 w-4" disabled={busy || !ver} checked={editar} onChange={(e) => set(m.key, { canEdit: e.target.checked })} />}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
