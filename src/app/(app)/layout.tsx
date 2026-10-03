import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db/prisma';
import { getSessionUser } from '@/lib/auth/session';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import { getSelectedUnitId } from '@/lib/scope/selected-unit';
import { roleLabel } from '@/lib/roles';
import { Suspense } from 'react';
import { SgoNavbar } from '@/components/layout/sgo-navbar';
import { BottomNav } from '@/components/layout/bottom-nav';
import { CommandPalette } from '@/components/layout/command-palette';
import { PageChromeProvider } from '@/components/layout/page-chrome';
import { TabsProvider } from '@/components/layout/tabs-context';
import { WorkspaceTabs } from '@/components/layout/workspace-tabs';
import { AmbientBackground } from '@/components/sgo/ambient-background';
import { SUBNAV_PORTAL_ID } from '@/components/sgo/module-shell';
import { APP_VERSION_LABEL } from '@/lib/version';
import { unreadCount } from '@/lib/notifications';
import { viewableNavHrefs } from '@/lib/permissions';
import { montarMenu } from '@/lib/nav/menu';
import { recortarPizzas } from '@/lib/pizzas/acesso';
import { canOpenPath, homeForRole } from '@/lib/permissions/route-guard';
import { getInboxPendingCount } from '@/lib/communications/query';
import { CommunicationInterstitial } from '@/components/communications/communication-interstitial';
import { ServiceWorkerRegister } from '@/components/push/service-worker-register';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (user.needsTerms) redirect('/termo'); // LGPD: aceite no 1º login

  /* GUARDA DE MÓDULO NO SERVIDOR. Até aqui a matriz de perfis só escondia o
     item no menu: dava para abrir qualquer tela digitando o endereço. */
  const caminho = headers().get('x-sgo-path');
  if (caminho && !(await canOpenPath(user.role, caminho))) {
    redirect(await homeForRole(user.role));
  }

  const isAdmin = user.role === 'ADMIN' || user.role === 'CEO';
  const [unread, viewablePorPerfil, commPending, unidades] = await Promise.all([
    unreadCount(user),
    viewableNavHrefs(user.role),
    getInboxPendingCount(user),
    prisma.unit.findMany({ where: { active: true, ...unitScopeWhere(user, 'id') }, select: { id: true, name: true, hasPizzeria: true }, orderBy: { name: 'asc' } }),
  ]);
  const units = unidades.map((u) => ({ id: u.id, name: u.name }));
  const selectedUnitId = getSelectedUnitId(units.map((u) => u.id));

  /* RECORTE POR UNIDADE. A matriz de perfis não tem essa dimensão: ela diz
     quem PODERIA ver o Controle de Pizzas, não em qual unidade ele existe.
     Sem esta subtração o módulo apareceria no menu de toda a rede, e só uma
     unidade tem pizzaria. A porta da tela repete a checagem — esconder item de
     menu nunca foi controle de acesso. */
  const viewable = recortarPizzas(viewablePorPerfil, unidades.some((u) => u.hasPizzeria));

  /* O MENU POR ÁREAS sai do mesmo `viewable` — inclusive do recorte da
     pizzaria, que a matriz de perfis não sabe fazer. Monta-se aqui, no
     servidor, porque o catálogo mora junto do Prisma; a barra recebe pronto. */
  const permitido = new Set(viewable);
  const areas = await montarMenu(user.role, (href) => permitido.has(href));

  /* Data da publicação para o tooltip do logo (o kit mostra versão e data). */
  const atualizadoEm = new Date().toLocaleDateString('pt-BR');

  return (
    /* MOLDURA DO KIT DE LAYOUT (v1.143.0): fundo contínuo montado UMA vez
       atrás de tudo; barra global flutuante de vidro (68px, fixa); <main> com
       o padding-top reservado por .sgo-shell__main (NÃO pôr utilitário de
       padding vertical nele — venceria a reserva e o título ficaria atrás da barra);
       dock de abas de trabalho no rodapé; rodapé com a versão.
       O que é do Restaurante e continua: barra de baixo no celular, ⌘K,
       interstício de comunicados e o service worker do push. */
    <div className="sgo-shell flex min-h-dvh w-full flex-col print:min-h-0 print:bg-white">
      <AmbientBackground />
      <PageChromeProvider>
        <Suspense fallback={null}>
          <TabsProvider areas={areas}>
            <SgoNavbar
              userName={user.name}
              roleLabel={user.profileName ?? roleLabel(user.role)}
              unread={unread}
              commPending={commPending}
              units={units}
              selectedUnitId={selectedUnitId}
              areas={areas}
              podeConfigurar={permitido.has('/configuracoes')}
              versao={APP_VERSION_LABEL}
              atualizadoEm={atualizadoEm}
            />
            <main className="sgo-shell__main flex-1 px-4 pb-24 md:pb-16 print:p-0">
              {/* Alvo do trilho de módulo (ModuleShell): no fluxo, altura zero quando vazio. */}
              <div id={SUBNAV_PORTAL_ID} className="-mx-4 shrink-0" />
              {children}
            </main>
            <WorkspaceTabs areas={areas} />
          </TabsProvider>
        </Suspense>
      </PageChromeProvider>
      <footer className="px-2 py-px text-center print:hidden">
        <span className="font-mono text-[8px] text-ink-400" data-testid="versao-publicada">{APP_VERSION_LABEL} · {atualizadoEm}</span>
      </footer>
      <BottomNav />
      <CommandPalette units={units} viewable={viewable} isAdmin={isAdmin} areas={areas} />
      <ServiceWorkerRegister />
      {commPending > 0 && <CommunicationInterstitial />}
    </div>
  );
}
