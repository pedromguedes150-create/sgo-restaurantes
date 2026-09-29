/**
 * Normalização das respostas do RH (GBF RH) → modelos do SGO.
 * Formatos confirmados em 2026-06-11 via /api/rh/test.
 * Envelope padrão: { data: T }.
 */

export interface RhEnvelope<T> {
  data: T;
}

/** /api/ext/colaboradores e /escala/:unidade e /unidade/:unidade */
export interface RhColaborador {
  matricula: string;
  nome: string;
  cpf: string | null;
  status: string; // "Ativo" | ...
  unidade: string; // razão social
  cargo: string | null;
  admissao: string | null; // 'YYYY-MM-DD'
}

/** /api/ext/colaboradores/unidades → { data: string[] } (razões sociais) */
export function unwrapUnidades(resp: unknown): string[] {
  const d = (resp as RhEnvelope<unknown>)?.data;
  return Array.isArray(d) ? (d as string[]) : [];
}

/** O RH respondeu 200, mas num formato que não sabemos ler. */
export class RhFormatoInesperadoError extends Error {
  constructor(amostra: string) {
    super(`Resposta do RH em formato inesperado (esperado { data: [...] }): ${amostra}`);
    this.name = 'RhFormatoInesperadoError';
  }
}

/**
 * Lista de colaboradores do envelope `{ data: [...] }`.
 *
 * **Formato irreconhecível LANÇA, não devolve lista vazia.** Devolver `[]` aqui
 * era o mais perigoso: quem chama não tem como distinguir "esta unidade não tem
 * ninguém" de "o RH mudou o envelope e eu não entendi nada". O sync usa a lista
 * para decidir quem inativar — então uma mudança de formato no lado do RH
 * apagaria a unidade inteira, calada. Erro para o sync abortar a unidade.
 */
export function unwrapColaboradores(resp: unknown): RhColaborador[] {
  const d = (resp as RhEnvelope<unknown>)?.data;
  if (Array.isArray(d)) return d as RhColaborador[];
  const amostra = JSON.stringify(resp ?? null)?.slice(0, 200) ?? 'null';
  throw new RhFormatoInesperadoError(amostra);
}

/** Como o SGO entende o status que veio do RH. */
export type ClasseDeStatus = 'ATIVO' | 'DESLIGADO' | 'DESCONHECIDO';

/** Sem acento, sem caixa, sem espaço sobrando — "1ª Experiência" e "1a experiencia" viram o mesmo. */
function normalizarStatus(status: string | null | undefined): string {
  return (status ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

/**
 * Status que significam **não trabalha mais aqui**. Lista fechada, de propósito.
 *
 * A pergunta "quem está desligado?" tem resposta curta e conhecida; "quem está
 * trabalhando?" tem um vocabulário aberto que o RH pode ampliar a qualquer
 * momento (foi assim que "1ª Experiência" apareceu). Por isso a lista fechada
 * fica do lado do desligamento.
 */
const DESLIGADO = /^(demit|deslig|resci|encerr|inativ|cancelad|baixad)/;

/** Status conhecidos que significam **trabalhando**. */
const ATIVO = /^(ativ|experienc|\d+\s*a?\s*experienc|contrat|trabalh|efetiv|admitid)/;

/**
 * Classifica o status do colaborador no RH.
 *
 * **O caso real (14/09).** A regra antiga era `startsWith('ativ')`: qualquer
 * outra coisa virava INATIVO, e inativo some de Pessoas, da Escala e do Mapa.
 * O RH de Jardim Teresópolis devolve **"1ª Experiência"** e **"2ª Experiência"**
 * para quem está no período de experiência — gente trabalhando, escalada, no
 * salão — e **8 pessoas sumiram do sistema** sem erro em lugar nenhum. Foi o
 * "não está com todos os colaboradores" que o Alan relatou.
 *
 * **Desconhecido conta como presente**, e é a escolha consciente aqui: uma
 * pessoa que aparece a mais é visível e alguém corrige; uma pessoa que some é
 * invisível, e ninguém procura o que não sabe que falta. O diagnóstico marca o
 * status desconhecido para o vocabulário ser revisto — não para escondê-la.
 */
export function classificarStatus(status: string | null | undefined): ClasseDeStatus {
  const s = normalizarStatus(status);
  if (!s) return 'DESCONHECIDO';
  if (DESLIGADO.test(s)) return 'DESLIGADO';
  if (ATIVO.test(s)) return 'ATIVO';
  /* "3ª Experiência", "Contrato de Experiência", o que o RH inventar: se contém
     "experienc" em qualquer posição, é alguém trabalhando. */
  if (s.includes('experienc')) return 'ATIVO';
  return 'DESCONHECIDO';
}

/** A pessoa aparece no SGO? Só não aparece quem está claramente desligado. */
export function isAtivo(status: string | null | undefined): boolean {
  return classificarStatus(status) !== 'DESLIGADO';
}
