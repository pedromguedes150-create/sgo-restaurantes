/**
 * REGRA CENTRAL DE ATRIBUIÇÃO — pura, sem banco.
 *
 *   treinamentos aplicáveis ao colaborador =
 *       POPs GERAIS da unidade
 *     + POPs da FUNÇÃO (cargo) dele
 *     + POPs em que ele foi VINCULADO individualmente
 *     (+ POPs do SETOR do Mapa de Funções — a regra anterior, mantida)
 *
 * Uma pessoa pode cair no mesmo POP por mais de um caminho (função E vínculo
 * individual). O resultado é UM item por POP: o Map elimina a duplicidade por
 * construção, e a ORIGEM registrada é a de maior precedência — a função vence o
 * vínculo individual porque é a distribuição principal; o vínculo é exceção.
 *
 * "Cada funcionário é medido só pelos treinamentos que realmente deveria
 * realizar": esta função é a definição de "deveria". A reconciliação a usa
 * para criar/remover pendências e o painel lê o que ela materializou — os dois
 * lados nunca discordam porque só existe uma regra.
 */

export type OrigemTreinamento = 'GENERAL' | 'JOB_TITLE' | 'SECTOR' | 'INDIVIDUAL';

export interface PopParaAplicar {
  id: string;
  /** Geral/inicial: toda a unidade, independe da função. */
  isInitial: boolean;
  /** Funções (cargos) alvo, como cadastradas no POP. */
  jobTitles: string[];
  /** Setores do Mapa de Funções (regra anterior). */
  sectorNames: string[];
  /** Colaboradores adicionais (vínculo individual). */
  collaboratorIds: string[];
}

export interface ColaboradorParaAplicar {
  id: string;
  jobTitle: string | null;
  /** Setores em que está alocado no Mapa de Funções da unidade. */
  sectorNames: string[];
}

export interface Atribuicao {
  origem: OrigemTreinamento;
  /** Setor que casou (só quando a origem é SECTOR). */
  sectorName: string | null;
}

/**
 * Casamento de função é por NOME, e o nome vem do RH ("Auxiliar de Cozinha",
 * "AUXILIAR DE COZINHA", "Auxiliar de cozinha " são a mesma função). Normaliza
 * caixa, acentos e espaços — sem isso o mesmo cargo grafado de dois jeitos
 * viraria duas funções e metade da equipe ficaria sem o treinamento, calada.
 */
export function normalizarFuncao(s: string | null | undefined): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export const ORIGEM_LABEL: Record<OrigemTreinamento, string> = {
  GENERAL: 'Geral',
  JOB_TITLE: 'Função',
  SECTOR: 'Setor',
  INDIVIDUAL: 'Vínculo individual',
};

/** Por que (e se) este POP se aplica a este colaborador. `null` = não se aplica. */
export function origemDoTreinamento(colab: ColaboradorParaAplicar, pop: PopParaAplicar): Atribuicao | null {
  if (pop.isInitial) return { origem: 'GENERAL', sectorName: null };

  const funcao = normalizarFuncao(colab.jobTitle);
  if (funcao && pop.jobTitles.some((j) => normalizarFuncao(j) === funcao)) {
    return { origem: 'JOB_TITLE', sectorName: null };
  }

  const setores = new Set(colab.sectorNames);
  const setor = pop.sectorNames.find((s) => setores.has(s));
  if (setor) return { origem: 'SECTOR', sectorName: setor };

  if (pop.collaboratorIds.includes(colab.id)) return { origem: 'INDIVIDUAL', sectorName: null };

  return null;
}

/** Todos os POPs aplicáveis ao colaborador — um por POP, sem duplicidade. */
export function treinamentosAplicaveis(colab: ColaboradorParaAplicar, pops: PopParaAplicar[]): Map<string, Atribuicao> {
  const out = new Map<string, Atribuicao>();
  for (const pop of pops) {
    const a = origemDoTreinamento(colab, pop);
    if (a) out.set(pop.id, a);
  }
  return out;
}

/** Um POP gera treinamento quando tem QUALQUER público; sem público é só referência. */
export function geraTreinamento(pop: PopParaAplicar): boolean {
  return pop.isInitial || pop.jobTitles.length > 0 || pop.sectorNames.length > 0 || pop.collaboratorIds.length > 0;
}
