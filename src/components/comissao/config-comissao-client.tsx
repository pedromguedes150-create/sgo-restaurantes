'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Save } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/ds/button';
import { Input } from '@/components/ui/input';
import { Banner } from '@/components/ui/ds/banner';
import type { FuncaoDaCozinha } from '@/lib/comissao/config';

/**
 * Configurações → Comissão: os dois percentuais (só o Admin) e as FUNÇÕES do
 * RH que dividem a parte da cozinha (Admin/CEO/Coordenador marcam).
 */
export function ConfigComissaoClient({ percentuais, funcoes, podeEditarPct, podeEditarFuncoes }: {
  percentuais: { vendedor: number; cozinha: number };
  funcoes: FuncaoDaCozinha[];
  podeEditarPct: boolean;
  podeEditarFuncoes: boolean;
}) {
  const router = useRouter();
  const [vendedor, setVendedor] = useState(String(percentuais.vendedor).replace('.', ','));
  const [cozinha, setCozinha] = useState(String(percentuais.cozinha).replace('.', ','));
  const [marcadas, setMarcadas] = useState<Set<string>>(() => new Set(funcoes.filter((f) => f.marcada).map((f) => f.jobTitleKey)));
  const [busca, setBusca] = useState('');
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger'; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState<'pct' | 'funcoes' | null>(null);

  const lista = useMemo(() => {
    const q = busca.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
    return funcoes.filter((f) => !q || f.jobTitle.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().includes(q));
  }, [funcoes, busca]);
  const pessoasNaCozinha = funcoes.filter((f) => marcadas.has(f.jobTitleKey)).reduce((s, f) => s + f.colaboradores, 0);

  async function salvar(acao: 'percentuais' | 'funcoes') {
    setOcupado(acao === 'percentuais' ? 'pct' : 'funcoes'); setMsg(null);
    const body = acao === 'percentuais'
      ? { acao, vendedor: Number(vendedor.replace(',', '.')), cozinha: Number(cozinha.replace(',', '.')) }
      : { acao, jobTitles: funcoes.filter((f) => marcadas.has(f.jobTitleKey)).map((f) => f.jobTitle) };
    const r = await fetch('/api/comissao/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const b = await r.json().catch(() => ({}));
    setOcupado(null);
    if (!r.ok) { setMsg({ tone: 'danger', texto: b.error ?? 'Falha ao gravar.' }); return; }
    setMsg({ tone: 'success', texto: acao === 'percentuais' ? 'Percentuais gravados.' : `Funções da cozinha gravadas (${marcadas.size}).` });
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {msg && <Banner tone={msg.tone} title={msg.texto} />}
      <Card><CardContent className="space-y-3 pt-4">
        <p className="sgo-type-15 font-semibold text-ink-900">Percentuais</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm"><span className="mb-1 block font-medium text-ink-900">Vendedor com nome — % da própria venda</span><Input inputMode="decimal" value={vendedor} onChange={(e) => setVendedor(e.target.value)} disabled={!podeEditarPct} className="h-10 w-32 text-right tabular-nums" aria-label="Percentual do vendedor" /></label>
          <label className="block text-sm"><span className="mb-1 block font-medium text-ink-900">Cozinha — % da venda do GRUPO BEIJA FLOR</span><Input inputMode="decimal" value={cozinha} onChange={(e) => setCozinha(e.target.value)} disabled={!podeEditarPct} className="h-10 w-32 text-right tabular-nums" aria-label="Percentual da cozinha" /></label>
        </div>
        <p className="text-xs text-ink-500">Valem para as PRÓXIMAS apurações; o que já foi gravado guarda o percentual usado. {podeEditarPct ? '' : 'Só o Administrador altera.'}</p>
        {podeEditarPct && <Button size="sm" onClick={() => void salvar('percentuais')} loading={ocupado === 'pct'}><Save className="h-4 w-4" /> Salvar percentuais</Button>}
      </CardContent></Card>

      <Card><CardContent className="space-y-3 pt-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="sgo-type-15 font-semibold text-ink-900">Funções que dividem a comissão da cozinha</p>
            <p className="text-xs text-ink-500">Cargos como vêm do RH. Em cada unidade, os colaboradores ativos com uma dessas funções dividem em partes iguais os {cozinha}% da venda do grupo. Hoje: {marcadas.size} função(ões) · {pessoasNaCozinha} pessoa(s) na rede.</p>
          </div>
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar função…" className="h-9 w-56 text-sm" aria-label="Buscar função" />
        </div>
        <ul className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3" data-testid="funcoes-cozinha">
          {lista.map((f) => (
            <li key={f.jobTitleKey}>
              <label className={`flex items-center gap-2 rounded-control border px-3 py-2 text-sm ${marcadas.has(f.jobTitleKey) ? 'border-brand bg-brand/5' : 'border-line bg-surface'}`}>
                <input type="checkbox" checked={marcadas.has(f.jobTitleKey)} disabled={!podeEditarFuncoes} onChange={(e) => setMarcadas((s) => { const n = new Set(s); if (e.target.checked) n.add(f.jobTitleKey); else n.delete(f.jobTitleKey); return n; })} />
                <span className="min-w-0 flex-1 truncate text-ink-900">{f.jobTitle}</span>
                <span className="text-xs tabular-nums text-ink-500">{f.colaboradores}</span>
              </label>
            </li>
          ))}
        </ul>
        {lista.length === 0 && <p className="text-sm text-ink-500">Nenhuma função encontrada.</p>}
        {podeEditarFuncoes && <Button size="sm" onClick={() => void salvar('funcoes')} loading={ocupado === 'funcoes'}><Save className="h-4 w-4" /> Salvar funções da cozinha</Button>}
      </CardContent></Card>
    </div>
  );
}
