'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { BellRing, Volume2, VolumeX, X } from 'lucide-react';

/**
 * ALERTA DO BANHEIRO no SGO aberto (v1.156.0) — o "apito" que o Pedro pediu.
 *
 * Duas entradas, o mesmo efeito (som PRÓPRIO + vibração + faixa na tela):
 *  1. o service worker repassa o push do banheiro para as abas abertas
 *     (instantâneo quando o push está ativo no aparelho);
 *  2. uma checagem leve a cada 20s em /api/higiene/manage/alertas (funciona
 *     mesmo sem push configurado).
 * O som é sintetizado aqui (Web Audio) — três toques subindo, duas vezes —
 * para não depender de arquivo e ser diferente de qualquer outro aviso.
 * Navegador só toca som depois do PRIMEIRO toque na página: o contexto de áudio
 * é destravado no primeiro clique. Mudo por aparelho (localStorage, com try).
 */
const CHAVE_MUDO = 'sgo-alerta-higiene-mudo';
const INTERVALO_MS = 20_000;

type Aviso = { id: string; unidade: string; banheiro: string; motivo: string | null };

export function AlertaHigiene() {
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [mudo, setMudo] = useState(false);
  const desde = useRef<string>(new Date().toISOString());
  const vistos = useRef<Set<string>>(new Set());
  const audio = useRef<AudioContext | null>(null);

  useEffect(() => {
    try { setMudo(localStorage.getItem(CHAVE_MUDO) === '1'); } catch { /* sem armazenamento: segue com som */ }
    const destravar = () => {
      try {
        const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (Ctx && !audio.current) audio.current = new Ctx();
        void audio.current?.resume();
      } catch { /* sem áudio */ }
    };
    window.addEventListener('pointerdown', destravar, { once: true });
    window.addEventListener('keydown', destravar, { once: true });
    return () => { window.removeEventListener('pointerdown', destravar); window.removeEventListener('keydown', destravar); };
  }, []);

  const tocar = useCallback(() => {
    if (mudo) return;
    try { navigator.vibrate?.([400, 120, 400, 120, 700]); } catch { /* sem vibração */ }
    const ctx = audio.current;
    if (!ctx) return;
    const t0 = ctx.currentTime + 0.05;
    const notas = [880, 1175, 1568]; // lá, ré, sol — três toques subindo
    for (let rep = 0; rep < 2; rep++) {
      notas.forEach((f, i) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'triangle';
        o.frequency.value = f;
        const ini = t0 + rep * 0.9 + i * 0.18;
        g.gain.setValueAtTime(0.0001, ini);
        g.gain.exponentialRampToValueAtTime(0.35, ini + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, ini + 0.16);
        o.connect(g).connect(ctx.destination);
        o.start(ini);
        o.stop(ini + 0.18);
      });
    }
  }, [mudo]);

  const receber = useCallback((novos: Aviso[]) => {
    const ineditos = novos.filter((a) => !vistos.current.has(a.id));
    if (!ineditos.length) return;
    ineditos.forEach((a) => vistos.current.add(a.id));
    setAvisos((xs) => [...ineditos, ...xs].slice(0, 5));
    tocar();
  }, [tocar]);

  /* 2) checagem leve */
  const checar = useCallback(async () => {
    try {
      const r = await fetch(`/api/higiene/manage/alertas?desde=${encodeURIComponent(desde.current)}`, { cache: 'no-store' });
      if (!r.ok) return;
      const d = (await r.json()) as { avisos: (Aviso & { em: string })[]; agora: string };
      if (d.avisos.length) receber(d.avisos);
      desde.current = d.agora;
    } catch { /* sem rede: tenta na próxima */ }
  }, [receber]);

  /* 1) push repassado pelo service worker */
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const onMsg = (e: MessageEvent) => {
      if (e.data?.tipo === 'sgo-alerta' && e.data.alerta === 'higiene') {
        void checar(); // busca os detalhes (e marca como visto) — o som toca uma vez só
      }
    };
    navigator.serviceWorker.addEventListener('message', onMsg);
    return () => navigator.serviceWorker.removeEventListener('message', onMsg);
  }, [checar]);

  useEffect(() => {
    /* Checa também com a aba em segundo plano (o navegador só a desacelera): o
       gerente com o SGO numa aba de fundo no computador precisa ouvir o apito. */
    const id = window.setInterval(() => { void checar(); }, INTERVALO_MS);
    const onVis = () => { if (document.visibilityState === 'visible') void checar(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { window.clearInterval(id); document.removeEventListener('visibilitychange', onVis); };
  }, [checar]);

  function alternarMudo() {
    const v = !mudo;
    setMudo(v);
    try { localStorage.setItem(CHAVE_MUDO, v ? '1' : '0'); } catch { /* ignora */ }
  }

  if (!avisos.length) return null;
  return (
    <div className="fixed inset-x-4 top-24 z-50 mx-auto max-w-md space-y-2 print:hidden" role="alert" aria-live="assertive" data-testid="alerta-higiene">
      {avisos.map((a) => (
        <div key={a.id} className="flex items-start gap-3 rounded-card border-2 border-danger bg-surface p-3 shadow-sgo-pop">
          <BellRing className="mt-0.5 h-5 w-5 shrink-0 animate-pulse text-danger" />
          <div className="min-w-0 flex-1">
            <p className="font-bold text-ink-900">Banheiro {a.banheiro}: {a.motivo ?? 'precisa de atenção'}</p>
            <p className="text-xs text-ink-500">{a.unidade} · cliente avisou pelo QR agora</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Link href="/modulos/higiene" className="sgo-btn sgo-btn--sm sgo-btn--primary" onClick={() => setAvisos((xs) => xs.filter((x) => x.id !== a.id))}>Ver</Link>
              <button type="button" className="sgo-btn sgo-btn--sm" onClick={alternarMudo} aria-pressed={mudo}>{mudo ? <><VolumeX className="h-3.5 w-3.5" /> Som desligado</> : <><Volume2 className="h-3.5 w-3.5" /> Som ligado</>}</button>
            </div>
          </div>
          <button type="button" aria-label="Fechar aviso" className="sgo-btn sgo-btn--icon sgo-btn--ghost" onClick={() => setAvisos((xs) => xs.filter((x) => x.id !== a.id))}><X className="h-4 w-4" /></button>
        </div>
      ))}
    </div>
  );
}
