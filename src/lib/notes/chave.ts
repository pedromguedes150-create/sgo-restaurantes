/**
 * Chave de acesso da NFe/NFC-e (44 dígitos). Layout:
 *  cUF(2) AAMM(4) CNPJ(14) mod(2) serie(3) nNF(9) tpEmis(1) cNF(8) cDV(1)
 * Extraímos CNPJ e data de emissão (AAMM) para pré-preencher a confirmação.
 */
export interface ChaveData {
  /** Tem 44 dígitos. */
  valid: boolean;
  /** v1.206.0 — a chave CONFERE: dígito verificador, UF e mês batem. Só então os campos são confiáveis. */
  confere?: boolean;
  cnpj?: string;
  cnpjFormatted?: string;
  issueDate?: Date; // 1º dia do mês de emissão
  model?: string;
  number?: string;
}

/** Códigos de UF do IBGE — os dois primeiros dígitos da chave. */
const UFS = new Set(['11', '12', '13', '14', '15', '16', '17', '21', '22', '23', '24', '25', '26', '27', '28', '29', '31', '32', '33', '35', '41', '42', '43', '50', '51', '52', '53']);

/** Dígito verificador da chave (módulo 11, pesos 2..9 da direita para a esquerda) sobre os 43 primeiros dígitos. */
export function digitoVerificadorDaChave(digitos43: string): number {
  let peso = 2, soma = 0;
  for (let i = digitos43.length - 1; i >= 0; i--) {
    soma += Number(digitos43[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

/**
 * A chave CONFERE? (v1.206.0) 44 dígitos, UF que existe, mês 01–12 e o dígito
 * verificador batendo. Um código de barras mal lido (a câmera troca um par de
 * dígitos) quase sempre falha aqui — antes a leitura errada entrava e preenchia
 * CNPJ, número e emissão errados sem aviso (nota 1.536.433 lida como 2.536.433).
 */
export function chaveConfere(raw: string): boolean {
  const d = (raw ?? '').replace(/\D/g, '');
  if (d.length !== 44) return false;
  if (!UFS.has(d.slice(0, 2))) return false;
  const mm = Number(d.slice(4, 6));
  if (mm < 1 || mm > 12) return false;
  return digitoVerificadorDaChave(d.slice(0, 43)) === Number(d[43]);
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
    confere: chaveConfere(digits),
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
