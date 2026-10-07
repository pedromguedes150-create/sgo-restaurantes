/* eslint-disable no-undef */
/**
 * Service Worker do SGO Beija Flor.
 * Responsabilidades: (1) receber Web Push e mostrar a notificação do sistema;
 * (2) abrir a tela certa ao tocar na notificação; (3) renovar a inscrição quando
 * o navegador a rotaciona. NÃO faz cache offline — a rede é sempre a fonte
 * (evita servir tela velha, lição do deploy de imagem antiga).
 */

const VERSION = 'sgo-sw-v3';

/* Alerta do BANHEIRO (v1.156.0): vibração longa e diferente das demais, para o
   gerente reconhecer sem olhar. */
const VIBRA_HIGIENE = [500, 150, 500, 150, 500, 150, 900];

/* Níveis do aviso (v1.158.0) — o mesmo de src/lib/notifications/nivel.ts.
   O SOM da notificação do sistema é o do aparelho (a Web Push não deixa trocar);
   o som próprio do SGO toca na página aberta. */
const VIBRACAO = { NORMAL: undefined, IMPORTANTE: [120], CRITICO: [200, 100, 200] };

/* Safari (iPhone/Mac) revoga a inscrição de quem recebe push sem mostrar
   notificação; lá a notificação do sistema sai SEMPRE, e a página só mostra o
   aviso, sem tocar de novo. */
const SAFARI = /Safari/.test(self.navigator.userAgent) && !/Chrome|Chromium|Android|Edg/.test(self.navigator.userAgent);

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
  const nivel = data.nivel || (data.critical ? 'CRITICO' : 'NORMAL');
  const link = data.link || '/notificacoes';
  const options = {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/badge-96.png',
    lang: 'pt-BR',
    tag: data.tag || undefined,
    renotify: Boolean(data.tag),
    requireInteraction: higiene || nivel === 'CRITICO',
    vibrate: higiene ? VIBRA_HIGIENE : VIBRACAO[nivel],
    silent: false,
    timestamp: data.at || Date.now(),
    data: { link },
  };

  /* PRIMEIRO PLANO × SEGUNDO PLANO (v1.158.0): com uma aba do SGO VISÍVEL, quem
     avisa é a página (aviso no topo + som próprio) e a notificação do sistema
     NÃO sai — senão o mesmo aviso tocaria duas vezes. Minimizado, outra aba ou
     tela bloqueada: notificação do sistema, como sempre. */
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const doSgo = list.filter((c) => c.url.startsWith(self.location.origin));
      const visiveis = doSgo.filter((c) => c.visibilityState === 'visible');
      const msg = { tipo: 'sgo-notificacao', nivel, title, body: options.body, link, sistemaMostrou: false };
      if (visiveis.length && !SAFARI) {
        visiveis.forEach((c) => c.postMessage(msg));
        return undefined;
      }
      msg.sistemaMostrou = true;
      doSgo.forEach((c) => c.postMessage(msg));
      return self.registration.showNotification(title, options);
    }),
  );
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
