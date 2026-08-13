'use client';

import { useState } from 'react';
import { Plus, Trash2, Check, Inbox, Receipt } from 'lucide-react';
import { Button, IconButton } from '@/components/ui/ds/button';
import { Input, Textarea, SearchField, CurrencyField } from '@/components/ui/ds/field';
import { Select } from '@/components/ui/ds/select';
import { DatePicker } from '@/components/ui/ds/date-picker';
import { SegmentedControl } from '@/components/ui/ds/segmented-control';
import { List, ListRow, Avatar } from '@/components/ui/ds/list-row';
import { EmptyState } from '@/components/ui/ds/empty-state';
import { StatCard } from '@/components/ui/ds/stat-card';
import { StatusBadge } from '@/components/ui/ds/status-badge';
import { ProgressBar } from '@/components/ui/ds/progress-bar';
import { Banner } from '@/components/ui/ds/banner';
import { ToastProvider, useToast } from '@/components/ui/ds/toast';
import { Modal } from '@/components/ui/ds/modal';
import { Sheet } from '@/components/ui/ds/sheet';

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

/* --------------------------------------------- ListRow e EmptyState */

export function ListSection() {
  return (
    <GallerySection
      title="ListRow e EmptyState"
      hint="Linha de 64px, avatar de 32 e divisor recuado 16px (alinha com o texto). Substitui os cartões-por-registro das telas atuais. O vazio sempre diz o próximo passo."
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <List>
          <ListRow
            leading={<Avatar name="César Alcides" />}
            title="César Alcides Vilaça Coelho"
            subtitle="Freelancer · solicitado 01/08"
            trailing={<span className="text-[14px] font-semibold tabular-nums text-ink-900">R$ 120,00</span>}
            href="#"
          />
          <ListRow
            leading={<Avatar name="Diogo Vinicius" />}
            title="Diogo Vinicius Vieira"
            subtitle="Divergência: padrão R$ 100,00"
            trailing={<span className="text-[14px] font-semibold tabular-nums text-ink-900">R$ 85,00</span>}
            href="#"
          />
          <ListRow
            leading={<Receipt className="h-8 w-8 rounded-control bg-sunken p-2 text-ink-500" />}
            title="Froneri Brasil"
            subtitle="Nova União · nº 611293"
            trailing={<span className="text-[14px] font-semibold tabular-nums text-ink-900">R$ 2.841,61</span>}
          />
          <ListRow title="Linha desabilitada" subtitle="Sem interação" disabled />
        </List>

        <div className="rounded-card border border-line bg-sgo-surface">
          <EmptyState
            icon={Inbox}
            title="Nenhuma nota neste período"
            description="Ajuste os filtros ou registre a primeira nota do mês."
            action={<Button size="sm"><Plus className="h-4 w-4" /> Registrar nota</Button>}
          />
        </div>
      </div>
    </GallerySection>
  );
}

/* ------------------------------------ StatCard, StatusBadge, ProgressBar */

export function DataSection() {
  return (
    <GallerySection
      title="StatCard, StatusBadge e ProgressBar"
      hint="Números na escala 11 / 34 / 13, sempre tabulares. Sem dado é “–” em ink-400 — nunca zero, que mentiria. O texto do badge carrega o significado; a cor só reforça."
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Meta média" value="82%" delta={4.2} hint="vs. julho" />
        <StatCard label="Desperdício" value="128,4 kg" delta={-11.5} invertDelta hint="queda é bom" />
        <StatCard label="Ocorrências graves" value={3} delta={12} invertDelta hint="vs. julho" />
        <StatCard label="Divergências de troco" value={null} hint="sem lançamento no mês" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel>
          <Row label="tons">
            <StatusBadge tone="success" dot>Concluída</StatusBadge>
            <StatusBadge tone="warning" dot>Fora do prazo</StatusBadge>
            <StatusBadge tone="danger" dot>Não realizada</StatusBadge>
            <StatusBadge tone="info" dot>Em análise</StatusBadge>
          </Row>
          <Row label="sem ponto">
            <StatusBadge tone="brand">Recebida</StatusBadge>
            <StatusBadge tone="neutral">Rascunho</StatusBadge>
            <StatusBadge tone="danger">Devolvida</StatusBadge>
          </Row>
        </Panel>

        <div className="space-y-4 rounded-card border border-line bg-sgo-surface p-4">
          <ProgressBar label="Checklists de hoje" value={15} max={29} valueLabel="15/29" />
          <ProgressBar label="Meta do mês" value={82} tone="success" />
          <ProgressBar label="Cobertura de desperdício" value={41} tone="warning" />
          <ProgressBar label="Comandas conferidas" value={8} tone="danger" />
        </div>
      </div>
    </GallerySection>
  );
}

/* ------------------------------------------------------ Banner e Toast */

function ToastDemo() {
  const { toast } = useToast();
  return (
    <Row label="disparar">
      <Button size="sm" variant="secondary" onClick={() => toast({ tone: 'success', title: 'Nota registrada', description: '49 notas importadas.' })}>Sucesso</Button>
      <Button size="sm" variant="secondary" onClick={() => toast({ tone: 'info', title: 'Sincronizando com o RH…' })}>Info</Button>
      <Button size="sm" variant="secondary" onClick={() => toast({ tone: 'warning', title: 'Comanda em divergência', description: 'Confira a faixa 100–160.' })}>Aviso</Button>
      <Button size="sm" variant="secondary" onClick={() => toast({ tone: 'danger', title: 'Falha ao gravar', description: 'Tente novamente.' })}>Erro</Button>
    </Row>
  );
}

export function FeedbackSection() {
  const [visivel, setVisivel] = useState(true);
  return (
    <GallerySection
      title="Banner e Toast"
      hint="Banner é aviso persistente no fluxo da página; Toast é confirmação passageira no canto. Ícone + texto carregam o significado; erros usam role=alert."
    >
      <div className="space-y-3">
        <Banner tone="info" title="Sincronização automática às 03:00" description="Os dados do RH são atualizados uma vez por dia." />
        <Banner tone="success" title="Importação concluída" description="49 notas gravadas, 0 duplicadas." />
        <Banner
          tone="warning"
          title="9 comunicados pendentes de leitura"
          description="A confirmação conta na meta do mês."
          action={<Button size="sm" variant="secondary">Ver comunicados</Button>}
        />
        <Banner tone="danger" title="111 ocorrências abertas há mais de 48h" description="Priorize as de gravidade alta." />
        {visivel && (
          <Banner tone="info" title="Aviso dispensável" description="Tem botão de fechar." onDismiss={() => setVisivel(false)} />
        )}
      </div>

      <div className="mt-4">
        <ToastProvider>
          <Panel><ToastDemo /></Panel>
        </ToastProvider>
      </div>
    </GallerySection>
  );
}

/* ------------------------------------------------------- Modal e Sheet */

export function OverlaySection() {
  const [modal, setModal] = useState(false);
  const [sheet, setSheet] = useState(false);

  return (
    <GallerySection
      title="Modal e Sheet"
      hint="Esc fecha, o foco entra e circula (Tab não escapa), a rolagem do fundo trava e o foco volta para quem abriu. O Sheet sobe de baixo e o conteúdo atrás recua para scale(.94)."
    >
      <Panel>
        <Row label="abrir">
          <Button variant="secondary" onClick={() => setModal(true)}>Abrir Modal</Button>
          <Button variant="secondary" onClick={() => setSheet(true)}>Abrir Sheet</Button>
        </Row>
      </Panel>

      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title="Excluir lançamento?"
        description="Esta ação não pode ser desfeita."
        footer={
          <>
            <Button variant="ghost" onClick={() => setModal(false)}>Cancelar</Button>
            <Button variant="danger" onClick={() => setModal(false)}>Excluir</Button>
          </>
        }
      >
        <p className="text-[14px] text-ink-700">
          O lançamento de <strong>R$ 2.841,61</strong> (Froneri Brasil, nº 611293) sairá do
          histórico e da meta do mês. Fica registrado no Log de Auditoria.
        </p>
      </Modal>

      <Sheet
        open={sheet}
        onClose={() => setSheet(false)}
        title="Detalhe do pagamento"
        description="César Alcides Vilaça Coelho · Freelancer"
        footer={
          <>
            <Button variant="ghost" onClick={() => setSheet(false)}>Fechar</Button>
            <Button onClick={() => setSheet(false)}>Aprovar</Button>
          </>
        }
      >
        <div className="space-y-3">
          <ProgressBar label="Aprovações do dia" value={3} max={4} valueLabel="3/4" />
          <p className="text-[14px] text-ink-700">
            Valor de <strong className="tabular-nums">R$ 120,00</strong>, solicitado em 01/08 por Krislley.
            PIX cadastrado, sem divergência com o valor padrão.
          </p>
        </div>
      </Sheet>
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
      <ListSection />
      <DataSection />
      <FeedbackSection />
      <OverlaySection />
    </div>
  );
}
