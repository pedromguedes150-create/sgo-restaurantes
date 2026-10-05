/**
 * PERÍODO AQUISITIVO DE FÉRIAS — núcleo PURO (v1.153.0).
 *
 * Pedido do Pedro (05/10/2026): "período aquisitivo puxar via API do RH" e um
 * painel do colaborador. A API do RH que o SGO lê (v1) entrega a ADMISSÃO, não
 * os períodos; o RH também ENVIA eventos "periodo_aquisitivo" pelo webhook,
 * mas o formato nunca foi documentado e eles só ficam registrados. Então o
 * período é DERIVADO da admissão do RH pela regra da CLT, e os eventos do RH
 * aparecem ao lado para conferência — quando o formato for conhecido, eles
 * passam a ser a fonte. Nada aqui grava: é leitura, como a variação do gás.
 *
 * CLT (art. 130 e 134): a cada 12 meses de trabalho (período AQUISITIVO) o
 * colaborador ganha 30 dias, que a empresa precisa conceder nos 12 meses
 * seguintes (período CONCESSIVO). Passou do fim do concessivo sem gozar:
 * férias VENCIDAS (pagas em dobro). Faltas que reduzem os 30 dias não entram
 * (o SGO não tem esse dado) — o direito é sempre 30.
 *
 * ⚠️ O SGO só conhece as férias lançadas nele (Pessoas → Férias e o sync do
 * RH). Período cujo concessivo terminou ANTES de o SGO começar a registrar
 * férias não é julgado ("anterior ao SGO"): sem isso, todo colaborador com
 * mais de dois anos de casa apareceria com férias vencidas que ele já gozou.
 * O que começou antes e termina depois é julgado, mas marcado `parcial`.
 */

/** Primeiro dia em que o SGO passou a registrar férias (produção no ar em 12/06/2026). */
export const INICIO_DO_CONTROLE_DE_FERIAS = '2026-06-12';
export const DIAS_DE_DIREITO = 30;

export type SituacaoDoPeriodo = 'EM_AQUISICAO' | 'A_VENCER' | 'VENCIDO' | 'QUITADO' | 'ANTERIOR_AO_SGO';

export interface PeriodoAquisitivo {
  numero: number;
  /** AAAA-MM-DD */
  inicio: string;
  fim: string;
  /** Último dia para conceder (fim do concessivo). */
  limite: string;
  diasDireito: number;
  diasGozados: number;
  /** Dias VENDIDOS (abono pecuniário, CLT art. 143 — até 1/3 = 10 dias). */
  diasVendidos: number;
  saldo: number;
  situacao: SituacaoDoPeriodo;
  /** Dias até o limite (negativo = vencido há N dias). Só faz sentido com saldo. */
  diasParaVencer: number;
  /** O concessivo começou antes de o SGO registrar férias: pode haver gozo que não consta. */
  parcial: boolean;
}

export interface FeriasGozada { inicio: string; fim: string }
/** Abono pecuniário registrado: dias vendidos de um período (pelo início do período). */
export interface AbonoDoPeriodo { periodoInicio: string; dias: number }

/** Máximo vendável por período: 1/3 do direito (CLT art. 143). */
export const MAX_DIAS_ABONO = Math.floor(30 / 3);

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const t = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const DIA = 86_400_000;

/** Soma anos mantendo dia/mês (29/02 cai em 28/02 no ano comum). */
function maisAnos(base: string, anos: number): string {
  const y = Number(base.slice(0, 4)) + anos, m = Number(base.slice(5, 7)), d = Number(base.slice(8, 10));
  const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(Math.min(d, ultimo)).padStart(2, '0')}`;
}
const menosUmDia = (d: string) => iso(t(d) - DIA);
export const diasEntre = (de: string, ate: string) => Math.round((t(ate) - t(de)) / DIA);

/** Duração (dias corridos, inclusive) de um gozo. */
export function diasDoGozo(f: FeriasGozada): number {
  return Math.max(0, diasEntre(f.inicio, f.fim) + 1);
}

/**
 * Os períodos aquisitivos desde a admissão até hoje, com o gozo distribuído do
 * mais antigo para o mais novo (é assim que a empresa quita: o período velho
 * primeiro). Gozo antes de o período começar não o abate.
 */
export function periodosAquisitivos(admissao: string | null, ferias: FeriasGozada[], hoje: string, inicioDoControle = INICIO_DO_CONTROLE_DE_FERIAS, abonos: AbonoDoPeriodo[] = []): PeriodoAquisitivo[] {
  if (!admissao || !ISO.test(admissao) || admissao > hoje) return [];
  const periodos: PeriodoAquisitivo[] = [];
  for (let n = 0; ; n++) {
    const inicio = maisAnos(admissao, n);
    if (inicio > hoje) break;
    const fim = menosUmDia(maisAnos(admissao, n + 1));
    const limite = menosUmDia(maisAnos(admissao, n + 2));
    periodos.push({ numero: n + 1, inicio, fim, limite, diasDireito: DIAS_DE_DIREITO, diasGozados: 0, diasVendidos: 0, saldo: DIAS_DE_DIREITO, situacao: 'EM_AQUISICAO', diasParaVencer: 0, parcial: false });
  }

  /* Abono primeiro: os dias vendidos são do período a que o abono pertence, e o
     gozo distribui o que sobra. (Tirou 20 e vendeu 10 = período quitado.) */
  for (const a of abonos) {
    const p = periodos.find((x) => x.inicio === a.periodoInicio);
    if (!p) continue;
    const v = Math.max(0, Math.min(Math.floor(a.dias), MAX_DIAS_ABONO, p.saldo));
    p.diasVendidos += v; p.saldo -= v;
  }

  const gozos = ferias.filter((f) => ISO.test(f.inicio) && ISO.test(f.fim) && f.fim >= f.inicio && f.inicio <= hoje)
    .sort((a, b) => a.inicio.localeCompare(b.inicio));
  for (const g of gozos) {
    // conta só o que já foi gozado até hoje (programada no futuro não quita)
    let resta = diasDoGozo({ inicio: g.inicio, fim: g.fim < hoje ? g.fim : hoje });
    for (const p of periodos) {
      if (resta <= 0) break;
      // período anterior ao SGO não recebe gozo: o SGO não sabe se já foi
      // quitado, e abater nele roubaria o dia do período que importa agora.
      if (p.limite < inicioDoControle || p.saldo <= 0 || g.inicio < p.inicio) continue;
      const usa = Math.min(p.saldo, resta);
      p.saldo -= usa; p.diasGozados += usa; resta -= usa;
    }
  }

  for (const p of periodos) {
    p.diasParaVencer = diasEntre(hoje, p.limite);
    p.parcial = p.fim < inicioDoControle; // o concessivo começou antes do SGO
    if (p.limite < inicioDoControle) p.situacao = 'ANTERIOR_AO_SGO';
    else if (p.fim >= hoje) p.situacao = 'EM_AQUISICAO';
    else if (p.saldo <= 0) p.situacao = 'QUITADO';
    else if (p.limite < hoje) p.situacao = 'VENCIDO';
    else p.situacao = 'A_VENCER';
  }
  return periodos;
}

/**
 * O período que pede atenção agora: o vencido mais antigo; senão o "a vencer"
 * mais próximo do limite; senão o que está em aquisição.
 */
export function periodoEmFoco(periodos: PeriodoAquisitivo[]): PeriodoAquisitivo | null {
  return periodos.find((p) => p.situacao === 'VENCIDO')
    ?? periodos.find((p) => p.situacao === 'A_VENCER')
    ?? periodos.find((p) => p.situacao === 'EM_AQUISICAO')
    ?? null;
}

export type FaixaDeFerias = 'VENCIDA' | 'ATE_30' | 'ATE_60' | 'ATE_90' | 'EM_DIA' | 'EM_AQUISICAO' | 'SEM_ADMISSAO';

/** Faixa de urgência do colaborador (a do painel de controle). */
export function faixaDeFerias(foco: PeriodoAquisitivo | null, temAdmissao: boolean): FaixaDeFerias {
  if (!temAdmissao) return 'SEM_ADMISSAO';
  if (!foco) return 'EM_DIA';
  if (foco.situacao === 'VENCIDO') return 'VENCIDA';
  if (foco.situacao === 'EM_AQUISICAO') return 'EM_AQUISICAO';
  if (foco.situacao === 'A_VENCER') {
    if (foco.diasParaVencer <= 30) return 'ATE_30';
    if (foco.diasParaVencer <= 60) return 'ATE_60';
    if (foco.diasParaVencer <= 90) return 'ATE_90';
  }
  return 'EM_DIA';
}

/** "4 anos e 5 meses" — tempo de empresa até `hoje`. */
export function tempoDeEmpresa(admissao: string | null, hoje: string): { anos: number; meses: number; texto: string } | null {
  if (!admissao || !ISO.test(admissao) || admissao > hoje) return null;
  let meses = (Number(hoje.slice(0, 4)) - Number(admissao.slice(0, 4))) * 12 + (Number(hoje.slice(5, 7)) - Number(admissao.slice(5, 7)));
  if (Number(hoje.slice(8, 10)) < Number(admissao.slice(8, 10))) meses -= 1;
  meses = Math.max(0, meses);
  const anos = Math.floor(meses / 12), m = meses % 12;
  const partes: string[] = [];
  if (anos) partes.push(`${anos} ano${anos > 1 ? 's' : ''}`);
  if (m || !anos) partes.push(`${m} ${m === 1 ? 'mês' : 'meses'}`);
  return { anos, meses: m, texto: partes.join(' e ') };
}

/**
 * Datas de um evento do RH, sem conhecer o formato: toda chave cujo valor é
 * uma data (AAAA-MM-DD ou DD/MM/AAAA) vira uma linha "chave: data". É só para
 * CONFERIR o que o RH mandou enquanto o formato não é documentado.
 */
export function datasDoEvento(payload: unknown, prefixo = ''): { campo: string; data: string }[] {
  if (!payload || typeof payload !== 'object') return [];
  const out: { campo: string; data: string }[] = [];
  for (const [k, v] of Object.entries(payload as Record<string, unknown>)) {
    const campo = prefixo ? `${prefixo}.${k}` : k;
    if (typeof v === 'string') {
      const a = v.match(/^(\d{4}-\d{2}-\d{2})/);
      const b = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      if (a) out.push({ campo, data: a[1] });
      else if (b) out.push({ campo, data: `${b[3]}-${b[2]}-${b[1]}` });
    } else if (v && typeof v === 'object') out.push(...datasDoEvento(v, campo));
  }
  return out;
}
