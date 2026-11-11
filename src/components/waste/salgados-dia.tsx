'use client';

import { useState } from 'react';
import { Pencil, Plus } from 'lucide-react';
import { Button } from '@/components/ui/ds/button';
import { SalgadosForm } from '@/components/waste/salgados-form';
import { FotosDoLancamento } from '@/components/waste/fotos-do-lancamento';

interface Opcao { id: string; name: string }
export interface LancamentoDoDia {
  id: string;
  hora: string;
  porQuem: string | null;
  total: number;
  evidencePath: string | null;
  rows: { id: string; typeId: string; typeName: string; reasonId: string; reasonName: string; quantity: number }[];
}

/**
 * O dia da lanchonete (v1.203.0): os lançamentos já feitos (manhã, noite…) e a
 * folha de um NOVO lançamento. A lanchonete lança mais de uma vez por dia; cada
 * lançamento tem as suas linhas e a sua foto, e gravar um nunca mexe nos outros.
 * "Corrigir" abre a folha só daquele lançamento.
 */
export function SalgadosDia({ unitId, operationalDate, titulo, tipos, motivos, lancamentos, totalDoDia }: {
  unitId: string;
  operationalDate: string;
  titulo: string;
  tipos: Opcao[];
  motivos: Opcao[];
  lancamentos: LancamentoDoDia[];
  totalDoDia: number;
}) {
  const [editando, setEditando] = useState<string | null>(null);
  const emEdicao = lancamentos.find((l) => l.id === editando) ?? null;

  return (
    <div className="space-y-3">
      {lancamentos.length > 0 && (
        <div className="space-y-2" data-testid="lancamentos-do-dia">
          <p className="text-sm font-semibold text-ink-900">
            Lançamentos do dia ({lancamentos.length}) · total do dia {totalDoDia} un.
          </p>
          {lancamentos.map((l, i) => (
            <div key={l.id} className={`rounded-card border p-2.5 ${editando === l.id ? 'border-brand bg-brand/5' : 'border-line'}`} data-testid="lancamento-do-dia">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-ink-900">
                  {i + 1}º lançamento · {l.hora}{l.porQuem ? ` · ${l.porQuem}` : ''}
                </p>
                <div className="flex items-center gap-2">
                  <span className="font-bold tabular-nums text-brand">{l.total} un.</span>
                  <Button size="sm" variant="ghost" onClick={() => setEditando(editando === l.id ? null : l.id)} aria-label={`Corrigir o ${i + 1}º lançamento`}>
                    <Pencil className="h-3.5 w-3.5" /> {editando === l.id ? 'Cancelar' : 'Corrigir'}
                  </Button>
                </div>
              </div>
              <ul className="mt-1 space-y-0.5">
                {l.rows.map((r) => (
                  <li key={r.id} className="flex justify-between text-xs text-ink-700">
                    <span>{r.typeName} <span className="text-ink-500">· {r.reasonName}</span></span>
                    <span className="font-medium tabular-nums">{r.quantity} un.</span>
                  </li>
                ))}
              </ul>
              {l.evidencePath
                ? <div className="mt-2"><FotosDoLancamento fotos={[{ rotulo: 'Recipiente de descarte', path: l.evidencePath }]} titulo={`Salgados · ${i + 1}º lançamento`} tamanho="sm" /></div>
                : <p className="mt-1 text-xs text-warning">Sem foto neste lançamento.</p>}
            </div>
          ))}
        </div>
      )}

      <div className="rounded-card border-2 border-dashed border-brand/40 p-3" data-testid="folha-do-lancamento">
        <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-brand">
          {emEdicao ? <><Pencil className="h-4 w-4" /> Corrigindo o lançamento das {emEdicao.hora}</> : <><Plus className="h-4 w-4" /> {lancamentos.length > 0 ? 'Novo lançamento (outro horário do dia)' : titulo}</>}
        </p>
        <SalgadosForm
          key={emEdicao?.id ?? 'novo'}
          unitId={unitId}
          operationalDate={operationalDate}
          tipos={tipos}
          motivos={motivos}
          launchId={emEdicao ? emEdicao.id : null}
          initialRows={emEdicao ? emEdicao.rows : []}
          initialEvidencePath={emEdicao ? emEdicao.evidencePath : null}
          onDone={() => setEditando(null)}
        />
      </div>
    </div>
  );
}
