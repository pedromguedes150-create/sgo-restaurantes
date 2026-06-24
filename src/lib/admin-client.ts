'use client';

/** Helper client para os cadastros administrativos (POST /api/admin). */
export async function postAdmin(payload: Record<string, unknown>): Promise<{ ok: boolean; error?: string; id?: string; reason?: string }> {
  try {
    const res = await fetch('/api/admin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await res.json().catch(() => ({}));
    return res.ok ? { ok: true, id: data.id } : { ok: false, error: data.error ?? 'Falha', reason: data.reason };
  } catch {
    return { ok: false, error: 'Falha de conexão' };
  }
}

export const ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: 'CEO', label: 'CEO / Diretoria' },
  { value: 'ADMIN', label: 'Administrador' },
  { value: 'SUPERVISOR', label: 'Supervisor' },
  { value: 'COORDINATOR', label: 'Coordenador' },
  { value: 'MANAGER', label: 'Gerente' },
  { value: 'FINANCE', label: 'Financeiro' },
];
