'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, Check, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NavBadge } from '@/components/sgo/nav-badge';
import { tempoRelativo } from '@/lib/nav/tempo-relativo';

export interface AvisoDaBarra {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  critical: boolean;
  createdAt: string;
}

interface Pagina { itens: AvisoDaBarra[]; proximoCursor: string | null; temMais: boolean; naoLidas: number }

const ICONE_18 = { width: 18, height: 18 } as const;
/** O kit atualiza os contadores a cada 120s; o sino aqui também. */
const INTERVALO_MS = 120_000;

/**
 * SINO da barra (kit de layout, 2-moldura/NotificationsDropdown.tsx): selo com
 * os não lidos (teto 9+), painel de 380px com a lista paginada, "Marcar todas
 * como lidas", marcar/apagar por item e "Carregar mais". Clicar num aviso com
 * link marca lido e navega. A página /notificacoes continua existindo.
 *
 * Adaptação: o kit recebe tempo real por WebSocket; aqui o contador é
 * consultado a cada 2 minutos (divergência registrada da Fase 2).
 */
export function NotificationsDropdown({ inicial = 0 }: { inicial?: number }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [naoLidas, setNaoLidas] = useState(inicial);
  const [itens, setItens] = useState<AvisoDaBarra[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [temMais, setTemMais] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);

  const carregar = useCallback(async (apos?: string | null) => {
    setCarregando(true);
    try {
      const r = await fetch(`/api/notifications?limit=20${apos ? `&cursor=${encodeURIComponent(apos)}` : ''}`, { cache: 'no-store' });
      if (!r.ok) return;
      const p = (await r.json()) as Pagina;
      setItens((atual) => (apos ? [...atual, ...p.itens] : p.itens));
      setCursor(p.proximoCursor);
      setTemMais(p.temMais);
      setNaoLidas(p.naoLidas);
    } catch { /* sem rede: fica o que está */ } finally { setCarregando(false); }
  }, []);

  useEffect(() => { if (aberto) void carregar(null); }, [aberto, carregar]);

  useEffect(() => {
    const tick = async () => {
      try {
        const r = await fetch('/api/notifications?limit=1', { cache: 'no-store' });
        if (r.ok) setNaoLidas(((await r.json()) as Pagina).naoLidas);
      } catch { /* ignora */ }
    };
    const id = window.setInterval(tick, INTERVALO_MS);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!aberto) return;
    const onDown = (e: MouseEvent) => { if (raiz.current && !raiz.current.contains(e.target as Node)) setAberto(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [aberto]);

  async function marcarLida(id: string) {
    setItens((xs) => xs.map((n) => (n.id === id ? { ...n, read: true } : n)));
    setNaoLidas((n) => Math.max(0, n - 1));
    await fetch('/api/notifications/read', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) }).catch(() => {});
  }
  async function marcarTodas() {
    setItens((xs) => xs.map((n) => ({ ...n, read: true })));
    setNaoLidas(0);
    await fetch('/api/notifications/read', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ all: true }) }).catch(() => {});
    router.refresh();
  }
  async function apagar(id: string) {
    const alvo = itens.find((n) => n.id === id);
    setItens((xs) => xs.filter((n) => n.id !== id));
    if (alvo && !alvo.read) setNaoLidas((n) => Math.max(0, n - 1));
    await fetch(`/api/notifications/${id}`, { method: 'DELETE' }).catch(() => {});
  }
  function abrir(n: AvisoDaBarra) {
    if (!n.read) void marcarLida(n.id);
    setAberto(false);
    if (n.link) router.push(n.link);
  }

  return (
    <div ref={raiz} className="relative">
      <button type="button" className="sgo-naviconbtn" onClick={() => setAberto((v) => !v)} aria-label={naoLidas ? `Notificações: ${naoLidas} não lida(s)` : 'Notificações'} aria-haspopup="menu" aria-expanded={aberto} data-testid="button-notifications">
        <span className="sgo-navitem__ic"><Bell style={ICONE_18} /><NavBadge count={naoLidas} cap={9} /></span>
      </button>
      {aberto && (
        <div className="sgo-panel sgo-panel--solid sgo-navpanel-enter absolute right-0 top-[calc(100%+10px)] max-w-[calc(100vw-32px)] overflow-hidden" style={{ width: 380, zIndex: 'var(--sgo-z-dropdown)' as unknown as number, boxShadow: 'var(--sgo-sh-pop)', color: 'var(--sgo-ink)' }} data-testid="notifications-panel">
          <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: '1px solid var(--sgo-hair)' }}>
            <span className="sgo-row__title">Notificações</span>
            {naoLidas > 0 && (
              <button type="button" className="sgo-btn sgo-btn--sm sgo-btn--ghost" onClick={marcarTodas}><Check className="h-3 w-3" /> Marcar todas como lidas</button>
            )}
          </div>
          <div className="max-h-[400px] overflow-y-auto">
            {itens.length === 0 && !carregando && (
              <div className="flex flex-col items-center py-8" style={{ color: 'var(--sgo-ink-3)' }}>
                <Bell className="h-5 w-5 opacity-50" />
                <span className="mt-2 text-xs">Nenhuma notificação</span>
              </div>
            )}
            {itens.map((n) => (
              <div key={n.id} className={cn('flex items-start gap-2 px-3 py-3', !n.read && 'bg-[var(--sgo-accent-soft)]')} style={{ borderBottom: '1px solid var(--sgo-hair)' }}>
                <button type="button" onClick={() => abrir(n)} className="min-w-0 flex-1 text-left">
                  <p className={cn('line-clamp-1 text-sm', n.read ? 'font-medium' : 'font-semibold')}>{n.critical ? '⚠ ' : ''}{n.title}</p>
                  {n.body && <p className="mt-0.5 line-clamp-2 text-xs" style={{ color: 'var(--sgo-ink-2)' }}>{n.body}</p>}
                  <p className="mt-1 text-[11px]" style={{ color: 'var(--sgo-ink-3)' }}>{tempoRelativo(n.createdAt)}</p>
                </button>
                <div className="flex shrink-0 items-center gap-0.5">
                  {!n.read && (
                    <button type="button" className="sgo-btn sgo-btn--icon sgo-btn--ghost h-6 w-6" onClick={() => marcarLida(n.id)} aria-label="Marcar como lida"><Check className="h-3.5 w-3.5" /></button>
                  )}
                  <button type="button" className="sgo-btn sgo-btn--icon sgo-btn--ghost h-6 w-6" onClick={() => apagar(n.id)} aria-label="Apagar"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            ))}
            {temMais && (
              <button type="button" disabled={carregando} onClick={() => carregar(cursor)} className="w-full py-2.5 text-xs font-medium hover:bg-[var(--sgo-panel-2)]" style={{ color: 'var(--sgo-accent)' }}>
                {carregando ? 'Carregando…' : 'Carregar mais'}
              </button>
            )}
          </div>
          <div className="px-3 py-2 text-right" style={{ borderTop: '1px solid var(--sgo-hair)' }}>
            <Link href="/notificacoes" onClick={() => setAberto(false)} className="text-xs font-semibold" style={{ color: 'var(--sgo-accent)' }}>Ver todas</Link>
          </div>
        </div>
      )}
    </div>
  );
}
