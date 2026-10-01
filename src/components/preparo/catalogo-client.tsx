'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChefHat, FileUp, ImageOff, Plus } from 'lucide-react';
import { Button } from '@/components/ui/ds/button';
import { SearchField } from '@/components/ui/ds/field';
import { Select } from '@/components/ui/ds/select';
import { EmptyState } from '@/components/ui/ds/empty-state';
import { StatusBadge } from '@/components/ui/ds/status-badge';
import { Banner } from '@/components/ui/ds/banner';
import { buscarFichas } from '@/lib/preparo/tipos';
import type { FichaResumo } from '@/lib/preparo/query';
import { paraEditavel, type FichaEditavel } from './editor-ficha';
import { FormularioFicha, type ModoDoFormulario } from './formulario-ficha';
import { ImportarFicha, type ResultadoDaImportacao } from './importar-ficha';

/**
 * CATÁLOGO — a tela que o funcionário abre com pressa. Busca por nome, código
 * ou INGREDIENTE (no cliente: a lista é pequena e já vem com os nomes dos
 * ingredientes), filtro de categoria, cards compactos. Ingredientes
 * completos NÃO aparecem aqui: isso é da ficha.
 */
type Formulario = { modo: ModoDoFormulario; inicial: FichaEditavel; revisar: string[]; sourceFilePath: string | null; foto: File | null; aviso: ResultadoDaImportacao['aviso'] } | null;

export function CatalogoClient({ fichas, categorias, isAdmin, status }: {
  fichas: FichaResumo[];
  categorias: string[];
  isAdmin: boolean;
  /** Filtro de situação (só o Admin escolhe; os demais só veem ativas). */
  status: 'ACTIVE' | 'INACTIVE' | 'ALL';
}) {
  const router = useRouter();
  const [busca, setBusca] = React.useState('');
  const [categoria, setCategoria] = React.useState('');
  const [importando, setImportando] = React.useState(false);
  const [form, setForm] = React.useState<Formulario>(null);
  const [aviso, setAviso] = React.useState<{ tone: 'success' | 'danger'; title: string } | null>(null);

  const visiveis = React.useMemo(() => {
    const porCategoria = categoria ? fichas.filter((f) => f.category === categoria) : fichas;
    return buscarFichas(porCategoria, busca);
  }, [fichas, categoria, busca]);

  function abrirImportada(r: ResultadoDaImportacao) {
    setImportando(false);
    setForm({ modo: 'importar', inicial: paraEditavel(r.rascunho?.dados ?? null), revisar: r.rascunho?.lowConfidence ?? [], sourceFilePath: r.sourceFilePath, foto: r.foto, aviso: r.aviso });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1">
          <SearchField value={busca} onValueChange={setBusca} placeholder="Buscar produto, código ou ingrediente…" aria-label="Buscar produto, código ou ingrediente" />
        </div>
        <div className="w-full sm:w-56">
          <Select aria-label="Categoria" value={categoria} onValueChange={setCategoria} searchable
            options={[{ value: '', label: 'Todas as categorias' }, ...categorias.map((c) => ({ value: c, label: c }))]} />
        </div>
        {isAdmin && (
          <div className="w-full sm:w-44">
            <Select aria-label="Situação" value={status} onValueChange={(v) => router.push(`/modulos/padronizacao${v === 'ACTIVE' ? '' : `?status=${v}`}`)}
              options={[{ value: 'ACTIVE', label: 'Ativas' }, { value: 'INACTIVE', label: 'Inativas' }, { value: 'ALL', label: 'Todas' }]} />
          </div>
        )}
        {isAdmin && (
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={() => { setAviso(null); setImportando(true); }}>
              <FileUp className="h-4 w-4" /> Importar ficha
            </Button>
            <Button type="button" onClick={() => { setAviso(null); setForm({ modo: 'nova', inicial: paraEditavel(null), revisar: [], sourceFilePath: null, foto: null, aviso: null }); }}>
              <Plus className="h-4 w-4" /> Nova ficha
            </Button>
          </div>
        )}
      </div>

      {aviso && <Banner tone={aviso.tone} title={aviso.title} onDismiss={() => setAviso(null)} />}

      <p className="text-xs text-ink-500" aria-live="polite">{visiveis.length} produto(s){busca || categoria ? ' encontrado(s)' : ''}</p>

      {visiveis.length === 0 ? (
        <EmptyState
          icon={ChefHat}
          title={fichas.length === 0 ? 'Nenhuma ficha publicada ainda' : 'Nenhum produto com esse termo'}
          description={fichas.length === 0
            ? (isAdmin ? 'Importe a primeira ficha de padronização ou cadastre uma manualmente.' : 'As fichas aparecem aqui quando o Administrador publicar.')
            : 'Tente outro nome, o código do produto ou um ingrediente.'}
          size="sm"
        />
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {visiveis.map((f) => (
            <li key={f.id}>
              <Link href={`/modulos/padronizacao/${f.id}`} className="group flex h-full flex-col overflow-hidden rounded-card border border-line bg-surface shadow-sgo-card transition-shadow duration-sgo-1 ease-sgo-std hover:shadow-sgo-card-hover focus-visible:shadow-sgo-focus">
                <div className="relative aspect-[4/3] w-full bg-sunken">
                  {f.imagePath ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/${f.imagePath}`} alt="" className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-ink-400"><ImageOff className="h-6 w-6" aria-hidden /></div>
                  )}
                  {f.status === 'INACTIVE' && <StatusBadge tone="neutral" className="absolute left-2 top-2">Inativa</StatusBadge>}
                </div>
                <div className="flex flex-1 flex-col gap-1 p-3">
                  <p className="sgo-type-13 line-clamp-2 font-semibold text-ink-900">{f.name}</p>
                  <p className="text-xs text-ink-500">{f.category}</p>
                  <p className="text-xs tabular-nums text-ink-500">Código {f.code}</p>
                  <span className="mt-auto pt-1 text-xs font-semibold text-brand group-hover:underline">Ver padrão</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {isAdmin && (
        <>
          <ImportarFicha open={importando} onClose={() => setImportando(false)} onPronto={abrirImportada} />
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
              onSalvou={(id) => { setForm(null); setAviso({ tone: 'success', title: 'Ficha publicada.' }); if (id) router.push(`/modulos/padronizacao/${id}`); }}
            />
          )}
        </>
      )}
    </div>
  );
}
