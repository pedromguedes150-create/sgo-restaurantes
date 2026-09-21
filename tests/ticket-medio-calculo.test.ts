import { describe, it, expect } from 'vitest';
import {
  competenciaAnterior, competenciaDeHoje, competenciaValida, competenciasEntre,
  deslocarCompetencia, montarCompetencia, receita, rotuloDaCompetencia, somar,
  ticketConsolidado, ticketMedio, variacao,
} from '@/lib/ticket-media/calculo';
import { lerPlanilhaDeCupons, numeroDaCelula, competenciaDaData } from '@/lib/ticket-media/planilha';

/**
 * AS REGRAS DO TICKET MÉDIO.
 *
 * Os três primeiros blocos existem porque os três erros são erros de PLANILHA
 * que sobrevivem anos: somar o desconto em vez de subtrair, dividir a venda
 * bruta pelos cupons, e tirar a média dos tickets das unidades. Nenhum deles
 * quebra nada — todos produzem um número plausível.
 */

describe('Regra 1 — receita = venda − desconto', () => {
  it('subtrai o desconto (o exemplo do pedido)', () => {
    expect(receita({ coupons: 20000, grossSales: 150000, discounts: 30000 })).toBe(120000);
  });

  it('NÃO soma o desconto', () => {
    /* 180.000 seria o erro. Está escrito como caso porque o número errado é
       maior e mais bonito, e ninguém desconfia de faturamento para cima. */
    expect(receita({ coupons: 1, grossSales: 150000, discounts: 30000 })).not.toBe(180000);
  });

  it('sem desconto, receita é a própria venda', () => {
    expect(receita({ coupons: 10, grossSales: 1000, discounts: 0 })).toBe(1000);
  });
});

describe('Regra 2 — ticket = receita ÷ cupons', () => {
  it('o exemplo do pedido dá R$ 6,00', () => {
    expect(ticketMedio({ coupons: 20000, grossSales: 150000, discounts: 30000 })).toBe(6);
  });

  it('usa a RECEITA, não a venda bruta', () => {
    /* Venda ÷ cupons daria 7,50 — e é o número que a planilha costuma mostrar. */
    expect(ticketMedio({ coupons: 20000, grossSales: 150000, discounts: 30000 })).not.toBe(7.5);
  });

  it('zero cupom devolve null, e não zero nem infinito', () => {
    expect(ticketMedio({ coupons: 0, grossSales: 1000, discounts: 0 })).toBeNull();
    expect(ticketMedio({ coupons: -3, grossSales: 1000, discounts: 0 })).toBeNull();
  });
});

describe('Regra 3 — consolidado = Σreceita ÷ Σcupons', () => {
  const A = { coupons: 2000, grossSales: 100000, discounts: 0 };
  const B = { coupons: 5000, grossSales: 300000, discounts: 0 };

  it('o exemplo do pedido dá R$ 57,14', () => {
    expect(ticketConsolidado([A, B])).toBeCloseTo(57.14, 2);
  });

  it('NÃO é a média simples dos tickets das unidades', () => {
    const media = (ticketMedio(A)! + ticketMedio(B)!) / 2; // 55,00
    expect(media).toBe(55);
    expect(ticketConsolidado([A, B])).not.toBe(media);
  });

  it('a unidade grande pesa mais — é o ponto da regra', () => {
    /* Uma unidade minúscula com ticket altíssimo não pode puxar o consolidado
       como se vendesse igual à maior da rede. */
    const gigante = { coupons: 100000, grossSales: 5000000, discounts: 0 }; // ticket 50
    const minuscula = { coupons: 10, grossSales: 5000, discounts: 0 };      // ticket 500
    const consolidado = ticketConsolidado([gigante, minuscula])!;
    expect(consolidado).toBeGreaterThan(50);
    expect(consolidado).toBeLessThan(51); // a média simples daria 275
  });

  it('sem cupom nenhum devolve null', () => {
    expect(ticketConsolidado([])).toBeNull();
    expect(ticketConsolidado([{ coupons: 0, grossSales: 0, discounts: 0 }])).toBeNull();
  });

  it('soma componente a componente', () => {
    expect(somar([A, B])).toEqual({ coupons: 7000, grossSales: 400000, discounts: 0 });
  });
});

describe('Competência', () => {
  it('aceita AAAA-MM e recusa o resto', () => {
    expect(competenciaValida('2026-09')).toBe(true);
    expect(competenciaValida('2026-13')).toBe(false);
    expect(competenciaValida('2026-00')).toBe(false);
    expect(competenciaValida('09/2026')).toBe(false);
    expect(competenciaValida(null)).toBe(false);
  });

  it('anda de mês virando o ano nas duas direções', () => {
    expect(competenciaAnterior('2026-01')).toBe('2025-12');
    expect(deslocarCompetencia('2026-12', 1)).toBe('2027-01');
    expect(deslocarCompetencia('2026-03', -5)).toBe('2025-10');
  });

  it('lista o intervalo com as duas pontas', () => {
    expect(competenciasEntre('2026-11', '2027-02')).toEqual(['2026-11', '2026-12', '2027-01', '2027-02']);
    expect(competenciasEntre('2026-05', '2026-05')).toEqual(['2026-05']);
    expect(competenciasEntre('2026-05', '2026-01')).toEqual([]);
  });

  it('rotula em português', () => {
    expect(rotuloDaCompetencia('2026-09')).toBe('Setembro/2026');
    expect(rotuloDaCompetencia('2026-03')).toBe('Março/2026');
  });

  it('a competência de hoje sai da data injetada', () => {
    expect(competenciaDeHoje(new Date(2026, 8, 21))).toBe('2026-09');
    expect(montarCompetencia(2026, 1)).toBe('2026-01');
  });
});

describe('Variação', () => {
  it('calcula a diferença percentual', () => {
    expect(variacao(45.1, 42.8)).toBeCloseTo(5.4, 1);
    expect(variacao(90, 100)).toBe(-10);
  });

  it('sem base de comparação devolve null, e não +100%', () => {
    expect(variacao(50, 0)).toBeNull();
    expect(variacao(50, null)).toBeNull();
    expect(variacao(null, 50)).toBeNull();
  });
});

// ── O leitor da planilha ───────────────────────────────────────────────────

const CAB = ['Caixa', 'Dt. Abertura', 'Modalidade', 'Nr. Nota', 'Série', 'Chave Acesso', 'Dt. Emis.', 'Status', 'CPF/CNPJ', 'Tp.Emis.', 'Vr. Venda', 'Vr.Acrés.', 'Vr. Desc.', 'Vr. Gorj.', 'Observação'];
const cupom = (venda: number, desc = 0, status = 'Aceita', dia = '01/08/2026') =>
  ['001', `${dia} 06:11:12`, 'Comanda', '000025456', '001', ' 3126080533608200105465001000025456152519 ', `${dia} 11:42:33`, status, null, 'NFC-e', venda, 0, desc, 0, '100 - Autorizado'];

describe('Leitura da Relação de Cupons', () => {
  it('soma os cupons — a planilha não traz total nenhum', () => {
    const r = lerPlanilhaDeCupons([CAB, cupom(100, 10), cupom(50), cupom(25.5, 0.5)]);
    expect(r.ok).toBe(true);
    expect(r.coupons).toBe(3);
    expect(r.grossSales).toBe(175.5);
    expect(r.discounts).toBe(10.5);
    expect(receita(r)).toBe(165);
  });

  it('CUPOM CANCELADO não entra — e é contado à parte', () => {
    /* No arquivo real de agosto eram 8 cancelados, R$ 728,15. Somá-los
       inflaria receita e ticket com venda que não aconteceu. */
    const r = lerPlanilhaDeCupons([CAB, cupom(100), cupom(900, 0, 'Cancelada')]);
    expect(r.coupons).toBe(1);
    expect(r.grossSales).toBe(100);
    expect(r.descartados).toEqual([{ status: 'Cancelada', quantidade: 1, venda: 900 }]);
  });

  it('linhas "Total (…)" do relatório são ignoradas', () => {
    /* Elas vêm com as colunas de valor vazias; somá-las não mudaria o total,
       mas contá-las como cupom estragaria o ticket. */
    const r = lerPlanilhaDeCupons([
      CAB, cupom(100), ['Total (Data:01/08/2026)', null, null, null, null, null, null, null, null, null, null],
      cupom(200), ['Total (Unidade:0002 - CHURRASCARIA BF TERESOPOLIS Periodo:01/08/2026 a 31/08/2026)'],
      ['Total'],
    ]);
    expect(r.coupons).toBe(2);
    expect(r.grossSales).toBe(300);
    expect(r.rodape).toContain('CHURRASCARIA BF TERESOPOLIS');
  });

  it('acha o cabeçalho mesmo com linhas de título acima', () => {
    const r = lerPlanilhaDeCupons([['Relação de Cupons SAT/NFC-e'], ['Emitido em 01/09/2026'], [], CAB, cupom(80, 5)]);
    expect(r.ok).toBe(true);
    expect(r.coupons).toBe(1);
    expect(receita(r)).toBe(75);
  });

  it('descobre a competência pelas datas de emissão', () => {
    const r = lerPlanilhaDeCupons([CAB, cupom(10, 0, 'Aceita', '03/08/2026'), cupom(10, 0, 'Aceita', '31/08/2026')]);
    expect(r.competenciaDoArquivo).toBe('2026-08');
    expect(r.foraDaCompetencia).toBe(0);
  });

  it('cupom da virada do dia conta, mas é avisado', () => {
    const linhas = [CAB, ...Array.from({ length: 20 }, () => cupom(10, 0, 'Aceita', '15/08/2026')), cupom(10, 0, 'Aceita', '01/09/2026')];
    const r = lerPlanilhaDeCupons(linhas);
    expect(r.competenciaDoArquivo).toBe('2026-08');
    expect(r.coupons).toBe(21);
    expect(r.foraDaCompetencia).toBe(1);
    expect(r.avisos.join(' ')).toContain('fora de');
  });

  it('recusa quando não acha a coluna de venda', () => {
    const r = lerPlanilhaDeCupons([['Caixa', 'Modalidade'], ['001', 'Comanda']]);
    expect(r.ok).toBe(false);
    expect(r.erro).toContain('Vr. Venda');
  });

  it('recusa quando falta a coluna de desconto — não assume zero', () => {
    /* Assumir zero inventaria faturamento: a receita sairia igual à venda. */
    const r = lerPlanilhaDeCupons([['Vr. Venda'], [100]]);
    expect(r.ok).toBe(false);
    expect(r.erro).toContain('Vr. Desc.');
  });

  it('recusa planilha sem nenhum cupom válido, dizendo o porquê', () => {
    const r = lerPlanilhaDeCupons([CAB, cupom(100, 0, 'Cancelada')]);
    expect(r.ok).toBe(false);
    expect(r.erro).toContain('Cancelada');
  });

  it('avisa sobre acréscimo e gorjeta, que NÃO entram na receita', () => {
    const l = cupom(100, 0);
    l[11] = 15; // acréscimo
    l[13] = 7;  // gorjeta
    const r = lerPlanilhaDeCupons([CAB, l]);
    expect(r.grossSales).toBe(100);
    expect(receita(r)).toBe(100);
    expect(r.avisos.join(' ')).toContain('acréscimo');
    expect(r.avisos.join(' ')).toContain('gorjeta');
  });

  it('sem coluna de status, soma tudo e avisa', () => {
    const r = lerPlanilhaDeCupons([['Vr. Venda', 'Vr. Desc.'], [100, 10], [50, 0]]);
    expect(r.ok).toBe(true);
    expect(r.coupons).toBe(2);
    expect(r.avisos.join(' ')).toContain('Status');
  });
});

describe('Números e datas de célula', () => {
  it('aceita número puro e texto em pt-BR', () => {
    expect(numeroDaCelula(1234.56)).toBe(1234.56);
    expect(numeroDaCelula('1.234,56')).toBe(1234.56);
    expect(numeroDaCelula('R$ 1.234,56')).toBe(1234.56);
    expect(numeroDaCelula('0')).toBe(0);
  });

  it('texto que não é número devolve null — nunca zero', () => {
    /* Virar zero numa soma encolheria a venda do mês sem erro nenhum. */
    expect(numeroDaCelula('Total')).toBeNull();
    expect(numeroDaCelula('')).toBeNull();
    expect(numeroDaCelula(null)).toBeNull();
    expect(numeroDaCelula(undefined)).toBeNull();
  });

  it('lê a competência de dd/mm/aaaa e de Date', () => {
    expect(competenciaDaData('01/08/2026 11:42:33')).toBe('2026-08');
    expect(competenciaDaData(new Date(2026, 7, 15))).toBe('2026-08');
    expect(competenciaDaData('sem data')).toBeNull();
  });
});
