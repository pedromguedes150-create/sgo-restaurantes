'use client';

import { useState, type ReactNode } from 'react';
import Image from 'next/image';
import { Accessibility, Baby, Check, ChevronRight, DoorOpen, Droplets, Loader2, MoreHorizontal, PenLine, ScrollText, Send, ShieldCheck, SprayCan, Star, Trash2, Wrench } from 'lucide-react';
import type { HYGIENE_ISSUES } from '@/lib/hygiene';

/**
 * Página do QR do banheiro (v1.156.0; visual v1.165.0). O cliente escolhe o
 * banheiro, marca o que está acontecendo e envia — a equipe é avisada na
 * hora. Pedido do Pedro (08/10/2026, mockup): "moderno porém fácil, porque é
 * o cliente que preenche; não altere a lógica atual". O que NÃO mudou: cada
 * motivo marcado vira UM aviso (`createHygieneRequest`, com a janela de
 * 5 min contra repetição e o alerta ao gerente/coordenador) — marcar dois
 * motivos é o mesmo que os dois toques de antes; `?loc=` já escolhe o
 * banheiro; a avaliação por estrelas fica DEPOIS do envio e é opcional.
 */
type Issue = (typeof HYGIENE_ISSUES)[number];
const MOTIVOS: { issue: Issue; rotulo: string; Icone: typeof SprayCan }[] = [
  { issue: 'Precisa de limpeza', rotulo: 'Precisa de limpeza', Icone: SprayCan },
  { issue: 'Falta papel', rotulo: 'Falta papel', Icone: ScrollText },
  { issue: 'Falta sabonete', rotulo: 'Falta sabonete', Icone: Droplets },
  { issue: 'Lixo cheio', rotulo: 'Lixo cheio', Icone: Trash2 },
  { issue: 'Necessita de manutenção', rotulo: 'Necessita de manutenção', Icone: Wrench },
  { issue: 'Outro', rotulo: 'Outro problema', Icone: MoreHorizontal },
];
export const LIMITE_OBSERVACAO = 200;

/** Pictogramas de banheiro (sem dependência): escolhidos pelo NOME cadastrado. */
function PictoFeminino({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <circle cx="12" cy="4" r="3" />
      <path d="M9.5 8h5l3 8h-2.5l1 7h-8l1-7H6.5z" />
    </svg>
  );
}
function PictoMasculino({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <circle cx="12" cy="4" r="3" />
      <path d="M8 8h8v8h-2v7h-1.5v-7h-1v7H10v-7H8z" />
    </svg>
  );
}
function PictoAcessivel({ className }: { className?: string }) { return <Accessibility className={className} />; }
function PictoFamilia({ className }: { className?: string }) { return <Baby className={className} />; }
function PictoPorta({ className }: { className?: string }) { return <DoorOpen className={className} />; }
export function iconeDoBanheiro(nome: string): (p: { className?: string }) => ReactNode {
  const n = nome.toLowerCase();
  if (n.includes('fem')) return PictoFeminino;
  if (n.includes('masc')) return PictoMasculino;
  if (n.includes('pcd') || n.includes('acess') || n.includes('defici')) return PictoAcessivel;
  if (n.includes('infant') || n.includes('fam') || n.includes('beb')) return PictoFamilia;
  return PictoPorta;
}

/** Cabeçalho em bordô com o beija-flor do sistema (a mesma arte da barra). */
export function HigieneCabecalho({ unidade, banheiro }: { unidade: string; banheiro?: string | null }) {
  return (
    <header className="relative overflow-hidden rounded-3xl bg-brand p-5 text-on-brand shadow-sgo-card sm:p-6" data-testid="higiene-cabecalho"
      style={{ backgroundImage: 'linear-gradient(135deg, var(--sgo-brand) 0%, var(--sgo-brand-active) 100%)' }}>
      <Image unoptimized src="/sgo-bird-only.png" alt="" aria-hidden width={160} height={160} className="pointer-events-none absolute -right-6 -top-6 h-40 w-40 opacity-10" style={{ filter: 'brightness(0) invert(1)' }} />
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center">
        <Image unoptimized src="/sgo-bird-only.png" alt="Beija Flor" width={80} height={80} className="h-16 w-16 shrink-0 sm:h-20 sm:w-20" style={{ filter: 'brightness(0) invert(1)' }} />
        <div className="min-w-0 flex-1">
          <p className="sgo-type-11 font-semibold uppercase tracking-wider opacity-80">Beija Flor</p>
          <h1 className="text-2xl font-bold leading-tight sm:text-3xl">Higienização do Local</h1>
          <p className="mt-1 text-sm opacity-90 sm:text-base">Nos ajude a manter um ambiente limpo, seguro e agradável para todos!</p>
          <p className="mt-1 text-xs opacity-80" data-testid="higiene-local">{unidade}{banheiro ? ` · ${banheiro}` : ''}</p>
        </div>
        <div className="flex items-center gap-2 rounded-2xl border border-on-brand/30 bg-on-brand/10 px-3 py-2 text-xs sm:max-w-44">
          <ShieldCheck className="h-6 w-6 shrink-0" />
          <span>Sua solicitação vai direto para a nossa equipe.</span>
        </div>
      </div>
    </header>
  );
}

function Passo({ numero, titulo, apoio, extra }: { numero: number; titulo: string; apoio?: string; extra?: ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-2">
      <h2 className="text-lg font-bold text-ink-900">{numero}. {titulo}{apoio && <span className="ml-1 text-base font-normal text-ink-500">{apoio}</span>}</h2>
      {extra && <span className="text-sm text-ink-500">{extra}</span>}
    </div>
  );
}

export function HygienePublicForm({ unitId, locations, preselect }: { unitId: string; locations: { id: string; name: string }[]; preselect: string | null }) {
  const inicial = preselect && locations.some((l) => l.id === preselect) ? preselect : locations.length === 1 ? locations[0].id : null;
  const [locationId, setLocationId] = useState<string | null>(inicial);
  const [marcados, setMarcados] = useState<Issue[]>([]);
  const [comment, setComment] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState<{ id: string; issues: string[] } | null>(null);
  const [rating, setRating] = useState(0);
  const [avaliado, setAvaliado] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const banheiro = locations.find((l) => l.id === locationId) ?? null;
  const escolheBanheiro = locations.length > 1;
  const precisaEscolher = locations.length > 0 && !locationId;
  const outroSemTexto = marcados.includes('Outro') && !comment.trim();
  const podeEnviar = !enviando && !precisaEscolher && marcados.length > 0 && !outroSemTexto;
  const passo = escolheBanheiro ? 2 : 1;

  function alternar(issue: Issue) {
    setErr(null);
    setMarcados((xs) => (xs.includes(issue) ? xs.filter((x) => x !== issue) : [...MOTIVOS.map((m) => m.issue).filter((i) => i === issue || xs.includes(i))]));
  }

  /* Um aviso por motivo marcado — a mesma gravação do toque único de antes. */
  async function enviar() {
    setErr(null);
    if (precisaEscolher) { setErr('Toque primeiro no banheiro.'); return; }
    if (!marcados.length) { setErr('Marque pelo menos um problema.'); return; }
    if (outroSemTexto) { setErr('Conte rapidamente o que aconteceu em Observações.'); return; }
    setEnviando(true);
    try {
      let primeiroId: string | null = null;
      for (const issue of marcados) {
        const res = await fetch('/api/higiene', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ unitId, locationId, issue, comment: comment.trim() || null }) });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) { setErr(d.error ?? 'Falha ao enviar. Tente de novo.'); return; }
        primeiroId ??= d.id;
      }
      setEnviado({ id: primeiroId!, issues: marcados.map((i) => MOTIVOS.find((m) => m.issue === i)?.rotulo ?? i) });
    } catch { setErr('Sem conexão. Tente de novo.'); } finally { setEnviando(false); }
  }

  async function avaliar(n: number) {
    if (!enviado || avaliado) return;
    setRating(n);
    const r = await fetch('/api/higiene', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acao: 'avaliar', id: enviado.id, rating: n }) }).catch(() => null);
    if (r?.ok) setAvaliado(true);
  }

  if (enviado) {
    return (
      <div className="space-y-5 rounded-3xl bg-surface p-6 text-center shadow-sgo-card" data-testid="higiene-enviado">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-success/15"><Check className="h-11 w-11 text-success" /></div>
        <div>
          <p className="text-xl font-bold text-ink-900">Obrigado! A equipe já foi avisada.</p>
          <p className="mt-1 text-sm text-ink-500">{banheiro ? `${banheiro.name} · ` : ''}{enviado.issues.join(' · ')}</p>
        </div>
        <div className="rounded-2xl bg-brand-tint p-4">
          <p className="mb-2 text-sm font-semibold text-ink-900">{avaliado ? 'Avaliação registrada. Obrigado!' : 'Quer avaliar este banheiro? (opcional)'}</p>
          <div className="flex justify-center gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" disabled={avaliado} onClick={() => void avaliar(n)} aria-label={`${n} estrela${n > 1 ? 's' : ''}`} className="p-1">
                <Star className={`h-10 w-10 ${n <= rating ? 'fill-warning text-warning' : 'text-ink-400'}`} />
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 rounded-3xl bg-surface p-4 shadow-sgo-card sm:p-6" data-testid="higiene-form">
      {escolheBanheiro && (
        <section className="space-y-3">
          <Passo numero={1} titulo="Qual banheiro?" extra="Selecione o banheiro" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {locations.map((l) => {
              const Icone = iconeDoBanheiro(l.name);
              const ativo = locationId === l.id;
              return (
                <button key={l.id} type="button" onClick={() => { setLocationId(l.id); setErr(null); }} aria-pressed={ativo} data-testid={`banheiro-${l.id}`}
                  className={`flex min-h-20 items-center gap-3 rounded-2xl border-2 px-4 text-left text-lg font-bold transition active:scale-[0.99] ${ativo ? 'border-brand bg-brand text-on-brand shadow-sgo-card-hover' : 'border-line bg-surface text-ink-900 hover:border-brand/40'}`}>
                  <Icone className="h-10 w-10 shrink-0" />
                  <span className="flex-1">{l.name}</span>
                  {ativo && <span className="flex h-7 w-7 items-center justify-center rounded-full bg-on-brand text-brand"><Check className="h-4 w-4" /></span>}
                </button>
              );
            })}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <Passo numero={passo} titulo="O que está acontecendo?" extra="Selecione um ou mais problemas" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {MOTIVOS.map((m) => {
            const ativo = marcados.includes(m.issue);
            return (
              <button key={m.issue} type="button" disabled={enviando} onClick={() => alternar(m.issue)} aria-pressed={ativo} data-testid={`motivo-${m.issue}`}
                className={`relative flex min-h-28 flex-col items-start justify-end gap-2 rounded-2xl border-2 p-4 text-left text-base font-bold leading-tight transition active:scale-[0.99] disabled:opacity-60 ${ativo ? 'border-brand bg-brand-tint text-brand' : 'border-line bg-surface text-ink-900 hover:border-brand/40'}`}>
                {ativo && <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-brand text-on-brand"><Check className="h-4 w-4" /></span>}
                <m.Icone className="h-10 w-10 text-brand" aria-hidden />
                <span>{m.rotulo}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="space-y-3">
        <Passo numero={passo + 1} titulo="Observações" apoio={marcados.includes('Outro') ? '(obrigatório para "Outro problema")' : '(opcional)'} extra={`${comment.length}/${LIMITE_OBSERVACAO}`} />
        <div className="relative">
          <PenLine className="pointer-events-none absolute left-4 top-4 h-5 w-5 text-ink-400" aria-hidden />
          <textarea value={comment} onChange={(e) => setComment(e.target.value.slice(0, LIMITE_OBSERVACAO))} rows={3} maxLength={LIMITE_OBSERVACAO} placeholder="Descreva melhor o que está acontecendo…" aria-label="Observações" data-testid="observacoes"
            className="w-full rounded-2xl border-2 border-line bg-surface py-4 pl-12 pr-4 text-base text-ink-900 placeholder:text-ink-400 focus:border-brand focus:outline-none" />
        </div>
      </section>

      <div className="flex items-center gap-3 rounded-2xl bg-brand-tint p-4" data-testid="higiene-aviso">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand text-xl font-bold text-on-brand" aria-hidden>!</span>
        <div className="text-sm">
          <p className="font-bold text-brand">Um toque já avisa a equipe.</p>
          <p className="text-ink-700">Não precisa se identificar.</p>
        </div>
      </div>

      {err && <p className="text-sm font-medium text-danger" role="alert">{err}</p>}

      <button type="button" disabled={!podeEnviar} onClick={() => void enviar()} data-testid="enviar-solicitacao"
        className="flex min-h-14 w-full items-center justify-between rounded-2xl bg-brand px-5 text-lg font-bold text-on-brand shadow-sgo-card transition hover:bg-brand-hover active:bg-brand-active disabled:opacity-50">
        {enviando ? <Loader2 className="h-6 w-6 animate-spin" /> : <Send className="h-6 w-6" />}
        <span>{enviando ? 'Enviando…' : 'Enviar Solicitação'}</span>
        <ChevronRight className="h-6 w-6" />
      </button>
    </div>
  );
}
