/* eslint-disable no-undef */
/**
 * Service Worker do SGO Beija Flor.
 * Responsabilidades: (1) receber Web Push e mostrar a notificação do sistema;
 * (2) abrir a tela certa ao tocar na notificação; (3) renovar a inscrição quando
 * o navegador a rotaciona. NÃO faz cache offline — a rede é sempre a fonte
 * (evita servir tela velha, lição do deploy de imagem antiga).
 */

const VERSION = 'sgo-sw-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Chrome só considera o app instalável se o SW tratar 'fetch'. Passa direto pra rede.
self.addEventListener('fetch', () => {});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'SGO Beija Flor', body: event.data ? event.data.text() : '' };
  }

  const title = data.title || 'SGO Beija Flor';
  const options = {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/badge-96.png',
    lang: 'pt-BR',
    tag: data.tag || undefined,
    renotify: Boolean(data.tag),
    requireInteraction: Boolean(data.critical),
    vibrate: data.critical ? [200, 100, 200] : [120],
    timestamp: data.at || Date.now(),
    data: { link: data.link || '/notificacoes' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || '/notificacoes';
  const url = new URL(link, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        // já tem o SGO aberto: navega nessa aba em vez de abrir outra
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          return client.focus().then((c) => ('navigate' in c ? c.navigate(url) : c));
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});

// O navegador pode rotacionar a inscrição; reinscreve e avisa o servidor.
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const res = await fetch('/api/push/key');
        const { key } = await res.json();
        if (!key) return;
        const sub = await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: key,
        });
        await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subscription: sub.toJSON(), renewed: true }),
        });
      } catch (err) {
        console.error('[sw] falha ao renovar inscrição', VERSION, err);
      }
    })(),
  );
});
