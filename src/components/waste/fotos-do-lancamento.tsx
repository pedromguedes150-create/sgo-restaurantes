'use client';

import { useState } from 'react';
import { Camera, ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react';
import { SgoModal } from '@/components/sgo/sgo-modal';
import { urlDoUpload } from '@/lib/waste/foto-regra';

/**
 * Fotos de um lançamento de desperdício (v1.152.0): miniaturas que abrem a foto
 * grande num modal, com Anterior/Próximo e "abrir em nova aba". É a peça da
 * CONFERÊNCIA: o número lançado e a foto lado a lado, sem caçar link.
 *
 * O endereço sai de `urlDoUpload` — a tela antiga montava `/api/uploads/…`,
 * rota que não existe, e era por isso que "não dava para acessar" a foto.
 */
export function FotosDoLancamento({ fotos, titulo, tamanho = 'md' }: {
  fotos: { rotulo: string; path: string }[];
  titulo: string;
  tamanho?: 'sm' | 'md';
}) {
  const [aberta, setAberta] = useState<number | null>(null);
  if (fotos.length === 0) return null;
  const lado = tamanho === 'sm' ? 'h-12 w-12' : 'h-20 w-20';
  const atual = aberta !== null ? fotos[aberta] : null;

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {fotos.map((f, i) => (
          <button
            key={`${f.path}-${i}`}
            type="button"
            onClick={() => setAberta(i)}
            className="group flex flex-col items-start gap-1 text-left"
            aria-label={`Ver foto: ${f.rotulo}`}
            data-testid="foto-miniatura"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={urlDoUpload(f.path)} alt={f.rotulo} loading="lazy" className={`${lado} rounded-lg border border-line object-cover transition group-hover:border-brand`} />
            {tamanho === 'md' && <span className="max-w-20 truncate sgo-type-11 text-ink-500">{f.rotulo}</span>}
          </button>
        ))}
      </div>

      <SgoModal
        open={atual !== null}
        onClose={() => setAberta(null)}
        title={titulo}
        subtitle={atual ? `${atual.rotulo}${fotos.length > 1 ? ` · ${(aberta ?? 0) + 1} de ${fotos.length}` : ''}` : undefined}
        icon={<Camera className="h-4 w-4" />}
        tone="brand"
        size="lg"
        footerLeft={atual && (
          <a href={urlDoUpload(atual.path)} target="_blank" rel="noreferrer" className="sgo-btn sgo-btn--sm">
            <ExternalLink className="h-3.5 w-3.5" /> Abrir em nova aba
          </a>
        )}
        footer={fotos.length > 1 && aberta !== null ? (
          <div className="flex gap-2">
            <button type="button" className="sgo-btn sgo-btn--sm" onClick={() => setAberta((aberta - 1 + fotos.length) % fotos.length)}><ChevronLeft className="h-3.5 w-3.5" /> Anterior</button>
            <button type="button" className="sgo-btn sgo-btn--sm" onClick={() => setAberta((aberta + 1) % fotos.length)}>Próxima <ChevronRight className="h-3.5 w-3.5" /></button>
          </div>
        ) : undefined}
      >
        {atual && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={urlDoUpload(atual.path)} alt={atual.rotulo} className="mx-auto max-h-[70vh] w-auto rounded-lg object-contain" />
        )}
      </SgoModal>
    </>
  );
}
