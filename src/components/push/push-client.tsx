'use client';

import { useCallback, useEffect, useState } from 'react';
import { Bell, BellOff, BellRing, Smartphone, Trash2, Send, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PUSH_CATEGORIES } from '@/lib/push/categories';

interface DeviceRow {
  id: string;
  deviceLabel: string;
  createdAt: string;
  lastSuccessAt: string | null;
  endpoint: string;
}

/** base64url (chave VAPID) → Uint8Array, formato aceito pelo pushManager. */
function urlBase64ToUint8Array(base64: string) {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true;
}

function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export function PushClient() {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [configured, setConfigured] = useState(true);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [thisDeviceOn, setThisDeviceOn] = useState(false);
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [prefs, setPrefs] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/push', { cache: 'no-store' });
    if (!res.ok) return;
    const d = await res.json();
    setConfigured(Boolean(d.configured));
    setDevices(d.devices ?? []);
    setPrefs(d.prefs ?? {});

    // este aparelho está inscrito? compara o endpoint local com os do servidor
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      setThisDeviceOn(Boolean(sub && (d.devices ?? []).some((x: DeviceRow) => x.endpoint === sub.endpoint)));
    } catch {
      setThisDeviceOn(false);
    }
  }, []);

  useEffect(() => {
    const ok = typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    setSupported(ok);
    if (!ok) return;
    setPermission(Notification.permission);
    void load();
  }, [load]);

  async function enable() {
    setBusy(true);
    setMsg(null);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== 'granted') {
        setMsg('Permissão negada pelo navegador. Libere as notificações nas configurações do site e tente de novo.');
        return;
      }
      const { key } = await (await fetch('/api/push/key')).json();
      if (!key) {
        setMsg('O servidor ainda não tem as chaves de push configuradas.');
        return;
      }
      const reg = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      const sub = existing ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) }));
      const res = await fetch('/api/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'subscribe', subscription: sub.toJSON() }),
      });
      if (!res.ok) {
        setMsg((await res.json().catch(() => ({}))).error ?? 'Falha ao registrar o aparelho');
        return;
      }
      setMsg('Notificações ativadas neste aparelho ✓');
      await load();
    } catch (err) {
      setMsg(`Não foi possível ativar: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function disableThisDevice() {
    setBusy(true);
    setMsg(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch('/api/push', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'unsubscribe', endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setMsg('Notificações desativadas neste aparelho.');
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function post(body: Record<string, unknown>) {
    const res = await fetch('/api/push', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { ok: res.ok, data: await res.json().catch(() => ({})) };
  }

  async function test() {
    setBusy(true);
    setMsg(null);
    const { ok, data } = await post({ action: 'test' });
    setMsg(ok ? 'Teste enviado — deve aparecer na tela em instantes ✓' : (data.detail ?? data.error ?? 'Falha no teste'));
    setBusy(false);
  }

  async function togglePref(category: string, enabled: boolean) {
    setPrefs((p) => ({ ...p, [category]: enabled }));
    const { ok } = await post({ action: 'pref', category, enabled });
    if (!ok) setPrefs((p) => ({ ...p, [category]: !enabled }));
  }

  async function removeDevice(id: string) {
    setBusy(true);
    await post({ action: 'remove', id });
    await load();
    setBusy(false);
  }

  if (supported === null) return <p className="text-sm text-ink-500">Verificando o aparelho…</p>;

  if (!supported) {
    return (
      <p className="flex items-start gap-2 text-sm text-ink-500">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
        Este navegador não suporta notificações. No iPhone, abra o SGO pelo Safari e use <strong>Compartilhar → Adicionar à Tela de Início</strong>; depois abra pelo ícone e ative aqui.
      </p>
    );
  }

  const iosNeedsInstall = isIos() && !isStandalone();

  return (
    <div className="space-y-4">
      {!configured && (
        <p className="rounded-md bg-warning/10 p-2 text-sm text-warning">
          O servidor ainda não tem as chaves de push configuradas — avise o Administrador.
        </p>
      )}

      {iosNeedsInstall && (
        <p className="rounded-md bg-canvas p-2 text-sm text-ink-500">
          No iPhone/iPad é preciso instalar o app antes: <strong>Compartilhar → Adicionar à Tela de Início</strong>. Depois abra o SGO pelo ícone e volte aqui.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {thisDeviceOn ? (
          <>
            <span className="flex items-center gap-1.5 rounded-md bg-success/10 px-2 py-1 text-sm font-semibold text-success">
              <BellRing className="h-4 w-4" /> Ativas neste aparelho
            </span>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void test()}>
              <Send className="h-4 w-4" /> Enviar teste
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void disableThisDevice()}>
              <BellOff className="h-4 w-4" /> Desativar aqui
            </Button>
          </>
        ) : (
          <Button size="sm" disabled={busy || permission === 'denied'} onClick={() => void enable()}>
            <Bell className="h-4 w-4" /> Ativar notificações neste aparelho
          </Button>
        )}
      </div>

      {permission === 'denied' && (
        <p className="text-sm text-danger">
          As notificações estão <strong>bloqueadas</strong> para este site no navegador. Libere em Configurações do site → Notificações e recarregue a página.
        </p>
      )}

      {devices.length > 0 && (
        <div className="rounded-lg border bg-surface p-3">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-500">Meus aparelhos</p>
          <ul className="space-y-1.5">
            {devices.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="flex items-center gap-1.5">
                  <Smartphone className="h-4 w-4 text-ink-500" />
                  {d.deviceLabel}
                  <span className="text-xs text-ink-500">
                    · desde {new Date(d.createdAt).toLocaleDateString('pt-BR')}
                    {d.lastSuccessAt ? ` · último aviso ${new Date(d.lastSuccessAt).toLocaleDateString('pt-BR')}` : ''}
                  </span>
                </span>
                <button type="button" className="text-danger hover:underline" disabled={busy} onClick={() => void removeDevice(d.id)} aria-label="Remover aparelho">
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-lg border bg-surface p-3">
        <p className="mb-1 text-xs font-bold uppercase tracking-wide text-ink-500">O que quero receber no celular</p>
        <p className="mb-2 text-xs text-ink-500">Desmarcar não apaga nada — o aviso continua aparecendo no sino, só não vira notificação no aparelho. Avisos críticos são sempre enviados.</p>
        <ul className="space-y-2">
          {PUSH_CATEGORIES.map((c) => (
            <li key={c.key} className="flex items-start gap-2">
              <input
                id={`pref-${c.key}`}
                type="checkbox"
                className="mt-1 h-4 w-4 accent-brand"
                checked={prefs[c.key] ?? true}
                onChange={(e) => void togglePref(c.key, e.target.checked)}
              />
              <label htmlFor={`pref-${c.key}`} className="text-sm">
                <span className="font-semibold">{c.label}</span>
                <span className="block text-xs text-ink-500">{c.hint}</span>
              </label>
            </li>
          ))}
        </ul>
      </div>

      {msg && <p className={`text-sm font-semibold ${msg.includes('✓') ? 'text-success' : 'text-danger'}`}>{msg}</p>}
    </div>
  );
}
