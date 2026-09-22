/**
 * VALIDADE POR LOTE — a faixa é CALCULADA, nunca gravada.
 *
 * O dia vira sozinho. Um lote gravado com status "7 dias" continuaria dizendo
 * "7 dias" três semanas depois de vencer, e ninguém teria como desconfiar: o
 * número sai plausível. É o mesmo erro da variação do gás, e a saída é a mesma
 * — quem pergunta calcula, a partir da data e de hoje.
 *
 * Duas coisas diferentes, que a tela costuma confundir:
 *
 *  - **`alertDays` é do PRODUTO** e decide só QUANDO o lote entra no radar.
 *    Molho que dura 6 meses e pão que dura 5 dias não podem acender no mesmo
 *    momento; por isso a antecedência do primeiro alerta é cadastrada.
 *  - **A escalada é FIXA** e igual para todos: 7 → 2 → hoje → vencido. Ela não
 *    é configurável de propósito — "crítico" precisa querer dizer a mesma coisa
 *    em toda unidade, senão o vermelho de uma não é o vermelho da outra.
 *
 * Puro: sem Prisma e sem `new Date()` implícito. Quem chama passa o dia, o que
 * permite provar a véspera, o dia e o dia seguinte sem esperar o relógio.
 */

/** Faixas, da mais grave para a mais branda. A ordem é a prioridade. */
export type FaixaChave = 'VENCIDO' | 'HOJE' | 'CRITICO' | 'ATENCAO' | 'PROXIMO';

/** Os tons do design system — semáforo, nunca a cor da marca. */
export type FaixaTom = 'danger' | 'warning' | 'success';

export interface Faixa {
  chave: FaixaChave;
  rotulo: string;
  tom: FaixaTom;
  /** Dias até vencer. Negativo quando já venceu. */
  dias: number;
}

/** Dias inteiros entre duas datas 'AAAA-MM-DD', sem fuso: as duas viram UTC. */
export function diasEntre(de: string, ate: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(de) || !/^\d{4}-\d{2}-\d{2}$/.test(ate)) return null;
  const a = Date.parse(`${de}T00:00:00Z`);
  const b = Date.parse(`${ate}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86400000);
}

/**
 * A faixa de um lote hoje. `null` = ainda longe, ou sem validade a controlar.
 *
 * `null` e "PROXIMO" são coisas distintas e a tela trata as duas de formas
 * diferentes: `null` não aparece em lista de alerta nenhuma.
 */
export function faixaDaValidade(
  expiresAt: string | null | undefined,
  hoje: string,
  alertDays = 30,
): Faixa | null {
  if (!expiresAt) return null;
  const dias = diasEntre(hoje, expiresAt);
  if (dias === null) return null;

  if (dias < 0) {
    const ha = Math.abs(dias);
    return { chave: 'VENCIDO', rotulo: `Produto vencido há ${ha} ${ha === 1 ? 'dia' : 'dias'} — requer tratativa`, tom: 'danger', dias };
  }
  if (dias === 0) return { chave: 'HOJE', rotulo: 'Vence hoje', tom: 'danger', dias };
  if (dias === 1) return { chave: 'CRITICO', rotulo: 'Vence amanhã', tom: 'danger', dias };
  if (dias <= 2) return { chave: 'CRITICO', rotulo: `Crítico — vence em ${dias} dias`, tom: 'danger', dias };
  if (dias <= 7) return { chave: 'ATENCAO', rotulo: `Atenção — vence em ${dias} dias`, tom: 'warning', dias };
  /* A janela do PRIMEIRO alerta é a do produto. Um `alertDays` menor que 7 não
     esconde as faixas de cima: quem está a 3 dias de vencer é crítico, tenha o
     produto a janela que tiver — senão a configuração poderia calar o alarme. */
  if (dias <= Math.max(0, alertDays)) return { chave: 'PROXIMO', rotulo: `Próximo do vencimento — ${dias} dias`, tom: 'warning', dias };
  return null;
}

/**
 * Chave da faixa gravada em `StockLot.lastReviewBand`.
 *
 * Serve a UMA pergunta: já perguntamos sobre este lote NESTA faixa? Sem isso o
 * alerta repetiria a mesma pergunta todo dia até o gerente parar de ler — e um
 * alerta que se repete ensina a ignorar o alerta.
 */
export function bandaDaFaixa(faixa: Faixa | null): string | null {
  return faixa ? faixa.chave : null;
}

/**
 * Este lote precisa de tratativa AGORA?
 *
 * Só lote em uso (`OPEN`) e só quando a faixa de hoje é diferente da última
 * sobre a qual já se perguntou. Responder "ainda possui estoque" a 30 dias não
 * cala o alerta de 7: a situação mudou, e a pergunta volta.
 */
export function precisaTratativa(
  lote: { status: string; expiresAt: string | null; lastReviewBand: string | null },
  hoje: string,
  alertDays = 30,
): boolean {
  if (lote.status !== 'OPEN') return false;
  const faixa = faixaDaValidade(lote.expiresAt, hoje, alertDays);
  if (!faixa) return false;
  return lote.lastReviewBand !== faixa.chave;
}

/** Ordem de urgência para a tela: o que vence antes aparece primeiro. */
export function ordemDeUrgencia(
  a: { expiresAt: string | null },
  b: { expiresAt: string | null },
): number {
  /* Sem validade vai para o fim — não é urgente, é outra categoria de item. */
  if (!a.expiresAt && !b.expiresAt) return 0;
  if (!a.expiresAt) return 1;
  if (!b.expiresAt) return -1;
  return a.expiresAt.localeCompare(b.expiresAt);
}
