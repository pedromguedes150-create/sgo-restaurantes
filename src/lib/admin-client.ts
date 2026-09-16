'use client';

import type { Role } from '@prisma/client';
import { ROLE_HINTS, ROLE_LABELS } from '@/lib/roles';

/** Helper client para os cadastros administrativos (POST /api/admin). */
export async function postAdmin(payload: Record<string, unknown>): Promise<{ ok: boolean; error?: string; id?: string; reason?: string; created?: number }> {
  try {
    const res = await fetch('/api/admin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await res.json().catch(() => ({}));
    return res.ok ? { ok: true, id: data.id, created: data.created } : { ok: false, error: data.error ?? 'Falha', reason: data.reason };
  } catch {
    return { ok: false, error: 'Falha de conexão' };
  }
}

/** Helper client para a Gestão de Perfis (POST /api/perfis). */
export async function postPerfis(payload: Record<string, unknown>): Promise<{ ok: boolean; error?: string; id?: string }> {
  try {
    const res = await fetch('/api/perfis', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await res.json().catch(() => ({}));
    return res.ok ? { ok: true, id: data.id } : { ok: false, error: data.error ?? 'Falha' };
  } catch {
    return { ok: false, error: 'Falha de conexão' };
  }
}

/**
 * Perfis para os seletores das telas de cadastro.
 *
 * DERIVADO de `ROLE_LABELS` — era uma segunda lista escrita à mão, e duas
 * listas de perfis divergem no primeiro perfil novo. A ordem é a do enum, a
 * mesma da tela de Perfis. `roles.ts` é módulo puro (só `import type`), então
 * importá-lo daqui não puxa servidor para o pacote do cliente.
 */
export const ROLE_OPTIONS: { value: string; label: string; hint?: string }[] = (
  Object.keys(ROLE_LABELS) as Role[]
).map((value) => ({ value, label: ROLE_LABELS[value], hint: ROLE_HINTS[value] }));
