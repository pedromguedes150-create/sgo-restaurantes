'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Plug, Pencil, Pause, Play, Activity } from 'lucide-react';
import { Button } from '@/components/ui/ds/button';
import { Input, Textarea } from '@/components/ui/ds/field';
import { Select as DsSelect } from '@/components/ui/ds/select';
import { Modal } from '@/components/ui/ds/modal';
import { Banner } from '@/components/ui/ds/banner';
import { StatusBadge } from '@/components/ui/status-badge';
import {
  AUTH_OPCOES, HEADER_PADRAO, descreverAuth, mascararCredencial, textoDoResultado, tomDoResultado, SITUACAO_TEXTO,
  type TipoDeAuth,
} from '@/lib/conexoes/formato';

export interface ConexaoNaTela {
  id: string;
  name: string;
  purpose: string | null;
  baseUrl: string;
  authType: TipoDeAuth;
  authHeader: string;
  credentialLast4: string;
  active: boolean;
  testPath: string;
  lastUsedAt: string | null;
  lastStatus: number | null;
  lastOk: boolean | null;
  lastResult: string | null;
  createdAt: string;
  createdBy: string | null;
  chamadas: number;
}

interface Teste { ok: boolean; status: number | null; durationMs: number; error: string | null; forma: { tipo: string; chaves: string[]; itens: number | null } | null }

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');

const VAZIO = { name: '', purpose: '', baseUrl: '', authType: 'API_KEY_HEADER' as TipoDeAuth, authHeader: HEADER_PADRAO, credential: '', testPath: '/' };

function TesteResumo({ t }: { t: Teste }) {
  return (
    <Banner
      tone={t.ok ? 'success' : 'danger'}
      title={t.ok ? `Conectou — HTTP ${t.status} em ${t.durationMs} ms` : `Falhou${t.status != null ? ` — HTTP ${t.status}` : ''} em ${t.durationMs} ms`}
      description={t.ok
        ? (t.forma ? `Resposta: ${t.forma.tipo}${t.forma.itens != null ? ` com ${t.forma.itens} item(ns)` : ''}${t.forma.chaves.length ? ` · campos: ${t.forma.chaves.slice(0, 12).join(', ')}` : ''}` : 'Resposta vazia.')
        : (t.error ?? 'Sem detalhe')}
    />
  );
}

/**
 * Seção "Conexões com outros sistemas" da central de Integrações (v1.131.0):
 * as APIs que ESTE SGO consome, cada uma com a credencial guardada cifrada no
 * servidor e mostrada só pelos 4 últimos caracteres. Espelho da seção "API
 * Global do SGO", que lista quem consome a NOSSA API.
 */
export function ConexoesClient({ conexoes, cifra }: { conexoes: ConexaoNaTela[]; cifra: 'dedicada' | 'derivada' | 'nenhuma' }) {
  const router = useRouter();
  const [aberto, setAberto] = useState<null | { id: string | null }>(null);
  const [form, setForm] = useState({ ...VAZIO });
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [testeForm, setTesteForm] = useState<Teste | null>(null);
  const [testeLinha, setTesteLinha] = useState<Record<string, Teste | { erro: string }>>({});

  const set = (k: keyof typeof VAZIO) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  function abrirNova() { setForm({ ...VAZIO }); setErro(null); setTesteForm(null); setAberto({ id: null }); }
  function abrirEdicao(c: ConexaoNaTela) {
    setForm({ name: c.name, purpose: c.purpose ?? '', baseUrl: c.baseUrl, authType: c.authType, authHeader: c.authType === 'BEARER' ? HEADER_PADRAO : c.authHeader, credential: '', testPath: c.testPath });
    setErro(null); setTesteForm(null); setAberto({ id: c.id });
  }

  async function post(body: Record<string, unknown>) {
    const res = await fetch('/api/conexoes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const d = await res.json().catch(() => ({}));
    return { ok: res.ok, d };
  }

  async function salvar() {
    setErro(null); setBusy(true);
    try {
      const { ok, d } = await post(aberto?.id ? { acao: 'editar', id: aberto.id, ...form } : { acao: 'criar', ...form });
      if (!ok) { setErro(d.error ?? 'Não foi possível salvar'); return; }
      setAberto(null);
      router.refresh();
    } finally { setBusy(false); }
  }

  /* Testar antes de salvar: manda o rascunho; com a conexão já gravada e a
     credencial em branco, testa a gravada (a credencial guardada é usada). */
  async function testarNoForm() {
    setErro(null); setTesteForm(null); setBusy(true);
    try {
      const body = form.credential.trim() || !aberto?.id
        ? { acao: 'testar', rascunho: form }
        : { acao: 'testar', id: aberto.id, path: form.testPath };
      const { ok, d } = await post(body);
      if (!ok) { setErro(d.error ?? 'Não foi possível testar'); return; }
      setTesteForm(d.teste as Teste);
    } finally { setBusy(false); }
  }

  async function testarLinha(id: string) {
    setBusy(true);
    try {
      const { ok, d } = await post({ acao: 'testar', id });
      setTesteLinha((m) => ({ ...m, [id]: ok ? (d.teste as Teste) : { erro: d.error ?? 'Não foi possível testar' } }));
      router.refresh();
    } finally { setBusy(false); }
  }

  async function agir(id: string, acao: 'ativar' | 'desativar') {
    setBusy(true);
    try {
      const { ok, d } = await post({ acao, id });
      if (!ok) { alert(d.error ?? 'Não foi possível aplicar'); return; }
      router.refresh();
    } finally { setBusy(false); }
  }

  const bearer = form.authType === 'BEARER';

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-ink-500">Uma conexão por sistema que o SGO consome. A credencial é guardada cifrada no servidor e nunca volta inteira à tela.</p>
        <Button size="sm" onClick={abrirNova} disabled={cifra === 'nenhuma'}><Plus className="h-4 w-4" /> Nova conexão</Button>
      </div>

      {cifra === 'nenhuma' && (
        <Banner tone="danger" title="Sem chave de cifra neste servidor" description="Defina CONNECTIONS_ENC_KEY no .env para cadastrar credenciais. Sem ela, nada é gravado." />
      )}
      {cifra === 'derivada' && (
        <Banner tone="warning" title="Chave de cifra derivada do segredo do JWT" description="Funciona, mas trocar JWT_REFRESH_SECRET inutiliza as credenciais guardadas. Defina CONNECTIONS_ENC_KEY no .env do servidor para uma chave própria." />
      )}

      {conexoes.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line p-3 text-sm text-ink-500">Nenhuma conexão cadastrada. A primeira será a API v2 do RH.</p>
      ) : (
        <div className="overflow-x-auto rounded-card border border-line">
          <table className="w-full min-w-[816px] text-sm">
            <thead className="bg-canvas text-left text-xs text-ink-500">
              <tr>
                <th className="px-2 py-2 font-semibold">Sistema</th>
                <th className="px-2 py-2 font-semibold">Finalidade</th>
                <th className="px-2 py-2 font-semibold">Status</th>
                <th className="px-2 py-2 font-semibold">Último uso</th>
                <th className="px-2 py-2 font-semibold">Último resultado</th>
                <th className="px-2 py-2 font-semibold">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {conexoes.map((c) => {
                const t = testeLinha[c.id];
                return (
                  <tr key={c.id} className={c.active ? '' : 'text-ink-400'}>
                    <td className="px-2 py-2">
                      <p className="font-semibold text-ink-900">{c.name}</p>
                      <p className="font-mono text-xs text-ink-500">{c.baseUrl}</p>
                      <p className="text-xs text-ink-500">{descreverAuth(c.authType, c.authHeader)} · credencial {mascararCredencial(c.credentialLast4)}</p>
                    </td>
                    <td className="px-2 py-2 text-xs">{c.purpose ?? '—'}</td>
                    <td className="px-2 py-2"><StatusBadge tone={c.active ? 'success' : 'medium'}>{SITUACAO_TEXTO[c.active ? 'ATIVA' : 'DESATIVADA']}</StatusBadge></td>
                    <td className="px-2 py-2 text-xs">{fmt(c.lastUsedAt)}<br /><span className="text-ink-500">{c.chamadas} chamada(s)</span></td>
                    <td className="px-2 py-2 text-xs">
                      <StatusBadge tone={tomDoResultado(c)}>{textoDoResultado(c)}</StatusBadge>
                      {t && ('erro' in t
                        ? <p className="mt-1 text-danger">{t.erro}</p>
                        : <p className={`mt-1 ${t.ok ? 'text-success' : 'text-danger'}`}>Teste: {t.ok ? `OK (${t.status})` : `falhou${t.status != null ? ` (${t.status})` : ''}${t.error ? ` — ${t.error}` : ''}`} · {t.durationMs} ms</p>)}
                    </td>
                    <td className="px-2 py-2">
                      <span className="flex flex-wrap gap-1">
                        <Button size="sm" variant="secondary" disabled={busy || !c.active} onClick={() => testarLinha(c.id)}><Activity className="h-3.5 w-3.5" /> Testar</Button>
                        <Button size="sm" variant="secondary" disabled={busy} onClick={() => abrirEdicao(c)}><Pencil className="h-3.5 w-3.5" /> Editar</Button>
                        {c.active
                          ? <Button size="sm" variant="secondary" disabled={busy} onClick={() => agir(c.id, 'desativar')}><Pause className="h-3.5 w-3.5" /> Desativar</Button>
                          : <Button size="sm" variant="secondary" disabled={busy} onClick={() => agir(c.id, 'ativar')}><Play className="h-3.5 w-3.5" /> Ativar</Button>}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={aberto !== null}
        onClose={() => !busy && setAberto(null)}
        title={aberto?.id ? 'Editar conexão' : 'Nova conexão'}
        description="A API de outro sistema que este SGO vai consumir. A chave é guardada cifrada e não aparece de novo."
        footer={<>
          <Button variant="secondary" onClick={() => setAberto(null)} disabled={busy}>Cancelar</Button>
          <Button variant="secondary" onClick={testarNoForm} disabled={busy || !form.baseUrl.trim() || (!aberto?.id && !form.credential.trim())}><Activity className="h-4 w-4" /> Testar conexão</Button>
          <Button onClick={salvar} loading={busy} disabled={form.name.trim().length < 2 || !form.baseUrl.trim() || (!aberto?.id && !form.credential.trim())}><Plug className="h-4 w-4" /> Salvar</Button>
        </>}
      >
        <div className="space-y-2">
          <Input label="Nome do sistema" value={form.name} onChange={(e) => set('name')(e.target.value)} placeholder="ex.: SGO RH (API v2)" maxLength={80} />
          <Input label="URL base" value={form.baseUrl} onChange={(e) => set('baseUrl')(e.target.value)} placeholder="https://gbf-rh.replit.app/api/ext/v2/rh" maxLength={300} />
          <DsSelect label="Autenticação" value={form.authType} onValueChange={(v) => set('authType')(v)} options={AUTH_OPCOES} />
          {!bearer && <Input label="Nome do header" value={form.authHeader} onChange={(e) => set('authHeader')(e.target.value)} placeholder={HEADER_PADRAO} maxLength={64} />}
          <Input
            label={aberto?.id ? 'Chave / API Key (deixe em branco para manter a atual)' : 'Chave / API Key'}
            type="password" autoComplete="new-password"
            value={form.credential} onChange={(e) => set('credential')(e.target.value)} placeholder={aberto?.id ? '••••••••' : 'cole a credencial fornecida pelo outro sistema'} maxLength={1000}
          />
          <Textarea label="Finalidade" value={form.purpose} onChange={(e) => set('purpose')(e.target.value)} placeholder="ex.: colaboradores e empresas do RH para o sync" rows={2} maxLength={300} />
          <Input label="Caminho de teste (relativo à base)" value={form.testPath} onChange={(e) => set('testPath')(e.target.value)} placeholder="/recursos" maxLength={200} />
          {erro && <p className="text-sm text-danger">{erro}</p>}
          {testeForm && <TesteResumo t={testeForm} />}
        </div>
      </Modal>
    </div>
  );
}
