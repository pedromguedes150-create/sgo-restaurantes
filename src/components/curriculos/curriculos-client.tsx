'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Briefcase, CalendarClock, Camera, CheckCircle2, ExternalLink, FileText, FileUp, Inbox, Phone, Plus, Search, Settings, UserCheck, UserRoundSearch, X } from 'lucide-react';
import { LargeTitle } from '@/components/layout/page-chrome';
import { SgoKpi, SgoKpis } from '@/components/sgo/sgo-kpi';
import { SgoModal } from '@/components/sgo/sgo-modal';
import { SgoDrawer } from '@/components/sgo/sgo-drawer';
import { SgoTimeline, type SgoTimelineTom } from '@/components/sgo/sgo-timeline';
import { Button } from '@/components/ui/ds/button';
import { Input, Textarea } from '@/components/ui/ds/field';
import { Select } from '@/components/ui/ds/select';
import { StatusBadge } from '@/components/ui/ds/status-badge';
import { Banner } from '@/components/ui/ds/banner';
import { EmptyState } from '@/components/ui/ds/empty-state';
import { List, ListRow } from '@/components/ui/ds/list-row';
import { shortUnitName } from '@/lib/unit-name';
import { apagarFotoLocal, apagarRascunho, gravarRascunho, guardarFotoLocal, lerFotoLocal, lerRascunho } from '@/lib/rascunho-local';
import {
  ARQUIVO_MAX_BYTES, FAIXA_LABEL, NOME_MAX, OBS_MAX, STATUS_LABEL, STATUS_TOM, normalizarNome, normalizarTelefone, telefoneFormatado,
  type Faixa, type Indicadores, type StatusDoCurriculo,
} from '@/lib/curriculos/regras';

/**
 * CENTRAL DE CURRÍCULOS (v1.212.0) — a tela do gerente.
 *
 * Três coisas, nesta ordem: os números, a lista e o botão de encaminhar. O
 * gerente NÃO muda situação: a tela não tem esse controle, e o servidor não
 * tem essa rota. A situação chega do RH.
 */
export interface CurriculoUI {
  id: string;
  unidade: string;
  candidateName: string;
  phone: string;
  jobTitleName: string;
  attachmentMime: string;
  note: string | null;
  status: StatusDoCurriculo;
  statusNote: string | null;
  statusAt: string;
  interviewAt: string | null;
  rhReadAt: string | null;
  createdByName: string;
  createdAt: string;
}

interface Props {
  linhas: CurriculoUI[];
  total: number;
  indicadores: Indicadores;
  units: { id: string; name: string }[];
  /** A unidade do seletor do cabeçalho; vazia em "Toda a Rede". */
  unidadeInicial: string;
  cargos: { id: string; name: string }[];
  cargosDaLista: string[];
  filtros: { faixa: Faixa; q: string; cargo: string };
  podeEncaminhar: boolean;
  podeConfigurar: boolean;
  visaoRede: boolean;
  rhConectado: boolean;
  /** Vem do link da notificação: abre a ficha deste currículo. */
  abrirId: string | null;
}

const BASE = '/modulos/curriculos';
const dataBR = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' });
const dataHoraBR = (iso: string) => new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export function CurriculosClient(p: Props) {
  const router = useRouter();
  const [novo, setNovo] = useState(false);
  const [aberto, setAberto] = useState<CurriculoUI | null>(() => p.linhas.find((l) => l.id === p.abrirId) ?? null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [busca, setBusca] = useState(p.filtros.q);

  /* A câmera do Android pode descartar a aba; se havia um encaminhamento pela metade, a janela volta aberta. */
  useEffect(() => {
    if (p.podeEncaminhar && lerRascunho<RascunhoDoCurriculo>(CHAVE_DO_RASCUNHO)) setNovo(true);
  }, [p.podeEncaminhar]);

  function ir(mudanca: Partial<Props['filtros']>) {
    const f = { ...p.filtros, q: busca, ...mudanca };
    const qs = new URLSearchParams();
    if (f.faixa !== 'todos') qs.set('faixa', f.faixa);
    if (f.q.trim()) qs.set('q', f.q.trim());
    if (f.cargo) qs.set('cargo', f.cargo);
    const s = qs.toString();
    router.push(s ? `${BASE}?${s}` : BASE);
  }
  const hrefDaFaixa = (faixa: Faixa) => {
    const qs = new URLSearchParams();
    if (faixa !== 'todos') qs.set('faixa', faixa);
    if (p.filtros.q) qs.set('q', p.filtros.q);
    if (p.filtros.cargo) qs.set('cargo', p.filtros.cargo);
    const s = qs.toString();
    return s ? `${BASE}?${s}` : BASE;
  };
  const filtrando = p.filtros.faixa !== 'todos' || !!p.filtros.q || !!p.filtros.cargo;
  const i = p.indicadores;

  return (
    <div className="space-y-4" data-testid="central-de-curriculos">
      <LargeTitle
        title="Central de Currículos"
        subtitle="Encaminhe candidatos ao RH e acompanhe cada etapa. Quem analisa e atualiza a situação é o RH."
        actions={
          <>
            {p.podeConfigurar && <Link href="/configuracoes/curriculos" className="sgo-btn"><Settings className="h-3.5 w-3.5" /> Cargos</Link>}
            {p.podeEncaminhar && (
              <button type="button" className="sgo-btn sgo-btn--primary" onClick={() => { setAviso(null); setNovo(true); }} data-testid="novo-encaminhamento">
                <Plus className="h-3.5 w-3.5" /> Novo encaminhamento
              </button>
            )}
          </>
        }
      />

      {!p.rhConectado && (
        <Banner
          tone="info"
          title="O RH ainda não está conectado a esta central"
          description='Os currículos ficam guardados com a situação "Recebido". Quando o RH ligar a integração, ele passa a ler os arquivos e a situação muda aqui sozinha — você é avisado a cada etapa.'
        />
      )}
      {aviso && <Banner tone="success" title={aviso} onDismiss={() => setAviso(null)} />}

      <SgoKpis className="grid-cols-2 md:grid-cols-3 lg:grid-cols-5" flush>
        <SgoKpi label="Recebidos" value={String(i.recebidos)} meta="tudo que foi encaminhado" icon={Inbox} tone="brand" href={hrefDaFaixa('todos')} testId="kpi-recebidos" />
        <SgoKpi label="Em análise" value={String(i.analise)} meta="com o RH" icon={UserRoundSearch} tone="sky" href={hrefDaFaixa('analise')} testId="kpi-analise" />
        <SgoKpi label="Entrevistas" value={String(i.entrevista)} meta="agendadas" icon={CalendarClock} tone={i.entrevista ? 'amber' : 'gray'} href={hrefDaFaixa('entrevista')} testId="kpi-entrevista" />
        <SgoKpi label="Aprovados" value={String(i.aprovado)} icon={CheckCircle2} tone={i.aprovado ? 'green' : 'gray'} href={hrefDaFaixa('aprovado')} testId="kpi-aprovado" />
        <SgoKpi label="Contratados" value={String(i.contratado)} icon={UserCheck} tone={i.contratado ? 'violet' : 'gray'} href={hrefDaFaixa('contratado')} testId="kpi-contratado" />
      </SgoKpis>

      <div className="sgo-filtros -mx-4">
        <form className="flex min-w-[12rem] flex-1 items-center gap-2" onSubmit={(e) => { e.preventDefault(); ir({}); }}>
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" aria-hidden />
            <input
              value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome ou telefone" aria-label="Buscar candidato"
              className="h-10 w-full rounded-control border border-line-strong bg-surface pl-9 pr-3 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand focus:outline-none"
            />
          </div>
          <Button type="submit" size="sm" variant="secondary">Buscar</Button>
        </form>
        {p.cargosDaLista.length > 1 && (
          <div className="w-full sm:w-56">
            <Select size="sm" aria-label="Cargo" value={p.filtros.cargo} onValueChange={(v) => ir({ cargo: v })}
              options={[{ value: '', label: 'Todos os cargos' }, ...p.cargosDaLista.map((c) => ({ value: c, label: c }))]} />
          </div>
        )}
        {filtrando && <Link href={BASE} className="sgo-btn sgo-btn--sm"><X className="h-3.5 w-3.5" /> Limpar filtros</Link>}
      </div>

      {p.filtros.faixa !== 'todos' && (
        <p className="text-xs text-ink-500">Mostrando: <strong className="text-ink-900">{FAIXA_LABEL[p.filtros.faixa]}</strong>{i.encerrado > 0 && p.filtros.faixa !== 'encerrado' && <> · <Link href={hrefDaFaixa('encerrado')} className="underline">ver encerrados ({i.encerrado})</Link></>}</p>
      )}
      {p.filtros.faixa === 'todos' && i.encerrado > 0 && (
        <p className="text-xs text-ink-500"><Link href={hrefDaFaixa('encerrado')} className="underline">Encerrados ({i.encerrado})</Link>: reprovados, banco de talentos e desistências.</p>
      )}

      {p.linhas.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={filtrando ? 'Nenhum currículo com esses filtros' : 'Nenhum currículo encaminhado ainda'}
          description={filtrando ? 'Limpe os filtros para ver todos.' : p.podeEncaminhar ? 'Recebeu um currículo na unidade? Toque em "Novo encaminhamento", tire a foto ou anexe o PDF e pronto.' : 'Nada encaminhado pelas unidades.'}
          size="sm"
        />
      ) : (
        <>
          <List>
            {p.linhas.map((c) => (
              <ListRow
                key={c.id}
                onClick={() => setAberto(c)}
                title={c.candidateName}
                subtitle={[c.jobTitleName, p.visaoRede ? shortUnitName(c.unidade) : null, `encaminhado em ${dataBR(c.createdAt)}`, p.visaoRede ? `por ${c.createdByName}` : null].filter(Boolean).join(' · ')}
                trailing={
                  <>
                    {c.status === 'ENTREVISTA_AGENDADA' && c.interviewAt && <span className="whitespace-nowrap text-xs font-semibold text-ink-900">{dataHoraBR(c.interviewAt)}</span>}
                    <StatusBadge tone={STATUS_TOM[c.status]} dot>{STATUS_LABEL[c.status]}</StatusBadge>
                  </>
                }
              />
            ))}
          </List>
          {p.total > p.linhas.length && <p className="text-xs text-ink-500">Mostrando os {p.linhas.length} mais recentes de {p.total}. Use a busca para achar um candidato mais antigo.</p>}
        </>
      )}

      <NovoEncaminhamento
        open={novo}
        onClose={() => setNovo(false)}
        units={p.units}
        unidadeInicial={p.unidadeInicial}
        cargos={p.cargos}
        onEnviou={(nome) => { setNovo(false); setAviso(`Currículo de ${nome} encaminhado ao RH.`); router.refresh(); }}
      />
      <Ficha curriculo={aberto} onClose={() => setAberto(null)} visaoRede={p.visaoRede} />
    </div>
  );
}

/* ─────────────────────────── Novo encaminhamento ─────────────────────────── */

const CHAVE_DO_RASCUNHO = 'curriculo:novo';
interface RascunhoDoCurriculo { nome: string; fone: string; unitId: string; cargoId: string; obs: string; temArquivo: boolean }

function mascaraDeTelefone(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}
const tamanho = (b: number) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const TIPOS_ACEITOS = ['application/pdf', 'image/jpeg', 'image/png'];

function NovoEncaminhamento({ open, onClose, units, unidadeInicial, cargos, onEnviou }: {
  open: boolean; onClose: () => void; units: { id: string; name: string }[]; unidadeInicial: string; cargos: { id: string; name: string }[]; onEnviou: (nome: string) => void;
}) {
  const umaUnidade = units.length === 1 ? units[0].id : '';
  const [nome, setNome] = useState('');
  const [fone, setFone] = useState('');
  const [unitId, setUnitId] = useState(unidadeInicial || umaUnidade);
  const [cargoId, setCargoId] = useState('');
  const [obs, setObs] = useState('');
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [erro, setErro] = useState('');
  const [busy, setBusy] = useState(false);
  const [pronto, setPronto] = useState(false);
  const [recuperado, setRecuperado] = useState(false);
  /* v1.216.0 — a IA lê o currículo e preenche nome e telefone; o gerente confere e completa. */
  const [leitura, setLeitura] = useState<'parada' | 'lendo' | 'lido' | 'parcial' | 'nada' | 'sem-ia'>('parada');
  const lendoRef = useRef(0);
  const camera = useRef<HTMLInputElement>(null);
  const seletor = useRef<HTMLInputElement>(null);

  /* Recupera o que estava preenchido se a página foi recarregada na volta da câmera (v1.181.1). */
  useEffect(() => {
    const r = lerRascunho<RascunhoDoCurriculo>(CHAVE_DO_RASCUNHO);
    if (r) {
      setNome(r.nome ?? ''); setFone(r.fone ?? ''); setCargoId(r.cargoId ?? ''); setObs(r.obs ?? '');
      if (r.unitId && units.some((u) => u.id === r.unitId)) setUnitId(r.unitId);
      setRecuperado(true);
      if (r.temArquivo) void lerFotoLocal(CHAVE_DO_RASCUNHO).then((f) => { if (f) setArquivo(f); });
    }
    setPronto(true);
  }, [units]);

  useEffect(() => {
    if (!pronto) return;
    const vazio = !nome && !fone && !cargoId && !obs && !arquivo;
    if (vazio) apagarRascunho(CHAVE_DO_RASCUNHO);
    else gravarRascunho<RascunhoDoCurriculo>(CHAVE_DO_RASCUNHO, { nome, fone, unitId, cargoId, obs, temArquivo: !!arquivo });
  }, [pronto, nome, fone, unitId, cargoId, obs, arquivo]);

  const previa = useMemo(() => (arquivo && arquivo.type.startsWith('image/') ? URL.createObjectURL(arquivo) : null), [arquivo]);
  useEffect(() => () => { if (previa) URL.revokeObjectURL(previa); }, [previa]);

  function escolher(f: File | undefined | null) {
    setErro('');
    if (!f) return;
    const ext = (f.name.split('.').pop() ?? '').toLowerCase();
    if (!TIPOS_ACEITOS.includes(f.type) && !['pdf', 'jpg', 'jpeg', 'png'].includes(ext)) { setErro('Formato não aceito. Envie o currículo em PDF, JPG ou PNG.'); return; }
    if (f.size > ARQUIVO_MAX_BYTES) { setErro('Arquivo muito grande (máximo 15 MB).'); return; }
    setArquivo(f);
    void guardarFotoLocal(CHAVE_DO_RASCUNHO, f);
    void lerComIA(f);
  }
  /** Só PREENCHE o que está vazio: o que o gerente já digitou não é trocado. Falha = campos à mão, sem erro. */
  async function lerComIA(f: File) {
    const vez = ++lendoRef.current;
    setLeitura('lendo');
    try {
      const fd = new FormData();
      fd.set('arquivo', f);
      const r = await fetch('/api/curriculos/ler', { method: 'POST', body: fd });
      const d = await r.json().catch(() => ({}));
      if (vez !== lendoRef.current) return;
      if (!r.ok || d.configured === false) { setLeitura('sem-ia'); return; }
      if (!d.ok) { setLeitura('nada'); return; }
      if (d.nome) setNome((v) => v || String(d.nome));
      if (d.telefone) setFone((v) => v || mascaraDeTelefone(String(d.telefone)));
      setLeitura(d.nome && d.telefone ? 'lido' : d.nome || d.telefone ? 'parcial' : 'nada');
    } catch {
      if (vez === lendoRef.current) setLeitura('sem-ia');
    }
  }
  function tirarArquivo() {
    setArquivo(null);
    lendoRef.current++;
    setLeitura('parada');
    void apagarFotoLocal(CHAVE_DO_RASCUNHO);
    if (camera.current) camera.current.value = '';
    if (seletor.current) seletor.current.value = '';
  }
  function limpar() {
    setNome(''); setFone(''); setCargoId(''); setObs(''); setErro(''); setRecuperado(false);
    tirarArquivo();
    apagarRascunho(CHAVE_DO_RASCUNHO);
  }

  async function enviar() {
    setErro('');
    if (!arquivo) { setErro('Anexe o currículo: tire uma foto ou escolha o arquivo.'); return; }
    if (leitura === 'lendo') { setErro('Aguarde: o currículo ainda está sendo lido.'); return; }
    if (!unitId) { setErro('Escolha a unidade.'); return; }
    const nomeOk = normalizarNome(nome);
    if (!nomeOk) { setErro('Complete o nome do candidato (nome e sobrenome).'); return; }
    if (!normalizarTelefone(fone)) { setErro('Complete o telefone com DDD.'); return; }
    if (!cargoId) { setErro('Escolha o cargo pretendido.'); return; }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set('unitId', unitId); fd.set('candidateName', nomeOk); fd.set('phone', fone); fd.set('jobTitleId', cargoId); fd.set('note', obs.trim());
      fd.set('arquivo', arquivo);
      const r = await fetch('/api/curriculos', { method: 'POST', body: fd });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setErro(d.error ?? 'Não foi possível encaminhar. Tente de novo.'); return; }
      limpar();
      onEnviou(nomeOk);
    } catch {
      setErro('Falha de conexão. O currículo NÃO foi encaminhado — tente de novo.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <SgoModal
      open={open}
      onClose={() => { if (!busy) onClose(); }}
      title="Novo encaminhamento de currículo"
      subtitle="Anexe o currículo: o sistema lê o nome e o telefone. Você escolhe o cargo e acompanha a situação por aqui."
      icon={<FileUp className="h-4 w-4" />}
      tone="brand"
      size="sm"
      preventCloseOnOutside
      data-testid="modal-novo-curriculo"
      footerLeft={(nome || fone || arquivo) ? <button type="button" className="sgo-btn sgo-btn--sm" onClick={limpar} disabled={busy}>Limpar</button> : undefined}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>Cancelar</Button>
          <Button size="sm" onClick={() => void enviar()} loading={busy} data-testid="encaminhar-curriculo">Encaminhar ao RH</Button>
        </>
      }
    >
      <div className="space-y-3">
        {recuperado && <p className="rounded-lg bg-info/10 px-3 py-2 text-xs text-ink-700" data-testid="rascunho-recuperado">Recuperamos o que você já tinha preenchido.</p>}
        <div>
          <p className="mb-1 text-xs font-medium text-ink-700">Currículo <span className="text-danger">*</span></p>
          {/* Dois caminhos, cada um com o seu input: `capture` abre a câmera; o outro abre os arquivos (PDF incluso). */}
          <input ref={camera} type="file" accept="image/jpeg,image/png" capture="environment" className="hidden" onChange={(e) => escolher(e.target.files?.[0])} data-testid="input-camera" />
          <input ref={seletor} type="file" accept="application/pdf,image/jpeg,image/png" className="hidden" onChange={(e) => escolher(e.target.files?.[0])} data-testid="input-arquivo" />
          {arquivo ? (
            <div className="flex items-center gap-3 rounded-card border border-line-strong bg-surface p-3" data-testid="arquivo-escolhido">
              {previa
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={previa} alt="Prévia do currículo" className="h-16 w-12 shrink-0 rounded-md border border-line object-cover" />
                : <span className="flex h-16 w-12 shrink-0 items-center justify-center rounded-md bg-sunken"><FileText className="h-6 w-6 text-ink-500" aria-hidden /></span>}
              <div className="min-w-0 flex-1">
                <p className="break-all text-sm font-medium text-ink-900">{arquivo.name || 'Foto da câmera'}</p>
                <p className="text-xs text-ink-500">{tamanho(arquivo.size)}</p>
              </div>
              <Button size="sm" variant="ghost" onClick={tirarArquivo} disabled={busy}>Trocar</Button>
            </div>
          ) : (
            <div className="rounded-card border border-dashed border-line-strong bg-surface p-4 text-center">
              <p className="text-sm font-semibold text-ink-900">Anexar currículo</p>
              <p className="mb-3 text-xs text-ink-500">Foto com a câmera ou arquivo PDF, JPG ou PNG (até 15 MB).</p>
              <div className="flex flex-wrap justify-center gap-2">
                <Button size="sm" variant="secondary" onClick={() => camera.current?.click()}><Camera className="h-4 w-4" /> Tirar foto</Button>
                <Button size="sm" variant="secondary" onClick={() => seletor.current?.click()}><FileUp className="h-4 w-4" /> Escolher arquivo</Button>
              </div>
            </div>
          )}
        </div>

        {leitura !== 'parada' && (
          <p className="rounded-lg bg-info/10 px-3 py-2 text-xs text-ink-700" role="status" data-testid="leitura-do-curriculo" data-leitura={leitura}>
            {leitura === 'lendo' && 'Lendo o currículo…'}
            {leitura === 'lido' && 'Nome e telefone lidos do currículo. Confira antes de encaminhar.'}
            {leitura === 'parcial' && 'Só parte foi lida do currículo. Complete o que ficou em branco.'}
            {leitura === 'nada' && 'Não foi possível ler nome e telefone neste arquivo. Preencha abaixo.'}
            {leitura === 'sem-ia' && 'Leitura automática indisponível agora. Preencha nome e telefone abaixo.'}
          </p>
        )}
        <Input label="Nome do candidato" required value={nome} onChange={(e) => setNome(e.target.value)} placeholder={leitura === 'lendo' ? 'Lendo o currículo…' : 'Preenchido pela leitura do currículo'} maxLength={NOME_MAX} autoComplete="off" disabled={leitura === 'lendo'} />
        <Input label="Telefone ou WhatsApp" required value={fone} onChange={(e) => setFone(mascaraDeTelefone(e.target.value))} placeholder="(31) 99999-9999" inputMode="tel" autoComplete="off" disabled={leitura === 'lendo'} />
        {units.length > 1 && (
          <Select label="Unidade" required value={unitId} onValueChange={setUnitId} placeholder="Escolha a unidade" searchable={units.length > 8}
            options={units.map((u) => ({ value: u.id, label: shortUnitName(u.name) }))} />
        )}
        <Select label="Cargo pretendido" required value={cargoId} onValueChange={setCargoId} placeholder="Escolha o cargo" options={cargos.map((c) => ({ value: c.id, label: c.name }))} />

        <Textarea label="Observações do gerente (opcional)" value={obs} onChange={(e) => setObs(e.target.value)} maxLength={OBS_MAX} rows={2} placeholder="Ex.: candidato entregou o currículo presencialmente." />
        {erro && <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm font-medium text-danger" role="alert" data-testid="erro-curriculo">{erro}</p>}
      </div>
    </SgoModal>
  );
}

/* ─────────────────────────── Ficha do candidato ─────────────────────────── */

interface EventoUI { id: string; kind: 'ENCAMINHADO' | 'SITUACAO' | 'LEITURA_RH'; fromStatus: StatusDoCurriculo | null; toStatus: StatusDoCurriculo | null; note: string | null; origem: string; actorName: string | null; createdAt: string }

const TOM_DA_LINHA: Record<StatusDoCurriculo, SgoTimelineTom> = {
  RECEBIDO: 'gray', EM_ANALISE: 'sky', PRIMEIRA_ETAPA: 'sky', ENTREVISTA_AGENDADA: 'amber', AVALIACAO_FINAL: 'sky',
  APROVADO: 'green', REPROVADO: 'red', BANCO_DE_TALENTOS: 'gray', DESISTENCIA: 'gray', CONTRATADO: 'blue', ADMISSIONAL: 'green',
};

function Ficha({ curriculo, onClose, visaoRede }: { curriculo: CurriculoUI | null; onClose: () => void; visaoRede: boolean }) {
  const [eventos, setEventos] = useState<EventoUI[] | null>(null);
  const id = curriculo?.id ?? null;
  useEffect(() => {
    setEventos(null);
    if (!id) return;
    let vivo = true;
    fetch(`/api/curriculos/${id}`).then((r) => (r.ok ? r.json() : null)).then((d) => { if (vivo) setEventos(d?.eventos ?? []); }).catch(() => { if (vivo) setEventos([]); });
    return () => { vivo = false; };
  }, [id]);

  if (!curriculo) return null;
  const c = curriculo;
  const anexo = `/api/curriculos/${c.id}/anexo`;
  const ehImagem = c.attachmentMime.startsWith('image/');

  return (
    <SgoDrawer
      open
      onClose={onClose}
      title={c.candidateName}
      subtitle={[c.jobTitleName, visaoRede ? shortUnitName(c.unidade) : null].filter(Boolean).join(' · ')}
      icon={<Briefcase className="h-4 w-4" />}
      tone="brand"
      size="md"
      data-testid="ficha-do-curriculo"
      footer={<a href={anexo} target="_blank" rel="noreferrer" className="sgo-btn sgo-btn--primary"><ExternalLink className="h-3.5 w-3.5" /> Abrir currículo</a>}
    >
      <div className="space-y-4">
        <section className="rounded-card border border-line bg-surface p-3" data-testid="situacao-atual">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="sgo-label">Situação</span>
            <StatusBadge tone={STATUS_TOM[c.status]} dot>{STATUS_LABEL[c.status]}</StatusBadge>
          </div>
          <p className="mt-1 text-xs text-ink-500">desde {dataHoraBR(c.statusAt)} · informada pelo RH; não pode ser alterada aqui</p>
          {c.interviewAt && <p className="mt-2 flex items-center gap-2 text-sm font-semibold text-ink-900"><CalendarClock className="h-4 w-4 text-warning" aria-hidden /> Entrevista: {dataHoraBR(c.interviewAt)}</p>}
          {c.statusNote && <p className="mt-2 break-words text-sm text-ink-900">{c.statusNote}</p>}
        </section>

        <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <div><dt className="sgo-label">Telefone</dt><dd><a href={`tel:+55${c.phone}`} className="inline-flex items-center gap-1 font-medium text-ink-900 underline"><Phone className="h-3.5 w-3.5" aria-hidden /> {telefoneFormatado(c.phone)}</a></dd></div>
          <div><dt className="sgo-label">Encaminhado</dt><dd className="text-ink-900">{dataHoraBR(c.createdAt)}<span className="block text-xs text-ink-500">por {c.createdByName}</span></dd></div>
          {c.note && <div className="sm:col-span-2"><dt className="sgo-label">Observação do gerente</dt><dd className="break-words text-ink-900">{c.note}</dd></div>}
        </dl>

        {ehImagem && (
          <a href={anexo} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-card border border-line">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={anexo} alt={`Currículo de ${c.candidateName}`} className="max-h-80 w-full bg-sunken object-contain" loading="lazy" />
          </a>
        )}

        <section>
          <h3 className="sgo-label mb-1">Histórico</h3>
          {eventos === null ? (
            <p className="py-4 text-center text-xs text-ink-500">Carregando…</p>
          ) : (
            <SgoTimeline
              vazio="Sem histórico."
              grupos={[{
                chave: 'h', rotulo: '',
                itens: eventos.map((e) => ({
                  id: e.id,
                  quando: dataHoraBR(e.createdAt),
                  etiqueta: e.origem === 'RH' ? 'RH' : e.actorName ?? 'SGO',
                  titulo: e.kind === 'ENCAMINHADO' ? 'Encaminhado ao RH' : e.kind === 'LEITURA_RH' ? 'O RH abriu o currículo' : STATUS_LABEL[e.toStatus ?? 'RECEBIDO'],
                  descricao: e.kind === 'ENCAMINHADO' ? undefined : e.note ?? undefined,
                  tom: e.kind === 'SITUACAO' && e.toStatus ? TOM_DA_LINHA[e.toStatus] : e.kind === 'LEITURA_RH' ? 'sky' : 'gray',
                })),
              }]}
            />
          )}
        </section>
      </div>
    </SgoDrawer>
  );
}
