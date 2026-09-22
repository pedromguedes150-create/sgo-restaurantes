import { describe, it, expect } from 'vitest';
import {
  COLUNAS, DIAS_PARA_NOVATO, dataBr, dataHoraBr, ehNovato, fimDaCompetencia,
  formatarCpf, montarLinha, montarPlanilha, type LancamentoParaExportar,
} from '@/lib/people/payouts-export';

/**
 * O ARQUIVO DA ADMINISTRADORA.
 *
 * O formato saiu do arquivo REAL (`mobilidade_2026-09.xlsx`), não do que seria
 * natural inventar. O que se prova aqui é a fidelidade a ele e — o mais
 * importante — que uma exportação já enviada não muda de resposta se for
 * reemitida meses depois.
 */

const base: LancamentoParaExportar = {
  id: 3351,
  colaborador: 'JOSIMAR CAMPOS DE PAULA',
  cpf: '09494305604',
  unidadeTrabalho: 'Beija Flor Centro',
  valor: 150,
  competencia: '2026-09',
  entregaEm: '2026-08-26',
  admissaoEm: '2020-01-10',
  lancadoEm: new Date(2026, 7, 26, 13, 17, 23),
};

describe('As doze colunas, na ordem do arquivo', () => {
  it('o cabeçalho é o do arquivo real', () => {
    expect([...COLUNAS]).toEqual([
      'ID', 'Colaborador', 'CPF', 'Unidade Trabalho', 'Unidade', 'Valor',
      'Competência', 'Status', 'No Prazo', 'Data Entrega', 'Data Cadastro', 'Novato',
    ]);
  });

  it('a linha reproduz o formato do arquivo', () => {
    expect(montarLinha(base)).toEqual([
      3351, 'JOSIMAR CAMPOS DE PAULA', '094.943.056-04', 'Beija Flor Centro', '',
      150, '2026-09', 'entregue', '', '26/08/2026', '26/08/2026, 13:17:23', 'Não',
    ]);
  });

  it('a coluna "Unidade" sai VAZIA, ao lado de "Unidade Trabalho"', () => {
    /* É assim no arquivo que a administradora aceita hoje. Preencher por conta
       própria mudaria um formato que já funciona. */
    const linha = montarLinha(base);
    expect(linha[3]).toBe('Beija Flor Centro');
    expect(linha[4]).toBe('');
  });

  it('a planilha traz cabeçalho e uma linha por lançamento', () => {
    const p = montarPlanilha([base, { ...base, id: 3352 }]);
    expect(p).toHaveLength(3);
    expect(p[0][0]).toBe('ID');
  });
});

describe('O que o SGO NÃO sabe fica vazio', () => {
  it('"No Prazo" sempre vazio — não há prazo acordado para comparar', () => {
    /* "Sim" sem ter contra o quê comparar é pior que vazio: parece conferido. */
    expect(montarLinha(base)[8]).toBe('');
  });

  it('sem data de entrega, o status NÃO vira "entregue"', () => {
    /* Carimbar "entregue" sem entrega registrada seria o sistema afirmando um
       fato que ninguém verificou. */
    const linha = montarLinha({ ...base, entregaEm: null });
    expect(linha[7]).toBe('');
    expect(linha[9]).toBe('');
  });

  it('sem data de admissão, "Novato" fica vazio em vez de "Não"', () => {
    /* O RH é a fonte. "Não" afirmaria que a pessoa é antiga sem ninguém saber. */
    expect(montarLinha({ ...base, admissaoEm: null })[11]).toBe('');
  });
});

describe('Novato conta contra a COMPETÊNCIA, nunca contra hoje', () => {
  it('90 dias é o corte', () => {
    expect(DIAS_PARA_NOVATO).toBe(90);
    /* Fim de setembro/2026 é 30/09. Admitido em 02/07 → 90 dias exatos. */
    expect(ehNovato('2026-07-02', '2026-09')).toBe(true);
    expect(ehNovato('2026-07-01', '2026-09')).toBe(false);
  });

  it('a MESMA exportação reemitida meses depois diz a mesma coisa', () => {
    /* A propriedade que a âncora existe para garantir. Contra "hoje", o arquivo
       de janeiro diria uma coisa em fevereiro e outra em junho — e um arquivo
       que a administradora já recebeu não pode mudar de resposta. */
    const jan = ehNovato('2026-01-05', '2026-01');
    expect(jan).toBe(true);
    /* A conta não olha o relógio: o resultado é função de admissão + mês. */
    expect(ehNovato('2026-01-05', '2026-01')).toBe(jan);
    /* E o mesmo colaborador, meses depois, deixa de ser novato — porque a
       COMPETÊNCIA mudou, não porque o tempo passou. */
    expect(ehNovato('2026-01-05', '2026-06')).toBe(false);
  });

  it('admitido depois do fim da competência conta como novato', () => {
    /* Dado inconsistente (lançamento de quem ainda não entrou). A pessoa é
       claramente recente, e o arquivo da administradora não é o lugar de
       discutir a inconsistência. */
    expect(ehNovato('2026-10-15', '2026-09')).toBe(true);
  });

  it('data ou competência inválida devolve null, e não um chute', () => {
    expect(ehNovato('10/01/2020', '2026-09')).toBeNull();
    expect(ehNovato('2026-01-05', 'setembro')).toBeNull();
    expect(ehNovato(null, '2026-09')).toBeNull();
  });

  it('o corte é ajustável sem tocar na regra', () => {
    /* Referência: 30/09/2026 (fim da competência). Com corte de 30 dias, entra
       quem foi admitido a partir de 31/08. */
    expect(ehNovato('2026-09-05', '2026-09', 30)).toBe(true);
    expect(ehNovato('2026-08-15', '2026-09', 30)).toBe(false);
    /* E o mesmo 15/08 continua novato no corte de 90 dias. */
    expect(ehNovato('2026-08-15', '2026-09', 90)).toBe(true);
  });
});

describe('Fim da competência', () => {
  it('pega o último dia, inclusive em fevereiro bissexto', () => {
    expect(fimDaCompetencia('2026-09')).toBe('2026-09-30');
    expect(fimDaCompetencia('2026-02')).toBe('2026-02-28');
    expect(fimDaCompetencia('2028-02')).toBe('2028-02-29');
    expect(fimDaCompetencia('2026-12')).toBe('2026-12-31');
  });

  it('competência malformada devolve null', () => {
    expect(fimDaCompetencia('2026-9')).toBeNull();
    expect(fimDaCompetencia('')).toBeNull();
  });
});

describe('Formatação', () => {
  it('o CPF sai mascarado, como no arquivo', () => {
    expect(formatarCpf('09494305604')).toBe('094.943.056-04');
    expect(formatarCpf('094.943.056-04')).toBe('094.943.056-04');
  });

  it('CPF incompleto sai como veio, sem máscara mentirosa', () => {
    /* Mascarar 9 dígitos produziria um CPF com cara de válido. */
    expect(formatarCpf('123456789')).toBe('123456789');
    expect(formatarCpf(null)).toBe('');
  });

  it('datas em pt-BR, e vazio continua vazio', () => {
    expect(dataBr('2026-08-26')).toBe('26/08/2026');
    expect(dataBr(null)).toBe('');
    expect(dataBr('')).toBe('');
  });

  it('a data de cadastro leva hora, como no arquivo', () => {
    expect(dataHoraBr(new Date(2026, 7, 26, 13, 17, 23))).toBe('26/08/2026, 13:17:23');
    expect(dataHoraBr(new Date(2026, 0, 5, 9, 4, 5))).toBe('05/01/2026, 09:04:05');
  });
});
