'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Ban, Check, Paperclip, Pencil, RefreshCw, Send, Trash2, Undo2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SgoModal } from '@/components/sgo/sgo-modal';
import { CURRICULOS_POR_ENVIO, CURRICULO_MAX_BYTES, MOTIVO_MIN, type Acao } from '@/lib/vagas/regras';

const AREA = 'w-full rounded-control border border-line-strong bg-surface px-3 py-2 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand focus:outline-none';

async function chamar(id: string, corpo: Record<string, unknown> | FormData): Promise<string | null> {
  try {
    const res = await fetch(`/api/vagas/${id}`, corpo instanceof FormData ? { method: 'POST', body: corpo } : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
    if (res.ok) return null;
    const j = await res.json().catch(() => ({}));
    return j.error ?? 'Não foi possível concluir.';
  } catch {
    return 'Sem conexão. Tente de novo.';
  }
}

type Aberto = null | 'aprovar' | 'devolver' | 'cancelar' | 'excluir' | 'anexar';

const TEXTO: Record<'devolver' | 'cancelar' | 'excluir', { titulo: string; rotulo: string; dica: string; botao: string }> = {
  devolver: { titulo: 'Devolver para ajuste', rotulo: 'O que o gerente precisa ajustar?', dica: 'O gerente recebe este texto e corrige a solicitação.', botao: 'Devolver' },
  cancelar: { titulo: 'Cancelar a solicitação', rotulo: 'Motivo do cancelamento', dica: 'Se a vaga já está no RH, o RH é avisado.', botao: 'Cancelar a vaga' },
  excluir: { titulo: 'Excluir das listas', rotulo: 'Motivo da exclusão', dica: 'A vaga some das listas e dos contadores; o registro continua guardado.', botao: 'Excluir' },
};

/**
 * Os botões do rodapé do detalhe. Quais aparecem vem de `acoesDaVaga` (a mesma
 * tabela que o servidor usa para recusar): a tela só deixa de oferecer.
 */
export function AcoesDaVaga({ id, acoes, podeReenviar, noRh, aprovador }: { id: string; acoes: Acao[]; podeReenviar: boolean; noRh: boolean; aprovador: boolean }) {
  const router = useRouter();
  const [aberto, setAberto] = useState<Aberto>(null);
  const [motivo, setMotivo] = useState('');
  const [arquivos, setArquivos] = useState<{ file: File; indicadoPor: string }[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const tem = (a: Acao) => acoes.includes(a);

  function abrir(a: Aberto) { setAberto(a); setMotivo(''); setErro(null); setArquivos([]); }
  async function executar(corpo: Record<string, unknown> | FormData, depois?: () => void) {
    setOcupado(true); setErro(null);
    const e = await chamar(id, corpo);
    setOcupado(false);
    if (e) { setErro(e); return; }
    setAberto(null);
    if (depois) depois(); else router.refresh();
  }
  function escolher(fs: FileList | null) {
    if (!fs) return;
    const novos = [...fs].filter((f) => f.size > 0);
    const grande = novos.find((f) => f.size > CURRICULO_MAX_BYTES);
    if (grande) { setErro(`"${grande.name}" passa de 10 MB.`); return; }
    if (arquivos.length + novos.length > CURRICULOS_POR_ENVIO) { setErro(`No máximo ${CURRICULOS_POR_ENVIO} currículos por envio.`); return; }
    setErro(null);
    setArquivos((a) => [...a, ...novos.map((file) => ({ file, indicadoPor: '' }))]);
  }
  function anexar() {
    const form = new FormData();
    form.set('acao', 'anexar');
    for (const a of arquivos) { form.append('curriculo', a.file); form.append('indicadoPor', a.indicadoPor); }
    void executar(form);
  }

  if (acoes.length === 0 && !podeReenviar) return null;
  const t = aberto === 'devolver' || aberto === 'cancelar' || aberto === 'excluir' ? TEXTO[aberto] : null;

  return (
    <div className="flex flex-wrap gap-2 print:hidden" data-testid="acoes-da-vaga">
      {tem('aprovar') && <Button type="button" onClick={() => abrir('aprovar')} data-testid="acao-aprovar"><Check className="h-4 w-4" /> Aprovar</Button>}
      {tem('devolver') && <Button type="button" variant="outline" onClick={() => abrir('devolver')} data-testid="acao-devolver"><Undo2 className="h-4 w-4" /> Devolver</Button>}
      {tem('corrigir') && <Link href={`/modulos/vagas/${id}/editar`} className="sgo-btn sgo-btn--primary" data-testid="acao-corrigir"><Pencil className="h-4 w-4" /> Corrigir e reenviar</Link>}
      {tem('editar') && <Link href={`/modulos/vagas/${id}/editar`} className="sgo-btn" data-testid="acao-editar"><Pencil className="h-4 w-4" /> Editar</Link>}
      {tem('anexar') && <Button type="button" variant="outline" onClick={() => abrir('anexar')} data-testid="acao-anexar"><Paperclip className="h-4 w-4" /> {noRh ? 'Anexar currículo novo' : 'Anexar currículo'}</Button>}
      {podeReenviar && <Button type="button" variant="outline" disabled={ocupado} onClick={() => void executar({ acao: 'reenviar' })} data-testid="acao-reenviar"><RefreshCw className="h-4 w-4" /> Reenviar ao RH</Button>}
      {tem('cancelar') && <Button type="button" variant="outline" onClick={() => abrir('cancelar')} data-testid="acao-cancelar"><Ban className="h-4 w-4" /> Cancelar</Button>}
      {tem('excluir') && <Button type="button" variant="ghost" onClick={() => abrir('excluir')} data-testid="acao-excluir"><Trash2 className="h-4 w-4" /> Excluir</Button>}
      {erro && !aberto && <p role="alert" className="w-full text-sm font-semibold text-danger">{erro}</p>}

      <SgoModal open={aberto === 'aprovar'} onClose={() => setAberto(null)} title="Aprovar a solicitação" subtitle="Aprovada, a vaga vai sozinha para o RH."
        footer={<><Button type="button" variant="outline" onClick={() => setAberto(null)}>Voltar</Button><Button type="button" disabled={ocupado} onClick={() => void executar({ acao: 'aprovar' })} data-testid="confirmar-aprovar"><Send className="h-4 w-4" /> Aprovar e enviar ao RH</Button></>}>
        <p className="text-sm text-ink-900">Confira as pessoas, a escala e o início antes de aprovar. Depois de entregue ao RH você ainda pode editar — a alteração vai para lá.</p>
        {erro && <p role="alert" className="mt-2 text-sm font-semibold text-danger">{erro}</p>}
      </SgoModal>

      <SgoModal open={Boolean(t)} onClose={() => setAberto(null)} title={t?.titulo ?? ''} subtitle={t?.dica}
        footer={<><Button type="button" variant="outline" onClick={() => setAberto(null)}>Voltar</Button><Button type="button" disabled={ocupado || motivo.trim().length < MOTIVO_MIN} onClick={() => void executar({ acao: aberto, motivo }, aberto === 'excluir' ? () => { router.push('/modulos/vagas'); router.refresh(); } : undefined)} data-testid="confirmar-com-motivo">{t?.botao}</Button></>}>
        <label className="block text-sm font-semibold text-ink-900">{t?.rotulo}
          <textarea className={`${AREA} mt-1 font-normal`} rows={3} autoFocus value={motivo} onChange={(e) => setMotivo(e.target.value)} data-testid="campo-motivo" />
        </label>
        <p className="mt-1 text-xs text-ink-500">Pelo menos {MOTIVO_MIN} letras.</p>
        {erro && <p role="alert" className="mt-2 text-sm font-semibold text-danger">{erro}</p>}
      </SgoModal>

      <SgoModal open={aberto === 'anexar'} onClose={() => setAberto(null)} title={noRh ? 'Anexar currículo novo' : 'Anexar currículo'}
        subtitle={noRh ? (aprovador ? 'A vaga já está no RH: o currículo vai direto para lá.' : 'A vaga já está no RH: o supervisor avalia e envia.') : 'Vai ao RH junto com a vaga, quando for aprovada.'}
        footer={<><Button type="button" variant="outline" onClick={() => setAberto(null)}>Voltar</Button><Button type="button" disabled={ocupado || arquivos.length === 0} onClick={anexar} data-testid="confirmar-anexar"><Paperclip className="h-4 w-4" /> Anexar {arquivos.length || ''}</Button></>}>
        <p className="rounded-lg bg-sunken p-2 text-xs text-ink-700">Só o arquivo e quem indicou. Nada de comentário sobre o candidato. Toda indicação passa pela entrevista da CapacitaRH e pela consulta cadastral.</p>
        <div className="mt-3 space-y-2">
          {arquivos.map((a, i) => (
            <div key={`${a.file.name}-${i}`} className="flex flex-wrap items-center gap-2 rounded-lg border border-line p-2">
              <span className="min-w-[8rem] flex-1 break-words text-sm text-ink-900">{a.file.name}</span>
              <Input aria-label={`Indicado por — ${a.file.name}`} className="h-9 w-full text-sm sm:w-48" placeholder="Indicado por (opcional)" value={a.indicadoPor} onChange={(e) => setArquivos((xs) => xs.map((x, k) => (k === i ? { ...x, indicadoPor: e.target.value } : x)))} />
              <Button type="button" size="sm" variant="ghost" aria-label={`Tirar ${a.file.name}`} onClick={() => setArquivos((xs) => xs.filter((_, k) => k !== i))}><X className="h-4 w-4" /></Button>
            </div>
          ))}
          <label className="sgo-btn sgo-btn--sm inline-flex cursor-pointer">
            <Paperclip className="h-4 w-4" /> Escolher arquivo
            <input type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" className="sr-only" onChange={(e) => { escolher(e.target.files); e.target.value = ''; }} />
          </label>
          <p className="text-xs text-ink-500">Até {CURRICULOS_POR_ENVIO} arquivos, 10 MB cada: PDF, JPG, PNG, DOC ou DOCX.</p>
        </div>
        {erro && <p role="alert" className="mt-2 text-sm font-semibold text-danger">{erro}</p>}
      </SgoModal>
    </div>
  );
}

/** As ações de UM currículo: o supervisor avalia o novo; quem anexou tira o que ainda não foi ao RH. */
export function AcoesDoCurriculo({ vagaId, curriculoId, nome, podeAvaliar, podeRemover }: { vagaId: string; curriculoId: string; nome: string; podeAvaliar: boolean; podeRemover: boolean }) {
  const router = useRouter();
  const [recusando, setRecusando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  async function executar(corpo: Record<string, unknown>) {
    setOcupado(true); setErro(null);
    const e = await chamar(vagaId, corpo);
    setOcupado(false);
    if (e) { setErro(e); return; }
    setRecusando(false);
    router.refresh();
  }
  if (!podeAvaliar && !podeRemover) return null;
  return (
    <span className="flex flex-wrap items-center gap-1 print:hidden">
      {podeAvaliar && <Button type="button" size="sm" disabled={ocupado} onClick={() => void executar({ acao: 'avaliarCurriculo', curriculoId, enviar: true })} data-testid="curriculo-enviar"><Send className="h-3.5 w-3.5" /> Enviar ao RH</Button>}
      {podeAvaliar && <Button type="button" size="sm" variant="outline" onClick={() => { setRecusando(true); setMotivo(''); setErro(null); }} data-testid="curriculo-recusar">Recusar</Button>}
      {podeRemover && <Button type="button" size="sm" variant="ghost" disabled={ocupado} aria-label={`Tirar ${nome} da vaga`} onClick={() => void executar({ acao: 'removerCurriculo', curriculoId })}><Trash2 className="h-3.5 w-3.5" /></Button>}
      {erro && !recusando && <span role="alert" className="text-xs font-semibold text-danger">{erro}</span>}
      <SgoModal open={recusando} onClose={() => setRecusando(false)} title="Recusar o currículo" subtitle={`"${nome}" não será enviado ao RH. Quem anexou é avisado do motivo.`}
        footer={<><Button type="button" variant="outline" onClick={() => setRecusando(false)}>Voltar</Button><Button type="button" disabled={ocupado || motivo.trim().length < MOTIVO_MIN} onClick={() => void executar({ acao: 'avaliarCurriculo', curriculoId, enviar: false, motivo })}>Recusar</Button></>}>
        <label className="block text-sm font-semibold text-ink-900">Motivo da recusa
          <textarea className={`${AREA} mt-1 font-normal`} rows={3} autoFocus value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        </label>
        <p className="mt-1 text-xs text-ink-500">Pelo menos {MOTIVO_MIN} letras. Não escreva dado pessoal do candidato.</p>
        {erro && <p role="alert" className="mt-2 text-sm font-semibold text-danger">{erro}</p>}
      </SgoModal>
    </span>
  );
}
