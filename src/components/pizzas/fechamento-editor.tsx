'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PencilLine, Store, Bike, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/ds/button';
import { Input } from '@/components/ui/ds/field';
import { DatePicker } from '@/components/ui/ds/date-picker';
import { Banner } from '@/components/ui/ds/banner';
import { Sheet } from '@/components/ui/ds/sheet';
import {
  CANAIS, TAMANHOS, contagensVazias, emBR, nomeComercial, rotuloDoTamanho, totalDoCanal, totalGeral,
  type CanalPizza, type ContagensDoFechamento, type TamanhoPizza,
} from '@/lib/pizzas/tipos';

/**
 * AUDITAR / CORRIGIR FECHAMENTO — a porta do supervisor para o que o
 * funcionário lançou errado pelo link.
 *
 * Escolhe o dia, vê as seis quantidades já gravadas e corrige em cima. Corrigir
 * um dia que já tem fechamento exige MOTIVO (vai para a Auditoria com o autor).
 * As mesmas seis contagens do link, somadas pelo mesmo `tipos.ts` — folha e
 * painel nunca discordam.
 */

const ICONE_CANAL: Record<CanalPizza, React.ComponentType<{ className?: string }>> = { TEKNISA: Store, IFOOD: Bike };

export function FechamentoEditor({ unitId, hoje, dataInicial }: { unitId: string; hoje: string; dataInicial?: string }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [data, setData] = useState<string | null>(dataInicial ?? hoje);
  const [contagens, setContagens] = useState<ContagensDoFechamento>(contagensVazias);
  const [observation, setObservation] = useState('');
  const [motivo, setMotivo] = useState('');
  const [existe, setExiste] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<{ total: number; corrigido: boolean } | null>(null);
  const cacheData = useRef<string | null>(null);

  const totais = {
    TEKNISA: totalDoCanal(contagens, 'TEKNISA'),
    IFOOD: totalDoCanal(contagens, 'IFOOD'),
    geral: totalGeral(contagens),
  };

  async function abrir() {
    setAberto(true);
    setOk(null);
    setErro(null);
    setMotivo('');
    await carregar(data ?? hoje);
  }

  async function carregar(dia: string) {
    setCarregando(true);
    setErro(null);
    cacheData.current = dia;
    try {
      const res = await fetch(`/api/pizzas/gestao?unit=${encodeURIComponent(unitId)}&data=${dia}`);
      const body = await res.json().catch(() => ({}));
      // Ignora resposta de uma data antiga se o usuário trocou o dia no meio.
      if (cacheData.current !== dia) return;
      if (!res.ok) { setErro(body.error ?? 'Não foi possível carregar o dia.'); return; }
      setContagens(body.closing?.contagens ?? contagensVazias());
      setObservation(body.closing?.observation ?? '');
      setExiste(Boolean(body.closing));
    } catch {
      setErro('Sem conexão. Tente de novo.');
    } finally {
      setCarregando(false);
    }
  }

  function trocarData(v: string | null) {
    setData(v);
    setOk(null);
    setMotivo('');
    if (v) void carregar(v);
  }

  function mudar(canal: CanalPizza, size: TamanhoPizza, bruto: string) {
    const limpo = bruto.replace(/\D/g, '').slice(0, 5);
    setContagens((c) => ({ ...c, [canal]: { ...c[canal], [size]: limpo === '' ? 0 : Number(limpo) } }));
    setErro(null);
  }

  async function salvar() {
    setErro(null);
    if (!data) { setErro('Escolha a data do fechamento.'); return; }
    if (totais.geral === 0) { setErro('Informe ao menos uma pizza.'); return; }
    if (existe && !motivo.trim()) { setErro('Informe o motivo da correção.'); return; }

    setEnviando(true);
    try {
      const res = await fetch('/api/pizzas/gestao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unitId, operationalDate: data, contagens, observation, motivo: motivo.trim() || null }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setErro(body.error ?? 'Não foi possível salvar.'); return; }
      setOk({ total: body.total, corrigido: Boolean(body.substituiu) });
      setExiste(true);
      router.refresh();
    } catch {
      setErro('Sem conexão. Tente de novo.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => void abrir()}>
        <PencilLine className="h-4 w-4" /> Auditar / corrigir
      </Button>

      <Sheet
        open={aberto}
        onClose={() => setAberto(false)}
        title="Auditar / corrigir fechamento"
        description="Escolha o dia, confira o que foi lançado e corrija. Corrigir um dia já fechado exige o motivo — fica na Auditoria com o seu nome."
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setAberto(false)}>Fechar</Button>
            <Button className="flex-1" loading={enviando} disabled={carregando} onClick={() => void salvar()}>
              {existe ? 'Salvar correção' : 'Salvar fechamento'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <DatePicker label="Dia do fechamento" required value={data} onValueChange={trocarData} max={hoje} />

          {ok && (
            <Banner
              tone="success"
              title={ok.corrigido ? 'Fechamento corrigido!' : 'Fechamento gravado!'}
              description={`${emBR(data ?? hoje)} — ${ok.total} pizza(s). O gerente da unidade foi avisado da correção.`}
            />
          )}

          <p className="rounded-card border border-line bg-sunken px-3 py-2 sgo-type-11 text-ink-700">
            {carregando ? 'Carregando o dia…' : existe ? 'Este dia já tem fechamento. Ajuste as quantidades e informe o motivo.' : 'Este dia ainda não tem fechamento. Você pode lançá-lo aqui.'}
          </p>

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
                        value={String(contagens[canal.valor][t.valor])}
                        onChange={(e) => mudar(canal.valor, t.valor, e.target.value)}
                        onFocus={(e) => e.currentTarget.select()}
                        disabled={carregando}
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

          <div className="rounded-card border-2 border-brand/40 bg-brand/5 p-3">
            <div className="flex items-baseline justify-between border-t border-brand/30 pt-0">
              <span className="sgo-type-11 font-semibold text-ink-900">Total geral</span>
              <span className="sgo-type-24 font-semibold tabular-nums text-brand">{totais.geral}</span>
            </div>
          </div>

          <Input label="Observação (opcional)" value={observation} onChange={(e) => setObservation(e.target.value)} />

          {existe && (
            <Input
              label="Motivo da correção (obrigatório)"
              required
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ex.: funcionário lançou o iFood no Teknisa"
            />
          )}

          {erro && <Banner tone="danger" title={erro} />}
        </div>
      </Sheet>
    </>
  );
}
