/**
 * Regra PURA da foto por procedimento do Restaurante — a tela (cliente) e o
 * servidor (`saveWasteEntry`) perguntam a mesma coisa. A chave que liga a
 * cobrança mora em `foto-config.ts` (servidor).
 *
 * `codigosComPeso` = códigos fixos com kg > 0; `comFoto` = fotos novas desta
 * gravação + as já gravadas naquele dia.
 */
export function procedimentosSemFoto(codigosComPeso: string[], comFoto: Iterable<string>): string[] {
  const tem = new Set(comFoto);
  return codigosComPeso.filter((c) => !tem.has(c));
}

/** URL pública (autenticada) de um arquivo do volume de uploads.
 *  O caminho gravado já começa em "uploads/…" e a rota é `/uploads/[...path]` —
 *  montar `/api/uploads/…` (o que a tela de Desperdícios fazia) dá 404. */
export function urlDoUpload(path: string, largura?: 320 | 1600): string {
  const base = `/${path.replace(/^\/+/, '')}`;
  /* v1.171.1 — `?w=` pede a DERIVADA redimensionada em vez do original de
     vários MB (miniatura 320, janela 1600); sem largura, o original. */
  return largura ? `${base}?w=${largura}` : base;
}
