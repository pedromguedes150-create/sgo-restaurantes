'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Botão de exclusão de LANÇAMENTO da Operação (somente Admin).
 * Reutilizado por todos os módulos: chama /api/admin/ops {entity, action:'delete', id}.
 * Renderize apenas quando o usuário for ADMIN.
 */
export function DeleteOpButton({
  entity,
  id,
  label,
  confirmText,
  size = 'sm',
  redirectTo,
}: {
  entity: string;
  id: string;
  label: string; // descrição curta do que será excluído (aparece no confirm)
  confirmText?: string;
  size?: 'sm' | 'icon';
  redirectTo?: string; // se definido, navega para cá após excluir (ex.: páginas de detalhe)
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function remove() {
    const msg = confirmText ?? `Excluir ${label}? Esta ação é registrada na Auditoria e reverte os efeitos vinculados (a tarefa do dia pode voltar a "pendente"). Não pode ser desfeita.`;
    if (!confirm(msg)) return;
    setBusy(true);
    try {
      const res = await fetch('/api/admin/ops', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entity, action: 'delete', id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { alert(data.error ?? 'Falha ao excluir'); return; }
      if (redirectTo) { router.push(redirectTo); router.refresh(); }
      else router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (size === 'icon') {
    return (
      <button onClick={remove} disabled={busy} aria-label={`Excluir ${label}`} className="text-danger disabled:opacity-50">
        <Trash2 className="h-4 w-4" />
      </button>
    );
  }
  return (
    <Button size="sm" variant="ghost" onClick={remove} disabled={busy} aria-label={`Excluir ${label}`} className="text-danger">
      <Trash2 className="h-4 w-4" /> Excluir
    </Button>
  );
}
