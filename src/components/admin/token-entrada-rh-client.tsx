'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Copy, KeyRound, Sparkles, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/status-badge';
import type { OrigemDoToken } from '@/lib/rh/saida/config';

/**
 * Token de ENTRADA do RH pela tela (v1.183.0): o token com que o RH chama o
 * SGO (admissão, desligamento, período aquisitivo). O Admin cola o mesmo
 * valor que está no painel do RH; não há "testar conexão" porque é o RH que
 * chama — a prova é o próximo evento dele aparecer em "Eventos recebidos".
 * v1.211.0: o campo aparece SEMPRE — o token gravado aqui vence o do servidor
 * (`.env`), que ninguém consegue ler sem SSH. "Gerar token novo" cria o valor
 * no próprio navegador e o mostra UMA vez, para copiar e entregar ao RH.
 */
export function gerarTokenNoNavegador(): string {
  const bytes = new Uint8Array(36);
  crypto.getRandomValues(bytes);
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function TokenEntradaRhClient({ origem, mascarado, temNoServidor = false }: { origem: OrigemDoToken; mascarado: string; temNoServidor?: boolean }) {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  /* O token gerado aqui fica à vista até a pessoa dizer que copiou: depois de gravado não há como vê-lo de novo. */
  const [gerado, setGerado] = useState('');
  const [copiado, setCopiado] = useState(false);

  function gerar() {
    const t = gerarTokenNoNavegador();
    setGerado(t); setToken(t); setCopiado(false); setMsg(null);
  }
  async function copiar() {
    try { await navigator.clipboard.writeText(gerado); setCopiado(true); setTimeout(() => setCopiado(false), 2000); } catch { /* sem clipboard: o valor está na tela para selecionar */ }
  }

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
    setMsg({ ok: true, texto: `Token gravado (${d.mascarado}). A partir de agora o SGO só aceita este; entregue o valor ao RH por canal seguro. O próximo evento deles aparece em "Eventos recebidos".` });
    router.refresh();
  }
  async function remover() {
    if (!window.confirm(temNoServidor ? 'Remover o token gravado pela tela? O SGO volta a aceitar só o token do servidor.' : 'Remover o token gravado pela tela? O RH deixa de conseguir chamar o SGO até um token novo entrar.')) return;
    const d = await post({ acao: 'removerToken' }, 'remover');
    if (!d) return;
    setGerado('');
    setMsg({ ok: true, texto: temNoServidor ? 'Token da tela removido. Voltou a valer o do servidor.' : 'Token removido.' });
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
      {origem === 'servidor' && (
        <p className="text-xs text-ink-500" data-testid="token-entrada-servidor">O token em vigor está no <code>.env</code> do servidor e não pode ser lido por aqui. Se o RH não tem esse valor, grave um token novo abaixo: ele passa a valer no lugar do do servidor, sem reiniciar nada.</p>
      )}
      {origem === 'tela' && temNoServidor && (
        <p className="text-xs text-ink-500">Há também um token no <code>.env</code> do servidor, mas quem vale é o gravado pela tela. Removendo o da tela, o do servidor volta a valer.</p>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-64 flex-1">
          <label className="text-xs text-ink-500">Cole o token combinado com o RH, ou gere um novo</label>
          <Input type="password" value={token} onChange={(e) => { setToken(e.target.value); if (e.target.value !== gerado) setGerado(''); }} placeholder="token que o RH usa para chamar o SGO" aria-label="Token de entrada do RH" autoComplete="off" className="h-9 font-mono text-sm" />
        </div>
        <Button size="sm" variant="outline" disabled={busy !== ''} onClick={gerar} data-testid="gerar-token-entrada"><Sparkles className="h-4 w-4" /> Gerar token novo</Button>
        <Button size="sm" disabled={busy !== '' || token.trim().length < 16} onClick={salvar} data-testid="salvar-token-entrada">{busy === 'salvar' ? 'Gravando…' : origem === 'nenhum' ? 'Salvar token' : 'Trocar token'}</Button>
        {origem === 'tela' && <Button size="sm" variant="ghost" disabled={busy !== ''} onClick={remover}><Trash2 className="h-4 w-4" /> Remover</Button>}
      </div>
      {gerado && (
        <div className="space-y-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2" data-testid="token-entrada-gerado">
          <p className="text-xs font-semibold text-ink-900">Copie este token AGORA e entregue ao RH por canal seguro (cofre de senhas ou ligação). Depois de sair desta tela ele não aparece mais.</p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 select-all break-all rounded bg-surface px-2 py-1 font-mono text-xs text-ink-900">{gerado}</code>
            <Button size="sm" variant="outline" onClick={() => void copiar()}><Copy className="h-4 w-4" /> {copiado ? 'Copiado' : 'Copiar'}</Button>
            <Button size="sm" variant="ghost" onClick={() => setGerado('')}>Já copiei, esconder</Button>
          </div>
          <p className="text-xs text-ink-500">Gerar não grava: clique em &quot;{origem === 'nenhum' ? 'Salvar token' : 'Trocar token'}&quot; para ele passar a valer.</p>
        </div>
      )}
      {msg && <p className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`} data-testid="token-entrada-msg">{msg.texto}</p>}
      <p className="text-xs text-ink-500">Este é o sentido RH → SGO: o RH manda <code>Authorization: Bearer &lt;token&gt;</code> nas URLs acima, e o SGO só aceita se o token for igual a este. Para conferir, peça ao RH para reenviar um evento: ele aparece em &quot;Eventos recebidos&quot; (401 = token diferente). O token nunca aparece inteiro nem vai para a Auditoria.</p>
    </div>
  );
}
