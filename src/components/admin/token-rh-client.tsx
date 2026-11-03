'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { KeyRound, PlugZap, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/status-badge';
import type { OrigemDoToken } from '@/lib/rh/saida/config';

/**
 * Token do RH pela tela (v1.182.2): o Admin cola o token que o RH passou,
 * testa contra o RH sem criar nada e, se preciso, remove. Quando o token vem
 * do servidor (`.env`), a tela só informa — o `.env` vence o banco.
 */
export function TokenRhClient({ origem, mascarado }: { origem: OrigemDoToken; mascarado: string }) {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);

  async function post(body: Record<string, unknown>, id: string) {
    setBusy(id); setMsg(null);
    try {
      const res = await fetch('/api/rh/saida', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg({ ok: false, texto: d.error ?? 'Falha' }); return null; }
      return d as Record<string, unknown>;
    } finally { setBusy(''); }
  }
  async function salvar() {
    const d = await post({ acao: 'definirToken', token: token.trim() }, 'salvar');
    if (!d) return;
    setToken('');
    setMsg({ ok: true, texto: `Token gravado (${d.mascarado}). Agora teste a conexão ou processe a fila.` });
    router.refresh();
  }
  async function testar() {
    const d = await post({ acao: 'testarToken' }, 'testar');
    if (!d) return;
    setMsg({ ok: Boolean(d.aceito), texto: `${d.mensagem}${d.http ? ` (HTTP ${d.http})` : ''}` });
  }
  async function remover() {
    if (!window.confirm('Remover o token gravado pela tela? Os envios param até um token novo entrar.')) return;
    const d = await post({ acao: 'removerToken' }, 'remover');
    if (!d) return;
    setMsg({ ok: true, texto: 'Token removido.' });
    router.refresh();
  }

  return (
    <div className="space-y-3" data-testid="token-rh">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <KeyRound className="h-4 w-4 text-brand" aria-hidden />
        <span className="font-semibold text-ink-900">Token do RH (RH_WEBHOOK_TOKEN)</span>
        {origem === 'servidor' && <StatusBadge tone="success">definido no servidor · {mascarado}</StatusBadge>}
        {origem === 'tela' && <StatusBadge tone="success">definido pela tela · {mascarado}</StatusBadge>}
        {origem === 'nenhum' && <StatusBadge tone="critical">ausente — nada é enviado ao RH</StatusBadge>}
      </div>
      {origem === 'servidor' ? (
        <p className="text-xs text-ink-500">O token vem do <code>.env</code> do servidor e vence o gravado pela tela. Para trocar, edite o <code>.env</code> e reinicie o SGO.</p>
      ) : (
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-64 flex-1">
            <label className="text-xs text-ink-500">Cole aqui o token que o responsável pelo RH passou</label>
            <Input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="token da integração de saída do SGO" aria-label="Token do RH" autoComplete="off" className="h-9 font-mono text-sm" />
          </div>
          <Button size="sm" disabled={busy !== '' || token.trim().length < 16} onClick={salvar} data-testid="salvar-token">{busy === 'salvar' ? 'Gravando…' : origem === 'tela' ? 'Trocar token' : 'Salvar token'}</Button>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" disabled={busy !== '' || origem === 'nenhum'} onClick={testar} data-testid="testar-token"><PlugZap className="h-4 w-4" /> Testar conexão com o RH</Button>
        {origem === 'tela' && <Button size="sm" variant="ghost" disabled={busy !== ''} onClick={remover}><Trash2 className="h-4 w-4" /> Remover</Button>}
      </div>
      {msg && <p className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`} data-testid="token-msg">{msg.texto}</p>}
      <p className="text-xs text-ink-500">O teste manda um pedido vazio ao RH: ele responde &quot;campos obrigatórios&quot; quando o token está certo e 401 quando não está. Nada é criado no RH. O token nunca aparece inteiro nem vai para a Auditoria.</p>
    </div>
  );
}
