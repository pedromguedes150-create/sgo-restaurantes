import type { Role } from '@prisma/client';
import { ROLE_LABELS } from '@/lib/roles';

/**
 * PÚBLICO DO COMUNICADO POR PERFIL (v1.195.0) — regras puras.
 *
 * Pedido do Pedro (08/11): "deixe disponível marcar os usuários que irão
 * receber — uma mensagem que mando para o gerente, o separador ver também não
 * é viável para a operação". Até aqui as unidades escolhidas alcançavam SÓ o
 * perfil Gerente, sem a tela dizer isso; agora o autor escolhe os PERFIS que
 * recebem nas unidades marcadas (padrão: Gerente, o comportamento de sempre),
 * e as pessoas avulsas aparecem com o perfil ao lado do nome.
 */

/** Perfis que podem ser alvo por unidade. Admin e CEO ficam fora: são quem escreve, não quem confirma. */
export const PERFIS_DESTINATARIOS: Role[] = ['MANAGER', 'COORDINATOR', 'SUPERVISOR', 'FINANCE', 'CASHIER', 'SEPARATOR'];
export const PERFIS_PADRAO: Role[] = ['MANAGER'];

/** Lista válida, sem repetição, na ordem fixa; vazio ou inválido → o padrão (Gerente). */
export function normalizarPerfis(input: unknown): Role[] {
  const pedidos = Array.isArray(input) ? input.map(String) : [];
  const validos = PERFIS_DESTINATARIOS.filter((r) => pedidos.includes(r));
  return validos.length ? validos : [...PERFIS_PADRAO];
}

export const OPCOES_DE_PERFIL = PERFIS_DESTINATARIOS.map((r) => ({ value: r, label: ROLE_LABELS[r] }));

/** "Gerente · Coordenador" — para a lista de comunicados e o resumo. */
export const rotuloDosPerfis = (roles: readonly string[]) => roles.map((r) => ROLE_LABELS[r as Role] ?? r).join(' · ');

/** "Ana Silva · Separador CD" — na lista de pessoas avulsas o perfil aparece ao lado do nome. */
export const rotuloDaPessoa = (p: { name: string; role: string }) => `${p.name} · ${ROLE_LABELS[p.role as Role] ?? p.role}`;
