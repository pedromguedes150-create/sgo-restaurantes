/**
 * PAGAMENTO EXTRA — a conta, sem banco.
 *
 * A operação, nas palavras do Pedro: "o funcionário faz hora extra durante o
 * mês; pegamos o relatório das horas do mês e pagamos no mês seguinte". Daí a
 * regra única deste arquivo: **competência = mês SEGUINTE ao dia trabalhado**.
 * Trabalhou em 15/09 → competência 2026-10. A regra mora aqui, e só aqui, para
 * a tela de Pagamentos (que avisa em qual competência a HE vai cair), o quadro
 * e o teste lerem a mesma coisa.
 *
 * Puro: sem Prisma, sem Date do relógio. Tudo recebe e devolve 'AAAA-MM' ou
 * 'AAAA-MM-DD'.
 */

const MES = /^\d{4}-\d{2}$/;
const DIA = /^\d{4}-\d{2}-\d{2}/;

/** 'AAAA-MM' + n meses (n pode ser negativo). */
export function somarMeses(competencia: string, n: number): string {
  const [y, m] = competencia.split('-').map(Number);
  const total = y * 12 + (m - 1) + n;
  const ano = Math.floor(total / 12);
  const mes = (total % 12) + 1;
  return `${ano}-${String(mes).padStart(2, '0')}`;
}

/** Em qual competência a hora extra do dia `diaISO` é paga: o mês seguinte. */
export function competenciaDaHoraExtra(diaISO: string): string | null {
  if (!DIA.test(diaISO)) return null;
  return somarMeses(diaISO.slice(0, 7), 1);
}

/** O inverso: a competência 'AAAA-MM' paga as horas extras de qual mês? */
export function mesTrabalhadoDa(competencia: string): string | null {
  if (!MES.test(competencia)) return null;
  return somarMeses(competencia, -1);
}

/** Primeiro e último dia ('AAAA-MM-DD') de um mês 'AAAA-MM'. */
export function limitesDoMes(mes: string): { de: string; ate: string } | null {
  if (!MES.test(mes)) return null;
  const [y, m] = mes.split('-').map(Number);
  const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { de: `${mes}-01`, ate: `${mes}-${String(ultimo).padStart(2, '0')}` };
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** '2026-10' → 'outubro de 2026'. */
export function rotuloDaCompetencia(competencia: string): string {
  if (!MES.test(competencia)) return competencia;
  const [y, m] = competencia.split('-');
  return `${MESES[Number(m) - 1]} de ${y}`;
}

/* ───────────────────── soma por colaborador ───────────────────── */

export type StatusDaHoraExtra = 'APPROVED' | 'PAID';

export interface HoraExtraDoQuadro {
  id: string;
  unitId: string;
  /** Chave do colaborador: o id do cadastro, ou o nome quando a HE é antiga e só tem nome. */
  collaboratorId: string | null;
  colaborador: string;
  dia: string;
  inicio: string | null;
  fim: string | null;
  horas: number | null;
  valorHora: number | null;
  vt: number;
  valor: number;
  status: StatusDaHoraExtra;
  aprovadoPor: string | null;
  aprovadoEm: Date | null;
}

export interface ColaboradorNoQuadro {
  chave: string;
  collaboratorId: string | null;
  colaborador: string;
  unitId: string;
  horasExtras: HoraExtraDoQuadro[];
  horas: number;
  valor: number;
  /** Última aprovação entre as HE somadas — é a "Data Cadastro" do arquivo. */
  ultimaAprovacaoEm: Date | null;
  /** Tudo pago, tudo aprovado, ou misto. */
  status: 'PAID' | 'APPROVED' | 'MISTO';
}

const centavos = (n: number) => Math.round(n * 100) / 100;

/**
 * Uma linha por colaborador E por unidade, somando as horas extras dele.
 *
 * O arquivo da administradora tem uma linha por pessoa, e a mesma pessoa em
 * duas unidades é duas linhas (a unidade de trabalho é coluna do arquivo).
 * HE antiga sem `collaboratorId` agrupa pelo NOME — é o que ela tem.
 */
export function somarPorColaborador(hes: HoraExtraDoQuadro[]): ColaboradorNoQuadro[] {
  const por = new Map<string, ColaboradorNoQuadro>();
  for (const h of hes) {
    const chave = `${h.unitId}|${h.collaboratorId ?? `nome:${h.colaborador.trim().toLowerCase()}`}`;
    const g = por.get(chave) ?? {
      chave, collaboratorId: h.collaboratorId, colaborador: h.colaborador, unitId: h.unitId,
      horasExtras: [], horas: 0, valor: 0, ultimaAprovacaoEm: null, status: h.status,
    };
    g.horasExtras.push(h);
    g.horas = centavos(g.horas + (h.horas ?? 0));
    g.valor = centavos(g.valor + h.valor);
    if (h.aprovadoEm && (!g.ultimaAprovacaoEm || h.aprovadoEm > g.ultimaAprovacaoEm)) g.ultimaAprovacaoEm = h.aprovadoEm;
    if (g.status !== h.status) g.status = 'MISTO';
    por.set(chave, g);
  }
  for (const g of por.values()) g.horasExtras.sort((a, b) => a.dia.localeCompare(b.dia));
  return [...por.values()].sort((a, b) => a.colaborador.localeCompare(b.colaborador, 'pt-BR'));
}
