'use client';

import { useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { CalendarCog, PencilLine, Save } from 'lucide-react';
import { Select } from '@/components/ui/ds/select';

const br = (iso: string | null | undefined) => (iso ? iso.split('-').reverse().join('/') : '—');

export interface PeriodoUI {
  inicio: string; fim: string; limite: string; diasGozados: number; diasVendidos: number; diasInformados: number; saldo: number;
  situacao: 'EM_AQUISICAO' | 'A_VENCER' | 'VENCIDO' | 'QUITADO' | 'ANTERIOR_AO_SGO';
}
export interface FichaDeFerias {
  id: string; nome: string; funcao: string | null; unidade: string;
  admissaoRh: string | null; admissaoManual: string | null; admissaoManualNota: string | null; admissaoManualPor: string | null; admissaoManualEm: string | null;
  periodos: PeriodoUI[];
  ajustes: Record<string, { dias: number; observacao: string | null; por: string; em: string }>;
  orfaos: { tipo: string; periodoInicio: string; dias: number }[];
}

const SITUACAO: Record<PeriodoUI['situacao'], { txt: string; cls: string }> = {
  EM_AQUISICAO: { txt: 'Em aquisição', cls: 'sgo-tag--blue' },
  A_VENCER: { txt: 'A conceder', cls: 'sgo-tag--amber' },
  VENCIDO: { txt: 'Vencido', cls: 'sgo-tag--red' },
  QUITADO: { txt: 'Quitado', cls: 'sgo-tag--green' },
  ANTERIOR_AO_SGO: { txt: 'Anterior ao SGO', cls: 'sgo-tag--gray' },
};

async function enviar(body: Record<string, unknown>): Promise<string | null> {
  const res = await fetch('/api/people/vacations/ajuste', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (res.ok) return null;
  const d = await res.json().catch(() => ({}));
  return d.error ?? 'Não foi possível salvar.';
}

/** Uma linha de período: dias já gozados fora do SGO + observação. */
function LinhaDoPeriodo({ colabId, p, ajuste, podeEditar }: { colabId: string; p: PeriodoUI; ajuste?: FichaDeFerias['ajustes'][string]; podeEditar: boolean }) {
  const router = useRouter();
  const [dias, setDias] = useState(String(ajuste?.dias ?? ''));
  const [obs, setObs] = useState(ajuste?.observacao ?? '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const mudou = (Number(dias || 0) !== (ajuste?.dias ?? 0)) || (obs !== (ajuste?.observacao ?? ''));

  async function salvar() {
    setBusy(true); setMsg(null);
    const erro = await enviar({ acao: 'gozo', collaboratorId: colabId, periodoInicio: p.inicio, diasGozados: Number(dias || 0), observacao: obs });
    setBusy(false);
    if (erro) { setMsg({ ok: false, t: erro }); return; }
    setMsg({ ok: true, t: 'Salvo.' }); router.refresh();
  }

  return (
    <tr>
      <td className="tabular-nums">{br(p.inicio)} a {br(p.fim)}<span className="block text-xs text-ink-500">conceder até {br(p.limite)}</span></td>
      <td className="text-right tabular-nums">{p.diasGozados - p.diasInformados || '—'}</td>
      <td className="text-right tabular-nums">{p.diasVendidos || '—'}</td>
      <td>
        {podeEditar ? (
          <input type="number" min={0} max={30} value={dias} onChange={(e) => setDias(e.target.value.replace(/\D/g, ''))} placeholder="0"
            aria-label={`Dias já gozados fora do SGO no período de ${br(p.inicio)}`} data-testid={`dias-${p.inicio}`}
            className="h-9 w-20 rounded-control border border-line bg-surface px-2 text-right text-sm tabular-nums text-ink-900 outline-none focus:border-brand" />
        ) : <span className="tabular-nums">{ajuste?.dias ?? '—'}</span>}
      </td>
      <td className="min-w-48">
        {podeEditar ? (
          <input value={obs} onChange={(e) => setObs(e.target.value)} maxLength={200} placeholder="Ex.: férias de jan/2025 (antes do SGO)"
            aria-label="Observação" className="h-9 w-full rounded-control border border-line bg-surface px-2 text-sm text-ink-900 outline-none focus:border-brand" />
        ) : <span className="text-xs text-ink-700">{ajuste?.observacao ?? '—'}</span>}
        {ajuste && <span className="mt-0.5 block text-xs text-ink-500">por {ajuste.por} em {br(ajuste.em)}</span>}
        {msg && <span className={`mt-0.5 block text-xs ${msg.ok ? 'text-success' : 'text-danger'}`}>{msg.t}</span>}
      </td>
      <td className="text-right font-semibold tabular-nums">{p.saldo}</td>
      <td><span className={`sgo-tag ${SITUACAO[p.situacao].cls}`}>{SITUACAO[p.situacao].txt}</span></td>
      <td className="text-right">
        {podeEditar && <button type="button" className="sgo-btn sgo-btn--sm" disabled={!mudou || busy} onClick={() => void salvar()} data-testid={`salvar-${p.inicio}`}><Save className="h-3.5 w-3.5" /> Salvar</button>}
      </td>
    </tr>
  );
}

/**
 * Aba AJUSTES MANUAIS do Controle de Férias (v1.154.0): corrigir a admissão
 * que veio errada do RH e informar os dias já gozados que não estão no SGO
 * (antes de o SGO existir, ou que o RH não mandou). O sync do RH não mexe
 * em nada disto.
 */
export function AjustesFerias({ colaboradores, ficha, podeEditar, podeAdmissao }: {
  colaboradores: { id: string; nome: string; hint: string }[];
  ficha: FichaDeFerias | null;
  podeEditar: boolean;
  podeAdmissao: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [adm, setAdm] = useState(ficha?.admissaoManual ?? '');
  const [motivo, setMotivo] = useState(ficha?.admissaoManualNota ?? '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);

  function escolher(id: string) {
    const q = new URLSearchParams(sp?.toString() ?? '');
    q.set('aba', 'ajustes'); q.set('colaborador', id);
    router.push(`${pathname}?${q.toString()}`);
  }

  async function salvarAdmissao(limpar = false) {
    if (!ficha) return;
    setBusy(true); setMsg(null);
    const erro = await enviar({ acao: 'admissao', collaboratorId: ficha.id, data: limpar ? null : adm || null, motivo });
    setBusy(false);
    if (erro) { setMsg({ ok: false, t: erro }); return; }
    if (limpar) { setAdm(''); setMotivo(''); }
    setMsg({ ok: true, t: limpar ? 'Voltou a usar a admissão do RH.' : 'Admissão corrigida.' }); router.refresh();
  }

  return (
    <div className="space-y-4" data-testid="aba-ajustes">
      <div className="sgo-panel sgo-panel--solid space-y-2 p-4">
        <p className="flex items-center gap-1.5 sgo-type-15 font-semibold text-ink-900"><PencilLine className="h-4 w-4 text-brand" /> Preencher à mão o que veio errado ou faltando do RH</p>
        <p className="text-xs text-ink-500">Use quando a admissão do RH estiver errada ou para lançar as férias já tiradas antes de o SGO existir. O sync do RH não apaga nada daqui.</p>
        <div className="max-w-xl">
          <Select aria-label="Colaborador" searchable placeholder="Escolha o colaborador…" value={ficha?.id ?? ''} onValueChange={escolher}
            options={colaboradores.map((c) => ({ value: c.id, label: c.nome, hint: c.hint }))} />
        </div>
      </div>

      {ficha && (
        <>
          <div className="sgo-panel sgo-panel--solid space-y-3 p-4">
            <p className="flex items-center gap-1.5 sgo-type-15 font-semibold text-ink-900"><CalendarCog className="h-4 w-4 text-brand" /> Admissão — {ficha.nome}</p>
            <p className="text-sm text-ink-700">
              Admissão do RH: <b className="tabular-nums">{br(ficha.admissaoRh)}</b>
              {ficha.admissaoManual && <> · em uso: <b className="tabular-nums text-brand">{br(ficha.admissaoManual)}</b> (corrigida por {ficha.admissaoManualPor} em {br(ficha.admissaoManualEm)})</>}
            </p>
            {podeAdmissao ? (
              <div className="grid gap-2 md:grid-cols-[12rem_minmax(0,1fr)_auto] md:items-end">
                <label className="block"><span className="sgo-label mb-1 block">Admissão correta</span>
                  <input type="date" value={adm} onChange={(e) => setAdm(e.target.value)} aria-label="Admissão correta" data-testid="admissao-manual"
                    className="h-10 w-full rounded-control border border-line bg-surface px-3 text-sm text-ink-900 outline-none focus:border-brand" />
                </label>
                <label className="block"><span className="sgo-label mb-1 block">Motivo (obrigatório)</span>
                  <input value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={200} placeholder="Ex.: RH com a data da transferência, não da admissão"
                    className="h-10 w-full rounded-control border border-line bg-surface px-3 text-sm text-ink-900 outline-none focus:border-brand" />
                </label>
                <div className="flex gap-2">
                  <button type="button" className="sgo-btn sgo-btn--primary" disabled={busy || !adm || !motivo.trim()} onClick={() => void salvarAdmissao()} data-testid="salvar-admissao">Corrigir</button>
                  {ficha.admissaoManual && <button type="button" className="sgo-btn" disabled={busy} onClick={() => void salvarAdmissao(true)}>Usar a do RH</button>}
                </div>
              </div>
            ) : <p className="text-xs text-ink-500">Corrigir a admissão é com a Supervisão ou o Administrador.</p>}
            {msg && <p className={`text-sm ${msg.ok ? 'text-success' : 'text-danger'}`} role="status">{msg.t}</p>}
            {ficha.orfaos.length > 0 && (
              <p className="sgo-aviso sgo-aviso--atencao" data-testid="orfaos">
                Com a admissão atual, {ficha.orfaos.length === 1 ? 'este registro ficou' : 'estes registros ficaram'} sem período e NÃO {ficha.orfaos.length === 1 ? 'entra' : 'entram'} na conta: {ficha.orfaos.map((o) => `${o.tipo} de ${o.dias} dia(s) do período iniciado em ${br(o.periodoInicio)}`).join(' · ')}. Lance de novo no período certo (e exclua a venda antiga na aba Abono).
              </p>
            )}
          </div>

          <div className="sgo-panel overflow-hidden">
            <div className="sgo-panel__hdr"><div className="sgo-panel__title">Períodos aquisitivos — dias já gozados fora do SGO</div></div>
            {ficha.periodos.length === 0 ? <p className="p-4 text-sm text-ink-500">Sem admissão — corrija a admissão acima para os períodos aparecerem.</p> : (
              <div className="overflow-x-auto">
                <table className="sgo-tbl w-full text-sm" data-testid="tabela-ajustes">
                  <thead><tr><th className="text-left">Período</th><th className="text-right">Gozados no SGO</th><th className="text-right">Vendidos</th><th className="text-left">Gozados fora do SGO</th><th className="text-left">Observação</th><th className="text-right">Saldo</th><th className="text-left">Situação</th><th /></tr></thead>
                  <tbody>
                    {ficha.periodos.map((p) => <LinhaDoPeriodo key={p.inicio} colabId={ficha.id} p={p} ajuste={ficha.ajustes[p.inicio]} podeEditar={podeEditar} />)}
                  </tbody>
                </table>
              </div>
            )}
            <p className="px-4 pb-3 pt-2 text-xs text-ink-500">
              Informe só os dias que <b>não</b> estão lançados no SGO (senão contam duas vezes). Período “Anterior ao SGO” que recebe dias informados passa a ser cobrado normalmente — se o total não chegar a 30 e o prazo tiver passado, ele aparece como vencido. Para zerar, salve 0.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
