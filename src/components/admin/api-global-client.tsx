'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Copy, KeyRound, Plus, Ban, Pause, Play, Check } from 'lucide-react';
import { Button } from '@/components/ui/ds/button';
import { Input, Textarea } from '@/components/ui/ds/field';
import { Modal } from '@/components/ui/ds/modal';
import { StatusBadge } from '@/components/ui/status-badge';
import { mascarar, situacaoDaChave, SITUACAO_TEXTO, type SituacaoDaChave } from '@/lib/api-global/formato';

export interface SistemaDaApi {
  id: string;
  name: string;
  description: string | null;
  keyPrefix: string;
  keyLast4: string;
  active: boolean;
  revokedAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  createdBy: string | null;
  chamadas: number;
}

const TOM: Record<SituacaoDaChave, 'success' | 'medium' | 'critical'> = { ATIVA: 'success', DESATIVADA: 'medium', REVOGADA: 'critical' };
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');

/**
 * Seção "API Global do SGO" da central de Integrações (v1.129.0): os sistemas
 * conectados, cada um com a sua chave MASCARADA, e as ações. A chave completa
 * aparece uma única vez — no modal, logo depois de criar — e nunca mais.
 */
export function ApiGlobalClient({ sistemas }: { sistemas: SistemaDaApi[] }) {
  const router = useRouter();
  const [criando, setCriando] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [nova, setNova] = useState<{ nome: string; chave: string } | null>(null);
  const [copiada, setCopiada] = useState(false);
  const [confirmar, setConfirmar] = useState<{ id: string; nome: string } | null>(null);

  async function criar() {
    setErro(null); setBusy(true);
    try {
      const res = await fetch('/api/api-global/chaves', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, description }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setErro(d.error ?? 'Não foi possível criar'); return; }
      setNova({ nome: name, chave: d.chave });
      setCriando(false); setName(''); setDescription('');
      router.refresh();
    } finally { setBusy(false); }
  }

  async function agir(id: string, acao: 'ativar' | 'desativar' | 'revogar') {
    setBusy(true);
    try {
      const res = await fetch('/api/api-global/chaves', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, acao }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { alert(d.error ?? 'Não foi possível aplicar'); return; }
      setConfirmar(null);
      router.refresh();
    } finally { setBusy(false); }
  }

  async function copiar() {
    if (!nova) return;
    try { await navigator.clipboard.writeText(nova.chave); setCopiada(true); setTimeout(() => setCopiada(false), 2000); } catch { /* sem clipboard: a chave está na tela para selecionar */ }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-ink-500">Uma chave por sistema. A chave completa aparece só na criação — guarde no <code>.env</code> do sistema que vai chamar o SGO.</p>
        <Button size="sm" onClick={() => { setErro(null); setCriando(true); }}><Plus className="h-4 w-4" /> Criar nova chave</Button>
      </div>

      {sistemas.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line p-3 text-sm text-ink-500">Nenhum sistema conectado ainda. Crie a primeira chave para o RH, o Financeiro, o BI…</p>
      ) : (
        <div className="overflow-x-auto rounded-card border border-line">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-canvas text-left text-xs text-ink-500">
              <tr>
                <th className="px-2 py-2 font-semibold">Sistema</th>
                <th className="px-2 py-2 font-semibold">Chave</th>
                <th className="px-2 py-2 font-semibold">Situação</th>
                <th className="px-2 py-2 font-semibold">Último uso</th>
                <th className="px-2 py-2 text-right font-semibold">Chamadas</th>
                <th className="px-2 py-2 font-semibold">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {sistemas.map((s) => {
                const sit = situacaoDaChave(s);
                return (
                  <tr key={s.id} className={sit === 'REVOGADA' ? 'text-ink-400' : ''}>
                    <td className="px-2 py-2">
                      <p className="font-semibold text-ink-900">{s.name}</p>
                      {s.description && <p className="text-xs text-ink-500">{s.description}</p>}
                      <p className="text-xs text-ink-500">criada em {fmt(s.createdAt)}{s.createdBy ? ` por ${s.createdBy}` : ''}</p>
                    </td>
                    <td className="px-2 py-2 font-mono text-xs">{mascarar(s.keyPrefix, s.keyLast4)}</td>
                    <td className="px-2 py-2"><StatusBadge tone={TOM[sit]}>{SITUACAO_TEXTO[sit]}</StatusBadge></td>
                    <td className="px-2 py-2 text-xs">{fmt(s.lastUsedAt)}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{s.chamadas}</td>
                    <td className="px-2 py-2">
                      {sit !== 'REVOGADA' && (
                        <span className="flex flex-wrap gap-1">
                          {sit === 'ATIVA'
                            ? <Button size="sm" variant="secondary" disabled={busy} onClick={() => agir(s.id, 'desativar')}><Pause className="h-3.5 w-3.5" /> Desativar</Button>
                            : <Button size="sm" variant="secondary" disabled={busy} onClick={() => agir(s.id, 'ativar')}><Play className="h-3.5 w-3.5" /> Ativar</Button>}
                          <Button size="sm" variant="danger" disabled={busy} onClick={() => setConfirmar({ id: s.id, nome: s.name })}><Ban className="h-3.5 w-3.5" /> Revogar</Button>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Criar */}
      <Modal
        open={criando}
        onClose={() => !busy && setCriando(false)}
        title="Novo sistema conectado"
        description="Dê o nome do sistema que vai chamar o SGO (ex.: RH, Financeiro, BI). A chave é gerada no servidor e mostrada uma única vez."
        footer={<>
          <Button variant="secondary" onClick={() => setCriando(false)} disabled={busy}>Cancelar</Button>
          <Button onClick={criar} loading={busy} disabled={name.trim().length < 2}><KeyRound className="h-4 w-4" /> Gerar chave</Button>
        </>}
      >
        <div className="space-y-2">
          <Input label="Sistema" value={name} onChange={(e) => setName(e.target.value)} placeholder="ex.: Financeiro" maxLength={80} />
          <Textarea label="Descrição (opcional)" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="para que este sistema usa a API" rows={2} maxLength={300} />
          {erro && <p className="text-sm text-danger">{erro}</p>}
        </div>
      </Modal>

      {/* A chave, uma única vez */}
      <Modal
        open={nova !== null}
        onClose={() => setNova(null)}
        title={`Chave de ${nova?.nome ?? ''} criada`}
        description="Copie agora e guarde no sistema que vai chamar o SGO. Ao fechar, ela não pode mais ser vista — só revogada e recriada."
        footer={<Button onClick={() => setNova(null)}>Já guardei a chave</Button>}
      >
        <div className="space-y-2">
          <code className="block break-all rounded-lg border border-line bg-canvas p-3 font-mono text-sm text-ink-900" data-testid="chave-nova">{nova?.chave}</code>
          <Button size="sm" variant="secondary" onClick={copiar}>{copiada ? <><Check className="h-4 w-4" /> Copiada</> : <><Copy className="h-4 w-4" /> Copiar chave</>}</Button>
          <p className="text-xs text-ink-500">Use no header <code>X-API-Key</code>. Exemplo: <code>curl -H &quot;X-API-Key: {nova?.chave.slice(0, 17)}…&quot; …/api/v1/status</code></p>
        </div>
      </Modal>

      {/* Revogar */}
      <Modal
        open={confirmar !== null}
        onClose={() => !busy && setConfirmar(null)}
        title={`Revogar a chave de ${confirmar?.nome ?? ''}?`}
        description="É definitivo: toda chamada com esta chave passa a receber 401. Para reconectar o sistema, crie uma chave nova. Fica na Auditoria."
        size="sm"
        footer={<>
          <Button variant="secondary" onClick={() => setConfirmar(null)} disabled={busy}>Cancelar</Button>
          <Button variant="danger" onClick={() => confirmar && agir(confirmar.id, 'revogar')} loading={busy}>Revogar</Button>
        </>}
      />
    </div>
  );
}
