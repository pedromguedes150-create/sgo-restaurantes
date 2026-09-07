/**
 * O vocabulário da Escala de gerentes — o que a TELA precisa saber.
 *
 * Separado de `manager-schedule-central.ts` de propósito: aquele arquivo fala
 * com o banco e com as notificações (e portanto com `web-push`, que usa `net` e
 * `tls` do Node). Quando o componente cliente importava as siglas de lá, o
 * webpack arrastava o módulo inteiro para o bundle do navegador e o build de
 * produção quebrava em "Can't resolve 'net'" — coisa que o `tsc` e os testes não
 * enxergam, só o `next build`.
 *
 * Regra deste arquivo: **nenhum import**. Só tipo e constante de texto.
 */

/** O que uma célula da grade diz sobre o dia daquele gerente. */
export type CelulaDoGerente = 'TRABALHA' | 'FOLGA' | 'FERIAS' | 'FORA_DO_PADRAO' | 'SEM_HORARIO';

export const CELULA_SIGLA: Record<CelulaDoGerente, string> = {
  TRABALHA: 'T',
  FOLGA: 'F',
  FERIAS: 'FE',
  FORA_DO_PADRAO: '·',
  SEM_HORARIO: '?',
};

export const CELULA_TITULO: Record<CelulaDoGerente, string> = {
  TRABALHA: 'Trabalha',
  FOLGA: 'Folga lançada',
  FERIAS: 'Férias',
  FORA_DO_PADRAO: 'Fora do padrão semanal — não é dia de trabalho dele',
  SEM_HORARIO: 'Sem horário cadastrado — o sistema não sabe se ele trabalha',
};

export interface LancamentoDeGerente {
  id: string;
  userId: string;
  managerName: string;
  kind: 'FOLGA' | 'FERIAS';
  startDate: string;
  endDate: string;
  note: string | null;
  /** Nome de quem lançou. Nulo nos lançamentos antigos, feitos pelo próprio dono. */
  lancadoPor: string | null;
}

export interface LinhaDaGrade {
  userId: string;
  name: string;
  temHorario: boolean;
  weekdays: number[];
  startTime: string | null;
  endTime: string | null;
  note: string | null;
  /** Uma célula por dia do mês, na ordem (índice 0 = dia 1). */
  dias: CelulaDoGerente[];
  diasTrabalhados: number;
  diasDeFolga: number;
  diasDeFerias: number;
}

export interface DiaDaGrade {
  day: number;
  weekday: number;
  iso: string;
  /** Nenhum gerente com horário cadastrado trabalha neste dia. */
  semGerente: boolean;
}

export interface GradeDeGerentes {
  unitId: string;
  unitName: string;
  year: number;
  month: number;
  dias: DiaDaGrade[];
  linhas: LinhaDaGrade[];
  lancamentos: LancamentoDeGerente[];
  diasSemGerente: number;
  semHorarioCount: number;
}
