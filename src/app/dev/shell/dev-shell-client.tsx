'use client';

import { AppHeader } from '@/components/layout/app-header';
import { CommandPalette } from '@/components/layout/command-palette';
import { TopNav } from '@/components/layout/top-nav';
import { PageChromeProvider, LargeTitle } from '@/components/layout/page-chrome';
import { BottomNav } from '@/components/layout/bottom-nav';
import type { AreaMontada } from '@/lib/nav/areas';

const UNITS = [
  { id: 'u1', name: 'COMERCIAL LINS & GUEDES LTDA ( MOREIRA)' },
  { id: 'u2', name: 'COMERCIAL LINS & GUEDES LTDA (KM13)' },
  { id: 'u3', name: 'COMERCIAL LINS & GUEDES LTDA (SANTO ANTÔNIO DO AMPARO)' },
  { id: 'u4', name: 'COMERCIAL LINS E GUEDES LTDA ME' },
];

/* Amostra do menu — o harness não tem banco, e o menu de verdade é montado no
   servidor a partir da matriz de perfis. Basta para exercitar o mega menu, o
   estado ativo, o foco pelo teclado e a busca. */
const AREAS: AreaMontada[] = [
  {
    id: 'inicio', titulo: 'Início', icone: 'home', href: '/dashboard',
    colunas: [{ titulo: 'Meu painel', itens: [{ key: 'DASHBOARD', label: 'Dashboard', href: '/dashboard' }, { key: 'MANAGER_AREA', label: 'Minha área', href: '/minha-area' }] }],
  },
  {
    id: 'operacao', titulo: 'Operação', icone: 'grid', href: '/modulos/desperdicios',
    colunas: [
      { titulo: 'Rotinas da unidade', itens: [{ key: 'OIL', label: 'Coleta de Óleo', href: '/modulos/oleo' }, { key: 'PIZZAS', label: 'Controle de Pizzas', href: '/modulos/pizzas' }] },
      { titulo: 'Controles', itens: [{ key: 'WASTE', label: 'Desperdícios', href: '/modulos/desperdicios' }, { key: 'OCCURRENCES', label: 'Ocorrências', href: '/modulos/ocorrencias' }, { key: 'COMMANDS', label: 'Comandas', href: '/modulos/comandas' }] },
      { titulo: 'Suprimentos', itens: [{ key: 'NOTES', label: 'Notas Recebidas', href: '/modulos/notas' }, { key: 'PRODUCTS', label: 'Pedidos Internos', href: '/modulos/produtos' }] },
      { titulo: 'Conferências', itens: [{ key: 'COMMANDS_SCAN', label: 'Conferência por leitor', href: '/modulos/comandas/conferencia' }] },
    ],
  },
  {
    id: 'pessoas', titulo: 'Pessoas', icone: 'users', href: '/modulos/pessoas',
    colunas: [
      { titulo: 'Equipe', itens: [{ key: 'PEOPLE', label: 'Pessoas / Escala / Mapa', href: '/modulos/pessoas' }] },
      { titulo: 'Pagamentos', itens: [{ key: 'PAYMENTS', label: 'Pagamentos', href: '/modulos/pagamentos' }] },
    ],
  },
];

export function DevShellClient() {
  return (
    <PageChromeProvider>
      <div className="min-h-screen bg-canvas">
        <div className="flex items-center gap-3 border-b border-line bg-surface px-4 py-2">
          <span className="sgo-type-13 font-semibold text-ink-900">Harness do shell</span>
          <span className="sgo-type-12 text-ink-500">Sem banco/login — só valida a navegação.</span>
        </div>
        <AppHeader userName="Alan Silva" roleLabel="Administrador" unread={7} commPending={3} units={UNITS} selectedUnitId="todas" areas={AREAS} />
        <TopNav areas={AREAS} />
        <CommandPalette units={UNITS} isAdmin areas={AREAS} />
        <BottomNav />
        <main className="p-6">
          <LargeTitle title="Comandas" subtitle="Título grande (34px) que colapsa no header ao rolar." />
          <p className="sgo-body text-ink-500">
            Role a página: a barra ganha borda após 28px e o título inline aparece
            após 72px. Passe o mouse pelas áreas para abrir o mega menu, favorite
            um item na estrela e confira o estado ativo e o anel de foco pelo teclado.
          </p>
          <div className="mt-6 space-y-3">
            {Array.from({ length: 40 }).map((_, i) => (
              <div key={i} className="rounded-card border border-line bg-surface p-4 text-[14px] text-ink-700">
                Linha de conteúdo {i + 1}
              </div>
            ))}
          </div>
        </main>
      </div>
    </PageChromeProvider>
  );
}
