'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRightLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/ds/date-picker';

/** Primeiro dia do mês que vem — o corte natural para não partir um mês ao meio. */
function proximoPrimeiro(): string {
  const d = new Date();
  const ano = d.getMonth() === 11 ? d.getFullYear() + 1 : d.getFullYear();
  const mes = d.getMonth() === 11 ? 1 : d.getMonth() + 2;
  return `${ano}-${String(mes).padStart(2, '0')}-01`;
}

/**
 * Traz as escalas antigas para o formato novo.
 *
 * Só aparece enquanto houver escalas antigas — um botão permanente que nunca
 * mais faz nada vira ruído na tela do gerente.
 */
export function MigrateLegacyPanel({
  unitId,
  quantidade,
  busy,
}: {
  unitId: string;
  quantidade: number;
  busy: boolean;
}) {
  const router = useRouter();
  const [aPartirDe, setAPartirDe] = useState(proximoPrimeiro);
  const [resultado, setResultado] = useState<string | null>(null);

  if (quantidade === 0 && !resultado) return null;

  async function migrar() {
    if (!aPartirDe) return;
    const confirma = window.confirm(
      `Trazer ${quantidade} escala(s) para o formato novo, valendo a partir de ${aPartirDe.split('-').reverse().join('/')}?\n\n` +
      'Os meses anteriores NÃO mudam: a escala antiga é fechada na véspera dessa data.\n\n' +
      'Nas escalas 12x36 o Planejado a partir daí sai diferente — é a correção da virada de mês.',
    );
    if (!confirma) return;

    const res = await fetch('/api/schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'migrateLegacy', unitId, aPartirDe }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) { setResultado(d.error ?? 'Falha na migração'); return; }

    const partes = [`${d.migradas} escala(s) migrada(s)`];
    if (d.corrigidas > 0) partes.push(`${d.corrigidas} com 12x36 corrigido`);
    if (Array.isArray(d.puladas) && d.puladas.length > 0) {
      partes.push(`${d.puladas.length} não traduzida(s): ${d.puladas.map((p: { colaborador: string }) => p.colaborador).join(', ')} — precisam ser refeitas à mão`);
    }
    if (Array.isArray(d.tiposCriados) && d.tiposCriados.length > 0) {
      partes.push(`tipo(s) criado(s): ${d.tiposCriados.join(', ')}`);
    }
    setResultado(partes.join(' · '));
    /* Recarrega a grade para o resultado da migração aparecer nos dias — e não
       só nesta mensagem. */
    router.refresh();
  }

  return (
    <div className="rounded-lg border-2 border-warning/40 bg-warning-bg/40 p-3 print:hidden">
      <p className="text-sm font-semibold text-ink-900">
        {quantidade > 0 ? `${quantidade} escala(s) ainda no formato antigo` : 'Escalas antigas'}
      </p>
      <p className="mt-1 text-xs text-ink-700">
        Elas continuam sendo geradas pela regra antiga — inclusive o <b>12x36</b>, que decide pela paridade do dia do mês
        e repete um dia de trabalho em toda virada de mês com 31 dias. Trazer para o formato novo corrige isso{' '}
        <b>a partir da data escolhida</b>; os meses anteriores ficam como estão.
      </p>

      <div className="mt-2 flex flex-wrap items-end gap-2">
        <div className="w-48">
          <DatePicker label="Valendo a partir de" size="sm" value={aPartirDe || null} onValueChange={(v) => setAPartirDe(v ?? '')} />
        </div>
        <Button size="sm" variant="outline" disabled={busy || quantidade === 0} onClick={migrar}>
          <ArrowRightLeft className="h-4 w-4" /> Trazer para o formato novo
        </Button>
      </div>

      {resultado && <p className="mt-2 rounded-md bg-surface px-2 py-1.5 text-xs font-medium text-ink-900">{resultado}</p>}
    </div>
  );
}
