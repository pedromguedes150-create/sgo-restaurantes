'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { KeyRound, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/status-badge';
import type { OrigemDoToken } from '@/lib/rh/saida/config';

/**
 * Token de ENTRADA do RH pela tela (v1.183.0): o token com que o RH chama o
 * SGO (admissão, desligamento, período aquisitivo). O Admin cola o mesmo
 * valor que está no painel do RH; não há "testar conexão" porque é o RH que
 * chama — a prova é o próximo evento dele aparecer em "Eventos recebidos".
 * Quando o token vem do servidor (`.env`), a tela só informa.
 */
export function TokenEntradaRhClient({ origem, mascarado }: { origem: OrigemDoToken; mascarado: string }) {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);

  async function post(body: Record<string, unknown>, id: string) {
    setBusy(id); setMsg(null);
    try {
      const res = await fetch('/api/rh/entrada', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg({ ok: false, texto: d.error ?? 'Falha' }); return null; }
      return d as Record<string, unknown>;
    } finally { setBusy(''); }
  }
  async function salvar() {
    const d = await post({ acao: 'definirToken', token: token.trim() }, 'salvar');
    if (!d) return;
    setToken('');
    setMsg({ ok: true, texto: `Token gravado (${d.mascarado}). O RH já consegue chamar o SGO com ele; o próximo evento aparece em "Eventos recebidos".` });
    router.refresh();
  }
  async function remover() {
    if (!window.confirm('Remover o token gravado pela tela? O RH deixa de conseguir chamar o SGO até um token novo entrar.')) return;
    const d = await post({ acao: 'removerToken' }, 'remover');
    if (!d) return;
    setMsg({ ok: true, texto: 'Token removido.' });
    router.refresh();
  }

  return (
    <div className="space-y-3" data-testid="token-entrada-rh">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <KeyRound className="h-4 w-4 text-brand" aria-hidden />
        <span className="font-semibold text-ink-900">Token de entrada (RH_INBOUND_TOKEN)</span>
        {origem === 'servidor' && <StatusBadge tone="success">definido no servidor · {mascarado}</StatusBadge>}
        {origem === 'tela' && <StatusBadge tone="success">definido pela tela · {mascarado}</StatusBadge>}
        {origem === 'nenhum' && <StatusBadge tone="critical">ausente — o RH não consegue chamar o SGO</StatusBadge>}
      </div>
      {origem === 'servidor' ? (
        <p className="text-xs text-ink-500">O token vem do <code>.env</code> do servidor e vence o gravado pela tela. Para trocar, edite o <code>.env</code> e reinicie o SGO.</p>
      ) : (
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-64 flex-1">
            <label className="text-xs text-ink-500">Cole aqui o mesmo token que está no painel do RH para chamar o SGO</label>
            <Input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="token que o RH usa para chamar o SGO" aria-label="Token de entrada do RH" autoComplete="off" className="h-9 font-mono text-sm" />
          </div>
          <Button size="sm" disabled={busy !== '' || token.trim().length < 16} onClick={salvar} data-testid="salvar-token-entrada">{busy === 'salvar' ? 'Gravando…' : origem === 'tela' ? 'Trocar token' : 'Salvar token'}</Button>
          {origem === 'tela' && <Button size="sm" variant="ghost" disabled={busy !== ''} onClick={remover}><Trash2 className="h-4 w-4" /> Remover</Button>}
        </div>
      )}
      {msg && <p className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`} data-testid="token-entrada-msg">{msg.texto}</p>}
      <p className="text-xs text-ink-500">Este é o sentido RH → SGO: o RH manda <code>Authorization: Bearer &lt;token&gt;</code> nas URLs acima, e o SGO só aceita se o token for igual a este. Para conferir, peça ao RH para reenviar um evento: ele aparece em &quot;Eventos recebidos&quot; (401 = token diferente). O token nunca aparece inteiro nem vai para a Auditoria.</p>
    </div>
  );
}
