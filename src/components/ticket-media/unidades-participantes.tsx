'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSearchParams, usePathname } from 'next/navigation';
import { Save } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/ds/button';
import { Select } from '@/components/ui/ds/select';
import { Banner } from '@/components/ui/ds/banner';
import { MESES, montarCompetencia, partesDaCompetencia, rotuloDaCompetencia, competenciaAnterior, type Competencia } from '@/lib/ticket-media/calculo';

/**
 * QUEM PARTICIPA do Ticket Médio.
 *
 * A tela opera sobre uma COMPETÊNCIA, e é isso que dá o efeito pedido: marcar
 * vale a partir dela; desmarcar encerra a participação no mês anterior, sem
 * apagar nada do que já passou. O texto abaixo de cada mudança diz exatamente
 * o que vai acontecer, porque "salvar configuração" não deixa óbvio que um
 * histórico está sendo preservado.
 */

export interface UnidadeNaTela {
  unitId: string;
  name: string;
  code: string;
  participa: boolean;
  desde: string | null;
  ate: string | null;
}

export function UnidadesParticipantes({
  unidades,
  competencia,
  anos,
}: {
  unidades: UnidadeNaTela[];
  competencia: Competencia;
  anos: number[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { ano, mes } = partesDaCompetencia(competencia);

  const original = useMemo(() => new Set(unidades.filter((u) => u.participa).map((u) => u.unitId)), [unidades]);
  const [marcadas, setMarcadas] = useState<Set<string>>(() => new Set(original));
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState<{ tom: 'success' | 'danger'; texto: string } | null>(null);

  const ligadas = [...marcadas].filter((id) => !original.has(id));
  const desligadas = [...original].filter((id) => !marcadas.has(id));
  const mudou = ligadas.length > 0 || desligadas.length > 0;
  const nome = (id: string) => unidades.find((u) => u.unitId === id)?.name ?? id;

  function trocarCompetencia(nova: Competencia) {
    const p = new URLSearchParams(params.toString());
    p.set('competencia', nova);
    router.push(`${pathname}?${p.toString()}`, { scroll: false });
  }

  function alternar(id: string) {
    setAviso(null);
    setMarcadas((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  async function salvar() {
    setSalvando(true);
    setAviso(null);
    try {
      const res = await fetch('/api/ticket-medio/participantes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ competencia, participantes: [...marcadas] }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setAviso({ tom: 'danger', texto: body.error ?? 'Não foi possível salvar.' }); return; }
      setAviso({ tom: 'success', texto: 'Configuração salva.' });
      router.refresh();
    } catch {
      setAviso({ tom: 'danger', texto: 'Sem conexão. Confira a internet e tente de novo.' });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-3 pt-4">
          <div className="flex flex-wrap items-end gap-2">
            <Select
              label="Valendo a partir de"
              className="w-40"
              value={String(mes)}
              onValueChange={(v) => trocarCompetencia(montarCompetencia(ano, Number(v)))}
              options={MESES.map((m, i) => ({ value: String(i + 1), label: m }))}
            />
            <Select
              aria-label="Ano"
              className="w-28"
              value={String(ano)}
              onValueChange={(v) => trocarCompetencia(montarCompetencia(Number(v), mes))}
              options={anos.map((a) => ({ value: String(a), label: String(a) }))}
            />
          </div>
          <p className="text-xs text-ink-500">
            As marcações valem <b className="text-ink-700">a partir de {rotuloDaCompetencia(competencia)}</b>. Os meses anteriores
            continuam como foram fechados — tirar uma unidade daqui não apaga o histórico dela.
          </p>
        </CardContent>
      </Card>

      {aviso && <Banner tone={aviso.tom} title={aviso.texto} />}

      <Card>
        <CardContent className="pt-4">
          <p className="sgo-type-11 mb-1 font-semibold text-ink-900">Unidades participantes do Ticket Médio</p>
          <p className="mb-3 text-xs text-ink-500">
            Marque as churrascarias. Centro de Distribuição, lanchonete e outras operações ficam de fora — o SGO não adivinha
            pelo nome nem pela razão social, e unidade nova nasce desmarcada.
          </p>

          <ul className="divide-y divide-line">
            {unidades.map((u) => {
              const marcada = marcadas.has(u.unitId);
              const virouOn = marcada && !original.has(u.unitId);
              const virouOff = !marcada && original.has(u.unitId);
              return (
                <li key={u.unitId} className="py-2">
                  <label className="sgo-control flex cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      checked={marcada}
                      onChange={() => alternar(u.unitId)}
                      className="mt-0.5 h-5 w-5 shrink-0 rounded border-line-strong text-brand focus:ring-brand"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-ink-900">{u.name}</span>
                      <span className="block text-xs text-ink-500">
                        {u.code}
                        {u.participa && u.desde && ` · participa desde ${rotuloDaCompetencia(u.desde)}`}
                        {!u.participa && u.ate && ` · participou até ${rotuloDaCompetencia(u.ate)}`}
                        {!u.participa && !u.ate && ' · nunca participou'}
                      </span>
                      {virouOn && (
                        <span className="mt-0.5 block text-xs text-success">
                          Passa a participar a partir de {rotuloDaCompetencia(competencia)}.
                        </span>
                      )}
                      {virouOff && (
                        <span className="mt-0.5 block text-xs text-warning">
                          Sai do controle a partir de {rotuloDaCompetencia(competencia)} — o histórico até {rotuloDaCompetencia(competenciaAnterior(competencia))} continua no consolidado daqueles meses.
                        </span>
                      )}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>

          {unidades.length === 0 && <p className="py-4 text-sm text-ink-500">Nenhuma unidade ativa cadastrada.</p>}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={salvar} loading={salvando} disabled={!mudou} size="lg">
          <Save className="h-5 w-5" /> Salvar configuração
        </Button>
        {mudou && (
          <p className="text-sm text-ink-500">
            {ligadas.length > 0 && <>Entra{ligadas.length > 1 ? 'm' : ''}: <b className="text-ink-700">{ligadas.map(nome).join(', ')}</b>. </>}
            {desligadas.length > 0 && <>Sai{desligadas.length > 1 ? 'em' : ''}: <b className="text-ink-700">{desligadas.map(nome).join(', ')}</b>.</>}
          </p>
        )}
      </div>
    </div>
  );
}
