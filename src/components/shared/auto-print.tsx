'use client';

import { useEffect } from 'react';

/**
 * Abre o diálogo de impressão sozinho ao carregar — é o que transforma o link
 * "PDF" de um cartão em PDF de verdade: a página do relatório abre em nova
 * aba já com "Salvar como PDF" na tela. O atraso deixa as fontes e a tabela
 * assentarem; sem ele o Chrome às vezes imprime a página em branco.
 */
export function AutoPrint() {
  useEffect(() => {
    const t = setTimeout(() => window.print(), 600);
    return () => clearTimeout(t);
  }, []);
  return null;
}
