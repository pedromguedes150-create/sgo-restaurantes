/**
 * Chave de acesso da NFe/NFC-e (44 dígitos). Layout:
 *  cUF(2) AAMM(4) CNPJ(14) mod(2) serie(3) nNF(9) tpEmis(1) cNF(8) cDV(1)
 * Extraímos CNPJ e data de emissão (AAMM) para pré-preencher a confirmação.
 */
export interface ChaveData {
  valid: boolean;
  cnpj?: string;
  cnpjFormatted?: string;
  issueDate?: Date; // 1º dia do mês de emissão
  model?: string;
  number?: string;
}

export function parseChaveAcesso(raw: string): ChaveData {
  const digits = (raw ?? '').replace(/\D/g, '');
  if (digits.length !== 44) return { valid: false };

  const aa = Number(digits.slice(2, 4));
  const mm = Number(digits.slice(4, 6));
  const cnpj = digits.slice(6, 20);
  const model = digits.slice(20, 22);
  const number = String(Number(digits.slice(25, 34)));

  const year = 2000 + aa;
  const issueDate = mm >= 1 && mm <= 12 ? new Date(Date.UTC(year, mm - 1, 1)) : undefined;

  return {
    valid: true,
    cnpj,
    cnpjFormatted: formatCnpj(cnpj),
    issueDate,
    model,
    number,
  };
}

export function formatCnpj(cnpj: string): string {
  const d = cnpj.replace(/\D/g, '').padStart(14, '0');
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12, 14)}`;
}
