'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Camera, ChevronLeft, ChevronRight, History, ImageOff, Pencil, Power, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/ds/button';
import { SegmentedControl } from '@/components/ui/ds/segmented-control';
import { Table } from '@/components/ui/ds/table';
import { Modal } from '@/components/ui/ds/modal';
import { Banner } from '@/components/ui/ds/banner';
import { StatusBadge } from '@/components/ui/ds/status-badge';
import { compressImage } from '@/lib/image-compress';
import { cn } from '@/lib/utils';
import { textoQuantidade, textoPeso, CAMPO_FOTO, type ItemDaFicha } from '@/lib/preparo/tipos';
import type { FichaCompleta, LinhaDoHistorico } from '@/lib/preparo/query';
import { paraEditavel } from './editor-ficha';
import { FormularioFicha } from './formulario-ficha';

/**
 * A FICHA — o que o funcionário vê em poucos segundos: qual é o produto, como
 * deve ficar (foto em destaque), o que leva e quanto (tabela limpa), como
 * preparar. Desktop: tabela à esquerda, foto à direita; celular: uma coluna,
 * foto antes dos ingredientes. As funções do Admin só aparecem para ele.
 */
type Aba = 'ingredientes' | 'preparo' | 'observacoes';

export function FichaClient({ ficha, vizinhos, isAdmin, historico, categorias }: {
  ficha: FichaCompleta;
  vizinhos: { prevId: string | null; nextId: string | null; posicao: number; total: number };
  isAdmin: boolean;
  historico: LinhaDoHistorico[];
  categorias: string[];
}) {
  const router = useRouter();
  const [aba, setAba] = React.useState<Aba>('ingredientes');
  const [editando, setEditando] = React.useState(false);
  const [foto, setFoto] = React.useState(false);
  const [aviso, setAviso] = React.useState<{ tone: 'success' | 'danger'; title: string } | null>(null);
  const [mudandoStatus, setMudandoStatus] = React.useState(false);

  const inicial = React.useMemo(() => paraEditavel(ficha), [ficha]);
  const inativa = ficha.status === 'INACTIVE';

  async function alternarStatus() {
    const status = inativa ? 'ACTIVE' : 'INACTIVE';
    if (!inativa && !window.confirm('Desativar esta ficha? Ela some do catálogo dos funcionários e continua no histórico administrativo.')) return;
    setMudandoStatus(true);
    try {
      const res = await fetch(`/api/padronizacao/${ficha.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'status', status }) });
      const body = await res.json().catch(() => ({})) as { error?: string };
      if (!res.ok) { setAviso({ tone: 'danger', title: body.error ?? 'Não foi possível mudar a situação.' }); return; }
      setAviso({ tone: 'success', title: status === 'ACTIVE' ? 'Ficha reativada.' : 'Ficha desativada.' });
      router.refresh();
    } finally {
      setMudandoStatus(false);
    }
  }

  const colunas = [
    { key: 'ingrediente', header: 'Ingrediente / Produto', cell: (i: ItemDaFicha) => <span className="font-medium text-ink-900">{i.ingredientName}</span> },
    { key: 'qtd', header: 'Quantidade', cell: (i: ItemDaFicha) => textoQuantidade(i) || null },
    { key: 'peso', header: 'Peso (g)', numeric: true, cell: (i: ItemDaFicha) => (i.weightGrams === null ? null : String(i.weightGrams).replace('.', ',')) },
    { key: 'obs', header: 'Observação', cell: (i: ItemDaFicha) => i.notes },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href="/modulos/padronizacao" className="inline-flex items-center gap-1 text-sm font-semibold text-brand hover:underline">
          <ArrowLeft className="h-4 w-4" aria-hidden /> Voltar para Padronização
        </Link>
        <div className="flex items-center gap-1">
          <NavLink id={vizinhos.prevId} rotulo="Anterior" icone={<ChevronLeft className="h-4 w-4" aria-hidden />} />
          <span className="px-2 text-xs tabular-nums text-ink-500">{vizinhos.posicao > 0 ? `${vizinhos.posicao} de ${vizinhos.total}` : '—'}</span>
          <NavLink id={vizinhos.nextId} rotulo="Próximo" icone={<ChevronRight className="h-4 w-4" aria-hidden />} depois />
        </div>
      </div>

      <header className="rounded-card border border-line bg-surface p-4 shadow-sgo-card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="sgo-type-11 font-semibold text-brand">{ficha.category}</p>
            <h2 className="sgo-type-24 mt-1 font-bold text-ink-900">{ficha.name}</h2>
            <p className="mt-1 text-sm text-ink-500">Código: <span className="font-semibold tabular-nums text-ink-900">{ficha.code}</span>{inativa && <StatusBadge tone="neutral" className="ml-2">Inativa</StatusBadge>}</p>
          </div>
          {isAdmin && (
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="secondary" onClick={() => { setAviso(null); setEditando(true); }}><Pencil className="h-4 w-4" /> Editar ficha</Button>
              <Button type="button" size="sm" variant="secondary" onClick={() => { setAviso(null); setFoto(true); }}><Camera className="h-4 w-4" /> Alterar foto</Button>
              <Button type="button" size="sm" variant={inativa ? 'secondary' : 'danger'} onClick={alternarStatus} loading={mudandoStatus}><Power className="h-4 w-4" /> {inativa ? 'Reativar' : 'Desativar'}</Button>
            </div>
          )}
        </div>
      </header>

      {aviso && <Banner tone={aviso.tone} title={aviso.title} onDismiss={() => setAviso(null)} />}

      <SegmentedControl<Aba>
        aria-label="Seção da ficha"
        value={aba}
        onValueChange={setAba}
        options={[
          { value: 'ingredientes', label: 'Ingredientes', badge: ficha.items.length || undefined },
          { value: 'preparo', label: 'Modo de Preparo' },
          { value: 'observacoes', label: 'Observações' },
        ]}
      />

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(280px,40%)] md:items-start">
        <section className="order-last min-w-0 md:order-first">
          {aba === 'ingredientes' && (
            <Table<ItemDaFicha>
              columns={colunas}
              rows={ficha.items}
              getRowKey={(_, i) => String(i)}
              caption={`Ingredientes de ${ficha.name}`}
              empty={<p className="p-4 text-sm text-ink-500">Esta ficha não lista ingredientes.</p>}
            />
          )}
          {aba === 'preparo' && (
            <Texto titulo="Modo de preparo" texto={ficha.preparationMethod} vazio="A ficha não traz modo de preparo." />
          )}
          {aba === 'observacoes' && (
            <Texto titulo="Observações" texto={ficha.generalNotes} vazio="Sem observações adicionais." />
          )}
        </section>

        <figure className="order-first md:order-last">
          {ficha.imagePath ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/${ficha.imagePath}`} alt={`Foto de referência: ${ficha.name}`} className="w-full rounded-card border border-line object-cover" />
          ) : (
            <div className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 rounded-card border border-dashed border-line-strong bg-sunken text-ink-400">
              <ImageOff className="h-6 w-6" aria-hidden />
              <span className="text-xs">Sem foto de referência</span>
            </div>
          )}
          <figcaption className="mt-1 text-right text-xs text-ink-500">Imagem de referência — como o produto deve ficar</figcaption>
        </figure>
      </div>

      {isAdmin && (
        <details className="rounded-card border border-line bg-surface">
          <summary className="flex cursor-pointer items-center gap-2 p-3 text-sm font-semibold text-ink-900">
            <History className="h-4 w-4 text-ink-500" aria-hidden /> Histórico de alterações <span className="text-xs font-normal text-ink-500">({historico.length})</span>
          </summary>
          <ul className="divide-y divide-line border-t border-line text-xs">
            {historico.length === 0 && <li className="p-3 text-ink-500">Nenhuma alteração registrada.</li>}
            {historico.map((h) => (
              <li key={h.id} className="grid gap-1 p-3 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)]">
                <span className="text-ink-500">{new Date(h.createdAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })} · {h.userName}</span>
                <span className="text-ink-900">{descricaoDaMudanca(h)}</span>
              </li>
            ))}
          </ul>
          <p className="border-t border-line p-3 text-xs text-ink-500">Criada por {ficha.createdByName} em {new Date(ficha.createdAt).toLocaleDateString('pt-BR')}{ficha.updatedByName ? ` · última alteração por ${ficha.updatedByName}` : ''}.</p>
        </details>
      )}

      {isAdmin && (
        <>
          <FormularioFicha
            open={editando}
            modo="editar"
            fichaId={ficha.id}
            inicial={inicial}
            categorias={categorias}
            onClose={() => setEditando(false)}
            onSalvou={() => { setEditando(false); setAviso({ tone: 'success', title: 'Ficha atualizada.' }); }}
          />
          <AlterarFoto open={foto} onClose={() => setFoto(false)} fichaId={ficha.id} imagePath={ficha.imagePath} nome={ficha.name}
            onFeito={(msg) => { setFoto(false); setAviso({ tone: 'success', title: msg }); router.refresh(); }} />
        </>
      )}
    </div>
  );
}

function NavLink({ id, rotulo, icone, depois }: { id: string | null; rotulo: string; icone: React.ReactNode; depois?: boolean }) {
  const classes = cn('inline-flex h-8 items-center gap-1 rounded-control border border-line-strong bg-surface px-2 text-xs font-semibold text-ink-900 hover:bg-sunken', !id && 'pointer-events-none opacity-40');
  const conteudo = depois ? <>{rotulo}{icone}</> : <>{icone}{rotulo}</>;
  if (!id) return <span className={classes} aria-disabled>{conteudo}</span>;
  return <Link href={`/modulos/padronizacao/${id}`} className={classes}>{conteudo}</Link>;
}

function Texto({ titulo, texto, vazio }: { titulo: string; texto: string | null; vazio: string }) {
  return (
    <div className="rounded-card border border-line bg-surface p-4">
      <h3 className="sgo-type-11 font-semibold text-ink-500">{titulo}</h3>
      {texto ? <p className="mt-2 whitespace-pre-line text-sm leading-6 text-ink-900">{texto}</p> : <p className="mt-2 text-sm text-ink-500">{vazio}</p>}
    </div>
  );
}

function descricaoDaMudanca(h: LinhaDoHistorico): string {
  if (h.field === CAMPO_FOTO) return h.newValue ? (h.oldValue ? 'Imagem atualizada' : 'Imagem adicionada') : 'Imagem removida';
  if (h.oldValue === null && h.newValue === null) return h.field;
  if (h.oldValue === null) return `${h.field}: ${h.newValue}`;
  if (h.newValue === null) return `${h.field}: ${h.oldValue} → (removido)`;
  return `${h.field}: ${h.oldValue} → ${h.newValue}`;
}

/** ALTERAR FOTO — substitui, remove ou cancela. Só a foto; o resto da ficha não é tocado. */
function AlterarFoto({ open, onClose, fichaId, imagePath, nome, onFeito }: {
  open: boolean; onClose: () => void; fichaId: string; imagePath: string | null; nome: string; onFeito: (msg: string) => void;
}) {
  const [nova, setNova] = React.useState<File | null>(null);
  const [url, setUrl] = React.useState<string | null>(null);
  const [ocupado, setOcupado] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => { if (open) { setNova(null); setErro(null); } }, [open]);
  React.useEffect(() => {
    if (!nova) { setUrl(null); return; }
    const u = URL.createObjectURL(nova);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [nova]);

  async function substituir() {
    if (!nova) return;
    setOcupado(true); setErro(null);
    try {
      const fd = new FormData();
      fd.set('photo', nova);
      const res = await fetch(`/api/padronizacao/${fichaId}/foto`, { method: 'POST', body: fd });
      const body = await res.json().catch(() => ({})) as { error?: string };
      if (!res.ok) { setErro(body.error ?? 'Não foi possível gravar a foto.'); return; }
      onFeito('Foto atualizada. Nenhum outro dado da ficha mudou.');
    } finally { setOcupado(false); }
  }

  async function remover() {
    if (!window.confirm('Remover a foto desta ficha? Os demais dados não mudam.')) return;
    setOcupado(true); setErro(null);
    try {
      const res = await fetch(`/api/padronizacao/${fichaId}/foto`, { method: 'DELETE' });
      const body = await res.json().catch(() => ({})) as { error?: string };
      if (!res.ok) { setErro(body.error ?? 'Não foi possível remover a foto.'); return; }
      onFeito('Foto removida.');
    } finally { setOcupado(false); }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Alterar foto"
      description={`Só a foto de "${nome}" muda. Ingredientes, pesos, código e demais informações ficam como estão.`}
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={ocupado}>Cancelar</Button>
          {imagePath && <Button type="button" variant="danger" onClick={remover} disabled={ocupado}><Trash2 className="h-4 w-4" /> Remover foto</Button>}
          <Button type="button" onClick={substituir} disabled={!nova} loading={ocupado}>{imagePath ? 'Substituir foto' : 'Salvar foto'}</Button>
        </div>
      }
    >
      <div className="space-y-3">
        {erro && <Banner tone="danger" title={erro} onDismiss={() => setErro(null)} />}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="mb-1 text-xs font-medium text-ink-700">Atual</p>
            {imagePath ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/${imagePath}`} alt="Foto atual" className="aspect-[4/3] w-full rounded-card border border-line object-cover" />
            ) : (
              <div className="flex aspect-[4/3] w-full items-center justify-center rounded-card border border-dashed border-line-strong bg-sunken text-ink-400"><ImageOff className="h-5 w-5" aria-hidden /></div>
            )}
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-ink-700">Nova</p>
            {url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={url} alt="Nova foto (prévia)" className="aspect-[4/3] w-full rounded-card border border-line object-cover" />
            ) : (
              <button type="button" onClick={() => fileRef.current?.click()} className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-1 rounded-card border border-dashed border-line-strong bg-sunken text-ink-500 hover:border-brand">
                <Camera className="h-5 w-5" aria-hidden /><span className="text-xs">Escolher foto</span>
              </button>
            )}
          </div>
        </div>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) setNova(await compressImage(f)); }} />
        {url && <Button type="button" size="sm" variant="ghost" onClick={() => fileRef.current?.click()}>Escolher outra</Button>}
      </div>
    </Modal>
  );
}
