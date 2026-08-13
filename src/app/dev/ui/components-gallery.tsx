'use client';

import { useState } from 'react';
import { Plus, Trash2, Check } from 'lucide-react';
import { Button, IconButton } from '@/components/ui/ds/button';
import { Input, Textarea, SearchField, CurrencyField } from '@/components/ui/ds/field';
import { Select } from '@/components/ui/ds/select';
import { DatePicker } from '@/components/ui/ds/date-picker';
import { SegmentedControl } from '@/components/ui/ds/segmented-control';

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

/* ------------------------------------------------------------- Campos */

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-4 p-4 sm:grid-cols-2">{children}</div>;
}

export function FieldsSection() {
  const [busca, setBusca] = useState('');
  const [valor, setValor] = useState<number | null>(1234.5);

  return (
    <GallerySection
      title="Campos de texto"
      hint="Rótulo, dica e erro no invólucro Field. O erro nunca é só cor — vem com ícone e texto. Valores monetários são tabulares e alinhados à direita."
    >
      <Panel>
        <Grid>
          <Input label="Nome do fornecedor" placeholder="ex.: Ultragaz" />
          <Input label="Nº da nota" placeholder="6766" hint="Como aparece na DANFE." />
          <Input label="CNPJ" defaultValue="05.336.082/0001-6" error="CNPJ precisa ter 14 dígitos." required />
          <Input label="Unidade" defaultValue="Moreira" disabled hint="Definida pelo seletor no topo." />
          <Input label="Tamanho sm" inputSize="sm" placeholder="32px" />
          <Input label="Tamanho lg" inputSize="lg" placeholder="48px" />
        </Grid>
        <div className="border-t border-line">
          <Grid>
            <SearchField label="Busca" value={busca} onValueChange={setBusca} placeholder="Buscar fornecedor…" hint="Digite para ver o botão de limpar." />
            <CurrencyField label="Valor total" value={valor} onValueChange={setValor} hint="Formata ao sair do campo." />
          </Grid>
        </div>
        <div className="border-t border-line p-4">
          <Textarea label="Observação" placeholder="Descreva o que aconteceu…" hint="Opcional." />
        </div>
      </Panel>
    </GallerySection>
  );
}

/* ------------------------------------------------- Select e DatePicker */

const UNIDADES = [
  { value: 'u1', label: 'Moreira', hint: 'COMERCIAL LINS & GUEDES LTDA ( MOREIRA)' },
  { value: 'u2', label: 'KM13', hint: 'COMERCIAL LINS & GUEDES LTDA (KM13)' },
  { value: 'u3', label: 'Vivendas' },
  { value: 'u4', label: 'Nova União (inativa)', disabled: true },
];
const CATEGORIAS = [
  { value: 'self', label: 'Self-Service' },
  { value: 'cozinha', label: 'Cozinha' },
  { value: 'lanchonete', label: 'Lanchonete' },
];

export function ChoiceSection() {
  const [unidade, setUnidade] = useState<string | null>('u1');
  const [categoria, setCategoria] = useState<string | null>(null);
  const [data, setData] = useState<string | null>('2026-08-11');
  const [vazia, setVazia] = useState<string | null>(null);

  return (
    <GallerySection
      title="Select e DatePicker"
      hint="Ambos custom — nenhum <select> ou <input type=date> nativo chega em produção (regra 6). Teclado completo: setas, Enter, Esc; no calendário, PageUp/PageDown troca o mês."
    >
      <Panel>
        <Grid>
          <Select label="Unidade" options={UNIDADES} value={unidade} onValueChange={setUnidade} hint="Opção desabilitada é pulada pelo teclado." />
          <Select label="Categoria" options={CATEGORIAS} value={categoria} onValueChange={setCategoria} placeholder="Selecione a categoria…" required error={categoria ? undefined : 'Escolha uma categoria.'} />
          <Select label="Desabilitado" options={CATEGORIAS} value="self" onValueChange={() => {}} disabled />
          <Select label="Tamanho sm" options={CATEGORIAS} value={categoria} onValueChange={setCategoria} size="sm" />
        </Grid>
        <div className="border-t border-line">
          <Grid>
            <DatePicker label="Data do lançamento" value={data} onValueChange={setData} hint="Hoje fica marcado com anel; dias fora do limite são bloqueados." />
            <DatePicker label="Vencimento" value={vazia} onValueChange={setVazia} min="2026-08-01" max="2026-08-31" placeholder="dd/mm/aaaa" />
          </Grid>
        </div>
      </Panel>
    </GallerySection>
  );
}

/* ------------------------------------------------- SegmentedControl */

export function SegmentedSection() {
  const [aba, setAba] = useState<'notas' | 'venc' | 'analise'>('notas');
  const [periodo, setPeriodo] = useState<'7' | '30' | '90'>('30');

  return (
    <GallerySection
      title="SegmentedControl"
      hint="A pílula desliza entre os segmentos com --ease-spring — nunca fade. Setas ←/→ movem e já selecionam."
    >
      <Panel>
        <Row label="com badge">
          <SegmentedControl
            aria-label="Abas de notas"
            value={aba}
            onValueChange={setAba}
            options={[
              { value: 'notas', label: 'Notas' },
              { value: 'venc', label: 'Vencimentos', badge: 12 },
              { value: 'analise', label: 'Análise' },
            ]}
          />
        </Row>
        <Row label="sm">
          <SegmentedControl
            size="sm"
            aria-label="Período"
            value={periodo}
            onValueChange={setPeriodo}
            options={[
              { value: '7', label: '7 dias' },
              { value: '30', label: '30 dias' },
              { value: '90', label: '90 dias' },
            ]}
          />
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
      <FieldsSection />
      <ChoiceSection />
      <SegmentedSection />
    </div>
  );
}
