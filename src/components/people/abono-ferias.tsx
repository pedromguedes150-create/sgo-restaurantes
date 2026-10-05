'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { HandCoins, Trash2 } from 'lucide-react';
import { Select } from '@/components/ui/ds/select';

const br = (iso: string) => iso.split('-').reverse().join('/');

export interface ColaboradorVendavel { id: string; nome: string; funcao: string | null; unidade: string; vendaveis: { inicio: string; fim: string; saldo: number }[] }
export interface AbonoRegistrado { id: string; colaborador: string; collaboratorId: string; unidade: string; periodoInicio: string; dias: number; observacao: string | null; por: string; em: string; podeExcluir: boolean }

/**
 * Aba ABONO do Controle de Férias (v1.153.0): registrar a VENDA de dias de
 * férias (até 10 por período — 1/3, CLT art. 143). Ex.: tirou 20, vendeu 10.
 * O formulário só oferece períodos com saldo e sem abono; o servidor confere
 * tudo de novo (escopo, limite de 10, saldo, um por período).
 */
export function AbonoFerias({ colaboradores, abonos, podeRegistrar, maxDias }: {
  colaboradores: ColaboradorVendavel[];
  abonos: AbonoRegistrado[];
  podeRegistrar: boolean;
  maxDias: number;
}) {
  const router = useRouter();
  const [colab, setColab] = useState('');
  const [periodo, setPeriodo] = useState('');
  const [dias, setDias] = useState(String(maxDias));
  const [obs, setObs] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);

  const comVenda = useMemo(() => colaboradores.filter((c) => c.vendaveis.length > 0), [colaboradores]);
  const escolhido = comVenda.find((c) => c.id === colab) ?? null;
  const per = escolhido?.vendaveis.find((p) => p.inicio === periodo) ?? null;
  const limite = per ? Math.min(maxDias, per.saldo) : maxDias;
  const n = Number(dias);
  const valido = Boolean(escolhido && per && Number.isInteger(n) && n >= 1 && n <= limite);

  async function enviar(body: Record<string, unknown>, sucesso: string) {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch('/api/people/vacations/abono', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg({ ok: false, texto: data.error ?? 'Não foi possível salvar.' }); return false; }
      setMsg({ ok: true, texto: sucesso }); router.refresh(); return true;
    } finally { setBusy(false); }
  }

  async function registrar() {
    if (!valido || !escolhido || !per) return;
    const ok = await enviar({ acao: 'registrar', collaboratorId: escolhido.id, periodoInicio: per.inicio, dias: n, observacao: obs }, `Registrado: ${escolhido.nome} vendeu ${n} dia(s) — gozo restante ${per.saldo - n} dia(s).`);
    if (ok) { setColab(''); setPeriodo(''); setDias(String(maxDias)); setObs(''); }
  }

  return (
    <div className="space-y-4" data-testid="aba-abono">
      {podeRegistrar && (
        <div className="sgo-panel sgo-panel--solid space-y-3 p-4">
          <p className="flex items-center gap-1.5 sgo-type-15 font-semibold text-ink-900"><HandCoins className="h-4 w-4 text-brand" /> Registrar venda de férias (abono pecuniário)</p>
          <p className="text-xs text-ink-500">O colaborador pode vender até <b>{maxDias} dias</b> (1/3) de cada período aquisitivo — por exemplo, tirar 20 e vender 10. Os dias vendidos abatem o saldo do período.</p>
          <div className="grid gap-3 md:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_8rem]">
            <div>
              <span className="sgo-label mb-1 block">Colaborador</span>
              <Select aria-label="Colaborador" searchable placeholder={comVenda.length ? 'Selecione…' : 'Ninguém com saldo para vender'} value={colab}
                onValueChange={(v) => { setColab(v); const c = comVenda.find((x) => x.id === v); setPeriodo(c?.vendaveis[0]?.inicio ?? ''); }}
                options={comVenda.map((c) => ({ value: c.id, label: c.nome, hint: [c.funcao, c.unidade].filter(Boolean).join(' · ') }))} />
            </div>
            <div>
              <span className="sgo-label mb-1 block">Período aquisitivo</span>
              <Select aria-label="Período aquisitivo" placeholder="Escolha o colaborador" value={periodo} onValueChange={setPeriodo}
                options={(escolhido?.vendaveis ?? []).map((p) => ({ value: p.inicio, label: `${br(p.inicio)} a ${br(p.fim)}`, hint: `saldo ${p.saldo} dias` }))} />
            </div>
            <label className="block">
              <span className="sgo-label mb-1 block">Dias vendidos</span>
              <input type="number" min={1} max={limite} value={dias} onChange={(e) => setDias(e.target.value.replace(/\D/g, ''))}
                className="h-10 w-full rounded-control border border-line bg-surface px-3 text-right text-sm tabular-nums text-ink-900 outline-none focus:border-brand" aria-label="Dias vendidos" data-testid="dias-abono" />
            </label>
          </div>
          <label className="block">
            <span className="sgo-label mb-1 block">Observação (opcional)</span>
            <input value={obs} onChange={(e) => setObs(e.target.value)} maxLength={200} placeholder="Ex.: pedido do colaborador junto com as férias de 20 dias"
              className="h-10 w-full rounded-control border border-line bg-surface px-3 text-sm text-ink-900 outline-none focus:border-brand" />
          </label>
          {per && (
            <p className="text-sm text-ink-700">Período {br(per.inicio)} a {br(per.fim)}: <b>{n || 0} vendido(s)</b> + <b>{Math.max(0, per.saldo - (n || 0))} para gozar</b> (saldo atual {per.saldo}).</p>
          )}
          {msg && <p className={`text-sm ${msg.ok ? 'text-success' : 'text-danger'}`} role="status">{msg.texto}</p>}
          <button type="button" className="sgo-btn sgo-btn--primary" disabled={!valido || busy} onClick={() => void registrar()} data-testid="registrar-abono">Registrar venda</button>
        </div>
      )}

      <div className="sgo-panel overflow-hidden">
        <div className="sgo-panel__hdr"><div className="sgo-panel__title">Vendas registradas</div><span className="sgo-count">{abonos.length}</span></div>
        {abonos.length === 0 ? <p className="p-4 text-sm text-ink-500">Nenhuma venda de férias registrada.</p> : (
          <div className="overflow-x-auto">
            <table className="sgo-tbl w-full text-sm" data-testid="tabela-abonos">
              <thead><tr><th className="text-left">Colaborador</th><th className="text-left">Unidade</th><th className="text-left">Período aquisitivo</th><th className="text-right">Dias vendidos</th><th className="text-left">Registrado por</th><th /></tr></thead>
              <tbody>
                {abonos.map((a) => (
                  <tr key={a.id}>
                    <td><a href={`/modulos/pessoas/colaborador/${a.collaboratorId}`} className="font-semibold text-ink-900 hover:text-brand hover:underline">{a.colaborador}</a>{a.observacao && <span className="block text-xs text-ink-500">{a.observacao}</span>}</td>
                    <td className="text-ink-700">{a.unidade}</td>
                    <td className="tabular-nums">desde {br(a.periodoInicio)}</td>
                    <td className="text-right font-semibold tabular-nums">{a.dias}</td>
                    <td className="text-xs text-ink-500">{a.por} · {br(a.em)}</td>
                    <td className="text-right">
                      {a.podeExcluir && (
                        <button type="button" className="sgo-btn sgo-btn--icon sgo-btn--ghost" aria-label={`Excluir venda de ${a.colaborador}`} disabled={busy}
                          onClick={() => { if (window.confirm(`Excluir a venda de ${a.dias} dia(s) de ${a.colaborador}? O saldo do período volta.`)) void enviar({ acao: 'excluir', id: a.id }, 'Venda excluída.'); }}>
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
