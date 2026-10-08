'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Award, CalendarClock, HandCoins, Palmtree, PencilLine, Timer, type LucideIcon } from 'lucide-react';
import { ActionMenu } from '@/components/ui/ds/action-menu';

export type IconeDaAcao = 'avaliar' | 'escala' | 'ferias' | 'vender' | 'corrigir' | 'horaExtra';
export interface AcaoDoPerfil { label: string; href: string; icone: IconeDaAcao; testId?: string }

const ICONES: Record<IconeDaAcao, LucideIcon> = { avaliar: Award, escala: CalendarClock, ferias: Palmtree, vender: HandCoins, corrigir: PencilLine, horaExtra: Timer };

/**
 * Ações do Perfil 360 (v1.162.1): as PRIMÁRIAS viram botões; as demais vão
 * para o menu "Mais ações" — seis botões lado a lado no cabeçalho competiam
 * com o nome do colaborador e quebravam em três linhas no celular. A página
 * (servidor) manda só rótulo, destino e a chave do ícone.
 */
export function PerfilAcoes({ primarias, secundarias, nome }: { primarias: AcaoDoPerfil[]; secundarias: AcaoDoPerfil[]; nome: string }) {
  const router = useRouter();
  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden" data-testid="perfil-acoes">
      {primarias.map((a) => {
        const Icone = ICONES[a.icone];
        return (
          <Link key={a.href} className="sgo-btn sgo-btn--sm sgo-btn--primary" href={a.href} data-testid={a.testId}>
            <Icone className="h-3.5 w-3.5" /> {a.label}
          </Link>
        );
      })}
      {secundarias.length > 0 && (
        <ActionMenu
          label={`Mais ações de ${nome}`}
          items={secundarias.map((a) => {
            const Icone = ICONES[a.icone];
            return { label: a.label, icon: <Icone className="h-4 w-4" />, onSelect: () => router.push(a.href) };
          })}
        />
      )}
      {/* Os destinos do menu também existem como links (sem JS, leitor de tela e testes). */}
      <span className="sr-only">
        {secundarias.map((a) => <Link key={a.href} href={a.href} data-testid={a.testId}>{a.label}</Link>)}
      </span>
    </div>
  );
}
