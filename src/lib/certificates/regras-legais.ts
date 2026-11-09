/**
 * REGRAS LEGAIS COM VIGÊNCIA — PURO (v1.198.0, etapa C da Central de Atestados e Afins).
 *
 * A duração "da regra geral" de uma licença ou dispensa não é um número fixo:
 * a licença-paternidade é de 5 dias em 2026 e passa a 10 em 2027, 15 em 2028 e
 * 20 em 2029 (Lei 15.371/2026). Guardar só "5" faria o SGO sugerir o prazo
 * errado no primeiro nascimento de janeiro. Por isso cada regra é uma lista de
 * VERSÕES com `desde`, e quem pergunta informa a DATA DO EVENTO.
 *
 * É base operacional (planilha do Pedro, 09/11/2026): o RH confirma o prazo
 * caso a caso, e a convenção coletiva pode ampliar. O Admin pode sobrepor a
 * duração por nomenclatura em Configurações → Atestados e afins (`ruleDays`),
 * que vence a tabela — ver `config-nomenclaturas.ts`.
 */
export interface VersaoDaRegra {
  /** Primeiro dia (AAAA-MM-DD) em que a versão vale; '0000-01-01' = desde sempre. */
  desde: string;
  dias: number;
  /** Fundamento resumido, para a tela e o RH. */
  base: string;
}

export const REGRAS_LEGAIS: Record<string, VersaoDaRegra[]> = {
  'Licença-maternidade': [{ desde: '0000-01-01', dias: 120, base: 'CLT art. 392' }],
  'Licença-paternidade': [
    { desde: '0000-01-01', dias: 5, base: 'ADCT art. 10 §1º' },
    { desde: '2027-01-01', dias: 10, base: 'Lei 15.371/2026' },
    { desde: '2028-01-01', dias: 15, base: 'Lei 15.371/2026' },
    { desde: '2029-01-01', dias: 20, base: 'Lei 15.371/2026' },
  ],
  'Licença-casamento': [{ desde: '0000-01-01', dias: 3, base: 'CLT art. 473, II' }],
  'Licença por falecimento (luto)': [{ desde: '0000-01-01', dias: 2, base: 'CLT art. 473, I' }],
  'Repouso por aborto não criminoso': [{ desde: '0000-01-01', dias: 14, base: 'CLT art. 395' }],
  'Prorrogação da licença-maternidade': [{ desde: '0000-01-01', dias: 60, base: 'Lei 11.770/2008 (Empresa Cidadã)' }],
  'Licença-amamentação': [{ desde: '0000-01-01', dias: 15, base: 'Convenção/acordo coletivo ou autorização da empresa' }],
  'Acompanhamento de filho até 6 anos': [{ desde: '0000-01-01', dias: 1, base: 'CLT art. 473, XI (1 dia por ano)' }],
  'Doação voluntária de sangue': [{ desde: '0000-01-01', dias: 1, base: 'CLT art. 473, IV (1 dia a cada 12 meses)' }],
  'Exames preventivos de câncer': [{ desde: '0000-01-01', dias: 3, base: 'CLT art. 473, XII (até 3 dias a cada 12 meses)' }],
  'Alistamento eleitoral': [{ desde: '0000-01-01', dias: 2, base: 'CLT art. 473, V (até 2 dias)' }],
  'Trabalho eleitoral (mesário)': [{ desde: '0000-01-01', dias: 2, base: 'Lei 9.504/1997 art. 98 (2 dias por dia de convocação)' }],
  'Vestibular': [{ desde: '0000-01-01', dias: 1, base: 'CLT art. 473, VII (dias de prova)' }],
};

export interface RegraVigente extends VersaoDaRegra {
  nomenclatura: string;
  /** 1 = primeira versão, 2 = segunda… (para o RH saber qual valeu). */
  versao: number;
}

const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;

/** A versão da regra que vale na DATA DO EVENTO (a maior `desde` ≤ data). Sem data válida vale a primeira. */
export function regraVigente(nomenclatura: string, dataDoEvento: string | null | undefined): RegraVigente | null {
  const versoes = REGRAS_LEGAIS[nomenclatura];
  if (!versoes || versoes.length === 0) return null;
  const data = dataDoEvento && RE_DATA.test(dataDoEvento) ? dataDoEvento : null;
  let escolhida = 0;
  if (data) for (let i = 0; i < versoes.length; i++) if (versoes[i].desde <= data) escolhida = i;
  return { ...versoes[escolhida], nomenclatura, versao: escolhida + 1 };
}

/**
 * Dias da regra para a nomenclatura na data do evento. `override` (configuração
 * do Admin) vence a tabela; null = não há regra de duração (atestados, horas).
 */
export function duracaoDaRegra(nomenclatura: string, dataDoEvento: string | null | undefined, override?: number | null): number | null {
  if (typeof override === 'number' && Number.isInteger(override) && override > 0) return override;
  return regraVigente(nomenclatura, dataDoEvento)?.dias ?? null;
}

/** Fim sugerido = início + dias − 1 (inclusivo), ou null sem regra. */
export function fimPelaRegra(nomenclatura: string, inicio: string | null | undefined, override?: number | null): string | null {
  if (!inicio || !RE_DATA.test(inicio)) return null;
  const dias = duracaoDaRegra(nomenclatura, inicio, override);
  if (!dias) return null;
  const d = new Date(inicio + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + dias - 1);
  return d.toISOString().slice(0, 10);
}

/** Limites previdenciários usados nos alertas (planilha: "acima de 15 dias", "intercalados em 60 dias"). */
export const LIMITE_EMPRESA_DIAS = 15;
export const JANELA_INTERCALADOS_DIAS = 60;
