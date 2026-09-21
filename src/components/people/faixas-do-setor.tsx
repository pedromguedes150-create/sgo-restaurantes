'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, Save, Clock, Pencil, X, Check } from 'lucide-react';
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
  /** A faixa vale o dia inteiro (é o "Necessário 24 horas"). */
  diaInteiro: boolean;
}

/**
 * NECESSIDADE POR HORÁRIO — o cadastro dentro do setor.
 *
 * Duas ideias que a tela precisa separar, porque a confusão entre elas foi o
 * defeito relatado:
 *
 *  • **24 horas é uma ESCOLHA**, e mora numa caixa de marcar. Enquanto ela
 *    esteve implícita (uma faixa 00:00–24:00 criada pela migração da v1.84.0
 *    para converter o antigo `minHeadcount`), todo setor parecia exigir
 *    cobertura o dia inteiro — e não havia como sair disso pela tela: a faixa
 *    de dia inteiro ocupa os 1440 minutos, então qualquer horário específico
 *    era recusado por sobreposição.
 *
 *  • **Faixas podem ENCOSTAR.** 06:40–15:00 e 15:00–23:40 convivem, porque a
 *    faixa é `[início, fim)`. Só sobreposição real é recusada.
 *
 * O setor SEM faixa nenhuma é um estado legítimo e útil: ele não gera alerta em
 * hora nenhuma. É onde fica a churrasqueira entre 15:00 e 18:00.
 */
export function FaixasDoSetor(props: {
  sectorId: string;
  sectorName: string;
  faixas: FaixaNaTela[];
  podeEditar: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const de24h = props.faixas.find((f) => f.diaInteiro) ?? null;

  return (
    <div className="rounded-lg border bg-surface p-2.5">
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <span className="text-sm font-semibold text-ink-900">{props.sectorName}</span>
        <span className="text-xs text-ink-500">
          {de24h
            ? `24 horas · mínimo ${de24h.minPeople}`
            : props.faixas.length === 0
              ? 'sem necessidade configurada'
              : `${props.faixas.length} faixa${props.faixas.length > 1 ? 's' : ''} configurada${props.faixas.length > 1 ? 's' : ''}`}
          {' '}{aberto ? '▲' : '▼'}
        </span>
      </button>
      {aberto && <CorpoDaNecessidade {...props} />}
    </div>
  );
}

/**
 * O miolo do cadastro — separado do acordeão de propósito.
 *
 * O acordeão nasce fechado, e `renderToString` não clica em nada: com tudo num
 * componente só, nenhuma asserção alcançaria a caixa de 24 horas nem o
 * formulário. Separar deixa o conteúdo verificável sem inventar uma prop que
 * só existiria para o teste.
 */
export function CorpoDaNecessidade({
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
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [novoInicio, setNovoInicio] = useState('');
  const [novoFim, setNovoFim] = useState('');
  const [novoMin, setNovoMin] = useState('1');

  /** Id da faixa em edição — a linha vira formulário no lugar. */
  const [editando, setEditando] = useState<string | null>(null);
  const [edInicio, setEdInicio] = useState('');
  const [edFim, setEdFim] = useState('');
  const [edMin, setEdMin] = useState('1');

  const de24h = faixas.find((f) => f.diaInteiro) ?? null;
  const especificas = faixas.filter((f) => !f.diaInteiro);

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

  function comecarEdicao(f: FaixaNaTela) {
    setErro(null);
    setEditando(f.id);
    setEdInicio(f.startTime);
    setEdFim(f.endTime);
    setEdMin(String(f.minPeople));
  }

  async function salvarEdicao(id: string) {
    if (!edInicio || !edFim) { setErro('Informe o horário inicial e o final.'); return; }
    const ok = await post({
      action: 'salvar', sectorId, id,
      startTime: edInicio, endTime: edFim, minPeople: Number(edMin) || 0,
    });
    if (ok) setEditando(null);
  }

  async function alternar24h(ligado: boolean) {
    if (ligado && especificas.length > 0) {
      const lista = especificas.map((f) => f.rotulo).join(', ');
      if (!confirm(`Marcar 24 horas substitui as faixas de ${sectorName} (${lista}). Continuar?`)) return;
    }
    await post({ action: '24h', sectorId, ligado, minPeople: Number(de24h?.minPeople ?? novoMin) || 1 });
  }

  return (
        <div className="mt-2 space-y-2 border-t border-line pt-2">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-ink-700">
            <Clock className="h-3.5 w-3.5" /> Necessidade por horário
          </p>

          {/* ── 24 HORAS: a escolha explícita ──
              Fica no topo porque é ela que decide se o resto da tela faz
              sentido: com 24 horas marcado, faixa específica não tem onde caber. */}
          <label className="sgo-control flex cursor-pointer items-center gap-2 rounded-md border border-line px-2 py-1.5">
            <input
              type="checkbox"
              checked={Boolean(de24h)}
              disabled={!podeEditar || busy}
              onChange={(e) => void alternar24h(e.target.checked)}
              className="h-4 w-4 rounded border-line-strong text-brand focus:ring-brand"
            />
            <span className="flex-1 text-sm text-ink-900">Necessário 24 horas</span>
            {de24h && podeEditar && (
              <span className="flex items-center gap-1.5">
                <span className="text-xs text-ink-500">mínimo</span>
                <Input
                  value={String(de24h.minPeople)}
                  onChange={(e) => void post({ action: '24h', sectorId, ligado: true, minPeople: Number(e.target.value) || 0 })}
                  inputMode="numeric"
                  aria-label={`Mínimo de pessoas 24 horas em ${sectorName}`}
                  className="h-8 w-16 text-right text-sm tabular-nums"
                />
              </span>
            )}
          </label>

          {de24h ? (
            <p className="text-xs text-ink-500">
              Este setor exige <b>{de24h.minPeople} pessoa{de24h.minPeople === 1 ? '' : 's'}</b> das 00:00 às 24:00.
              Para cadastrar horários específicos (por exemplo 06:40–15:00), <b>desmarque</b> a opção acima.
            </p>
          ) : (
            <>
              {especificas.length === 0 && (
                <p className="text-xs text-ink-500">
                  Nenhuma faixa. Sem faixa, este setor fica <b>sem exigência</b> o dia inteiro — não gera alerta em
                  hora nenhuma.
                </p>
              )}

              {especificas.map((f) => (
                editando === f.id ? (
                  <div key={f.id} className="rounded-md border border-brand/40 bg-brand/5 p-2">
                    <div className="grid grid-cols-3 gap-2">
                      <TimePicker label="Início" size="sm" value={edInicio || null} onValueChange={(v) => setEdInicio(v ?? '')} />
                      <TimePicker label="Fim" size="sm" value={edFim || null} onValueChange={(v) => setEdFim(v ?? '')} />
                      <div>
                        <Label className="text-xs">Mínimo</Label>
                        <Input value={edMin} onChange={(e) => setEdMin(e.target.value)} inputMode="numeric" className="h-9 text-right text-sm tabular-nums" />
                      </div>
                    </div>
                    <div className="mt-2 flex gap-2">
                      <Button size="sm" disabled={busy} onClick={() => void salvarEdicao(f.id)}>
                        <Check className="h-4 w-4" /> Salvar
                      </Button>
                      <Button size="sm" variant="ghost" disabled={busy} onClick={() => setEditando(null)}>
                        <X className="h-4 w-4" /> Cancelar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div key={f.id} className="flex items-center justify-between gap-2 rounded-md border border-line px-2 py-1.5">
                    <span className="text-sm tabular-nums text-ink-900">
                      {f.rotulo} → <b>mínimo {f.minPeople}</b> pessoa{f.minPeople === 1 ? '' : 's'}
                    </span>
                    {podeEditar && (
                      <span className="flex shrink-0 items-center">
                        <Button size="sm" variant="ghost" disabled={busy} onClick={() => comecarEdicao(f)} aria-label={`Editar a faixa ${f.rotulo}`}>
                          <Pencil className="h-4 w-4 text-ink-500" />
                        </Button>
                        <Button
                          size="sm" variant="ghost" disabled={busy}
                          onClick={() => { if (confirm(`Apagar a faixa ${f.rotulo} de ${sectorName}?`)) void post({ action: 'apagar', id: f.id }); }}
                          aria-label={`Apagar a faixa ${f.rotulo}`}
                        >
                          <Trash2 className="h-4 w-4 text-danger" />
                        </Button>
                      </span>
                    )}
                  </div>
                )
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
                  {/* Os dois casos que parecem erro e não são. */}
                  <p className="mt-1 text-[11px] text-ink-500">
                    Uma faixa pode <b>começar onde a outra termina</b> (06:40–15:00 e 15:00–23:40 convivem) e pode
                    <b> atravessar a meia-noite</b> (22:00 → 06:00 vale das 22h às 6h do dia seguinte).
                  </p>
                  <Button size="sm" className="mt-2" disabled={busy} onClick={() => void adicionar()}>
                    <Plus className="h-4 w-4" /> Adicionar faixa de horário
                  </Button>
                </div>
              )}
            </>
          )}

          {erro && <p className="text-sm font-medium text-danger">{erro}</p>}
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
          Quantas pessoas cada setor precisa em cada faixa do dia. O horário de funcionamento da unidade{' '}
          <b>não</b> define isto: uma unidade 24 horas pode ter cozinha só das 06:40 às 23:40. O turno do
          funcionário também <b>não</b> cria exigência — ele só diz quem está trabalhando naquele momento.
        </p>
      </div>
      {setores.length === 0 && <p className="text-sm text-ink-500">Nenhum setor cadastrado.</p>}
      {setores.map((s) => (
        <FaixasDoSetor key={s.id} sectorId={s.id} sectorName={s.name} faixas={s.faixas} podeEditar={podeEditar} />
      ))}
      <p className="flex items-center gap-1.5 text-[11px] text-ink-500">
        <Save className="h-3.5 w-3.5" /> Cada faixa é salva na hora. Só sobreposição real é recusada — faixas que
        encostam são aceitas.
      </p>
    </div>
  );
}
