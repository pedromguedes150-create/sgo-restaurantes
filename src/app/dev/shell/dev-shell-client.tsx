'use client';

import { SidebarStateProvider, useSidebarState } from '@/components/layout/sidebar-state-provider';
import { Sidebar } from '@/components/layout/sidebar';

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

export function DevShellClient() {
  // Badges de exemplo para exercitar a marcação de pendências.
  const badges = { '/modulos/comunicacao': 3, '/modulos/pagamentos': 158 };
  return (
    <SidebarStateProvider defaultCollapsed={false}>
      <div className="min-h-screen bg-canvas">
        <Toolbar />
        <div className="flex">
          <Sidebar isAdmin viewable={undefined} badges={badges} />
          <main className="flex-1 p-6">
            <p className="sgo-type-20 font-semibold text-ink-900">Área de conteúdo</p>
            <p className="sgo-body mt-2 text-ink-500">
              Alterne os grupos, recolha a sidebar (rail de 72px) e confira o estado
              ativo, os badges e o anel de foco pelo teclado.
            </p>
          </main>
        </div>
      </div>
    </SidebarStateProvider>
  );
}
