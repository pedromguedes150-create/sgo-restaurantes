import { normalizarFuncao } from '@/lib/treinamentos/aplicabilidade';

/**
 * AVALIAÇÃO POR FUNÇÃO — regras PURAS (v1.161.0).
 *
 * Oito critérios por colaborador: 4 GERAIS (iguais para todos, 40%) e 4
 * ESPECÍFICOS da função (60%). Nota = média PONDERADA (1,00–5,00); N/A com
 * justificativa tira o critério e redistribui o peso proporcionalmente entre
 * os demais; notas 1 e 2 exigem justificativa. Nada aqui lê banco — a tela, a
 * rota e o painel chamam as mesmas funções.
 */

export type GrupoCriterio = 'GERAL' | 'ESPECIFICO';
export interface Criterio { key: string; label: string; group: GrupoCriterio; weight: number }
export interface Resposta { key: string; score: number | null; justification?: string | null }
/** O que fica gravado na avaliação: o critério congelado + a resposta. */
export interface RespostaGravada extends Criterio { score: number | null; justification: string | null }

export const PESO_GERAIS = 40;
export const PESO_ESPECIFICOS = 60;
/** Pesos dos específicos no modelo padrão (somam 60). O Admin pode mudar, desde que somem 60. */
export const PESOS_ESPECIFICOS_PADRAO = [20, 15, 15, 10] as const;

export const CRITERIOS_GERAIS: readonly Criterio[] = [
  { key: 'pontualidade', label: 'Pontualidade e assiduidade', group: 'GERAL', weight: 10 },
  { key: 'disciplina', label: 'Disciplina e cumprimento de normas', group: 'GERAL', weight: 10 },
  { key: 'equipe', label: 'Trabalho em equipe', group: 'GERAL', weight: 10 },
  { key: 'organizacao', label: 'Organização, higiene e apresentação', group: 'GERAL', weight: 10 },
];

export const ROTULO_NOTA: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: 'Muito abaixo do esperado',
  2: 'Abaixo do esperado',
  3: 'Atende parcialmente',
  4: 'Atende às expectativas',
  5: 'Supera as expectativas',
};

export type Classificacao = 'EXCELENTE' | 'BOM' | 'REGULAR' | 'MELHORAR';
export const ROTULO_CLASSIFICACAO: Record<Classificacao, string> = {
  EXCELENTE: 'Excelente', BOM: 'Bom', REGULAR: 'Regular', MELHORAR: 'Necessita melhorar',
};
/** Faixas da nota final (inclusivas no piso): 4,50 Excelente · 3,50 Bom · 2,50 Regular · abaixo, Necessita melhorar. */
export function classificar(nota: number): Classificacao {
  if (nota >= 4.5) return 'EXCELENTE';
  if (nota >= 3.5) return 'BOM';
  if (nota >= 2.5) return 'REGULAR';
  return 'MELHORAR';
}
/** Nota que pede plano de desenvolvimento (baixo desempenho). */
export const NOTA_BAIXA = 2.5;

/** Chave estável a partir do rótulo (sem acento, minúscula, hífens). */
export function chaveDoCriterio(label: string): string {
  return normalizarFuncao(label).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'criterio';
}

/**
 * Monta os 8 critérios de um modelo: os gerais fixos + os específicos informados.
 * Recusa (mensagem em PT-BR) quando não são exatamente 4 específicos, rótulo
 * vazio/repetido, ou pesos que não somam 60 — a nota deixaria de ser 0–100%.
 */
export function montarCriterios(especificos: { label: string; weight: number; key?: string }[]): { ok: true; criterios: Criterio[] } | { ok: false; erro: string } {
  if (especificos.length !== 4) return { ok: false, erro: 'Informe exatamente 4 critérios específicos.' };
  const vistos = new Set<string>(CRITERIOS_GERAIS.map((c) => c.key));
  const out: Criterio[] = [...CRITERIOS_GERAIS];
  let soma = 0;
  for (const e of especificos) {
    const label = (e.label ?? '').trim();
    if (!label || label.length > 80) return { ok: false, erro: 'Cada critério específico precisa de um nome (até 80 letras).' };
    const weight = Number(e.weight);
    if (!Number.isInteger(weight) || weight < 1 || weight > 59) return { ok: false, erro: `Peso inválido em "${label}": use números inteiros entre 1 e 59.` };
    let key = e.key?.trim() || chaveDoCriterio(label);
    let n = 2;
    while (vistos.has(key)) key = `${chaveDoCriterio(label)}-${n++}`;
    vistos.add(key);
    out.push({ key, label, group: 'ESPECIFICO', weight });
    soma += weight;
  }
  if (soma !== PESO_ESPECIFICOS) return { ok: false, erro: `Os pesos dos critérios específicos somam ${soma}%; precisam somar ${PESO_ESPECIFICOS}%.` };
  return { ok: true, criterios: out };
}

/** Os critérios como foram gravados numa versão (JSON do banco), já conferidos. */
export function lerCriterios(json: unknown): Criterio[] {
  if (!Array.isArray(json)) return [];
  return json
    .filter((c): c is Criterio => !!c && typeof c === 'object' && typeof (c as Criterio).key === 'string' && typeof (c as Criterio).label === 'string' && typeof (c as Criterio).weight === 'number')
    .map((c) => ({ key: c.key, label: c.label, group: c.group === 'GERAL' ? 'GERAL' : 'ESPECIFICO', weight: c.weight }));
}

/** JSON canônico dos critérios, para saber se uma edição muda a versão. */
export function assinaturaDosCriterios(cs: readonly Criterio[]): string {
  return JSON.stringify(cs.map((c) => [c.key, c.label, c.group, c.weight]));
}

/**
 * Nota final = Σ(nota × peso) ÷ Σ(pesos dos critérios respondidos). Com N/A o
 * peso dele sai do denominador — é a redistribuição proporcional. Tudo N/A →
 * sem nota (null). Arredonda a 2 casas.
 */
export function calcularNota(criterios: readonly Criterio[], respostas: readonly Resposta[]): { nota: number | null; pesoAplicado: number; classificacao: Classificacao | null } {
  const porChave = new Map(respostas.map((r) => [r.key, r]));
  let soma = 0; let peso = 0;
  for (const c of criterios) {
    const r = porChave.get(c.key);
    if (!r || r.score == null) continue;
    soma += r.score * c.weight;
    peso += c.weight;
  }
  if (peso === 0) return { nota: null, pesoAplicado: 0, classificacao: null };
  const nota = Math.round((soma / peso) * 100) / 100;
  return { nota, pesoAplicado: peso, classificacao: classificar(nota) };
}

/** Pesos efetivos depois do N/A (para mostrar "este critério passou a valer X%"). */
export function pesosEfetivos(criterios: readonly Criterio[], respostas: readonly Resposta[]): Record<string, number> {
  const porChave = new Map(respostas.map((r) => [r.key, r]));
  const aplicados = criterios.filter((c) => porChave.get(c.key)?.score != null);
  const total = aplicados.reduce((s, c) => s + c.weight, 0);
  const out: Record<string, number> = {};
  for (const c of criterios) out[c.key] = total && porChave.get(c.key)?.score != null ? Math.round((c.weight / total) * 1000) / 10 : 0;
  return out;
}

/**
 * Confere as respostas contra os critérios do modelo. Toda falha é nomeada
 * (a tela mostra a lista). O que sai (`gravar`) é o retrato: critério + nota +
 * justificativa, pronto para ir ao banco.
 */
export function validarRespostas(criterios: readonly Criterio[], respostas: readonly Resposta[]): { ok: true; gravar: RespostaGravada[] } | { ok: false; erros: string[] } {
  const erros: string[] = [];
  const porChave = new Map(respostas.map((r) => [r.key, r]));
  const gravar: RespostaGravada[] = [];
  let respondidos = 0;
  for (const c of criterios) {
    const r = porChave.get(c.key);
    const just = (r?.justification ?? '').trim();
    if (!r || (r.score === undefined)) { erros.push(`"${c.label}": dê uma nota de 1 a 5 ou marque N/A.`); continue; }
    if (r.score === null) {
      if (!just) erros.push(`"${c.label}": N/A exige justificativa.`);
      gravar.push({ ...c, score: null, justification: just || null });
      continue;
    }
    const s = Number(r.score);
    if (!Number.isInteger(s) || s < 1 || s > 5) { erros.push(`"${c.label}": nota inválida (1 a 5).`); continue; }
    if (s <= 2 && !just) erros.push(`"${c.label}": nota ${s} exige justificativa.`);
    if (just.length > 500) erros.push(`"${c.label}": justificativa longa demais (até 500 letras).`);
    respondidos++;
    gravar.push({ ...c, score: s, justification: just || null });
  }
  if (respondidos === 0 && erros.length === 0) erros.push('Todos os critérios estão N/A — não há o que avaliar.');
  return erros.length ? { ok: false, erros } : { ok: true, gravar };
}

/** Lê o JSON `scores` gravado numa avaliação. */
export function lerRespostas(json: unknown): RespostaGravada[] {
  if (!Array.isArray(json)) return [];
  return json
    .filter((r): r is RespostaGravada => !!r && typeof r === 'object' && typeof (r as RespostaGravada).key === 'string')
    .map((r) => ({ key: r.key, label: String(r.label ?? r.key), group: r.group === 'GERAL' ? 'GERAL' : 'ESPECIFICO', weight: Number(r.weight) || 0, score: r.score == null ? null : Number(r.score), justification: r.justification ?? null }));
}

/**
 * Nota de QUALQUER avaliação gravada: a ponderada (formato por função) ou, nas
 * antigas, a média simples dos 4 critérios. É assim que o histórico e o Perfil
 * 360 leem os dois formatos sem recalcular nada.
 */
export function notaDaAvaliacao(e: { finalScore?: number | null; punctuality?: number | null; performance?: number | null; teamwork?: number | null; presentation?: number | null }): number | null {
  if (e.finalScore != null) return e.finalScore;
  const xs = [e.punctuality, e.performance, e.teamwork, e.presentation].filter((n): n is number => typeof n === 'number');
  if (xs.length === 0) return null;
  return Math.round((xs.reduce((s, n) => s + n, 0) / xs.length) * 100) / 100;
}

export const fmtNota = (n: number | null | undefined) => (n == null ? '—' : n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

// ===== Função (cargo do RH) → modelo =========================================

/** A mesma normalização dos Treinamentos: caixa, acento e espaços. */
export const normalizarCargo = normalizarFuncao;

export function modeloDoCargo(jobTitle: string | null | undefined, vinculos: readonly { jobTitleKey: string; modelId: string }[]): string | null {
  const k = normalizarCargo(jobTitle);
  if (!k) return null;
  return vinculos.find((v) => v.jobTitleKey === k)?.modelId ?? null;
}

// ===== Quem avalia quem ======================================================

export type MotivoSemAvaliar = 'PERFIL' | 'GERENCIAL' | 'PROPRIO' | 'SEM_MODELO';
/**
 * Gerente/Coordenador avaliam a equipe da unidade; o modelo GERENCIAL
 * (Gerente/Encarregado) é avaliado pela Supervisão (Supervisor/Admin);
 * ninguém avalia a si próprio — a identificação é pelo CPF do Meu Perfil
 * casado com o CPF do RH. FINANCE e CEO não avaliam (CEO consulta).
 */
export function quemPodeAvaliar(p: { role: string; managerial: boolean; semModelo: boolean; cpfUsuario: string | null; cpfColaborador: string | null }): { pode: boolean; motivo: MotivoSemAvaliar | null } {
  if (['FINANCE', 'CEO', 'CASHIER', 'SEPARATOR'].includes(p.role)) return { pode: false, motivo: 'PERFIL' };
  if (p.semModelo) return { pode: false, motivo: 'SEM_MODELO' };
  const soDigitos = (s: string | null) => (s ?? '').replace(/\D/g, '');
  const cu = soDigitos(p.cpfUsuario); const cc = soDigitos(p.cpfColaborador);
  if (cu && cc && cu === cc) return { pode: false, motivo: 'PROPRIO' };
  if (p.managerial && !['SUPERVISOR', 'ADMIN'].includes(p.role)) return { pode: false, motivo: 'GERENCIAL' };
  return { pode: true, motivo: null };
}
export const ROTULO_MOTIVO: Record<MotivoSemAvaliar, string> = {
  PERFIL: 'Seu perfil só consulta as avaliações.',
  GERENCIAL: 'Função gerencial: avaliada pela Supervisão.',
  PROPRIO: 'Você não avalia a si próprio.',
  SEM_MODELO: 'Função sem modelo de avaliação — peça ao Administrador para vincular em Configurações → Avaliação por função.',
};

// ===== Modelos iniciais ======================================================

export interface ModeloInicial { seedKey: string; name: string; managerial?: boolean; cargos: string[]; especificos: { label: string; weight: number }[] }
const esp = (a: string, b: string, c: string, d: string) => [
  { label: a, weight: 20 }, { label: b, weight: 15 }, { label: c, weight: 15 }, { label: d, weight: 10 },
];
/**
 * Os 10 modelos da especificação (08/10/2026). `cargos` são APELIDOS de cargo
 * do RH (casados normalizados); o Admin completa o resto em Configurações.
 * Gerente e Encarregado são a MESMA função gerencial — um modelo só.
 */
export const MODELOS_INICIAIS: readonly ModeloInicial[] = [
  { seedKey: 'cozinheiro', name: 'Cozinheiro', cargos: ['Cozinheiro', 'Cozinheira', 'Cozinheiro(a)', 'Cozinheiro (a)', 'Chefe de cozinha'], especificos: esp('Qualidade do preparo', 'Produtividade', 'Cumprimento de POPs', 'Controle de desperdícios') },
  { seedKey: 'churrasqueiro', name: 'Churrasqueiro', cargos: ['Churrasqueiro', 'Churrasqueira', 'Churrasqueiro(a)', 'Auxiliar de churrasqueiro'], especificos: esp('Padrão de preparo', 'Produtividade', 'Segurança alimentar', 'Controle de perdas') },
  { seedKey: 'auxiliar-cozinha', name: 'Auxiliar de cozinha', cargos: ['Auxiliar de cozinha', 'Aux. de cozinha', 'Aux de cozinha', 'Auxiliar de cozinha(a)', 'Ajudante de cozinha', 'Copeiro', 'Copeira', 'Copeiro(a)'], especificos: esp('Execução das atividades', 'Agilidade', 'Procedimentos', 'Aproveitamento de insumos') },
  { seedKey: 'salgadeiro', name: 'Salgadeiro', cargos: ['Salgadeiro', 'Salgadeira', 'Salgadeiro(a)', 'Confeiteiro', 'Confeiteira', 'Confeiteiro(a)', 'Padeiro', 'Padeiro(a)'], especificos: esp('Padronização', 'Produtividade', 'Cumprimento das fichas técnicas', 'Controle de perdas') },
  { seedKey: 'pizzaiolo', name: 'Pizzaiolo', cargos: ['Pizzaiolo', 'Pizzaiola', 'Pizzaiolo(a)', 'Auxiliar de pizzaiolo'], especificos: esp('Padrão de montagem e preparo', 'Produtividade', 'Cumprimento das fichas técnicas', 'Controle de desperdícios') },
  { seedKey: 'garcom', name: 'Garçom / Atendente', cargos: ['Garçom', 'Garçonete', 'Garçom(nete)', 'Atendente', 'Atendente de balcão', 'Atendente de lanchonete', 'Balconista', 'Recepcionista'], especificos: esp('Qualidade do atendimento', 'Agilidade', 'Conhecimento dos produtos', 'Organização operacional') },
  { seedKey: 'caixa', name: 'Operador de caixa', cargos: ['Operador de caixa', 'Operadora de caixa', 'Operador(a) de caixa', 'Caixa'], especificos: esp('Precisão nos lançamentos', 'Conferência financeira', 'Cumprimento de procedimentos', 'Atendimento') },
  { seedKey: 'estoquista', name: 'Estoquista', cargos: ['Estoquista', 'Almoxarife', 'Auxiliar de estoque', 'Repositor', 'Separador', 'Conferente'], especificos: esp('Organização do estoque', 'Conferência', 'Controle de validade', 'Movimentação de produtos') },
  { seedKey: 'limpeza', name: 'Auxiliar de limpeza', cargos: ['Auxiliar de limpeza', 'Faxineiro', 'Faxineira', 'Faxineiro(a)', 'Auxiliar de serviços gerais', 'Serviços gerais', 'Zelador', 'Zeladora'], especificos: esp('Qualidade da higienização', 'Produtividade', 'Cumprimento dos procedimentos', 'Utilização adequada de materiais') },
  { seedKey: 'gerente', name: 'Gerente / Encarregado', managerial: true, cargos: ['Gerente', 'Gerente de restaurante', 'Gerente de loja', 'Gerente de unidade', 'Encarregado', 'Encarregada', 'Encarregado(a)', 'Encarregado de restaurante', 'Encarregado de loja', 'Subgerente', 'Sub-gerente', 'Supervisor de loja'], especificos: esp('Gestão de equipe', 'Execução operacional', 'Cumprimento dos controles do SGO', 'Controle de perdas') },
];
