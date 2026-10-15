import { CalendarRange, FileText, Sun, UserCheck } from 'lucide-react';
import { createElement } from 'react';
import { permissoesEfetivasDoRequest } from '@/lib/permissions';
import type { SessionUser } from '@/lib/auth/session';
import type { SgoPageTab } from '@/components/sgo/sgo-page-header';

/**
 * As abas da família "Escala de gerentes" (v1.170.0), montadas pela MATRIZ:
 * cada tela só aparece para quem pode abri-la. Uma função só, para as quatro
 * páginas mostrarem o mesmo conjunto.
 */
export async function abasDaEscalaDeGerentes(user: SessionUser, ativa: 'escala' | 'minha' | 'hoje' | 'relatorio'): Promise<SgoPageTab[]> {
  const perms = await permissoesEfetivasDoRequest(user.role);
  const pode = (k: string) => user.role === 'ADMIN' || user.role === 'CEO' || Boolean(perms[k]?.canView);
  const tabs: SgoPageTab[] = [];
  if (pode('MANAGER_SCHEDULE')) tabs.push({ label: 'Escala', icon: createElement(CalendarRange, { className: 'h-3.5 w-3.5' }), href: '/modulos/escala-gerentes', active: ativa === 'escala', testId: 'aba-escala' });
  if (pode('MANAGER_SCHEDULE_OWN')) tabs.push({ label: 'Minha folga', icon: createElement(UserCheck, { className: 'h-3.5 w-3.5' }), href: '/modulos/escala-gerentes/minha', active: ativa === 'minha', testId: 'aba-minha' });
  if (pode('MANAGER_SCHEDULE_TODAY')) tabs.push({ label: 'Hoje na rede', icon: createElement(Sun, { className: 'h-3.5 w-3.5' }), href: '/modulos/escala-gerentes/hoje', active: ativa === 'hoje', testId: 'aba-hoje' });
  if (pode('MANAGER_SCHEDULE_NETWORK_REPORT')) tabs.push({ label: 'Relatório da rede (PDF)', icon: createElement(FileText, { className: 'h-3.5 w-3.5' }), href: '/modulos/escala-gerentes/relatorio-rede', active: ativa === 'relatorio', testId: 'aba-relatorio' });
  return tabs;
}
