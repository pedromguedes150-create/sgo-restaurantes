/**
 * Validação e formatação de CPF — módulo puro, sem dependências.
 *
 * Regras:
 *  - 11 dígitos numéricos
 *  - Dígitos verificadores válidos (algoritmo Receita Federal)
 *  - Sequências de dígitos iguais recusadas (000.000.000-00, 111…, etc.)
 */

/** Remove tudo que não é dígito. */
export function limparCpf(raw: string): string {
  return raw.replace(/\D/g, '');
}

/** Formata 11 dígitos como 000.000.000-00. */
export function formatarCpf(digits: string): string {
  const d = limparCpf(digits);
  if (d.length !== 11) return digits;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

/** Valida CPF pelo algoritmo da Receita Federal. */
export function validarCpf(raw: string): boolean {
  const d = limparCpf(raw);
  if (d.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(d)) return false;

  const digits = d.split('').map(Number);

  for (let j = 9; j <= 10; j++) {
    let soma = 0;
    for (let i = 0; i < j; i++) {
      soma += digits[i] * (j + 1 - i);
    }
    const resto = soma % 11;
    const esperado = resto < 2 ? 0 : 11 - resto;
    if (digits[j] !== esperado) return false;
  }

  return true;
}
