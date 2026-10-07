'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, BellRing, Sparkles, Volume2, VolumeX, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  avisoComSom, avisosNovos, deveAvisarNaAba, somDoAviso,
  DURACAO_NA_TELA_MS, VIBRACAO, VIBRACAO_HIGIENE, type NivelDoAviso,
} from '@/lib/notifications/nivel';

/**
 * AVISO AO VIVO NO TOPO DA TELA (v1.158.0) — "como no WhatsApp", para todos os
 * perfis. Substitui o aviso exclusivo da Higiene (v1.156.0), que agora é um caso
 * deste: o mesmo aviso não pode tocar duas vezes.
 *
 * De onde vem: a checagem leve a cada 20s em /api/notifications/novas (funciona
 * sem push) e o service worker, que com o SGO VISÍVEL entrega o push à página
 * em vez de mostrar a notificação do sistema (ver public/sw.js).
 *
 * Sem duplicidade:
 *  - cada aviso tem id; a aba lembra o que já mostrou, e as outras abas do mesmo
 *    aparelho também (lista curta no localStorage);
 *  - aba escondida num aparelho COM push fica calada (quem avisa é o sistema).
 *
 * Som: só a higiene toca (decisão do Pedro, 07/10/2026). Navegador só toca som
 * depois do primeiro toque na página — o áudio é destravado nesse toque.
 * Nada aqui troca de página sozinho: só o clique no aviso abre o conteúdo.
 */
interface Aviso {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  module: string | null;
  nivel: NivelDoAviso;
  createdAt: string;
}

const INTERVALO_MS = 20_000;
const CHAVE_MUDO = 'sgo-som-avisos-mudo';
const CHAVE_MUDO_ANTIGA = 'sgo-alerta-higiene-mudo';
const CHAVE_VISTOS = 'sgo-avisos-vistos';
const MAX_NA_TELA = 3;

function lerVistosDoAparelho(): string[] {
  try { return JSON.parse(localStorage.getItem(CHAVE_VISTOS) ?? '[]') as string[]; } catch { return []; }
}
/** Marca no aparelho (vale para as outras abas). Devolve false se outra aba já mostrou. */
function reservarNoAparelho(id: string): boolean {
  try {
    const lista = lerVistosDoAparelho();
    if (lista.includes(id)) return false;
    localStorage.setItem(CHAVE_VISTOS, JSON.stringify([id, ...lista].slice(0, 60)));
  } catch { /* sem armazenamento: vale só a memória desta aba */ }
  return true;
}

export function AvisosAoVivo() {
  const router = useRouter();
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [mudo, setMudo] = useState(false);
  const desde = useRef<string>(new Date(Date.now() - 30_000).toISOString());
  const vistos = useRef<Set<string>>(new Set());
  const audio = useRef<AudioContext | null>(null);
  const comPush = useRef(false);
  const timers = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    try { setMudo(localStorage.getItem(CHAVE_MUDO) === '1' || localStorage.getItem(CHAVE_MUDO_ANTIGA) === '1'); } catch { /* segue com som */ }
    const destravar = () => {
      try {
        const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (Ctx && !audio.current) audio.current = new Ctx();
        void audio.current?.resume();
      } catch { /* sem áudio */ }
    };
    window.addEventListener('pointerdown', destravar, { once: true });
    window.addEventListener('keydown', destravar, { once: true });
    // Este aparelho recebe push? Então aba escondida fica calada.
    void (async () => {
      try {
        if (!('serviceWorker' in navigator) || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
        const reg = await navigator.serviceWorker.getRegistration();
        comPush.current = Boolean(await reg?.pushManager.getSubscription());
      } catch { comPush.current = false; }
    })();
    const ts = timers.current;
    return () => {
      window.removeEventListener('pointerdown', destravar);
      window.removeEventListener('keydown', destravar);
      ts.forEach((t) => window.clearTimeout(t));
    };
  }, []);

  const tirar = useCallback((id: string) => {
    setAvisos((xs) => xs.filter((x) => x.id !== id));
    const t = timers.current.get(id);
    if (t) { window.clearTimeout(t); timers.current.delete(id); }
  }, []);

  const tocar = useCallback(() => {
    const ctx = audio.current;
    if (!ctx) return;
    const { notas, volume } = somDoAviso();
    const t0 = ctx.currentTime + 0.05;
    for (const n of notas) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = n.freq;
      const ini = t0 + n.inicio;
      g.gain.setValueAtTime(0.0001, ini);
      g.gain.exponentialRampToValueAtTime(volume, ini + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ini + n.duracao);
      o.connect(g).connect(ctx.destination);
      o.start(ini);
      o.stop(ini + n.duracao + 0.02);
    }
  }, []);

  const checar = useCallback(async (opts: { semSom?: boolean } = {}) => {
    try {
      const r = await fetch(`/api/notifications/novas?desde=${encodeURIComponent(desde.current)}`, { cache: 'no-store' });
      if (!r.ok) return;
      const d = (await r.json()) as { avisos: Aviso[]; agora: string };
      desde.current = d.agora;
      const novos = avisosNovos(d.avisos, vistos.current);
      if (!novos.length) return;
      novos.forEach((a) => vistos.current.add(a.id));
      window.dispatchEvent(new CustomEvent('sgo-avisos-novos', { detail: novos.length })); // o sino atualiza o número
      const visivel = document.visibilityState === 'visible';
      if (!deveAvisarNaAba(visivel, comPush.current)) return;
      const daAba = novos.filter((a) => reservarNoAparelho(a.id));
      if (!daAba.length) return;

      setAvisos((xs) => [...daAba.reverse(), ...xs].slice(0, MAX_NA_TELA));
      for (const a of daAba) {
        // a higiene fica até alguém tocar; os demais saem sozinhos
        if (!avisoComSom(a)) timers.current.set(a.id, window.setTimeout(() => tirar(a.id), DURACAO_NA_TELA_MS[a.nivel]));
      }
      const higiene = daAba.some((a) => avisoComSom(a));
      let mudoAgora = false;
      try { mudoAgora = localStorage.getItem(CHAVE_MUDO) === '1'; } catch { /* ignora */ }
      if (higiene && !opts.semSom && !mudoAgora) tocar();
      const vib = higiene ? VIBRACAO_HIGIENE : daAba.map((a) => VIBRACAO[a.nivel]).find(Boolean);
      if (vib) { try { navigator.vibrate?.(vib); } catch { /* sem vibração */ } }
    } catch { /* sem rede: tenta na próxima */ }
  }, [tirar, tocar]);

  /* O service worker entrega o push quando o SGO está visível. */
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const onMsg = (e: MessageEvent) => {
      if (e.data?.tipo === 'sgo-notificacao') void checar({ semSom: Boolean(e.data.sistemaMostrou) });
    };
    navigator.serviceWorker.addEventListener('message', onMsg);
    return () => navigator.serviceWorker.removeEventListener('message', onMsg);
  }, [checar]);

  useEffect(() => {
    void checar();
    const id = window.setInterval(() => { void checar(); }, INTERVALO_MS);
    const onVis = () => { if (document.visibilityState === 'visible') void checar(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { window.clearInterval(id); document.removeEventListener('visibilitychange', onVis); };
  }, [checar]);

  function alternarMudo() {
    const v = !mudo;
    setMudo(v);
    try { localStorage.setItem(CHAVE_MUDO, v ? '1' : '0'); localStorage.removeItem(CHAVE_MUDO_ANTIGA); } catch { /* ignora */ }
  }

  function abrir(a: Aviso) {
    tirar(a.id);
    void fetch('/api/notifications/read', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: a.id }) }).catch(() => {});
    window.dispatchEvent(new CustomEvent('sgo-avisos-novos', { detail: 0 }));
    router.push(a.link || '/notificacoes');
  }

  if (!avisos.length) return null;
  return (
    <div
      className="pointer-events-none fixed inset-x-4 top-24 mx-auto flex max-w-md flex-col gap-2 print:hidden"
      style={{ zIndex: 'var(--sgo-z-toast)' as unknown as number }}
      aria-live="polite"
      data-testid="avisos-ao-vivo"
    >
      {avisos.map((a) => {
        const destaque = avisoComSom(a) || a.nivel === 'CRITICO';
        const Icone = avisoComSom(a) ? BellRing : a.nivel === 'IMPORTANTE' ? Sparkles : Bell;
        return (
          <div
            key={a.id}
            role={destaque ? 'alert' : 'status'}
            data-testid={`aviso-${a.nivel.toLowerCase()}`}
            className={cn(
              'pointer-events-auto flex items-start gap-3 rounded-card border bg-surface shadow-sgo-pop',
              destaque ? 'sgo-aviso-destaque border-brand border-l-4 p-4' : 'sgo-aviso-enter border-line p-3',
            )}
          >
            <span className={cn('flex shrink-0 items-center justify-center rounded-full', destaque ? 'h-10 w-10 bg-brand text-on-brand' : 'h-8 w-8 bg-brand-tint text-brand')} aria-hidden>
              <Icone className={destaque ? 'h-5 w-5' : 'h-4 w-4'} />
            </span>
            <button type="button" className="min-w-0 flex-1 text-left" onClick={() => abrir(a)}>
              <p className={cn('font-bold text-ink-900', destaque ? 'text-base' : 'text-sm')}>{a.title}</p>
              {a.body && <p className="mt-0.5 text-sm text-ink-700">{a.body}</p>}
              <p className="mt-1 text-xs font-semibold text-brand">Toque para abrir</p>
            </button>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <button type="button" aria-label="Fechar aviso" className="sgo-btn sgo-btn--icon sgo-btn--ghost" onClick={() => tirar(a.id)}><X className="h-4 w-4" /></button>
              {avisoComSom(a) && (
                <button type="button" className="sgo-btn sgo-btn--icon sgo-btn--ghost" onClick={alternarMudo} aria-pressed={mudo} aria-label={mudo ? 'Ligar o som dos avisos' : 'Desligar o som dos avisos'} title={mudo ? 'Som desligado' : 'Som ligado'}>
                  {mudo ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
