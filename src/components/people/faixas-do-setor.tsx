'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, Save, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TimePicker } from '@/components/ui/ds/time-picker';

export interface FaixaNaTela {
  id: string;
  startTime: string;
  endTime: string;
  minPeople: number;
  rotulo: string;
}

/**
 * NECESSIDADE POR HORÁRIO — o cadastro dentro do setor.
 *
 * Substitui o campo "mín." que ficava ao lado do nome. Aquele número era
 * descrito como "mínimo por turno", e com quatro turnos cadastrados a unidade
 * passava a "precisar" de quatro vezes ele — sem ninguém ter pedido, e sem
 * conseguir dizer que a cozinha precisa de 3 de manhã e 1 de madrugada.
 */
export function FaixasDoSetor({
  sectorId,
  sectorName,
  faixas,
  podeEditar,
}: {
  sectorId: string;
  sectorName: string;
  faixas: FaixaNaTela[];
  podeEditar: boolean;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [novoInicio, setNovoInicio] = useState('');
  const [novoFim, setNovoFim] = useState('');
  const [novoMin, setNovoMin] = useState('1');

  async function post(body: Record<string, unknown>): Promise<boolean> {
    setBusy(true); setErro(null);
    try {
      const res = await fetch('/api/workforce/requirements', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) { router.refresh(); return true; }
      const d = await res.json().catch(() => ({}));
      /* A frase do servidor cita a faixa conflitante — repeti-la aqui é o que
         permite corrigir sem adivinhar qual das faixas está no caminho. */
      setErro(d.error ?? 'Não foi possível salvar.');
      return false;
    } finally { setBusy(false); }
  }

  async function adicionar() {
    if (!novoInicio || !novoFim) { setErro('Informe o horário inicial e o final.'); return; }
    const ok = await post({
      action: 'salvar', sectorId,
      startTime: novoInicio, endTime: novoFim, minPeople: Number(novoMin) || 0,
    });
    if (ok) { setNovoInicio(''); setNovoFim(''); setNovoMin('1'); }
  }

  return (
    <div className="rounded-lg border bg-surface p-2.5">
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <span className="text-sm font-semibold text-ink-900">{sectorName}</span>
        {/* O resumo substitui o "(mín. 1)": diz quantas faixas existem, que é a
            informação que passou a importar. */}
        <span className="text-xs text-ink-500">
          {faixas.length === 0
            ? 'sem necessidade configurada'
            : `${faixas.length} faixa${faixas.length > 1 ? 's' : ''} configurada${faixas.length > 1 ? 's' : ''}`}
          {' '}{aberto ? '▲' : '▼'}
        </span>
      </button>

      {aberto && (
        <div className="mt-2 space-y-2 border-t border-line pt-2">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-ink-700">
            <Clock className="h-3.5 w-3.5" /> Necessidade por horário
          </p>

          {faixas.length === 0 && (
            <p className="text-xs text-ink-500">
              Nenhuma faixa. Sem faixa, este setor fica <b>sem exigência</b> o dia inteiro — não gera alerta.
            </p>
          )}

          {faixas.map((f) => (
            <div key={f.id} className="flex items-center justify-between gap-2 rounded-md border border-line px-2 py-1.5">
              <span className="text-sm tabular-nums text-ink-900">
                {f.rotulo} → <b>mínimo {f.minPeople}</b> pessoa{f.minPeople === 1 ? '' : 's'}
              </span>
              {podeEditar && (
                <Button
                  size="sm" variant="ghost" disabled={busy}
                  onClick={() => { if (confirm(`Apagar a faixa ${f.rotulo} de ${sectorName}?`)) void post({ action: 'apagar', id: f.id }); }}
                  aria-label="Apagar faixa"
                >
                  <Trash2 className="h-4 w-4 text-danger" />
                </Button>
              )}
            </div>
          ))}

          {podeEditar && (
            <div className="rounded-md border border-dashed p-2">
              <div className="grid grid-cols-3 gap-2">
                <TimePicker label="Início" size="sm" value={novoInicio || null} onValueChange={(v) => setNovoInicio(v ?? '')} />
                <TimePicker label="Fim" size="sm" value={novoFim || null} onValueChange={(v) => setNovoFim(v ?? '')} />
                <div>
                  <Label className="text-xs">Mínimo</Label>
                  <Input
                    value={novoMin} onChange={(e) => setNovoMin(e.target.value)}
                    inputMode="numeric" className="h-9 text-right text-sm tabular-nums"
                  />
                </div>
              </div>
              {/* A faixa que vira a meia-noite é caso de uso, não erro de
                  digitação — dizer isso evita o "22 é maior que 06, está errado". */}
              <p className="mt-1 text-[11px] text-ink-500">
                Faixa que atravessa a meia-noite é aceita: <b>22:00 → 06:00</b> vale das 22h às 6h do dia seguinte.
              </p>
              <Button size="sm" className="mt-2" disabled={busy} onClick={() => void adicionar()}>
                <Plus className="h-4 w-4" /> Adicionar faixa de horário
              </Button>
            </div>
          )}

          {erro && <p className="text-sm font-medium text-danger">{erro}</p>}
        </div>
      )}
    </div>
  );
}

/** A lista de setores com as faixas — entra no lugar do antigo "mín." por setor. */
export function NecessidadePorSetor({
  setores,
  podeEditar,
}: {
  setores: { id: string; name: string; faixas: FaixaNaTela[] }[];
  podeEditar: boolean;
}) {
  return (
    <div className="space-y-2">
      <div>
        <p className="text-sm font-bold text-ink-900">Necessidade por horário</p>
        <p className="text-xs text-ink-500">
          Quantas pessoas cada setor precisa em cada faixa do dia. O turno do funcionário <b>não</b> cria
          exigência — ele só diz quem está trabalhando naquele momento.
        </p>
      </div>
      {setores.length === 0 && <p className="text-sm text-ink-500">Nenhum setor cadastrado.</p>}
      {setores.map((s) => (
        <FaixasDoSetor key={s.id} sectorId={s.id} sectorName={s.name} faixas={s.faixas} podeEditar={podeEditar} />
      ))}
      <p className="flex items-center gap-1.5 text-[11px] text-ink-500">
        <Save className="h-3.5 w-3.5" /> Cada faixa é salva na hora. Faixas que se sobrepõem são recusadas.
      </p>
    </div>
  );
}
