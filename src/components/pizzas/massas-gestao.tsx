'use client';

import { useEffect, useState } from 'react';
import { DatePicker } from '@/components/ui/ds/date-picker';
import { Banner } from '@/components/ui/ds/banner';
import { MassasOperacao, type EstadoParaTela } from '@/components/pizzas/massas-operacao';

/**
 * Correções pela GESTÃO: o gerente escolhe o dia e usa a MESMA tela do link.
 * Dia anterior pede o motivo da alteração (o componente cuida disso ao ver
 * `data < hoje` na porta de gestão). A gravação vai por `/api/pizzas/massas/gestao`,
 * que confere perfil, escopo e pizzaria.
 */
export function MassasGestao({ unitId, hoje }: { unitId: string; hoje: string }) {
  const [data, setData] = useState<string | null>(hoje);
  const [estado, setEstado] = useState<EstadoParaTela | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    let vivo = true;
    setEstado(null); setErro(null);
    fetch(`/api/pizzas/massas/gestao?unit=${encodeURIComponent(unitId)}&data=${data}`)
      .then(async (r) => { const b = await r.json().catch(() => ({})); if (!r.ok) throw new Error(b.error ?? 'Falha ao carregar'); return b as EstadoParaTela; })
      .then((e) => { if (vivo) setEstado(e); })
      .catch((e: Error) => { if (vivo) setErro(e.message); });
    return () => { vivo = false; };
  }, [unitId, data]);

  return (
    <div className="space-y-3">
      <DatePicker label="Dia a consultar ou corrigir" value={data} onValueChange={setData} max={hoje} hint="Dia anterior exige o motivo da alteração; tudo fica no histórico." />
      {erro && <Banner tone="danger" title={erro} />}
      {data && estado && (
        <MassasOperacao key={data} porta={{ tipo: 'gestao', unitId }} estadoInicial={estado} />
      )}
      {data && !estado && !erro && <p className="text-sm text-ink-500">Carregando…</p>}
    </div>
  );
}
