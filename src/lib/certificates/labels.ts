import type { CertificateType } from '@prisma/client';
import type { Role } from '@prisma/client';

export const CERT_TYPE_LABELS: Record<CertificateType, string> = {
  FULL_DAY: 'Dias de afastamento',
  HOURS: 'Atestado de horas',
  COMPANION: 'Acompanhamento',
};

export function certTypeLabel(t: CertificateType): string {
  return CERT_TYPE_LABELS[t] ?? t;
}

/** CID é dado sensível (LGPD). Só ADMIN/CEO (papel de RH) podem ver. */
export function canSeeCid(role: Role): boolean {
  return role === 'ADMIN' || role === 'CEO';
}
