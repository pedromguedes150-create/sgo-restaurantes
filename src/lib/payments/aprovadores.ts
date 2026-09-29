import type { PaymentType, Role } from '@prisma/client';

/**
 * QUEM APROVA E QUEM PAGA — regra PURA do módulo de Pagamentos (v1.133.0).
 *
 * Na operação, o COORDENADOR é quem confere, aprova e organiza os pagamentos
 * de Freelancer e Hora Extra (decisão do Pedro, 29/09/2026). O Supervisor
 * continua podendo: os dois recebem o aviso e qualquer um aprova.
 *
 * O `approverRole` gravado na solicitação NÃO mudou (é SUPERVISOR para
 * Freelancer/HE desde sempre, e o tipo de avulso escolhe o seu). O que mudou é
 * a LEITURA: para Freelancer e Hora Extra cujo aprovador gravado é o
 * Supervisor, o Coordenador da unidade também aprova. Avulso segue exatamente
 * a regra do tipo cadastrado. Assim nenhuma linha antiga precisa ser reescrita
 * e a regra vive num lugar só — a fila "Para Aprovar", a aprovação, a
 * reprovação e a correção pelo aprovador perguntam aqui.
 */
export const TIPOS_DA_OPERACAO: PaymentType[] = ['FREELANCER', 'OVERTIME'];

export function papeisQueAprovam(req: { type: PaymentType; approverRole: Role }): Role[] {
  if (TIPOS_DA_OPERACAO.includes(req.type) && req.approverRole === 'SUPERVISOR') return ['SUPERVISOR', 'COORDINATOR'];
  return [req.approverRole];
}

/** O usuário (com os papéis que ele carrega, inclusive por delegação) aprova esta solicitação? */
export function aprovaCom(papeisDoUsuario: Set<Role>, req: { type: PaymentType; approverRole: Role }): boolean {
  return papeisQueAprovam(req).some((r) => papeisDoUsuario.has(r));
}

/**
 * Quem marca como PAGO na central: Coordenador (a operação), Financeiro
 * (perfil que já existia e continua valendo) e Admin/CEO. A aba "Pagar" da
 * matriz de Perfis é a segunda porta — as duas precisam abrir (a rota confere
 * a matriz; a regra confere o perfil), do mesmo jeito que a chave da API
 * Global exige ADMIN além da matriz.
 */
export const PERFIS_QUE_PAGAM: Role[] = ['COORDINATOR', 'FINANCE', 'ADMIN', 'CEO'];
export function podePagarPorPerfil(role: Role): boolean { return PERFIS_QUE_PAGAM.includes(role); }

/** Filtro compacto "Tipo de pagamento" da central (Todos · Freelancer · Hora Extra · Avulso). */
export type FiltroDeTipo = 'ALL' | PaymentType;
export const FILTROS_DE_TIPO: { value: FiltroDeTipo; label: string }[] = [
  { value: 'ALL', label: 'Todos' },
  { value: 'FREELANCER', label: 'Freelancer' },
  { value: 'OVERTIME', label: 'Hora Extra' },
  { value: 'MISC', label: 'Avulso' },
];
export function filtrarPorTipo<T extends { type: PaymentType }>(itens: T[], filtro: FiltroDeTipo): T[] {
  return filtro === 'ALL' ? itens : itens.filter((i) => i.type === filtro);
}
