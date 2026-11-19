'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CheckCircle2, Clock, ListChecks, MessageCircleQuestion, Paperclip, Plus, Search, Send, X, BarChart3, Timer, Building2 } from 'lucide-react';
import { LargeTitle } from '@/components/layout/page-chrome';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/ds/select';
import { DatePicker } from '@/components/ui/ds/date-picker';
import { Table, type Column } from '@/components/ui/ds/table';
import { StatusBadge, type StatusTone } from '@/components/ui/status-badge';
import { Card, PanelHeader } from '@/components/sgo/panel';
import { SgoKpi, SgoKpis } from '@/components/sgo/sgo-kpi';
import { shortUnitName } from '@/lib/unit-name';
import { situacaoParaTela } from '@/components/people/solicitacao-situacao';
import {
  ANEXOS_MAX, ANEXOS_TOTAL_BYTES, ANEXO_MAX_BYTES, DEFINICAO_DO_TIPO, DESCRICAO_MAX, ROTULO_DA_FAIXA, ROTULO_DA_PENDENCIA, ROTULO_DA_PRIORIDADE, ROTULO_DO_TIPO, TIPOS_OFERECIDOS, TITULO_MAX,
  faixaDaSituacao, filtrar, indicadores, oQueFalta, ordenar, pendenciaDoSolicitante, prazoVencido, resumoSugerido, ultimaMovimentacao,
  type Detalhes, type Faixa, type LinhaDaSolicitacao, type PainelDeGestao, type Prioridade, type TipoDeSolicitacao,
} from '@/lib/rh/solicitacoes-regras';

const BASE = '/modulos/pessoas/demandas-rh';
export type AbaDaTela = 'minhas' | 'nova' | 'painel';

const TOM_DA_PRIORIDADE: Record<Prioridade, StatusTone> = { NORMAL: 'neutral', ALTA: 'medium', URGENTE: 'critical' };

const dataBR = (iso: string | null) => {
  if (!iso) return '–';
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; }
  return new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' });
};

export interface SolicitacoesRhProps {
  aba: AbaDaTela;
  abas: AbaDaTela[];
  linhas: LinhaDaSolicitacao[];
  limiteAtingido: boolean;
  painel: PainelDeGestao | null;
  hoje: string;
  podeCriar: boolean;
  units: { id: string; name: string }[];
  unidadeInicial: string;
  collaboratorsByUnit: Record<string, { id: string; name: string }[]>;
  visaoRede: boolean;
}

export function SolicitacoesRhClient(p: SolicitacoesRhProps) {
  const rotulo: Record<AbaDaTela, { label: string; icon: React.ReactNode }> = {
    minhas: { label: 'Minhas Solicitações', icon: <ListChecks className="h-3.5 w-3.5" /> },
    nova: { label: 'Nova Solicitação', icon: <Plus className="h-3.5 w-3.5" /> },
    painel: { label: 'Painel de Gestão', icon: <BarChart3 className="h-3.5 w-3.5" /> },
  };
  return (
    <div className="space-y-4" data-testid="solicitacoes-rh">
      <LargeTitle
        title="Solicitações ao RH"
        subtitle="Abra e acompanhe suas solicitações."
        tabs={p.abas.map((a) => ({ label: rotulo[a].label, icon: rotulo[a].icon, href: `${BASE}?aba=${a}`, active: p.aba === a, testId: `aba-${a}` }))}
        actions={p.podeCriar && p.aba !== 'nova' ? (
          <Link href={`${BASE}?aba=nova`} className="sgo-btn sgo-btn--primary" data-testid="nova-solicitacao"><Plus className="h-3.5 w-3.5" /> Nova Solicitação</Link>
        ) : undefined}
      />
      {p.aba === 'minhas' && <Minhas linhas={p.linhas} hoje={p.hoje} visaoRede={p.visaoRede} limiteAtingido={p.limiteAtingido} podeCriar={p.podeCriar} />}
      {p.aba === 'nova' && (p.podeCriar
        ? <Nova units={p.units} unidadeInicial={p.unidadeInicial} collaboratorsByUnit={p.collaboratorsByUnit} />
        : <p className="text-sm text-ink-500">Seu perfil não abre solicitações ao RH.</p>)}
      {p.aba === 'painel' && p.painel && <Painel painel={p.painel} visaoRede={p.visaoRede} />}
    </div>
  );
}

/* ───────────────────────── Minhas Solicitações ───────────────────────── */

const PERIODOS = [{ value: '0', label: 'Todo o período' }, { value: '7', label: 'Últimos 7 dias' }, { value: '30', label: 'Últimos 30 dias' }, { value: '90', label: 'Últimos 90 dias' }];

export function Minhas({ linhas, hoje, visaoRede, limiteAtingido, podeCriar }: { linhas: LinhaDaSolicitacao[]; hoje: string; visaoRede: boolean; limiteAtingido: boolean; podeCriar: boolean }) {
  const router = useRouter();
  const [faixa, setFaixa] = useState<Faixa | ''>('');
  const [tipo, setTipo] = useState<TipoDeSolicitacao | ''>('');
  const [dias, setDias] = useState('0');
  const [q, setQ] = useState('');
  const kpi = useMemo(() => indicadores(linhas), [linhas]);
  const visiveis = useMemo(() => ordenar(filtrar(linhas, { faixa, tipo, dias: Number(dias), q }, new Date())), [linhas, faixa, tipo, dias, q]);
  const filtrando = Boolean(faixa || tipo || q || dias !== '0');
  const tiposDaLista = useMemo(() => [...new Set(linhas.map((l) => l.tipo))], [linhas]);

  const colunas: Column<LinhaDaSolicitacao>[] = [
    { key: 'protocolo', header: 'Protocolo', width: '7rem', cell: (l) => l.rhNumero ?? <span className="text-ink-400">aguardando</span> },
    {
      key: 'solicitacao', header: 'Solicitação', wrap: true,
      cell: (l) => (
        <div className="min-w-[12rem]">
          <p className="font-semibold text-ink-900">{l.titulo}{l.anexos > 0 && <Paperclip className="ml-1 inline h-3.5 w-3.5 text-ink-400" aria-label={`${l.anexos} anexo(s)`} />}</p>
          <p className="text-xs text-ink-500">
            {ROTULO_DO_TIPO[l.tipo]}{l.collaboratorName ? ` · ${l.collaboratorName}` : ''}{visaoRede ? ` · ${shortUnitName(l.unitName)}` : ''}
            {l.prioridade !== 'NORMAL' && <StatusBadge tone={TOM_DA_PRIORIDADE[l.prioridade]} className="ml-2">{ROTULO_DA_PRIORIDADE[l.prioridade]}</StatusBadge>}
          </p>
        </div>
      ),
    },
    { key: 'abertura', header: 'Abertura', hideOnMobile: true, cell: (l) => dataBR(l.createdAt) },
    {
      key: 'situacao', header: 'Situação', wrap: true,
      cell: (l) => {
        const s = situacaoParaTela(l);
        const pend = pendenciaDoSolicitante(l);
        return (
          <div>
            <StatusBadge tone={s.tone}>{s.label}</StatusBadge>
            {pend && <p className="mt-1 text-xs font-semibold text-danger" data-testid="pendencia">{pend}</p>}
          </div>
        );
      },
    },
    { key: 'movimentacao', header: 'Última movimentação', hideOnMobile: true, cell: (l) => dataBR(ultimaMovimentacao(l)) },
    {
      key: 'prazo', header: 'Prazo do RH', hideOnMobile: true,
      cell: (l) => (l.rhPrazoAlvo ? <span className={prazoVencido(l, hoje) ? 'font-semibold text-danger' : undefined}>{dataBR(l.rhPrazoAlvo.slice(0, 10))}{prazoVencido(l, hoje) ? ' · vencido' : ''}</span> : null),
    },
  ];

  return (
    <div className="space-y-4">
      <SgoKpis>
        <SgoKpi label="Em andamento" value={kpi.ANDAMENTO} icon={Clock} tone="blue" onClick={() => setFaixa(faixa === 'ANDAMENTO' ? '' : 'ANDAMENTO')} testId="kpi-andamento" />
        <SgoKpi label="Aguardando minha resposta" value={kpi.AGUARDANDO_RESPOSTA} icon={MessageCircleQuestion} tone={kpi.AGUARDANDO_RESPOSTA > 0 ? 'red' : 'gray'} onClick={() => setFaixa(faixa === 'AGUARDANDO_RESPOSTA' ? '' : 'AGUARDANDO_RESPOSTA')} testId="kpi-aguardando" />
        <SgoKpi label="Concluídas" value={kpi.CONCLUIDA} icon={CheckCircle2} tone="green" onClick={() => setFaixa(faixa === 'CONCLUIDA' ? '' : 'CONCLUIDA')} testId="kpi-concluidas" />
      </SgoKpis>

      <div className="sgo-filtros -mx-4" data-testid="filtros">
        <div className="relative min-w-[12rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" aria-hidden />
          <input
            value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por protocolo, resumo ou colaborador" aria-label="Buscar solicitação"
            className="h-10 w-full rounded-control border border-line-strong bg-surface pl-9 pr-3 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand focus:outline-none"
          />
        </div>
        <div className="w-full sm:w-52">
          <Select aria-label="Situação" value={faixa} onValueChange={(v) => setFaixa(v as Faixa | '')} options={[{ value: '', label: 'Todas as situações' }, ...(Object.keys(ROTULO_DA_FAIXA) as Faixa[]).map((f) => ({ value: f, label: ROTULO_DA_FAIXA[f] }))]} />
        </div>
        <div className="w-full sm:w-44">
          <Select aria-label="Período" value={dias} onValueChange={setDias} options={PERIODOS} />
        </div>
        <div className="w-full sm:w-52">
          <Select aria-label="Tipo" value={tipo} onValueChange={(v) => setTipo(v as TipoDeSolicitacao | '')} options={[{ value: '', label: 'Todos os tipos' }, ...tiposDaLista.map((t) => ({ value: t, label: ROTULO_DO_TIPO[t] }))]} />
        </div>
        {filtrando && <button type="button" className="sgo-btn sgo-btn--sm" onClick={() => { setFaixa(''); setTipo(''); setDias('0'); setQ(''); }}><X className="h-3.5 w-3.5" /> Limpar</button>}
      </div>

      <Table
        columns={colunas} rows={visiveis} getRowKey={(l) => l.id}
        onRowClick={(l) => router.push(`${BASE}/${l.id}`)}
        caption="Solicitações ao RH"
        empty={linhas.length === 0
          ? <span>Nenhuma solicitação aberta ainda.{podeCriar ? ' Use "Nova Solicitação" para abrir a primeira.' : ''}</span>
          : 'Nenhuma solicitação com estes filtros.'}
      />
      <p className="text-xs text-ink-500">
        {visiveis.length} de {linhas.length} solicitação(ões).{limiteAtingido ? ' A lista mostra as 500 mais recentes.' : ''} Toque numa linha para ver os detalhes.
      </p>
    </div>
  );
}

/* ───────────────────────── Nova Solicitação ───────────────────────── */

const CAMPO = 'w-full rounded-lg border-2 border-line-strong bg-surface p-2 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand focus:outline-none';

export function Nova({ units, unidadeInicial, collaboratorsByUnit }: { units: { id: string; name: string }[]; unidadeInicial: string; collaboratorsByUnit: Record<string, { id: string; name: string }[]> }) {
  const router = useRouter();
  const [unitId, setUnitId] = useState(unidadeInicial || (units.length === 1 ? units[0].id : ''));
  const [tipo, setTipo] = useState<TipoDeSolicitacao | ''>('');
  const [collaboratorId, setCollaboratorId] = useState('');
  const [detalhes, setDetalhes] = useState<Detalhes>({});
  const [titulo, setTitulo] = useState('');
  const [tituloEditado, setTituloEditado] = useState(false);
  const [descricao, setDescricao] = useState('');
  const [prioridade, setPrioridade] = useState<Prioridade>('NORMAL');
  const [urgenciaMotivo, setUrgenciaMotivo] = useState('');
  const [anexos, setAnexos] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const arquivoRef = useRef<HTMLInputElement>(null);

  const def = tipo ? DEFINICAO_DO_TIPO[tipo] : null;
  const collabs = collaboratorsByUnit[unitId] ?? [];
  const nomeDoColaborador = collabs.find((c) => c.id === collaboratorId)?.name ?? null;
  const unidade = units.find((u) => u.id === unitId);

  /* O resumo acompanha o que é preenchido — até o gerente escrever o dele. */
  const sugestao = tipo ? resumoSugerido(tipo, nomeDoColaborador, detalhes) : '';
  useEffect(() => { if (!tituloEditado) setTitulo(sugestao); }, [sugestao, tituloEditado]);

  function trocarTipo(v: string) {
    setTipo(v as TipoDeSolicitacao); setDetalhes({}); setErr(null);
    if (DEFINICAO_DO_TIPO[v as TipoDeSolicitacao]?.colaborador === 'nao') setCollaboratorId('');
  }
  const campo = (k: string, v: string) => setDetalhes((d) => ({ ...d, [k]: v }));

  function escolherArquivos(lista: FileList | null) {
    if (!lista) return;
    const novos = [...lista];
    const ruim = novos.find((f) => !['application/pdf', 'image/jpeg', 'image/png'].includes(f.type));
    if (ruim) { setErr('Anexe apenas PDF, JPG ou PNG.'); return; }
    if (novos.some((f) => f.size > ANEXO_MAX_BYTES)) { setErr('Cada anexo pode ter até 10 MB.'); return; }
    if (anexos.length + novos.length > ANEXOS_MAX) { setErr(`No máximo ${ANEXOS_MAX} anexos.`); return; }
    if ([...anexos, ...novos].reduce((t, f) => t + f.size, 0) > ANEXOS_TOTAL_BYTES) { setErr('Os anexos somados passam de 18 MB.'); return; }
    setErr(null); setAnexos((a) => [...a, ...novos]);
    if (arquivoRef.current) arquivoRef.current.value = '';
  }

  async function enviar() {
    setErr(null);
    if (!unitId) { setErr('Escolha a unidade.'); return; }
    if (!tipo) { setErr('Escolha o tipo da solicitação.'); return; }
    const falta = oQueFalta({ tipo, titulo, descricao, prioridade, urgenciaMotivo, collaboratorId: collaboratorId || null, detalhes });
    if (falta) { setErr(falta); return; }
    setBusy(true);
    try {
      const form = new FormData();
      form.append('dados', JSON.stringify({ unitId, tipo, titulo, descricao, collaboratorId: collaboratorId || null, prioridade, urgenciaMotivo, detalhes }));
      for (const f of anexos) form.append('anexo', f);
      const res = await fetch('/api/rh/demandas', { method: 'POST', body: form });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(d.error ?? 'Não foi possível enviar. Tente de novo.'); return; }
      router.push(`${BASE}/${d.id}?nova=1`);
      router.refresh();
    } catch {
      setErr('Sem conexão. Tente de novo.');
    } finally { setBusy(false); }
  }

  return (
    <Card className="mx-auto max-w-3xl" data-testid="nova-solicitacao-form">
      <PanelHeader title="Nova Solicitação" />
      <div className="space-y-4 px-4 py-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {units.length > 1
            ? <Select label="Unidade" placeholder="Selecione…" value={unitId} onValueChange={(v) => { setUnitId(v); setCollaboratorId(''); }} options={units.map((u) => ({ value: u.id, label: shortUnitName(u.name) }))} searchable />
            : <div><Label>Unidade</Label><p className="pt-2 text-sm font-semibold text-ink-900" data-testid="unidade-fixa">{unidade ? shortUnitName(unidade.name) : '–'}</p></div>}
          <Select label="Tipo de solicitação" placeholder="Selecione…" value={tipo} onValueChange={trocarTipo} options={TIPOS_OFERECIDOS.map((t) => ({ value: t, label: ROTULO_DO_TIPO[t] }))} />
        </div>

        {!tipo && (
          <p className="text-xs text-ink-500" data-testid="aviso-atestado">
            Atestado, comparecimento e licença são lançados na <Link href="/modulos/atestados" className="font-semibold text-brand">Central de Atestados</Link>, e não por aqui.
          </p>
        )}

        {def && (
          <>
            {def.aviso && <p className="rounded-lg border border-line px-3 py-2 text-xs text-ink-700" data-testid="aviso-do-tipo">{def.aviso}</p>}

            {def.colaborador !== 'nao' && (
              <Select
                label={def.colaborador === 'sim' ? 'Colaborador' : 'Colaborador (se for o caso)'} placeholder={unitId ? 'Buscar pelo nome…' : 'Escolha a unidade primeiro'} searchable
                value={collaboratorId} onValueChange={setCollaboratorId}
                options={[...(def.colaborador === 'opcional' ? [{ value: '', label: 'Nenhum' }] : []), ...collabs.map((c) => ({ value: c.id, label: c.name }))]}
              />
            )}

            {def.campos.length > 0 && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" data-testid="campos-do-tipo">
                {def.campos.map((c) => {
                  const rot = `${c.label}${c.obrigatorio ? '' : ' (opcional)'}`;
                  const v = detalhes[c.key] ?? '';
                  if (c.tipo === 'data') return <DatePicker key={c.key} label={rot} value={v || null} onValueChange={(x) => campo(c.key, x ?? '')} />;
                  if (c.tipo === 'opcao') return <Select key={c.key} label={rot} placeholder="Selecione…" value={v} onValueChange={(x) => campo(c.key, x)} options={(c.opcoes ?? []).map((o) => ({ value: o, label: o }))} />;
                  if (c.tipo === 'longo') return (
                    <div key={c.key} className="sm:col-span-2">
                      <Label>{rot}</Label>
                      <textarea value={v} maxLength={1500} rows={3} onChange={(e) => campo(c.key, e.target.value)} placeholder={c.placeholder} className={CAMPO} />
                    </div>
                  );
                  return (
                    <div key={c.key}>
                      <Label>{rot}</Label>
                      <Input value={v} maxLength={200} inputMode={c.tipo === 'numero' ? 'numeric' : undefined} onChange={(e) => campo(c.key, c.tipo === 'numero' ? e.target.value.replace(/\D/g, '').slice(0, 3) : e.target.value)} placeholder={c.placeholder} />
                    </div>
                  );
                })}
              </div>
            )}

            <div>
              <Label>Resumo</Label>
              <Input value={titulo} maxLength={TITULO_MAX} onChange={(e) => { setTitulo(e.target.value); setTituloEditado(true); }} placeholder="Uma linha que diga o que você precisa" data-testid="resumo" />
              {tituloEditado && sugestao && sugestao !== titulo && (
                <button type="button" className="mt-1 text-xs font-semibold text-brand" onClick={() => { setTituloEditado(false); }}>Usar a sugestão: {sugestao}</button>
              )}
            </div>

            <div>
              <Label>Descrição{def.descricaoObrigatoria ? '' : ' (opcional)'}</Label>
              <textarea value={descricao} maxLength={DESCRICAO_MAX} rows={4} onChange={(e) => setDescricao(e.target.value)} placeholder={def.dica} className={CAMPO} data-testid="descricao" />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Select label="Prioridade" value={prioridade} onValueChange={(v) => setPrioridade(v as Prioridade)} options={(['NORMAL', 'ALTA', 'URGENTE'] as Prioridade[]).map((x) => ({ value: x, label: ROTULO_DA_PRIORIDADE[x] }))} />
              {prioridade === 'URGENTE' && (
                <div data-testid="motivo-urgencia">
                  <Label>Por que é urgente?</Label>
                  <Input value={urgenciaMotivo} maxLength={500} onChange={(e) => setUrgenciaMotivo(e.target.value)} placeholder="ex.: o colaborador começa na segunda" />
                </div>
              )}
            </div>

            <div>
              <Label>Anexos (opcional)</Label>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" className="sgo-btn sgo-btn--sm" onClick={() => arquivoRef.current?.click()} disabled={anexos.length >= ANEXOS_MAX}><Paperclip className="h-3.5 w-3.5" /> Anexar arquivo</button>
                <span className="text-xs text-ink-500">PDF, JPG ou PNG · até 10 MB cada · no máximo {ANEXOS_MAX} · 18 MB somados</span>
                <input ref={arquivoRef} type="file" multiple accept="application/pdf,image/jpeg,image/png" className="hidden" onChange={(e) => escolherArquivos(e.target.files)} />
              </div>
              {anexos.length > 0 && (
                <ul className="mt-2 space-y-1" data-testid="anexos-escolhidos">
                  {anexos.map((f, i) => (
                    <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-2 rounded-lg border border-line px-3 py-2 text-sm">
                      <span className="min-w-0 break-words">{f.name}</span>
                      <button type="button" className="shrink-0 text-xs font-semibold text-danger" onClick={() => setAnexos((a) => a.filter((_, j) => j !== i))}>Remover</button>
                    </li>
                  ))}
                </ul>
              )}
              {anexos.length > 0 && <p className="mt-1 text-xs text-ink-500">Os anexos seguem para o RH junto com a solicitação.</p>}
            </div>
          </>
        )}

        {err && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm font-medium text-danger" data-testid="erro">{err}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <Link href={`${BASE}?aba=minhas`} className="sgo-btn">Cancelar</Link>
          <Button onClick={enviar} disabled={busy || !tipo} data-testid="enviar"><Send className="h-4 w-4" /> {busy ? 'Enviando…' : 'Enviar ao RH'}</Button>
        </div>
      </div>
    </Card>
  );
}

/* ───────────────────────── Painel de Gestão ───────────────────────── */

const diasBR = (n: number | null) => (n == null ? '–' : `${String(n).replace('.', ',')} dia(s)`);

export function Painel({ painel, visaoRede }: { painel: PainelDeGestao; visaoRede: boolean }) {
  const router = useRouter();
  return (
    <div className="space-y-4" data-testid="painel-de-gestao">
      <SgoKpis>
        <SgoKpi label="Em aberto" value={painel.abertas} icon={Clock} tone="blue" meta={`${painel.total} no total`} testId="painel-abertas" />
        <SgoKpi label="Pendências" value={painel.pendencias.length} icon={AlertTriangle} tone={painel.pendencias.length > 0 ? 'red' : 'gray'} meta={painel.urgentesAbertas > 0 ? `${painel.urgentesAbertas} urgente(s) em aberto` : 'nenhuma urgente em aberto'} testId="painel-pendencias" />
        <SgoKpi label="Concluídas" value={painel.concluidas} icon={CheckCircle2} tone="green" meta={painel.noPrazoPct == null ? 'sem prazo para comparar' : `${painel.noPrazoPct}% dentro do prazo do RH`} />
        <SgoKpi label="Tempo médio até concluir" value={diasBR(painel.tempoMedioDias)} icon={Timer} tone="gray" meta={painel.canceladas > 0 ? `${painel.canceladas} cancelada(s)` : undefined} />
      </SgoKpis>

      <Card>
        <PanelHeader title="Pendências" count={painel.pendencias.length} countTone={painel.pendencias.length > 0 ? 'red' : undefined} />
        <Table
          dense
          columns={[
            { key: 'pend', header: 'Pendência', wrap: true, cell: (x) => <span className="font-semibold text-ink-900">{ROTULO_DA_PENDENCIA[x.tipo]}</span> },
            { key: 'sol', header: 'Solicitação', wrap: true, cell: (x) => <div className="min-w-[10rem]"><p>{x.linha.titulo}</p><p className="text-xs text-ink-500">{ROTULO_DO_TIPO[x.linha.tipo]} · {x.linha.createdByName}</p></div> },
            { key: 'un', header: 'Unidade', hideOnMobile: true, cell: (x) => shortUnitName(x.linha.unitName) },
            { key: 'dias', header: 'Parada há', numeric: true, cell: (x) => `${x.dias} dia(s)` },
          ]}
          rows={painel.pendencias} getRowKey={(x) => x.linha.id}
          onRowClick={(x) => router.push(`${BASE}/${x.linha.id}`)}
          empty="Nenhuma pendência."
        />
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {visaoRede && (
          <Card className="lg:col-span-2">
            <PanelHeader title="Por unidade" icon={<Building2 className="h-4 w-4 text-ink-500" />} />
            <Table
              dense
              columns={[
                { key: 'un', header: 'Unidade', cell: (u) => shortUnitName(u.unitName) },
                { key: 'tot', header: 'Solicitações', numeric: true, cell: (u) => u.total },
                { key: 'ab', header: 'Em aberto', numeric: true, cell: (u) => u.abertas },
                { key: 'pe', header: 'Pendências', numeric: true, cell: (u) => (u.pendencias > 0 ? <span className="font-semibold text-danger">{u.pendencias}</span> : 0) },
                { key: 'co', header: 'Concluídas', numeric: true, hideOnMobile: true, cell: (u) => u.concluidas },
                { key: 'tm', header: 'Tempo médio', numeric: true, hideOnMobile: true, cell: (u) => diasBR(u.tempoMedioDias) },
              ]}
              rows={painel.porUnidade} getRowKey={(u) => u.unitId} empty="Nenhuma solicitação."
            />
          </Card>
        )}
        <Card>
          <PanelHeader title="Por tipo" />
          <Table
            dense
            columns={[
              { key: 'tipo', header: 'Tipo', cell: (t) => ROTULO_DO_TIPO[t.tipo] },
              { key: 'tot', header: 'Solicitações', numeric: true, cell: (t) => t.total },
              { key: 'ab', header: 'Em aberto', numeric: true, cell: (t) => t.abertas },
            ]}
            rows={painel.porTipo} getRowKey={(t) => t.tipo} empty="Nenhuma solicitação."
          />
        </Card>
        <Card>
          <PanelHeader title="Quem mais solicita" />
          <Table
            dense
            columns={[
              { key: 'nome', header: 'Solicitante', cell: (s) => s.nome },
              { key: 'tot', header: 'Solicitações', numeric: true, cell: (s) => s.total },
              { key: 'ab', header: 'Em aberto', numeric: true, cell: (s) => s.abertas },
            ]}
            rows={painel.porSolicitante} getRowKey={(s) => s.nome} empty="Nenhuma solicitação."
          />
        </Card>
      </div>
    </div>
  );
}
