'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2, Power } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/ui/status-badge';
import { Select } from '@/components/ui/ds/select';
import { rotuloDosDias, rotuloDoTurno, type Programacao, type Excecao } from '@/lib/commands/programacao';

interface Unit { id: string; name: string }

const DIAS = [
  { n: 1, l: 'Seg' }, { n: 2, l: 'Ter' }, { n: 3, l: 'Qua' }, { n: 4, l: 'Qui' }, { n: 5, l: 'Sex' }, { n: 6, l: 'Sáb' }, { n: 0, l: 'Dom' },
];

/**
 * Programação das conferências (v1.201.0): QUANDO e O QUE conferir, separado do
 * cadastro das sequências (que diz quais comandas existem). Programações podem
 * se sobrepor; a tela diz qual vence.
 */
export function ProgramacaoConferenciaAdmin({ units }: { units: Unit[] }) {
  const [unitId, setUnitId] = useState(units[0]?.id ?? '');
  const [dados, setDados] = useState<{ programacoes: Programacao[]; excecoes: Excecao[] } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const carregar = useCallback(async () => {
    if (!unitId) return;
    const r = await fetch(`/api/commands/programacao?unitId=${encodeURIComponent(unitId)}`, { cache: 'no-store' });
    if (r.ok) setDados(await r.json());
  }, [unitId]);
  useEffect(() => { setDados(null); void carregar(); }, [carregar]);

  async function enviar(corpo: Record<string, unknown>): Promise<boolean> {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch('/api/commands/programacao', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setMsg(String(d.error ?? 'Não foi possível salvar.')); return false; }
      await carregar();
      return true;
    } finally { setBusy(false); }
  }

  /* ── nova programação ── */
  const [nome, setNome] = useState('');
  const [tipo, setTipo] = useState<'FAIXA_DO_DIA' | 'COMPLETA'>('FAIXA_DO_DIA');
  const [dias, setDias] = useState<number[]>([1, 2, 3, 4, 5]);
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  const [ini, setIni] = useState('');
  const [fim, setFim] = useState('');
  const [prio, setPrio] = useState('0');
  async function criar() {
    const ok = await enviar({
      action: 'salvar', unitId, nome, tipo, dias,
      faixaDe: tipo === 'FAIXA_DO_DIA' ? Number(de) : undefined, faixaAte: tipo === 'FAIXA_DO_DIA' ? Number(ate) : undefined,
      inicioHora: ini === '' ? null : Number(ini), fimHora: fim === '' ? null : Number(fim), prioridade: Number(prio || 0),
    });
    if (ok) { setNome(''); setDe(''); setAte(''); setIni(''); setFim(''); }
  }

  /* ── nova exceção ── */
  const [exData, setExData] = useState('');
  const [exNome, setExNome] = useState('');
  const [exModo, setExModo] = useState<'SKIP' | 'FAIXA_DO_DIA' | 'COMPLETA'>('SKIP');
  const [exDe, setExDe] = useState('');
  const [exAte, setExAte] = useState('');
  async function criarExcecao() {
    const ok = await enviar({
      action: 'salvarExcecao', unitId, data: exData, nome: exNome,
      semConferencia: exModo === 'SKIP', tipo: exModo === 'SKIP' ? undefined : exModo,
      faixaDe: exModo === 'FAIXA_DO_DIA' ? Number(exDe) : undefined, faixaAte: exModo === 'FAIXA_DO_DIA' ? Number(exAte) : undefined,
    });
    if (ok) { setExData(''); setExNome(''); setExDe(''); setExAte(''); }
  }

  return (
    <div className="space-y-4" data-testid="programacao-conferencia">
      <div>
        <p className="text-sm font-bold text-ink-900">Programação das conferências</p>
        <p className="text-xs text-ink-500">
          Define quando e o que conferir (faixa do dia ou completa) por dia da semana e turno. O cadastro das sequências acima diz quais comandas existem;
          aqui só se programa a conferência — programações podem se sobrepor, e vence a de maior prioridade (depois a de turno definido, depois a completa).
          Sem nenhuma programação, vale a rotina de sempre.
        </p>
      </div>

      {units.length > 1 && (
        <div className="max-w-xs">
          <Select label="Unidade" value={unitId} onValueChange={setUnitId} options={units.map((u) => ({ value: u.id, label: u.name }))} />
        </div>
      )}

      <div className="space-y-2">
        {!dados && <p className="text-sm text-ink-500">Carregando…</p>}
        {dados?.programacoes.length === 0 && <p className="text-sm text-ink-500">Nenhuma programação — vale a rotina padrão da unidade.</p>}
        {dados?.programacoes.map((p) => (
          <div key={p.id} className="flex items-center justify-between gap-2 rounded-lg border bg-surface p-2.5" data-testid="linha-programacao">
            <div className="min-w-[10rem] flex-1">
              <p className="text-sm font-semibold text-ink-900">{p.nome}</p>
              <p className="text-xs text-ink-700">
                {p.tipo === 'COMPLETA' ? 'Completa (todas as comandas)' : `Faixa do dia ${p.faixaDe}–${p.faixaAte}`} · {rotuloDosDias(p.dias)} · {rotuloDoTurno(p.inicioHora, p.fimHora)}
                {p.prioridade > 0 ? ` · prioridade ${p.prioridade}` : ''}
              </p>
            </div>
            <StatusBadge tone={p.ativa ? 'success' : 'neutral'}>{p.ativa ? 'Ativa' : 'Pausada'}</StatusBadge>
            <Button size="sm" variant="ghost" disabled={busy} aria-label={p.ativa ? 'Pausar' : 'Ativar'} onClick={() => void enviar({ action: 'alternar', id: p.id, ativa: !p.ativa })}><Power className="h-4 w-4" /></Button>
            <Button size="sm" variant="ghost" className="text-danger" disabled={busy} aria-label="Excluir" onClick={() => { if (confirm(`Excluir a programação "${p.nome}"?`)) void enviar({ action: 'excluir', id: p.id }); }}><Trash2 className="h-4 w-4" /></Button>
          </div>
        ))}
      </div>

      <div className="space-y-2 rounded-lg border border-dashed p-3">
        <p className="text-xs font-semibold text-ink-700">Nova programação</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="col-span-2"><Label htmlFor="pg-nome">Nome</Label><Input id="pg-nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Semana 1–300" className="h-9 text-sm" /></div>
          <div className="col-span-2">
            
            <Select label="Tipo" value={tipo} onValueChange={(v) => setTipo(v as 'FAIXA_DO_DIA' | 'COMPLETA')} options={[{ value: 'FAIXA_DO_DIA', label: 'Faixa do dia' }, { value: 'COMPLETA', label: 'Completa' }]} />
          </div>
          {tipo === 'FAIXA_DO_DIA' && (<>
            <div><Label htmlFor="pg-de">Comanda de</Label><Input id="pg-de" inputMode="numeric" value={de} onChange={(e) => setDe(e.target.value)} className="h-9 text-sm" /></div>
            <div><Label htmlFor="pg-ate">até</Label><Input id="pg-ate" inputMode="numeric" value={ate} onChange={(e) => setAte(e.target.value)} className="h-9 text-sm" /></div>
          </>)}
          <div><Label htmlFor="pg-ini">Turno: das (h)</Label><Input id="pg-ini" inputMode="numeric" value={ini} onChange={(e) => setIni(e.target.value)} placeholder="vazio = dia todo" className="h-9 text-sm" /></div>
          <div><Label htmlFor="pg-fim">às (h)</Label><Input id="pg-fim" inputMode="numeric" value={fim} onChange={(e) => setFim(e.target.value)} className="h-9 text-sm" /></div>
          <div><Label htmlFor="pg-prio">Prioridade</Label><Input id="pg-prio" inputMode="numeric" value={prio} onChange={(e) => setPrio(e.target.value)} className="h-9 text-sm" /></div>
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Dias da semana">
          {DIAS.map((d) => (
            <button key={d.n} type="button" aria-pressed={dias.includes(d.n)} onClick={() => setDias((x) => (x.includes(d.n) ? x.filter((v) => v !== d.n) : [...x, d.n]))}
              className={`rounded-md border px-2.5 py-1 text-xs font-semibold ${dias.includes(d.n) ? 'border-brand bg-brand text-on-brand' : 'text-ink-700'}`}>{d.l}</button>
          ))}
        </div>
        <Button size="sm" disabled={busy || !unitId} onClick={() => void criar()} data-testid="criar-programacao"><Plus className="h-4 w-4" /> Adicionar programação</Button>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-bold text-ink-900">Exceções por data (feriado, evento)</p>
        {dados?.excecoes.map((e) => (
          <div key={e.id} className="flex items-center justify-between gap-2 rounded-lg border bg-surface p-2.5" data-testid="linha-excecao">
            <p className="min-w-[10rem] flex-1 text-sm text-ink-900">
              <b>{e.data.split('-').reverse().join('/')}</b> · {e.nome} — {e.semConferencia ? 'sem conferência' : e.tipo === 'COMPLETA' ? 'completa' : `faixa ${e.faixaDe}–${e.faixaAte}`}
            </p>
            <Button size="sm" variant="ghost" className="text-danger" disabled={busy} aria-label="Excluir exceção" onClick={() => void enviar({ action: 'excluirExcecao', id: e.id })}><Trash2 className="h-4 w-4" /></Button>
          </div>
        ))}
        <div className="grid grid-cols-2 gap-2 rounded-lg border border-dashed p-3 sm:grid-cols-4">
          <div><Label htmlFor="ex-data">Data</Label><Input id="ex-data" type="date" value={exData} onChange={(e) => setExData(e.target.value)} className="h-9 text-sm" /></div>
          <div><Label htmlFor="ex-nome">Motivo</Label><Input id="ex-nome" value={exNome} onChange={(e) => setExNome(e.target.value)} placeholder="Ex.: Feriado" className="h-9 text-sm" /></div>
          <div className="col-span-2">
            
            <Select label="Nesse dia" value={exModo} onValueChange={(v) => setExModo(v as 'SKIP' | 'FAIXA_DO_DIA' | 'COMPLETA')} options={[{ value: 'SKIP', label: 'Sem conferência programada' }, { value: 'FAIXA_DO_DIA', label: 'Faixa do dia diferente' }, { value: 'COMPLETA', label: 'Conferência completa' }]} />
          </div>
          {exModo === 'FAIXA_DO_DIA' && (<>
            <div><Label htmlFor="ex-de">Comanda de</Label><Input id="ex-de" inputMode="numeric" value={exDe} onChange={(e) => setExDe(e.target.value)} className="h-9 text-sm" /></div>
            <div><Label htmlFor="ex-ate">até</Label><Input id="ex-ate" inputMode="numeric" value={exAte} onChange={(e) => setExAte(e.target.value)} className="h-9 text-sm" /></div>
          </>)}
          <div className="col-span-2 sm:col-span-4"><Button size="sm" disabled={busy || !unitId} onClick={() => void criarExcecao()} data-testid="criar-excecao"><Plus className="h-4 w-4" /> Salvar exceção</Button></div>
        </div>
      </div>

      {msg && <p className="text-sm font-medium text-danger" role="alert">{msg}</p>}
    </div>
  );
}
