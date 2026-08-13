'use client';

import { Plus, Trash2, Check } from 'lucide-react';
import { Button, IconButton } from '@/components/ui/ds/button';

/* Helpers da galeria (compartilhados pelas seções que entram a cada commit). */

export function GallerySection({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="mb-16">
      <h2 className="sgo-type-22 font-semibold text-ink-900">{title}</h2>
      {hint && <p className="sgo-type-13 mb-4 mt-1 text-ink-500">{hint}</p>}
      <div className={hint ? '' : 'mt-4'}>{children}</div>
    </section>
  );
}

export function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3 last:border-b-0">
      <span className="sgo-type-12 w-28 shrink-0 text-ink-400">{label}</span>
      {children}
    </div>
  );
}

export function Panel({ children }: { children: React.ReactNode }) {
  return <div className="overflow-hidden rounded-card border border-line bg-sgo-surface">{children}</div>;
}

/* ------------------------------------------------------------------ Button */

const VARIANTS = ['primary', 'secondary', 'ghost', 'danger', 'link'] as const;
const SIZES = ['sm', 'md', 'lg'] as const;

export function ButtonSection() {
  return (
    <GallerySection
      title="Button"
      hint="5 variantes × 3 tamanhos. Um primário por tela; destrutivo é ghost com texto danger, nunca bloco vermelho. O sm (32px) mantém alvo tocável de 44px."
    >
      <Panel>
        {VARIANTS.map((v) => (
          <Row key={v} label={v}>
            {SIZES.map((s) => (
              <Button key={s} variant={v} size={s}>
                {v === 'danger' ? 'Excluir' : 'Salvar'}
              </Button>
            ))}
          </Row>
        ))}
        <Row label="com ícone">
          <Button variant="primary"><Plus className="h-4 w-4" /> Novo lançamento</Button>
          <Button variant="secondary"><Check className="h-4 w-4" /> Confirmar</Button>
          <Button variant="danger"><Trash2 className="h-4 w-4" /> Excluir</Button>
        </Row>
        <Row label="carregando">
          <Button loading>Salvando…</Button>
          <Button variant="secondary" loading>Enviando…</Button>
        </Row>
        <Row label="desabilitado">
          <Button disabled>Salvar</Button>
          <Button variant="secondary" disabled>Cancelar</Button>
          <Button variant="danger" disabled>Excluir</Button>
        </Row>
        <Row label="só ícone">
          <IconButton aria-label="Adicionar" size="sm"><Plus className="h-4 w-4" /></IconButton>
          <IconButton aria-label="Adicionar"><Plus className="h-4 w-4" /></IconButton>
          <IconButton aria-label="Adicionar" size="lg"><Plus className="h-5 w-5" /></IconButton>
          <IconButton aria-label="Excluir" variant="danger"><Trash2 className="h-4 w-4" /></IconButton>
        </Row>
        <Row label="foco (Tab)">
          <Button variant="primary">Anel duplo</Button>
          <Button variant="secondary">Anel duplo</Button>
          <Button variant="ghost">Anel duplo</Button>
        </Row>
      </Panel>
    </GallerySection>
  );
}

/* --------------------------------------------------------------- Galeria */

export function ComponentsGallery() {
  return (
    <div>
      <h2 className="sgo-type-28 mb-2 font-bold text-ink-900">Componentes</h2>
      <p className="sgo-body mb-8 text-ink-500">
        Biblioteca do design system (Onda 2). Todos os estados: padrão, foco, desabilitado, carregando.
      </p>
      <ButtonSection />
    </div>
  );
}
