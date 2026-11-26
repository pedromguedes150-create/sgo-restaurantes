'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Copy, Paperclip, Plus, Send, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/ds/select';
import { DatePicker } from '@/components/ui/ds/date-picker';
import { shortUnitName } from '@/lib/unit-name';
import { CURRICULOS_POR_ENVIO, CURRICULO_MAX_BYTES, dataMinimaDaEdicao, ESCALAS, MOTIVOS, PESSOAS_MAX, validarVaga, normalizarVaga, type ErroDeCampo, type PessoaDaVaga } from '@/lib/vagas/regras';
import type { Apoio } from '@/lib/vagas/dados';
import type { VagaDTO } from '@/lib/vagas/tipos';

/**
 * O FORMULÁRIO da vaga — o mesmo para pedir, corrigir a devolvida e editar
 * (supervisor). Uma linha por PESSOA. A validação é a MESMA função do servidor;
 * aqui ela só poupa uma ida e volta — quem decide é o servidor.
 */

type Modo = 'nova' | 'corrigir' | 'editar';
const OUTRO = '__outro__';
const AREA = 'w-full rounded-control border border-line-strong bg-surface px-3 py-2 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand focus:outline-none';

interface Linha extends PessoaDaVaga { cargoLivre: boolean; escalaLivre: boolean; substituiLivre: boolean }
const vazia = (hoje: string): Linha => ({ cargo: '', motivo: '', substituiNome: '', substituiColaboradorId: '', escala: '', horario: '', inicioDesejado: hoje, requisitos: '', observacao: '', cargoLivre: false, escalaLivre: false, substituiLivre: false });

export function FormularioVaga({ modo, apoio, hoje, vaga }: { modo: Modo; apoio: Apoio; hoje: string; vaga?: VagaDTO }) {
  const router = useRouter();
  const umaUnidade = apoio.unidades.length === 1;
  const [unitId, setUnitId] = useState(vaga?.unitId ?? (umaUnidade ? apoio.unidades[0].id : ''));
  const [prioridade, setPrioridade] = useState(vaga?.prioridade === 'URGENTE' ? 'URGENTE' : 'NORMAL');
  const [linhas, setLinhas] = useState<Linha[]>(() => vaga
    ? vaga.posicoes.map((p) => ({ ...p, substituiNome: p.substituiNome ?? '', substituiColaboradorId: p.substituiColaboradorId ?? '', requisitos: p.requisitos ?? '', observacao: p.observacao ?? '', cargoLivre: Boolean(p.cargo) && !apoio.cargos.includes(p.cargo), escalaLivre: Boolean(p.escala) && !ESCALAS.includes(p.escala), substituiLivre: Boolean(p.substituiNome) && !p.substituiColaboradorId }))
    : [vazia(hoje)]);
  const [arquivos, setArquivos] = useState<{ file: File; indicadoPor: string }[]>([]);
  const [erros, setErros] = useState<ErroDeCampo[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const pessoasDaUnidade = useMemo(() => apoio.colaboradores[unitId] ?? [], [apoio.colaboradores, unitId]);
  const dataMinima = modo === 'editar' ? dataMinimaDaEdicao(hoje, vaga?.inicioDesejado) : hoje;
  const muda = (i: number, m: Partial<Linha>) => setLinhas((xs) => xs.map((x, k) => (k === i ? { ...x, ...m } : x)));
  const erroDe = (i: number, campo: string) => erros.find((e) => e.pessoa === i + 1 && e.campo === campo)?.mensagem;

  function escolherArquivos(fs: FileList | null) {
    if (!fs) return;
    const novos = [...fs].filter((f) => f.size > 0);
    const grande = novos.find((f) => f.size > CURRICULO_MAX_BYTES);
    if (grande) { setErro(`"${grande.name}" passa de 10 MB.`); return; }
    if (arquivos.length + novos.length > CURRICULOS_POR_ENVIO) { setErro(`No máximo ${CURRICULOS_POR_ENVIO} currículos por envio.`); return; }
    setErro(null);
    setArquivos((a) => [...a, ...novos.map((file) => ({ file, indicadoPor: '' }))]);
  }

  async function enviar() {
    setErro(null);
    const dados = normalizarVaga({ unitId, prioridade, pessoas: linhas });
    const es = validarVaga(dados, { dataMinima });
    setErros(es);
    if (es.length) { setErro(es.length === 1 ? es[0].mensagem : `Faltam ${es.length} informações — veja os campos marcados.`); return; }
    setEnviando(true);
    try {
      const form = new FormData();
      form.set('dados', JSON.stringify(dados));
      if (modo !== 'nova') form.set('acao', modo);
      if (modo === 'nova') for (const a of arquivos) { form.append('curriculo', a.file); form.append('indicadoPor', a.indicadoPor); }
      const res = await fetch(modo === 'nova' ? '/api/vagas' : `/api/vagas/${vaga!.id}`, { method: 'POST', body: form });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setErros(Array.isArray(j.erros) ? j.erros : []); setErro(j.error ?? 'Não foi possível enviar.'); return; }
      router.push(`/modulos/vagas/${j.id ?? vaga?.id}`);
      router.refresh();
    } catch {
      setErro('Sem conexão. Tente de novo.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="space-y-4" data-testid="formulario-vaga">
      {modo === 'corrigir' && vaga?.motivoDevolucao && (
        <p className="rounded-card border border-warning bg-warning-bg p-3 text-sm text-ink-900" data-testid="pedido-do-supervisor">
          <b>O supervisor pediu:</b> {vaga.motivoDevolucao}
        </p>
      )}

      <section className="sgo-panel sgo-panel--solid space-y-3 p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {modo === 'nova' && !umaUnidade ? (
            <Select label="Unidade" required searchable value={unitId || null} onValueChange={setUnitId} placeholder="Escolha a unidade" options={apoio.unidades.map((u) => ({ value: u.id, label: shortUnitName(u.name) }))} error={erros.find((e) => e.campo === 'unitId')?.mensagem} />
          ) : (
            <div><Label>Unidade</Label><p className="pt-2 text-sm font-semibold text-ink-900">{shortUnitName(vaga?.unitName ?? apoio.unidades.find((u) => u.id === unitId)?.name ?? '')}</p></div>
          )}
          <Select label="Prioridade" value={prioridade} onValueChange={setPrioridade} options={[{ value: 'NORMAL', label: 'Normal' }, { value: 'URGENTE', label: 'Urgente' }]} />
          <div><Label>Quantas pessoas</Label><p className="pt-2 text-sm font-semibold text-ink-900">{linhas.length} <span className="font-normal text-ink-500">(uma linha por pessoa, até {PESSOAS_MAX})</span></p></div>
        </div>
      </section>

      {linhas.map((l, i) => (
        <section key={i} className="sgo-panel sgo-panel--solid space-y-3 p-4" data-testid="pessoa-da-vaga">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-ink-900">Pessoa {i + 1}{l.cargo ? ` · ${l.cargo}` : ''}</h2>
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="outline" disabled={linhas.length >= PESSOAS_MAX} onClick={() => setLinhas((xs) => [...xs.slice(0, i + 1), { ...l, substituiNome: '', substituiColaboradorId: '', substituiLivre: false }, ...xs.slice(i + 1)])}><Copy className="h-4 w-4" /> Copiar</Button>
              {linhas.length > 1 && <Button type="button" size="sm" variant="ghost" aria-label={`Remover a pessoa ${i + 1}`} onClick={() => setLinhas((xs) => xs.filter((_, k) => k !== i))}><Trash2 className="h-4 w-4" /></Button>}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-2">
              <Select label="Cargo" required searchable value={l.cargoLivre ? OUTRO : l.cargo || null} placeholder="Escolha o cargo" error={l.cargoLivre ? undefined : erroDe(i, 'cargo')}
                onValueChange={(v) => (v === OUTRO ? muda(i, { cargoLivre: true, cargo: '' }) : muda(i, { cargoLivre: false, cargo: v }))}
                options={[...apoio.cargos.map((c) => ({ value: c, label: c })), { value: OUTRO, label: 'Outro (digitar)' }]} />
              {l.cargoLivre && <Input aria-label="Cargo" placeholder="Digite o cargo" value={l.cargo} onChange={(e) => muda(i, { cargo: e.target.value })} />}
              {l.cargoLivre && erroDe(i, 'cargo') && <p className="text-xs text-danger">{erroDe(i, 'cargo')}</p>}
            </div>
            <Select label="Motivo" required value={l.motivo || null} placeholder="Escolha o motivo" error={erroDe(i, 'motivo')} onValueChange={(v) => muda(i, { motivo: v })} options={MOTIVOS.map((m) => ({ value: m.value, label: m.label }))} />
            <div className="space-y-2">
              <Select label={`Substitui alguém?${l.motivo === 'SUBSTITUICAO' ? ' *' : ''}`} searchable value={l.substituiLivre ? OUTRO : l.substituiColaboradorId || null} placeholder={unitId ? 'Ninguém / escolher' : 'Escolha a unidade antes'} disabled={!unitId} error={l.substituiLivre ? undefined : erroDe(i, 'substitui')}
                onValueChange={(v) => {
                  if (v === OUTRO) return muda(i, { substituiLivre: true, substituiColaboradorId: '', substituiNome: '' });
                  if (v === '') return muda(i, { substituiLivre: false, substituiColaboradorId: '', substituiNome: '' });
                  const p = pessoasDaUnidade.find((x) => x.id === v);
                  muda(i, { substituiLivre: false, substituiColaboradorId: v, substituiNome: p?.nome ?? '' });
                }}
                options={[{ value: '', label: 'Ninguém' }, ...pessoasDaUnidade.map((p) => ({ value: p.id, label: p.nome, hint: `${p.cargo ?? 'sem cargo'}${p.ativo ? '' : ' · desligado'}` })), { value: OUTRO, label: 'Outro (digitar o nome)' }]} />
              {l.substituiLivre && <Input aria-label="Nome de quem é substituído" placeholder="Nome de quem sai" value={l.substituiNome ?? ''} onChange={(e) => muda(i, { substituiNome: e.target.value })} />}
              {l.substituiLivre && erroDe(i, 'substitui') && <p className="text-xs text-danger">{erroDe(i, 'substitui')}</p>}
            </div>
            <div className="space-y-2">
              <Select label="Escala" required value={l.escalaLivre ? OUTRO : l.escala || null} placeholder="Escolha a escala" error={l.escalaLivre ? undefined : erroDe(i, 'escala')}
                onValueChange={(v) => (v === OUTRO ? muda(i, { escalaLivre: true, escala: '' }) : muda(i, { escalaLivre: false, escala: v }))}
                options={[...ESCALAS.map((e) => ({ value: e, label: e })), { value: OUTRO, label: 'Outra (digitar)' }]} />
              {l.escalaLivre && <Input aria-label="Escala" placeholder="Digite a escala" value={l.escala} onChange={(e) => muda(i, { escala: e.target.value })} />}
              {l.escalaLivre && erroDe(i, 'escala') && <p className="text-xs text-danger">{erroDe(i, 'escala')}</p>}
            </div>
            <div>
              <Label>Horário *</Label>
              <Input placeholder="ex.: 11:00 às 19:20" value={l.horario} onChange={(e) => muda(i, { horario: e.target.value })} />
              {erroDe(i, 'horario') && <p className="mt-1 text-xs text-danger">{erroDe(i, 'horario')}</p>}
            </div>
            <DatePicker label="Início desejado" required min={dataMinima} value={l.inicioDesejado || null} onValueChange={(v) => muda(i, { inicioDesejado: v ?? '' })} error={erroDe(i, 'inicioDesejado')} />
            <div className="sm:col-span-2 lg:col-span-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div><Label>O que é obrigatório? (opcional)</Label><textarea className={AREA} rows={2} placeholder="ex.: ensino médio, experiência com atendimento" value={l.requisitos ?? ''} onChange={(e) => muda(i, { requisitos: e.target.value })} /></div>
              <div><Label>Observação (opcional)</Label><textarea className={AREA} rows={2} value={l.observacao ?? ''} onChange={(e) => muda(i, { observacao: e.target.value })} /></div>
            </div>
          </div>
        </section>
      ))}

      <Button type="button" variant="outline" disabled={linhas.length >= PESSOAS_MAX} onClick={() => setLinhas((xs) => [...xs, vazia(hoje)])} data-testid="adicionar-pessoa"><Plus className="h-4 w-4" /> Adicionar pessoa</Button>

      {modo === 'nova' && (
        <section className="sgo-panel sgo-panel--solid space-y-3 p-4" data-testid="curriculos-da-vaga">
          <h2 className="text-sm font-bold text-ink-900">Currículos (opcional)</h2>
          <p className="rounded-lg bg-sunken p-2 text-xs text-ink-700">Só o arquivo e quem indicou. Nada de comentário sobre o candidato. Toda indicação passa pela entrevista da CapacitaRH e pela consulta cadastral.</p>
          {arquivos.map((a, i) => (
            <div key={`${a.file.name}-${i}`} className="flex flex-wrap items-center gap-2 rounded-lg border border-line p-2">
              <Paperclip className="h-4 w-4 shrink-0 text-ink-500" />
              <span className="min-w-[8rem] flex-1 break-words text-sm text-ink-900">{a.file.name}</span>
              <Input aria-label={`Indicado por — ${a.file.name}`} className="h-9 w-full text-sm sm:w-56" placeholder="Indicado por (opcional)" value={a.indicadoPor} onChange={(e) => setArquivos((xs) => xs.map((x, k) => (k === i ? { ...x, indicadoPor: e.target.value } : x)))} />
              <Button type="button" size="sm" variant="ghost" aria-label={`Tirar ${a.file.name}`} onClick={() => setArquivos((xs) => xs.filter((_, k) => k !== i))}><Trash2 className="h-4 w-4" /></Button>
            </div>
          ))}
          <label className="sgo-btn sgo-btn--sm inline-flex cursor-pointer">
            <Paperclip className="h-4 w-4" /> Anexar currículo
            <input type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" className="sr-only" onChange={(e) => { escolherArquivos(e.target.files); e.target.value = ''; }} />
          </label>
          <p className="text-xs text-ink-500">Até {CURRICULOS_POR_ENVIO} arquivos, 10 MB cada: PDF, JPG, PNG, DOC ou DOCX.</p>
        </section>
      )}

      {erro && <p role="alert" className="rounded-lg border border-danger bg-danger-bg p-3 text-sm font-semibold text-danger" data-testid="erro-do-formulario">{erro}</p>}

      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={enviando} onClick={enviar} data-testid="enviar-vaga">
          <Send className="h-4 w-4" /> {enviando ? 'Enviando…' : modo === 'nova' ? 'Enviar ao supervisor' : modo === 'corrigir' ? 'Reenviar ao supervisor' : 'Salvar alteração'}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>Voltar</Button>
      </div>
    </div>
  );
}
