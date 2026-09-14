'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, X, CircleSlash, Flag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/ds/sheet';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

export interface SessaoNaTela {
  id: string;
  unitName: string;
  tipo: string;
  metodo: string;
  iniciadaEm: string;
  responsavel: string | null;
  escopo: number[];
  conferidas: number[];
  emUso: number[];
  faltando: number[];
  pct: number;
}

type Estado = 'CONFERIDA' | 'EM_USO' | 'LIMPA';

/* Os três estados da grade, no mesmo vocabulário de cor que a tela antiga usava. */
const CLASSE: Record<Estado, string> = {
  CONFERIDA: 'bg-success text-on-brand border-success',
  EM_USO: 'bg-info text-on-brand border-info',
  LIMPA: 'border-line-strong text-ink-500',
};

/**
 * A conferência EM ANDAMENTO.
 *
 * O que esta tela nunca faz: mostrar marca que não é desta sessão. Era o
 * defeito de origem — a grade reabria com o que outra contagem tinha marcado, e
 * a tela precisava avisar *"as marcas são da contagem de 03/09, não de hoje"*.
 * Aqui a sessão é a dona das marcas, e sessão nova nasce vazia.
 */
export function SessaoClient({ sessao, podeEditar }: { sessao: SessaoNaTela; podeEditar: boolean }) {
  const router = useRouter();
  const [conferidas, setConferidas] = useState<Set<number>>(new Set(sessao.conferidas));
  const [emUso, setEmUso] = useState<Set<number>>(new Set(sessao.emUso));
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [fechando, setFechando] = useState(false);
  const [observacao, setObservacao] = useState('');

  const estadoDe = (n: number): Estado => (conferidas.has(n) ? 'CONFERIDA' : emUso.has(n) ? 'EM_USO' : 'LIMPA');
  const vistas = conferidas.size + emUso.size;
  const faltando = sessao.escopo.filter((n) => !conferidas.has(n) && !emUso.has(n));
  const pct = sessao.escopo.length === 0 ? 0 : Math.round((vistas / sessao.escopo.length) * 100);

  /* Um toque = conferida, dois = em uso, três = limpa. É o gesto que a grade
     antiga já tinha, mantido de propósito: quem confere 651 comandas por noite
     não pode reaprender o toque. */
  function proximo(atual: Estado): Estado {
    return atual === 'LIMPA' ? 'CONFERIDA' : atual === 'CONFERIDA' ? 'EM_USO' : 'LIMPA';
  }

  async function tocar(n: number) {
    if (!podeEditar || busy) return;
    const alvo = proximo(estadoDe(n));
    setErro(null); setAviso(null);

    /* Otimista: a grade responde ao toque na hora. 651 toques esperando o
       servidor um a um seria inutilizável no celular do caixa. */
    const antesC = new Set(conferidas); const antesU = new Set(emUso);
    const c = new Set(conferidas); const u = new Set(emUso);
    c.delete(n); u.delete(n);
    if (alvo === 'CONFERIDA') c.add(n);
    if (alvo === 'EM_USO') u.add(n);
    setConferidas(c); setEmUso(u);

    const res = await fetch('/api/commands/session', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'marcar', sessionId: sessao.id, number: n, state: alvo === 'LIMPA' ? null : alvo, method: 'MANUAL' }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setConferidas(antesC); setEmUso(antesU); // desfaz: o servidor é a verdade
      setErro(d.error ?? 'Não foi possível marcar.');
    }
  }

  function marcarFaixa(estado: Estado) {
    if (!podeEditar) return;
    void (async () => {
      setBusy(true); setErro(null);
      try {
        for (const n of sessao.escopo) {
          const atual = estadoDe(n);
          if (atual === estado) continue;
          await tocarDireto(n, estado);
        }
        router.refresh();
      } finally { setBusy(false); }
    })();
  }

  async function tocarDireto(n: number, estado: Estado) {
    const c = new Set(conferidas); const u = new Set(emUso);
    c.delete(n); u.delete(n);
    if (estado === 'CONFERIDA') c.add(n);
    if (estado === 'EM_USO') u.add(n);
    setConferidas(c); setEmUso(u);
    await fetch('/api/commands/session', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'marcar', sessionId: sessao.id, number: n, state: estado === 'LIMPA' ? null : estado, method: 'MANUAL' }),
    });
  }

  async function finalizar() {
    setBusy(true); setErro(null);
    try {
      const res = await fetch('/api/commands/session', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'finalizar', sessionId: sessao.id, observation: observacao }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) { router.push(`/modulos/comandas/conferencias/${sessao.id}`); router.refresh(); return; }
      setErro(d.error ?? 'Não foi possível finalizar.');
    } finally { setBusy(false); }
  }

  async function cancelar() {
    if (!confirm('Cancelar esta conferência? O que foi marcado até aqui fica no histórico, mas nada será apurado.')) return;
    setBusy(true);
    try {
      await fetch('/api/commands/session', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancelar', sessionId: sessao.id }),
      });
      router.push('/modulos/comandas');
      router.refresh();
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-4">
      {/* ── O progresso, sempre à vista ── */}
      <div className="rounded-lg border-2 border-brand/30 bg-brand/5 p-3">
        <p className="text-sm font-bold text-ink-900">Conferência em andamento</p>
        <p className="text-xs text-ink-700">
          {sessao.tipo} · {sessao.metodo} · iniciada em {sessao.iniciadaEm}
          {sessao.responsavel ? ` por ${sessao.responsavel}` : ''}
        </p>
        <p className="mt-2 text-2xl font-bold tabular-nums text-ink-900">
          {vistas} de {sessao.escopo.length} conferidas — {pct}%
        </p>
        <p className="text-sm font-semibold text-danger">Faltam: {faltando.length}</p>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-sunken">
          <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* ── Legenda ── */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 rounded-lg border border-dashed p-2 text-xs text-ink-700">
        <span className="flex items-center gap-1.5"><i className="inline-block h-3 w-3 rounded bg-success" /> Conferida</span>
        <span className="flex items-center gap-1.5"><i className="inline-block h-3 w-3 rounded bg-info" /> Em uso (conta como presente)</span>
        <span className="flex items-center gap-1.5"><i className="inline-block h-3 w-3 rounded border border-line-strong" /> Não conferida</span>
      </div>

      {podeEditar && (
        <div className="flex flex-wrap gap-2 print:hidden">
          <Button size="sm" variant="outline" disabled={busy} onClick={() => marcarFaixa('CONFERIDA')}>
            <Check className="h-4 w-4" /> Marcar todas
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => marcarFaixa('LIMPA')}>
            <CircleSlash className="h-4 w-4" /> Limpar
          </Button>
        </div>
      )}

      {erro && <p className="text-sm font-medium text-danger">{erro}</p>}
      {aviso && <p className="text-sm font-medium text-warning">{aviso}</p>}

      {/* ── A grade ── */}
      <div className="flex flex-wrap gap-1">
        {sessao.escopo.map((n) => {
          const e = estadoDe(n);
          return (
            <button
              key={n}
              type="button"
              disabled={!podeEditar}
              onClick={() => void tocar(n)}
              className={`h-9 w-11 rounded-md border text-xs font-semibold tabular-nums ${CLASSE[e]}`}
            >
              {n}
            </button>
          );
        })}
      </div>

      {podeEditar && (
        <div className="sticky bottom-0 -mx-4 border-t border-line bg-surface px-4 py-3 print:hidden">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={busy} onClick={() => { setObservacao(''); setFechando(true); }}>
              <Flag className="h-4 w-4" /> Finalizar conferência
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void cancelar()}>
              <X className="h-4 w-4" /> Cancelar
            </Button>
          </div>
        </div>
      )}

      {fechando && (
        <Sheet
          open onClose={() => setFechando(false)}
          title="Finalizar conferência"
          description={`${vistas} de ${sessao.escopo.length} comandas verificadas.`}
          footer={
            <div className="space-y-2">
              {erro && <p className="text-sm font-medium text-danger">{erro}</p>}
              <div className="flex flex-wrap gap-2">
                <Button size="sm" disabled={busy} onClick={() => void finalizar()}>
                  {busy ? 'Finalizando…' : faltando.length > 0 ? 'Finalizar e enviar para apuração' : 'Finalizar conferência'}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setFechando(false)}>Continuar conferindo</Button>
              </div>
            </div>
          }
        >
          <div className="space-y-3">
            {faltando.length === 0 ? (
              <p className="rounded-lg border border-success bg-success/10 p-2.5 text-sm text-success">
                Todas as {sessao.escopo.length} comandas foram verificadas. Deseja finalizar?
              </p>
            ) : (
              <>
                {/* As faltantes APARECEM antes de confirmar: o pedido era esse, e
                    o motivo é simples — quase sempre a comanda está ali e a
                    pessoa só não marcou. */}
                <p className="rounded-lg border border-warning bg-warning-bg p-2.5 text-sm text-warning">
                  <b>{vistas} de {sessao.escopo.length}</b> comandas foram verificadas. Existem{' '}
                  <b>{faltando.length}</b> não localizadas.
                </p>
                <div>
                  <Label className="text-xs">Não localizadas</Label>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {faltando.map((n) => (
                      <span key={n} className="rounded-md border border-warning px-2 py-1 text-xs font-semibold tabular-nums text-warning">{n}</span>
                    ))}
                  </div>
                </div>
                <p className="text-xs text-ink-700">
                  Elas <b>não viram &quot;perdidas&quot;</b> agora: entram <b>em apuração</b>. Perdida ou recuperada é
                  decisão de quem apura, depois.
                </p>
                <div>
                  <Label className="text-xs">O que houve? (obrigatório)</Label>
                  <Input value={observacao} onChange={(e) => setObservacao(e.target.value)} className="h-9 text-sm" placeholder="ex.: faltaram duas no caixa 2" />
                </div>
              </>
            )}
          </div>
        </Sheet>
      )}
    </div>
  );
}
