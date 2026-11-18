'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Pencil, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/ds/button';
import { Banner } from '@/components/ui/ds/banner';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/ds/status-badge';

/** Configurações → Currículos: os cargos oferecidos no encaminhamento. */
export interface CargoUI { id: string; name: string; active: boolean }

async function acao(body: Record<string, unknown>) {
  const r = await fetch('/api/curriculos/cargos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { ok: r.ok, body: await r.json().catch(() => ({})) as { error?: string } };
}

export function CargosAdmin({ cargos, podeEditar }: { cargos: CargoUI[]; podeEditar: boolean }) {
  const router = useRouter();
  const [novo, setNovo] = useState('');
  const [editando, setEditando] = useState<{ id: string; nome: string } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  async function rodar(chave: string, body: Record<string, unknown>) {
    setOcupado(chave); setErro(null);
    const r = await acao(body);
    setOcupado(null);
    if (!r.ok) { setErro(r.body.error ?? 'Falha ao gravar.'); return false; }
    router.refresh(); return true;
  }

  return (
    <div className="space-y-3" data-testid="cargos-de-curriculo">
      {erro && <Banner tone="danger" title={erro} />}
      <section className="sgo-panel sgo-panel--solid overflow-hidden">
        <ul className="divide-y divide-line">
          {cargos.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-2 px-3 py-2 sm:px-4">
              {editando?.id === c.id ? (
                <>
                  <Input value={editando.nome} onChange={(e) => setEditando({ id: c.id, nome: e.target.value })} className="h-9 min-w-[10rem] flex-1 text-sm" aria-label="Novo nome do cargo" autoFocus />
                  <Button size="sm" onClick={() => void rodar(c.id, { acao: 'renomear', id: c.id, nome: editando.nome }).then((ok) => ok && setEditando(null))} loading={ocupado === c.id} aria-label="Confirmar nome"><Check className="h-4 w-4" /></Button>
                  <Button size="sm" variant="secondary" onClick={() => setEditando(null)} aria-label="Cancelar"><X className="h-4 w-4" /></Button>
                </>
              ) : (
                <>
                  <span className={`min-w-[10rem] flex-1 break-words text-sm ${c.active ? 'text-ink-900' : 'text-ink-500 line-through'}`}>{c.name}</span>
                  <StatusBadge tone={c.active ? 'success' : 'neutral'} dot>{c.active ? 'Ativo' : 'Inativo'}</StatusBadge>
                  {podeEditar && (
                    <span className="flex items-center gap-1">
                      <button type="button" className="rounded-control p-1.5 text-ink-500 hover:text-ink-900" aria-label={`Renomear ${c.name}`} onClick={() => setEditando({ id: c.id, nome: c.name })}><Pencil className="h-4 w-4" /></button>
                      <Button size="sm" variant="secondary" onClick={() => void rodar(c.id, { acao: 'ativar', id: c.id, active: !c.active })} loading={ocupado === c.id}>{c.active ? 'Desativar' : 'Ativar'}</Button>
                    </span>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      </section>
      {podeEditar && (
        <div className="flex flex-wrap items-center gap-2">
          <Input value={novo} onChange={(e) => setNovo(e.target.value)} placeholder="Novo cargo (ex.: Pizzaiolo)" className="h-10 min-w-[10rem] flex-1 text-sm" aria-label="Nome do novo cargo" />
          <Button onClick={() => void rodar('novo', { acao: 'criar', nome: novo }).then((ok) => ok && setNovo(''))} loading={ocupado === 'novo'} disabled={novo.trim().length < 3}><Plus className="h-4 w-4" /> Adicionar</Button>
        </div>
      )}
      <p className="text-xs text-ink-500">Cargo desativado deixa de aparecer nos PRÓXIMOS encaminhamentos. Os currículos já enviados guardam o nome do cargo como estava; renomear não reescreve o histórico.</p>
    </div>
  );
}
