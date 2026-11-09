'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Pencil, X } from 'lucide-react';
import { Button } from '@/components/ui/ds/button';
import { Banner } from '@/components/ui/ds/banner';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/ds/status-badge';
import { GRUPOS, ORDEM_DOS_GRUPOS } from '@/lib/certificates/catalogo';
import type { ConfigDaNomenclatura } from '@/lib/certificates/config-nomenclaturas';

/**
 * Configurações → Atestados e afins (v1.198.0): a tabela de correspondência
 * SGO ↔ RH. Por nomenclatura: nome no RH, ativa/inativa (a IA só recebe as
 * ativas), dias da regra (sobrepõe a tabela legal) e observação. Sem código.
 */
const ESCALA: Record<string, string> = { ATESTADO: 'Atestado (A)', AFASTADO: 'Afastado (AF)', LICENCA: 'Licença (LI)', FALTA_JUST: 'Falta justificada (FJ)' };

export function ConfigNomenclaturasClient({ itens, podeEditar }: { itens: ConfigDaNomenclatura[]; podeEditar: boolean }) {
  const router = useRouter();
  const [editando, setEditando] = useState<{ nome: string; rhName: string; ruleDays: string; notes: string } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  async function gravar(nome: string, body: Record<string, unknown>) {
    setOcupado(nome); setErro(null);
    const r = await fetch('/api/certificates/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nomenclatura: nome, ...body }) });
    const data = await r.json().catch(() => ({}));
    setOcupado(null);
    if (!r.ok) { setErro(data.error ?? 'Falha ao gravar.'); return false; }
    router.refresh(); return true;
  }

  return (
    <div className="space-y-4" data-testid="config-nomenclaturas">
      {erro && <Banner tone="danger" title={erro} />}
      {ORDEM_DOS_GRUPOS.map((g) => {
        const doGrupo = itens.filter((i) => i.grupo === g);
        return (
          <section key={g} className="sgo-panel sgo-panel--solid overflow-hidden">
            <header className="border-b border-line px-3 py-2 sm:px-4">
              <h2 className="text-sm font-bold text-ink-900">{GRUPOS[g].plural} <span className="font-normal text-ink-500">· {doGrupo.length}</span></h2>
              <p className="text-xs text-ink-500">{GRUPOS[g].descricao}</p>
            </header>
            <ul className="divide-y divide-line">
              {doGrupo.map((n) => {
                const emEdicao = editando?.nome === n.nome;
                const temRegra = n.regraVigente != null || n.ruleDays != null;
                return (
                  <li key={n.nome} className="px-3 py-2 sm:px-4" data-testid="nomenclatura">
                    <div className="flex flex-wrap items-start gap-2">
                      <div className="min-w-[12rem] flex-1">
                        <p className={`text-sm font-semibold ${n.active ? 'text-ink-900' : 'text-ink-500 line-through'}`}>{n.nome}</p>
                        <p className="text-xs text-ink-500">
                          No RH: <b className="text-ink-900">{n.rhName ?? n.nome}</b>{n.rhName ? '' : ' (mesmo nome)'} · Escala: {n.escala ? ESCALA[n.escala] : 'não afasta o dia'} · Envio: {n.tipo}
                        </p>
                        {temRegra && (
                          <p className="text-xs text-ink-500">
                            Regra: <b className="text-ink-900">{n.diasVigentes} dia(s)</b>
                            {n.ruleDays != null ? ' (definido pelo Admin)' : n.regraVigente ? ` — ${n.regraVigente.base}, versão ${n.regraVigente.versao}${n.regraVigente.desde !== '0000-01-01' ? ` desde ${n.regraVigente.desde.split('-').reverse().join('/')}` : ''}` : ''}
                          </p>
                        )}
                        {n.notes && <p className="text-xs text-ink-500">Obs.: {n.notes}</p>}
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <StatusBadge tone={n.active ? 'success' : 'neutral'} dot>{n.active ? 'Ativa' : 'Inativa'}</StatusBadge>
                        {podeEditar && !emEdicao && (
                          <>
                            <button type="button" className="rounded-control p-1.5 text-ink-500 hover:text-ink-900" aria-label={`Editar ${n.nome}`} onClick={() => setEditando({ nome: n.nome, rhName: n.rhName ?? '', ruleDays: n.ruleDays != null ? String(n.ruleDays) : '', notes: n.notes ?? '' })}><Pencil className="h-4 w-4" /></button>
                            <Button size="sm" variant="secondary" loading={ocupado === n.nome} onClick={() => void gravar(n.nome, { active: !n.active })}>{n.active ? 'Desativar' : 'Ativar'}</Button>
                          </>
                        )}
                      </div>
                    </div>
                    {emEdicao && editando && (
                      <div className="mt-2 grid grid-cols-1 gap-2 rounded-lg border border-line bg-sunken/40 p-2 sm:grid-cols-[1fr_8rem]" data-testid="editar-nomenclatura">
                        <div>
                          <label className="text-xs font-semibold text-ink-900" htmlFor={`rh-${n.nome}`}>Nome no sistema do RH</label>
                          <Input id={`rh-${n.nome}`} className="h-9 text-sm" value={editando.rhName} onChange={(e) => setEditando({ ...editando, rhName: e.target.value })} placeholder={n.nome} />
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-ink-900" htmlFor={`dias-${n.nome}`}>Dias da regra</label>
                          <Input id={`dias-${n.nome}`} className="h-9 text-sm" inputMode="numeric" value={editando.ruleDays} onChange={(e) => setEditando({ ...editando, ruleDays: e.target.value })} placeholder={n.regraVigente ? String(n.regraVigente.dias) : '—'} disabled={!temRegra && n.tipo === 'HOURS'} />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="text-xs font-semibold text-ink-900" htmlFor={`obs-${n.nome}`}>Observação (convenção coletiva, política interna)</label>
                          <Input id={`obs-${n.nome}`} className="h-9 text-sm" value={editando.notes} onChange={(e) => setEditando({ ...editando, notes: e.target.value })} />
                        </div>
                        <div className="flex gap-2 sm:col-span-2">
                          <Button size="sm" loading={ocupado === n.nome} onClick={() => void gravar(n.nome, { rhName: editando.rhName, ruleDays: editando.ruleDays.trim() === '' ? null : Number(editando.ruleDays), notes: editando.notes }).then((ok) => ok && setEditando(null))}><Check className="h-4 w-4" /> Salvar</Button>
                          <Button size="sm" variant="secondary" onClick={() => setEditando(null)}><X className="h-4 w-4" /> Cancelar</Button>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
      <p className="text-xs text-ink-500">Dias da regra em branco = a tabela legal com vigência (ex.: licença-paternidade 5 dias em 2026, 10 em 2027). Nomenclatura inativa não é oferecida à IA nem aparece nos novos lançamentos; os documentos já gravados não mudam. O RH lê esta tabela em <code>GET /api/v1/atestados/nomenclaturas</code>.</p>
    </div>
  );
}
