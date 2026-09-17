'use client';

import { useMemo, useRef, useState } from 'react';
import { Send, AlertTriangle, CheckCircle2, Store, Bike } from 'lucide-react';
import { Button } from '@/components/ui/ds/button';
import { Input } from '@/components/ui/ds/field';
import { DatePicker } from '@/components/ui/ds/date-picker';
import { Banner } from '@/components/ui/ds/banner';
import {
  CANAIS, TAMANHOS, contagensVazias, emBR, nomeComercial, rotuloDoTamanho, totalDoCanal, totalGeral,
  type CanalPizza, type ContagensDoFechamento, type TamanhoPizza,
} from '@/lib/pizzas/tipos';

/**
 * FECHAMENTO DE PIZZAS — seis números e enviar.
 *
 * O formulário anterior pedia sabor + tamanho + quantidade e obrigava a montar
 * uma linha por combinação. Não era o processo: no fim da noite a pizzaria tem
 * na mão quantas saíram por tamanho em cada canal, não a abertura por sabor.
 * Montar dez linhas para lançar um número que já se sabia somado custava
 * minutos e convidava ao erro.
 *
 * Agora são três campos por canal, com o total de cada bloco e o TOTAL GERAL
 * atualizando enquanto se digita — o número que a pessoa confere antes de
 * mandar. A soma é a mesma do painel (`tipos.ts`), de propósito: folha e painel
 * somando por conta própria é como uma das duas acaba certa e a outra errada.
 */

const ICONE_CANAL: Record<CanalPizza, React.ComponentType<{ className?: string }>> = {
  TEKNISA: Store,
  IFOOD: Bike,
};

interface Props {
  token: string;
  hoje: string;
  /** Fechamento já gravado para a data aberta (duplicidade), se houver. */
  fechamentoDeHoje: { contagens: ContagensDoFechamento; observation: string | null; sabores: number } | null;
}

export function PizzaPublicForm({ token, hoje, fechamentoDeHoje }: Props) {
  const [data, setData] = useState<string | null>(hoje);
  const [contagens, setContagens] = useState<ContagensDoFechamento>(contagensVazias);
  const [observation, setObservation] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [duplicado, setDuplicado] = useState<ContagensDoFechamento | null>(fechamentoDeHoje ? fechamentoDeHoje.contagens : null);
  const [pronto, setPronto] = useState<{ total: number; corrigido: boolean } | null>(null);
  const resumoRef = useRef<HTMLDivElement>(null);

  const totais = useMemo(() => ({
    TEKNISA: totalDoCanal(contagens, 'TEKNISA'),
    IFOOD: totalDoCanal(contagens, 'IFOOD'),
    geral: totalGeral(contagens),
  }), [contagens]);

  function mudar(canal: CanalPizza, size: TamanhoPizza, bruto: string) {
    /* Só dígitos. Campo numérico no celular ainda aceita colar "12,5" e o
       traço do sinal — e um `-3` viraria erro só lá no servidor. */
    const limpo = bruto.replace(/\D/g, '').slice(0, 5);
    setContagens((c) => ({ ...c, [canal]: { ...c[canal], [size]: limpo === '' ? 0 : Number(limpo) } }));
    setErro(null);
  }

  async function enviar(substituir = false) {
    setErro(null);
    if (!data) { setErro('Escolha a data do fechamento.'); return; }
    if (totais.geral === 0) { setErro('Informe ao menos uma pizza antes de enviar.'); return; }

    setEnviando(true);
    try {
      const res = await fetch('/api/pizzas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, operationalDate: data, contagens, observation, substituir }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (body.reason === 'DUPLICADO') { setDuplicado(contagensVazias()); setErro(body.error); return; }
        setErro(body.error ?? 'Não foi possível enviar o fechamento.');
        return;
      }
      setPronto({ total: body.total, corrigido: Boolean(body.substituiu) });
      setDuplicado(null);
    } catch {
      setErro('Sem conexão. Confira a internet e tente de novo.');
    } finally {
      setEnviando(false);
    }
  }

  /** Traz para a tela o que já está gravado, para a pessoa corrigir em cima. */
  async function carregarParaCorrigir() {
    setErro(null);
    const res = await fetch(`/api/pizzas?token=${encodeURIComponent(token)}&data=${data ?? hoje}`);
    const body = await res.json().catch(() => ({}));
    if (body?.closing?.contagens) {
      setContagens(body.closing.contagens);
      setObservation(body.closing.observation ?? '');
      setDuplicado(body.closing.contagens);
      resumoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  if (pronto) {
    return (
      <div className="space-y-3 text-center">
        <CheckCircle2 className="mx-auto h-12 w-12 text-success" aria-hidden />
        <p className="sgo-type-17 font-semibold text-ink-900">
          {pronto.corrigido ? 'Fechamento corrigido!' : 'Fechamento enviado!'}
        </p>
        <p className="text-sm text-ink-500">{emBR(data ?? hoje)} — {pronto.total} pizza(s).</p>
        <Button
          variant="secondary"
          className="w-full"
          onClick={() => { setPronto(null); setContagens(contagensVazias()); setObservation(''); setDuplicado(null); }}
        >
          Lançar outro dia
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <DatePicker
        label="Data do fechamento"
        required
        value={data}
        onValueChange={(v) => { setData(v); setDuplicado(null); setErro(null); }}
        max={hoje}
      />

      {CANAIS.map((canal, i) => {
        const Icone = ICONE_CANAL[canal.valor];
        return (
          <section key={canal.valor} className="rounded-card border border-line bg-surface p-3">
            <p className="mb-2 flex items-center gap-2 sgo-type-11 font-semibold text-ink-900">
              <Icone className="h-4 w-4 text-brand" aria-hidden />
              {i + 1}. {canal.rotulo.toUpperCase()}
            </p>
            <div className="space-y-2">
              {TAMANHOS.map((t) => (
                <div key={t.valor} className="flex items-center gap-3">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-ink-900">{nomeComercial(t.valor)}</span>
                    <span className="block text-xs text-ink-500">{rotuloDoTamanho(t.valor)}</span>
                  </span>
                  <Input
                    aria-label={`${canal.rotulo} — ${nomeComercial(t.valor)} (${rotuloDoTamanho(t.valor)})`}
                    inputMode="numeric"
                    /* `value` sempre string e sem zero à esquerda: um campo que
                       começa em "0" e vira "05" quando se digita é o tipo de
                       detalhe que faz a pessoa apagar e redigitar. */
                    value={String(contagens[canal.valor][t.valor])}
                    onChange={(e) => mudar(canal.valor, t.valor, e.target.value)}
                    onFocus={(e) => e.currentTarget.select()}
                    className="w-20 text-center text-base tabular-nums"
                  />
                </div>
              ))}
            </div>
            <p className="mt-2 border-t border-line pt-2 text-right text-sm text-ink-500">
              Total {canal.rotulo}: <b className="tabular-nums text-ink-900">{totais[canal.valor]}</b>
            </p>
          </section>
        );
      })}

      {/* RESUMO — é o número que a pessoa confere antes de mandar, então ele é
          o elemento mais forte da tela depois dos campos. */}
      <div ref={resumoRef} className="rounded-card border-2 border-brand/40 bg-brand/5 p-3">
        <div className="flex items-baseline justify-between text-sm">
          <span className="text-ink-500">Teknisa</span>
          <span className="font-semibold tabular-nums text-ink-900">{totais.TEKNISA} pizzas</span>
        </div>
        <div className="mt-1 flex items-baseline justify-between text-sm">
          <span className="text-ink-500">iFood</span>
          <span className="font-semibold tabular-nums text-ink-900">{totais.IFOOD} pizzas</span>
        </div>
        <div className="mt-2 flex items-baseline justify-between border-t border-brand/30 pt-2">
          <span className="sgo-type-11 font-semibold text-ink-900">Total geral</span>
          <span className="sgo-type-24 font-semibold tabular-nums text-brand">{totais.geral}</span>
        </div>
      </div>

      <Input label="Observação (opcional)" value={observation} onChange={(e) => setObservation(e.target.value)} />

      {erro && (
        <Banner
          tone={duplicado ? 'warning' : 'danger'}
          title={erro}
          description={duplicado ? 'Carregue o que já foi lançado e corrija em cima, para não sobrescrever sem ver.' : undefined}
          action={duplicado ? <Button size="sm" variant="secondary" onClick={carregarParaCorrigir}>Carregar e corrigir</Button> : undefined}
        />
      )}

      {duplicado && !erro && (
        <Banner
          tone="warning"
          title="Este dia já tem fechamento"
          description="Enviar agora vai substituir o que está gravado. O gerente da unidade é avisado da correção."
        />
      )}

      <Button
        onClick={() => enviar(Boolean(duplicado))}
        loading={enviando}
        size="lg"
        className="w-full"
      >
        {duplicado ? <><AlertTriangle className="h-5 w-5" /> Substituir fechamento</> : <><Send className="h-5 w-5" /> Enviar fechamento</>}
      </Button>
    </div>
  );
}
