/* eslint-disable no-undef */
/**
 * Service Worker do SGO Beija Flor.
 * Responsabilidades: (1) receber Web Push e mostrar a notificação do sistema;
 * (2) abrir a tela certa ao tocar na notificação; (3) renovar a inscrição quando
 * o navegador a rotaciona. NÃO faz cache offline — a rede é sempre a fonte
 * (evita servir tela velha, lição do deploy de imagem antiga).
 */

const VERSION = 'sgo-sw-v2';

/* Alerta do BANHEIRO (v1.156.0): vibração longa e diferente das demais, para o
   gerente reconhecer sem olhar. O SOM da notificação do sistema é o do
   aparelho/navegador (a Web Push não deixa trocar); com o SGO aberto, a página
   toca um som próprio — o SW avisa as abas abertas por mensagem. */
const VIBRA_HIGIENE = [500, 150, 500, 150, 500, 150, 900];

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
  const higiene = data.alerta === 'higiene';
  const options = {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/badge-96.png',
    lang: 'pt-BR',
    tag: data.tag || undefined,
    renotify: Boolean(data.tag),
    requireInteraction: higiene || Boolean(data.critical),
    vibrate: higiene ? VIBRA_HIGIENE : data.critical ? [200, 100, 200] : [120],
    silent: false,
    timestamp: data.at || Date.now(),
    data: { link: data.link || '/notificacoes' },
  };
  const avisaAbas = higiene
    ? self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => list.forEach((c) => c.postMessage({ tipo: 'sgo-alerta', alerta: 'higiene', title, body: options.body, link: options.data.link })))
    : Promise.resolve();
  event.waitUntil(Promise.all([self.registration.showNotification(title, options), avisaAbas]));
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
