/**
 * O ARQUIVO DA ADMINISTRADORA.
 *
 * O formato saiu do arquivo real (`mobilidade_2026-09.xlsx`), e não do que
 * seria natural inventar: doze colunas, nesta ordem, com particularidades que
 * só aparecem olhando o arquivo.
 *
 *  - **`Unidade` vem VAZIA**, ao lado de `Unidade Trabalho` preenchida. As duas
 *    existem no arquivo aceito hoje; preencher a segunda por conta própria
 *    mudaria um formato que já funciona.
 *  - **`Status` é "entregue"**, minúsculo, e só faz sentido quando há data de
 *    entrega. Sem data, sai vazio — carimbar "entregue" sem entrega registrada
 *    seria o sistema afirmando um fato que ninguém verificou.
 *  - **`No Prazo`** depende de um prazo acordado, que o SGO não tem. Fica vazio
 *    em vez de "Sim": responder "Sim" sem ter contra o quê comparar é pior que
 *    não responder, porque parece conferido.
 *
 * Puro: sem Prisma e sem SheetJS. A montagem da linha é onde as regras moram, e
 * separá-la do arquivo é o que permite prová-las sem abrir um .xlsx.
 */

/** Dias de admissão dentro dos quais o colaborador conta como novato. */
export const DIAS_PARA_NOVATO = 90;

export interface LancamentoParaExportar {
  /** Sequencial da exportação, como o `ID` do arquivo da administradora. */
  id: number;
  colaborador: string;
  /** Só dígitos, como vem do RH. A máscara é aplicada na saída. */
  cpf: string | null;
  unidadeTrabalho: string;
  valor: number;
  /** 'AAAA-MM' */
  competencia: string;
  /** 'AAAA-MM-DD' da entrega daquela unidade, quando registrada. */
  entregaEm: string | null;
  /** 'AAAA-MM-DD' de admissão, do RH. */
  admissaoEm: string | null;
  lancadoEm: Date;
}

export const COLUNAS = [
  'ID', 'Colaborador', 'CPF', 'Unidade Trabalho', 'Unidade', 'Valor',
  'Competência', 'Status', 'No Prazo', 'Data Entrega', 'Data Cadastro', 'Novato',
] as const;

/** '05336082000163' → '053.360.820-01'. Sem 11 dígitos, devolve o que veio. */
export function formatarCpf(cpf: string | null | undefined): string {
  const d = String(cpf ?? '').replace(/\D/g, '');
  if (d.length !== 11) return d;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

/** Último dia da competência 'AAAA-MM'. */
export function fimDaCompetencia(competencia: string): string | null {
  if (!/^\d{4}-\d{2}$/.test(competencia)) return null;
  const [y, m] = competencia.split('-').map(Number);
  /* Dia 0 do mês seguinte = último dia deste. */
  const d = new Date(Date.UTC(y, m, 0));
  return d.toISOString().slice(0, 10);
}

/**
 * O colaborador era novato NESTA competência?
 *
 * ⚠️ A referência é o FIM DA COMPETÊNCIA, e nunca "hoje". Contra hoje, o
 * arquivo de janeiro diria uma coisa em fevereiro e outra em junho — a mesma
 * exportação, reemitida, mudaria de conteúdo. Um arquivo que a administradora
 * já recebeu não pode mudar de resposta depois.
 *
 * `null` quando não há data de admissão: o RH é a fonte, e inventar "Não"
 * afirmaria que a pessoa é antiga sem ninguém saber.
 */
export function ehNovato(admissaoEm: string | null | undefined, competencia: string, dias = DIAS_PARA_NOVATO): boolean | null {
  if (!admissaoEm || !/^\d{4}-\d{2}-\d{2}$/.test(admissaoEm)) return null;
  const fim = fimDaCompetencia(competencia);
  if (!fim) return null;
  const decorridos = Math.round((Date.parse(`${fim}T00:00:00Z`) - Date.parse(`${admissaoEm}T00:00:00Z`)) / 86400000);
  /* Admissão POSTERIOR ao fim da competência é dado inconsistente (lançamento
     de alguém que ainda não tinha entrado). Novato, e não `null`: a pessoa é
     claramente recente, e o arquivo não é lugar de discutir a inconsistência. */
  if (decorridos < 0) return true;
  return decorridos <= dias;
}

/** 'AAAA-MM-DD' → 'DD/MM/AAAA'. Vazio continua vazio. */
export function dataBr(iso: string | null | undefined): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

/** Data e hora de cadastro, no formato do arquivo: '26/08/2026, 13:17:23'. */
export function dataHoraBr(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}, ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export type LinhaDoArquivo = (string | number)[];

/** Uma linha do arquivo, na ordem exata de `COLUNAS`. */
export function montarLinha(l: LancamentoParaExportar, dias = DIAS_PARA_NOVATO): LinhaDoArquivo {
  const novato = ehNovato(l.admissaoEm, l.competencia, dias);
  return [
    l.id,
    l.colaborador,
    formatarCpf(l.cpf),
    l.unidadeTrabalho,
    /* `Unidade` vazia de propósito — é assim no arquivo que a administradora
       aceita hoje, ao lado de `Unidade Trabalho` preenchida. */
    '',
    l.valor,
    l.competencia,
    l.entregaEm ? 'entregue' : '',
    /* `No Prazo` vazio: exigiria um prazo acordado, que o SGO não tem. */
    '',
    dataBr(l.entregaEm),
    dataHoraBr(l.lancadoEm),
    novato === null ? '' : novato ? 'Sim' : 'Não',
  ];
}

/** O arquivo inteiro: cabeçalho + linhas. */
export function montarPlanilha(lancamentos: LancamentoParaExportar[], dias = DIAS_PARA_NOVATO): LinhaDoArquivo[] {
  return [[...COLUNAS], ...lancamentos.map((l) => montarLinha(l, dias))];
}
