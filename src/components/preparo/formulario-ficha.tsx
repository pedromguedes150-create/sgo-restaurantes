'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Camera, X } from 'lucide-react';
import { Button } from '@/components/ui/ds/button';
import { Sheet } from '@/components/ui/ds/sheet';
import { Modal } from '@/components/ui/ds/modal';
import { Banner } from '@/components/ui/ds/banner';
import { compressImage } from '@/lib/image-compress';
import { diferencas, normalizarDados, MENSAGEM_INVALIDO, type DadosDaFicha, type Mudanca } from '@/lib/preparo/tipos';
import { EditorFicha, paraEnvio, type FichaEditavel } from './editor-ficha';

/**
 * O formulário da ficha dentro de um Sheet, nos três modos:
 * - 'nova'     → POST /api/padronizacao (multipart, com foto opcional);
 * - 'importar' → idem, levando o arquivo-fonte e a foto sugerida pela IA;
 * - 'editar'   → PATCH /api/padronizacao/[id] (a foto tem porta própria).
 *
 * CÓDIGO REPETIDO: o servidor responde 409 e a tela PERGUNTA — atualizar a
 * existente (com a comparação ANTES → NOVO antes de confirmar), criar nova
 * (a antiga é inativada) ou cancelar. Nunca sobrescreve sozinho.
 */
export type ModoDoFormulario = 'nova' | 'importar' | 'editar';

interface Existente { id: string; name: string; code: string }
type Erro = { title: string; description?: string } | null;

export function FormularioFicha({ open, modo, inicial, revisar = [], sourceFilePath = null, fotoInicial = null, fichaId, categorias, aviso, onClose, onSalvou }: {
  open: boolean;
  modo: ModoDoFormulario;
  inicial: FichaEditavel;
  revisar?: string[];
  sourceFilePath?: string | null;
  /** Foto já recortada/sugerida (importação) — o Admin pode trocar ou tirar. */
  fotoInicial?: File | null;
  fichaId?: string;
  categorias: string[];
  /** Mensagem de topo (ex.: "a IA não leu tudo") — vem de quem abriu o formulário. */
  aviso?: { tone: 'info' | 'warning' | 'danger'; title: string; description?: string } | null;
  onClose: () => void;
  onSalvou: (id: string) => void;
}) {
  const router = useRouter();
  const [valor, setValor] = React.useState<FichaEditavel>(inicial);
  const [foto, setFoto] = React.useState<File | null>(fotoInicial);
  const [fotoUrl, setFotoUrl] = React.useState<string | null>(null);
  const [salvando, setSalvando] = React.useState(false);
  const [erro, setErro] = React.useState<Erro>(null);
  const [erroCampo, setErroCampo] = React.useState<string | null>(null);
  const [duplicada, setDuplicada] = React.useState<Existente | null>(null);
  const [comparacao, setComparacao] = React.useState<{ existente: Existente; mudancas: Mudanca[]; dados: DadosDaFicha } | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => { if (open) { setValor(inicial); setFoto(fotoInicial); setErro(null); setErroCampo(null); setDuplicada(null); setComparacao(null); } }, [open, inicial, fotoInicial]);
  React.useEffect(() => {
    if (!foto) { setFotoUrl(null); return; }
    const url = URL.createObjectURL(foto);
    setFotoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [foto]);

  const titulo = modo === 'editar' ? 'Editar ficha' : modo === 'importar' ? 'Conferir ficha importada' : 'Nova ficha';

  async function escolherFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setFoto(await compressImage(f));
  }

  function validaLocal(): DadosDaFicha | null {
    const n = normalizarDados(paraEnvio(valor));
    if (!n.ok) { setErro({ title: MENSAGEM_INVALIDO[n.motivo] }); setErroCampo(n.campo ?? null); return null; }
    return n.dados;
  }

  async function criar(codigoRepetido?: 'NOVA') {
    const fd = new FormData();
    fd.set('dados', JSON.stringify(paraEnvio(valor)));
    if (foto) fd.set('photo', foto);
    if (sourceFilePath) fd.set('sourceFilePath', sourceFilePath);
    if (codigoRepetido) fd.set('codigoRepetido', codigoRepetido);
    const res = await fetch('/api/padronizacao', { method: 'POST', body: fd });
    return { res, body: await res.json().catch(() => ({})) as { id?: string; error?: string; reason?: string; campo?: string | null; existente?: Existente | null } };
  }

  async function atualizar(id: string) {
    const res = await fetch(`/api/padronizacao/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'update', dados: paraEnvio(valor) }) });
    return { res, body: await res.json().catch(() => ({})) as { id?: string; error?: string; reason?: string; campo?: string | null; existente?: Existente | null } };
  }

  async function enviarFoto(id: string) {
    if (!foto) return true;
    const fd = new FormData();
    fd.set('photo', foto);
    const res = await fetch(`/api/padronizacao/${id}/foto`, { method: 'POST', body: fd });
    return res.ok;
  }

  async function salvar() {
    setErro(null); setErroCampo(null);
    if (!validaLocal()) return;
    setSalvando(true);
    try {
      const { res, body } = modo === 'editar' && fichaId ? await atualizar(fichaId) : await criar();
      if (res.status === 409 && body.reason === 'CODIGO_EXISTE' && body.existente) {
        if (modo === 'editar') {
          setErro({ title: body.error ?? 'Código já em uso.', description: `A ficha "${body.existente.name}" já usa o código ${body.existente.code}. Troque o código ou inative a outra ficha.` });
        } else {
          setDuplicada(body.existente);
        }
        return;
      }
      if (!res.ok) { setErro({ title: body.error ?? 'Não foi possível salvar.' }); setErroCampo(body.campo ?? null); return; }
      router.refresh();
      onSalvou(body.id ?? fichaId ?? '');
    } finally {
      setSalvando(false);
    }
  }

  /** "Atualizar ficha existente": busca a atual e mostra ANTES → NOVO antes de confirmar. */
  async function prepararComparacao(existente: Existente) {
    const dados = validaLocal();
    if (!dados) { setDuplicada(null); return; }
    setSalvando(true);
    try {
      const res = await fetch(`/api/padronizacao/${existente.id}`);
      const body = await res.json().catch(() => ({})) as { ficha?: DadosDaFicha & { imagePath: string | null } };
      if (!res.ok || !body.ficha) { setErro({ title: 'Não foi possível carregar a ficha existente.' }); setDuplicada(null); return; }
      const mudancas = diferencas(body.ficha, dados);
      if (foto) mudancas.push({ field: 'Foto', oldValue: body.ficha.imagePath ? 'Atual' : 'Sem foto', newValue: 'Nova' });
      setDuplicada(null);
      setComparacao({ existente, mudancas, dados });
    } finally {
      setSalvando(false);
    }
  }

  async function confirmarAtualizacao() {
    if (!comparacao) return;
    setSalvando(true);
    try {
      const { res, body } = await atualizar(comparacao.existente.id);
      if (!res.ok) { setErro({ title: body.error ?? 'Não foi possível atualizar.' }); setComparacao(null); return; }
      const fotoOk = await enviarFoto(comparacao.existente.id);
      if (!fotoOk) setErro({ title: 'Ficha atualizada, mas a foto não foi gravada. Use "Alterar foto" na ficha.' });
      router.refresh();
      onSalvou(comparacao.existente.id);
    } finally {
      setSalvando(false);
    }
  }

  async function criarNovaMesmoAssim() {
    setSalvando(true);
    try {
      const { res, body } = await criar('NOVA');
      if (!res.ok) { setErro({ title: body.error ?? 'Não foi possível salvar.' }); setDuplicada(null); return; }
      router.refresh();
      onSalvou(body.id ?? '');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
        title={titulo}
        description={modo === 'editar' ? 'Nenhuma alteração é gravada até "Salvar". A foto tem o botão próprio na ficha.' : 'Nada é publicado até você confirmar em "Salvar e publicar".'}
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={salvando}>Cancelar</Button>
            <Button type="button" onClick={salvar} loading={salvando}>{modo === 'editar' ? 'Salvar' : 'Salvar e publicar'}</Button>
          </div>
        }
      >
        <div className="space-y-4">
          {aviso && <Banner tone={aviso.tone} title={aviso.title} description={aviso.description} />}
          {erro && <Banner tone="danger" title={erro.title} description={erro.description} onDismiss={() => setErro(null)} />}

          {modo !== 'editar' && (
            <section className="space-y-2">
              <h3 className="sgo-type-11 font-semibold text-ink-500">Foto do produto</h3>
              <div className="flex flex-wrap items-center gap-3">
                {fotoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={fotoUrl} alt="Foto do produto (prévia)" className="h-32 w-40 rounded-card border border-line object-cover" />
                ) : (
                  <div className="flex h-32 w-40 items-center justify-center rounded-card border border-dashed border-line-strong bg-sunken text-ink-400">
                    <Camera className="h-6 w-6" aria-hidden />
                  </div>
                )}
                <div className="flex flex-col gap-2">
                  <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={escolherFoto} />
                  <Button type="button" size="sm" variant="secondary" onClick={() => fileRef.current?.click()}>
                    <Camera className="h-4 w-4" /> {fotoUrl ? 'Trocar foto' : 'Enviar foto'}
                  </Button>
                  {fotoUrl && (
                    <Button type="button" size="sm" variant="ghost" onClick={() => setFoto(null)}>
                      <X className="h-4 w-4" /> Sem foto
                    </Button>
                  )}
                  <p className="max-w-xs text-xs text-ink-500">
                    {modo === 'importar' && fotoInicial ? 'Recorte sugerido pela leitura do arquivo — confira se é a foto do produto pronto.' : 'Foto do produto pronto, como deve ficar. Pode ser enviada depois.'}
                  </p>
                </div>
              </div>
            </section>
          )}

          <EditorFicha valor={valor} onChange={setValor} revisar={revisar} categorias={categorias} erroCampo={erroCampo} />
        </div>
      </Sheet>

      <Modal
        open={duplicada !== null}
        onClose={() => setDuplicada(null)}
        title="Já existe uma ficha para este código."
        description={duplicada ? `"${duplicada.name}" já usa o código ${duplicada.code}. O que você quer fazer?` : undefined}
        footer={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setDuplicada(null)} disabled={salvando}>Cancelar</Button>
            <Button type="button" variant="secondary" onClick={criarNovaMesmoAssim} loading={salvando}>Criar nova ficha</Button>
            <Button type="button" onClick={() => duplicada && prepararComparacao(duplicada)} loading={salvando}>Atualizar ficha existente</Button>
          </div>
        }
      >
        <ul className="space-y-1 text-sm text-ink-700">
          <li><strong>Atualizar ficha existente</strong> — você vê a comparação ANTES → NOVO e confirma; o histórico registra cada campo.</li>
          <li><strong>Criar nova ficha</strong> — esta entra como a ficha do código e a anterior fica INATIVA (continua no histórico administrativo).</li>
        </ul>
      </Modal>

      <Modal
        open={comparacao !== null}
        onClose={() => setComparacao(null)}
        title="Confirmar atualização"
        description={comparacao ? `A ficha "${comparacao.existente.name}" passará a ter estes valores:` : undefined}
        size="lg"
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setComparacao(null)} disabled={salvando}>Voltar</Button>
            <Button type="button" onClick={confirmarAtualizacao} loading={salvando} disabled={comparacao?.mudancas.length === 0}>Confirmar atualização</Button>
          </div>
        }
      >
        {comparacao && (comparacao.mudancas.length === 0 ? (
          <p className="text-sm text-ink-500">Nenhuma diferença entre a ficha existente e a nova — não há o que atualizar.</p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {comparacao.mudancas.map((m, i) => (
              <li key={i} className="grid gap-1 py-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] sm:items-center">
                <span className="font-semibold text-ink-900">{m.field}</span>
                <span className="text-ink-500">{m.oldValue ?? '—'}</span>
                <span className="text-ink-900">→ {m.newValue ?? '—'}</span>
              </li>
            ))}
          </ul>
        ))}
      </Modal>
    </>
  );
}
