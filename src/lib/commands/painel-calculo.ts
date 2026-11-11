/**
 * Painel de Comandas — contas PURAS (v1.202.0).
 *
 * Duas perguntas que não se misturam:
 *  - ROTINA: a unidade conferiu nos dias em que era para conferir?
 *  - RESULTADO: o que a operação achou — divergências abertas, recuperadas, perdas definitivas.
 */

export interface DiaDaRotina { data: string; prevista: boolean; realizada: boolean }

export interface ResumoDaRotina {
  previstas: number;
  realizadas: number;
  /** Dia previsto que já passou sem conferência. */
  atrasadas: number;
  /** Hoje, previsto e ainda sem conferência — ainda dá tempo. */
  pendentes: number;
  /** Dias não previstos em que mesmo assim se conferiu (não contam a favor nem contra). */
  extras: number;
  /** Realizadas ÷ (realizadas + atrasadas); `null` quando nenhum dia fechou (nada a medir não é zero). */
  cumprimentoPct: number | null;
}

/** `dias` já limitado ao período; `hoje` é a data operacional de hoje. Dias futuros são ignorados. */
export function resumirRotina(dias: DiaDaRotina[], hoje: string): ResumoDaRotina {
  let previstas = 0, realizadas = 0, atrasadas = 0, pendentes = 0, extras = 0;
  for (const d of dias) {
    if (d.data > hoje) continue;
    if (!d.prevista) { if (d.realizada) extras++; continue; }
    previstas++;
    if (d.realizada) realizadas++;
    else if (d.data < hoje) atrasadas++;
    else pendentes++;
  }
  const fechadas = realizadas + atrasadas;
  return { previstas, realizadas, atrasadas, pendentes, extras, cumprimentoPct: fechadas === 0 ? null : Math.round((realizadas / fechadas) * 100) };
}

export interface ResultadoOperacional {
  abertas: number;
  aguardandoValidacao: number;
  recuperadas: number;
  perdasDefinitivas: number;
}

/** Datas 'AAAA-MM-DD' de `inicio` a `fim` (inclusive). */
export function datasDoIntervalo(inicio: string, fim: string): string[] {
  const out: string[] = [];
  const d = new Date(`${inicio}T00:00:00Z`);
  const f = new Date(`${fim}T00:00:00Z`).getTime();
  while (d.getTime() <= f && out.length < 400) { out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1); }
  return out;
}

/** Primeiro e último dia do mês 'AAAA-MM'. */
export function limitesDoMes(ym: string): { inicio: string; fim: string } {
  const [y, m] = ym.split('-').map(Number);
  return { inicio: `${ym}-01`, fim: new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10) };
}
