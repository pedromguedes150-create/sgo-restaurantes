/**
 * NECESSIDADE POR HORÁRIO — quantas pessoas cada setor precisa, e quando.
 *
 * O que havia antes: `Sector.minHeadcount`, um número só, descrito no schema
 * como *"meta de pessoas **por turno**"*. Isso fazia a exigência crescer com a
 * quantidade de turnos cadastrados — uma unidade com quatro turnos passava a
 * "precisar" de quatro vezes o mínimo, sem ninguém ter pedido isso. E não havia
 * como dizer que a cozinha precisa de 3 pessoas de manhã e 1 de madrugada.
 *
 * Agora a necessidade é do SETOR em uma FAIXA DE HORÁRIO, e o turno volta ao
 * papel dele: dizer se aquela pessoa está trabalhando naquele momento.
 *
 * Este arquivo é **puro** de propósito — só aritmética de minutos. É onde mora
 * o risco de verdade (faixa que cruza a meia-noite, sobreposição), e separar do
 * banco é o que permite provar cada caso sem montar uma unidade inteira.
 */

/** Um dia tem 1440 minutos. A faixa é sempre [início, fim). */
export const MINUTOS_NO_DIA = 1440;

export interface FaixaDeNecessidade {
  /** 'HH:mm' */
  startTime: string;
  /** 'HH:mm'. Menor que o início = a faixa cruza a meia-noite. Igual = dia todo. */
  endTime: string;
  minPeople: number;
}

export type StatusDeCobertura = 'COBERTO' | 'PARCIAL' | 'SEM_COBERTURA' | 'SEM_EXIGENCIA';

export const STATUS_LABEL: Record<StatusDeCobertura, string> = {
  COBERTO: 'Coberto',
  PARCIAL: 'Parcial',
  SEM_COBERTURA: 'Sem cobertura',
  SEM_EXIGENCIA: 'Sem exigência',
};

export const STATUS_EMOJI: Record<StatusDeCobertura, string> = {
  COBERTO: '🟢',
  PARCIAL: '🟡',
  SEM_COBERTURA: '🔴',
  SEM_EXIGENCIA: '⚪',
};

/** 'HH:mm' → minutos desde a meia-noite. `null` quando não é um horário. */
export function emMinutos(hhmm: string | null | undefined): number | null {
  if (!hhmm) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 24 || min > 59) return null;
  /* 24:00 é o fim do dia escrito como as pessoas escrevem. Vira 0 porque, como
     FIM de faixa, "até 24:00" e "até 00:00" são o mesmo instante. */
  if (h === 24) return min === 0 ? 0 : null;
  return h * 60 + min;
}

/** minutos → 'HH:mm'. */
export function emHHMM(minutos: number): string {
  const m = ((Math.trunc(minutos) % MINUTOS_NO_DIA) + MINUTOS_NO_DIA) % MINUTOS_NO_DIA;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/**
 * A faixa vale o dia inteiro? (início igual ao fim)
 *
 * É como o "Necessário 24 horas" é gravado — um jeito só, e não uma coluna
 * `is24h` ao lado que pudesse discordar da faixa.
 */
export function ehDiaInteiro(f: FaixaDeNecessidade): boolean {
  const i = emMinutos(f.startTime);
  const fim = emMinutos(f.endTime);
  return i !== null && fim !== null && i === fim;
}

/** Os horários com que uma faixa de 24 horas é gravada. */
export const FAIXA_DIA_INTEIRO = { startTime: '00:00', endTime: '00:00' } as const;

/** Como a faixa aparece para quem lê: o dia inteiro vira "00:00–24:00". */
export function rotuloDaFaixa(f: FaixaDeNecessidade): string {
  if (ehDiaInteiro(f)) return '00:00–24:00';
  return `${f.startTime}–${f.endTime}`;
}

/**
 * O minuto cai dentro da faixa?
 *
 * Três casos, e o terceiro é o que o pedido chamou de "não tratar 22:00–06:00
 * como horário inválido":
 * - início < fim → faixa normal, [início, fim);
 * - início = fim → o dia inteiro;
 * - início > fim → **cruza a meia-noite**: vale do início até 23:59 e da
 *   meia-noite até o fim.
 */
export function faixaCobre(f: FaixaDeNecessidade, minuto: number): boolean {
  const i = emMinutos(f.startTime);
  const fim = emMinutos(f.endTime);
  if (i === null || fim === null) return false;
  const m = ((Math.trunc(minuto) % MINUTOS_NO_DIA) + MINUTOS_NO_DIA) % MINUTOS_NO_DIA;
  if (i === fim) return true;
  return i < fim ? m >= i && m < fim : m >= i || m < fim;
}

/**
 * Quantas pessoas o setor precisa neste minuto. Nenhuma faixa cobrindo = 0.
 *
 * Zero é uma resposta legítima e importante: é a unidade que não opera àquela
 * hora. Alertar "sem cobertura" às 4h num setor que só abre às 11h seria cobrar
 * por algo que ninguém combinou.
 */
export function necessidadeNoMinuto(faixas: FaixaDeNecessidade[], minuto: number): number {
  for (const f of faixas) {
    if (faixaCobre(f, minuto)) return Math.max(0, Math.trunc(f.minPeople));
  }
  return 0;
}

/** O status a partir do que se precisa e do que se tem. */
export function statusDaCobertura(necessario: number, presentes: number): StatusDeCobertura {
  if (necessario <= 0) return 'SEM_EXIGENCIA';
  if (presentes >= necessario) return 'COBERTO';
  if (presentes > 0) return 'PARCIAL';
  return 'SEM_COBERTURA';
}

/**
 * Os minutos do dia que a faixa ocupa.
 *
 * Um conjunto de 1440 posições em vez de aritmética de intervalos: é barato e é
 * **obviamente** correto, inclusive na faixa que vira a meia-noite. Intervalo
 * com sobreposição é o tipo de conta que parece certa e erra num canto.
 */
function minutosDaFaixa(f: FaixaDeNecessidade): Set<number> {
  const out = new Set<number>();
  for (let m = 0; m < MINUTOS_NO_DIA; m++) if (faixaCobre(f, m)) out.add(m);
  return out;
}

export interface ConflitoDeFaixa {
  /** Índice da faixa já cadastrada com que a nova conflita. */
  indice: number;
  /** A faixa existente, para a mensagem citar o horário dela. */
  faixa: FaixaDeNecessidade;
}

/**
 * A faixa nova conflita com alguma já cadastrada?
 *
 * Duas faixas cobrindo o mesmo minuto deixariam a necessidade ambígua — e a
 * ambiguidade não apareceria na tela: o cálculo simplesmente pegaria a primeira
 * e o usuário nunca saberia por que o número dele foi ignorado.
 *
 * ⚠️ ENCOSTAR NÃO É CONFLITO. A faixa é `[início, fim)`: 06:40–15:00 termina no
 * minuto 899 e 15:00–23:40 começa no 900, então as duas convivem. É o caso mais
 * comum do mundo real (o turno da tarde começa quando o da manhã acaba), e
 * recusá-lo obrigaria a cadastrar 14:59 — que abriria um buraco de um minuto na
 * cobertura, sem ninguém perceber.
 */
export function conflitoDeFaixa(
  existentes: FaixaDeNecessidade[],
  nova: FaixaDeNecessidade,
  ignorarIndice = -1,
): ConflitoDeFaixa | null {
  const daNova = minutosDaFaixa(nova);
  if (daNova.size === 0) return null;
  for (let i = 0; i < existentes.length; i++) {
    if (i === ignorarIndice) continue;
    const daOutra = minutosDaFaixa(existentes[i]);
    for (const m of daNova) {
      if (daOutra.has(m)) return { indice: i, faixa: existentes[i] };
    }
  }
  return null;
}

/** A faixa faz sentido? Horário inválido ou de duração zero não. */
export function faixaValida(f: FaixaDeNecessidade): { ok: true } | { ok: false; erro: string } {
  const i = emMinutos(f.startTime);
  const fim = emMinutos(f.endTime);
  if (i === null) return { ok: false, erro: 'Horário inicial inválido.' };
  if (fim === null) return { ok: false, erro: 'Horário final inválido.' };
  if (!Number.isFinite(f.minPeople) || f.minPeople < 0) return { ok: false, erro: 'Quantidade mínima inválida.' };
  return { ok: true };
}

export interface SegmentoDoDia {
  inicio: number;
  fim: number;
  /** 'HH:mm–HH:mm' */
  rotulo: string;
  necessario: number;
}

/**
 * O dia partido nos trechos em que a necessidade NÃO muda.
 *
 * É o que a "Visão do dia" mostra: em vez de 1440 linhas, os poucos blocos em
 * que a exigência é constante. Trechos vizinhos com a mesma necessidade são
 * fundidos — mostrar "06:00–08:00: 3" e "08:00–14:00: 3" separados só porque as
 * faixas foram cadastradas assim seria ruído.
 */
export function segmentosDoDia(faixas: FaixaDeNecessidade[]): SegmentoDoDia[] {
  const out: SegmentoDoDia[] = [];
  let inicio = 0;
  let atual = necessidadeNoMinuto(faixas, 0);

  for (let m = 1; m <= MINUTOS_NO_DIA; m++) {
    const n = m === MINUTOS_NO_DIA ? null : necessidadeNoMinuto(faixas, m);
    if (n !== atual) {
      out.push({ inicio, fim: m, rotulo: `${emHHMM(inicio)}–${m === MINUTOS_NO_DIA ? '24:00' : emHHMM(m)}`, necessario: atual });
      inicio = m;
      if (n !== null) atual = n;
    }
  }
  return out;
}
