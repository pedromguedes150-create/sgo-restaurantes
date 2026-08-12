'use client';

import { SidebarStateProvider, useSidebarState } from '@/components/layout/sidebar-state-provider';
import { Sidebar } from '@/components/layout/sidebar';
import { AppHeader } from '@/components/layout/app-header';
import { CommandPalette } from '@/components/layout/command-palette';
import { PageChromeProvider, LargeTitle } from '@/components/layout/page-chrome';

function Toolbar() {
  const { collapsed, toggle } = useSidebarState();
  return (
    <div className="flex items-center gap-3 border-b border-line bg-sgo-surface px-4 py-2">
      <span className="sgo-type-13 font-semibold text-ink-900">Harness do shell</span>
      <button
        type="button"
        onClick={toggle}
        className="h-8 rounded-control border border-line-strong bg-sgo-surface px-3 text-[13px] font-medium text-ink-700 outline-none hover:bg-sunken focus-visible:shadow-sgo-focus"
      >
        {collapsed ? 'Expandir' : 'Recolher'} sidebar
      </button>
      <span className="sgo-type-12 text-ink-400">Sem banco/login — só valida a navegação.</span>
    </div>
  );
}

const UNITS = [
  { id: 'u1', name: 'COMERCIAL LINS & GUEDES LTDA ( MOREIRA)' },
  { id: 'u2', name: 'COMERCIAL LINS & GUEDES LTDA (KM13)' },
  { id: 'u3', name: 'COMERCIAL LINS & GUEDES LTDA (SANTO ANTÔNIO DO AMPARO)' },
  { id: 'u4', name: 'COMERCIAL LINS E GUEDES LTDA ME' },
];

export function DevShellClient() {
  // Badges de exemplo para exercitar a marcação de pendências.
  const badges = { '/modulos/comunicacao': 3, '/modulos/pagamentos': 158 };
  return (
    <SidebarStateProvider defaultCollapsed={false}>
      <PageChromeProvider>
        <div className="min-h-screen bg-canvas">
          <Toolbar />
          <AppHeader userName="Alan Silva" roleLabel="Administrador" unread={7} units={UNITS} selectedUnitId="u1" />
          <CommandPalette units={UNITS} isAdmin />
          <div className="flex">
            <Sidebar isAdmin viewable={undefined} badges={badges} />
            <main className="flex-1 p-6">
              <LargeTitle title="Comandas" subtitle="Título grande (34px) que colapsa no header ao rolar." />
              <p className="sgo-body text-ink-500">
                Role a página: a barra ganha borda após 28px e o título inline aparece
                após 72px. Alterne os grupos, recolha a sidebar (rail 72px) e confira o
                estado ativo, os badges e o anel de foco pelo teclado.
              </p>
              <div className="mt-6 space-y-3">
                {Array.from({ length: 40 }).map((_, i) => (
                  <div key={i} className="rounded-card border border-line bg-sgo-surface p-4 text-[14px] text-ink-700">
                    Linha de conteúdo {i + 1}
                  </div>
                ))}
              </div>
            </main>
          </div>
        </div>
      </PageChromeProvider>
    </SidebarStateProvider>
  );
}
