import Link from 'next/link';
import { getSessionUser } from '@/lib/auth/session';
import { roleLabel } from '@/lib/roles';
import { guidesForRole } from '@/lib/guide';
import { Card, CardContent } from '@/components/ui/card';
import { GuideView } from '@/components/help/guide-view';
import { GraduationCap, Eye, User } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function AjudaPage({ searchParams }: { searchParams: { all?: string } }) {
  const user = (await getSessionUser())!;
  const all = searchParams.all === '1';
  const sections = guidesForRole(user.role, all);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-sgo-brand"><GraduationCap className="h-5 w-5 text-sgo-brand" /> Treinamento da Plataforma</h1>
        <p className="text-sm text-ink-500">Como usar o sistema, passo a passo, de acordo com o seu perfil.</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1 rounded-full bg-sunken px-3 py-1.5 text-sm font-medium">
          <User className="h-4 w-4 text-sgo-brand" /> {all ? 'Todos os perfis' : `Seu perfil: ${roleLabel(user.role)}`}
        </span>
        <Link href={all ? '/ajuda' : '/ajuda?all=1'} className="inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-sm font-medium hover:border-sgo-brand">
          <Eye className="h-4 w-4" /> {all ? 'Ver só o meu perfil' : 'Ver guias de todos os perfis'}
        </Link>
      </div>

      <Card><CardContent className="pt-4"><GuideView sections={sections} /></CardContent></Card>

      <p className="text-center text-xs text-ink-500">Esta central é atualizada a cada novo recurso da plataforma.</p>
    </div>
  );
}
