'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Upload } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/ds/button';
import { Select } from '@/components/ui/ds/select';
import { Banner } from '@/components/ui/ds/banner';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/ds/status-badge';
import { SgoKpi, SgoKpis } from '@/components/sgo/sgo-kpi';
import { formatBRL } from '@/lib/utils';

/** Percentual em pt-BR: 0,5% e não 0.5%. */
const pctBR = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 3 });
import { arredondar2, competenciaDePagamento, mesDeApuracao, rotuloDoMes, ROTULO_KIND, type LinhaDaApuracao, type TotaisDaApuracao } from '@/lib/comissao/calculo';
import type { Previa } from '@/lib/comissao/apuracao';

/**
 * APURAÇÃO DA COMISSÃO — unidade, mês de venda, planilha, CONFERIR, gravar.
 *
 * A prévia é a folha de conferência: cada vendedor com a venda, o %, a
 * comissão calculada e um campo de AJUSTE com motivo (o que foi combinado com
 * o funcionário). Quem não casou com funcionário da unidade aparece sem
 * comissão, com a lista do cadastro para vincular. Nada é gravado até
 * "Confirmar apuração" — e a confirmação reenvia a planilha: o servidor
 * refaz a conta e só aceita daqui os ajustes e os vínculos, por chave.
 */

type Ajustes = Record<string, { ajuste: string; motivo: string }>;

const KIND_TONE: Record<LinhaDaApuracao['kind'], 'success' | 'neutral' | 'warning' | 'info'> = {
  VENDEDOR: 'success', COZINHA: 'info', GRUPO: 'neutral', FREELANCER: 'neutral', NAO_CADASTRADO: 'warning',
};

export function ApuracaoClient({ unidades, meses, mesInicial, percentuais, funcoesDaCozinha }: {
  unidades: { id: string; name: string }[];
  /** Meses de venda oferecidos (AAAA-MM), do mais recente ao mais antigo. */
  meses: string[];
  mesInicial: string;
  percentuais: { vendedor: number; cozinha: number };
  /** Quantas funções estão marcadas para a cozinha (0 = nada vai para a cozinha). */
  funcoesDaCozinha: number;
}) {
  const router = useRouter();
  const [unitId, setUnitId] = useState<string | null>(unidades.length === 1 ? unidades[0].id : null);
  const [mesVenda, setMesVenda] = useState(mesInicial);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [ajustes, setAjustes] = useState<Ajustes>({});
  const [vinculos, setVinculos] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [pronto, setPronto] = useState<{ competencia: string; lancamentos: number; total: number; substituiu: boolean } | null>(null);
  const [verFreelancers, setVerFreelancers] = useState(false);
  const campo = useRef<HTMLInputElement>(null);

  function limpar() { setPrevia(null); setErro(null); setAjustes({}); setVinculos({}); }

  function ajustesParaEnvio() {
    const out: Record<string, { ajuste: number; motivo: string }> = {};
    for (const [k, a] of Object.entries(ajustes)) {
      const n = Number(String(a.ajuste).replace(',', '.'));
      if (Number.isFinite(n) && n !== 0) out[k] = { ajuste: n, motivo: a.motivo };
    }
    return out;
  }

  async function enviar(acao: 'previa' | 'confirmar', substituir = false, vinculosNovos?: Record<string, string>) {
    if (!unitId) { setErro('Escolha a unidade.'); return; }
    if (!arquivo) { setErro('Selecione a planilha "Produtividade por Vendedor — Analítico".'); return; }
    setOcupado(true); setErro(null);
    try {
      const fd = new FormData();
      fd.set('arquivo', arquivo); fd.set('unitId', unitId); fd.set('mesVenda', mesVenda); fd.set('acao', acao);
      fd.set('ajustes', JSON.stringify(ajustesParaEnvio()));
      fd.set('vinculos', JSON.stringify(vinculosNovos ?? vinculos));
      if (substituir) fd.set('substituir', 'true');
      const res = await fetch('/api/comissao/apuracao', { method: 'POST', body: fd });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setErro(body.error ?? 'Não foi possível ler a planilha.'); if (acao === 'previa') setPrevia(null); return; }
      if (acao === 'previa') setPrevia(body.previa);
      else { setPronto({ competencia: body.competencia, lancamentos: body.lancamentos, total: body.total, substituiu: Boolean(body.substituiu) }); router.refresh(); }
    } catch { setErro('Sem conexão. Confira a internet e tente de novo.'); }
    finally { setOcupado(false); }
  }

  /** Vincular um "não cadastrado" refaz a prévia: a conta é do servidor. */
  function vincular(bruto: string, collaboratorId: string) {
    const novos = { ...vinculos, [bruto]: collaboratorId };
    setVinculos(novos);
    void enviar('previa', false, novos);
  }

  const linhasVisiveis = useMemo(() => {
    if (!previa) return { vendedores: [], cozinha: [], naoCad: [], freelancers: [], grupo: [] as LinhaDaApuracao[] };
    return {
      vendedores: previa.linhas.filter((l) => l.kind === 'VENDEDOR'),
      cozinha: previa.linhas.filter((l) => l.kind === 'COZINHA'),
      naoCad: previa.linhas.filter((l) => l.kind === 'NAO_CADASTRADO'),
      freelancers: previa.linhas.filter((l) => l.kind === 'FREELANCER'),
      grupo: previa.linhas.filter((l) => l.kind === 'GRUPO'),
    };
  }, [previa]);

  /** Valor final mostrado na hora (o servidor refaz na confirmação). */
  function valorComAjuste(l: LinhaDaApuracao): number {
    const a = ajustes[l.chave];
    const n = a ? Number(String(a.ajuste).replace(',', '.')) : 0;
    return Math.max(0, arredondar2(l.calculado + (Number.isFinite(n) ? n : 0)));
  }
  const totalFinal = useMemo(() => {
    if (!previa) return 0;
    return arredondar2(previa.linhas.filter((l) => l.collaboratorId).reduce((s, l) => s + valorComAjuste(l), 0));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previa, ajustes]);
  const ajusteSemMotivo = Object.values(ajustes).some((a) => { const n = Number(String(a.ajuste).replace(',', '.')); return Number.isFinite(n) && n !== 0 && a.motivo.trim().length < 3; });

  if (pronto) {
    return (
      <Card>
        <CardContent className="space-y-3 py-6 text-center">
          <CheckCircle2 className="mx-auto h-12 w-12 text-success" aria-hidden />
          <p className="sgo-type-17 font-semibold text-ink-900">{pronto.substituiu ? 'Apuração substituída!' : 'Apuração gravada!'}</p>
          <p className="text-sm text-ink-500">{pronto.lancamentos} lançamento(s) de comissão · {formatBRL(pronto.total)} · competência {rotuloDoMes(pronto.competencia)}</p>
          <div className="flex flex-wrap justify-center gap-2 pt-1">
            <Button variant="secondary" onClick={() => { setPronto(null); setArquivo(null); limpar(); if (campo.current) campo.current.value = ''; }}>Apurar outra unidade</Button>
            <Button onClick={() => router.push(`/modulos/comissao?aba=competencia&mes=${pronto.competencia}`)}>Ver a competência</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4" data-testid="apuracao-comissao">
      <Card>
        <CardContent className="space-y-3 pt-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Select label="Unidade" required value={unitId} onValueChange={(v) => { setUnitId(v); limpar(); }} placeholder="Selecione…" options={unidades.map((u) => ({ value: u.id, label: u.name }))} />
            <Select
              label="Mês das vendas" required value={mesVenda} onValueChange={(v) => { setMesVenda(v); limpar(); }}
              options={meses.map((m) => ({ value: m, label: rotuloDoMes(m), hint: `apura em ${rotuloDoMes(mesDeApuracao(m))} · paga em ${rotuloDoMes(competenciaDePagamento(m))}` }))}
              hint={`Apuração em ${rotuloDoMes(mesDeApuracao(mesVenda))} · pagamento na competência ${rotuloDoMes(competenciaDePagamento(mesVenda))}.`}
            />
            <div>
              <label className="mb-1 block text-sm font-medium text-ink-900" htmlFor="planilha-vendedores">Produtividade por Vendedor — Analítico <span className="text-danger">*</span></label>
              <input
                id="planilha-vendedores" ref={campo} type="file" accept=".xlsx,.xls"
                onChange={(e) => { setArquivo(e.target.files?.[0] ?? null); limpar(); }}
                className="sgo-control block w-full rounded-control border border-line-strong bg-surface px-3 py-2 text-sm text-ink-700 file:mr-3 file:rounded-control file:border-0 file:bg-sunken file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-ink-900"
              />
              <p className="mt-1 text-xs text-ink-500">Relatório do Teknisa, em .xlsx, de UMA unidade. A base é a coluna &ldquo;Vr. Total&rdquo;.</p>
            </div>
          </div>
          <p className="text-xs text-ink-500">
            Regra: vendedor com nome ganha <b>{pctBR(percentuais.vendedor)}%</b> da própria venda; &ldquo;0001 - GRUPO BEIJA FLOR&rdquo; rende <b>{pctBR(percentuais.cozinha)}%</b> da venda do grupo, dividido entre a cozinha
            ({funcoesDaCozinha > 0 ? `${funcoesDaCozinha} função(ões) marcada(s)` : 'nenhuma função marcada ainda'}); FREELANCER fica fora; só funcionário cadastrado na unidade recebe.
          </p>
          <Button onClick={() => void enviar('previa')} loading={ocupado && !previa} disabled={!unitId || !arquivo}>
            <FileSpreadsheet className="h-4 w-4" /> Ler planilha e apurar
          </Button>
        </CardContent>
      </Card>

      {erro && <Banner tone="danger" title={erro} />}

      {previa && (
        <>
          {previa.jaExiste && previa.existente && (
            <Banner tone="warning" title={`${previa.unitName} já tem apuração de ${previa.rotulos.venda}`}
              description={`Gravada por ${previa.existente.importedByName} em ${new Date(previa.existente.importedAt).toLocaleString('pt-BR')} (${formatBRL(previa.existente.totalAmount)})${previa.existente.replacedCount > 0 ? ` · já substituída ${previa.existente.replacedCount}×` : ''}. Confirmar agora substitui os lançamentos daquela apuração.`} />
          )}
          {previa.fechada && <Banner tone="danger" title={`A competência ${previa.rotulos.pagamento} da Comissão já foi finalizada`} description="Reabra em Comissão → Competência antes de apurar de novo." />}
          {previa.avisos.map((a) => <Banner key={a} tone={previa.cozinhaSemFuncao && a.includes('função') ? 'warning' : 'info'} title={a} />)}
          {previa.erros.map((e) => <Banner key={e} tone="danger" title={e} />)}

          <SgoKpis>
            <SgoKpi label="Venda total" value={formatBRL(previa.totalVendas)} meta={`${previa.itens.toLocaleString('pt-BR')} itens · ${previa.rotulos.venda}`} />
            <SgoKpi label="Venda do grupo (cozinha)" value={formatBRL(previa.totais.vendasGrupo)} meta={`${pctBR(previa.pctCozinha)}% = ${formatBRL(previa.totais.boloCozinha)} para ${previa.totais.cozinha} pessoa(s)`} />
            <SgoKpi label="Comissão dos vendedores" value={formatBRL(previa.totais.comissaoVendedores)} meta={`${previa.totais.vendedores} vendedor(es) a ${pctBR(previa.pctVendedor)}%`} />
            <SgoKpi label="Total a lançar" value={formatBRL(totalFinal)} meta={`competência ${previa.rotulos.pagamento}`} valueColor="var(--sgo-brand)" />
          </SgoKpis>

          <p className="text-xs text-ink-500">
            Arquivo: <span className="text-ink-700">{previa.fileName}</span>{previa.unidadeDeclarada ? <> · a planilha declara <span className="text-ink-700">{previa.unidadeDeclarada}</span> — confira com a unidade escolhida; o SGO não decide a unidade pelo arquivo.</> : null}
          </p>

          <Tabela titulo={`Vendedores com nome — ${pctBR(previa.pctVendedor)}% da própria venda`} linhas={linhasVisiveis.vendedores} ajustes={ajustes} setAjustes={setAjustes} valorComAjuste={valorComAjuste} vazio="Nenhum vendedor com nome casou com funcionário da unidade." />

          {(linhasVisiveis.grupo.length > 0 || linhasVisiveis.cozinha.length > 0) && (
            <Tabela
              titulo={`Cozinha — ${pctBR(previa.pctCozinha)}% da venda do GRUPO BEIJA FLOR (${formatBRL(previa.totais.vendasGrupo)}), em partes iguais`}
              linhas={linhasVisiveis.cozinha} ajustes={ajustes} setAjustes={setAjustes} valorComAjuste={valorComAjuste}
              vazio={previa.cozinhaSemFuncao ? 'Marque as funções da cozinha em Configurações → Comissão para a parte do grupo ter destinatário.' : 'Nenhum colaborador ativo desta unidade tem função marcada para a cozinha.'}
            />
          )}

          {linhasVisiveis.naoCad.length > 0 && (
            <section className="sgo-panel sgo-panel--solid overflow-hidden" data-testid="nao-cadastrados">
              <p className="sgo-panel__title px-3 pt-3">Não cadastrados na unidade — sem comissão até vincular ({linhasVisiveis.naoCad.length})</p>
              <p className="px-3 pb-2 text-xs text-ink-500">Só funcionário do RH com vínculo nesta unidade recebe. Se a pessoa é funcionária e o nome no Teknisa está diferente, escolha quem é — o vínculo fica lembrado para os próximos meses.</p>
              <div className="overflow-x-auto">
                <table className="sgo-tbl w-full text-sm">
                  <thead><tr><th className="text-left">Vendedor (Teknisa)</th><th className="text-right">Venda</th><th className="text-right">{pctBR(previa.pctVendedor)}% seria</th><th className="text-left">Vincular a</th></tr></thead>
                  <tbody>
                    {linhasVisiveis.naoCad.map((l) => (
                      <tr key={l.chave}>
                        <td className="whitespace-nowrap font-medium text-ink-900">{l.codigo ? `${l.codigo} - ` : ''}{l.nome}</td>
                        <td className="text-right tabular-nums">{formatBRL(l.vendas)}</td>
                        <td className="text-right tabular-nums text-ink-500">{formatBRL(arredondar2(l.vendas * l.pct / 100))}</td>
                        <td className="min-w-56">
                          <SeletorDeVinculo linha={l} unitId={unitId} onEscolher={(id) => vincular(l.chave.replace(/^VENDEDOR:/, ''), id)} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {linhasVisiveis.freelancers.length > 0 && (
            <section className="sgo-panel sgo-panel--solid overflow-hidden">
              <button type="button" className="flex w-full items-center justify-between px-3 py-3 text-left" onClick={() => setVerFreelancers((v) => !v)}>
                <span className="sgo-panel__title">Freelancers — fora da comissão ({linhasVisiveis.freelancers.length} · {formatBRL(previa.totais.vendasFreelancers)} em vendas)</span>
                <span className="text-xs text-brand">{verFreelancers ? 'Ocultar' : 'Ver lista'}</span>
              </button>
              {verFreelancers && (
                <ul className="divide-y divide-line px-3 pb-3 text-sm">
                  {linhasVisiveis.freelancers.map((l) => <li key={l.chave} className="flex justify-between py-1.5"><span className="text-ink-700">{l.codigo ? `${l.codigo} - ` : ''}{l.nome}</span><span className="tabular-nums text-ink-500">{formatBRL(l.vendas)}</span></li>)}
                </ul>
              )}
            </section>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => void enviar('confirmar', previa.jaExiste)} loading={ocupado} disabled={previa.fechada || ajusteSemMotivo || previa.erros.length > 0 || totalFinal <= 0} size="lg">
              {previa.jaExiste ? <><AlertTriangle className="h-5 w-5" /> Substituir apuração</> : <><Upload className="h-5 w-5" /> Confirmar apuração</>}
            </Button>
            <Button variant="secondary" size="lg" onClick={limpar}>Cancelar</Button>
            {ajusteSemMotivo && <span className="text-xs text-danger">Todo ajuste precisa de motivo.</span>}
          </div>
        </>
      )}
    </div>
  );
}

function Tabela({ titulo, linhas, ajustes, setAjustes, valorComAjuste, vazio }: {
  titulo: string; linhas: LinhaDaApuracao[]; ajustes: Ajustes; setAjustes: (f: (a: Ajustes) => Ajustes) => void;
  valorComAjuste: (l: LinhaDaApuracao) => number; vazio: string;
}) {
  const total = arredondar2(linhas.reduce((s, l) => s + valorComAjuste(l), 0));
  return (
    <section className="sgo-panel sgo-panel--solid overflow-hidden">
      <p className="sgo-panel__title px-3 pt-3">{titulo}</p>
      {linhas.length === 0 ? <p className="px-3 pb-3 text-sm text-ink-500">{vazio}</p> : (
        <div className="overflow-x-auto">
          <table className="sgo-tbl w-full text-sm">
            <thead><tr><th className="text-left">Colaborador</th><th className="text-left">Na planilha</th><th className="text-right">Venda</th><th className="text-right">Calculado</th><th className="text-right">Ajuste (R$)</th><th className="text-left">Motivo do ajuste</th><th className="text-right">Valor final</th></tr></thead>
            <tbody>
              {linhas.map((l) => {
                const a = ajustes[l.chave] ?? { ajuste: '', motivo: '' };
                const temAjuste = Number(String(a.ajuste).replace(',', '.')) !== 0 && a.ajuste !== '';
                return (
                  <tr key={l.chave} data-testid={`linha-${l.kind}`}>
                    <td className="whitespace-nowrap font-medium text-ink-900">{l.collaboratorName ?? l.nome}<span className="block"><StatusBadge tone={KIND_TONE[l.kind]} dot>{ROTULO_KIND[l.kind]}</StatusBadge></span></td>
                    <td className="whitespace-nowrap text-xs text-ink-500">{l.kind === 'COZINHA' ? 'GRUPO BEIJA FLOR' : `${l.codigo ? `${l.codigo} - ` : ''}${l.nome}`}</td>
                    <td className="text-right tabular-nums">{formatBRL(l.vendas)}</td>
                    <td className="text-right tabular-nums">{formatBRL(l.calculado)}<span className="block text-xs text-ink-500">{pctBR(l.pct)}%</span></td>
                    <td className="text-right"><Input inputMode="decimal" aria-label={`Ajuste de ${l.collaboratorName ?? l.nome}`} value={a.ajuste} placeholder="0,00" onChange={(e) => setAjustes((s) => ({ ...s, [l.chave]: { ajuste: e.target.value, motivo: s[l.chave]?.motivo ?? '' } }))} className="h-9 w-24 text-right text-sm tabular-nums" /></td>
                    <td className="min-w-56"><Input aria-label={`Motivo do ajuste de ${l.collaboratorName ?? l.nome}`} value={a.motivo} placeholder={temAjuste ? 'Obrigatório: o que foi combinado' : '—'} onChange={(e) => setAjustes((s) => ({ ...s, [l.chave]: { ajuste: s[l.chave]?.ajuste ?? '', motivo: e.target.value } }))} className={`h-9 text-sm ${temAjuste && a.motivo.trim().length < 3 ? 'border-danger' : ''}`} /></td>
                    <td className="text-right tabular-nums font-semibold text-ink-900">{formatBRL(valorComAjuste(l))}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot><tr className="font-semibold"><td colSpan={2}>Total</td><td className="text-right tabular-nums">{formatBRL(arredondar2(linhas.reduce((s, l) => s + (l.kind === 'COZINHA' ? 0 : l.vendas), 0)) || linhas[0]?.vendas || 0)}</td><td className="text-right tabular-nums">{formatBRL(arredondar2(linhas.reduce((s, l) => s + l.calculado, 0)))}</td><td colSpan={2} /><td className="text-right tabular-nums text-brand">{formatBRL(total)}</td></tr></tfoot>
          </table>
        </div>
      )}
    </section>
  );
}

function SeletorDeVinculo({ linha, unitId, onEscolher }: { linha: LinhaDaApuracao; unitId: string | null; onEscolher: (collaboratorId: string) => void }) {
  const [opcoes, setOpcoes] = useState<{ id: string; name: string }[] | null>(null);
  const [carregando, setCarregando] = useState(false);
  const sugestoes = linha.sugestoes ?? [];
  async function carregarTodos() {
    if (!unitId || opcoes) return;
    setCarregando(true);
    try {
      const r = await fetch(`/api/comissao/colaboradores?unitId=${encodeURIComponent(unitId)}`);
      const b = await r.json().catch(() => ({}));
      setOpcoes(Array.isArray(b.colaboradores) ? b.colaboradores : []);
    } finally { setCarregando(false); }
  }
  const lista = opcoes ?? sugestoes.map((s) => ({ id: s.collaboratorId, name: s.name }));
  return (
    <div className="flex flex-col gap-1">
      <Select
        aria-label={`Vincular ${linha.nome}`} size="sm" value={null} onValueChange={onEscolher} searchable
        placeholder={lista.length ? (opcoes ? 'Escolher no cadastro…' : `${sugestoes.length} parecido(s) — escolher…`) : 'Nenhum parecido no cadastro'}
        options={lista.map((o) => ({ value: o.id, label: o.name }))} disabled={lista.length === 0}
      />
      {!opcoes && <button type="button" className="text-left text-xs text-brand" onClick={() => void carregarTodos()} disabled={carregando}>{carregando ? 'Carregando…' : 'Ver todos os colaboradores da unidade'}</button>}
    </div>
  );
}

export type { TotaisDaApuracao };
