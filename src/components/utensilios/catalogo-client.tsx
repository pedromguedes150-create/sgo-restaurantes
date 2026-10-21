'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowDown, ArrowUp, Check, Pencil, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/ds/button';
import { Banner } from '@/components/ui/ds/banner';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/ds/status-badge';

/** Configurações → Utensílios: a lista padrão, sem código — adicionar, renomear, ordenar, ativar/desativar. */
export interface UtensilioUI { id: string; name: string; order: number; active: boolean }

async function acao(body: Record<string, unknown>) {
  const r = await fetch('/api/utensilios/catalogo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { ok: r.ok, body: await r.json().catch(() => ({})) as { error?: string } };
}

export function CatalogoUtensiliosClient({ itens, podeEditar }: { itens: UtensilioUI[]; podeEditar: boolean }) {
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
    <div className="space-y-3" data-testid="catalogo-utensilios">
      {erro && <Banner tone="danger" title={erro} />}
      <section className="sgo-panel sgo-panel--solid overflow-hidden">
        <ul className="divide-y divide-line">
          {itens.map((it, idx) => (
            <li key={it.id} className="flex items-center gap-2 px-3 py-2 sm:px-4">
              <span className="w-6 text-right text-xs tabular-nums text-ink-500">{idx + 1}</span>
              {editando?.id === it.id ? (
                <>
                  <Input value={editando.nome} onChange={(e) => setEditando({ id: it.id, nome: e.target.value })} className="h-9 flex-1 text-sm" aria-label="Novo nome do utensílio" autoFocus />
                  <Button size="sm" onClick={() => void rodar(it.id, { acao: 'renomear', id: it.id, nome: editando.nome }).then((ok) => ok && setEditando(null))} loading={ocupado === it.id} aria-label="Confirmar nome"><Check className="h-4 w-4" /></Button>
                  <Button size="sm" variant="secondary" onClick={() => setEditando(null)} aria-label="Cancelar"><X className="h-4 w-4" /></Button>
                </>
              ) : (
                <>
                  <span className={`min-w-0 flex-1 truncate text-sm ${it.active ? 'text-ink-900' : 'text-ink-500 line-through'}`}>{it.name}</span>
                  <StatusBadge tone={it.active ? 'success' : 'neutral'} dot>{it.active ? 'Ativo' : 'Inativo'}</StatusBadge>
                  {podeEditar && (
                    <span className="flex items-center gap-1">
                      <button type="button" className="rounded-control p-1.5 text-ink-500 hover:text-ink-900 disabled:opacity-40" aria-label={`Mover ${it.name} para cima`} disabled={idx === 0 || !!ocupado} onClick={() => void rodar(it.id, { acao: 'mover', id: it.id, direcao: 'cima' })}><ArrowUp className="h-4 w-4" /></button>
                      <button type="button" className="rounded-control p-1.5 text-ink-500 hover:text-ink-900 disabled:opacity-40" aria-label={`Mover ${it.name} para baixo`} disabled={idx === itens.length - 1 || !!ocupado} onClick={() => void rodar(it.id, { acao: 'mover', id: it.id, direcao: 'baixo' })}><ArrowDown className="h-4 w-4" /></button>
                      <button type="button" className="rounded-control p-1.5 text-ink-500 hover:text-ink-900" aria-label={`Renomear ${it.name}`} onClick={() => setEditando({ id: it.id, nome: it.name })}><Pencil className="h-4 w-4" /></button>
                      <Button size="sm" variant="secondary" onClick={() => void rodar(it.id, { acao: 'ativar', id: it.id, active: !it.active })} loading={ocupado === it.id}>{it.active ? 'Desativar' : 'Ativar'}</Button>
                    </span>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      </section>
      {podeEditar && (
        <div className="flex items-center gap-2">
          <Input value={novo} onChange={(e) => setNovo(e.target.value)} placeholder="Novo utensílio (ex.: Travessas)" className="h-10 flex-1 text-sm" aria-label="Nome do novo utensílio" />
          <Button onClick={() => void rodar('novo', { acao: 'adicionar', nome: novo }).then((ok) => ok && setNovo(''))} loading={ocupado === 'novo'} disabled={novo.trim().length < 2}><Plus className="h-4 w-4" /> Adicionar</Button>
        </div>
      )}
      <p className="text-xs text-ink-500">Item desativado deixa de aparecer nas PRÓXIMAS contagens; os inventários já feitos guardam o nome como estava. Renomear não reescreve o histórico.</p>
    </div>
  );
}
