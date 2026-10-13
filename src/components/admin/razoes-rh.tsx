'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, Link2, Loader2, Plus, Search, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/ui/status-badge';

import { formatarCnpj, type Conferencia, type LinhaDaUnidade } from '@/lib/rh/razoes-calculo';

/**
 * Razões sociais ADICIONAIS do RH por unidade + conferência de todas (v1.166.0).
 * Toda ligação passa por um critério obrigatório conferido no servidor contra o
 * RH: CNPJ exato (de UMA razão social) ou nome idêntico ao do RH.
 */
export interface RazaoAdicional { id: string; rhName: string; cnpj: string | null; criterio: 'NOME' | 'CNPJ'; createdByName: string | null }

async function postRazoes(body: Record<string, unknown>): Promise<{ ok: boolean; error?: string; candidatos?: string[]; rhName?: string }> {
  const r = await fetch('/api/rh/razoes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  return { ok: r.ok, ...d };
}

/** Dentro do cartão da unidade: lista as adicionais e liga mais uma. */
export function RazoesAdicionais({ unitId, temPrincipal, adicionais }: { unitId: string; temPrincipal: boolean; adicionais: RazaoAdicional[] }) {
  const router = useRouter();
  const [criterio, setCriterio] = useState<'CNPJ' | 'NOME'>('CNPJ');
  const [valor, setValor] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tom: 'ok' | 'erro'; texto: string; candidatos?: string[] } | null>(null);

  async function adicionar() {
    setBusy(true); setMsg(null);
    const r = await postRazoes({ acao: 'adicionar', unitId, criterio, valor });
    setBusy(false);
    if (!r.ok) { setMsg({ tom: 'erro', texto: r.error ?? 'Falha', candidatos: r.candidatos }); return; }
    setValor(''); setMsg({ tom: 'ok', texto: `Ligada: ${r.rhName}. Clique em Sincronizar para trazer as pessoas.` }); router.refresh();
  }
  async function remover(a: RazaoAdicional) {
    if (!confirm(`Deixar de ler "${a.rhName}" nesta unidade? Quem já entrou por ela continua vinculado (tire pela lista de Pessoas, se precisar).`)) return;
    setBusy(true);
    const r = await postRazoes({ acao: 'remover', id: a.id });
    setBusy(false);
    if (!r.ok) { setMsg({ tom: 'erro', texto: r.error ?? 'Falha' }); return; }
    router.refresh();
  }

  return (
    <div className="mt-2 rounded-lg border border-line p-2" data-testid={`razoes-adicionais-${unitId}`}>
      <Label className="text-xs">Outras razões sociais do RH desta unidade</Label>
      <p className="text-xs text-ink-500">Para quando a mesma operação tem gente cadastrada em mais de uma empresa no RH. Só liga por <b>CNPJ</b> ou por <b>nome idêntico</b> ao do RH.</p>
      {adicionais.length > 0 && (
        <ul className="mt-2 space-y-1">
          {adicionais.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-2 rounded-md bg-sunken/40 px-2 py-1 text-xs">
              <span className="min-w-0">
                <b className="text-ink-900">{a.rhName}</b>
                <span className="ml-1 text-ink-500">· {a.criterio === 'CNPJ' ? `por CNPJ ${formatarCnpj(a.cnpj)}` : 'nome idêntico'}{a.createdByName ? ` · ${a.createdByName}` : ''}</span>
              </span>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => void remover(a)} aria-label="Remover" className="text-danger"><Trash2 className="h-4 w-4" /></Button>
            </li>
          ))}
        </ul>
      )}
      {temPrincipal ? (
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <div className="flex gap-1" role="radiogroup" aria-label="Critério">
            {(['CNPJ', 'NOME'] as const).map((c) => (
              <button key={c} type="button" role="radio" aria-checked={criterio === c} onClick={() => setCriterio(c)} className={`sgo-btn sgo-btn--sm ${criterio === c ? 'sgo-btn--primary' : ''}`} data-testid={`criterio-${c}`}>{c === 'CNPJ' ? 'CNPJ' : 'Nome idêntico'}</button>
            ))}
          </div>
          <Input value={valor} onChange={(e) => setValor(e.target.value)} placeholder={criterio === 'CNPJ' ? '00.000.000/0000-00' : 'Exatamente como no RH'} inputMode={criterio === 'CNPJ' ? 'numeric' : 'text'} className="h-10 min-w-0 flex-1 text-sm" aria-label="Valor do critério" />
          <Button size="sm" disabled={busy || !valor.trim()} onClick={() => void adicionar()}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Ligar</Button>
        </div>
      ) : (
        <p className="mt-2 text-xs text-ink-500">Defina primeiro o &ldquo;Nome no RH&rdquo; principal acima.</p>
      )}
      {msg && (
        <div className={`mt-1 text-xs font-medium ${msg.tom === 'ok' ? 'text-success' : 'text-danger'}`}>
          {msg.texto}
          {msg.candidatos && msg.candidatos.length > 0 && <ul className="list-disc pl-5 font-normal text-ink-700">{msg.candidatos.map((c) => <li key={c}><code>{c}</code></li>)}</ul>}
        </div>
      )}
    </div>
  );
}

/**
 * Conferência POR UNIDADE do SGO: o "Nome no RH" de cada unidade existe
 * idêntico no RH? O CNPJ cadastrado na unidade aponta para alguma razão social
 * que ela ainda não lê? As demais empresas do grupo não aparecem.
 */
const ROTULO_SITUACAO: Record<LinhaDaUnidade['situacao'], { texto: string; tom: 'success' | 'medium' | 'critical' | 'neutral' }> = {
  OK: { texto: 'OK', tom: 'success' },
  NOME_NAO_EXISTE: { texto: 'Nome não existe no RH', tom: 'critical' },
  CNPJ_APONTA_OUTRA: { texto: 'CNPJ da unidade tem outra razão social', tom: 'medium' },
  SEM_NOME: { texto: 'Sem "Nome no RH"', tom: 'neutral' },
};

export function ConferenciaRazoesRh() {
  const router = useRouter();
  const [dados, setDados] = useState<Conferencia | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ligando, setLigando] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  async function conferir() {
    setCarregando(true); setErro(null);
    try {
      const r = await fetch('/api/rh/razoes');
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setErro(d.error ?? 'Falha ao consultar o RH.'); return; }
      setDados(d as Conferencia);
    } finally { setCarregando(false); }
  }
  /* A sugestão saiu do CNPJ cadastrado na unidade: liga por esse CNPJ. Se o
     CNPJ servir a mais de uma razão social, liga pelo nome idêntico daquela. */
  async function ligar(l: LinhaDaUnidade, nome: string) {
    setLigando(l.unitId + nome); setAviso(null);
    const porCnpj = l.sugeridasPeloCnpj.length === 1 && l.cnpj;
    const r = await postRazoes({ acao: 'adicionar', unitId: l.unitId, criterio: porCnpj ? 'CNPJ' : 'NOME', valor: porCnpj ? l.cnpj : nome });
    setLigando(null);
    if (!r.ok) { setAviso(r.error ?? 'Falha'); return; }
    setAviso(`${l.unitName} passa a ler também "${nome}". Clique em Sincronizar na unidade para trazer as pessoas.`);
    router.refresh(); void conferir();
  }

  return (
    <div className="space-y-3" data-testid="conferencia-razoes">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="flex items-center gap-1.5 font-semibold text-ink-900"><Building2 className="h-4 w-4 text-brand" /> Conferência das unidades com o RH</p>
          <p className="text-xs text-ink-500">Para cada unidade do SGO: o &ldquo;Nome no RH&rdquo; existe idêntico no RH, quantas pessoas ele traz, e se o CNPJ cadastrado na unidade tem alguma outra razão social que ela ainda não lê. As demais empresas do grupo não entram aqui.</p>
        </div>
        <Button size="sm" variant="outline" disabled={carregando} onClick={() => void conferir()} data-testid="conferir-razoes">{carregando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} {dados ? 'Conferir de novo' : 'Conferir agora'}</Button>
      </div>
      {erro && <p className="text-sm font-medium text-danger" role="alert">{erro}</p>}
      {aviso && <p className="text-sm font-medium text-ink-700">{aviso}</p>}
      {dados && (
        <>
          <p className="text-sm text-ink-700">{dados.totais.unidades} unidade(s) ativas · <b className="text-success">{dados.totais.ok} OK</b> · <b className={dados.totais.comAlerta ? 'text-warning' : ''}>{dados.totais.comAlerta} para conferir</b></p>
          <div className="overflow-x-auto">
            <table className="sgo-tbl w-full text-sm" data-testid="tabela-razoes">
              <thead><tr><th className="text-left">Unidade</th><th className="text-left">Razões sociais lidas</th><th className="text-right">Pessoas</th><th className="text-left">CNPJ da unidade</th><th className="text-left">Situação</th></tr></thead>
              <tbody>
                {dados.unidades.map((l) => (
                  <tr key={l.unitId} data-testid={`conferencia-${l.unitId}`}>
                    <td className="whitespace-nowrap font-medium text-ink-900">{l.unitName}</td>
                    <td>
                      {[l.principal, ...l.adicionais].filter(Boolean).map((n) => (
                        <div key={n!.nome} className="text-xs">
                          <code className={n!.existe ? 'text-ink-900' : 'text-danger'}>{n!.nome}</code>
                          <span className="ml-1 text-ink-500">{n!.existe ? `· ${n!.pessoas} pessoa(s)` : '· não existe idêntico no RH'}</span>
                        </div>
                      ))}
                      {!l.principal && <span className="text-xs text-ink-500">—</span>}
                    </td>
                    <td className="text-right tabular-nums">{l.pessoasLidas}</td>
                    <td className="whitespace-nowrap text-xs text-ink-500">{l.cnpj ? formatarCnpj(l.cnpj) : 'não cadastrado'}</td>
                    <td className="min-w-56">
                      <StatusBadge tone={ROTULO_SITUACAO[l.situacao].tom}>{ROTULO_SITUACAO[l.situacao].texto}</StatusBadge>
                      {l.sugeridasPeloCnpj.map((s) => (
                        <div key={s.nome} className="mt-1 flex flex-wrap items-center gap-1 text-xs">
                          <code className="text-ink-900">{s.nome}</code><span className="text-ink-500">· {s.pessoas} pessoa(s)</span>
                          <Button size="sm" variant="outline" disabled={!l.principal || ligando === l.unitId + s.nome} onClick={() => void ligar(l, s.nome)} aria-label={`Ligar ${s.nome} a ${l.unitName}`}>{ligando === l.unitId + s.nome ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />} Ligar</Button>
                        </div>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-ink-500">A sugestão só aparece quando o CNPJ CADASTRADO na unidade (Editar → CNPJ) é o mesmo da razão social no RH. Fora disso, ligue pelo cartão da unidade, por CNPJ ou nome idêntico.</p>
        </>
      )}
    </div>
  );
}
