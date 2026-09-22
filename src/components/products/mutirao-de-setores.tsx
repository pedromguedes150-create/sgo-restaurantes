'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/ds/select';
import { sugerirSetorPorRegra } from '@/lib/stock/setor-sugerido';

/**
 * MUTIRÃO DO SETOR.
 *
 * Produto do CD sem setor cai em "Sem setor cadastrado" e NENHUM separador o
 * enxerga: some da fila de todo mundo sem erro nenhum. Corrigir mil e duzentos
 * num modal por item é o que inviabiliza o mutirão — aqui a lista inteira vem
 * com o setor já PROPOSTO e a pessoa confirma de uma vez.
 *
 * Duas coisas que a tela faz de propósito:
 *
 *  - **Mostra o porquê de cada sugestão** (o termo reconhecido, ou "IA"). Uma
 *    coluna com o setor já preenchido e sem explicação convida a apertar
 *    "aplicar" sem ler — e o engano sairia multiplicado por mil.
 *  - **Nunca aplica o que não foi escolhido.** Item sem setor selecionado fica
 *    de fora e continua aparecendo no aviso, que é o certo: sem setor é melhor
 *    que com o setor errado, porque o errado some numa fila que ninguém
 *    confere.
 *
 * A regra roda AQUI, no navegador: ela é pura e instantânea, e mandá-la ao
 * servidor a cada abertura da tela seria uma ida de rede para um cálculo de
 * microssegundos.
 */

interface Prod { id: string; name: string; category: string; barcode?: string | null }
interface Setor { id: string; name: string }

export function MutiraoDeSetores({ itens, setores, onFechar }: {
  itens: Prod[];
  setores: Setor[];
  onFechar: () => void;
}) {
  const router = useRouter();
  const [escolhas, setEscolhas] = useState<Record<string, string>>({});
  const [porIA, setPorIA] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  /* A regra, em todos, de uma vez. Pura e instantânea. */
  const porRegra = useMemo(() => {
    const mapa: Record<string, { sectorId: string; termo: string }> = {};
    for (const p of itens) {
      const s = sugerirSetorPorRegra(p.name, setores, p.category);
      if (s) mapa[p.id] = { sectorId: s.sectorId, termo: s.termo };
    }
    return mapa;
  }, [itens, setores]);

  /* O valor de cada linha: o que a pessoa escolheu vence a IA, que vence a
     regra. A ordem é essa porque cada camada é mais informada que a anterior. */
  const valorDe = (id: string) => escolhas[id] ?? porIA[id] ?? porRegra[id]?.sectorId ?? '';
  const fonteDe = (id: string): string | null => {
    if (escolhas[id] !== undefined) return escolhas[id] ? 'você escolheu' : null;
    if (porIA[id]) return 'sugerido pela IA';
    if (porRegra[id]) return `pela regra — ${porRegra[id].termo}`;
    return null;
  };

  const prontos = itens.filter((p) => valorDe(p.id));
  const semNada = itens.filter((p) => !valorDe(p.id));

  async function usarIA() {
    setBusy(true); setErro(null); setMsg(null);
    try {
      const res = await fetch('/api/products', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'setorIA', productIds: semNada.map((p) => p.id) }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.ok) { setErro(String(d.error ?? 'Falha ao consultar a IA.')); return; }
      if (!d.configured) { setErro('A IA não está configurada neste ambiente (falta a chave). Escolha os setores na mão.'); return; }
      const novas: Record<string, string> = {};
      for (const s of (d.sugestoes ?? []) as { productId: string; sectorId: string }[]) novas[s.productId] = s.sectorId;
      setPorIA((v) => ({ ...v, ...novas }));
      const n = Object.keys(novas).length;
      setMsg(
        n === 0
          ? 'A IA não reconheceu nenhum destes. Escolha na mão os que souber.'
          : `${n} sugestão(ões) da IA. Confira antes de aplicar.${d.restantes > 0 ? ` Ainda faltam ${d.restantes} — clique de novo.` : ''}`,
      );
    } finally { setBusy(false); }
  }

  async function aplicar() {
    setBusy(true); setErro(null); setMsg(null);
    try {
      const res = await fetch('/api/products', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'setorAplicar',
          pares: prontos.map((p) => ({ productId: p.id, cdSectorId: valorDe(p.id) })),
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.ok) { setErro(String(d.error ?? 'Falha ao aplicar.')); return; }
      setMsg(`${d.aplicados} produto(s) com setor.${d.ignorados > 0 ? ` ${d.ignorados} ficaram de fora (já tinham setor ou o setor saiu do ar).` : ''}`);
      router.refresh();
    } finally { setBusy(false); }
  }

  if (setores.length === 0) {
    return (
      <div className="rounded-lg border-2 border-warning/30 bg-warning-bg p-3">
        <p className="sgo-type-15 text-ink-900">
          Nenhum setor do CD cadastrado. Crie os setores em <b>Configurações → Setores do CD</b> — sem eles não há para onde apontar os produtos.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-line bg-surface p-3 shadow-sgo-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="sgo-type-17 font-semibold text-ink-900">Definir o setor de {itens.length} produto(s)</p>
          <p className="sgo-type-13 text-ink-700">
            <b>{prontos.length}</b> com setor proposto · <b>{semNada.length}</b> sem proposta.
            Confira antes de aplicar: o setor errado manda o item para a fila de quem não tem o que fazer com ele.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onFechar}><X className="h-4 w-4" /> Fechar</Button>
      </div>

      {msg && <p className="rounded-lg bg-success/10 px-3 py-2 text-sm font-medium text-success">{msg}</p>}
      {erro && <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm font-medium text-danger">{erro}</p>}

      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={busy || prontos.length === 0} onClick={() => void aplicar()}>
          <Check className="h-4 w-4" /> Aplicar {prontos.length} setor(es)
        </Button>
        {semNada.length > 0 && (
          <Button variant="outline" size="sm" disabled={busy} onClick={() => void usarIA()}>
            <Sparkles className="h-4 w-4" /> Usar a IA nos {semNada.length} sem proposta
          </Button>
        )}
      </div>

      <div className="max-h-[28rem] overflow-y-auto rounded-lg border border-line">
        {itens.map((p) => {
          const fonte = fonteDe(p.id);
          return (
            <div key={p.id} className="flex flex-wrap items-center gap-2 border-b border-line p-2 last:border-b-0">
              <div className="min-w-0 flex-1">
                <p className="truncate sgo-type-15 font-medium text-ink-900">{p.name}</p>
                <p className="sgo-type-11 text-ink-500">
                  {p.category}
                  {fonte ? <span className="text-brand"> · {fonte}</span> : <span className="text-warning"> · sem proposta</span>}
                </p>
              </div>
              <div className="w-48 shrink-0">
                <Select
                  aria-label={`Setor de ${p.name}`}
                  size="sm"
                  value={valorDe(p.id)}
                  onValueChange={(v) => setEscolhas((e) => ({ ...e, [p.id]: v }))}
                  placeholder="Escolha…"
                  options={[{ value: '', label: 'Deixar sem setor' }, ...setores.map((s) => ({ value: s.id, label: s.name }))]}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
