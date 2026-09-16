import Link from 'next/link';
import { getSessionUser } from '@/lib/auth/session';
import { Card, CardContent } from '@/components/ui/card';
import { PermissionsAdmin } from '@/components/admin/permissions-admin';
import { ProfilesAdmin } from '@/components/admin/profiles-admin';
import { ALL_ROLES, isFullAccess, MODULES, permissionMatrix, permissoesDoPerfil, type Perm } from '@/lib/permissions';
import { basesPossiveis, listarPerfis } from '@/lib/perfis';
import { valorDePerfil } from '@/lib/perfil-valor';
import { ROLE_HINTS, roleLabel } from '@/lib/roles';
import { ArrowLeft } from 'lucide-react';
import { LargeTitle } from '@/components/layout/page-chrome';

export const dynamic = 'force-dynamic';

export default async function PerfisAdminPage() {
  const user = (await getSessionUser())!;
  if (user.role !== 'ADMIN') return <p className="text-sm text-ink-500">Restrito ao Administrador.</p>;

  const [matrix, personalizados] = await Promise.all([permissionMatrix(), listarPerfis()]);

  /* A matriz dos perfis personalizados entra na mesma estrutura, com a chave
     prefixada: a tela de matriz não precisa saber a diferença, e por isso ela
     não mudou. */
  const matrizCompleta: Record<string, Record<string, Perm>> = { ...matrix };
  for (const p of personalizados) {
    const perms = await permissoesDoPerfil(p.id);
    if (perms) matrizCompleta[valorDePerfil(p.id)] = perms;
  }

  /* Quem aparece no seletor: os perfis de sistema (menos os de acesso total) e
     os personalizados ATIVOS. A lista era escrita à mão no cliente e tinha
     quatro perfis — Caixa e Separador do CD ficavam invisíveis. */
  const perfis = [
    ...ALL_ROLES.filter((r) => !isFullAccess(r)).map((r) => ({ value: r as string, label: roleLabel(r), hint: ROLE_HINTS[r] })),
    ...personalizados
      .filter((p) => p.active)
      .map((p) => ({ value: valorDePerfil(p.id), label: p.name, hint: `Perfil criado aqui — herda as regras de ${p.baseRoleLabel}` })),
  ];

  return (
    <div className="space-y-4">
      <Link href="/configuracoes" className="inline-flex items-center gap-1 text-sm font-semibold text-brand"><ArrowLeft className="h-4 w-4" /> Configurações</Link>
      <LargeTitle title="Perfis de acesso" subtitle="Crie perfis e defina o que cada um pode ver e editar em cada módulo." />

      <Card><CardContent className="pt-4">
        <ProfilesAdmin perfis={personalizados} bases={basesPossiveis()} />
      </CardContent></Card>

      <Card><CardContent className="pt-4">
        <PermissionsAdmin
          modules={MODULES.map((m) => ({ key: m.key, label: m.label, parent: m.parent, soVer: m.soVer }))}
          matrix={matrizCompleta}
          perfis={perfis}
        />
      </CardContent></Card>
    </div>
  );
}
