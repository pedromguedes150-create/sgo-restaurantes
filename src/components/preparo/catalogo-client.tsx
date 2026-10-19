'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChefHat, FileText, FileUp, ImageOff, Plus } from 'lucide-react';
import { Button } from '@/components/ui/ds/button';
import { SearchField } from '@/components/ui/ds/field';
import { Select } from '@/components/ui/ds/select';
import { EmptyState } from '@/components/ui/ds/empty-state';
import { StatusBadge } from '@/components/ui/ds/status-badge';
import { Banner } from '@/components/ui/ds/banner';
import { buscarFichas, capaDaFicha, ehPdf, textoRapido, abaDoSegmento, type Segmento } from '@/lib/preparo/tipos';
import type { FichaResumo } from '@/lib/preparo/query';
import { paraEditavel, type FichaEditavel } from './editor-ficha';
import { FormularioFicha, type ModoDoFormulario } from './formulario-ficha';
import { ImportarFicha, type ResultadoDaImportacao } from './importar-ficha';

/**
 * CATÁLOGO — a tela que o funcionário abre com pressa. Busca por nome, código
 * ou INGREDIENTE/PREPARAÇÃO (no cliente: a lista é pequena e já vem com os
 * nomes), filtro de categoria e cartões COMPACTOS (v1.172.0: miniatura leve
 * `?w=320`, mais colunas, leitura rápida do guia no próprio cartão). A ficha
 * completa é da tela seguinte.
 */
type Formulario = { modo: ModoDoFormulario; inicial: FichaEditavel; revisar: string[]; sourceFilePath: string | null; foto: File | null; aviso: ResultadoDaImportacao['aviso'] } | null;

const TEXTOS = {
  LANCHONETE: {
    buscar: 'Buscar produto, código ou ingrediente…', importar: 'Importar ficha', nova: 'Nova ficha', unidade: 'produto(s)',
    vazioTitulo: 'Nenhuma ficha publicada ainda', vazioAdmin: 'Importe a primeira ficha de padronização ou cadastre uma manualmente.',
    vazioFunc: 'As fichas aparecem aqui quando o Administrador publicar.', semTermo: 'Tente outro nome, o código do produto ou um ingrediente.', salvou: 'Ficha publicada.',
  },
  RESTAURANTE: {
    buscar: 'Buscar guia ou preparação…', importar: 'Importar guia', nova: 'Novo guia', unidade: 'guia(s)',
    vazioTitulo: 'Nenhum guia publicado ainda', vazioAdmin: 'Envie o primeiro guia de preparações (PDF ou foto) — a leitura preenche função, temperatura, tempo e as preparações.',
    vazioFunc: 'Os guias aparecem aqui quando o Administrador publicar.', semTermo: 'Tente o nome do guia ou de uma preparação (ex.: lasanha).', salvou: 'Guia publicado.',
  },
} as const;

export function CatalogoClient({ fichas, categorias, isAdmin, status, segment = 'LANCHONETE' }: {
  fichas: FichaResumo[];
  categorias: string[];
  isAdmin: boolean;
  /** Filtro de situação (só o Admin escolhe; os demais só veem ativas). */
  status: 'ACTIVE' | 'INACTIVE' | 'ALL';
  /** A aba: decide os textos, o que o cartão mostra e com que segmento a ficha nasce. */
  segment?: Segmento;
}) {
  const router = useRouter();
  const t = TEXTOS[segment];
  const guia = segment === 'RESTAURANTE';
  const [busca, setBusca] = React.useState('');
  const [categoria, setCategoria] = React.useState('');
  const [importando, setImportando] = React.useState(false);
  const [form, setForm] = React.useState<Formulario>(null);
  const [aviso, setAviso] = React.useState<{ tone: 'success' | 'danger'; title: string } | null>(null);

  const visiveis = React.useMemo(() => {
    const porCategoria = categoria ? fichas.filter((f) => f.category === categoria) : fichas;
    return buscarFichas(porCategoria, busca);
  }, [fichas, categoria, busca]);

  const linkLista = (st: string) => `/modulos/padronizacao?aba=${abaDoSegmento(segment)}${st === 'ACTIVE' ? '' : `&status=${st}`}`;

  function abrirImportada(r: ResultadoDaImportacao) {
    setImportando(false);
    setForm({ modo: 'importar', inicial: paraEditavel(r.rascunho?.dados ?? null, segment), revisar: r.rascunho?.lowConfidence ?? [], sourceFilePath: r.sourceFilePath, foto: r.foto, aviso: r.aviso });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1">
          <SearchField value={busca} onValueChange={setBusca} placeholder={t.buscar} aria-label={t.buscar.replace('…', '')} />
        </div>
        <div className="w-full sm:w-56">
          <Select aria-label="Categoria" value={categoria} onValueChange={setCategoria} searchable
            options={[{ value: '', label: 'Todas as categorias' }, ...categorias.map((c) => ({ value: c, label: c }))]} />
        </div>
        {isAdmin && (
          <div className="w-full sm:w-44">
            <Select aria-label="Situação" value={status} onValueChange={(v) => router.push(linkLista(v))}
              options={[{ value: 'ACTIVE', label: 'Ativas' }, { value: 'INACTIVE', label: 'Inativas' }, { value: 'ALL', label: 'Todas' }]} />
          </div>
        )}
        {isAdmin && (
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={() => { setAviso(null); setImportando(true); }}>
              <FileUp className="h-4 w-4" /> {t.importar}
            </Button>
            <Button type="button" onClick={() => { setAviso(null); setForm({ modo: 'nova', inicial: paraEditavel(null, segment), revisar: [], sourceFilePath: null, foto: null, aviso: null }); }}>
              <Plus className="h-4 w-4" /> {t.nova}
            </Button>
          </div>
        )}
      </div>

      {aviso && <Banner tone={aviso.tone} title={aviso.title} onDismiss={() => setAviso(null)} />}

      <p className="text-xs text-ink-500" aria-live="polite">{visiveis.length} {t.unidade}{busca || categoria ? ' encontrado(s)' : ''}</p>

      {visiveis.length === 0 ? (
        <EmptyState
          icon={ChefHat}
          title={fichas.length === 0 ? t.vazioTitulo : 'Nenhum resultado com esse termo'}
          description={fichas.length === 0 ? (isAdmin ? t.vazioAdmin : t.vazioFunc) : t.semTermo}
          size="sm"
        />
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5" data-testid="catalogo-cartoes">
          {visiveis.map((f) => <Cartao key={f.id} f={f} guia={guia} />)}
        </ul>
      )}

      {isAdmin && (
        <>
          <ImportarFicha open={importando} onClose={() => setImportando(false)} onPronto={abrirImportada} segment={segment} />
          {form && (
            <FormularioFicha
              open
              modo={form.modo}
              inicial={form.inicial}
              revisar={form.revisar}
              sourceFilePath={form.sourceFilePath}
              fotoInicial={form.foto}
              aviso={form.aviso}
              categorias={categorias}
              onClose={() => setForm(null)}
              onSalvou={(id) => { setForm(null); setAviso({ tone: 'success', title: t.salvou }); if (id) router.push(`/modulos/padronizacao/${id}`); }}
            />
          )}
        </>
      )}
    </div>
  );
}

/**
 * O CARTÃO: miniatura leve em quadro 4:3 (`?w=320` — a derivada webp da
 * v1.171.1, não o original de MB), nome, categoria e UMA linha de leitura
 * rápida: código (lanchonete) ou "Ar Seco · 200°C · 15 min" + nº de
 * preparações (restaurante). Guia em PDF sem capa mostra o ícone de
 * documento — o arquivo é o conteúdo, e esconder isso faria o cartão parecer
 * "sem foto" por defeito.
 */
function Cartao({ f, guia }: { f: FichaResumo; guia: boolean }) {
  const capa = capaDaFicha(f);
  const rapido = guia ? textoRapido(f) : '';
  const pdf = guia && !capa && ehPdf(f.sourceFilePath);
  return (
    <li>
      <Link href={`/modulos/padronizacao/${f.id}`} className="group flex h-full flex-col overflow-hidden rounded-card border border-line bg-surface shadow-sgo-card transition-shadow duration-sgo-1 ease-sgo-std hover:shadow-sgo-card-hover focus-visible:shadow-sgo-focus">
        <div className="relative aspect-[4/3] w-full overflow-hidden bg-sunken">
          {capa ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/${capa}?w=320`} alt="" className="h-full w-full object-cover transition-transform duration-sgo-2 ease-sgo-std group-hover:scale-105 motion-reduce:transform-none" loading="lazy" />
          ) : pdf ? (
            <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-brand-tint text-brand">
              <FileText className="h-7 w-7" aria-hidden />
              <span className="text-xs font-semibold">Guia em PDF</span>
            </div>
          ) : (
            <div className="flex h-full w-full items-center justify-center text-ink-400"><ImageOff className="h-6 w-6" aria-hidden /></div>
          )}
          {f.status === 'INACTIVE' && <StatusBadge tone="neutral" className="absolute left-2 top-2">Inativa</StatusBadge>}
        </div>
        <div className="flex flex-1 flex-col gap-1 p-3">
          <p className="sgo-type-13 line-clamp-2 font-semibold leading-5 text-ink-900">{f.name}</p>
          <p className="truncate text-xs text-ink-500">{f.category}</p>
          {guia ? (
            <>
              {rapido && <p className="truncate text-xs font-medium text-brand" title={rapido}>{rapido}</p>}
              <p className="text-xs text-ink-500">{f.ingredientes.length} preparação(ões)</p>
            </>
          ) : (
            <p className="text-xs tabular-nums text-ink-500">Código {f.code}</p>
          )}
          <span className="mt-auto pt-1 text-xs font-semibold text-brand group-hover:underline">{guia ? 'Abrir guia' : 'Ver padrão'}</span>
        </div>
      </Link>
    </li>
  );
}
