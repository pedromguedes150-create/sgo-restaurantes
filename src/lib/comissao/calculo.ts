import { numeroDaCelula, codigoDaUnidade } from '@/lib/ticket-media/planilha';
import { normalizarNome } from '@/lib/hora-extra/calculo';

/**
 * COMISSÃO POR VENDEDOR (v1.175.0) — a conta PURA sobre a planilha
 * "Produtividade por Vendedor — Analítico" do Teknisa (uma linha por ITEM
 * vendido, com o garçom que lançou; sem data).
 *
 * Regra do Pedro (19/10/2026):
 *  - "0001 - GRUPO BEIJA FLOR" é a COZINHA: 0,5% da venda lançada nesse grupo,
 *    dividido em partes iguais entre os colaboradores da unidade cuja FUNÇÃO
 *    foi marcada pelo Admin/Coordenador (Auxiliar de Cozinha, Saladeira…).
 *  - Vendedor com nome → 1% da própria venda, desde que seja FUNCIONÁRIO
 *    CADASTRADO NA UNIDADE (colaborador do RH com vínculo); quem não casa fica
 *    na lista como "não cadastrado", sem comissão, até alguém vincular.
 *  - Nomenclatura "FREELANCER" nunca recebe.
 *  - Quem confere pode AJUSTAR (valor adicional ou desconto) com motivo.
 *  - A venda de setembro é apurada em outubro e PAGA em novembro: a
 *    competência do lançamento é o mês da venda + 2.
 *
 * Base da conta = coluna "Vr. Total" (já líquida de desconto; gorjeta e
 * acréscimo não entram). Os percentuais são configuráveis — estes são os
 * padrões.
 */

export const PCT_VENDEDOR_PADRAO = 1;
export const PCT_COZINHA_PADRAO = 0.5;

export const arredondar2 = (n: number) => Math.round(n * 100) / 100;

/* ───────────────────────── a planilha ───────────────────────── */

const COLUNAS = {
  vendedor: ['garcom', 'garçom', 'vendedor', 'atendente'],
  total: ['vr. total', 'vr total', 'valor total', 'total'],
  unidade: ['unidade'],
} as const;
type Campo = keyof typeof COLUNAS;

function normalizar(v: unknown): string {
  return String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

export interface VendedorLido {
  /** A célula como veio: "1065 - MARIA MERCES". É a chave da linha. */
  bruto: string;
  codigo: string | null;
  nome: string;
  vendas: number;
  itens: number;
}

export interface LeituraDeVendedores {
  ok: boolean;
  erro?: string;
  vendedores: VendedorLido[];
  totalVendas: number;
  itens: number;
  unidadeDeclarada: string | null;
  avisos: string[];
}

const vazio = (erro: string): LeituraDeVendedores => ({ ok: false, erro, vendedores: [], totalVendas: 0, itens: 0, unidadeDeclarada: null, avisos: [] });

/** "1065 - MARIA MERCES" → { codigo: '1065', nome: 'MARIA MERCES' }. */
export function separarCodigo(bruto: string): { codigo: string | null; nome: string } {
  const m = bruto.trim().match(/^(\d+)\s*-\s*(.+)$/);
  return m ? { codigo: m[1], nome: m[2].trim() } : { codigo: null, nome: bruto.trim() };
}

function acharCabecalho(linhas: unknown[][]): { linha: number; col: Partial<Record<Campo, number>> } | null {
  const limite = Math.min(linhas.length, 30);
  for (let i = 0; i < limite; i++) {
    const celulas = (linhas[i] ?? []).map(normalizar);
    const col: Partial<Record<Campo, number>> = {};
    for (const campo of Object.keys(COLUNAS) as Campo[]) {
      const aceitos = COLUNAS[campo] as readonly string[];
      const idx = celulas.findIndex((c) => c !== '' && aceitos.includes(c));
      if (idx >= 0) col[campo] = idx;
    }
    if (col.vendedor !== undefined && col.total !== undefined) return { linha: i, col };
  }
  return null;
}

/** Soma a venda por garçom. Colunas achadas pelo NOME; linhas "Total" ficam fora. */
export function lerPlanilhaDeVendedores(linhas: unknown[][]): LeituraDeVendedores {
  if (!Array.isArray(linhas) || linhas.length === 0) return vazio('A planilha está vazia.');
  const cab = acharCabecalho(linhas);
  if (!cab) return vazio('Não encontrei as colunas "Garçom" e "Vr. Total". Confira se o arquivo é o relatório "Produtividade por Vendedor — Analítico" exportado do Teknisa.');
  const { col } = cab;
  const por = new Map<string, VendedorLido>();
  const unidades = new Map<string, number>();
  let totalVendas = 0;
  let itens = 0;
  for (let i = cab.linha + 1; i < linhas.length; i++) {
    const l = linhas[i] ?? [];
    const bruto = String(l[col.vendedor!] ?? '').trim();
    if (!bruto || /^total\b/i.test(bruto) || /^total\b/i.test(String(l[0] ?? ''))) continue;
    const total = numeroDaCelula(l[col.total!]);
    if (total === null) continue;
    const v = por.get(bruto) ?? { bruto, ...separarCodigo(bruto), vendas: 0, itens: 0 };
    v.vendas = arredondar2(v.vendas + total);
    v.itens += 1;
    por.set(bruto, v);
    totalVendas = arredondar2(totalVendas + total);
    itens += 1;
    if (col.unidade !== undefined) {
      const u = String(l[col.unidade] ?? '').trim();
      if (u) unidades.set(u, (unidades.get(u) ?? 0) + 1);
    }
  }
  if (por.size === 0) return vazio('Não encontrei nenhuma linha de venda com garçom e "Vr. Total". Confira se o arquivo não veio vazio ou filtrado.');

  const porCodigo = new Map<string, string[]>();
  for (const nome of unidades.keys()) {
    const chave = codigoDaUnidade(nome.replace(/\s*\|\s*/g, ' - Loja: '));
    porCodigo.set(chave, [...(porCodigo.get(chave) ?? []), nome]);
  }
  if (porCodigo.size > 1) {
    return vazio(`A planilha traz ${porCodigo.size} unidades (${[...porCodigo.keys()].map((n) => n.slice(0, 40)).join('; ')}). Exporte o relatório de UMA unidade por vez.`);
  }
  const avisos: string[] = [];
  const [unidade, lojas] = [...porCodigo.entries()][0] ?? [null, []];
  if (lojas.length > 1) avisos.push(`A unidade tem ${lojas.length} PDVs/lojas na planilha — as vendas foram somadas, porque são a mesma unidade.`);

  const vendedores = [...por.values()].sort((a, b) => b.vendas - a.vendas);
  return { ok: true, vendedores, totalVendas, itens, unidadeDeclarada: unidade === null ? null : (lojas.length > 1 ? `${unidade} (${lojas.length} lojas)` : lojas[0]), avisos };
}

/* ───────────────────────── classificação ───────────────────────── */

export type TipoDeVendedor = 'GRUPO' | 'FREELANCER' | 'VENDEDOR';

/**
 * Gerente e Encarregado NÃO entram na comissão (decisão do Pedro, 20/10/2026),
 * mesmo quando o nome deles vende no Teknisa. Decidido pela FUNÇÃO do RH.
 */
export function funcaoForaDaComissao(jobTitle: string | null | undefined): boolean {
  const n = normalizarNome(jobTitle);
  return /\bgerente/.test(n) || /encarregad/.test(n);
}

/** GRUPO = "grupo beija flor" no nome (a cozinha); FREELANCER = "freelanc" no nome; o resto é vendedor com nome. */
export function tipoDoVendedor(nome: string): TipoDeVendedor {
  const n = normalizarNome(nome);
  if (n.includes('grupo beija flor')) return 'GRUPO';
  if (/freelanc/.test(n)) return 'FREELANCER';
  return 'VENDEDOR';
}

/* ───────────────────────── meses ───────────────────────── */

const MES = /^\d{4}-\d{2}$/;
export const mesValido = (m: string) => MES.test(m) && Number(m.slice(5, 7)) >= 1 && Number(m.slice(5, 7)) <= 12;

export function somarMeses(mes: string, n: number): string {
  const [y, m] = mes.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
/** Setembro é apurado em outubro. */
export const mesDeApuracao = (mesVenda: string) => somarMeses(mesVenda, 1);
/** Setembro é pago em novembro: a competência do lançamento. */
export const competenciaDePagamento = (mesVenda: string) => somarMeses(mesVenda, 2);
/** O mês de venda que se apura hoje: o anterior. */
export function mesDeVendaPadrao(hoje: string): string { return somarMeses(hoje.slice(0, 7), -1); }

const MESES_LONGOS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export function rotuloDoMes(mes: string): string {
  if (!MES.test(mes)) return mes;
  return `${MESES_LONGOS[Number(mes.slice(5, 7)) - 1]}/${mes.slice(0, 4)}`;
}

/* ───────────────────────── a apuração ───────────────────────── */

/** Divide em centavos sem perder nem sobrar: a soma das partes é SEMPRE o total. */
export function dividirIgual(total: number, n: number): number[] {
  if (n <= 0) return [];
  const cents = Math.round(total * 100);
  const base = Math.floor(cents / n);
  let resto = cents - base * n;
  return Array.from({ length: n }, () => { const v = base + (resto > 0 ? 1 : 0); if (resto > 0) resto--; return v / 100; });
}

export type KindDaLinha = 'VENDEDOR' | 'COZINHA' | 'GRUPO' | 'FREELANCER' | 'NAO_CADASTRADO' | 'FUNCAO_FORA';

export interface Vinculo { collaboratorId: string; name: string }

export interface LinhaDaApuracao {
  /** Chave estável entre prévia e confirmação: `${kind}:${bruto}` (vendedor) ou `COZINHA:${collaboratorId}`. */
  chave: string;
  kind: KindDaLinha;
  codigo: string | null;
  /** Nome do vendedor na planilha (ou do colaborador da cozinha). */
  nome: string;
  vendas: number;
  pct: number;
  calculado: number;
  ajuste: number;
  motivoAjuste: string | null;
  valor: number;
  collaboratorId: string | null;
  collaboratorName: string | null;
  /** Para "não cadastrado": quem do cadastro da unidade parece ser esta pessoa. */
  sugestoes?: Vinculo[];
}

export interface TotaisDaApuracao {
  vendedores: number; cozinha: number; freelancers: number; naoCadastrados: number; foraPorFuncao: number;
  vendasVendedores: number; vendasGrupo: number; vendasFreelancers: number; vendasNaoCadastrados: number; vendasForaPorFuncao: number;
  boloCozinha: number; comissaoVendedores: number; comissaoCozinha: number; comissao: number;
}

export interface Apuracao { linhas: LinhaDaApuracao[]; totais: TotaisDaApuracao }

export function apurar(input: {
  vendedores: VendedorLido[];
  pctVendedor: number;
  pctCozinha: number;
  /** bruto → colaborador (vínculo lembrado, manual ou nome exato). */
  vinculos: Map<string, Vinculo>;
  /** bruto → candidatos parecidos (só para quem não casou). */
  sugestoes?: Map<string, Vinculo[]>;
  /** Quem divide a cozinha: colaboradores ativos da unidade com função marcada. */
  cozinha: Vinculo[];
  /** bruto → colaborador da unidade cuja função fica FORA (gerente/encarregado): aparece, não recebe. */
  foraPorFuncao?: Map<string, Vinculo>;
}): Apuracao {
  const linhas: LinhaDaApuracao[] = [];
  let vendasGrupo = 0;
  const t: TotaisDaApuracao = {
    vendedores: 0, cozinha: 0, freelancers: 0, naoCadastrados: 0, foraPorFuncao: 0,
    vendasVendedores: 0, vendasGrupo: 0, vendasFreelancers: 0, vendasNaoCadastrados: 0, vendasForaPorFuncao: 0,
    boloCozinha: 0, comissaoVendedores: 0, comissaoCozinha: 0, comissao: 0,
  };
  for (const v of input.vendedores) {
    const tipo = tipoDoVendedor(v.nome);
    if (tipo === 'GRUPO') {
      vendasGrupo = arredondar2(vendasGrupo + v.vendas);
      linhas.push({ chave: `GRUPO:${v.bruto}`, kind: 'GRUPO', codigo: v.codigo, nome: v.nome, vendas: v.vendas, pct: input.pctCozinha, calculado: arredondar2(v.vendas * input.pctCozinha / 100), ajuste: 0, motivoAjuste: null, valor: 0, collaboratorId: null, collaboratorName: null });
      continue;
    }
    if (tipo === 'FREELANCER') {
      t.freelancers++; t.vendasFreelancers = arredondar2(t.vendasFreelancers + v.vendas);
      linhas.push({ chave: `FREELANCER:${v.bruto}`, kind: 'FREELANCER', codigo: v.codigo, nome: v.nome, vendas: v.vendas, pct: 0, calculado: 0, ajuste: 0, motivoAjuste: null, valor: 0, collaboratorId: null, collaboratorName: null });
      continue;
    }
    const fora = input.foraPorFuncao?.get(v.bruto);
    if (fora) {
      t.foraPorFuncao++; t.vendasForaPorFuncao = arredondar2(t.vendasForaPorFuncao + v.vendas);
      linhas.push({ chave: `VENDEDOR:${v.bruto}`, kind: 'FUNCAO_FORA', codigo: v.codigo, nome: v.nome, vendas: v.vendas, pct: 0, calculado: 0, ajuste: 0, motivoAjuste: null, valor: 0, collaboratorId: null, collaboratorName: fora.name });
      continue;
    }
    const vinc = input.vinculos.get(v.bruto);
    if (!vinc) {
      t.naoCadastrados++; t.vendasNaoCadastrados = arredondar2(t.vendasNaoCadastrados + v.vendas);
      linhas.push({ chave: `VENDEDOR:${v.bruto}`, kind: 'NAO_CADASTRADO', codigo: v.codigo, nome: v.nome, vendas: v.vendas, pct: input.pctVendedor, calculado: 0, ajuste: 0, motivoAjuste: null, valor: 0, collaboratorId: null, collaboratorName: null, sugestoes: input.sugestoes?.get(v.bruto) ?? [] });
      continue;
    }
    const calc = arredondar2(v.vendas * input.pctVendedor / 100);
    t.vendedores++; t.vendasVendedores = arredondar2(t.vendasVendedores + v.vendas); t.comissaoVendedores = arredondar2(t.comissaoVendedores + calc);
    linhas.push({ chave: `VENDEDOR:${v.bruto}`, kind: 'VENDEDOR', codigo: v.codigo, nome: v.nome, vendas: v.vendas, pct: input.pctVendedor, calculado: calc, ajuste: 0, motivoAjuste: null, valor: calc, collaboratorId: vinc.collaboratorId, collaboratorName: vinc.name });
  }
  t.vendasGrupo = vendasGrupo;
  t.boloCozinha = arredondar2(vendasGrupo * input.pctCozinha / 100);
  const partes = dividirIgual(t.boloCozinha, input.cozinha.length);
  input.cozinha.forEach((c, i) => {
    t.cozinha++; t.comissaoCozinha = arredondar2(t.comissaoCozinha + partes[i]);
    linhas.push({ chave: `COZINHA:${c.collaboratorId}`, kind: 'COZINHA', codigo: null, nome: c.name, vendas: vendasGrupo, pct: input.pctCozinha, calculado: partes[i], ajuste: 0, motivoAjuste: null, valor: partes[i], collaboratorId: c.collaboratorId, collaboratorName: c.name });
  });
  t.comissao = arredondar2(t.comissaoVendedores + t.comissaoCozinha);
  return { linhas, totais: t };
}

export interface Ajuste { ajuste: number; motivo: string }

export const MOTIVO_MIN = 3;

/**
 * O conferente pode mexer só em linha que PAGA alguém (vendedor vinculado ou
 * cozinha); ajuste diferente de zero exige motivo. O valor nunca fica negativo.
 */
export function aplicarAjustes(ap: Apuracao, ajustes: Record<string, Ajuste>): { apuracao: Apuracao; erros: string[] } {
  const erros: string[] = [];
  let comissao = 0; let comissaoVendedores = 0; let comissaoCozinha = 0;
  const linhas = ap.linhas.map((l) => {
    const a = ajustes[l.chave];
    let out = l;
    if (a && Number.isFinite(a.ajuste) && a.ajuste !== 0) {
      if (!l.collaboratorId) { erros.push(`${l.nome}: só linha com colaborador vinculado aceita ajuste.`); }
      else if ((a.motivo ?? '').trim().length < MOTIVO_MIN) { erros.push(`${l.nome}: informe o motivo do ajuste.`); }
      else {
        const ajuste = arredondar2(a.ajuste);
        out = { ...l, ajuste, motivoAjuste: a.motivo.trim(), valor: Math.max(0, arredondar2(l.calculado + ajuste)) };
      }
    }
    if (out.kind === 'VENDEDOR') comissaoVendedores = arredondar2(comissaoVendedores + out.valor);
    if (out.kind === 'COZINHA') comissaoCozinha = arredondar2(comissaoCozinha + out.valor);
    comissao = arredondar2(comissao + out.valor);
    return out;
  });
  return { apuracao: { linhas, totais: { ...ap.totais, comissaoVendedores, comissaoCozinha, comissao } }, erros };
}

/** Rótulo curto do tipo de linha, para tela, Excel e Auditoria. */
export const ROTULO_KIND: Record<KindDaLinha, string> = {
  VENDEDOR: 'Vendedor', COZINHA: 'Cozinha', GRUPO: 'Grupo (cozinha)', FREELANCER: 'Freelancer — fora', NAO_CADASTRADO: 'Não cadastrado na unidade', FUNCAO_FORA: 'Gerente/Encarregado — fora',
};
