import { familyOf } from '@/lib/nav-families';
import { viewableNavHrefs } from '@/lib/permissions';
import { getSessionUser } from '@/lib/auth/session';
import { FamilySwitch } from './family-switch';

/**
 * Mostra a que FAMÍLIA o módulo pertence e deixa saltar para os irmãos.
 *
 * Respeita a matriz de Perfis: irmão que o perfil não pode ver não é oferecido
 * — a alternativa seria prometer uma tela que responde "acesso restrito".
 * Se não sobrar irmão visível, nada é desenhado.
 */
export async function FamilyTabs({ active }: { active: string }) {
  const family = familyOf(active);
  if (!family) return null;

  const user = await getSessionUser();
  if (!user) return null;
  const viewable = new Set(await viewableNavHrefs(user.role));

  const irmaos = family.children.filter((c) => c.href !== active && viewable.has(c.href));
  if (irmaos.length === 0) return null;

  return <FamilySwitch familyTitle={family.title} siblings={irmaos} />;
}
