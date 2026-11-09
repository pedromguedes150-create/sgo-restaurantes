import type { CertificateType, DocumentGroup, DocumentStatus } from '@prisma/client';
import type { Role } from '@prisma/client';
import { GRUPOS, SITUACOES } from '@/lib/certificates/catalogo';

export const CERT_TYPE_LABELS: Record<CertificateType, string> = {
  FULL_DAY: 'Dias de afastamento',
  HOURS: 'Atestado de horas',
  COMPANION: 'Acompanhamento',
};

export function certTypeLabel(t: CertificateType): string {
  return CERT_TYPE_LABELS[t] ?? t;
}

/** v1.196.0 — rótulo do grupo do documento. */
export function grupoLabel(g: DocumentGroup | null | undefined): string {
  return g ? GRUPOS[g].rotulo : 'Atestado';
}

/** v1.196.0 — rótulo da situação do lançamento. */
export function situacaoLabel(s: DocumentStatus): string {
  return SITUACOES[s]?.rotulo ?? s;
}

/** CID é dado sensível (LGPD). Só ADMIN/CEO (papel de RH) podem ver. */
export function canSeeCid(role: Role): boolean {
  return role === 'ADMIN' || role === 'CEO';
}
