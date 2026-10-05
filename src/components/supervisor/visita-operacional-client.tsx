'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Camera, Check, CheckCircle2, ChevronDown, ClipboardCheck, Flag, Loader2, Minus, X } from 'lucide-react';
import { urlDoUpload } from '@/lib/waste/foto-regra';
import { aderencia, pctBR, type Alerta, type Gravidade, type Modo, type Resposta } from '@/lib/supervisor/operacional-calculo';

/* ─────────────────────────── tipos (vindos do servidor) ─────────────────────────── */
export interface RespostaUI {
  id: string; itemKey: string; itemId: string | null; section: string; text: string; level: string; mode: Modo;
  tempMin: number | null; tempMax: number | null; photoOnNc: boolean; noteOnNc: boolean;
  answer: Resposta | null; note: string | null; gravity: Gravidade | null; photos: string[];
  sampleChecked: number | null; sampleOk: number | null; temperature: number | null;
}
export interface AcaoUI { id: string; responseId: string | null; problem: string; category: string; responsibleName: string | null; dueDate: string | null; gravity: Gravidade; status: string; situacao: string; occurrenceId: string | null; unitNote?: string | null; visitId?: string }
export interface TipoOcorrenciaUI { id: string; name: string; isMaintenance: boolean; categories: { id: string; name: string }[] }

const br = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—');
const COR_ALERTA: Record<Alerta['nivel'], string> = { critico: 'bg-danger', alto: 'bg-warning', medio: 'bg-warning/60', ok: 'bg-success' };
const GRAVS: { v: Gravidade; t: string }[] = [{ v: 'BAIXA', t: 'Baixa' }, { v: 'MEDIA', t: 'Média' }, { v: 'ALTA', t: 'Alta' }, { v: 'CRITICA', t: 'Crítica' }];
const SIT: Record<string, string> = { ABERTO: 'sgo-tag--gray', EM_ANDAMENTO: 'sgo-tag--blue', AGUARDANDO_VALIDACAO: 'sgo-tag--amber', RESOLVIDO: 'sgo-tag--green', VENCIDO: 'sgo-tag--red' };
const SIT_TXT: Record<string, string> = { ABERTO: 'Aberto', EM_ANDAMENTO: 'Em andamento', AGUARDANDO_VALIDACAO: 'Aguardando validação', RESOLVIDO: 'Resolvido', VENCIDO: 'Vencido' };

async function postJson(body: Record<string, unknown>) {
  const r = await fetch('/api/supervision/operacional', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  return r.ok ? { ok: true as const, d } : { ok: false as const, erro: (d.error as string) ?? 'Não foi possível salvar.' };
}

/* ─────────────────────────── um item do roteiro ─────────────────────────── */
function ItemDaVisita({ r: inicial, visitId, tipos, acoes, onMudou, editavel }: {
  r: RespostaUI; visitId: string; tipos: TipoOcorrenciaUI[]; acoes: AcaoUI[]; onMudou: (r: RespostaUI) => void; editavel: boolean;
}) {
  const [r, setR] = useState(inicial);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [nota, setNota] = useState(inicial.note ?? '');
  const [conf, setConf] = useState(inicial.sampleChecked?.toString() ?? '');
  const [ok, setOk] = useState(inicial.sampleOk?.toString() ?? '');
  const [temp, setTemp] = useState(inicial.temperature?.toString() ?? '');
  const [acaoAberta, setAcaoAberta] = useState(false);
  const [resp, setResp] = useState('');
  const [prazo, setPrazo] = useState('');
  const [tipoOc, setTipoOc] = useState('');
  const [catOc, setCatOc] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const foto = useRef<HTMLInputElement>(null);
  const acao = acoes.find((a) => a.responseId === r.id) ?? null;
  const nc = r.answer === 'NAO_CONFORME';
  const comLimite = r.tempMin != null || r.tempMax != null;

  async function salvar(campos: Record<string, string | null | undefined>, arquivo?: File) {
    setBusy(true); setErro(null);
    const fd = new FormData();
    fd.append('responseId', r.id);
    const atual = { answer: r.answer ?? '', note: nota, gravity: r.gravity ?? '', sampleChecked: conf, sampleOk: ok, temperature: temp, ...campos };
    for (const [k, v] of Object.entries(atual)) fd.append(k, v ?? '');
    if (arquivo) fd.append('foto', arquivo);
    try {
      const res = await fetch('/api/supervision/operacional', { method: 'POST', body: fd });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setErro(d.error ?? 'Não foi possível salvar.'); return; }
      const novo: RespostaUI = {
        ...r, answer: d.answer ?? null, note: atual.note || null, gravity: d.answer === 'NAO_CONFORME' ? ((atual.gravity || 'MEDIA') as Gravidade) : null,
        sampleChecked: atual.sampleChecked ? Number(atual.sampleChecked) : null, sampleOk: atual.sampleOk ? Number(atual.sampleOk) : null,
        temperature: atual.temperature ? Number(String(atual.temperature).replace(',', '.')) : null,
        photos: [...r.photos.filter((p) => p !== campos.removerFoto), ...(d.foto ? [d.foto as string] : [])],
      };
      setR(novo); onMudou(novo);
    } finally { setBusy(false); }
  }

  async function criarAcao() {
    setBusy(true); setMsg(null);
    const x = await postJson({ acao: 'acao', visitId, responseId: r.id, problem: r.text.replace(/^Conferir no local: /, ''), category: r.section, responsibleName: resp, dueDate: prazo || null, gravity: r.gravity ?? 'MEDIA', note: nota });
    setBusy(false);
    if (!x.ok) { setMsg(x.erro); return; }
    setMsg('Ação incluída no plano.'); setAcaoAberta(false);
    onMudou({ ...r }); // força recarregar a lista de ações no pai
  }
  async function gerarOcorrencia() {
    if (!tipoOc) return;
    setBusy(true); setMsg(null);
    const x = await postJson({ acao: 'ocorrencia', responseId: r.id, typeId: tipoOc, categoryId: catOc || null });
    setBusy(false);
    setMsg(x.ok ? `Ocorrência nº ${x.d.number} aberta (com vínculo à visita).` : x.erro);
    if (x.ok) onMudou({ ...r });
  }

  const botao = (v: Resposta, rotulo: string, icone: React.ReactNode, cor: string) => (
    <button type="button" disabled={!editavel || busy} onClick={() => void salvar({ answer: v })} aria-pressed={r.answer === v}
      className={`flex min-h-12 flex-1 items-center justify-center gap-1.5 rounded-control border-2 px-2 text-sm font-semibold transition ${r.answer === v ? cor : 'border-line bg-surface text-ink-700'}`}
      data-testid={`resp-${v}`}>
      {icone} {rotulo}
    </button>
  );
  const tipo = tipos.find((t) => t.id === tipoOc);

  return (
    <li className="space-y-2 rounded-card border border-line bg-surface p-3" data-testid="item-visita">
      <div className="flex items-start gap-2">
        <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-pill ${r.answer === 'CONFORME' ? 'bg-success' : r.answer === 'NAO_CONFORME' ? 'bg-danger' : r.answer === 'NAO_SE_APLICA' ? 'bg-ink-400' : 'border border-line-strong'}`} aria-hidden />
        <p className="min-w-0 flex-1 text-sm font-medium text-ink-900">{r.text}</p>
        {busy && <Loader2 className="h-4 w-4 animate-spin text-ink-500" aria-label="Salvando" />}
      </div>

      {r.mode === 'AMOSTRAGEM' && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="block"><span className="sgo-label mb-1 block">Conferidos</span>
            <input inputMode="numeric" value={conf} disabled={!editavel} onChange={(e) => setConf(e.target.value.replace(/\D/g, ''))} onBlur={() => conf && void salvar({ sampleChecked: conf, sampleOk: ok || '0', answer: '' })}
              className="h-12 w-24 rounded-control border border-line bg-surface px-3 text-right text-base tabular-nums" aria-label="Quantidade conferida" />
          </label>
          <label className="block"><span className="sgo-label mb-1 block">Conformes</span>
            <input inputMode="numeric" value={ok} disabled={!editavel} onChange={(e) => setOk(e.target.value.replace(/\D/g, ''))} onBlur={() => conf && void salvar({ sampleChecked: conf, sampleOk: ok || '0', answer: '' })}
              className="h-12 w-24 rounded-control border border-line bg-surface px-3 text-right text-base tabular-nums" aria-label="Quantidade conforme" />
          </label>
          {conf && <span className="pb-3 text-sm text-ink-700">{Number(ok || 0)}/{conf} conformes</span>}
        </div>
      )}
      {r.mode === 'TEMPERATURA' && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="block"><span className="sgo-label mb-1 block">Temperatura (°C)</span>
            <input inputMode="decimal" value={temp} disabled={!editavel} onChange={(e) => setTemp(e.target.value.replace(/[^\d,.-]/g, ''))} onBlur={() => temp && comLimite && void salvar({ temperature: temp, answer: '' })}
              className="h-12 w-28 rounded-control border border-line bg-surface px-3 text-right text-base tabular-nums" aria-label="Temperatura encontrada" />
          </label>
          <span className="pb-3 text-xs text-ink-500">{comLimite ? `faixa: ${r.tempMin ?? '—'} a ${r.tempMax ?? '—'} °C (configurada)` : 'sem faixa configurada — marque conforme ou não'}</span>
        </div>
      )}

      <div className="flex gap-2">
        {(r.mode === 'SIMPLES' || (r.mode === 'TEMPERATURA' && !comLimite)) && (
          <>
            {botao('CONFORME', 'Conforme', <Check className="h-4 w-4" />, 'border-success bg-success/10 text-success')}
            {botao('NAO_CONFORME', 'Não conf.', <X className="h-4 w-4" />, 'border-danger bg-danger/10 text-danger')}
          </>
        )}
        {botao('NAO_SE_APLICA', 'N/A', <Minus className="h-4 w-4" />, 'border-ink-400 bg-sunken text-ink-700')}
      </div>

      {nc && (
        <div className="space-y-2 rounded-control border border-danger/30 bg-danger/5 p-2.5">
          <div>
            <span className="sgo-label mb-1 block">Gravidade</span>
            <div className="grid grid-cols-4 gap-1.5">
              {GRAVS.map((g) => (
                <button key={g.v} type="button" disabled={!editavel || busy} onClick={() => void salvar({ gravity: g.v })} aria-pressed={r.gravity === g.v}
                  className={`min-h-10 rounded-control border text-xs font-semibold ${r.gravity === g.v ? (g.v === 'CRITICA' || g.v === 'ALTA' ? 'border-danger bg-danger text-on-brand' : 'border-brand bg-brand text-on-brand') : 'border-line bg-surface text-ink-700'}`}>{g.t}</button>
              ))}
            </div>
          </div>
          <label className="block"><span className="sgo-label mb-1 block">Observação{r.noteOnNc ? ' (obrigatória)' : ''}</span>
            <textarea value={nota} disabled={!editavel} onChange={(e) => setNota(e.target.value)} onBlur={() => nota !== (r.note ?? '') && void salvar({ note: nota })} rows={2} maxLength={500}
              className="w-full rounded-control border border-line bg-surface px-3 py-2 text-sm" placeholder="O que foi encontrado" />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            {r.photos.map((p) => (
              <span key={p} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={urlDoUpload(p)} alt="Foto do item" className="h-16 w-16 rounded-control border border-line object-cover" />
                {editavel && <button type="button" onClick={() => void salvar({ removerFoto: p })} aria-label="Remover foto" className="absolute -right-1.5 -top-1.5 rounded-pill bg-danger p-0.5 text-on-brand"><X className="h-3 w-3" /></button>}
              </span>
            ))}
            {editavel && (
              <>
                <input ref={foto} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void salvar({}, f); }} />
                <button type="button" className="sgo-btn" disabled={busy} onClick={() => foto.current?.click()}><Camera className="h-4 w-4" /> Foto{r.photoOnNc && !r.photos.length ? ' (pedida)' : ''}</button>
              </>
            )}
          </div>
          {acao ? (
            <p className="text-xs text-ink-700"><Flag className="mr-1 inline h-3.5 w-3.5 text-brand" />No plano de ação{acao.responsibleName ? ` · ${acao.responsibleName}` : ''}{acao.dueDate ? ` · até ${br(acao.dueDate)}` : ''}{acao.occurrenceId ? ' · ocorrência aberta' : ''}</p>
          ) : editavel && (
            acaoAberta ? (
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_10rem_auto] sm:items-end">
                <label className="block"><span className="sgo-label mb-1 block">Responsável</span><input value={resp} onChange={(e) => setResp(e.target.value)} maxLength={80} className="h-11 w-full rounded-control border border-line bg-surface px-3 text-sm" placeholder="Nome ou função" /></label>
                <label className="block"><span className="sgo-label mb-1 block">Prazo</span><input type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} className="h-11 w-full rounded-control border border-line bg-surface px-3 text-sm" /></label>
                <button type="button" className="sgo-btn sgo-btn--primary" disabled={busy} onClick={() => void criarAcao()}>Incluir no plano</button>
              </div>
            ) : <button type="button" className="sgo-btn" onClick={() => setAcaoAberta(true)}><Flag className="h-4 w-4" /> Criar ação (responsável e prazo)</button>
          )}
          {editavel && !acao?.occurrenceId && tipos.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-xs font-semibold text-brand">Gerar ocorrência (manutenção / estrutura)</summary>
              <div className="mt-2 flex flex-wrap items-end gap-2">
                <select value={tipoOc} onChange={(e) => { setTipoOc(e.target.value); setCatOc(''); }} className="h-11 rounded-control border border-line bg-surface px-2 text-sm" aria-label="Tipo da ocorrência">
                  <option value="">Tipo…</option>
                  {tipos.map((t) => <option key={t.id} value={t.id}>{t.name}{t.isMaintenance ? ' (manutenção)' : ''}</option>)}
                </select>
                {tipo && tipo.categories.length > 0 && (
                  <select value={catOc} onChange={(e) => setCatOc(e.target.value)} className="h-11 rounded-control border border-line bg-surface px-2 text-sm" aria-label="Categoria">
                    <option value="">Categoria…</option>
                    {tipo.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                )}
                <button type="button" className="sgo-btn" disabled={!tipoOc || busy || (Boolean(tipo?.categories.length) && !catOc)} onClick={() => void gerarOcorrencia()}>Abrir ocorrência</button>
              </div>
            </details>
          )}
          {msg && <p className="text-xs text-ink-700" role="status">{msg}</p>}
        </div>
      )}
      {erro && <p className="text-xs text-danger" role="alert">{erro}</p>}
    </li>
  );
}

/* ─────────────────────────── tela da visita ─────────────────────────── */
export function VisitaOperacionalClient({ visita, unidade, alertas, respostas: iniciais, acoes, pendencias, tipos, editavel }: {
  visita: { id: string; data: string; status: string; supervisor: string };
  unidade: { name: string; operationType: string };
  alertas: Alerta[]; respostas: RespostaUI[]; acoes: AcaoUI[]; pendencias: AcaoUI[]; tipos: TipoOcorrenciaUI[]; editavel: boolean;
}) {
  const router = useRouter();
  const [respostas, setRespostas] = useState(iniciais);
  const [comentario, setComentario] = useState('');
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [validando, setValidando] = useState<string | null>(null);

  const conta = useMemo(() => aderencia(respostas.map((r) => ({ itemKey: r.itemKey, itemId: r.itemId, section: r.section, level: r.level, mode: r.mode, answer: r.answer, gravity: r.gravity, sampleChecked: r.sampleChecked, sampleOk: r.sampleOk }))), [respostas]);
  const pct = conta.total ? Math.round((conta.respondidos / conta.total) * 100) : 0;
  const mudou = (n: RespostaUI) => { setRespostas((xs) => xs.map((x) => (x.id === n.id ? n : x))); router.refresh(); };

  const grupos = useMemo(() => {
    const ordem = ['DIRECIONADA', 'PRIMORDIAL', 'COMPLEMENTAR'];
    return ordem.map((nivel) => {
      const itens = respostas.filter((r) => r.level === nivel);
      const secoes = [...new Set(itens.map((r) => r.section))].map((s) => ({ secao: s, itens: itens.filter((r) => r.section === s) }));
      return { nivel, itens, secoes };
    }).filter((g) => g.itens.length);
  }, [respostas]);
  const TITULO: Record<string, string> = { DIRECIONADA: 'B · Direcionadas pelos dados do SGO', PRIMORDIAL: 'A · Conferências primordiais', COMPLEMENTAR: 'C · Conferências complementares' };

  async function validar(id: string, resolvido: boolean) {
    setValidando(id); setErro(null);
    const x = await postJson({ acao: 'validar', actionId: id, visitId: visita.id, resolvido });
    setValidando(null);
    if (!x.ok) setErro(x.erro); else router.refresh();
  }
  async function finalizar() {
    setBusy(true); setErro(null);
    const x = await postJson({ acao: 'finalizar', visitId: visita.id, comentario });
    setBusy(false);
    if (!x.ok) { setErro(x.erro); return; }
    router.push(`/modulos/supervisao/visita/${visita.id}/resultado`);
  }

  return (
    <div className="space-y-4 pb-24" data-testid="visita-operacional">
      {/* progresso fixo no topo do conteúdo */}
      <div className="sgo-panel sgo-panel--solid sticky top-20 z-10 space-y-1.5 p-3">
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold text-ink-900">{conta.respondidos} de {conta.total} itens</span>
          <span className="tabular-nums text-ink-700">Aderência até agora: <b className="text-brand">{pctBR(conta.pct)}</b></span>
        </div>
        <div className="h-2 rounded-pill bg-sunken" aria-hidden><div className="h-2 rounded-pill bg-brand transition-all" style={{ width: `${pct}%` }} /></div>
        <p className="text-xs text-ink-500">{conta.naoConformes} não conforme(s) · {conta.naoAplicaveis} N/A · cada resposta salva na hora</p>
      </div>

      <details className="sgo-panel sgo-panel--solid p-3" open={alertas.some((a) => a.nivel !== 'ok')}>
        <summary className="flex cursor-pointer items-center gap-2 font-semibold text-ink-900"><AlertTriangle className="h-4 w-4 text-brand" /> Resumo pré-visita ({alertas.filter((a) => a.nivel !== 'ok').length} ponto(s) de atenção)<ChevronDown className="ml-auto h-4 w-4" /></summary>
        {alertas.length === 0 ? <p className="mt-2 text-sm text-ink-500">Sem dados do SGO que indiquem atenção para esta unidade.</p> : (
          <ul className="mt-2 space-y-1.5">
            {alertas.map((a) => (
              <li key={a.chave} className="flex items-start gap-2 text-sm">
                <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-pill ${COR_ALERTA[a.nivel]}`} aria-hidden />
                <span className="min-w-0"><span className="text-ink-900">{a.titulo}</span>{a.detalhe && <span className="block text-xs text-ink-500">{a.detalhe}</span>}<span className="block text-xs text-ink-500">fonte: {a.fonte}</span></span>
              </li>
            ))}
          </ul>
        )}
      </details>

      {pendencias.length > 0 && (
        <div className="sgo-panel sgo-panel--solid space-y-2 p-3" data-testid="pendencias-anteriores">
          <p className="flex items-center gap-2 font-semibold text-ink-900"><ClipboardCheck className="h-4 w-4 text-brand" /> Pendências de visitas anteriores ({pendencias.length})</p>
          <p className="text-xs text-ink-500">Confira no local. Só vira “resolvida” com a sua validação presencial.</p>
          <ul className="space-y-2">
            {pendencias.map((p) => (
              <li key={p.id} className="rounded-control border border-line p-2.5">
                <div className="flex flex-wrap items-center gap-2"><span className="text-sm font-medium text-ink-900">{p.problem}</span><span className={`sgo-tag ${SIT[p.situacao]}`}>{SIT_TXT[p.situacao]}</span></div>
                <p className="text-xs text-ink-500">{p.category}{p.responsibleName ? ` · ${p.responsibleName}` : ''}{p.dueDate ? ` · prazo ${br(p.dueDate)}` : ''}{p.unitNote ? ` · unidade: ${p.unitNote}` : ''}</p>
                {editavel && (
                  <div className="mt-2 flex gap-2">
                    <button type="button" className="sgo-btn sgo-btn--primary flex-1" disabled={validando === p.id} onClick={() => void validar(p.id, true)} data-testid="validar-resolvido"><CheckCircle2 className="h-4 w-4" /> Resolvido</button>
                    <button type="button" className="sgo-btn flex-1" disabled={validando === p.id} onClick={() => void validar(p.id, false)}><X className="h-4 w-4" /> Continua pendente</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {grupos.map((g) => (
        <details key={g.nivel} className="space-y-2" open={g.nivel !== 'COMPLEMENTAR'}>
          <summary className="flex cursor-pointer items-center gap-2 px-1 sgo-type-15 font-semibold text-ink-900">
            {TITULO[g.nivel]} <span className="sgo-count">{g.itens.filter((r) => r.answer).length}/{g.itens.length}</span><ChevronDown className="ml-auto h-4 w-4" />
          </summary>
          {g.secoes.map((s) => (
            <details key={s.secao} className="ml-1 space-y-2" open={g.nivel === 'DIRECIONADA' || s.itens.some((r) => !r.answer)}>
              <summary className="cursor-pointer px-1 text-sm font-semibold text-ink-700">{s.secao} <span className="text-xs font-normal text-ink-500">({s.itens.filter((r) => r.answer).length}/{s.itens.length})</span></summary>
              <ul className="space-y-2">
                {s.itens.map((r) => <ItemDaVisita key={r.id} r={r} visitId={visita.id} tipos={tipos} acoes={acoes} onMudou={mudou} editavel={editavel} />)}
              </ul>
            </details>
          ))}
        </details>
      ))}

      {editavel && (
        <div className="sgo-panel sgo-panel--solid space-y-2 p-3">
          <label className="block"><span className="sgo-label mb-1 block">Comentário final (opcional)</span>
            <textarea value={comentario} onChange={(e) => setComentario(e.target.value)} rows={2} maxLength={1000} className="w-full rounded-control border border-line bg-surface px-3 py-2 text-sm" placeholder="Se ficar em branco, o resumo é gerado pelos números da visita" />
          </label>
          {conta.pendentes > 0 && <p className="text-xs text-ink-500">{conta.pendentes} item(ns) sem resposta ficam como pendentes no resultado.</p>}
          {erro && <p className="text-sm text-danger" role="alert">{erro}</p>}
          <button type="button" className="sgo-btn sgo-btn--primary w-full" disabled={busy || conta.respondidos === 0} onClick={() => void finalizar()} data-testid="finalizar-visita">Finalizar visita e gerar resultado</button>
        </div>
      )}
    </div>
  );
}
